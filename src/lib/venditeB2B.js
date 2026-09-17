// Vendite B2B / ingrosso - CRUD clienti business + vendite all'ingrosso.
// Canale separato dal retail: scarica lo stock PF (causale 'vendita_b2b') ma
// non tocca le chiusure cassa, quindi non entra nel sell-through B2C.
import { supabase } from './supabase'
import { todayLocal } from './dateLocal'

// ── Helper puri (testabili) ──────────────────────────────────────────────────
// Normalizza le righe: prodotto UPPERCASE (per combaciare con stock_prodotti_finiti),
// numeri IT tolleranti, totale calcolato, scarta righe senza prodotto o qta<=0.
export function pulisciRighe(righe) {
  return (righe || []).map(r => {
    const prodotto = (r.prodotto || '').toUpperCase().trim()
    const qta = Number(String(r.qta).replace(',', '.')) || 0
    const prezzo = Number(String(r.prezzo).replace(',', '.')) || 0
    return { prodotto, qta, prezzo, totale: Math.round(qta * prezzo * 100) / 100 }
  }).filter(r => r.prodotto && r.qta > 0)
}
export function calcolaTotaleRighe(righe) {
  const tot = (righe || []).reduce((s, r) => {
    const t = Number(r.totale)
    return s + (Number.isFinite(t) ? t : (Number(r.qta) || 0) * (Number(r.prezzo) || 0))
  }, 0)
  return Math.round(tot * 100) / 100
}

// Vero se l'errore Supabase indica "funzione RPC non trovata" (migration 2 non
// ancora applicata) → in tal caso usiamo le RPC stock esistenti come fallback.
function funzioneMancante(error) {
  if (!error) return false
  return error.code === 'PGRST202' || /could not find the function|does not exist|not.*find.*function/i.test(error.message || '')
}

async function rpcScaricoB2B({ sedeId, prodotto, quantita, note }) {
  const args = { p_sede: sedeId, p_prodotto: prodotto, p_quantita: quantita, p_unita: 'pz', p_note: note }
  let r = await supabase.rpc('stock_pf_scarico_b2b', args)
  if (r.error && funzioneMancante(r.error)) r = await supabase.rpc('stock_pf_scarico_vendita', args)
  if (r.error) throw r.error
  return r.data // stock risultante (può essere < 0 → scorta insufficiente)
}
async function rpcCaricoB2B({ sedeId, prodotto, quantita, note }) {
  const args = { p_sede: sedeId, p_prodotto: prodotto, p_quantita: quantita, p_unita: 'pz', p_note: note }
  let r = await supabase.rpc('stock_pf_carico_b2b', args)
  if (r.error && funzioneMancante(r.error)) r = await supabase.rpc('stock_pf_carico_produzione', args)
  if (r.error) throw r.error
  return r.data
}

// Ripristina lo stock di una vendita già scaricata (annullo/elimina/modifica).
async function ripristinaStock(vendita, motivo) {
  if (!vendita?.stock_scaricato || !vendita.sede_id) return
  for (const r of (vendita.righe || [])) {
    if (r.prodotto && Number(r.qta) > 0) {
      try { await rpcCaricoB2B({ sedeId: vendita.sede_id, prodotto: r.prodotto, quantita: Number(r.qta), note: motivo }) } catch { /* best-effort */ }
    }
  }
}

// ── Clienti B2B ──────────────────────────────────────────────────────────────
export async function loadClientiB2B(orgId) {
  if (!orgId) return []
  const { data, error } = await supabase
    .from('clienti_b2b').select('*').eq('organization_id', orgId).order('nome', { ascending: true })
  if (error) throw error
  return data || []
}

