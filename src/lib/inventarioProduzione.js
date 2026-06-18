// Inventario produzione (metodo differenziale per gelaterie/business gusti).
//
// Modello:
//   per ogni (sede, gusto, giorno) il dipendente registra
//     - produzione_g  : quanti grammi di gelato/impasto sono stati prodotti
//     - rimanenza_g   : quanti grammi sono rimasti a fine giornata
//     - scarto_g      : (opzionale) scarto esplicito
//   venduto(N) = riman(N-1) + prod(N) - riman(N) - scarto(N)
//
// La cassa diventa SOLO un check incrociato (kg venduti × €/kg medio dei
// formati = ricavo atteso). Vedi supabase/migrations/20260626_inventario_produzione.sql.

import { supabase } from './supabase'

// Normalizzazione del nome gusto: lo riportiamo SEMPRE in UPPER+trim come in
// stock_prodotti_finiti, cosi indipendente da come l'utente l'ha digitato in
// ricettario. Single source of truth.
export function normGusto(s) {
  return (s || '').toString().toUpperCase().trim()
}

// Estrae l'elenco dei gusti dal ricettario E dalle righe gia' presenti in
// inventario (DB). L'unione e' importante perche':
//   - gusti nel ricettario ma senza dati DB -> riga vuota (utente compila)
//   - gusti in DB ma non nel ricettario -> riga visibile col dato (orfani:
//     scenario tipico dopo import file del cliente con gusti non ancora
//     formalizzati nel ricettario)
//
// Decisione UX (giu 2026): il proprietario sceglie il metodo di produzione
// UNA volta nelle impostazioni; in modalita' inventario, TUTTE le ricette
// tipo fetta/pezzo sono trattate come gusti. I semilavorati/interni restano
// fuori perche' sono basi di lavorazione.
//
// Esclusione esplicita possibile via flag `is_gusto === false` sulla ricetta.
//
// `righeInventario` (opzionale) = array di righe da inventario_produzione
// per la sede corrente, usato per scoprire gusti orfani (in DB ma non nel
// ricettario).
//
// Ritorna: [{ nome, ricetta: ricetta|null, orfano: bool }]
//   - orfano=true significa "in DB ma non nel ricettario": il proprietario
//     dovrebbe aggiungere la ricetta per gestire food cost / allergeni.
export function elencoGusti(ricettario, righeInventario) {
  const ricette = ricettario?.ricette || {}
  const dalRic = Object.values(ricette)
    .filter(r => {
      const tipo = (r.tipo || 'fetta').toString()
      if (tipo === 'semilavorato' || tipo === 'interno') return false
      if (r.is_gusto === false) return false
      return true
    })
    .map(r => ({ nome: r.nome, ricetta: r, orfano: false }))

  // Gusti orfani: presenti in righe inventario ma non nel ricettario.
  if (Array.isArray(righeInventario) && righeInventario.length > 0) {
    const nomiRic = new Set(dalRic.map(g => normGusto(g.nome)))
    const orfaniSet = new Set()
    for (const r of righeInventario) {
      const k = normGusto(r.gusto_nome)
      if (k && !nomiRic.has(k)) orfaniSet.add(k)
    }
    for (const k of orfaniSet) {
      dalRic.push({ nome: k, ricetta: null, orfano: true })
    }
  }
  return dalRic
}

// Variante che fa l'unione di ricettario + righe note + un elenco esterno di
// nomi (es. quelli appena parsati da un file in import). Utile per il dialog
// import che vuole vedere "tutti i nomi che riceverà l'org" prima del save.
export function elencoGustiConExtra(ricettario, righeInventario, nomiExtra) {
  const base = elencoGusti(ricettario, righeInventario)
  if (!Array.isArray(nomiExtra) || nomiExtra.length === 0) return base
  const giaVisti = new Set(base.map(g => normGusto(g.nome)))
  for (const n of nomiExtra) {
    const k = normGusto(n)
    if (k && !giaVisti.has(k)) {
      base.push({ nome: k, ricetta: null, orfano: true })
      giaVisti.add(k)
    }
  }
  return base
}

