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

function hueAndSaturation(hex) {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255);
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { hue, saturation };
}

assert.equal(themes.length, 10, 'the original design, existing palettes, and all six attached palettes are available');
assert.equal(themes[0].id, DEFAULT_THEME_ID, 'the original design is the default');
assert.deepEqual(themes.map(theme => [theme.front.surface, theme.back.surface]), [
  ['#DDE3EA', '#EAF2F8'],
  ['#6A00F4', '#FFD6A5'],
  ['#B8F7E4', '#25272C'],
  ['#4FC3F7', '#DDE3EA'],
  ['#E445FF', '#141418'],
  ['#111827', '#E7E5E0'],
  ['#5FA6A6', '#E6EBEA'],
  ['#D8A7A9', '#E6D7C8'],
  ['#B5A8B8', '#E3E0DB'],
  ['#7A3E2D', '#E6D3B1']
]);

for (const theme of themes) {
  for (const side of ['front', 'back']) {
    const face = theme[side];
    assert.ok(['#0B0D10', '#FFFFFF'].includes(face.text), `${theme.name} ${side} uses black or white text`);
    assert.equal(face.muted, face.text, `${theme.name} ${side} supporting text keeps the same high-contrast color`);
    assert.ok(contrast(face.surface, face.text) >= 4.5, `${theme.name} ${side} text has readable contrast`);
    assert.ok(contrast(face.surface, face.muted) >= 4.5, `${theme.name} ${side} supporting text has readable contrast`);
    const largeBoldTextMinimum = 3;
    assert.ok(contrast(face.surface, face['gender-masculine']) >= largeBoldTextMinimum, `${theme.name} ${side} masculine marker has readable contrast`);
    assert.ok(contrast(face.surface, face['gender-feminine']) >= largeBoldTextMinimum, `${theme.name} ${side} feminine marker has readable contrast`);
    const blue = hueAndSaturation(face['gender-masculine']);
    const red = hueAndSaturation(face['gender-feminine']);
    assert.ok(blue.hue >= 195 && blue.hue <= 240 && blue.saturation >= 0.7, `${theme.name} ${side} masculine marker remains vivid blue`);
    assert.ok((red.hue >= 340 || red.hue <= 15) && red.saturation >= 0.7, `${theme.name} ${side} feminine marker remains vivid red`);
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
assert.equal(applied.get('--study-back-gender-feminine'), '#B00020');

console.log('Card theme tests passed');
