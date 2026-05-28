-- Idempotenza webhook Stripe.
-- Stripe ritenta la consegna di un webhook su qualsiasi risposta non-2xx o
-- timeout. Senza deduplica, ogni ritentativo rieseguiva l'handler:
-- `invoice.payment_succeeded` reinseriva la redemption del codice sconto e
-- reincrementava il contatore `discount_codes.redemptions`, falsando
-- l'enforcement di `max_redemptions` e i report.
--
-- Questa tabella registra gli event.id già elaborati. L'handler tenta un INSERT
-- all'inizio: se fallisce per PK duplicata, l'evento è già stato gestito.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    text PRIMARY KEY,
  type        text,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Accessibile solo dal service_role (che bypassa RLS). Nessuna policy = nessun
-- accesso per anon/authenticated.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Retention: gli eventi più vecchi di 90 giorni non servono più alla deduplica
-- (Stripe ritenta al massimo per ~3 giorni). Pulizia opzionale via cron.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received
  ON public.stripe_webhook_events (received_at);
