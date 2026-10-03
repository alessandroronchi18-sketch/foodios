// ── Prezzi dalle fatture: le letture e la scrittura ──────────────────────
//
// Il conto sta in `prezziDaFatture.js`, dove si prova senza database. Qui ci
// sono solo le tre cose che toccano l'archivio:
//
//   • leggere le fatture con le righe, mille alla volta, solo le colonne che
//     servono;
//   • leggere listino, storico e abbinamenti dell'azienda;
//   • dopo un caricamento di XML, aggiornare da soli i prezzi delle righe
//     già abbinate una volta — e dirlo, senza mai far fallire il
//     caricamento delle fatture, che a quel punto sono già entrate.
//
// Il client del database arriva da chi chiama, come in `importaFattureXml`:
// così le prove possono passarne uno finto.
import { ssaveBatch } from './storage'
import { SK_RIC, SK_LOG_PRZ, SK_ABB_FATTURE, EVENTO_PREZZI_SCRITTI } from './storageKeys'
import { normFornitore, normNumero } from './completaFatture'
import { soloGiorno } from './bolle'
import { leggiAbbinamenti, raggruppaRigheFatture, decidiPrezziDaFatture, chiaviMaterie } from './prezziDaFatture'

export { EVENTO_PREZZI_SCRITTI }

const COLONNE = 'id, numero_rif, data_fattura, fornitore, tipo, totale, righe'
const PAGINA = 1000

/**
 * Le fatture che hanno il dettaglio delle righe, dalla più vecchia.
 * `da`/`a` («AAAA-MM-GG») stringono il periodo.
 */
export async function fattureConRighe(supabase, orgId, { da = null, a = null, onProgresso } = {}) {
  const tutte = []
  for (let offset = 0; offset < 200000; offset += PAGINA) {
    let q = supabase.from('fatture').select(COLONNE)
      .eq('organization_id', orgId)
      .not('righe->0', 'is', null)
    if (da) q = q.gte('data_fattura', da)
    if (a) q = q.lte('data_fattura', a)
    const { data, error } = await q.order('data_fattura').order('id').range(offset, offset + PAGINA - 1)
    if (error) throw new Error(error.message)
    tutte.push(...(data || []))
    onProgresso?.(tutte.length)
    if (!data || data.length < PAGINA) break
  }
  return tutte
}

/**
 * Listino, storico e abbinamenti dell'azienda (le tre chiavi stanno senza
 * sede). `ricettario` è `null` se non c'è: chi scrive deve fermarsi, perché
 * riscrivere un ricettario che non si è letto vorrebbe dire cancellarlo.
 */
export async function statoPrezzi(supabase, orgId) {
  const { data, error } = await supabase.from('user_data')
    .select('data_key, data_value, updated_at')
    .eq('organization_id', orgId)
    .is('sede_id', null)
    .in('data_key', [SK_RIC, SK_LOG_PRZ, SK_ABB_FATTURE])
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  const primo = (k) => (data || []).find(r => r?.data_key === k)
  const log = primo(SK_LOG_PRZ)?.data_value
  return {
    ricettario: primo(SK_RIC)?.data_value || null,
    logPrezzi: Array.isArray(log) ? log : [],
    logStorto: log != null && !Array.isArray(log),
    abbinamenti: leggiAbbinamenti(primo(SK_ABB_FATTURE)?.data_value),
  }
}

/** Dice alla pagina aperta che listino e storico sono cambiati. */
export function annunciaPrezziScritti(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try { window.dispatchEvent(new CustomEvent(EVENTO_PREZZI_SCRITTI, { detail })) } catch { /* niente da fare */ }
}

const chiaveDoc = (numero, data) => `${normNumero(numero)}|${soloGiorno(data) || ''}`

