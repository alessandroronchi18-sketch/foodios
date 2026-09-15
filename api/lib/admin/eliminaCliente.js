// Cancellare un cliente: cosa sparisce, e come si dice prima di farlo.
//
// Scorporato da api/admin.js il 15/09/2026. È l'azione irreversibile del
// pannello, e fino a oggi partiva alla cieca: l'anteprima esisteva dal
// 01/07/2026 e non la chiamava nessuno, quindi nemmeno il controllo «lo stato
// è cambiato rispetto a quello che hai visto» poteva scattare.

// Le tabelle che si svuotano quando si cancella un cliente.
//
// Verificato sul database il 15/09/2026: tre nomi qui dentro non
// corrispondevano a nessuna tabella (`referral`, `dipendenti_stipendio`,
// `scadenzario_pagamenti`) e quattro tabelle non hanno una colonna
// `organization_id`, quindi non si possono filtrare per cliente
// (`login_attempts`, `rate_limits`, `plan_pricing_log`,
// `sdi_emission_queue`). Il conteggio le saltava in silenzio e il totale
// mostrato era più basso del vero. Tolte da qui.
//
// `error_log` usa `org_id`: ci pensa la chiave esterna, che al momento della
// cancellazione lo mette a nullo da sola.
export const TABELLE_ELIMINA_ORG = [
  'user_data', 'turni', 'dipendenti',
  'fornitori', 'ordini_fornitori', 'notifiche', 'integrazioni',
  'sync_log', 'sedi', 'fatture', 'note_giornaliere',
  // Tabelle AI (post Daily Brief 2026-06)
  'daily_briefs', 'ai_suggestions', 'brain_conversations',
  'recipe_inventions', 'forecast_giornaliero', 'cashflow_eventi',
  'competitor_prices', 'documentary_snapshots', 'whatsapp_links',
  'extracted_invoices', 'pos_scontrini',
  // Residui audit 2026-07-01
  'haccp_temperature', 'costi_aziendali',
  'inventario_produzione', 'stock_prodotti_finiti', 'vendite_b2b',
  'sdi_invoice_log', 'trasferimenti', 'ai_usage_daily',
  'view_usage_daily', 'feedback', 'audit_log', 'discount_redemptions',
]

// Conta i record che verrebbero eliminati (dry-run). Usato dall'UI admin per
// mostrare "stai per eliminare 234 righe in 18 tabelle" prima della conferma.
export async function azEliminaPreview(supabase, orgId) {
  const counts = {}
  for (const t of TABELLE_ELIMINA_ORG) {
    try {
      const { count } = await supabase.from(t)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (count != null) counts[t] = count
    } catch { /* skip non esistenti */ }
  }
  const { count: nProfiles } = await supabase
    .from('profiles').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
  counts['profiles'] = nProfiles || 0
  counts['organizations'] = 1
  const totale = Object.values(counts).reduce((s, n) => s + n, 0)
  return { totale, counts }
}

export async function azElimina(supabase, orgId, conferma, expectedCount) {
  // Doppia conferma: testo "ELIMINA" + count atteso confermato dal client.
  if (conferma !== 'ELIMINA') throw new Error('Conferma mancante (stringa ELIMINA)')

  // Verifica che il count corrisponda a quello mostrato all'admin al preview.
  // Se nel frattempo i dati sono cambiati (es. nuova fattura), interrompe.
  if (expectedCount != null) {
    const { totale } = await azEliminaPreview(supabase, orgId)
    if (totale !== Number(expectedCount)) {
      throw new Error(
        `Stato cambiato dal preview: ${totale} record vs ${expectedCount} attesi. Riapri il preview.`
      )
    }
  }

  // Snapshot profili PRIMA del delete (servono per auth.users cleanup).
  const { data: profiles } = await supabase
    .from('profiles').select('id, email').eq('organization_id', orgId)

  // Preferiamo la RPC `admin_org_cascade_delete` (migration 20260630): cancella
  // tutte le tabelle figlie in UNA TRANSAZIONE — niente timeout-mezzo-eliminato,
  // rollback automatico su errore. Fallback al loop sequenziale solo se la RPC
  // non e' deployata (DB pre-20260630).
  const { data: esitoCascata, error: rpcErr } = await supabase.rpc('admin_org_cascade_delete', { p_org_id: orgId })
  // La funzione restituisce una riga per tabella, e segna con -1 quelle su cui
  // la cancellazione è fallita (per esempio perché la tabella non ha una
  // colonna `organization_id`: `error_log` usa `org_id`, e `login_attempts`,
  // `rate_limits`, `plan_pricing_log` e `sdi_emission_queue` non ce l'hanno
  // affatto). Quelle righe restano lì. Finora nessuno guardava questo
  // risultato: si controllava solo se l'intera chiamata fosse fallita, e
  // un'eliminazione «riuscita» poteva lasciarsi dietro dati del cliente.
  const tabelleNonRipulite = (esitoCascata || [])
    .filter(r => Number(r?.rows_deleted) === -1)
    .map(r => r.table_name)
  if (tabelleNonRipulite.length > 0) {
    console.error('[azElimina] tabelle non ripulite per', orgId, ':', tabelleNonRipulite.join(', '))
  }
  if (rpcErr) {
    // Fallback: la RPC potrebbe non esistere (migration non applicata) o aver
    // fallito per motivi specifici. Logghiamo e procediamo con DELETE manuali
    // ma senza atomicita'.
    console.warn('[azElimina] admin_org_cascade_delete RPC fallita, fallback al loop:', rpcErr.message)
    for (const t of TABELLE_ELIMINA_ORG) {
      try {
        await supabase.from(t).delete().eq('organization_id', orgId)
      } catch { /* tabella opzionale */ }
    }
    await supabase.from('profiles').delete().eq('organization_id', orgId)
    const r = await supabase.from('organizations').delete().eq('id', orgId)
    if (r.error) throw new Error(r.error.message)
  }

  // Elimina utenti auth (best-effort, in coda). Tracciare fallimenti per evitare
  // utenti orfani che possono ancora fare login senza profilo.
  const fallitiAuth = []
  for (const p of profiles || []) {
    try {
      await supabase.auth.admin.deleteUser(p.id)
    } catch (e) {
      fallitiAuth.push({ id: p.id, email: p.email, error: e?.message })
    }
  }
  if (fallitiAuth.length > 0) {
    // Le colonne di error_log sono `status` e `message`, non `status_code` e
    // `error_message`: questo inserimento falliva sempre, dentro un catch
    // vuoto. Risultato: un utente rimasto senza organizzazione — che può
    // ancora fare accesso — non veniva segnalato in nessun posto.
    const { error: eLog } = await supabase.from('error_log').insert({
      endpoint: 'admin.azElimina',
      operation: 'auth.admin.deleteUser',
      org_id: orgId,
      status: 500,
      message: `Cancellazione utente fallita per ${fallitiAuth.length} account dell'organizzazione ${orgId}: possono ancora entrare.`,
      context: { orgId, fallitiAuth },
    })
    if (eLog) console.error('[azElimina] utenti orfani non registrati:', eLog.message, fallitiAuth)
  }

  // Quello che non è riuscito torna a chi ha premuto il bottone, invece di
  // restare in un log del server.
  return {
    tabelle_non_ripulite: tabelleNonRipulite,
    utenti_non_cancellati: fallitiAuth.map(f => f.email).filter(Boolean),
  }
}
