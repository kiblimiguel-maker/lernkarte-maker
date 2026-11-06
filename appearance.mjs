// The app surface is independent from the selected learning-card palette.
export const APPEARANCE_STORAGE_KEY = 'lernkarten-appearance-v1';
export const DEFAULT_APPEARANCE = 'light';
export const APPEARANCE_COLORS = Object.freeze({ light: '#FCFCFD', dark: '#111113' });

const validPreferences = new Set(['light', 'dark', 'system']);
const normalizePreference = value => validPreferences.has(value) ? value : DEFAULT_APPEARANCE;

export function readAppearancePreference(storage) {
  try { return normalizePreference(storage?.getItem(APPEARANCE_STORAGE_KEY)); }
  catch { return DEFAULT_APPEARANCE; }
}

export function resolveAppearance(preference, systemIsDark = false) {
  return preference === 'dark' || (preference === 'system' && systemIsDark) ? 'dark' : 'light';
}

export function createAppearanceController({ root, themeColor, storage, mediaQuery, eventTarget } = {}) {
  let preference = readAppearancePreference(storage);
  let appearance;
  let destroyed = false;
  const subscribers = new Set();

  function apply() {
    if (destroyed) return;
    appearance = resolveAppearance(preference, mediaQuery?.matches);
    root?.setAttribute('data-appearance', appearance);
    if (root?.style) root.style.colorScheme = appearance;
    themeColor?.setAttribute('content', APPEARANCE_COLORS[appearance]);
    for (const subscriber of subscribers) subscriber({ preference, appearance });
  }

  const onSystemChange = () => { if (preference === 'system') apply(); };
  const onStorageChange = event => {
    if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && storage && event.storageArea !== storage) return;
    preference = normalizePreference(event.newValue);
    apply();
  };

  if (mediaQuery?.addEventListener) mediaQuery.addEventListener('change', onSystemChange);
  else mediaQuery?.addListener?.(onSystemChange);
  eventTarget?.addEventListener('storage', onStorageChange);
  apply();

  return {
    get preference() { return preference; },
    get appearance() { return appearance; },
    setPreference(value) {
      if (destroyed) return { preference, appearance, persisted: false };
      preference = normalizePreference(value);
      let persisted = false;
      try {
        if (storage) { storage.setItem(APPEARANCE_STORAGE_KEY, preference); persisted = true; }
      } catch { /* A blocked browser store must not prevent changing appearance. */ }
      apply();
      return { preference, appearance, persisted };
    },
    subscribe(subscriber) {
      if (destroyed) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener('change', onSystemChange);
      else mediaQuery?.removeListener?.(onSystemChange);
      eventTarget?.removeEventListener('storage', onStorageChange);
      subscribers.clear();
    }
  };
}

let browserAppearance;
export function getAppAppearance() {
  if (browserAppearance) return browserAppearance;
  let storage;
  try { storage = window.localStorage; } catch { /* Privacy modes may deny access. */ }
  browserAppearance = createAppearanceController({
    root: document.documentElement,
    themeColor: document.querySelector('meta[name="theme-color"]'),
    storage,
    mediaQuery: window.matchMedia?.('(prefers-color-scheme: dark)'),
    eventTarget: window
  });
  return browserAppearance;
}
