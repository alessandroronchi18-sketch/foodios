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
import { leggiFatturePeriodo, leggiCategorieFornitori, produzionePerSedeMese } from './contoEconomicoArchivio'
import { incassiDaSedi, personaleDelMese, contoDelMese } from './ilMese'
import { formatLocalDate } from './dateLocal'
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

const giornoDopo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return formatLocalDate(new Date(y, m - 1, d + 1)) }
const giorniFra = (da, a) => { let n = 0; for (let g = da; g <= a; g = giornoDopo(g)) n++; return n }

/**
 * Gli incassi di una sede in un tratto di giorni: la cassa dove c'è, la
 * stima dall'inventario dove manca, scoperti i giorni senza nessuno dei due.
 * Il risultato è una «parte» di `incassiDaSedi` (ilMese.js).
 *
 * La stima si fa sui tratti di giorni consecutivi senza cassa, non giorno per
 * giorno: le rimanenze lasciate a 0 spostano i chili da un giorno all'altro,
 * e su un tratto si compensano (sui dati veri di Carlina, 16-31/08: +9,8%
 * contro la cassa sul periodo, fino a +150% sul giorno singolo).
 *
 * @param {object} o
 * @param {object[]} o.chiusure  chiusure DELLA sede
 * @param {object[]|null} o.righe  righe d'inventario della sede (null = non lette)
 * @param {object[]|null} o.formati
 * @param {string} o.da
 * @param {string} o.a  ultimo giorno da contare (per il mese in corso: oggi)
 * @param {object[]|null} [o.venditeB2B]
 * @param {string} [o.nome]
 */
