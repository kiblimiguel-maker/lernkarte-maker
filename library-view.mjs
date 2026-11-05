// Derived presentation data only; card records and their order stay untouched.
export function libraryCardCounts(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.setId, (counts.get(card.setId) || 0) + 1);
  return counts;
}

const searchable = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('de');
export function cardListPage(cards, query = '', limit = 100) {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean);
  const matches = words.length ? cards.filter(card => {
    const text = searchable([card.front, card.back, card.frontExampleSentence, card.backExampleSentence].join(' '));
    return words.every(word => text.includes(word));
  }) : cards;
  const count = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100);
  return { cards: matches.slice(0, count), total: matches.length };
}
