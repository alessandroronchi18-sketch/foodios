-- ════════════════════════════════════════════════════════════════════════════
-- «Bisogna istituire la possibilità ad alcuni dipendenti di poter ordinare»
-- Richiesta del titolare, 22/09/2026.
--
-- Oggi NESSUN dipendente può leggere né scrivere `ordini_fornitori` o
-- `righe_ordine`: 20260607_dipendente_no_lettura_sensibili.sql (righe ~39-53)
-- ha messo `fatture, fornitori, ordini_fornitori, vendite_b2b, clienti_b2b,
-- audit_log` nello stesso sacco, tutte con la stessa regola
-- `not is_dipendente()`. Va bene per fatture e conti, ma un dipendente di
-- laboratorio che deve rifare la scorta di farina non può ordinarla da solo:
-- deve fermare il lavoro e chiamare il titolare per ogni sacco.
--
-- Qui si apre UNA porta sola, e restano chiuse tutte le altre: un flag per
-- account (`profiles.puo_ordinare`), che il titolare accende a mano, e che
-- conta SOLO per `ordini_fornitori` e `righe_ordine`. Fatture, fornitori
-- (anagrafica con condizioni/margini), vendite e clienti B2B, registro
-- attività: restano dove sono, `not is_dipendente()` e basta — questo
-- permesso è SOLO per fare ordini, non un varco generale sui dati sensibili.
--
-- Il punto delicato non è la lettura in più: è che il permesso non si dia da
-- solo. Un dipendente che potesse alzare il proprio `puo_ordinare` renderebbe
-- inutile la migration del 07/06 — vedi punto 4.
--
-- Idempotente: rieseguibile come tutte le altre.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Il flag: default false, si dà, non si toglie da solo ────────────────
alter table public.profiles
  add column if not exists puo_ordinare boolean not null default false;

-- ── 2) La funzione, stessa forma di is_dipendente() (20260605_ruolo_dipendente.sql):
-- security definer, search_path fissato, stable. coalesce esplicito: se il
-- profilo non si trova (auth.uid() null, sessione anonima), risponde "no",
-- non NULL — un NULL dentro un "or" di policy si comporta in modo ambiguo.
create or replace function public.puo_ordinare()
returns boolean
language sql security definer stable
set search_path = public
as $fn$
  select coalesce(
    (select puo_ordinare from public.profiles where id = auth.uid()),
    false
  )
$fn$;
revoke all on function public.puo_ordinare() from public;
grant execute on function public.puo_ordinare() to anon, authenticated;

-- ── 3) ordini_fornitori / righe_ordine: si apre SOLO qui ────────────────────
--
-- ordini_fornitori: sostituisce "ordini_fornitori_solo_titolare" (creata dal
-- loop del 20260607_dipendente_no_lettura_sensibili.sql) con una regola che
-- lascia passare anche il dipendente con il flag acceso. Le altre cinque
-- tabelle di quel loop (fatture, fornitori, vendite_b2b, clienti_b2b,
-- audit_log) NON si toccano: restano con `not is_dipendente()` da sole.
drop policy if exists "ordini_fornitori_solo_titolare" on public.ordini_fornitori;
drop policy if exists "ordini_fornitori_permesso_ordinare" on public.ordini_fornitori;
create policy "ordini_fornitori_permesso_ordinare" on public.ordini_fornitori
  for all using (
    organization_id = public.get_user_org_id()
    and (not public.is_dipendente() or public.puo_ordinare())
  )
  with check (
    organization_id = public.get_user_org_id()
    and (not public.is_dipendente() or public.puo_ordinare())
  );

-- righe_ordine: non ha organization_id, la regola passa dalla tabella padre
-- con una subquery (20260514_rls_completo.sql righe ~88-102). Oggi
-- "righe_own" filtra i dipendenti solo per effetto TRANSITIVO — la subquery
-- su ordini_fornitori è essa stessa filtrata dalla RLS di quella tabella.
-- Qui il permesso si ripete ESPLICITAMENTE nella subquery: non ci si fida
-- solo dell'effetto a catena, la regola sta scritta anche in questo file.
drop policy if exists "righe_own" on public.righe_ordine;
drop policy if exists "righe_ordine_permesso_ordinare" on public.righe_ordine;
create policy "righe_ordine_permesso_ordinare" on public.righe_ordine
  for all using (
    ordine_id in (
      select id from public.ordini_fornitori
      where organization_id = public.get_user_org_id()
        and (not public.is_dipendente() or public.puo_ordinare())
    )
  )
  with check (
    ordine_id in (
      select id from public.ordini_fornitori
      where organization_id = public.get_user_org_id()
        and (not public.is_dipendente() or public.puo_ordinare())
    )
  );

