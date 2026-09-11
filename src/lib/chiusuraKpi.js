// Calcolo dei totali della chiusura di cassa.
//
// Estratto da ChiusuraView.jsx, dove stava in mezzo a 1.400 righe di
// interfaccia. È il pezzo che produce i numeri che finiscono nel conto
// economico — ricavo, food cost, margine, sprechi — e non aveva un solo test.
//
// Tre sorgenti confluiscono nei totali, e vanno sommate tutte:
//
//   1. Le righe riconosciute per nome, che si agganciano a una ricetta del
//      ricettario e quindi hanno un food cost puntuale.
//   2. I formati di vendita, cioè le righe generiche dello scontrino ("cono
//      piccolo", "vaschetta 500") che non dicono il gusto: il loro food cost è
//      la media della categoria.
//   3. Sprechi e omaggi, che non passano dalla cassa ma sono costi veri:
//      ignorarli farebbe sembrare il margine migliore di quello che è.

/**
 * Totali di una giornata.
 *
 * @param {Array}  confronto  righe riconosciute: { rv, fcV, spreco, st }
 * @param {Array}  formati    righe generiche riconciliate: { rv, fcV }
 * @param {object} movimenti  aggregato sprechi/omaggi: { eurSpreco, eurOmaggio }
 * @returns totali + la scomposizione, utile per spiegarli a schermo
 */
export function calcolaKpiChiusura(confronto = [], formati = [], movimenti = {}) {
  const righe = Array.isArray(confronto) ? confronto : []
  const fmts  = Array.isArray(formati) ? formati : []

  const num = (v) => Number(v) || 0

  const ricaviRicette  = righe.reduce((s, r) => s + num(r.rv), 0)
  const ricaviFormati  = fmts.reduce((s, r) => s + num(r.rv), 0)
  const fcRicette      = righe.reduce((s, r) => s + num(r.fcV), 0)
  const fcFormati      = fmts.reduce((s, r) => s + num(r.fcV), 0)

  const eurSpreco  = num(movimenti?.eurSpreco)
  const eurOmaggio = num(movimenti?.eurOmaggio)
  // Sprechi e omaggi sono costo, non ricavo: entrano solo nel food cost.
  const fcMovimenti = eurSpreco + eurOmaggio

  const totV  = ricaviRicette + ricaviFormati
  const totFC = fcRicette + fcFormati + fcMovimenti
  const totM  = totV - totFC
  const totS  = righe.reduce((s, r) => s + num(r.spreco), 0) + eurSpreco
  const totMP = totV > 0 ? (totM / totV * 100) : 0

  // Sell-through: PEZZI VENDUTI sui PEZZI PRODOTTI, non la media delle
  // percentuali riga per riga.
  //
  // Era una media non pesata: un prodotto con 2 pezzi prodotti contava come
  // uno con 500. E questo numero finisce dentro ogni chiusura salvata, quindi
  // se lo portavano dietro lo storico, il confronto fra sedi e il conto
  // economico — dove veniva mediato una seconda e una terza volta, sempre
  // senza peso. Le chiusure vecchie non hanno il dettaglio dei pezzi: per
  // quelle resta la media di prima, che è meglio di niente.
  //
  // Righe senza `st` (un prodotto venduto ma mai prodotto) restano fuori: non
  // hanno una percentuale di smaltimento, e contarle come zero abbassava il
  // numero senza motivo.
  const conSt = righe.filter(r => r.st !== null && r.st !== undefined)
  const pezziProdotti = conSt.reduce((s, r) => s + num(r.unitaP), 0)
  const pezziVenduti  = conSt.reduce((s, r) => s + num(r.unitaV), 0)
  const avgST = pezziProdotti > 0
    ? (pezziVenduti / pezziProdotti) * 100
    // Nessun pezzo da confrontare: `null`, non zero. Uno zero qui veniva
    // colorato di rosso e letto come "non hai venduto niente", mentre vuol
    // dire "non c'è un confronto da fare".
    : (conSt.length > 0 ? conSt.reduce((s, r) => s + num(r.st), 0) / conSt.length : null)

  return {
    totV, totFC, totM, totS, totMP, avgST, pezziProdotti, pezziVenduti,
    dettaglio: { ricaviRicette, ricaviFormati, fcRicette, fcFormati, fcMovimenti, eurSpreco, eurOmaggio },
  }
}

/** Colore del semaforo sul sell-through, coerente con le altre viste. */
export function colorePerSellThrough(st, palette) {
  // Nessun dato non è un brutto risultato: prima `null` cadeva nell'ultimo
  // ramo e la tessera si colorava di ROSSO, come se non si fosse venduto
  // niente.
  if (st == null || !Number.isFinite(Number(st))) return palette.textSoft || palette.textMid
  if (st >= 85) return palette.green
  if (st >= 65) return palette.amber
  return palette.red
}
