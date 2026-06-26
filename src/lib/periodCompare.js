// Period Compare - helper temporale riusabile su tutti i grafici/view con dati.
//
// L'idea: ogni view che mostra una metrica nel tempo deve poter rispondere
// alla domanda del proprietario "rispetto a quando?". Tre modalita':
//   - none       → nessun confronto
//   - prev       → periodo immediatamente precedente (es. mese prec.)
//   - year_prev  → stesso periodo dell'anno scorso (YoY)
//
// Uso:
//   const { current, compare } = useCompareWindow({ kind: 'mese', anchor: dt, mode: 'year_prev' })
//   // current  = { start: Date, end: Date, label: 'maggio 2026' }
//   // compare  = { start: Date, end: Date, label: 'maggio 2025' } | null
//
// Funzioni esportate:
//   buildPeriod(kind, anchor, mode) - pure, no React
//   formatPeriod(period, locale) - label leggibile

const MS_DAY = 86400000

function clone(d) {
  const x = new Date(d.getTime())
  x.setHours(0, 0, 0, 0)
  return x
}

// Lunedi della settimana che contiene anchor
function startOfWeek(anchor) {
  const d = clone(anchor)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d
}
function endOfWeek(start) {
  const e = clone(start)
  e.setDate(e.getDate() + 7)
  return e
}

function startOfMonth(anchor) {
  const d = clone(anchor)
  d.setDate(1)
  return d
}
function endOfMonth(start) {
  const e = clone(start)
  e.setMonth(e.getMonth() + 1)
  return e
}

function startOfYear(anchor) {
  const d = clone(anchor)
  d.setMonth(0, 1)
  return d
}
function endOfYear(start) {
  const e = clone(start)
  e.setFullYear(e.getFullYear() + 1)
  return e
}

// Genera (start, end, label) per un kind + anchor.
export function buildCurrent(kind, anchor = new Date()) {
  switch (kind) {
    case 'settimana': {
      const s = startOfWeek(anchor)
      return { start: s, end: endOfWeek(s), kind, label: formatPeriod(s, 'settimana') }
    }
    case 'mese': {
      const s = startOfMonth(anchor)
      return { start: s, end: endOfMonth(s), kind, label: formatPeriod(s, 'mese') }
    }
    case 'trimestre': {
      const d = clone(anchor)
      d.setDate(1)
      const m = d.getMonth()
      const qStart = Math.floor(m / 3) * 3
      d.setMonth(qStart)
      const e = clone(d); e.setMonth(qStart + 3)
      return { start: d, end: e, kind, label: `Q${qStart / 3 + 1} ${d.getFullYear()}` }
    }
    case 'anno': {
      const s = startOfYear(anchor)
      return { start: s, end: endOfYear(s), kind, label: String(s.getFullYear()) }
    }
    case '7gg': {
      const e = clone(anchor); e.setDate(e.getDate() + 1)
      const s = clone(e); s.setDate(s.getDate() - 7)
      return { start: s, end: e, kind, label: 'Ultimi 7 giorni' }
    }
    case '30gg': {
      const e = clone(anchor); e.setDate(e.getDate() + 1)
      const s = clone(e); s.setDate(s.getDate() - 30)
      return { start: s, end: e, kind, label: 'Ultimi 30 giorni' }
    }
    case '90gg': {
      const e = clone(anchor); e.setDate(e.getDate() + 1)
      const s = clone(e); s.setDate(s.getDate() - 90)
      return { start: s, end: e, kind, label: 'Ultimi 90 giorni' }
    }
    default:
      return null
  }
}

// Calcola il periodo di confronto in base al mode.
export function buildCompare(current, mode) {
  if (!current || mode === 'none') return null
  const ms = current.end.getTime() - current.start.getTime()
  if (mode === 'prev') {
    if (current.kind === 'settimana') {
      const s = clone(current.start); s.setDate(s.getDate() - 7)
      return { start: s, end: endOfWeek(s), kind: current.kind, label: formatPeriod(s, 'settimana') + ' (prec.)' }
    }
    if (current.kind === 'mese') {
      const s = clone(current.start); s.setMonth(s.getMonth() - 1)
      return { start: s, end: endOfMonth(s), kind: current.kind, label: formatPeriod(s, 'mese') }
    }
    if (current.kind === 'trimestre') {
      const s = clone(current.start); s.setMonth(s.getMonth() - 3)
      const e = clone(s); e.setMonth(e.getMonth() + 3)
      const qStart = s.getMonth()
      return { start: s, end: e, kind: current.kind, label: `Q${qStart / 3 + 1} ${s.getFullYear()}` }
    }
    if (current.kind === 'anno') {
      const s = clone(current.start); s.setFullYear(s.getFullYear() - 1)
      return { start: s, end: endOfYear(s), kind: current.kind, label: String(s.getFullYear()) }
    }
    // Window-style (7gg, 30gg, 90gg)
    const e = clone(current.start)
    const s = new Date(e.getTime() - ms)
    return { start: s, end: e, kind: current.kind, label: current.label + ' precedenti' }
  }
  if (mode === 'year_prev') {
    const s = clone(current.start); s.setFullYear(s.getFullYear() - 1)
    const e = clone(current.end); e.setFullYear(e.getFullYear() - 1)
    return { start: s, end: e, kind: current.kind, label: formatPeriod(s, current.kind) + ` (${s.getFullYear()})` }
  }
  return null
}

// Formatta label umana
export function formatPeriod(d, kind) {
  if (!d) return ''
  const D = d instanceof Date ? d : new Date(d)
  if (kind === 'settimana') {
    const e = clone(D); e.setDate(e.getDate() + 6)
    const f = x => x.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
    return `${f(D)} - ${f(e)}`
  }
  if (kind === 'mese') {
    return D.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  }
  if (kind === 'anno') return String(D.getFullYear())
  return D.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Helper: true se una data ISO (YYYY-MM-DD o Date) e' dentro un periodo
export function inPeriod(d, p) {
  if (!p || !d) return false
  const x = d instanceof Date ? d : new Date(d)
  return x >= p.start && x < p.end
}

// React hook (opzionale): cur + compare in base a kind/mode controllati
import { useMemo } from 'react'
export function useCompareWindow({ kind = 'mese', anchor = new Date(), mode = 'none' } = {}) {
  const current = useMemo(() => buildCurrent(kind, anchor), [kind, anchor?.getTime?.()])
  const compare = useMemo(() => buildCompare(current, mode), [current, mode])
  return { current, compare }
}

// Etichette UI per il selettore "confronta con"
export const COMPARE_MODES = [
  { id: 'none',      lbl: 'Nessun confronto' },
  { id: 'prev',      lbl: 'Periodo precedente' },
  { id: 'year_prev', lbl: 'Stesso periodo anno scorso' },
]
