// ── I numeri della nuova Analisi, scritti come li legge un titolare ──────
//
// Regole in ANALISI_DESIGN.md, §2: euro all'unità e col punto delle migliaia
// sempre, € dopo la cifra; quote con al massimo un decimale; le variazioni di
// una quota in **punti**, non in percentuale; ogni variazione dice a parole
// se è un bene o un male. Un dato che manca non è zero: le funzioni
// ritornano `null` e chi disegna scrive perché.
//
// Il segno meno è quello tipografico (U+2212): il trattino «-» accanto a una
// cifra si legge come un trattino, e in una colonna di numeri si perde.

const MENO = '−'

const nf = (dec) => new Intl.NumberFormat('it-IT', {
  useGrouping: 'always', minimumFractionDigits: dec, maximumFractionDigits: dec,
})
const NF0 = nf(0)
const NF1 = nf(1)
const NF2 = nf(2)

const finito = (n) => n != null && n !== '' && Number.isFinite(Number(n))

/** «1.234 €» (o con i centesimi). `null` se il numero non c'è. */
export function euro(n, { decimali = 0 } = {}) {
  if (!finito(n)) return null
  const v = Number(n)
  const f = decimali === 2 ? NF2 : NF0
  const testo = f.format(Math.abs(v))
  return `${v < 0 && Math.round(Math.abs(v) * 100) > 0 ? MENO : ''}${testo} €`
}

/** «+1.234 €» / «−1.234 €» / «0 €». Per gli scostamenti. */
export function euroSegno(n) {
  if (!finito(n)) return null
  const v = Math.round(Number(n))
  if (v === 0) return '0 €'
  return `${v > 0 ? '+' : MENO}${NF0.format(Math.abs(v))} €`
}

/** Una quota: «18,4%». Al massimo un decimale, zero se è intera. */
export function quota(n) {
  if (!finito(n)) return null
  const v = Math.round(Number(n) * 10) / 10
  const intero = Number.isInteger(v)
  return `${v < 0 ? MENO : ''}${(intero ? NF0 : NF1).format(Math.abs(v))}%`
}

/**
 * La quota con l'articolo, per le frasi: «il 26%», ma «l'11%», «l'8%»,
 * «l'80%», «l'1,5%», perché si leggono undici, otto, ottanta, uno.
 * «Il 11%» in una frase si sente subito che è scritto da una macchina.
 */
export function quotaConArticolo(n) {
  const q = quota(n)
  if (q == null) return null
  const v = Math.round(Number(n) * 10) / 10
  const i = Math.floor(Math.abs(v))
  const vocale = v >= 0 && (i === 1 || i === 8 || i === 11 || (i >= 80 && i <= 89) || (i >= 800 && i <= 899))
  return `${vocale ? "l'" : 'il '}${q}`
}

/**
 * Una quota in colonna: sempre un decimale («12,0%»), così le virgole cadono
 * una sotto l'altra (ricerca design §4.5). Nelle tessere resta `quota()`.
 */
export function quotaColonna(n) {
  if (!finito(n)) return null
  const v = Math.round(Number(n) * 10) / 10
  return `${v < 0 ? MENO : ''}${NF1.format(Math.abs(v))}%`
}

/** La variazione di una quota, in punti: «+1,8 punti», «−0,4 punti». */
export function punti(d) {
  if (!finito(d)) return null
  const v = Math.round(Number(d) * 10) / 10
  if (v === 0) return 'invariato'
  const n = Math.abs(v)
  return `${v > 0 ? '+' : MENO}${(Number.isInteger(n) ? NF0 : NF1).format(n)} ${n === 1 ? 'punto' : 'punti'}`
}

/**
 * Un numero con il segno davanti: «+1,8», «−1,8», «0». Il meno è quello
 * tipografico, largo come il più: in una colonna di scostamenti «+1,8» e
 * «−1,8» finiscono sullo stesso bordo (ricerca design §4.6, 04/10/2026: il
 * formato italiano del browser scrive il trattino, più stretto del «+»).
 * Lo zero (anche dopo l'arrotondamento) non ha segno.
 * @param {number} n
 * @param {{ decimali?: number, unita?: string }} [o]  `unita` va dopo, con lo spazio: «+1.234 €»
 */
