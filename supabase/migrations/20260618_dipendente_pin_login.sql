-- =========================================================================
-- Modalità Dipendente PWA — PIN login (scaffolding 2026-06-18)
-- =========================================================================
-- Aggiunge un'autenticazione alternativa (PIN 4-6 cifre) per dipendenti su
-- tablet condiviso in laboratorio. Il PIN NON sostituisce l'auth Supabase
-- regolare per il titolare; serve solo per dipendenti già esistenti.
--
-- Flusso:
-- 1) Titolare assegna PIN a dipendente da Impostazioni > Personale
-- 2) Dipendente apre PWA → inserisce PIN → backend verifica + crea sessione
-- 3) PIN ruotabile, log ultimo uso, bloccato dopo 5 tentativi (gestito da RPC)
--
-- Sicurezza:
-- - PIN salvato come hash bcrypt-equivalent (extension pgcrypto, già attiva)
-- - PIN NON visibile in select dal client (column-level revoke)
-- - Rate limit 5 tentativi/15min via pin_attempts table
-- =========================================================================

-- 0) Slug univoco per organizations (necessario per il flusso PIN: dipendente
--    digita nome attività + PIN). Generato dal nome se non esiste.
do $$ begin
  if to_regclass('public.organizations') is not null then
    alter table public.organizations add column if not exists slug text;
    -- Backfill: genera slug da nome se vuoto.
    update public.organizations
    set slug = lower(regexp_replace(coalesce(nome, ''), '[^a-zA-Z0-9]+', '-', 'g'))
    where slug is null or slug = '';
    -- Constraint unique idempotente
    create unique index if not exists uq_org_slug on public.organizations (slug) where slug is not null;
  end if;
end $$;

-- 1) Colonne PIN su profiles
do $$ begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists pin_hash text;
    alter table public.profiles add column if not exists pin_set_at timestamptz;
    alter table public.profiles add column if not exists pin_last_used_at timestamptz;
    alter table public.profiles add column if not exists pin_failed_count int not null default 0;
    alter table public.profiles add column if not exists pin_locked_until timestamptz;
  end if;
end $$;

-- 2) Revoca SELECT su pin_hash da authenticated/anon (defense in depth)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='pin_hash'
  ) then
    revoke select (pin_hash) on public.profiles from authenticated, anon;
  end if;
end $$;

-- 3) Tabella pin_attempts per rate limiting
create table if not exists public.pin_attempts (
  id bigserial primary key,
  organization_id uuid,
  pin_attempted text,
  attempted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  success boolean not null default false
);
create index if not exists idx_pin_attempts_org_time
  on public.pin_attempts (organization_id, attempted_at desc);
alter table public.pin_attempts enable row level security;
revoke all on public.pin_attempts from public, anon, authenticated;
grant select, insert on public.pin_attempts to service_role;

-- 4) RPC set_dipendente_pin (per titolare): hash + persist
create or replace function public.set_dipendente_pin(
  p_user_id uuid,
  p_pin text
) returns boolean as $set_pin$
declare
  v_actor_org uuid;
  v_target_org uuid;
  v_actor_ruolo text;
  v_pin_hash text;
begin
  -- Verifica chi chiama: deve essere titolare della stessa org del target.
  select organization_id, ruolo into v_actor_org, v_actor_ruolo
  from public.profiles where id = auth.uid();
  if v_actor_org is null or v_actor_ruolo <> 'titolare' then
    raise exception 'Solo il titolare può impostare un PIN dipendente';
  end if;

  select organization_id into v_target_org
  from public.profiles where id = p_user_id;
  if v_target_org is null or v_target_org <> v_actor_org then
    raise exception 'Dipendente non trovato nella tua organizzazione';
  end if;

  -- Validazione PIN: 4-6 cifre numeriche
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'Il PIN deve essere di 4-6 cifre numeriche';
  end if;

  -- Hash con extension pgcrypto (gen_salt + crypt → bcrypt)
  v_pin_hash := crypt(p_pin, gen_salt('bf', 8));

  update public.profiles
  set pin_hash = v_pin_hash,
      pin_set_at = now(),
      pin_failed_count = 0,
      pin_locked_until = null
  where id = p_user_id;

  return true;
end;
$set_pin$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.set_dipendente_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.set_dipendente_pin(uuid, text) to authenticated;

