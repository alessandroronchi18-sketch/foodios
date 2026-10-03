// ── Produzione: quanto vale quello che si è prodotto e venduto ─────────────
//
// Il conto per gusto dello Storico produzione (metodo a inventario), tolto
// dalla pagina e messo qui, senza schermo e senza database, perché si possa
// provare con i numeri veri.
//
// ── Perché esiste (03/10/2026) ────────────────────────────────────────────
//
// La pagina faceva questo conto per conto suo, due volte (periodo e periodo
// di confronto), e tutte e due le copie chiamavano
// `calcolaFC(ricetta, ricettario)`: la firma vera è
// `calcolaFC(ricetta, ingCosti, ricettario)`. Al posto dei prezzi degli
// ingredienti arrivava il ricettario, quindi nessun ingrediente aveva prezzo.
// In più leggevano `.foodCost`, un campo che `calcolaFC` non restituisce
// (restituisce `tot`). Il food cost di ogni gusto era zero e il margine il
// 100% del ricavo. Sui dati di Mara dei Boschi, 03/08-03/10, tutte le sedi:
// «Margine 88.970 € (100,0%)», contro 75.087 € (84,4%) veri.
//
// Lo stesso difetto era già stato corretto nel conto economico (PLView), ma
// questa copia non era mai stata allineata. E anche quella correzione aveva un
// secondo errore: `calcolaFC` dà il costo dell'impasto INTERO, non di un chilo.
// BOCUSE costa 8,31 € per 1.192 g di impasto: 6,97 €/kg, non 8,31. Su Mara 11
// ricette su 15 hanno una resa diversa da 1.000 g, e il food cost usciva più
// alto del 10%. Qui si divide per la resa, come fa già il listino del conto
// economico (`resaGrammi`).
import { calcolaFC, isRicettaValida, resaGrammi } from './foodcost'

/**
 * Il costo delle materie prime di UN CHILO di gusto finito.
 *
 * Ritorna { fcKg, mancanti, completo }:
 *   - fcKg: €/kg, o null se la ricetta non ha un peso (né resa né ingredienti);
 *   - mancanti: gli ingredienti senza prezzo (dentro le basi compresi);
 *   - completo: c'è un costo e nessun ingrediente manca. Un costo a metà
 *     non è un costo: il margine che ne esce è più alto del vero.
 */
export function costoAlKgGusto(ric, ingCosti, ricettario) {
  if (!ric) return { fcKg: null, mancanti: [], completo: false }
  const { tot, mancanti } = calcolaFC(ric, ingCosti || {}, ricettario)
  const resaG = resaGrammi(ric)
  if (!(resaG > 0)) return { fcKg: null, mancanti: mancanti || [], completo: false }
  const fcKg = (Number(tot) || 0) / (resaG / 1000)
  return {
    fcKg,
    mancanti: mancanti || [],
    completo: fcKg > 0 && (mancanti || []).length === 0,
  }
}

/**
 * Il valore di ogni gusto in un periodo.
 *
 * `totali` è l'uscita di `totaliPerGusto` (grammi). Le dipendenze arrivano da
 * fuori perché la pagina le ha già (e i test le possono fingere):
 *   - ricettaDi(gusto)  → la ricetta del gusto, o null;
 *   - ricavoKgDi(ric)   → €/kg di vendita (dai formati), o null;
 *   - ingCosti, ricettario → per il food cost.
 *
 * La regola del margine: si calcola SOLO sui gusti che hanno sia il ricavo
 * sia il costo completo. Un gusto con il ricavo e senza costo farebbe un
 * margine del 100%, cioè lo stesso difetto di prima in un'altra forma. Quei
 * gusti restano nei chili e nel ricavo, e il totale dice su quanti gusti il
 * margine è calcolato.
 */
export function valutaGusti(totali, { ricettaDi, ricavoKgDi, ingCosti, ricettario } = {}) {
  const righe = []
  for (const [gusto, t] of Object.entries(totali || {})) {
    const ric = ricettaDi ? ricettaDi(gusto) : null
    const ricavoKg = ric ? (Number(ricavoKgDi ? ricavoKgDi(ric) : 0) || 0) : 0
    const costo = ric && isRicettaValida(ric.nome) ? costoAlKgGusto(ric, ingCosti, ricettario) : null
    const fcKg = Number(costo?.fcKg) || 0
    const prodKg = (Number(t?.prodTot) || 0) / 1000
    const vendKg = (Number(t?.vendTot) || 0) / 1000
    const scartoKg = (Number(t?.scartoTot) || 0) / 1000
    const ricavo = vendKg * ricavoKg
    // Il costo è quello di ciò che si è PRODOTTO: il gelato rimasto in vetrina
    // è già stato pagato, anche se non è ancora stato venduto.
    const fc = prodKg * fcKg
    const haRicavo = ricavoKg > 0
    const haFc = fcKg > 0
    const fcCompleto = !!costo?.completo
    const margine = haRicavo && fcCompleto ? ricavo - fc : null
    const margPct = margine != null && ricavo > 0 ? (margine / ricavo) * 100 : null
    righe.push({
      gusto,
      ricetta: ric?.nome || null,
      prodKg, vendKg, scartoKg,
      ricavoKg, fcKg, ricavo, fc, margine, margPct,
      haRicetta: !!ric, haRicavo, haFc, fcCompleto,
      mancanti: costo?.mancanti || [],
      celleNonQuadrate: Number(t?.celleNonQuadrate) || 0,
      celleNonCalcolabili: Number(t?.celleNonCalcolabili) || 0,
    })
  }
  return { righe, totali: sommaGusti(righe) }
}

/** I totali di un elenco di gusti valutati, con la stessa regola del margine. */
export function sommaGusti(righe) {
  let prod = 0, vend = 0, scarto = 0, ricavo = 0, fc = 0
  let margine = 0, ricavoConMargine = 0, nConMargine = 0, vendConMargine = 0
  let nConVendita = 0
  for (const r of righe || []) {
    prod += r.prodKg; vend += r.vendKg; scarto += r.scartoKg
    ricavo += r.ricavo; fc += r.fc
    // Un gusto senza movimenti nel periodo (una riga lasciata a zero) non
    // conta né fra quelli venduti né fra quelli col margine: «su 16 gusti su
    // 25» deve contare gusti veri.
    const attivo = r.vendKg !== 0 || r.prodKg !== 0
    if (attivo) nConVendita++
    if (r.margine != null) {
      margine += r.margine
      ricavoConMargine += r.ricavo
      vendConMargine += r.vendKg
      if (attivo) nConMargine++
    }
  }
  return {
    prod, vend, scarto, ricavo, fc,
    // null, non zero: se nessun gusto ha ricavo e costo, il margine non si sa.
    margine: nConMargine > 0 ? margine : null,
    margPct: nConMargine > 0 && ricavoConMargine > 0 ? (margine / ricavoConMargine) * 100 : null,
    ricavoConMargine, vendConMargine, nConMargine, nConVendita,
  }
}
