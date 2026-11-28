import { plainRecord, sameRecord, previousSessionStep, matchesPreviousSession, validStoredChange } from './recovery-versions.mjs';
import { reconcileCardRevision } from './card-revisions.mjs';

export const LIBRARY_TABLE_FIELDS = { study_sessions: 'studySessions', study_history: 'studyHistory' };
export function libraryFromRows(rawRows) {
  const result = Object.fromEntries(Object.entries(rawRows).map(([table, rows]) => {
    const records = rows.map(row => {
      // ON DELETE SET NULL updates the foreign key, not the embedded JSON.
      let record = row.data.id === row.id ? row.data : { ...row.data, id: row.id };
      if ((table === 'folders' || table === 'sets') && record.subjectId !== row.subject_id) {
        record = { ...record, subjectId: row.subject_id };
      }
      if (table === 'sets' && (record.folderId ?? null) !== (row.folder_id ?? null)) {
        record = { ...record, folderId: row.folder_id ?? null };
      }
      if (table === 'cards' && typeof row.set_id === 'string' && record.setId !== row.set_id) {
        record = { ...record, setId: row.set_id };
      }
      return record;
    });
    return [LIBRARY_TABLE_FIELDS[table] || table, records];
  }));
  // Database pagination is ordered by primary key. UUIDs do not reflect time.
  const time = value => Date.parse(value) || 0;
  result.studyHistory.sort((a, b) => time(b.completedAt) - time(a.completedAt));
  // Two devices can start different rounds for the same deck. An older
  // leftover row must not revive a round superseded by a completed one.
  const completedIds = new Set();
  const completedStarts = new Map();
  for (const round of result.studyHistory) {
    completedIds.add(round.id);
    const started = Date.parse(round.startedAt);
    if (Number.isFinite(started) && started > (completedStarts.get(round.setId) ?? -Infinity)) {
      completedStarts.set(round.setId, started);
    }
  }
  const open = new Map();
  for (const round of result.studySessions) {
    const started = Date.parse(round.startedAt);
    if (completedIds.has(round.id) || started < completedStarts.get(round.setId)) continue;
    const previous = open.get(round.setId);
    if (!previous || (started || 0) >= time(previous.startedAt)) open.set(round.setId, round);
  }
  result.studySessions = Object.fromEntries(open);
  return result;
}

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

function withServerOrganisation(key, record, current) {
  if (!record || !current || !organisationFields[key]) return record;
  const restored = { ...record };
  for (const field of organisationFields[key]) {
    if (Object.hasOwn(current, field)) restored[field] = current[field];
    else delete restored[field];
  }
  return restored;
}

function mergeRecoveryChanges(server, changes, preserveOrganisation, cardChoices) {
  const maps = new Map();
  const accepted = [];
  let conflictCount = 0;
  const cardConflicts = [];
  for (const key of recoveryTables) {
    const sessions = key === 'studySessions';
    const recordId = record => sessions ? record.setId : record.id;
    const serverRecords = sessions ? Object.values(server[key] || {}) : server[key];
    const records = new Map(recordList(serverRecords).map(record => [recordId(record), record]));
    maps.set(key, records);
    for (const { before, after, intermediate = [], sessionSteps } of changes[key] || []) {
      const id = recordId(after);
      const current = records.get(id);
      const expected = preserveOrganisation ? withServerOrganisation(key, before, current) : before;
      let desired = preserveOrganisation ? withServerOrganisation(key, after, current) : after;
      if (sameRecord(current, desired)) continue;
      if (!sameRecord(current ?? null, expected) && !intermediate.some(record =>
        sameRecord(current, preserveOrganisation ? withServerOrganisation(key, record, current) : record)) &&
        !(sessions && matchesPreviousSession(current, after, sessionSteps))) {
        // Editing a card also touches its deck timestamp. Keep concurrent deck
        // metadata rather than treating that timestamp as a second text conflict.
        if (key === 'sets' && before && current && sameRecord({ ...before, updatedAt: after.updatedAt }, after)
            && !sameRecord(before, after)) continue;
        const revision = key === 'cards' && !sameRecord(before, after) && reconcileCardRevision(before, after, current, cardChoices?.get(id));
        if (!revision?.merged) {
          if (revision?.conflict) cardConflicts.push(revision.conflict);
          conflictCount += 1;
          continue;
        }
        desired = revision.merged;
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
      conflictCount, cardConflicts
    });
  }
  const merged = { ...server };
  for (const [key, records] of maps) merged[key] = key === 'studySessions' ? Object.fromEntries(records) : [...records.values()];
  merged.recent = deriveRecentStudySets(merged);
  return merged;
}

