import assert from 'node:assert/strict';
import { claimLegacyCache, deleteStaleRows, LIBRARY_STORAGE_KEY, LEGACY_MIGRATION_KEY, readAllRows, userLibraryCacheKey } from './repository-core.mjs';

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

console.log('repository.test.mjs passed');
