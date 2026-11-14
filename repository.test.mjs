import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { normalizeLibrary, reorderLibraryItems, moveLibraryItem, getLibrarySiblings } = createRequire(import.meta.url)('./model.js');
import { toLibraryRows, claimLegacyCache, createLibraryLoadGuard, createLibraryWriter, createPendingRecovery, deriveRecentStudySets, mergePendingLibrary, deleteStaleRows, LIBRARY_STORAGE_KEY, LEGACY_MIGRATION_KEY, readAllRows, userLibraryCacheKey, userLibraryPendingKey } from './repository-core.mjs';

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

// Exercise real write behavior with a remote store rather than inspecting
// implementation details: unchanged rows and unseen remote additions survive.
const remoteTables = new Map();
const writes = [];
let currentUser = 'writer-owner';
let failNextWrite = false;
let failTable = null;
const writerErrors = [];
const writerClient = {
  auth: { async getUser() { return { data: { user: { id: currentUser } }, error: null }; } },
  async rpc(name, { p_table: table, p_rows: records }) {
    assert.equal(name, 'save_library_organisation_rows');
    for (const { row, expected } of records) {
      const current = remoteTables.get(table).get(`${currentUser}:${row.id}`);
      if (!current || current.data.position !== expected.position) return { error: Object.assign(new Error('stale'), { code: '40001' }) };
    }
    for (const { row } of records) remoteTables.get(table).set(`${row.user_id}:${row.id}`, structuredClone(row));
    return { error: null };
  },
  from(table) {
    if (!remoteTables.has(table)) remoteTables.set(table, new Map());
    return {
      async upsert(records) {
        writes.push({ table, action: 'upsert', count: records.length });
        if (failTable === table) { failTable = null; return { error: new Error('partial failure') }; }
        if (failNextWrite) { failNextWrite = false; return { error: new Error('offline') }; }
        for (const row of records) remoteTables.get(table).set(`${row.user_id}:${row.id}`, structuredClone(row));
        return { error: null };
      },
      delete() { return this; },
      eq(column, userId) { assert.equal(column, 'user_id'); this.userId = userId; return this; },
      async in(column, ids) {
        assert.equal(column, 'id');
        writes.push({ table, action: 'delete', count: ids.length });
        for (const id of ids) remoteTables.get(table).delete(`${this.userId}:${id}`);
        return { error: null };
      }
    };
  }
};
const writer = createLibraryWriter({ client: writerClient, onError: error => writerErrors.push(error) });
const writeLibrary = normalizeLibrary({
  subjects: [{ id: 'writer-subject', name: 'French' }],
  sets: [{ id: 'writer-set', subjectId: 'writer-subject' }],
  cards: Array.from({ length: 1201 }, (_, index) => ({ id: `writer-card-${index}`, setId: 'writer-set', front: `mot ${index}`, back: `Wort ${index}` }))
});
await writer.save(writeLibrary, currentUser);
assert.deepEqual(writes.filter(write => write.table === 'cards').map(write => write.count), [500, 500, 201], 'large saves are batched');
writes.length = 0;
await writer.save(writeLibrary, currentUser);
assert.equal(writes.length, 0, 'unchanged snapshots perform no database writes');
writeLibrary.cards[0].correctCount = 1;
await writer.save(writeLibrary, currentUser);
assert.deepEqual(writes, [{ table: 'cards', action: 'upsert', count: 1 }], 'one answer updates only its changed card');

remoteTables.get('cards').set('writer-owner:from-another-tab', { user_id: 'writer-owner', id: 'from-another-tab', data: { front: 'unseen' } });
remoteTables.get('cards').set('another-owner:writer-card-1', { user_id: 'another-owner', id: 'writer-card-1', data: { front: 'private' } });
writeLibrary.cards = writeLibrary.cards.filter(card => card.id !== 'writer-card-1');
await writer.save(writeLibrary, currentUser);
assert.equal(remoteTables.get('cards').has('writer-owner:writer-card-1'), false);
assert.equal(remoteTables.get('cards').has('writer-owner:from-another-tab'), true, 'a stale tab cannot delete a remote addition it never loaded');
assert.equal(remoteTables.get('cards').has('another-owner:writer-card-1'), true, 'deletion is scoped to the original owner');

