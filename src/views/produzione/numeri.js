// ── Come la pagina Produzione scrive chili, percentuali e periodi ─────────
//
// Le regole sono quelle di ANALISI_DESIGN.md (§2.6): punto delle migliaia
// sempre, al massimo un decimale, € dopo la cifra. Gli euro e le quote li
// scrive `lib/formatoAnalisi`; qui ci sono solo i chili, che quella libreria
// non conosce, e due frasi sui periodi che servono in più punti della pagina.

import { senzaIva, ALIQUOTA_IVA_INCASSI } from '../../lib/ilMese'

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

// ── Le colonne: stessi decimali in tutte le righe ─────────────────────────
//
// ANALISI_DESIGN.md §6: in una colonna di numeri tutte le righe hanno gli
// stessi decimali, se no le cifre non si incolonnano («865» sotto «874,2»,
// «90%» sotto «77,5%»). Le foto del 04/10 lo mostravano nella tabella dei
// gusti, nel conto della vetrina e nei giorni della settimana.
const nfFisso = (d) => new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: d, maximumFractionDigits: d })
const NF_FISSO = [nfFisso(0), nfFisso(1), nfFisso(2)]

/** «865,0» con un decimale sempre (o `d` decimali). */
export function numFisso(n, d = 1) {
  if (!finito(n)) return null
  return NF_FISSO[d].format(Number(n))
}

/** «865,0 kg». */
export const kgFisso = (n, d = 1) => (finito(n) ? `${numFisso(n, d)} kg` : null)

/** «101,0%», col segno meno vero se negativo. */
export function quotaFissa(n, d = 1) {
  if (!finito(n)) return null
  const v = Number(n)
  return `${v < 0 ? '−' : ''}${NF_FISSO[d].format(Math.abs(v))}%`
}

// ── Senza IVA, come il Mese ───────────────────────────────────────────────
//
// Decisione del titolare, 04/10/2026: il ricavo stimato è lo stesso numero
// in tutte le pagine, e il Mese lo mostra senza IVA (i prezzi dei formati
// sono quelli al banco, IVA compresa). Stessa funzione e stessa aliquota del
// Mese; il margine si calcola su questo, contro costi degli ingredienti che
// sono senza IVA.

export const ALIQUOTA_IVA = ALIQUOTA_IVA_INCASSI

/** Il ricavo (o l'incasso) senza IVA, arrotondato ai centesimi come nel Mese. */
export const nettoIva = (lordo) => (finito(lordo) ? senzaIva(Number(lordo), ALIQUOTA_IVA_INCASSI) : null)

/** Il prezzo al chilo senza IVA, senza arrotondare (per moltiplicarlo). */
export const prezzoNetto = (lordo) => (finito(lordo) ? Number(lordo) / (1 + ALIQUOTA_IVA_INCASSI / 100) : null)
