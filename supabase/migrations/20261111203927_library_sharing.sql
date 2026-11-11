-- A link names a source, and a receipt records a completed copy. Only the
-- link follows the source lifecycle. Receipts have no foreign key to it.
create schema library_sharing;

revoke all on schema library_sharing from public, anon, authenticated;
grant usage on schema library_sharing to anon, authenticated;

create table library_sharing.links (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  owner_id uuid not null,
  folder_id text,
  set_id text,
  check (num_nonnulls(folder_id, set_id) = 1),
  unique (owner_id, folder_id),
  unique (owner_id, set_id),
  foreign key (owner_id, folder_id) references public.folders(user_id, id) on delete cascade,
  foreign key (owner_id, set_id) references public.sets(user_id, id) on delete cascade
);

create table library_sharing.receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  kind text not null check (kind in ('folder', 'set')),
  copy_id text not null,
  primary key (user_id, token)
);

alter table library_sharing.links enable row level security;
alter table library_sharing.receipts enable row level security;
revoke all on all tables in schema library_sharing from public, anon, authenticated;

create index folders_share_parent_idx
  on public.folders (user_id, subject_id, ((data->>'parentId')));

create function library_sharing.require_user(p_expected_user uuid) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null
    or auth.jwt()->>'is_anonymous' = 'true'
    or (p_expected_user is not null and p_expected_user <> caller_id) then
    raise exception using errcode = '42501', message = 'An active matching user account is required';
  end if;
  return caller_id;
end;
$$;

create function library_sharing.valid_token(p_token text) returns boolean
language sql immutable strict
set search_path = ''
as $$
  select length(p_token) = 64 and (p_token collate pg_catalog."C") ~ '^[0-9a-f]{64}$'
$$;

-- Relational keys identify the actual owner and source. JSON stores the
-- editable content and the folder parent, which stays in the source subject.
create function library_sharing.source(p_token text)
returns table (owner_id uuid, subject_id text, folder_id text, set_id text, title text)
language sql stable
set search_path = ''
as $$
  select l.owner_id, f.subject_id, l.folder_id, null::text, f.data->>'name'
  from library_sharing.links l
  join public.folders f on (f.user_id, f.id) = (l.owner_id, l.folder_id)
  where l.token = p_token
  union all
  select l.owner_id, s.subject_id, null::text, l.set_id, s.data->>'name'
  from library_sharing.links l
  join public.sets s on (s.user_id, s.id) = (l.owner_id, l.set_id)
  where l.token = p_token
$$;

create function library_sharing.folder_tree(p_owner uuid, p_subject text, p_root text)
returns table (id text)
language sql stable strict
set search_path = ''
as $$
  with recursive tree(id) as (
    select p_root
    union
    select f.id
    from tree parent
    join public.folders f on f.user_id = p_owner and f.subject_id = p_subject
      and f.data->>'parentId' = parent.id
  )
  select tree.id from tree
$$;

create function library_sharing.items(p_owner uuid, p_subject text, p_set text, p_root text)
returns table (folder_id text, set_id text)
language sql stable
set search_path = ''
as $$
  with folders as materialized (
    select id from library_sharing.folder_tree(p_owner, p_subject, p_root)
  )
  select f.id, null::text from folders f
  union all
  select null::text, p_set where p_set is not null
  union all
  select null::text, s.id
  from folders f
  join public.sets s on (s.user_id, s.folder_id) = (p_owner, f.id)
    and s.subject_id = p_subject
$$;

-- Use the same positioned-first ordering as the library. Old records can
-- have a missing or nonnumeric position and fall back to their ID order.
create function library_sharing.position(p_data jsonb) returns bigint
language sql immutable strict
set search_path = ''
as $$
  select case when jsonb_typeof(p_data->'position') = 'number'
      and (p_data->'position') between '0'::jsonb and '9007199254740991'::jsonb then
    case when trunc((p_data->>'position')::numeric) = (p_data->>'position')::numeric
      then (p_data->>'position')::numeric::bigint end
    end
$$;

