const productionOrigin = 'https://lernkarte-maker.vercel.app';
const choiceCookie = '__Host-lernkarten-vercel-choice';
const hideBannerKey = 'lernkarten-vercel-hide-banner-v1';
const maxAgeSeconds = 180 * 86_400;

function isPublicEntry(location) {
  return location.origin === productionOrigin && location.pathname === '/' && !location.search && !location.hash;
}

function isPublicReferrer(referrer) {
  if (!referrer) return true;
  try {
    const url = new URL(referrer);
    return ['https:', 'http:'].includes(url.protocol) && url.href === `${url.origin}/`;
  } catch {
    return false;
  }
}

export function createVercelAnalytics({
  window: win = globalThis.window, document: doc = globalThis.document,
  productionBuild = import.meta.env?.PROD === true, deploymentEnvironment = import.meta.env?.VITE_VERCEL_ENV,
  loadSdk = () => import('@vercel/analytics')
} = {}) {
  const available = productionBuild && deploymentEnvironment === 'production' && win?.location?.origin === productionOrigin;
  const publicEntry = available && isPublicEntry(win.location) && isPublicReferrer(doc.referrer);
  const listeners = new Set();
  let stopped = false;
  let requested = false;
  let loading = false;
  let bannerDismissed = false;

  function readConsent() {
    if (!available || stopped) return null;
    try {
      const prefix = `${choiceCookie}=`;
      const entry = doc.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
      const match = /^(accepted|necessary)\.(\d+)$/.exec(entry?.slice(prefix.length) ?? '');
      if (!match) return null;
      const timestamp = Number(match[2]);
      const now = Date.now();
      if (timestamp > now || now - timestamp >= maxAgeSeconds * 1000) return null;
      return { choice: match[1], updatedAt: new Date(timestamp).toISOString() };
    } catch { return null; }
  }

  function writeChoice(value, age) {
    try {
      doc.cookie = `${choiceCookie}=${value}; Max-Age=${age}; Path=/; Secure; SameSite=Lax`;
      if (!age) return !doc.cookie.split(';').some(part => part.trim().startsWith(`${choiceCookie}=`));
      return doc.cookie.split(';').some(part => part.trim() === `${choiceCookie}=${value}`);
    } catch { return false; }
  }

  const mayCount = () => publicEntry && isPublicEntry(win.location) && readConsent()?.choice === 'accepted';

  // This local display preference never authorises or renews a pageview.
  function hideFutureBanners(hide) {
    try {
      if (hide) win.localStorage.setItem(hideBannerKey, '1');
      else win.localStorage.removeItem(hideBannerKey);
    } catch { /* The consent cookie still works when local storage is unavailable. */ }
  }

  function bannerMode() {
    if (!publicEntry || !isPublicEntry(win.location) || bannerDismissed || stopped) return null;
    const choice = readConsent()?.choice;
    if (choice === 'necessary') return 'notice';
    if (choice === 'accepted') return null;
    try {
      if (win.localStorage.getItem(hideBannerKey) === '1') return null;
    } catch { /* An unknown preference uses the first-visit banner. */ }
    return 'choice';
  }

  function hasAttribution() {
    // The Vercel script can add legacy identify/group data from its own storage.
    // Skip the event if that data exists or storage cannot be checked.
    try { return win.localStorage.getItem('__va_attribution') !== null; }
    catch { return true; }
  }

  async function countEntry() {
    if (loading || requested || !mayCount() || hasAttribution()) return;
    loading = true;
    try {
      const { inject, pageview } = await loadSdk();
      if (!mayCount() || hasAttribution()) return;
      let counted = false;
      const beforeSend = event => {
        if (counted || event.type !== 'pageview' || !mayCount() || hasAttribution()) return null;
        counted = true;
        return { type: 'pageview', url: `${productionOrigin}/` };
      };
      requested = true;
      inject({ mode: 'production', disableAutoTrack: true, beforeSend });
      pageview({ route: '/', path: '/' });
    } catch {
      // Statistics should never interfere with the learning app.
    } finally {
      loading = false;
    }
  }

  function sync() {
    for (const listener of listeners) listener();
    void countEntry();
  }

  function consent(choice) {
    if (!available || !['accepted', 'necessary'].includes(choice)) return false;
    // Disable the current document before attempting to persist a withdrawal.
    stopped = choice === 'necessary';
    const saved = writeChoice(`${choice}.${Date.now()}`, maxAgeSeconds) ||
      (choice === 'necessary' && writeChoice('', 0));
    stopped = !saved;
    if (saved) {
      bannerDismissed = true;
      hideFutureBanners(choice === 'accepted');
      sync();
    }
    return saved;
  }

  if (available) {
    if (readConsent()?.choice === 'accepted') hideFutureBanners(true);
    win.addEventListener('hashchange', sync);
    win.addEventListener('pageshow', event => {
      if (event.persisted) bannerDismissed = false;
      sync();
    });
    win.addEventListener('focus', sync);
    win.addEventListener('storage', event => {
      if (event.key === hideBannerKey || event.key === null) sync();
    });
    void countEntry();
  }

  return {
    isAvailable: () => available,
    bannerMode,
    dismissNotice() {
      if (bannerMode() !== 'notice') return;
      bannerDismissed = true;
      sync();
    },
    readConsent,
    consent,
    revoke: () => consent('necessary'),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
