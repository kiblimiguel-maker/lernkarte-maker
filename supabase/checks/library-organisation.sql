-- Run after migrations on an isolated database with psql -X -v ON_ERROR_STOP=1.
begin;

create function pg_temp.check_that(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'Organisation regression: %', description;
  end if;
end;
$$;

create function pg_temp.check_error(command text, expected_state text)
returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Organisation regression: expected SQLSTATE %', expected_state;
end;
$$;

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.subjects (user_id, id, data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'move-a', '{"id":"move-a","name":"Sprachen","position":0}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'move-b', '{"id":"move-b","name":"Schule","position":1}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'move-a', '{"id":"move-a","name":"Privat","position":0}');

insert into public.folders (user_id, id, subject_id, data)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, subject_id,
  jsonb_build_object('id', id, 'subjectId', subject_id, 'parentId', parent_id, 'position', 0)
from (values
  ('move-root', 'move-a', null),
  ('move-leaf', 'move-a', 'move-root'),
  ('move-target', 'move-b', null)
) as folder(id, subject_id, parent_id);

insert into public.sets (user_id, id, subject_id, folder_id, data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'move-deck', 'move-a', 'move-leaf',
    '{"id":"move-deck","subjectId":"move-a","folderId":"move-leaf","name":"Verben","position":0}');
insert into public.cards (user_id, id, set_id, data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'move-card', 'move-deck',
    '{"id":"move-card","setId":"move-deck","front":"gehen","back":"aller","correctCount":1,"position":0}');
insert into public.study_sessions (user_id, id, set_id, data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'move-session', 'move-deck', '{"id":"move-session","setId":"move-deck","index":0}');
insert into public.study_history (user_id, id, set_id, data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'move-history', 'move-deck', '{"id":"move-history","setId":"move-deck","known":1}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('organisation_test.expected', '{
  "subjects": [{"id":"move-a","position":0},{"id":"move-b","position":1}],
  "folders": [{"id":"move-root","subjectId":"move-a","parentId":null,"position":0},
    {"id":"move-leaf","subjectId":"move-a","parentId":"move-root","position":0},
    {"id":"move-target","subjectId":"move-b","parentId":null,"position":0}],
  "sets": [{"id":"move-deck","subjectId":"move-a","folderId":"move-leaf","position":0}]
}', true);

select set_config('organisation_test.move', '{
  "subjects": [],
  "folders": [{"id":"move-root","subjectId":"move-b","parentId":"move-target","position":0},
    {"id":"move-leaf","subjectId":"move-b","parentId":"move-root","position":0}],
  "sets": [{"id":"move-deck","subjectId":"move-b","folderId":"move-leaf","position":0}]
}', true);

select pg_temp.check_that(
  (select count(*) = 2 from public.subjects) and
  (select data->>'name' = 'Sprachen' from public.subjects where id = 'move-a'),
  'a signed-in account only sees its own rows even when an ID matches');

select pg_temp.check_error($cmd$
  select public.organise_library(current_setting('organisation_test.expected')::jsonb, '{
    "subjects": [],
    "folders": [{"id":"move-root","subjectId":"move-a","parentId":"move-leaf","position":0}],
    "sets": []
  }')
$cmd$, '22023');

select pg_temp.check_error($cmd$
  select public.organise_library(current_setting('organisation_test.expected')::jsonb, '{
    "subjects": [{"id":"move-a","position":1}], "folders": [], "sets": []
  }')
$cmd$, '22023');

-- A concurrent name edit does not invalidate an unchanged order snapshot.
update public.sets set data = jsonb_set(data, '{name}', '"Verben und Zeiten"') where id = 'move-deck';
select public.organise_library(current_setting('organisation_test.expected')::jsonb, current_setting('organisation_test.move')::jsonb);

select pg_temp.check_that(
  (select subject_id = 'move-b' and data->>'parentId' = 'move-target' from public.folders where id = 'move-root')
  and (select subject_id = 'move-b' and data->>'parentId' = 'move-root' from public.folders where id = 'move-leaf')
  and (select subject_id = 'move-b' and folder_id = 'move-leaf' and data->>'name' = 'Verben und Zeiten'
    from public.sets where id = 'move-deck')
  and (select data->>'correctCount' = '1' from public.cards where id = 'move-card')
  and (select set_id = 'move-deck' from public.study_sessions where id = 'move-session')
  and (select set_id = 'move-deck' from public.study_history where id = 'move-history'),
  'moving a subtree keeps parent links, independently edited names and learning progress');

select pg_temp.check_error($cmd$
  select public.organise_library(current_setting('organisation_test.expected')::jsonb, current_setting('organisation_test.move')::jsonb)
$cmd$, '40001');

select pg_temp.check_error($cmd$
  select public.save_library_organisation_rows('sets', '[{
    "expected":{"id":"move-deck","subjectId":"move-a","folderId":"move-leaf","position":0},
    "row":{"id":"move-deck","subject_id":"move-a","folder_id":"move-leaf","data":{"id":"move-deck","name":"Alte Ablage"}}
  }]');
$cmd$, '40001');

select pg_temp.check_that(
  (select subject_id = 'move-b' and data->>'name' = 'Verben und Zeiten' from public.sets where id = 'move-deck'),
  'a stale move or edit leaves both location and content intact');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select pg_temp.check_that(
  (select data->>'name' = 'Privat' from public.subjects where id = 'move-a')
  and not exists (select from public.folders)
  and not exists (select from public.cards),
  'another account stays isolated across the move');

rollback;
