export const LIBRARY_TABLE_FIELDS = { study_sessions: 'studySessions', study_history: 'studyHistory' };
export function toLibraryRows(table, library, userId) {
  const key = LIBRARY_TABLE_FIELDS[table];
  const records = key === 'studySessions' ? Object.values(library[key] || {}) : library[key || table] || [];
  return records.map(record => ({ user_id: userId, id: record.id, ...(table === 'folders' ? { subject_id: record.subjectId } : {}), ...(table === 'sets' ? { subject_id: record.subjectId, folder_id: record.folderId || null } : {}), ...(table === 'cards' ? { set_id: record.setId } : {}), ...(table === 'study_sessions' || table === 'study_history' ? { set_id: record.setId } : {}), data: record }));
}

export const LIBRARY_STORAGE_KEY = 'wortwerk-library-v1';
export const LEGACY_MIGRATION_KEY = `${LIBRARY_STORAGE_KEY}:migrated`;
export const LIBRARY_PAGE_SIZE = 500;
export const userLibraryCacheKey = userId => `${LIBRARY_STORAGE_KEY}:${userId}`;
export const userLibraryPendingKey = userId => `${userLibraryCacheKey(userId)}:pending`;
const recordList = value => Array.isArray(value) ? value.filter(record => record && typeof record === 'object') : [];

export function mergePendingLibrary(server = {}, pending = {}, { preserveOrganisation = false } = {}) {
  const merged = { ...server };
  const organisationFields = { subjects: ['position'], folders: ['position', 'subjectId', 'parentId'], sets: ['position', 'subjectId', 'folderId'] };
  for (const key of ['subjects', 'folders', 'sets', 'cards', 'studyHistory']) {
    const records = new Map(recordList(server[key]).filter(record => record.id).map(record => [record.id, record]));
    for (const record of recordList(pending[key])) {
      if (!record.id) continue;
      const current = records.get(record.id);
      if (!preserveOrganisation || !current || !organisationFields[key]) {
        records.set(record.id, record);
        continue;
      }
      const restored = { ...record };
      for (const field of organisationFields[key]) {
        if (Object.hasOwn(current, field)) restored[field] = current[field];
        else delete restored[field];
      }
      records.set(record.id, restored);
    }
    merged[key] = [...records.values()];
  }
  merged.studySessions = { ...(server.studySessions || {}), ...(pending.studySessions || {}) };
  merged.recent = deriveRecentStudySets({ ...merged, recent: [...recordList(server.recent), ...recordList(pending.recent)] });
  return merged;
}

export function deriveRecentStudySets(library) {
  const knownSets = new Set(recordList(library.sets).map(set => set.id));
  const recent = new Map();
  const add = (setId, at) => {
    const timestamp = Date.parse(at);
    if (!knownSets.has(setId) || !Number.isFinite(timestamp)) return;
    if (!recent.has(setId) || timestamp > recent.get(setId).timestamp) recent.set(setId, { setId, at, timestamp });
  };
  for (const set of recordList(library.sets)) add(set.id, set.lastStudiedAt);
  for (const entry of recordList(library.recent)) add(entry.setId, entry.at);
  for (const session of recordList(Object.values(library.studySessions || {}))) add(session.setId, session.startedAt);
  for (const entry of recordList(library.studyHistory)) add(entry.setId, entry.completedAt || entry.startedAt);
  return [...recent.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30).map(({ setId, at }) => ({ setId, at }));
}

