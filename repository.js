import { supabase } from './supabaseClient.js';

const tables = ['subjects', 'folders', 'sets', 'cards', 'study_sessions', 'study_history'];
const storageKey = 'wortwerk-library-v1';
const fieldMap = { study_sessions: 'studySessions', study_history: 'studyHistory' };
const toRows = (table, library, userId) => {
  const key = fieldMap[table];
  const records = key === 'studySessions' ? Object.values(library[key] || {}) : library[key || table] || [];
  return records.map(record => ({ user_id: userId, id: record.id, ...(table === 'folders' ? { subject_id: record.subjectId } : {}), ...(table === 'sets' ? { subject_id: record.subjectId, folder_id: record.folderId || null } : {}), ...(table === 'cards' ? { set_id: record.setId } : {}), ...(table === 'study_sessions' || table === 'study_history' ? { set_id: record.setId } : {}), data: record }));
};
const fromRow = row => row.data;

export async function loadLibrary(normalize) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError || new Error('Keine aktive Sitzung');
  activeUserId = user.id;
  const result = {};
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    result[fieldMap[table] || table] = data.map(fromRow);
  }
  result.studySessions = Object.fromEntries(result.studySessions.map(record => [record.setId, record]));
  const remote = normalize(result);
  const localRaw = localStorage.getItem(storageKey);
  const hasRemote = tables.some(table => result[fieldMap[table] || table].length);
  const migrationKey = `${storageKey}:migrated`;
  if (!hasRemote && localRaw && !localStorage.getItem(migrationKey)) {
    let local;
    try { local = normalize(JSON.parse(localRaw)); } catch (error) { throw new Error(`Lokale Bibliothek ist beschädigt und blieb unangetastet: ${error.message}`); }
    await saveLibrary(local, user.id);
    localStorage.setItem(migrationKey, new Date().toISOString());
    return local;
  }
  return remote;
}

let writeQueue = Promise.resolve();
let activeUserId = null;
export function saveLibrary(library, suppliedUserId) {
  const userId = suppliedUserId || activeUserId;
  const snapshot = JSON.parse(JSON.stringify(library));
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
      let query = supabase.from(table).delete().eq('user_id', userId);
      if (ids.length) query = query.not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
      const { error } = await query;
      if (error) throw error;
    }
  });
  writeQueue = operation.catch(error => { console.error('Supabase-Speichern fehlgeschlagen.', error); window.dispatchEvent(new CustomEvent('library-save-error', { detail: error })); });
  return operation;
}
