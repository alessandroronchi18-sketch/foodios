// ── Le letture per «Il mese» ────────────────────────────────────────────
//
// Tutto quello che la pagina legge, in un posto solo, e niente calcolo qui
// dentro: i conti stanno in `ilMese.js` (incassi, personale, conto) e in
// `contoEconomico.js` (le spese dalle fatture). Si legge una volta un anno e
// un mese di dati, e da lì si calcolano il mese scelto, lo stesso mese
// dell'anno prima, gli ultimi dodici mesi e ogni sede.
//
// Una lettura che fallisce non diventa «zero»: si annota in `errori` e il
// pezzo che ne dipende resta `null`, così la pagina dice «non lo so».

import { costiPerMese, fattureEccezionali } from './contoEconomico'
import { leggiFatturePeriodo, leggiCategorieFornitori } from './contoEconomicoArchivio'
import { incassiDelMese, personaleDelMese, contoDelMese } from './ilMese'
import { ricaviDaInventario, fetchAllInventarioProduzione } from './inventarioProduzione'
import { venditeB2BPeriodo } from './venditeB2B'
import { caricaChiusure } from './chiusure'
import { caricaCostiAziendali, totaleMensile } from './costiAziendali'
import { sload } from './storage'
import { SK_FORMATI } from './storageKeys'
import { annoPrima, mesePrima } from './formatoAnalisi'

/** «2026-09» → primo e ultimo giorno, e quanti giorni ha. */
export function estremiMese(mese) {
  const [y, m] = mese.split('-').map(Number)
  const giorni = new Date(y, m, 0).getDate()
  return { da: `${mese}-01`, a: `${mese}-${String(giorni).padStart(2, '0')}`, giorni }
}

/** I dodici mesi che finiscono con `mese`, dal più vecchio. */
export function ultimiMesi(mese, n = 12) {
  const out = [mese]
  while (out.length < n) out.unshift(mesePrima(out[0]))
  return out
}

/** L'ultimo giorno con un dato d'inventario (produzione o conta), per sede. */
export function ultimoGiornoInventario(righe = []) {
  let ultimo = null
  for (const r of righe) {
    const ha = Number(r?.produzione_g) > 0 || Number(r?.rimanenza_g) > 0
    if (ha && (!ultimo || r.data > ultimo)) ultimo = r.data
  }
  return ultimo
}

/** Le chiusure sommate per mese: `{ 'AAAA-MM': { totV, giorni } }`. */
export function cassaPerMese(chiusure = [], { sedeId = null } = {}) {
  const out = {}
  const giorni = {}
  for (const c of chiusure) {
    if (sedeId && c?.sede_id && c.sede_id !== sedeId) continue
    const data = String(c?.data || c?.date || '')
    const m = data.slice(0, 7)
    if (!m) continue
    const tot = Number(c?.kpi?.totV ?? c?.totale ?? 0) || 0
    out[m] = out[m] || { totV: 0, giorni: 0 }
    out[m].totV += tot
    giorni[m] = giorni[m] || new Set()
    if (tot > 0) giorni[m].add(data.slice(0, 10))
  }
  for (const m of Object.keys(out)) out[m].giorni = giorni[m].size
  return out
}

/**
 * Legge tutto e calcola i conti.
 *
 * @param {object} o
 * @param {object} o.supabase
 * @param {string} o.orgId
 * @param {{ id: string, nome: string, attiva?: boolean }[]} o.sedi
 * @param {string} o.mese  «AAAA-MM»
 * @param {string|null} [o.sedeId]  null = tutta l'azienda
 */