writeLibrary.cards[0].back = 'first queued answer';
const queuedFirst = writer.save(writeLibrary, currentUser);
writeLibrary.cards[0].back = 'second queued answer';
const queuedSecond = writer.save(writeLibrary, currentUser);
await Promise.all([queuedFirst, queuedSecond]);
assert.equal(remoteTables.get('cards').get('writer-owner:writer-card-0').data.back, 'second queued answer', 'queued snapshots retain their chronological order');

writeLibrary.cards[0].back = 'recover after failure';
failNextWrite = true;
await assert.rejects(writer.save(writeLibrary, currentUser), /offline/);
await writer.save(writeLibrary, currentUser);
assert.equal(remoteTables.get('cards').get('writer-owner:writer-card-0').data.back, 'recover after failure');
assert.equal(writerErrors.length, 1, 'a failed save is surfaced and does not poison later saves');

const beforePartialSave = structuredClone(writeLibrary);
writeLibrary.subjects[0].name = 'partially written subject';
writeLibrary.cards[0].back = 'pending card';
failTable = 'cards';
await assert.rejects(writer.save(writeLibrary, currentUser), /partial failure/);
assert.equal(remoteTables.get('subjects').get('writer-owner:writer-subject').data.name, 'partially written subject');
await writer.save(beforePartialSave, currentUser);
assert.equal(remoteTables.get('subjects').get('writer-owner:writer-subject').data.name, beforePartialSave.subjects[0].name, 'retrying a rolled-back library repairs a batch that succeeded before a later failure');

const writeCount = writes.length;
currentUser = 'another-owner';
await assert.rejects(writer.save(writeLibrary, 'writer-owner'), /aktive Sitzung hat sich geändert/);
assert.equal(writes.length, writeCount, 'an account switch rejects a pending save before touching remote records');

const organisationOwner = 'organisation-writer-owner';
const organisationTables = ['subjects', 'folders', 'sets'];
const legacyOrganisation = {
  subjects: [{ id: 'source' }, { id: 'destination' }, { id: 'unrelated' }],
  folders: [{ id: 'origin', subjectId: 'source' }, { id: 'target', subjectId: 'destination' }],
  sets: [
    { id: 'moving', subjectId: 'source', folderId: 'origin', name: 'Verben' },
    { id: 'remaining', subjectId: 'source', folderId: 'origin', position: 3 },
    { id: 'target-set', subjectId: 'destination' },
    { id: 'unrelated-set', subjectId: 'unrelated' }
  ],
  cards: [{ id: 'moving-card', setId: 'moving', front: 'fliehen', back: 'fuir', correctCount: 3 }]
};
const organisationRemote = Object.fromEntries(organisationTables.map(table => [table, toLibraryRows(table, structuredClone(legacyOrganisation), organisationOwner)]));
const organisationRequests = [];
const checkedOrganisationWrites = [];
const organisationWrites = [];
let organisationAccount = organisationOwner;
let organisationError;
const organisationClient = {
  auth: { async getUser() { return { data: { user: { id: organisationAccount } }, error: null }; } },
  async rpc(name, payload) {
    if (name === 'save_library_organisation_rows') {
      const { p_table: table, p_rows: entries } = payload;
      checkedOrganisationWrites.push(structuredClone(payload));
      for (const { expected, row } of entries) {
        const current = organisationRemote[table].find(item => item.id === row.id);
        if (!current || current.subject_id !== expected.subjectId || current.folder_id !== expected.folderId ||
          (current.data.position ?? null) !== expected.position) {
          return { error: Object.assign(new Error('stale organisation'), { code: '40001' }) };
        }
      }
      for (const { row } of entries) {
        const index = organisationRemote[table].findIndex(current => current.id === row.id);
        organisationRemote[table][index] = structuredClone(row);
      }
      return { error: null };
    }
    organisationRequests.push({ name, payload: structuredClone(payload) });
    if (organisationError) return { error: organisationError };
    for (const table of organisationTables) {
      for (const change of payload.p_changes[table]) {
        const row = organisationRemote[table].find(item => item.id === change.id);
        Object.assign(row.data, change);
        if (table !== 'subjects') row.subject_id = change.subjectId;
        if (table === 'sets') row.folder_id = change.folderId;
      }
    }
    return { error: null };
  },
  from(table) {
    return { async upsert(records) { organisationWrites.push({ table, records }); return { error: null }; } };
  }
};
const organisationWriter = createLibraryWriter({ client: organisationClient });
const staleOrganisationWriter = createLibraryWriter({ client: organisationClient });
const organisationBefore = normalizeLibrary(legacyOrganisation);
const organisationAfter = structuredClone(organisationBefore);
assert.equal(moveLibraryItem(organisationAfter, { type: 'set', id: 'moving', subjectId: 'destination', folderId: null }), true);
organisationWriter.prime(organisationOwner, organisationBefore, organisationRemote);
staleOrganisationWriter.prime(organisationOwner, organisationBefore, organisationRemote);

