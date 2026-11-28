-- Synthetic users and cards, rolled back after this isolated check.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.subjects(user_id,id,data) select id,'s','{"id":"s"}' from auth.users where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.sets(user_id,id,subject_id,data) select user_id,'v','s','{"id":"v","subjectId":"s"}' from public.subjects where id='s';
insert into public.cards(user_id,id,set_id,data) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','c','v','{"front":"private"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
do $$
declare
  base jsonb := '{"set_id":"v","data":{"id":"c","setId":"v","front":"tragen","back":"porter"}}';
  first_edit jsonb := jsonb_set(base,'{data,back}','"vêtir"');
  add_card jsonb := jsonb_build_object('id','c','expected',null,'next',base);
  edit_card jsonb := jsonb_build_object('id','c','expected',base,'next',first_edit);
  owner_id uuid := auth.uid();
begin
  perform public.save_card_changes(owner_id,jsonb_build_array(add_card));
  perform public.save_card_changes(owner_id,jsonb_build_array(edit_card));
  begin
    -- A second device editing the same snapshot cannot commit any part of the batch.
    perform public.save_card_changes(owner_id,jsonb_build_array(
      jsonb_build_object('id','other','expected',null,'next',jsonb_set(base,'{data,id}','"other"')), edit_card));
    raise exception 'Expected stale edit';
  exception when sqlstate 'WW409' then null;
  end;
  if exists (select from public.cards where id='other') or
     (select data from public.cards where id='c') is distinct from first_edit->'data' then
    raise exception 'Batch rollback or first edit was lost';
  end if;
  begin
    perform public.save_card_changes(owner_id,jsonb_build_array(jsonb_build_object('id','c','expected',base,'next',null)));
    raise exception 'Expected stale delete';
  exception when sqlstate 'WW409' then null;
  end;
  begin
    perform public.save_card_changes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',jsonb_build_array(edit_card));
    raise exception 'Expected session mismatch';
  exception when insufficient_privilege then null;
  end;
  perform public.save_card_changes(owner_id,jsonb_build_array(jsonb_build_object('id','c','expected',first_edit,'next',null)));
  if exists (select from public.cards where id='c') then raise exception 'Current delete failed'; end if;
end;
$$;
reset role;
do $$begin
  if (select data from public.cards where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and id='c') is distinct from '{"front":"private"}'::jsonb then
    raise exception 'Unrelated account was changed';
  end if;
end;$$;
rollback;
