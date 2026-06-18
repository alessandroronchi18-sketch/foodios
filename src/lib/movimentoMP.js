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
import { normIng } from './foodcost'
import { supabase } from './supabase'

// Registra un movimento MP orfano (ssave + rollback ssave entrambi falliti).
// Best-effort: se anche questo fallisce, console.error.
async function registraMovimentoOrfano(info) {
  try {
    await supabase.from('error_log').insert({
      endpoint: 'movimentoMP',
      operation: 'mp_orphan',
      code: 'MP_ORPHAN',
      message: JSON.stringify(info).slice(0, 1500),
      org_id: info.orgId || null,
    })
  } catch (e) {
    console.error('[movimentoMP] registraMovimentoOrfano insert failed', e?.message)
  }
}

const SK_MAG = 'pasticceria-magazzino-v1'

// NB: usiamo lo STESSO normIng di foodcost.js (con normalizzazione singolare/
// plurale). La produzione scala il magazzino con quelle chiavi: se qui usassimo
// una normalizzazione diversa, "uova" (magazzino) e "uovo" (ricetta) non
// combacerebbero e i trasferimenti mancherebbero la voce giusta.

// Restituisce la giacenza disponibile per un ingrediente in una sede.
export async function getGiacenzaMP(orgId, sedeId, nomeIng) {
  const mag = await sload(SK_MAG, orgId, sedeId) || {}
  const k = normIng(nomeIng)
  return Number(mag[k]?.giacenza_g || 0)
}

// Sposta materia prima da sedeDa a sedeA.
// quantita in grammi (convenzione esistente del magazzino).
// throws se non disponibile in sedeDa.
export async function spostaMaterialePrima({ orgId, sedeDa, sedeA, ingrediente, quantita, consentiNegativo = false }) {
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
  // `consentiNegativo` serve al rollback: annullare un movimento già avvenuto
  // deve riuscire anche se la sede destinazione ha già consumato parte della MP.
  if (!consentiNegativo && giacDa < quantita) {
    throw new Error(`Disponibilità insufficiente in sede di partenza: ${giacDa}g disponibili, richiesti ${quantita}g`)
  }

  // 2. Calcola nuove giacenze.
  const newMagDa = {
    ...magDa,
    [k]: {
      ...magDa[k],
      giacenza_g: Math.max(0, giacDa - quantita),
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
    try {
      await ssave(SK_MAG, magDa, orgId, sedeDa)
    } catch (rollbackErr) {
      // Audit 2026-06-17 CRITICAL: rollback fallito = stato inconsistente.
      // Loggo su console (Sentry) E persisto su error_log per visibilità admin.
      const info = {
        orgId, sedeDa, sedeA,
        ingrediente: k,
        decrement_originale: magDa[k]?.giacenza_g,
        decrement_applicato: newMagDa[k]?.giacenza_g,
        quantita,
        save_dest_error: e?.message,
        rollback_error: rollbackErr?.message,
      }
      console.error('[movimentoMP] CRITICAL: rollback ssave fallito', info)
      await registraMovimentoOrfano(info)
    }
    throw new Error('Trasferimento fallito sull\'incremento destinazione (rollback applicato): ' + e.message)
  }

  return { giacenzaDa: newMagDa[k].giacenza_g, giacenzaA: newMagA[k].giacenza_g }
}

// Rollback di un movimento già eseguito (per annullamento trasferimento).
export async function rollbackMaterialePrima({ orgId, sedeDa, sedeA, ingrediente, quantita }) {
  // Movimento inverso forzato: deve riuscire anche se la destinazione originale
  // ha già consumato parte della materia ricevuta (consentiNegativo).
  return spostaMaterialePrima({ orgId, sedeDa: sedeA, sedeA: sedeDa, ingrediente, quantita, consentiNegativo: true })
}

// Scarico di MP da una sede (per workflow trasferimento step 1: invio).
// throws se non disponibile.
export async function scaricoMP({ orgId, sedeId, ingrediente, quantita }) {
  if (!orgId || !sedeId) throw new Error('Parametri mancanti')
  if (!(quantita > 0)) throw new Error('Quantita non valida')
  const k = normIng(ingrediente)
  const mag = await sload(SK_MAG, orgId, sedeId) || {}
  const giac = Number(mag[k]?.giacenza_g || 0)
  if (giac < quantita) {
    throw new Error(`Disponibilità insufficiente: ${giac}g disponibili, richiesti ${quantita}g`)
  }
  const newMag = {
    ...mag,
    [k]: { ...mag[k], giacenza_g: giac - quantita, ultimoMovimento: new Date().toISOString() },
  }
  await ssave(SK_MAG, newMag, orgId, sedeId)
  return newMag[k].giacenza_g
}

// Carico di MP in una sede (step 2: ricezione).
export async function caricoMP({ orgId, sedeId, ingrediente, quantita }) {
  if (!orgId || !sedeId) throw new Error('Parametri mancanti')
  if (!(quantita > 0)) throw new Error('Quantita non valida')
  const k = normIng(ingrediente)
  const mag = await sload(SK_MAG, orgId, sedeId) || {}
  const base = mag[k] || { giacenza_g: 0, soglia_g: 0 }
  const newMag = {
    ...mag,
    [k]: { ...base, giacenza_g: Number(base.giacenza_g || 0) + quantita, ultimoMovimento: new Date().toISOString() },
  }
  await ssave(SK_MAG, newMag, orgId, sedeId)
  return newMag[k].giacenza_g
}