export function mergePendingLibrary(server = {}, pending = {}, { preserveOrganisation = false, changes, cardChoices } = {}) {
  if (changes) return mergeRecoveryChanges(server, changes, preserveOrganisation, cardChoices);
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
            entries.every(entry => validStoredChange(key, entry)));
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

function pendingChanges(next, previous, queued) {
  if (!previous) return undefined;
  const changes = {};
  for (const [table, nextRows] of next) {
    const known = previous.get(table);
    const key = LIBRARY_TABLE_FIELDS[table] || table;
    const priorById = new Map((queued?.[key] || []).map(change =>
      [table === 'study_sessions' ? change.after.setId : change.after.id, change]));
    let sessionsBySet;
    for (const [id, serialized] of nextRows) {
      const oldRow = known.get(id);
      if (oldRow === serialized && !priorById.size) continue;
      if (oldRow === serialized && table !== 'study_sessions' && !priorById.has(id)) continue;
      const after = JSON.parse(serialized).data;
      const prior = priorById.get(table === 'study_sessions' ? after.setId : id);
      if (oldRow === serialized && !prior) continue;
      let before = oldRow ? JSON.parse(oldRow).data : null;
      if (!before && table === 'study_sessions') {
        sessionsBySet ??= new Map([...known.values()].map(row => {
          const record = JSON.parse(row).data;
          return [record.setId, record];
        }));
        before = sessionsBySet.get(after.setId) ?? null;
      }
      // Earlier requests may commit after this draft is staged. Keep only
      // actual local row versions, including when a user undoes an edit.
      if (table === 'study_sessions') {
        let steps = prior?.sessionSteps || [];
        if (prior && !sameRecord(after, prior.after) && (steps.length || !sameRecord(before, prior.after))) {
          steps = [previousSessionStep(after, prior.after), ...steps];
        }
        if (oldRow !== serialized || steps.length) {
          (changes[key] ??= []).push({ before, after, ...(steps.length && { sessionSteps: steps }) });
        }
        continue;
      }
      const intermediate = prior ? [...(prior.intermediate || []), prior.after]
        .filter(record => !sameRecord(record, before) && !sameRecord(record, after)) : [];
      if (oldRow !== serialized || intermediate.length) {
        (changes[key] ??= []).push({ before, after, ...(intermediate.length && { intermediate }) });
      }
    }
  }
  return changes;
}

// A request can commit even when its response is lost. Before acknowledging
// the next save, compare just that batch with the two versions we can explain.
const libraryColumns = { subjects: 'id,data', folders: 'id,subject_id,data', sets: 'id,subject_id,folder_id,data',
  cards: 'id,set_id,data', study_sessions: 'id,set_id,data', study_history: 'id,set_id,data' };

function matchesRow(fields, row, serialized) {
  if (!row || !serialized) return !row && !serialized;
  const expected = JSON.parse(serialized);
  return fields.every(field => sameRecord(row[field] ?? null, expected[field] ?? null));
}

function writeCardChanges(client, owner, ids, nextRows, known, stored) {
  function version(serialized) {
    if (!serialized) return null;
    const { set_id, data } = JSON.parse(serialized);
    return { set_id, data };
  }
  return client.rpc('save_card_changes', {
    p_owner: owner,
    p_changes: ids.map(id => ({
      id,
      expected: version(stored?.get(id) ?? known.get(id)),
      next: version(nextRows.get(id))
    }))
  });
}

async function reconcileWrite(client, userId, { table, attempted }, known, stored, organisation, assertOwner) {
  const ids = [...attempted.keys()];
  const columns = libraryColumns[table], fields = columns.split(',');
  // UUIDs are sent in the query string. Bound the URL length on large saves.
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    assertOwner();
    const { data, error } = await client.from(table).select(columns).eq('user_id', userId).in('id', batch);
    assertOwner();
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => !plainRecord(row?.data) || typeof row.id !== 'string')) {
      throw new Error('Der letzte Speichervorgang konnte nicht überprüft werden. Bitte lade die Bibliothek erneut.');
    }
    const found = new Map(data.map(row => [row.id, row]));
    for (const id of batch) {
      const row = found.get(id);
      if (matchesRow(fields, row, stored?.get(id) ?? known.get(id))) continue;
      const written = attempted.get(id);
      if (!matchesRow(fields, row, written)) {
        throw Object.assign(new Error('Der gespeicherte Inhalt hat sich inzwischen geändert. Bitte lade deine Bibliothek erneut.'), { code: '40001' });
      }
      stored?.delete(id);
      if (row) {
        known.set(id, written);
        organisation?.set(id, organisationRecord(table, row));
      } else {
        known.delete(id);
        organisation?.delete(id);
      }
    }
  }
}

