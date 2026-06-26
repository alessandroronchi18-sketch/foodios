// Demo data 1-click per nuovi utenti: popola ricettario, magazzino, 7gg di
// chiusure e 1 fattura aperta sull'org dell'utente. Usato in OnboardingWizard
// step 2 (Carica demo data) per evitare la "schermata vuota" che e' il primo
// drop-off di conversione.
//
// IMPORTANT: scrive su user_data via ssave (rispetta RLS + multi-tenant).
// Idempotente: chiamabile due volte = stesso risultato (no duplicati).

import { ssave } from './storage'
import { supabase } from './supabase'

const SK_RIC = 'pasticceria-ricettario-v1'
const SK_MAG = 'pasticceria-magazzino-v1'
const SK_CHIUS = 'pasticceria-chiusure-v1'

// 5 ricette demo + dizionario ingredienti prezzati (HORECA-realistic IT)
function buildRicettario() {
  return {
    ingredienti_costi: {
      // nomi normalizzati (lowercase, no accenti) - formato `buildIngCosti`
      farina: { costoG: 0.0011, isStima: false },
      zucchero: { costoG: 0.0014, isStima: false },
      burro: { costoG: 0.0072, isStima: false },
      uova: { costoG: 0.0095, isStima: false },
      latte: { costoG: 0.0014, isStima: false },
      panna: { costoG: 0.0055, isStima: false },
      cioccolato_fondente: { costoG: 0.0125, isStima: false },
      nocciole: { costoG: 0.0210, isStima: false },
      mandorle: { costoG: 0.0185, isStima: false },
      lievito_di_birra: { costoG: 0.0072, isStima: false },
      sale: { costoG: 0.0004, isStima: false },
      vaniglia: { costoG: 0.0680, isStima: false },
      marmellata_albicocca: { costoG: 0.0058, isStima: false },
      pistacchio: { costoG: 0.0395, isStima: false },
      limone: { costoG: 0.0040, isStima: false },
    },
    ricette: {
      CROSTATA_ALBICOCCA: {
        nome: 'CROSTATA_ALBICOCCA',
        categoria: 'Crostate',
        sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 3.5,
        ingredienti: [
          { nome: 'farina', qty1stampo: 300 },
          { nome: 'zucchero', qty1stampo: 100 },
          { nome: 'burro', qty1stampo: 150 },
          { nome: 'uova', qty1stampo: 60 },
          { nome: 'marmellata_albicocca', qty1stampo: 250 },
          { nome: 'limone', qty1stampo: 10 },
        ],
      },
      BISCOTTI_NOCCIOLA: {
        nome: 'BISCOTTI_NOCCIOLA',
        categoria: 'Biscotti',
        sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 20, prezzo: 1.2,
        ingredienti: [
          { nome: 'farina', qty1stampo: 250 },
          { nome: 'zucchero', qty1stampo: 120 },
          { nome: 'burro', qty1stampo: 130 },
          { nome: 'nocciole', qty1stampo: 100 },
          { nome: 'uova', qty1stampo: 50 },
        ],
      },
      TORTA_CIOCCOLATO: {
        nome: 'TORTA_CIOCCOLATO',
        categoria: 'Torte',
        sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 10, prezzo: 4.5,
        ingredienti: [
          { nome: 'cioccolato_fondente', qty1stampo: 200 },
          { nome: 'burro', qty1stampo: 180 },
          { nome: 'zucchero', qty1stampo: 150 },
          { nome: 'uova', qty1stampo: 200 },
          { nome: 'farina', qty1stampo: 50 },
          { nome: 'panna', qty1stampo: 100 },
        ],
      },
      PLUM_CAKE_LIMONE: {
        nome: 'PLUM_CAKE_LIMONE',
        categoria: 'Torte',
        sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 3.0,
        ingredienti: [
          { nome: 'farina', qty1stampo: 250 },
          { nome: 'zucchero', qty1stampo: 180 },
          { nome: 'burro', qty1stampo: 150 },
          { nome: 'uova', qty1stampo: 150 },
          { nome: 'limone', qty1stampo: 40 },
          { nome: 'lievito_di_birra', qty1stampo: 8 },
        ],
      },
      MUFFIN_CIOCCOLATO: {
        nome: 'MUFFIN_CIOCCOLATO',
        categoria: 'Muffin',
        sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 12, prezzo: 2.0,
        ingredienti: [
          { nome: 'farina', qty1stampo: 280 },
          { nome: 'zucchero', qty1stampo: 150 },
          { nome: 'burro', qty1stampo: 120 },
          { nome: 'uova', qty1stampo: 100 },
          { nome: 'cioccolato_fondente', qty1stampo: 100 },
          { nome: 'latte', qty1stampo: 120 },
          { nome: 'lievito_di_birra', qty1stampo: 8 },
        ],
      },
    },
  }
}

