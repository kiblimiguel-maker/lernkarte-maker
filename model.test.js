'use strict';

const assert = require('node:assert/strict');
const { normalizeLibrary, createImportedCards, createCopiedCards, nextSetName, swapSetCardSides, recordCardAnswer, updateCardAnswer, createStudySession, getStudyResults, getStudyResult, getStudyCurrentIndex, getStudyCard, getNextStudyCardId, navigateStudySession, shuffleUnvisitedStudyCards, setStudyAnswer, getSetProgress, resetSetProgress, summarizeResults, summarizeSession, nextUnratedIndex } = require('./model.js');

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
  'set-1': { id: 'session-2', setId: 'set-1', cardIds: ['card-1', 'card-2'], results: [true, null], index: 1, missedCardIdsCopied: ['card-old'] }
}, studyHistory: [completedSummary] });
assert.equal(restoredSession.studySessions['set-1'].index, 1, 'in-progress session position survives reload');
assert.deepEqual(restoredSession.studySessions['set-1'].results, [true, null]);
assert.deepEqual(restoredSession.studySessions['set-1'].missedCardIdsCopied, ['card-old'], 'copied-card state survives reload to prevent duplicate exports');
assert.equal(restoredSession.studyHistory[0].percentage, 50, 'completed session history survives reload');
assert.deepEqual(normalizeLibrary({ studySessions: { broken: { cardIds: ['a'], results: [] } } }).studySessions, {}, 'invalid session state is discarded without affecting the library');

const resetLibrary = normalizeLibrary({
  sets: [{ id: 'set-1', name: 'Französisch', shuffle: true }, { id: 'set-2', name: 'Mathe' }],
  cards: [
    { id: 'reset-card-1', setId: 'set-1', front: 'das Haus', back: 'la maison', position: 0, correctCount: 3, incorrectCount: 1, attemptCount: 4, lastReviewedAt: '2026-10-05T12:00:00.000Z', nextReviewAt: '2026-10-06T12:00:00.000Z' },
    { id: 'reset-card-2', setId: 'set-1', front: 'die Katze', back: 'le chat', position: 1, correctCount: 0, incorrectCount: 2, attemptCount: 2, lastReviewedAt: '2026-10-05T12:00:00.000Z', nextReviewAt: '2026-10-05T12:10:00.000Z' },
    { id: 'other-card', setId: 'set-2', front: '2+2', back: '4', position: 0, correctCount: 2, incorrectCount: 0, attemptCount: 2, lastReviewedAt: '2026-10-05T12:00:00.000Z', nextReviewAt: '2026-10-06T12:00:00.000Z' }
  ],
  studySessions: {
    'set-1': { id: 'resume-this', setId: 'set-1', cardIds: ['reset-card-1', 'reset-card-2'], results: [true, null], index: 1 },
    'set-2': { id: 'keep-this', setId: 'set-2', cardIds: ['other-card'], results: [true], index: 0 }
  },
  studyHistory: [{ id: 'history-1', setId: 'set-1', known: 2, missed: 1 }]
});
const untouchedCard = structuredClone(resetLibrary.cards[2]);
const untouchedSet = structuredClone(resetLibrary.sets[0]);
const historyBeforeReset = structuredClone(resetLibrary.studyHistory);
assert.equal(resetSetProgress(resetLibrary, 'set-1'), 2);
assert.deepEqual(getSetProgress(resetLibrary.cards.filter(card => card.setId === 'set-1')), { total: 2, secure: 0, practice: 0, new: 2, percentage: 0 });
assert.deepEqual(resetLibrary.cards.slice(0, 2).map(card => [card.correctCount, card.incorrectCount, card.attemptCount, card.lastReviewedAt, card.nextReviewAt]), [[0, 0, 0, null, null], [0, 0, 0, null, null]]);
assert.deepEqual(resetLibrary.cards.slice(0, 2).map(({ id, front, back, position }) => ({ id, front, back, position })), [
  { id: 'reset-card-1', front: 'das Haus', back: 'la maison', position: 0 },
  { id: 'reset-card-2', front: 'die Katze', back: 'le chat', position: 1 }
]);
assert.deepEqual(resetLibrary.cards[2], untouchedCard, 'reset leaves cards in other sets unchanged');
assert.deepEqual(resetLibrary.sets[0], untouchedSet, 'reset leaves set settings unchanged');
assert.equal(resetLibrary.studySessions['set-1'], undefined, 'reset removes the saved resume point');
assert.equal(resetLibrary.studySessions['set-2'].id, 'keep-this', 'reset preserves other sets’ sessions');
assert.deepEqual(resetLibrary.studyHistory, historyBeforeReset, 'reset preserves completed-session history');
const resetReload = normalizeLibrary(JSON.parse(JSON.stringify(resetLibrary)));
assert.equal(getSetProgress(resetReload.cards.filter(card => card.setId === 'set-1')).new, 2, 'reset state persists through storage normalization/reload');
assert.equal(resetReload.studySessions['set-1'], undefined, 'removed resume point stays removed after reload');
assert.equal(resetSetProgress(resetReload, 'set-1'), 2, 'reset is safe when repeated');
assert.equal(resetSetProgress(resetReload, 'missing-set'), 0, 'unknown set reset is a no-op');

