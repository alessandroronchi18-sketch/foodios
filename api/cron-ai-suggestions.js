export const config = { runtime: 'edge' }

// Cron AI Proactive Suggestions
//
// Eseguito ogni mattina alle 07:00 UTC (riusa cron-giornaliero).
// Per ogni organization attiva analizza i dati con regole hard-coded e produce
// suggerimenti azionabili. Persistente su ai_suggestions con dedup_key:
// niente duplicati attivi sullo stesso soggetto entro 7 giorni.
//
// L'utente vede i suggerimenti in una "campanella" persistente in topbar.
// Ogni suggerimento ha CTA verso la view rilevante (magazzino, scadenzario...).
//
// Idempotente: dedup via unique index parziale (vedi migration 20260612).

import { verifyBearerSecret } from './lib/cryptoCompare.js'
import { safeError } from './lib/safeError.js'
import { collectOrgSnapshot, ruleBasedSuggestions } from './lib/aiEngine.js'

const MAX_ORG_PER_RUN = 30

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

export default async function handler(req) {
  const auth = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!auth.ok) return new Response('Unauthorized', { status: 401 })

  const supabase = await getSupabase()
  const nowIso = new Date().toISOString()

  // Step 1: scadenza automatica suggerimenti vecchi.
  await supabase.from('ai_suggestions')
    .update({ stato: 'scaduto' })
    .lt('expires_at', nowIso)
    .in('stato', ['nuovo', 'letto'])

  // Step 2: organizzazioni candidate (semplice round-robin).
  const { data: orgs, error: errOrgs } = await supabase
    .from('organizations')
    .select('id, nome, nome_attivita')
    .order('created_at', { ascending: true })
    .limit(MAX_ORG_PER_RUN)
  if (errOrgs) {
    const safe = safeError(errOrgs, { endpoint: 'cron-ai-suggestions', step: 'list_orgs' })
    return new Response(JSON.stringify(safe.body), { status: safe.status })
  }

  const stats = { processed: 0, inserted: 0, skipped: 0, errors: 0 }
  const details = []

  for (const org of (orgs || [])) {
    stats.processed++
    try {
      // Opt-in/opt-out via user_data.
      const { data: settingsRow } = await supabase
        .from('user_data')
        .select('data_value')
        .eq('organization_id', org.id)
        .eq('data_key', 'ai-suggestions-settings-v1')
        .is('sede_id', null)
        .maybeSingle()
      const settings = settingsRow?.data_value || {}
      if (settings.optOut === true) { stats.skipped++; details.push({ orgId: org.id, skipped: 'opt-out' }); continue }

      // Snapshot org-wide.
      const snap = await collectOrgSnapshot({ supabase, orgId: org.id, sedeId: null })
      const sugg = ruleBasedSuggestions(snap, { orgId: org.id, sedeId: null })

      let insertedCount = 0
      for (const s of sugg) {
        const { error: errIns } = await supabase
          .from('ai_suggestions')
          .insert({
            organization_id: s.organization_id,
            sede_id: s.sede_id,
            tipo: s.tipo,
            severita: s.severita,
            titolo: s.titolo,
            descrizione: s.descrizione,
            payload: s.payload || {},
            cta_view: s.cta_view || null,
            cta_label: s.cta_label || null,
            dedup_key: s.dedup_key,
            expires_at: s.expires_at || null,
          })
        if (errIns) {
          // 23505 = duplicato attivo sulla dedup_key, atteso/voluto.
          if (errIns.code !== '23505') {
            stats.errors++
            details.push({ orgId: org.id, error: errIns.message?.slice(0, 100) })
          }
          continue
        }
        insertedCount++
      }
      stats.inserted += insertedCount
      details.push({ orgId: org.id, generated: sugg.length, inserted: insertedCount })
    } catch (e) {
      stats.errors++
      details.push({ orgId: org.id, error: e.message || String(e) })
    }
  }

  return new Response(JSON.stringify({ ok: true, ...stats, details }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