// ── CRUD inventario_produzione ────────────────────────────────────────────

export async function caricaSettimana(orgId, sedeId, lunediIso) {
  if (!orgId || !sedeId || !lunediIso) return []
  const da = new Date(lunediIso); da.setHours(0, 0, 0, 0)
  const a = new Date(da); a.setDate(a.getDate() + 7)
  // Includiamo anche il giorno prima del lunedi: serve come "riman(N-1)" per
  // calcolare il venduto del lunedi stesso.
  const inizio = new Date(da); inizio.setDate(inizio.getDate() - 1)
  const inizioIso = inizio.toISOString().slice(0, 10)
  const fineIso = a.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('inventario_produzione')
    .select('id, gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g, note, updated_at')
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .gte('data', inizioIso)
    .lt('data', fineIso)
    .order('data')
  if (error) { console.error('caricaSettimana:', error); return [] }
  return data || []
}

// Upsert di una singola cella (gusto × giorno). Patch-only: i campi NON
// specificati nel patch preservano il valore esistente sulla cella. Questo
// evita che un import di sprechi azzeri silenziosamente uno `spedito_g`
// precedentemente registrato per la stessa cella.
export async function salvaCella(orgId, sedeId, gustoNome, dataIso, patch) {
  const num = (v) => Math.max(0, Math.round(Number(v) || 0))
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k)
  const row = {
    organization_id: orgId,
    sede_id: sedeId,
    gusto_nome: normGusto(gustoNome),
    data: dataIso,
    produzione_g: num(patch.produzione_g),
    rimanenza_g: num(patch.rimanenza_g),
    scarto_g: num(patch.scarto_g),
    spedito_g: has('spedito_g') ? num(patch.spedito_g) : undefined,
    note: patch.note || null,
  }
  // Se spedito_g non è nel patch, lasciamo il DB scegliere (mantenere valore
  // esistente in caso di update). Su INSERT viene popolato dal DEFAULT 0.
  if (row.spedito_g === undefined) delete row.spedito_g
  const { data, error } = await supabase
    .from('inventario_produzione')
    .upsert(row, { onConflict: 'organization_id,sede_id,gusto_nome,data' })
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

// Cancella una cella (utile per "ho sbagliato giorno").
//
// Se la cella ha produzione_g > 0, il magazzino MP era stato scalato in
// proporzione: PRIMA della delete recuperiamo i grammi prodotti e li
// riconsegniamo al magazzino tramite scaloMagazzinoPerGusto con delta
// negativo (= ripristino). Senza questo passaggio gli ingredienti
// resterebbero scalati senza una PROD a giustificarli.
//
// Se `opts.ricettario` non e' passato, salta lo scalo (il caller decide
// quando e' davvero necessario). Ritorna { rimossa, magazzinoAggiornato? }
export async function rimuoviCella(orgId, sedeId, gustoNome, dataIso, opts = {}) {
  // Leggi la cella prima della delete: serve produzione_g per l'inversione.
  const { data: cella } = await supabase
    .from('inventario_produzione')
    .select('produzione_g, gusto_nome')
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .eq('gusto_nome', normGusto(gustoNome))
    .eq('data', dataIso)
    .maybeSingle()
  const { error } = await supabase
    .from('inventario_produzione')
    .delete()
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .eq('gusto_nome', normGusto(gustoNome))
    .eq('data', dataIso)
  if (error) throw error
  // Inversione magazzino se richiesta.
  if (opts.ricettario && opts.magazzino && opts.setMagazzino && cella?.produzione_g > 0) {
    const ric = ricettaDelGusto(opts.ricettario, gustoNome)
    if (ric) {
      const { nuovoMagazzino } = scaloMagazzinoPerGusto(opts.magazzino, ric, -cella.produzione_g)
      try {
        const { ssave } = await import('./storage')
        const { SK_MAG } = await import('./storageKeys')
        await ssave(SK_MAG, nuovoMagazzino, orgId, sedeId)
        opts.setMagazzino(nuovoMagazzino)
      } catch (e) { console.warn('rimuoviCella: scalo MP inverso fallito', e) }
    }
  }
  return { rimossa: true }
}

