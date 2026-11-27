import { userLibraryCacheKey, userLibraryPendingKey, LEGACY_MIGRATION_KEY, LIBRARY_STORAGE_KEY } from './repository-core.mjs';

const accountDeletionResumeKey = 'lernkarten-delete-reauth-v1';
const confirmationPhrase = 'KONTO LÖSCHEN';

export async function requestAccountDeletion(session, { confirmation, fetcher = globalThis.fetch } = {}) {
  if (!session?.access_token || !session.user?.id) throw new Error('Bitte melde dich an.');
  const headers = { Authorization: `Bearer ${session.access_token}` };
  if (confirmation !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetcher('/api/delete-account', {
    method: confirmation === undefined ? 'GET' : 'POST',
    headers, body: confirmation === undefined ? undefined : JSON.stringify({ confirmation }),
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw Object.assign(new Error(result?.error || 'Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.'), {
      code: result?.code || 'REQUEST_FAILED'
    });
  }
  return result;
}

export function clearDeletedAccountStorage(storage, userId, authStorageKey) {
  if (!userId) return;
  const keys = [userLibraryCacheKey(userId), userLibraryPendingKey(userId)];
  try {
    if (storage?.getItem(LEGACY_MIGRATION_KEY) === userId) keys.push(LIBRARY_STORAGE_KEY, LEGACY_MIGRATION_KEY);
    // The SDK can receive a different sign-in from another tab during deletion.
    if (authStorageKey) {
      const active = JSON.parse(storage?.getItem(authStorageKey) || 'null');
      if (!active || active.user?.id === userId) keys.push(authStorageKey, authStorageKey + '-code-verifier', authStorageKey + '-user');
    }
  } catch { /* Keep unrecognised session data and remove only this account's library. */ }
  for (const key of keys) {
    try { storage?.removeItem(key); } catch { /* Best effort in browsers with restricted storage. */ }
  }
}

export function createPrivacyActions({
  getSession, flush, reauthenticate, onDeleted, onClose, analytics, authStorageKey,
  document: doc = globalThis.document, window: win = globalThis.window
}) {
  let storage, temporary;
  try { storage = win.localStorage; temporary = win.sessionStorage; } catch { /* Optional device storage. */ }
  const dialog = doc.createElement('dialog');
  dialog.className = 'dialog privacy-account-dialog';
  dialog.setAttribute('aria-labelledby', 'privacy-account-title');
  dialog.innerHTML = `
    <form>
      <div class="dialog-head">
        <h2 id="privacy-account-title"></h2>
        <button type="button" class="icon-button" data-privacy-close aria-label="Schliessen">×</button>
      </div>
      <div class="dialog-body">
        <p id="privacy-account-description"></p>
        <div id="privacy-delete-confirmation">
          <label class="field-label" for="privacy-delete-text">Zur Bestätigung ${confirmationPhrase} eingeben</label>
          <input id="privacy-delete-text" autocomplete="off" spellcheck="false">
        </div>
        <p id="privacy-account-status" class="field-hint" role="status"></p>
        <p id="privacy-account-error" class="auth-error" role="alert" hidden></p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="quiet-button" data-privacy-close>Abbrechen</button>
        <button type="button" class="quiet-button" id="privacy-reauthenticate" hidden>Erneut mit Google anmelden</button>
        <button type="submit" class="primary-button danger-button" id="privacy-account-submit">Konto endgültig löschen</button>
      </div>
    </form>`;
  doc.body.append(dialog);
  const find = id => dialog.querySelector(`#privacy-${id}`);
  const title = find('account-title'), description = find('account-description');
  const submit = find('account-submit'), error = find('account-error'), status = find('account-status');
  const confirmation = find('delete-text'), reauth = find('reauthenticate');
  const closeButtons = dialog.querySelectorAll('[data-privacy-close]');
  const cancel = dialog.querySelector('.dialog-actions [data-privacy-close]');
  let busy = false, available = false, version = 0, openedFor = null;

  function showError(message = '') {
    error.textContent = message;
    error.hidden = !message;
  }
  function route(open) {
    const url = new URL(win.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (open) fragment.set('privacy-action', 'delete');
    else fragment.delete('privacy-action');
    url.hash = fragment.toString();
    win.history.replaceState(win.history.state, '', url);
  }
  function update() {
    submit.disabled = busy || !available || confirmation.value.trim() !== confirmationPhrase;
    closeButtons.forEach(button => { button.disabled = busy; });
    confirmation.disabled = busy;
    reauth.disabled = busy;
    dialog.setAttribute('aria-busy', String(busy));
  }
  function close() {
    if (busy) return;
    version++;
    openedFor = null;
    route(false);
    dialog.close();
    onClose?.();
  }

  async function open({ fromResume = false } = {}) {
    if (busy) return;
    const ticket = ++version;
    const current = await getSession();
    if (ticket !== version || !current) return;
    openedFor = current.user.id;
    available = false;
    showError();
    confirmation.value = '';
    reauth.hidden = true;
    submit.hidden = false;
    find('delete-confirmation').hidden = false;
    cancel.textContent = 'Abbrechen';
    route(true);
    analytics?.suspend?.();
    title.textContent = 'Konto und Daten löschen';
    description.textContent = 'Dein Benutzerkonto, deine eigenen Lernunterlagen, Lernfortschritte und Freigaben werden dauerhaft aus der aktiven App gelöscht. Bereits unabhängig importierte Kopien anderer Personen bleiben bestehen. Gesetzlich erforderliche Aufbewahrung und vorhandene Anbieter-Backups werden separat behandelt.';
    status.textContent = 'Verfügbarkeit wird geprüft …';
    update();
    if (!dialog.open) dialog.showModal();
    try {
      const result = await requestAccountDeletion(current);
      if (ticket !== version) return;
      available = result.available === true;
      if (!available) status.textContent = 'Die Kontolöschung ist auf dem Server noch nicht eingerichtet. Wende dich an den Datenschutzkontakt.';
      else if (fromResume) status.textContent = 'Gib die Bestätigung für die Löschung nochmals ein.';
      else status.textContent = 'Vor der Löschung kann eine erneute Anmeldung erforderlich sein.';
    } catch (failure) {
      if (ticket !== version) return;
      status.textContent = '';
      showError(failure.message);
    }
    if (ticket === version) update();
  }

  closeButtons.forEach(button => button.addEventListener('click', close));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  confirmation.addEventListener('input', update);
  reauth.addEventListener('click', async () => {
    if (busy || !openedFor) return;
    const owner = openedFor, ticket = version;
    busy = true;
    update();
    showError();
    try {
      temporary?.setItem(accountDeletionResumeKey, JSON.stringify({ userId: owner, expiresAt: Date.now() + 10 * 60 * 1000 }));
      await reauthenticate(owner);
    } catch (failure) {
      if (ticket !== version) return;
      try { temporary?.removeItem(accountDeletionResumeKey); } catch { /* Optional device storage. */ }
      showError(failure.message || 'Die erneute Anmeldung konnte nicht gestartet werden.');
    } finally {
      if (ticket === version) { busy = false; update(); }
    }
  });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !openedFor) return;
    const ticket = version, owner = openedFor;
    busy = true;
    showError();
    update();
    try {
      const current = await getSession();
      if (ticket !== version) return;
      if (current?.user.id !== owner) throw new Error('Das aktive Konto hat sich geändert. Öffne diese Funktion erneut.');
      const savedOwner = await flush();
      if (ticket !== version) return;
      if (savedOwner !== owner) throw new Error('Speichere zuerst deine offenen Änderungen und versuche es erneut.');
      status.textContent = 'Konto wird gelöscht …';
      const result = await requestAccountDeletion(current, { confirmation: confirmation.value.trim() });
      if (result.deleted !== true) throw new Error('Die Löschung wurde vom Server nicht bestätigt.');
      clearDeletedAccountStorage(storage, owner, null);
      if (ticket !== version) return;
      const latest = await getSession().catch(() => null);
      if (ticket !== version || (latest && latest.user.id !== owner)) return;
      try {
        temporary?.removeItem(accountDeletionResumeKey);
        temporary?.removeItem('lernkarten-share-oauth-v1');
      } catch { /* Optional device storage. */ }
      route(false);
      const signedOut = await onDeleted(owner);
      clearDeletedAccountStorage(storage, owner, authStorageKey);
      if (!signedOut) return;
      analytics?.revoke?.();
      available = false;
      find('delete-confirmation').hidden = true;
      title.textContent = 'Konto gelöscht';
      description.textContent = 'Dein Konto und deine eigenen Lernunterlagen wurden gelöscht. Bereits importierte Kopien anderer Personen bleiben erhalten.';
      status.textContent = 'Die Löschung wurde vom Server bestätigt.';
      submit.hidden = true;
      cancel.textContent = 'Schliessen';
      if (!dialog.open) dialog.showModal();
    } catch (failure) {
      if (ticket !== version) return;
      status.textContent = '';
      showError(failure.message);
      if (failure.code === 'REAUTH_REQUIRED') {
        available = false;
        reauth.hidden = false;
      }
    } finally {
      if (ticket === version) { busy = false; update(); }
    }
  });
  return {
    open,
    async resume() {
      const current = await getSession();
      if (!current) return;
      let pending;
      try {
        pending = JSON.parse(temporary?.getItem(accountDeletionResumeKey) || 'null');
        temporary?.removeItem(accountDeletionResumeKey);
      } catch { /* Optional device storage. */ }
      if (pending && pending.expiresAt > Date.now() && pending.userId !== current.user.id) {
        route(false);
        return;
      }
      const action = new URLSearchParams(win.location.hash.slice(1)).get('privacy-action');
      if (pending?.expiresAt > Date.now() || action === 'delete') await open({ fromResume: true });
    },
    accountChanged() {
      version++;
      busy = false;
      available = false;
      openedFor = null;
      if (dialog.open) dialog.close();
      confirmation.value = '';
      update();
    }
  };
}
