// Resa ingredienti: resa = frazione del peso lordo che diventa peso netto utilizzabile.
// Default 100% per ogni ingrediente: ogni utente può personalizzare il valore.
// Es. impostando uova al 85% → 100g lordi diventano 85g netti.

const RESE_DEFAULT = {};

const _store = {};

export function getResaIngrediente(nomeNorm) {
  if (_store[nomeNorm] !== undefined) return _store[nomeNorm];
  if (RESE_DEFAULT[nomeNorm] !== undefined) return RESE_DEFAULT[nomeNorm];
  return 1.0;
}

// True se esiste una resa impostata (esplicita o di default) per questo nome.
// Serve a far sì che la resa di un semilavorato SOSTITUISCA quelle delle foglie
// (calo applicato una volta sola) invece di moltiplicarsi.
export function hasResaIngrediente(nomeNorm) {
  return _store[nomeNorm] !== undefined || RESE_DEFAULT[nomeNorm] !== undefined;
}

export function setResaIngrediente(nomeNorm, resa) {
  _store[nomeNorm] = Math.max(0.01, Math.min(1.0, parseFloat(resa)||1.0));
}

export function loadRese(obj) {
  if (!obj) return;
  for (const [k,v] of Object.entries(obj)) {
    _store[k] = Math.max(0.01, Math.min(1.0, parseFloat(v)||1.0));
  }
}

export function getAllRese() {
  return { ...RESE_DEFAULT, ..._store };
}

export function getStoreRese() {
  return { ..._store };
}

// Reset rese runtime: necessario quando si cambia organizzazione/sede nella
// stessa sessione (impersonation admin). Senza, le rese di org A inquinano i
// calcoli FC di org B. Allineato a resetRegoleRuntime() in foodcost.js.
// Audit 2026-06-17 HIGH.
export function resetRese() {
  for (const k of Object.keys(_store)) delete _store[k];
}

export function costoNettoPerG(costoLordoPerG, nomeNorm) {
  const resa = getResaIngrediente(nomeNorm);
  return resa > 0 ? costoLordoPerG / resa : costoLordoPerG;
}
