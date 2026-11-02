'use strict';

const assert = require('node:assert/strict');
const { genderSegments } = require('./presentation.js');

function colored(value) {
  return genderSegments(value).filter(segment => segment.gender).map(segment => [segment.text, segment.gender]);
}

assert.deepEqual(colored('un château fort'), [['un', 'm']]);
assert.deepEqual(colored(' UNE   chaîne de télévision '), [['UNE', 'f']]);
assert.deepEqual(colored('le château ( M )'), [['( M )', 'm']]);
assert.deepEqual(colored('la cathédrale\t(f)'), [['(f)', 'f']]);
assert.deepEqual(colored('brun, commune, dunes'), []);
assert.deepEqual(colored('unité, lundi, uneville'), []);
assert.deepEqual(colored('Un château (m) et une maison ( F )'), [
  ['Un', 'm'], ['(m)', 'm'], ['une', 'f'], ['( F )', 'f']
]);
assert.equal(genderSegments('brun').map(part => part.text).join(''), 'brun');

console.log('Presentation tests passed');
