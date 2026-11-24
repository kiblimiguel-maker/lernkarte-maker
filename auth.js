import { inject } from '@vercel/analytics';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { createAuthLifecycle } from './auth-lifecycle.mjs';
import { getAppAppearance } from './appearance.mjs';
import { createLibraryShareReceiver } from './library-share-receiver.js';
import { forgetShareForSignIn, rememberShareForSignIn } from './library-sharing.mjs';
import { bindAppInstall } from './app-install.mjs';

// Apply the same saved surface during authentication and in the library.
getAppAppearance();
bindAppInstall();

inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
  beforeSend(event) {
    // OAuth callbacks can include one-time codes or tokens in the URL.
    // Keep those parameters out of analytics while retaining the page view.
    const url = new URL(event.url, window.location.origin);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.toString() };
  }
});

const authScreen = document.querySelector('#auth-screen');
const bootScreen = document.querySelector('#boot-screen');
const appShell = document.querySelector('#app-shell');
const googleButton = document.querySelector('#google-sign-in');
const authError = document.querySelector('#auth-error');
const authRetry = document.querySelector('#auth-retry');
const authLoading = document.querySelector('#auth-loading');
const accountEmail = document.querySelector('#account-email');
const signOutButton = document.querySelector('#sign-out');
const switchAccountButton = document.querySelector('#account-switch');
const accountMenu = document.querySelector('.account-menu');
const accountError = document.querySelector('#account-error');

let authEventObserved = false;
let signingIn = false;
let signingOut = false;
let switchingAccount = false;
let reloadingApp = false;
let accountUserId = null;
const sharedLibrary = createLibraryShareReceiver({ signIn: startGoogleSignIn });

// An open tab can still request chunks from the build preceding a deployment.
// Reload at most once per build, and leave a manual action if that fails.
window.addEventListener('vite:preloadError', () => {
  if (reloadingApp) return;
  const key = 'lernkarten-app-reload-build';
  try {
    if (sessionStorage.getItem(key) === import.meta.url) return;
    sessionStorage.setItem(key, import.meta.url);
  } catch {
    return;
  }
  reloadingApp = true;
  window.location.reload();
});
authRetry.addEventListener('click', () => window.location.reload());

function setError(message = '') {
  authError.textContent = message;
  authError.hidden = !message;
  authRetry.hidden = true;
}

function updateAccountActions() {
  const busy = signingOut || switchingAccount;
  signOutButton.disabled = busy;
  switchAccountButton.disabled = busy;
  switchAccountButton.setAttribute('aria-busy', String(switchingAccount));
  switchAccountButton.querySelector('span').textContent = switchingAccount ? 'Weiter zu Google …' : 'Konto wechseln';
}

function setAccountError(message = '') {
  accountError.textContent = message;
  accountError.hidden = !message;
  if (message) accountMenu.open = true;
}

accountMenu.addEventListener('focusout', event => {
  // Safari may leave focus on the body when a menu button is clicked. Closing
  // on that null focus target would hide the action before its click fires.
  if (event.relatedTarget && !switchingAccount && !accountMenu.contains(event.relatedTarget)) accountMenu.open = false;
});

function readOAuthError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = query.get('error_description') || query.get('error') || hash.get('error_description') || hash.get('error');
  if (!error) return '';

  const normalized = error.toLowerCase();
  const description = query.get('error_description') || hash.get('error_description') || error;
  const codeExchangeFailed = /unable to exchange external code:/i.test(description);
  const message = normalized.includes('access_denied') || normalized.includes('cancel')
    ? 'Die Anmeldung wurde abgebrochen. Du kannst es jederzeit erneut versuchen.'
    : codeExchangeFailed
      ? 'Google hat die Anmeldung zurückgegeben, aber Supabase konnte den kurzlebigen Code nicht gegen Tokens tauschen. Prüfe in Supabase, ob Google-Client-ID und Client-Secret aus demselben Google-Webclient stammen.'
      : 'Google/Supabase konnte die Anmeldung nicht abschließen. Bitte prüfe die OAuth-Einstellungen und versuche es erneut.';
  const callbackKeys = ['code', 'error', 'error_description', 'error_code', 'state', 'sb_flow_id', 'access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at'];
  const url = new URL(window.location.href);
  callbackKeys.forEach(key => url.searchParams.delete(key));
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  callbackKeys.forEach(key => hashParams.delete(key));
  url.hash = hashParams.toString() ? `#${hashParams}` : '';
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
  return message;
}

function showSignedOut(message = '') {
  accountUserId = null;
  accountMenu.open = false;
  setAccountError('');
  bootScreen.hidden = true;
  appShell.hidden = true;
  authScreen.hidden = false;
  authLoading.hidden = true;
  googleButton.disabled = !isSupabaseConfigured || signingIn;
  googleButton.setAttribute('aria-busy', String(signingIn));
  googleButton.querySelector('span').textContent = signingIn ? 'Weiter zu Google …' : 'Mit Google anmelden';
  const notice = message || (!isSupabaseConfigured
    ? 'Die Anmeldung ist noch nicht konfiguriert. Bitte ergänze die Supabase-Umgebungsvariablen.'
    : '');
  setError(notice);
  sharedLibrary.setAuth('signed-out', { message: notice });
}

async function loadExistingApp() {
  await import('./parser.js');
  await import('./presentation.js');
  await import('./card-themes.js');
  await import('./model.js');
  window.WortwerkRepository = await import('./repository.js');
  await import('./app.js');
  await window.WortwerkAppReady;
}

