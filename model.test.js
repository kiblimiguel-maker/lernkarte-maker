'use strict';

const assert = require('node:assert/strict');
const { normalizeLibrary, getLibrarySiblings, reorderLibraryItems, canMoveLibraryItem, moveLibraryItem, nextLibraryPosition, getFolderDescendantIds, createImportedCards, createCopiedCards, nextSetName, swapSetCardSides, recordCardAnswer, updateCardAnswer, createStudySession, getStudyResults, getStudyResult, getStudyCurrentIndex, getStudyCard, getNextStudyCardId, navigateStudySession, shuffleStudyCards, setStudyAnswer, getSetProgress, resetSetProgress, summarizeResults, summarizeSession, nextUnratedIndex } = require('./model.js');

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

const importedExampleCards = createImportedCards([{
  front: 'eine Burg', back: 'un château fort', backExampleSentence: 'Le village a un vieux château fort.'
}], {
  setId: 'example-set', position: 0, timestamp: '2026-10-29T12:00:00.000Z', createId: () => 'example-card'
});
assert.equal(importedExampleCards[0].back, 'un château fort', 'the example markup is not stored as part of the term');
assert.equal(importedExampleCards[0].backExampleSentence, 'Le village a un vieux château fort.');
assert.equal(normalizeLibrary(JSON.parse(JSON.stringify({ cards: importedExampleCards }))).cards[0].backExampleSentence, 'Le village a un vieux château fort.', 'example sentences persist through library normalization and reload');
const copiedExampleCard = createCopiedCards(importedExampleCards, {
  setId: 'example-copy', timestamp: '2026-10-29T12:01:00.000Z', createId: () => 'example-copy-card'
})[0];
assert.deepEqual([copiedExampleCard.back, copiedExampleCard.backExampleSentence], [
  'un château fort', 'Le village a un vieux château fort.'
], 'copying a card preserves its example sentence');

const swapCards = [
  { id: 'swap-1', setId: 'set-1', front: 'das Haus', back: 'la maison', backExampleSentence: 'La maison est ancienne.', position: 0, correctCount: 2, attemptCount: 2, updatedAt: 'old' },
  { id: 'swap-2', setId: 'set-1', front: 'la rue', back: 'die Strasse', frontExampleSentence: 'La rue est calme.', position: 1, incorrectCount: 1, attemptCount: 1 },
  { id: 'swap-other', setId: 'set-2', front: '2+2', back: '4', attemptCount: 3 }
];
const swapOtherSnapshot = structuredClone(swapCards[2]);
assert.equal(swapSetCardSides(swapCards, 'set-1', '2026-10-12T12:30:00.000Z'), 2);
assert.deepEqual(swapCards.slice(0, 2).map(card => [card.front, card.back, card.id, card.setId, card.position, card.attemptCount]), [
  ['la maison', 'das Haus', 'swap-1', 'set-1', 0, 2], ['die Strasse', 'la rue', 'swap-2', 'set-1', 1, 1]
]);
assert.deepEqual(swapCards.slice(0, 2).map(card => [card.frontExampleSentence || null, card.backExampleSentence || null]), [
  ['La maison est ancienne.', null], [null, 'La rue est calme.']
], 'side swapping keeps each example sentence attached to its term');
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
assert.equal(shuffleStudyCards(navigationSession, () => 0), true, 'all cards can be shuffled, including the current and rated cards');
assert.notEqual(navigationSession.currentCardId, beforeShuffleCurrent, 'mixing replaces the current card too');
assert.equal(new Set(navigationSession.cards.map(card => card.id)).size, 5, 'shuffling never duplicates or removes cards');
assert.equal(getStudyResult(navigationSession, 'nav-3'), true, 'the rating remains bound to its card ID after reorder');
assert.deepEqual(navigationSession.shuffleRemainingCardIds, navigationSession.cards.slice(1).map(card=>card.id));
assert.equal(navigateStudySession(navigationSession, -1), true);
assert.equal(navigationSession.currentCardId, beforeShuffleCurrent, 'back returns to the card displayed before mixing');
assert.equal(navigateStudySession(navigationSession, 1), true);
assert.equal(navigationSession.currentCardId, navigationSession.cards[0].id, 'forward returns to the new mixed sequence');
for (let index = 0; index < 4; index++) shuffleStudyCards(navigationSession, () => 0);
assert.equal(navigationSession.cards.length, 5);
assert.equal(navigateStudySession(navigationSession, -1), true, 'back remains valid after repeated mixes');

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
assert.equal(shuffleStudyCards(singleCardSession, () => 0), false, 'a single-card stack safely ignores shuffle');
assert.equal(navigateStudySession(singleCardSession, 1), false, 'a single-card stack cannot navigate past its end');
assert.equal(createStudySession([]).currentCardId, null, 'an empty stack has no invalid current card');
assert.equal(navigateStudySession(createStudySession([]), -1), false, 'an empty stack safely rejects navigation');

