'use strict';

const assert = require('node:assert/strict');
const { themes, DEFAULT_THEME_ID, readThemeId, saveTheme, applyTheme } = require('./card-themes.js');

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

assert.equal(themes.length, 4, 'the original design and all three reference palettes are available');
assert.equal(themes[0].id, DEFAULT_THEME_ID, 'the original design is the default');
assert.deepEqual(themes.map(theme => [theme.front.surface, theme.back.surface]), [
  ['#DDE3EA', '#EAF2F8'],
  ['#6A00F4', '#FFD6A5'],
  ['#B8F7E4', '#25272C'],
  ['#4FC3F7', '#DDE3EA']
]);

for (const theme of themes) {
  for (const side of ['front', 'back']) {
    const face = theme[side];
    assert.ok(['#0B0D10', '#FFFFFF'].includes(face.text), `${theme.name} ${side} uses black or white text`);
    assert.equal(face.muted, face.text, `${theme.name} ${side} supporting text keeps the same high-contrast color`);
    assert.ok(contrast(face.surface, face.text) >= 4.5, `${theme.name} ${side} text has readable contrast`);
    assert.ok(contrast(face.surface, face.muted) >= 4.5, `${theme.name} ${side} supporting text has readable contrast`);
    assert.ok(contrast(face.surface, face['gender-masculine']) >= 4.5, `${theme.name} ${side} masculine marker has readable contrast`);
    assert.ok(contrast(face.surface, face['gender-feminine']) >= 4.5, `${theme.name} ${side} feminine marker has readable contrast`);
  }
}

const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); }
};
assert.equal(readThemeId(storage), DEFAULT_THEME_ID, 'missing preference uses the established default');
const saved = saveTheme(themes[0].id, storage);
assert.equal(saved.persisted, true);
assert.equal(readThemeId(storage), themes[0].id, 'selection survives reloading from storage');
assert.equal(readThemeId({ getItem: () => 'unknown-theme' }), DEFAULT_THEME_ID, 'invalid saved value safely falls back');

const applied = new Map();
const root = { dataset: {}, style: { setProperty(key, value) { applied.set(key, value); } } };
assert.equal(applyTheme(themes[1].id, root), themes[1].id);
assert.equal(root.dataset.cardTheme, themes[1].id);
assert.equal(applied.get('--study-front-surface'), '#6A00F4');
assert.equal(applied.get('--study-back-gender-feminine'), '#84162E');

console.log('Card theme tests passed');
