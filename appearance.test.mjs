import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  APPEARANCE_STORAGE_KEY, APPEARANCE_COLORS,
  readAppearancePreference, resolveAppearance, createAppearanceController
} from './appearance.mjs';

function eventSource() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event) { for (const listener of listeners.get(type) || []) listener(event); },
    listenerCount(type) { return listeners.get(type)?.size || 0; }
  };
}

function harness(saved, dark = false, overrides = {}) {
  const values = new Map(saved === undefined ? [] : [[APPEARANCE_STORAGE_KEY, saved]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), ...overrides.storage };
  const attributes = {}, metadata = {}, root = { style: {}, setAttribute: (key, value) => { attributes[key] = value; } };
  const mediaQuery = { ...eventSource(), matches: dark };
  const eventTarget = eventSource();
  const controller = createAppearanceController({ root, themeColor: { setAttribute: (key, value) => { metadata[key] = value; } }, storage, mediaQuery, eventTarget });
  return { controller, root, attributes, metadata, storage, values, mediaQuery, eventTarget,
    changeSystem(value) { mediaQuery.matches = value; mediaQuery.emit('change', { matches: value }); }
  };
}

// Default light is deliberate, even when the device is dark; unknown saved
// values must not produce an unstyled or unexpectedly dark page.
for (const saved of [undefined, '', 'unknown', 'LIGHT', '{}']) {
  const current = harness(saved, true);
  assert.equal(current.controller.preference, 'light');
  assert.equal(current.attributes['data-appearance'], 'light');
  assert.equal(current.root.style.colorScheme, 'light');
  assert.equal(current.metadata.content, '#FCFCFD');
  current.controller.destroy();
}
assert.equal(readAppearancePreference({ getItem() { throw new Error('denied'); } }), 'light');
assert.equal(readAppearancePreference(), 'light');
assert.equal(resolveAppearance('system', true), 'dark');
assert.equal(resolveAppearance('system', false), 'light');
assert.equal(resolveAppearance('light', true), 'light');
assert.equal(resolveAppearance('dark', false), 'dark');

// Choice applies immediately and survives creation of a new app instance.
const selected = harness();
for (const preference of ['dark', 'system', 'light']) {
  const result = selected.controller.setPreference(preference);
  assert.equal(result.persisted, true);
  assert.equal(selected.values.get(APPEARANCE_STORAGE_KEY), preference);
  const restored = harness(selected.values.get(APPEARANCE_STORAGE_KEY));
  assert.equal(restored.controller.preference, preference);
  assert.equal(restored.controller.appearance, selected.controller.appearance);
  restored.controller.destroy();
}
selected.controller.setPreference('dark');
assert.equal(selected.attributes['data-appearance'], 'dark');
assert.equal(selected.root.style.colorScheme, 'dark');
assert.equal(selected.metadata.content, APPEARANCE_COLORS.dark);
selected.changeSystem(false);
assert.equal(selected.controller.appearance, 'dark');
selected.controller.setPreference('light');
selected.changeSystem(true);
assert.equal(selected.controller.appearance, 'light');
selected.controller.setPreference('system');
assert.equal(selected.controller.appearance, 'dark');
selected.changeSystem(false);
assert.equal(selected.controller.appearance, 'light');
selected.changeSystem(true);
assert.equal(selected.metadata.content, '#111113');
assert.equal(selected.values.get(APPEARANCE_STORAGE_KEY), 'system');

// A blocked store still allows switching this page, with an honest failure
// result so the UI can explain that the choice will not survive a reload.
const blocked = harness(undefined, false, { storage: {
  getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }
} });
assert.equal(blocked.controller.setPreference('dark').persisted, false);
assert.equal(blocked.controller.appearance, 'dark');
blocked.controller.destroy();
const noStore = createAppearanceController();
assert.equal(noStore.setPreference('system').persisted, false);
assert.equal(noStore.appearance, 'light');
noStore.destroy();

// Other tabs stay consistent without touching card-theme storage or rewriting
// settings when the device switches its appearance.
const notifications = [];
const unsubscribe = selected.controller.subscribe(state => notifications.push(state));
selected.eventTarget.emit('storage', { key: 'wortwerk-card-theme-v1', newValue: 'dark' });
assert.equal(notifications.length, 0);
selected.eventTarget.emit('storage', { key: APPEARANCE_STORAGE_KEY, newValue: 'light', storageArea: {} });
assert.equal(notifications.length, 0);
selected.eventTarget.emit('storage', { key: APPEARANCE_STORAGE_KEY, newValue: 'light', storageArea: selected.storage });
assert.equal(selected.controller.appearance, 'light');
assert.equal(notifications.length, 1);
selected.eventTarget.emit('storage', { key: APPEARANCE_STORAGE_KEY, newValue: 'system' });
assert.equal(selected.controller.appearance, 'dark');
selected.eventTarget.emit('storage', { key: null, newValue: null });
assert.equal(selected.controller.preference, 'light');
unsubscribe();
selected.controller.setPreference('dark');
assert.equal(notifications.length, 3);