const predictableShuffleSession = createStudySession(navigationCards);
const predictableBefore = predictableShuffleSession.cards.map(card => card.id);
assert.equal(shuffleStudyCards(predictableShuffleSession, () => 0.99), true, 'shuffle changes the current card even when samples initially preserve order');
assert.notDeepEqual(predictableShuffleSession.cards.map(card => card.id), predictableBefore, 'shuffle produces a visibly different order');
assert.notEqual(predictableShuffleSession.currentCardId, predictableBefore[0], 'shuffle changes the visible card as well');

const rapidSession = createStudySession(navigationCards);
for (const action of [1, 1, -1, 'shuffle', 1, -1, 'shuffle', 1, 1, -1]) {
  if (action === 'shuffle') shuffleStudyCards(rapidSession, () => 0.37);
  else navigateStudySession(rapidSession, action);
  assert.ok(navigationCards.some(card => card.id === rapidSession.currentCardId), 'rapid navigation and mixing always leave a valid current card');
  assert.equal(new Set(rapidSession.cards.map(card => card.id)).size, navigationCards.length, 'rapid mixing keeps exactly one copy of each session card');
}

const legacyResume = createStudySession(navigationCards, { cardIds: navigationCards.map(card => card.id), results: [true, false, null, null], index: 2 });
assert.equal(legacyResume.currentCardId, 'nav-3', 'legacy saved sessions migrate to stable current IDs');
assert.deepEqual(getStudyResults(legacyResume), [true, false, null, null, null], 'legacy positional results migrate to card IDs');

const subsetResume = createStudySession(navigationCards, {
  cardIds: ['nav-1'], results: [false], index: 0,
  resultsByCardId: { 'nav-1': false, 'nav-2': true },
  historyCardIds: ['nav-1', 'nav-2'], historyIndex: 1, currentCardId: 'nav-2',
  shuffleRemainingCardIds: ['nav-2']
});
assert.deepEqual(subsetResume.cards.map(card => card.id), ['nav-1'], 'a resumed retry remains limited to its saved subset');
assert.equal(getStudyCard(subsetResume)?.id, 'nav-1', 'stale history outside the retry subset cannot restore an invisible active card');
assert.deepEqual(subsetResume.historyCardIds, ['nav-1']);
assert.deepEqual(Object.keys(subsetResume.resultsByCardId), ['nav-1'], 'unrelated saved ratings are not pulled into a retry');
assert.equal(getStudyResult(subsetResume), false);
assert.equal(getNextStudyCardId(subsetResume), null);
const incompleteLegacyResume = createStudySession(navigationCards, { results: [true], index: 0 });
assert.equal(getStudyCard(incompleteLegacyResume)?.id, 'nav-1', 'incomplete legacy state safely opens a visible card');
assert.ok(getStudyResults(incompleteLegacyResume).every(result => result === null), 'positional answers without saved card IDs are not assigned to arbitrary cards');

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

