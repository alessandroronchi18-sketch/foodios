-- 20260621 — RPC stock dedicate per vendite B2B + causali dedicate
-- La RPC retail (stock_pf_scarico_vendita) cabla causale 'vendita'. Per il B2B
-- vogliamo una causale distinta (analisi/movimenti chiari) e un carico di
-- ripristino quando una vendita B2B viene eliminata/annullata.

-- 1. Estende le causali ammesse su movimenti_stock_pf
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'movimenti_stock_pf_causale_check') then
    alter table public.movimenti_stock_pf drop constraint movimenti_stock_pf_causale_check;
  end if;
  alter table public.movimenti_stock_pf
    add constraint movimenti_stock_pf_causale_check
    check (causale in (
      'produzione','vendita','vendita_b2b','scarto',
      'trasferimento_invio','trasferimento_ricezione','annullo_trasferimento',
      'annullo_vendita_b2b','rettifica_manuale','rettifica_admin'
    )) not valid;
end $$;

-- 2. Scarico stock per vendita B2B (causale 'vendita_b2b'). Ritorna lo stock
--    risultante (può essere negativo → scorta insufficiente, avviso non bloccante).
create or replace function public.stock_pf_scarico_b2b(
  p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz', p_note text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.get_user_org_id(); v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, -p_quantita, p_unita);
  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, -p_quantita, 'vendita_b2b', p_note);
  return v_nuova;
end; $$;

-- 3. Carico di ripristino (annullo/elimina vendita B2B) — causale 'annullo_vendita_b2b'.
create or replace function public.stock_pf_carico_b2b(
  p_sede uuid, p_prodotto text, p_quantita numeric, p_unita text default 'pz', p_note text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.get_user_org_id(); v_nuova numeric;
begin
  if v_org is null then raise exception 'Utente senza organizzazione'; end if;
  if p_quantita <= 0 then raise exception 'Quantita deve essere positiva'; end if;
  v_nuova := public.applica_delta_stock_pf(v_org, p_sede, p_prodotto, p_quantita, p_unita);
  insert into public.movimenti_stock_pf (organization_id, sede_id, prodotto_nome, delta, causale, note)
  values (v_org, p_sede, p_prodotto, p_quantita, 'annullo_vendita_b2b', p_note);
  return v_nuova;
end; $$;

grant execute on function public.stock_pf_scarico_b2b(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.stock_pf_carico_b2b(uuid, text, numeric, text, text) to authenticated;
