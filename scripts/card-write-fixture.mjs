// In-memory counterpart for browser/transport tests. The SQL itself is tested on PostgreSQL.
import { isDeepStrictEqual } from 'node:util';

export function applyFixtureCardChanges(rows, owner, { p_owner, p_changes }, key = id => id) {
  if (p_owner !== owner) return { code: '42501', message: 'Account changed.' };
  for (const { id, expected } of p_changes) {
    const row = rows.get(key(id));
    const actual = row ? { set_id: row.set_id, data: row.data } : null;
    if (!isDeepStrictEqual(actual, expected)) return { code: 'WW409', message: 'Card changed.' };
  }
  for (const { id, next } of p_changes) {
    if (next) rows.set(key(id), { user_id: owner, id, ...structuredClone(next) });
    else rows.delete(key(id));
  }
  return null;
}
