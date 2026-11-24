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
const recoveryTables = ['subjects', 'folders', 'sets', 'cards', 'studySessions', 'studyHistory'];
const organisationFields = { subjects: ['position'], folders: ['position', 'subjectId', 'parentId'], sets: ['position', 'subjectId', 'folderId'] };
const plainRecord = value => value && typeof value === 'object' && !Array.isArray(value);

function withServerOrganisation(key, record, current) {
  if (!record || !current || !organisationFields[key]) return record;
  const restored = { ...record };
  for (const field of organisationFields[key]) {
    if (Object.hasOwn(current, field)) restored[field] = current[field];
    else delete restored[field];
  }
  return restored;
}

function sameRecord(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameRecord(left[key], right[key]));
}

function mergeRecoveryChanges(server, changes, preserveOrganisation) {
  const maps = new Map();
  const accepted = [];
  let conflictCount = 0;
  for (const key of recoveryTables) {
    const sessions = key === 'studySessions';
    const recordId = record => sessions ? record.setId : record.id;
    const serverRecords = sessions ? Object.values(server[key] || {}) : server[key];
    const records = new Map(recordList(serverRecords).map(record => [recordId(record), record]));
    maps.set(key, records);
    for (const { before, after } of changes[key] || []) {
      const id = recordId(after);
      const current = records.get(id);
      const expected = preserveOrganisation ? withServerOrganisation(key, before, current) : before;
      const desired = preserveOrganisation ? withServerOrganisation(key, after, current) : after;
      if (sameRecord(current, desired)) continue;
      if (!sameRecord(current ?? null, expected)) {
        conflictCount += 1;
        continue;
      }
      records.set(id, desired);
      accepted.push([key, desired]);
    }
  }
  for (const [key, record] of accepted) {
    if (key === 'folders' || key === 'sets') {
      const parentId = key === 'folders' ? record.parentId : record.folderId;
      if (!maps.get('subjects').has(record.subjectId) ||
        (parentId && maps.get('folders').get(parentId)?.subjectId !== record.subjectId)) conflictCount += 1;
    } else if (key !== 'subjects' && !maps.get('sets').has(record.setId)) {
      conflictCount += 1;
    }
  }
  if (conflictCount) {
    throw Object.assign(new Error('Lokaler und gespeicherter Lernstand enthalten unterschiedliche Änderungen am selben Inhalt.'), {
      code: 'RECOVERY_CONFLICT',
      conflictCount
    });
  }
  const merged = { ...server };
  for (const [key, records] of maps) merged[key] = key === 'studySessions' ? Object.fromEntries(records) : [...records.values()];
  merged.recent = deriveRecentStudySets(merged);
  return merged;
}

