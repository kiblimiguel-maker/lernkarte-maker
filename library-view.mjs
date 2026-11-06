// Derived presentation data only; card records and their order stay untouched.
export function libraryCardCounts(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.setId, (counts.get(card.setId) || 0) + 1);
  return counts;
}

const searchable = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('de');

// Search the current library scope without changing saved order or ownership.
// Parent names are searchable so a stack can be found by its filing location.
export function searchLibrary(library, query, { subjectId = null, folderId = null, setIds = null, limit = 100 } = {}) {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { subjects: [], folders: [], sets: [], total: 0 };
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
    const value = searchable(`${item.name || ''} ${item.description || ''} ${path}`);
    return words.every(word => value.includes(word));
  };
  const foundSubjects = !subjectId && !folderId && !recentIds
    ? library.subjects.filter(item => matches(item, '')).map(item => ({ item, path: 'Bibliothek' })) : [];
  const foundFolders = !recentIds ? library.folders.filter(item =>
    (!subjectId || item.subjectId === subjectId) && (!folderId || item.id !== folderId && withinFolder.has(item.id))
  ).map(item => ({ item, path: location(item, item.parentId) })).filter(({ item, path }) => matches(item, path)) : [];
  const foundSets = library.sets.filter(item =>
    (!subjectId || item.subjectId === subjectId) && (!folderId || withinFolder.has(item.folderId)) && (!recentIds || recentIds.has(item.id))
  ).map(item => ({ item, path: location(item, item.folderId) })).filter(({ item, path }) => matches(item, path));
  let remaining = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100);
  const take = items => { const selected = items.slice(0, remaining);remaining -= selected.length;return selected; };
  return { subjects: take(foundSubjects), folders: take(foundFolders), sets: take(foundSets), total: foundSubjects.length + foundFolders.length + foundSets.length };
}

export function cardListPage(cards, query = '', limit = 100) {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  const matches = words.length ? cards.filter(card => {
    const text = searchable([card.front, card.back, card.frontExampleSentence, card.backExampleSentence].join(' '));
    return words.every(word => text.includes(word));
  }) : cards;
  const count = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100);
  return { cards: matches.slice(0, count), total: matches.length };
}
