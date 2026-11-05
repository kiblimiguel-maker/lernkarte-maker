'use strict';

const assert = require('node:assert/strict');
const {
  createStudySession, shuffleStudyCards, getStudyCard, getStudyResult,
  getStudyResults, getStudyCurrentIndex, getNextStudyCardId,
  navigateStudySession, setStudyAnswer, updateCardAnswer, summarizeResults
} = require('./model.js');

const makeCards = () => Array.from({ length: 5 }, (_, index) => ({
  id: `mix-${index + 1}`, setId: 'mix-set', position: index,
  front: `Begriff ${index + 1}`, back: `un mot ${index + 1}`,
  correctCount: 0, incorrectCount: 0, attemptCount: 0
}));
const ids = session => session.cards.map(card => card.id);
const rate = (session, cardId, answer) => {
  const card = getStudyCard(session, cardId);
  const previous = getStudyResult(session, cardId);
  updateCardAnswer(card, previous, answer, '2026-11-05T12:00:00.000Z');
  setStudyAnswer(session, cardId, answer);
};
const savedRecord = session => ({
  id: session.id, setId: session.setId, startedAt: session.startedAt,
  cardIds: ids(session), results: getStudyResults(session),
  resultsByCardId: { ...session.resultsByCardId },
  historyCardIds: session.historyCardIds.slice(), historyIndex: session.historyIndex,
  currentCardId: session.currentCardId, index: getStudyCurrentIndex(session),
  shuffleRemainingCardIds: session.shuffleRemainingCardIds.slice()
});

const source = makeCards();
const session = createStudySession(source);
rate(session, 'mix-1', true);
navigateStudySession(session, 1);
rate(session, 'mix-2', false);
const oldCurrent = session.currentCardId;
const beforeCards = JSON.stringify(source);
const beforeRatings = { ...session.resultsByCardId };
assert.equal(shuffleStudyCards(session, () => 0), true);
assert.notEqual(session.currentCardId, oldCurrent, 'the currently displayed card participates in the mix');
assert.equal(session.currentCardId, ids(session)[0], 'mix opens the first card of its new order');
assert.deepEqual(ids(session).slice().sort(), source.map(card => card.id).sort(), 'all cards, including rated cards, occur exactly once');
assert.equal(new Set(ids(session)).size, source.length);
assert.deepEqual(session.shuffleRemainingCardIds, ids(session).slice(1), 'every other mixed card remains in the upcoming traversal');
assert.deepEqual({ ...session.resultsByCardId }, beforeRatings, 'mixing never reassigns answers by index');
assert.equal(JSON.stringify(source), beforeCards, 'mixing never changes original ordering, text, positions or counters');

const traversal = [session.currentCardId];
for (let index = 1; index < source.length; index++) {
  assert.equal(navigateStudySession(session, 1), true);
  traversal.push(session.currentCardId);
}
assert.deepEqual(traversal, ids(session), 'the new traversal includes both rated and unrated cards in the mixed order');
assert.equal(new Set(traversal).size, source.length, 'the full mixed traversal neither skips nor duplicates a card');
assert.deepEqual({ ...session.resultsByCardId }, beforeRatings);

// Mixing from a backtracked position keeps the traversed past. The new
// permutation replaces the forward branch, whose cards remain in that mix.
const backtracked = createStudySession(makeCards());
navigateStudySession(backtracked, 1);
navigateStudySession(backtracked, 1);
navigateStudySession(backtracked, -1);
const past = backtracked.historyCardIds.slice(0, backtracked.historyIndex + 1);
const previousCurrent = backtracked.currentCardId;
shuffleStudyCards(backtracked, () => 0.5);
const mixedCurrent = backtracked.currentCardId;
const pending = backtracked.shuffleRemainingCardIds.slice();
assert.deepEqual(backtracked.historyCardIds.slice(0, past.length), past);
assert.equal(navigateStudySession(backtracked, -1), true);
assert.equal(backtracked.currentCardId, previousCurrent, 'back after mixing returns to the actually previous card');
assert.deepEqual(backtracked.shuffleRemainingCardIds, pending, 'back does not consume the mixed future');
assert.equal(navigateStudySession(backtracked, 1), true);
assert.equal(backtracked.currentCardId, mixedCurrent, 'forward replays the same mixed card after going back');
assert.deepEqual(backtracked.shuffleRemainingCardIds, pending, 'history replay does not consume another scheduled card');
assert.equal(getNextStudyCardId(backtracked), pending[0]);
assert.equal(navigateStudySession(backtracked, 1), true);
assert.equal(backtracked.currentCardId, pending[0]);
assert.deepEqual(backtracked.shuffleRemainingCardIds, pending.slice(1));

for (let iteration = 0; iteration < 20; iteration++) {
  const current = session.currentCardId;
  shuffleStudyCards(session, () => (iteration % 9) / 10);
  assert.notEqual(session.currentCardId, current, 'a repeated mix also includes the visible card');
  assert.equal(new Set(ids(session)).size, source.length);
  assert.equal(new Set(session.shuffleRemainingCardIds).size, source.length - 1);
  assert.deepEqual({ ...session.resultsByCardId }, beforeRatings);
}

