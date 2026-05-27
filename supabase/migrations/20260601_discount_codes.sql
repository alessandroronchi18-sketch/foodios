-- Codici sconto FoodOS — gestiti SOLO dall'admin, applicabili al checkout Stripe.
-- Ogni record qui è specchio di un Coupon Stripe + Promotion Code: la fonte di
-- verità per la validità rimane Stripe (l'admin può comunque disattivare qui).
-- Permette di scontare o regalare abbonamenti (sconto 100% per N mesi/forever).

CREATE TABLE IF NOT EXISTS discount_codes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice                TEXT NOT NULL UNIQUE,                 -- es. FOODIOS2026
  descrizione           TEXT,                                 -- nota interna admin
  stripe_coupon_id      TEXT,                                 -- coup_xxx
  stripe_promo_code_id  TEXT,                                 -- promo_xxx
  -- Tipo di sconto: percentuale (1-100) o ammontare fisso in EUR centesimi
  tipo_sconto           TEXT NOT NULL CHECK (tipo_sconto IN ('percent', 'amount')),
  valore_sconto         INTEGER NOT NULL CHECK (valore_sconto > 0),
  -- Durata: 'once' (1 fattura) | 'repeating' (N mesi) | 'forever' (sempre)
  durata                TEXT NOT NULL CHECK (durata IN ('once', 'repeating', 'forever')),
  durata_mesi           INTEGER,                              -- valido solo per repeating
  -- Limiti
  max_redemptions       INTEGER,                              -- NULL = illimitato
  redemptions           INTEGER NOT NULL DEFAULT 0,
  scade_il              TIMESTAMPTZ,                          -- NULL = non scade
  -- Restrizioni piano (NULL = applicabile a tutti)
  piani_validi          TEXT[],                               -- es. ['chain'] o NULL
  -- Stato
  attivo                BOOLEAN NOT NULL DEFAULT true,
  -- Meta
  creato_da             TEXT,                                 -- email admin
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT now(),
  disattivato_il        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_codice ON discount_codes(codice);
CREATE INDEX IF NOT EXISTS idx_discount_codes_attivo ON discount_codes(attivo) WHERE attivo = true;

-- RLS: i codici sono accessibili solo a service_role (admin endpoint).
-- Nessun cliente ha read/write su questa tabella.
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discount_codes_no_access" ON discount_codes;
CREATE POLICY "discount_codes_no_access"
  ON discount_codes
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Log redemption: chi ha usato quale codice, quando, su quale subscription.
-- Utile per audit e per dare ricompense ai referral (vedi referral.sql).
CREATE TABLE IF NOT EXISTS discount_redemptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id         UUID REFERENCES discount_codes(id) ON DELETE SET NULL,
  codice                   TEXT NOT NULL,
  organization_id          UUID,
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  stripe_invoice_id        TEXT,
  ammontare_scontato_cents INTEGER,
  utilizzato_il            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discount_redemptions_codice ON discount_redemptions(codice);
CREATE INDEX IF NOT EXISTS idx_discount_redemptions_org ON discount_redemptions(organization_id);

ALTER TABLE discount_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "discount_redemptions_no_access" ON discount_redemptions;
CREATE POLICY "discount_redemptions_no_access"
  ON discount_redemptions
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Funzione atomica per incrementare il counter di redemptions di un codice.
CREATE OR REPLACE FUNCTION increment_discount_redemption(p_id UUID)
RETURNS void AS $$
  UPDATE discount_codes
     SET redemptions = COALESCE(redemptions, 0) + 1
   WHERE id = p_id;
$$ LANGUAGE sql SECURITY DEFINER;
REVOKE ALL ON FUNCTION increment_discount_redemption(UUID) FROM public;
GRANT EXECUTE ON FUNCTION increment_discount_redemption(UUID) TO service_role;
