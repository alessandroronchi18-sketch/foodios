-- Prezzi dei piani gestiti dall'admin (fonte di verita per display + checkout).
-- Stripe ha prezzi immutabili: per cambiare l'importo realmente addebitato si
-- crea un nuovo Price su Stripe e si incolla qui lo stripe_price_id. Il campo
-- prezzo_mese_cents guida invece i prezzi mostrati (landing, pannello abbonamento).
CREATE TABLE IF NOT EXISTS plan_pricing (
  plan               TEXT PRIMARY KEY CHECK (plan IN ('pro', 'chain')),
  prezzo_mese_cents  INTEGER NOT NULL CHECK (prezzo_mese_cents >= 0),
  valuta             TEXT NOT NULL DEFAULT 'eur',
  stripe_price_id    TEXT,
  label              TEXT,
  aggiornato_da      TEXT,
  aggiornato_il      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed con i prezzi correnti (89 / 149 EUR al mese).
INSERT INTO plan_pricing (plan, prezzo_mese_cents, label) VALUES
  ('pro',   8900,  'Pro'),
  ('chain', 14900, 'Chain')
ON CONFLICT (plan) DO NOTHING;

-- RLS: lettura pubblica (i prezzi non sono segreti e servono alla landing);
-- scrittura solo via service_role (admin endpoint, che bypassa RLS).
ALTER TABLE plan_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_pricing_read" ON plan_pricing;
CREATE POLICY "plan_pricing_read" ON plan_pricing FOR SELECT USING (true);

-- Log delle variazioni di prezzo (audit).
CREATE TABLE IF NOT EXISTS plan_pricing_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan               TEXT NOT NULL,
  prezzo_vecchio     INTEGER,
  prezzo_nuovo       INTEGER,
  stripe_price_id    TEXT,
  aggiornato_da      TEXT,
  creato_il          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE plan_pricing_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_pricing_log_no_access" ON plan_pricing_log;
CREATE POLICY "plan_pricing_log_no_access" ON plan_pricing_log FOR ALL USING (false) WITH CHECK (false);
