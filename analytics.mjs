import { analyticsConfig } from './analytics-config.mjs';
import { legalPublicationReady } from './legal-config.mjs';

export const ANALYTICS_CONSENT_KEY = 'lernkarten-privacy-choice-v1';
const CHOICE_COOKIE = '__Host-lernkarten-statistics-choice';
const CHOICE_STORAGE_CHECK = `${ANALYTICS_CONSENT_KEY}-write-check`;
const SCRIPT_ID = 'lernkarten-ga4-script';
const SINGLETON = Symbol.for('LernkartenMaker.analytics');
const AD_DENIED = Object.freeze({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
const PAGES = Object.freeze({
  library: 'Bibliothek', subject: 'Fach', folder: 'Ordner', deck: 'Lernstapel',
  study: 'Lernen', tests: 'Tests', guide: 'Anleitung', donations: 'Unterstützen',
  privacy: 'Datenschutz', terms: 'Nutzungsbedingungen', imprint: 'Impressum', contact: 'Kontakt'
});
export const ANALYTICS_EVENTS = Object.freeze([
  'page_view', 'flashcard_created', 'deck_created', 'folder_created', 'subject_created',
  'study_started', 'study_completed', 'test_started', 'test_completed', 'share_created',
  'share_imported', 'verb_trainer_started', 'import_completed', 'export_completed', 'feature_used'
]);
// test_* and verb_trainer_started are reserved, not emitted by the current app:
// a dated preparation collection is not a test, nor a verb card a verb trainer.
const EVENTS = new Set(ANALYTICS_EVENTS);
const ENUMS = Object.freeze({
  format: new Set(['plain', 'french_verbs', 'learning_goals', 'mixed']),
  source: new Set(['manual', 'text', 'file', 'share']),
  entity_type: new Set(['card', 'deck', 'folder', 'subject', 'test']),
  feature: new Set(['search', 'shuffle', 'fullscreen', 'speech', 'theme', 'drag_drop', 'copy_prompt', 'text_import', 'file_import', 'share', 'settings'])
});

function validConfig(config, runtime, win) {
  return config.enabled === true && config.legalApproved === true && config.minorsEligibilityVerified === true &&
    config.enhancedMeasurementVerifiedDisabled === true && config.advertisingAndSharingVerifiedDisabled === true &&
    /^G-[A-Z0-9]{6,20}$/.test(config.measurementId || '') &&
    typeof config.consentVersion === 'string' && config.consentVersion.length > 0 &&
    Number.isInteger(config.cookieExpiresSeconds) && config.cookieExpiresSeconds >= 0 &&
    Number.isFinite(config.consentMaxAgeDays) && config.consentMaxAgeDays > 0 &&
    config.cookieExpiresSeconds <= config.consentMaxAgeDays * 86_400 &&
    runtime.productionBuild === true && runtime.deploymentEnvironment === 'production' &&
    win?.location?.protocol === 'https:' && config.productionOrigins?.includes(win.location.origin);
}

// A random, operator-issued clearance binds consent to the verified account on
// shared devices. This value never enters the tag queue, URL or event payload.
const GRANT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function grantOf(user) {
  const value = user?.app_metadata?.privacy_analytics_grant;
  return user?.id && typeof value === 'string' && GRANT.test(value) ? value : null;
}

function parseChoice(raw, config, now) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (value?.version !== config.consentVersion || !['accepted', 'necessary'].includes(value?.choice) ||
      typeof value.updatedAt !== 'string') return null;
    const timestamp = Date.parse(value.updatedAt);
    if (!Number.isFinite(timestamp) || timestamp > now ||
      (Number.isFinite(config.consentMaxAgeDays) && now - timestamp > config.consentMaxAgeDays * 86_400_000)) return null;
    if (value.choice === 'accepted' && (typeof value.grant !== 'string' || !GRANT.test(value.grant))) return null;
    return value;
  } catch { return null; }
}

function safeParameters(parameters) {
  try {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(parameters))) return null;
    const result = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(parameters))) {
      if (!Object.hasOwn(descriptor, 'value')) return null;
      const value = descriptor.value;
      if (key === 'count' && Number.isInteger(value) && value >= 1 && value <= 1_000_000) result.count = value;
      else if (Object.hasOwn(ENUMS, key) && ENUMS[key].has(value)) result[key] = value;
      else return null;
    }
    return result;
  } catch { return null; }
}

