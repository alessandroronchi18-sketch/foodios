// Parser ricettario Excel - estratto da Dashboard.jsx per essere riusabile
// in OnboardingWizard, RicettarioView import, eventuale CLI.
//
// Formato atteso del file .xlsx:
// - Un sheet per ricetta, oppure un sheet 'ingredient*' per i prezzi.
// - Per i sheet ricetta:
//     Row 0: [label, NomeRicetta, _, _, _, totImpasto1]
//     Row 1: [label, numStampi]
//     Row 2: [label, _, _, _, _, foodCost1]
//     Rows 3-6: header/vuoti
//     Row 7+: [nomeIngrediente, qty1stampo, costoPerG, costo1stampo]
//
// Output: { ricette: { [nome]: { ingredienti, ... } }, ingredienti_costi: {...} }

import { loadXLSX } from './xlsx'
import { normIng } from './foodcost'

// parseNum IT-aware: gestisce "1.234,56" (IT) e "1,234.56" (EN). Coerente con
// importCassa.parseNum. Il vecchio `isNaN(v)` rifiutava le stringhe formattate
// it-IT come "1.234,56" → 0, e l'utente vedeva ingredienti con costo/qty 0.
import { parseNum as _parseNum } from './importCassa'

export async function parseRicettario(file) {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const num = v => {
    if (v === null || v === '') return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    return _parseNum(v)
  }
  const ricette = {}
  const ingredienti_costi = {}

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    // Sheet 'ingredient*' → tabella prezzi
    if (sheetName.toLowerCase().includes('ingredient')) {
      for (let i = 1; i < rows.length; i++) {
        const nome = rows[i]?.[0]
        if (nome && typeof nome === 'string' && nome.trim()) {
          ingredienti_costi[normIng(nome.trim())] = {
            costoKg: num(rows[i]?.[1]),
            costoG: num(rows[i]?.[2]),
          }
        }
      }
      continue
    }

    const nomeRicetta = rows[0]?.[1] || rows[0]?.[0] || sheetName
    if (!nomeRicetta || typeof nomeRicetta !== 'string' || !nomeRicetta.trim()) continue
    const nome = String(nomeRicetta).trim()
    const SKIP_NAMES = ['NaN', 'undefined', 'Nome ricetta', 'Nome Ricetta', 'NOME RICETTA', 'Ricetta']
    if (SKIP_NAMES.includes(nome) || SKIP_NAMES.map(s => s.toLowerCase()).includes(nome.toLowerCase())) continue

    const ingredienti = []
    for (let i = 7; i < rows.length; i++) {
      const ing = rows[i]?.[0]
      if (!ing || typeof ing !== 'string' || !ing.trim()) continue
      if (ing.includes('Totale') || ing.includes('Note')) break
      const ingKey = ing.trim().toLowerCase()
      if (['ingrediente', 'ingredient', 'ingredienti'].includes(ingKey)) continue
      ingredienti.push({
        nome: ing.trim(),
        qty1stampo: num(rows[i]?.[1]),
        costoPerG: num(rows[i]?.[2]),
        costo1stampo: num(rows[i]?.[3]),
      })
    }

    let note = ''
    for (let i = Math.max(0, rows.length - 6); i < rows.length; i++) {
      const v = rows[i]?.[0]
      if (v && typeof v === 'string' && (v.includes('°') || v.includes('min'))) {
        note = v.trim()
        break
      }
    }

    ricette[nome] = {
      nome,
      sheetName,
      // numStampi=0 esplicito è dato strano: l'utente ha probabilmente svuotato
      // la cella, ma JS Number("0") || 1 = 1 silenzia. Usiamo `??` per
      // distinguere 0 (preservato per warning) da NaN/undefined (default 1).
      numStampi: (() => { const n = num(rows[1]?.[1]); return Number.isFinite(n) && n > 0 ? n : 1 })(),
      totImpasto1: num(rows[0]?.[5]),
      foodCost1: num(rows[2]?.[5]),
      ingredienti,
      note,
    }
  }

  return { ricette, ingredienti_costi }
}
