-- 20260614 — Fix: GRANT SELECT su audit_log a authenticated.
-- =======================================================================
-- BUG: la pagina Registro attività restituiva 'permission denied for table
-- audit_log'. La RLS policy 'audit_read_own' (migration 20260606_audit_attivita)
-- e' OK e filtra correttamente per organization_id + ruolo titolare,
-- MA in Postgres serve sia il GRANT a livello di tabella SIA la policy
-- RLS perche' un ruolo possa leggere. Le migration 20260513/20260514
-- fanno 'revoke all on audit_log from authenticated' senza mai darne
-- indietro SELECT, quindi anche il titolare non puo' leggere.
--
-- Fix: dare SELECT al ruolo authenticated. La RLS gia' filtra a:
--   - tenant: organization_id IN (profile dell'utente)
--   - ruolo: not is_dipendente()
-- quindi un dipendente vede 0 righe; un titolare vede solo la propria org.
-- =======================================================================

grant select on public.audit_log to authenticated;

-- Idempotente: doppio grant non e' un errore. Le migration future che fanno
-- 'revoke all' su audit_log devono ridare il grant select.
