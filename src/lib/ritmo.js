// Il ritmo di un negozio di cibo.
//
// Una pasticceria non fa lo stesso incasso ogni giorno: il sabato vale il
// doppio del martedì, e questo non è un'anomalia, è il mestiere. Tutte le
// pagine che mostrano numeri di giornata avevano lo stesso difetto — dicevano
// QUANTO senza dire SE È NORMALE — e senza quel confronto un numero da solo
// non aiuta a decidere niente.
//
// Qui stanno i calcoli puri che servono a rispondere a tre domande:
//   - com'è andato questo mese, in una frase
//   - quanto vale ogni giorno della settimana, in media
//   - oggi è andato meglio o peggio di un giorno come questo
//
// Nessuna dipendenza da React o da Supabase: si passano le chiusure già
// caricate e si ottengono numeri. Così si testa davvero.

/** Giorno della settimana ISO: 1 = lunedì … 7 = domenica. */
export function isoWeekday(dataIso) {
  const js = new Date(dataIso + 'T12:00').getDay()
  return js === 0 ? 7 : js
}

export const NOMI_GIORNO = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
export const SIGLE_GIORNO = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']

const incasso = (c) => Number(c?.kpi?.totV) || 0

/** Le chiusure di un intervallo, con incasso maggiore di zero. */
function nelPeriodo(chiusure, from, to) {
  return (chiusure || []).filter(c => {
    if (!c?.data) return false
    const d = c.data.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return incasso(c) > 0
  })
}

/**
 * Mediana invece di media.
 *
 * Un sabato di Ferragosto o il giorno della sagra non devono spostare il
 * "solito": la media si fa trascinare da un valore fuori scala, la mediana no.
 * Su quattro sabati di cui uno eccezionale, la media dice una cosa che non
 * succede quasi mai.
 */
