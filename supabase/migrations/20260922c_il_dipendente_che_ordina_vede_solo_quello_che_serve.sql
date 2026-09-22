-- ════════════════════════════════════════════════════════════════════════════
-- Il dipendente che puo' ordinare deve vedere i fornitori. Solo per ordinare.
--
-- Difetto trovato dall'audit del 22/09/2026, subito dopo aver applicato
-- 20260922b (il permesso `puo_ordinare`).
--
-- Quella migration apre UNA porta sola: `ordini_fornitori` e `righe_ordine`.
-- `fornitori` e `fatture` restano murate per ogni dipendente
-- (20260607_dipendente_no_lettura_sensibili.sql) — ed e' giusto: dentro
-- `fornitori` ci sono IBAN, condizioni di pagamento e categorie, e dentro
-- `fatture` ci sono gli importi. Un permesso di ordinare non e' un varco
-- sulla contabilita'.
--
-- Ma la pagina Ordini ha bisogno di due cose che stanno li' dentro:
--   1. di ogni fornitore: id, nome, email, WhatsApp, telefono, giorni di
--      consegna e minimo d'ordine — cioe' a chi si scrive e quanto serve
--      ordinare perche' il viaggio convenga;
--   2. delle fatture: SOLO le date, per imparare ogni quanto quel fornitore
--      consegna davvero. Nessun importo.
--
-- Senza, per un dipendente abilitato le due query tornano array vuoti (la RLS
-- filtra le righe, non da' errore) e la pagina si rompe in silenzio: niente
-- email, niente cadenza vera, niente avviso sul minimo. E soprattutto ogni
-- ordine che registra finisce con `fornitore_id` NULL, cioe' scollegato per
-- sempre dal fornitore che pure esiste in anagrafica.
--
-- Qui si danno quei campi e basta, con due funzioni che li elencano a mano:
-- un domani che si aggiunge una colonna sensibile a `fornitori`, quella
-- colonna NON entra da sola in queste viste.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) I fornitori a cui si puo' ordinare ───────────────────────────────────
--
-- Fuori di proposito: iban, termini_pagamento, termini_tipo, categoria, note,
-- partita_iva, codice_fiscale, sede_id. Sono l'anagrafica amministrativa, e
-- non serve niente di tutto questo per mandare un ordine.
drop function if exists public.fos_fornitori_per_ordine();

create function public.fos_fornitori_per_ordine()
returns table (
  id uuid,
  nome text,
  email text,
  whatsapp text,
  telefono text,
  lead_time_giorni integer,
  minimo_ordine numeric
)
language sql security definer stable
set search_path = public, pg_temp
as $$
  select f.id, f.nome, f.email, f.whatsapp, f.telefono,
         f.lead_time_giorni, f.minimo_ordine
  from public.fornitori f
  where f.organization_id = public.get_user_org_id()
    and coalesce(f.attivo, true)
    -- La stessa regola degli ordini: il titolare sempre, il dipendente solo
    -- se il titolare gliel'ha acceso.
    and (not public.is_dipendente() or public.puo_ordinare())
  order by f.nome;
$$;

revoke all on function public.fos_fornitori_per_ordine() from public, anon;
grant execute on function public.fos_fornitori_per_ordine() to authenticated;

-- ── 2) Ogni quanto passa davvero ogni fornitore ─────────────────────────────
--
-- Solo il nome e la data. Nessun importo, nessun numero di documento: da qui
-- si impara la cadenza delle consegne, che e' quello che decide quanta scorta
-- serve, e nient'altro.
drop function if exists public.fos_consegne_fornitori(integer);

create function public.fos_consegne_fornitori(giorni integer default 400)
returns table (
  fornitore text,
  data_fattura date
)
language sql security definer stable
set search_path = public, pg_temp
as $$
  select f.fornitore, f.data_fattura
  from public.fatture f
  where f.organization_id = public.get_user_org_id()
    and f.data_fattura >= (current_date - greatest(coalesce(giorni, 400), 1))
    and (not public.is_dipendente() or public.puo_ordinare())
  order by f.data_fattura;
$$;

revoke all on function public.fos_consegne_fornitori(integer) from public, anon;
grant execute on function public.fos_consegne_fornitori(integer) to authenticated;
