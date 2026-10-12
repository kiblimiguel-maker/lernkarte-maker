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

  function createCopiedCards(cards, { setId, position = 0, timestamp, createId }) {
    return records(cards).map((card, index) => ({
      ...card,
      id: createId(),
      setId,
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

  function nextSetName(sets, subjectId, folderId = null) {
    const used = new Set();
    for (const set of records(sets)) {
      if (set.subjectId !== subjectId || (set.folderId || null) !== (folderId || null)) continue;
      const match = typeof set.name === 'string' ? set.name.match(/^Lernstapel\s+(\d+)$/i) : null;
      if (match) used.add(Number(match[1]));
    }
    let number = 1;
    while (used.has(number)) number++;
    return `Lernstapel ${number}`;
  }

  function swapSetCardSides(cards, setId, timestamp) {
    let swapped = 0;
    for (const card of records(cards)) {
      if (card.setId !== setId) continue;
      [card.front, card.back] = [card.back, card.front];
      if (timestamp) card.updatedAt = timestamp;
      swapped++;
    }
    return swapped;
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

  function updateCardAnswer(card, previousAnswer, nextAnswer, timestamp) {
    if (previousAnswer === null || typeof previousAnswer !== 'boolean') {
      recordCardAnswer(card, nextAnswer, timestamp);
      return;
    }
    if (previousAnswer === nextAnswer) {
      card.lastReviewedAt = timestamp;
      card.nextReviewAt = new Date(new Date(timestamp).getTime() + (nextAnswer ? 86400000 : 600000)).toISOString();
      card.updatedAt = timestamp;
      return;
    }
    if (previousAnswer) card.correctCount = Math.max(0, count(card.correctCount) - 1);
    else card.incorrectCount = Math.max(0, count(card.incorrectCount) - 1);
    if (nextAnswer) card.correctCount = count(card.correctCount) + 1;
    else card.incorrectCount = count(card.incorrectCount) + 1;
    card.attemptCount = Math.max(count(card.attemptCount), card.correctCount + card.incorrectCount);
    card.lastReviewedAt = timestamp;
    card.nextReviewAt = new Date(new Date(timestamp).getTime() + (nextAnswer ? 86400000 : 600000)).toISOString();
    card.updatedAt = timestamp;
  }

  function createStudySession(cards, saved = null) {
    const byId = new Map(records(cards).filter(card => typeof card.id === 'string').map(card => [card.id, card]));
    const savedIds = Array.isArray(saved?.cardIds) ? [...new Set(saved.cardIds.filter(id => byId.has(id)))] : [];
    const cardIds = savedIds.length ? savedIds : [...byId.keys()];
    const orderedCards = cardIds.map(id => byId.get(id));
    const resultsByCardId = Object.create(null);
    for (const [cardId, result] of Object.entries(saved?.resultsByCardId || {})) {
      if (byId.has(cardId) && (result === null || typeof result === 'boolean')) resultsByCardId[cardId] = result;
    }
    if (Array.isArray(saved?.results)) saved.cardIds.forEach((cardId, index) => {
      if (byId.has(cardId) && resultsByCardId[cardId] === undefined && (saved.results[index] === null || typeof saved.results[index] === 'boolean')) resultsByCardId[cardId] = saved.results[index];
    });
    for (const cardId of cardIds) if (resultsByCardId[cardId] === undefined) resultsByCardId[cardId] = null;

    const fallbackIndex = Number.isInteger(saved?.index) ? Math.max(0, Math.min(saved.index, cardIds.length - 1)) : 0;
    const fallbackCurrent = cardIds[fallbackIndex];
    const savedHistory = Array.isArray(saved?.historyCardIds) ? saved.historyCardIds.filter(id => byId.has(id)) : [];
    const savedCurrent = typeof saved?.currentCardId === 'string' && byId.has(saved.currentCardId) ? saved.currentCardId : fallbackCurrent;
    let historyCardIds = savedHistory.length ? savedHistory : cardIds.slice(0, fallbackIndex + 1);
    let historyIndex = Number.isInteger(saved?.historyIndex) ? Math.max(0, Math.min(saved.historyIndex, historyCardIds.length - 1)) : historyCardIds.length - 1;
    if (!savedHistory.length) {
      const visited = new Set(historyCardIds);
      for (const cardId of cardIds) if (resultsByCardId[cardId] !== null && !visited.has(cardId)) {
        historyCardIds.push(cardId);
        visited.add(cardId);
      }
    }
    if (savedCurrent && historyCardIds[historyIndex] !== savedCurrent) {
      const currentInHistory = historyCardIds.lastIndexOf(savedCurrent);
      if (currentInHistory >= 0) historyIndex = currentInHistory;
      else {
        historyCardIds = historyCardIds.slice(0, historyIndex + 1);
        historyCardIds.push(savedCurrent);
        historyIndex = historyCardIds.length - 1;
      }
    }
    const currentCardId = historyCardIds[historyIndex];
    return {
      id: saved?.id,
      setId: saved?.setId,
      startedAt: saved?.startedAt,
      cards: orderedCards,
      resultsByCardId,
      historyCardIds,
      historyIndex,
      currentCardId: currentCardId || cardIds[0] || null
    };
  }

  function getStudyResults(session) {
    return session.cards.map(card => session.resultsByCardId[card.id] ?? null);
  }

  function getStudyResult(session, cardId = session?.currentCardId) {
    return session && cardId ? (session.resultsByCardId[cardId] ?? null) : null;
  }

  function getStudyCurrentIndex(session) {
    return session?.cards.findIndex(card => card.id === session.currentCardId) ?? -1;
  }

  function getStudyCard(session, cardId = session?.currentCardId) {
    return session?.cards.find(card => card.id === cardId) || null;
  }

  function getNextStudyCardId(session) {
    if (!session?.cards.length) return null;
    if (session.historyIndex < session.historyCardIds.length - 1) return session.historyCardIds[session.historyIndex + 1];
    const currentIndex = getStudyCurrentIndex(session);
    const visited = new Set(session.historyCardIds);
    for (const [cardId, result] of Object.entries(session.resultsByCardId)) if (result !== null) visited.add(cardId);
    const findNext = predicate => {
      for (let step = 1; step < session.cards.length; step++) {
        const card = session.cards[(currentIndex + step + session.cards.length) % session.cards.length];
        if (getStudyResult(session, card.id) === null && predicate(card.id)) return card.id;
      }
      return null;
    };
    return findNext(cardId => !visited.has(cardId)) || findNext(() => true);
  }

  function visitStudyCard(session, cardId) {
    if (!session || !session.cards.some(card => card.id === cardId) || cardId === session.currentCardId) return false;
    const forwardIndex = session.historyCardIds.indexOf(cardId, session.historyIndex + 1);
    if (forwardIndex >= 0) {
      session.historyIndex = forwardIndex;
      session.currentCardId = cardId;
      return true;
    }
    session.historyCardIds = session.historyCardIds.slice(0, session.historyIndex + 1);
    session.historyCardIds.push(cardId);
    session.historyIndex = session.historyCardIds.length - 1;
    session.currentCardId = cardId;
    return true;
  }

  function navigateStudySession(session, direction) {
    if (!session || ![-1, 1].includes(direction)) return false;
    if (direction < 0) {
      if (session.historyIndex <= 0) return false;
      session.historyIndex--;
      session.currentCardId = session.historyCardIds[session.historyIndex];
      return true;
    }
    const nextCardId = getNextStudyCardId(session);
    return nextCardId ? visitStudyCard(session, nextCardId) : false;
  }

  function shuffleUnvisitedStudyCards(session, random = Math.random) {
    if (!session?.cards.length) return false;
    const visited = new Set(session.historyCardIds);
    for (const [cardId, result] of Object.entries(session.resultsByCardId)) if (result !== null) visited.add(cardId);
    const unvisited = session.cards.filter(card => !visited.has(card.id));
    if (unvisited.length < 2) return false;
    for (let index = unvisited.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [unvisited[index], unvisited[target]] = [unvisited[target], unvisited[index]];
    }
    let next = 0;
    session.cards = session.cards.map(card => visited.has(card.id) ? card : unvisited[next++]);
    return true;
  }

  function setStudyAnswer(session, cardId, answer) {
    if (!session?.resultsByCardId || !Object.hasOwn(session.resultsByCardId, cardId) || typeof answer !== 'boolean') return null;
    const previous = session.resultsByCardId[cardId];
    session.resultsByCardId[cardId] = answer;
    return previous;
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

  const api = { normalizeLibrary, createImportedCards, createCopiedCards, nextSetName, swapSetCardSides, recordCardAnswer, updateCardAnswer, createStudySession, getStudyResults, getStudyResult, getStudyCurrentIndex, getStudyCard, getNextStudyCardId, visitStudyCard, navigateStudySession, shuffleUnvisitedStudyCards, setStudyAnswer, getCardProgress, getSetProgress, resetSetProgress, summarizeResults, summarizeSession, nextUnratedIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkModel = api;
})();
