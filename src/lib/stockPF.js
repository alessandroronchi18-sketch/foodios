// Stock prodotti finiti per-sede.
// Tabella SQL: public.stock_prodotti_finiti
// RPC: stock_pf_carico_produzione, stock_pf_scarico_vendita, stock_pf_scarto
import { supabase } from './supabase'

// ── Letture ────────────────────────────────────────────────────────────────

// Stock di una singola sede. Ritorna array di righe.
export async function loadStockPF(orgId, sedeId) {
  if (!orgId || !sedeId) return []
  const { data, error } = await supabase
    .from('stock_prodotti_finiti')
    .select('id, prodotto_nome, quantita, unita, valore_unit, soglia_min, updated_at')
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .order('prodotto_nome')
  if (error) { console.error('loadStockPF:', error); return [] }
  return data || []
}

// Stock aggregato per tutte le sedi dell'org.
// Ritorna { [sedeId]: [righe...] }.
export async function loadStockPFAllSedi(orgId) {
  if (!orgId) return {}
  const { data, error } = await supabase
    .from('stock_prodotti_finiti')
    .select('sede_id, prodotto_nome, quantita, unita, valore_unit, soglia_min, updated_at')
    .eq('organization_id', orgId)
    .order('prodotto_nome')
  if (error) { console.error('loadStockPFAllSedi:', error); return {} }
  const out = {}
  for (const r of data || []) {
    if (!out[r.sede_id]) out[r.sede_id] = []
    out[r.sede_id].push(r)
  }
  return out
}

// Movimenti recenti (audit) per una sede.
export async function loadMovimentiPF(orgId, sedeId, { limit = 100 } = {}) {
  if (!orgId || !sedeId) return []
  const { data, error } = await supabase
    .from('movimenti_stock_pf')
    .select('id, prodotto_nome, delta, causale, note, trasferimento_id, created_at')
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('loadMovimentiPF:', error); return [] }
  return data || []
}

// ── Scritture (via RPC, atomiche) ──────────────────────────────────────────

// Carico da produzione su sede stessa.
export async function caricoProduzionePF({ sedeId, prodotto, quantita, unita = 'pz', note = null }) {
  const { data, error } = await supabase.rpc('stock_pf_carico_produzione', {
    p_sede: sedeId,
    p_prodotto: prodotto,
    p_quantita: quantita,
    p_unita: unita,
    p_note: note,
  })
  if (error) throw error
  return data
}

// Scarico per vendita (chiusura giornaliera). Permette negativo → alert UI.
// Audit 2026-06-17 LOW: guard su quantita<=0 lato client per evitare silenzioso
// no-op (la RPC server raise exception ma se chiamata con 0 esplicito client
// non vedeva errore).
export async function scaricoVenditaPF({ sedeId, prodotto, quantita, unita = 'pz', note = null }) {
  if (!(Number(quantita) > 0)) {
    throw new Error('scaricoVenditaPF: quantita deve essere > 0')
  }
  const { data, error } = await supabase.rpc('stock_pf_scarico_vendita', {
    p_sede: sedeId,
    p_prodotto: prodotto,
    p_quantita: quantita,
    p_unita: unita,
    p_note: note,
  })
  if (error) throw error
  return data
}

// Rettifica scarto manuale.
export async function scartoPF({ sedeId, prodotto, quantita, note = null }) {
  // Audit 2026-07-01 LOW: stesso guard di scaricoVenditaPF/caricoProduzionePF
  // applicato in audit 17 giu — mancava qui.
  if (!Number.isFinite(quantita) || quantita <= 0) {
    throw new Error('Quantita scarto deve essere > 0')
  }
  const { data, error } = await supabase.rpc('stock_pf_scarto', {
    p_sede: sedeId,
    p_prodotto: prodotto,
    p_quantita: quantita,
    p_note: note,
  })
  if (error) throw error
  return data
}

// ── Utility: applica un batch di carichi (es. fine sessione produzione) ────
// items = [{ prodotto, quantita, unita }]
// Ritorna { ok, errors: [...] }.
export async function caricoBatchPF(sedeId, items) {
  const errors = []
  for (const it of items || []) {
    if (!it?.prodotto || !(it.quantita > 0)) continue
    try {
      await caricoProduzionePF({
        sedeId,
        prodotto: it.prodotto,
        quantita: it.quantita,
        unita: it.unita || 'pz',
        note: it.note || null,
      })
    } catch (e) {
      errors.push({ prodotto: it.prodotto, message: e.message })
    }
  }
  return { ok: errors.length === 0, errors }
}

// ── Aggregazione: indice per nome → totale tra tutte le sedi ───────────────
export async function loadStockPFTotali(orgId) {
  if (!orgId) return {}
  const { data, error } = await supabase
    .from('stock_prodotti_finiti')
    .select('prodotto_nome, quantita')
    .eq('organization_id', orgId)
  if (error) { console.error('loadStockPFTotali:', error); return {} }
  const out = {}
  for (const r of data || []) {
    out[r.prodotto_nome] = (out[r.prodotto_nome] || 0) + Number(r.quantita || 0)
  }
  return out
}
