(() => {
  'use strict';

  const STORAGE_KEY = 'wortwerk-card-theme-v1';
  const DEFAULT_THEME_ID = 'graphite';

  // Card surfaces use the exact reference colors. Text and gender markers are
  // chosen per surface so that the cards remain readable in every palette.
  const themes = [
    {
      id: 'graphite',
      name: 'Graphite',
      description: 'Graphit und gedämpftes Schieferblau',
      front: {
        surface: '#242A33', text: '#F2F5FA', muted: '#BAC5D5', border: '#465262',
        'gender-masculine': '#8DBDFF', 'gender-feminine': '#FF8E9E'
      },
      back: {
        surface: '#26344A', text: '#F2F5FA', muted: '#BAC5D5', border: '#4D6181',
        'gender-masculine': '#8DBDFF', 'gender-feminine': '#FF8E9E'
      }
    },
    {
      id: 'wortwerk-original',
      name: 'Original',
      description: 'Das ursprüngliche helle Kartendesign',
      front: {
        surface: '#DDE3EA', text: '#0B0D10', muted: '#0B0D10', border: '#C6D0D6',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      },
      back: {
        surface: '#EAF2F8', text: '#0B0D10', muted: '#0B0D10', border: '#C6D0D6',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'ultra-violet-soft-apricot',
      name: 'Ultra Violet · Soft Apricot',
      description: 'Violett und warmes Apricot',
      front: {
        surface: '#6A00F4', text: '#FFFFFF', muted: '#FFFFFF', border: '#8A3BEA',
        'gender-masculine': '#B7DAFF', 'gender-feminine': '#FFC2C9'
      },
      back: {
        surface: '#FFD6A5', text: '#0B0D10', muted: '#0B0D10', border: '#E7BD86',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'sky-mint-graphite',
      name: 'Sky Mint · Graphite',
      description: 'Helles Mint und tiefes Graphit',
      front: {
        surface: '#B8F7E4', text: '#0B0D10', muted: '#0B0D10', border: '#91DDC8',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      },
      back: {
        surface: '#25272C', text: '#FFFFFF', muted: '#FFFFFF', border: '#414950',
        'gender-masculine': '#4DA3FF', 'gender-feminine': '#FF6275'
      }
    },
    {
      id: 'ion-blue-drift-silver',
      name: 'Ion Blue · Drift Silver',
      description: 'Klares Blau und kühles Silber',
      front: {
        surface: '#4FC3F7', text: '#0B0D10', muted: '#0B0D10', border: '#31A9E1',
        'gender-masculine': '#004580', 'gender-feminine': '#8B142D'
      },
      back: {
        surface: '#DDE3EA', text: '#0B0D10', muted: '#0B0D10', border: '#C6D0D6',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'plasma-magenta-core-black',
      name: 'Plasma Magenta · Core Black',
      description: 'Leuchtendes Magenta und tiefes Schwarz',
      front: {
        surface: '#E445FF', text: '#0B0D10', muted: '#0B0D10', border: '#C82FE1',
        'gender-masculine': '#001A69', 'gender-feminine': '#500016'
      },
      back: {
        surface: '#141418', text: '#FFFFFF', muted: '#FFFFFF', border: '#34343B',
        'gender-masculine': '#66B7FF', 'gender-feminine': '#FF7086'
      }
    },
    {
      id: 'lunar-navy-pearl-silver',
      name: 'Lunar Navy · Pearl Silver',
      description: 'Nächtliches Marineblau und sanftes Silber',
      front: {
        surface: '#111827', text: '#FFFFFF', muted: '#FFFFFF', border: '#30394A',
        'gender-masculine': '#66B7FF', 'gender-feminine': '#FF7086'
      },
      back: {
        surface: '#E7E5E0', text: '#0B0D10', muted: '#0B0D10', border: '#D0CDC7',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'tide-teal-mist-gray',
      name: 'Tide Teal · Mist Gray',
      description: 'Ruhiges Teal und kühles Nebelgrau',
      front: {
        surface: '#5FA6A6', text: '#0B0D10', muted: '#0B0D10', border: '#4B9292',
        'gender-masculine': '#001F80', 'gender-feminine': '#63001A'
      },
      back: {
        surface: '#E6EBEA', text: '#0B0D10', muted: '#0B0D10', border: '#CFD6D5',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'muted-blush-clay-beige',
      name: 'Muted Blush · Clay Beige',
      description: 'Gedämpftes Rosé und warmes Beige',
      front: {
        surface: '#D8A7A9', text: '#0B0D10', muted: '#0B0D10', border: '#C49396',
        'gender-masculine': '#0B3D75', 'gender-feminine': '#820026'
      },
      back: {
        surface: '#E6D7C8', text: '#0B0D10', muted: '#0B0D10', border: '#D2C1B0',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'soft-lavender-stone-gray',
      name: 'Soft Lavender · Stone Gray',
      description: 'Sanftes Lavendel und helles Steingrau',
      front: {
        surface: '#B5A8B8', text: '#0B0D10', muted: '#0B0D10', border: '#A295A5',
        'gender-masculine': '#0B3671', 'gender-feminine': '#76001F'
      },
      back: {
        surface: '#E3E0DB', text: '#0B0D10', muted: '#0B0D10', border: '#CECBC6',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    },
    {
      id: 'burnt-umber-sand-light',
      name: 'Burnt Umber · Sand Light',
      description: 'Warmes Umbra und heller Sand',
      front: {
        surface: '#7A3E2D', text: '#FFFFFF', muted: '#FFFFFF', border: '#965744',
        'gender-masculine': '#A0D1FF', 'gender-feminine': '#FFB4BF'
      },
      back: {
        surface: '#E6D3B1', text: '#0B0D10', muted: '#0B0D10', border: '#D3BE98',
        'gender-masculine': '#0057B8', 'gender-feminine': '#B00020'
      }
    }
  ];

  const getTheme = id => themes.find(theme => theme.id === id) || themes.find(theme => theme.id === DEFAULT_THEME_ID);

  // A set may override the card design without changing the user's global
  // preference. Old sets and unknown future values inherit the global design.
  function resolveSetThemeId(set, globalThemeId) {
    const override = themes.find(theme => theme.id === set?.cardThemeId);
    return (override || getTheme(globalThemeId)).id;
  }

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

  const api = { STORAGE_KEY, DEFAULT_THEME_ID, themes, getTheme, resolveSetThemeId, readThemeId, applyTheme, saveTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkCardThemes = api;
})();
