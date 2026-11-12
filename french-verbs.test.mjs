import assert from 'node:assert/strict';
import model from './model.js';
import { frenchVerbCardMarkup } from './french-verb-card.mjs';
import {
  formatFrenchVerbSide,
  frenchVerbExample,
  parseFrenchVerbImport,
  parseFrenchVerbSide,
  validateFrenchVerbSide,
} from './french-verbs.mjs';

const courir = {
  infinitive: 'courir', stem: 'cour-', auxiliary: 'avoir', participle: 'couru',
  forms: [
    { pronoun: 'je', separator: ' ', form: 'cours' },
    { pronoun: 'tu', separator: ' ', form: 'cours' },
    { pronoun: 'il / elle / on', separator: ' ', form: 'court' },
    { pronoun: 'nous', separator: ' ', form: 'courons' },
    { pronoun: 'vous', separator: ' ', form: 'courez' },
    { pronoun: 'ils / elles', separator: ' ', form: 'courent' },
  ],
};

const { rows, errors } = parseFrenchVerbImport(frenchVerbExample);
const courirFields = frenchVerbExample.slice(frenchVerbExample.indexOf('|') + 1).trim();
assert.deepEqual(errors, []);
assert.equal(rows[0].front, 'rennen / laufen');
assert.equal(rows[0].back, `@fr-verb:1 ${courirFields}`);
assert.deepEqual(parseFrenchVerbSide(rows[0].back), courir);
assert.equal(parseFrenchVerbSide(courirFields), null);
assert.deepEqual(validateFrenchVerbSide(courirFields).verb, courir);

const irregular = 'ausgehen | sortir || ÊTRE/AVOIR | sorti | je\u00a0sors | tu sors | il/elle/on sort | nous sortons | vous sortez | ils/elles sortent';
const reflexive = 'sich anziehen | s’habiller | habill- | ÊTRE | habillé | je m’habille | tu t’habilles | elle s’habille | nous nous habillons | vous vous habillez | elles s’habillent';
const vowel = 'lieben | aimer | aim- | avoir | aimé | j’aime | tu aimes | il aime | nous aimons | vous aimez | ils aiment';
const multiple = parseFrenchVerbImport(`\uFEFF${irregular}\r\n\u2028${reflexive}\u2029${vowel}`);
assert.deepEqual(multiple.errors, []);
assert.deepEqual(multiple.rows.map(row => [row.line, row.front]), [[1, 'ausgehen'], [3, 'sich anziehen'], [4, 'lieben']]);
const sortir = parseFrenchVerbSide(multiple.rows[0].back);
assert.equal(sortir.stem, '');
assert.equal(sortir.auxiliary, 'avoir / être');
assert.equal(sortir.forms[2].pronoun, 'il / elle / on');
assert.equal(formatFrenchVerbSide(sortir), multiple.rows[0].back);
const habiller = parseFrenchVerbSide(multiple.rows[1].back);
assert.equal(habiller.infinitive, 's’habiller');
assert.equal(habiller.auxiliary, 'être');
assert.equal(habiller.forms[3].form, 'nous habillons');
const aimer = parseFrenchVerbSide(multiple.rows[2].back);
assert.deepEqual(aimer.forms[0], { pronoun: 'j’', separator: '', form: 'aime' });
assert.deepEqual(parseFrenchVerbSide(multiple.rows[2].back.replace('j’aime', "j'aime")).forms[0], {
  pronoun: "j'", separator: '', form: 'aime',
});

const invalid = parseFrenchVerbImport([
  '  der Hund = le chien  ',
  frenchVerbExample.replace('rennen / laufen', ''),
  frenchVerbExample.replace(' | avoir | ', ' | aller | '),
  frenchVerbExample.replace(' | couru | ', ' | | '),
  frenchVerbExample.replace(' | vous courez | ', ' | tu cours | '),
  frenchVerbExample,
].join('\n'));
assert.equal(invalid.errors[0].text, '  der Hund = le chien  ');
assert.deepEqual(invalid.errors.map(({ line }) => line), [1, 2, 3, 4, 5]);
assert.match(invalid.errors[2].reason, /Hilfsverb/);
assert.match(invalid.errors[4].reason, /vous/);
assert.equal(invalid.rows[0].line, 6);
assert.deepEqual(parseFrenchVerbImport('  \n'), { rows: [], errors: [] });
assert.match(validateFrenchVerbSide(courirFields.replace('je cours', 'je')).reason, /je/);
assert.equal(parseFrenchVerbSide('le chien | un animal'), null);
assert.equal(parseFrenchVerbSide('un | deux | trois | quatre | cinq | six | sept | huit | neuf | dix'), null);
assert.equal(parseFrenchVerbSide(rows[0].back.replace('il / elle / on court', '\nil / elle / on court')), null);

const timestamp = '2026-11-12T12:00:00.000Z';
const [imported] = model.createImportedCards(rows, { setId: 'source', position: 0, timestamp, createId: () => 'original' });
const [copied] = model.createCopiedCards([imported], { setId: 'copy', timestamp, createId: () => 'copied' });
model.swapSetCardSides([imported, copied], 'copy', timestamp);
assert.deepEqual(parseFrenchVerbSide(imported.back), courir);
assert.deepEqual(parseFrenchVerbSide(copied.front), courir);
assert.equal(copied.back, 'rennen / laufen');

const markup = frenchVerbCardMarkup(courir, 'rennen / <laufen>');
assert.ok(markup.includes('<strong>rennen / &lt;laufen&gt;</strong>'));
assert.ok(markup.includes('je <strong>cours</strong></span><span role="cell">nous <strong>courons</strong>'));
assert.ok(markup.includes('il / elle / on <strong>court</strong></span><span role="cell">ils / elles <strong>courent</strong>'));

console.log('French verb import tests passed');
