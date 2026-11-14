-- Persist one organisation action as a transaction. The expected state only
-- includes ordering and location, so editing a title does not invalidate a move.
create or replace function public.organise_library(p_expected jsonb, p_changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  collection text;
  stored jsonb;
  proposed jsonb;
  expected_rows jsonb;
begin
  if owner_id is null then
    raise exception using errcode = '42501', message = 'A signed-in account is required.';
  end if;

  foreach collection in array array['subjects', 'folders', 'sets'] loop
    if jsonb_typeof(p_expected->collection) is distinct from 'array'
       or jsonb_typeof(p_changes->collection) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Invalid organisation payload.';
    end if;

    if exists (
      select from jsonb_array_elements(p_changes->collection) as item
      where case when jsonb_typeof(item) = 'object' then
          item - (case collection
            when 'subjects' then array['id', 'position']
            when 'folders' then array['id', 'position', 'subjectId', 'parentId']
            else array['id', 'position', 'subjectId', 'folderId']
          end) <> '{}'::jsonb
        else true end
        or jsonb_typeof(item->'id') is distinct from 'string'
        or item->>'id' = ''
        or jsonb_typeof(item->'position') is distinct from 'number'
        or coalesce(item->>'position', '') !~ '^(0|[1-9][0-9]{0,15})$'
        or case when jsonb_typeof(item->'position') = 'number'
                then (item->>'position')::numeric > 9007199254740991 else false end
        or (collection <> 'subjects' and (
          jsonb_typeof(item->'subjectId') is distinct from 'string' or item->>'subjectId' = ''
          or coalesce(jsonb_typeof(item->(case when collection = 'folders' then 'parentId' else 'folderId' end)), '')
            not in ('string', 'null')
          or item->>(case when collection = 'folders' then 'parentId' else 'folderId' end) = ''
        ))
    ) or exists (
      select from jsonb_array_elements(p_changes->collection) as item
      group by item->>'id' having count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'Invalid organisation changes.';
    end if;
  end loop;

  -- Serialize moves by account and exclude edits to existing rows while
  -- checking the snapshot. The same lock order is used for every invocation.
  perform pg_advisory_xact_lock(hashtextextended('wortwerk:organise:' || owner_id::text, 0));
  perform id from public.subjects where user_id = owner_id order by id for update;
  perform id from public.folders where user_id = owner_id order by id for update;
  perform id from public.sets where user_id = owner_id order by id for update;

  select jsonb_build_object(
    'subjects', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'position', data->'position'
    ) order by id), '[]'::jsonb) from public.subjects where user_id = owner_id),
    'folders', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'subjectId', subject_id, 'parentId', case when jsonb_typeof(data->'parentId') = 'string'
        then nullif(data->>'parentId', '') end, 'position', data->'position'
    ) order by id), '[]'::jsonb) from public.folders where user_id = owner_id),
    'sets', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'subjectId', subject_id, 'folderId', nullif(folder_id, ''), 'position', data->'position'
    ) order by id), '[]'::jsonb) from public.sets where user_id = owner_id)
  ) into stored;
  proposed := stored;

  foreach collection in array array['subjects', 'folders', 'sets'] loop
    select coalesce(jsonb_agg(item order by item->>'id'), '[]'::jsonb)
      into expected_rows from jsonb_array_elements(p_expected->collection) as item;
    if expected_rows is distinct from stored->collection then
      raise exception using errcode = '40001', message = 'The library order changed. Reload the library before trying again.';
    end if;

    if exists (
      select from jsonb_array_elements(p_changes->collection) as change
      where not exists (
        select from jsonb_array_elements(stored->collection) as item
        where item->>'id' = change->>'id'
      )
    ) then
      raise exception using errcode = '22023', message = 'Unknown library item.';
    end if;

    proposed := jsonb_set(proposed, array[collection], (
      select coalesce(jsonb_agg(coalesce(change, item) order by item->>'id'), '[]'::jsonb)
      from jsonb_array_elements(stored->collection) as item
      left join jsonb_array_elements(p_changes->collection) as change on change->>'id' = item->>'id'
    ));
  end loop;

  -- Check destination ancestry and references affected by the move, including
  -- unchanged children and decks whose parent may have moved across subjects.
  if exists (
    with recursive
      subjects as materialized (
        select item->>'id' as id from jsonb_array_elements(proposed->'subjects') as item
      ),
      folders as materialized (
        select item->>'id' as id, item->>'subjectId' as subject_id, item->>'parentId' as parent_id
        from jsonb_array_elements(proposed->'folders') as item
      ),
      sets as materialized (
        select item->>'id' as id, item->>'subjectId' as subject_id, item->>'folderId' as folder_id
        from jsonb_array_elements(proposed->'sets') as item
      ),
      folder_changes as (select item->>'id' as id from jsonb_array_elements(p_changes->'folders') as item),
      set_changes as (select item->>'id' as id from jsonb_array_elements(p_changes->'sets') as item),
      ancestry(id, subject_id, parent_id, visited, cyclic) as (
        select f.id, f.subject_id, f.parent_id, array[f.id], false
        from folders f
        where f.id in (select id from folder_changes)
           or f.id in (
             select s.folder_id from sets s join set_changes c on c.id = s.id
           )
        union all
        select p.id, p.subject_id, p.parent_id, a.visited || p.id, p.id = any(a.visited)
        from ancestry a join folders p on p.id = a.parent_id
        where not a.cyclic and p.subject_id = a.subject_id
      )
    select from ancestry a
      where a.cyclic or not exists (select from subjects s where s.id = a.subject_id)
        or (a.parent_id is not null and not exists (
          select from folders p where p.id = a.parent_id and p.subject_id = a.subject_id
        ))
    union all
    select from folders f join folders p on f.parent_id = p.id
      where p.id in (select id from folder_changes) and f.subject_id <> p.subject_id
    union all
    select from sets s
      where (s.id in (select id from set_changes) or s.folder_id in (select id from folder_changes))
        and (not exists (select from subjects t where t.id = s.subject_id)
          or (s.folder_id is not null and not exists (
            select from folders f where f.id = s.folder_id and f.subject_id = s.subject_id
          )))
  ) then
    raise exception using errcode = '22023', message = 'Invalid library hierarchy.';
  end if;

  -- A changed position must be unique among its siblings. Older unrelated
  -- scopes may contain ties or missing positions until they are reorganised.
  foreach collection in array array['subjects', 'folders', 'sets'] loop
    if exists (
      select from jsonb_array_elements(p_changes->collection) as change
      join jsonb_array_elements(proposed->collection) as item
        on change->>'id' <> item->>'id'
        and change->'position' = item->'position'
        and (change->>'subjectId') is not distinct from (item->>'subjectId')
        and (change->>'parentId') is not distinct from (item->>'parentId')
        and (change->>'folderId') is not distinct from (item->>'folderId')
    ) then
      raise exception using errcode = '22023', message = 'Duplicate position among siblings.';
    end if;
  end loop;

  update public.subjects as s set data = s.data || jsonb_build_object('position', change->'position')
    from jsonb_array_elements(p_changes->'subjects') as change
    where s.user_id = owner_id and s.id = change->>'id';

  update public.folders as f set
    subject_id = change->>'subjectId',
    data = f.data || jsonb_build_object(
      'subjectId', change->'subjectId', 'parentId', change->'parentId', 'position', change->'position'
    )
    from jsonb_array_elements(p_changes->'folders') as change
    where f.user_id = owner_id and f.id = change->>'id';

  update public.sets as s set
    subject_id = change->>'subjectId',
    folder_id = change->>'folderId',
    data = s.data || jsonb_build_object(
      'subjectId', change->'subjectId', 'folderId', change->'folderId', 'position', change->'position'
    )
    from jsonb_array_elements(p_changes->'sets') as change
    where s.user_id = owner_id and s.id = change->>'id';