// ── Calcolo venduto per ogni (gusto × giorno) di una settimana ────────────
// Lavora interamente in-memory dai dati gia caricati: niente round-trip extra.
//
// righe = output di caricaSettimana(...), che include il giorno PRIMA del
// lunedi target.
//
// Ritorna { [gusto_nome]: { [dataIso]: { prod, riman, scarto, venduto } } }.
export function calcolaVendutoSettimana(righe, lunediIso) {
  if (!Array.isArray(righe)) return {}
  // Indicizziamo per gusto+data per O(1) lookup del giorno precedente.
  const byKey = {}
  for (const r of righe) {
    const k = `${r.gusto_nome}|${r.data}`
    byKey[k] = r
  }
  const gusti = [...new Set(righe.map(r => r.gusto_nome))]
  const out = {}
  for (const g of gusti) {
    out[g] = {}
    // I 7 giorni della settimana target (lunedi inclus, domenica inclus).
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunediIso)
      d.setDate(d.getDate() + i)
      const dIso = d.toISOString().slice(0, 10)
      const corrente = byKey[`${g}|${dIso}`]
      if (!corrente) {
        out[g][dIso] = { prod: 0, riman: 0, scarto: 0, venduto: null }
        continue
      }
      const dPrev = new Date(d); dPrev.setDate(dPrev.getDate() - 1)
      const prev = byKey[`${g}|${dPrev.toISOString().slice(0, 10)}`]
      const rimanPrev = prev ? (prev.rimanenza_g || 0) : 0
      const prod = corrente.produzione_g || 0
      const riman = corrente.rimanenza_g || 0
      const scarto = corrente.scarto_g || 0
      // M2: il venduto deve essere clampato a 0 lato UI per i KPI, ma
      // l'eventuale valore NEGATIVO (es. dipendente ha scritto RIMAN > stock
      // disponibile) indica un errore di input. Esponiamo entrambi: venduto
      // (clampato per consumo aggregato) + vendutoRaw (signed per UI che
      // vuole segnalare l'anomalia con icona warning).
      const vRaw = rimanPrev + prod - riman - scarto
      out[g][dIso] = {
        prod, riman, scarto,
        venduto: Math.max(0, vRaw),
        vendutoRaw: vRaw,
      }
    }
  }
  return out
}

// Totali settimana per gusto: somma del venduto sui 7 giorni.
export function totaliVenduti(matrice) {
  const out = {}
  for (const [gusto, byData] of Object.entries(matrice || {})) {
    let tot = 0
    for (const cell of Object.values(byData)) {
      tot += Number(cell.venduto || 0)
    }
    out[gusto] = tot
  }
  return out
}

// ── Integrazione magazzino MP ─────────────────────────────────────────────
// Quando un dipendente registra "PROD = X grammi" per un gusto, scaliamo dal
// magazzino la quota proporzionale di ingredienti. Il fattore di scalo e':
//   fattore = delta_g / peso_impasto_per_stampo
// dove peso_impasto_per_stampo = sum(ingredienti.qty1stampo) della ricetta
// del gusto. delta puo' essere negativo (correzione al ribasso): in quel
// caso il magazzino sale (l'utente sta dicendo "ho usato meno di quanto
// avevo scritto").
//
// La funzione e' PURA: prende il magazzino in input e ritorna il magazzino
// nuovo. Il caller decide se ssave-arlo. Niente side-effect qui.
//
// Ritorna { nuovoMagazzino, ingredientiScalati: [{nome, deltaG}] } per UI.
import { normIng } from './foodcost'

