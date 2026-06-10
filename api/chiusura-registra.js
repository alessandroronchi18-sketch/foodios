// Salvataggio chiusura cassa SERVER-SIDE per il DIPENDENTE.
// Il client del dipendente ha il ricettario SANITIZZATO (senza ingredienti/costi),
// quindi calcolaFC()=0 → se salvasse lui, scriverebbe food cost/margine = 0 nello
// storico condiviso, corrompendo il P&L del titolare. Qui ricalcoliamo il record
// col ricettario REALE (service key), riusando l'IDENTICA logica di ChiusuraView
// (confronto + riconciliaFormati + sprechi/omaggi). Il titolare usa il flusso client.
export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../src/lib/foodcost.js'
import { riconciliaFormati } from '../src/lib/formatiVendita.js'

const SK_RIC = 'pasticceria-ricettario-v1'
const SK_GIOR = 'pasticceria-giornaliero-v1'
const SK_CHIUS = 'pasticceria-chiusure-v1'
const SK_FORMATI = 'pasticceria-formati-vendita-v1'
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

// Food cost di sprechi/omaggi del giorno (come aggregaGiorno: somma m.fcTot stored).
function movEuros(movimenti, dataIso) {
  let eurSpreco = 0, eurOmaggio = 0
  for (const m of (movimenti || [])) {
    if ((m.ts || '').slice(0, 10) !== dataIso) continue
    const qta = Number(m.qta) || 0
    const fc = Number(m.fcTot) || (Number(m.fcUnit) || 0) * qta
    if (m.tipo === 'spreco') eurSpreco += fc
    if (m.tipo === 'omaggio') eurOmaggio += fc
  }
  return { eurSpreco, eurOmaggio }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  const orgId = profile.organization_id

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }
  const { sedeId, data, venduto } = body || {}
  if (!sedeId || typeof sedeId !== 'string') return json({ error: 'sedeId mancante' }, 400, req)
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: 'data non valida' }, 400, req)
  if (!Array.isArray(venduto) || venduto.length === 0) return json({ error: 'venduto mancante' }, 400, req)
  // Cap difensivo: una chiusura di giornata realistica ha <500 voci. Oltre
  // significa input malformato o tentativo di esaurire memoria/CPU del server
  // (writeUD scrive l'intera jsonb su user_data). Cap anche su numeri.
  if (venduto.length > 500) return json({ error: 'venduto: max 500 voci per chiusura' }, 400, req)
  const MAX_QTA = 100000
  const MAX_EUR = 1_000_000
  for (const v of venduto) {
    if (typeof v !== 'object' || v === null) return json({ error: 'venduto: voce non valida' }, 400, req)
    const qta = Number(v.qta); if (qta && (!Number.isFinite(qta) || qta < 0 || qta > MAX_QTA)) return json({ error: 'venduto.qta fuori range' }, 400, req)
    const tot = Number(v.totale); if (tot && (!Number.isFinite(tot) || tot < 0 || tot > MAX_EUR)) return json({ error: 'venduto.totale fuori range' }, 400, req)
    const pu = Number(v.prezzoUnitario); if (pu && (!Number.isFinite(pu) || pu < 0 || pu > MAX_EUR)) return json({ error: 'venduto.prezzoUnitario fuori range' }, 400, req)
  }

  const { data: sede } = await supabase.from('sedi').select('id').eq('id', sedeId).eq('organization_id', orgId).maybeSingle()
  if (!sede) return json({ error: 'sede non valida' }, 403, req)

  let ricettario, giornaliero, formati, movimenti, chiusure
  try {
    ricettario = await readUD(supabase, orgId, SK_RIC, null)
    giornaliero = (await readUD(supabase, orgId, SK_GIOR, sedeId)) || []
    formati = (await readUD(supabase, orgId, SK_FORMATI, null)) || []
    movimenti = (await readUD(supabase, orgId, SK_MOV, sedeId)) || []
    chiusure = (await readUD(supabase, orgId, SK_CHIUS, sedeId)) || []
  } catch (e) {
    return json({ error: 'Lettura dati fallita: ' + e.message }, 500, req)
  }
  if (!ricettario?.ricette) return json({ error: 'Ricettario non disponibile' }, 409, req)

  const ingCosti = buildIngCosti(ricettario.ingredienti_costi || {})
  const ricetteNote = {}
  for (const [, r] of Object.entries(ricettario.ricette || {})) {
    if (isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')
      ricetteNote[r.nome.toUpperCase().trim()] = r
  }
  const sessione = (Array.isArray(giornaliero) ? giornaliero : []).find(g => g.data === data) || null
  const prodottiOggi = {}
  for (const p of (sessione?.prodotti || [])) prodottiOggi[(p.nome || '').toUpperCase().trim()] = p.stampi || 0

  // ── Confronto prodotto/venduto (identico a ChiusuraView 318-345) ──────────────
  const confronto = venduto.flatMap(v => {
    const nup = (v.nome || '').toUpperCase().trim()
    const mk = Object.keys(ricetteNote).find(k =>
      k === nup || k.includes(nup) || nup.includes(k) ||
      k.replace(/[^A-Z0-9]/g, '').includes(nup.replace(/[^A-Z0-9]/g, '')) ||
      nup.replace(/[^A-Z0-9]/g, '').includes(k.replace(/[^A-Z0-9]/g, '')))
    if (!mk) return []
    const ric = ricetteNote[mk]
    const reg = getR(mk, ric)
    const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
    const stampiP = prodottiOggi[mk] || 0
    const unitaP = stampiP * (Number(reg.unita) || 0)
    const unitaV = Number(v.qta) || 0
    const unitaR = Math.max(0, unitaP - unitaV)
    const st = unitaP > 0 ? (unitaV / unitaP * 100) : null
    const rv = Number(v.totale) || (Number(v.prezzoUnitario) || 0) * unitaV || 0
    const unitaPerStampo = Number(reg.unita) > 0 ? Number(reg.unita) : 0
    const fcV = unitaP > 0
      ? (unitaV / unitaP) * fc * stampiP
      : (unitaPerStampo > 0 ? (unitaV / unitaPerStampo) * fc : 0)
    const marg = rv - fcV
    const spreco = unitaR > 0 && unitaPerStampo > 0 ? (unitaR / unitaPerStampo) * fc : 0
    return [{ nome: mk, nomeScont: v.nome, stampiP, unitaP, unitaV, unitaR, st, rv, fcV, marg, spreco, inProd: stampiP > 0 }]
  })

  const matched = new Set(confronto.map(r => r.nomeScont))
  const formatiRiconc = riconciliaFormati(venduto, formati, sessione, ricettario, ingCosti, matched)
  const mov = movEuros(movimenti, data)

  const fmtV = formatiRiconc.righe.reduce((s, r) => s + r.rv, 0)
  const fmtFC = formatiRiconc.righe.reduce((s, r) => s + r.fcV, 0)
  const movFC = (mov.eurSpreco || 0) + (mov.eurOmaggio || 0)
  const totV = confronto.reduce((s, r) => s + r.rv, 0) + fmtV
  const totFC = confronto.reduce((s, r) => s + r.fcV, 0) + fmtFC + movFC
  const totM = totV - totFC
  const totS = confronto.reduce((s, r) => s + r.spreco, 0) + (mov.eurSpreco || 0)
  const totMP = totV > 0 ? (totM / totV * 100) : 0
  const stL = confronto.filter(r => r.st !== null)
  const avgST = stL.length > 0 ? stL.reduce((s, r) => s + r.st, 0) / stL.length : 0

  const rec = {
    id: `ch-${data}`, data, salvatoAt: new Date().toISOString(), venduto,
    confronto: confronto.map(r => ({ nome: r.nome, stampiP: r.stampiP, unitaP: r.unitaP, unitaV: r.unitaV, unitaR: r.unitaR, st: r.st, rv: r.rv, fcV: r.fcV, marg: r.marg, spreco: r.spreco, inProd: r.inProd })),
    formati: formatiRiconc.righe.map(r => ({ nome: r.nome, categoria: r.categoria, unitaV: r.unitaV, rv: r.rv, fcV: r.fcV, marg: r.marg })),
    kpi: { totV, totFC, totM, totS, totMP, avgST },
    creatoDa: 'dipendente',
  }
  const nuove = [...(Array.isArray(chiusure) ? chiusure : []).filter(c => c.data !== data), rec]
  try {
    await writeUD(supabase, orgId, SK_CHIUS, sedeId, nuove)
  } catch (e) {
    return json({ error: 'Salvataggio fallito: ' + e.message }, 500, req)
  }

  return json({ ok: true, chiusura: rec, chiusure: nuove }, 200, req)
}
