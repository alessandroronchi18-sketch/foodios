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
const INGREDIENTI_PAST = {
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
const RICETTE_PAST = [
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

// ─── Dataset GELATERIA (ing in g per vaschetta ~5kg; unita = coppette/vaschetta;
//      prezzo = per coppetta). I "gusti" sono le ricette. ──────────────────────
const INGREDIENTI_GEL = {
  'Latte intero': 1.10, 'Panna fresca': 3.40, 'Zucchero': 0.98, 'Destrosio': 1.80,
  'Latte magro in polvere': 3.50, 'Tuorli': 6.20, 'Cacao amaro': 9.50, 'Cioccolato fondente': 9.80,
  'Pasta pistacchio': 38.00, 'Pasta nocciola': 18.00, 'Nocciole': 14.50, 'Pistacchio': 38.00,
  'Fragole': 6.50, 'Limoni': 2.50, 'Mango polpa': 8.00, 'Caffè espresso': 14.00,
  'Vaniglia bacca': 220.00, 'Amarena sciroppata': 7.50, 'Cocco rapè': 7.20, 'Yogurt': 2.80,
  'Menta': 3.00, 'Latte condensato': 4.50,
  'Base bianca': 0, 'Base gialla': 0, // semilavorati
}
const RICETTE_GEL = [
  { nome: 'Base bianca', cat: 'Basi', tipo: 'semilavorato', unita: 1, prezzo: 0,
    ing: [['Latte intero', 3000], ['Panna fresca', 800], ['Zucchero', 700], ['Latte magro in polvere', 250], ['Destrosio', 250]] },
  { nome: 'Base gialla', cat: 'Basi', tipo: 'semilavorato', unita: 1, prezzo: 0,
    ing: [['Latte intero', 3000], ['Panna fresca', 700], ['Tuorli', 600], ['Zucchero', 700]] },
  { nome: 'Fiordilatte', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 5000]] },
  { nome: 'Crema', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base gialla', 4900], ['Vaniglia bacca', 2]] },
  { nome: 'Pistacchio', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 3.00, ing: [['Base bianca', 4500], ['Pasta pistacchio', 500]] },
  { nome: 'Nocciola', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.80, ing: [['Base bianca', 4600], ['Pasta nocciola', 400]] },
  { nome: 'Cioccolato', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 4500], ['Cacao amaro', 250], ['Cioccolato fondente', 250]] },
  { nome: 'Stracciatella', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 4800], ['Cioccolato fondente', 200]] },
  { nome: 'Bacio', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.80, ing: [['Base bianca', 4500], ['Pasta nocciola', 300], ['Cacao amaro', 200]] },
  { nome: 'Caffè', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 4800], ['Caffè espresso', 200]] },
  { nome: 'Amarena', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 4700], ['Amarena sciroppata', 300]] },
  { nome: 'Cocco', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 4700], ['Cocco rapè', 300]] },
  { nome: 'Yogurt', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Yogurt', 3000], ['Base bianca', 1500], ['Zucchero', 500]] },
  { nome: 'Tiramisù', cat: 'Creme', tipo: 'pezzo', unita: 50, prezzo: 2.80, ing: [['Base gialla', 4600], ['Caffè espresso', 200], ['Cacao amaro', 100]] },
  { nome: 'Sorbetto Limone', cat: 'Sorbetti', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Limoni', 1500], ['Zucchero', 1300]] },
  { nome: 'Sorbetto Fragola', cat: 'Sorbetti', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Fragole', 2500], ['Zucchero', 1200]] },
  { nome: 'Sorbetto Mango', cat: 'Sorbetti', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Mango polpa', 2500], ['Zucchero', 1200]] },
  { nome: 'Menta', cat: 'Sorbetti', tipo: 'pezzo', unita: 50, prezzo: 2.50, ing: [['Base bianca', 4800], ['Menta', 200]] },
]

// ─── Config per tipo attività: cosa cambia tra pasticceria/gelateria ─────────
const DEMO = {
  pasticceria: {
    nome_attivita: 'Pasticceria Demo', tipo: 'pasticceria', ing: INGREDIENTI_PAST, ric: RICETTE_PAST,
    // vendite B2B: {cliente idx, giorni fa, stato, righe [[prodotto, qta, prezzo]]}
    b2b: [
      { c: 0, back: 1, s: 'fatturata', items: [['CROISSANT VUOTO', 60, 0.7], ['BRIOCHE COL TUPPO', 30, 0.85]] },
      { c: 1, back: 2, s: 'fatturata', items: [['CROISSANT CREMA', 40, 0.9], ['CANNOLO SICILIANO', 20, 1.4]] },
      { c: 0, back: 4, s: 'fatturata', items: [['CROISSANT VUOTO', 80, 0.7]] },
      { c: 2, back: 6, s: 'consegnata', items: [['BIGNÈ CREMA', 50, 0.7], ['TORTA SACHER', 3, 22]] },
      { c: 1, back: 0, s: 'consegnata', items: [['CROISSANT VUOTO', 50, 0.7], ['BACI DI DAMA', 60, 0.35]] },
    ],
    eventi: [
      { cliente: 'Famiglia Ferrero', back: 5, acconto: 30, note: '18 anni — ritiro ore 16', items: [['Torta 3 piani cioccolato', 1, 120], ['Mignon assortiti', 40, 1.2]] },
      { cliente: 'Studio Legale Bianchi', back: 9, acconto: 0, note: 'Buffet inaugurazione ufficio', items: [['Focaccine farcite', 80, 1.5], ['Pasticceria salata', 100, 0.9]] },
      { cliente: 'Maria (privato)', back: 2, acconto: 20, note: 'Battesimo', items: [['Torta panna e fragole', 1, 45], ['Confetti', 30, 0.5]] },
    ],
  },
  gelateria: {
    nome_attivita: 'Gelateria Demo', tipo: 'gelateria', ing: INGREDIENTI_GEL, ric: RICETTE_GEL,
    // ingrosso: vaschette di gusti a bar/ristoranti (prezzo per vaschetta)
    b2b: [
      { c: 0, back: 1, s: 'fatturata', items: [['FIORDILATTE', 8, 22], ['CIOCCOLATO', 6, 22], ['PISTACCHIO', 4, 30]] },
      { c: 1, back: 2, s: 'fatturata', items: [['NOCCIOLA', 6, 26], ['STRACCIATELLA', 6, 22]] },
      { c: 0, back: 4, s: 'fatturata', items: [['FIORDILATTE', 10, 22], ['SORBETTO LIMONE', 5, 20]] },
      { c: 2, back: 6, s: 'consegnata', items: [['PISTACCHIO', 5, 30], ['BACIO', 5, 26], ['CAFFÈ', 4, 22]] },
      { c: 1, back: 0, s: 'consegnata', items: [['FIORDILATTE', 8, 22], ['SORBETTO FRAGOLA', 6, 20]] },
    ],
    eventi: [
      { cliente: 'Famiglia Ferrero', back: 5, acconto: 30, note: 'Compleanno 18 anni — torta gelato', items: [['Torta gelato pistacchio (10 pers)', 1, 55], ['Coppette assortite', 30, 2.5]] },
      { cliente: 'Pro Loco Moncalieri', back: 9, acconto: 50, note: 'Sagra — fornitura vaschette', items: [['Vaschette 5kg assortite', 12, 24], ['Coni cialda', 300, 0.25]] },
      { cliente: 'Maria (privato)', back: 2, acconto: 20, note: 'Festa bimbi — semifreddo', items: [['Semifreddo amarena', 2, 28], ['Coppette', 25, 2.5]] },
    ],
  },
}

const TIPO = (process.env.DEMO_TIPO || 'pasticceria').toLowerCase()
const CFG = DEMO[TIPO] || DEMO.pasticceria
const INGREDIENTI = CFG.ing
const RICETTE = CFG.ric

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
    user_metadata: { nome_completo: 'Demo', nome_attivita: CFG.nome_attivita, tipo_attivita: TIPO, citta: 'Torino' },
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
  approvato: true, attivo: true, tipo: TIPO,
  nome: CFG.nome_attivita,
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

// ─── 6. Fornitori, personale+turni, clienti/vendite B2B, eventi ──────────────
// Idempotente: cancella i dati demo precedenti e reinserisce.
{
  // Fornitori
  await sb.from('fornitori').delete().eq('organization_id', orgId)
  await sb.from('fornitori').insert([
    { organization_id: orgId, nome: 'Molino Verga', contatto: 'Andrea Verga', email: 'ordini@molinoverga.it', telefono: '011 4567890', note: 'Farine e semole · consegna lun/gio' },
    { organization_id: orgId, nome: 'Centrale del Latte di Torino', contatto: 'Ufficio ordini', email: 'b2b@centralelatte.it', telefono: '011 2233445', note: 'Latte, panna, burro' },
    { organization_id: orgId, nome: 'Agricola Dolce', contatto: 'Maria Sala', email: 'maria@agricoladolce.it', telefono: '0125 998877', note: 'Uova bio e frutta di stagione' },
    { organization_id: orgId, nome: 'Domori Cioccolato', contatto: 'Vendite', email: 'vendite@domori.com', telefono: '011 7654321', note: 'Cioccolato e cacao' },
  ])

  // Dipendenti + turni (settimana corrente, con una sovrapposizione il sabato)
  await sb.from('turni').delete().eq('organization_id', orgId)
  await sb.from('dipendenti').delete().eq('organization_id', orgId)
  const { data: dips } = await sb.from('dipendenti').insert([
    { organization_id: orgId, nome: 'Giulia Rossi', ruolo: 'Banconista', tipo_contratto: 'Part-time', costo_orario: 9.5, ore_settimana: 24 },
    { organization_id: orgId, nome: 'Marco Bianchi', ruolo: 'Pasticcere', tipo_contratto: 'Full-time', costo_orario: 13, ore_settimana: 40 },
    { organization_id: orgId, nome: 'Sara Conti', ruolo: 'Aiuto pasticcere', tipo_contratto: 'Full-time', costo_orario: 10.5, ore_settimana: 40 },
    { organization_id: orgId, nome: 'Luca Verdi', ruolo: 'Banconista', tipo_contratto: 'Part-time', costo_orario: 9, ore_settimana: 20 },
  ]).select('id, costo_orario')
  const monday = (() => { const d = new Date(); const g = d.getDay(); d.setDate(d.getDate() + (g === 0 ? -6 : 1 - g)); return d })()
  const dISO = off => { const d = new Date(monday); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10) }
  const oreOf = (a, b) => { const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60) }
  const turni = []
  const T = (i, off, ini, fin) => { const o = oreOf(ini, fin); turni.push({ organization_id: orgId, dipendente_id: dips[i].id, data: dISO(off), ora_inizio: ini, ora_fine: fin, ore: r2(o), costo: r2(o * dips[i].costo_orario) }) }
  for (let g = 0; g < 5; g++) { T(1, g, '05:00', '13:00'); T(2, g, '06:00', '14:00'); T(0, g, '07:00', '13:00'); if (g === 4) T(3, g, '12:00', '19:00') }
  T(0, 5, '07:00', '14:00'); T(3, 5, '13:00', '19:30'); T(1, 5, '05:00', '11:00') // sabato: sovrapposizione
  await sb.from('turni').insert(turni)

  // Clienti + vendite B2B (prezzi all'ingrosso, prodotti del ricettario)
  await sb.from('vendite_b2b').delete().eq('organization_id', orgId)
  await sb.from('clienti_b2b').delete().eq('organization_id', orgId)
  const { data: cl } = await sb.from('clienti_b2b').insert([
    { organization_id: orgId, nome: 'Bar Centrale Torino', partita_iva: '11223344556', codice_destinatario: 'M5UXCR1', citta: 'Torino', referente: 'Paolo', telefono: '011 5550101' },
    { organization_id: orgId, nome: 'Caffè San Carlo', partita_iva: '99887766554', codice_destinatario: '0000000', citta: 'Torino', referente: 'Elena', telefono: '011 5550202' },
    { organization_id: orgId, nome: 'Ristorante Da Mario', partita_iva: '55667788990', citta: 'Moncalieri', referente: 'Mario', telefono: '011 5550303' },
  ]).select('id')
  const r2tot = items => r2(items.reduce((s, [, q, pr]) => s + q * pr, 0))
  await sb.from('vendite_b2b').insert(CFG.b2b.map(v => ({
    organization_id: orgId, sede_id: sedeId, cliente_id: cl[v.c].id,
    data: dayISO(v.back), stato: v.s, stock_scaricato: false,
    righe: v.items.map(([p, q, pr]) => ({ prodotto: p, qta: q, prezzo: pr, totale: r2(q * pr) })),
    totale: r2tot(v.items),
  })))

  // Eventi (ordini su commessa) — per-sede
  await setData(orgId, sedeId, 'pasticceria-eventi-v1', CFG.eventi.map((e, n) => ({
    id: `seed-ev-${n + 1}`, cliente: e.cliente, data: dayISO(-e.back), acconto: e.acconto, note: e.note,
    righe: e.items.map((x, i) => ({ id: `r${i}`, nome: x[0], qty: x[1], prezzo: x[2] })),
  })))
  console.log(`✓ Fornitori (4), Personale (4 dip + ${turni.length} turni), Clienti B2B (3) + vendite (${CFG.b2b.length}), Eventi (${CFG.eventi.length})`)
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
