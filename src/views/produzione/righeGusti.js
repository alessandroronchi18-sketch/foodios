// ── Le righe della tabella per gusto ──────────────────────────────────────
//
// Mette insieme, gusto per gusto, i soldi (`valutaGusti`: ricavo, costo al
// kg, margine) e il movimento (`andamentoGusti`: venduto su prodotto, giorni
// in vetrina, venduto per settimana). Nessun conto nuovo.
//
// L'andamentino usa solo le settimane intere: una settimana tagliata dal
// periodo è più bassa senza che si sia venduto di meno, e la linea
// scendeva a ogni fine periodo. Le altre restano un buco.

/**
 * @param {Array} perGusto  `valutaGusti(...).righe`
 * @param {{ settimane: string[], gusti: object }} andamento  `andamentoGusti(...)`
 * @param {Set<string>} [settimaneIntere]  chiavi «2026-W28» delle settimane intere
 */
export function righeGusti(perGusto = [], andamento = null, settimaneIntere = null) {
  const settimane = andamento?.settimane || []
  return perGusto
    .filter(r => r.vendKg !== 0 || r.prodKg !== 0)
    .map(r => {
      const a = andamento?.gusti?.[r.gusto] || {}
      const serie = (a.perSettimana || []).map((g, i) =>
        (g == null || (settimaneIntere && !settimaneIntere.has(settimane[i])) ? null : g / 1000))
      return {
        ...r,
        quotaVenduta: a.quotaVenduta ?? null,
        giorniVetrina: a.giorniVetrina ?? null,
        serie,
      }
    })
}

/** Gli ordinamenti della tabella (sul telefono, dietro un pulsante). */
export const ORDINI = [
  { id: 'vendKg', label: 'Venduto' },
  { id: 'margine', label: 'Margine' },
  { id: 'giorniVetrina', label: 'Giorni in vetrina' },
  { id: 'quotaVenduta', label: 'Venduto su prodotto' },
  { id: 'gusto', label: 'Nome' },
]

/**
 * Ordina senza toccare l'elenco di partenza. Un valore che non si sa (null)
 * va in fondo in tutti e due i versi: `null - 3` fa −3 e lo metterebbe a
 * caso in mezzo alla classifica.
 */
export function ordinaGusti(righe = [], chiave = 'vendKg', verso = 'desc') {
  const dir = verso === 'asc' ? 1 : -1
  return [...righe].sort((x, y) => {
    const a = x[chiave]
    const b = y[chiave]
    if (chiave === 'gusto') return String(a).localeCompare(String(b), 'it') * dir
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return (a - b) * dir || String(x.gusto).localeCompare(String(y.gusto), 'it')
  })
}

/** Il verso naturale di ogni colonna: i nomi dalla A, i numeri dal più grande. */
export const versoIniziale = (chiave) => (chiave === 'gusto' ? 'asc' : 'desc')

/**
 * La classifica del venduto: i primi `n` gusti e tutti gli altri insieme
 * (ricerca del 04/10, scelta 13: «primi 7 + Altro», come Toast e Qonto).
 *
 * @returns {{ voci: { gusto: string, kg: number, quota: number|null }[],
 *   altri: { n: number, kg: number, quota: number|null } | null, totaleKg: number }}
 */
export function classificaGusti(righe = [], n = 7) {
  const ordinate = [...righe].sort((x, y) => y.vendKg - x.vendKg || String(x.gusto).localeCompare(String(y.gusto), 'it'))
  const totaleKg = ordinate.reduce((s, r) => s + r.vendKg, 0)
  const quota = (kg) => (totaleKg > 0 ? (kg / totaleKg) * 100 : null)
  // Un «Altri 1 gusto» non ha senso: se resta un gusto solo, entra.
  const primi = ordinate.length <= n + 1 ? ordinate : ordinate.slice(0, n)
  const resto = ordinate.slice(primi.length)
  const kgResto = resto.reduce((s, r) => s + r.vendKg, 0)
  return {
    voci: primi.map(r => ({ gusto: r.gusto, kg: r.vendKg, quota: quota(r.vendKg) })),
    altri: resto.length ? { n: resto.length, kg: kgResto, quota: quota(kgResto) } : null,
    totaleKg,
  }
}