organisationError = Object.assign(new Error('organisation changed on another device'), { code: '40001' });
await assert.rejects(organisationWriter.organise(organisationBefore, organisationAfter, organisationOwner), { code: '40001' });
assert.equal(organisationRemote.sets.find(row => row.id === 'moving').folder_id, 'origin');
assert.deepEqual(organisationWrites, [], 'a rejected organisation does not fall back to ordinary writes');
organisationError = null;
await organisationWriter.organise(organisationBefore, organisationAfter, organisationOwner);
assert.deepEqual(organisationRequests[1], organisationRequests[0], 'a failed transaction leaves its baseline intact');
const { name: organisationProcedure, payload: organisationPayload } = organisationRequests[1];
assert.equal(organisationProcedure, 'organise_library');
assert.deepEqual(Object.keys(organisationPayload.p_changes), organisationTables);
assert.equal(organisationPayload.p_expected.sets.find(record => record.id === 'target-set').position, null, 'the expected state uses stored positions, including missing positions');
assert.deepEqual(organisationPayload.p_changes.sets, [
  { id: 'remaining', subjectId: 'source', folderId: 'origin', position: 0 },
  { id: 'target-set', subjectId: 'destination', folderId: null, position: 0 },
  { id: 'moving', subjectId: 'destination', folderId: null, position: 1 }
]);
assert.deepEqual(organisationPayload.p_changes.subjects, []);
assert.deepEqual(organisationPayload.p_changes.folders, []);
assert.equal(organisationRemote.sets.find(row => row.id === 'unrelated-set').data.position, undefined);
assert.equal(organisationRemote.sets.find(row => row.id === 'moving').data.name, 'Verben');
assert.deepEqual(organisationAfter.cards, organisationBefore.cards);

await organisationWriter.save(organisationAfter, organisationOwner);
assert.deepEqual(organisationWrites, [], 'an ordinary save must not repeat a committed move or a legacy-position repair');
const afterLearning = structuredClone(organisationAfter);
afterLearning.cards[0].correctCount += 1;
await organisationWriter.save(afterLearning, organisationOwner);
assert.deepEqual(organisationWrites.map(write => write.table), ['cards'], 'learning after a move updates only the card');

const staleStudy = structuredClone(organisationBefore);
staleStudy.sets.find(set => set.id === 'moving').lastStudiedAt = '2026-11-14T10:00:00.000Z';
await assert.rejects(staleOrganisationWriter.save(staleStudy, organisationOwner), { code: '40001' });
assert.deepEqual(checkedOrganisationWrites[0].p_rows[0].expected,
  { id: 'moving', subjectId: 'source', folderId: 'origin', position: null });
