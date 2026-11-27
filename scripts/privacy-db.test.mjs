/** Optional isolated PostgreSQL checks. No hosted project or real users. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GET as deletionAvailability, POST as deleteAccount } from '../server/delete-account.mjs';
import { readdir, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let PGlite;
try { ({ PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')); }
catch { throw new Error('Diese isolierte Prüfung benötigt separat installiertes @electric-sql/pglite; setze PGLITE_MODULE auf dessen Modulpfad.'); }
const root = new URL('../', import.meta.url);
const migrations = (await readdir(new URL('supabase/migrations/', root))).filter(name => name.endsWith('.sql')).sort();
for (const fullHistory of [false, true]) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated,service_role; grant execute on all functions in schema auth to anon,authenticated,service_role;`);

    for (const name of migrations) {
      // The historical schema supplies the tables needed by the grant
      // migrations, as they already existed when those ran in production.
      if (!fullHistory && name === '20261116064041_preserve_shared_study_settings.sql') continue;
      await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8'));
    }
    const checks = ['exam-sharing.sql', 'account-deletion.sql'];
    if (fullHistory) checks.unshift('library-sharing.sql');
    for (const name of checks) {
      await db.exec(await readFile(new URL(`supabase/checks/${name}`, root), 'utf8'));
      console.log(`PASS isolated PostgreSQL ${name} (${fullHistory ? 'complete local migration history' : 'without optional study-settings migration'})`);
    }
    if (!fullHistory) await checkDeletionThroughSdk(db);
  } finally { await db.close(); }
}

// Exercise the production endpoint and installed Supabase SDK. Only the
// transport to Auth/PostgREST is simulated; each mutation uses the isolated DB.
async function checkDeletionThroughSdk(db) {
  const id = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const session = '33333333-3333-4333-8333-333333333333';
  const token = `test.${Buffer.from(JSON.stringify({ sub: id, session_id: session })).toString('base64url')}.test`;
  const configured = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SECRET_KEY: 'test-server' };
  const previousEnv = Object.fromEntries(Object.keys(configured).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let signedOut = false;
  let verifiedRemoval = false;
  await db.query('insert into auth.users(id) values ($1), ($2)', [id, other]);
  await db.query('insert into auth.sessions(id,user_id,created_at) values ($1,$2,now())', [session, id]);
  await db.query("insert into public.subjects(user_id,id,data) values ($1,'one','{}'),($2,'two','{}')", [id, other]);
  try {
    Object.assign(process.env, configured);
    globalThis.fetch = async (input, options) => {
      const req = new Request(input, options);
      const url = new URL(req.url);
      assert.equal(url.origin, configured.SUPABASE_URL);
      if (url.pathname === '/auth/v1/user') {
        assert.equal(req.headers.get('apikey'), configured.SUPABASE_PUBLISHABLE_KEY);
        assert.equal(req.headers.get('authorization'), `Bearer ${token}`);
        return Response.json({ id, email: 'fixture@example.invalid' });
      }
      assert.equal(req.headers.get('apikey'), configured.SUPABASE_SECRET_KEY);
      if (url.pathname === '/rest/v1/rpc/privacy_recent_session') {
        const args = await req.json();
        const { rows } = await db.query('select public.privacy_recent_session($1,$2) as fresh', [args.p_user, args.p_session]);
        return Response.json(rows[0].fresh);
      }
      if (url.pathname === '/auth/v1/logout') {
        assert.equal(url.searchParams.get('scope'), 'global');
        assert.equal(req.headers.get('authorization'), `Bearer ${token}`);
        await db.query('delete from auth.sessions where user_id=$1', [id]);
        signedOut = true;
        return new Response(null, { status: 204 });
      }
      assert.equal(url.pathname, `/auth/v1/admin/users/${id}`);
      if (req.method === 'DELETE') {
        assert.equal(signedOut, true);
        assert.deepEqual(await req.json(), { should_soft_delete: false });
        await db.query('delete from auth.users where id=$1', [id]);
        return Response.json({});
      }
      assert.equal(req.method, 'GET');
      const { rows } = await db.query('select id from auth.users where id=$1', [id]);
      assert.deepEqual(rows, []);
      verifiedRemoval = true;
      return Response.json({ code: 'user_not_found', message: 'User not found' }, { status: 404, headers: { 'x-supabase-api-version': '2024-01-01' } });
    };
    const origin = 'http://localhost';
    const availability = await deletionAvailability(new Request(`${origin}/api/delete-account`, {
      headers: { Authorization: `Bearer ${token}` }
    }));
    assert.deepEqual(await availability.json(), { available: true, recentAuthenticationRequired: true });
    const result = await deleteAccount(new Request(`${origin}/api/delete-account`, {
      method: 'POST',
      headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'KONTO LÖSCHEN' })
    }));
    assert.deepEqual(await result.json(), { deleted: true });
    assert.equal(verifiedRemoval, true);
    const { rows } = await db.query('select user_id from public.subjects');
    assert.deepEqual(rows, [{ user_id: other }]);
    console.log('PASS disposable account hard deletion through the SDK and database; Auth/PostgREST transport simulated');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
