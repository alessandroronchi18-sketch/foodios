// Riassume errori di validazione di un import bulk in un messaggio umano.
// Riconosce i pattern piu' comuni e, quando >=50% degli errori appartiene
// a una categoria, restituisce un titolo + hint suggerimento pratico.
//
// Usato dal wizard di import (StepValidate) per non travolgere l'utente con
// 1700 righe rosse quando il problema e' UNO solo (es. mese non riconosciuto).
//
// Test coverage: scripts/test-import-smoke.mjs.

/**
 * @typedef {Object} InvalidRow
 * @property {number} row_index
 * @property {string[]} errors
 * @property {Object} row_data
 */

/**
 * @typedef {Object} ErrorSummary
 * @property {string} title  - Frase breve che spiega il problema principale
 * @property {string} hint   - Come sistemarlo (linguaggio semplice)
 */

/**
 * @param {InvalidRow[]} invalidRows
 * @returns {ErrorSummary | null}
 */
export function summarizeErrors(invalidRows) {
  if (!Array.isArray(invalidRows) || invalidRows.length === 0) return null
  let dateNull = 0, dateBad = 0, sedeNotFound = 0, numberBad = 0, requiredEmpty = 0
  for (const inv of invalidRows) {
    const s = (inv.errors || []).join(' ').toLowerCase()
    if (s.includes('null-') || s.includes('"null-')) dateNull++
    else if (s.includes('data') && s.includes('non') && s.includes('valida')) dateBad++
    else if (s.includes('sede_id') && s.includes('non trovato')) sedeNotFound++
    else if (s.includes('non') && s.includes('numero') && s.includes('valido')) numberBad++
    else if (s.includes('obbligatorio') && s.includes('vuoto')) requiredEmpty++
  }
  const tot = invalidRows.length
  const winner = Math.max(dateNull, dateBad, sedeNotFound, numberBad, requiredEmpty)
  if (winner === 0 || winner / tot < 0.5) return null

  if (dateNull === winner) return {
    title: 'Non ho capito di che mese sono questi dati',
    hint: 'Torna indietro, ricarica il file e quando ti chiedo il mese scrivi ANNO-MESE (es. 2026-05 per maggio 2026).',
  }
  if (sedeNotFound === winner) return {
    title: 'I nomi delle sedi non corrispondono a quelli che hai in Foodos',
    hint: 'Le sedi del file (es. "BERTHOLLET") devono esistere in Foodos con lo stesso nome. Vai in Impostazioni → Sedi e controlla come sono scritte.',
  }
  if (dateBad === winner) return {
    title: 'Le date non sono in un formato che riesco a leggere',
    hint: 'Serve il formato GG/MM/AAAA (es. 15/05/2026) o AAAA-MM-GG (es. 2026-05-15). Controlla la colonna delle date nel tuo Excel.',
  }
  if (numberBad === winner) return {
    title: 'Ci sono valori che non riesco a leggere come numeri',
    hint: 'Nelle colonne dei numeri (grammi, kg…) ci sono lettere o testi. Rimuovi il testo e lascia solo il numero.',
  }
  if (requiredEmpty === winner) return {
    title: 'Mancano dati importanti in molte righe',
    hint: 'Alcuni campi obbligatori (data, sede, gusto) sono vuoti. Torna al passo precedente e verifica di aver scelto le colonne giuste dai menù a tendina.',
  }
  return null
}
