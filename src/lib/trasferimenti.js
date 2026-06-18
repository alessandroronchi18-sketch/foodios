// Wrapper sulle RPC trasferimento_invia / ricevi / annulla
// + helper per creare e listare trasferimenti.
//
// Movimenti stock:
//   - tipo='prodotto'      → atomico via RPC (stock_prodotti_finiti)
//   - tipo='materia_prima' → client-side via movimentoMP.js (chiamato dalla UI)
//   - tipo='semilavorato'  → solo log per ora
import { supabase } from './supabase'

// ── Letture ────────────────────────────────────────────────────────────────

export async function loadTrasferimenti(orgId, { sedeAttivaId = null, scope = 'tutti', limit = 200 } = {}) {
  if (!orgId) return []
  let q = supabase
    .from('trasferimenti')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (scope === 'in' && sedeAttivaId) q = q.eq('sede_a', sedeAttivaId)
  else if (scope === 'out' && sedeAttivaId) q = q.eq('sede_da', sedeAttivaId)
  else if (scope === 'attiva' && sedeAttivaId) q = q.or(`sede_da.eq.${sedeAttivaId},sede_a.eq.${sedeAttivaId}`)
  const { data, error } = await q
  if (error) { console.error('loadTrasferimenti:', error); return [] }
  return data || []
}

export async function getTrasferimento(id) {
  const { data, error } = await supabase.from('trasferimenti').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// ── Creazione ──────────────────────────────────────────────────────────────

// Crea un trasferimento in stato 'bozza' (non muove stock).
// Per default lo crea già 'inviato' se autoInvia=true (workflow corto).
export async function creaTrasferimento({
  orgId, sedeDa, sedeA, tipo = 'prodotto', prodotto, quantita,
  unita = 'pz', valoreUnit = 0, note = null, data = null, autoInvia = false,
}) {
  if (!orgId || !sedeDa || !sedeA || !prodotto || !(quantita > 0)) {
    throw new Error('Parametri trasferimento incompleti')
  }
  if (sedeDa === sedeA) throw new Error('Sede origine e destinazione devono essere diverse')
  // Audit 2026-06-17 LOW: validazione valore_unit + bound length su prodotto/note.
  if (!(Number(valoreUnit) >= 0)) throw new Error('valore_unit deve essere >= 0')
  if (String(prodotto).length > 200) throw new Error('prodotto troppo lungo (max 200 char)')
  if (note != null && String(note).length > 500) {
    note = String(note).slice(0, 500)
  }

  const payload = {
    organization_id: orgId,
    sede_da: sedeDa,
    sede_a: sedeA,
    tipo, prodotto,
    quantita, unita,
    valore_unit: valoreUnit,
    note,
    data: data || new Date().toISOString().slice(0, 10),
    stato: 'bozza',
  }
  const { data: row, error } = await supabase.from('trasferimenti').insert(payload).select().single()
  if (error) throw error

  if (autoInvia) {
    const sent = await inviaTrasferimento(row.id)
    return sent
  }
  return row
}

// ── Transizioni stato (RPC atomiche) ───────────────────────────────────────

export async function inviaTrasferimento(id) {
  const { data, error } = await supabase.rpc('trasferimento_invia', { p_id: id })
  if (error) throw error
  return data
}

export async function riceviTrasferimento(id, { quantitaRicevuta = null, scartoNote = null } = {}) {
  const { data, error } = await supabase.rpc('trasferimento_ricevi', {
    p_id: id,
    p_quantita_ricevuta: quantitaRicevuta,
    p_scarto_note: scartoNote,
  })
  if (error) throw error
  return data
}

export async function annullaTrasferimento(id) {
  const { data, error } = await supabase.rpc('trasferimento_annulla', { p_id: id })
  if (error) throw error
  return data
}

// ── Helpers UI ─────────────────────────────────────────────────────────────

export const STATO_LABEL = {
  bozza:      { label: 'Bozza',     color: '#94A3B8', bg: '#F1F5F9' },
  inviato:    { label: 'In viaggio', color: '#2563EB', bg: '#DBEAFE' },
  ricevuto:   { label: 'Ricevuto',  color: '#16A34A', bg: '#DCFCE7' },
  completato: { label: 'Ricevuto',  color: '#16A34A', bg: '#DCFCE7' }, // legacy alias
  annullato:  { label: 'Annullato', color: '#94A3B8', bg: '#F1F5F9' },
}

export const TIPO_LABEL = {
  prodotto:      'Prodotto finito',
  materia_prima: 'Materia prima',
  semilavorato:  'Semilavorato',
}

// Stati su cui si può ancora agire.
export function isStatoModificabile(stato) {
  return stato === 'bozza' || stato === 'inviato'
}
