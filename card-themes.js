(() => {
  'use strict';

  const STORAGE_KEY = 'wortwerk-card-theme-v1';
  const DEFAULT_THEME_ID = 'ion-blue-drift-silver';

  // Card surfaces use the exact reference colors. Text and gender markers are
  // chosen per surface so that the cards remain readable in every palette.
  const themes = [
    {
      id: 'ultra-violet-soft-apricot',
      name: 'Ultra Violet · Soft Apricot',
      description: 'Violett und warmes Apricot',
      front: {
        surface: '#6A00F4', text: '#FFD6A5', muted: '#E7C6F8', border: '#8A3BEA',
        'gender-masculine': '#A8D9FF', 'gender-feminine': '#FFC0C8'
      },
      back: {
        surface: '#FFD6A5', text: '#6A00F4', muted: '#60467B', border: '#E7BD86',
        'gender-masculine': '#063D6B', 'gender-feminine': '#84162E'
      }
    },
    {
      id: 'sky-mint-graphite',
      name: 'Sky Mint · Graphite',
      description: 'Helles Mint und tiefes Graphit',
      front: {
        surface: '#B8F7E4', text: '#25272C', muted: '#526A63', border: '#91DDC8',
        'gender-masculine': '#063D6B', 'gender-feminine': '#84162E'
      },
      back: {
        surface: '#25272C', text: '#B8F7E4', muted: '#A2CFC2', border: '#414950',
        'gender-masculine': '#A8D9FF', 'gender-feminine': '#FFC0C8'
      }
    },
    {
      id: 'ion-blue-drift-silver',
      name: 'Ion Blue · Drift Silver',
      description: 'Klares Blau und kühles Silber',
      front: {
        surface: '#4FC3F7', text: '#25272C', muted: '#244456', border: '#31A9E1',
        'gender-masculine': '#063D6B', 'gender-feminine': '#84162E'
      },
      back: {
        surface: '#DDE3EA', text: '#176A8F', muted: '#52636D', border: '#C6D0D6',
        'gender-masculine': '#063D6B', 'gender-feminine': '#84162E'
      }
    }
  ];

  const getTheme = id => themes.find(theme => theme.id === id) || themes.find(theme => theme.id === DEFAULT_THEME_ID);

  function storageOrDefault(storage) {
    if (storage) return storage;
    try { return globalThis.localStorage; } catch { return null; }
  }

  function readThemeId(storage) {
    try {
      const stored = storageOrDefault(storage)?.getItem(STORAGE_KEY);
      return themes.some(theme => theme.id === stored) ? stored : DEFAULT_THEME_ID;
    } catch {
      return DEFAULT_THEME_ID;
    }
  }

  function applyTheme(id, root = globalThis.document?.documentElement) {
    const theme = getTheme(id);
    if (!root) return theme.id;
    root.dataset.cardTheme = theme.id;
    for (const side of ['front', 'back']) {
      for (const [token, value] of Object.entries(theme[side])) {
        root.style.setProperty(`--study-${side}-${token}`, value);
      }
    }
    return theme.id;
  }

  function saveTheme(id, storage) {
    const theme = themes.find(candidate => candidate.id === id);
    if (!theme) return { theme: getTheme(DEFAULT_THEME_ID), persisted: false };
    let persisted = false;
    try {
      storageOrDefault(storage)?.setItem(STORAGE_KEY, theme.id);
      persisted = Boolean(storageOrDefault(storage));
    } catch {
      persisted = false;
    }
    return { theme, persisted };
  }

  const api = { STORAGE_KEY, DEFAULT_THEME_ID, themes, getTheme, readThemeId, applyTheme, saveTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkCardThemes = api;
})();
