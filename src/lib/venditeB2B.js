// Vendite B2B / ingrosso — CRUD clienti business + vendite all'ingrosso.
// Canale separato dal retail: scarica lo stock PF ma non tocca le chiusure
// cassa (quindi non entra nel sell-through B2C).
import { supabase } from './supabase'
import { scaricoVenditaPF } from './stockPF'

// ── Clienti B2B ──────────────────────────────────────────────────────────────
export async function loadClientiB2B(orgId) {
  if (!orgId) return []
  const { data, error } = await supabase
    .from('clienti_b2b').select('*')
    .eq('organization_id', orgId).order('nome', { ascending: true })
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
export async function loadVenditeB2B(orgId) {
  if (!orgId) return []
  const { data, error } = await supabase
    .from('vendite_b2b').select('*, clienti_b2b(nome)')
    .eq('organization_id', orgId).order('data', { ascending: false })
  if (error) throw error
  return data || []
}

// righe = [{ prodotto, qta, prezzo }] — totale calcolato qui.
// Se sedeId è presente, scarica lo stock PF per ogni riga (causale 'vendita',
// nota "B2B · <cliente>"): così lo stock cala ma il sell-through retail no.
export async function salvaVenditaB2B({ orgId, sedeId, clienteId, clienteNome, data, righe, note }) {
  if (!orgId) throw new Error('orgId mancante')
  const pulite = (righe || [])
    .map(r => {
      const prodotto = (r.prodotto || '').toUpperCase().trim()
      const qta = Number(String(r.qta).replace(',', '.')) || 0
      const prezzo = Number(String(r.prezzo).replace(',', '.')) || 0
      return { prodotto, qta, prezzo, totale: Math.round(qta * prezzo * 100) / 100 }
    })
    .filter(r => r.prodotto && r.qta > 0)
  if (!pulite.length) throw new Error('Aggiungi almeno un prodotto con quantità')
  const totale = Math.round(pulite.reduce((s, r) => s + r.totale, 0) * 100) / 100

  const { data: ins, error } = await supabase.from('vendite_b2b').insert({
    organization_id: orgId,
    sede_id: sedeId || null,
    cliente_id: clienteId || null,
    data: data || new Date().toISOString().slice(0, 10),
    righe: pulite,
    totale,
    stato: 'consegnata',
    stock_scaricato: !!sedeId,
    note: note?.trim() || null,
  }).select('id').single()
  if (error) throw error

  // Scarico stock PF (best-effort: una riga fallita non annulla la vendita)
  const errori = []
  if (sedeId) {
    for (const r of pulite) {
      try {
        await scaricoVenditaPF({ sedeId, prodotto: r.prodotto, quantita: r.qta, note: `B2B${clienteNome ? ' · ' + clienteNome : ''}` })
      } catch (e) { errori.push(`${r.prodotto}: ${e.message || 'errore'}`) }
    }
  }
  return { id: ins.id, totale, errori }
}

export async function setStatoVenditaB2B(id, stato) {
  const { error } = await supabase.from('vendite_b2b').update({ stato }).eq('id', id)
  if (error) throw error
}

export async function eliminaVenditaB2B(id) {
  const { error } = await supabase.from('vendite_b2b').delete().eq('id', id)
  if (error) throw error
}