export function conSegno(n, { decimali = 0, unita = '' } = {}) {
  if (!finito(n)) return null
  const v = Number(n)
  const testo = (decimali === 0 ? NF0 : decimali === 1 ? NF1 : decimali === 2 ? NF2 : nf(decimali)).format(Math.abs(v))
  const zero = Math.round(Math.abs(v) * 10 ** decimali) === 0
  return `${zero ? '' : v > 0 ? '+' : MENO}${testo}${unita ? ` ${unita}` : ''}`
}

/**
 * Il verso di un numero, per la freccia: 1 sale, −1 scende, 0 fermo.
 * Accetta un numero, un testo che comincia col segno («+52%», «−368 €»,
 * anche col trattino) o il risultato di `variazione()`. La freccia segue il
 * SEGNO, il colore segue il giudizio: «+52%» di spese è una freccia in su,
 * rossa (audit del 04/10, difetto C2: era «↘ +52%»).
 */
export function segnoDi(x) {
  if (x == null) return 0
  if (typeof x === 'object') {
    if (finito(x.delta)) return segnoDi(Number(x.delta))
    return segnoDi(x.testoDelta)
  }
  if (typeof x === 'number') return Number.isFinite(x) ? Math.sign(x) : 0
  const m = /^\s*([+−-])\s*\d/.exec(String(x))
  return m ? (m[1] === '+' ? 1 : -1) : 0
}

/** «+6%» / «−12%» per la variazione relativa di un importo. */
export function percentualeSegno(p) {
  if (!finito(p)) return null
  const v = Math.round(Number(p))
  if (v === 0) return '0%'
  return `${v > 0 ? '+' : MENO}${NF0.format(Math.abs(v))}%`
}

/**
 * Il confronto fra due numeri, con il giudizio.
 *
 * @param {object} o
 * @param {number|null} o.attuale
 * @param {number|null} o.confronto
 * @param {boolean} [o.piuEMeglio=true]  per i costi `false`: salire è peggio
 * @param {number} [o.soglia=1]  sotto questa variazione % è «pari»
 * @param {boolean} [o.quota=false]  se i numeri sono quote: delta in punti
 * @returns {null | { delta: number, deltaPct: number|null,
 *   verso: 'meglio'|'peggio'|'pari', parola: string, testoDelta: string }}
 */
export function variazione({ attuale, confronto, piuEMeglio = true, soglia = 1, quota: eQuota = false }) {
  if (!finito(attuale) || !finito(confronto)) return null
  const a = Number(attuale)
  const c = Number(confronto)
  const delta = a - c
  const deltaPct = c !== 0 ? (delta / Math.abs(c)) * 100 : null
  // Le quote si giudicano in punti (soglia mezzo punto), gli importi in %.
  const fermo = eQuota ? Math.abs(delta) < 0.5 : (deltaPct == null ? delta === 0 : Math.abs(deltaPct) < soglia)
  let verso = 'pari'
  if (!fermo) verso = (delta > 0) === piuEMeglio ? 'meglio' : 'peggio'
  const testoDelta = eQuota ? punti(delta) : (deltaPct == null ? euroSegno(delta) : percentualeSegno(deltaPct))
  const parola = verso === 'pari' ? 'come' : verso === 'meglio' ? 'meglio' : 'peggio'
  return { delta, deltaPct, verso, parola, testoDelta }
}

/** Il nome del mese, «settembre 2026», da «2026-09». */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
export function nomeMese(chiave, { anno = true } = {}) {
  const m = /^(\d{4})-(\d{2})/.exec(String(chiave || ''))
  if (!m) return null
  const nome = MESI[Number(m[2]) - 1]
  return anno ? `${nome} ${m[1]}` : nome
}

/** «a settembre 2026», «ad agosto 2026»: la d eufonica davanti alla vocale. */
export function aMese(chiave, opz = {}) {
  const nome = nomeMese(chiave, opz)
  if (!nome) return null
  return `${/^[aeiou]/i.test(nome) ? 'ad' : 'a'} ${nome}`
}

/** Il mese prima e lo stesso mese dell'anno prima, come «AAAA-MM». */
export function mesePrima(chiave) {
  const [y, m] = String(chiave).split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
export function annoPrima(chiave) {
  const [y, m] = String(chiave).split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}`
}

/** Data breve italiana: «31/08». */
export function dataBreve(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}` : null
}
