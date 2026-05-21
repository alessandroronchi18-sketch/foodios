// Movimento di MATERIE PRIME tra due sedi, client-side.
//
// Le MP vivono in user_data come dict { [ingrediente]: {giacenza_g, soglia_g, ...} }
// salvato per sede. Per spostare materia prima da sede A a sede B serve:
//   1. load magazzino A → decrementa giacenza ingrediente
//   2. load magazzino B → incrementa giacenza ingrediente (crea voce se non esiste)
//   3. save magazzino A e B
//
// NB: non è atomico tra le due sedi. Se step 3a fallisce dopo step 2 OK, abbiamo
// inconsistenza. Per single-user-per-sede questo scenario è remoto.
// Per ridurre il rischio: salva PRIMA il decremento sede A, POI l'incremento sede B.
// Se il secondo fallisce, l'errore è chiaro all'utente e può registrare a mano.

import { sload, ssave } from './storage'

const SK_MAG = 'pasticceria-magazzino-v1'

// Normalizza nome ingrediente (stesso schema della Dashboard).
function normIng(nome) {
  return (nome || '').toString().trim().toLowerCase()
}

// Restituisce la giacenza disponibile per un ingrediente in una sede.
export async function getGiacenzaMP(orgId, sedeId, nomeIng) {
  const mag = await sload(SK_MAG, orgId, sedeId) || {}
  const k = normIng(nomeIng)
  return Number(mag[k]?.giacenza_g || 0)
}

// Sposta materia prima da sedeDa a sedeA.
// quantita in grammi (convenzione esistente del magazzino).
// throws se non disponibile in sedeDa.
export async function spostaMaterialePrima({ orgId, sedeDa, sedeA, ingrediente, quantita }) {
  if (!orgId) throw new Error('orgId mancante')
  if (!sedeDa || !sedeA) throw new Error('Sedi non specificate')
  if (sedeDa === sedeA) throw new Error('Sede origine e destinazione coincidono')
  if (!(quantita > 0)) throw new Error('Quantita non valida')

  const k = normIng(ingrediente)
  if (!k) throw new Error('Ingrediente non specificato')

  // 1. Carica magazzini delle due sedi.
  const [magDa, magA] = await Promise.all([
    sload(SK_MAG, orgId, sedeDa).then(m => m || {}),
    sload(SK_MAG, orgId, sedeA).then(m => m || {}),
  ])

  const giacDa = Number(magDa[k]?.giacenza_g || 0)
  if (giacDa < quantita) {
    throw new Error(`Disponibilità insufficiente in sede di partenza: ${giacDa}g disponibili, richiesti ${quantita}g`)
  }

  // 2. Calcola nuove giacenze.
  const newMagDa = {
    ...magDa,
    [k]: {
      ...magDa[k],
      giacenza_g: giacDa - quantita,
      ultimoMovimento: new Date().toISOString(),
    },
  }
  const baseA = magA[k] || { giacenza_g: 0, soglia_g: 0 }
  const newMagA = {
    ...magA,
    [k]: {
      ...baseA,
      giacenza_g: Number(baseA.giacenza_g || 0) + quantita,
      ultimoMovimento: new Date().toISOString(),
    },
  }

  // 3. Salva PRIMA il decremento, POI l'incremento.
  // Se il secondo fallisce, l'errore è chiaro e la perdita è limitata
  // (l'utente vede che la sede sorgente ha già scalato e può rifare a mano).
  await ssave(SK_MAG, newMagDa, orgId, sedeDa)
  try {
    await ssave(SK_MAG, newMagA, orgId, sedeA)
  } catch (e) {
    // Rollback best-effort sul decremento.
    try { await ssave(SK_MAG, magDa, orgId, sedeDa) } catch {}
    throw new Error('Trasferimento fallito sull\'incremento destinazione (rollback applicato): ' + e.message)
  }

  return { giacenzaDa: newMagDa[k].giacenza_g, giacenzaA: newMagA[k].giacenza_g }
}

// Rollback di un movimento già eseguito (per annullamento trasferimento).
export async function rollbackMaterialePrima({ orgId, sedeDa, sedeA, ingrediente, quantita }) {
  return spostaMaterialePrima({ orgId, sedeDa: sedeA, sedeA: sedeDa, ingrediente, quantita })
}
