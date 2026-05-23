-- ══════════════════════════════════════════════════════════════════════════════
-- FoodOS — Security audit + hardening
-- Esegui sezione 1 PRIMA per diagnosi. Esegui sezione 2 SOLO se ti viene segnalato
-- qualcosa di mancante. Tutto è idempotente, può essere rilanciato senza problemi.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── SEZIONE 1: DIAGNOSI ────────────────────────────────────────────────────────

-- 1.1 RLS attiva su tutte le tabelle sensibili?
SELECT n.nspname AS schema,
       c.relname AS tabella,
       c.relrowsecurity AS rls_attiva,
       c.relforcerowsecurity AS rls_forzata
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('organizations','sedi','profiles','user_data','fatture',
                    'stock_prodotti_finiti','trasferimenti','audit_log',
                    'notifiche','rate_limits','sync_log','benchmarks_anonimi',
                    'ai_insights')
ORDER BY c.relname;
-- Atteso: rls_attiva = true per TUTTE. Se false su user_data → emergenza.

-- 1.2 Policy esistenti su user_data
SELECT policyname, cmd, qual::text AS using_clause, with_check::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_data';
-- Atteso: almeno una policy che filtra organization_id via profiles WHERE id = auth.uid().

-- 1.3 Verifica integrità: ogni profilo deve avere una org esistente
SELECT p.id, p.email, p.organization_id, o.id IS NULL AS org_orfana
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.organization_id
WHERE o.id IS NULL;
-- Atteso: 0 righe. Se ci sono profili orfani, vanno riassegnati a una org valida.

-- 1.4 Verifica: nessuna riga in user_data con organization_id NULL o appartenente
--      a un'organization disattivata/cancellata
SELECT ud.id, ud.organization_id, ud.data_key, o.id IS NULL AS org_inesistente,
       o.attivo
FROM public.user_data ud
LEFT JOIN public.organizations o ON o.id = ud.organization_id
WHERE o.id IS NULL OR o.attivo = false;
-- Atteso: 0 righe (la FK con ON DELETE CASCADE dovrebbe già garantirlo).

-- 1.5 Numero ricettari per org — utile per individuare duplicati legacy o anomalie
SELECT organization_id, COUNT(*) AS n_righe_ricettario
FROM public.user_data
WHERE data_key = 'pasticceria-ricettario-v1'
GROUP BY organization_id
HAVING COUNT(*) > 1;
-- Atteso: 0 righe. Se ce ne sono, c'è un duplicato legacy (sede_id NULL trattato
--   come distinto dall'unique). Vedi sezione 2.5 per la pulizia.

-- 1.6 Verifica policy per audit_log (dovrebbe essere insert-only dal client, read solo admin)
SELECT policyname, cmd, qual::text AS using_clause
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log';

-- ── SEZIONE 2: HARDENING ──────────────────────────────────────────────────────
-- Esegui solo le sotto-sezioni dove la diagnosi sopra ha segnalato anomalie.

-- 2.1 Force RLS anche per gli owner ruolo (impedisce a un BYPASSRLS accidentale
--     di leggere dati cross-tenant — protezione difensiva extra)
ALTER TABLE public.user_data FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sedi FORCE ROW LEVEL SECURITY;

-- 2.2 Audit log: se non esiste, lo crei. Inserimento aperto a authenticated,
--     lettura solo a chi appartiene alla propria org.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      text,
  table_name      text,
  operation       text NOT NULL,                -- es. 'ricettario_export', 'ricettario_view'
  row_id          uuid,
  user_agent      text,
  client_ip       text,
  old_data        jsonb,
  new_data        jsonb,
  changed_by      uuid,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON public.audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_op         ON public.audit_log (operation);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_insert_own"  ON public.audit_log;
DROP POLICY IF EXISTS "audit_read_own"    ON public.audit_log;

CREATE POLICY "audit_insert_own" ON public.audit_log
  FOR INSERT
  WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "audit_read_own" ON public.audit_log
  FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- 2.3 Funzione + trigger: log automatico su INSERT/UPDATE/DELETE del ricettario.
CREATE OR REPLACE FUNCTION public.log_ricettario_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op text;
  v_org uuid;
  v_uid uuid;
  v_email text;
BEGIN
  v_op := lower(TG_OP);
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  v_uid := auth.uid();
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Solo per chiave ricettario (riduce rumore)
  IF (NEW IS NOT NULL AND NEW.data_key <> 'pasticceria-ricettario-v1')
     AND (OLD IS NULL OR OLD.data_key <> 'pasticceria-ricettario-v1')
  THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_log (organization_id, user_id, user_email, table_name, operation, row_id, new_data, changed_by, created_at)
  VALUES (
    v_org, v_uid, v_email, 'user_data', 'ricettario_' || v_op, COALESCE(NEW.id, OLD.id),
    jsonb_build_object(
      'data_key', COALESCE(NEW.data_key, OLD.data_key),
      'sede_id',  COALESCE(NEW.sede_id, OLD.sede_id),
      'n_ricette', CASE WHEN NEW.data_value ? 'ricette'
                        THEN jsonb_array_length(jsonb_path_query_array(NEW.data_value, '$.ricette.keyvalue().key'))
                        ELSE NULL END
    ),
    v_uid, now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_user_data_ricettario_audit ON public.user_data;
CREATE TRIGGER trg_user_data_ricettario_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_data
FOR EACH ROW EXECUTE FUNCTION public.log_ricettario_change();

-- 2.4 Permessi minimi sulla colonna data_value (no SELECT diretta alle anon)
REVOKE ALL ON public.user_data FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_data TO authenticated;

-- 2.5 Pulizia eventuali duplicati legacy del ricettario (vedi diagnosi 1.5)
--     COMMENTATO per sicurezza: scommenta solo dopo aver verificato.
-- WITH ranked AS (
--   SELECT id, organization_id, updated_at,
--          row_number() OVER (PARTITION BY organization_id ORDER BY updated_at DESC) AS rn
--   FROM public.user_data
--   WHERE data_key = 'pasticceria-ricettario-v1'
-- )
-- DELETE FROM public.user_data WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2.6 Test cross-tenant (eseguire come utente anonimo per verificare RLS)
--     Non puoi eseguirlo direttamente dal SQL editor (che usa il ruolo postgres
--     senza RLS forzato). Per testarlo davvero, usa una chiamata dall'app con
--     l'access_token di un utente di un'altra org, e verifica che NON veda nulla.

-- ══════════════════════════════════════════════════════════════════════════════
-- FINE
-- ══════════════════════════════════════════════════════════════════════════════
