-- Run with psql -X -v ON_ERROR_STOP=1 on an isolated database after migrations.
-- All fixtures and the deliberate failure trigger are rolled back.
begin;

create function pg_temp.check_that(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'Sharing regression: %', description;
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
  raise exception 'Sharing regression: expected SQLSTATE %', expected_state;
end;
$$;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

insert into public.subjects (user_id, id, data) values
  ('11111111-1111-4111-8111-111111111111', 'share-test-subject-a', '{"id":"share-test-subject-a","name":"Französisch","position":0}'),
  ('11111111-1111-4111-8111-111111111111', 'share-test-private-subject', '{"id":"share-test-private-subject","name":"Privates Fach","position":1}'),
  ('22222222-2222-4222-8222-222222222222', 'share-test-subject-b', '{"id":"share-test-subject-b","name":"Sprachen","position":0}');

insert into public.folders (user_id, id, subject_id, data)
select '11111111-1111-4111-8111-111111111111', id, 'share-test-subject-a',
  jsonb_build_object('id', id, 'subjectId', 'share-test-subject-a', 'name', title,
    'parentId', parent_id, 'position', position, 'color', color)
from (values
  ('share-test-parent', 'Privater Oberordner', null, 0, '#617A9B'),
  ('share-test-root', 'Geteiltes Kapitel', 'share-test-parent', 0, '#7EA9A5'),
  ('share-test-child-first', 'Zuerst', 'share-test-root', 0, '#B97575'),
  ('share-test-child-second', 'Danach', 'share-test-root', 1, '#D9BD79'),
  ('share-test-grandchild', 'Tiefer', 'share-test-child-first', 0, '#A094B9'),
  ('share-test-neighbor', 'Privater Nachbarordner', 'share-test-parent', 1, '#C99FAC')
) as folders(id, title, parent_id, position, color);

-- Old folder parent pointers live in JSON. A reference across subjects does
-- not make the other subject's folder part of the shared subtree.
insert into public.folders (user_id, id, subject_id, data) values
  ('11111111-1111-4111-8111-111111111111', 'share-test-other-subject-folder', 'share-test-private-subject',
    '{"id":"share-test-other-subject-folder","subjectId":"share-test-private-subject","parentId":"share-test-root","name":"Privater Ordner im anderen Fach"}');

insert into public.sets (user_id, id, subject_id, folder_id, data)
select '11111111-1111-4111-8111-111111111111', id, 'share-test-subject-a', folder_id,
  jsonb_build_object('id', id, 'subjectId', 'share-test-subject-a', 'folderId', folder_id,
    'name', title, 'description', 'Lektion à Paris', 'position', position,
    'cardThemeId', 'lunar-navy-pearl-silver', 'lastStudiedAt', '2026-10-01T00:00:00Z')
from (values
  ('share-test-stack-z', 'Erster Stapel', 'share-test-root', 0),
  ('share-test-stack-a', 'Zweiter Stapel', 'share-test-root', 1),
  ('share-test-deep-stack', 'Tiefer Stapel', 'share-test-grandchild', 0),
  ('share-test-private-stack', 'Privater Stapel', 'share-test-neighbor', 0)
) as stacks(id, title, folder_id, position);

insert into public.cards (user_id, id, set_id, data)
select '11111111-1111-4111-8111-111111111111', id, set_id,
  jsonb_build_object('id', id, 'setId', set_id, 'front', front, 'back', back,
    'frontExampleSentence', 'Das ist ein Beispiel.', 'backExampleSentence', 'C’est un exemple.',
    'position', position, 'correctCount', 4, 'incorrectCount', 2, 'attemptCount', 6,
    'lastReviewedAt', '2026-10-01T00:00:00Z', 'nextReviewAt', '2026-10-02T00:00:00Z')
from (values
  ('share-test-card-z', 'share-test-stack-z', 'eine Burg', 'un château fort', 0),
  ('share-test-card-a', 'share-test-stack-z', 'die Königin', 'la reine', 1),
  ('share-test-deep-card', 'share-test-deep-stack', 'ein Schlüssel', 'une clé', 0),
  ('share-test-private-card', 'share-test-private-stack', 'privat', 'privé', 0)
) as cards(id, set_id, front, back, position);

insert into public.study_sessions (user_id, id, set_id, data) values
  ('11111111-1111-4111-8111-111111111111', 'share-test-session', 'share-test-stack-z', '{}');
insert into public.study_history (user_id, id, set_id, data) values
  ('11111111-1111-4111-8111-111111111111', 'share-test-history', 'share-test-stack-z', '{}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('share_test.folder', public.create_library_share('folder', 'share-test-root'), true);
select set_config('share_test.set', public.create_library_share('set', 'share-test-stack-z'), true);
select pg_temp.check_that(current_setting('share_test.folder') ~ '^[0-9a-f]{64}$'
  and current_setting('share_test.set') ~ '^[0-9a-f]{64}$'
  and current_setting('share_test.folder') <> current_setting('share_test.set'), 'share tokens have the expected shape and are distinct');
select pg_temp.check_that(public.create_library_share('folder', 'share-test-root') = current_setting('share_test.folder'),
  'reopening the share dialog reuses its token');
select pg_temp.check_error($cmd$select public.create_library_share('subject', 'share-test-subject-a')$cmd$, '22023');
select pg_temp.check_error($cmd$select public.create_library_share('folder', 'share-test-root',
  '22222222-2222-4222-8222-222222222222')$cmd$, '42501');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.check_that(public.preview_library_share(current_setting('share_test.folder'))::jsonb =
  '{"kind":"folder","title":"Geteiltes Kapitel","folderCount":3,"setCount":3,"cardCount":3}', 'anonymous preview exposes only title and counts for the shared subtree');
select pg_temp.check_that(public.preview_library_share(current_setting('share_test.set'))::jsonb =
  '{"kind":"set","title":"Erster Stapel","folderCount":0,"setCount":1,"cardCount":2}', 'anonymous preview can open a single stack');
select pg_temp.check_that(public.preview_library_share('share-test-root') is null
  and public.preview_library_share(repeat('0', 64)) is null, 'a private ID or an unknown token does not open a preview');
select pg_temp.check_error($cmd$select public.create_library_share('folder', 'share-test-root')$cmd$, '42501');
select pg_temp.check_error($cmd$select public.import_library_share(current_setting('share_test.folder'))$cmd$, '42501');
select pg_temp.check_error($cmd$select * from public.cards$cmd$, '42501');
select pg_temp.check_error($cmd$select * from library_sharing.source(current_setting('share_test.folder'))$cmd$, '42501');
select pg_temp.check_error($cmd$select * from library_sharing.links$cmd$, '42501');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select pg_temp.check_that((select count(*) = 0 from public.cards where id like 'share-test-%'), 'a second user cannot read original cards');
select pg_temp.check_error($cmd$select public.create_library_share('folder', 'share-test-root')$cmd$, 'P0002');
select pg_temp.check_error($cmd$select public.import_library_share(current_setting('share_test.folder'), 'share-test-subject-a')$cmd$, '42501');
select pg_temp.check_error($cmd$select public.import_library_share(current_setting('share_test.folder'), null,
  '11111111-1111-4111-8111-111111111111')$cmd$, '42501');
select pg_temp.check_that(public.import_library_share(repeat('0', 64)) is null
  and not exists (select from public.subjects where data->>'name' = 'Geteilt mit dir'),
  'an unavailable link creates no destination or receipt');

reset role;
create function pg_temp.fail_shared_card_insert()
returns trigger language plpgsql as $$
begin
  if new.user_id = '22222222-2222-4222-8222-222222222222' then
    raise exception using message = 'Simulated test card insert failure', errcode = 'P0499';
  end if;
  return new;
end;
$$;
create trigger share_test_fail_card before insert on public.cards
for each row execute function pg_temp.fail_shared_card_insert();

set local role authenticated;
select pg_temp.check_error($cmd$select public.import_library_share(current_setting('share_test.folder'))$cmd$, 'P0499');
select pg_temp.check_that(
  (select count(*) = 1 from public.subjects where user_id = auth.uid())
  and (select count(*) = 0 from public.folders where user_id = auth.uid())
  and (select count(*) = 0 from public.sets where user_id = auth.uid())
  and (select count(*) = 0 from public.cards where user_id = auth.uid()),
  'an interrupted import rolls back the subject, folder, stacks and cards');

reset role;
drop trigger share_test_fail_card on public.cards;

set local role authenticated;
select set_config('share_test.import_b', public.import_library_share(current_setting('share_test.folder'))::text, true);
select pg_temp.check_that(current_setting('share_test.import_b')::jsonb @> '{"status":"imported","kind":"folder"}',
  'an authenticated account can retry and import a folder');
select pg_temp.check_that(public.import_library_share(current_setting('share_test.folder'), 'share-test-subject-b')::jsonb @> jsonb_build_object(
  'status', 'already_imported', 'id', current_setting('share_test.import_b')::jsonb->>'id'), 'a second request returns the same copy, even with a new destination');
select pg_temp.check_that(
  (select count(*) = 4 from public.folders where user_id = auth.uid())
  and (select count(*) = 3 from public.sets where user_id = auth.uid())
  and (select count(*) = 3 from public.cards where user_id = auth.uid()),
  'exactly one subtree is created and contains no private sibling');
select pg_temp.check_that(
  (select data->>'name' = 'Geteilt mit dir' from public.subjects where user_id = auth.uid()
    and id = current_setting('share_test.import_b')::jsonb->>'subjectId')
  and (select id <> 'share-test-root' and data->>'id' = id and data->>'parentId' is null and data->>'color' = '#7EA9A5'
    from public.folders where user_id = auth.uid() and id = current_setting('share_test.import_b')::jsonb->>'id'),
  'the imported root is independent and its colour survives');
select pg_temp.check_that(
  (select array_agg(data->>'name' order by (data->>'position')::integer) = array['Zuerst', 'Danach']
    from public.folders where user_id = auth.uid() and data->>'parentId' = current_setting('share_test.import_b')::jsonb->>'id')
  and exists (
    select from public.folders grandchild join public.folders child on child.user_id = grandchild.user_id and child.id = grandchild.data->>'parentId'
    where grandchild.user_id = auth.uid() and grandchild.data->>'name' = 'Tiefer' and child.data->>'name' = 'Zuerst'
  ), 'the nested folder relations and sibling order are retained');
select pg_temp.check_that(
  (select array_agg(data->>'name' order by (data->>'position')::integer) = array['Erster Stapel', 'Zweiter Stapel']
    from public.sets where user_id = auth.uid() and folder_id = current_setting('share_test.import_b')::jsonb->>'id')
  and (select bool_and(id = data->>'id' and subject_id = data->>'subjectId' and folder_id = data->>'folderId'
    and data->>'description' = 'Lektion à Paris' and data->>'cardThemeId' = 'lunar-navy-pearl-silver' and data->>'lastStudiedAt' is null)
    from public.sets where user_id = auth.uid()),
  'stack fields and relative order survive while private progress is cleared');
select pg_temp.check_that(
  (select array_agg(c.data->>'front' order by (c.data->>'position')::integer) = array['eine Burg', 'die Königin']
    from public.cards c join public.sets s on s.user_id = c.user_id and s.id = c.set_id
    where c.user_id = auth.uid() and s.data->>'name' = 'Erster Stapel')
  and (select bool_and(id = data->>'id' and set_id = data->>'setId' and id not like 'share-test-%'
    and data->>'frontExampleSentence' = 'Das ist ein Beispiel.' and data->>'backExampleSentence' = 'C’est un exemple.'
    and data @> '{"correctCount":0,"incorrectCount":0,"attemptCount":0,"lastReviewedAt":null,"nextReviewAt":null}')
    from public.cards where user_id = auth.uid())
  and not exists (select from public.study_sessions)
  and not exists (select from public.study_history),
  'card text, order and examples survive under new IDs and clean progress');

select set_config('share_test.import_b_set', public.import_library_share(current_setting('share_test.set'), 'share-test-subject-b')::text, true);
select pg_temp.check_that(current_setting('share_test.import_b_set')::jsonb @> '{"status":"imported","kind":"set","subjectId":"share-test-subject-b"}'
  and (select folder_id is null from public.sets where user_id = auth.uid() and id = current_setting('share_test.import_b_set')::jsonb->>'id')
  and (select count(*) = 2 from public.cards where user_id = auth.uid() and set_id = current_setting('share_test.import_b_set')::jsonb->>'id'),
  'one stack is imported directly into a chosen subject');

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","is_anonymous":true}', true);
select pg_temp.check_error($cmd$select public.import_library_share(current_setting('share_test.folder'))$cmd$, '42501');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select set_config('share_test.import_c', public.import_library_share(current_setting('share_test.folder'))::text, true);
select pg_temp.check_that(current_setting('share_test.import_c')::jsonb @> '{"status":"imported","kind":"folder"}'
  and current_setting('share_test.import_c')::jsonb->>'id' <> current_setting('share_test.import_b')::jsonb->>'id',
  'a third user can use the same token and receives an independent ID');
select pg_temp.check_that(public.import_library_share(current_setting('share_test.set'))::jsonb @> jsonb_build_object(
  'status', 'imported', 'subjectId', current_setting('share_test.import_c')::jsonb->>'subjectId'),
  'another link can reuse the default recipient subject');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
update public.cards set data = jsonb_set(data, '{front}', '"Meine unabhängige Änderung"') where user_id = auth.uid()
  and set_id = current_setting('share_test.import_b_set')::jsonb->>'id' and data->>'front' = 'eine Burg';

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select pg_temp.check_that((select data->>'front' = 'eine Burg' from public.cards where user_id = auth.uid() and id = 'share-test-card-z'),
  'editing a copy leaves the original intact');
with affected as (
  delete from public.folders where id = current_setting('share_test.import_b')::jsonb->>'id' returning id
) select pg_temp.check_that(not exists (select from affected), 'the original owner cannot delete a recipient copy');
update public.cards set data = jsonb_set(data, '{front}', '"Geänderter Originaltext"') where user_id = auth.uid() and id = 'share-test-card-z';
update public.folders set data = jsonb_set(data, '{name}', '"Geänderter Originalordner"') where user_id = auth.uid() and id = 'share-test-root';
select pg_temp.check_that(public.preview_library_share(current_setting('share_test.folder'))::jsonb->>'title' = 'Geänderter Originalordner',
  'a preview before copying reflects the available original');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select pg_temp.check_that(
  (select data->>'name' = 'Geteiltes Kapitel' from public.folders where user_id = auth.uid() and id = current_setting('share_test.import_b')::jsonb->>'id')
  and (select count(*) filter (where data->>'front' = 'eine Burg') = 1
    and count(*) filter (where data->>'front' = 'Geänderter Originaltext') = 0 from public.cards where user_id = auth.uid()),
  'changes to the original have no effect on an existing copy');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
delete from public.sets where user_id = auth.uid() and id = 'share-test-stack-z';
delete from public.folders where user_id = auth.uid() and id = 'share-test-root';
select pg_temp.check_that(public.preview_library_share(current_setting('share_test.folder')) is null
  and public.preview_library_share(current_setting('share_test.set')) is null, 'deleted originals stop opening in preview');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select pg_temp.check_that(
  (select count(*) = 5 and count(*) filter (where data->>'front' = 'Meine unabhängige Änderung') = 1
    and count(*) filter (where data->>'front' = 'Geänderter Originaltext') = 0
    from public.cards where user_id = auth.uid())
  and public.import_library_share(current_setting('share_test.folder'))::jsonb @> jsonb_build_object(
    'status', 'already_imported', 'id', current_setting('share_test.import_b')::jsonb->>'id'),
  'deleting the originals keeps imported cards and duplicate protection intact');
delete from public.sets where user_id = auth.uid() and id = current_setting('share_test.import_b_set')::jsonb->>'id';
select pg_temp.check_that(public.import_library_share(current_setting('share_test.set'))::jsonb @>
  '{"status":"already_imported","kind":"set","missing":true}', 'removing an imported copy does not silently import it again');

rollback;
