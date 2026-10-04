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

/** La variazione di una quota, in punti: «+1,8 punti», «−0,4 punti». */
export function punti(d) {
  if (!finito(d)) return null
  const v = Math.round(Number(d) * 10) / 10
  if (v === 0) return 'invariato'
  const n = Math.abs(v)
  return `${v > 0 ? '+' : MENO}${(Number.isInteger(n) ? NF0 : NF1).format(n)} ${n === 1 ? 'punto' : 'punti'}`
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
