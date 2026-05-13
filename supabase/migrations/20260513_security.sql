-- ─────────────────────────────────────────────────────────────
-- Security hardening migration
-- ─────────────────────────────────────────────────────────────

-- 1. Rate limiting table (used by api/lib/rateLimit.js)
create table if not exists public.rate_limits (
  key        text primary key,
  count      integer not null default 1,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
alter table public.rate_limits enable row level security;
-- No SELECT/INSERT/UPDATE policies for anon — only service role may write
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- 2. Admin audit log table
create table if not exists public.admin_log (
  id         bigserial primary key,
  admin_email text not null,
  azione     text not null,
  org_id     uuid references public.organizations(id) on delete set null,
  ip         text,
  user_agent text,
  created_at timestamptz default now()
);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
grant all on public.admin_log to service_role;

-- 3. Input constraints on organizations
alter table public.organizations
  add column if not exists nome_attivita text,
  add column if not exists referral_code_usato text,
  add column if not exists mesi_bonus integer not null default 0,
  add column if not exists approvato boolean not null default false,
  add column if not exists attivo boolean not null default true,
  add column if not exists piano text not null default 'trial',
  add column if not exists trial_ends_at timestamptz;

-- Validate piano values
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_piano_check'
  ) then
    alter table public.organizations
      add constraint organizations_piano_check
      check (piano in ('trial','base','pro','enterprise'));
  end if;
end $$;

-- 4. Revoke anon from sensitive tables
revoke select, insert, update, delete on public.admin_log from anon;
revoke select, insert, update, delete on public.rate_limits from anon;

-- 5. Audit trigger for organizations (log changes to a generic audit table)
create table if not exists public.audit_log (
  id         bigserial primary key,
  table_name text not null,
  operation  text not null,
  row_id     text,
  changed_by uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz default now()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant all on public.audit_log to service_role;

create or replace function public.fn_audit_organizations()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log(table_name, operation, row_id, changed_by, old_data, new_data)
  values (
    'organizations',
    TG_OP,
    coalesce(NEW.id::text, OLD.id::text),
    auth.uid(),
    case when TG_OP = 'DELETE' then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit_organizations on public.organizations;
create trigger trg_audit_organizations
  after insert or update or delete on public.organizations
  for each row execute function public.fn_audit_organizations();