assert.equal(nextSetName([
  { subjectId: 'subject-1', folderId: null, name: 'Lernstapel 1' },
  { subjectId: 'subject-1', folderId: null, name: 'Lernstapel 2' },
  { subjectId: 'subject-1', folderId: 'folder-1', name: 'Lernstapel 3' },
  { subjectId: 'subject-1', folderId: null, name: 'Lernstapel 4' },
  { subjectId: 'subject-2', folderId: null, name: 'Lernstapel 3' }
], 'subject-1', null), 'Lernstapel 3', 'automatic name fills a free number in the selected location');
assert.equal(nextSetName([{ subjectId: 'subject-1', name: 'Vokabeln' }], 'subject-1', null), 'Lernstapel 1');

const sourceForCopy = [
  { id: 'source-1', setId: 'source-set', front: ' das Haus ', back: 'la maison = une maison', position: 8, correctCount: 4, incorrectCount: 1, attemptCount: 5, lastReviewedAt: 'old', nextReviewAt: 'later' },
  { id: 'source-2', setId: 'source-set', front: 'être', back: 'to be', position: 9, correctCount: 2, incorrectCount: 0, attemptCount: 2 }
];
const sourceSnapshot = structuredClone(sourceForCopy);
const copiedCards = createCopiedCards(sourceForCopy, {
  setId: 'missed-set', position: 0, timestamp: '2026-10-12T12:00:00.000Z',
  createId: (() => { let next = 0; return () => `copy-${next++}`; })()
});
assert.equal(new Set(copiedCards.map(card => card.id)).size, 2, 'each copied card receives a unique id');
assert.deepEqual(copiedCards.map(card => [card.front, card.back, card.setId, card.position]), [
  [' das Haus ', 'la maison = une maison', 'missed-set', 0], ['être', 'to be', 'missed-set', 1]
], 'copied card content is preserved exactly while attaching to the new stack');
assert.deepEqual(copiedCards.map(card => [card.correctCount, card.incorrectCount, card.attemptCount, card.lastReviewedAt, card.nextReviewAt]), [
  [0, 0, 0, null, null], [0, 0, 0, null, null]
], 'copied cards start with independent learning progress');
assert.deepEqual(sourceForCopy, sourceSnapshot, 'copying does not mutate source cards or their progress');

