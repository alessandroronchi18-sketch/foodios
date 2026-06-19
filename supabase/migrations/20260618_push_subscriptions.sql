-- Push Notification subscriptions (Modalità Dipendente PWA - 2026-06-18)
-- Tabella che registra le subscription Web Push per ogni utente.
-- Permette al backend (cron + RPC) di inviare notifiche dirette.

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,         -- Public key client per crittografia payload
  auth text not null,            -- Auth secret client
  user_agent text,
  device_label text,             -- Es. "iPad cucina", "telefono Mara"
  created_at timestamptz not null default now(),
  last_notified_at timestamptz,
  active boolean not null default true,
  unique (endpoint)
);

create index if not exists idx_push_subs_user
  on public.push_subscriptions (user_id, active);
create index if not exists idx_push_subs_org
  on public.push_subscriptions (organization_id, active);

alter table public.push_subscriptions enable row level security;

-- Policy: l'utente vede solo le proprie subscription.
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.push_subscriptions from anon;

-- RPC per upsert idempotente da client (subscribe + ri-subscribe).
create or replace function public.push_subscribe(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_device_label text default null
) returns bigint as $push_sub$
declare
  v_id bigint;
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select organization_id into v_org_id from public.profiles where id = auth.uid();

  insert into public.push_subscriptions (
    user_id, organization_id, endpoint, p256dh, auth, user_agent, device_label, active
  ) values (
    auth.uid(), v_org_id, p_endpoint, p_p256dh, p_auth, p_user_agent, p_device_label, true
  )
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        device_label = excluded.device_label,
        active = true
  returning id into v_id;

  return v_id;
end;
$push_sub$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.push_subscribe(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.push_subscribe(text, text, text, text, text) to authenticated;

-- RPC per unsubscribe (chiamato quando utente disattiva).
create or replace function public.push_unsubscribe(
  p_endpoint text
) returns boolean as $push_unsub$
begin
  if auth.uid() is null then return false; end if;
  update public.push_subscriptions
  set active = false
  where endpoint = p_endpoint and user_id = auth.uid();
  return true;
end;
$push_unsub$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.push_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
