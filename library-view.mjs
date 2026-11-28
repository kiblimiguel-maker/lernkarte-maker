// Derived presentation data only; card records and their order stay untouched.
export function libraryCardsBySet(cards) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.setId)) groups.set(card.setId, []);
    groups.get(card.setId).push(card);
  }
  return groups;
}

const searchable = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('de');
const cardTextCache = new WeakMap();

// Cards can be edited in place. Cache the normalised text only while the
// four source fields still match; discarded records can be garbage-collected.
function matchesCard(card, words) {
  let entry = cardTextCache.get(card);
  const { front, back, frontExampleSentence, backExampleSentence } = card;
  if (!entry || entry.front !== front || entry.back !== back ||
      entry.frontExampleSentence !== frontExampleSentence || entry.backExampleSentence !== backExampleSentence) {
    entry = { front, back, frontExampleSentence, backExampleSentence,
      text: searchable([front, back, frontExampleSentence, backExampleSentence].join(' ')) };
    cardTextCache.set(card, entry);
  }
  return words.every(word => entry.text.includes(word));
}

// Search the current library scope without changing saved order or ownership.
// Parent names are searchable so a stack can be found by its filing location.
export function searchLibrary(library, query, { subjectId = null, folderId = null, setIds = null, limit = 100 } = {}) {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { subjects: [], folders: [], sets: [], cards: [], total: 0 };
  const subjects = new Map(library.subjects.map(item => [item.id, item]));
  const folders = new Map(library.folders.map(item => [item.id, item]));
  const recentIds = setIds ? new Set(setIds) : null;
  const withinFolder = new Set();
  if (folderId) {
    const children = new Map();
    for (const item of library.folders) {
      if (!children.has(item.parentId)) children.set(item.parentId, []);
      children.get(item.parentId).push(item.id);
    }
    const pending = [folderId];
    while (pending.length) {
      const current = pending.pop();
      if (withinFolder.has(current)) continue;
      withinFolder.add(current);
      pending.push(...(children.get(current) || []));
    }
  }
  const location = (item, parentId) => {
    const names = [], seen = new Set();
    let parent = folders.get(parentId);
    while (parent && parent.subjectId === item.subjectId && !seen.has(parent.id)) {
      seen.add(parent.id);names.unshift(parent.name);parent = folders.get(parent.parentId);
    }
    const subjectName = subjects.get(item.subjectId)?.name;
    if (subjectName) names.unshift(subjectName);
    return names.join(' / ');
  };
  const matches = (item, path) => {
    const value = searchable(`${item.name || ''} ${path}`);
    return words.every(word => value.includes(word));
  };
  const foundSubjects = !subjectId && !folderId && !recentIds
    ? library.subjects.filter(item => matches(item, '')).map(item => ({ item, path: 'Bibliothek' })) : [];
  const foundFolders = !recentIds ? library.folders.filter(item =>
    (!subjectId || item.subjectId === subjectId) && (!folderId || item.id !== folderId && withinFolder.has(item.id))
  ).map(item => ({ item, path: location(item, item.parentId) })).filter(({ item, path }) => matches(item, path)) : [];
  const scopedSets = library.sets.filter(item =>
    (!subjectId || item.subjectId === subjectId) && (!folderId || withinFolder.has(item.folderId)) && (!recentIds || recentIds.has(item.id))
  ).map(item => ({ item, path: location(item, item.folderId) }));
  const foundSets = scopedSets.filter(({ item, path }) => matches(item, path));
  const parents = new Map(scopedSets.map(entry => [entry.item.id, entry]));
  let remaining = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100);
  const take = items => { const selected = items.slice(0, remaining);remaining -= selected.length;return selected; };
  const results = { subjects: take(foundSubjects), folders: take(foundFolders), sets: take(foundSets), cards: [],
    total: foundSubjects.length + foundFolders.length + foundSets.length };
  for (const card of library.cards || []) {
    const parent = parents.get(card.setId);
    if (!parent || !matchesCard(card, words)) continue;
    results.total++;
    if (results.cards.length < remaining) {
      results.cards.push({ item: card, path: [parent.path, parent.item.name].filter(Boolean).join(' / ') });
    }
  }
  return results;
}

export function cardListPage(cards, query = '', limit = 100) {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  const count = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100);
  if (!words.length) return { cards: cards.slice(0, count), total: cards.length };
  const page = [];
  let total = 0;
  for (const card of cards) {
    if (!matchesCard(card, words)) continue;
    total++;
    if (page.length < count) page.push(card);
  }
  return { cards: page, total };
}