assert.equal(organisationRemote.sets.find(row => row.id === 'moving').subject_id, 'destination', 'a stale learning tab cannot move the set back');
assert.deepEqual(organisationWrites.map(write => write.table), ['cards'], 'a stale metadata update never falls back to an unconditional upsert');

const reloadedOrganisation = normalizeLibrary(Object.fromEntries(organisationTables.map(table => [table, organisationRemote[table].map(row => row.data)])));
staleOrganisationWriter.prime(organisationOwner, reloadedOrganisation, organisationRemote);
reloadedOrganisation.sets.find(set => set.id === 'moving').lastStudiedAt = '2026-11-14T10:00:00.000Z';
await staleOrganisationWriter.save(reloadedOrganisation, organisationOwner);
assert.equal(organisationRemote.sets.find(row => row.id === 'moving').data.lastStudiedAt, '2026-11-14T10:00:00.000Z');
assert.equal(organisationRemote.sets.find(row => row.id === 'moving').subject_id, 'destination', 'retry after reload keeps the current location');

const organisationReturn = structuredClone(afterLearning);
assert.equal(moveLibraryItem(organisationReturn, { type: 'set', id: 'moving', subjectId: 'source', folderId: 'origin' }), true);
organisationAccount = 'someone-else';
await assert.rejects(organisationWriter.organise(afterLearning, organisationReturn, organisationOwner), /aktive Sitzung hat sich geändert/);
assert.equal(organisationRequests.length, 2, 'an account switch cannot start a move');
organisationAccount = organisationOwner;
await organisationWriter.organise(afterLearning, organisationReturn, organisationOwner);
assert.deepEqual(organisationRequests[2].payload.p_expected.sets.find(record => record.id === 'moving'),
  { id: 'moving', subjectId: 'destination', folderId: null, position: 1 }, 'the next move compares against the committed location and position');

const lifecycle = [];
const lifecycleWriter = createLibraryWriter({ client: writerClient, onStart: state => lifecycle.push(['start', state.pending]), onSuccess: state => lifecycle.push(['success', state.pending]), onError: (_error, state) => lifecycle.push(['error', state.pending]) });
await Promise.all([lifecycleWriter.save({ cards: [] }, currentUser), lifecycleWriter.save({ cards: [] }, currentUser)]);
assert.deepEqual(lifecycle, [['start', 1], ['start', 2], ['success', 1], ['success', 0]], 'save status stays pending until the whole queue settles');

const recovery = createPendingRecovery({ storage, now: () => '2026-11-04T18:00:00.000Z' });
const recoveryLibrary = { cards: [{ id: 'offline-card', front: 'un château', back: 'eine Burg' }] };
const firstPending = recovery.stage('offline-owner', recoveryLibrary);
recoveryLibrary.cards[0].back = 'updated while another request runs';
const latestPending = recovery.stage('offline-owner', recoveryLibrary);
recovery.acknowledge('offline-owner', firstPending);
assert.equal(recovery.get('offline-owner').library.cards[0].back, 'updated while another request runs', 'an older successful save must not clear newer pending work');
assert.equal(recovery.get('another-owner'), null, 'pending recovery is namespaced by account');
const recoveryAfterReload = createPendingRecovery({ storage });
assert.equal(recoveryAfterReload.get('offline-owner').savedAt, '2026-11-04T18:00:00.000Z');
assert.deepEqual(recoveryAfterReload.get('offline-owner').library, recoveryLibrary, 'unsynced work survives a fresh repository instance');
recoveryAfterReload.acknowledge('offline-owner', latestPending);
assert.equal(recoveryAfterReload.get('offline-owner'), null, 'only successful persistence of the newest snapshot clears its pending marker');
const staleOrganisationRecovery = recovery.stage('offline-owner', recoveryLibrary);
recovery.preserveOrganisation('offline-owner');
assert.equal(recoveryAfterReload.get('offline-owner').preserveOrganisation, true, 'an organisation conflict survives a fresh repository instance');
assert.equal(recoveryAfterReload.get('offline-owner').token, staleOrganisationRecovery);
assert.equal(recoveryAfterReload.get('offline-owner').savedAt, '2026-11-04T18:00:00.000Z');
recoveryAfterReload.acknowledge('offline-owner', staleOrganisationRecovery);
recovery.stage('offline-owner', recoveryLibrary);
recovery.discard('another-owner');
assert.notEqual(recovery.get('offline-owner'), null);
recovery.discard('offline-owner');
assert.equal(recovery.get('offline-owner'), null, 'explicit discard affects only the browser recovery copy');
values.set(userLibraryPendingKey('broken-owner'), '{invalid');
assert.equal(recovery.get('broken-owner'), null, 'a corrupt recovery copy cannot crash loading');

