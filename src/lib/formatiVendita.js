// Formati di vendita - risolve il problema dello scontrino "generico".
//
// Molti sistemi di cassa battono righe SENZA il dettaglio del gusto/ripieno:
//   "Cono piccolo  2,60"     (gelateria - non dice quale gusto)
//   "Vaschetta 500g  12,00"  (gelateria - gusti misti)
//   "Panino  5,50"           (panineria - non dice quale farcitura)
// Queste righe non corrispondono a nessuna ricetta per nome, quindi venivano
// scartate dal confronto: ricavi mancanti e cassa/produzione che non tornano.
//
// Un "formato di vendita" mappa la riga generica a:
//   • una CATEGORIA di ricette (es. "Gelato") → da cui stimiamo il food cost
//     come media del FC/grammo dei gusti di quella categoria;
//   • una quantità di base consumata per unità venduta (baseQtaG, in grammi);
//   • una DISTINTA di componenti consumabili (cono cialda, vaschetta, fazzoletto,
//     coppetta, cucchiaino, …) ognuno con quantità e costo unitario in €.
//
// Così:
//   ricavo  = totale battuto sullo scontrino (esatto)
//   FC      = Σ (componente.qta × componente.costo) + baseQtaG × FC_medio_categoria
//   sell-through = a livello di CATEGORIA (g prodotti vs g venduti), perché
//                  senza il gusto non possiamo riconciliare per singola ricetta.
//
// Retrocompat: i formati legacy con `costoContenitore: N` vengono trattati come
// avessero un singolo componente {nome:'Contenitore', qta:1, costo:N}.

import { calcolaFC, getR, isRicettaValida, normIng } from './foodcost'
import { sload, ssave } from './storage'

export const SK_FORMATI = 'pasticceria-formati-vendita-v1' // shared

// Preset base per gelaterie: 3 formati che coprono il 90% dei casi (cono
// piccolo, coppetta media, vaschetta take-away). Categoria "Gusto" per
// matchare la categoria default delle ricette gelato (vedi NuovaRicettaView
// per gelateria). Prezzi e componenti da media di mercato IT 2026 — l'utente
// li adatta dal pannello Formati vendita.
export const FORMATI_GELATERIA_DEFAULT = [
  {
    nome: 'Cono piccolo', alias: ['piccolo', 'cono'], categoria: 'Gusto',
    baseQtaG: 80, prezzoDefault: 2.50,
    componenti: [
      { nome: 'Cono cialda', qta: 1, costo: 0.06 },
      { nome: 'Fazzoletto', qta: 1, costo: 0.01 },
    ],
  },
  {
    nome: 'Coppetta media', alias: ['media', 'coppetta'], categoria: 'Gusto',
    baseQtaG: 150, prezzoDefault: 3.50,
    componenti: [
      { nome: 'Coppetta', qta: 1, costo: 0.10 },
      { nome: 'Cucchiaino', qta: 1, costo: 0.02 },
    ],
  },
  {
    nome: 'Vaschetta 500g', alias: ['vaschetta', 'asporto', 'da asporto'], categoria: 'Gusto',
    baseQtaG: 500, prezzoDefault: 10.00,
    componenti: [
      { nome: 'Vaschetta 500g', qta: 1, costo: 0.30 },
      { nome: 'Coperchio', qta: 1, costo: 0.10 },
    ],
  },
]

