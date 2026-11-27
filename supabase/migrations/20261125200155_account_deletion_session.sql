-- The server checks the original, still active login before account deletion.
-- A refreshed access token does not make an old session recent.
create schema privacy_tools;
revoke all on schema privacy_tools from public, anon, authenticated;
grant usage on schema privacy_tools to service_role;

create function privacy_tools.recent_session(p_user uuid, p_session uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where (s.user_id, s.id) = (p_user, p_session)
      and s.created_at > statement_timestamp() - interval '10 minutes'
      and s.created_at <= statement_timestamp()
      and (s.not_after is null or s.not_after > statement_timestamp())
  )
$$;

create function public.privacy_recent_session(p_user uuid, p_session uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select privacy_tools.recent_session(p_user, p_session)
$$;

revoke execute on function privacy_tools.recent_session(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.privacy_recent_session(uuid, uuid) from public, anon, authenticated;
grant execute on function privacy_tools.recent_session(uuid, uuid) to service_role;
grant execute on function public.privacy_recent_session(uuid, uuid) to service_role;
