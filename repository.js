import { supabase } from './supabaseClient.js';
import { LIBRARY_TABLE_FIELDS, LIBRARY_TABLES, createLibraryLoadGuard, createLibraryWriter, createPendingRecovery, deriveRecentStudySets, claimLegacyCache, LIBRARY_STORAGE_KEY, LEGACY_MIGRATION_KEY, readAllRows } from './repository-core.mjs';

const tables = LIBRARY_TABLES;
const fieldMap = LIBRARY_TABLE_FIELDS;
export { readAllRows, userLibraryCacheKey, mergePendingLibrary } from './repository-core.mjs';
const fromRow = row => row.data;
let browserStorage;
try { browserStorage = globalThis.localStorage; } catch { /* Browser storage can be disabled independently of network saves. */ }
const recovery = createPendingRecovery({ storage: browserStorage });
const loadGuard = createLibraryLoadGuard();
const failedWrites = new Set();
export function resetLibraryOwner() { loadGuard.reset(); }
export function getPendingRecovery() { return recovery.get(loadGuard.activeUserId); }
export function discardPendingRecovery() { recovery.discard(loadGuard.activeUserId); }
export function stagePendingRecovery(library) { return recovery.stage(loadGuard.activeUserId, library); }
function emitSaveState(name, detail) {
  if (loadGuard.activeUserId && detail.userId === loadGuard.activeUserId) window.dispatchEvent(new CustomEvent(name, { detail }));
}
const writer = createLibraryWriter({
  client: supabase,
  onStart(detail) { emitSaveState('library-save-start', detail); },
  onSuccess(detail) {
    failedWrites.delete(detail.userId);
    emitSaveState('library-save-success', detail);
  },
  onError(error, state) {
    if (state.userId) failedWrites.add(state.userId);
    console.error('Supabase-Speichern fehlgeschlagen.', error);
    emitSaveState('library-save-error', { ...state, error });
  }
});

export async function loadLibrary(normalize, { client = supabase, storage = browserStorage, persist = saveLibrary } = {}) {
  const ticket = loadGuard.begin();
  await writer.flush();
  const user = await loadGuard.verifyOwner(ticket, client);
  const tableResults = await Promise.all(tables.map(async table => {
    const rows = await readAllRows(client.from(table).select('*').eq('user_id', user.id).order('id', { ascending: true }));
    return [fieldMap[table] || table, rows.map(fromRow)];
  }));
  const result = Object.fromEntries(tableResults);
  const hasRemote = tables.some(table => result[fieldMap[table] || table].length > 0);
  result.studySessions = Object.fromEntries(result.studySessions.map(record => [record.setId, record]));
  const remote = normalize(result);
  remote.recent = deriveRecentStudySets(remote);
  await loadGuard.verifyOwner(ticket, client, user.id);
  writer.prime(user.id, remote);
  let localRaw = null;
  let migrationOwner = null;
  try {
    localRaw = storage?.getItem(LIBRARY_STORAGE_KEY) ?? null;
    migrationOwner = storage?.getItem(LEGACY_MIGRATION_KEY) ?? null;
  } catch (error) {
    migrationOwner = 'unavailable';
    console.warn('Lokaler Lernkarten-Cache konnte nicht geprüft werden.', error);
  }
  const legacy = await claimLegacyCache({ legacyRaw: localRaw, migrationOwner, hasRemote, remote, normalize, persist, userId: user.id, storage, assertCurrent: () => loadGuard.assertCurrent(ticket) });
  await loadGuard.verifyOwner(ticket, client, user.id);
  loadGuard.commit(ticket, user.id);
  failedWrites.delete(user.id);
  if (legacy.imported || (localRaw && !migrationOwner)) return legacy.library;
  return remote;
}

export function saveLibrary(library, suppliedUserId) {
  const userId = suppliedUserId || loadGuard.activeUserId;
  const token = recovery.stage(userId, library);
  return writer.save(library, userId).then(() => { recovery.acknowledge(userId, token); });
}

export async function flushLibraryWrites() {
  const userId = loadGuard.activeUserId;
  await writer.flush();
  if (!userId || loadGuard.activeUserId !== userId) {
    throw new Error('Die aktive Sitzung hat sich geändert. Bitte versuche es erneut.');
  }
  if (failedWrites.has(userId) || recovery.get(userId)) {
    throw new Error('In deiner Bibliothek sind Änderungen offen. Speichere sie zuerst oder kläre die Wiederherstellung.');
  }
  return userId;
}
