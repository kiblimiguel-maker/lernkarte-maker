-- Compare each card with the snapshot that the signed-in device actually read.
-- Each batch commits as a unit. Existing tables, policies and data stay in place.
create or replace function public.save_card_changes(p_owner uuid, p_changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  changed integer;
  total integer;
begin
  if owner_id is null or p_owner is distinct from owner_id then
    raise exception using errcode = '42501', message = 'Account changed.';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid card changes.';
  end if;
  if jsonb_array_length(p_changes) > 500 or exists (
    select from jsonb_array_elements(p_changes) c
    where jsonb_typeof(c->'id') is distinct from 'string' or c->>'id' = ''
       or not (c ? 'expected' and c ? 'next')
       or c->'expected' = 'null' and c->'next' = 'null'
       or c->'expected' <> 'null' and (jsonb_typeof(c->'expected'->'data') is distinct from 'object'
         or jsonb_typeof(c->'expected'->'set_id') is distinct from 'string')
       or c->'next' <> 'null' and (jsonb_typeof(c->'next'->'data') is distinct from 'object'
         or jsonb_typeof(c->'next'->'set_id') is distinct from 'string'
         or c->'next'->'data'->'id' is distinct from c->'id'
         or c->'next'->'data'->'setId' is distinct from c->'next'->'set_id')
  ) or exists (
    select from jsonb_array_elements(p_changes) c group by c->>'id' having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Invalid card changes.';
  end if;

  insert into public.cards (user_id, id, set_id, data)
    select owner_id, c->>'id', c->'next'->>'set_id', c->'next'->'data'
    from jsonb_array_elements(p_changes) c where c->'expected' = 'null'
    on conflict (user_id, id) do nothing;
  get diagnostics total = row_count;

  update public.cards as card set set_id = c->'next'->>'set_id', data = c->'next'->'data'
    from jsonb_array_elements(p_changes) c
    where card.user_id = owner_id and card.id = c->>'id' and c->'next' <> 'null'
      and card.set_id = c->'expected'->>'set_id' and card.data = c->'expected'->'data';
  get diagnostics changed = row_count;
  total := total + changed;

  delete from public.cards as card using jsonb_array_elements(p_changes) c
    where card.user_id = owner_id and card.id = c->>'id' and c->'next' = 'null'
      and card.set_id = c->'expected'->>'set_id' and card.data = c->'expected'->'data';
  get diagnostics changed = row_count;
  if total + changed <> jsonb_array_length(p_changes) then
    raise exception using errcode = 'WW409', message = 'A card changed since it was loaded.';
  end if;
end;
$$;
revoke all on function public.save_card_changes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_card_changes(uuid, jsonb) to authenticated;
