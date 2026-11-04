import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { normalizeLibrary, reorderLibraryItems, moveLibraryItem, getLibrarySiblings } = createRequire(import.meta.url)('./model.js');
import { toLibraryRows, claimLegacyCache, deleteStaleRows, LIBRARY_STORAGE_KEY, LEGACY_MIGRATION_KEY, readAllRows, userLibraryCacheKey } from './repository-core.mjs';

const rows = Array.from({ length: 50_251 }, (_, index) => ({ id: `card-${index}` }));
const ranges = [];
const query = {
  async range(start, end) {
    ranges.push([start, end]);
    return { data: rows.slice(start, end + 1), error: null };
  }
};
assert.equal((await readAllRows(query, 500)).length, 50_251);
assert.deepEqual(ranges.slice(0, 3), [[0, 499], [500, 999], [1000, 1499]]);
assert.deepEqual(ranges.at(-1), [50_000, 50_499]);
assert.equal(ranges.length, 101);
await assert.rejects(readAllRows({ range: async () => ({ data: null, error: new Error('query failed') }) }), /query failed/);
await assert.rejects(readAllRows(query, 0), RangeError);

const existing = Array.from({ length: 1201 }, (_, index) => ({ id: `old-${index}` }));
const deleteBatches = [];
const mockClient = {
  from() {
    return {
      select() { return this; },
      delete() { return this; },
      eq() { return this; },
      order() { return this; },
      async range(start, end) { return { data: existing.slice(start, end + 1), error: null }; },
      in(column, ids) { deleteBatches.push({ column, ids }); return Promise.resolve({ error: null }); }
    };
  }
};
assert.equal(await deleteStaleRows(mockClient, 'cards', 'account-a', ['old-1199', 'old-1200']), 1199);
assert.deepEqual(deleteBatches.map(batch => batch.ids.length), [500, 500, 199]);
assert.equal(deleteBatches.flatMap(batch => batch.ids).includes('old-1199'), false);
assert.equal(deleteBatches.flatMap(batch => batch.ids).includes('old-1200'), false);

const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key)
};
const oldLibrary = { cards: [{ id: 'private-card' }] };
values.set(LIBRARY_STORAGE_KEY, JSON.stringify(oldLibrary));
let persistedFor = null;
const firstAccount = await claimLegacyCache({
  legacyRaw: storage.getItem(LIBRARY_STORAGE_KEY),
  migrationOwner: null,
  hasRemote: false,
  remote: { cards: [] },
  normalize: value => value,
  persist: async (library, userId) => { persistedFor = { library, userId }; },
  userId: 'account-a',
  storage
});
assert.equal(firstAccount.imported, true);
assert.deepEqual(persistedFor, { library: oldLibrary, userId: 'account-a' });
assert.equal(storage.getItem(LEGACY_MIGRATION_KEY), 'account-a');
assert.equal(storage.getItem(LIBRARY_STORAGE_KEY), null);
assert.deepEqual(JSON.parse(storage.getItem(userLibraryCacheKey('account-a'))), oldLibrary);

const secondAccount = await claimLegacyCache({
  legacyRaw: JSON.stringify(oldLibrary),
  migrationOwner: storage.getItem(LEGACY_MIGRATION_KEY),
  hasRemote: false,
  remote: { cards: [] },
  normalize: value => value,
  persist: async () => assert.fail('A second account must never import the legacy cache'),
  userId: 'account-b',
  storage
});
assert.equal(secondAccount.imported, false);
assert.deepEqual(secondAccount.library, { cards: [] });
assert.notEqual(userLibraryCacheKey('account-a'), userLibraryCacheKey('account-b'));

