// Utility per la "Vista azienda (Tutte le sedi)": aggrega dati per-sede in
// un unico oggetto coerente. Estratto da Dashboard.jsx per leggibilita' e
// testabilita' (audit 2026-07-01 batch 9: primo step di split file >1500
// righe). Comportamento invariato.
//
// - mergeArr: { [sedeId]: array } -> singolo array concatenato (giornaliero,
//   chiusure, logrif). Filtra esplicitamente solo entry array.
// - mergeMag: { [sedeId]: magazzino } -> magazzino aggregato per chiave
//   ingrediente, sommando giacenze e prendendo soglia massima (la soglia
//   max e' la piu' conservativa cross-sede).

export function mergeArr(map) {
  return Object.values(map || {}).filter(Array.isArray).flat()
}

export function mergeMag(map) {
  const out = {}
  for (const m of Object.values(map || {})) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue
    for (const [k, v] of Object.entries(m)) {
      if (!v || typeof v !== 'object') continue
      if (!out[k]) out[k] = { ...v }
      else out[k] = {
        ...out[k],
        giacenza_g: (out[k].giacenza_g || 0) + (v.giacenza_g || 0),
        soglia_g: Math.max(out[k].soglia_g || 0, v.soglia_g || 0),
      }
    }
  }
  return out
}
