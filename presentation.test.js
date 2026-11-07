'use strict';

const assert = require('node:assert/strict');
const { genderSegments, colourInk, subjectSurface } = require('./presentation.js');

function colored(value) {
  return genderSegments(value).filter(segment => segment.gender).map(segment => [segment.text, segment.gender]);
}

assert.deepEqual(colored('un château fort'), [['un', 'm']]);
assert.deepEqual(colored('le livre'), [['le', 'm']]);
assert.deepEqual(colored(' UNE   chaîne de télévision '), [['UNE', 'f']]);
assert.deepEqual(colored('La    maison'), [['La', 'f']]);
assert.deepEqual(colored('le château ( M )'), [['le', 'm'], ['( M )', 'm']]);
assert.deepEqual(colored('la cathédrale\t(f)'), [['la', 'f'], ['(f)', 'f']]);
assert.deepEqual(colored('les bâtiments (m pl)'), [['(m pl)', 'm']]);
assert.deepEqual(colored('les maisons (f pl)'), [['(f pl)', 'f']]);
assert.deepEqual(colored('( M   PL ) employés / (f\u00a0pl) employées'), [
  ['( M   PL )', 'm'], ['(f\u00a0pl)', 'f']
]);
assert.deepEqual(colored('(m\tpl) livres / ( F PL ) voitures'), [
  ['(m\tpl)', 'm'], ['( F PL )', 'f']
]);
assert.deepEqual(colored('(m plan) (f plein) (mplus) (fpl) (pl) exemples'), []);
assert.deepEqual(colored('brun, commune, dunes, les livres, laque, leçon'), []);
assert.deepEqual(colored('unité, lundi, uneville, label'), []);
assert.deepEqual(colored('Le livre (m) et une maison ( F )'), [
  ['Le', 'm'], ['(m)', 'm'], ['une', 'f'], ['( F )', 'f']
]);
assert.equal(genderSegments('brun').map(part => part.text).join(''), 'brun');
for (const value of ['LE livre', 'la maison (f)', 'un chien et une voiture', 'les livres', 'les bâtiments (m pl)', '( F\u00a0 PL ) maisons / (m\tpl) bâtiments']) {
  assert.equal(genderSegments(value).map(part => part.text).join(''), value, `all source text is preserved: ${value}`);
}

assert.equal(colourInk('#FFFFFF'), '#000000');
assert.equal(colourInk('#000000'), '#FFFFFF');
assert.equal(colourInk('#fefefe'), '#000000');
assert.equal(colourInk('#00ff00'), '#000000');
assert.equal(colourInk('#757575'), '#FFFFFF');
assert.equal(colourInk('#767676'), '#000000');
assert.equal(colourInk('invalid'), colourInk('#3378F6'));
assert.equal(subjectSurface('#00F900'), '#387c38');
assert.equal(subjectSurface('#FF00FF'), '#7e3a7e');
assert.equal(subjectSurface('#0099FF'), '#3a627e');
for (const colour of ['#7895C8', '#729FAF', '#7EA590', '#B69871', '#A189BA', '#BA858E', '#000000', '#ffffff']) {
  assert.equal(subjectSurface(colour), colour);
}

function luminance(hex) {
  const channels = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
const samples = ['00', '20', '40', '60', '80', 'a0', 'c0', 'e0', 'ff'];
for (const red of samples) {
  for (const green of samples) {
    for (const blue of samples) {
      const colour = `#${red}${green}${blue}`;
      const surface = subjectSurface(colour);
      assert.match(surface, /^#[0-9a-f]{6}$/i);
      const background = luminance(surface), ink = luminance(colourInk(surface));
      assert.ok((Math.max(background,ink)+.05)/(Math.min(background,ink)+.05)>=4.5, `readable ink on ${surface} from ${colour}`);
    }
  }
}
console.log('Presentation tests passed');
