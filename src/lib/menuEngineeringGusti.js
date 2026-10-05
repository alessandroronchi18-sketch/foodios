// Il menu engineering dei gusti (matrice di Kasavana-Smith), per la gelateria.
//
// Perché esiste (05/10/2026). La pagina Menu engineering prendeva le vendite
// per prodotto da un vecchio archivio delle chiusure (`pasticceria-chiusure-v1`)
// che per Mara è vuoto: zero righe. Le vendite per gusto stanno
// nell'inventario, e la Produzione le legge già. Qui si usano quelle, con gli
// stessi conti della Produzione (`valutaGusti`): i chili venduti e il margine
// di ogni gusto sono gli stessi numeri nelle due pagine.
//
// Le due soglie sono quelle del metodo originale, non la media semplice:
//   • popolare: vende almeno il 70% della quota media (1/N del venduto). Con
//     la media piena metà dei gusti risulta «poco venduta» per definizione:
//     la Nocciola, 465 kg contro una media di 503, finiva fra quelli da
//     rivedere;
//   • redditizio: lascia al chilo almeno il margine medio PESATO sui chili
//     (il margine di tutti i gusti diviso i chili venduti), non la media dei
//     margini, che dà lo stesso peso a un gusto da 30 kg e a uno da 1.000.
//
// Il margine è quello della Produzione: ricavo (chili venduti per il prezzo
// medio dei formati, senza IVA) meno il costo di quello che si è prodotto.
// Diviso per i chili venduti, un gusto che si butta spesso rende meno, ed è
// vero.

export const SOGLIA_POPOLARITA = 0.7

// I nomi dicono cosa fare (come nella pagina di prima), e i consigli sono
// quelli che si possono fare con il gelato: il prezzo sta sul formato, non
// sul gusto, quindi «alza il prezzo» di un gusto solo non esiste.
export const GRUPPI = {
  tenere: {
    nome: 'Da tenere',
    breve: 'Vendono tanto e rendono più della media.',
    consiglio: 'Non toccarli: sempre in vetrina, sempre pieni.',
  },
  curare: {
    nome: 'Da curare',
    breve: 'Vendono tanto ma rendono meno della media.',
    consiglio: 'Guarda l\'ingrediente che pesa di più e il prezzo che lo paghi, o mettili fra i gusti col supplemento.',
  },
  spingere: {
    nome: 'Da spingere',
    breve: 'Rendono più della media ma se ne vende poco.',
    consiglio: 'Mettili più in vista e falli assaggiare.',
  },
  rivedere: {
    nome: 'Da rivedere',
    breve: 'Vendono poco e rendono meno della media.',
    consiglio: 'Valuta se tenerli in vetrina o sostituirli.',
  },
}
export const ORDINE_GRUPPI = ['tenere', 'curare', 'spingere', 'rivedere']

const somma = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0)

/**
 * @param {object[]} righe  da `valutaGusti(...).righe`: gusto, ricetta,
 *   vendKg, margine (null se manca il ricavo o il costo completo), haRicetta
 * @returns {{
 *   gusti: { gusto: string, ricetta: string|null, kg: number, quotaKg: number,
 *     margine: number, margineKg: number, gruppo: string }[],
 *   perGruppo: { id: string, n: number, kg: number, margine: number, quotaMargine: number|null }[],
 *   soglie: { kg: number|null, margineKg: number|null },
 *   totali: { kg: number, margine: number, kgVenduti: number },
 *   fuori: { senzaRicetta: { n: number, kg: number, gusti: string[] },
 *            senzaMargine: { n: number, kg: number, gusti: string[] }, quotaKg: number|null },
 * }}
 *   `gusti` dal margine totale più alto. `fuori` sono i gusti venduti che
 *   nella matrice non possono stare: senza ricetta, o senza il margine
 *   (costo incompleto o prezzo dei formati che manca).
 */
export function matriceGusti(righe = []) {
  const venduti = (righe || []).filter(r => Number(r?.vendKg) > 0)
  const dentro = venduti.filter(r => r.haRicetta && r.margine != null && Number.isFinite(Number(r.margine)))
  const senzaRicetta = venduti.filter(r => !r.haRicetta).sort((a, b) => b.vendKg - a.vendKg)
  const senzaMargine = venduti.filter(r => r.haRicetta && !(r.margine != null && Number.isFinite(Number(r.margine))))
    .sort((a, b) => b.vendKg - a.vendKg)

  const kg = somma(dentro, r => r.vendKg)
  const margine = somma(dentro, r => r.margine)
  const kgVenduti = somma(venduti, r => r.vendKg)
  const n = dentro.length
  const sogliaKg = n > 0 ? (SOGLIA_POPOLARITA * kg) / n : null
  const sogliaMargineKg = kg > 0 ? margine / kg : null

  const gusti = dentro.map(r => {
    const margineKg = r.margine / r.vendKg
    const popolare = r.vendKg >= sogliaKg
    const rende = margineKg >= sogliaMargineKg
    const gruppo = popolare ? (rende ? 'tenere' : 'curare') : (rende ? 'spingere' : 'rivedere')
    return {
      gusto: r.gusto, ricetta: r.ricetta || null, kg: r.vendKg,
      quotaKg: kg > 0 ? (r.vendKg / kg) * 100 : 0,
      margine: r.margine, margineKg, gruppo,
    }
  }).sort((a, b) => b.margine - a.margine || b.kg - a.kg)

  const perGruppo = ORDINE_GRUPPI.map(id => {
    const g = gusti.filter(x => x.gruppo === id)
    const m = somma(g, x => x.margine)
    return { id, n: g.length, kg: somma(g, x => x.kg), margine: m, quotaMargine: margine > 0 ? (m / margine) * 100 : null }
  })

  return {
    gusti,
    perGruppo,
    soglie: { kg: sogliaKg, margineKg: sogliaMargineKg },
    totali: { kg, margine, kgVenduti },
    fuori: {
      senzaRicetta: { n: senzaRicetta.length, kg: somma(senzaRicetta, r => r.vendKg), gusti: senzaRicetta.map(r => r.gusto) },
      senzaMargine: { n: senzaMargine.length, kg: somma(senzaMargine, r => r.vendKg), gusti: senzaMargine.map(r => r.gusto) },
      quotaKg: kgVenduti > 0 ? ((kgVenduti - kg) / kgVenduti) * 100 : null,
    },
  }
}
