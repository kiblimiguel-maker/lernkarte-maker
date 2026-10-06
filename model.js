(() => {
  'use strict';

  const emptyLibrary = () => ({ subjects: [], folders: [], sets: [], cards: [], recent: [], studySessions: {}, studyHistory: [] });
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const records = value => Array.isArray(value) ? value.filter(isRecord) : [];
  const count = value => Number.isFinite(value) && value >= 0 ? value : 0;

  function normalizeLibrary(value) {
    if (!isRecord(value)) return emptyLibrary();

    const library = { ...emptyLibrary(), ...value };
    for (const key of ['subjects', 'folders', 'sets', 'recent', 'studyHistory']) library[key] = records(value[key]);
    library.studySessions = isRecord(value.studySessions) ? Object.fromEntries(Object.entries(value.studySessions).filter(([, session]) =>
      isRecord(session) && Array.isArray(session.cardIds) && Array.isArray(session.results) && session.cardIds.length > 0 && session.cardIds.length === session.results.length && session.cardIds.every(cardId => typeof cardId === 'string') && session.results.every(result => result === null || typeof result === 'boolean') && Number.isInteger(session.index) && session.index >= 0 && session.index < session.cardIds.length
    )) : {};
    library.cards = records(value.cards).map((card, index) => ({
      ...card,
      position: Number.isFinite(card.position) ? card.position : index,
      correctCount: count(card.correctCount),
      incorrectCount: count(card.incorrectCount),
      attemptCount: Math.max(count(card.attemptCount), count(card.correctCount) + count(card.incorrectCount))
    }));
    return library;
  }

  function createImportedCards(rows, { setId, position, timestamp, createId }) {
    return rows.map((row, index) => ({
      id: createId(),
      setId,
      front: row.front,
      back: row.back,
      position: position + index,
      correctCount: 0,
      incorrectCount: 0,
      attemptCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }));
  }

  function recordCardAnswer(card, known, timestamp) {
    if (known) card.correctCount = count(card.correctCount) + 1;
    else card.incorrectCount = count(card.incorrectCount) + 1;
    card.attemptCount = count(card.attemptCount) + 1;
    card.lastReviewedAt = timestamp;
    card.nextReviewAt = new Date(new Date(timestamp).getTime() + (known ? 86400000 : 600000)).toISOString();
    card.updatedAt = timestamp;
    return card;
  }

  function getCardProgress(card) {
    const attempts = Math.max(count(card.attemptCount), count(card.correctCount) + count(card.incorrectCount));
    const state = !attempts ? 'new' : count(card.correctCount) >= 2 && count(card.correctCount) > count(card.incorrectCount) ? 'secure' : 'practice';
    return { attempts, state };
  }

  function getSetProgress(cards) {
    const progress = { total: cards.length, secure: 0, practice: 0, new: 0, percentage: 0 };
    for (const card of cards) progress[getCardProgress(card).state]++;
    progress.percentage = progress.total ? Math.round(progress.secure / progress.total * 100) : 0;
    return progress;
  }

  function resetSetProgress(library, setId) {
    if (!isRecord(library) || typeof setId !== 'string') return 0;
    let resetCount = 0;
    for (const card of records(library.cards)) {
      if (card.setId !== setId) continue;
      card.correctCount = 0;
      card.incorrectCount = 0;
      card.attemptCount = 0;
      card.lastReviewedAt = null;
      card.nextReviewAt = null;
      resetCount++;
    }
    if (isRecord(library.studySessions)) delete library.studySessions[setId];
    return resetCount;
  }

  function summarizeResults(results) {
    const known = results.filter(result => result === true).length;
    const missed = results.filter(result => result === false).length;
    const unrated = results.length - known - missed;
    const evaluated = known + missed;
    return { known, missed, unrated, evaluated, percentage: evaluated ? Math.round(known / evaluated * 100) : 0 };
  }

  function summarizeSession(session, completedAt) {
    return {
      id: session.id,
      setId: session.setId,
      startedAt: session.startedAt,
      completedAt,
      cardCount: session.cardIds.length,
      ...summarizeResults(session.results)
    };
  }

  function nextUnratedIndex(results, currentIndex) {
    for (let step = 1; step < results.length; step++) {
      const index = (currentIndex + step) % results.length;
      if (results[index] === null) return index;
    }
    return -1;
  }

  const api = { normalizeLibrary, createImportedCards, recordCardAnswer, getCardProgress, getSetProgress, resetSetProgress, summarizeResults, summarizeSession, nextUnratedIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkModel = api;
})();