export async function caricaIlMese({ supabase, orgId, sedi = [], mese, sedeId = null }) {
  const errori = []
  const mesi = ultimiMesi(mese, 13) // il mese, i 12 prima (l'anno prima compreso)
  const dal = estremiMese(mesi[0]).da
  const al = estremiMese(mese).a
  const sediAttive = (sedi || []).filter(s => s && s.attiva !== false)
  const sediDaLeggere = sedeId ? sediAttive.filter(s => s.id === sedeId) : sediAttive

  const prova = async (nome, fn, ripiego = null) => {
    try { return await fn() } catch (e) { errori.push({ nome, messaggio: e?.message || String(e) }); return ripiego }
  }

  const [fattureLette, categorie, chiusure, formati, dipendenti, vendite, righePerSede, vociFisse] = await Promise.all([
    prova('fatture', () => leggiFatturePeriodo(supabase, orgId, { dal, al })),
    prova('categorie', () => leggiCategorieFornitori(supabase, orgId)),
    prova('cassa', () => caricaChiusure(orgId, null, { from: dal, to: al, tutteLeSedi: true }), null),
    prova('formati', () => sload(SK_FORMATI, orgId, null)),
    prova('personale', async () => {
      const { data, error } = await supabase.from('dipendenti')
        .select('id, nome, sede_id, attivo, stipendio_lordo_mensile, costo_orario, ore_settimana, data_assunzione, data_fine')
        .eq('organization_id', orgId)
      if (error) throw new Error(error.message)
      return data || []
    }),
    prova('vendite all\'ingrosso', () => venditeB2BPeriodo(orgId, { da: dal, a: al, sedeId, includiSenzaSede: !sedeId })),
    prova('inventario', async () => {
      const out = {}
      for (const s of sediDaLeggere) {
        out[s.id] = await fetchAllInventarioProduzione(orgId, { sedeIds: s.id, dataFrom: dal, dataTo: al })
      }
      return out
    }),
    // Le spese che non arrivano in fattura (pagina Costi fissi). Quelle che
    // hanno anche la fattura vanno tolte da lì, se no contano due volte: lo
    // dice ANALISI_DESIGN.md e la pagina lo ricorda.
    prova('costi fissi', () => caricaCostiAziendali(orgId, sedeId)),
  ])

  const fatture = fattureLette?.fatture || null
  // Se le fatture si leggono ma le categorie no, le spese si contano lo
  // stesso: tutte «da classificare». Dire «fatture non lette» sarebbe falso.
  const categoriePerFornitore = categorie?.categoriePerFornitore || (fatture ? {} : null)
  const cassa = chiusure ? cassaPerMese(chiusure, { sedeId }) : null
  const ultimoInventario = righePerSede
    ? Object.values(righePerSede).map(ultimoGiornoInventario).filter(Boolean).sort().at(-1) || null
    : null

  const contoDi = (m, sede = sedeId) => {
    const { da, a, giorni } = estremiMese(m)
    // Incassi: la cassa del mese, o la stima dall'inventario sommata sulle sedi.
    let stima = null
    if (righePerSede && formati) {
      let ricavi = 0, conDati = 0, motivo = null
      const ids = sede ? [sede] : Object.keys(righePerSede)
      for (const id of ids) {
        // Con una sede scelta valgono le sue vendite più quelle senza sede (le
        // vecchie). Per tutta l'azienda ogni vendita va a una sede sola: quelle
        // senza sede alla prima, se no si toglierebbero da ogni negozio.
        const venditeSede = vendite
          ? vendite.filter(v => (sede ? (!v.sede_id || v.sede_id === id) : (v.sede_id ? v.sede_id === id : id === ids[0])))
          : null
        const r = ricaviDaInventario(righePerSede[id] || [], formati, { da, a, venditeB2B: venditeSede })
        if (r.ricavi != null) { ricavi += r.ricavi; conDati++ } else motivo = r.motivo
      }
      stima = conDati ? { ricavi, ultimoGiorno: ultimoInventario && ultimoInventario < a ? ultimoInventario : null, parziale: !!(ultimoInventario && ultimoInventario < a) } : { ricavi: null, motivo }
    }
    const cassaMese = sede && chiusure ? cassaPerMese(chiusure, { sedeId: sede })[m] : cassa?.[m]
    const incassi = incassiDelMese({ cassa: cassaMese || null, stima, giorniDelMese: giorni })
    const costi = fatture && categoriePerFornitore
      ? costiPerMese(fatture, { mese: m, categoriePerFornitore, sedeId: sede, sedi: sediAttive })
      : null
    const personale = dipendenti ? personaleDelMese(dipendenti, { mese: m, sedeId: sede }) : { valore: null, stato: 'manca', testo: 'non letto' }
    // Per una sede: le sue voci più quelle di tutta l'azienda divise fra le
    // sedi attive (una voce senza sede non pesa per intero su ogni negozio).
    const fisse = vociFisse ? {
      importo: (vociFisse || []).reduce((s, v) => {
        const quota = sede ? (v.sede_id ? (v.sede_id === sede ? 1 : 0) : 1 / Math.max(1, sediAttive.length)) : 1
        return s + totaleMensile([v], `${m}-15`) * quota
      }, 0),
      voci: vociFisse,
    } : null
    // Le fatture fuori scala del mese (una GECKO da 86.651 € a luglio, 27
    // volte la solita): se sono investimenti non sono spese del mese, ma lo
    // decide il titolare. Qui si trovano e basta.
    const eccezionali = fatture && categoriePerFornitore
      ? fattureEccezionali(fatture, { categoriePerFornitore, dal: da }).filter(f => f.data && f.data <= a)
      : []
    return { mese: m, incassi, costi, personale, eccezionali, conto: contoDelMese({ incassi, costi, personale, speseFisse: fisse }) }
  }

  const perMese = Object.fromEntries(mesi.map(m => [m, contoDi(m)]))
  const perSede = sedeId ? null : Object.fromEntries(sediDaLeggere.map(s => [s.id, { sede: s, ...contoDi(mese, s.id) }]))

  return {
    mese,
    confronto: annoPrima(mese),
    attuale: perMese[mese],
    annoPrima: perMese[annoPrima(mese)] || null,
    andamento: mesi.slice(1).map(m => perMese[m]),
    perSede,
    ultimoInventario,
    categorie,
    fatture: fattureLette,
    errori,
  }
}
