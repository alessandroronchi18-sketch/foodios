// Demo data COMPLETO per testing realistico: 3 mesi di operatività con
// produzione/cassa/sprechi/eventi + anagrafiche complete (personale, fornitori,
// clienti B2B, vendite B2B, costi aziendali). Marcato `_demo:true` o
// `note ILIKE '[Demo data] %'` per pulizia bulk.
//
// Pensato per uno scenario "pasticceria artigianale Torino": 5 dipendenti
// (3 full + 2 part), 6 fornitori, 4 clienti B2B abituali, 15 ricette,
// 25 ingredienti, ~90 chiusure cassa, ~140 sessioni produzione,
// 18 fatture fornitori (mix pagate/aperte/scadute), 24 vendite B2B,
// 8 eventi calendar, 8 voci costi aziendali, sprechi a campione.
//
// Idempotente per le chiavi user_data (overwrite); per le tabelle DB
// prima fa cleanup di righe `[Demo data]`.

// Nota: NON importiamo ssave (è client-side, usa supabase anon). Per
// l'endpoint admin server-side passiamo un service-role client e facciamo
// upsert diretti su user_data.
//
// Per l'uso client-side (es. wizard onboarding), il caller deve passare
// l'oggetto supabase (client anon autenticato).

// ─── Storage keys (replica per autonomia) ─────────────────────────────────
const SK_RIC      = 'pasticceria-ricettario-v1'
const SK_MAG      = 'pasticceria-magazzino-v1'
const SK_CHIUS    = 'pasticceria-chiusure-v1'
const SK_GIOR     = 'pasticceria-giornaliero-v1'
const SK_PROD     = 'pasticceria-produzione-v1'
const SK_LOGRIF   = 'pasticceria-logrif-v1'
const SK_LOG_PRZ  = 'pasticceria-log-prezzi-v1'
const SK_FORMATI  = 'pasticceria-formati-vendita-v1'
const SK_MOV      = 'pasticceria-movimenti-speciali-v1'

// ─── Utility ──────────────────────────────────────────────────────────────
const DEMO_TAG = '[Demo data]'

// Chiavi shared (no sede_id) — pattern preso da src/lib/storage.js
const SHARED_KEYS_SET = new Set([
  'pasticceria-ricettario-v1',
  'pasticceria-actions-v1',
  'pasticceria-esclusi-v1',
  'pasticceria-prezzi-importati-v1',
  'pasticceria-regole-v1',
  'pasticceria-semilavorati-v1',
  'pasticceria-formati-vendita-v1',
  'pasticceria-log-prezzi-v1',
])