const orderedLibrary = normalizeLibrary({
  subjects: [{ id: 'subject-z', name: 'French' }, { id: 'subject-a', name: 'German' }, { id: 'subject-m', name: 'Math' }],
  folders: [
    { id: 'folder-1', subjectId: 'subject-z', name: 'First' },
    { id: 'other-subject-folder', subjectId: 'subject-a', name: 'Other' },
    { id: 'folder-2', subjectId: 'subject-z', name: 'Second' },
    { id: 'child-1', subjectId: 'subject-z', parentId: 'folder-1', name: 'Child 1' },
    { id: 'child-2', subjectId: 'subject-z', parentId: 'folder-1', name: 'Child 2' },
    { id: 'grandchild', subjectId: 'subject-z', parentId: 'child-1', name: 'Grandchild' }
  ],
  sets: [
    { id: 'set-z', subjectId: 'subject-z', folderId: null },
    { id: 'other-subject-set', subjectId: 'subject-a', folderId: null },
    { id: 'set-a', subjectId: 'subject-z', folderId: null },
    { id: 'set-child-1', subjectId: 'subject-z', folderId: 'folder-1' },
    { id: 'set-child-2', subjectId: 'subject-z', folderId: 'folder-1' }
  ],
  cards: navigationCards,
  studySessions: { 'nav-set': { id: 'sort-session', setId: 'nav-set', cardIds: ['nav-1', 'nav-2'], results: [true, false], index: 1 } },
  studyHistory: [completedSummary]
});
const learningBeforeSort = structuredClone({ cards: orderedLibrary.cards, sessions: orderedLibrary.studySessions, history: orderedLibrary.studyHistory });
assert.equal(reorderLibraryItems(orderedLibrary, { type: 'subject', id: 'subject-m', targetId: 'subject-z' }), true);
assert.deepEqual(orderedLibrary.subjects.map(item => item.id), ['subject-m', 'subject-z', 'subject-a']);
assert.equal(reorderLibraryItems(orderedLibrary, { type: 'folder', id: 'folder-2', targetId: 'folder-1' }), true);
assert.deepEqual(getLibrarySiblings(orderedLibrary, 'folder', 'folder-1').map(item => item.id), ['folder-2', 'folder-1']);
assert.equal(reorderLibraryItems(orderedLibrary, { type: 'folder', id: 'child-1', targetId: 'child-2', placement: 'after' }), true);
assert.deepEqual(getLibrarySiblings(orderedLibrary, 'folder', 'child-1').map(item => item.id), ['child-2', 'child-1']);
assert.equal(reorderLibraryItems(orderedLibrary, { type: 'set', id: 'set-a', targetId: 'set-z' }), true);
assert.equal(reorderLibraryItems(orderedLibrary, { type: 'set', id: 'set-child-2', targetId: 'set-child-1' }), true);
const libraryBeforeInvalidMove = structuredClone(orderedLibrary);
for (const move of [
  { type: 'folder', id: 'folder-1', targetId: 'other-subject-folder' },
  { type: 'folder', id: 'folder-1', targetId: 'child-1' },
  { type: 'set', id: 'set-a', targetId: 'set-child-1' },
  { type: 'set', id: 'set-a', targetId: 'other-subject-set' },
  { type: 'set', id: 'set-a', targetId: 'set-a' },
  { type: 'set', id: 'missing', targetId: 'set-a' },
  { type: 'set', id: 'set-a', targetId: 'missing' },
  { type: 'card', id: 'nav-1', targetId: 'nav-2' },
  { type: 'set', id: 'set-a', targetId: 'set-z', placement: 'invalid' }
]) assert.equal(reorderLibraryItems(orderedLibrary, move), false, 'cross-level, cross-subject and invalid moves never mutate the library');
assert.deepEqual(orderedLibrary, libraryBeforeInvalidMove);
assert.deepEqual({ cards: orderedLibrary.cards, sessions: orderedLibrary.studySessions, history: orderedLibrary.studyHistory }, learningBeforeSort, 'library sorting preserves every card, learning answer and saved session');
assert.deepEqual(getFolderDescendantIds(orderedLibrary, 'folder-1').sort(), ['child-1', 'child-2', 'grandchild']);
assert.deepEqual(getFolderDescendantIds(orderedLibrary, 'unknown'), []);

