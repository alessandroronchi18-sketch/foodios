// Registrazione spreco/omaggio SERVER-SIDE per il DIPENDENTE.
// Il client del dipendente ha il ricettario SANITIZZATO (senza ingredienti/costi),
// quindi calcolaFC()=0: se salvasse lui, il movimento avrebbe food cost = 0,
// corrompendo i report sprechi/omaggi e il P&L di cassa del titolare. Qui
// ricalcoliamo fcUnit/fcTot col ricettario REALE (service key), riusando
// l'IDENTICA logica di SpreciOmaggi (autoFcDaRicetta: match ricetta + calcolaFC /
// reg.unita). Il titolare continua a usare il flusso client (ha il ricettario
// completo, calcola corretto). Formato del movimento INVARIATO, cosi' i record
// del titolare e del dipendente restano interscambiabili in aggregaGiorno.
export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'
import { buildIngCosti, calcolaFC, getR } from '../src/lib/foodcost.js'

const SK_RIC = 'pasticceria-ricettario-v1'
const SK_MOV = 'pasticceria-movimenti-speciali-v1'

const applySede = (q, sedeId) => (sedeId === null ? q.is('sede_id', null) : q.eq('sede_id', sedeId))

async function readUD(supabase, orgId, key, sedeId) {
  const { data, error } = await applySede(
    supabase.from('user_data').select('data_value, updated_at').eq('organization_id', orgId).eq('data_key', key),
    sedeId,
  ).order('updated_at', { ascending: false }).limit(1)
  if (error) throw new Error(`read ${key}: ${error.message}`)
  return data?.[0]?.data_value ?? null
}

async function writeUD(supabase, orgId, key, sedeId, value) {
  const { data: existing, error: selErr } = await applySede(
    supabase.from('user_data').select('id').eq('organization_id', orgId).eq('data_key', key), sedeId)
  if (selErr) throw new Error(`write-sel ${key}: ${selErr.message}`)
  const updated_at = new Date().toISOString()
  if (existing && existing.length > 0) {
    const { error } = await applySede(
      supabase.from('user_data').update({ data_value: value, updated_at }).eq('organization_id', orgId).eq('data_key', key), sedeId)
    if (error) throw new Error(`update ${key}: ${error.message}`)
  } else {
    const { error } = await supabase.from('user_data').insert({ organization_id: orgId, sede_id: sedeId, data_key: key, data_value: value, updated_at })
    if (error) throw new Error(`insert ${key}: ${error.message}`)
  }
}

// IDENTICO ad autoFcDaRicetta() in SpreciOmaggi: se "nome" combacia con una
// ricetta nota → fcUnit = calcolaFC(...) / reg.unita (per pezzo). Altrimenti null.
function autoFcDaRicetta(nome, ricettario, ingCosti) {
  const ric = ricettario?.ricette?.[(nome || '').toUpperCase().trim()] || ricettario?.ricette?.[nome]
  if (!ric) return null
  const reg = getR(ric.nome, ric)
  const { tot } = calcolaFC(ric, ingCosti, ricettario)
  if (!Number.isFinite(tot) || !reg?.unita) return null
  return { fcUnit: tot / reg.unita, unita: 'pz', categoria: ric.categoria || '' }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  const orgId = profile.organization_id

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }
  const { sedeId, movimento } = body || {}
  if (!sedeId || typeof sedeId !== 'string') return json({ error: 'sedeId mancante' }, 400, req)
  if (!movimento || typeof movimento !== 'object') return json({ error: 'movimento mancante' }, 400, req)

  const tipo = movimento.tipo === 'omaggio' ? 'omaggio' : 'spreco'
  const prodotto = (movimento.prodotto || '').toString().trim()
  const categoria = (movimento.categoria || '').toString().trim()
  if (!prodotto && !categoria) return json({ error: 'Specifica almeno il prodotto o la categoria' }, 400, req)
  const qta = Number(movimento.qta) || 0
  if (!(qta > 0)) return json({ error: 'Quantita non valida' }, 400, req)
  const unita = movimento.unita === 'pz' ? 'pz' : 'g'

  // La sede deve appartenere all'org del chiamante (no cross-org / cross-sede).
  const { data: sede } = await supabase.from('sedi').select('id').eq('id', sedeId).eq('organization_id', orgId).maybeSingle()
  if (!sede) return json({ error: 'sede non valida' }, 403, req)

  let ricettario, movimenti
  try {
    ricettario = await readUD(supabase, orgId, SK_RIC, null)
    movimenti = (await readUD(supabase, orgId, SK_MOV, sedeId)) || []
  } catch (e) {
    return json({ error: 'Lettura dati fallita: ' + e.message }, 500, req)
  }
  if (!ricettario?.ricette) return json({ error: 'Ricettario non disponibile' }, 409, req)

  const ingCosti = buildIngCosti(ricettario.ingredienti_costi || {})

  // Ricalcolo FOOD COST col ricettario REALE. Se il prodotto combacia con una
  // ricetta nota usiamo il suo fcUnit (per pezzo), altrimenti — prodotto/categoria
  // generico senza ricetta — manteniamo il fcUnit che l'utente ha inserito a mano
  // (input legittimo, non corruzione). Stessa identica logica del client titolare.
  const auto = autoFcDaRicetta(prodotto, ricettario, ingCosti)
  const fcUnit = auto ? auto.fcUnit : (Number(movimento.fcUnit) || 0)
  const fcTot = fcUnit * qta
  const valoreOmaggio = tipo === 'omaggio' ? (Number(movimento.valoreOmaggio) || 0) * qta : 0

  // Arricchimento autore (come aggiungiMovimento lato client).
  let autore_ruolo = profile.ruolo || 'titolare'
  let autore_email = user.email || null
  try {
    const { data: prof } = await supabase.from('profiles').select('ruolo,email').eq('id', user.id).maybeSingle()
    if (prof) { autore_ruolo = prof.ruolo || autore_ruolo; autore_email = prof.email || autore_email }
  } catch { /* best-effort */ }

  const rec = {
    id: movimento.id || `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: movimento.ts || new Date().toISOString(),
    tipo,
    categoria,
    prodotto,
    qta,
    unita,
    causale: (movimento.causale || '').toString(),
    fcUnit,
    fcTot,
    valoreOmaggio,
    note: (movimento.note || '').toString(),
    autore_uid: user.id,
    autore_email,
    autore_ruolo,
  }
  const nuova = [rec, ...(Array.isArray(movimenti) ? movimenti : [])]

  // SAVE FIRST: scriviamo prima di restituire ok; il client aggiorna lo state
  // solo su ok.
  try {
    await writeUD(supabase, orgId, SK_MOV, sedeId, nuova)
  } catch (e) {
    return json({ error: 'Salvataggio fallito: ' + e.message }, 500, req)
  }

  // Scarico stock PF: lo SpreciOmaggi del titolare già lo fa, ma il flusso
  // dipendente saltava questo step (audit 2026-06-17 HIGH). Solo se prodotto
  // matchato a ricetta e unita 'pz' (no scarto su materia prima).
  if (auto && unita === 'pz' && prodotto) {
    try {
      await supabase.rpc('stock_pf_scarto', {
        p_sede_id: sedeId,
        p_prodotto: prodotto.toUpperCase().trim(),
        p_quantita: qta,
        p_note: `${tipo} dipendente: ${movimento.causale || 'n/a'}`,
      })
    } catch (e) {
      console.warn('[spreco-registra] stock_pf_scarto failed', e?.message)
    }
  }

  return json({ ok: true, movimento: rec, movimenti: nuova }, 200, req)
}