/**
 * Dopo un caricamento di XML: i prezzi delle righe già abbinate.
 *
 * Le fatture si rileggono **dal database**, non dagli XML: una fattura
 * completata può avere nel database un nome del fornitore diverso da quello
 * dell'XML (l'Excel di WebDesk lo scriveva a modo suo), e lo storico deve
 * riconoscere la stessa fattura comunque arrivi. Dall'XML si prende una cosa
 * sola: se è una nota di credito (TD04/TD08), perché nel database una nota di
 * credito completata può avere ancora il tipo «fattura».
 *
 * @param {Array} records le fatture toccate dal caricamento (`recordsToccati`)
 * @param {object} [opz]
 * @param {Function} [opz.scrivi] `(items) => Promise` — di default `ssaveBatch`
 * @returns {Promise<null | {applicati, storicizzati, daConfermare, daAbbinare, materie}>}
 */
export async function aggiornaPrezziDopoImport(supabase, orgId, records, { scrivi = null, utente = null } = {}) {
  const toccate = new Map()
  let da = null
  let a = null
  for (const r of (Array.isArray(records) ? records : [])) {
    if (!Array.isArray(r?.righe) || !r.righe.length) continue
    const g = soloGiorno(r.data_fattura)
    if (!g || !normNumero(r.numero_rif)) continue
    toccate.set(chiaveDoc(r.numero_rif, g), r)
    if (!da || g < da) da = g
    if (!a || g > a) a = g
  }
  if (!toccate.size) return null

  const stato = await statoPrezzi(supabase, orgId)
  const dalDb = await fattureConRighe(supabase, orgId, { da, a })
  const fatture = []
  for (const f of dalDb) {
    const rec = toccate.get(chiaveDoc(f.numero_rif, f.data_fattura))
    if (!rec) continue
    const stessa = normFornitore(rec.fornitore) === normFornitore(f.fornitore)
      || Math.abs(Math.abs(Number(rec.totale)) - Math.abs(Number(f.totale))) <= 0.011
    fatture.push(rec.tipo === 'nota_credito' && stessa ? { ...f, tipo: 'nota_credito' } : f)
  }

  // Le materie prime che esistono oggi: un abbinamento a una rinominata o
  // eliminata non deve farla rinascere nel listino col nome vecchio.
  const chiaviValide = stato.ricettario ? chiaviMaterie(stato.ricettario) : null
  const daAbbinare = raggruppaRigheFatture(fatture, { abbinamenti: stato.abbinamenti, chiaviValide })
    .gruppi.filter(g => g.stato === 'da-abbinare').length
  const vuoto = { applicati: 0, storicizzati: 0, daConfermare: 0, daAbbinare, materie: [] }
  // Senza ricettario non c'è niente da abbinare, e uno storico illeggibile
  // non si riscrive: si perderebbe.
  if (!stato.ricettario || stato.logStorto || !Object.keys(stato.abbinamenti.gruppi).length) return vuoto

  const ric = stato.ricettario
  const esito = decidiPrezziDaFatture(fatture, {
    abbinamenti: stato.abbinamenti,
    ingredientiCosti: ric.ingredienti_costi || {},
    logPrezzi: stato.logPrezzi,
    utente,
    chiaviValide,
  })
  const riepilogo = { ...vuoto, applicati: esito.applicati, storicizzati: esito.storicizzati, daConfermare: esito.daConfermare.length, materie: esito.materie }
  if (esito.applicati + esito.storicizzati === 0) return riepilogo

  const nuovoRic = { ...ric, ricette: ric.ricette || {}, ingredienti_costi: esito.ingredientiCosti }
  const items = [{ key: SK_RIC, value: nuovoRic }, { key: SK_LOG_PRZ, value: esito.logPrezzi }]
  // Listino e storico insieme, in una sola scrittura: o entrano tutti e due o
  // nessuno.
  await (scrivi || ((it) => ssaveBatch(it, orgId, null)))(items)
  annunciaPrezziScritti({ ricettario: nuovoRic, logPrezzi: esito.logPrezzi })
  return riepilogo
}
