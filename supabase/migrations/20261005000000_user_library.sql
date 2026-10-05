create table if not exists public.subjects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  subject_id text not null,
  data jsonb not null,
  primary key (user_id, id),
  foreign key (user_id, subject_id) references public.subjects(user_id, id) on delete cascade
);

create table if not exists public.sets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  subject_id text not null,
  folder_id text,
  data jsonb not null,
  primary key (user_id, id),
  foreign key (user_id, subject_id) references public.subjects(user_id, id) on delete cascade,
  foreign key (user_id, folder_id) references public.folders(user_id, id) on delete set null (folder_id)
);

create table if not exists public.cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  set_id text not null,
  data jsonb not null,
  primary key (user_id, id),
  foreign key (user_id, set_id) references public.sets(user_id, id) on delete cascade
);

create table if not exists public.study_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  set_id text not null,
  data jsonb not null,
  primary key (user_id, id),
  foreign key (user_id, set_id) references public.sets(user_id, id) on delete cascade
);

create table if not exists public.study_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  set_id text not null,
  data jsonb not null,
  primary key (user_id, id),
  foreign key (user_id, set_id) references public.sets(user_id, id) on delete cascade
);

create index if not exists folders_subject_idx on public.folders(user_id, subject_id);
create index if not exists sets_subject_idx on public.sets(user_id, subject_id);
create index if not exists sets_folder_idx on public.sets(user_id, folder_id);
create index if not exists cards_set_position_idx on public.cards(user_id, set_id, ((data->>'position')::integer));
create index if not exists sessions_set_idx on public.study_sessions(user_id, set_id);
create index if not exists history_set_idx on public.study_history(user_id, set_id);

do $$
declare t text;
begin
  foreach t in array array['subjects','folders','sets','cards','study_sessions','study_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Users manage own %1$s" on public.%1$I', t);
    execute format('create policy "Users manage own %1$s" on public.%1$I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
