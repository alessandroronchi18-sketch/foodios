-- Migration: sessioni operative server-side per l'identità del dipendente
-- che digita il codice sul tablet laboratorio.
--
-- MOTIVAZIONE (backlog recap 2026-07-29, "v2 sicurezza sessione server-side"):
-- Il flusso originale tiene l'id del dipendente in localStorage
-- (foodos_dip_op). Un dipendente A potrebbe fare
--   `select id from dipendenti where cognome='Rossi'`
-- (RLS dipendenti_own lo permette), sostituire l'id in localStorage con
-- quello di Marco Rossi, e loggare le sue operazioni a nome di Marco.
-- Threat model basso per una pasticceria, ma il buco esiste.
--
-- Fix: quando `dipendente_operativo_valida` valida il codice, apre anche
-- una SESSIONE server-side (auth_user_id ↔ dipendente_id). Tutte le
-- tabelle operative (stock_pf, trasferimenti, haccp_*, vendite_b2b)
-- hanno un trigger BEFORE INSERT/UPDATE che verifica: `dipendente_operativo_id`
-- accettato solo se esiste sessione ATTIVA per auth.uid(). Modificare
-- l'id in localStorage senza avere il codice non serve: il trigger blocca.
--
-- Idempotente. Nessuna migrazione dati (le righe pregresse non sono
-- toccate; il trigger valida solo INSERT/UPDATE del `dipendente_operativo_id`).

-- 1) Tabella sessioni ────────────────────────────────────────────────────────
create table if not exists public.dipendente_operativo_sessioni (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  iniziata_at timestamptz not null default now(),
  terminata_at timestamptz,
  -- Autoscadenza: se il client crasha senza chiamare `termina`, dopo 12h
  -- la sessione non è più valida. Copre un turno lungo (10h) + margine.
  expires_at timestamptz not null default (now() + interval '12 hours')
);

-- Indice per il trigger di verifica: cerca velocemente "sessione attiva
-- per questa coppia (auth_user_id, dipendente_id)".
create index if not exists idx_dop_sess_attiva
  on public.dipendente_operativo_sessioni(auth_user_id, dipendente_id)
  where terminata_at is null;

-- Indice per admin/debug: sessioni per org (audit).
create index if not exists idx_dop_sess_org_iniziata
  on public.dipendente_operativo_sessioni(organization_id, iniziata_at desc);

-- 2) RLS ────────────────────────────────────────────────────────────────────
alter table public.dipendente_operativo_sessioni enable row level security;

-- Il client authenticated può SELECT solo le proprie sessioni (per il
-- check al mount del Provider). INSERT/UPDATE/DELETE solo via SECURITY
-- DEFINER dalle RPC — nessuna policy → tutto negato di default.
drop policy if exists dop_sess_own_read on public.dipendente_operativo_sessioni;
create policy dop_sess_own_read on public.dipendente_operativo_sessioni
  for select to authenticated
  using (auth_user_id = auth.uid());

-- 3) Trigger di verifica ────────────────────────────────────────────────────
create or replace function public.verify_dipendente_operativo_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Se non c'è dipendente_operativo_id, nessun controllo (operazione
  -- del titolare che NON ha selezionato identità operativa: è OK, non
  -- viene loggata a nessun dipendente).
  if new.dipendente_operativo_id is null then
    return new;
  end if;
  -- Se l'utente Supabase non c'è (service_role, cron), skippa: solo il
  -- client authenticated passa da qui. I flow server-side (seed, cron)
  -- non impostano dipendente_operativo_id di norma.
  if v_uid is null then
    return new;
  end if;
  -- Verifica sessione attiva per (utente Supabase, dipendente).
  if not exists (
    select 1 from public.dipendente_operativo_sessioni s
    where s.dipendente_id = new.dipendente_operativo_id
      and s.auth_user_id = v_uid
      and s.terminata_at is null
      and s.expires_at > now()
  ) then
    raise exception
      'Nessuna sessione operativa attiva per il dipendente selezionato'
      using hint = 'Torna alla schermata "Chi sei?" e inserisci di nuovo il tuo codice.',
            errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;

-- 4) Attach trigger su tutte le tabelle operative con dipendente_operativo_id
--    BEFORE INSERT — verifica al momento dell'insert (client-side calls).
--    BEFORE UPDATE OF dipendente_operativo_id — evita rewrite dell'id.
--    Le RPC SECURITY DEFINER (trasferimento_*, applica_delta_stock_pf, ...)
--    girano come postgres MA auth.uid() nel trigger torna comunque l'utente
--    originale del JWT (comportamento standard Supabase), quindi il trigger
--    valida correttamente anche gli insert fatti tramite RPC.

drop trigger if exists trg_verify_dop_stock_pf on public.stock_prodotti_finiti;
create trigger trg_verify_dop_stock_pf
  before insert or update of dipendente_operativo_id
  on public.stock_prodotti_finiti
  for each row execute function public.verify_dipendente_operativo_session();

drop trigger if exists trg_verify_dop_trasferimenti on public.trasferimenti;
create trigger trg_verify_dop_trasferimenti
  before insert or update of dipendente_operativo_id
  on public.trasferimenti
  for each row execute function public.verify_dipendente_operativo_session();

drop trigger if exists trg_verify_dop_haccp_temp on public.haccp_temperature;
create trigger trg_verify_dop_haccp_temp
  before insert or update of dipendente_operativo_id
  on public.haccp_temperature
  for each row execute function public.verify_dipendente_operativo_session();

