revoke all on table public.wortwerk_donation_events from anon, authenticated, service_role;
grant select, insert on table public.wortwerk_donation_events to service_role;
