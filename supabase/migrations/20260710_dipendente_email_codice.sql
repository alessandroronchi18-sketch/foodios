-- ════════════════════════════════════════════════════════════════════════════
-- DIPENDENTE — email + codice personale (sostituisce PIN condiviso)
-- ════════════════════════════════════════════════════════════════════════════
-- Il vecchio flusso PIN (org_slug + 4-6 cifre) e' vulnerabile:
--   - slug pubblico enumerabile
--   - lock collettivo dopo 5 fallimenti → DoS dell'org
--   - PIN condiviso → audit trail non identifica il dipendente
--
-- Nuovo flusso (usa Supabase Auth nativo):
--   1) Titolare da Personale: aggiunge email + nome + codice 6 cifre
--   2) /api/dipendente-crea:
--      a) inserisce riga org_inviti (email pre-autorizzata)
--      b) supabase.auth.admin.createUser(email, password=codice, email_confirm=true)
--         → trigger handle_new_user() unisce all'org come dipendente
--      c) approva subito (titolare ha gia' autorizzato)
--      d) email di notifica al dipendente
--   3) Login dipendente dal tablet:
--      supabase.auth.signInWithPassword(email, codice) → JWT sessione
--
-- Vantaggi:
--   - Ogni dipendente e' un auth.users nativo → sessione, refresh token, ban
--     nativi. No custom JWT/magic_link fragile.
--   - Audit trail affidabile: user_id immutabile per ogni operazione.
--   - Rate-limit per-email (Supabase Auth nativo) → no DoS di gruppo.
--   - Nessuna enumerazione: chi non ha l'email non prova nemmeno.
--
-- Idempotente. Paste-safe.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Colonne di tracking sul profile dipendente ────────────────────────────
do $mig1$ begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists dipendente_codice_set_at timestamptz;
    alter table public.profiles add column if not exists dipendente_last_login_at timestamptz;
    alter table public.profiles add column if not exists dipendente_last_login_ip text;
  end if;
end $mig1$;

-- ── 2) Index per lookup rapido dipendenti per email in un'org ────────────────
create index if not exists idx_profiles_dip_email_org
  on public.profiles (organization_id, email)
  where ruolo = 'dipendente';

-- ── 3) RPC dipendente_marca_login: chiamata dal client dopo signInWithPassword
-- Traccia last_login_at + IP. Solo il dipendente stesso puo' scrivere sul
-- proprio profilo tramite questa RPC (security definer, con guard auth.uid()).
create or replace function public.dipendente_marca_login(
  p_ip text default null
) returns boolean as $mig3$
declare
  v_ruolo text;
begin
  select ruolo into v_ruolo from public.profiles where id = auth.uid();
  if v_ruolo is null then return false; end if;
  -- Silent skip per titolari (chiamata idempotente lato client).
  if v_ruolo <> 'dipendente' then return false; end if;

  update public.profiles
  set dipendente_last_login_at = now(),
      dipendente_last_login_ip = p_ip
  where id = auth.uid();
  return true;
end;
$mig3$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.dipendente_marca_login(text) from public, anon;
grant execute on function public.dipendente_marca_login(text) to authenticated;

-- ── 4) Aggiorna RPC fos_dipendenti_org per esporre anche il tracking codice
-- Serve al pannello Personale del titolare per mostrare "codice impostato il ..."
-- e "ultimo accesso il ...". Sostituisce la vecchia signature senza breaking
-- change: chi legge le vecchie colonne continua a funzionare.
drop function if exists public.fos_dipendenti_org();
create or replace function public.fos_dipendenti_org()
returns table (
  id uuid,
  email text,
  nome_completo text,
  approvato boolean,
  dipendente_codice_set_at timestamptz,
  dipendente_last_login_at timestamptz
)
language sql
security definer
set search_path = public
as $fos_dip$
  select p.id, p.email, p.nome_completo, p.approvato,
         p.dipendente_codice_set_at, p.dipendente_last_login_at
  from public.profiles p
  where p.organization_id = public.get_user_org_id()
    and p.ruolo = 'dipendente'
    and not public.is_dipendente()   -- solo il titolare puo' elencare gli accessi
  order by p.email
$fos_dip$;

revoke execute on function public.fos_dipendenti_org() from anon;
grant execute on function public.fos_dipendenti_org() to authenticated;

-- ── 5) RPC dipendente_marca_codice_impostato: chiamata dal server dopo aver
-- impostato/cambiato la password Supabase (che = codice personale).
-- Serve solo a tracciare quando l'ultimo cambio codice e' avvenuto.
create or replace function public.dipendente_marca_codice_impostato(
  p_user_id uuid
) returns boolean as $mig4$
declare
  v_actor_org uuid;
  v_actor_ruolo text;
  v_target_org uuid;
begin
  select organization_id, ruolo into v_actor_org, v_actor_ruolo
  from public.profiles where id = auth.uid();
  if v_actor_org is null or v_actor_ruolo <> 'titolare' then
    raise exception 'Solo il titolare puo gestire i codici dipendenti';
  end if;

  select organization_id into v_target_org
  from public.profiles where id = p_user_id;
  if v_target_org is null or v_target_org <> v_actor_org then
    raise exception 'Dipendente non trovato nella tua organizzazione';
  end if;

  update public.profiles
  set dipendente_codice_set_at = now()
  where id = p_user_id;
  return true;
end;
$mig4$ language plpgsql security definer
set search_path = public, pg_temp;

revoke all on function public.dipendente_marca_codice_impostato(uuid) from public, anon, authenticated;
grant execute on function public.dipendente_marca_codice_impostato(uuid) to authenticated;
