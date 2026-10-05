import { isSupabaseConfigured, supabase } from './supabaseClient.js';

const authScreen = document.querySelector('#auth-screen');
const bootScreen = document.querySelector('#boot-screen');
const appShell = document.querySelector('#app-shell');
const googleButton = document.querySelector('#google-sign-in');
const authError = document.querySelector('#auth-error');
const authLoading = document.querySelector('#auth-loading');
const accountEmail = document.querySelector('#account-email');
const signOutButton = document.querySelector('#sign-out');

let appLoaded = false;
let authReady = false;
let authEventObserved = false;
let signingIn = false;

function setError(message = '') {
  authError.textContent = message;
  authError.hidden = !message;
}

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
  bootScreen.hidden = true;
  appShell.hidden = true;
  authScreen.hidden = false;
  authLoading.hidden = true;
  googleButton.disabled = !isSupabaseConfigured || signingIn;
  googleButton.setAttribute('aria-busy', String(signingIn));
  googleButton.querySelector('span').textContent = signingIn ? 'Weiter zu Google …' : 'Mit Google anmelden';
  setError(message || (!isSupabaseConfigured
    ? 'Die Anmeldung ist noch nicht konfiguriert. Bitte ergänze die Supabase-Umgebungsvariablen.'
    : ''));
}

async function loadExistingApp() {
  authScreen.hidden = true;
  authLoading.hidden = true;

  if (appLoaded) {
    if (window.WortwerkReloadLibrary) await window.WortwerkReloadLibrary();
    bootScreen.hidden = true;
    appShell.hidden = false;
    return;
  }

  bootScreen.hidden = false;
  appShell.hidden = true;
  appLoaded = true;
  import('./parser.js').then(() => import('./model.js')).then(() => import('./repository.js')).then(module => {
    window.WortwerkRepository = module;
    return import('./app.js');
  }).then(() => {
    bootScreen.hidden = true;
    appShell.hidden = false;
  }).catch(error => {
    appLoaded = false;
    bootScreen.hidden = true;
    appShell.hidden = true;
    authScreen.hidden = false;
    setError('Die Lernkarten-App konnte nicht geladen werden. Bitte lade die Seite erneut.');
    console.error(error);
  });
}

function applySession(session, message = '') {
  authReady = true;
  signingIn = false;
  bootScreen.hidden = true;
  if (session?.user) {
    setError('');
    accountEmail.textContent = session.user.email || 'Angemeldet';
    loadExistingApp();
  } else {
    showSignedOut(message);
  }
}

googleButton.addEventListener('click', async () => {
  if (!supabase || signingIn) return;
  signingIn = true;
  setError('');
  googleButton.disabled = true;
  googleButton.setAttribute('aria-busy', 'true');
  googleButton.querySelector('span').textContent = 'Weiter zu Google …';

  try {
    const redirectTo = new URL(window.location.pathname, window.location.origin).toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) throw error;
  } catch (error) {
    signingIn = false;
    showSignedOut('Die Anmeldung konnte nicht gestartet werden. Bitte prüfe deine Verbindung und versuche es erneut.');
    console.error('Google OAuth konnte nicht gestartet werden.', error);
  }
});

signOutButton.addEventListener('click', async () => {
  if (!supabase) return;
  signOutButton.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    signOutButton.disabled = false;
    console.error('Abmeldung fehlgeschlagen.', error);
    window.alert('Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.');
  }
});

if (!isSupabaseConfigured) {
  authReady = true;
  showSignedOut();
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION is deliberately handled by getSession below. OAuth PKCE
    // URL processing is part of client initialization, so this avoids racing
    // the startup check against Supabase's initial event.
    if (event === 'INITIAL_SESSION') return;
    authEventObserved = true;
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      applySession(session);
    }
  });

  supabase.auth.getSession().then(({ data, error }) => {
    // A real auth event received while restoration was pending is newer than
    // this bootstrap result and must not be overwritten by a stale null/error.
    if (authEventObserved) return;
    if (error) {
      console.error('Supabase-Session konnte nicht wiederhergestellt werden.', error);
      applySession(null, readOAuthError() || 'Die gespeicherte Sitzung konnte nicht geprüft werden. Bitte melde dich erneut an.');
      return;
    }
    applySession(data.session, data.session ? '' : readOAuthError());
  }).catch(error => {
    console.error('Supabase-Session konnte nicht geprüft werden.', error);
    if (!authEventObserved) applySession(null, readOAuthError() || 'Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es erneut.');
  });
}
