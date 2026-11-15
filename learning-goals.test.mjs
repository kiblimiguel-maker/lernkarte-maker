import assert from 'node:assert/strict';
import parser from './parser.js';
import model from './model.js';
import { learningGoalImportExample, learningGoalPrompt } from './import-guide.mjs';
import {
  detectLearningGoalImport,
  formatLearningGoalBullets,
  parseLearningGoalBullets,
  parseLearningGoalImport,
} from './learning-goals.mjs';

const { parseImport } = parser;
const first = 'Wasser verdunstet von Seen, Flüssen und Meeren.';
const second = 'Wasserdampf kondensiert und bildet Wolken.';
const third = 'Niederschlag gelangt in Gewässer oder versickert im Boden.';
const { rows: [exampleCard], errors: exampleErrors } = parseLearningGoalImport(learningGoalImportExample, parseImport);
assert.deepEqual(exampleErrors, []);
assert.equal(exampleCard.front, 'Erkläre den Wasserkreislauf.');
assert.equal(exampleCard.requireBullets, true);
assert.equal(exampleCard.back, formatLearningGoalBullets([first, second, third]));
assert.deepEqual(parseLearningGoalBullets(exampleCard.back), [first, second, third]);
assert.ok(learningGoalPrompt.endsWith(learningGoalImportExample));
assert.ok(detectLearningGoalImport(learningGoalImportExample));
const storedCards = model.createImportedCards([exampleCard], {
  setId: 'geography',
  position: 0,
  timestamp: '2026-11-15T00:00:00Z',
  createId: () => 'water-cycle',
});
const [restoredCard] = model.normalizeLibrary({ cards: JSON.parse(JSON.stringify(storedCards)) }).cards;
assert.equal(restoredCard.front, exampleCard.front);
assert.deepEqual(parseLearningGoalBullets(restoredCard.back), [first, second, third]);
assert.ok(!Object.hasOwn(restoredCard, 'requireBullets'));


assert.deepEqual(parseLearningGoalBullets('• erster Punkt • zweiter Punkt'), ['erster Punkt', 'zweiter Punkt']);
assert.deepEqual(parseLearningGoalBullets('• einziger Punkt'), ['einziger Punkt']);
assert.deepEqual(parseLearningGoalBullets('- erster Punkt\r\n\r\n– zweiter Punkt\u2028* dritter Punkt'), ['erster Punkt', 'zweiter Punkt', 'dritter Punkt']);
assert.deepEqual(parseLearningGoalBullets('• erster Punkt\n• zweiter Punkt • dritter Punkt'), ['erster Punkt', 'zweiter Punkt', 'dritter Punkt']);
for (const answer of ['', '•', '• •', '• erster Punkt •', '•• erster Punkt', '• erster Punkt • • dritter Punkt', '• erster Punkt\n•', '• erster Punkt\n• •', '• erster Punkt\n•• dritter Punkt', '• erster Punkt •\n• dritter Punkt', '- • erster Punkt\n- zweiter Punkt', '• erster Punkt\nProsa', '- 10 °C', 'A • B', 'Text ohne Aufzählung', 'x = y']) {
  assert.equal(parseLearningGoalBullets(answer), null, answer);
}

const regular = 'Rechnung = 3 • 4 = 12';
const vocabulary = 'ein Museum = un musée ((Je visite le musée.))';
const scientific = 'Nenne zwei Beziehungen. = • A = 1 • B enthält ((Zusatz))';
const invalid = 'Lernziel = • Ein Punkt •';
const pasted = `\uFEFF${learningGoalImportExample}\r\n${regular}\u2028${vocabulary}\n\n${invalid}\n${scientific}\nOhne Trennzeichen`;
assert.equal(detectLearningGoalImport(regular), false);
assert.equal(detectLearningGoalImport(invalid), true);
assert.equal(detectLearningGoalImport('ein Museum ((Satz • Satz)) = un musée'), false);
const mixed = parseLearningGoalImport(pasted, parseImport, { requireBullets: false });
assert.deepEqual(mixed.rows.map(row => row.line), [1, 2, 3, 6]);
assert.equal(mixed.rows[1].back, '3 • 4 = 12');
assert.equal(mixed.rows[2].backExampleSentence, 'Je visite le musée.');
assert.deepEqual(mixed.rows[3], { line: 6, front: 'Nenne zwei Beziehungen.', back: '• A = 1\n• B enthält ((Zusatz))', requireBullets: true });
assert.deepEqual(mixed.errors.map(error => error.line), [5, 7]);

const explicit = parseLearningGoalImport(`${regular}\n\n${learningGoalImportExample}\n${invalid}`, parseImport);
assert.deepEqual(explicit.rows.map(row => row.line), [3]);
assert.deepEqual(explicit.errors.map(error => error.line), [1, 4]);

console.log('Learning goal checks passed: import, editable bullets, mixed cards and malformed lists.');
