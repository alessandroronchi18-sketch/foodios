// Il periodo che si guarda, e con cosa lo si confronta.
//
// Ogni pagina di analisi aveva il suo: il P&L «dal/al» senza scorciatoie e
// senza confronto, lo Storico le scorciatoie e il confronto, il Confronto sedi
// solo settimana/mese. Passando da una pagina all'altra si ricominciava da
// capo, e la stessa domanda — «com'è andato settembre?» — andava riposta tre
// volte in tre modi diversi.
//
// Qui c'è il conto: le scorciatoie, la finestra che ne esce, e il periodo con
// cui confrontarla. Niente React: si può misurare.
//
// Tutte le date sono stringhe `YYYY-MM-DD` costruite sui giorni LOCALI. È la
// quinta volta che su questo progetto un `toISOString()` sposta un giorno:
// `new Date().toISOString().slice(0,10)` dà la data UTC, e in Italia fra
// mezzanotte e le due è ancora ieri — la scorciatoia «Oggi» selezionava ieri.

import { formatLocalDate } from './dateLocal'

const g = (anno, mese, giorno) => formatLocalDate(new Date(anno, mese, giorno))

// Le scorciatoie, nell'ordine in cui compaiono.
export const SCORCIATOIE = [
  { id: 'oggi',      label: 'Oggi' },
  { id: 'ieri',      label: 'Ieri' },
  { id: '7gg',       label: '7 giorni' },
  { id: '30gg',      label: '30 giorni' },
  { id: '90gg',      label: '90 giorni' },
  { id: 'sett',      label: 'Questa settimana' },
  { id: 'meseCorr',  label: 'Questo mese' },
  { id: 'mesePrec',  label: 'Mese scorso' },
  { id: 'annoCorr',  label: "Quest'anno" },
]

// I modi di confrontare. «Nessuno» c'è apposta: un confronto che non si può
// spegnere è un confronto che a volte racconta una storia sbagliata (il primo
// mese di apertura non ha un mese precedente).
export const CONFRONTI = [
  { id: 'none', label: 'Nessuno' },
  { id: 'prev', label: 'Periodo prec.' },
  { id: 'year_prev', label: 'Anno prec.' },
]

/**
 * La finestra di una scorciatoia: { from, to } come giorni locali.
 * Torna null se l'identificativo non esiste.
 */
export function finestraScorciatoia(id, adesso = new Date()) {
  const y = adesso.getFullYear(), m = adesso.getMonth(), d = adesso.getDate()
  const oggi = g(y, m, d)
  switch (id) {
    case 'oggi':     return { from: oggi, to: oggi }
    case 'ieri':     { const x = g(y, m, d - 1); return { from: x, to: x } }
    case '7gg':      return { from: g(y, m, d - 6),  to: oggi }
    case '30gg':     return { from: g(y, m, d - 29), to: oggi }
    case '90gg':     return { from: g(y, m, d - 89), to: oggi }
    case 'sett':     { const dow = adesso.getDay() || 7; return { from: g(y, m, d - (dow - 1)), to: oggi } }
    case 'meseCorr': return { from: g(y, m, 1), to: oggi }
    // Il mese scorso finisce col giorno 0 di questo, cioè l'ultimo del
    // precedente: funziona anche a gennaio e con i mesi da 28, 30 e 31.
    case 'mesePrec': return { from: g(y, m - 1, 1), to: g(y, m, 0) }
    case 'annoCorr': return { from: g(y, 0, 1), to: oggi }
    default: return null
  }
}

/** Quanti giorni di calendario copre la finestra, estremi compresi. */
export function giorniDelPeriodo(from, to) {
  if (!from || !to) return 0
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const a = new Date(fy, fm - 1, fd)
  const b = new Date(ty, tm - 1, td)
  // In giorni di calendario, non in millisecondi: col cambio dell'ora legale
  // una differenza in ms sbaglia di un giorno e i confronti mettono 31 giorni
  // contro 32.
  return Math.round((b - a) / 86400000) + 1
}

/**
 * Il periodo con cui confrontare, o null.
 *
 * `prev`      → la stessa quantità di giorni, subito prima.
 * `year_prev` → lo stesso periodo dell'anno scorso.
 */
export function finestraConfronto(from, to, modo) {
  if (!from || !to || !modo || modo === 'none') return null
  if (modo === 'year_prev') {
    const spostaAnno = (s) => {
      const [y, m, d] = s.split('-').map(Number)
      return formatLocalDate(new Date(y - 1, m - 1, d))
    }
    return { from: spostaAnno(from), to: spostaAnno(to) }
  }
  if (modo === 'prev') {
    const n = giorniDelPeriodo(from, to)
    const [fy, fm, fd] = from.split('-').map(Number)
    const fine = new Date(fy, fm - 1, fd - 1)
    const inizio = new Date(fy, fm - 1, fd - n)
    return { from: formatLocalDate(inizio), to: formatLocalDate(fine) }
  }
  return null
}

/**
 * Quale scorciatoia corrisponde alla finestra scelta, se ce n'è una.
 * Serve a tenere acceso il bottone giusto quando le date arrivano da fuori.
 */
export function scorciatoiaDi(from, to, adesso = new Date()) {
  if (!from || !to) return null
  for (const s of SCORCIATOIE) {
    const f = finestraScorciatoia(s.id, adesso)
    if (f && f.from === from && f.to === to) return s.id
  }
  return null
}

/**
 * Come si chiama un periodo, a parole.
 *
 * «1–16 settembre» si legge; «2026-09-01 → 2026-09-16» si decifra.
 */
export function nomePeriodo(from, to) {
  if (!from || !to) return ''
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  if (from === to) return `${fd} ${MESI[fm - 1]} ${fy}`
  if (fy === ty && fm === tm) return `${fd}–${td} ${MESI[fm - 1]} ${fy}`
  if (fy === ty) return `${fd} ${MESI[fm - 1]} – ${td} ${MESI[tm - 1]} ${fy}`
  return `${fd} ${MESI[fm - 1]} ${fy} – ${td} ${MESI[tm - 1]} ${ty}`
}

/**
 * Come si chiama un giorno, a parole: «Oggi», «Ieri», o per esteso.
 *
 * Il Registro attività se lo calcolava da sé, e lo calcolava in UTC:
 * `a.toISOString().slice(0,10) === b.toISOString().slice(0,10)`. Alle 01:00 di
 * notte quel confronto dice ancora «ieri» per adesso e «ieri» per ieri sera,
 * quindi il lavoro della sera prima compariva sotto «Oggi».
 *
 * Qui i giorni sono stringhe e si confrontano come stringhe. `T12:00` serve
 * solo a far scrivere il nome del giorno a Intl: mezzogiorno locale sta dentro
 * la stessa giornata in qualunque fuso, mentre `new Date('2026-09-16')` è
 * mezzanotte UTC e in America diventa il 15.
 */
export function nomeDelGiorno(giorno, adesso = new Date()) {
  const g = typeof giorno === 'string' ? giorno.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return ''
  const oggi = formatLocalDate(adesso)
  const ieri = formatLocalDate(new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() - 1))
  if (g === oggi) return 'Oggi'
  if (g === ieri) return 'Ieri'
  return new Date(`${g}T12:00`).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
