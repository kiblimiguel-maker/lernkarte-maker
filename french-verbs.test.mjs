import assert from 'node:assert/strict';
import model from './model.js';
import { frenchVerbCardMarkup } from './french-verb-card.mjs';
import {
  detectImportFormat,
  formatFrenchVerbSide,
  frenchVerbExample,
  frenchVerbPrompt,
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
assert.equal(detectImportFormat(`\uFEFF\r\n${frenchVerbExample}\u2028${vowel}`), 'french-verbs');
assert.equal(detectImportFormat(irregular), 'french-verbs');
assert.equal(detectImportFormat(frenchVerbExample.replace(' | couru', '')), 'french-verbs');
assert.equal(detectImportFormat(frenchVerbExample.replace(' | avoir | ', ' | aller | ')), 'french-verbs');
assert.equal(detectImportFormat(frenchVerbExample.replace(' | ils / elles courent', '')), 'french-verbs');
assert.equal(detectImportFormat('rennen | courir | cour- | avoir'), 'french-verbs');
assert.equal(detectImportFormat('viele Wörter = plusieurs mots ((mot | mots))'), 'vocabulary');
assert.equal(detectImportFormat(`Pipe-Syntax = ${frenchVerbExample}`), 'vocabulary');
assert.equal(detectImportFormat(frenchVerbExample.replace('je cours', 'je cours = ich renne')), 'french-verbs');
assert.equal(detectImportFormat('eins | zwei | drei | vier | fünf | sechs | sieben | acht | neun | zehn | elf'), null);
assert.equal(detectImportFormat('   \n'), null);
const mixedImport = `der Hund = le chien\n${frenchVerbExample}`;
assert.equal(detectImportFormat(mixedImport), 'french-verbs');
assert.equal(parseFrenchVerbImport(mixedImport).errors[0].line, 1);
const fence = '\x60'.repeat(3);
const fencedImport = `\n${fence}text\n${frenchVerbExample}\nfalsche Zeile\n${fence}\n`;
assert.equal(detectImportFormat(fencedImport), 'french-verbs');
assert.deepEqual(parseFrenchVerbImport(fencedImport), {
  rows: [{ ...rows[0], line: 3 }],
  errors: [{ line: 4, text: 'falsche Zeile', reason: 'Eine Verbzeile braucht elf Felder, getrennt durch |.' }],
});
assert.equal(parseFrenchVerbImport(`${fence}text\n${frenchVerbExample}`).errors[0].line, 1);

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

const lance = 'werfen | lancer | lanc- | avoir | lancé | lance | tu lances | il / elle / on lance | nous lançons | vous lancez | ils / elles lancent';
const inquieter = "beunruhigen | inquiéter | inquiét- | avoir | inquiété | m'inquiète | tu t'inquiètes | il / elle / on s'inquiète | nous nous inquiétons | vous vous inquiétez | ils / elles s'inquiètent";
const falloir = 'man muss | falloir | — | avoir | fallu | — | — | il faut | — | — | —';
const reportedRows = parseFrenchVerbImport(`${lance}\n${inquieter}\n${falloir}`);
assert.deepEqual(reportedRows.rows.map(row => row.line), [1, 3]);
assert.equal(parseFrenchVerbSide(reportedRows.rows[0].back).forms[0].pronoun, 'je');
assert.match(reportedRows.rows[0].back, /je lance/);
const impersonal = parseFrenchVerbSide(reportedRows.rows[1].back);
assert.deepEqual(impersonal.forms.map(({ pronoun, separator, form }) => pronoun + separator + form),
  ['—', '—', 'il faut', '—', '—', '—']);
assert.equal(formatFrenchVerbSide(impersonal), reportedRows.rows[1].back);
assert.match(frenchVerbCardMarkup(impersonal, 'man muss'), /il <strong>faut<\/strong>/);
assert.equal(detectImportFormat(falloir), 'french-verbs');
assert.equal(reportedRows.errors.length, 1);
assert.equal(reportedRows.errors[0].line, 2);
assert.match(reportedRows.errors[0].reason, /reflexiv/);
const corrected = reportedRows.errors[0].correction;
assert.equal(corrected, 'beunruhigen | inquiéter | inquiét- | avoir | inquiété | j’inquiète | tu inquiètes | il / elle / on inquiète | nous inquiétons | vous inquiétez | ils / elles inquiètent');
assert.equal(parseFrenchVerbImport([lance, corrected, falloir].join('\n')).rows.length, 3);
assert.equal(parseFrenchVerbImport(falloir.replace('il faut', 'il / elle / on faut')).errors.length, 1);
assert.equal(parseFrenchVerbImport(frenchVerbExample.replace('je cours', '—')).errors.length, 1);
assert.equal(parseFrenchVerbImport(frenchVerbExample.replace('je cours', 'je')).errors.length, 1);
assert.equal(parseFrenchVerbImport(frenchVerbExample.replace('je cours', 'tu cours')).errors.length, 1);
assert.equal(parseFrenchVerbImport(frenchVerbExample.replace('je cours', 'nicht angegeben')).errors.length, 1);
assert.match(parseFrenchVerbImport(vowel.replace('j’aime', 'aime')).rows[0].back, /j’aime/);
assert.match(parseFrenchVerbImport(reflexive.replace('je m’habille', 'm’habille')).rows[0].back, /je m’habille/);
assert.match(parseFrenchVerbImport(reflexive.replace('ÊTRE', 'avoir')).errors[0].correction, /s’habiller \| habill- \| être/);
assert.ok(frenchVerbPrompt.includes(falloir));
const pleuvoir = 'regnen | pleuvoir | — | avoir | plu | — | — | il pleut | — | — | —';
const listWithWeatherVerb = parseFrenchVerbImport([...Array(107).fill(frenchVerbExample), falloir, pleuvoir].join('\n'));
assert.equal(listWithWeatherVerb.rows.length, 109);
assert.deepEqual(listWithWeatherVerb.errors, []);
const weatherCard = listWithWeatherVerb.rows[108];
assert.equal(weatherCard.line, 109);
assert.equal(weatherCard.front, 'regnen');
assert.match(frenchVerbCardMarkup(parseFrenchVerbSide(weatherCard.back), 'regnen'), /il <strong>pleut<\/strong>/);
assert.deepEqual(parseFrenchVerbImport(pleuvoir.replaceAll('—', '−')).rows[0], { ...weatherCard, line: 1 });
assert.ok(frenchVerbPrompt.includes(pleuvoir));

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