// Seed idempotente dei formati default per una gelateria. Chiamalo quando
// l'utente sceglie metodo='inventario' (onboarding o cambio da Impostazioni):
// se l'org non ha ANCORA nessun formato vendita, ne crea 3 sensati così i
// gusti nascono con un ricavo stimato invece del vuoto "Configura formati".
// Se l'utente ne ha già almeno uno, non tocca nulla (l'utente ha già
// personalizzato la sua lista).
export async function seedFormatiGelateriaSeMancano(orgId) {
  if (!orgId) return { seeded: 0, giaPresenti: 0 }
  const attuali = await sload(SK_FORMATI, orgId, null)
  const arr = Array.isArray(attuali) ? attuali : []
  if (arr.length > 0) return { seeded: 0, giaPresenti: arr.length }
  const now = Date.now()
  const nuovi = FORMATI_GELATERIA_DEFAULT.map((f, i) => ({
    id: `fmt-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    ...f,
  }))
  await ssave(SK_FORMATI, nuovi, orgId, null)
  return { seeded: nuovi.length, giaPresenti: 0 }
}

// Normalizza un nome per il matching (uppercase, solo alfanumerico).
function nrm(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Crea un formato vuoto con valori di default sensati.
export function nuovoFormato() {
  return {
    id: `fmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nome: '',
    alias: [],
    categoria: '',
    baseQtaG: 0,
    componenti: [], // [{nome:'Cono cialda', qta:1, costo:0.06}, ...]
    prezzoDefault: 0,
  }
}

// Restituisce i componenti del formato in forma normalizzata. Se il formato e'
// in formato legacy (solo costoContenitore), lo trasforma in un singolo componente
// "Contenitore" - così il resto del codice puo' lavorare solo con componenti[].
export function componentiNormalizzati(formato) {
  if (Array.isArray(formato?.componenti) && formato.componenti.length > 0) {
    return formato.componenti.map(c => ({
      nome: String(c?.nome || ''),
      qta: Number(c?.qta) || 0,
      costo: Number(c?.costo) || 0,
    }))
  }
  const legacy = Number(formato?.costoContenitore) || 0
  if (legacy > 0) {
    return [{ nome: 'Contenitore', qta: 1, costo: legacy }]
  }
  return []
}

// Costo totale dei materiali consumabili per UNA unita' venduta del formato.
export function costoComponentiUnita(formato) {
  return componentiNormalizzati(formato)
    .reduce((s, c) => s + c.qta * c.costo, 0)
}

// Trova il formato che corrisponde al nome battuto sullo scontrino.
// Match su nome + alias, in entrambe le direzioni (substring) dopo normalizzazione.
export function matchFormato(nomeScontrino, formati) {
  const t = nrm(nomeScontrino)
  if (!t || !Array.isArray(formati)) return null
  let best = null
  for (const f of formati) {
    const candidati = [f.nome, ...(f.alias || [])].map(nrm).filter(Boolean)
    for (const c of candidati) {
      // Audit 2026-07-01 HIGH: minimum-length gate. Un formato "g" o "ml"
      // (1-2 char) faceva match per substring su tutti gli scontrini → bias
      // catastrofico. Esatto match sempre OK; substring richiede len >= 3.
      const isExactMatch = c === t
      const isLongEnoughSubstring = c.length >= 3 && t.length >= 3 &&
        (t.includes(c) || c.includes(t))
      if (isExactMatch || isLongEnoughSubstring) {
        // Preferisci il match più lungo (più specifico) in caso di più candidati.
        if (!best || c.length > best._len) best = { ...f, _len: c.length }
      }
    }
  }
  return best
}

// Peso (g) di uno stampo di una ricetta = somma delle quantità ingredienti.
function pesoStampo(ric) {
  return (ric?.ingredienti || []).reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
}

// Ricette appartenenti a una categoria (escludendo semilavorati/interni).
function ricetteDiCategoria(categoria, ricettario) {
  const cat = String(categoria || '').trim().toLowerCase()
  if (!cat) return []
  return Object.values(ricettario?.ricette || {}).filter(r => {
    if (!isRicettaValida(r.nome)) return false
    const tipo = getR(r.nome, r).tipo
    if (tipo === 'semilavorato' || tipo === 'interno') return false
    return String(r.categoria || '').trim().toLowerCase() === cat
  })
}

// FC medio (€/grammo) dei gusti di una categoria. null se non calcolabile.
export function avgFCperGCategoria(categoria, ricettario, ingCosti) {
  const ricette = ricetteDiCategoria(categoria, ricettario)
  const valori = []
  for (const r of ricette) {
    const peso = pesoStampo(r)
    if (peso <= 0) continue
    const { tot: fc } = calcolaFC(r, ingCosti, ricettario)
    if (Number.isFinite(fc) && fc > 0) valori.push(fc / peso)
  }
  if (valori.length === 0) return null
  return valori.reduce((s, v) => s + v, 0) / valori.length
}

// Prezzo medio di VENDITA (€/kg) dei gusti di una categoria, ricavato dai
// Formati vendita. Serve per stimare il margine dei gusti (gelateria/yogurt)
// che hanno prezzo=0 sulla ricetta perché il prezzo vive sui formati
// (cono/coppetta/vaschetta) e non sulla singola ricetta.
//
// Calcolo: media semplice di (prezzoDefault / baseQtaG) × 1000 sui formati
// validi (baseQtaG > 0, prezzo > 0). Priorita' di ricerca:
//   1. formati con la categoria esatta (es. "Crema")
//   2. formati con categoria "gusto" o "gelato" (generici per gelateria)
//   3. TUTTI i formati validi (ultimo fallback)
// Così un'org mista pasticceria + gelateria non usa formati "Torta 8 fette"
// per stimare un gusto in categoria "Sorbetto" — cade prima sul generico.
// Ritorna null se non c'è alcun formato utile.
export function avgPrezzoPerKgCategoria(categoria, formati) {
  if (!Array.isArray(formati)) return null
  const validi = formati.filter(f =>
    Number(f?.baseQtaG) > 0 && Number(f?.prezzoDefault) > 0
  )
  if (validi.length === 0) return null
  const cat = String(categoria || '').trim().toLowerCase()
  const perCategoria = cat
    ? validi.filter(f => String(f?.categoria || '').trim().toLowerCase() === cat)
    : []
  const genericGelato = perCategoria.length === 0
    ? validi.filter(f => {
        const c = String(f?.categoria || '').trim().toLowerCase()
        return c === 'gusto' || c === 'gelato' || c === 'gelati' || c === 'yogurt'
      })
    : []
  const src = perCategoria.length > 0 ? perCategoria
            : genericGelato.length > 0 ? genericGelato
            : validi
  const valori = src.map(f => (Number(f.prezzoDefault) / Number(f.baseQtaG)) * 1000)
  return valori.reduce((s, v) => s + v, 0) / valori.length
}

// FC stimato (€) di UNA unità venduta di un formato.
// = Σ (componente.qta × componente.costo) + baseQtaG × FC_medio_categoria
export function fcStimatoFormato(formato, avgFCperG) {
  const componenti = costoComponentiUnita(formato)
  const baseG = Number(formato.baseQtaG) || 0
  const perG = Number(avgFCperG) || 0
  return componenti + baseG * perG
}

/**
 * Riconcilia le righe generiche dello scontrino tramite i formati di vendita.
 *
 * @param {Array}  venduto      righe scontrino [{nome, qta, totale, prezzoUnitario}]
 * @param {Array}  formati      configurazione formati
 * @param {Object} sessione     produzione del giorno { prodotti: [{nome, stampi}] }
 * @param {Object} ricettario
 * @param {Object} ingCosti
 * @param {Set}    giaMatchate  nomi scontrino già abbinati a una ricetta (da escludere)
 * @returns {{ righe, categorie, nomiMatchati: Set }}
 *   righe:     [{ formatoId, nome, categoria, unitaV, rv, fcV, marg }]
 *   categorie: [{ categoria, gProdotti, gVenduti, st }]
 */
export function riconciliaFormati(venduto, formati, sessione, ricettario, ingCosti, giaMatchate = new Set()) {
  const righe = []
  const nomiMatchati = new Set()
  if (!Array.isArray(venduto) || !Array.isArray(formati) || formati.length === 0) {
    return { righe, categorie: [], nomiMatchati }
  }

  // Cache del FC medio per categoria (evita ricalcoli).
  const avgCache = {}
  const avgFor = (cat) => {
    if (!(cat in avgCache)) avgCache[cat] = avgFCperGCategoria(cat, ricettario, ingCosti)
    return avgCache[cat]
  }

  for (const v of venduto) {
    if (giaMatchate.has(v.nome)) continue
    const f = matchFormato(v.nome, formati)
    if (!f) continue
    const unitaV = Number(v.qta) || 0
    const rv = Number(v.totale) || (Number(v.prezzoUnitario) || 0) * unitaV
    const avg = avgFor(f.categoria)
    const fcUnit = fcStimatoFormato(f, avg || 0)
    const fcV = fcUnit * unitaV
    righe.push({
      formatoId: f.id, nome: f.nome, categoria: f.categoria,
      unitaV, rv, fcV, marg: rv - fcV,
      fcStimato: avg != null, // false = nessun gusto in categoria → FC solo contenitore
    })
    nomiMatchati.add(v.nome)
  }

  // Riconciliazione a livello di categoria: grammi prodotti vs grammi venduti.
  // Chiave normalizzata (trim+lowercase) per evitare che "Gelato" (formato) e
  // "gelato" (ricetta) finiscano in bucket diversi → grammi prodotti persi e
  // sell-through falsata. Il label originale resta in `categoria` per la UI.
  const byCat = {}
  const catKey = c => String(c || '').trim().toLowerCase()
  for (const r of righe) {
    const k = catKey(r.categoria)
    byCat[k] = byCat[k] || { categoria: r.categoria, gProdotti: 0, gVenduti: 0 }
  }
  // grammi venduti = Σ unitaV × baseQtaG dei formati (per categoria)
  // Audit 2026-07-01 LOW: skip formati con baseQtaG <= 0 (es. "ricarica tessera"
  // o servizio non pesato): non contribuiscono a gVenduti e non vanno contati.
  for (const r of righe) {
    const f = formati.find(x => x.id === r.formatoId)
    const base = Number(f?.baseQtaG) || 0
    if (base <= 0) continue
    byCat[catKey(r.categoria)].gVenduti += r.unitaV * base
  }
  // grammi prodotti = Σ stampi × peso stampo delle ricette di quella categoria
  for (const p of (sessione?.prodotti || [])) {
    const ric = ricettario?.ricette?.[(p.nome || '').toUpperCase().trim()] || ricettario?.ricette?.[p.nome]
    if (!ric) continue
    const k = catKey(ric.categoria)
    if (!k || !byCat[k]) continue
    byCat[k].gProdotti += (Number(p.stampi) || 0) * pesoStampo(ric)
  }
  const categorie = Object.values(byCat).map(c => ({
    ...c,
    st: c.gProdotti > 0 ? (c.gVenduti / c.gProdotti) * 100 : null,
  }))

  return { righe, categorie, nomiMatchati }
}