const existingAccountRemote = { cards: [{ id: 'remote-card' }] };
const cacheClaim = await claimLegacyCache({
  legacyRaw: 'stale legacy data',
  migrationOwner: null,
  hasRemote: true,
  remote: existingAccountRemote,
  normalize: () => assert.fail('An existing remote library takes precedence over the old cache'),
  persist: async () => assert.fail('Existing remote data must not be overwritten'),
  userId: 'account-c',
  storage
});
assert.equal(cacheClaim.imported, false);
assert.deepEqual(cacheClaim.library, existingAccountRemote);
assert.equal(storage.getItem(LEGACY_MIGRATION_KEY), 'account-c');

const quotaStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { if (key !== LIBRARY_STORAGE_KEY) throw new Error('storage is full'); values.set(key, value); },
  removeItem: key => values.delete(key)
};
values.set(LIBRARY_STORAGE_KEY, JSON.stringify(oldLibrary));
const originalWarn = console.warn;
console.warn = () => {};
try {
  await claimLegacyCache({
    legacyRaw: quotaStorage.getItem(LIBRARY_STORAGE_KEY), migrationOwner: null, hasRemote: true,
    remote: existingAccountRemote, normalize: value => value, persist: async () => {}, userId: 'account-e', storage: quotaStorage
  });
} finally {
  console.warn = originalWarn;
}
assert.equal(quotaStorage.getItem(LIBRARY_STORAGE_KEY), null, 'a full cache still removes the globally shared legacy value');

values.set(LIBRARY_STORAGE_KEY, '{broken');
await assert.rejects(claimLegacyCache({
  legacyRaw: storage.getItem(LIBRARY_STORAGE_KEY), migrationOwner: null, hasRemote: false,
  remote: { cards: [] }, normalize: value => value, persist: async () => {}, userId: 'account-d', storage
}), /Lokale Bibliothek ist beschädigt/);
assert.equal(storage.getItem(LIBRARY_STORAGE_KEY), '{broken', 'a corrupt legacy cache is left untouched for recovery');

const sortable = normalizeLibrary({
  subjects: [{ id: 'a-subject', name: 'French' }, { id: 'z-subject', name: 'Math' }],
  folders: [
    { id: 'a-folder', subjectId: 'a-subject', parentId: null },
    { id: 'z-folder', subjectId: 'a-subject', parentId: null },
    { id: 'child-a', subjectId: 'a-subject', parentId: 'a-folder' },
    { id: 'child-z', subjectId: 'a-subject', parentId: 'a-folder' }
  ],
  sets: [{ id: 'a-set', subjectId: 'a-subject', folderId: 'a-folder' }, { id: 'z-set', subjectId: 'a-subject', folderId: 'a-folder' }],
  cards: [{ id: 'card', setId: 'a-set', front: 'un livre', back: 'ein Buch', attemptCount: 2, correctCount: 2 }]
});
reorderLibraryItems(sortable, { type: 'subject', id: 'z-subject', targetId: 'a-subject' });
reorderLibraryItems(sortable, { type: 'folder', id: 'z-folder', targetId: 'a-folder' });
reorderLibraryItems(sortable, { type: 'folder', id: 'child-z', targetId: 'child-a' });
reorderLibraryItems(sortable, { type: 'set', id: 'z-set', targetId: 'a-set' });
const persisted = Object.fromEntries(['subjects', 'folders', 'sets', 'cards'].map(table => [table,
  JSON.parse(JSON.stringify(toLibraryRows(table, sortable, 'owner-a'))).sort((a, b) => a.id.localeCompare(b.id))
]));
for (const table of Object.keys(persisted)) assert.ok(persisted[table].every(row => row.user_id === 'owner-a'), 'all persisted rows explicitly belong to the signed-in account');
assert.equal(persisted.folders.find(row => row.id === 'child-a').subject_id, 'a-subject');
assert.equal(persisted.folders.find(row => row.id === 'child-a').data.parentId, 'a-folder', 'nested relationships survive the real repository row encoding');
assert.equal(persisted.sets.find(row => row.id === 'a-set').folder_id, 'a-folder');
const restoredOrder = normalizeLibrary(Object.fromEntries(Object.entries(persisted).map(([table, rows]) => [table, rows.map(row => row.data)])));
assert.deepEqual(restoredOrder.subjects.map(item => item.id), ['z-subject', 'a-subject']);
assert.deepEqual(getLibrarySiblings(restoredOrder, 'folder', 'a-folder').map(item => item.id), ['z-folder', 'a-folder']);
assert.deepEqual(getLibrarySiblings(restoredOrder, 'folder', 'child-a').map(item => item.id), ['child-z', 'child-a']);
assert.deepEqual(restoredOrder.sets.map(item => item.id), ['z-set', 'a-set']);
assert.deepEqual(restoredOrder.cards, sortable.cards, 'saving display order never alters learning content or progress');
const otherOwnerRows = toLibraryRows('subjects', { subjects: [{ id: 'a-subject', name: 'Other account', position: 0 }] }, 'owner-b');
assert.equal(otherOwnerRows[0].user_id, 'owner-b');
assert.equal(persisted.subjects.find(row => row.id === 'a-subject').data.name, 'French', 'same record IDs remain namespaced by account');