const remoteRecoveryLibrary = {
  subjects: [{ id: 'shared-subject', name: 'French' }],
  folders: [{ id: 'new-remote-folder', subjectId: 'shared-subject' }],
  sets: [{ id: 'shared-set', name: 'Remote name', lastStudiedAt: '2026-11-01T10:00:00Z' }, { id: 'remote-set', name: 'New remote set' }],
  cards: [{ id: 'shared-card', setId: 'shared-set', front: 'un livre', attemptCount: 2 }, { id: 'remote-card', setId: 'remote-set', front: 'une maison' }],
  studySessions: { 'shared-set': { id: 'remote-session', setId: 'shared-set', startedAt: '2026-11-02T10:00:00Z' }, 'remote-set': { id: 'other-session', setId: 'remote-set', startedAt: '2026-11-01T10:00:00Z' } },
  studyHistory: [{ id: 'remote-completion', setId: 'remote-set', completedAt: '2026-11-03T10:00:00Z' }]
};
const localRecoveryLibrary = {
  subjects: [{ id: 'shared-subject', name: 'Français' }], folders: [],
  sets: [{ id: 'shared-set', name: 'Local edit', lastStudiedAt: '2026-11-04T10:00:00Z' }],
  cards: [{ id: 'shared-card', setId: 'shared-set', front: 'un livre', attemptCount: 3 }, { id: 'local-card', setId: 'shared-set', front: 'un château' }],
  studySessions: { 'shared-set': { id: 'local-session', setId: 'shared-set', startedAt: '2026-11-04T10:00:00Z' } },
  studyHistory: []
};
const mergedRecovery = mergePendingLibrary(remoteRecoveryLibrary, localRecoveryLibrary);
assert.deepEqual(mergedRecovery.sets.map(set => set.id), ['shared-set', 'remote-set']);
assert.equal(mergedRecovery.sets[0].name, 'Local edit');
assert.deepEqual(mergedRecovery.cards.map(card => card.id), ['shared-card', 'remote-card', 'local-card']);
assert.equal(mergedRecovery.cards[0].attemptCount, 3);
assert.equal(mergedRecovery.folders[0].id, 'new-remote-folder', 'recovery preserves folders that were absent from the local snapshot');
assert.equal(mergedRecovery.studySessions['shared-set'].id, 'local-session');
assert.equal(mergedRecovery.studySessions['remote-set'].id, 'other-session');
assert.equal(mergedRecovery.studyHistory[0].id, 'remote-completion', 'recovery never replays deletion of server-only data');
assert.equal(remoteRecoveryLibrary.sets[0].name, 'Remote name');
assert.deepEqual(mergedRecovery.recent.map(entry => entry.setId), ['shared-set', 'remote-set']);
const preservedRecovery = mergePendingLibrary(organisationAfter, staleStudy, { preserveOrganisation: true });
const preservedSet = preservedRecovery.sets.find(set => set.id === 'moving');
assert.equal(preservedSet.subjectId, 'destination');
assert.equal(preservedSet.folderId, null);
assert.equal(preservedSet.position, 1);
assert.equal(preservedSet.lastStudiedAt, '2026-11-14T10:00:00.000Z', 'recovery restores learning activity while preserving the server location');
const recentLibrary = { sets: [{ id: 'from-set', lastStudiedAt: '2026-11-04T10:00:00Z' }, { id: 'from-session' }, { id: 'from-history' }, { id: 'invalid', lastStudiedAt: 'invalid date' }],
  studySessions: { 'from-session': { setId: 'from-session', startedAt: '2026-11-03T10:00:00Z' } },
  studyHistory: [{ setId: 'from-history', completedAt: '2026-11-02T10:00:00Z' }, { setId: 'deleted-set', completedAt: '2026-11-05T10:00:00Z' }],
  recent: [{ setId: 'from-history', at: '2026-11-01T10:00:00Z' }] };