export function mergePendingLibrary(server = {}, pending = {}, { preserveOrganisation = false, changes } = {}) {
  if (changes) return mergeRecoveryChanges(server, changes, preserveOrganisation);
  // Older drafts contain no baseline. Confirm only rows already present in
  // the saved library; a difference could be a newer remote edit or deletion.
  const legacy = Object.fromEntries(recoveryTables.map(key => {
    const records = key === 'studySessions' ? Object.values(pending.studySessions || {}) : pending[key];
    return [key, recordList(records).filter(record => record.id).map(record => ({ before: record, after: record }))];
  }));
  return mergeRecoveryChanges(server, legacy, preserveOrganisation);
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
  const memory = new Map();
  const stored = userId => JSON.parse(storage?.getItem(userLibraryPendingKey(userId)) || 'null');
  function write(userId, value) {
    const encoded = JSON.stringify(value);
    if (storage) {
      try {
        storage.setItem(userLibraryPendingKey(userId), encoded);
        memory.delete(userId);
        return;
      } catch {
        console.warn('Ungespeicherter Lernstand ist nur in diesem geöffneten Tab gesichert.');
      }
    }
    const previousMemory = memory.get(userId);
    let replacedToken = previousMemory?.replacedToken;
    if (!previousMemory) {
      try {
        const token = stored(userId)?.token;
        if (typeof token === 'string' && token.startsWith(`${instance}:`)) replacedToken = token;
      }
      catch { /* An inaccessible or invalid stored draft cannot be acknowledged. */ }
    }
    memory.set(userId, { pending: JSON.parse(encoded), replacedToken });
  }
  return {
    stage(userId, library, { preserveOrganisation = false, changes } = {}) {
      if (!userId) return null;
      const token = `${instance}:${++sequence}`;
      try {
        const content = changes ? { version: 2, changes } : { version: 1, library };
        write(userId, { ...content, token, savedAt: now(), ...(preserveOrganisation && { preserveOrganisation }) });
        return token;
      } catch {
        console.warn('Ungespeicherter Lernstand konnte nicht zusätzlich im Browser gesichert werden.');
        return null;
      }
    },
    get(userId) {
      if (!userId) return null;
      try {
        const inMemory = memory.get(userId);
        const pending = inMemory?.pending ?? stored(userId);
        if (!pending?.token) return null;
        const validChanges = pending.version === 2 && plainRecord(pending.changes) &&
          Object.entries(pending.changes).every(([key, entries]) => recoveryTables.includes(key) && Array.isArray(entries) &&
            entries.every(entry => plainRecord(entry) && (entry.before === null || plainRecord(entry.before)) && typeof entry.after?.id === 'string' &&
              (key !== 'studySessions' || typeof entry.after.setId === 'string')));
        const content = validChanges ? { changes: pending.changes } : pending.version === 1 && plainRecord(pending.library) ? { library: pending.library } : null;
        return content && { ...content, savedAt: pending.savedAt, token: pending.token,
          ...(inMemory && { inMemoryOnly: true }), ...(pending.preserveOrganisation === true && { preserveOrganisation: true }) };
      } catch { return null; }
    },
    preserveOrganisation(userId) {
      const pending = this.get(userId);
      if (!pending || pending.preserveOrganisation) return;
      try {
        const { inMemoryOnly, ...value } = pending;
        write(userId, { version: value.changes ? 2 : 1, ...value, preserveOrganisation: true });
      } catch {
        console.warn('Der gesicherte Lernstand konnte nicht aktualisiert werden.');
      }
    },
    acknowledge(userId, token) {
      if (!token || !userId) return;
      const inMemory = memory.get(userId);
      const matchingDraft = inMemory?.pending.token === token;
      if (matchingDraft) memory.delete(userId);
      try {
        const storedToken = stored(userId)?.token;
        if (storedToken && (storedToken === token || (matchingDraft && storedToken === inMemory.replacedToken))) {
          storage.removeItem(userLibraryPendingKey(userId));
        }
      } catch { /* Storage can be unavailable even after the server accepted a save. */ }
    },
    discard(userId, expectedToken) {
      if (!userId || (expectedToken && this.get(userId)?.token !== expectedToken)) return false;
      try {
        const inMemory = memory.get(userId);
        const storedToken = stored(userId)?.token;
        if (storedToken && (!expectedToken || storedToken === expectedToken || storedToken === inMemory?.replacedToken)) {
          storage.removeItem(userLibraryPendingKey(userId));
        }
        memory.delete(userId);
        return true;
      } catch {
        // An in-memory draft can be discarded even when browser storage is unavailable.
        return memory.delete(userId);
      }
    }
  };
}

export const LIBRARY_TABLES = ['subjects', 'folders', 'sets', 'cards', 'study_sessions', 'study_history'];

