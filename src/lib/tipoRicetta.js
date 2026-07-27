// Etichette e helper per il campo `tipo` di una ricetta.
//
// I tipi supportati sono:
//   - 'fetta'         → pasticceria / torte-per-fetta
//   - 'pezzo'         → pasticceria / lievitati / pane / paste (unità intera)
//   - 'gusto'         → gelateria (produzione in kg, prezzo su formati vendita)
//   - 'interno'       → base di lavorazione (non venduta)
//   - 'semilavorato'  → ingrediente composto (usato in altre ricette)
//
// Centralizzare qui evita branching sparso `tipo === 'fetta' ? 'fette' : 'pezzi'`
// (audit 2026-07-23) che non copriva 'gusto' e mostrava "pezzi" al gelataio.

export function labelPlurale(tipo) {
  switch (tipo) {
    case 'fetta': return 'fette'
    case 'pezzo': return 'pezzi'
    case 'gusto': return 'kg'
    default:      return 'pezzi'
  }
}

export function labelSingolare(tipo) {
  switch (tipo) {
    case 'fetta': return 'fetta'
    case 'pezzo': return 'pezzo'
    case 'gusto': return 'kg'
    default:      return 'pezzo'
  }
}

// Vero se la ricetta è un gusto (gelateria). Serve per condizionare UI/logica
// che parlano di "stampi / fette / prezzo per unità" — concetti che per un
// gusto non hanno senso (il prezzo di vendita vive su Formati vendita).
export function isGustoTipo(tipo) {
  return tipo === 'gusto'
}

// Vero se il tipo NON è un output finito venduto (semilavorato / uso interno).
export function isSemiOInterno(tipo) {
  return tipo === 'semilavorato' || tipo === 'interno'
}