function buildMagazzino() {
  // 15 ingredienti con giacenze realistiche (in grammi) + soglia.
  // ultimoRifornimento = oggi (per evitare flag "scaduto" subito).
  const now = new Date().toISOString()
  const mk = (nome, giacenza_g, soglia_g) => ({ nome, giacenza_g, soglia_g, ultimoRifornimento: now })
  return {
    farina: mk('farina', 25000, 5000),
    zucchero: mk('zucchero', 18000, 4000),
    burro: mk('burro', 4500, 2000),
    uova: mk('uova', 3200, 1000),
    latte: mk('latte', 8000, 2000),
    panna: mk('panna', 2000, 800),
    cioccolato_fondente: mk('cioccolato_fondente', 3000, 1500),
    nocciole: mk('nocciole', 1800, 500),
    mandorle: mk('mandorle', 1200, 500),
    lievito_di_birra: mk('lievito_di_birra', 500, 200),
    sale: mk('sale', 2000, 500),
    vaniglia: mk('vaniglia', 120, 50),
    marmellata_albicocca: mk('marmellata_albicocca', 3500, 1000),
    pistacchio: mk('pistacchio', 800, 300),
    limone: mk('limone', 1500, 400),
  }
}

function buildChiusure() {
  // 7 giorni di chiusure passate (oggi escluso): pattern realistico con
  // domenica chiusa, week-end +30%, ricavi tra €450-€800/gg.
  const out = []
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  for (let i = 7; i >= 1; i--) {
    const d = new Date(oggi)
    d.setDate(d.getDate() - i)
    const dow = d.getDay()
    if (dow === 0) continue // domenica chiusa
    const iso = d.toISOString().slice(0, 10)
    const weekend = (dow === 6 || dow === 5)
    const base = weekend ? 720 : 480
    const variazione = Math.round((Math.random() - 0.5) * 100)
    const ricavo = base + variazione
    const fcPct = 28 + Math.round((Math.random() - 0.5) * 6)
    const fc = Math.round(ricavo * fcPct / 100)
    out.push({
      id: `demo-ch-${iso}`,
      data: iso,
      salvatoAt: new Date().toISOString(),
      _demo: true,
      venduto: [], // semplificato per demo
      confronto: [],
      formati: [],
      kpi: {
        totV: ricavo,
        totFC: fc,
        totM: ricavo - fc,
        totS: Math.round(ricavo * 0.02),
        totMP: 0,
        avgST: 0.85,
      },
    })
  }
  return out.sort((a, b) => b.data.localeCompare(a.data))
}

async function seedFatturaDemo(orgId, sedeId) {
  // 1 fattura fornitore aperta (scadenza tra 14gg) per popolare scadenzario.
  try {
    const scad = new Date()
    scad.setDate(scad.getDate() + 14)
    await supabase.from('fatture').insert({
      organization_id: orgId,
      sede_id: sedeId,
      fornitore_nome: 'Bonelli Forniture HORECA',
      numero: 'DEMO-2026/001',
      data_emissione: new Date().toISOString().slice(0, 10),
      data_scadenza: scad.toISOString().slice(0, 10),
      importo_lordo: 487.20,
      importo_netto: 399.34,
      stato: 'aperta',
      note: '[Demo data] Fattura di esempio - eliminabile dallo Scadenzario',
    })
  } catch { /* tabella opzionale o fattura gia presente */ }
}

/**
 * Popola dati demo sull'org dell'utente. Best-effort, idempotente.
 * Ritorna { ok, counts } con n ricette/ingredienti/chiusure inserite.
 */
export async function seedDemoData({ orgId, sedeId }) {
  if (!orgId) throw new Error('orgId richiesto per il seed demo')

  const ricettario = buildRicettario()
  const magazzino = buildMagazzino()
  const chiusure = buildChiusure()

  // Persisti in parallelo (ssave gia gestisce capture-at-call-site post-batch 1)
  await Promise.all([
    ssave(SK_RIC, ricettario, orgId, null),         // shared per org
    ssave(SK_MAG, magazzino, orgId, sedeId),        // per-sede
    ssave(SK_CHIUS, chiusure, orgId, sedeId),       // per-sede
  ])

  // Fattura demo (best-effort, non blocca)
  await seedFatturaDemo(orgId, sedeId).catch(() => {})

  return {
    ok: true,
    counts: {
      ricette: Object.keys(ricettario.ricette).length,
      ingredienti: Object.keys(ricettario.ingredienti_costi).length,
      magazzino: Object.keys(magazzino).length,
      chiusure: chiusure.length,
    },
  }
}

/**
 * Check se l'utente ha gia dati demo seeded (per non offrire 2 volte).
 * Approssimativo: cerca chiusure con id che inizia per 'demo-ch-'.
 */
export async function hasDemoData({ orgId, sedeId }) {
  if (!orgId) return false
  try {
    const { data } = await supabase
      .from('user_data')
      .select('data_value')
      .eq('organization_id', orgId)
      .eq('data_key', SK_CHIUS)
      .eq('sede_id', sedeId)
      .maybeSingle()
    const arr = Array.isArray(data?.data_value) ? data.data_value : []
    return arr.some(c => c?._demo === true || (c?.id || '').startsWith('demo-ch-'))
  } catch { return false }
}
