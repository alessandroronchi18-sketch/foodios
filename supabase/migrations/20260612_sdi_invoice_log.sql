-- 20260612 — SDI invoice log per idempotenza emissione fatture
-- =======================================================================
-- Quando Stripe invia `invoice.payment_succeeded`, l'endpoint
-- /api/sdi-emit-invoice chiama Fatture in Cloud per emettere la fattura
-- elettronica. Se Stripe ritenta il webhook (5xx/timeout/disconnessione)
-- non vogliamo duplicare la fattura SDI.
--
-- Soluzione: tabella di log con UNIQUE (organization_id, stripe_invoice_id).
-- Prima di emettere, controlla se esiste gia' una riga → no-op idempotente.
-- =======================================================================

create table if not exists public.sdi_invoice_log (
  id                      uuid default gen_random_uuid() primary key,
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  stripe_invoice_id       text,
  fic_invoice_id          text not null,  -- id Fatture in Cloud
  fic_cliente_id          text,
  importo_netto_cents     int,
  status                  text not null default 'emessa'
                          check (status in ('emessa','trasmessa_sdi','accettata_sdi','scartata_sdi','annullata')),
  sdi_id_trasmissione     text,
  sdi_messaggio_errore    text,
  emessa_da               text,           -- 'webhook' | email admin
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- Idempotency: una sola fattura per (org, stripe_invoice). NULL stripe_invoice
-- gestito da partial index (manual emit).
create unique index if not exists idx_sdi_log_unique_stripe
  on public.sdi_invoice_log(organization_id, stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists idx_sdi_log_org
  on public.sdi_invoice_log(organization_id, created_at desc);

create index if not exists idx_sdi_log_status
  on public.sdi_invoice_log(status, created_at desc)
  where status <> 'emessa';

-- RLS: service_role only (admin via /api/admin legge, webhook scrive)
alter table public.sdi_invoice_log enable row level security;
revoke all on public.sdi_invoice_log from anon, authenticated;
grant all on public.sdi_invoice_log to service_role;