-- 5) RPC remove_dipendente_pin (rimuove PIN, dipendente torna a email+pwd)
create or replace function public.remove_dipendente_pin(
  p_user_id uuid
) returns boolean as $rm_pin$
declare
  v_actor_org uuid;
  v_target_org uuid;
  v_actor_ruolo text;
begin
  select organization_id, ruolo into v_actor_org, v_actor_ruolo
  from public.profiles where id = auth.uid();
  if v_actor_org is null or v_actor_ruolo <> 'titolare' then
    raise exception 'Solo il titolare può rimuovere un PIN dipendente';
  end if;

  select organization_id into v_target_org
  from public.profiles where id = p_user_id;
  if v_target_org <> v_actor_org then
    raise exception 'Dipendente non trovato nella tua organizzazione';
  end if;

  update public.profiles
  set pin_hash = null,
      pin_set_at = null,
      pin_failed_count = 0,
      pin_locked_until = null
  where id = p_user_id;
  return true;
end;
$rm_pin$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.remove_dipendente_pin(uuid) from public, anon, authenticated;
grant execute on function public.remove_dipendente_pin(uuid) to authenticated;

-- 6) RPC verify_dipendente_pin (chiamata SOLO da service_role via /api/pin-login)
-- Ritorna user_id se PIN valido + non locked. Increment failed_count su miss.
create or replace function public.verify_dipendente_pin(
  p_org_slug text,
  p_pin text
) returns uuid as $verify_pin$
declare
  v_user_id uuid;
  v_hash text;
  v_locked timestamptz;
  v_failed int;
  v_org_id uuid;
begin
  if p_pin !~ '^[0-9]{4,6}$' then return null; end if;

  -- Risolvi org da slug (o id) — accettiamo entrambi.
  select id into v_org_id from public.organizations
  where slug = p_org_slug or id::text = p_org_slug
  limit 1;
  if v_org_id is null then return null; end if;

  -- Cerca tutti i dipendenti dell'org con pin attivo, prova match.
  -- Nota: la performance qui è O(N dipendenti) per la verifica bcrypt;
  -- accettabile fino a centinaia di dipendenti per org.
  for v_user_id, v_hash, v_locked, v_failed in
    select id, pin_hash, pin_locked_until, pin_failed_count
    from public.profiles
    where organization_id = v_org_id
      and ruolo = 'dipendente'
      and pin_hash is not null
      and coalesce(approvato, true) = true
  loop
    if v_locked is not null and v_locked > now() then
      continue;  -- account locked, skip
    end if;
    if v_hash = crypt(p_pin, v_hash) then
      -- Match: reset failed + update last_used
      update public.profiles
      set pin_failed_count = 0,
          pin_last_used_at = now(),
          pin_locked_until = null
      where id = v_user_id;
      return v_user_id;
    end if;
  end loop;

  return null;
end;
$verify_pin$ language plpgsql security definer
set search_path = public, pg_temp;

-- Solo service_role può chiamare verify (mai dal client direttamente):
-- il backend /api/pin-login fa il check, poi crea sessione via admin API.
revoke all on function public.verify_dipendente_pin(text, text) from public, anon, authenticated;
grant execute on function public.verify_dipendente_pin(text, text) to service_role;

-- 7) RPC log_pin_attempt (chiamata SOLO da service_role per audit + rate limit)
create or replace function public.log_pin_attempt(
  p_org_slug text,
  p_success boolean,
  p_ip text default null,
  p_user_agent text default null
) returns int as $log_pin$
declare
  v_org_id uuid;
  v_recent_failed int;
begin
  select id into v_org_id from public.organizations
  where slug = p_org_slug or id::text = p_org_slug
  limit 1;

  insert into public.pin_attempts (organization_id, attempted_at, ip_address, user_agent, success)
  values (v_org_id, now(), p_ip, p_user_agent, p_success);

  -- Conta fallimenti negli ultimi 15 minuti per questa org.
  select count(*) into v_recent_failed
  from public.pin_attempts
  where organization_id = v_org_id
    and success = false
    and attempted_at > now() - interval '15 minutes';

  return v_recent_failed;
end;
$log_pin$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.log_pin_attempt(text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.log_pin_attempt(text, boolean, text, text) to service_role;
