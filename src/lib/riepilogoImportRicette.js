// ── Il riepilogo di un import del ricettario ──────────────────────────────
//
// Prima di riscrivere il ricettario il programma dice cosa ha letto: quante
// ricette, quante sostituiscono roba che c'è già, quante sono senza prezzo di
// vendita, quali hanno quantità fuori scala. È la domanda più pericolosa del
// prodotto — dietro c'è la riscrittura di tutto il ricettario — e il testo di
// quella domanda è l'unica cosa che sta fra un import buono e uno che cancella
// mesi di lavoro.
//
// Stava dentro `Dashboard.jsx`, in mezzo al gestore dell'import: venti righe
// di conti che nessuna prova poteva raggiungere senza montare tutto il telaio.
// Qui è una funzione pura, e le prove la interrogano direttamente.
//
// Le frasi sono quelle di prima, parola per parola: questo spostamento non
// doveva cambiare niente di quello che si legge.

/** Oltre venti chili di un solo ingrediente in una ricetta: quasi sempre è
 *  un errore di unità nel file (grammi scritti dove andavano i chili). */
export const FUORI_SCALA_G = 20000

/**
 * @param {Array} letti      i file letti: `{ nome, result: { ricette, source, truncated } }`
 * @param {object} base      il ricettario come sarà DOPO l'import
 * @param {object} ricettario il ricettario di adesso (per sapere cosa viene sostituito)
 * @param {boolean} isMetodoInv l'azienda lavora a inventario (cambia come si
 *                              trattano le ricette senza tipo)
 * @returns {{righe: string[], nuove: string[], senzaPrezzo: number}}
 */
export function riepilogoImport(letti, base, ricettario, isMetodoInv) {
  const files = Array.isArray(letti) ? letti : []
  const nuove = files.flatMap(l => Object.keys(l?.result?.ricette || {}))
  const giaPresenti = ricettario ? nuove.filter(n => ricettario.ricette?.[n]) : []
  const tutte = nuove.map(n => base?.ricette?.[n])
  const senzaPrezzo = tutte.filter(r => !(Number(r?.prezzo) > 0)).length
  const senzaUnita = tutte.filter(r => r?.unita == null).length
  const senzaTipo = tutte.filter(r => !r?.tipo).length
  const sospette = tutte
    .filter(r => (r?.ingredienti || []).some(i => Number(i?.qty1stampo) > FUORI_SCALA_G))
    .map(r => r?.nome)
    .filter(Boolean)
  const conAi = files.filter(l => l?.result?.source === 'ai').map(l => l?.nome).filter(Boolean)
  const troncati = files.filter(l => l?.result?.truncated).map(l => l?.nome).filter(Boolean)

  const righe = [
    `${nuove.length} ricette lette da ${files.length === 1 ? 'un file' : files.length + ' file'}.`,
    giaPresenti.length > 0 ? `${giaPresenti.length} sostituiscono ricette che hai già: ${giaPresenti.slice(0, 6).join(', ')}${giaPresenti.length > 6 ? '…' : ''}` : null,
    senzaPrezzo > 0 ? `${senzaPrezzo} senza prezzo di vendita: il ricavo e il margine resteranno vuoti finché non lo scrivi.` : null,
    senzaUnita > 0 ? `${senzaUnita} senza il numero di pezzi per stampo.` : null,
    senzaTipo > 0 ? (isMetodoInv
      ? `${senzaTipo} senza tipo: le tratto come gusti di gelato, perché lavori col metodo inventario.`
      : `${senzaTipo} senza tipo: le tratto come torte a fette.`) : null,
    sospette.length > 0 ? `Attenzione, quantità fuori scala (oltre 20 kg di un solo ingrediente) in: ${sospette.slice(0, 5).join(', ')}. Nel file potrebbe esserci un punto di troppo.` : null,
    conAi.length > 0 ? `Letto con l'AI (controlla che sia giusto): ${conAi.join(', ')}` : null,
    troncati.length > 0 ? `File lungo, alcune ricette potrebbero mancare: ${troncati.join(', ')}` : null,
  ].filter(v => v !== null)

  return { righe, nuove, senzaPrezzo }
}
