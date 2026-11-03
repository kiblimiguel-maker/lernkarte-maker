import { supabase } from './supabaseClient.js';
import { claimLegacyCache, deleteStaleRows, LIBRARY_PAGE_SIZE, LIBRARY_STORAGE_KEY, LEGACY_MIGRATION_KEY, readAllRows, userLibraryCacheKey } from './repository-core.mjs';

const tables = ['subjects', 'folders', 'sets', 'cards', 'study_sessions', 'study_history'];
const fieldMap = { study_sessions: 'studySessions', study_history: 'studyHistory' };
export { readAllRows, userLibraryCacheKey } from './repository-core.mjs';
const toRows = (table, library, userId) => {
  const key = fieldMap[table];
  const records = key === 'studySessions' ? Object.values(library[key] || {}) : library[key || table] || [];
  return records.map(record => ({ user_id: userId, id: record.id, ...(table === 'folders' ? { subject_id: record.subjectId } : {}), ...(table === 'sets' ? { subject_id: record.subjectId, folder_id: record.folderId || null } : {}), ...(table === 'cards' ? { set_id: record.setId } : {}), ...(table === 'study_sessions' || table === 'study_history' ? { set_id: record.setId } : {}), data: record }));
};
const fromRow = row => row.data;

export async function loadLibrary(normalize, { client = supabase, storage = globalThis.localStorage, persist = saveLibrary } = {}) {
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw userError || new Error('Keine aktive Sitzung');
  activeUserId = user.id;
  const tableResults = await Promise.all(tables.map(async table => {
    const rows = await readAllRows(client.from(table).select('*').eq('user_id', user.id).order('id', { ascending: true }));
    return [fieldMap[table] || table, rows.map(fromRow)];
  }));
  const result = Object.fromEntries(tableResults);
  result.studySessions = Object.fromEntries(result.studySessions.map(record => [record.setId, record]));
  const remote = normalize(result);
  const hasRemote = tables.some(table => result[fieldMap[table] || table].length);
  let localRaw = null;
  let migrationOwner = null;
  try {
    localRaw = storage?.getItem(LIBRARY_STORAGE_KEY) ?? null;
    migrationOwner = storage?.getItem(LEGACY_MIGRATION_KEY) ?? null;
  } catch (error) {
    migrationOwner = 'unavailable';
    console.warn('Lokaler Lernkarten-Cache konnte nicht geprüft werden.', error);
  }
  const legacy = await claimLegacyCache({ legacyRaw: localRaw, migrationOwner, hasRemote, remote, normalize, persist, userId: user.id, storage });
  if (legacy.imported || (localRaw && !migrationOwner)) return legacy.library;
  return remote;
}

let writeQueue = Promise.resolve();
let activeUserId = null;
export function saveLibrary(library, suppliedUserId) {
  const userId = suppliedUserId || activeUserId;
  const snapshot = JSON.parse(JSON.stringify(library));
  try {
    if (userId) globalThis.localStorage?.setItem(userLibraryCacheKey(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Lokaler Lernkarten-Cache konnte nicht aktualisiert werden.', error);
  }
  const operation = writeQueue.then(async () => {
    if (!userId) throw new Error('Keine aktive Sitzung');
    const pending = [];
    for (const table of tables) {
      const rows = toRows(table, snapshot, userId);
      for (let offset = 0; offset < rows.length; offset += 500) {
        const { error } = await supabase.from(table).upsert(rows.slice(offset, offset + 500), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
      pending.push({ table, rows });
    }
    for (const { table, rows } of pending.reverse()) {
      const ids = rows.map(row => row.id);
      if (ids.length <= LIBRARY_PAGE_SIZE) {
        let query = supabase.from(table).delete().eq('user_id', userId);
        if (ids.length) query = query.not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
        const { error } = await query;
        if (error) throw error;
        continue;
      }

      await deleteStaleRows(supabase, table, userId, ids);
    }
  });
  writeQueue = operation.catch(error => { console.error('Supabase-Speichern fehlgeschlagen.', error); window.dispatchEvent(new CustomEvent('library-save-error', { detail: error })); });
  return operation;
}