export function createLibraryLoadGuard() {
  let generation = 0;
  let ownerVersion = 0;
  let activeUserId = null;
  let recoveryUserId = null;
  const stale = () => Object.assign(new Error('Die Sitzung hat sich während des Ladens geändert. Bitte öffne deine Bibliothek erneut.'), { code: 'STALE_LIBRARY_LOAD' });
  return {
    get activeUserId() { return activeUserId; },
    get recoveryUserId() { return recoveryUserId; },
    get ownerVersion() { return ownerVersion; },
    begin() { activeUserId = null; return ++generation; },
    reset() { activeUserId = null; recoveryUserId = null; generation += 1; ownerVersion += 1; },
    assertCurrent(ticket) { if (ticket !== generation) throw stale(); },
    async verifyOwner(ticket, client, expectedUserId) {
      this.assertCurrent(ticket);
      const { data, error } = await client.auth.getUser();
      this.assertCurrent(ticket);
      const user = data?.user;
      if (error || !user) throw error || new Error('Keine aktive Sitzung');
      if (expectedUserId && user.id !== expectedUserId) throw stale();
      return user;
    },
    commit(ticket, userId) { this.assertCurrent(ticket); activeUserId = userId; recoveryUserId = userId; }
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

function pendingChanges(next, previous) {
  if (!previous) return undefined;
  const changes = {};
  for (const [table, nextRows] of next) {
    const known = previous.get(table);
    let sessionsBySet;
    for (const [id, serialized] of nextRows) {
      const oldRow = known.get(id);
      if (oldRow === serialized) continue;
      const after = JSON.parse(serialized).data;
      let before = oldRow ? JSON.parse(oldRow).data : null;
      if (!before && table === 'study_sessions') {
        sessionsBySet ??= new Map([...known.values()].map(row => {
          const record = JSON.parse(row).data;
          return [record.setId, record];
        }));
        before = sessionsBySet.get(after.setId) ?? null;
      }
      const key = LIBRARY_TABLE_FIELDS[table] || table;
      (changes[key] ??= []).push({ before, after });
    }
  }
  return changes;
}

// Compare with the library this browser actually loaded. A snapshot from an
// older tab must not delete records that another tab added in the meantime.
export function createLibraryWriter({ client, onStart = () => {}, onSuccess = () => {}, onError = () => {} }) {
  let queue = Promise.resolve();
  let pending = 0;
  const baselines = new Map();
  const organisationBaselines = new Map();
  const encode = (library, userId) => new Map(LIBRARY_TABLES.map(table => [table,
    new Map(toLibraryRows(table, library, userId).map(row => [row.id, JSON.stringify(row)]))
  ]));
  function assertCurrentOwner(isCurrentOwner) {
    if (isCurrentOwner && !isCurrentOwner()) throw new Error('Die aktive Sitzung hat sich geändert. Bitte lade deine Bibliothek erneut.');
  }
  return {
    prime(userId, library, rawRows) {
      baselines.set(userId, encode(library, userId));
      organisationBaselines.set(userId, new Map(organisationTables.map(table => [table, new Map(
        (rawRows?.[table] || toLibraryRows(table, library, userId)).map(row => [row.id, organisationRecord(table, row)])
      )])));
    },
    organise(before, after, userId, isCurrentOwner) {
      const operation = queue.then(async () => {
        assertCurrentOwner(isCurrentOwner);
        const raw = organisationBaselines.get(userId);
        if (!raw) throw new Error('Die Bibliothek muss neu geladen werden.');
        const { data, error: ownerError } = await client.auth.getUser();
        assertCurrentOwner(isCurrentOwner);
        if (ownerError || data?.user?.id !== userId) throw ownerError || new Error('Die aktive Sitzung hat sich geändert.');
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
    recoveryChanges(library, userId) {
      return pendingChanges(encode(library, userId), baselines.get(userId));
    },
    save(library, userId, { onRecoveryChanges, isCurrentOwner } = {}) {
      // Capture immutable rows once when enqueuing. Decode only changed rows
      // when writing or staging recovery, keeping the comparison cheap.
      const next = encode(library, userId);
      onRecoveryChanges?.(pendingChanges(next, baselines.get(userId)));
      pending += 1;
      onStart({ pending, userId });
      const operation = queue.then(async () => {
        if (!userId) throw new Error('Keine aktive Sitzung');
        assertCurrentOwner(isCurrentOwner);
        const previous = baselines.get(userId) || new Map(LIBRARY_TABLES.map(table => [table, new Map()]));
        const plan = new Map();
        for (const table of LIBRARY_TABLES) {
          const known = previous.get(table), nextRows = next.get(table);
          const writes = [], removed = [];
          for (const [id, row] of nextRows) if (known.get(id) !== row) writes.push(row);
          for (const id of known.keys()) if (!nextRows.has(id)) removed.push(id);
          plan.set(table, { writes, removed });
        }
        if (![...plan.values()].some(({ writes, removed }) => writes.length || removed.length)) return;
        const { data, error } = await client.auth.getUser();
        assertCurrentOwner(isCurrentOwner);
        if (error || data?.user?.id !== userId) throw error || new Error('Die aktive Sitzung hat sich geändert. Bitte lade deine Bibliothek erneut.');
        const organisation = organisationBaselines.get(userId) || new Map(organisationTables.map(table => [table, new Map()]));
        organisationBaselines.set(userId, organisation);
        baselines.set(userId, previous);
        for (const table of LIBRARY_TABLES) {
          const known = previous.get(table);
          const raw = organisation.get(table);
          const rows = plan.get(table).writes.map(row => JSON.parse(row));
          const existing = raw ? rows.filter(row => raw.has(row.id)) : [];
          const ordinary = raw ? rows.filter(row => !raw.has(row.id)) : rows;
          for (const [group, compare] of [[existing, true], [ordinary, false]]) {
            for (let offset = 0; offset < group.length; offset += LIBRARY_PAGE_SIZE) {
              assertCurrentOwner(isCurrentOwner);
              const batch = group.slice(offset, offset + LIBRARY_PAGE_SIZE);
              const { error } = compare
                ? await client.rpc('save_library_organisation_rows', {
                  p_table: table,
                  p_rows: batch.map(row => ({ expected: raw.get(row.id), row }))
                })
                : await client.from(table).upsert(batch, { onConflict: 'user_id,id' });
              if (error) throw error;
              for (const row of batch) {
                known.set(row.id, next.get(table).get(row.id));
                raw?.set(row.id, organisationRecord(table, row));
              }
            }
          }
        }
        for (const table of [...LIBRARY_TABLES].reverse()) {
          const { removed } = plan.get(table);
          for (let offset = 0; offset < removed.length; offset += LIBRARY_PAGE_SIZE) {
            assertCurrentOwner(isCurrentOwner);
            const batch = removed.slice(offset, offset + LIBRARY_PAGE_SIZE);
            const { error } = await client.from(table).delete().eq('user_id', userId).in('id', batch);
            if (error) throw error;
            for (const id of batch) {
              previous.get(table).delete(id);
              organisation.get(table)?.delete(id);
            }
          }
        }
        // Successful batches are tracked even after a later failure. A retry
        // sends pending changes; a local rollback restores already-written rows.
        baselines.set(userId, next);
      });
      queue = operation.then(() => { pending -= 1; onSuccess({ pending, userId }); }, error => { pending -= 1; onError(error, { pending, userId }); });
      return operation;
    }
  };
}

const libraryColumns = { folders: 'id,subject_id,data', sets: 'id,subject_id,folder_id,data' };
export async function readLibraryRows(client, table, userId, pageSize = LIBRARY_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer');
  const rows = [];
  let cursor;
  for (;;) {
    let query = client.from(table).select(libraryColumns[table] || 'id,data').eq('user_id', userId).order('id', { ascending: true });
    if (cursor !== undefined) query = query.gt('id', cursor);
    const { data, error } = await query.range(0, pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => typeof row?.id !== 'string' || !plainRecord(row.data))) {
      throw new Error('Die Bibliothek konnte wegen einer unvollständigen Serverantwort nicht geladen werden.');
    }
    rows.push(...data);
    if (data.length < pageSize) return rows;
    const next = data.at(-1).id;
    if (cursor === next) throw new Error('Beim Laden der Bibliothek wurde dieselbe Datenseite erneut geliefert.');
    cursor = next;
  }
}

export async function readAllRows(query, pageSize = LIBRARY_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer');
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Die Datenseite konnte nicht gelesen werden.');
    const page = data;
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
