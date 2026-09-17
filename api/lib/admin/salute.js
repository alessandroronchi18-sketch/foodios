// Lo stato del sistema: i lavori notturni, gli errori, il rilascio.
//
// Scorporato da api/admin.js il 15/09/2026.
//
// La cosa importante che fa questo modulo è **distinguere «non gira» da «non
// ha dati»**. Prima non lo faceva: lo stato di un lavoro si deduceva dal fatto
// che la sua tabella avesse righe nuove, e `forecast_giornaliero` è vuota da
// sempre — il pannello non poteva dire se la previsione fosse rotta o se
// semplicemente non ci fosse niente da prevedere. Ci sono voluti dieci minuti
// di interrogazioni al database per stabilirlo a mano.

// ─── Health: cron + deploy + esterni (audit 2026-06-14) ──────────────────
//
// Stima dello stato del sistema basandosi su:
//  - error_log per individuare cron falliti
//  - daily_briefs/forecast/etc. created_at per "ultimo run" dei cron
//  - audit_log per identificare audit cleanup recente
//  - env build-time per deploy info Vercel
const CRON_SIGNATURES = [
  { id: 'cron-notifiche',      etichetta: 'Avvisi (scorte, fatture in scadenza)', table: null },
  { id: 'cron-daily-brief',    etichetta: 'Riepilogo del mattino',     table: 'daily_briefs' },
  { id: 'cron-ai-suggestions', etichetta: 'Suggerimenti',              table: 'ai_suggestions' },
  { id: 'cron-forecast',       etichetta: 'Previsione vendite',        table: 'forecast_giornaliero' },
  { id: 'cron-documentary',    etichetta: 'Fotografia del mese',       table: 'documentary_snapshots' },
  { id: 'anomaly-detect',      etichetta: 'Numeri fuori dal solito',   table: null },
  { id: 'cleanup-audit-log',   etichetta: 'Pulizia registro modifiche', table: null },
  { id: 'cleanup-error-log',   etichetta: 'Pulizia registro errori',   table: null },
]

/**
 * Lo stato dei lavori notturni.
 *
 * **Come si capiva prima**: guardando se la tabella di destinazione aveva
 * righe nuove. È il motivo per cui «la previsione non ha dati» e «la
 * previsione non gira» si leggevano identici — e infatti
 * `forecast_giornaliero` ha zero righe da sempre, senza che il pannello
 * potesse dire quale delle due cose fosse.
 *
 * **Come si capisce adesso**: ogni passo scrive il suo esito in `cron_runs`
 * (api/cron-giornaliero.js). Quindi si possono dire due cose diverse:
 * «ha girato stanotte e non ha prodotto niente» e «non gira da undici
 * giorni». La tabella di destinazione resta come conferma, non come prova.
 */
import { giorniFaItaliano } from '../../../src/lib/dateLocal.js'

export async function getCronStatus(supabase) {
  // Un colpo solo sul registro, invece di una query per lavoro.
  let registro = {}
  try {
    const da = giorniFaItaliano(6)
    const { data } = await supabase
      .from('cron_runs')
      .select('job_name, run_date, completed_at, status, error_message')
      .gte('run_date', da)
      .order('run_date', { ascending: false })
    for (const r of data || []) {
      if (!registro[r.job_name]) registro[r.job_name] = r
    }
  } catch (e) {
    console.error('[admin] registro dei lavori non leggibile:', e?.message)
  }

  const results = []
  for (const cron of CRON_SIGNATURES) {
    const r = registro[cron.id]
    const oreDaGiro = r?.completed_at ? (Date.now() - new Date(r.completed_at).getTime()) / 3600000 : null

    // Quando ha scritto qualcosa l'ultima volta (se ha una tabella sua).
    let ultimaScrittura = null
    if (cron.table) {
      try {
        const { data } = await supabase
          .from(cron.table).select('created_at')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        ultimaScrittura = data?.created_at || null
      } catch { /* la tabella potrebbe non esistere */ }
    }

    // Lo stato dice del LAVORO, non del suo risultato.
    const status = r == null ? 'mai_registrato'
      : r.status === 'error' ? 'error'
      : oreDaGiro > 26 ? 'late'
      : 'ok'

    // E una riga in italiano che distingue le due cose.
    let nota = null
    if (status === 'mai_registrato') {
      nota = 'Non ha ancora lasciato traccia: o non gira, o il registro è stato acceso dopo.'
    } else if (status === 'error') {
      nota = `Ultimo giro fallito: ${r.error_message || 'senza messaggio'}`
    } else if (status === 'late') {
      nota = `Ha girato l'ultima volta ${Math.round(oreDaGiro / 24)} giorni fa.`
    } else if (cron.table && !ultimaScrittura) {
      nota = 'Gira regolarmente ma non ha mai scritto niente: il lavoro funziona, i dati di partenza mancano.'
    }

    results.push({
      id: cron.id,
      etichetta: cron.etichetta,
      table: cron.table,
      last_run: r?.completed_at || null,
      hours_ago: oreDaGiro != null ? Math.round(oreDaGiro * 10) / 10 : null,
      ultima_scrittura: ultimaScrittura,
      status,
      nota,
      expected_hour_utc: 7,
    })
  }
  return results
}

export async function getHealthSnapshot(supabase) {
  // Stima salute generale del sistema
  const cron = await getCronStatus(supabase)
  // Conta errori critici negli ultimi 24h dal error_log
  let erroriUltime24h = null
  try {
    const ieri = new Date(Date.now() - 86400000).toISOString()
    const { count } = await supabase.from('error_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', ieri)
    erroriUltime24h = count
  } catch {}
  // Conteggio righe nelle 12 tabelle AI (table size estimate)
  const tables = [
    'daily_briefs', 'ai_suggestions', 'brain_conversations',
    'recipe_inventions', 'forecast_giornaliero', 'cashflow_eventi',
    'competitor_prices', 'documentary_snapshots', 'whatsapp_links',
    'extracted_invoices', 'marketplace_listings', 'pos_scontrini',
    'organizations', 'profiles', 'sedi', 'fatture',
  ]
  const tableCounts = {}
  for (const t of tables) {
    try {
      const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
      tableCounts[t] = count != null ? count : 'n/a'
    } catch { tableCounts[t] = 'n/a' }
  }
  // Build info from Vercel env vars
  const buildInfo = {
    vercel_env: process.env.VERCEL_ENV || 'unknown',
    git_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
    git_branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    deploy_url: process.env.VERCEL_URL || 'unknown',
  }
  return {
    cron,
    errori_ultime_24h: erroriUltime24h,
    table_counts: tableCounts,
    build: buildInfo,
    generated_at: new Date().toISOString(),
  }
}

