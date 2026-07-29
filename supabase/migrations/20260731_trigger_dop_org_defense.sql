-- Migration: defense-in-depth cross-org sul trigger verify_dipendente_operativo_session.
--
-- MOTIVAZIONE (audit 2026-07-31): il trigger creato in 20260730 non filtra
-- esplicitamente `s.organization_id = new.organization_id` nel EXISTS della
-- sessione. Nel modello attuale il rischio è teorico:
--   - la RPC dipendente_operativo_valida filtra su v_org di profiles.auth.uid()
--   - la sessione creata è sempre per la sola org corrente
--   - l'RLS su ognuna delle 5 tabelle operative filtra su organization_id
-- Quindi un insert cross-org sarebbe già bloccato prima del trigger.
--
-- Ma se un giorno cambiasse una di quelle assunzioni (es. un utente
-- multi-org, un flag admin che bypassa RLS, un flow SECURITY DEFINER che
-- non forza l'org), il trigger da solo non basterebbe. Aggiungiamo il
-- controllo esplicito: la sessione DEVE essere della stessa org della riga
-- che si sta inserendo. Security by design, non by accident.
--
-- Idempotente: sostituisce la function esistente. I trigger attaccati alle
-- 5 tabelle non serve ricrearli (puntano a public.verify_dipendente_operativo_session
-- per nome — CREATE OR REPLACE FUNCTION mantiene tutti i trigger attivi).

create or replace function public.verify_dipendente_operativo_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.dipendente_operativo_id is null then
    return new;
  end if;
  if v_uid is null then
    return new;
  end if;
  -- Defense-in-depth: la sessione deve essere per la STESSA org della
  -- riga che stiamo inserendo. Evita che una sessione aperta in org A
  -- possa validare (in linea puramente teorica) un insert su org B.
  if not exists (
    select 1 from public.dipendente_operativo_sessioni s
    where s.dipendente_id = new.dipendente_operativo_id
      and s.auth_user_id = v_uid
      and s.organization_id = new.organization_id
      and s.terminata_at is null
      and s.expires_at > now()
  ) then
    raise exception
      'Nessuna sessione operativa attiva per il dipendente selezionato'
      using hint = 'Torna alla schermata "Chi sei?" e inserisci di nuovo il tuo codice.',
            errcode = '42501';
  end if;
  return new;
end;
$$;
