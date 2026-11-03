create table if not exists public.wortwerk_donation_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  checkout_session_id text not null check (checkout_session_id ~ '^cs_'),
  event_type text not null check (event_type in (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired'
  )),
  payment_status text not null check (payment_status in ('pending', 'paid', 'failed', 'expired')),
  amount_total bigint check (amount_total is null or amount_total between 50 and 99999999),
  currency text not null check (currency = 'chf'),
  received_at timestamptz not null default now()
);

create index if not exists wortwerk_donation_events_session_status_idx
  on public.wortwerk_donation_events (checkout_session_id, payment_status, received_at desc);

alter table public.wortwerk_donation_events enable row level security;
revoke all on table public.wortwerk_donation_events from anon, authenticated;
grant select, insert on table public.wortwerk_donation_events to service_role;