end;
$$;

revoke all on function public.organise_library(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.organise_library(jsonb, jsonb) to authenticated;

-- An ordinary edit from another tab must not restore a former location or
-- position. Keep existing-row writes conditional on the last known order.
create or replace function public.save_library_organisation_rows(p_table text, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  row_count_expected integer;
  row_count_actual integer;
  location_columns text;
  stored_location text;
begin
  if owner_id is null then
    raise exception using errcode = '42501', message = 'A signed-in account is required.';
  end if;

  if p_table is null or p_table not in ('subjects', 'folders', 'sets')
     or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid library edit payload.';
  end if;

  row_count_expected := jsonb_array_length(p_rows);
  if row_count_expected = 0 then return; end if;
  if row_count_expected > 500 or exists (
    select from jsonb_array_elements(p_rows) as edit
    where jsonb_typeof(edit->'row'->'id') is distinct from 'string'
       or edit->'row'->>'id' = ''
       or jsonb_typeof(edit->'row'->'data') is distinct from 'object'
       or edit->'row'->'data'->'id' is distinct from edit->'row'->'id'
       or edit->'expected'->'id' is distinct from edit->'row'->'id'
  ) or exists (
    select from jsonb_array_elements(p_rows) as edit
    group by edit->'row'->>'id' having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Invalid library edit rows.';
  end if;

  case p_table
    when 'subjects' then
      location_columns := '';
      stored_location := '';
    when 'folders' then
      location_columns := ', subject_id = edit->''row''->>''subject_id''';
      stored_location := ', ''subjectId'', item.subject_id, ''parentId'',
        case when jsonb_typeof(item.data->''parentId'') = ''string'' then nullif(item.data->>''parentId'', '''') end';
    when 'sets' then
      location_columns := ', subject_id = edit->''row''->>''subject_id'', folder_id = edit->''row''->>''folder_id''';
      stored_location := ', ''subjectId'', item.subject_id, ''folderId'', nullif(item.folder_id, '''')';
  end case;

  perform pg_advisory_xact_lock(hashtextextended('wortwerk:organise:' || owner_id::text, 0));
  execute format(
    'update public.%I as item
     set data = edit->''row''->''data''%s
     from jsonb_array_elements($1) as edit
     where item.user_id = $2 and item.id = edit->''row''->>''id''
       and jsonb_build_object(''id'', item.id, ''position'', item.data->''position''%s) = edit->''expected''',
    p_table, location_columns, stored_location
  ) using p_rows, owner_id;
  get diagnostics row_count_actual = row_count;

  if row_count_actual <> row_count_expected then
    raise exception using errcode = '40001', message = 'The library order changed. Reload the library before trying again.';
  end if;
end;
$$;

revoke all on function public.save_library_organisation_rows(text, jsonb) from public, anon, authenticated;
grant execute on function public.save_library_organisation_rows(text, jsonb) to authenticated;
