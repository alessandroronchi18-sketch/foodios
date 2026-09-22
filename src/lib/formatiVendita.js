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

import { calcolaFC, getR, isRicettaValida, normIng, resaGrammi } from './foodcost'
import { prezzoMedioAlKg } from './prezzoMedioAlKg'
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
//
// Con `materiali` (l'elenco dei materiali di confezionamento, già risolto da
// `materialiRisolti`) il costo arriva da lì invece che dal numero congelato
// dentro il formato. Senza, si comporta esattamente come prima.
export function componentiNormalizzati(formato, materiali = null) {
  return componentiConOrigine(formato, materiali)
    .map(c => ({ nome: c.nome, qta: c.qta, costo: c.costo }))
}

// Costo totale dei materiali consumabili per UNA unita' venduta del formato.
export function costoComponentiUnita(formato, materiali = null) {
  return componentiConOrigine(formato, materiali)
    .reduce((s, c) => s + c.qta * c.costo, 0)
}

// ── Il prezzo di un materiale: dove sta il numero vero ──────────────────
//
// Il 18/09/2026 è nato l'elenco dei materiali di confezionamento, con questa
// promessa scritta a schermo: «il prezzo si corregge in un posto solo».
//
// Non era così. Il costo veniva **copiato** dentro il formato nel momento in
// cui sceglievi il materiale, e da lì restava fermo: correggere la cialda
// nell'elenco non correggeva nessuno dei formati già composti. Correggeva
// solo quelli composti dopo.
//
// Sui dati veri del design partner, 22/09/2026: tutti e 8 i formati portano
// cialda, fazzoletto, cucchiaino a 0,001 € e coppetta a 0,002 € — numeri di
// prova rimasti lì, fuori di circa trenta volte (il riferimento vero, scritto
// nel prodotto stesso, è cialda 0,06 € e fazzoletto 0,01 €). Un Cono Grande
// venduto 5,50 € risulta avere due millesimi di euro di materiali.
//
// Da qui in poi il numero sta in **un posto solo**, e il formato lo legge:
//
//   1. il materiale è legato a una materia prima e si sa quanto pesa un
//      pezzo → il prezzo lo fa la bolla, e non si riscrive mai più;
//   2. il materiale ha un prezzo scritto a mano nell'elenco → vale quello;
//   3. il materiale non è nell'elenco → resta il numero vecchio congelato
//      dentro il formato, **e si dice** che è vecchio.
//
// Il numero congelato non si butta: è l'unica cosa che qualcuno aveva
// scritto, e cancellarlo farebbe scendere il costo a zero. Zero non è «non lo
// so», ed è l'errore di famiglia di questo prodotto.

