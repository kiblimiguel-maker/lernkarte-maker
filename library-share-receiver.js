import { clearShareRoute, importLibraryShare, previewLibraryShare, readShareRoute, restoreShareAfterSignIn } from './library-sharing.mjs';

export function createLibraryShareReceiver({ signIn }) {
  const dialog = document.querySelector('#shared-library-dialog');
  const find = id => dialog.querySelector(`#shared-library-${id}`);
  const title = find('title');
  const kind = find('kind');
  const counts = find('counts');
  const description = find('description');
  const destination = find('destination');
  const subject = find('subject');
  const status = find('status');
  const error = find('error');
  const action = find('action');
  const dismissButtons = dialog.querySelectorAll('[data-dismiss-shared-library]');
  let token = null;
  let routeVersion = 0;
  let preview = null;
  let result = null;
  let previewState = 'loading';
  let authState = 'loading';
  let userId = null;
  let authVersion = 0;
  let authMessage = '';
  let actionMessage = '';
  let busy = false;

  function render() {
    if (token === null) return;
    const isFolder = preview?.kind === 'folder';
    const label = isFolder ? 'Ordner' : 'Lernstapel';
    kind.textContent = preview ? `Geteilter ${label}` : 'Freigabelink';
    title.textContent = preview?.title || 'Geteilter Lerninhalt';
    counts.hidden = !preview;
    counts.textContent = preview ? [
      ...(isFolder ? [`${preview.folderCount} Unterordner`, `${preview.setCount} Lernstapel`] : []),
      `${preview.cardCount} ${preview.cardCount === 1 ? 'Lernkarte' : 'Lernkarten'}`
    ].join(' · ') : '';
    description.hidden = !preview || Boolean(result);
    destination.hidden = !preview || Boolean(result) || authState !== 'ready';
    subject.disabled = busy;
    action.hidden = false;
    action.disabled = busy;
    dismissButtons.forEach(button => { button.disabled = busy; });
    status.textContent = '';
    error.textContent = actionMessage || authMessage;
    error.hidden = !error.textContent;

    if (previewState === 'loading') {
      status.textContent = 'Freigabe wird geladen …';
      action.hidden = true;
    } else if (previewState === 'error') {
      status.textContent = 'Die Vorschau konnte nicht geladen werden. Prüfe deine Verbindung.';
      action.textContent = 'Erneut laden';
    } else if (!preview) {
      status.textContent = 'Dieser Freigabelink ist ungültig oder der Inhalt ist nicht mehr verfügbar.';
      action.hidden = true;
    } else if (result) {
      status.textContent = result.missing
        ? 'Du hast diesen Inhalt bereits hinzugefügt und die Kopie später gelöscht.'
        : result.status === 'already_imported'
          ? 'Bereits in deiner Bibliothek.'
          : `${label} erfolgreich hinzugefügt.`;
      action.hidden = Boolean(result.missing);
      action.textContent = busy ? 'Bibliothek wird geladen …' : `${label} öffnen`;
    } else if (authState === 'ready') {
      action.textContent = busy ? 'Wird hinzugefügt …' : 'Zur eigenen Bibliothek hinzufügen';
    } else if (authState === 'signed-out') {
      status.textContent = 'Melde dich mit Google an, um diesen Inhalt deiner Bibliothek hinzuzufügen.';
      action.textContent = 'Mit Google anmelden';
    } else if (authState === 'app-error') {
      action.textContent = 'App neu laden';
    } else {
      status.textContent = authState === 'signing-in' ? 'Weiter zu Google …' : 'Deine Anmeldung wird geprüft …';
      action.hidden = true;
    }
    if (!dialog.open) dialog.showModal();
  }

  async function loadPreview() {
    const version = ++routeVersion;
    previewState = 'loading';
    render();
    try {
      const details = await previewLibraryShare(token);
      if (version !== routeVersion) return;
      preview = details;
      previewState = 'loaded';
    } catch {
      if (version !== routeVersion) return;
      previewState = 'error';
    }
    render();
  }

  function syncRoute() {
    const nextToken = readShareRoute();
    if (nextToken === token) return;
    token = nextToken;
    routeVersion++;
    preview = null;
    result = null;
    actionMessage = '';
    busy = false;
    if (token === null) dialog.close();
    else void loadPreview();
  }

  function dismiss() {
    if (busy) return;
    clearShareRoute();
    syncRoute();
  }

  function setAuth(state, { id = null, message = '' } = {}) {
    if (userId !== id) {
      authVersion++;
      result = null;
      actionMessage = '';
      busy = false;
    }
    authState = state;
    userId = id;
    authMessage = message;
    if (state === 'ready') {
      const subjects = window.WortwerkShareDestinations();
      const defaultSubject = subjects.find(item => item.name === 'Geteilt mit dir');
      subject.replaceChildren(new Option('Geteilt mit dir (Standard)', ''));
      subjects.filter(item => item !== defaultSubject).forEach(item => subject.add(new Option(item.name, item.id)));
    }
    render();
  }

  async function saveCopy() {
    const version = routeVersion;
    const accountVersion = authVersion;
    const importingUser = userId;
    const current = () => version === routeVersion && accountVersion === authVersion;
    busy = true;
    actionMessage = '';
    render();
    try {
      if (result) {
        const opened = await window.WortwerkOpenSharedCopy(result.kind, result.id);
        if (!current()) return;
        if (!opened) {
          actionMessage = 'Die Bibliothek konnte nicht geöffnet werden. Versuche es erneut.';
        } else {
          busy = false;
          dismiss();
        }
        return;
      }
      const selectedSubject = subject.value;
      const requestedToken = token;
      const copy = await window.WortwerkSaveSharedCopy(importingUser,
        () => importLibraryShare(requestedToken, selectedSubject, importingUser), current);
      if (!current()) return;
      if (copy) {
        result = copy;
      } else {
        preview = null;
      }
    } catch (failure) {
      if (!current()) return;
      actionMessage = failure?.code === 'SHARE_LIBRARY_NOT_READY'
        ? failure.message
        : 'Der Inhalt konnte nicht hinzugefügt werden. Prüfe deine Verbindung und versuche es erneut.';
    } finally {
      if (current()) {
        busy = false;
        render();
      }
    }
  }

  dialog.querySelector('form').addEventListener('submit', event => event.preventDefault());
  dismissButtons.forEach(button => button.addEventListener('click', dismiss));
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  action.addEventListener('click', () => {
    if (previewState === 'error') void loadPreview();
    else if (authState === 'signed-out') void signIn();
    else if (authState === 'app-error') window.location.reload();
    else if (authState === 'ready' && preview && !busy) void saveCopy();
  });
  restoreShareAfterSignIn();
  syncRoute();
  window.addEventListener('hashchange', syncRoute);
  return { setAuth };
}