create function library_sharing.create_link(p_kind text, p_id text, p_expected_user uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := library_sharing.require_user(p_expected_user);
  share_token text;
begin
  if p_kind is null or p_kind not in ('folder', 'set') or nullif(btrim(p_id), '') is null then
    raise exception using errcode = '22023', message = 'Invalid library item';
  end if;

  if p_kind = 'folder' then
    select token into share_token from library_sharing.links
    where owner_id = caller_id and folder_id = p_id;
    if found then return share_token; end if;
    perform 1 from public.folders where user_id = caller_id and id = p_id for key share;
    if not found then
      raise exception using errcode = 'P0002', message = 'Library item unavailable';
    end if;
    insert into library_sharing.links (owner_id, folder_id)
    values (caller_id, p_id)
    on conflict (owner_id, folder_id) do nothing returning token into share_token;
    if not found then
      select token into share_token from library_sharing.links
      where owner_id = caller_id and folder_id = p_id;
    end if;
  else
    select token into share_token from library_sharing.links
    where owner_id = caller_id and set_id = p_id;
    if found then return share_token; end if;
    perform 1 from public.sets where user_id = caller_id and id = p_id for key share;
    if not found then
      raise exception using errcode = 'P0002', message = 'Library item unavailable';
    end if;
    insert into library_sharing.links (owner_id, set_id)
    values (caller_id, p_id)
    on conflict (owner_id, set_id) do nothing returning token into share_token;
    if not found then
      select token into share_token from library_sharing.links
      where owner_id = caller_id and set_id = p_id;
    end if;
  end if;
  return share_token;
end;
$$;

create function library_sharing.preview_link(p_token text) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if library_sharing.valid_token(p_token) is distinct from true then return null; end if;
  return (
    select jsonb_build_object(
      'kind', case when source.folder_id is not null then 'folder' else 'set' end,
      'title', coalesce(source.title, case when source.folder_id is not null then 'Ordner' else 'Lernstapel' end),
      'folderCount', counts.folder_count,
      'setCount', counts.set_count,
      'cardCount', counts.card_count
    )
    from library_sharing.source(p_token) source
    cross join lateral (
      select count(i.set_id) as set_count, coalesce(sum(cards.total), 0) as card_count,
        count(*) filter (where i.folder_id <> source.folder_id) as folder_count
      from library_sharing.items(source.owner_id, source.subject_id, source.set_id, source.folder_id) i
      cross join lateral (
        select count(*) as total from public.cards c where (c.user_id, c.set_id) = (source.owner_id, i.set_id)
      ) cards
    ) counts
  );
end;
$$;

create function library_sharing.import_link(p_token text, p_subject_id text, p_expected_user uuid)
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
    )
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

-- PostgREST exposes only these invoker wrappers in public. Private functions
-- with elevated rights are deliberately outside the exposed API schema.
create function public.create_library_share(p_kind text, p_id text, p_expected_user uuid default null)
returns text language sql security invoker set search_path = ''
as $$ select library_sharing.create_link(p_kind, p_id, p_expected_user) $$;

create function public.preview_library_share(p_token text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select library_sharing.preview_link(p_token) $$;

create function public.import_library_share(p_token text, p_subject_id text default null, p_expected_user uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select library_sharing.import_link(p_token, p_subject_id, p_expected_user) $$;

revoke execute on all functions in schema library_sharing from public, anon, authenticated;
revoke execute on function public.create_library_share(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.preview_library_share(text) from public, anon, authenticated;
revoke execute on function public.import_library_share(text, text, uuid) from public, anon, authenticated;

grant execute on function library_sharing.create_link(text, text, uuid) to authenticated;
grant execute on function library_sharing.preview_link(text) to anon, authenticated;
grant execute on function library_sharing.import_link(text, text, uuid) to authenticated;
grant execute on function public.create_library_share(text, text, uuid) to authenticated;
grant execute on function public.preview_library_share(text) to anon, authenticated;
grant execute on function public.import_library_share(text, text, uuid) to authenticated;
