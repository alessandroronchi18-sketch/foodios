-- Storico inventario: indice ottimizzato + RPC di aggregazione mensile.
--
-- Contesto: i fetch massivi di public.inventario_produzione (VistaStorico,
-- StoricoProduzioneView, PLView) filtrano SEMPRE per organization_id e
-- spesso per sede_id + data. Con >100k righe/org gli indici esistenti
-- (sede_id,data desc) e (org,gusto,data desc) obbligano il planner a
-- scegliere; un indice composto sui 3 campi effettivi rende la scelta
-- deterministica e velocizza le range scan.
--
-- Idempotente.

create index if not exists idx_inv_prod_org_sede_data
  on public.inventario_produzione (organization_id, sede_id, data desc);


-- RPC: storico_inventario_per_mese
--
-- Aggregazione lato DB del venduto differenziale mensile per gusto,
-- opzionalmente su un subset di sedi. Il client evita di scaricare
-- decine di migliaia di righe grezze per aggregarle in JS.
--
-- Regola venduto: max(0, riman_prev + prod - riman - scarto), con
-- riman_prev = rimanenza del giorno precedente SE contiguo (gap=1gg),
-- altrimenti 0 (discontinuita' resetta l'accumulo).
--
-- L'aggregazione cross-sede somma prod/riman/scarto per (gusto,data)
-- PRIMA del calcolo differenziale: RIMAN(N-1)+PROD(N)-RIMAN(N) sommato
-- per sede e' uguale a (sum RIMAN_prev)+(sum PROD)-(sum RIMAN). Se
-- p_sede_ids e' NULL, aggrega su TUTTE le sedi produttive dell'org.
--
-- Ritorna: { gusto_nome, mese ('YYYY-MM'), prod_g, venduto_g, scarto_g }
-- La RLS di public.inventario_produzione si applica automaticamente
-- (SECURITY INVOKER): il caller anon con JWT vede solo la propria org.
create or replace function public.storico_inventario_per_mese(
  p_org_id     uuid,
  p_sede_ids   uuid[],
  p_data_from  date,
  p_data_to    date
)
returns table (
  gusto_nome  text,
  mese        text,
  prod_g      numeric,
  venduto_g   numeric,
  scarto_g    numeric
)
language sql
stable
security invoker
as $$
  with righe as (
    select
      ip.gusto_nome,
      ip.data,
      sum(coalesce(ip.produzione_g, 0))::numeric as produzione_g,
      sum(coalesce(ip.rimanenza_g, 0))::numeric as rimanenza_g,
      sum(coalesce(ip.scarto_g, 0))::numeric as scarto_g
    from public.inventario_produzione ip
    where ip.organization_id = p_org_id
      and (p_sede_ids is null or ip.sede_id = any(p_sede_ids))
      and ip.data >= p_data_from
      and ip.data <= p_data_to
    group by ip.gusto_nome, ip.data
  ),
  con_lag as (
    select
      r.gusto_nome, r.data,
      r.produzione_g, r.rimanenza_g, r.scarto_g,
      lag(r.rimanenza_g) over (partition by r.gusto_nome order by r.data) as riman_prev,
      lag(r.data)        over (partition by r.gusto_nome order by r.data) as data_prev
    from righe r
  ),
  con_venduto as (
    select
      cl.gusto_nome, cl.data,
      cl.produzione_g, cl.scarto_g,
      greatest(
        0,
        case
          when cl.data_prev is null or (cl.data - cl.data_prev) > 1 then 0
          else coalesce(cl.riman_prev, 0)
        end
        + cl.produzione_g - cl.rimanenza_g - cl.scarto_g
      ) as venduto_g
    from con_lag cl
  )
  select
    cv.gusto_nome,
    to_char(cv.data, 'YYYY-MM') as mese,
    sum(cv.produzione_g)::numeric as prod_g,
    sum(cv.venduto_g)::numeric   as venduto_g,
    sum(cv.scarto_g)::numeric    as scarto_g
  from con_venduto cv
  group by cv.gusto_nome, to_char(cv.data, 'YYYY-MM')
  order by cv.gusto_nome, mese;
$$;

-- Autorizzo la chiamata a client anon (RLS della tabella filtra comunque).
grant execute on function public.storico_inventario_per_mese(uuid, uuid[], date, date) to anon, authenticated;