const swapCards = [
  { id: 'swap-1', setId: 'set-1', front: 'das Haus', back: 'la maison', position: 0, correctCount: 2, attemptCount: 2, updatedAt: 'old' },
  { id: 'swap-2', setId: 'set-1', front: 'la rue', back: 'die Strasse', position: 1, incorrectCount: 1, attemptCount: 1 },
  { id: 'swap-other', setId: 'set-2', front: '2+2', back: '4', attemptCount: 3 }
];
const swapOtherSnapshot = structuredClone(swapCards[2]);
assert.equal(swapSetCardSides(swapCards, 'set-1', '2026-10-12T12:30:00.000Z'), 2);
assert.deepEqual(swapCards.slice(0, 2).map(card => [card.front, card.back, card.id, card.setId, card.position, card.attemptCount]), [
  ['la maison', 'das Haus', 'swap-1', 'set-1', 0, 2], ['die Strasse', 'la rue', 'swap-2', 'set-1', 1, 1]
]);
assert.equal(swapCards[0].updatedAt, '2026-10-12T12:30:00.000Z');
assert.deepEqual(swapCards[2], swapOtherSnapshot, 'side swap does not affect another stack');
assert.equal(swapSetCardSides([], 'set-1'), 0, 'side swap safely handles an empty stack');

const navigationCards = Array.from({ length: 5 }, (_, index) => ({ id: `nav-${index + 1}`, setId: 'nav-set', front: `Front ${index + 1}`, back: `Back ${index + 1}`, correctCount: 0, incorrectCount: 0, attemptCount: 0 }));
const navigationSession = createStudySession(navigationCards, { id: 'nav-session', setId: 'nav-set', startedAt: '2026-10-12T13:00:00.000Z' });
assert.equal(getStudyCard(navigationSession).id, 'nav-1', 'a new session opens on its first card');
assert.equal(navigateStudySession(navigationSession, -1), false, 'back is unavailable at the beginning');
assert.equal(navigateStudySession(navigationSession, 1), true);
assert.equal(navigateStudySession(navigationSession, 1), true);
assert.equal(getStudyCard(navigationSession).id, 'nav-3', 'forward visits the next unrated card');
assert.equal(navigateStudySession(navigationSession, -1), true);
assert.equal(getStudyCard(navigationSession).id, 'nav-2', 'back returns to the actual previous visit');
assert.equal(navigateStudySession(navigationSession, 1), true);
assert.equal(getStudyCard(navigationSession).id, 'nav-3', 'forward replays the existing visit path');
assert.equal(getNextStudyCardId(navigationSession), 'nav-4', 'the next unvisited card is selected before revisiting a skipped card');

let previous = setStudyAnswer(navigationSession, 'nav-3', false);
updateCardAnswer(navigationCards[2], previous, false, '2026-10-12T13:01:00.000Z');
assert.equal(navigationCards[2].attemptCount, 1, 'first evaluation adds one attempt');
assert.equal(navigateStudySession(navigationSession, -1), true);
assert.equal(getStudyResult(navigationSession), null, 'each card keeps its own answer status');
assert.equal(navigateStudySession(navigationSession, 1), true);
assert.equal(getStudyResult(navigationSession), false, 'a rated card retains its status when revisited');
previous = setStudyAnswer(navigationSession, 'nav-3', true);
updateCardAnswer(navigationCards[2], previous, true, '2026-10-12T13:02:00.000Z');
assert.deepEqual([navigationCards[2].correctCount, navigationCards[2].incorrectCount, navigationCards[2].attemptCount], [1, 0, 1], 'changing an answer updates counts without double-counting');
assert.deepEqual(getStudyResults(navigationSession), [null, null, true, null, null]);

