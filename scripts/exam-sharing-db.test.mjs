/** Isolated PostgreSQL regressions. No URL, account or production DB is used. */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
let PGlite;
try { ({PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite')); }
catch { throw new Error('Diese isolierte Datenbankprüfung benötigt separat installiertes @electric-sql/pglite. Setze PGLITE_MODULE auf dessen Modulpfad.'); }
const root=new URL('../',import.meta.url);
const sql=path=>readFile(new URL(path,root),'utf8');
for(const includeSettings of [true,false]){
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;`);
    for(const name of ['20261005000000_user_library.sql','20261111203927_library_sharing.sql',
      ...(includeSettings?['20261116064041_preserve_shared_study_settings.sql']:[]),'20261125195143_exam_share_snapshots.sql']){
      await db.exec(await sql(`supabase/migrations/${name}`));
    }
    if(includeSettings)await db.exec(await sql('supabase/checks/library-sharing.sql'));
    await db.exec(await sql('supabase/checks/exam-sharing.sql'));
    console.log(`PASS isolated PostgreSQL sharing (${includeSettings?'all local migrations, legacy and exams':'production baseline plus exam migration'})`);
  }finally{await db.close();}
}