drop trigger if exists trg_verify_dop_haccp_check on public.haccp_checklist_log;
create trigger trg_verify_dop_haccp_check
  before insert or update of dipendente_operativo_id
  on public.haccp_checklist_log
  for each row execute function public.verify_dipendente_operativo_session();

drop trigger if exists trg_verify_dop_vendite_b2b on public.vendite_b2b;
create trigger trg_verify_dop_vendite_b2b
  before insert or update of dipendente_operativo_id
  on public.vendite_b2b
  for each row execute function public.verify_dipendente_operativo_session();

-- 5) RPC dipendente_operativo_valida — riscrittura per creare sessione ─────
-- Firma invariata: `(p_codice text) → jsonb`. Retro-compat sui campi
-- ritornati (id, nome, cognome, ruolo, ok) + aggiunge `session_id`.
create or replace function public.dipendente_operativo_valida(p_codice text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_dip record;
  v_session_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'no_org');
  end if;

  if p_codice is null or p_codice !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'codice_formato_invalido');
  end if;

  -- Match via join: codice deve essere attivo + dipendente HR deve essere attivo
  select d.id, d.nome, d.cognome, d.ruolo
    into v_dip
    from public.dipendenti d
    join public.dipendenti_codici c on c.dipendente_id = d.id
   where d.organization_id = v_org
     and c.organization_id = v_org
     and c.codice_operativo = p_codice
     and c.attivo = true
     and d.attivo = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'codice_non_valido');
  end if;

  update public.dipendenti_codici
     set last_used_at = now()
   where dipendente_id = v_dip.id;

  -- Chiudi eventuali sessioni attive precedenti dello stesso utente Supabase.
  -- Casi tipici: utente ha selezionato Marco, non ha fatto "Cambia" e ora
  -- inserisce il codice di Anna direttamente — la sessione di Marco va
  -- chiusa altrimenti restano 2 sessioni attive (per audit è OK ma per
  -- pulizia meglio 1 alla volta).
  update public.dipendente_operativo_sessioni
     set terminata_at = now()
   where auth_user_id = v_uid
     and terminata_at is null;

  -- Nuova sessione
  insert into public.dipendente_operativo_sessioni (organization_id, auth_user_id, dipendente_id)
    values (v_org, v_uid, v_dip.id)
    returning id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_dip.id,
    'nome', v_dip.nome,
    'cognome', v_dip.cognome,
    'ruolo', v_dip.ruolo,
    'session_id', v_session_id
  );
end;
$$;

revoke all on function public.dipendente_operativo_valida(text) from public, anon;
grant execute on function public.dipendente_operativo_valida(text) to authenticated;

-- 6) RPC dipendente_operativo_termina — chiude la sessione ────────────────
-- Chiamata dal client su:
--   - bottone "Cambia" nel badge topbar / drawer profilo
--   - auto-timeout dopo 30min inattività (useAutoLogoutDipendente)
--   - signOut Supabase (via cleanup del Provider)
-- Se p_session_id è null, chiude TUTTE le sessioni attive dell'utente
-- (defensive: caso in cui il client non ha salvato l'id).
create or replace function public.dipendente_operativo_termina(p_session_id uuid default null)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  if p_session_id is null then
    update public.dipendente_operativo_sessioni
       set terminata_at = now()
     where auth_user_id = auth.uid()
       and terminata_at is null;
  else
    update public.dipendente_operativo_sessioni
       set terminata_at = now()
     where id = p_session_id
       and auth_user_id = auth.uid()
       and terminata_at is null;
  end if;
end;
$$;

revoke all on function public.dipendente_operativo_termina(uuid) from public, anon;
grant execute on function public.dipendente_operativo_termina(uuid) to authenticated;

-- 7) RPC dipendente_operativo_session_check — verifica sessione attiva ────
-- Chiamata dal Provider al mount: se il client ha `foodos_dip_op` in
-- localStorage ma non c'è sessione server per quella coppia
-- (auth_user_id, dipendente_id), qualcosa è andato storto (deploy che
-- ha invalidato tutto, sessione scaduta, session_id manomessa) → il
-- client fa clear del localStorage e mostra "Chi sei?".
create or replace function public.dipendente_operativo_session_check(p_session_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_dip_id uuid;
begin
  if v_uid is null or p_session_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select dipendente_id into v_dip_id
    from public.dipendente_operativo_sessioni
   where id = p_session_id
     and auth_user_id = v_uid
     and terminata_at is null
     and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'session_not_active');
  end if;
  return jsonb_build_object('ok', true, 'dipendente_id', v_dip_id);
end;
$$;

revoke all on function public.dipendente_operativo_session_check(uuid) from public, anon;
grant execute on function public.dipendente_operativo_session_check(uuid) to authenticated;

comment on function public.dipendente_operativo_valida(text) is
  'Valida codice 4 cifre + APRE sessione server-side. Chiude altre sessioni attive dello stesso utente. Ritorna session_id oltre ai dati dipendente.';
comment on function public.dipendente_operativo_termina(uuid) is
  'Chiude una sessione (specifica o tutte quelle attive dell''utente).';
comment on function public.dipendente_operativo_session_check(uuid) is
  'Verifica se una sessione è ancora attiva. Usata dal Provider client-side al mount per rilevare sessioni stale (deploy, scadenza, disattivazione).';
