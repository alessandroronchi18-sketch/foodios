// Quanti pezzi ci sono in una confezione, quando lo dice la descrizione.
//
// ── Il difetto vero ──────────────────────────────────────────────────────
//
// ConoArtic — il fornitore del monouso di Mara — non ha una colonna «pezzi
// per confezione». Il numero lo scrive **dentro la descrizione**, e la bolla
// poi conta le confezioni:
//
//     COPPETTA BIO 16/B MARA N.250     CF   4
//
// Sono 1.000 coppette, non 4. Se in magazzino entrano 4, la giacenza del
// monouso è sbagliata di 250 volte, e il costo per coppetta con lei: 0,04 €
// diventa 10 €. Su un gelato da 3,50 € non è un dettaglio.
//
// ── Perché non basta «prendi il primo numero» ────────────────────────────
//
// Nella stessa riga di descrizione ci sono fino a tre numeri, e due su tre
// non sono un conteggio. Tutti questi sono casi veri, letti sulle bolle
// ConoArtic del design partner il 22/09/2026:
//
//   COPPETTA BIO 16/B MARA N.250      il 16/B è il modello       → 250
//   COPPETTA BIO 108 MARA N.250       il 108 è il modello        → 250
//   BICCH.BAMBOO 200cc N.50           il 200cc è la capacità     → 50
//   COPPA BIO ESAG/TR. 300cc N.40     idem                       → 40
//   BICCHIERE 42BP MARA N.100         il 42BP è il modello       → 100
//   RE-MXGEL NATURE 500gr.60 PZ.      il 500gr è il peso         → 60
//   TOVAGLIOLO MARA N. 12.000         dodicimila, all'italiana   → 12000
//   CANN.21/6 COMPOST-BIA pz500       il 21/6 è la misura        → 500
//
// Il primo numero è quello sbagliato in sei casi su otto. Quello giusto è
// **solo quello annunciato da un marchio**: `N.` davanti, oppure `PZ` /
// `pz.` / `PZ.` attaccato prima o dopo. Senza marchio non si risponde:
//
//   GIANDUIA SCURA (KG.3)                         è un peso      → null
//   BASE LATTE MARA KG 5X2                        formato a peso → null
//   PASTA NOCCIOLA PIEMONTE I.G.P. delle LANGHE   niente         → null
//
// `null` vuol dire «non lo so», e chi chiama lo chiede. Un numero indovinato
// qui non si vede a schermo: si vede sei mesi dopo, in un food cost storto.

/**
 * Un numero scritto all'italiana o all'inglese, o `null`.
 *
 * `12.000` è dodicimila (migliaia all'italiana), `3,1` è tre virgola uno,
 * `0.5` è mezzo. La regola che li distingue è la stessa di `righeBolla.js`:
 * il punto fa le migliaia solo quando dietro ha esattamente tre cifre.
 */