export function createPendingRecovery({ storage, now = () => new Date().toISOString() }) {
  let sequence = 0;
  const instance = Math.random().toString(36).slice(2);
  return {
    stage(userId, library, { preserveOrganisation = false } = {}) {
      if (!userId) return null;
      const token = `${instance}:${++sequence}`;
      try {
        storage?.setItem(userLibraryPendingKey(userId), JSON.stringify({ version: 1, token, savedAt: now(), library, ...(preserveOrganisation && { preserveOrganisation }) }));
        return storage ? token : null;
      } catch (error) {
        console.warn('Ungespeicherter Lernstand konnte nicht zusätzlich im Browser gesichert werden.', error);
        return null;
      }
    },
    get(userId) {
      if (!userId) return null;
      try {
        const pending = JSON.parse(storage?.getItem(userLibraryPendingKey(userId)) || 'null');
        return pending?.version === 1 && pending.token && pending.library && typeof pending.library === 'object' && !Array.isArray(pending.library)
          ? { library: pending.library, savedAt: pending.savedAt, token: pending.token, ...(pending.preserveOrganisation === true && { preserveOrganisation: true }) } : null;
      } catch { return null; }
    },
    preserveOrganisation(userId) {
      const pending = this.get(userId);
      if (!pending || pending.preserveOrganisation) return;
      try {
        storage?.setItem(userLibraryPendingKey(userId), JSON.stringify({ version: 1, ...pending, preserveOrganisation: true }));
      } catch (error) {
        console.warn('Der gesicherte Lernstand konnte nicht aktualisiert werden.', error);
      }
    },
    acknowledge(userId, token) {
      if (token && this.get(userId)?.token === token) this.discard(userId);
    },
    discard(userId) {
      if (!userId) return;
      try { storage?.removeItem(userLibraryPendingKey(userId)); }
      catch (error) { console.warn('Gesicherter Lernstand konnte nicht aus dem Browser entfernt werden.', error); }
    }
  };
}

export const LIBRARY_TABLES = ['subjects', 'folders', 'sets', 'cards', 'study_sessions', 'study_history'];

export function createLibraryLoadGuard() {
  let generation = 0;
  let activeUserId = null;
  const stale = () => Object.assign(new Error('Die Sitzung hat sich während des Ladens geändert. Bitte öffne deine Bibliothek erneut.'), { code: 'STALE_LIBRARY_LOAD' });
  return {
    get activeUserId() { return activeUserId; },
    begin() { activeUserId = null; return ++generation; },
    reset() { activeUserId = null; generation += 1; },
    assertCurrent(ticket) { if (ticket !== generation) throw stale(); },
    async verifyOwner(ticket, client, expectedUserId) {
      this.assertCurrent(ticket);
      const { data: { user }, error } = await client.auth.getUser();
      this.assertCurrent(ticket);
      if (error || !user) throw error || new Error('Keine aktive Sitzung');
      if (expectedUserId && user.id !== expectedUserId) throw stale();
      return user;
    },
    commit(ticket, userId) { this.assertCurrent(ticket); activeUserId = userId; }
  };
}

const organisationTables = ['subjects', 'folders', 'sets'];

function organisationRecord(table, row) {
  const location = table === 'subjects' ? {} : { subjectId: row.subject_id };
  if (table === 'folders') location.parentId = typeof row.data.parentId === 'string' ? row.data.parentId || null : null;
  if (table === 'sets') location.folderId = row.folder_id || null;
  return { id: row.id, ...location, position: row.data.position ?? null };
}

function organisationScope({ subjectId, parentId, folderId }) {
  return JSON.stringify([subjectId, parentId ?? folderId]);
}

export function libraryOrganisationChanges(before, after, rawRows, userId) {
  const expected = {};
  const changes = {};
  for (const table of organisationTables) {
    const previousRows = toLibraryRows(table, before, userId);
    const original = new Map(previousRows.map(row => [row.id, organisationRecord(table, row)]));
    const next = toLibraryRows(table, after, userId).map(row => organisationRecord(table, row));
    const nextIds = new Set(next.map(record => record.id));
    const scopes = new Set();
    if (original.size !== previousRows.length || nextIds.size !== next.length ||
      next.length !== original.size || next.some(record => !original.has(record.id))) {
      throw new Error('Beim Verschieben dürfen keine Bibliothekseinträge erstellt oder gelöscht werden.');
    }
    for (const record of next) {
      const previous = original.get(record.id);
      if (JSON.stringify(previous) === JSON.stringify(record)) continue;
      scopes.add(organisationScope(previous));
      scopes.add(organisationScope(record));
    }
    expected[table] = [...rawRows.get(table).values()];
    changes[table] = next.filter(record => scopes.has(organisationScope(record)) &&
      JSON.stringify(rawRows.get(table).get(record.id)) !== JSON.stringify(record));
  }
  return { p_expected: expected, p_changes: changes };
}