export function scaloMagazzinoPerGusto(magazzino, ricetta, deltaProdG) {
  if (!ricetta || !Number.isFinite(deltaProdG) || deltaProdG === 0) {
    return { nuovoMagazzino: magazzino, ingredientiScalati: [] }
  }
  const ingredienti = ricetta.ingredienti || []
  const pesoImpasto = ingredienti.reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
  if (pesoImpasto <= 0) {
    return { nuovoMagazzino: magazzino, ingredientiScalati: [] }
  }
  const fattore = deltaProdG / pesoImpasto
  const nm = { ...(magazzino || {}) }
  const log = []
  for (const ing of ingredienti) {
    const qty = Number(ing.qty1stampo) || 0
    if (qty <= 0 || !ing.nome) continue
    const deltaIng = qty * fattore
    const k = normIng(ing.nome)
    const corrente = nm[k] || { nome: ing.nome.trim(), giacenza_g: 0, soglia_g: 0, ultimoRifornimento: null }
    // M1 fix: ammettiamo giacenza negativa internamente. Era clampata a 0
    // ma cosi' un PROD eccessivo seguito da correzione al ribasso non
    // ricostruiva il deficit logico (es. zucchero -200g nascosti diventavano
    // poi +800 invece di +1000 al rollback). Ora il vero stato del magazzino
    // resta tracciabile; eventuale clamp UI si fa lato visualizzazione, non
    // qui (dove i numeri devono restare coerenti).
    nm[k] = {
      ...corrente,
      giacenza_g: Math.round((corrente.giacenza_g || 0) - deltaIng),
    }
    log.push({ nome: ing.nome, deltaG: Math.round(deltaIng) })
  }
  return { nuovoMagazzino: nm, ingredientiScalati: log }
}

// Trova la ricetta corrispondente a un gusto (per nome normalizzato).
export function ricettaDelGusto(ricettario, gustoNomeUpper) {
  if (!ricettario?.ricette) return null
  const target = normGusto(gustoNomeUpper)
  // Match esatto su chiave UPPER prima, poi su .nome (per compat legacy).
  return ricettario.ricette[target]
    || Object.values(ricettario.ricette).find(r => normGusto(r.nome) === target)
    || null
}

// ── ANALISI QUADRATURA ────────────────────────────────────────────────────
// Calcoli di alto livello per la vista "Quadratura inventario vs cassa".
// Tutto in-memory dai dati gia' caricati.
//
// Euro/kg medio = stima del prezzo medio al kg dei formati di vendita.
// Da formati con baseQtaG (grammi) + prezzoDefault (euro), calcola
// (prezzo/grammi)*1000 e fa la media semplice. Se non ci sono formati
// utilizzabili, ritorna null e l'UI mostrera' un avviso "configura formati".
export function euroKgMedioFormati(formati) {
  if (!Array.isArray(formati) || formati.length === 0) return null
  const validi = formati
    .map(f => ({ g: Number(f.baseQtaG) || 0, p: Number(f.prezzoDefault) || 0 }))
    .filter(x => x.g > 0 && x.p > 0)
  if (validi.length === 0) return null
  const sumEurKg = validi.reduce((s, x) => s + (x.p / x.g) * 1000, 0)
  return sumEurKg / validi.length
}

