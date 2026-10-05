'use strict';

const assert = require('node:assert/strict');
const { parseImport } = require('./parser.js');

function oneCard(input, front, back) {
  const result = parseImport(input);
  assert.equal(result.errors.length, 0, input);
  assert.equal(result.rows.length, 1, input);
  assert.equal(result.rows[0].front, front, input);
  assert.equal(result.rows[0].back, back, input);
}

// Prompt tests 1–12: equals delimiter, whitespace, list markers, and first-equals behavior.
oneCard('das Haus = la maison', 'das Haus', 'la maison');
oneCard('das Haus=la maison', 'das Haus', 'la maison');
oneCard('das Haus   =   la maison', 'das Haus', 'la maison');
oneCard('1. das Haus = la maison', 'das Haus', 'la maison');
oneCard('01. das Haus = la maison', 'das Haus', 'la maison');
oneCard('1) das Haus = la maison', 'das Haus', 'la maison');
oneCard('01) das Haus = la maison', 'das Haus', 'la maison');
oneCard('- das Haus = la maison', 'das Haus', 'la maison');
oneCard('  • das Haus = la maison', 'das Haus', 'la maison');
oneCard('\t1.\tdas Haus\t=\tla maison', 'das Haus', 'la maison');
oneCard('☐ das Haus = la maison', 'das Haus', 'la maison');
oneCard('— das Haus = la maison', 'das Haus', 'la maison');
oneCard('das Haus = la maison = Zusatzinformation', 'das Haus', 'la maison = Zusatzinformation');
oneCard('x = y = z', 'x', 'y = z');
oneCard('\uFEFF1. déjà vu = schon gesehen', 'déjà vu', 'schon gesehen');

const invalid = parseImport([
  'der Hund',
  '= la maison',
  'das Haus =',
  '=',
  '   =',
  '=    '
].join('\n'));
assert.deepEqual(invalid.errors.map(error => error.reason), [
  "Kein '=' gefunden",
  'Vorderseite fehlt',
  'Rückseite fehlt',
  'Vorderseite und Rückseite fehlen',
  'Vorderseite fehlt',
  'Rückseite fehlt'
]);
assert.equal(invalid.errors[0].text, 'der Hund');
const spacedError = parseImport('  kaputte Zeile  ');
assert.equal(spacedError.errors[0].text, '  kaputte Zeile  ', 'invalid input is preserved exactly');

const threeCards = parseImport('das Haus = la maison\n\nder Hund = le chien\n  \ndie Katze = le chat');
assert.equal(threeCards.rows.length, 3);
assert.equal(threeCards.errors.length, 0);

const unicodeLines = parseImport('Straße = rue\u2028Größe = taille\u2029Herz = cœur');
assert.deepEqual(unicodeLines.rows.map(({ front, back }) => [front, back]), [
  ['Straße', 'rue'], ['Größe', 'taille'], ['Herz', 'cœur']
]);
assert.equal(unicodeLines.errors.length, 0);

const malformedInBetween = parseImport('gut = bon\nZeile ohne Trennzeichen\nauch gut = aussi bon');
assert.equal(malformedInBetween.rows.length, 2);
assert.equal(malformedInBetween.errors.length, 1);
assert.equal(malformedInBetween.errors[0].line, 2);
assert.equal(malformedInBetween.errors[0].text, 'Zeile ohne Trennzeichen');

const french = `eine (Land)Straße = une route
auf dem Weg nach/in …; auf nach/in … = en route pour…
das Elsass = l’Alsace (f.)
eine Kathedrale = une cathédrale
ein Vertreter/eine Vertreterin; ein Repräsentant/eine Repräsentantin = un représentant/une représentante
ein Land = un pays
europäisch = européen/européenne
sich versammeln = se réunir`;
const importedFrench = parseImport(french);
assert.equal(importedFrench.rows.length, 8);
assert.equal(importedFrench.errors.length, 0);
assert.deepEqual(importedFrench.rows.map(({ front, back }) => [front, back]), [
  ['eine (Land)Straße', 'une route'],
  ['auf dem Weg nach/in …; auf nach/in …', 'en route pour…'],
  ['das Elsass', 'l’Alsace (f.)'],
  ['eine Kathedrale', 'une cathédrale'],
  ['ein Vertreter/eine Vertreterin; ein Repräsentant/eine Repräsentantin', 'un représentant/une représentante'],
  ['ein Land', 'un pays'],
  ['europäisch', 'européen/européenne'],
  ['sich versammeln', 'se réunir']
]);

const thousandCards = parseImport(Array.from({ length: 1000 }, (_, i) => `${i + 1}. Term ${i} = Definition ${i}`).join('\n'));
assert.equal(thousandCards.rows.length, 1000);
assert.equal(thousandCards.rows[999].front, 'Term 999');

const largeImport = parseImport(Array.from({ length: 5000 }, (_, i) => `${i + 1}. ${french.split('\n')[i % 8]}`).join('\r\n'));
assert.equal(largeImport.rows.length, 5000);
assert.equal(largeImport.errors.length, 0);
assert.deepEqual([largeImport.rows[0].front, largeImport.rows[0].back], ['eine (Land)Straße', 'une route']);
assert.deepEqual([largeImport.rows[4999].front, largeImport.rows[4999].back], ['sich versammeln', 'se réunir']);

const veryLargeImport = parseImport(Array.from({ length: 50000 }, (_, i) => `  ${i + 1}. Wort ${i} = traduction ${i} = Zusatz`).join('\n'));
assert.equal(veryLargeImport.rows.length, 50000);
assert.equal(veryLargeImport.errors.length, 0);
assert.deepEqual([veryLargeImport.rows[49999].front, veryLargeImport.rows[49999].back], ['Wort 49999', 'traduction 49999 = Zusatz']);

console.log('Parser checks passed: delimiter and Unicode edge cases, preserved error rows, exact French import, and 50,000-card input.');