const record = savedRecord(session);
const restored = createStudySession(source, record);
assert.deepEqual(ids(restored), ids(session));
assert.equal(restored.currentCardId, session.currentCardId);
assert.deepEqual(restored.shuffleRemainingCardIds, session.shuffleRemainingCardIds, 'resume preserves the remaining mixed traversal');
assert.deepEqual(restored.historyCardIds, session.historyCardIds);
assert.equal(restored.historyIndex, session.historyIndex);
assert.deepEqual({ ...restored.resultsByCardId }, beforeRatings, 'resume keeps answers on their original IDs');
assert.equal(getNextStudyCardId(restored), getNextStudyCardId(session));

// A card shown by going back can still be scheduled later in the new sweep.
// Restoring this view must not silently consume that future occurrence.
const pendingBacktrack = createStudySession(makeCards());
navigateStudySession(pendingBacktrack, 1);
const beforePendingMix = pendingBacktrack.currentCardId;
shuffleStudyCards(pendingBacktrack, () => 0);
assert.ok(pendingBacktrack.shuffleRemainingCardIds.includes(beforePendingMix));
navigateStudySession(pendingBacktrack, -1);
assert.equal(pendingBacktrack.currentCardId, beforePendingMix);
const backtrackRecord = savedRecord(pendingBacktrack);
const backtrackResume = createStudySession(makeCards(), backtrackRecord);
assert.deepEqual(backtrackResume.shuffleRemainingCardIds, pendingBacktrack.shuffleRemainingCardIds, 'resume from history retains a later scheduled occurrence of the displayed card');
assert.equal(getNextStudyCardId(backtrackResume), getNextStudyCardId(pendingBacktrack));

const removedId = record.shuffleRemainingCardIds[0];
const invalidQueue = { ...record, shuffleRemainingCardIds: [removedId, 'missing-card', ...record.shuffleRemainingCardIds, ...record.shuffleRemainingCardIds] };
const pruned = createStudySession(source.filter(card => card.id !== removedId), invalidQueue);
assert.ok(!pruned.shuffleRemainingCardIds.includes(removedId));
assert.ok(!pruned.shuffleRemainingCardIds.includes('missing-card'));
assert.equal(pruned.shuffleRemainingCardIds.length, new Set(pruned.shuffleRemainingCardIds).size, 'restoration removes invalid and duplicate pending IDs');

const corrected = createStudySession(makeCards());
rate(corrected, 'mix-1', false);
shuffleStudyCards(corrected, () => 0);
rate(corrected, 'mix-1', false);
assert.equal(getStudyCard(corrected, 'mix-1').attemptCount, 1, 'revisiting a rated card after mix does not add another session attempt');
rate(corrected, 'mix-1', true);
assert.deepEqual([
  getStudyCard(corrected, 'mix-1').correctCount,
  getStudyCard(corrected, 'mix-1').incorrectCount,
  getStudyCard(corrected, 'mix-1').attemptCount
], [1, 0, 1], 'changing a previous answer after mix corrects its counters once');
assert.deepEqual(summarizeResults(getStudyResults(corrected)), { known: 1, missed: 0, unrated: 4, evaluated: 1, percentage: 100 });

const alreadyRated = createStudySession(makeCards());
for (const card of alreadyRated.cards) rate(alreadyRated, card.id, true);
shuffleStudyCards(alreadyRated, () => 0.99);
const ratedTraversal = [alreadyRated.currentCardId];
while (alreadyRated.shuffleRemainingCardIds.length) {
  assert.equal(navigateStudySession(alreadyRated, 1), true, 'already rated cards remain navigable in the mixed sweep');
  ratedTraversal.push(alreadyRated.currentCardId);
}
assert.equal(new Set(ratedTraversal).size, alreadyRated.cards.length);
assert.equal(getNextStudyCardId(alreadyRated), null, 'a fully rated completed sweep has a controlled end');
rate(alreadyRated, alreadyRated.currentCardId, false);
assert.deepEqual(summarizeResults(getStudyResults(alreadyRated)), { known: 4, missed: 1, unrated: 0, evaluated: 5, percentage: 80 }, 'the final card can change its existing evaluation without changing total progress');
assert.ok(alreadyRated.cards.every(card => card.attemptCount === 1));

const one = createStudySession([makeCards()[0]]);
const oneBefore = JSON.stringify(one);
assert.equal(shuffleStudyCards(one, () => 0), false);
assert.equal(JSON.stringify(one), oneBefore);
const empty = createStudySession([]);
assert.equal(shuffleStudyCards(empty, () => 0), false);
assert.equal(empty.currentCardId, null);
assert.equal(shuffleStudyCards(null), false);

console.log('Full shuffle checks passed: all cards, ID-bound answers, history, resume, repeats and corrected counters.');
