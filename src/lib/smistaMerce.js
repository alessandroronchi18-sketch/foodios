// Cibo o imballaggio? E quanto costa UNO?
//
// ── Il documento da cui nasce ────────────────────────────────────────────
//
// ConoArtic manda sulla stessa bolla due mondi diversi:
//
//     V570/6      GIANDUIA SCURA (KG.3)              KG   6,00   IVA 10
//     X080        COPERT.CLASS.STRACCIATELLA         KG   5,00   IVA 10
//     B085/B-16   COPPETTA BIO 16/B MARA N.250       PA   9,00   IVA 22
//     E009/A-MARA TOVAGLIOLO MARA N. 12.000          SC   1,00   IVA 22
//     B015/-IM200 BICCH.BAMBOO 200cc N.50            PA  40,00   IVA 22
//
// Il gelato va in magazzino come materia prima. Le coppette no: sono
// materiali di confezionamento, e il loro posto è l'elenco che alimenta il
// costo dei formati — quello dove oggi la cialda vale 0,001 €.
//
// ── Come si distinguono ──────────────────────────────────────────────────
//
// **Dall'aliquota IVA**, che è l'unica cosa stampata che li separa davvero:
// in Italia gli alimentari stanno al 4% o al 10%, e tutto il resto al 22%.
// Non dal nome: «coppetta» è un imballaggio, ma «coppa» è un salume, e un
// elenco di parole sbaglia il giorno che arriva un prodotto nuovo.
//
// Decisione del titolare, 22/09/2026, alla domanda se smistarli
// dall'aliquota: «fai tu come ritieni opportuno». Quindi l'aliquota decide,
// **la schermata lo dice riga per riga, e si può correggere**: una regola
// automatica che non si vede è una regola che sbaglia in silenzio.
//
// Quando l'aliquota non c'è, non si indovina: si risponde «non lo so» e
// decide la persona.
import { pezziPerConfezione } from './pezziPerConfezione'

export const DOVE = {
  MAGAZZINO: 'magazzino',   // materia prima: pesa sul food cost
  MATERIALI: 'materiali',   // confezionamento: pesa sul costo del formato
  NON_SO: 'non-so',
}

// Le aliquote alimentari italiane. Il 5% esiste (alcuni prodotti base) ed è
// raro, ma c'è: lasciarlo fuori vorrebbe dire mandare della farina fra le
// coppette.
const ALIQUOTE_CIBO = new Set([4, 5, 10])
const ALIQUOTE_NON_CIBO = new Set([22])

/**
 * Dove va questa riga, e perché.
 *
 * @param {object} riga  `{ nome, descrizione, aliquotaIva, unita }`
 * @returns {{dove: string, perche: string, sicura: boolean}}
 */
export function doveVa(riga = {}) {
  const a = Number(riga?.aliquotaIva)
  if (Number.isFinite(a) && ALIQUOTE_CIBO.has(a)) {
    return { dove: DOVE.MAGAZZINO, perche: `IVA al ${a}%: è un alimentare`, sicura: true }
  }
  if (Number.isFinite(a) && ALIQUOTE_NON_CIBO.has(a)) {
    return { dove: DOVE.MATERIALI, perche: 'IVA al 22%: non è un alimentare', sicura: true }
  }
  return {
    dove: DOVE.NON_SO,
    perche: 'sulla riga non c’è l’aliquota IVA: dimmi tu se è roba da mangiare o da confezionare',
    sicura: false,
  }
}

/**
 * Quanto costa UN pezzo di questo materiale.
 *
 * Il documento dice quanto costa una confezione e quanti pezzi ci sono
 * dentro («COPPETTA BIO 16/B MARA N.250»): da lì esce il costo di una
 * coppetta senza che nessuno batta un numero. È esattamente quello che oggi
 * nei formati del design partner vale 0,002 €.
 *
 * @param {object} riga
 * @param {number|string} riga.quantita   quante confezioni sono arrivate
 * @param {number|string} riga.imponibile il totale della riga, senza IVA
 * @param {string} riga.nome
 * @param {string} [riga.descrizione]
 * @param {number} [riga.pezziPerConfezione] se il riconoscimento l'ha già letto
 * @returns {{costoPezzo: number|null, pezzi: number|null, totPezzi: number|null,
 *            perche: string|null, problema: string|null}}
 */
export function costoDiUnPezzo(riga = {}) {
  const dichiarati = Number(riga?.pezziPerConfezione)
  const pezzi = Number.isFinite(dichiarati) && dichiarati > 0
    ? dichiarati
    : pezziPerConfezione(riga?.descrizione || riga?.nome)
  const confezioni = Number(String(riga?.quantita ?? '').replace(',', '.'))
  const imponibile = leggiImporto(riga?.imponibile)

  if (pezzi == null) {
    return {
      costoPezzo: null, pezzi: null, totPezzi: null, perche: null,
      problema: 'non c’è scritto quanti pezzi ci sono in una confezione',
    }
  }
  if (!Number.isFinite(confezioni) || confezioni <= 0) {
    return {
      costoPezzo: null, pezzi, totPezzi: null, perche: null,
      problema: 'non si legge quante confezioni sono arrivate',
    }
  }
  const totPezzi = pezzi * confezioni
  if (imponibile == null || !(imponibile > 0)) {
    // Succede su metà delle bolle vere: il DDT porta le quantità e i prezzi
    // arrivano con la fattura. I pezzi si contano lo stesso.
    return {
      costoPezzo: null, pezzi, totPezzi, perche: null,
      problema: 'su questa riga non c’è il prezzo: i pezzi li conto, il costo no',
    }
  }
  const costoPezzo = imponibile / totPezzi
  return {
    costoPezzo: parseFloat(costoPezzo.toFixed(6)),
    pezzi,
    totPezzi,
    perche: `${fmtIt(confezioni)} × ${fmtIt(pezzi)} pezzi = ${fmtIt(totPezzi)}, e ${fmtIt(imponibile)} € diviso ${fmtIt(totPezzi)}`,
    problema: null,
  }
}