// Simulate database records being returned by primary key rather than display order.
const remoteOrder = structuredClone(orderedLibrary);
for (const key of ['subjects', 'folders', 'sets']) remoteOrder[key].sort((a, b) => a.id.localeCompare(b.id));
const sortedReload = normalizeLibrary(JSON.parse(JSON.stringify(remoteOrder)));
assert.deepEqual(sortedReload.subjects.map(item => item.id), ['subject-m', 'subject-z', 'subject-a']);
assert.deepEqual(getLibrarySiblings(sortedReload, 'folder', 'folder-1').map(item => item.id), ['folder-2', 'folder-1']);
assert.deepEqual(getLibrarySiblings(sortedReload, 'folder', 'child-1').map(item => item.id), ['child-2', 'child-1']);
assert.deepEqual(getLibrarySiblings(sortedReload, 'set', 'set-a').map(item => item.id), ['set-a', 'set-z']);
assert.deepEqual(getLibrarySiblings(sortedReload, 'set', 'set-child-1').map(item => item.id), ['set-child-2', 'set-child-1']);
sortedReload.subjects.unshift({ id: 'subject-new', name: 'New' });
assert.deepEqual(normalizeLibrary(sortedReload).subjects.map(item => item.id), ['subject-m', 'subject-z', 'subject-a', 'subject-new'], 'new unpositioned records append after the stored custom order');
assert.deepEqual(normalizeLibrary({ subjects: [{ id: 'old-a' }, { id: 'old-b' }] }).subjects.map(item => item.id), ['old-a', 'old-b'], 'legacy collections preserve their existing order');
assert.equal(reorderLibraryItems(normalizeLibrary({}), { type: 'subject', id: 'missing', targetId: 'none' }), false);
assert.equal(reorderLibraryItems({ subjects: [{ id: 'only' }] }, { type: 'subject', id: 'only', targetId: 'only' }), false);

const repeatedLibrarySort = structuredClone(orderedLibrary);
const setRelationsBefore = repeatedLibrarySort.sets.map(item => [item.id, item.subjectId, item.folderId]).sort();
for (let iteration = 0; iteration < 100; iteration++) {
  reorderLibraryItems(repeatedLibrarySort, { type: 'subject', id: iteration % 2 ? 'subject-a' : 'subject-m', targetId: 'subject-z', placement: iteration % 3 ? 'before' : 'after' });
  reorderLibraryItems(repeatedLibrarySort, { type: 'set', id: 'set-z', targetId: 'set-a', placement: iteration % 2 ? 'before' : 'after' });
  assert.equal(new Set(repeatedLibrarySort.subjects.map(item => item.id)).size, 3);
  assert.equal(new Set(repeatedLibrarySort.sets.map(item => item.id)).size, 5);
}
assert.deepEqual(repeatedLibrarySort.sets.map(item => [item.id, item.subjectId, item.folderId]).sort(), setRelationsBefore, 'repeated sorting never duplicates entries or changes their subject/folder membership');

