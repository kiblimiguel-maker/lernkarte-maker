-- Isolated database only; fixtures, failure injection and all copies roll back.
begin;
create function pg_temp.exam_check(ok boolean, label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Exam sharing: %',label; end if; end$$;
create function pg_temp.exam_error(command text, code text) returns void language plpgsql as $$begin begin execute command; exception when others then if sqlstate=code then return; end if; raise; end; raise exception 'Expected SQLSTATE %',code; end$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
insert into public.subjects(user_id,id,data) values
 ('11111111-1111-4111-8111-111111111111','a','{"name":"BIO","color":"#FF0000"}'),
 ('11111111-1111-4111-8111-111111111111','a2','{"name":"Querfach"}'),
 ('22222222-2222-4222-8222-222222222222','b','{"name":"Meine Biologie","color":"#008800"}'),
 ('33333333-3333-4333-8333-333333333333','c-private','{"name":"Privat"}');
insert into public.folders(user_id,id,subject_id,data) values
 ('11111111-1111-4111-8111-111111111111','test','a','{"name":"Zellen","kind":"exam","examDate":"2026-12-14","examNotes":"Wichtige Lernziele","examLinks":[{"id":"url","title":"Unterlagen","url":"https://example.org"}],"examSetIds":["linked","direct","outsider","linked"],"position":0}'),
 ('11111111-1111-4111-8111-111111111111','child','a','{"name":"Teilgebiet","parentId":"test","position":0,"color":"#AABBCC"}');
insert into public.sets(user_id,id,subject_id,folder_id,data) values
 ('11111111-1111-4111-8111-111111111111','direct','a','test','{"name":"Direkt","position":0,"frenchSpeechSide":"off"}'),
 ('11111111-1111-4111-8111-111111111111','nested','a','child','{"name":"Verschachtelt","position":0}'),
 ('11111111-1111-4111-8111-111111111111','linked','a2',null,'{"name":"Verknüpft","cardThemeId":"lunar-navy-pearl-silver","frenchSpeechSide":"back"}'),
 ('11111111-1111-4111-8111-111111111111','private','a',null,'{"name":"Nicht geteilt"}'),
 ('33333333-3333-4333-8333-333333333333','outsider','c-private',null,'{"name":"Fremde private Daten"}');
insert into public.cards(user_id,id,set_id,data) select user_id,id||'-card',id,jsonb_build_object('front',id,'back','Antwort','frontExampleSentence','Beispiel','position',0,'correctCount',7,'attemptCount',8) from public.sets;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('exam_test.token',public.create_library_share('exam','test','11111111-1111-4111-8111-111111111111'),true);
select pg_temp.exam_check(length(current_setting('exam_test.token'))=64,'strong token');
select pg_temp.exam_check(public.create_library_share('exam','test')=current_setting('exam_test.token'),'unchanged snapshot reused');
select pg_temp.exam_error($q$select public.create_library_share('exam','test','22222222-2222-4222-8222-222222222222')$q$,'42501');
select pg_temp.exam_error($q$select public.create_library_share('exam','missing')$q$,'P0002');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.exam_check(public.preview_library_share(current_setting('exam_test.token'))->>'title'='Zellen','anonymous metadata preview');
select pg_temp.exam_check(public.preview_library_share(current_setting('exam_test.token'))->>'setCount'='3','linked plus nested, no private or foreign decks');
select pg_temp.exam_check(public.preview_library_share(current_setting('exam_test.token'))->>'cardCount'='3','exact card count');
select pg_temp.exam_check(not(public.preview_library_share(current_setting('exam_test.token')) ? 'examNotes'),'preview reveals no notes');
select pg_temp.exam_check(not has_table_privilege('anon','exam_sharing.links','SELECT'),'no table access');
select pg_temp.exam_error($q$select public.create_library_share('exam','test')$q$,'42501');
select pg_temp.exam_check(public.preview_library_share('bad') is null,'invalid link');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.exam_error($q$select public.import_library_share(current_setting('exam_test.token'),'a')$q$,'42501');
select set_config('exam_test.copy',public.import_library_share(current_setting('exam_test.token'),'b')::text,true);
select pg_temp.exam_check((current_setting('exam_test.copy')::jsonb)->>'kind'='exam','exam result kind');
select pg_temp.exam_check((current_setting('exam_test.copy')::jsonb)->>'subjectId'='b','chosen own destination');
select pg_temp.exam_check(public.import_library_share(current_setting('exam_test.token'),'b')->>'status'='already_imported','deduplicated retry');
select pg_temp.exam_check((select count(*)=3 from public.cards),'only own copied cards visible');
select pg_temp.exam_check((select bool_and(data->>'correctCount'='0' and data->>'attemptCount'='0') from public.cards),'progress reset');
select pg_temp.exam_check((select bool_and(subject_id='b') from public.sets),'all copied materials in chosen subject');
select pg_temp.exam_check((select data->>'examNotes'='Wichtige Lernziele' and data->>'examDate'='2026-12-14' and data->'examSetIds'='[]'::jsonb from public.folders where id=(current_setting('exam_test.copy')::jsonb)->>'id'),'test metadata preserved; no source IDs');
select pg_temp.exam_check((select count(*)=1 from public.sets where data->>'frenchSpeechSide'='back'),'pronunciation preserved');
reset role;
select pg_temp.exam_check((select count(*)=3 from public.cards where user_id='22222222-2222-4222-8222-222222222222'),'no duplicate copies');
update public.folders set data=jsonb_set(data,'{name}','"Geänderte Version"') where user_id='11111111-1111-4111-8111-111111111111' and id='test';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('exam_test.token2',public.create_library_share('exam','test'),true);
select pg_temp.exam_check(current_setting('exam_test.token2')<>current_setting('exam_test.token'),'new content gets new immutable link');
reset role;
delete from public.subjects where user_id='11111111-1111-4111-8111-111111111111';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.exam_check(public.preview_library_share(current_setting('exam_test.token'))->>'title'='Zellen','old snapshot survives source deletion');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select set_config('exam_test.latecopy',public.import_library_share(current_setting('exam_test.token'))::text,true);
select pg_temp.exam_check((current_setting('exam_test.latecopy')::jsonb)->>'status'='imported','first import after source deletion');
select pg_temp.exam_check((select count(*)=4 from public.cards),'late recipient gets snapshot plus own untouched card');
select pg_temp.exam_check((select data->>'name'='Geteilt mit dir' from public.subjects where id=(current_setting('exam_test.latecopy')::jsonb)->>'subjectId'),'default destination created');
delete from public.folders where id=(current_setting('exam_test.latecopy')::jsonb)->>'id';
select pg_temp.exam_check(public.import_library_share(current_setting('exam_test.token'))->>'status'='imported','deleted recipient test can be restored');
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
select pg_temp.exam_error($q$select public.import_library_share(current_setting('exam_test.token'))$q$,'42501');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
reset role;
create function pg_temp.fail_exam_card() returns trigger language plpgsql as $$begin if new.user_id='44444444-4444-4444-8444-444444444444' then raise exception 'Deliberate isolated failure'; end if; return new; end$$;
create trigger exam_card_failure before insert on public.cards for each row execute function pg_temp.fail_exam_card();
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select pg_temp.exam_error($q$select public.import_library_share(current_setting('exam_test.token'))$q$,'P0001');
select pg_temp.exam_check((select count(*)=0 from public.folders),'failed transaction leaves no partial folders');
select pg_temp.exam_check((select count(*)=0 from public.subjects),'failed transaction leaves no partial subject');
reset role;
drop trigger exam_card_failure on public.cards;
set local role authenticated;
select pg_temp.exam_check(public.import_library_share(current_setting('exam_test.token'))->>'status'='imported','retry after full rollback');
reset role;
select pg_temp.exam_check(not has_table_privilege('authenticated','exam_sharing.links','UPDATE'),'snapshot immutable for app roles');
rollback;
