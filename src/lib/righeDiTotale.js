// ── Le righe di totale non sono dati ──────────────────────────────────────
//
// Quasi ogni file che arriva da un cliente ha in fondo una riga «TOTALE
// 4.850 €», e spesso anche dei «Subtotale» in mezzo, uno per famiglia di
// prodotti. Se l'import le legge come righe normali nasce una materia prima
// che si chiama TOTALE e costa 4.850 € al chilo, oppure una giornata di
// incasso che vale un mese.
//
// Decisione del titolare, 22/09/2026: «saltale però dicendolo, anche
// subtotale, tot. ecc e tutti i simili, dai comunque l'avviso».
//
// Le due metà contano uguale:
//
//   • **saltarle** — un totale importato è un dato falso che poi entra nel
//     food cost e nel P&L;
//   • **dirlo** — saltare in silenzio è come non leggerle: chi guarda il
//     riepilogo vede «120 righe importate» su un file di 123 e non sa se le
//     tre mancanti erano totali o merce vera.
//
// Questo riconoscitore stava scritto dentro `importIncassi.js` in una forma
// più stretta (`tot` all'inizio, o «totale mese») e lì saltava in silenzio.
// Adesso è uno solo per tutto il prodotto, e restituisce **cosa** ha saltato.

/** Minuscolo, senza accenti, senza punteggiatura: «Tot.» e «TOT» sono la stessa parola. */
function norm(v) {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Le parole che in un foglio italiano introducono una somma, non un dato.
// «tot» e «tot.» sono la stessa cosa; «a riportare» e «riporto» sono il modo
// in cui si spezza un totale su due pagine.
const PAROLE = [
  'totale', 'totali', 'tot', 'subtotale', 'subtotali', 'sub totale',
  'somma', 'sommano', 'riepilogo', 'riporto', 'a riportare', 'riportare',
  'totale generale', 'totale complessivo', 'totale mese', 'totale anno',
  'saldo', 'complessivo',
]

/**
 * È una riga di totale?
 *
 * Si guarda la prima cella scritta — nei fogli veri il totale sta lì, e il
 * resto della riga sono numeri. La parola deve essere **all'inizio**: una
 * materia prima che si chiama «Panettone totale artigianale» non è un totale,
 * e buttarla via sarebbe peggio che importare una somma.
 */
export function eRigaDiTotale(valore) {
  const n = norm(valore)
  if (!n) return false
  return PAROLE.some(p => n === p || n.startsWith(p + ' '))
}

/**
 * Le righe di un foglio, divise in quelle da importare e quelle da saltare.
 *
 * @param {Array} righe
 * @param {(r:any)=>any} primaCella  come si legge la prima cella scritta di una riga
 * @returns {{tenute: Array, saltate: Array<{riga:any, testo:string, indice:number}>}}
 */
export function dividiRigheDiTotale(righe, primaCella) {
  const tenute = []
  const saltate = []
  const leggi = typeof primaCella === 'function'
    ? primaCella
    : (r) => (r && typeof r === 'object' ? Object.values(r).find(v => String(v ?? '').trim() !== '') : r)
  for (let i = 0; i < (righe || []).length; i++) {
    const r = righe[i]
    const cella = leggi(r)
    if (eRigaDiTotale(cella)) saltate.push({ riga: r, testo: String(cella ?? '').trim(), indice: i })
    else tenute.push(r)
  }
  return { tenute, saltate }
}

/**
 * L'avviso da mostrare, in italiano, o `null` se non c'è niente da dire.
 *
 * Fa i nomi: «ho saltato TOTALE MESE» si controlla in due secondi, «ho saltato
 * 3 righe» manda a cercare.
 */
export function avvisoRigheDiTotale(saltate) {
  const n = (saltate || []).length
  if (n === 0) return null
  const nomi = [...new Set(saltate.map(s => s.testo).filter(Boolean))]
  const elenco = nomi.slice(0, 4).join(', ') + (nomi.length > 4 ? `, e altre ${nomi.length - 4}` : '')
  return n === 1
    ? `Ho saltato una riga di totale (${elenco}): è una somma, non un dato da importare.`
    : `Ho saltato ${n.toLocaleString('it-IT', { useGrouping: 'always' })} righe di totale (${elenco}): sono somme, non dati da importare.`
}
