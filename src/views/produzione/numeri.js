// ── Come la pagina Produzione scrive chili, percentuali e periodi ─────────
//
// Le regole sono quelle di ANALISI_DESIGN.md (§2.6): punto delle migliaia
// sempre, al massimo un decimale, € dopo la cifra. Gli euro e le quote li
// scrive `lib/formatoAnalisi`; qui ci sono solo i chili, che quella libreria
// non conosce, e due frasi sui periodi che servono in più punti della pagina.

const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const NF1 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 1 })

const finito = (n) => n != null && n !== '' && Number.isFinite(Number(n))

/** I chili di una cella di tabella: «1.142,2», «7», «0,5». */
export function kg(n) {
  if (!finito(n)) return null
  return NF1.format(Number(n))
}

/**
 * I chili di una tessera: interi da 100 kg in su («11.787 kg»), un decimale
 * sotto («7,4 kg»). Il decimale su undicimila chili è rumore.
 */
export function kgTessera(n) {
  if (!finito(n)) return null
  const v = Number(n)
  return `${Math.abs(v) >= 100 ? NF0.format(v) : NF1.format(v)} kg`
}

/** Un numero intero col punto delle migliaia: «1.181». */
export function intero(n) {
  return finito(n) ? NF0.format(Number(n)) : null
}

/** «1 gusto», «10 gusti». */
export function quanti(n, uno, tanti) {
  return `${intero(n)} ${Number(n) === 1 ? uno : tanti}`
}

/** «MAROTTO, FONDENTE e PISTACCHIO». */
export function elenco(nomi = []) {
  if (nomi.length <= 1) return nomi.join('')
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
}
