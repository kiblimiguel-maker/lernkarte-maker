-- Keep explicit pronunciation settings when a deck is copied, including in a folder.
-- This replaces the existing private function in place. Its grants, public RPC
-- signature, token semantics and per-recipient copy receipts stay in place.
create or replace function library_sharing.import_link(p_token text, p_subject_id text, p_expected_user uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := library_sharing.require_user(p_expected_user);
  destination_id text;
  copy_kind text;
  copied_id text;
  receipt_id text;
  copied_at timestamptz := statement_timestamp();
begin
  if library_sharing.valid_token(p_token) is distinct from true then return null; end if;

  -- Serialise imports for this account. The receipt and the complete copy
  -- commit together, so retries after a lost response return the existing ID.
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 170812));

  select r.kind, r.copy_id into copy_kind, receipt_id
  from library_sharing.receipts r where (r.user_id, r.token) = (caller_id, p_token);
  if found then
    if copy_kind = 'folder' then
      select f.id, f.subject_id into copied_id, destination_id
      from public.folders f where (f.user_id, f.id) = (caller_id, receipt_id);
    else
      select s.id, s.subject_id into copied_id, destination_id
      from public.sets s where (s.user_id, s.id) = (caller_id, receipt_id);
    end if;
    return jsonb_build_object(
      'status', 'already_imported', 'kind', copy_kind, 'id', copied_id,
      'subjectId', destination_id, 'missing', copied_id is null
    );
  end if;

  if not exists (select 1 from library_sharing.links l where l.token = p_token) then return null; end if;

  if p_subject_id is null then
    select s.id into destination_id
    from public.subjects s where s.user_id = caller_id and s.data->>'name' = 'Geteilt mit dir'
    order by library_sharing.position(s.data) nulls last, s.id limit 1 for key share;
  else
    select s.id into destination_id from public.subjects s
    where (s.user_id, s.id) = (caller_id, p_subject_id) for key share;
    if not found then
      raise exception using errcode = '42501', message = 'Destination unavailable';
    end if;
  end if;

  -- Source rows, generated IDs and all content inserts share one statement
  -- snapshot. A concurrent source edit or deletion cannot give a partial tree.
  with
  source as materialized (
    select * from library_sharing.source(p_token)
  ),
  items as materialized (
    select i.*
    from source src
    cross join lateral library_sharing.items(src.owner_id, src.subject_id, src.set_id, src.folder_id) i
  ),
  new_subject as (
    select gen_random_uuid()::text as id,
      coalesce((
        select max(library_sharing.position(s.data)) from public.subjects s where s.user_id = caller_id
      ), -1) + 1 as position
    from source where destination_id is null
  ),
  written_subject as (
    insert into public.subjects (user_id, id, data)
    select caller_id, s.id, jsonb_build_object(
      'id', s.id, 'name', 'Geteilt mit dir', 'description', '', 'color', '#366FA8',
      'emoji', '📚', 'icon', '📚', 'position', s.position, 'createdAt', copied_at, 'updatedAt', copied_at
    )
    from new_subject s returning id
  ),
  destination(id) as (
    select destination_id where destination_id is not null
    union all
    select s.id from written_subject s
  ),
  folder_plan as materialized (
    select f.id as original_id, gen_random_uuid()::text as id, f.data, src.folder_id as root_id,
      f.data->>'parentId' as parent_id,
      row_number() over (
        partition by f.data->>'parentId' order by library_sharing.position(f.data) nulls last, f.id
      ) - 1 as position
    from source src
    cross join items i
    join public.folders f on (f.user_id, f.id) = (src.owner_id, i.folder_id)
  ),
  written_folders as (
    insert into public.folders (user_id, id, subject_id, data)
    select caller_id, f.id, d.id, jsonb_build_object(
      'id', f.id, 'name', coalesce(f.data->>'name', 'Ordner'), 'color', f.data->>'color',
      'subjectId', d.id, 'parentId', case when f.original_id <> f.root_id then parent.id end,
      'position', case when f.original_id = f.root_id then coalesce((
        select max(library_sharing.position(sibling.data))
        from public.folders sibling
        where (sibling.user_id, sibling.subject_id) = (caller_id, d.id)
          and nullif(sibling.data->>'parentId', '') is null
      ), -1) + 1 else f.position end,
      'createdAt', copied_at, 'updatedAt', copied_at
    )
    from folder_plan f cross join destination d
    left join folder_plan parent on parent.original_id = f.parent_id
    returning id
  ),
  set_plan as materialized (
    select s.id as original_id, gen_random_uuid()::text as id, s.folder_id, s.data,
      row_number() over (
        partition by s.folder_id order by library_sharing.position(s.data) nulls last, s.id
      ) - 1 as position
    from source src
    cross join items i
    join public.sets s on (s.user_id, s.id) = (src.owner_id, i.set_id)
  ),
  written_sets as (
    insert into public.sets (user_id, id, subject_id, folder_id, data)
    select caller_id, s.id, d.id, f.id, jsonb_build_object(
      'id', s.id, 'name', coalesce(s.data->>'name', 'Lernstapel'), 'description', coalesce(s.data->>'description', ''),
      'subjectId', d.id, 'folderId', f.id, 'cardThemeId', s.data->>'cardThemeId',
      'position', case when f.id is null then coalesce((
        select max(library_sharing.position(sibling.data))
        from public.sets sibling where (sibling.user_id, sibling.subject_id) = (caller_id, d.id)
          and sibling.folder_id is null
      ), -1) + 1 else s.position end,
      'createdAt', copied_at, 'updatedAt', copied_at
    ) || case when s.data->>'frenchSpeechSide' in ('front', 'back', 'off')
         then jsonb_build_object('frenchSpeechSide', s.data->'frenchSpeechSide')
         else '{}'::jsonb end
    from set_plan s cross join destination d
    left join folder_plan mapped_folder on mapped_folder.original_id = s.folder_id
    left join written_folders f on f.id = mapped_folder.id
    returning id
  ),
  card_plan as (
    select gen_random_uuid()::text as id, s.id as set_id, c.data,
      row_number() over (partition by s.id order by (c.data->>'position')::integer nulls last, c.id) - 1 as position
    from source src
    cross join set_plan s
    join written_sets w on w.id = s.id
    join public.cards c on (c.user_id, c.set_id) = (src.owner_id, s.original_id)
  ),
  written_cards as (
    insert into public.cards (user_id, id, set_id, data)
    select caller_id, c.id, c.set_id, jsonb_build_object(
      'id', c.id, 'setId', c.set_id, 'front', coalesce(c.data->>'front', ''), 'back', coalesce(c.data->>'back', ''),
      'position', c.position, 'correctCount', 0, 'incorrectCount', 0, 'attemptCount', 0,
      'lastReviewedAt', null, 'nextReviewAt', null, 'createdAt', copied_at, 'updatedAt', copied_at
    ) || jsonb_strip_nulls(jsonb_build_object(
      'frontExampleSentence', c.data->>'frontExampleSentence', 'backExampleSentence', c.data->>'backExampleSentence'
    ))
    from card_plan c
  )
  select case when src.folder_id is not null then 'folder' else 'set' end,
    coalesce(f.id, s.id), d.id
  into copy_kind, copied_id, destination_id
  from source src cross join destination d
  left join folder_plan f on f.original_id = src.folder_id
  left join set_plan s on s.original_id = src.set_id;

  if not found then return null; end if;

  insert into library_sharing.receipts (user_id, token, kind, copy_id)
  values (caller_id, p_token, copy_kind, copied_id);
  return jsonb_build_object('status', 'imported', 'kind', copy_kind, 'id', copied_id, 'subjectId', destination_id);
end;
$$;
