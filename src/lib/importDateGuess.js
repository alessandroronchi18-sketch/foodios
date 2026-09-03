// Deduzione mese/anno da un nome file italiano.
//
// Es. "FOGLIO PRODUZIONE MAGGIO 2026.xlsx" → "2026-05"
// Es. "produzione_giugno_2026.xlsx"        → "2026-06"
// Es. "no month here.xlsx"                 → null
//
// Usato dal wizard di import produzione per capire il mese dal filename e
// evitare di chiedere all'utente (che spesso non sa cosa scrivere).
//
// Test coverage: scripts/test-import-smoke.mjs.

const MONTHS_IT = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
  maggio: '05', giugno: '06', luglio: '07', agosto: '08',
  settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
}

/**
 * Prova a estrarre "YYYY-MM" dal nome del file.
 * @param {string} name - Nome file (con o senza estensione)
 * @returns {string | null} - "YYYY-MM" oppure null se non deducibile
 */
export function guessMonthIsoFromFilename(name) {
  if (!name || typeof name !== 'string') return null
  const s = name.toLowerCase()
  let month = null
  for (const [monthName, mm] of Object.entries(MONTHS_IT)) {
    if (s.includes(monthName)) { month = mm; break }
  }
  if (!month) return null
  const yearMatch = s.match(/20\d{2}/)
  if (!yearMatch) return null
  return `${yearMatch[0]}-${month}`
}
