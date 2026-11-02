'use strict';

const assert = require('node:assert/strict');
const { genderSegments } = require('./presentation.js');

function colored(value) {
  return genderSegments(value).filter(segment => segment.gender).map(segment => [segment.text, segment.gender]);
}

assert.deepEqual(colored('un château fort'), [['un', 'm']]);
assert.deepEqual(colored('le livre'), [['le', 'm']]);
assert.deepEqual(colored(' UNE   chaîne de télévision '), [['UNE', 'f']]);
assert.deepEqual(colored('La    maison'), [['La', 'f']]);
assert.deepEqual(colored('le château ( M )'), [['le', 'm'], ['( M )', 'm']]);
assert.deepEqual(colored('la cathédrale\t(f)'), [['la', 'f'], ['(f)', 'f']]);
assert.deepEqual(colored('brun, commune, dunes, les livres, laque, leçon'), []);
assert.deepEqual(colored('unité, lundi, uneville, label'), []);
assert.deepEqual(colored('Le livre (m) et une maison ( F )'), [
  ['Le', 'm'], ['(m)', 'm'], ['une', 'f'], ['( F )', 'f']
]);
assert.equal(genderSegments('brun').map(part => part.text).join(''), 'brun');
for (const value of ['LE livre', 'la maison (f)', 'un chien et une voiture', 'les livres']) {
  assert.equal(genderSegments(value).map(part => part.text).join(''), value, `all source text is preserved: ${value}`);
}

console.log('Presentation tests passed');
