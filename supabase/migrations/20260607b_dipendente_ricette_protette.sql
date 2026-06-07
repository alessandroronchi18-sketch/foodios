-- ════════════════════════════════════════════════════════════════════════════
-- SICUREZZA: il DIPENDENTE non deve MAI vedere ingredienti/quantità/costi delle
-- ricette (né la composizione dei semilavorati, né gli ingredientiUsati storici).
--   - Aggiunge ricettario, giornaliero e semilavorati alle chiavi SENSIBILI →
--     la policy SELECT su user_data le nega al dipendente (RLS, anche via curl).
--   - Fornisce 2 RPC SECURITY DEFINER che restituiscono versioni SANITIZZATE
--     (senza ingredienti/costi/ingredientiUsati) per i flussi operativi del
--     dipendente (Produzione/Cassa/Calendario/Magazzino).
-- Lo scarico magazzino alla conferma produzione del dipendente NON avviene più
-- lato client (che non ha gli ingredienti): lo fa l'endpoint server
-- api/produzione-registra.js con la service key. Il titolare NON è toccato.
-- Idempotente. Paste-safe (un solo livello di dollar-quoting $$).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Chiavi sensibili: aggiungo ricettario + giornaliero + semilavorati ─────
create or replace function public.is_chiave_sensibile(k text)
returns boolean language sql immutable
set search_path = public
as $$
  select k = any (array[
    'pasticceria-ai-v1',
    'pasticceria-actions-v1',
    'pasticceria-eventi-v1',
    'azienda-pagamenti-v1',
    'pasticceria-organigramma-v1',
    'pasticceria-consuntivo-turni-v1',
    'menu-giorno-v1',
    'pl-costi-fissi-v1',
    'pasticceria-ricettario-v1',
    'pasticceria-giornaliero-v1',
    'pasticceria-semilavorati-v1'
  ])
$$;
grant execute on function public.is_chiave_sensibile(text) to anon, authenticated;

-- ── 2) RPC: ricettario SENZA ingredienti né costi (versione dipendente) ───────
-- Mantiene nome/prezzo/unita/tipo/categoria/allergeni/congelabile/formati ecc.,
-- rimuove SOLO 'ingredienti' (composizione) da ogni ricetta e 'ingredienti_costi'.
-- language sql a singola espressione (robusta con qualsiasi SQL editor).
create or replace function public.fos_ricettario_dip()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select (v.dv - 'ingredienti_costi') || jsonb_build_object(
    'ricette',
    coalesce(
      (select jsonb_object_agg(e.key, e.value - 'ingredienti' - 'ingredienti_semilavorati')
       from jsonb_each(coalesce(v.dv->'ricette', '{}'::jsonb)) as e),
      '{}'::jsonb
    )
  )
  from (
    select data_value as dv
    from public.user_data
    where organization_id = public.get_user_org_id()
      and data_key = 'pasticceria-ricettario-v1'
      and sede_id is null
    order by updated_at desc
    limit 1
  ) v
$$;
grant execute on function public.fos_ricettario_dip() to authenticated;

-- ── 3) RPC: giornaliero per-sede SENZA ingredientiUsati né fcTot (dipendente) ─
-- Mantiene prodotti/data/ricavoTot/note/vendibile (servono a Cassa/Calendario),
-- rimuove la composizione (ingredientiUsati) e il food cost (fcTot).
create or replace function public.fos_giornaliero_dip(p_sede uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select jsonb_agg(elem - 'ingredientiUsati' - 'fcTot')
     from jsonb_array_elements(v.dv) as elem),
    '[]'::jsonb
  )
  from (
    select data_value as dv
    from public.user_data
    where organization_id = public.get_user_org_id()
      and data_key = 'pasticceria-giornaliero-v1'
      and (sede_id = p_sede or (p_sede is null and sede_id is null))
    order by updated_at desc
    limit 1
  ) v
  where jsonb_typeof(v.dv) = 'array'
$$;
grant execute on function public.fos_giornaliero_dip(uuid) to authenticated;