assert.deepEqual(deriveRecentStudySets(recentLibrary), [{ setId: 'from-set', at: '2026-11-04T10:00:00Z' }, { setId: 'from-session', at: '2026-11-03T10:00:00Z' }, { setId: 'from-history', at: '2026-11-02T10:00:00Z' }], 'recent learning survives reload using persisted set timestamps and legacy session/history fallbacks');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const loadGuard = createLibraryLoadGuard();
const authA = deferred();
const ticketA = loadGuard.begin();
const ownerA = loadGuard.verifyOwner(ticketA, { auth: { getUser: () => authA.promise } });
const ticketB = loadGuard.begin();
const clientB = { auth: { getUser: async () => ({ data: { user: { id: 'account-b' } }, error: null }) } };
assert.equal((await loadGuard.verifyOwner(ticketB, clientB)).id, 'account-b');
await loadGuard.verifyOwner(ticketB, clientB, 'account-b');
loadGuard.commit(ticketB, 'account-b');
authA.resolve({ data: { user: { id: 'account-a' } }, error: null });
await assert.rejects(ownerA, error => error.code === 'STALE_LIBRARY_LOAD');
assert.throws(() => loadGuard.commit(ticketA, 'account-a'), error => error.code === 'STALE_LIBRARY_LOAD');
assert.equal(loadGuard.activeUserId, 'account-b', 'an older getUser response cannot replace the newly loaded owner');

const fetchTicket = loadGuard.begin();
assert.equal(loadGuard.activeUserId, null, 'an in-progress load cannot own new writes before data and authentication are verified');
await assert.rejects(loadGuard.verifyOwner(fetchTicket, clientB, 'account-a'), error => error.code === 'STALE_LIBRARY_LOAD');
const logoutAuth = deferred();
const pendingAfterLogout = loadGuard.verifyOwner(fetchTicket, { auth: { getUser: () => logoutAuth.promise } }, 'account-b');
loadGuard.reset();
logoutAuth.resolve({ data: { user: { id: 'account-b' } }, error: null });
await assert.rejects(pendingAfterLogout, error => error.code === 'STALE_LIBRARY_LOAD');
assert.equal(loadGuard.activeUserId, null, 'logout invalidates responses and clears access to the former account recovery cache');

const migrationTicket = loadGuard.begin();
const migrationPersist = deferred();
const interruptedStorage = new Map();
const interruptedMigration = claimLegacyCache({ legacyRaw: JSON.stringify({ cards: [] }), migrationOwner: null, hasRemote: false, remote: {}, normalize: value => value,
  persist: () => migrationPersist.promise, userId: 'account-a',
  storage: { setItem: (key, value) => interruptedStorage.set(key, value), removeItem: key => interruptedStorage.delete(key) },
  assertCurrent: () => loadGuard.assertCurrent(migrationTicket) });
loadGuard.reset();
migrationPersist.resolve();
await assert.rejects(interruptedMigration, error => error.code === 'STALE_LIBRARY_LOAD');
assert.equal(interruptedStorage.has(LEGACY_MIGRATION_KEY), false, 'a superseded migration cannot claim shared legacy cache ownership after awaiting persistence');

console.log('repository.test.mjs passed');
