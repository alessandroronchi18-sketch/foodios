// ── I totali del P&L si fanno solo su quello che si sa ────────────────
//
// 16/09/2026, aprendo il P&L dentro l'account vero di Mara dei Boschi:
//
//     Food cost tot.   72 €
//     FC ratio          4,6%
//
// Per una gelateria è un numero impossibile: il food cost normale sta fra il
// 25 e il 35 per cento. Usciva così perché la somma prendeva il food cost di
// 48 prodotti, e di 44 di quei 48 il costo era INCOMPLETO — mancava il prezzo
// di almeno un ingrediente, quindi quello che veniva sommato era una briciola
// del costo vero. Sui 4 prodotti di cui si conosce tutto il ratio è 8,5%.
//
// Metà del controllo c'era già: i prodotti senza prezzo di vendita erano
// esclusi, perché una percentuale su un ricavo che non esiste non si può
// fare. Mancava l'altra metà, quella sul COSTO. È la stessa famiglia della
// media del Ricettario (`mediaFoodCost.js`) e della tabella di sensibilità
// del P&L (`plSensibilita.js`): ovunque si sommi o si divida un costo, quel
// costo deve essere completo, non soltanto diverso da zero.
//
// Ricavo, food cost e margine si calcolano tutti e tre sullo STESSO insieme
// di prodotti. Se il ricavo comprendesse anche i prodotti dal costo
// incompleto, il margine mostrato non sarebbe la differenza fra i due numeri
// scritti sopra, e il conto economico si contraddirebbe da solo.
//
// Quello che resta fuori si conta, diviso per motivo: «manca il prezzo di
// vendita» si risolve nel Listino, «manca il prezzo di un ingrediente» si
// risolve nel Ricettario. Sono due lavori diversi, e dirlo insieme non aiuta
// nessuno.

/**
 * @param {Array<{ricavo:number, fc:number, margine:number, margPct:number,
 *                senzaPrezzo?:boolean, fcParziale?:boolean}>} rows
 * @returns {{
 *   righe:Array, totRicavo:number, totFC:number, totMargine:number,
 *   fcAvg:number, avgMarg:number,
 *   nSenzaPrezzo:number, fcSenzaPrezzo:number,
 *   nCostoIncompleto:number, ricavoCostoIncompleto:number,
 *   nEsclusi:number
 * }}
 *   `fcAvg` e `avgMarg` sono percentuali (8.5 = 8,5%).
 */
export function totaliSuCostiNoti(rows) {
  const tutte = Array.isArray(rows) ? rows : []
  // `senzaPrezzo` è il giudizio che la pagina ha già dato; `ricavo > 0` è la
  // stessa cosa verificata sul numero. Servono tutti e due: una riga rotta o
  // costruita altrove può non avere la bandierina, e senza ricavo non c'è
  // niente da dividere.
  const conPrezzo = tutte.filter(r => !r?.senzaPrezzo && Number(r?.ricavo) > 0)
  const righe = conPrezzo.filter(r => !r?.fcParziale)
  const somma = (arr, k) => arr.reduce((s, r) => s + (Number(r?.[k]) || 0), 0)

  const totRicavo = somma(righe, 'ricavo')
  const totFC = somma(righe, 'fc')
  const totMargine = somma(righe, 'margine')
  const incomplete = conPrezzo.filter(r => r?.fcParziale)

  return {
    righe,
    totRicavo,
    totFC,
    totMargine,
    fcAvg: totRicavo > 0 ? (totFC / totRicavo) * 100 : 0,
    // Media dei margini di prodotto, non margine del totale: è la grandezza
    // che la pagina chiama «margine medio» ed è un'altra cosa.
    avgMarg: righe.length > 0 ? somma(righe, 'margPct') / righe.length : 0,
    nSenzaPrezzo: tutte.length - conPrezzo.length,
    // Il food cost dei prodotti senza prezzo esiste anche se non entra nei
    // rapporti, e va detto: altrimenti sembra che non costino niente.
    fcSenzaPrezzo: somma(tutte.filter(r => r?.senzaPrezzo), 'fc'),
    nCostoIncompleto: incomplete.length,
    // Il ricavo dei prodotti dal costo incompleto, invece, si conosce: serve
    // per dire quanto fatturato resta fuori dal conto economico teorico.
    ricavoCostoIncompleto: somma(incomplete, 'ricavo'),
    nEsclusi: tutte.length - righe.length,
  }
}
