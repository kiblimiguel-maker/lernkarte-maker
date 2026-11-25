-- Immutable test releases. Source deletion must not invalidate a sent link.
-- This schema is deliberately not exposed through the Data API.
create schema exam_sharing;
revoke all on schema exam_sharing from public, anon, authenticated;
grant usage on schema exam_sharing to anon, authenticated;

create table exam_sharing.links (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index exam_share_source_idx on exam_sharing.links(owner_id, source_id, created_at desc);
create table exam_sharing.receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null references exam_sharing.links(token) on delete cascade,
  copy_id text not null,
  primary key(user_id, token)
);
alter table exam_sharing.links enable row level security;
alter table exam_sharing.receipts enable row level security;
revoke all on all tables in schema exam_sharing from public, anon, authenticated;

create function exam_sharing.create_link(p_id text, p_expected_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := library_sharing.require_user(p_expected_user);
  payload jsonb;
  result_token text;
begin
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || coalesce(p_id,''), 170813));
  -- One MVCC statement reads both linked and physically contained materials.
  -- Referenced decks are copied, never moved or changed in the sender's library.
  with root as materialized (
    select f.* from public.folders f
    where (f.user_id,f.id)=(caller,p_id) and f.data->>'kind'='exam'
  ), tree as materialized (
    select f.* from root r cross join lateral library_sharing.folder_tree(caller,r.subject_id,r.id) t
    join public.folders f on (f.user_id,f.id)=(caller,t.id)
  ), selected_sets as materialized (
    select s.* from root r join public.sets s on s.user_id=caller
    where (s.subject_id=r.subject_id and s.folder_id in (select id from tree))
      or s.id in (select jsonb_array_elements_text(case when jsonb_typeof(r.data->'examSetIds')='array' then r.data->'examSetIds' else '[]'::jsonb end))
  )
  select jsonb_build_object(
    'rootId',r.id,
    'exam',jsonb_build_object('name',coalesce(r.data->>'name','Test'),'examDate',r.data->>'examDate',
      'examNotes',coalesce(r.data->>'examNotes',''),'examLinks',case when jsonb_typeof(r.data->'examLinks')='array' then r.data->'examLinks' else '[]'::jsonb end),
    'folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'parentId',f.data->>'parentId','name',coalesce(f.data->>'name','Ordner'),'color',f.data->>'color','position',library_sharing.position(f.data)) order by f.id) from tree f),'[]'::jsonb),
    'sets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'folderId',case when s.folder_id in (select id from tree) then s.folder_id else r.id end,
      'name',coalesce(s.data->>'name','Lernstapel'),'description',coalesce(s.data->>'description',''),'cardThemeId',s.data->>'cardThemeId','position',library_sharing.position(s.data),
      'frenchSpeechSide',s.data->>'frenchSpeechSide') order by library_sharing.position(s.data) nulls last,s.id) from selected_sets s),'[]'::jsonb),
    'cards',coalesce((select jsonb_agg(jsonb_build_object('setId',c.set_id,'front',coalesce(c.data->>'front',''),'back',coalesce(c.data->>'back',''),
      'frontExampleSentence',c.data->>'frontExampleSentence','backExampleSentence',c.data->>'backExampleSentence','position',library_sharing.position(c.data))
      order by c.set_id,library_sharing.position(c.data) nulls last,c.id)
      from public.cards c where c.user_id=caller and c.set_id in (select id from selected_sets)),'[]'::jsonb)
  ) into payload from root r;
  if payload is null then raise exception using errcode='P0002',message='Test unavailable'; end if;
  if octet_length(payload::text)>26214400 then raise exception using errcode='22023',message='Test share exceeds 25 MiB'; end if;
  select token into result_token from exam_sharing.links
    where owner_id=caller and source_id=p_id and snapshot=payload order by created_at desc limit 1;
  if result_token is null then
    insert into exam_sharing.links(owner_id,source_id,snapshot) values(caller,p_id,payload) returning token into result_token;
  end if;
  return result_token;
end $$;

create function exam_sharing.preview_link(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kind','exam','title',l.snapshot->'exam'->>'name','examDate',l.snapshot->'exam'->>'examDate',
    'snapshot',true,'folderCount',greatest(jsonb_array_length(l.snapshot->'folders')-1,0),
    'setCount',jsonb_array_length(l.snapshot->'sets'),'cardCount',jsonb_array_length(l.snapshot->'cards'))
  from exam_sharing.links l where l.token=p_token and library_sharing.valid_token(p_token)
$$;