function safeEnvironment(win) {
  try {
    const url = new URL(win.location.href);
    // Refuse query-bearing URLs altogether. No attribution or private callback
    // parameters should be observed by third-party code, even accidentally.
    if (url.search || url.pathname !== '/') return false;
    if (!url.hash || url.hash === '#') return true;
    const hash = new URLSearchParams(url.hash.slice(1));
    // Only these public legal fragments are safe. Share tokens, rights actions,
    // reports, cookie dialogs and every unknown fragment fail closed.
    return [...hash.keys()].length === 1 && hash.has('legal') &&
      ['privacy', 'terms', 'imprint', 'contact'].includes(hash.get('legal'));
  } catch { return false; }
}

function clearAnalyticsCookies(doc, win) {
  let names;
  try { names = doc.cookie.split(';').map(part => part.split('=')[0].trim()).filter(name => /^_(?:ga(?:_|$)|gid$|gat(?:_|$))/.test(name)); }
  catch { return; }
  const hostname = win.location.hostname;
  const labels = hostname.split('.');
  const domains = ['', ...labels.slice(0, -1).flatMap((_, index) => [labels.slice(index).join('.'), `.${labels.slice(index).join('.')}`])];
  const pieces = win.location.pathname.split('/').filter(Boolean);
  const paths = new Set(['/', ...pieces.map((_, index) => `/${pieces.slice(0, index + 1).join('/')}`)]);
  for (const name of names) for (const path of paths) for (const domain of domains) {
    try { doc.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path};${domain ? ` Domain=${domain};` : ''} SameSite=Lax; Secure`; }
    catch { /* Some domains and paths cannot be modified by this origin. */ }
  }
}

/** Dependency-injected for isolated tests; never pass user data to this API. */
export function createAnalyticsController({
  window: win = globalThis.window, document: doc = globalThis.document,
  storage, config = analyticsConfig, legalReady = legalPublicationReady(),
  runtime = { productionBuild: import.meta.env?.PROD === true, deploymentEnvironment: import.meta.env?.VITE_VERCEL_ENV },
  now = () => Date.now(), reload = () => win.location.reload()
} = {}) {
  if (storage === undefined) { try { storage = win?.localStorage; } catch { storage = null; } }
  let currentPage = null, lastSentPage = null, script = null, loaded = false, stopped = false, generation = 0, reloadRequested = false;
  let disposed = false, loadFailed = false, consentStorageFailed = false, expiryTimer = null;
  const configured = legalReady === true && validConfig(config, runtime, win);
  const privacyOrigin = win?.location?.protocol === 'https:' && config.productionOrigins?.includes(win.location.origin);
  let audience = null, audienceOwner = null, audienceGeneration = 0;
  const listeners = new Set();
  const disableKey = `ga-disable-${config.measurementId}`;
  if (win) win[disableKey] = true;
  let revocations;
  if (privacyOrigin && typeof win.BroadcastChannel === 'function') {
    try { revocations = new win.BroadcastChannel(CHOICE_COOKIE); }
    catch { /* Storage events still cover normal writes. */ }
  }

  function readChoiceCookie() {
    try {
      const prefix = `${CHOICE_COOKIE}=`;
      const entry = doc.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(prefix));
      return entry?.slice(prefix.length) ?? null;
    } catch { return null; }
  }

  function writeChoiceCookie(value, maxAge) {
    try {
      doc.cookie = `${CHOICE_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Lax`;
      return readChoiceCookie() === (maxAge > 0 ? value : null);
    } catch { return false; }
  }

  function broadcastRevocation(saved) {
    try { revocations?.postMessage(saved ? 'saved' : 'unsaved'); }
    catch { /* The current tab is already stopped. */ }
  }

  function storedConsent() {
    const cookie = privacyOrigin ? readChoiceCookie() : null;
    if (cookie?.startsWith('off.')) {
      const revokedAt = Number(cookie.slice(4));
      if (!Number.isSafeInteger(revokedAt) || revokedAt <= 0 || revokedAt > 8.64e15) return null;
      return { version: config.consentVersion, choice: 'necessary', updatedAt: new Date(revokedAt).toISOString() };
    }
    try {
      const record = parseChoice(storage?.getItem(ANALYTICS_CONSENT_KEY), config, now());
      // An older opt-in stays invalid if the browser later discards a
      // fallback denial cookie or caps its lifetime.
      if (record?.choice === 'accepted' && cookie !== `on.${Date.parse(record.updatedAt)}`) return null;
      return record;
    }
    catch { return null; }
  }
  function readConsent() {
    if (consentStorageFailed) return null;
    const record = storedConsent();
    if (!record || (record.choice === 'accepted' && record.grant !== audience)) return null;
    return { version: record.version, choice: record.choice, updatedAt: record.updatedAt };
  }
  function isAvailable() { return configured && Boolean(audience) && !disposed && !loadFailed; }
  async function updateAudience(user, getVerifiedUser) {
    const version = ++audienceGeneration;
    const candidate = configured && !disposed ? grantOf(user) : null;
    if (audience && (candidate !== audience || user?.id !== audienceOwner)) {
      audience = null;
      stop({ terminal: false });
      notify();
    }
    if (!candidate || typeof getVerifiedUser !== 'function') {
      if (storedConsent()?.choice === 'accepted' && !audience) clearAnalyticsCookies(doc, win);
      return false;
    }
    // The restored local session is only a hint. Rely on Auth's fresh user
    // response and discard it if the account changed during verification.
    let verified;
    try { verified = await getVerifiedUser(); } catch { verified = null; }
    if (version !== audienceGeneration || disposed) return false;
    if (verified?.id !== user.id || grantOf(verified) !== candidate) {
      audience = null;
      stop({ terminal: false });
      notify();
      return false;
    }
    audienceOwner = user.id;
    audience = candidate;
    if (readConsent()?.choice === 'accepted') activate();
    else if (storedConsent()?.choice === 'accepted') clearAnalyticsCookies(doc, win);
    notify();
    return true;
  }
  function allowed() { return isAvailable() && !stopped && !reloadRequested && safeEnvironment(win) && Object.hasOwn(PAGES, currentPage) && readConsent()?.choice === 'accepted'; }
  function notify() {
    for (const listener of listeners) { try { listener(readConsent()); } catch { /* A UI callback cannot affect privacy enforcement. */ } }
  }
  function safePage() {
    return { page_name: currentPage, page_title: `Lernkarten Maker · ${PAGES[currentPage]}`,
      page_location: `${win.location.origin}/_usage/${currentPage}`, page_referrer: '' };
  }
  function command() {
    if (!allowed()) return false;
    try { win.dataLayer.push(arguments); return true; }
    catch { stop({ reloadPage: false }); return false; }
  }
  function requestReload() {
    if (!reloadRequested) {
      reloadRequested = true;
      try { reload(); } catch { /* The local disable flag remains set if navigation is blocked. */ }
    }
  }
  function scheduleExpiry() {
    if (expiryTimer !== null) { (win.clearTimeout || clearTimeout)(expiryTimer); expiryTimer = null; }
    const choice = readConsent();
    if (!choice || choice.choice !== 'accepted' || !isAvailable()) return;
    const remaining = Date.parse(choice.updatedAt) + config.consentMaxAgeDays * 86_400_000 - now();
    expiryTimer = (win.setTimeout || setTimeout)(() => {
      expiryTimer = null;
      if (readConsent()?.choice !== 'accepted') { stop(); notify(); }
      else scheduleExpiry();
    }, Math.max(1, Math.min(remaining + 1, 2_147_483_647)));
  }
  function blockTagNetworkBeforeUnload() {
    // WebKit can flush already queued GA batches when a document unloads,
    // even after ga-disable. This policy is scoped to the old document and
    // allows the app's own API and Supabase writes to finish during reload.
    const allowed = ["'self'"];
    try {
      const backend = new URL(import.meta.env?.VITE_SUPABASE_URL);
      if (backend.protocol === 'https:') allowed.push(backend.origin, 'wss://' + backend.host);
    } catch { /* A local test or unconfigured deployment uses same-origin only. */ }
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = `connect-src ${allowed.join(' ')}; img-src ${allowed.join(' ')} data: blob:; script-src 'self'; frame-src 'self'`;
    doc.head.append(policy);
  }
  function stop({ reloadPage = true, terminal = true } = {}) {
    // Never send a denied-consent update through a loaded Google tag: it can
    // produce a cookieless consent ping. Disable locally before all cleanup.
    if (win) win[disableKey] = true;
    if (expiryTimer !== null) { (win.clearTimeout || clearTimeout)(expiryTimer); expiryTimer = null; }
    generation++;
    const hadScript = Boolean(script);
    loaded = false;
    if (terminal) stopped = true;
    if (hadScript) blockTagNetworkBeforeUnload();
    if (script) { script.onload = null; script.onerror = null; script.remove(); script = null; }
    if (win?.gtag?.lernkartenOwned) win.gtag = () => {};
    if (Array.isArray(win?.dataLayer) && hadScript) win.dataLayer.length = 0;
    if (doc && win) clearAnalyticsCookies(doc, win);
    lastSentPage = null;
    if (hadScript && reloadPage) requestReload();
    return hadScript;
  }
  function emitPage() {
    if (!allowed() || !loaded || lastSentPage === currentPage) return false;
    if (!command('set', safePage()) || !command('event', 'page_view', { ...safePage(), send_to: config.measurementId })) return false;
    lastSentPage = currentPage;
    return true;
  }
  function activate() {
    if (!allowed() || script || loadFailed || !doc) return;
    // A separately added Google integration is an activation blocker, not a
    // reason to load a duplicate tag or share its potentially unsafe queue.
    if (doc.querySelector(`script[src*="googletagmanager.com"],script[src*="google-analytics.com"]`)) {
      stop({ reloadPage: false }); return;
    }
    // A readable opt-in from an earlier visit cannot start the tag in a
    // browser where the choice can no longer be updated.
    try {
      storage.setItem(CHOICE_STORAGE_CHECK, '1');
      if (storage.getItem(CHOICE_STORAGE_CHECK) !== '1') throw new Error('Consent storage is read-only');
      storage.removeItem(CHOICE_STORAGE_CHECK);
    } catch {
      consentStorageFailed = true;
      stop({ reloadPage: false });
      return;
    }
    const choice = readConsent();
    if (!choice) return;
    const consentExpiresAt = Date.parse(choice.updatedAt) + config.consentMaxAgeDays * 86_400_000;
    const remainingConsentSeconds = Math.floor((consentExpiresAt - now()) / 1000);
    scheduleExpiry();
    if (remainingConsentSeconds < 1) return; // Zero would switch GA to a session cookie.
    const version = ++generation;
    const cookieExpiry = Math.min(config.cookieExpiresSeconds, remainingConsentSeconds);
    win[disableKey] = false;
    win.dataLayer = [];
    const gtag = function () { if (allowed()) win.dataLayer.push(arguments); };
    gtag.lernkartenOwned = true;
    win.gtag = gtag;
    // Commands are created only after consent. No previous actions are queued.
    command('consent', 'default', { ...AD_DENIED, analytics_storage: 'denied' });
    command('consent', 'update', { ...AD_DENIED, analytics_storage: 'granted' });
    command('set', 'ads_data_redaction', true);
    command('set', 'url_passthrough', false);
    command('set', safePage());
    command('js', new Date(now()));
    command('config', config.measurementId, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      ignore_referrer: true, page_title: safePage().page_title, page_location: safePage().page_location,
      page_referrer: '', cookie_expires: cookieExpiry, cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure', cookie_domain: 'none',
      // Campaign attribution, cross-domain incoming parameters and ads are not used.
      linker: { accept_incoming: false, domains: [] }
    });
    if (!allowed()) return;
    script = doc.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.measurementId)}`;
    script.onload = () => {
      if (version !== generation || !allowed()) return;
      loaded = true;
      // Count only the currently visible generic page, never previous pages or
      // actions that occurred before consent or while the script was loading.
      emitPage();
    };
    script.onerror = () => { if (version === generation) { loadFailed = true; stop({ reloadPage: false }); notify(); } };
    doc.head.append(script);
  }
  function navigate(page) {
    if (!Object.hasOwn(PAGES, page) || !safeEnvironment(win)) {
      currentPage = null;
      stop({ terminal: Boolean(script) });
      return false;
    }
    currentPage = page;
    if (loaded) return emitPage();
    activate();
    return false;
  }
  function track(name, parameters = {}) {
    if (!EVENTS.has(name) || !allowed() || !loaded) return false;
    if (name === 'page_view') return Object.keys(parameters).length === 0 && emitPage();
    const safe = safeParameters(parameters);
    if (!safe) return false;
    return command('event', name, { ...safePage(), ...safe, send_to: config.measurementId });
  }
  function saveChoice(record) {
    try {
      const value = JSON.stringify(record);
      storage.setItem(ANALYTICS_CONSENT_KEY, value);
      return storage.getItem(ANALYTICS_CONSENT_KEY) === value;
    } catch { return false; }
  }

  function consent(choice) {
    if (!['accepted', 'necessary'].includes(choice)) return false;
    if (choice === 'accepted' && (!isAvailable() || reloadRequested)) return false;
    const timestamp = now();
    const record = { version: config.consentVersion, choice, updatedAt: new Date(timestamp).toISOString() };
    const maxAge = Math.ceil(config.consentMaxAgeDays * 86_400);
    if (choice === 'necessary') {
      const needsReload = stop({ terminal: false, reloadPage: false });
      let saved = saveChoice(record);
      if (saved && privacyOrigin && readChoiceCookie() !== null) writeChoiceCookie('', 0);
      if (!saved && privacyOrigin && maxAge > 0) {
        saved = writeChoiceCookie(`off.${timestamp}`, maxAge);
      }
      if (!saved) {
        try {
          storage.removeItem(ANALYTICS_CONSENT_KEY);
          saved = storage.getItem(ANALYTICS_CONSENT_KEY) === null;
        } catch { /* No durable storage is writable. */ }
      }
      consentStorageFailed = !saved;
      broadcastRevocation(saved);
      notify();
      if (saved && needsReload) requestReload();
      return saved;
    }

    consentStorageFailed = !saveChoice({ ...record, grant: audience }) ||
      !writeChoiceCookie(`on.${timestamp}`, maxAge);
    if (consentStorageFailed) stop({ reloadPage: false });
    else {
      stopped = false;
      activate();
    }
    notify();
    return !consentStorageFailed;
  }

  if (revocations) revocations.onmessage = event => {
    if (event.data === 'saved') syncStoredChoice();
    if (event.data === 'unsaved') {
      consentStorageFailed = true;
      stop({ reloadPage: false });
      notify();
    }
  };
  function syncStoredChoice(event) {
    if (event && event.type === 'storage' && event.key !== null && event.key !== ANALYTICS_CONSENT_KEY) return;
    if (event?.storageArea && event.storageArea !== storage) return;
    // On initial page load, Auth may still be verifying the stored clearance.
    // No tag exists yet. Keep its approved cookie until that check finishes.
    if (!audience && !script && configured && storedConsent()?.choice === 'accepted') return;
    if (readConsent()?.choice !== 'accepted') stop({ terminal: false });
    else if (!safeEnvironment(win)) stop({ terminal: Boolean(script) });
    else activate();
    notify();
  }
  const onEnvironmentChange = () => { if (!safeEnvironment(win)) stop({ terminal: Boolean(script) }); };
  win?.addEventListener('storage', syncStoredChoice);
  win?.addEventListener('pageshow', syncStoredChoice);
  win?.addEventListener('hashchange', onEnvironmentChange);
  win?.addEventListener('popstate', onEnvironmentChange);
  if (storedConsent()?.choice !== 'accepted' || !configured) clearAnalyticsCookies(doc || { cookie: '' }, win || { location: { hostname: '', pathname: '/' } });
  return {
    track, navigate, consent, readConsent, isAvailable, updateAudience,
    revoke: () => consent('necessary'),
    suspend({ reloadPage = true } = {}) {
      currentPage = null;
      stop({ terminal: Boolean(script), reloadPage });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      stop({ reloadPage: false }); disposed = true;
      revocations?.close();
      win?.removeEventListener('storage', syncStoredChoice);
      win?.removeEventListener('pageshow', syncStoredChoice);
      win?.removeEventListener('hashchange', onEnvironmentChange);
      win?.removeEventListener('popstate', onEnvironmentChange);
      listeners.clear();
    }
  };
}

export function getAnalytics() {
  const win = globalThis.window;
  if (!win) return createAnalyticsController();
  return win[SINGLETON] ||= createAnalyticsController();
}
