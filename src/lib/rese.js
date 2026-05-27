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

export function costoNettoPerG(costoLordoPerG, nomeNorm) {
  const resa = getResaIngrediente(nomeNorm);
  return resa > 0 ? costoLordoPerG / resa : costoLordoPerG;
}
