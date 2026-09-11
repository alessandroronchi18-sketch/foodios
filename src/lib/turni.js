// Orari dei turni: minuti, mezzanotte, ore lavorate, copertura della giornata.
//
// Viveva dentro Personale.jsx (2.300 righe) e non era testabile. È stata
// portata qui dopo aver trovato un difetto che costava soldi veri: un turno
// che passa la mezzanotte (19:00–00:30) aveva l'ora di fine più PICCOLA
// dell'inizio, e nessuno gestiva quel caso. Risultato: zero ore, quindi zero
// costo del lavoro, il turno scartato dal calendario e dall'analisi della
// copertura, e il controllo degli accavallamenti cieco. Per una gelateria che
// d'estate chiude a mezzanotte, ogni turno di chiusura era lavoro gratis nei
// conti dell'azienda.

// Un orario scritto come si deve, "HH:MM".
//
// Serve perché senza il controllo un'ora illeggibile veniva letta come
// mezzanotte, e un turno "08:00 → abc" diventava un turno di SEDICI ore
// (08:00 di un giorno alle 00:00 del successivo), con il costo relativo.
// Meglio zero, che si vede, di sedici ore inventate.
export const oraValida = s => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return false
  const h = Number(m[1]), mi = Number(m[2])
  // Il controllo sulle ORE e sui MINUTI serve davvero: "25:99" passava il
  // controllo sulla forma e diventava un turno di 18,65 ore. L'input del
  // browser non lo produce, ma un dato vecchio o importato sì.
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59
}

// "HH:MM" → minuti dalla mezzanotte.
export const toMin = s => {
  const [h, m] = String(s || '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Minuti della fine del turno, tenendo conto del giro di mezzanotte.
// Fine uguale all'inizio resta zero: è un errore di battitura, non un turno
// di ventiquattro ore.
export const finMin = (oraInizio, oraFine) => {
  if (!oraValida(oraInizio) || !oraValida(oraFine)) return toMin(oraInizio)
  const i = toMin(oraInizio), f = toMin(oraFine)
  return f > i ? f : (f === i ? f : f + 1440)
}

// Minuti → "HH:MM", riportati dentro le 24 ore (1470 si legge "00:30").
export const hm = m => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

// Ore lavorate di un turno (decimali): 19:00–00:30 = 5.5
export function oreTurno(oraInizio, oraFine) {
  return Math.max(0, (finMin(oraInizio, oraFine) - toMin(oraInizio)) / 60)
}

// Due turni si accavallano? Confronto sulla stessa scala, mezzanotte compresa.
export function siAccavallano(a, b) {
  const ai = toMin(a?.ora_inizio), af = finMin(a?.ora_inizio, a?.ora_fine)
  const bi = toMin(b?.ora_inizio), bf = finMin(b?.ora_inizio, b?.ora_fine)
  return ai < bf && bi < af
}

// Copertura di una giornata: quante persone presenti per fascia oraria, quali
// turni si accavallano, apertura e chiusura.
export function analizzaCopertura(turniGiorno) {
  const shifts = (turniGiorno || [])
    .map(t => ({
      id: t.id,
      nome: t.dipendenti?.nome || '-',
      ini: toMin(t.ora_inizio),
      fin: finMin(t.ora_inizio, t.ora_fine),
    }))
    .filter(s => s.fin > s.ini)
    .sort((a, b) => a.ini - b.ini)
  if (!shifts.length) return { shifts: [], overlaps: new Set(), segments: [], open: 0, close: 0, min: 0, max: 0 }
  const overlaps = new Set()
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shifts[i].ini < shifts[j].fin && shifts[j].ini < shifts[i].fin) {
        overlaps.add(shifts[i].id); overlaps.add(shifts[j].id)
      }
    }
  }
  const open = Math.min(...shifts.map(s => s.ini))
  const close = Math.max(...shifts.map(s => s.fin))
  const pts = [...new Set(shifts.flatMap(s => [s.ini, s.fin]))].sort((a, b) => a - b)
  const segments = []
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1]
    segments.push({ a, b, count: shifts.filter(s => s.ini <= a && s.fin >= b).length })
  }
  const counts = segments.map(s => s.count)
  return { shifts, overlaps, segments, open, close, min: Math.min(...counts), max: Math.max(...counts) }
}
