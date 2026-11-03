do $$
declare
  t text;
begin
  foreach t in array array['subjects','folders','sets','cards','study_sessions','study_history'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;
