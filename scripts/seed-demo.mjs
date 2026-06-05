#!/usr/bin/env node
/**
 * Crea (o ri-popola) un account DEMO con tanti dati realistici di pasticceria:
 * ricettario ricco, magazzino, storico produzione, chiusure cassa, formati,
 * stock vetrina. Pensato per demo commerciali.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   [DEMO_EMAIL=demo@maradeiboschi.com] [DEMO_PASSWORD=...] \
 *   node scripts/seed-demo.mjs
 *
 * La service_role key sta in Supabase Dashboard -> Settings -> API (e su Vercel
 * come SUPABASE_SERVICE_KEY). NON committarla.
 *
 * Idempotente: rieseguito, riusa lo stesso utente e sovrascrive i dati demo.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const EMAIL = process.env.DEMO_EMAIL || 'demo@maradeiboschi.com'
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoFoodOS2026!'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_KEY.length < 100) {
  console.error('❌ Servono SUPABASE_URL e SUPABASE_SERVICE_KEY (service_role).')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Helper deterministici (niente random: seed riproducibile) ───────────────
const norm = s => s.toLowerCase().trim().replace(/\s+/g, ' ')
const up = s => s.toUpperCase().trim()
const r2 = n => Math.round(n * 100) / 100
const r3 = n => Math.round(n * 1000) / 1000
const dayISO = back => {
  const d = new Date()
  d.setDate(d.getDate() - back)
  return d.toISOString().slice(0, 10)
}

// ─── Dataset: ingredienti (costo al kg) ──────────────────────────────────────
const INGREDIENTI = {
  'Farina 00': 0.88, 'Farina manitoba': 1.20, 'Zucchero': 0.98, 'Zucchero a velo': 1.45,
  'Burro': 5.80, 'Uova': 3.00, 'Tuorli': 6.20, 'Albumi': 2.40, 'Latte intero': 1.10,
  'Panna fresca': 3.40, 'Mascarpone': 6.20, 'Ricotta': 4.50, 'Lievito per dolci': 7.50,
  'Lievito di birra': 4.00, 'Cioccolato fondente': 9.80, 'Cioccolato al latte': 9.20,
  'Cacao amaro': 9.50, 'Nocciole': 14.50, 'Mandorle': 12.00, 'Pistacchio': 38.00,
  'Marmellata albicocche': 4.00, 'Confettura frutti di bosco': 4.80, 'Miele': 8.50,
  'Vaniglia bacca': 220.00, 'Scorza di limone': 3.20, 'Scorza arancia': 3.40,
  'Sale': 0.50, 'Caffè espresso': 14.00, 'Savoiardi': 5.00, 'Gelatina fogli': 22.00,
  'Glassa neutra': 6.00, 'Pasta di mandorle': 16.00, 'Rum': 12.00, 'Maraschino': 15.00,
  'Crema pasticcera base': 0, 'Pan di spagna base': 0, // semilavorati (costo calcolato)
  'Fragole': 6.50, 'Lamponi': 18.00, 'Cocco rapè': 7.20, 'Amaretti': 9.00,
}

// ─── Dataset: ricette (qty in g per 1 stampo) ────────────────────────────────
// tipo: 'fetta' | 'pezzo' | 'semilavorato'.  unita = porzioni per stampo.
const RICETTE = [
  // Semilavorati (referenziati dalle ricette finite)
  { nome: 'Crema pasticcera base', cat: 'Semilavorati', tipo: 'semilavorato', unita: 1, prezzo: 0,
    ing: [['Latte intero', 500], ['Tuorli', 120], ['Zucchero', 130], ['Farina 00', 45], ['Vaniglia bacca', 1]] },
  { nome: 'Pan di spagna base', cat: 'Semilavorati', tipo: 'semilavorato', unita: 1, prezzo: 0,
    ing: [['Uova', 300], ['Zucchero', 180], ['Farina 00', 180]] },
  // Torte (prezzo = per FETTA/porzione, coerente col modello dell'app)
  { nome: 'Torta Margherita', cat: 'Torte', tipo: 'fetta', unita: 8, prezzo: 3.50,
    ing: [['Uova', 200], ['Zucchero', 150], ['Farina 00', 120], ['Burro', 80], ['Lievito per dolci', 8], ['Scorza di limone', 5]] },
  { nome: 'Torta Sacher', cat: 'Torte', tipo: 'fetta', unita: 10, prezzo: 4.00,
    ing: [['Cioccolato fondente', 200], ['Burro', 150], ['Uova', 200], ['Zucchero', 150], ['Farina 00', 120], ['Marmellata albicocche', 180]] },
  { nome: 'Torta Foresta Nera', cat: 'Torte', tipo: 'fetta', unita: 12, prezzo: 4.00,
    ing: [['Pan di spagna base', 400], ['Panna fresca', 500], ['Cioccolato fondente', 150], ['Maraschino', 30], ['Zucchero', 80]] },
  { nome: 'Torta Pistacchio', cat: 'Torte', tipo: 'fetta', unita: 10, prezzo: 4.50,
    ing: [['Pan di spagna base', 350], ['Pistacchio', 120], ['Panna fresca', 400], ['Cioccolato al latte', 100], ['Zucchero', 90]] },
  { nome: 'Cheesecake Frutti di Bosco', cat: 'Torte', tipo: 'fetta', unita: 10, prezzo: 4.00,
    ing: [['Ricotta', 400], ['Mascarpone', 200], ['Zucchero', 120], ['Confettura frutti di bosco', 150], ['Amaretti', 150], ['Burro', 80], ['Gelatina fogli', 8]] },
  { nome: 'Tiramisù', cat: 'Torte', tipo: 'fetta', unita: 8, prezzo: 4.00,
    ing: [['Mascarpone', 500], ['Tuorli', 100], ['Zucchero', 100], ['Panna fresca', 200], ['Savoiardi', 150], ['Caffè espresso', 200], ['Cacao amaro', 20]] },
  // Crostate
  { nome: 'Crostata Marmellata', cat: 'Crostate', tipo: 'fetta', unita: 8, prezzo: 3.00,
    ing: [['Farina 00', 250], ['Burro', 125], ['Zucchero a velo', 90], ['Uova', 50], ['Marmellata albicocche', 200]] },
  { nome: 'Crostata Frutta', cat: 'Crostate', tipo: 'fetta', unita: 10, prezzo: 3.50,
    ing: [['Farina 00', 250], ['Burro', 125], ['Zucchero a velo', 90], ['Uova', 50], ['Crema pasticcera base', 350], ['Fragole', 150], ['Glassa neutra', 60]] },
  { nome: 'Crostata Cioccolato', cat: 'Crostate', tipo: 'fetta', unita: 8, prezzo: 3.50,
    ing: [['Farina 00', 250], ['Burro', 125], ['Zucchero a velo', 90], ['Cacao amaro', 30], ['Cioccolato fondente', 200], ['Panna fresca', 150]] },
  // Lievitati
  { nome: 'Croissant Vuoto', cat: 'Lievitati', tipo: 'pezzo', unita: 1, prezzo: 1.30,
    ing: [['Farina manitoba', 60], ['Burro', 30], ['Zucchero', 6], ['Lievito di birra', 2], ['Latte intero', 20]] },
  { nome: 'Croissant Crema', cat: 'Lievitati', tipo: 'pezzo', unita: 1, prezzo: 1.60,
    ing: [['Farina manitoba', 60], ['Burro', 30], ['Zucchero', 6], ['Lievito di birra', 2], ['Latte intero', 20], ['Crema pasticcera base', 35]] },
  { nome: 'Brioche col Tuppo', cat: 'Lievitati', tipo: 'pezzo', unita: 1, prezzo: 1.50,
    ing: [['Farina manitoba', 70], ['Burro', 25], ['Uova', 20], ['Zucchero', 12], ['Lievito di birra', 3], ['Scorza arancia', 2]] },
  // Biscotti / piccola pasticceria
  { nome: 'Cantucci Mandorla', cat: 'Biscotti', tipo: 'pezzo', unita: 1, prezzo: 0.45,
    ing: [['Farina 00', 25], ['Zucchero', 12], ['Uova', 8], ['Mandorle', 12]] },
  { nome: 'Baci di Dama', cat: 'Biscotti', tipo: 'pezzo', unita: 1, prezzo: 0.60,
    ing: [['Farina 00', 12], ['Burro', 10], ['Nocciole', 10], ['Zucchero', 8], ['Cioccolato fondente', 5]] },
  { nome: 'Amaretti Morbidi', cat: 'Biscotti', tipo: 'pezzo', unita: 1, prezzo: 0.50,
    ing: [['Mandorle', 18], ['Zucchero', 14], ['Albumi', 6]] },
  // Monoporzioni
  { nome: 'Bignè Crema', cat: 'Monoporzioni', tipo: 'pezzo', unita: 1, prezzo: 1.20,
    ing: [['Farina 00', 15], ['Burro', 12], ['Uova', 20], ['Crema pasticcera base', 30]] },
  { nome: 'Cannolo Siciliano', cat: 'Monoporzioni', tipo: 'pezzo', unita: 1, prezzo: 2.20,
    ing: [['Farina 00', 25], ['Ricotta', 60], ['Zucchero a velo', 20], ['Cioccolato fondente', 8], ['Pistacchio', 5]] },
  { nome: 'Tartufo Cioccolato', cat: 'Monoporzioni', tipo: 'pezzo', unita: 1, prezzo: 1.40,
    ing: [['Cioccolato fondente', 25], ['Panna fresca', 15], ['Cacao amaro', 5], ['Rum', 2]] },
  { nome: 'Mini Cheesecake', cat: 'Monoporzioni', tipo: 'pezzo', unita: 1, prezzo: 2.50,
    ing: [['Ricotta', 50], ['Mascarpone', 25], ['Zucchero', 15], ['Lamponi', 15], ['Amaretti', 18]] },
]

// ─── Costruzione ricettario nel formato dell'app ─────────────────────────────
function pesoStampo(r) { return r.ing.reduce((s, [, q]) => s + q, 0) }
function buildRicettario() {
  const ingredienti_costi = {}
  for (const [nome, costoKg] of Object.entries(INGREDIENTI)) {
    ingredienti_costi[norm(nome)] = { costoKg: r3(costoKg), costoG: r3(costoKg / 1000) }
  }
  const ricette = {}
  for (const r of RICETTE) {
    const key = up(r.nome)
    ricette[key] = {
      nome: key, tipo: r.tipo, unita: r.unita, prezzo: r.prezzo, categoria: r.cat,
      ingredienti: r.ing.map(([nome, qty1stampo]) => {
        const costoG = (INGREDIENTI[nome] || 0) / 1000
        return { nome, qty1stampo, costoPerG: r3(costoG), costo1stampo: r2(qty1stampo * costoG) }
      }),
    }
  }
  return { ricette, ingredienti_costi }
}

// FC unitario approssimato (per stock valore_unit e kpi chiusure). Niente
// ricorsione semilavorati qui: per i semilavorati usiamo il costo diretto
// degli ingredienti foglia (sufficiente per dati demo).
const semiCostoG = {}
function fcStampo(r) {
  let tot = 0
  for (const [nome, qty] of r.ing) {
    let cg = (INGREDIENTI[nome] || 0) / 1000
    if (cg === 0 && semiCostoG[nome] != null) cg = semiCostoG[nome]
    tot += qty * cg
  }
  return tot
}
function precomputeSemilavorati() {
  for (const r of RICETTE.filter(x => x.tipo === 'semilavorato')) {
    semiCostoG[r.nome] = fcStampo(r) / pesoStampo(r)
  }
}
const fcUnit = r => fcStampo(r) / (r.unita || 1)

// ─── Magazzino (per-sede): una voce per ingrediente ──────────────────────────
function buildMagazzino() {
  const mag = {}
  let i = 0
  for (const nome of Object.keys(INGREDIENTI)) {
    if (INGREDIENTI[nome] === 0) continue // salta i semilavorati
    i++
    const soglia = [500, 1000, 2000, 3000][i % 4]
    const giac = soglia * (1 + (i % 5) * 0.4) // alcuni sopra, qualcuno vicino soglia
    mag[norm(nome)] = {
      nome, giacenza_g: Math.round(giac), soglia_g: soglia,
      ultimoRifornimento: dayISO(i % 14),
    }
  }
  return mag
}

// ─── Storico produzione (giornaliero, per-sede): ultimi 28 giorni ────────────
const VENDIBILI = RICETTE.filter(r => r.tipo !== 'semilavorato')
function buildGiornaliero() {
  const sessioni = []
  for (let back = 28; back >= 1; back--) {
    if (back % 7 === 0) continue // chiuso un giorno a settimana (domenica fittizia)
    const data = dayISO(back)
    // ruota i prodotti del giorno (6-8 ricette per sessione)
    const start = back % VENDIBILI.length
    const items = []
    for (let j = 0; j < 7; j++) {
      const r = VENDIBILI[(start + j) % VENDIBILI.length]
      const stampi = r.tipo === 'pezzo' ? 20 + ((back + j) % 30) : 2 + ((back + j) % 4)
      items.push({ r, stampi })
    }
    const ingredientiUsati = {}
    let fcTot = 0, ricavoTot = 0
    for (const { r, stampi } of items) {
      for (const [nome, qty] of r.ing) {
        ingredientiUsati[norm(nome)] = (ingredientiUsati[norm(nome)] || 0) + qty * stampi
      }
      fcTot += fcStampo(r) * stampi
      ricavoTot += r.prezzo * r.unita * stampi
    }
    sessioni.push({
      id: `g-demo-${data}`, data,
      prodotti: items.map(({ r, stampi }) => ({
        nome: up(r.nome), stampi, vendibile: stampi * (r.unita || 1), congelabile: false,
      })),
      note: '', ingredientiUsati, fcTot: r2(fcTot), ricavoTot: r2(ricavoTot),
      destinazioneSedeId: null, destinazioneSedeNome: null,
    })
  }
  return sessioni.reverse() // newest first (come fa l'app)
}

// ─── Chiusure cassa (per-sede): deriva dal venduto ~82% del prodotto ─────────
function buildChiusure(giornaliero) {
  const chiusure = []
  for (const sess of giornaliero) {
    const confronto = []
    let totV = 0, totFC = 0, totS = 0, stSum = 0, n = 0
    const venduto = []
    for (const p of sess.prodotti) {
      const r = VENDIBILI.find(x => up(x.nome) === p.nome)
      if (!r) continue
      const unitaP = p.stampi * (r.unita || 1)        // porzioni prodotte
      const unitaV = Math.round(unitaP * 0.82)         // ~82% venduto
      const unitaR = unitaP - unitaV                   // residuo/invenduto
      const fcPorz = fcStampo(r) / (r.unita || 1)      // food cost per porzione
      const rv = r2(unitaV * r.prezzo)                 // prezzo è già per porzione
      const fcV = r2(unitaV * fcPorz)
      const st = unitaP > 0 ? r2((unitaV / unitaP) * 100) : 0
      confronto.push({
        nome: p.nome, stampiP: p.stampi, unitaP, unitaV, unitaR,
        st, rv, fcV, marg: r2(rv - fcV), spreco: r2(unitaR * fcPorz), inProd: true,
      })
      venduto.push({ nome: p.nome, qta: unitaV, prezzo: r.prezzo, totale: rv, categoria: r.cat })
      totV += rv; totFC += fcV; totS += unitaR * (fcStampo(r) / (r.unita || 1)); stSum += st; n++
    }
    chiusure.push({
      id: `ch-${sess.data}`, data: sess.data, salvatoAt: new Date(sess.data + 'T19:30:00').toISOString(),
      venduto, confronto, formati: [],
      kpi: { totV: r2(totV), totFC: r2(totFC), totM: r2(totV - totFC), totS: r2(totS), totMP: 0, avgST: n ? r2(stSum / n) : 0 },
    })
  }
  return chiusure
}

// ─── Formati di vendita (shared) ─────────────────────────────────────────────
const FORMATI = [
  { id: 'fmt-vaschetta-250', nome: 'Vaschetta 250g', categoria: 'Asporto', baseQtaG: 250,
    componenti: [{ nome: 'Vaschetta', qta: 1, costo: 0.18 }, { nome: 'Fazzoletto', qta: 1, costo: 0.02 }] },
  { id: 'fmt-vaschetta-500', nome: 'Vaschetta 500g', categoria: 'Asporto', baseQtaG: 500,
    componenti: [{ nome: 'Vaschetta', qta: 1, costo: 0.25 }, { nome: 'Fazzoletto', qta: 1, costo: 0.02 }] },
  { id: 'fmt-scatola-torta', nome: 'Scatola torta', categoria: 'Asporto', baseQtaG: 0,
    componenti: [{ nome: 'Scatola', qta: 1, costo: 0.45 }, { nome: 'Nastro', qta: 1, costo: 0.08 }] },
]

// ─── Stock vetrina (prodotti finiti): prodotto - venduto degli ultimi 2 giorni
function buildStockRows(orgId, sedeId, giornaliero, chiusure) {
  const giac = {}
  const valore = {}
  // somma produzione e sottrai venduto solo degli ultimi 3 giorni (vetrina fresca)
  const recenti = giornaliero.slice(0, 3)
  for (const sess of recenti) {
    for (const p of sess.prodotti) {
      const r = VENDIBILI.find(x => up(x.nome) === p.nome)
      if (!r) continue
      giac[p.nome] = (giac[p.nome] || 0) + p.stampi * (r.unita || 1)
      valore[p.nome] = r2(fcStampo(r) / (r.unita || 1))
    }
  }
  for (const ch of chiusure.slice(0, 3)) {
    for (const v of ch.venduto) giac[v.nome] = (giac[v.nome] || 0) - v.qta
  }
  return Object.entries(giac)
    .filter(([, q]) => q > 0)
    .map(([nome, q]) => ({
      organization_id: orgId, sede_id: sedeId, prodotto_nome: nome,
      quantita: Math.round(q), unita: 'pz', valore_unit: valore[nome] || 0,
      soglia_min: 3, updated_at: new Date().toISOString(),
    }))
}

// ─── Scrittura user_data (delete + insert, idempotente) ──────────────────────
async function setData(orgId, sedeId, key, value) {
  let q = sb.from('user_data').delete().eq('organization_id', orgId).eq('data_key', key)
  q = sedeId === null ? q.is('sede_id', null) : q.eq('sede_id', sedeId)
  await q
  const { error } = await sb.from('user_data').insert({
    organization_id: orgId, sede_id: sedeId, data_key: key,
    data_value: value, updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`setData ${key}: ${error.message}`)
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
console.log(`\n→ Account demo: ${EMAIL}`)

// 1. Utente (crea o riusa)
let userId
{
  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
    user_metadata: { nome_completo: 'Demo Pasticceria', nome_attivita: 'Pasticceria Demo', tipo_attivita: 'pasticceria', citta: 'Torino' },
  })
  if (error && error.message?.toLowerCase().includes('already')) {
    // riusa: trova l id paginando gli utenti
    let page = 1, found = null
    while (!found && page <= 20) {
      const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      found = (list?.users || []).find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase())
      if (!list?.users?.length) break
      page++
    }
    if (!found) { console.error('❌ Utente esistente ma non trovato in listUsers.'); process.exit(2) }
    userId = found.id
    await sb.auth.admin.updateUserById(userId, { password: PASSWORD }) // reset password nota
    console.log('• Utente già esistente: riuso e reimposto la password.')
  } else if (error) {
    console.error('❌ createUser:', error.message); process.exit(3)
  } else {
    userId = data.user.id
    console.log('✓ Utente creato.')
  }
}

// 2. Attendi il trigger handle_new_user e leggi org + sede
await new Promise(r => setTimeout(r, 1500))
const { data: prof } = await sb.from('profiles').select('organization_id').eq('id', userId).maybeSingle()
const orgId = prof?.organization_id
if (!orgId) { console.error('❌ Profilo/org non creati dal trigger handle_new_user.'); process.exit(4) }
const { data: sedi } = await sb.from('sedi').select('id, nome, is_default').eq('organization_id', orgId).order('is_default', { ascending: false })
const sedeId = sedi?.[0]?.id
if (!sedeId) { console.error('❌ Nessuna sede per l org.'); process.exit(5) }
console.log(`✓ org=${orgId}  sede=${sedeId}`)

// 3. Sblocca l account (niente gate trial): approvato + attivo + trial lontano
await sb.from('organizations').update({
  approvato: true, attivo: true,
  trial_ends_at: new Date(Date.now() + 365 * 86400000).toISOString(),
}).eq('id', orgId)

// 4. Genera e scrivi i dati
precomputeSemilavorati()
const ricettario = buildRicettario()
const magazzino = buildMagazzino()
const giornaliero = buildGiornaliero()
const chiusure = buildChiusure(giornaliero)

await setData(orgId, null, 'pasticceria-ricettario-v1', ricettario)          // shared
await setData(orgId, null, 'pasticceria-formati-vendita-v1', FORMATI)        // shared
await setData(orgId, sedeId, 'pasticceria-magazzino-v1', magazzino)          // per-sede
await setData(orgId, sedeId, 'pasticceria-giornaliero-v1', giornaliero)      // per-sede
await setData(orgId, sedeId, 'pasticceria-chiusure-v1', chiusure)            // per-sede

// 5. Stock vetrina (insert diretto, idempotente)
await sb.from('stock_prodotti_finiti').delete().eq('organization_id', orgId).eq('sede_id', sedeId)
const stockRows = buildStockRows(orgId, sedeId, giornaliero, chiusure)
if (stockRows.length) {
  const { error } = await sb.from('stock_prodotti_finiti').insert(stockRows)
  if (error) console.error('⚠ stock_prodotti_finiti:', error.message, '(la vetrina resterà vuota, il resto è ok)')
}

console.log('\n═══════════════════════════════════════════════════════════')
console.log('✅ Demo pronta.')
console.log(`   Ricette:      ${Object.keys(ricettario.ricette).length}`)
console.log(`   Ingredienti:  ${Object.keys(ricettario.ingredienti_costi).length}`)
console.log(`   Sessioni prod:${giornaliero.length}`)
console.log(`   Chiusure:     ${chiusure.length}`)
console.log(`   Stock vetrina:${stockRows.length} prodotti`)
console.log('───────────────────────────────────────────────────────────')
console.log(`   Login:    ${EMAIL}`)
console.log(`   Password: ${PASSWORD}`)
console.log('═══════════════════════════════════════════════════════════\n')
