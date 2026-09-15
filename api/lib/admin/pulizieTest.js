// La pulizia degli account lasciati indietro dai test automatici.
//
// Scorporato da api/admin.js il 15/09/2026. Sul database di produzione ce ne
// sono 1.602: più di quattro volte i clienti veri (375). Sono la ragione per
// cui l'elenco utenti del pannello si fermava a mille e nove clienti veri
// risultavano "Mai loggato" senza esserlo.

import { TABELLE_ELIMINA_ORG } from './eliminaCliente.js'

// ─── Cleanup E2E: rimuove account creati dai test Playwright ──────────────
// Pattern email RESTRITTIVI per matchare SOLO i test, mai utenti reali.
// Audit 2026-06-14 PM: il pattern `e2e+%` matchava alias Gmail di utenti
// reali (es. e2e+team@gmail.com). Restretto al dominio dedicato test.
//
// IMPORTANTE: il dominio @foodos-e2e.test è un dominio NON registrabile
// (TLD .test riservato per testing, RFC 2606). Nessun utente reale può
// averla. Sicuro al 100%.
const E2E_EMAIL_PATTERNS = ['%@foodos-e2e.test']

async function findE2EOrgs(supabase) {
  // Pesca tutti i profili con email matchante pattern E2E, poi resolve org_id.
  // Ritorna anche le email per permettere UI preview lista completa.
  const allProfiles = []
  for (const pattern of E2E_EMAIL_PATTERNS) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, organization_id')
        .ilike('email', pattern)
      if (data) allProfiles.push(...data)
    } catch { /* skip */ }
  }
  // Dedup per org_id (un'org può avere più profili)
  const byOrg = new Map()
  for (const p of allProfiles) {
    if (!p.organization_id) continue
    if (!byOrg.has(p.organization_id)) byOrg.set(p.organization_id, [])
    byOrg.get(p.organization_id).push(p.email)
  }
  return Array.from(byOrg.entries()).map(([orgId, emails]) => ({ orgId, emails }))
}

export async function azCleanupE2EPreview(supabase) {
  const orgs = await findE2EOrgs(supabase)
  return {
    orgs_count: orgs.length,
    orgs: orgs.slice(0, 50),  // primi 50 con email per UI preview
    truncated: orgs.length > 50,
    patterns: E2E_EMAIL_PATTERNS,
  }
}

export async function azCleanupE2E(supabase, conferma, expectedCount = null) {
  if (conferma !== 'CLEANUP_E2E') {
    throw new Error('Conferma mancante (stringa CLEANUP_E2E)')
  }
  const orgs = await findE2EOrgs(supabase)
  // Audit 2026-07-01 HIGH: expectedCount check come in azElimina — protegge
  // da cleanup massivo se nel frattempo un test ha creato 500 org per errore.
  if (expectedCount != null && Number(expectedCount) !== orgs.length) {
    throw new Error(
      `Stato cambiato dal preview: ${orgs.length} org E2E vs ${expectedCount} attesi. Riapri il preview.`
    )
  }
  // Cap di sicurezza: se più di 200 org E2E sono identificate in una run,
  // probabilmente il pattern e' troppo largo (incident).
  if (orgs.length > 200) {
    throw new Error(`Trovati ${orgs.length} org E2E in una run — limite di sicurezza 200. Verifica i pattern.`)
  }
  const results = { eliminate: 0, falliti: 0, errori: [] }
  for (const { orgId } of orgs) {
    try {
      // Riusa la stessa logica di azElimina via RPC atomica.
      const { error: rpcErr } = await supabase.rpc('admin_org_cascade_delete', { p_org_id: orgId })
      if (rpcErr) {
        // Fallback al loop sequenziale se RPC non c'e' (DB pre-20260630).
        for (const t of TABELLE_ELIMINA_ORG) {
          try { await supabase.from(t).delete().eq('organization_id', orgId) } catch {}
        }
        const { data: profiles } = await supabase
          .from('profiles').select('id').eq('organization_id', orgId)
        await supabase.from('profiles').delete().eq('organization_id', orgId)
        await supabase.from('organizations').delete().eq('id', orgId)
        for (const p of profiles || []) {
          try { await supabase.auth.admin.deleteUser(p.id) } catch {}
        }
      } else {
        // Cleanup utenti auth dopo la cascade (la RPC non tocca auth.users).
        const { data: profiles } = await supabase
          .from('profiles').select('id').eq('organization_id', orgId)
        for (const p of profiles || []) {
          try { await supabase.auth.admin.deleteUser(p.id) } catch {}
        }
      }
      results.eliminate++
    } catch (e) {
      results.falliti++
      results.errori.push({ org_id: orgId, error: e.message?.slice(0, 100) })
    }
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIT 2026-06-20 — ADMIN v2: activity feed, customer signals, funnel,
// errors grouped, AI cost per cliente, global search, SQL editor sicuro.
// ═══════════════════════════════════════════════════════════════════════

