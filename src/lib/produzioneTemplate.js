// Template Excel "Produzione giornaliera" scaricabile.
//
// Scopo: dare all'utente un formato STANDARD per registrare la produzione a mano
// (o via cameriere/operatore) invece di andare a memoria. Il template contiene:
//   - riga di istruzioni (Row 1, merged, testo piccolo)
//   - header colonne (Row 2): Prodotto | Stampi prodotti | Pezzi al banco | Note
//   - una riga per ogni ricetta dell'org (sortata alfabeticamente, escluso tipo=interno)
//   - colonne larghe abbastanza da leggere i nomi
//
// Uso:
//   import { scaricaTemplateProduzione } from './lib/produzioneTemplate'
//   await scaricaTemplateProduzione({ ricette, nomeAttivita, notify })
//
// Il template NON e' importabile automaticamente per ora (potremmo aggiungerlo
// come task futuro). Serve come check-list stampabile/compilabile che poi
// l'utente ricopia manualmente in Foodos.

import { loadXLSX } from './xlsx'
import { isRicettaValida, getR } from './foodcost'
import { todayLocal } from './dateLocal'

function nomeFile(nomeAttivita) {
  const slug = String(nomeAttivita || 'foodios').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'foodios'
  return `modello-produzione-${slug}-${todayLocal()}.xlsx`
}

// Costruisce l'array-of-arrays (AoA) del foglio.
function buildAoA(ricette, nomeAttivita) {
  const oggi = todayLocal()
  const rows = []
  // Row 1: intestazione con nome attivita' e data
  rows.push([`Produzione giornaliera - ${nomeAttivita || 'la tua attivita'}`, '', '', ''])
  rows.push([`Data: ${oggi}`, '', '', ''])
  rows.push([]) // riga vuota
  // Row 4: istruzioni compatte
  rows.push([
    'Segna quanti stampi/teglie hai fatto per ogni prodotto. "Pezzi al banco" e\' opzionale: lascialo vuoto se metti tutto in vetrina, oppure metti il numero effettivo di pezzi esposti (il resto va in congelatore o scarti).',
    '', '', ''
  ])
  rows.push([]) // riga vuota
  // Row 6: header
  rows.push(['Prodotto', 'Stampi prodotti', 'Pezzi al banco', 'Note'])
  // Righe: una per ricetta
  const validate = (ricette || [])
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno')
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'))
  for (const r of validate) {
    const reg = getR(r.nome, r)
    const nota = reg.tipo === 'semilavorato' ? '(semilavorato - base per altre ricette)' : ''
    rows.push([r.nome, '', '', nota])
  }
  if (validate.length === 0) {
    rows.push(['(nessuna ricetta nel ricettario)', '', '', 'Aggiungi prima le ricette dalla sezione Ricettario > Nuova ricetta'])
  }
  return rows
}

export async function scaricaTemplateProduzione({ ricette, nomeAttivita, notify }) {
  try {
    const XLSX = await loadXLSX()
    const aoa = buildAoA(ricette, nomeAttivita)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Larghezza colonne (in caratteri approx)
    ws['!cols'] = [
      { wch: 42 }, // Prodotto
      { wch: 18 }, // Stampi
      { wch: 18 }, // Pezzi al banco
      { wch: 36 }, // Note
    ]
    // Merge cell della riga intestazione (Row 1) sulle 4 colonne
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Produzione')
    XLSX.writeFile(wb, nomeFile(nomeAttivita))
    notify?.(`Modello scaricato: ${nomeFile(nomeAttivita)}`)
  } catch (e) {
    console.error('scaricaTemplateProduzione:', e)
    notify?.('Errore scaricando il modello Excel, riprova.', false)
  }
}