// Compare with the library this browser actually loaded. A snapshot from an
// older tab must not delete records that another tab added in the meantime.
export function createLibraryWriter({ client, onStart = () => {}, onSuccess = () => {}, onError = () => {} }) {
  let queue = Promise.resolve();
  let pending = 0;
  const baselines = new Map();
  // Keep an extra snapshot only when the persisted row differs from the
  // application baseline (legacy defaults, or metadata omitted by a move).
  const storedOverrides = new Map();
  const queuedDrafts = new Map();
  const unconfirmed = new Map();
  const organisationBaselines = new Map();
  const encode = (library, userId) => new Map(LIBRARY_TABLES.map(table => [table,
    new Map(toLibraryRows(table, library, userId).map(row => [row.id, JSON.stringify(row)]))
  ]));
  function assertCurrentOwner(isCurrentOwner) {
    if (isCurrentOwner && !isCurrentOwner()) throw new Error('Die aktive Sitzung hat sich geändert. Bitte lade deine Bibliothek erneut.');
  }
  async function verifyCurrentUser(userId, isCurrentOwner) {
    const { data, error } = await client.auth.getUser();
    assertCurrentOwner(isCurrentOwner);
    if (error || data?.user?.id !== userId) throw error || new Error('Die aktive Sitzung hat sich geändert. Bitte lade deine Bibliothek erneut.');
  }
  return {
    releaseOwners() {
      // A request already on the wire may finish after sign-out. Drop all
      // private comparison snapshots once those requests have settled.
      queue = queue.then(() => {
        baselines.clear();
        storedOverrides.clear();
        organisationBaselines.clear();
        queuedDrafts.clear();
        unconfirmed.clear();
      });
    },
    prime(userId, library, rawRows) {
      queuedDrafts.delete(userId);
      unconfirmed.delete(userId);
      const known = encode(library, userId);
      baselines.set(userId, known);
      const stored = new Map();
      for (const table of LIBRARY_TABLES) {
        const rows = new Map();
        const fields = libraryColumns[table].split(',');
        for (const row of rawRows?.[table] || []) {
          const serialized = known.get(table).get(row.id);
          if (serialized && !matchesRow(fields, row, serialized)) rows.set(row.id, JSON.stringify(row));
        }
        stored.set(table, rows);
      }
      storedOverrides.set(userId, stored);
      organisationBaselines.set(userId, new Map(organisationTables.map(table => [table, new Map(
        (rawRows?.[table] || toLibraryRows(table, library, userId)).map(row => [row.id, organisationRecord(table, row)])
      )])));
    },
    organise(before, after, userId, isCurrentOwner) {
      const operation = queue.then(async () => {
        assertCurrentOwner(isCurrentOwner);
        const raw = organisationBaselines.get(userId);
        if (!raw) throw new Error('Die Bibliothek muss neu geladen werden.');
        await verifyCurrentUser(userId, isCurrentOwner);
        const payload = libraryOrganisationChanges(before, after, raw, userId);
        const { error } = await client.rpc('organise_library', payload);
        if (error) throw error;
        const known = baselines.get(userId);
        if (!storedOverrides.has(userId)) {
          storedOverrides.set(userId, new Map(LIBRARY_TABLES.map(table => [table, new Map()])));
        }
        for (const table of organisationTables) {
          const next = new Map(toLibraryRows(table, after, userId).map(row => [row.id, row]));
          const stored = storedOverrides.get(userId).get(table);
          const fields = libraryColumns[table].split(',');
          for (const change of payload.p_changes[table]) {
            raw.get(table).set(change.id, change);
            // Compare subsequent saves with the in-memory shape. Old records may
            // omit a location key that the RPC stores explicitly as null.
            const serialized = JSON.stringify(next.get(change.id));
            const persisted = JSON.parse(stored.get(change.id) ?? known.get(table).get(change.id));
            const { id, ...changedFields } = change;
            Object.assign(persisted.data, changedFields);
            if (table !== 'subjects') persisted.subject_id = change.subjectId;
            if (table === 'sets') persisted.folder_id = change.folderId;
            if (matchesRow(fields, persisted, serialized)) stored.delete(id);
            else stored.set(id, JSON.stringify(persisted));
            known.get(table).set(id, serialized);
          }
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
    flush() { return queue; },
    recoveryChanges(library, userId) {
      return pendingChanges(encode(library, userId), baselines.get(userId), queuedDrafts.get(userId));
    },
    save(library, userId, { onRecoveryChanges, isCurrentOwner } = {}) {
      // Capture immutable rows once when enqueuing. Decode only changed rows
      // when writing or staging recovery, keeping the comparison cheap.
      const next = encode(library, userId);
      let draft;
      if (onRecoveryChanges) {
        draft = pendingChanges(next, baselines.get(userId), queuedDrafts.get(userId));
        queuedDrafts.set(userId, draft);
        onRecoveryChanges(draft);
      }
      pending += 1;
      onStart({ pending, userId });
      let inFlight;
      const operation = queue.then(async () => {
        if (!userId) throw new Error('Keine aktive Sitzung');
        assertCurrentOwner(isCurrentOwner);
        const previous = baselines.get(userId) || new Map(LIBRARY_TABLES.map(table => [table, new Map()]));
        const organisation = organisationBaselines.get(userId) || new Map(organisationTables.map(table => [table, new Map()]));
        const uncertain = unconfirmed.get(userId);
        if (uncertain) {
          await verifyCurrentUser(userId, isCurrentOwner);
          await reconcileWrite(client, userId, uncertain, previous.get(uncertain.table), storedOverrides.get(userId)?.get(uncertain.table), organisation.get(uncertain.table), () => assertCurrentOwner(isCurrentOwner));
          unconfirmed.delete(userId);
        }
        const plan = new Map();
        for (const table of LIBRARY_TABLES) {
          const known = previous.get(table), nextRows = next.get(table);
          const writes = [], removed = [];
          for (const [id, row] of nextRows) if (known.get(id) !== row) writes.push(row);
          for (const id of known.keys()) if (!nextRows.has(id)) removed.push(id);
          plan.set(table, { writes, removed });
        }
        if (![...plan.values()].some(({ writes, removed }) => writes.length || removed.length)) return;
        if (!uncertain) await verifyCurrentUser(userId, isCurrentOwner);
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
              inFlight = () => ({ table, attempted: new Map(batch.map(row => [row.id, next.get(table).get(row.id)])) });
              let result;
              if (table === 'cards') {
                result = await writeCardChanges(client, userId, batch.map(row => row.id), next.get(table), known, storedOverrides.get(userId)?.get(table));
              } else if (compare) {
                result = await client.rpc('save_library_organisation_rows', {
                  p_table: table,
                  p_rows: batch.map(row => ({ expected: raw.get(row.id), row }))
                });
              } else {
                result = await client.from(table).upsert(batch, { onConflict: 'user_id,id' });
              }
              if (result.error) throw result.error;
              inFlight = undefined;
              for (const row of batch) {
                known.set(row.id, next.get(table).get(row.id));
                raw?.set(row.id, organisationRecord(table, row));
                storedOverrides.get(userId)?.get(table).delete(row.id);
              }
            }
          }
        }
        for (const table of [...LIBRARY_TABLES].reverse()) {
          const { removed } = plan.get(table);
          for (let offset = 0; offset < removed.length; offset += LIBRARY_PAGE_SIZE) {
            assertCurrentOwner(isCurrentOwner);
            const batch = removed.slice(offset, offset + LIBRARY_PAGE_SIZE);
            inFlight = () => ({ table, attempted: new Map(batch.map(id => [id, null])) });
            const { error } = table === 'cards'
              ? await writeCardChanges(client, userId, batch, next.get(table), previous.get(table), storedOverrides.get(userId)?.get(table))
              : await client.from(table).delete().eq('user_id', userId).in('id', batch);
            if (error) throw error;
            inFlight = undefined;
            for (const id of batch) {
              previous.get(table).delete(id);
              storedOverrides.get(userId)?.get(table).delete(id);
              organisation.get(table)?.delete(id);
            }
          }
        }
        // Successful batches are tracked even after a later failure. A retry
        // sends pending changes; a local rollback restores already-written rows.
        baselines.set(userId, next);
      });
      queue = operation.then(() => {
        if (queuedDrafts.get(userId) === draft) queuedDrafts.delete(userId);
        pending -= 1;
        onSuccess({ pending, userId });
      }, error => {
        // A SQL/PostgREST rejection confirms failure. Transport errors do not.
        if (inFlight && !/^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error?.code || '')) {
          unconfirmed.set(userId, inFlight());
        }
        pending -= 1;
        onError(error, { pending, userId });
      });
      return operation;
    }
  };
}

export async function readLibraryRows(client, table, userId, pageSize = LIBRARY_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer');
  const rows = [];
  let cursor;
  for (;;) {
    let query = client.from(table).select(libraryColumns[table]).eq('user_id', userId).order('id', { ascending: true });
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