export function incassiSedeDelMese({ chiusure = [], righe = null, formati = null, da, a, venditeB2B = null, nome = '' }) {
  const perGiorno = new Map()
  for (const c of chiusure || []) {
    const g = String(c?.data || c?.date || '').slice(0, 10)
    if (!g || g < da || g > a) continue
    const t = Number(c?.kpi?.totV ?? c?.totale ?? 0) || 0
    if (t > 0) perGiorno.set(g, (perGiorno.get(g) || 0) + t)
  }
  const cassa = { totV: [...perGiorno.values()].reduce((s, v) => s + v, 0), giorni: perGiorno.size }
  const tratti = []
  let inizio = null, prima = null
  for (let g = da; g <= a; g = giornoDopo(g)) {
    if (perGiorno.has(g)) { if (inizio) tratti.push([inizio, prima]); inizio = null }
    else { if (!inizio) inizio = g; prima = g }
  }
  if (inizio) tratti.push([inizio, prima])
  const ultimo = righe ? ultimoGiornoInventario(righe) : null
  let ricavi = 0, giorni = 0, scoperti = 0, motivo = null
  for (const [t0, t1] of tratti) {
    const n = giorniFra(t0, t1)
    if (!righe || !formati || !ultimo || ultimo < t0) { scoperti += n; continue }
    const fine = ultimo < t1 ? ultimo : t1
    const vendite = venditeB2B ? venditeB2B.filter(v => !v?.data || (v.data >= t0 && v.data <= fine)) : null
    const r = ricaviDaInventario(righe, formati, { da: t0, a: fine, venditeB2B: vendite })
    if (r.ricavi == null) { scoperti += n; motivo = motivo || r.motivo; continue }
    const coperti = giorniFra(t0, fine)
    ricavi += r.ricavi; giorni += coperti; scoperti += n - coperti
  }
  return { nome, cassa, stima: { ricavi: giorni ? ricavi : null, giorni, ultimoGiorno: ultimo }, scoperti, motivo }
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

  const [fattureLette, categorie, chiusure, formati, dipendenti, vendite, righePerSede, vociFisse, chiliDiTutte] = await Promise.all([
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
    // Con una sede scelta l'inventario qui sopra è solo il suo, ma per
    // dividere una spesa comune servono i chili di TUTTE le sedi che la
    // condividono: con i chili di una sola, la regola dava il 100 % a chi si
    // stava guardando (05/10/2026, test speseComuniUnaSedeSola). È la stessa
    // lettura del Conto economico. Per tutta l'azienda non serve: ogni spesa
    // conta per intero.
    sedeId ? prova('produzione delle sedi', () => produzionePerSedeMese(supabase, orgId, { dal, al })) : null,
  ])

  const fatture = fattureLette?.fatture || null
  // Se le fatture si leggono ma le categorie no, le spese si contano lo
  // stesso: tutte «da classificare». Dire «fatture non lette» sarebbe falso.
  const categoriePerFornitore = categorie?.categoriePerFornitore || (fatture ? {} : null)
  const cassa = chiusure ? cassaPerMese(chiusure, { sedeId }) : null
  const ultimoInventario = righePerSede
    ? Object.values(righePerSede).map(ultimoGiornoInventario).filter(Boolean).sort().at(-1) || null
    : null

  // I chili prodotti da ogni sede in un mese: il motore ci divide le spese
  // condivise (regola del titolare, 17/09). Senza, le divideva sempre in
  // parti uguali anche dove la produzione c'era.
  const produzionePerSede = (m) => {
    // Una sede sola: i chili di tutte, o niente (parti uguali, dichiarate).
    // Mai i chili della sola sede guardata.
    if (sedeId) {
      const p = chiliDiTutte?.[m]
      return p && Object.values(p).some(v => v > 0) ? p : null
    }
    if (!righePerSede) return null
    const out = {}
    for (const [id, righe] of Object.entries(righePerSede)) {
      out[id] = (righe || []).reduce((s, r) => s + (String(r.data).startsWith(m) ? (Number(r.produzione_g) || 0) / 1000 : 0), 0)
    }
    return Object.values(out).some(v => v > 0) ? out : null
  }

  const oggi = formatLocalDate(new Date())
  const contoDi = (m, sede = sedeId) => {
    const { da, a } = estremiMese(m)
    // Incassi: sede per sede, la cassa dove c'è e la stima dall'inventario
    // dove manca (incassiSedeDelMese). Prima la cassa vinceva appena c'era un
    // giorno, anche per tutta l'azienda: vedi incassiDaSedi in ilMese.js.
    // I giorni futuri del mese in corso non sono «scoperti».
    const fine = a < oggi ? a : oggi
    const ids = sede ? [sede] : sediDaLeggere.map(s => s.id)
    const parti = ids.map(id => {
      // Con una sede scelta valgono le sue vendite all'ingrosso più quelle
      // senza sede (le vecchie). Per tutta l'azienda ogni vendita va a una
      // sede sola: quelle senza sede alla prima, se no si toglierebbero da
      // ogni negozio.
      const venditeSede = vendite
        ? vendite.filter(v => (sede ? (!v.sede_id || v.sede_id === id) : (v.sede_id ? v.sede_id === id : id === ids[0])))
        : null
      return incassiSedeDelMese({
        chiusure: (chiusure || []).filter(c => c?.sede_id === id),
        righe: righePerSede ? (righePerSede[id] || []) : null,
        formati, da, a: fine, venditeB2B: venditeSede,
        nome: (sediAttive.find(s => s.id === id) || {}).nome || '',
      })
    })
    // Le chiusure senza sede (vecchie) contano solo per tutta l'azienda.
    if (!sede && chiusure) {
      const senzaSede = incassiSedeDelMese({ chiusure: chiusure.filter(c => !c?.sede_id), righe: null, formati: null, da, a: fine })
      if (senzaSede.cassa.giorni > 0) parti.push({ ...senzaSede, nome: 'senza sede', scoperti: 0 })
    }
    const incassi = incassiDaSedi(parti)
    const costi = fatture && categoriePerFornitore
      ? costiPerMese(fatture, { mese: m, categoriePerFornitore, sedeId: sede, sedi: sediAttive, produzionePerSede })
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
