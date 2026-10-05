'use strict';

const assert = require('node:assert/strict');
const { normalizeLibrary, createImportedCards, recordCardAnswer, getSetProgress, summarizeResults, summarizeSession, nextUnratedIndex } = require('./model.js');

assert.deepEqual(normalizeLibrary(null), { subjects: [], folders: [], sets: [], cards: [], recent: [], studySessions: {}, studyHistory: [] });
const malformedCollections = normalizeLibrary({
  subjects: [{ id: 'subject-1', name: 'Französisch' }],
  folders: null,
  sets: [{ id: 'set-1', subjectId: 'subject-1', name: 'Vokabeln' }],
  cards: { not: 'an array' },
  recent: 'not an array'
});
assert.equal(malformedCollections.subjects.length, 1);
assert.equal(malformedCollections.sets.length, 1);
assert.deepEqual(malformedCollections.folders, []);
assert.deepEqual(malformedCollections.cards, []);
assert.deepEqual(malformedCollections.recent, []);

const partialRecords = normalizeLibrary({
  subjects: [], sets: [],
  cards: [null, 'invalid row', { id: 'card-1', front: 'Haus', back: 'maison', correctCount: -1 }, { id: 'card-2', position: 8, correctCount: 3, incorrectCount: 2 }]
});
assert.equal(partialRecords.cards.length, 2);
assert.deepEqual(partialRecords.cards.map(card => [card.position, card.correctCount, card.incorrectCount]), [[0, 0, 0], [8, 3, 2]]);
assert.deepEqual(partialRecords.cards.map(card => card.attemptCount), [0, 5]);

const progressCard = { id: 'progress-1', setId: 'set-1', correctCount: 0, incorrectCount: 0, attemptCount: 0 };
recordCardAnswer(progressCard, false, '2026-10-05T12:00:00.000Z');
assert.deepEqual([progressCard.correctCount, progressCard.incorrectCount, progressCard.attemptCount], [0, 1, 1]);
const reloadedCard = normalizeLibrary(JSON.parse(JSON.stringify({ cards: [progressCard] }))).cards[0];
assert.deepEqual([reloadedCard.correctCount, reloadedCard.incorrectCount, reloadedCard.attemptCount, reloadedCard.lastReviewedAt], [0, 1, 1, '2026-10-05T12:00:00.000Z']);
recordCardAnswer(reloadedCard, true, '2026-10-05T12:01:00.000Z');
recordCardAnswer(reloadedCard, true, '2026-10-05T12:02:00.000Z');
assert.deepEqual([reloadedCard.correctCount, reloadedCard.incorrectCount, reloadedCard.attemptCount], [2, 1, 3], 'revisits count as separate attempts across learning sessions');
assert.equal(getSetProgress([reloadedCard]).secure, 1);
assert.equal(getSetProgress([]).percentage, 0);
assert.deepEqual(getSetProgress([
  { attemptCount: 0 },
  { attemptCount: 1, correctCount: 0, incorrectCount: 1 },
  { attemptCount: 2, correctCount: 2, incorrectCount: 0 }
]), { total: 3, secure: 1, practice: 1, new: 1, percentage: 33 });
assert.deepEqual(summarizeResults([true, false, null]), { known: 1, missed: 1, unrated: 1, evaluated: 2, percentage: 50 });
assert.deepEqual(summarizeResults([null]), { known: 0, missed: 0, unrated: 1, evaluated: 0, percentage: 0 });
assert.equal(nextUnratedIndex([null], 0), -1, 'a one-card session completes after its only card is rated');
assert.equal(nextUnratedIndex([true, null, false], 0), 1, 'next unanswered card follows current card');
assert.equal(nextUnratedIndex([null, true, null], 2), 0, 'navigation wraps to skipped cards instead of ending early');
assert.equal(nextUnratedIndex([true, false], 0), -1, 'a fully rated set has no unanswered card');
const completedSummary = summarizeSession({ id: 'session-1', setId: 'set-1', startedAt: '2026-10-05T12:00:00.000Z', cardIds: ['a', 'b'], results: [true, false] }, '2026-10-05T12:03:00.000Z');
assert.deepEqual([completedSummary.cardCount, completedSummary.known, completedSummary.missed, completedSummary.percentage], [2, 1, 1, 50]);

const restoredSession = normalizeLibrary({ studySessions: {
  'set-1': { id: 'session-2', setId: 'set-1', cardIds: ['card-1', 'card-2'], results: [true, null], index: 1 }
}, studyHistory: [completedSummary] });
assert.equal(restoredSession.studySessions['set-1'].index, 1, 'in-progress session position survives reload');
assert.deepEqual(restoredSession.studySessions['set-1'].results, [true, null]);
assert.equal(restoredSession.studyHistory[0].percentage, 50, 'completed session history survives reload');
assert.deepEqual(normalizeLibrary({ studySessions: { broken: { cardIds: ['a'], results: [] } } }).studySessions, {}, 'invalid session state is discarded without affecting the library');

const rows = Array.from({ length: 50000 }, (_, index) => ({ front: `Begriff ${index}`, back: `Definition ${index}` }));
const created = createImportedCards(rows, {
  setId: 'set-1', position: 7, timestamp: '2026-10-05T12:00:00.000Z', createId: (() => { let next = 0; return () => `card-${next++}`; })()
});
const existing = [{ id: 'existing-card' }];
const combined = existing.concat(created);
assert.equal(combined.length, 50001);
assert.equal(combined[1].front, 'Begriff 0');
assert.equal(combined.at(-1).back, 'Definition 49999');
assert.equal(combined.at(-1).position, 50006);
assert.equal(combined.at(-1).setId, 'set-1');

const largeProgress = getSetProgress(Array.from({ length: 20000 }, (_, index) => ({ attemptCount: 2, correctCount: index % 2 ? 0 : 2, incorrectCount: index % 2 ? 2 : 0 })));
assert.deepEqual([largeProgress.total, largeProgress.secure, largeProgress.practice], [20000, 10000, 10000]);

console.log('Data checks passed: resilient storage, attempt tracking across reloads and sessions, per-set mastery, session summaries/resume state, and 50,000-card import batches.');