-- ── 4) Il flag non si dà da solo ────────────────────────────────────────────
--
-- Verificato leggendo lo stato attuale di profiles, non supponendolo:
--
--   - RLS "profile_own" (20260514_rls_completo.sql, mai ridefinita dopo) è
--     `using (id = auth.uid() or organization_id = public.get_user_org_id())`
--     `with check` identico. A livello di RIGA un titolare può già toccare
--     il profilo di un collega della sua stessa org (organization_id
--     combacia); un titolare di un'ALTRA org no (nessuna delle due
--     condizioni è vera per una riga che non è sua e non è della sua org).
--     Questo pezzo va bene così com'è, non lo tocco.
--
--   - Ma a livello di COLONNA, 20260914g_profiles_colonne_protette.sql ha
--     tolto tutto tranne `nome_completo`:
--         revoke update on public.profiles from authenticated;
--         grant update (nome_completo) on public.profiles to authenticated;
--     Senza un grant esplicito su `puo_ordinare`, NESSUNO — nemmeno il
--     titolare — potrebbe scriverla dal client: il Postgres risponderebbe
--     "permission denied for column puo_ordinare" a chiunque, interruttore
--     dell'interfaccia compreso.
--
--   - Il trigger `guard_profile_escalation` (corpo vivente da
--     20260608_audit_fix_isolamento.sql, search_path rafforzato da
--     20260615_db_hardening.sql) blocca un DIPENDENTE che cambi `ruolo` o
--     `approvato`, ma non sapeva nulla di `puo_ordinare` perché la colonna
--     non esisteva ancora.
--
-- Quindi servono DUE aggiunte, non una sola — sono la stessa "rete doppia"
-- già usata su ruolo/approvato (permesso + guardia, né l'uno né l'altra
-- bastano da soli):
--
--   (a) il grant di colonna: altrimenti il titolare non può accendere
--       niente, e l'interruttore in Personale.jsx fallirebbe sempre;
--   (b) il trigger esteso: altrimenti, appena (a) esiste, un dipendente può
--       accendere il flag da solo — su di sé o su un collega — perché la
--       RLS di riga (sopra) non lo vieta di per sé (verifica una sola cosa:
--       "la riga è della tua org", non "chi sei tu che scrivi").

-- (a) grant di colonna: additivo, non tocca il grant esistente su nome_completo.
grant update (puo_ordinare) on public.profiles to authenticated;

-- (b) guardia: stesso corpo di 20260608_audit_fix_isolamento.sql (con il
-- search_path di 20260615_db_hardening.sql), più la riga su puo_ordinare.
-- Il trigger che la usa (trg_guard_profile_escalation, creato in
-- 20260605_ruolo_dipendente.sql) non va ricreato: punta già a questa
-- funzione per nome, CREATE OR REPLACE basta.
create or replace function public.guard_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $guard$
begin
  if auth.uid() is not null and new.organization_id is distinct from old.organization_id then
    raise exception 'Non e consentito cambiare organizzazione';
  end if;
  if public.is_dipendente() and (
       new.ruolo is distinct from old.ruolo
       or new.approvato is distinct from old.approvato
       or new.puo_ordinare is distinct from old.puo_ordinare
     ) then
    raise exception 'Dipendente non puo cambiare ruolo, approvato o permesso di ordinare';
  end if;
  return new;
end;
$guard$;

-- ── 5) Registro attività: il cambio del flag lascia traccia ────────────────
-- Stessa funzione di 20260606_audit_attivita.sql (log_profile_change), con
-- una riga in più: ruolo, approvato e organization_id sono già tracciati
-- perché sono le colonne che cambiano "chi sei e cosa puoi fare" — questo
-- flag è della stessa famiglia e merita lo stesso registro.
create or replace function public.log_profile_change()
returns trigger language plpgsql security definer
set search_path = public
as $audit$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ruolo text;
  v_changes jsonb := '{}'::jsonb;
  v_label text;