assert.equal(selected.mediaQuery.listenerCount('change'), 1);
assert.equal(selected.eventTarget.listenerCount('storage'), 1);
selected.controller.destroy();
selected.controller.destroy();
assert.equal(selected.mediaQuery.listenerCount('change'), 0);
assert.equal(selected.eventTarget.listenerCount('storage'), 0);
selected.changeSystem(false);
selected.eventTarget.emit('storage', { key: APPEARANCE_STORAGE_KEY, newValue: 'light' });
assert.equal(selected.controller.appearance, 'dark');
assert.equal(selected.controller.setPreference('light').persisted, false);
assert.equal(selected.controller.appearance, 'dark');

// Older WebKit exposes the legacy MediaQueryList listener methods.
let legacyListener, removedListener;
const legacyMedia = { matches: false, addListener(listener) { legacyListener = listener; }, removeListener(listener) { removedListener = listener; } };
const legacy = createAppearanceController({ storage: { getItem: () => 'system' }, mediaQuery: legacyMedia });
legacyMedia.matches = true;
legacyListener();
assert.equal(legacy.appearance, 'dark');
legacy.destroy();
assert.equal(removedListener, legacyListener);

// Execute the real pre-style bootstrap: auth, reloads and the app all agree on
// the very first surface, avoiding a white flash for a saved dark selection.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const bootstrap = html.match(/<script id="appearance-bootstrap">([\s\S]*?)<\/script>/)?.[1];
assert.ok(bootstrap);
assert.ok(html.indexOf('id="appearance-bootstrap"') < html.indexOf('href="app.css"'));
for (const saved of [undefined, 'light', 'dark', 'system', 'unknown']) {
  for (const dark of [false, true]) {
    const firstFrame = {}, meta = {}, storage = { getItem: () => saved ?? null };
    const root = { style: {}, setAttribute: (key, value) => { firstFrame[key] = value; } };
    runInNewContext(bootstrap, { localStorage: storage, window: { matchMedia: () => ({ matches: dark }) }, document: { documentElement: root, querySelector: () => ({ setAttribute: (key, value) => { meta[key] = value; } }) } });
    const expected = resolveAppearance(readAppearancePreference(storage), dark);
    assert.equal(firstFrame['data-appearance'], expected);
    assert.equal(root.style.colorScheme, expected);
    assert.equal(meta.content, APPEARANCE_COLORS[expected]);
  }
}

// Check the real app palette rather than a second copy of its colors. Card
// palettes deliberately have their own surface-aware checks in card-themes.
const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
function tokenDeclarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(block, `Missing appearance token block: ${selector}`);
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}
function resolveToken(tokens, name, ancestors = []) {
  assert.ok(!ancestors.includes(name), `Cyclic color alias: ${[...ancestors, name].join(' → ')}`);
  const value = tokens[name];
  assert.ok(value, `Missing color token ${name}`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolveToken(tokens, alias[1], [...ancestors, name]) : value;
}
function luminance(color) {
  const match = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  assert.ok(match, `Contrast check requires an opaque palette color, received ${color}`);
  const hex = match[1].length === 3 ? [...match[1]].map(value => value + value).join('') : match[1];
  const channels = [0, 2, 4].map(index => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
const lightTokens = tokenDeclarations(':root');
const palettes = {
  light: lightTokens,
  dark: { ...lightTokens, ...tokenDeclarations(':root[data-appearance="dark"]') }
};
const contrastFailures = [];
let contrastChecks = 0;
for (const [appearance, tokens] of Object.entries(palettes)) {
  const check = (foreground, background) => {
    const ratio = contrast(resolveToken(tokens, foreground), resolveToken(tokens, background));
    contrastChecks++;
    if (ratio < 4.5) contrastFailures.push(`${appearance}: ${foreground} on ${background} has ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
  };
  const surfaces = ['--background', '--surface', '--surface-raised', '--accent-subtle', '--accent-subtle-hover'];
  const textRoles = ['--text', '--muted', '--accent-text', '--success', '--danger', '--gender-masculine-dark-surface', '--gender-feminine-dark-surface'];
  for (const background of surfaces) for (const foreground of textRoles) check(foreground, background);
  check('--ink-on-accent', '--accent');
  check('--ink-on-accent', '--accent-hover');
  check('--danger', '--danger-surface');
  check('--danger', '--danger-hover');
  check('--warning', '--warning-surface');
}
assert.deepEqual(contrastFailures, [], `App palette contrast regressions:\n${contrastFailures.join('\n')}`);

console.log(`Appearance checks passed: default, persistence, storage failures, system changes, cross-tab updates, cleanup, first-frame restoration and ${contrastChecks} live CSS contrast pairs.`);