const appendOrder = normalizeLibrary({
  subjects: [{ id: 'z' }, { id: 'a' }],
  folders: [{ id: 'parent', subjectId: 'z' }, { id: 'existing-root', subjectId: 'z' }, { id: 'child', subjectId: 'z', parentId: 'parent' }],
  sets: [{ id: 'existing-set', subjectId: 'z', folderId: null }, { id: 'moved-set', subjectId: 'z', folderId: 'parent' }]
});
assert.deepEqual(appendOrder.subjects.map(item => item.position), [0, 1], 'legacy records receive stable explicit positions when loaded');
const newSubject = { id: 'new-a' };
newSubject.position = nextLibraryPosition(appendOrder, 'subject', newSubject);
appendOrder.subjects.push(newSubject);
const secondNewSubject = { id: 'new-z' };
secondNewSubject.position = nextLibraryPosition(appendOrder, 'subject', secondNewSubject);
appendOrder.subjects.push(secondNewSubject);
assert.deepEqual(appendOrder.subjects.map(item => item.position), [0, 1, 2, 3]);
const movedChild = appendOrder.folders.find(item => item.id === 'child');
movedChild.parentId = null;
movedChild.position = nextLibraryPosition(appendOrder, 'folder', movedChild);
assert.equal(movedChild.position, 2, 'reparented folder appends without retaining its old level position');
const movedSet = appendOrder.sets.find(item => item.id === 'moved-set');
movedSet.folderId = null;
movedSet.position = nextLibraryPosition(appendOrder, 'set', movedSet);
assert.equal(movedSet.position, 1, 'moving a learning set appends in its target folder');
for (const key of ['subjects', 'folders', 'sets']) appendOrder[key].sort((a, b) => a.id.localeCompare(b.id));
const appendReload = normalizeLibrary(JSON.parse(JSON.stringify(appendOrder)));
assert.deepEqual(appendReload.subjects.map(item => item.id), ['z', 'a', 'new-a', 'new-z']);
assert.deepEqual(getLibrarySiblings(appendReload, 'folder', 'child').map(item => item.id), ['parent', 'existing-root', 'child']);
assert.deepEqual(appendReload.sets.map(item => item.id), ['existing-set', 'moved-set']);
assert.equal(nextLibraryPosition(appendReload, 'set', { id: 'another-subject', subjectId: 'other', folderId: null }), 0, 'append position belongs to its own subject and folder');

const malformedParents = normalizeLibrary({ folders: [
  { id: 'cycle-a', subjectId: 'a', parentId: 'cycle-b' },
  { id: 'cycle-b', subjectId: 'a', parentId: 'cycle-a' },
  { id: 'self', subjectId: 'a', parentId: 'self' },
  { id: 'missing', subjectId: 'a', parentId: 'gone' },
  { id: 'cross-subject', subjectId: 'b', parentId: 'cycle-b' }
] });
assert.equal(malformedParents.folders.length, 5, 'invalid ancestry never removes a folder');
assert.equal(malformedParents.folders.filter(item => item.id.startsWith('cycle-') && !item.parentId).length, 1, 'one cycle edge is safely detached');
assert.deepEqual(malformedParents.folders.slice(2).map(item => item.parentId), [null, null, null]);
assert.ok(getFolderDescendantIds(malformedParents, 'cycle-a').length <= 1);

