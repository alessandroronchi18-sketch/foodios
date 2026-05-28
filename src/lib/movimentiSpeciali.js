// Movimenti speciali (sprechi e omaggi) - eventi operativi che NON sono vendite
// e NON sono produzione, ma DEVONO essere tracciati per far quadrare i conti.
//
// Spreco esplicito: prodotto/ingrediente caduto/scaduto/sbagliato → scarica
//   stock, contribuisce al "totale spreco" della giornata con causale.
// Omaggio: prodotto regalato → scarica stock come una vendita ma con ricavo 0.
//   Il food cost del prodotto resta un costo reale per l'azienda.
//
// Persistenza: per-sede in `pasticceria-movimenti-speciali-v1` (array di eventi).
// Il dipendente puo' registrarli (chiave operativa nell'RLS).

import { sload, ssave } from './storage'
import { supabase } from './supabase'
import { SK_MOV } from './storageKeys'

export const CAUSALI_SPRECO = [
  'Caduto',
  'Scaduto',
  'Errore preparazione',
  'Contaminato / non conforme',
  'Test / assaggio',
  'Altro',
]

export const CAUSALI_OMAGGIO = [
  'Cliente abituale',
  'Errore servizio (rifatto)',
  'Marketing / promo',
  'Test nuovo prodotto',
  'Evento',
  'Altro',
]

export function nuovoMovimento(tipo = 'spreco') {
  return {
    id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    tipo,                  // 'spreco' | 'omaggio'
    categoria: '',         // se collegato a un formato per-categoria
    prodotto: '',          // nome ricetta o etichetta libera
    qta: 0,
    unita: 'g',            // 'g' | 'pz'
    causale: tipo === 'spreco' ? CAUSALI_SPRECO[0] : CAUSALI_OMAGGIO[0],
    fcUnit: 0,             // €/unita
    fcTot: 0,              // €
    valoreOmaggio: 0,      // €, ricavo mancato (solo per omaggi)
    note: '',
    autore_uid: null,
    autore_email: null,
    autore_ruolo: null,
  }
}

// Carica i movimenti per una sede (array, ordinato dal piu' recente).
export async function caricaMovimenti(orgId, sedeId) {
  if (!orgId) return []
  const v = await sload(SK_MOV, orgId, sedeId || null)
  return Array.isArray(v) ? v : []
}

// Aggiunge un movimento (lo arricchisce con i dati dell'autore corrente).
export async function aggiungiMovimento(orgId, sedeId, mov) {
  if (!orgId) throw new Error('orgId mancante')
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user || null
  let autore_uid = user?.id || null
  let autore_email = user?.email || null
  let autore_ruolo = null
  if (autore_uid) {
    const { data: prof } = await supabase.from('profiles').select('ruolo,email').eq('id', autore_uid).maybeSingle()
    autore_ruolo = prof?.ruolo || 'titolare'
    autore_email = prof?.email || autore_email
  }
  const arricchito = {
    ...mov,
    id: mov.id || `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: mov.ts || new Date().toISOString(),
    autore_uid, autore_email, autore_ruolo,
  }
  const arr = await caricaMovimenti(orgId, sedeId)
  const nuova = [arricchito, ...arr]
  await ssave(SK_MOV, nuova, orgId, sedeId || null)
  return arricchito
}

// Elimina un movimento per id.
export async function eliminaMovimento(orgId, sedeId, id) {
  const arr = await caricaMovimenti(orgId, sedeId)
  const nuova = arr.filter(m => m.id !== id)
  await ssave(SK_MOV, nuova, orgId, sedeId || null)
  return nuova
}

// Filtra movimenti per intervallo [da, a] (date ISO YYYY-MM-DD inclusi).
export function filtraPerIntervallo(movimenti, da, a) {
  if (!da && !a) return movimenti
  const dFrom = da ? new Date(`${da}T00:00:00`).getTime() : -Infinity
  const dTo   = a  ? new Date(`${a}T23:59:59`).getTime()  :  Infinity
  return movimenti.filter(m => {
    const t = new Date(m.ts).getTime()
    return Number.isFinite(t) && t >= dFrom && t <= dTo
  })
}

// Totali per il drift nel giorno (per categoria/prodotto, in grammi e in €).
//
// Restituisce:
//   {
//     perCategoria: { [cat]: { gSpreco, gOmaggio, eurSpreco, eurOmaggio } },
//     perProdotto:  { [nome]: { gSpreco, gOmaggio, ... } },
//     tot: { gSpreco, gOmaggio, eurSpreco, eurOmaggio }
//   }
//
// `unita` viene unificata in grammi quando == 'g'. Le quantita' in 'pz' vengono
// contate separatamente come `nPzSpreco/nPzOmaggio` (sotto a `tot`), perche'
// senza un peso non possiamo sommarle al drift in grammi.
export function aggregaGiorno(movimenti, dataIso) {
  const sel = movimenti.filter(m => (m.ts || '').slice(0, 10) === dataIso)
  const perCategoria = {}
  const perProdotto = {}
  // eurSpreco/eurOmaggio sono il FOOD COST (costo effettivo per l'azienda).
  // eurRicavoMancato e' il ricavo che non e' entrato per l'omaggio (margine perso).
  const tot = {
    gSpreco: 0, gOmaggio: 0,
    eurSpreco: 0, eurOmaggio: 0, eurRicavoMancato: 0,
    nPzSpreco: 0, nPzOmaggio: 0,
  }
  for (const m of sel) {
    const tipo = m.tipo
    const cat = m.categoria || ''
    const prod = m.prodotto || cat || '(senza nome)'
    const qta = Number(m.qta) || 0
    const fc  = Number(m.fcTot) || (Number(m.fcUnit) || 0) * qta
    const val = Number(m.valoreOmaggio) || 0
    if (!perCategoria[cat]) perCategoria[cat] = { gSpreco: 0, gOmaggio: 0, eurSpreco: 0, eurOmaggio: 0 }
    if (!perProdotto[prod]) perProdotto[prod] = { gSpreco: 0, gOmaggio: 0, eurSpreco: 0, eurOmaggio: 0 }
    if (m.unita === 'g') {
      if (tipo === 'spreco')  { perCategoria[cat].gSpreco  += qta; perProdotto[prod].gSpreco  += qta; tot.gSpreco  += qta }
      if (tipo === 'omaggio') { perCategoria[cat].gOmaggio += qta; perProdotto[prod].gOmaggio += qta; tot.gOmaggio += qta }
    } else {
      if (tipo === 'spreco')  tot.nPzSpreco  += qta
      if (tipo === 'omaggio') tot.nPzOmaggio += qta
    }
    if (tipo === 'spreco')  { perCategoria[cat].eurSpreco  += fc; perProdotto[prod].eurSpreco  += fc; tot.eurSpreco  += fc }
    if (tipo === 'omaggio') { perCategoria[cat].eurOmaggio += fc; perProdotto[prod].eurOmaggio += fc; tot.eurOmaggio += fc; tot.eurRicavoMancato += val }
  }
  return { perCategoria, perProdotto, tot }
}
