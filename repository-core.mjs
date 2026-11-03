export const LIBRARY_STORAGE_KEY = 'wortwerk-library-v1';
export const LEGACY_MIGRATION_KEY = `${LIBRARY_STORAGE_KEY}:migrated`;
export const LIBRARY_PAGE_SIZE = 500;
export const userLibraryCacheKey = userId => `${LIBRARY_STORAGE_KEY}:${userId}`;

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

export async function claimLegacyCache({ legacyRaw, migrationOwner, hasRemote, remote, normalize, persist, userId, storage }) {
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