/** La chiave con cui due nomi di materiale sono lo stesso materiale. */
export function chiaveMateriale(nome) {
  return String(nome || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Quanto costa UNO di questo materiale, e da dove viene il numero.
 *
 * @param {object} materiale  `{ nome, costo, legatoA?, pesoG? }`
 * @param {object} [ingCosti] il listino materie prime già passato da `buildIngCosti`
 * @returns {{costo: number|null, origine: 'magazzino'|'mano', stima: boolean,
 *            legatoA: string|null, pesoG: number|null, problema: string|null}}
 */
export function costoDelMateriale(materiale, ingCosti = null) {
  const legatoA = String(materiale?.legatoA || '').trim()
  const pesoG = Number(materiale?.pesoG)
  if (legatoA && Number.isFinite(pesoG) && pesoG > 0) {
    const voce = ingCosti ? ingCosti[normIng(legatoA)] : null
    // Il listino scrive sempre tutti e due i campi, ma chi lo costruisce a
    // mano nei test a volte no: si legge quello che c'è.
    const kg = voce?.costoKg != null ? Number(voce.costoKg)
      : voce?.costoG != null ? Number(voce.costoG) * 1000
        : null
    const base = { origine: 'magazzino', legatoA, pesoG, stima: !!voce?.isStima }
    if (kg != null && Number.isFinite(kg) && kg >= 0) {
      return { ...base, costo: parseFloat((kg / 1000 * pesoG).toFixed(6)), problema: null }
    }
    return { ...base, costo: null, stima: false, problema: `«${legatoA}» non ha un prezzo fra le materie prime` }
  }
  // `null` e stringa vuota vogliono dire «non lo so», e `Number(null)` fa
  // zero: il controllo parte dal `!= null`, non dall'`isFinite`.
  const scritto = materiale?.costo
  const n = scritto == null || scritto === '' ? null : Number(scritto)
  const base = { origine: 'mano', legatoA: null, pesoG: null, stima: false }
  if (n != null && Number.isFinite(n) && n >= 0) return { ...base, costo: n, problema: null }
  return { ...base, costo: null, problema: 'senza prezzo' }
}

/**
 * L'elenco dei materiali con il prezzo risolto: quelli legati al magazzino
 * portano il prezzo dell'ultima bolla, gli altri quello scritto a mano.
 */
export function materialiRisolti(materiali, ingCosti = null) {
  return (Array.isArray(materiali) ? materiali : []).map(m => {
    const r = costoDelMateriale(m, ingCosti)
    return {
      ...m,
      nome: String(m?.nome || ''),
      costo: r.costo,
      costoScritto: m?.costo == null || m?.costo === '' ? null : Number(m.costo),
      origine: r.origine,
      stima: r.stima,
      problema: r.problema,
    }
  })
}

function mappaMateriali(materiali) {
  const out = new Map()
  for (const m of (Array.isArray(materiali) ? materiali : [])) {
    const k = chiaveMateriale(m?.nome)
    if (k && !out.has(k)) out.set(k, m)
  }
  return out
}

/**
 * I componenti di un formato con il prezzo risolto **e la sua provenienza**.
 *
 * `costo` è il numero da usare; `costoScritto` è quello congelato dentro il
 * formato, che resta a disposizione per dire di quanto era indietro.
 */
export function componentiConOrigine(formato, materiali = null) {
  const elenco = mappaMateriali(materiali)
  const grezzi = Array.isArray(formato?.componenti) && formato.componenti.length > 0
    ? formato.componenti.map(c => ({ nome: String(c?.nome || ''), qta: Number(c?.qta) || 0, scritto: Number(c?.costo) || 0 }))
    : (Number(formato?.costoContenitore) || 0) > 0
      ? [{ nome: 'Contenitore', qta: 1, scritto: Number(formato.costoContenitore) }]
      : []

  return grezzi.map(g => {
    const m = elenco.get(chiaveMateriale(g.nome))
    const base = { nome: g.nome, qta: g.qta, costoScritto: g.scritto }
    if (!m) {
      return { ...base, costo: g.scritto, daListino: false, origine: 'formato', fuoriElenco: true, senzaPrezzo: false, diverso: false }
    }
    const daListino = m.costo
    const n = daListino == null || daListino === '' ? null : Number(daListino)
    if (n == null || !Number.isFinite(n) || n < 0) {
      // Nell'elenco c'è, ma senza prezzo. Il numero vecchio resta — toglierlo
      // vorrebbe dire far costare zero il cono — e il guaio si dichiara.
      return { ...base, costo: g.scritto, daListino: false, origine: m.origine || 'mano', fuoriElenco: false, senzaPrezzo: true, diverso: false }
    }
    return {
      ...base,
      costo: n,
      daListino: true,
      origine: m.origine || 'mano',
      fuoriElenco: false,
      senzaPrezzo: false,
      // Serve a dire «questo formato portava 0,001 € e il tuo elenco dice
      // 0,06 €»: senza, la correzione arriva in silenzio.
      diverso: Math.abs(n - g.scritto) > 5e-7,
    }
  })
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

// FC medio (€/grammo finito) dei gusti di una categoria. null se non calcolabile.
// Usa `resaGrammi(r)` (resa dichiarata dall'utente o fallback su somma
// ingredienti): coerente col resto del sistema che calcola ricavo/kg su base
// resa. Prima usava `pesoStampo(r)` (somma ingredienti) → incoerenza per gusti
// con overrun/evaporazione (audit 2026-07-30). Ora un gusto con resa=1000g e
// ingredienti=1010g ha fc/g calcolato su 1000g, come il ricavo.
export function avgFCperGCategoria(categoria, ricettario, ingCosti) {
  return dettaglioFCperGCategoria(categoria, ricettario, ingCosti).valore
}

// Come avgFCperGCategoria, ma dice anche SU QUANTO si regge la stima.
//
// Perché serve. Il food cost di un cono o di una vaschetta non si misura: si
// stima, prendendo il costo al grammo dei gusti della sua categoria. Sul
// design partner quella categoria ("Gusto") contiene DUE ricette su
// ventisette: le altre venticinque non hanno una categoria scritta. Quindi il
// food cost di tutti i coni e di tutte le vaschette veniva dal 7% del
// ricettario — e la pagina lo mostrava come un numero buono, in verde.
//
// Ritorna:
//   valore       → €/grammo medio, o null
//   nUsate       → quante ricette sono entrate nel conto
//   nCategoria   → quante ricette ha la categoria (anche quelle senza peso)
//   nSenzaPeso   → quante sono state saltate perché senza resa o senza costo
export function dettaglioFCperGCategoria(categoria, ricettario, ingCosti) {
  const ricette = ricetteDiCategoria(categoria, ricettario)
  const valori = []
  let nSenzaPeso = 0
  for (const r of ricette) {
    const peso = resaGrammi(r)
    if (peso <= 0) { nSenzaPeso++; continue }
    const { tot: fc } = calcolaFC(r, ingCosti, ricettario)
    if (Number.isFinite(fc) && fc > 0) valori.push(fc / peso)
    else nSenzaPeso++
  }
  return {
    valore: valori.length === 0 ? null : valori.reduce((s, v) => s + v, 0) / valori.length,
    nUsate: valori.length,
    nCategoria: ricette.length,
    nSenzaPeso,
  }
}

// Ricette che NON entreranno in nessuna stima perché non hanno una categoria
// scritta. Sul design partner sono 25 su 27: senza dirlo, il proprietario non
// ha modo di capire perché le stime dei formati sono fragili.
export function ricetteSenzaCategoria(ricettario) {
  return Object.values(ricettario?.ricette || {}).filter(r => {
    if (!isRicettaValida(r.nome)) return false
    const tipo = getR(r.nome, r).tipo
    if (tipo === 'semilavorato' || tipo === 'interno') return false
    return !String(r.categoria || '').trim()
  })
}

// Prezzo medio di VENDITA (€/kg) dei gusti di una categoria, ricavato dai
// Formati vendita. Serve per stimare il margine dei gusti (gelateria/yogurt)
// che hanno prezzo=0 sulla ricetta perché il prezzo vive sui formati
// (cono/coppetta/vaschetta) e non sulla singola ricetta.
//
// Calcolo: prezzo medio al kg PESATO SUI GRAMMI (`prezzoMedioAlKg`) sui
// formati validi (baseQtaG > 0, prezzo > 0). Fino al 16/09/2026 era la media
// aritmetica semplice dei €/kg dei singoli formati: un cono da 100 g pesava
// come una vaschetta da un chilo, e sui formati veri di Mara dei Boschi il
// prezzo usciva 30,74 €/kg invece di 28,91 — **+6,34% su ogni ricavo di
// gusto del P&L**. La regola sta in `prezzoMedioAlKg.js`, col conto per
// esteso. Priorita' di ricerca:
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
  return prezzoMedioAlKg(src)
}

// FC stimato (€) di UNA unità venduta di un formato.
// = Σ (componente.qta × componente.costo) + baseQtaG × FC_medio_categoria
export function fcStimatoFormato(formato, avgFCperG, materiali = null) {
  const componenti = costoComponentiUnita(formato, materiali)
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