create function exam_sharing.import_link(p_token text,p_subject_id text,p_expected_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := library_sharing.require_user(p_expected_user);
  payload jsonb;
  destination text;
  root_id text;
  existing_id text;
  folder_ids jsonb;
  set_ids jsonb;
  copied_at timestamptz := statement_timestamp();
begin
  if library_sharing.valid_token(p_token) is distinct from true then return null; end if;
  select snapshot into payload from exam_sharing.links where token=p_token;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text,170812));
  select f.id,f.subject_id into existing_id,destination from exam_sharing.receipts r
    join public.folders f on (f.user_id,f.id)=(caller,r.copy_id)
    where (r.user_id,r.token)=(caller,p_token);
  if found then return jsonb_build_object('status','already_imported','kind','exam','id',existing_id,'subjectId',destination); end if;
  -- A removed recipient copy may be restored from the still-valid snapshot.
  delete from exam_sharing.receipts where (user_id,token)=(caller,p_token);
  if p_subject_id is null then
    select id into destination from public.subjects where user_id=caller and data->>'name'='Geteilt mit dir'
      order by library_sharing.position(data) nulls last,id limit 1 for key share;
    if destination is null then
      destination:=gen_random_uuid()::text;
      insert into public.subjects(user_id,id,data) values(caller,destination,jsonb_build_object(
        'id',destination,'name','Geteilt mit dir','color','#366FA8','emoji','📚','icon','📚',
        'position',coalesce((select max(library_sharing.position(data)) from public.subjects where user_id=caller),-1)+1,
        'createdAt',copied_at,'updatedAt',copied_at));
    end if;
  else
    select id into destination from public.subjects where (user_id,id)=(caller,p_subject_id) for key share;
    if not found then raise exception using errcode='42501',message='Destination unavailable'; end if;
  end if;
  select jsonb_object_agg(f->>'id',gen_random_uuid()::text) into folder_ids from jsonb_array_elements(payload->'folders') f;
  select coalesce(jsonb_object_agg(s->>'id',gen_random_uuid()::text),'{}'::jsonb) into set_ids from jsonb_array_elements(payload->'sets') s;
  root_id:=folder_ids->>(payload->>'rootId');
  insert into public.folders(user_id,id,subject_id,data)
    select caller,folder_ids->>(f->>'id'),destination,jsonb_build_object(
      'id',folder_ids->>(f->>'id'),'subjectId',destination,'name',f->>'name','color',f->>'color',
      'parentId',case when f->>'id'<>payload->>'rootId' then folder_ids->>(f->>'parentId') end,
      'position',case when f->>'id'=payload->>'rootId' then coalesce((select max(library_sharing.position(data)) from public.folders where user_id=caller and subject_id=destination and nullif(data->>'parentId','') is null),-1)+1 else coalesce((f->>'position')::numeric,0) end,
      'createdAt',copied_at,'updatedAt',copied_at)
      || case when f->>'id'=payload->>'rootId' then payload->'exam'||jsonb_build_object('kind','exam','examSetIds','[]'::jsonb) else '{}'::jsonb end
    from jsonb_array_elements(payload->'folders') f;
  insert into public.sets(user_id,id,subject_id,folder_id,data)
    select caller,set_ids->>(s->>'id'),destination,folder_ids->>(s->>'folderId'),jsonb_build_object(
      'id',set_ids->>(s->>'id'),'subjectId',destination,'folderId',folder_ids->>(s->>'folderId'),'name',s->>'name','description',coalesce(s->>'description',''),
      'cardThemeId',s->>'cardThemeId','position',row_number() over(partition by s->>'folderId' order by ord)-1,
      'createdAt',copied_at,'updatedAt',copied_at)
      || case when s->>'frenchSpeechSide' in ('front','back','off') then jsonb_build_object('frenchSpeechSide',s->>'frenchSpeechSide') else '{}'::jsonb end
    from jsonb_array_elements(payload->'sets') with ordinality a(s,ord);
  insert into public.cards(user_id,id,set_id,data)
    select caller,id,set_id,jsonb_strip_nulls(c - 'setId' - 'position')||jsonb_build_object(
      'id',id,'setId',set_id,'position',position,'correctCount',0,'incorrectCount',0,'attemptCount',0,
      'lastReviewedAt',null,'nextReviewAt',null,'createdAt',copied_at,'updatedAt',copied_at)
    from (select c,gen_random_uuid()::text id,set_ids->>(c->>'setId') set_id,
      row_number() over(partition by c->>'setId' order by ord)-1 position
      from jsonb_array_elements(payload->'cards') with ordinality a(c,ord)) copied;
  insert into exam_sharing.receipts(user_id,token,copy_id) values(caller,p_token,root_id);
  return jsonb_build_object('status','imported','kind','exam','id',root_id,'subjectId',destination);
end $$;

-- Keep legacy folder/set sharing unchanged. No existing links are rewritten.
create or replace function public.create_library_share(p_kind text,p_id text,p_expected_user uuid default null)
returns text language sql security invoker set search_path = '' as $$
  select case when p_kind='exam' then exam_sharing.create_link(p_id,p_expected_user) else library_sharing.create_link(p_kind,p_id,p_expected_user) end
$$;
create or replace function public.preview_library_share(p_token text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(exam_sharing.preview_link(p_token),library_sharing.preview_link(p_token))
$$;
create or replace function public.import_library_share(p_token text,p_subject_id text default null,p_expected_user uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(exam_sharing.import_link(p_token,p_subject_id,p_expected_user),library_sharing.import_link(p_token,p_subject_id,p_expected_user))
$$;
revoke execute on all functions in schema exam_sharing from public,anon,authenticated;
grant execute on function exam_sharing.create_link(text,uuid) to authenticated;
grant execute on function exam_sharing.preview_link(text) to anon,authenticated;
grant execute on function exam_sharing.import_link(text,text,uuid) to authenticated;
-- Existing public wrapper grants are preserved by CREATE OR REPLACE.