begin
  if v_uid is null then
    return coalesce(NEW, OLD);
  end if;

  select email, ruolo into v_email, v_ruolo
  from public.profiles where id = v_uid;

  if TG_OP = 'UPDATE' then
    if NEW.ruolo is distinct from OLD.ruolo then
      v_changes := v_changes || jsonb_build_object(
        'ruolo', jsonb_build_array(OLD.ruolo, NEW.ruolo)
      );
    end if;
    if NEW.approvato is distinct from OLD.approvato then
      v_changes := v_changes || jsonb_build_object(
        'approvato', jsonb_build_array(OLD.approvato, NEW.approvato)
      );
    end if;
    if NEW.organization_id is distinct from OLD.organization_id then
      v_changes := v_changes || jsonb_build_object(
        'organization_id',
        jsonb_build_array(OLD.organization_id, NEW.organization_id)
      );
    end if;
    if NEW.puo_ordinare is distinct from OLD.puo_ordinare then
      v_changes := v_changes || jsonb_build_object(
        'puo_ordinare', jsonb_build_array(OLD.puo_ordinare, NEW.puo_ordinare)
      );
    end if;
    if v_changes = '{}'::jsonb then
      return NEW;
    end if;
    v_label := concat('Profilo ', coalesce(NEW.email, OLD.email), ' modificato');
  elsif TG_OP = 'INSERT' then
    v_label := concat('Profilo ', NEW.email, ' creato');
  else
    v_label := concat('Profilo ', OLD.email, ' eliminato');
  end if;

  insert into public.audit_log (
    organization_id, user_id, user_email, table_name, operation,
    row_id, new_data, changed_by, created_at
  ) values (
    coalesce(NEW.organization_id, OLD.organization_id),
    v_uid, v_email, 'profiles', lower(TG_OP),
    coalesce(NEW.id, OLD.id),
    jsonb_build_object(
      'target_email', coalesce(NEW.email, OLD.email),
      'target_ruolo', coalesce(NEW.ruolo, OLD.ruolo),
      'ruolo', v_ruolo,
      'changes', v_changes,
      'label', v_label
    ),
    v_uid, now()
  );
  return coalesce(NEW, OLD);
end;
$audit$;

-- ── 6) La scheda del laboratorio deve poter leggere il flag ────────────────
-- `Personale.jsx` elenca gli account "laboratorio" con la RPC
-- fos_dipendenti_org() (ultima definizione in
-- 20260729_dipendenti_operativi.sql): senza questa colonna in più
-- l'interfaccia non avrebbe modo di sapere se l'interruttore è già acceso.
-- Stessa funzione, stesso filtro (solo il titolare, solo la sua org), con
-- `puo_ordinare` aggiunta in fondo alla tabella e alla select.
--
-- Attenzione: aggiungere una colonna cambia il tipo restituito, e
-- `create or replace` in Postgres non lo permette ("cannot change return type
-- of existing function"). Va sganciata prima. Provato davvero, in una
-- transazione con rollback sul database vero: senza il drop, la migration si
-- ferma qui e tutto quello che c'e' sopra non viene applicato.
drop function if exists public.fos_dipendenti_org();

create function public.fos_dipendenti_org()
returns table (
  id uuid,
  email text,
  nome_completo text,
  approvato boolean,
  is_laboratorio_account boolean,
  laboratorio_sede_id uuid,
  laboratorio_sede_nome text,
  dipendente_codice_set_at timestamptz,
  dipendente_last_login_at timestamptz,
  puo_ordinare boolean
)
language sql security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.email,
    p.nome_completo,
    p.approvato,
    coalesce(p.is_laboratorio_account, false) as is_laboratorio_account,
    p.laboratorio_sede_id,
    s.nome as laboratorio_sede_nome,
    p.dipendente_codice_set_at,
    p.dipendente_last_login_at,
    coalesce(p.puo_ordinare, false) as puo_ordinare
  from public.profiles p
  left join public.sedi s on s.id = p.laboratorio_sede_id
  where p.organization_id = public.get_user_org_id()
    and p.ruolo = 'dipendente'
    and not public.is_dipendente()   -- solo il titolare puo' elencare gli accessi
  order by p.nome_completo nulls last, p.email;
$$;

revoke all on function public.fos_dipendenti_org() from public, anon;
grant execute on function public.fos_dipendenti_org() to authenticated;