const lifecycle = createAuthLifecycle({
  loadApp: loadExistingApp,
  reloadApp: () => window.WortwerkReloadLibrary?.(),
  updateAccount(user) {
    setError('');
    if (accountUserId !== user.id) setAccountError('');
    accountUserId = user.id;
    accountEmail.textContent = user.email || 'Angemeldet';
    updateAccountActions();
  },
  showLoading() {
    sharedLibrary.setAuth('loading', { id: accountUserId });
    authScreen.hidden = true;
    authLoading.hidden = true;
    bootScreen.hidden = false;
    appShell.hidden = true;
  },
  showSignedIn() {
    bootScreen.hidden = true;
    appShell.hidden = false;
    authScreen.hidden = true;
    sharedLibrary.setAuth('ready', { id: accountUserId });
  },
  showSignedOut,
  resetWorkspace: () => window.WortwerkResetWorkspace?.(),
  onError() {
    console.error('Lernkarten-App konnte nicht geladen werden.');
    if (reloadingApp) return;
    const message = 'Die Lernkarten-App konnte nicht geladen werden. Lade die App neu, um es erneut zu versuchen.';
    showSignedOut(message);
    sharedLibrary.setAuth('app-error', { message });
    authRetry.hidden = false;
  }
});

function applySession(session, message = '') {
  signingIn = false;
  return lifecycle.apply(session, message);
}

googleButton.addEventListener('click', startGoogleSignIn);
async function startGoogleSignIn() {
  if (!supabase || signingIn) return;
  if (!rememberShareForSignIn()) {
    sharedLibrary.setAuth('signed-out', { message: 'Dieser Browser kann den Link während der Anmeldung nicht merken. Schliesse die Vorschau, melde dich an und öffne den Link erneut.' });
    return;
  }
  signingIn = true;
  setError('');
  googleButton.disabled = true;
  googleButton.setAttribute('aria-busy', 'true');
  googleButton.querySelector('span').textContent = 'Weiter zu Google …';
  sharedLibrary.setAuth('signing-in');

  try {
    const redirectTo = new URL(window.location.pathname, window.location.origin).toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) throw error;
  } catch {
    forgetShareForSignIn();
    signingIn = false;
    showSignedOut('Die Anmeldung konnte nicht gestartet werden. Bitte prüfe deine Verbindung und versuche es erneut.');
    console.error('Google OAuth konnte nicht gestartet werden.');
  }
}

switchAccountButton.addEventListener('click', async () => {
  if (!supabase || switchingAccount || signingOut || signingIn || !accountUserId || appShell.hidden) return;
  const ownerId = accountUserId;
  const wasInert = appShell.inert;
  let prepared = false;
  let failed = false;
  switchingAccount = true;
  setAccountError('');
  updateAccountActions();
  // Freeze edits before flushing the queue. No later click can enqueue a save
  // between the last write and the OAuth redirect.
  appShell.inert = true;
  try {
    const savedOwner = await window.WortwerkRepository.flushLibraryWrites();
    if (savedOwner !== ownerId || accountUserId !== ownerId) throw new Error('Account changed');
    prepared = true;
    if (!rememberShareForSignIn()) throw new Error('Return link unavailable');
    const redirectTo = new URL(window.location.pathname, window.location.origin).toString();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true }
    });
    if (error || !data?.url || accountUserId !== ownerId) throw error || new Error('Account switch unavailable');
    const destination = new URL(data.url);
    if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Invalid login URL');
    window.location.assign(destination.toString());
  } catch {
    failed = true;
    forgetShareForSignIn();
    setAccountError(prepared
      ? 'Der Kontowechsel konnte nicht gestartet werden. Du bist weiterhin mit deinem bisherigen Konto angemeldet. Bitte versuche es erneut.'
      : 'Deine Änderungen sind noch nicht vollständig gespeichert. Bitte prüfe die Verbindung und speichere sie, bevor du das Konto wechselst.');
  } finally {
    switchingAccount = false;
    appShell.inert = wasInert;
    updateAccountActions();
    if (failed && !appShell.hidden) switchAccountButton.focus({ preventScroll: true });
  }
});

signOutButton.addEventListener('click', async () => {
  if (!supabase || signingOut || switchingAccount) return;
  signingOut = true;
  updateAccountActions();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch {
    console.error('Abmeldung fehlgeschlagen.');
    window.alert('Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.');
  } finally {
    signingOut = false;
    updateAccountActions();
  }
});

if (!isSupabaseConfigured) {
  showSignedOut();
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION is deliberately handled by getSession below. OAuth PKCE
    // URL processing is part of client initialization, so this avoids racing
    // the startup check against Supabase's initial event.
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      authEventObserved = true;
      // Supabase emits under its auth lock. Queue workspace loads separately:
      // repository requests may themselves ask Supabase for the current user.
      setTimeout(() => { void applySession(session); }, 0);
    }
  });

  supabase.auth.getSession().then(async ({ data, error }) => {
    // A real auth event received while restoration was pending is newer than
    // this bootstrap result and must not be overwritten by a stale null/error.
    if (authEventObserved) return;
    const oauthMessage = readOAuthError();
    if (error) {
      console.error('Supabase-Session konnte nicht wiederhergestellt werden.');
      applySession(null, oauthMessage || 'Die gespeicherte Sitzung konnte nicht geprüft werden. Bitte melde dich erneut an.');
      authRetry.hidden = false;
      return;
    }
    await applySession(data.session, data.session ? '' : oauthMessage);
    if (data.session && oauthMessage && accountUserId === data.session.user.id && !appShell.hidden) setAccountError(oauthMessage);
  }).catch(() => {
    if (authEventObserved) return;
    console.error('Supabase-Session konnte nicht geprüft werden.');
    applySession(null, readOAuthError() || 'Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es erneut.');
    authRetry.hidden = false;
  });
}