export async function salvaClienteB2B(orgId, cliente) {
  if (!orgId) throw new Error('orgId mancante')
  if (!cliente?.nome?.trim()) throw new Error('Nome cliente obbligatorio')
  const row = {
    organization_id: orgId,
    nome: cliente.nome.trim(),
    partita_iva: cliente.partita_iva?.trim() || null,
    codice_destinatario: cliente.codice_destinatario?.trim()?.toUpperCase() || null,
    pec: cliente.pec?.trim() || null,
    indirizzo: cliente.indirizzo?.trim() || null,
    cap: cliente.cap?.trim() || null,
    citta: cliente.citta?.trim() || null,
    provincia: cliente.provincia?.trim()?.toUpperCase() || null,
    referente: cliente.referente?.trim() || null,
    email: cliente.email?.trim() || null,
    telefono: cliente.telefono?.trim() || null,
    note: cliente.note?.trim() || null,
    attivo: cliente.attivo !== false,
  }
  if (cliente.id) {
    const { error } = await supabase.from('clienti_b2b').update(row).eq('id', cliente.id)
    if (error) throw error
    return cliente.id
  }
  const { data, error } = await supabase.from('clienti_b2b').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

export async function eliminaClienteB2B(id) {
  const { error } = await supabase.from('clienti_b2b').delete().eq('id', id)
  if (error) throw error
}

// ── Vendite B2B ────────────────────────────────────────────────────────────
// Le vendite B2B di una sede.
//
// `sedeId` mancante (o vista "tutte le sedi") = tutte. Con una sede scelta si
// tengono le sue vendite PIÙ quelle senza sede: le righe vecchie sono state
// salvate prima che il campo esistesse, e nasconderle vorrebbe dire far
// sparire fatturato senza dirlo.
//
// Paginato: il server taglia a 1.000 righe qualunque select.
export async function loadVenditeB2B(orgId, { sedeId = null } = {}) {
  if (!orgId) return []
  const PAGINA = 1000
  const righe = []
  for (let offset = 0; ; offset += PAGINA) {
    let q = supabase.from('vendite_b2b').select('*, clienti_b2b(nome)')
      .eq('organization_id', orgId)
    if (sedeId) q = q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
    const { data, error } = await q.order('data', { ascending: false }).range(offset, offset + PAGINA - 1)
    if (error) throw error
    const lotto = data || []
    righe.push(...lotto)
    if (lotto.length < PAGINA) break
  }
  return righe
}

// Crea (id assente) o MODIFICA (id presente) una vendita.
// In modifica ribilancia lo stock: ripristina le vecchie righe, poi scarica le nuove.
// Ritorna { id, totale, warnings } - warnings include scorte insufficienti (non bloccante).
export async function salvaVenditaB2B({ orgId, sedeId, clienteId, clienteNome, data, righe, note, id }) {
  if (!orgId) throw new Error('orgId mancante')
  const pulite = pulisciRighe(righe)
  if (!pulite.length) throw new Error('Aggiungi almeno un prodotto con quantità')
  const totale = calcolaTotaleRighe(pulite)

  // In modifica: ripristina lo stock della versione precedente.
  if (id) {
    const { data: old } = await supabase.from('vendite_b2b').select('*').eq('id', id).single()
    if (old) await ripristinaStock(old, 'Annullo B2B (modifica)')
  }

  let dipOpId = null
  try { dipOpId = JSON.parse(localStorage.getItem('foodos_dip_op') || 'null')?.id || null } catch {}
  const row = {
    organization_id: orgId,
    sede_id: sedeId || null,
    cliente_id: clienteId || null,
    // Il giorno della consegna è quello del laboratorio. Con
    // `toISOString()` era il giorno UTC: una consegna registrata alle 00:30 —
    // e nelle pasticcerie si registra dopo la chiusura — finiva datata ieri,
    // e con lei l'incasso B2B e lo scarico di magazzino.
    data: data || todayLocal(),
    righe: pulite,
    totale,
    stato: 'consegnata',
    stock_scaricato: !!sedeId,
    note: note?.trim() || null,
    dipendente_operativo_id: dipOpId,
  }

  let venditaId = id
  if (id) {
    const { error } = await supabase.from('vendite_b2b').update(row).eq('id', id)
    if (error) throw error
  } else {
    const { data: ins, error } = await supabase.from('vendite_b2b').insert(row).select('id').single()
    if (error) throw error
    venditaId = ins.id
  }

  // Scarico stock delle nuove righe (best-effort) + avviso scorta insufficiente.
  const warnings = []
  if (sedeId) {
    for (const r of pulite) {
      try {
        const stock = await rpcScaricoB2B({ sedeId, prodotto: r.prodotto, quantita: r.qta, note: `B2B${clienteNome ? ' · ' + clienteNome : ''}` })
        if (typeof stock === 'number' && stock < 0) warnings.push(`${r.prodotto}: scorta insufficiente (stock ${stock})`)
      } catch (e) { warnings.push(`${r.prodotto}: ${e.message || 'errore stock'}`) }
    }
  }
  return { id: venditaId, totale, warnings }
}

export async function setStatoVenditaB2B(id, stato) {
  if (stato === 'annullata') {
    const { data: v } = await supabase.from('vendite_b2b').select('*').eq('id', id).single()
    if (v) await ripristinaStock(v, 'Annullo vendita B2B')
    const { error } = await supabase.from('vendite_b2b').update({ stato: 'annullata', stock_scaricato: false }).eq('id', id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('vendite_b2b').update({ stato }).eq('id', id)
  if (error) throw error
}

// Segna una vendita come pagata / da incassare. Resiliente: se le colonne
// pagamento non sono ancora migrate, ritorna { degraded:true } senza rompere.
export async function setPagamentoVenditaB2B(id, pagata, dataPagamento) {
  // Stessa ragione: la data dell'incasso è un giorno locale, non UTC.
  const patch = { pagata: !!pagata, data_pagamento: pagata ? (dataPagamento || todayLocal()) : null }
  let { error } = await supabase.from('vendite_b2b').update(patch).eq('id', id)
  if (error && /does not exist|schema cache|PGRST204|could not find/i.test(error.message || '')) {
    return { degraded: true }
  }
  if (error) throw error
  return {}
}

export async function eliminaVenditaB2B(id) {
  const { data: v } = await supabase.from('vendite_b2b').select('*').eq('id', id).single()
  if (v) await ripristinaStock(v, 'Annullo vendita B2B (eliminata)')
  const { error } = await supabase.from('vendite_b2b').delete().eq('id', id)
  if (error) throw error
}

// ── I chili venduti all'ingrosso, in un periodo ─────────────────────────────
//
// Serve a non contare due volte gli stessi chili. I chili che escono
// dall'inventario sono TUTTI i chili usciti: quelli venduti al banco e quelli
// consegnati a un bar o a un ristorante. Le pagine che stimano l'incasso dai
// chili (conto economico, confronto fra sedi) li moltiplicavano tutti per il
// prezzo medio del banco — cioè fatturavano la vaschetta all'ingrosso al
// prezzo della coppetta — e poi il fatturato dell'ingrosso arrivava anche
// dalla sua fattura. La Quadratura questo lo sapeva già e toglieva i kg B2B:
// le altre due pagine no, e mostravano un numero diverso per la stessa cosa.
//
// Ritorna `null` se la lettura fallisce, NON un elenco vuoto: chi la usa
// distingue «non ha comprato niente all'ingrosso» da «non lo so», e nel
// secondo caso lascia i chili dove sono dicendo che il dato non c'è.
//
// `includiSenzaSede` (default sì): le vendite registrate prima che il campo
// sede esistesse hanno `sede_id` nullo, ed è la stessa regola di
// `loadVenditeB2B`. Chi confronta le sedi fra loro lo mette a `false`, se no
// gli stessi chili verrebbero tolti a ogni negozio.
export async function venditeB2BPeriodo(orgId, { sedeId = null, da, a, includiSenzaSede = true } = {}) {
  if (!orgId || !da || !a) return null
  let q = supabase.from('vendite_b2b').select('data, righe, totale, sede_id')
    .eq('organization_id', orgId).gte('data', da).lte('data', a)
  if (sedeId) {
    q = includiSenzaSede ? q.or(`sede_id.eq.${sedeId},sede_id.is.null`) : q.eq('sede_id', sedeId)
  }
  const { data, error } = await q
  if (error) { console.error('venditeB2BPeriodo:', error); return null }
  return data || []
}
