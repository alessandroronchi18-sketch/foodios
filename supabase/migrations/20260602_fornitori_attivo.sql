-- Archiviazione fornitori: aggiunge la colonna `attivo` (soft-delete).
-- I fornitori non piu usati si archiviano (attivo=false) invece di eliminarli,
-- cosi gli ordini storici collegati restano integri. Riattivabili con un click.
ALTER TABLE fornitori ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT true;

-- Indice parziale per filtrare velocemente i fornitori attivi per organizzazione.
CREATE INDEX IF NOT EXISTS idx_fornitori_attivo
  ON fornitori(organization_id) WHERE attivo = true;