// KPI settimana: somma kg venduti, € attesi, drift vs cassa effettiva.
// matrice = output di calcolaVendutoSettimana
// chiusureSettimana = chiusure SK_CHIUS filtrate alla settimana target
// euroKg = euro/kg medio (output di euroKgMedioFormati)
// venditeB2BSett = (opzionale) array di righe vendite_b2b della settimana,
//                  per sottrarre i kg B2B dal venduto retail nel confronto
//                  con la cassa (la cassa retail NON include i ricavi B2B
//                  perche' sono fatturati a parte: senza sottrarre i kg
//                  B2B il drift mostra un negativo cronico falso).
export function kpiQuadraturaSettimana(matrice, chiusureSettimana, euroKg, venditeB2BSett) {
  const totVendutoG = Object.values(matrice || {}).reduce((s, byData) =>
    s + Object.values(byData).reduce((a, c) => a + Number(c.venduto || 0), 0)
  , 0)
  const totVendutoKg = totVendutoG / 1000

  // kg venduti via B2B nella settimana (somma qta dalle righe[].qta in kg)
  const b2bKg = (Array.isArray(venditeB2BSett) ? venditeB2BSett : [])
    .reduce((s, v) => s + (Array.isArray(v.righe) ? v.righe : [])
      .reduce((a, r) => a + (Number(r.qta) || 0), 0), 0)
  const retailKg = Math.max(0, totVendutoKg - b2bKg)
  // Ricavi B2B (totale fatturato vendite_b2b): informativo, separato.
  const ricaviB2b = (Array.isArray(venditeB2BSett) ? venditeB2BSett : [])
    .reduce((s, v) => s + (Number(v.totale) || 0), 0)

  const cassaEffettiva = (Array.isArray(chiusureSettimana) ? chiusureSettimana : [])
    .reduce((s, c) => s + Number(c?.kpi?.totV || c?.totale || 0), 0)

  // Confronto SOLO retail (la cassa retail non incassa i B2B):
  //   kg retail × €/kg medio formati = ricavo atteso da cassa.
  const ricavoAtteso = (euroKg != null) ? retailKg * euroKg : null
  const driftEur = (ricavoAtteso != null) ? cassaEffettiva - ricavoAtteso : null
  const driftPct = (ricavoAtteso != null && ricavoAtteso > 0)
    ? (driftEur / ricavoAtteso) * 100
    : null

  return {
    totVendutoG, totVendutoKg, retailKg, b2bKg, ricaviB2b,
    cassaEffettiva, euroKg, ricavoAtteso, driftEur, driftPct,
  }
}

// Classifica gusti per kg venduti nella settimana: top N + sofferenza.
// "Sofferenza" = gusti con residuo medio alto rispetto alla produzione.
// Soglia base: ratio residuo/produzione >= 0.5 (cioe' sopra il 50% non
// venduto). E' una euristica MVP: il proprietario poi decide.
export function classificaGusti(matrice, opts = {}) {
  const topN = opts.topN || 5
  const sofferenzaRatio = opts.sofferenzaRatio || 0.5

  const agg = Object.entries(matrice || {}).map(([gusto, byData]) => {
    let venduto = 0, prod = 0, residuoMedio = 0, ngiorni = 0
    for (const cell of Object.values(byData)) {
      venduto += Number(cell.venduto || 0)
      prod += Number(cell.prod || 0)
      residuoMedio += Number(cell.riman || 0)
      ngiorni++
    }
    residuoMedio = ngiorni > 0 ? residuoMedio / ngiorni : 0
    const ratio = prod > 0 ? (residuoMedio / prod) : 0
    return { gusto, vendutoG: venduto, prodG: prod, residuoMedioG: residuoMedio, ratio }
  })

  const top = [...agg]
    .filter(x => x.vendutoG > 0)
    .sort((a, b) => b.vendutoG - a.vendutoG)
    .slice(0, topN)

  const sofferenza = agg
    .filter(x => x.prodG > 0 && x.ratio >= sofferenzaRatio)
    .sort((a, b) => b.ratio - a.ratio)

  // Zero-venduto: gusti senza vendite in tutta la settimana. Candidati alla
  // rimozione dal catalogo o all'analisi commerciale.
  const zeroVenduto = agg.filter(x => x.vendutoG === 0 && x.prodG > 0)

  return { top, sofferenza, zeroVenduto, totale: agg }
}