const moveLibrary = normalizeLibrary({
  subjects: [{ id: 'french' }, { id: 'history' }],
  folders: [
    { id: 'unit-a', subjectId: 'french', color: '#2563eb' },
    { id: 'unit-b', subjectId: 'french', color: '#16a34a' },
    { id: 'atelier', subjectId: 'french', parentId: 'unit-a' },
    { id: 'atelier-child', subjectId: 'french', parentId: 'atelier' },
    { id: 'other-fach', subjectId: 'history' }
  ],
  sets: [
    { id: 'loose', subjectId: 'french', folderId: null, cardThemeId: 'original' },
    { id: 'first-a', subjectId: 'french', folderId: 'unit-a' },
    { id: 'second-a', subjectId: 'french', folderId: 'unit-a' },
    { id: 'first-b', subjectId: 'french', folderId: 'unit-b' },
    { id: 'nested', subjectId: 'french', folderId: 'atelier-child' },
    { id: 'foreign', subjectId: 'history', folderId: null }
  ],
  cards: [{ id: 'move-card', setId: 'loose', front: 'une maison', back: 'ein Haus', correctCount: 2, attemptCount: 3 }],
  studySessions: { loose: { id: 'move-session', setId: 'loose', cardIds: ['move-card'], results: [true], index: 0 } },
  recent: [{ setId: 'loose' }],
  studyHistory: [{ id: 'past-session', setId: 'loose', known: 1 }]
});
const beforeDropFeedback = JSON.stringify(moveLibrary);
assert.equal(canMoveLibraryItem(moveLibrary, { type: 'set', id: 'loose', folderId: 'unit-a' }), true);
assert.equal(canMoveLibraryItem(moveLibrary, { type: 'folder', id: 'unit-a', folderId: 'atelier-child' }), false);
assert.equal(canMoveLibraryItem(moveLibrary, { type: 'set', id: 'loose', folderId: 'other-fach' }), false);
assert.equal(JSON.stringify(moveLibrary), beforeDropFeedback, 'checking possible drop targets is pure');
const originalMoveCards = moveLibrary.cards, originalMoveCard = moveLibrary.cards[0];
const originalMoveSessions = moveLibrary.studySessions, originalMoveRecent = moveLibrary.recent, originalMoveHistory = moveLibrary.studyHistory;
const liveMoveSession = createStudySession(moveLibrary.cards);
assert.equal(moveLibraryItem(moveLibrary, { type: 'set', id: 'loose', folderId: 'unit-a', timestamp: '2026-11-03T22:00:00.000Z' }), true);
assert.deepEqual(getLibrarySiblings(moveLibrary, 'set', 'loose').map(item => item.id), ['first-a', 'second-a', 'loose'], 'moving into a folder appends without disturbing its custom order');
assert.deepEqual(getLibrarySiblings(moveLibrary, 'set', 'loose').map(item => item.position), [0, 1, 2]);
assert.equal(moveLibrary.sets.find(item => item.id === 'loose').updatedAt, '2026-11-03T22:00:00.000Z');
assert.equal(moveLibrary.sets.find(item => item.id === 'loose').cardThemeId, 'original', 'moving never adopts the target folder design');
assert.equal(moveLibraryItem(moveLibrary, { type: 'set', id: 'second-a', folderId: 'unit-b' }), true);
assert.deepEqual(getLibrarySiblings(moveLibrary, 'set', 'first-a').map(item => [item.id, item.position]), [['first-a', 0], ['loose', 1]], 'the old folder order closes the removed gap');
assert.deepEqual(getLibrarySiblings(moveLibrary, 'set', 'first-b').map(item => [item.id, item.position]), [['first-b', 0], ['second-a', 1]], 'moving between folders preserves destination order');
assert.equal(moveLibraryItem(moveLibrary, { type: 'set', id: 'loose', folderId: null }), true);
assert.equal(moveLibrary.sets.find(item => item.id === 'loose').folderId, null, 'a set may live directly in its subject');
assert.equal(moveLibraryItem(moveLibrary, { type: 'folder', id: 'atelier', folderId: 'unit-b' }), true);
assert.equal(moveLibrary.folders.find(item => item.id === 'atelier').parentId, 'unit-b');
assert.equal(moveLibrary.folders.find(item => item.id === 'atelier-child').parentId, 'atelier', 'moving a folder preserves its subtree');
assert.equal(moveLibrary.sets.find(item => item.id === 'nested').folderId, 'atelier-child', 'nested sets remain in the same folder when their ancestor moves');
assert.equal(moveLibraryItem(moveLibrary, { type: 'folder', id: 'atelier', folderId: null }), true);
assert.deepEqual(getLibrarySiblings(moveLibrary, 'folder', 'atelier').map(item => item.id), ['unit-a', 'unit-b', 'atelier']);

