// Registrazione produzione SERVER-SIDE per il DIPENDENTE.
// Il client del dipendente NON riceve gli ingredienti delle ricette, quindi non
// può calcolare lo scarico magazzino: lo fa qui il server con la service key,
// riusando l'IDENTICA matematica di src/lib/foodcost.js (stessa normalizzazione
// → nessun disallineamento delle chiavi magazzino). Restituisce magazzino e
// giornaliero SANITIZZATI (senza ingredientiUsati/fcTot). Il titolare continua a
// usare il flusso client esistente (questo endpoint è per il dipendente).
export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'
import { buildIngCosti, calcolaFC, getR, normIng } from '../src/lib/foodcost.js'

const SK_RIC = 'pasticceria-ricettario-v1'
const SK_MAG = 'pasticceria-magazzino-v1'
const SK_GIOR = 'pasticceria-giornaliero-v1'

function applySede(q, sedeId) {
  return sedeId === null ? q.is('sede_id', null) : q.eq('sede_id', sedeId)
}

async function readUD(supabase, orgId, key, sedeId) {
  const q = applySede(
    supabase.from('user_data').select('data_value, updated_at').eq('organization_id', orgId).eq('data_key', key),
    sedeId,
  )
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(1)
  if (error) throw new Error(`read ${key}: ${error.message}`)
  return data?.[0]?.data_value ?? null
}

async function writeUD(supabase, orgId, key, sedeId, value) {
  const { data: existing, error: selErr } = await applySede(
    supabase.from('user_data').select('id').eq('organization_id', orgId).eq('data_key', key),
    sedeId,
  )
  if (selErr) throw new Error(`write-sel ${key}: ${selErr.message}`)
  const updated_at = new Date().toISOString()
  if (existing && existing.length > 0) {
    const { error } = await applySede(
      supabase.from('user_data').update({ data_value: value, updated_at }).eq('organization_id', orgId).eq('data_key', key),
      sedeId,
    )
    if (error) throw new Error(`update ${key}: ${error.message}`)
  } else {
    const { error } = await supabase.from('user_data').insert({ organization_id: orgId, sede_id: sedeId, data_key: key, data_value: value, updated_at })
    if (error) throw new Error(`insert ${key}: ${error.message}`)
  }
}

// Rimuove i campi sensibili (composizione + food cost) da una sessione.
function stripSessione(s) {
  const { ingredientiUsati, fcTot, ...rest } = s
  return rest
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  const orgId = profile.organization_id

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }
  const { sedeId, data, prodotti, note, destinazioneSedeId, destinazioneSedeNome } = body || {}

  if (!sedeId || typeof sedeId !== 'string') return json({ error: 'sedeId mancante' }, 400, req)
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: 'data non valida' }, 400, req)
  if (!Array.isArray(prodotti) || prodotti.length === 0) return json({ error: 'prodotti mancanti' }, 400, req)

  // La sede deve appartenere all'org del chiamante (no cross-org / cross-sede).
  const { data: sede } = await supabase.from('sedi').select('id').eq('id', sedeId).eq('organization_id', orgId).maybeSingle()
  if (!sede) return json({ error: 'sede non valida' }, 403, req)

  let ricettario, magazzino, giornaliero
  try {
    ricettario = await readUD(supabase, orgId, SK_RIC, null)
    magazzino = (await readUD(supabase, orgId, SK_MAG, sedeId)) || {}
    giornaliero = (await readUD(supabase, orgId, SK_GIOR, sedeId)) || []
  } catch (e) {
    return json({ error: 'Lettura dati fallita: ' + e.message }, 500, req)
  }
  if (!ricettario?.ricette) return json({ error: 'Ricettario non disponibile' }, 409, req)

  const ingCosti = buildIngCosti(ricettario?.ingredienti_costi || {})

  // ── Stessa logica di computeSessione (titolare), ma server-side ─────────────
  const ings = {}
  let fcTot = 0, ricavoTot = 0
  const prodottiSess = []
  for (const p of prodotti) {
    const nome = (p?.nome || '').toString()
    if (!nome) continue
    const ric = ricettario.ricette[nome] || ricettario.ricette[nome.toUpperCase().trim()]
    if (!ric) continue
    const reg = getR(nome, ric)
    const q = Math.max(0, Number(p.stampi) || 0)
    const qv = p.vendibile != null ? Math.max(0, Number(p.vendibile) || 0) : q
    ricavoTot += qv * (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)
    const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
    fcTot += q * fc
    for (const ing of (ric.ingredienti || [])) {
      const k = normIng(ing.nome)
      ings[k] = (ings[k] || 0) + (Number(ing.qty1stampo) || 0) * q
    }
    prodottiSess.push({ nome, stampi: q, vendibile: qv, congelabile: !!(p.congelabile ?? ric.congelabile) })
  }
  if (prodottiSess.length === 0) return json({ error: 'Nessun prodotto valido nel ricettario' }, 400, req)

  // Scala magazzino (immutabile, come il client titolare).
  const nm = { ...magazzino }
  for (const [k, qty] of Object.entries(ings)) {
    if (nm[k]) nm[k] = { ...nm[k], giacenza_g: Math.max(0, (nm[k].giacenza_g || 0) - qty) }
  }

  const sess = {
    id: `g-${Date.now()}`,
    data,
    prodotti: prodottiSess,
    note: (note || '').toString().slice(0, 500),
    ingredientiUsati: ings,
    fcTot,
    ricavoTot,
    destinazioneSedeId: destinazioneSedeId || null,
    destinazioneSedeNome: destinazioneSedeNome || null,
    creatoDa: 'dipendente',
  }
  const ng = [sess, ...(Array.isArray(giornaliero) ? giornaliero : [])]

  // SAVE FIRST: se la scrittura fallisce niente di mezzo viene esposto al client.
  try {
    await writeUD(supabase, orgId, SK_MAG, sedeId, nm)
    await writeUD(supabase, orgId, SK_GIOR, sedeId, ng)
  } catch (e) {
    return json({ error: 'Salvataggio fallito: ' + e.message }, 500, req)
  }

  return json({
    ok: true,
    magazzino: nm,                    // giacenze materie prime (nomi+stock: il dip le gestisce)
    giornaliero: ng.map(stripSessione), // senza ingredientiUsati/fcTot
    sessione: stripSessione(sess),
  }, 200, req)
}