// Tendenza % rispetto a un valore precedente. Ritorna null se prev <= 0.
export function variazione(curr, prev) {
  const c = Number(curr) || 0
  const p = Number(prev) || 0
  if (p <= 0) return null
  return ((c - p) / p) * 100
}

// ── ADAPTER: inventario_produzione → sessioni "giornaliero" (SK_GIOR) ──────
//
// Le viste legacy (PLView, StoricoProduzioneView, DashboardHomeView,
// ConfrontoSedi, SimulatorePrezzi) leggono le produzioni da SK_GIOR: array
// di sessioni `{data, prodotti: [{nome, stampi, vendibile}]}`. Per le sedi
// in "metodo inventario" SK_GIOR e' vuoto: i dati sono in inventario_produzione.
//
// Questa funzione proietta le righe inventario in forma di sessioni-stampi:
// per ogni (gusto, giorno) crea una sessione con prodotto = nome gusto e
// stampi = kg prodotti (1 stampo virtuale = 1 kg). Le view esistenti vedono
// "quanto prodotto in kg" come "stampi", e tutti i KPI sono significativi.
export function inventarioASessioni(righeInventario) {
  if (!Array.isArray(righeInventario) || righeInventario.length === 0) return []
  const perGusto = {}
  for (const r of righeInventario) {
    const k = r.gusto_nome
    if (!perGusto[k]) perGusto[k] = []
    perGusto[k].push(r)
  }
  const byData = {}
  for (const [gusto, righe] of Object.entries(perGusto)) {
    righe.sort((a, b) => a.data.localeCompare(b.data))
    let rimanPrev = 0
    let prevDayMs = null
    for (const r of righe) {
      const prod = Number(r.produzione_g) || 0
      const riman = Number(r.rimanenza_g) || 0
      const scarto = Number(r.scarto_g) || 0
      const spedito = Number(r.spedito_g) || 0
      const dMs = new Date(r.data).getTime()
      if (prevDayMs !== null && Math.round((dMs - prevDayMs) / 86400000) !== 1) rimanPrev = 0
      // venduto = riman_prev + prod − riman − scarto − spedito (sede origine)
      const venduto = Math.max(0, rimanPrev + prod - riman - scarto - spedito)
      const vendutoKg = venduto / 1000
      const prodKg = prod / 1000
      if (prodKg > 0 || vendutoKg > 0) {
        if (!byData[r.data]) byData[r.data] = []
        byData[r.data].push({
          nome: gusto,
          stampi: Math.round(prodKg * 1000) / 1000,
          vendibile: Math.round(vendutoKg * 1000) / 1000,
          _da_inventario: true,
        })
      }
      rimanPrev = riman
      prevDayMs = dMs
    }
  }
  return Object.entries(byData)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, prodotti]) => ({
      data, id: `inv-${data}`, ts: data + 'T12:00:00.000Z',
      prodotti, _da_inventario: true,
    }))
}

export async function caricaSessioniDaInventario(orgId, sedeId, opts = {}) {
  if (!orgId || !sedeId) return []
  const { supabase } = await import('./supabase')
  const monthsBack = opts.monthsBack || 12
  const inizio = new Date()
  inizio.setMonth(inizio.getMonth() - monthsBack)
  inizio.setDate(1)
  const inizioIso = inizio.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('inventario_produzione')
    .select('gusto_nome, data, produzione_g, rimanenza_g, scarto_g')
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .gte('data', inizioIso)
    .order('data')
  if (error) { console.error('caricaSessioniDaInventario:', error); return [] }
  return inventarioASessioni(data || [])
}

// ── Helper date: lunedi della settimana che contiene `dateIso` ────────────
export function lunediDellaSettimana(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date()
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=dom, 1=lun, ... 6=sab. Vogliamo arretrare al lunedi.
  const dow = d.getDay()
  const arretra = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - arretra)
  return d.toISOString().slice(0, 10)
}
