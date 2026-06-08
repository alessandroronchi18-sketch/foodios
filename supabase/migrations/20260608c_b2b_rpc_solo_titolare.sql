-- ════════════════════════════════════════════════════════════════════════════
-- FIX AUDIT (2026-06-08) — M4: le RPC stock B2B sono riservate al TITOLARE.
-- Le vendite B2B sono un flusso solo-titolare (tabelle clienti_b2b/vendite_b2b già
-- bloccate ai dipendenti). Aggiungo il guard `not is_dipendente()` anche nelle RPC
-- di movimentazione stock B2B, così un dipendente non può muovere stock via RPC.
-- Idempotente (create or replace; corpi identici a 20260621 + il guard).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.stock_pf_scarico_b2b(
  p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz', p_note text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.get_user_org_id(); v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if public.is_dipendente() then raise exception 'Operazione riservata al titolare'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita);
  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita_b2b', p_note);
  return v_nuova;
end; $$;

create or replace function public.stock_pf_carico_b2b(
  p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz', p_note text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.get_user_org_id(); v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if public.is_dipendente() then raise exception 'Operazione riservata al titolare'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita);
  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'annullo_vendita_b2b', p_note);
  return v_nuova;
end; $$;