// Upsert su user_data: replica ssave() ma con il client passato in argomento
// (così funziona sia client-anon che service-role).
async function userDataUpsert(client, key, value, orgId, sedeId) {
  const isShared = SHARED_KEYS_SET.has(key)
  const effectiveSedeId = isShared ? null : (sedeId || null)
  const updated_at = new Date().toISOString()
  // Cerca esistente
  let q = client.from('user_data').select('id').eq('organization_id', orgId).eq('data_key', key)
  q = effectiveSedeId === null ? q.is('sede_id', null) : q.eq('sede_id', effectiveSedeId)
  const { data: existing } = await q
  if (existing && existing.length > 0) {
    let qu = client.from('user_data').update({ data_value: value, updated_at }).eq('organization_id', orgId).eq('data_key', key)
    qu = effectiveSedeId === null ? qu.is('sede_id', null) : qu.eq('sede_id', effectiveSedeId)
    await qu
    return
  }
  await client.from('user_data').insert({
    organization_id: orgId, sede_id: effectiveSedeId, data_key: key, data_value: value, updated_at,
  })
}
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
const isoDate = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const rng = (seed = 42) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 } }
const choice = (r, arr) => arr[Math.floor(r() * arr.length)]
const roundCents = (n) => Math.round(n * 100) / 100
const fmtTime = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`

// ─── 1) RICETTARIO (15 ricette + 30 ingredienti) ──────────────────────────
function buildRicettario() {
  return {
    ingredienti_costi: {
      farina_00: { costoG: 0.00088, isStima: false },
      farina_manitoba: { costoG: 0.0011, isStima: false },
      zucchero: { costoG: 0.00098, isStima: false },
      zucchero_velo: { costoG: 0.00145, isStima: false },
      zucchero_canna: { costoG: 0.00165, isStima: false },
      burro: { costoG: 0.00720, isStima: false },
      uova: { costoG: 0.00095, isStima: false },
      tuorlo: { costoG: 0.00130, isStima: false },
      albume: { costoG: 0.00060, isStima: false },
      latte: { costoG: 0.00140, isStima: false },
      panna: { costoG: 0.00550, isStima: false },
      cioccolato_fondente: { costoG: 0.01250, isStima: false },
      cioccolato_latte: { costoG: 0.01100, isStima: false },
      cacao: { costoG: 0.01900, isStima: false },
      nocciole: { costoG: 0.02100, isStima: false },
      mandorle: { costoG: 0.01850, isStima: false },
      pistacchio: { costoG: 0.03950, isStima: false },
      lievito_di_birra: { costoG: 0.00320, isStima: false },
      lievito_chimico: { costoG: 0.00750, isStima: false },
      sale: { costoG: 0.00040, isStima: false },
      vaniglia: { costoG: 0.06800, isStima: false },
      marmellata_albicocca: { costoG: 0.00580, isStima: false },
      marmellata_lamponi: { costoG: 0.00720, isStima: false },
      limone: { costoG: 0.00400, isStima: false },
      arancia: { costoG: 0.00380, isStima: false },
      mela: { costoG: 0.00250, isStima: false },
      banana: { costoG: 0.00210, isStima: false },
      mirtilli: { costoG: 0.01200, isStima: false },
      carota: { costoG: 0.00180, isStima: false },
      noci: { costoG: 0.01650, isStima: false },
    },
    ricette: {
      'CREMA PASTICCERA': {
        nome: 'CREMA PASTICCERA', categoria: 'Semilavorati', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'semilavorato', unita: 0, prezzo: 0,
        ingredienti: [
          { nome: 'latte', qty1stampo: 500 },
          { nome: 'tuorlo', qty1stampo: 120 },
          { nome: 'zucchero', qty1stampo: 150 },
          { nome: 'farina_00', qty1stampo: 40 },
          { nome: 'vaniglia', qty1stampo: 3 },
          { nome: 'limone', qty1stampo: 5 },
        ],
      },
      'PASTA FROLLA': {
        nome: 'PASTA FROLLA', categoria: 'Semilavorati', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'semilavorato', unita: 0, prezzo: 0,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 500 },
          { nome: 'burro', qty1stampo: 250 },
          { nome: 'zucchero_velo', qty1stampo: 200 },
          { nome: 'uova', qty1stampo: 100 },
          { nome: 'sale', qty1stampo: 2 },
        ],
      },
      'CROSTATA ALBICOCCA': {
        nome: 'CROSTATA ALBICOCCA', categoria: 'Crostate', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 3.5,
        ingredienti: [
          { nome: 'PASTA FROLLA', qty1stampo: 450 },
          { nome: 'marmellata_albicocca', qty1stampo: 280 },
        ],
      },
      'CROSTATA LAMPONI': {
        nome: 'CROSTATA LAMPONI', categoria: 'Crostate', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 4.0,
        ingredienti: [
          { nome: 'PASTA FROLLA', qty1stampo: 450 },
          { nome: 'marmellata_lamponi', qty1stampo: 280 },
        ],
      },
      'CROSTATA MELE': {
        nome: 'CROSTATA MELE', categoria: 'Crostate', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 3.5,
        ingredienti: [
          { nome: 'PASTA FROLLA', qty1stampo: 400 },
          { nome: 'mela', qty1stampo: 400 },
          { nome: 'zucchero', qty1stampo: 60 },
          { nome: 'limone', qty1stampo: 15 },
        ],
      },
      'BISCOTTI NOCCIOLA': {
        nome: 'BISCOTTI NOCCIOLA', categoria: 'Biscotti', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 24, prezzo: 1.2,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 250 },
          { nome: 'zucchero', qty1stampo: 120 },
          { nome: 'burro', qty1stampo: 130 },
          { nome: 'nocciole', qty1stampo: 100 },
          { nome: 'uova', qty1stampo: 50 },
        ],
      },
      'BISCOTTI CIOCCOLATO': {
        nome: 'BISCOTTI CIOCCOLATO', categoria: 'Biscotti', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 24, prezzo: 1.3,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 250 },
          { nome: 'zucchero_canna', qty1stampo: 140 },
          { nome: 'burro', qty1stampo: 130 },
          { nome: 'cioccolato_fondente', qty1stampo: 120 },
          { nome: 'uova', qty1stampo: 50 },
          { nome: 'cacao', qty1stampo: 20 },
        ],
      },
      'COOKIES AMERICANI': {
        nome: 'COOKIES AMERICANI', categoria: 'Biscotti', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 18, prezzo: 1.8,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 280 },
          { nome: 'zucchero_canna', qty1stampo: 180 },
          { nome: 'burro', qty1stampo: 200 },
          { nome: 'cioccolato_latte', qty1stampo: 180 },
          { nome: 'uova', qty1stampo: 80 },
          { nome: 'lievito_chimico', qty1stampo: 5 },
        ],
      },
      'TORTA CIOCCOLATO': {
        nome: 'TORTA CIOCCOLATO', categoria: 'Torte', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 10, prezzo: 4.5,
        ingredienti: [
          { nome: 'cioccolato_fondente', qty1stampo: 200 },
          { nome: 'burro', qty1stampo: 180 },
          { nome: 'zucchero', qty1stampo: 150 },
          { nome: 'uova', qty1stampo: 200 },
          { nome: 'farina_00', qty1stampo: 50 },
          { nome: 'cacao', qty1stampo: 30 },
        ],
      },
      'TORTA LIMONE': {
        nome: 'TORTA LIMONE', categoria: 'Torte', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 4.0,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 280 },
          { nome: 'zucchero', qty1stampo: 200 },
          { nome: 'burro', qty1stampo: 180 },
          { nome: 'uova', qty1stampo: 180 },
          { nome: 'limone', qty1stampo: 60 },
          { nome: 'lievito_chimico', qty1stampo: 8 },
        ],
      },
      'TORTA CAROTE': {
        nome: 'TORTA CAROTE', categoria: 'Torte', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 10, prezzo: 4.0,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 250 },
          { nome: 'zucchero_canna', qty1stampo: 180 },
          { nome: 'carota', qty1stampo: 200 },
          { nome: 'noci', qty1stampo: 80 },
          { nome: 'uova', qty1stampo: 150 },
          { nome: 'lievito_chimico', qty1stampo: 8 },
        ],
      },
      'PLUMCAKE LIMONE': {
        nome: 'PLUMCAKE LIMONE', categoria: 'Plumcake', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 8, prezzo: 3.0,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 250 },
          { nome: 'zucchero', qty1stampo: 180 },
          { nome: 'burro', qty1stampo: 150 },
          { nome: 'uova', qty1stampo: 150 },
          { nome: 'limone', qty1stampo: 40 },
          { nome: 'lievito_chimico', qty1stampo: 8 },
        ],
      },
      'BANANA BREAD': {
        nome: 'BANANA BREAD', categoria: 'Plumcake', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'fetta', unita: 11, prezzo: 3.5,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 280 },
          { nome: 'zucchero_canna', qty1stampo: 150 },
          { nome: 'burro', qty1stampo: 120 },
          { nome: 'banana', qty1stampo: 300 },
          { nome: 'uova', qty1stampo: 100 },
          { nome: 'noci', qty1stampo: 60 },
          { nome: 'lievito_chimico', qty1stampo: 8 },
        ],
      },
      'MUFFIN CIOCCOLATO': {
        nome: 'MUFFIN CIOCCOLATO', categoria: 'Muffin', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 12, prezzo: 2.0,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 280 },
          { nome: 'zucchero', qty1stampo: 150 },
          { nome: 'burro', qty1stampo: 120 },
          { nome: 'uova', qty1stampo: 100 },
          { nome: 'cioccolato_fondente', qty1stampo: 100 },
          { nome: 'latte', qty1stampo: 120 },
          { nome: 'lievito_chimico', qty1stampo: 8 },
        ],
      },
      'MUFFIN MIRTILLI': {
        nome: 'MUFFIN MIRTILLI', categoria: 'Muffin', sheetName: 'demo',
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        tipo: 'pezzo', unita: 12, prezzo: 2.2,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 280 },
          { nome: 'zucchero', qty1stampo: 140 },
          { nome: 'burro', qty1stampo: 110 },
          { nome: 'uova', qty1stampo: 100 },
          { nome: 'mirtilli', qty1stampo: 150 },
          { nome: 'latte', qty1stampo: 120 },
          { nome: 'lievito_chimico', qty1stampo: 8 },
        ],
      },
    },
  }
}

// ─── 2) MAGAZZINO (25 ingredienti realistici) ─────────────────────────────
function buildMagazzino() {
  const now = new Date().toISOString()
  const mk = (nome, giacenza_g, soglia_g) => ({ nome, giacenza_g, soglia_g, ultimoRifornimento: now })
  return {
    farina_00: mk('farina_00', 28000, 5000),
    farina_manitoba: mk('farina_manitoba', 12000, 3000),
    zucchero: mk('zucchero', 22000, 5000),
    zucchero_velo: mk('zucchero_velo', 4000, 1000),
    zucchero_canna: mk('zucchero_canna', 6000, 1500),
    burro: mk('burro', 8500, 3000),
    uova: mk('uova', 4800, 1500),
    tuorlo: mk('tuorlo', 1200, 500),
    albume: mk('albume', 1500, 500),
    latte: mk('latte', 10000, 3000),
    panna: mk('panna', 3500, 1000),
    cioccolato_fondente: mk('cioccolato_fondente', 4500, 1500),
    cioccolato_latte: mk('cioccolato_latte', 2800, 1000),
    cacao: mk('cacao', 1800, 500),
    nocciole: mk('nocciole', 2200, 700),
    mandorle: mk('mandorle', 1800, 600),
    pistacchio: mk('pistacchio', 1100, 400),
    lievito_di_birra: mk('lievito_di_birra', 600, 200),
    lievito_chimico: mk('lievito_chimico', 800, 300),
    sale: mk('sale', 3000, 800),
    vaniglia: mk('vaniglia', 180, 50),
    marmellata_albicocca: mk('marmellata_albicocca', 4200, 1500),
    marmellata_lamponi: mk('marmellata_lamponi', 3200, 1000),
    mela: mk('mela', 3500, 1000),
    banana: mk('banana', 2400, 800),
    mirtilli: mk('mirtilli', 1600, 500),
    carota: mk('carota', 2800, 800),
    noci: mk('noci', 1200, 400),
    limone: mk('limone', 1800, 500),
    arancia: mk('arancia', 1500, 400),
  }
}

// ─── Helper: estrae lista vendibili dal ricettario (skip semilavorati) ────
function extractVendibili(ricettario) {
  const out = []
  for (const [nome, r] of Object.entries(ricettario?.ricette || {})) {
    if (r?.tipo === 'semilavorato') continue
    // Prezzo riferito all'unità di vendita: se tipo=fetta, ricetta.prezzo è
    // €/fetta; se tipo=pezzo, ricetta.prezzo è €/pezzo (singolo); se tipo=kg,
    // ricetta.prezzo è €/kg ma di solito si vende per vaschetta da ~500g.
    const prezzoUnitVendita = Number(r.prezzo) || 0
    if (prezzoUnitVendita <= 0) continue
    out.push({
      nome,
      tipo: r.tipo || 'pezzo',
      unita: Number(r.unita) || 1,
      prezzo: prezzoUnitVendita,
    })
  }
  return out
}

// ─── 3) CHIUSURE CASSA (90 giorni) ────────────────────────────────────────
// Domenica chiusa, sab/ven +30%, picchi su festività italiane.
// I prezzi/prodotti vengono dal ricettario (default o customMenu).
function buildChiusure(vendibili) {
  const r = rng(2026620)
  const out = []
  const oggi = today()
  if (!vendibili || vendibili.length === 0) return out
  // Festività che gonfiano i ricavi (Pasqua 2026, festa mamma, repubblica)
  const PEAKS = new Set([
    '2026-04-05', '2026-04-06',  // pasqua + pasquetta
    '2026-05-10',                // festa mamma
    '2026-06-02',                // repubblica
  ])
  for (let i = 90; i >= 1; i--) {
    const d = addDays(oggi, -i)
    const dow = d.getDay()
    if (dow === 0) continue // domenica chiusa
    const iso = isoDate(d)
    const isWeekend = (dow === 6 || dow === 5)
    const isPeak = PEAKS.has(iso)
    const base = isPeak ? 1100 : (isWeekend ? 720 : 480)
    const variazione = Math.round((r() - 0.5) * 140)
    const ricavo = base + variazione
    // Costruisci 5-9 righe vendita usando i prodotti del ricettario
    const nRighe = Math.min(vendibili.length, 5 + Math.floor(r() * 5))
    const venduto = []
    let saldoVenduto = 0
    const usati = new Set()
    for (let j = 0; j < nRighe; j++) {
      let prod
      let tries = 0
      do { prod = choice(r, vendibili); tries++ } while (usati.has(prod.nome) && tries < 10)
      usati.add(prod.nome)
      // qta plausibile: per torte intere 1-2, per pezzi 2-6, per fette 1-3
      const qta = prod.tipo === 'fetta'
        ? 1 + Math.floor(r() * 2)
        : (prod.prezzo < 3 ? 2 + Math.floor(r() * 5) : 1 + Math.floor(r() * 3))
      // Piccola variazione prezzo (sconti/promo) ±10%
      const prezzoUnit = roundCents(prod.prezzo * (0.92 + r() * 0.16))
      const totale = roundCents(prezzoUnit * qta)
      venduto.push({ nome: prod.nome, qta, prezzoUnit, totale })
      saldoVenduto += totale
    }
    // Riconcilia ricavo target con somma vendite (aggiusta ultimo)
    const delta = ricavo - saldoVenduto
    if (venduto.length > 0) {
      venduto[venduto.length - 1].totale = roundCents(venduto[venduto.length - 1].totale + delta)
    }
    const fcPct = 28 + (r() - 0.5) * 8
    const fc = Math.round(ricavo * fcPct / 100)
    out.push({
      id: `demo-ch-${iso}`,
      data: iso,
      salvatoAt: new Date().toISOString(),
      _demo: true,
      venduto,
      confronto: [],
      formati: [],
      cassaImport: [],
      kpi: {
        totV: ricavo,
        totFC: fc,
        totM: ricavo - fc,
        totS: Math.round(ricavo * 0.025),
        totMP: 0,
        avgST: 0.82 + r() * 0.12,
      },
    })
  }
  return out.sort((a, b) => b.data.localeCompare(a.data))
}

// ─── 4) PRODUZIONE GIORNALIERA (sessioni SK_GIOR) ─────────────────────────
function buildGiornaliero(vendibili) {
  const r = rng(2026621)
  const out = []
  const oggi = today()
  if (!vendibili || vendibili.length === 0) return out
  const RICETTE = vendibili.map(v => v.nome)
  for (let i = 90; i >= 0; i--) {
    const d = addDays(oggi, -i)
    const dow = d.getDay()
    if (dow === 0) continue // domenica chiusa, niente produzione
    const iso = isoDate(d)
    // 1-3 sessioni produzione/giorno
    const nSess = 1 + Math.floor(r() * 2.5)
    for (let s = 0; s < nSess; s++) {
      const ricette = []
      // 3-5 ricette per sessione
      const nRic = 3 + Math.floor(r() * 3)
      const usate = new Set()
      for (let k = 0; k < nRic; k++) {
        let nome = choice(r, RICETTE)
        let tries = 0
        while (usate.has(nome) && tries < 5) { nome = choice(r, RICETTE); tries++ }
        usate.add(nome)
        const numStampi = 1 + Math.floor(r() * 3)
        ricette.push({ nome, numStampi, _demo: true })
      }
      out.push({
        id: `demo-gior-${iso}-${s}`,
        data: iso,
        creataAt: new Date(d.getTime() + (8 + s * 3) * 3600000).toISOString(),
        _demo: true,
        ricette,
        note: s === 0 ? '[Demo] Sessione mattino' : '[Demo] Sessione pomeriggio',
      })
    }
  }
  return out
}

// ─── 5) MOVIMENTI SPECIALI (sprechi + omaggi sparsi) ──────────────────────
function buildMovimenti(vendibili) {
  const r = rng(2026622)
  const out = []
  const oggi = today()
  const CAUSALI = ['scaduto', 'rotto', 'errore_produzione', 'omaggio_cliente']
  if (!vendibili || vendibili.length === 0) return out
  const RICETTE = vendibili.slice(0, Math.min(5, vendibili.length)).map(v => v.nome)
  // ~1-2 sprechi a settimana per 12 settimane
  for (let week = 0; week < 13; week++) {
    const nEvents = 1 + Math.floor(r() * 2)
    for (let e = 0; e < nEvents; e++) {
      const dayOffset = -week * 7 - Math.floor(r() * 6)
      const d = addDays(oggi, dayOffset)
      const causale = choice(r, CAUSALI)
      out.push({
        id: `demo-mov-${week}-${e}`,
        data: isoDate(d),
        nome: choice(r, RICETTE),
        qta: 1 + Math.floor(r() * 3),
        tipo: causale === 'omaggio_cliente' ? 'omaggio' : 'spreco',
        causale,
        valore: roundCents(8 + r() * 25),
        note: `[Demo] ${causale.replace('_', ' ')}`,
        _demo: true,
        creatoAt: new Date(d.getTime() + 16 * 3600000).toISOString(),
      })
    }
  }
  return out.sort((a, b) => b.data.localeCompare(a.data))
}

// ─── 6) FORMATI VENDITA ───────────────────────────────────────────────────
function buildFormati() {
  return [
    { id: 'fm-demo-1', nome: 'Vassoietto biscotti misti 250g', _demo: true,
      tipo: 'mix', prezzo: 8.5, peso_g: 250, note: '[Demo]' },
    { id: 'fm-demo-2', nome: 'Vassoietto biscotti misti 500g', _demo: true,
      tipo: 'mix', prezzo: 16, peso_g: 500, note: '[Demo]' },
    { id: 'fm-demo-3', nome: 'Scatola regalo 12 pezzi', _demo: true,
      tipo: 'box', prezzo: 22, peso_g: 350, note: '[Demo]' },
    { id: 'fm-demo-4', nome: 'Crostata intera 8 fette', _demo: true,
      tipo: 'intero', prezzo: 24, peso_g: 800, note: '[Demo]' },
    { id: 'fm-demo-5', nome: 'Muffin singolo confezionato', _demo: true,
      tipo: 'monoporzione', prezzo: 2.5, peso_g: 80, note: '[Demo]' },
    { id: 'fm-demo-6', nome: 'Torta intera 10 fette', _demo: true,
      tipo: 'intero', prezzo: 38, peso_g: 1100, note: '[Demo]' },
  ]
}

// ─── 7) LOG PREZZI (storico variazioni ingredienti) ───────────────────────
function buildLogPrezzi() {
  const oggi = today()
  return [
    { id: 'lp-demo-1', ingrediente: 'burro', prezzoVecchio: 6.80, prezzoNuovo: 7.20,
      data: isoDate(addDays(oggi, -75)), note: '[Demo] Adeguamento Lattini Lattanzio' },
    { id: 'lp-demo-2', ingrediente: 'farina_00', prezzoVecchio: 0.82, prezzoNuovo: 0.88,
      data: isoDate(addDays(oggi, -50)), note: '[Demo] Listino Molino Rossi' },
    { id: 'lp-demo-3', ingrediente: 'cioccolato_fondente', prezzoVecchio: 11.50, prezzoNuovo: 12.50,
      data: isoDate(addDays(oggi, -30)), note: '[Demo] Aumento cacao globale' },
    { id: 'lp-demo-4', ingrediente: 'uova', prezzoVecchio: 0.85, prezzoNuovo: 0.95,
      data: isoDate(addDays(oggi, -15)), note: '[Demo] Stagionalità' },
    { id: 'lp-demo-5', ingrediente: 'mirtilli', prezzoVecchio: 14.00, prezzoNuovo: 12.00,
      data: isoDate(addDays(oggi, -7)), note: '[Demo] Inizio stagione locale' },
  ]
}

// ─── 8) FORNITORI (6 con anagrafica) ──────────────────────────────────────
const FORNITORI_DEMO = [
  { nome: 'Molino Rossi', contatto: 'Andrea Rossi', email: 'ordini@molinorossi.it', telefono: '011 9123456', note: '[Demo] Farine + lieviti' },
  { nome: 'Lattini Lattanzio', contatto: 'Maria Lattanzio', email: 'commerciale@lattanzio.it', telefono: '0173 980123', note: '[Demo] Burro + latte + panna' },
  { nome: 'Frutta Felicità', contatto: 'Pietro Felicità', email: 'pietro@fruttafelicita.it', telefono: '011 7654321', note: '[Demo] Frutta secca + canditi' },
  { nome: 'Cioccolatieri d\'Italia', contatto: 'Marco Bianchi', email: 'b2b@cioccolatieri.it', telefono: '02 6543210', note: '[Demo] Cioccolato fondente premium' },
  { nome: 'DolciNapoli HORECA', contatto: 'Giuseppe Esposito', email: 'horeca@dolcinapoli.it', telefono: '081 4567890', note: '[Demo] Coppette, pirottini, packaging' },
  { nome: 'Frutta Fresca Piemonte', contatto: 'Luca Berto', email: 'ordini@fruttafresca.it', telefono: '0141 234567', note: '[Demo] Mele, banane, mirtilli stagionali' },
]

// ─── 9) FATTURE FORNITORI (18, mix pagate/aperte/scadute) ─────────────────
function buildFattureRows(forniIds) {
  const r = rng(2026623)
  const oggi = today()
  const rows = []
  let counter = 1
  for (const fid of forniIds) {
    // 3 fatture per fornitore: 1 vecchia pagata, 1 recente aperta, 1 scaduta o in scadenza
    const fornEntry = FORNITORI_DEMO.find(f => f._id === fid)
    const fornName = fornEntry?.nome || 'Fornitore Demo'
    const baseImp = 200 + Math.floor(r() * 1000)
    // Vecchia pagata
    {
      const dEmis = addDays(oggi, -60 - Math.floor(r() * 25))
      const dScad = addDays(dEmis, 30)
      const imp = baseImp + Math.floor(r() * 400)
      rows.push({
        organization_id: null, sede_id: null,
        fornitore_nome: fornName,
        numero: `${DEMO_TAG} ${counter++}/2026`,
        data_emissione: isoDate(dEmis), data_scadenza: isoDate(dScad),
        importo_lordo: roundCents(imp), importo_netto: roundCents(imp / 1.22),
        importo_pagato: roundCents(imp), tipo: 'fattura', stato: 'pagata',
        note: `${DEMO_TAG} fattura saldata`,
      })
    }
    // Recente aperta
    {
      const dEmis = addDays(oggi, -15 - Math.floor(r() * 10))
      const dScad = addDays(dEmis, 30 + Math.floor(r() * 30))
      const imp = baseImp + Math.floor(r() * 600)
      rows.push({
        organization_id: null, sede_id: null,
        fornitore_nome: fornName,
        numero: `${DEMO_TAG} ${counter++}/2026`,
        data_emissione: isoDate(dEmis), data_scadenza: isoDate(dScad),
        importo_lordo: roundCents(imp), importo_netto: roundCents(imp / 1.22),
        importo_pagato: 0, tipo: 'fattura', stato: 'aperta',
        note: `${DEMO_TAG} da pagare`,
      })
    }
    // Scaduta o partial-pay
    {
      const dEmis = addDays(oggi, -75 - Math.floor(r() * 15))
      const dScad = addDays(dEmis, 30)
      const imp = baseImp + Math.floor(r() * 300)
      const partial = r() > 0.5 ? roundCents(imp * 0.4) : 0
      rows.push({
        organization_id: null, sede_id: null,
        fornitore_nome: fornName,
        numero: `${DEMO_TAG} ${counter++}/2026`,
        data_emissione: isoDate(dEmis), data_scadenza: isoDate(dScad),
        importo_lordo: roundCents(imp), importo_netto: roundCents(imp / 1.22),
        importo_pagato: partial, tipo: 'fattura', stato: partial > 0 ? 'aperta' : 'aperta',
        note: `${DEMO_TAG} scaduta`,
      })
    }
  }
  return rows
}

// ─── 10) DIPENDENTI (5) + TURNI 3 mesi ────────────────────────────────────
const DIPENDENTI_DEMO = [
  { nome: 'Luigi Bianchi', ruolo: 'Pasticcere capo', tipo_contratto: 'Full-time',
    costo_orario: 18, ore_settimana: 40, note: '[Demo] Capo produzione, lavora dal lunedì al venerdì 6-14' },
  { nome: 'Marta Verdi', ruolo: 'Banco vendita', tipo_contratto: 'Full-time',
    costo_orario: 13, ore_settimana: 40, note: '[Demo] Banco lun-ven 8-14, sab 8-18' },
  { nome: 'Giulia Esposito', ruolo: 'Banco vendita', tipo_contratto: 'Part-time',
    costo_orario: 12, ore_settimana: 20, note: '[Demo] Part-time weekend: ven-sab 14-20' },
  { nome: 'Riccardo Martini', ruolo: 'Aiuto produzione', tipo_contratto: 'Part-time',
    costo_orario: 12, ore_settimana: 24, note: '[Demo] Part-time produzione mar/gio/sab 7-13' },
  { nome: 'Sofia Gallo', ruolo: 'Apprendista', tipo_contratto: 'Apprendistato',
    costo_orario: 9, ore_settimana: 40, note: '[Demo] Apprendista 1° anno' },
]

function buildTurniFor(dipId, dip, weekOffset) {
  // Genera 1 settimana di turni per il dipendente in base al pattern del ruolo
  const r = rng(2026624 + weekOffset * 7 + dip.nome.length)
  const oggi = today()
  const turni = []
  // Lunedì della settimana
  const monday = addDays(oggi, -((oggi.getDay() + 6) % 7) - (weekOffset * 7))
  // Pattern per ruolo
  let pattern = []
  if (dip.tipo_contratto === 'Full-time' && dip.ruolo.includes('Pasticcere')) {
    pattern = [[6, 14], [6, 14], [6, 14], [6, 14], [6, 14], null, null] // lun-ven
  } else if (dip.tipo_contratto === 'Full-time' && dip.ruolo.includes('Banco')) {
    pattern = [[8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 18], null] // lun-sab
  } else if (dip.tipo_contratto === 'Apprendistato') {
    pattern = [[7, 15], [7, 15], [7, 15], [7, 15], [7, 15], [7, 12], null]
  } else if (dip.ruolo.includes('Banco') && dip.tipo_contratto === 'Part-time') {
    pattern = [null, null, null, null, [14, 20], [14, 20], null] // ven+sab
  } else if (dip.ruolo.includes('Aiuto') && dip.tipo_contratto === 'Part-time') {
    pattern = [null, [7, 13], null, [7, 13], null, [7, 13], null] // mar/gio/sab
  }
  for (let day = 0; day < 7; day++) {
    const slot = pattern[day]
    if (!slot) continue
    const d = addDays(monday, day)
    if (d > oggi) continue // futuro: lo lasciamo vuoto
    const [hin, hout] = slot
    // Variazione random ±15min per realismo
    const minIn = Math.floor(r() * 4) * 15 - 30
    const minOut = Math.floor(r() * 4) * 15 - 30
    const ore = (hout * 60 + minOut - hin * 60 - minIn) / 60
    turni.push({
      dipendente_id: dipId,
      data: isoDate(d),
      ora_inizio: fmtTime(hin, Math.max(0, minIn % 60)),
      ora_fine: fmtTime(hout, Math.max(0, minOut % 60)),
      ore: roundCents(ore),
      costo: roundCents(ore * dip.costo_orario),
      note: weekOffset === 0 ? '[Demo] settimana corrente' : null,
    })
  }
  return turni
}

// ─── 11) CLIENTI B2B + VENDITE B2B ────────────────────────────────────────
const CLIENTI_B2B_DEMO = [
  { nome: 'Bar Centrale Torino', partita_iva: '02345678901', codice_destinatario: 'M5UXCR1',
    pec: 'barcentrale@pec.it', indirizzo: 'Via Po 17', cap: '10124', citta: 'Torino', provincia: 'TO',
    referente: 'Giovanni Centro', email: 'g.centro@barcentrale.it', telefono: '011 8123456',
    note: '[Demo] Cliente storico, ordine settimanale' },
  { nome: 'Hotel Excelsior', partita_iva: '03456789012', codice_destinatario: 'KRRH6B9',
    pec: 'amministrazione@excelsior.pec.it', indirizzo: 'Corso Marconi 22', cap: '12100', citta: 'Cuneo', provincia: 'CN',
    referente: 'Francesca Maggio', email: 'food@excelsior.it', telefono: '0171 567890',
    note: '[Demo] Hotel 4★, colazione + roomservice' },
  { nome: 'Ristorante La Quercia', partita_iva: '04567890123', codice_destinatario: 'A4707H7',
    pec: 'laquercia@pec.it', indirizzo: 'Strada del Vino 12', cap: '12051', citta: 'Alba', provincia: 'CN',
    referente: 'Luca Vino', email: 'chef@laquercia.it', telefono: '0173 444555',
    note: '[Demo] Dessert menu + ricorrenze' },
  { nome: 'Catering Eventi Piemonte', partita_iva: '05678901234', codice_destinatario: 'USAL8PV',
    pec: 'cep@pec.it', indirizzo: 'Via Industria 45', cap: '14100', citta: 'Asti', provincia: 'AT',
    referente: 'Stefano Eventi', email: 'ordini@cateringevp.it', telefono: '0141 333222',
    note: '[Demo] Eventi grandi, ordini su prenotazione' },
]

function buildVenditeB2BRows(clientiIds, sedeId, vendibili) {
  const r = rng(2026625)
  const oggi = today()
  const rows = []
  if (!vendibili || vendibili.length === 0) return rows
  // Per B2B prezzo all'ingrosso ~70% del retail (sconto wholesale)
  const PRODOTTI_B2B = vendibili.map(v => ({
    ...v,
    prezzo_b2b: roundCents(v.prezzo * 0.70),
  }))
  // 6 vendite per cliente × N clienti, spalmate sui 90 giorni
  for (const cid of clientiIds) {
    for (let i = 0; i < 6; i++) {
      const dayOffset = -Math.floor(r() * 90) - 1
      const d = addDays(oggi, dayOffset)
      // 3-5 righe per vendita
      const nRighe = Math.min(vendibili.length, 3 + Math.floor(r() * 3))
      const usate = new Set()
      const righe = []
      for (let k = 0; k < nRighe; k++) {
        let p
        let tries = 0
        do { p = choice(r, PRODOTTI_B2B); tries++ } while (usate.has(p.nome) && tries < 10)
        usate.add(p.nome)
        // qta wholesale: 3-15 per pezzi piccoli, 1-5 per torte intere
        const qta = p.tipo === 'fetta' || p.prezzo > 15
          ? 1 + Math.floor(r() * 4)
          : 3 + Math.floor(r() * 12)
        // Sconto extra random ±5%
        const prezzo = roundCents(p.prezzo_b2b * (0.95 + r() * 0.10))
        const totRiga = roundCents(prezzo * qta)
        righe.push({ prodotto: p.nome, qta, prezzo, totale: totRiga })
      }
      const totale = roundCents(righe.reduce((s, x) => s + x.totale, 0))
      const stato = dayOffset < -45 ? 'fatturata' : (dayOffset < -7 ? 'consegnata' : (r() > 0.3 ? 'consegnata' : 'bozza'))
      rows.push({
        organization_id: null, sede_id: sedeId,
        cliente_id: cid,
        data: isoDate(d),
        righe, totale,
        stato,
        stock_scaricato: stato !== 'bozza',
        note: `${DEMO_TAG} ordine ${i + 1}/6`,
      })
    }
  }
  return rows
}

// ─── 12) COSTI AZIENDALI (8 voci) ─────────────────────────────────────────
function buildCostiAziendali() {
  const oggi = today()
  return [
    { categoria: 'Affitto', voce: 'Affitto laboratorio', importo: 1800, periodicita: 'mensile',
      data_inizio: isoDate(addDays(oggi, -365)), note: `${DEMO_TAG} contratto 6+6` },
    { categoria: 'Utenze', voce: 'Energia elettrica', importo: 480, periodicita: 'mensile',
      data_inizio: isoDate(addDays(oggi, -365)), note: `${DEMO_TAG} Enel bolletta bimestrale ÷2` },
    { categoria: 'Utenze', voce: 'Gas + Acqua', importo: 180, periodicita: 'mensile',
      data_inizio: isoDate(addDays(oggi, -365)), note: `${DEMO_TAG} ` },
    { categoria: 'Consumabili', voce: 'Coppette + pirottini + scatole', importo: 220, periodicita: 'mensile',
      data_inizio: isoDate(addDays(oggi, -240)), note: `${DEMO_TAG} DolciNapoli` },
    { categoria: 'Marketing', voce: 'Sponsorizzazione Instagram', importo: 150, periodicita: 'mensile',
      data_inizio: isoDate(addDays(oggi, -120)), note: `${DEMO_TAG} Meta ads` },
    { categoria: 'Servizi', voce: 'Commercialista', importo: 1800, periodicita: 'annuale',
      data_inizio: isoDate(addDays(oggi, -90)), note: `${DEMO_TAG} canone annuale` },
    { categoria: 'Assicurazione', voce: 'RC attività', importo: 720, periodicita: 'annuale',
      data_inizio: isoDate(addDays(oggi, -180)), note: `${DEMO_TAG} Allianz` },
    { categoria: 'Manutenzione', voce: 'Forno + impastatrice service', importo: 600, periodicita: 'annuale',
      data_inizio: isoDate(addDays(oggi, -200)), note: `${DEMO_TAG} contratto biennale ÷2` },
  ]
}

// ─── 13) CLEANUP demo data esistente (idempotenza) ────────────────────────
async function cleanupDemo(supabase, orgId) {
  // Cancella tutte le righe demo precedenti dell'org (best-effort)
  const tables = [
    { name: 'vendite_b2b', filter: { col: 'note', op: 'ilike', val: '[Demo data]%' } },
    { name: 'clienti_b2b', filter: { col: 'note', op: 'ilike', val: '[Demo data]%' } },
    { name: 'fatture', filter: { col: 'numero', op: 'ilike', val: '[Demo data]%' } },
    { name: 'fornitori', filter: { col: 'note', op: 'ilike', val: '[Demo data]%' } },
    { name: 'turni', filter: { col: 'note', op: 'ilike', val: '[Demo]%' } },
    { name: 'dipendenti', filter: { col: 'note', op: 'ilike', val: '[Demo]%' } },
    { name: 'costi_aziendali', filter: { col: 'note', op: 'ilike', val: '[Demo data]%' } },
  ]
  for (const t of tables) {
    try {
      await supabase.from(t.name).delete()
        .eq('organization_id', orgId)
        .filter(t.filter.col, t.filter.op, t.filter.val)
    } catch { /* tabella opzionale */ }
  }
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────
/**
 * Popola dati demo COMPLETI sull'org (3 mesi realistici). Best-effort,
 * idempotente: pulisce le righe `[Demo data]` precedenti prima di reinserire.
 *
 * Opzioni:
 *   customMenu: { ricette, ingredienti_costi, nome_attivita?, citta? }
 *     - se fornito, sostituisce il ricettario default
 *     - chiusure/produzione/B2B usano i prodotti del customMenu
 *     - nome_attivita aggiorna organizations.nome (pitch-friendly)
 *
 * Ritorna { ok, counts, override } con i numeri delle entità create.
 */
export async function seedDemoDataFull({ orgId, sedeId, supabase, customMenu = null } = {}) {
  if (!orgId) throw new Error('orgId richiesto per seed demo full')
  if (!supabase) throw new Error('supabase client richiesto (anon o service-role)')

  // ── 0) Cleanup precedenti
  await cleanupDemo(supabase, orgId)

  // ── 1) Ricettario: custom override o default 15 ricette
  let ricettario
  if (customMenu?.ricette && Object.keys(customMenu.ricette).length > 0) {
    // Custom: merge con ingredienti default per le voci comuni (farina/zucchero
    // ecc.) così le ricette custom possono usarle. ingredienti_costi del custom
    // hanno priorità per gli ingredienti specifici (mascarpone, savoiardi, ecc.)
    const defaultRic = buildRicettario()
    ricettario = {
      ingredienti_costi: {
        ...defaultRic.ingredienti_costi,
        ...(customMenu.ingredienti_costi || {}),
      },
      ricette: customMenu.ricette,
    }
  } else {
    ricettario = buildRicettario()
  }
  const vendibili = extractVendibili(ricettario)

  // Override nome organizzazione (per pitch)
  let override = { nome_aggiornato: false, citta_aggiornata: false }
  if (customMenu?.nome_attivita) {
    try {
      const { error } = await supabase.from('organizations')
        .update({ nome: customMenu.nome_attivita.slice(0, 100) })
        .eq('id', orgId)
      if (!error) override.nome_aggiornato = true
    } catch { /* skip */ }
  }
  if (customMenu?.citta) {
    try {
      const { data: sede } = await supabase.from('sedi').select('id')
        .eq('organization_id', orgId).limit(1).maybeSingle()
      if (sede?.id) {
        const { error } = await supabase.from('sedi')
          .update({ citta: customMenu.citta.slice(0, 60) })
          .eq('id', sede.id)
        if (!error) override.citta_aggiornata = true
      }
    } catch { /* skip */ }
  }

  // ── 2) user_data: magazzino, chiusure, produzione, sprechi, formati, logprezzi
  const magazzino = buildMagazzino()
  const chiusure = buildChiusure(vendibili)
  const giornaliero = buildGiornaliero(vendibili)
  const movimenti = buildMovimenti(vendibili)
  const formati = buildFormati()
  const logPrezzi = buildLogPrezzi()

  await Promise.all([
    userDataUpsert(supabase, SK_RIC, ricettario, orgId, null),
    userDataUpsert(supabase, SK_MAG, magazzino, orgId, sedeId),
    userDataUpsert(supabase, SK_CHIUS, chiusure, orgId, sedeId),
    userDataUpsert(supabase, SK_GIOR, giornaliero, orgId, sedeId),
    userDataUpsert(supabase, SK_MOV, movimenti, orgId, sedeId),
    userDataUpsert(supabase, SK_FORMATI, formati, orgId, null),
    userDataUpsert(supabase, SK_LOG_PRZ, logPrezzi, orgId, null),
  ])

  // ── 2) DB tables: fornitori (anagrafica)
  let nFornitori = 0
  const forniIds = []
  for (const f of FORNITORI_DEMO) {
    try {
      const { data } = await supabase.from('fornitori').insert({
        organization_id: orgId,
        nome: f.nome, contatto: f.contatto, email: f.email, telefono: f.telefono, note: f.note,
      }).select('id').maybeSingle()
      if (data?.id) { forniIds.push(data.id); f._id = data.id; nFornitori++ }
    } catch { /* tabella opzionale */ }
  }

  // ── 3) Fatture fornitori
  let nFatture = 0
  const fatRows = buildFattureRows(forniIds).map(r => ({ ...r, organization_id: orgId, sede_id: sedeId }))
  for (const fr of fatRows) {
    try {
      await supabase.from('fatture').insert(fr)
      nFatture++
    } catch { /* skip */ }
  }

  // ── 4) Dipendenti
  let nDipendenti = 0
  const dipIds = []
  for (const d of DIPENDENTI_DEMO) {
    try {
      const { data } = await supabase.from('dipendenti').insert({
        organization_id: orgId, ...d,
      }).select('id').maybeSingle()
      if (data?.id) { dipIds.push({ id: data.id, ...d }); nDipendenti++ }
    } catch { /* skip */ }
  }

  // ── 5) Turni 12 settimane
  let nTurni = 0
  for (const dip of dipIds) {
    for (let w = 0; w < 12; w++) {
      const turni = buildTurniFor(dip.id, dip, w)
      for (const t of turni) {
        try {
          await supabase.from('turni').insert({ organization_id: orgId, ...t })
          nTurni++
        } catch { /* skip */ }
      }
    }
  }

  // ── 6) Clienti B2B + Vendite B2B
  let nClientiB2B = 0
  const clientiIds = []
  for (const c of CLIENTI_B2B_DEMO) {
    try {
      const { data } = await supabase.from('clienti_b2b').insert({
        organization_id: orgId, ...c,
      }).select('id').maybeSingle()
      if (data?.id) { clientiIds.push(data.id); nClientiB2B++ }
    } catch { /* skip */ }
  }
  let nVenditeB2B = 0
  const vendite = buildVenditeB2BRows(clientiIds, sedeId, vendibili).map(v => ({ ...v, organization_id: orgId }))
  for (const v of vendite) {
    try {
      await supabase.from('vendite_b2b').insert(v)
      nVenditeB2B++
    } catch { /* skip */ }
  }

  // ── 7) Costi aziendali
  let nCosti = 0
  for (const c of buildCostiAziendali()) {
    try {
      await supabase.from('costi_aziendali').insert({
        organization_id: orgId, sede_id: null, ...c,
      })
      nCosti++
    } catch { /* skip */ }
  }

  return {
    ok: true,
    override,
    counts: {
      ricette: Object.keys(ricettario.ricette).length,
      ingredienti_prezzi: Object.keys(ricettario.ingredienti_costi).length,
      magazzino: Object.keys(magazzino).length,
      chiusure: chiusure.length,
      sessioni_produzione: giornaliero.length,
      movimenti: movimenti.length,
      formati_vendita: formati.length,
      log_prezzi: logPrezzi.length,
      fornitori: nFornitori,
      fatture: nFatture,
      dipendenti: nDipendenti,
      turni: nTurni,
      clienti_b2b: nClientiB2B,
      vendite_b2b: nVenditeB2B,
      costi_aziendali: nCosti,
    },
  }
}
