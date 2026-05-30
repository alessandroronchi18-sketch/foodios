-- 20260609 — Admin tier 2: tabella error_log (alternativa a Sentry)
-- Idempotente. Safe da rieseguire.
-- =======================================================================
-- Raccoglie errori catturati da safeError() lato edge functions per dare
-- visibilita allo admin senza dover guardare Vercel Logs / Sentry esterno.
-- Insert best-effort (fire-and-forget) dal codice: niente policy authenticated.
-- Lettura solo service_role.

create table if not exists public.error_log (
  id          bigserial primary key,
  endpoint    text,
  operation   text,
  org_id      uuid,
  user_id     uuid,
  code        text,
  status      int,
  message     text,
  hint        text,
  stack       text,
  context     jsonb,
  created_at  timestamptz default now()
);

alter table public.error_log enable row level security;
revoke all on public.error_log from anon, authenticated;
grant all on public.error_log to service_role;

create index if not exists idx_error_log_created
  on public.error_log(created_at desc);
create index if not exists idx_error_log_endpoint
  on public.error_log(endpoint, created_at desc);
