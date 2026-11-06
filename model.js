(() => {
  'use strict';

  const emptyLibrary = () => ({ subjects: [], folders: [], sets: [], cards: [], recent: [], studySessions: {}, studyHistory: [] });
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const records = value => Array.isArray(value) ? value.filter(isRecord) : [];
  const count = value => Number.isFinite(value) && value >= 0 ? value : 0;

  const libraryCollectionKey = type => ({ subject: 'subjects', folder: 'folders', set: 'sets' })[type];
  const libraryScope = (record, type) => type === 'subject' ? 'subjects' : JSON.stringify([
    record.subjectId || null, type === 'folder' ? record.parentId || null : record.folderId || null
  ]);
  const hasLibraryPosition = record => Number.isSafeInteger(record.position) && record.position >= 0;
  const orderedLibraryRecords = collection => collection.map((record, index) => ({ record, index })).sort((a, b) => {
    if (hasLibraryPosition(a.record) && hasLibraryPosition(b.record)) return a.record.position - b.record.position || a.index - b.index;
    if (hasLibraryPosition(a.record) !== hasLibraryPosition(b.record)) return hasLibraryPosition(a.record) ? -1 : 1;
    return a.index - b.index;
  }).map(({ record }) => record);

  // Position lives inside each existing JSON record. Array indices are only
  // presentation order and never identify a subject, folder, or learning set.
  function normalizeLibraryOrder(collection, type) {
    const scopes = new Map();
    for (const record of collection) {
      const key = libraryScope(record, type);
      if (!scopes.has(key)) scopes.set(key, []);
      scopes.get(key).push(record);
    }
    for (const [key, group] of scopes) scopes.set(key, { records: orderedLibraryRecords(group).map((record, position) => ({ ...record, position })), index: 0 });
    return collection.map(record => {
      const group = scopes.get(libraryScope(record, type));
      return group.records[group.index++];
    });
  }

  function normalizeFolderParents(folders) {
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    for (const folder of folders) {
      if (!folder.parentId) continue;
      const parent = byId.get(folder.parentId);
      if (!parent || parent.id === folder.id || parent.subjectId !== folder.subjectId) folder.parentId = null;
    }
    const state = new Map();
    for (const folder of folders) {
      if (state.has(folder.id)) continue;
      const path = [];
      let current = folder;
      while (current && !state.has(current.id)) {
        state.set(current.id, 'visiting');
        path.push(current);
        current = byId.get(current.parentId);
      }
      // Break one edge, retaining every folder and all learning set relations.
      if (current && state.get(current.id) === 'visiting') current.parentId = null;
      for (const item of path) state.set(item.id, 'done');
    }
    return folders;
  }

  function getFolderDescendantIds(library, folderId) {
    const folders = records(library?.folders);
    const root = folders.find(folder => folder.id === folderId);
    if (!root) return [];
    const children = new Map();
    for (const folder of folders) {
      if (folder.subjectId !== root.subjectId || !folder.parentId) continue;
      if (!children.has(folder.parentId)) children.set(folder.parentId, []);
      children.get(folder.parentId).push(folder.id);
    }
    const visited = new Set([folderId]);
    const result = [];
    const queue = [folderId];
    for (let index = 0; index < queue.length; index++) {
      for (const childId of children.get(queue[index]) || []) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        result.push(childId);
        queue.push(childId);
      }
    }
    return result;
  }

  function getLibrarySiblings(library, type, id) {
    const key = libraryCollectionKey(type);
    if (!key || !Array.isArray(library?.[key])) return [];
    const collection = records(library[key]);
    const source = collection.find(record => record.id === id);
    if (!source) return [];
    return orderedLibraryRecords(collection.filter(record => libraryScope(record, type) === libraryScope(source, type)));
  }

  // Call after changing an item's scope and before inserting a new item. The
  // current record is excluded, so moving between folders always appends safely.
  function nextLibraryPosition(library, type, item) {
    const key = libraryCollectionKey(type);
    if (!key || !isRecord(item)) return 0;
    const siblings = records(library?.[key]).filter(record => record.id !== item.id && libraryScope(record, type) === libraryScope(item, type));
    return siblings.reduce((last, record) => Math.max(last, hasLibraryPosition(record) ? record.position : -1), -1) + 1;
  }

  function reorderLibraryItems(library, { type, id, targetId, placement = 'before' } = {}) {
    const key = libraryCollectionKey(type);
    if (!key || typeof id !== 'string' || typeof targetId !== 'string' || id === targetId || !['before', 'after'].includes(placement)) return false;
    const siblings = getLibrarySiblings(library, type, id);
    if (!siblings.some(record => record.id === targetId) || new Set(siblings.map(record => record.id)).size !== siblings.length) return false;
    const source = siblings.find(record => record.id === id);
    const ordered = siblings.filter(record => record.id !== id);
    const targetIndex = ordered.findIndex(record => record.id === targetId) + (placement === 'after' ? 1 : 0);
    ordered.splice(targetIndex, 0, source);
    if (ordered.every((record, index) => record === siblings[index])) return false;
    ordered.forEach((record, position) => { record.position = position; });
    let next = 0;
    library[key] = library[key].map(record => isRecord(record) && libraryScope(record, type) === libraryScope(source, type) ? ordered[next++] : record);
    return true;
  }

  // Shared by drop feedback and the committed move, so a highlighted target
  // always follows exactly the same ownership and ancestry checks as a move.
  function canMoveLibraryItem(library, { type, id, folderId } = {}) {
    if (!['set', 'folder'].includes(type) || typeof id !== 'string' || !id ||
      !(folderId === null || (typeof folderId === 'string' && folderId))) return false;
    const key = libraryCollectionKey(type);
    if (!isRecord(library) || !Array.isArray(library[key])) return false;
    const collection = records(library[key]);
    if (new Set(collection.map(record => record.id)).size !== collection.length) return false;
    const source = collection.find(record => record.id === id);
    if (!source || !source.subjectId || !records(library.subjects).some(subject => subject.id === source.subjectId)) return false;
    const parentField = type === 'folder' ? 'parentId' : 'folderId';
    if ((source[parentField] || null) === folderId) return false;

    const folders = records(library.folders);
    if (new Set(folders.map(folder => folder.id)).size !== folders.length) return false;
    const folderById = new Map(folders.map(folder => [folder.id, folder]));
    if (folderId !== null && !folderById.has(folderId)) return false;
    const ancestry = new Set();
    let ancestor = folderById.get(folderId);
    while (ancestor) {
      if (ancestor.subjectId !== source.subjectId || ancestry.has(ancestor.id) ||
        (type === 'folder' && ancestor.id === source.id)) return false;
      ancestry.add(ancestor.id);
      if (!ancestor.parentId) break;
      ancestor = folderById.get(ancestor.parentId);
      if (!ancestor) return false;
    }
    return true;
  }

  // Moving changes membership; reordering only changes sibling order. Both
  // operations retain stable IDs and never rebuild cards or learning sessions.
  function moveLibraryItem(library, { type, id, folderId, timestamp } = {}) {
    if (!canMoveLibraryItem(library, { type, id, folderId })) return false;
    const key = libraryCollectionKey(type);
    const collection = records(library[key]);
    const source = collection.find(record => record.id === id);
    const parentField = type === 'folder' ? 'parentId' : 'folderId';
    const previousScope = libraryScope(source, type);
    const destinationScope = libraryScope({ ...source, [parentField]: folderId }, type);
    const previousSiblings = orderedLibraryRecords(collection.filter(record => record.id !== id && libraryScope(record, type) === previousScope));
    const destinationSiblings = orderedLibraryRecords(collection.filter(record => record.id !== id && libraryScope(record, type) === destinationScope));
    source[parentField] = folderId;
    if (typeof timestamp === 'string') source.updatedAt = timestamp;
    previousSiblings.forEach((record, position) => { record.position = position; });
    destinationSiblings.push(source);
    destinationSiblings.forEach((record, position) => { record.position = position; });

    // Restore display order inside both affected scopes while leaving unrelated
    // records, cards and their live session references untouched.
    const groups = new Map([
      [previousScope, { items: previousSiblings, index: 0 }],
      [destinationScope, { items: destinationSiblings, index: 0 }]
    ]);
    library[key] = library[key].map(record => {
      if (!isRecord(record)) return record;
      const group = groups.get(libraryScope(record, type));
      return group ? group.items[group.index++] : record;
    });
    return true;
  }

  function normalizeLibrary(value) {
    if (!isRecord(value)) return emptyLibrary();

    const library = { ...emptyLibrary(), ...value };
    for (const key of ['subjects', 'folders', 'sets', 'recent', 'studyHistory']) library[key] = records(value[key]);
    library.folders = normalizeFolderParents(library.folders.map(folder => ({ ...folder })));
    for (const type of ['subject', 'folder', 'set']) {
      const key = libraryCollectionKey(type);
      library[key] = normalizeLibraryOrder(library[key], type);
    }
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
      ...(row.frontExampleSentence ? { frontExampleSentence: row.frontExampleSentence } : {}),
      ...(row.backExampleSentence ? { backExampleSentence: row.backExampleSentence } : {}),
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
      [card.frontExampleSentence, card.backExampleSentence] = [card.backExampleSentence, card.frontExampleSentence];
      if (!card.frontExampleSentence) delete card.frontExampleSentence;
      if (!card.backExampleSentence) delete card.backExampleSentence;
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
    const validIds = new Set(cardIds);
    const orderedCards = cardIds.map(id => byId.get(id));
    const resultsByCardId = Object.create(null);
    for (const [cardId, result] of Object.entries(saved?.resultsByCardId || {})) {
      if (validIds.has(cardId) && (result === null || typeof result === 'boolean')) resultsByCardId[cardId] = result;
    }
    if (Array.isArray(saved?.results) && Array.isArray(saved?.cardIds)) saved.cardIds.forEach((cardId, index) => {
      if (validIds.has(cardId) && resultsByCardId[cardId] === undefined && (saved.results[index] === null || typeof saved.results[index] === 'boolean')) resultsByCardId[cardId] = saved.results[index];
    });
    for (const cardId of cardIds) if (resultsByCardId[cardId] === undefined) resultsByCardId[cardId] = null;

    const fallbackIndex = Number.isInteger(saved?.index) ? Math.max(0, Math.min(saved.index, cardIds.length - 1)) : 0;
    const fallbackCurrent = cardIds[fallbackIndex];
    const savedHistory = Array.isArray(saved?.historyCardIds) ? saved.historyCardIds.filter(id => validIds.has(id)) : [];
    const savedCurrent = typeof saved?.currentCardId === 'string' && validIds.has(saved.currentCardId) ? saved.currentCardId : fallbackCurrent;
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
      currentCardId: currentCardId || cardIds[0] || null,
      shuffleRemainingCardIds: Array.isArray(saved?.shuffleRemainingCardIds) ? [...new Set(saved.shuffleRemainingCardIds.filter(id => validIds.has(id) && (historyIndex < historyCardIds.length - 1 || id !== currentCardId)))] : []
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
    if (session.shuffleRemainingCardIds?.length) return session.shuffleRemainingCardIds[0];
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
    session.shuffleRemainingCardIds = (session.shuffleRemainingCardIds || []).filter(id => id !== cardId);
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

  function shuffleStudyCards(session, random = Math.random) {
    if (!session || session.cards.length < 2) return false;
    const shuffled = session.cards.slice();
    for (let index = shuffled.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    // A mix deliberately replaces the visible card too. Keep the remaining
    // permutation random while avoiding a seemingly inactive mix button.
    if (shuffled[0].id === session.currentCardId) {
      const target = 1 + Math.floor(random() * (shuffled.length - 1));
      [shuffled[0], shuffled[target]] = [shuffled[target], shuffled[0]];
    }
    session.cards = shuffled;
    session.shuffleRemainingCardIds = shuffled.slice(1).map(card => card.id);
    // Start a new forward branch, retaining the path back to the current card.
    // Every card in the replaced branch also belongs to the new full schedule.
    session.historyCardIds = session.historyCardIds.slice(0, session.historyIndex + 1);
    session.historyCardIds.push(shuffled[0].id);
    session.historyIndex = session.historyCardIds.length - 1;
    session.currentCardId = shuffled[0].id;
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

  const api = { normalizeLibrary, getLibrarySiblings, reorderLibraryItems, canMoveLibraryItem, moveLibraryItem, nextLibraryPosition, getFolderDescendantIds, createImportedCards, createCopiedCards, nextSetName, swapSetCardSides, recordCardAnswer, updateCardAnswer, createStudySession, getStudyResults, getStudyResult, getStudyCurrentIndex, getStudyCard, getNextStudyCardId, visitStudyCard, navigateStudySession, shuffleStudyCards, setStudyAnswer, getCardProgress, getSetProgress, resetSetProgress, summarizeResults, summarizeSession, nextUnratedIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkModel = api;
})();
