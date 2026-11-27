-- Isolated PostgreSQL only. Fixtures and the deliberate account removal roll back.
begin;
create function pg_temp.privacy_check(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Privacy regression: %',label;end if;end$$;
create function pg_temp.privacy_error(command text,code text) returns void language plpgsql as $$begin begin execute command;exception when others then if sqlstate=code then return;end if;raise;end;raise exception 'Expected SQLSTATE %',code;end$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into auth.sessions(id,user_id,created_at,not_after) values
 ('11111111-2222-4333-8444-555555555555','11111111-1111-4111-8111-111111111111',now()-interval '1 minute',null),
 ('22222222-2222-4333-8444-555555555555','11111111-1111-4111-8111-111111111111',now()-interval '1 hour',null),
 ('33333333-2222-4333-8444-555555555555','11111111-1111-4111-8111-111111111111',now()-interval '1 minute',now()-interval '1 second');
insert into public.subjects(user_id,id,data) values
 ('11111111-1111-4111-8111-111111111111','a','{"name":"Original","color":"#AABBCC"}'),
 ('22222222-2222-4222-8222-222222222222','b','{"name":"Eigenes Zielfach","color":"#BBCCDD"}');
insert into public.folders(user_id,id,subject_id,data) values
 ('11111111-1111-4111-8111-111111111111','exam','a','{"name":"Test","kind":"exam","examDate":"2026-12-01","examNotes":"Notizen","examLinks":[],"examSetIds":["selected"],"position":0}'),
 ('11111111-1111-4111-8111-111111111111','folder','a','{"name":"Geteilter Ordner","position":1}');
insert into public.sets(user_id,id,subject_id,folder_id,data) values
 ('11111111-1111-4111-8111-111111111111','selected','a','folder','{"name":"Geteilter Stapel","position":0}');
insert into public.cards(user_id,id,set_id,data) values
 ('11111111-1111-4111-8111-111111111111','c','selected','{"front":"Lerntext","back":"Antwort","position":0}');
insert into public.study_sessions(user_id,id,set_id,data) values ('11111111-1111-4111-8111-111111111111','session','selected','{"currentIndex":0}');
insert into public.study_history(user_id,id,set_id,data) values ('11111111-1111-4111-8111-111111111111','history','selected','{"completed":true}');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('privacy_test.set_token',public.create_library_share('set','selected'),true);
select set_config('privacy_test.exam_token',public.create_library_share('exam','exam'),true);
select pg_temp.privacy_error($q$select public.privacy_recent_session('11111111-1111-4111-8111-111111111111','11111111-2222-4333-8444-555555555555')$q$,'42501');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.privacy_check(public.preview_library_share(current_setting('privacy_test.set_token'))->>'title'='Geteilter Stapel','ordinary anonymous preview still works');
select pg_temp.privacy_error($q$select public.privacy_recent_session('11111111-1111-4111-8111-111111111111','11111111-2222-4333-8444-555555555555')$q$,'42501');
reset role;
set local role service_role;
select pg_temp.privacy_check(public.privacy_recent_session('11111111-1111-4111-8111-111111111111','11111111-2222-4333-8444-555555555555'),'fresh original session');
select pg_temp.privacy_check(not public.privacy_recent_session('11111111-1111-4111-8111-111111111111','22222222-2222-4333-8444-555555555555'),'old session remains old after JWT refresh');
select pg_temp.privacy_check(not public.privacy_recent_session('22222222-2222-4222-8222-222222222222','11111111-2222-4333-8444-555555555555'),'wrong session owner');
select pg_temp.privacy_check(not public.privacy_recent_session('11111111-1111-4111-8111-111111111111','33333333-2222-4333-8444-555555555555'),'expired original session');
select pg_temp.privacy_check(not public.privacy_recent_session('11111111-1111-4111-8111-111111111111',null),'missing session cannot authorise deletion');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('privacy_test.copy',public.import_library_share(current_setting('privacy_test.set_token'),'b')::text,true);
reset role;
-- Represents Auth Admin's hard delete in this isolated environment.
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
select pg_temp.privacy_check(not exists(select 1 from public.cards where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes own cards');
select pg_temp.privacy_check(not exists(select 1 from public.subjects where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes subjects');
select pg_temp.privacy_check(not exists(select 1 from public.folders where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes folders and tests');
select pg_temp.privacy_check(not exists(select 1 from public.sets where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes decks');
select pg_temp.privacy_check(not exists(select 1 from public.study_sessions where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes study sessions');
select pg_temp.privacy_check(not exists(select 1 from public.study_history where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes study history');
select pg_temp.privacy_check(not exists(select 1 from library_sharing.links where owner_id='11111111-1111-4111-8111-111111111111'),'account deletion removes live share links');
select pg_temp.privacy_check(not exists(select 1 from auth.sessions where user_id='11111111-1111-4111-8111-111111111111'),'account deletion removes login sessions');
select pg_temp.privacy_check((select count(*)=1 from public.cards where user_id='22222222-2222-4222-8222-222222222222'),'account deletion retains recipient copies');
select pg_temp.privacy_check(not exists(select 1 from exam_sharing.links where owner_id='11111111-1111-4111-8111-111111111111'),'account deletion removes own snapshots');
-- A bearer JWT can outlive its revoked session. Model its still-authenticated
-- identity and verify that the deleted owner can neither see nor recreate rows.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.privacy_check(not exists(select 1 from public.subjects),'deleted owner has no visible library');
select pg_temp.privacy_error($q$insert into public.subjects(user_id,id,data) values ('11111111-1111-4111-8111-111111111111','new','{}')$q$,'23503');
reset role;
rollback;
