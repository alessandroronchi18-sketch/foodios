// ── Il calendario da muro dei giorni registrati ──────────────────────────
//
// Ricerca del 04/10/2026, scelta 6 (FT, Observable): i giorni registrati
// come un calendario da muro, sette colonne da lunedì a domenica, un mese per
// blocco, che Mara riconosce a colpo d'occhio. Gli stati non sono quantità,
// quindi niente scala di colore: registrato pieno, registrato solo in
// qualche sede a righe ambra, niente registrato con il contorno tratteggiato
// (può essere una chiusura o una dimenticanza: il programma non lo sa, e lo
// dice così).
//
// Un giorno conta come registrato con la stessa regola di tutta la pagina
// (`rigaHaDati`: un prodotto, una rimanenza o uno scarto scritti).
import { rigaHaDati } from '../../lib/produzioneAnalisi'

const piu = (iso, n) => {
  const t = new Date(`${iso}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const giornoSett = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() || 7

/**
 * @param {Array} righe
 * @param {{ da: string, a: string, sedi?: string[] }} o  `sedi`: gli id delle
 *   sedi guardate (per dire «solo in qualche sede»); vuoto = una sede sola
 * @returns {{ mesi: { chiave: string, settimane: ({ data, stato, sediRegistrate }|null)[][] }[],
 *   conteggio: { registrati: number, parziali: number, vuoti: number, totale: number } }}
 */
export function calendarioGiorni(righe = [], { da, a, sedi = [] } = {}) {
  const perGiorno = new Map()
  for (const r of righe || []) {
    if (!r?.data || r.data < da || r.data > a || !rigaHaDati(r)) continue
    if (!perGiorno.has(r.data)) perGiorno.set(r.data, new Set())
    perGiorno.get(r.data).add(r.sede_id || '_')
  }
  const nSedi = Math.max(1, sedi.length)
  const conteggio = { registrati: 0, parziali: 0, vuoti: 0, totale: 0 }
  const mesi = []
  let mese = null
  let settimana = null
  for (let d = da; d && a && d <= a; d = piu(d, 1)) {
    const chiave = d.slice(0, 7)
    if (!mese || mese.chiave !== chiave) {
      mese = { chiave, settimane: [] }
      mesi.push(mese)
      // La prima settimana del mese parte dal lunedì: i giorni prima restano vuoti.
      settimana = Array(giornoSett(d) - 1).fill(null)
      mese.settimane.push(settimana)
    } else if (giornoSett(d) === 1) {
      settimana = []
      mese.settimane.push(settimana)
    }
    const quante = perGiorno.get(d)?.size || 0
    const stato = quante === 0 ? 'vuoto' : quante >= nSedi ? 'registrato' : 'parziale'
    conteggio.totale++
    conteggio[stato === 'vuoto' ? 'vuoti' : stato === 'registrato' ? 'registrati' : 'parziali']++
    settimana.push({ data: d, stato, sediRegistrate: quante })
  }
  // Ogni settimana ha sette caselle: quelle dopo la fine del periodo vuote.
  for (const m of mesi) for (const s of m.settimane) while (s.length < 7) s.push(null)
  return { mesi, conteggio }
}

/** Il titolo, in dieci parole al massimo. */
export function titoloCalendario(cont, { piuSedi = false } = {}) {
  if (!cont.totale) return 'Nessun giorno nel periodo'
  if (cont.registrati === cont.totale) return `Registrati tutti i ${cont.totale} giorni del periodo`
  return `${cont.registrati} giorni registrati su ${cont.totale}${piuSedi ? ', in tutte le sedi' : ''}`
}
