import assert from 'node:assert/strict';
import { cardListPage, libraryCardCounts, searchLibrary } from './library-view.mjs';
const cards = Array.from({ length: 50000 }, (_, index) => ({ id: String(index), setId: index % 2 ? 'a' : 'b', front: `Begriff ${index}`, back: 'un château', backExampleSentence: 'À côté du musée.' }));
const snapshot = JSON.stringify(cards.slice(0, 5));
assert.equal(libraryCardCounts(cards).get('a'), 25000);
assert.equal(cardListPage(cards).cards.length, 100);
assert.equal(cardListPage(cards, 'CHATEAU musee').total, 50000);
assert.equal(cardListPage(cards, 'Begriff 49999').cards[0].id, '49999');
assert.equal(cardListPage(cards, 'absent').total, 0);
assert.deepEqual(cardListPage([], 'test'), { cards: [], total: 0 });
assert.equal(cardListPage(cards, '', 200).cards[199].id, '199');
assert.equal(JSON.stringify(cards.slice(0, 5)), snapshot);

const library = {
  subjects: [{ id: 'fr', name: 'Français', description: 'Vocabulaire' }, { id: 'science', name: 'Biologie' }],
  folders: [
    { id: 'unit', subjectId: 'fr', name: 'Unité 1' },
    { id: 'grammar', subjectId: 'fr', parentId: 'unit', name: 'Grammaire' },
    { id: 'outside', subjectId: 'fr', name: 'Unité 2' },
    { id: 'cells', subjectId: 'science', name: 'Zellen' }
  ],
  sets: [
    { id: 'loose', subjectId: 'fr', name: 'Grundwortschatz', description: 'Häuser und Gebäude' },
    { id: 'deep', subjectId: 'fr', folderId: 'grammar', name: 'Verbes', description: 'Présent' },
    { id: 'nested', subjectId: 'fr', folderId: 'unit', name: 'Begriffe' },
    { id: 'other', subjectId: 'fr', folderId: 'outside', name: 'Verbes' },
    { id: 'science-set', subjectId: 'science', folderId: 'cells', name: 'Verben der Forschung' }
  ]
};
const originalLibrary = structuredClone(library);
const ids = entries => entries.map(({ item }) => item.id);
assert.deepEqual(searchLibrary(library, ''), { subjects: [], folders: [], sets: [], total: 0 });
assert.deepEqual(ids(searchLibrary(library, 'FRANCAIS').subjects), ['fr']);
assert.deepEqual(ids(searchLibrary(library, 'gebaude').sets), ['loose'], 'descriptions and accents are searchable');
assert.deepEqual(ids(searchLibrary(library, 'francais grammaire present').sets), ['deep'], 'all query words can match name, description and full location');
assert.deepEqual(ids(searchLibrary(library, 'verbes', { subjectId: 'fr' }).sets), ['deep', 'other'], 'subject search includes nested sets but excludes other subjects');
assert.deepEqual(ids(searchLibrary(library, 'verbes', { subjectId: 'fr', folderId: 'unit' }).sets), ['deep'], 'folder search covers its descendants without escaping the branch');
assert.deepEqual(ids(searchLibrary(library, 'grammaire', { subjectId: 'fr', folderId: 'unit' }).folders), ['grammar']);
assert.equal(searchLibrary(library, 'unite', { subjectId: 'fr', folderId: 'unit' }).folders.length, 1, 'the current folder is not its own child result');
assert.equal(searchLibrary(library, 'verbes absent').total, 0, 'all words must match');
assert.deepEqual(ids(searchLibrary(library, 'verbes', { setIds: ['other'] }).sets), ['other'], 'recent search is restricted to its actual set IDs');
assert.deepEqual(ids(searchLibrary(library, 'verbes', { folderId: 'missing' }).sets), [], 'missing scopes do not expose unrelated contents');
assert.equal(searchLibrary(library, 'francais', { limit: 1 }).total, 8, 'bounded output retains an exact total');
assert.equal(searchLibrary(library, 'francais', { limit: 1 }).subjects.length, 1);
assert.equal(searchLibrary(library, 'francais', { limit: 1 }).sets.length, 0);
assert.deepEqual(library, originalLibrary, 'search never modifies records, sort order or parent relationships');

const cyclic = { subjects: library.subjects, folders: [{ id: 'a', subjectId: 'fr', name: 'A', parentId: 'b' }, { id: 'b', subjectId: 'fr', name: 'B', parentId: 'a' }], sets: [{ id: 'cycle', subjectId: 'fr', folderId: 'a', name: 'Cycle' }] };
assert.deepEqual(ids(searchLibrary(cyclic, 'cycle', { subjectId: 'fr', folderId: 'a' }).sets), ['cycle'], 'malformed parent cycles terminate safely');
const largeLibrary = { subjects: [{ id: 'large', name: 'Sammlung' }], folders: [], sets: Array.from({ length: 10000 }, (_, index) => ({ id: `set-${index}`, name: `Stapel ${index}`, subjectId: 'large' })) };
const largeResult = searchLibrary(largeLibrary, 'sammlung');
assert.equal(largeResult.total, 10001);
assert.equal(largeResult.subjects.length + largeResult.sets.length, 100, 'large libraries produce bounded result markup');
assert.deepEqual(ids(searchLibrary(largeLibrary, 'stapel 9999').sets), ['set-9999'], 'search reaches records beyond the rendered first page');

console.log('Library view checks passed: bounded rendering, contextual name/location search, nested scopes, accent-insensitive card search, exact counts and unchanged data.');
