// Resa ingredienti: resa = frazione del peso lordo che diventa peso netto utilizzabile.
// Es. uova 85% → 100g lordi → 85g netti. Il costo per grammo netto = costoG_lordo / resa.
// Default 100% (resa piena) per ogni ingrediente non configurato.

const RESE_DEFAULT = {
  'uova':            0.85,
  'uovo':            0.85,
  'uova intere':     0.85,
  'arancia':         0.70,
  'arance':          0.70,
  'limone':          0.72,
  'limoni':          0.72,
  'fragola':         0.90,
  'fragole':         0.90,
  'lampone':         0.95,
  'lamponi':         0.95,
  'mirtilli':        0.96,
  'amarene':         0.85,
  'ciliegie':        0.82,
  'noci':            0.48,
  'nocciole':        0.98,
  'mandorle':        0.98,
  'pistacchi':       0.98,
  'carote':          0.80,
  'mele':            0.80,
  'burro':           1.00,
  'farina':          1.00,
  'zucchero':        1.00,
  'latte':           1.00,
  'panna':           1.00,
  'cioccolato':      1.00,
  'cacao':           1.00,
  'lievito':         1.00,
  'sale':            1.00,
  'vaniglia':        1.00,
};

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
