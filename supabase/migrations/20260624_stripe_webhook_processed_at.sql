-- Stripe webhook idempotency: claim-then-confirm, non claim-first.
--
-- BUG fissato:
-- L'handler precedente inseriva (event_id, type) PRIMA di eseguire le
-- side-effects. Se l'handler poi lanciava (Supabase 503 transient, Resend
-- timeout, Fatture-in-Cloud fetch fail, ecc.) il catch ritornava 500 →
-- Stripe ritentava la consegna. Al retry, l'insert idempotency trovava
-- duplicato → 200 {duplicate:true}, saltando per sempre tutte le
-- side-effects (organizations.piano/approvato non aggiornati, email
-- mai inviata, fattura SDI mai emessa, redemption codici non incrementata).
--
-- Nuova logica: aggiungiamo `processed_at` (NULL = "claim in corso, mai
-- completato"). Una row marcata duplicata SOLO se processed_at IS NOT NULL.
-- Su crash l'event resta claimed-NULL e il prossimo retry e' libero di
-- riprocessarlo.

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL;

-- Backfill: gli eventi pre-migration sono "fatti" (lo stato in prod riflette
-- gia' quegli handler), quindi li marchiamo processed_at = received_at per
-- non ritrattarli.
UPDATE public.stripe_webhook_events
   SET processed_at = received_at
 WHERE processed_at IS NULL;

-- Index utile al query path "trova claim incompleti più vecchi di X" usato
-- da future operazioni di pulizia o monitoring.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_pending
  ON public.stripe_webhook_events (received_at)
  WHERE processed_at IS NULL;