const beforeInvalidOrganization = JSON.stringify(moveLibrary);
for (const move of [
  { type: 'folder', id: 'atelier', folderId: 'atelier' },
  { type: 'folder', id: 'atelier', folderId: 'atelier-child' },
  { type: 'folder', id: 'unit-a', folderId: 'other-fach' },
  { type: 'set', id: 'loose', folderId: 'other-fach' },
  { type: 'set', id: 'loose', folderId: 'missing' },
  { type: 'set', id: 'missing', folderId: null },
  { type: 'set', id: 'loose', folderId: null },
  { type: 'folder', id: 'unit-a', folderId: null },
  { type: 'subject', id: 'french', folderId: 'unit-a' },
  { type: 'set', id: 'loose' },
  { type: 'set', id: 'loose', folderId: '' },
  { type: 'set', id: 'loose', folderId: 3 }
]) assert.equal(moveLibraryItem(moveLibrary, move), false, 'invalid membership changes fail without mutation');
assert.equal(JSON.stringify(moveLibrary), beforeInvalidOrganization);
assert.equal(moveLibraryItem({}, { type: 'set', id: 'loose', folderId: null }), false);
assert.equal(moveLibraryItem(null, { type: 'folder', id: 'atelier', folderId: null }), false);
assert.equal(moveLibrary.cards, originalMoveCards);
assert.equal(moveLibrary.cards[0], originalMoveCard, 'card objects shared with a live session are never replaced');
assert.equal(liveMoveSession.cards[0], originalMoveCard);
assert.equal(moveLibrary.studySessions, originalMoveSessions);
assert.equal(moveLibrary.recent, originalMoveRecent);
assert.equal(moveLibrary.studyHistory, originalMoveHistory);
assert.equal(moveLibrary.cards[0].attemptCount, 3, 'organization never changes learning progress');

const repeatedMoveIds = moveLibrary.sets.map(item => item.id).sort();
for (let iteration = 0; iteration < 100; iteration++) {
  assert.equal(moveLibraryItem(moveLibrary, { type: 'set', id: 'loose', folderId: iteration % 2 ? null : 'unit-b' }), true);
  assert.deepEqual(moveLibrary.sets.map(item => item.id).sort(), repeatedMoveIds, 'repeated moves never duplicate or remove a set');
}
const corruptMoveTarget = structuredClone(moveLibrary);
corruptMoveTarget.folders.push({ id: 'cyclic-target', subjectId: 'french', parentId: 'cyclic-target' });
assert.equal(moveLibraryItem(corruptMoveTarget, { type: 'set', id: 'loose', folderId: 'cyclic-target' }), false);
corruptMoveTarget.folders.push({ id: 'broken-target', subjectId: 'french', parentId: 'not-present' });
assert.equal(moveLibraryItem(corruptMoveTarget, { type: 'set', id: 'loose', folderId: 'broken-target' }), false);

const crossSubjectLibrary = normalizeLibrary({
  subjects: [{ id: 'french' }, { id: 'history' }],
  folders: [
    { id: 'root', subjectId: 'french' },
    { id: 'child', subjectId: 'french', parentId: 'root' },
    { id: 'leaf', subjectId: 'french', parentId: 'child' },
    { id: 'remaining', subjectId: 'french' },
    { id: 'destination', subjectId: 'history' },
    { id: 'second', subjectId: 'history' }
  ],
  sets: [
    { id: 'study-set', subjectId: 'french', folderId: 'leaf', cardThemeId: 'original' },
    { id: 'loose', subjectId: 'french' },
    { id: 'already-there', subjectId: 'history', folderId: 'destination' },
    { id: 'in-root', subjectId: 'french', folderId: 'root' }
  ],
  cards: [{ id: 'card', setId: 'study-set', front: 'une table', back: 'ein Tisch', correctCount: 2, attemptCount: 3 }],
  studySessions: { 'study-set': { id: 'active', setId: 'study-set', cardIds: ['card'], results: [true], index: 0 } },
  recent: [{ setId: 'study-set' }]
});
const cardsBeforeCrossSubjectMove = crossSubjectLibrary.cards;
const sessionsBeforeCrossSubjectMove = crossSubjectLibrary.studySessions;
const untouchedCrossSubjectLibrary = JSON.stringify(crossSubjectLibrary);
const moveFolderAcross = { type: 'folder', id: 'root', subjectId: 'history', folderId: null, targetId: 'destination', placement: 'before' };
assert.equal(canMoveLibraryItem(crossSubjectLibrary, moveFolderAcross), true);
for (const invalid of [
  { ...moveFolderAcross, subjectId: 'outside-library' },
  { ...moveFolderAcross, folderId: 'child' },
  { ...moveFolderAcross, subjectId: 'french', folderId: 'leaf', targetId: undefined },
  { ...moveFolderAcross, targetId: 'remaining' },
  { type: 'set', id: 'loose', subjectId: 'history', folderId: 'leaf' },
  { type: 'set', id: 'loose', subjectId: 'history', folderId: 'destination', targetId: 'study-set' }
]) {
  assert.equal(canMoveLibraryItem(crossSubjectLibrary, invalid), false);
  assert.equal(moveLibraryItem(crossSubjectLibrary, invalid), false);
}
assert.equal(JSON.stringify(crossSubjectLibrary), untouchedCrossSubjectLibrary, 'checking or rejecting a drop does not change records');