/** Un importo scritto all'italiana o all'inglese. */
function leggiImporto(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v).replace(/[€\s]/g, '')
  if (!t) return null
  const it = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)
  const n = Number(it ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function fmtIt(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 3 })
}

/**
 * Smista tutta la bolla, e prepara le frasi da dire a schermo.
 *
 * Non scrive niente: dice dove andrebbe ogni riga e cosa non si sa. Una
 * regola automatica che non si vede è una regola che sbaglia in silenzio.
 */
export function smistaBolla(righe = []) {
  const elenco = Array.isArray(righe) ? righe : []
  const smistate = elenco.map((r, i) => {
    const d = doveVa(r)
    const pezzi = d.dove === DOVE.MATERIALI ? costoDiUnPezzo(r) : null
    return { indice: i, ...r, _dove: d, _pezzi: pezzi }
  })
  const perDove = (k) => smistate.filter(r => r._dove.dove === k)
  const materiali = perDove(DOVE.MATERIALI)
  const nonSo = perDove(DOVE.NON_SO)
  const avvisi = []
  if (materiali.length) {
    const conPrezzo = materiali.filter(r => r._pezzi?.costoPezzo != null)
    avvisi.push(
      `${materiali.length} ${materiali.length === 1 ? 'riga è materiale di confezionamento' : 'righe sono materiale di confezionamento'} `
      + `(IVA al 22%): non ${materiali.length === 1 ? 'entra' : 'entrano'} nel food cost delle ricette, ma nel costo dei formati.`
      + (conPrezzo.length ? ` Di ${conPrezzo.length} ${conPrezzo.length === 1 ? 'so' : 'so'} anche quanto costa un pezzo.` : ''),
    )
  }
  if (nonSo.length) {
    avvisi.push(
      `${nonSo.length} ${nonSo.length === 1 ? 'riga non ha' : 'righe non hanno'} l’aliquota IVA: dimmi tu se `
      + `${nonSo.length === 1 ? 'è' : 'sono'} da mangiare o da confezionare.`,
    )
  }
  return { righe: smistate, materiali, nonSo, avvisi }
}

/**
 * Cosa cambierebbe nell'elenco dei materiali di confezionamento, se si
 * prendessero i prezzi di questa bolla.
 *
 * ── Perché non si applica da solo ────────────────────────────────────────
 *
 * Il costo di una coppetta entra nel costo di **ogni formato** che la usa, e
 * quindi nel margine di ogni cono venduto. Cambiarlo di nascosto è il genere
 * di cosa che si scopre a fine mese guardando un margine che non torna.
 *
 * Quindi qui si calcola e basta, diviso in due mucchi come per la scheda del
 * fornitore:
 *   • **i buchi** — materiali senza prezzo: si riempiono, ed è sempre un
 *     guadagno (oggi valgono zero, o un millesimo di euro segnaposto);
 *   • **i diversi** — materiali che un prezzo ce l'hanno già: si mostrano
 *     tutti e due i numeri e decide una persona.
 *
 * @param {Array} materiali  l'elenco di oggi, `[{nome, costo, ...}]`
 * @param {Array} righeSmistate  l'uscita di `smistaBolla().materiali`
 * @returns {{vuoti: Array, diversi: Array, nuovi: Array}}
 */
export function prezziMaterialiDaBolla(materiali, righeSmistate) {
  const elenco = Array.isArray(materiali) ? materiali : []
  const perChiave = new Map()
  for (const m of elenco) {
    const k = chiaveMat(m?.nome)
    if (k && !perChiave.has(k)) perChiave.set(k, m)
  }
  const vuoti = []
  const diversi = []
  const nuovi = []

  for (const r of (Array.isArray(righeSmistate) ? righeSmistate : [])) {
    const costo = r?._pezzi?.costoPezzo
    if (costo == null || !Number.isFinite(costo) || costo < 0) continue
    const nome = String(r?.nome || r?.descrizione || '').trim()
    const k = chiaveMat(nome)
    if (!k) continue
    const gia = perChiave.get(k)
    if (!gia) { nuovi.push({ nome, costo, perche: r._pezzi.perche }); continue }
    const attuale = gia.costo == null || gia.costo === '' ? null : Number(gia.costo)
    if (attuale == null || !Number.isFinite(attuale)) {
      vuoti.push({ nome: gia.nome, costo, perche: r._pezzi.perche })
      continue
    }
    // Sotto il decimo di millesimo non è un cambio: è arrotondamento.
    if (Math.abs(attuale - costo) < 0.0001) continue
    diversi.push({ nome: gia.nome, costo, attuale, perche: r._pezzi.perche })
  }
  return { vuoti, diversi, nuovi }
}

/** Due nomi di materiale sono lo stesso materiale? Stessa regola dei formati. */
function chiaveMat(nome) {
  return String(nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}