const organized = normalizeLibrary({
  subjects: [{ id: 'organization-subject', color: '#c2410c' }],
  folders: [
    { id: 'organization-from', subjectId: 'organization-subject', color: '#2563eb' },
    { id: 'organization-to', subjectId: 'organization-subject', color: '#16a34a' },
    { id: 'organization-nested', subjectId: 'organization-subject', parentId: 'organization-from', color: '#9333ea' }
  ],
  sets: [
    { id: 'organization-first', subjectId: 'organization-subject', folderId: 'organization-to', cardThemeId: 'original' },
    { id: 'organization-moved', subjectId: 'organization-subject', folderId: 'organization-from', cardThemeId: 'sky-mint' }
  ],
  cards: [{ id: 'organization-card', setId: 'organization-moved', front: 'une maison', back: 'ein Haus', attemptCount: 5, correctCount: 3, incorrectCount: 2 }]
});
assert.equal(moveLibraryItem(organized, { type: 'set', id: 'organization-moved', folderId: 'organization-to' }), true);
assert.equal(moveLibraryItem(organized, { type: 'folder', id: 'organization-nested', folderId: 'organization-to' }), true);
const organizationRows = Object.fromEntries(['subjects', 'folders', 'sets', 'cards'].map(table => [table,
  JSON.parse(JSON.stringify(toLibraryRows(table, organized, 'organization-owner'))).sort((a, b) => a.id.localeCompare(b.id))
]));
assert.ok(Object.values(organizationRows).flat().every(row => row.user_id === 'organization-owner'));
assert.equal(organizationRows.sets.find(row => row.id === 'organization-moved').folder_id, 'organization-to', 'the real relational column follows the moved set');
assert.equal(organizationRows.folders.find(row => row.id === 'organization-nested').data.parentId, 'organization-to');
const organizationReload = normalizeLibrary(Object.fromEntries(Object.entries(organizationRows).map(([table, rows]) => [table, rows.map(row => row.data)])));
assert.deepEqual(getLibrarySiblings(organizationReload, 'set', 'organization-moved').map(item => item.id), ['organization-first', 'organization-moved']);
assert.equal(organizationReload.sets.find(item => item.id === 'organization-moved').cardThemeId, 'sky-mint', 'a per-set design remains independent from destination folder color');
assert.equal(organizationReload.folders.find(item => item.id === 'organization-nested').color, '#9333ea', 'moving a folder preserves its own color');
assert.deepEqual(organizationReload.cards, organized.cards, 'organization persistence preserves every learning counter');
assert.equal(moveLibraryItem(organizationReload, { type: 'set', id: 'organization-moved', folderId: null }), true);
assert.equal(toLibraryRows('sets', organizationReload, 'organization-owner').find(row => row.id === 'organization-moved').folder_id, null, 'moving back to subject level persists a null folder relation');

console.log('repository.test.mjs passed');