assert.equal(moveLibraryItem(crossSubjectLibrary, moveFolderAcross), true);
assert.deepEqual(getLibrarySiblings(crossSubjectLibrary, 'folder', 'root').map(({ id, position }) => [id, position]), [
  ['root', 0], ['destination', 1], ['second', 2]
]);
assert.deepEqual(getLibrarySiblings(crossSubjectLibrary, 'folder', 'remaining').map(({ id, position }) => [id, position]), [['remaining', 0]]);
const reloadedCrossSubjectLibrary = normalizeLibrary(JSON.parse(JSON.stringify(crossSubjectLibrary)));
assert.deepEqual(reloadedCrossSubjectLibrary.folders.filter(record => ['root', 'child', 'leaf'].includes(record.id)).map(({ id, subjectId, parentId }) => [id, subjectId, parentId]), [
  ['root', 'history', null], ['child', 'history', 'root'], ['leaf', 'history', 'child']
]);
assert.deepEqual(reloadedCrossSubjectLibrary.sets.filter(record => ['study-set', 'in-root'].includes(record.id)).map(({ id, subjectId, folderId }) => [id, subjectId, folderId]), [
  ['study-set', 'history', 'leaf'], ['in-root', 'history', 'root']
]);
assert.equal(reloadedCrossSubjectLibrary.sets.find(record => record.id === 'study-set').cardThemeId, 'original');
assert.equal(crossSubjectLibrary.cards, cardsBeforeCrossSubjectMove);
assert.equal(crossSubjectLibrary.studySessions, sessionsBeforeCrossSubjectMove);
assert.equal(reloadedCrossSubjectLibrary.cards[0].attemptCount, 3);

const moveSetAcross = { type: 'set', id: 'loose', subjectId: 'history', folderId: 'destination', targetId: 'already-there', placement: 'before' };
assert.equal(moveLibraryItem(crossSubjectLibrary, moveSetAcross), true);
assert.deepEqual(getLibrarySiblings(crossSubjectLibrary, 'set', 'loose').map(({ id }) => id), ['loose', 'already-there']);
assert.equal(canMoveLibraryItem(crossSubjectLibrary, moveSetAcross), false, 'dropping on the same insertion point is a no-op');
assert.equal(moveLibraryItem(crossSubjectLibrary, { ...moveSetAcross, placement: 'after' }), true, 'an insertion target also sorts within the current folder');
assert.deepEqual(getLibrarySiblings(crossSubjectLibrary, 'set', 'loose').map(({ id }) => id), ['already-there', 'loose']);
assert.equal(moveLibraryItem(crossSubjectLibrary, { type: 'set', id: 'loose', subjectId: 'french', folderId: null }), true);
assert.equal(crossSubjectLibrary.sets.find(record => record.id === 'loose').subjectId, 'french');

console.log('Data checks passed: storage and session restore, learning progress, library organization, auto-naming, independent missed-card copies, side swapping, and 50,000-card import batches.');