export function mediana(valori) {
  const v = (valori || []).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
  if (v.length === 0) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Quanto vale ogni giorno della settimana.
 *
 * Restituisce sette voci in ordine lunedì→domenica, ognuna con la mediana
 * dell'incasso e quante giornate l'hanno prodotta. `giorni` serve a non
 * mostrare come "solito" un valore che viene da una sola giornata.
 */
export function perGiornoSettimana(chiusure, { from, to } = {}) {
  const secchi = Array.from({ length: 7 }, () => [])
  for (const c of nelPeriodo(chiusure, from, to)) {
    secchi[isoWeekday(c.data) - 1].push(incasso(c))
  }
  return secchi.map((valori, i) => ({
    iso: i + 1,
    nome: NOMI_GIORNO[i],
    sigla: SIGLE_GIORNO[i],
    tipico: mediana(valori),
    giorni: valori.length,
  }))
}

/**
 * Il giorno migliore e il peggiore fra quelli che hanno lavorato davvero.
 * Sotto le due giornate per giorno della settimana non si dichiara nulla: con
 * un solo sabato in archivio "il sabato vale il doppio" è una coincidenza.
 */
export function estremiSettimana(chiusure, opzioni) {
  const voci = perGiornoSettimana(chiusure, opzioni).filter(v => v.giorni >= 2 && v.tipico > 0)
  if (voci.length < 2) return null
  const ordinati = [...voci].sort((a, b) => b.tipico - a.tipico)
  const migliore = ordinati[0]
  const peggiore = ordinati[ordinati.length - 1]
  if (peggiore.tipico <= 0) return null
  return { migliore, peggiore, rapporto: migliore.tipico / peggiore.tipico }
}

/**
 * Com'è andata una giornata rispetto a un giorno come quello.
 *
 * Confronta con la mediana degli stessi giorni della settimana PRECEDENTI a
 * quella data: un giovedì si giudica sui giovedì, e solo su quelli già
 * passati, altrimenti il giudizio cambierebbe a posteriori. Serve un minimo di
 * tre riferimenti: sotto, si dice che non si sa ancora.
 *
 * @returns null se non c'è abbastanza storia, altrimenti
 *   { tipico, scostamento, pct, verso, riferimenti }
 */
export function confrontoConSolito(chiusure, dataIso, { minRiferimenti = 3, settimane = 12 } = {}) {
  if (!dataIso) return null
  const dow = isoWeekday(dataIso)
  const inizio = new Date(new Date(dataIso + 'T12:00').getTime() - settimane * 7 * 86400000)
    .toISOString().slice(0, 10)

  const simili = (chiusure || [])
    .filter(c => c?.data && c.data.slice(0, 10) < dataIso && c.data.slice(0, 10) >= inizio)
    .filter(c => incasso(c) > 0 && isoWeekday(c.data) === dow)
    .map(incasso)

  if (simili.length < minRiferimenti) return null

  const tipico = mediana(simili)
  if (!(tipico > 0)) return null

  const oggi = incasso((chiusure || []).find(c => c?.data?.slice(0, 10) === dataIso))
  const scostamento = oggi - tipico
  const pct = (scostamento / tipico) * 100

  // Sotto il 10% non si dichiara niente: la variazione naturale fra due
  // giovedì è più grande di così, e chiamarla "meglio" o "peggio" ogni giorno
  // insegnerebbe a non fidarsi del confronto.
  const verso = pct >= 10 ? 'sopra' : pct <= -10 ? 'sotto' : 'in linea'

  return { tipico, scostamento, pct, verso, riferimenti: simili.length, nome: NOMI_GIORNO[dow - 1] }
}

/**
 * Scala di calore per la griglia del calendario.
 *
 * Restituisce una funzione che dato un incasso dà un peso da 0 a 1, usato per
 * l'intensità del colore. Il riferimento non è il massimo: una sola giornata
 * eccezionale schiaccerebbe tutte le altre nella stessa tinta pallida, e la
 * mappa non direbbe più niente.
 *
 * Si prende l'85esimo percentile con indice `0.85 × (n−1)`, non `0.85 × n`.
 * Sembra un dettaglio e non lo è: su cinque giornate il secondo modo dà
 * l'indice 4, cioè proprio il valore fuori scala che si voleva escludere. Su
 * un mese di lavoro il tetto cade sulle giornate forti-ma-normali, che è
 * esattamente il riferimento giusto.
 */
export function scalaCalore(valori) {
  const v = (valori || []).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (v.length === 0) return () => 0
  const tetto = v[Math.max(0, Math.floor(0.85 * (v.length - 1)))]
  if (!(tetto > 0)) return () => 0
  return (n) => {
    const x = Number(n)
    if (!Number.isFinite(x) || x <= 0) return 0
    // Rapporto diretto, non radice quadrata. La radice apriva troppo il
    // basso: su una settimana che va da 340 a 1.130 euro portava il giorno più
    // debole a metà scala, e la mappa del mese si leggeva come un blocco unico.
    // Il tetto all'85esimo percentile fa già il lavoro di non farsi schiacciare
    // dalla giornata eccezionale, quindi qui basta la proporzione.
    return Math.min(1, x / tetto)
  }
}

/**
 * Il mese in una frase. È la riga che apre la pagina, e deve dire qualcosa di
 * vero anche quando i dati sono pochi — senza mai rimproverare chi legge.
 */
export function frasiDelMese(chiusure, { from, to, giorniAperti } = {}) {
  const dentro = nelPeriodo(chiusure, from, to)
  const totale = dentro.reduce((s, c) => s + incasso(c), 0)
  const giorni = dentro.length
  const media = giorni > 0 ? totale / giorni : 0
  const estremi = estremiSettimana(chiusure, { from, to })

  const migliore = dentro.reduce((best, c) => (!best || incasso(c) > incasso(best)) ? c : best, null)

  return {
    totale, giorni, media,
    giornoMigliore: migliore ? { data: migliore.data, incasso: incasso(migliore) } : null,
    estremi,
    daRegistrare: Math.max(0, (giorniAperti || 0) - giorni),
  }
}
