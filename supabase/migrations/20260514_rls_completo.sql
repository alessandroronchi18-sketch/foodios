-- ═══════════════════════════════════════════════════════════════
-- RLS COMPLETO — ogni utente vede solo i dati della propria org
-- Idempotente: safe da rieseguire più volte.
-- ═══════════════════════════════════════════════════════════════

-- Helper SECURITY DEFINER per ottenere l'org_id dell'utente corrente
-- Evita ricorsione infinita nelle policy di profiles.
create or replace function public.get_user_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.get_user_org_id() from public;
grant execute on function public.get_user_org_id() to anon, authenticated;

-- ── organizations ──────────────────────────────────────────────
alter table public.organizations enable row level security;
drop policy if exists "org_own"         on public.organizations;
drop policy if exists "org_select_own"  on public.organizations;
drop policy if exists "org_update_own"  on public.organizations;
create policy "org_select_own" on public.organizations
  for select using (id = public.get_user_org_id());
create policy "org_update_own" on public.organizations
  for update using (id = public.get_user_org_id())
  with check (id = public.get_user_org_id());

-- ── profiles ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "profile_own" on public.profiles;
create policy "profile_own" on public.profiles
  for all using (
    id = auth.uid() or
    organization_id = public.get_user_org_id()
  )
  with check (
    id = auth.uid() or
    organization_id = public.get_user_org_id()
  );

-- ── sedi ───────────────────────────────────────────────────────
alter table public.sedi enable row level security;
drop policy if exists "sedi_own" on public.sedi;
create policy "sedi_own" on public.sedi
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── user_data ──────────────────────────────────────────────────
alter table public.user_data enable row level security;
drop policy if exists "data_own" on public.user_data;
create policy "data_own" on public.user_data
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── dipendenti ─────────────────────────────────────────────────
alter table public.dipendenti enable row level security;
drop policy if exists "dipendenti_own" on public.dipendenti;
create policy "dipendenti_own" on public.dipendenti
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── turni ──────────────────────────────────────────────────────
alter table public.turni enable row level security;
drop policy if exists "turni_own" on public.turni;
create policy "turni_own" on public.turni
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── fornitori ──────────────────────────────────────────────────
alter table public.fornitori enable row level security;
drop policy if exists "fornitori_own" on public.fornitori;
create policy "fornitori_own" on public.fornitori
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── ordini_fornitori ───────────────────────────────────────────
alter table public.ordini_fornitori enable row level security;
drop policy if exists "ordini_own" on public.ordini_fornitori;
create policy "ordini_own" on public.ordini_fornitori
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── righe_ordine (filtra via ordini_fornitori) ─────────────────
alter table public.righe_ordine enable row level security;
drop policy if exists "righe_own" on public.righe_ordine;
create policy "righe_own" on public.righe_ordine
  for all using (
    ordine_id in (
      select id from public.ordini_fornitori
      where organization_id = public.get_user_org_id()
    )
  )
  with check (
    ordine_id in (
      select id from public.ordini_fornitori
      where organization_id = public.get_user_org_id()
    )
  );

-- ── notifiche ──────────────────────────────────────────────────
alter table public.notifiche enable row level security;
drop policy if exists "notifiche_own" on public.notifiche;
create policy "notifiche_own" on public.notifiche
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── integrazioni ───────────────────────────────────────────────
alter table public.integrazioni enable row level security;
drop policy if exists "integrazioni_own" on public.integrazioni;
create policy "integrazioni_own" on public.integrazioni
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── sync_log ───────────────────────────────────────────────────
alter table public.sync_log enable row level security;
drop policy if exists "sync_log_own" on public.sync_log;
create policy "sync_log_own" on public.sync_log
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ── fatture / note_giornaliere / referral ──────────────────────
-- Queste tabelle sono create out-of-band (non in migration files).
-- Applichiamo RLS solo se esistono, per evitare errori.
do $$
begin
  if to_regclass('public.fatture') is not null then
    execute 'alter table public.fatture enable row level security';
    execute 'drop policy if exists "fatture_own" on public.fatture';
    execute 'create policy "fatture_own" on public.fatture
      for all using (organization_id = public.get_user_org_id())
      with check (organization_id = public.get_user_org_id())';
  end if;

  if to_regclass('public.note_giornaliere') is not null then
    execute 'alter table public.note_giornaliere enable row level security';
    execute 'drop policy if exists "note_own" on public.note_giornaliere';
    execute 'create policy "note_own" on public.note_giornaliere
      for all using (organization_id = public.get_user_org_id())
      with check (organization_id = public.get_user_org_id())';
  end if;

  if to_regclass('public.referral') is not null then
    execute 'alter table public.referral enable row level security';
    execute 'drop policy if exists "referral_own" on public.referral';
    -- Referral è gestito esclusivamente dalla edge function /api/referral
    -- (service_role). Blocchiamo anon/authenticated.
    execute 'revoke all on public.referral from anon, authenticated';
    execute 'grant all on public.referral to service_role';
  end if;
end $$;

-- ── rate_limits / admin_log / audit_log — solo service_role ────
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
grant all on public.admin_log to service_role;

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant all on public.audit_log to service_role;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICA POST-MIGRATION
--
-- Dopo l'esecuzione, controlla con:
--   SELECT tablename, rowsecurity FROM pg_tables
--     WHERE schemaname = 'public' ORDER BY tablename;
--
-- Tutte le righe devono avere rowsecurity = true.
-- ═══════════════════════════════════════════════════════════════
