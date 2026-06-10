-- Indici mancanti su query path frequenti (audit performance giu 2026).
--
-- notifiche: useNotifiche fa .eq(organization_id).order(created_at desc).limit(50)
--   ad ogni mount Dashboard + realtime subscription. Senza index dedicato si fa
--   full scan + sort della tabella per ogni org → degrada man mano che cresce.
--
-- vendite_b2b: tabella che cresce 1 riga/vendita-B2B con query frequenti per
--   sede (lista vendite della sede, KPI sede). Solo idx_vendite_b2b_org esisteva.

CREATE INDEX IF NOT EXISTS idx_notifiche_org_created
  ON public.notifiche(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendite_b2b_org_sede_data
  ON public.vendite_b2b(organization_id, sede_id, data DESC)
  WHERE sede_id IS NOT NULL;
