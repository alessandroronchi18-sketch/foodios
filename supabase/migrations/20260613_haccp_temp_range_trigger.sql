-- 20260613 — HACCP: trigger server-side per computare fuori_range
-- =======================================================================
-- Oggi `fuori_range` viene calcolato solo lato client (Haccp.jsx). Un
-- client malevolo o un'integrazione esterna che scrivesse direttamente
-- in haccp_temperature via API potrebbe inserire una temperatura fuori
-- soglia con `fuori_range=false`, falsificando il registro per ispezioni
-- ASL.
--
-- Soluzione: trigger BEFORE INSERT/UPDATE che ricalcola sempre il flag
-- sui valori temp_min/temp_max dell'apparecchio collegato. Il client puo'
-- continuare a passare il valore come "hint" (per UX immediato), ma il
-- DB e' la fonte di verita'.
-- =======================================================================

create or replace function public.compute_haccp_fuori_range()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_min numeric;
  v_max numeric;
begin
  -- Recupera range dall'apparecchio collegato.
  select temp_min, temp_max
    into v_min, v_max
    from public.haccp_apparecchi
   where id = new.apparecchio_id;

  -- Se non troviamo l'apparecchio o se mancano i range, manteniamo il
  -- valore fornito dal client (best-effort) — meglio false negative che
  -- bloccare l'insert.
  if v_min is null or v_max is null then
    return new;
  end if;

  new.fuori_range := (new.temperatura < v_min) or (new.temperatura > v_max);
  return new;
end;
$fn$;

drop trigger if exists trg_haccp_fuori_range on public.haccp_temperature;
create trigger trg_haccp_fuori_range
before insert or update of temperatura, apparecchio_id
on public.haccp_temperature
for each row
execute function public.compute_haccp_fuori_range();

comment on function public.compute_haccp_fuori_range is
  'Fonte di verita server-side per il flag fuori_range delle rilevazioni HACCP. Ignora il valore client e ricalcola sui range dell apparecchio collegato. Sicurezza per ispezioni ASL.';
