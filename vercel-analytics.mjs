const productionOrigin = 'https://lernkarte-maker.vercel.app';
const choiceCookie = '__Host-lernkarten-vercel-choice';
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
    if (saved) sync();
    return saved;
  }

  if (available) {
    win.addEventListener('hashchange', sync);
    win.addEventListener('pageshow', sync);
    win.addEventListener('focus', sync);
    void countEntry();
  }

  return {
    isAvailable: () => available,
    shouldPrompt: () => publicEntry && isPublicEntry(win.location) && !readConsent(),
    readConsent,
    consent,
    revoke: () => consent('necessary'),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
