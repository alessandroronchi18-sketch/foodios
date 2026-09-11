// Resa ingredienti: resa = frazione del peso lordo che diventa peso netto utilizzabile.
// Default 100% per ogni ingrediente: ogni utente può personalizzare il valore.
// Es. impostando uova al 85% → 100g lordi diventano 85g netti.
//
// PERCHE' QUESTE RESE VANNO NEL DATABASE (e non solo nel browser).
//
// La resa cambia il food cost: se le uova rendono l'85%, 100 g comprati danno
// 85 g usabili, e il costo per grammo usabile sale del 18%. Fino all'11/09/2026
// queste rese stavano SOLO nel localStorage del browser — la chiave
// `pasticceria-rese-v1` non esisteva in nessuna riga di user_data, in tutto il
// database. Conseguenze:
//   - il titolare impostava "uova 85%" sul portatile, e sul tablet in
//     laboratorio la stessa ricetta mostrava un food cost diverso;
//   - svuotando i dati del browser le rese sparivano senza un avviso;
//   - i dipendenti non le vedevano mai;
//   - non finivano in nessun backup.
// Ora si salvano su user_data (condivise, sede_id = NULL) e il localStorage
// resta come copia locale per il primo disegno della pagina e per l'offline.

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
  // Audit 2026-07-01 MEDIUM: il vecchio warning diceva "clamped a 0.01" ma il
  // codice usa 1.0 di default per input <= 0 (semantica: "valore invalido,
  // uso 100%"). Allineato il messaggio alla logica reale.
  const parsed = parseFloat(resa);
  if (Number.isFinite(parsed) && parsed <= 0) {
    console.warn('[rese] resa <= 0 per', nomeNorm, '→ ignorata, default 1.0 (100%)');
  }
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 1.0;
  _store[nomeNorm] = Math.max(0.01, Math.min(1.0, value));
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

// ── Persistenza ───────────────────────────────────────────────────────────
// Import dinamico di storage.js: tiene questo file utilizzabile dai test come
// modulo puro (nessun supabase caricato se non si salva).
const CHIAVE = 'pasticceria-rese-v1'

// Salva le rese: PRIMA sul database, poi la copia locale. Se il database
// rifiuta, la funzione lancia — così chi chiama può dirlo invece di far
// credere che sia salvato.
export async function salvaRese(orgId) {
  const rese = getStoreRese()
  if (orgId) {
    const { ssave } = await import('./storage')
    await ssave(CHIAVE, rese, orgId, null)
  }
  try { localStorage.setItem(CHIAVE, JSON.stringify(rese)) } catch { /* browser senza storage */ }
  return rese
}

// Carica le rese all'avvio: il database è la fonte di verità, il localStorage
// il ripiego. Se il database non ha niente ma il browser sì, quelle locali
// vengono portate su una volta sola (e restano).
export async function caricaRese(orgId) {
  let locali = null
  try { locali = JSON.parse(localStorage.getItem(CHIAVE) || 'null') } catch { /* noop */ }
  if (!orgId) {
    if (locali) loadRese(locali)
    return { origine: locali ? 'browser' : 'nessuna', migrate: 0 }
  }
  const { sload, ssave } = await import('./storage')
  const dalDb = await sload(CHIAVE, orgId, null)
  if (dalDb && Object.keys(dalDb).length > 0) {
    loadRese(dalDb)
    try { localStorage.setItem(CHIAVE, JSON.stringify(getStoreRese())) } catch { /* noop */ }
    return { origine: 'database', migrate: 0 }
  }
  if (locali && Object.keys(locali).length > 0) {
    loadRese(locali)
    await ssave(CHIAVE, getStoreRese(), orgId, null)
    return { origine: 'browser', migrate: Object.keys(locali).length }
  }
  return { origine: 'nessuna', migrate: 0 }
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
