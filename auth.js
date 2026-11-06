import { inject } from '@vercel/analytics';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { createAuthLifecycle } from './auth-lifecycle.mjs';
import { getAppAppearance } from './appearance.mjs';

// Apply the same saved surface during authentication and in the library.
getAppAppearance();

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
const authLoading = document.querySelector('#auth-loading');
const accountEmail = document.querySelector('#account-email');
const signOutButton = document.querySelector('#sign-out');

let authEventObserved = false;
let signingIn = false;
let signingOut = false;

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
    accountEmail.textContent = user.email || 'Angemeldet';
    signOutButton.disabled = signingOut;
  },
  showLoading() {
    authScreen.hidden = true;
    authLoading.hidden = true;
    bootScreen.hidden = false;
    appShell.hidden = true;
  },
  showSignedIn() {
    bootScreen.hidden = true;
    appShell.hidden = false;
    authScreen.hidden = true;
  },
  showSignedOut,
  resetWorkspace: () => window.WortwerkResetWorkspace?.(),
  onError(error) {
    bootScreen.hidden = true;
    appShell.hidden = true;
    showSignedOut('Die Lernkarten-App konnte nicht geladen werden. Bitte lade die Seite erneut.');
    console.error(error);
  }
});

function applySession(session, message = '') {
  signingIn = false;
  return lifecycle.apply(session, message);
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
  if (!supabase || signingOut) return;
  signingOut = true;
  signOutButton.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Abmeldung fehlgeschlagen.', error);
    window.alert('Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.');
  } finally {
    signingOut = false;
    signOutButton.disabled = false;
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