// Compare with the library this browser actually loaded. A snapshot from an
// older tab must not delete records that another tab added in the meantime.
export function createLibraryWriter({ client, onStart = () => {}, onSuccess = () => {}, onError = () => {} }) {
  let queue = Promise.resolve();
  let pending = 0;
  const baselines = new Map();
  const organisationBaselines = new Map();
  const encode = (library, userId) => new Map(LIBRARY_TABLES.map(table => [table,
    new Map(toLibraryRows(table, library, userId).map(row => [row.id, { row, serialized: JSON.stringify(row) }]))
  ]));
  const baseline = encoded => new Map([...encoded].map(([table, records]) => [table, new Map([...records].map(([id, record]) => [id, record.serialized]))]));
  return {
    prime(userId, library, rawRows) {
      baselines.set(userId, baseline(encode(library, userId)));
      organisationBaselines.set(userId, new Map(organisationTables.map(table => [table, new Map(
        (rawRows?.[table] || toLibraryRows(table, library, userId)).map(row => [row.id, organisationRecord(table, row)])
      )])));
    },
    organise(before, after, userId) {
      const operation = queue.then(async () => {
        const raw = organisationBaselines.get(userId);
        if (!raw) throw new Error('Die Bibliothek muss neu geladen werden.');
        const { data: { user }, error: ownerError } = await client.auth.getUser();
        if (ownerError || user?.id !== userId) throw ownerError || new Error('Die aktive Sitzung hat sich geändert.');
        const payload = libraryOrganisationChanges(before, after, raw, userId);
        const { error } = await client.rpc('organise_library', payload);
        if (error) throw error;
        const known = baselines.get(userId);
        for (const table of organisationTables) {
          const next = new Map(toLibraryRows(table, after, userId).map(row => [row.id, row]));
          for (const change of payload.p_changes[table]) {
            raw.get(table).set(change.id, change);
            // Compare subsequent saves with the in-memory shape. Old records may
            // omit a location key that the RPC stores explicitly as null.
            known.get(table).set(change.id, JSON.stringify(next.get(change.id)));
          }
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
    flush() { return queue; },
    save(library, userId) {
      const snapshot = JSON.parse(JSON.stringify(library));
      pending += 1;
      onStart({ pending, userId });
      const operation = queue.then(async () => {
        if (!userId) throw new Error('Keine aktive Sitzung');
        const { data: { user }, error } = await client.auth.getUser();
        if (error || user?.id !== userId) throw error || new Error('Die aktive Sitzung hat sich geändert. Bitte lade deine Bibliothek erneut.');
        const next = encode(snapshot, userId);
        const organisation = organisationBaselines.get(userId) || new Map(organisationTables.map(table => [table, new Map()]));
        organisationBaselines.set(userId, organisation);
        const previous = baselines.get(userId) || new Map(LIBRARY_TABLES.map(table => [table, new Map()]));
        baselines.set(userId, previous);
        for (const table of LIBRARY_TABLES) {
          const known = previous.get(table) || new Map();
          const raw = organisation.get(table);
          const rows = [...next.get(table).values()].filter(record => known.get(record.row.id) !== record.serialized).map(record => record.row);
          const existing = raw ? rows.filter(row => raw.has(row.id)) : [];
          const ordinary = raw ? rows.filter(row => !raw.has(row.id)) : rows;
          for (const [group, compare] of [[existing, true], [ordinary, false]]) {
            for (let offset = 0; offset < group.length; offset += LIBRARY_PAGE_SIZE) {
              const batch = group.slice(offset, offset + LIBRARY_PAGE_SIZE);
              const { error } = compare
                ? await client.rpc('save_library_organisation_rows', {
                  p_table: table,
                  p_rows: batch.map(row => ({ expected: raw.get(row.id), row }))
                })
                : await client.from(table).upsert(batch, { onConflict: 'user_id,id' });
              if (error) throw error;
              for (const row of batch) {
                known.set(row.id, next.get(table).get(row.id).serialized);
                raw?.set(row.id, organisationRecord(table, row));
              }
              previous.set(table, known);
            }
          }
        }
        for (const table of [...LIBRARY_TABLES].reverse()) {
          const removed = [...(previous.get(table)?.keys() || [])].filter(id => !next.get(table).has(id));
          for (let offset = 0; offset < removed.length; offset += LIBRARY_PAGE_SIZE) {
            const { error } = await client.from(table).delete().eq('user_id', userId).in('id', removed.slice(offset, offset + LIBRARY_PAGE_SIZE));
            if (error) throw error;
            for (const id of removed.slice(offset, offset + LIBRARY_PAGE_SIZE)) {
              previous.get(table).delete(id);
              organisation.get(table)?.delete(id);
            }
          }
        }
        // Successful batches are tracked even after a later failure. A retry
        // sends pending changes; a local rollback restores already-written rows.
        baselines.set(userId, baseline(next));
      });
      queue = operation.then(() => { pending -= 1; onSuccess({ pending, userId }); }, error => { pending -= 1; onError(error, { pending, userId }); });
      return operation;
    }
  };
}

export async function readAllRows(query, pageSize = LIBRARY_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer');
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function deleteStaleRows(client, table, userId, keepIds, pageSize = LIBRARY_PAGE_SIZE) {
  const existingRows = await readAllRows(client.from(table).select('id').eq('user_id', userId).order('id', { ascending: true }), pageSize);
  const keep = new Set(keepIds);
  const staleIds = existingRows.map(row => row.id).filter(id => !keep.has(id));
  for (let offset = 0; offset < staleIds.length; offset += pageSize) {
    const { error } = await client.from(table).delete().eq('user_id', userId).in('id', staleIds.slice(offset, offset + pageSize));
    if (error) throw error;
  }
  return staleIds.length;
}

export async function claimLegacyCache({ legacyRaw, migrationOwner, hasRemote, remote, normalize, persist, userId, storage, assertCurrent = () => {} }) {
  assertCurrent();
  if (!legacyRaw || migrationOwner) return { library: remote, imported: false };

  let library = remote;
  if (!hasRemote) {
    try {
      library = normalize(JSON.parse(legacyRaw));
    } catch (error) {
      throw new Error(`Lokale Bibliothek ist beschädigt und blieb unangetastet: ${error.message}`);
    }
    await persist(library, userId);
  }
  assertCurrent();

  // Assign the old single-browser cache to only the first account that sees
  // it. A cache written by one signed-in user must never migrate to another.
  try { storage?.setItem(userLibraryCacheKey(userId), JSON.stringify(library)); }
  catch (error) { console.warn('Benutzerbezogener Lernkarten-Cache konnte nicht gespeichert werden.', error); }
  try { storage?.setItem(LEGACY_MIGRATION_KEY, userId); }
  catch (error) { console.warn('Einmalige Cache-Zuordnung konnte nicht gespeichert werden.', error); }
  try { storage?.removeItem(LIBRARY_STORAGE_KEY); }
  catch (error) { console.warn('Alter Lernkarten-Cache konnte nicht entfernt werden.', error); }
  return { library, imported: !hasRemote };
}
