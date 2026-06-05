-- 20260616 — Log prezzi: audit trail unico per azienda (consolidamento sedi).
-- =======================================================================
-- pasticceria-log-prezzi-v1 era salvato per-sede, ma il ricettario/prezzi e
-- shared: lo storico modifiche prezzi va quindi unificato a livello azienda.
-- Lato codice la chiave e ora in SHARED_KEYS (storage.js) e viene scritta con
-- sede_id NULL. Qui consolidiamo le righe per-sede preesistenti:
--   1. per ogni org, unisce gli elementi degli array per-sede (+ eventuale
--      riga shared gia presente), deduplicando gli oggetti identici;
--   2. fa upsert del merge nella riga sede_id NULL;
--   3. elimina le righe per-sede ormai consolidate.
-- Idempotente: rieseguita, non trova piu righe per-sede e non fa nulla.
-- =======================================================================

do $migr$
declare
  r record;
  merged jsonb;
begin
  for r in
    select distinct organization_id
    from public.user_data
    where data_key = 'pasticceria-log-prezzi-v1'
      and sede_id is not null
  loop
    -- Unione deduplicata di tutti gli elementi (per-sede + shared esistente).
    select coalesce(jsonb_agg(distinct elem), '[]'::jsonb)
      into merged
    from public.user_data ud,
         lateral jsonb_array_elements(
           case when jsonb_typeof(ud.data_value) = 'array'
                then ud.data_value else '[]'::jsonb end
         ) as elem
    where ud.data_key = 'pasticceria-log-prezzi-v1'
      and ud.organization_id = r.organization_id;

    -- Upsert nella riga shared (sede_id NULL).
    if exists (
      select 1 from public.user_data
      where organization_id = r.organization_id
        and data_key = 'pasticceria-log-prezzi-v1'
        and sede_id is null
    ) then
      update public.user_data
        set data_value = merged, updated_at = now()
      where organization_id = r.organization_id
        and data_key = 'pasticceria-log-prezzi-v1'
        and sede_id is null;
    else
      insert into public.user_data
        (organization_id, sede_id, data_key, data_value, updated_at)
      values
        (r.organization_id, null, 'pasticceria-log-prezzi-v1', merged, now());
    end if;

    -- Rimuove le righe per-sede consolidate.
    delete from public.user_data
    where organization_id = r.organization_id
      and data_key = 'pasticceria-log-prezzi-v1'
      and sede_id is not null;
  end loop;
end
$migr$;
