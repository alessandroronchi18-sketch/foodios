-- 20260617 — SDI idempotency unificata e race-free (claim-first).
-- =======================================================================
-- Il check-then-emit precedente aveva due buchi:
--   1. manual emit (senza stripe_invoice_id) non era coperto dal partial index
--      → doppia fattura su doppio re-emit admin;
--   2. TOCTOU race: due retry concorrenti del webhook passavano entrambi il
--      check ed emettevano due fatture.
-- Soluzione: una idempotency_key UNICA per ogni emissione + pattern claim-first
--   (INSERT pending PRIMA di emettere; chi vince il claim emette, gli altri
--   trovano la riga e fanno no-op). Chiavi:
--     stripe:<invoice_id>             emissioni da webhook
--     manual:<org>:<cents>:<YYYY-MM>  re-emit manuali admin (dedup nel mese)
-- =======================================================================

do $migr$
begin
  -- fic_invoice_id nullable: la riga "pending" del claim non ha ancora l id FiC.
  alter table public.sdi_invoice_log alter column fic_invoice_id drop not null;
end
$migr$;

-- status: aggiunge 'pending' (claim in corso) e 'errore' (emissione fallita).
alter table public.sdi_invoice_log
  drop constraint if exists sdi_invoice_log_status_check;
alter table public.sdi_invoice_log
  add constraint sdi_invoice_log_status_check
  check (status in ('pending','emessa','trasmessa_sdi','accettata_sdi',
                    'scartata_sdi','annullata','errore'));

alter table public.sdi_invoice_log add column if not exists idempotency_key text;

-- Backfill deterministico delle righe esistenti (per i NULL stripe usa l id riga
-- per non collidere, dato che non avevano una chiave naturale).
update public.sdi_invoice_log
  set idempotency_key = case
    when stripe_invoice_id is not null then 'stripe:' || stripe_invoice_id
    else 'manual:' || organization_id::text || ':' ||
         coalesce(importo_netto_cents::text, '0') || ':' || id::text
  end
  where idempotency_key is null;

create unique index if not exists idx_sdi_log_idem
  on public.sdi_invoice_log(idempotency_key);

-- Vecchio partial index ridondante (idempotency_key copre lo stripe id) e che
-- interferirebbe con l upsert onConflict(idempotency_key): rimosso.
drop index if exists public.idx_sdi_log_unique_stripe;