const beforeShuffleCurrent = navigationSession.currentCardId;
const beforeShuffleHistory = navigationSession.historyCardIds.slice();
assert.equal(shuffleUnvisitedStudyCards(navigationSession, () => 0), true, 'shuffling changes the unvisited cards');
assert.equal(navigationSession.currentCardId, beforeShuffleCurrent, 'shuffling preserves the displayed card');
assert.deepEqual(navigationSession.historyCardIds, beforeShuffleHistory, 'shuffling preserves the visit history');
assert.equal(new Set(navigationSession.cards.map(card => card.id)).size, 5, 'shuffling never duplicates or removes cards');
assert.deepEqual(navigationSession.cards.slice(-2).map(card => card.id), ['nav-5', 'nav-4'], 'Fisher-Yates changes the pending order while leaving visited cards in place');
assert.equal(getStudyResult(navigationSession, 'nav-3'), true, 'the rating remains bound to its card ID after reorder');
assert.equal(navigateStudySession(navigationSession, -1), true);
assert.equal(getStudyCard(navigationSession).id, 'nav-2', 'back remains valid after shuffling');
assert.equal(navigateStudySession(navigationSession, 1), true);
assert.equal(getStudyCard(navigationSession).id, 'nav-3', 'the same card is reachable again after shuffling');
assert.equal(getNextStudyCardId(navigationSession), 'nav-5', 'the shuffled remainder determines the next unseen card');
for (let index = 0; index < 4; index++) shuffleUnvisitedStudyCards(navigationSession, () => 0);
assert.equal(navigationSession.currentCardId, 'nav-3', 'repeated mixes do not move the current card');
assert.equal(navigationSession.cards.length, 5);
assert.equal(navigateStudySession(navigationSession, -1), true, 'back can move within the current path after repeated mixes');

const resumeRecord = {
  id: navigationSession.id, setId: navigationSession.setId, startedAt: navigationSession.startedAt,
  cardIds: navigationSession.cards.map(card => card.id), results: getStudyResults(navigationSession),
  resultsByCardId: { ...navigationSession.resultsByCardId }, historyCardIds: navigationSession.historyCardIds.slice(),
  historyIndex: navigationSession.historyIndex, currentCardId: navigationSession.currentCardId,
  index: getStudyCurrentIndex(navigationSession)
};
const resumedSession = createStudySession(navigationCards, resumeRecord);
assert.equal(resumedSession.currentCardId, navigationSession.currentCardId, 'resume restores current card by stable ID');
assert.deepEqual(resumedSession.historyCardIds, navigationSession.historyCardIds, 'resume restores the complete visit history');
assert.equal(resumedSession.historyIndex, navigationSession.historyIndex, 'resume restores a backtracked position without appending duplicate history');
assert.deepEqual(getStudyResults(resumedSession), getStudyResults(navigationSession), 'resume restores card-keyed answers after reordering');
assert.equal(getNextStudyCardId(resumedSession), getNextStudyCardId(navigationSession));

const singleCardSession = createStudySession([navigationCards[0]]);
assert.equal(shuffleUnvisitedStudyCards(singleCardSession, () => 0), false, 'a single-card stack safely ignores shuffle');
assert.equal(navigateStudySession(singleCardSession, 1), false, 'a single-card stack cannot navigate past its end');
assert.equal(createStudySession([]).currentCardId, null, 'an empty stack has no invalid current card');
assert.equal(navigateStudySession(createStudySession([]), -1), false, 'an empty stack safely rejects navigation');

const rapidSession = createStudySession(navigationCards);
for (const action of [1, 1, -1, 'shuffle', 1, -1, 'shuffle', 1, 1, -1]) {
  if (action === 'shuffle') shuffleUnvisitedStudyCards(rapidSession, () => 0.37);
  else navigateStudySession(rapidSession, action);
  assert.ok(navigationCards.some(card => card.id === rapidSession.currentCardId), 'rapid navigation and mixing always leave a valid current card');
  assert.equal(new Set(rapidSession.cards.map(card => card.id)).size, navigationCards.length, 'rapid mixing keeps exactly one copy of each session card');
}

const legacyResume = createStudySession(navigationCards, { cardIds: navigationCards.map(card => card.id), results: [true, false, null, null], index: 2 });
assert.equal(legacyResume.currentCardId, 'nav-3', 'legacy saved sessions migrate to stable current IDs');
assert.deepEqual(getStudyResults(legacyResume), [true, false, null, null, null], 'legacy positional results migrate to card IDs');

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

console.log('Data checks passed: storage and session restore, learning progress, auto-naming, independent missed-card copies, side swapping, and 50,000-card import batches.');
