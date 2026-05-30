-- 20260611 — Integrazioni: cifratura at-rest delle credenziali
-- =======================================================================
-- Le API key di terze parti (Zucchetti, Cassa in Cloud, SumUp, Deliveroo,
-- Glovo, JustEat) erano salvate in plaintext in `integrazioni.config` jsonb.
-- RLS protegge da cross-org ma un breach DB esporrebbe tutto.
--
-- Soluzione: nuove colonne `config_encrypted` + `config_iv` + `config_tag`
-- per AES-256-GCM lato edge function. La vecchia colonna `config` resta
-- per backward compat durante la migrazione; sara' rimossa quando tutti
-- i record sono migrati (vedi `api/admin?action=migrate_integrazioni`).
--
-- Chiave: env INTEGRATIONS_ENCRYPTION_KEY (32 byte base64) — NON committata.
-- Rotazione: vedi runbook in CLAUDE.md.
-- =======================================================================

alter table public.integrazioni
  add column if not exists config_encrypted text,  -- base64(ciphertext)
  add column if not exists config_iv text,         -- base64(IV 12 byte)
  add column if not exists config_tag text,        -- base64(GCM auth tag 16 byte)
  add column if not exists encryption_version smallint default 0;
  -- encryption_version:
  --   0 = legacy (solo config jsonb, plaintext)
  --   1 = AES-256-GCM via Web Crypto API, key da env INTEGRATIONS_ENCRYPTION_KEY

-- Indice solo se servisse query: per ora no, decifratura sempre row-by-row.

-- NOTA: le righe esistenti hanno encryption_version=0. La migrazione dei dati
-- avviene via codice: ogni write nuova usa version=1, ogni read legge entrambe.
