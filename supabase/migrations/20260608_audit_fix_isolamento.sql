-- ════════════════════════════════════════════════════════════════════════════
-- FIX AUDIT SICUREZZA (2026-06-08) — isolamento multi-tenant.
-- Da audit avversariale: tre buchi confermati.
--   C1  takeover cross-tenant: un utente poteva cambiare la propria
--       organization_id (la policy profile_own consente self-update e il guard
--       bloccava solo ruolo/approvato) → get_user_org_id() restituiva l'altra org.
--   H2  IDOR: applica_delta_stock_pf (SECURITY DEFINER, grant a authenticated)
--       accetta p_org dal chiamante senza verifica → scrittura stock cross-org.
--   H3  clienti_b2b / vendite_b2b: policy solo org-scoped (tabelle create dopo il
--       blocco dipendenti del 20260607) → un dipendente legge/scrive i dati B2B.
-- Idempotente. Paste-safe.
-- ════════════════════════════════════════════════════════════════════════════

-- ── C1: nessun cambio di organization_id da parte di un utente autenticato ────
-- Consentito solo al service_role (auth.uid() IS NULL: handle_new_user, endpoint
-- server con service key, migrazioni). Il guard è già su BEFORE UPDATE di profiles.
create or replace function public.guard_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if auth.uid() is not null and new.organization_id is distinct from old.organization_id then
    raise exception 'Non e'' consentito cambiare organizzazione';
  end if;
  if public.is_dipendente() and (
       new.ruolo is distinct from old.ruolo
       or new.approvato is distinct from old.approvato
     ) then
    raise exception 'Dipendente non puo cambiare ruolo o approvato';
  end if;
  return new;
end;
$guard$;

-- ── H2: la RPC raw non deve essere invocabile dal client ──────────────────────
-- I wrapper (stock_pf_carico_produzione/scarico_vendita/scarto/_b2b) sono
-- SECURITY DEFINER e la chiamano internamente come owner → la revoke non li rompe.
revoke execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text) from authenticated, anon;

-- ── H3: clienti_b2b / vendite_b2b vietate ai dipendenti (con WITH CHECK) ───────
do $$
begin
  if to_regclass('public.clienti_b2b') is not null then
    execute 'drop policy if exists "clienti_b2b_own" on public.clienti_b2b';
    execute 'drop policy if exists "clienti_b2b_titolare" on public.clienti_b2b';
    execute 'create policy "clienti_b2b_titolare" on public.clienti_b2b for all using (organization_id = public.get_user_org_id() and not public.is_dipendente()) with check (organization_id = public.get_user_org_id() and not public.is_dipendente())';
  end if;
  if to_regclass('public.vendite_b2b') is not null then
    execute 'drop policy if exists "vendite_b2b_own" on public.vendite_b2b';
    execute 'drop policy if exists "vendite_b2b_titolare" on public.vendite_b2b';
    execute 'create policy "vendite_b2b_titolare" on public.vendite_b2b for all using (organization_id = public.get_user_org_id() and not public.is_dipendente()) with check (organization_id = public.get_user_org_id() and not public.is_dipendente())';
  end if;
end $$;