function num(v) {
  const t = String(v ?? '').trim()
  if (!t) return null
  const migliaia = /^\d{1,3}(\.\d{3})+$/.test(t)
  const n = Number(migliaia ? t.replace(/\./g, '') : t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Il marchio del conteggio, nelle due direzioni in cui ConoArtic lo scrive.
//
//   «N.250», «N. 12.000», «NR 6»      → il numero viene dopo
//   «288 PZ.», «645 pz.», «60 PZ.»    → il numero viene prima
//   «pz500»                           → il numero viene dopo
//
// L'ordine conta: `N.` è il marchio che ConoArtic usa quasi sempre, e nelle
// righe dove c'è anche un peso («500gr.60 PZ.») è quello che non sbaglia.
const NUMERO = String.raw`\d{1,3}(?:\.\d{3})+|\d+`
const MARCHI = [
  new RegExp(String.raw`\bn(?:r|umero)?\s*[.°:]?\s*(${NUMERO})\b`, 'i'),
  new RegExp(String.raw`(${NUMERO})\s*(?:pz|pezzi|pcs)\b`, 'i'),
  new RegExp(String.raw`\b(?:pz|pezzi|pcs)\s*[.:]?\s*(${NUMERO})\b`, 'i'),
]

/**
 * Quanti pezzi ci sono in una confezione, secondo la descrizione.
 *
 * @param {string} descrizione  la descrizione come la stampa il fornitore
 * @returns {number|null} il conteggio, o `null` se nella descrizione non c'è
 *   un numero **annunciato**. Nel dubbio `null`: mai indovinare.
 */
export function pezziPerConfezione(descrizione) {
  const t = String(descrizione ?? '')
  if (!t.trim()) return null
  for (const re of MARCHI) {
    const m = t.match(re)
    if (!m) continue
    const n = num(m[1])
    // Un conteggio di pezzi è un intero positivo. Mezzo tovagliolo non
    // esiste, e un milione di coppette in una scatola nemmeno: se il numero
    // non è credibile si dice «non lo so» invece di scriverlo in magazzino.
    if (n == null || !Number.isInteger(n) || n < 1 || n > 1000000) continue
    return n
  }
  return null
}

// Le unità di peso, e il moltiplicatore per arrivare ai grammi.
const PESI = { kg: 1000, kgr: 1000, chilo: 1000, chili: 1000, chilogrammi: 1000, g: 1, gr: 1, grammi: 1, hg: 100 }
const UNITA = Object.keys(PESI).sort((a, b) => b.length - a.length).join('|')

// «25KG», «500gr», «3,1 kg» — il numero davanti all'unità.
const PESO_PRIMA = new RegExp(String.raw`(\d{1,4}(?:[.,]\d{1,3})?)\s*(${UNITA})\b`, 'i')
// «KG.3», «KG 5X2», «Kg. 3,1» — l'unità davanti al numero, come scrive Galatea.
const PESO_DOPO = new RegExp(String.raw`\b(${UNITA})\s*[.:]?\s*(\d{1,4}(?:[.,]\d{1,3})?)`, 'i')

/**
 * Quanto pesa una confezione, in grammi, quando la descrizione lo dice.
 *
 * Serve per la merce che si compra a peso e non a pezzi: `GIANDUIA SCURA
 * (KG.3)` → 3000, `SACCO 25KG` → 25000, `500gr` → 500.
 *
 * Sulle confezioni multiple — `BASE LATTE MARA KG 5X2`, `POLPA DI MANGO
 * KG.3,1x4` — il primo numero è il peso di **una** confezione e il secondo è
 * quante ce ne sono. Non è una supposizione: sulla bolla Galatea 001821/2 del
 * 13/05/2026 la riga `POLPA DI MANGO KG.3,1x4` ha quantità 3,1 KG, prezzo
 * 6,000 €/kg e imponibile 18,60 € — 3,1 × 6,00. Il 4 è il confezionamento,
 * non entra nel peso del pezzo.
 *
 * I centilitri e i millilitri non sono un peso: `BICCH.BAMBOO 200cc` è una
 * capacità, e qui torna `null`.
 *
 * @param {string} descrizione
 * @returns {number|null} i grammi, o `null` se non c'è scritto un peso
 */
export function pesoConfezioneGDaDescrizione(descrizione) {
  const t = String(descrizione ?? '')
  if (!t.trim()) return null
  for (const [re, iNum, iUni] of [[PESO_PRIMA, 1, 2], [PESO_DOPO, 2, 1]]) {
    const m = t.match(re)
    if (!m) continue
    const n = num(m[iNum])
    if (n == null || n <= 0) continue
    const g = n * PESI[m[iUni].toLowerCase()]
    // Sotto il grammo o sopra la tonnellata non è una confezione: è un
    // numero letto storto.
    if (g < 1 || g > 1000000) continue
    return Math.round(g * 1000) / 1000
  }
  return null
}
