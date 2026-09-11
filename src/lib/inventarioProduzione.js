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
import { formatLocalDate, todayLocal } from './dateLocal'
import { normGusto } from './normGusto'

// Normalizzazione del nome gusto: UPPER+trim come in stock_prodotti_finiti,
// cosi e' indipendente da come l'utente l'ha digitato in ricettario.
// La funzione vive in ./normGusto (senza dipendenze) e la ri-esportiamo qui
// perché mezzo progetto la importa da questo file.
export { normGusto }

// Estrae l'elenco dei gusti dal ricettario E dalle righe già presenti in
// inventario (DB). L'unione e' importante perché:
//   - gusti nel ricettario ma senza dati DB -> riga vuota (utente compila)
//   - gusti in DB ma non nel ricettario -> riga visibile col dato (orfani:
//     scenario tipico dopo import file del cliente con gusti non ancora
//     formalizzati nel ricettario)
//
// Decisione UX (giu 2026): il proprietario sceglie il metodo di produzione
// UNA volta nelle impostazioni; in modalita' inventario, TUTTE le ricette
// tipo fetta/pezzo sono trattate come gusti. I semilavorati/interni restano
// fuori perché sono basi di lavorazione.
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

export async function caricaSettimana(orgId, sedeId, lunediIso, opts = {}) {
  if (!orgId || !sedeId || !lunediIso) return []
  const da = new Date(lunediIso); da.setHours(0, 0, 0, 0)
  const a = new Date(da); a.setDate(a.getDate() + 7)
  // Carichiamo anche i giorni PRIMA del lunedi: servono come rimanenza di
  // partenza per il venduto del lunedi.
  //
  // Era 1 solo giorno, e bastava solo se la gelateria aveva lavorato la
  // domenica. Con la chiusura settimanale (o due giorni di ferie) il lunedi
  // ripartiva da "0 rimasto" e il venduto usciva negativo, poi azzerato.
  // Ora ne carichiamo GIORNI_RIPORTO_MAX e la regola differenziale risale
  // all'ultimo giorno davvero registrato.
  // Chi vuole la vecchia finestra passa { giorniPrima: 1 }.
  const giorniPrima = Number.isFinite(opts.giorniPrima) ? opts.giorniPrima : GIORNI_RIPORTO_MAX
  const inizio = new Date(da); inizio.setDate(inizio.getDate() - giorniPrima)
  const inizioIso = formatLocalDate(inizio)
  const fineIso = formatLocalDate(a)

  const { data, error } = await supabase
    .from('inventario_produzione')
    .select('id, gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g, note, updated_at, scostamento_accettato, scostamento_nota')
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
// Segna (o toglie) l'accettazione dello scostamento su una cella.
//
// Diversa da salvaCella apposta: qui non si toccano i grammi. Chi accetta uno
// scostamento sta dicendo "il conto non torna e va bene così", non sta
// correggendo una pesata — e se passasse da salvaCella, che scrive tutti i
// campi, un patch incompleto azzererebbe produzione o rimanenza.
export async function accettaScostamento(orgId, sedeId, gustoNome, dataIso, { accettato, nota } = {}) {
  if (!orgId || !sedeId || !gustoNome || !dataIso) throw new Error('accettaScostamento: dati mancanti')
  const { data, error } = await supabase
    .from('inventario_produzione')
    .update({
      scostamento_accettato: !!accettato,
      scostamento_nota: accettato ? (String(nota || '').trim() || null) : null,
    })
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .eq('gusto_nome', normGusto(gustoNome))
    .eq('data', dataIso)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('cella non trovata')
  return data.length
}

export async function salvaCella(orgId, sedeId, gustoNome, dataIso, patch) {
  // Audit 2026-06-17 LOW: input negativo silenziato a 0. Logghiamo warning
  // se l'utente passa un valore <0 esplicito (typo) invece di azzerare
  // silenziosamente.
  const num = (v) => {
    const n = Number(v) || 0
    if (n < 0) console.warn('[salvaCella] valore negativo clamped a 0:', v)
    return Math.max(0, Math.round(n))
  }
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

// ── Regola differenziale del venduto: un solo posto ──────────────────
// La formula "venduto = rimanenza di ieri + prodotto oggi - rimanenza di
// stasera - scarto - spedito" era scritta in tre punti diversi del file e
// divergeva su due dettagli, quindi le pagine mostravano numeri diversi
// sugli stessi giorni. Ora c'e' una funzione sola.
//
// Due regole, entrambe corrette il 10/09/2026 sui dati veri di Mara
// (7.012 celle gusto×giorno; 8.793 contando anche l'org demo):
//
//  1) la base di partenza e' la rimanenza dell'ULTIMO GIORNO REGISTRATO
//     prima di oggi, non solo di ieri. Se la gelateria e' chiusa il lunedi,
//     il gelato rimasto la domenica e' ancora in vetrina il martedi:
//     ripartire da "0 rimasto" faceva risultare centinaia di celle con
//     venduto negativo, poi azzerate (194 celle e 585 kg su tutte le org,
//     dovute proprio al giorno di chiusura e non a un errore di pesata).
//     Oltre GIORNI_RIPORTO_MAX giorni di distanza la rimanenza vecchia non
//     e' più un'informazione affidabile: la cella diventa "non calcolabile"
//     (venduto null) invece di far finta che fosse zero.
//
//  2) il venduto NON viene più azzerato quando esce negativo. Un negativo
//     significa "il conto non torna" (rimanenza scritta più alta di quanto
//     c'era a disposizione): va mostrato come tale e sommato col suo segno.
//     Azzerarlo gonfiava il totale mostrato del 12,6%: su Mara 766 celle
//     su 7.012 (10,9%) uscivano negative per 3.042,6 kg, e il venduto
//     passava da 24.057,8 kg reali a 27.100,4 kg a schermo. Nello Storico
//     di De Gasperi 21 gusti su 24 risultavano venduti più di quanto
//     prodotti: impossibile, e sempre nello stesso verso.
//     `quadra: false` marca la cella; `venduto` resta il numero col segno.
export const GIORNI_RIPORTO_MAX = 7

// Somma di giorni su una data 'YYYY-MM-DD' senza passare dal fuso orario.
function piuGiorni(dataIso, n) {
  const [y, m, d] = dataIso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86400000
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// Indicizza le righe per gusto+data normalizzando il nome del gusto.
// Il nome VA normalizzato qui: in produzione ci sono 117 righe scritte
// "CAFFè FLORA" da un import vecchio, mentre la pagina cerca
// "CAFFÈ FLORA" (normGusto). Risultato: 156 kg di produzione invisibili,
// e scrivendoci sopra il gusto si sdoppiava. Se due grafie cadono sullo
// stesso giorno le sommiamo: e' la stessa vasca di gelato.
function indicizzaPerGustoGiorno(righe) {
  const byKey = {}
  for (const r of righe) {
    if (!r || !r.data) continue
    const g = normGusto(r.gusto_nome)
    if (!g) continue
    const k = `${g}|${r.data}`
    const prec = byKey[k]
    const val = {
      gusto_nome: g,
      data: r.data,
      produzione_g: Number(r.produzione_g) || 0,
      rimanenza_g: Number(r.rimanenza_g) || 0,
      scarto_g: Number(r.scarto_g) || 0,
      spedito_g: Number(r.spedito_g) || 0,
      // Lo scostamento che il titolare ha già guardato e considera giusto
      // (un omaggio, una rottura, un assaggio): resta nel totale col suo
      // segno, ma non va più nell'elenco delle cose da controllare.
      scostamento_accettato: !!r.scostamento_accettato,
      scostamento_nota: r.scostamento_nota || null,
    }
    byKey[k] = prec ? {
      ...val,
      produzione_g: prec.produzione_g + val.produzione_g,
      rimanenza_g: prec.rimanenza_g + val.rimanenza_g,
      scarto_g: prec.scarto_g + val.scarto_g,
      spedito_g: prec.spedito_g + val.spedito_g,
      // Se una sola delle righe sommate è accettata, la cella lo è.
      scostamento_accettato: prec.scostamento_accettato || val.scostamento_accettato,
      scostamento_nota: prec.scostamento_nota || val.scostamento_nota,
    } : val
  }
  return byKey
}

// Una cella va CONTROLLATA? Risponde anche a celle costruite altrove (o
// vecchie), che hanno solo `quadra` e non conoscono l'accettazione dello
// scostamento: in quel caso "non torna" vuol dire "da controllare", come
// prima.
export function cellaDaControllare(c) {
  if (!c) return false
  if (c.daControllare !== undefined) return !!c.daControllare
  return c.quadra === false
}

// Calcola la cella di un singolo (gusto, giorno) dato l'indice completo.
// Ritorna sempre un oggetto: `venduto: null` quando il numero non si può
// calcolare, mai uno zero di comodo.
export function cellaVenduto(byKey, gustoKey, dataIso) {
  const corrente = byKey[`${gustoKey}|${dataIso}`]
  if (!corrente) {
    return {
      prod: 0, riman: 0, scarto: 0, spedito: 0,
      venduto: null, vendutoRaw: null, quadra: true, registrata: false,
      motivo: 'giorno non registrato',
    }
  }
  const prod = corrente.produzione_g
  const riman = corrente.rimanenza_g
  const scarto = corrente.scarto_g
  const spedito = corrente.spedito_g
  // Rimanenza dell'ultimo giorno registrato prima di oggi.
  let rimanPrec = null
  let giorniIndietro = 0
  for (let k = 1; k <= GIORNI_RIPORTO_MAX; k++) {
    const prev = byKey[`${gustoKey}|${piuGiorni(dataIso, -k)}`]
    if (prev) { rimanPrec = prev.rimanenza_g; giorniIndietro = k; break }
  }
  if (rimanPrec === null) {
    return {
      prod, riman, scarto, spedito,
      venduto: null, vendutoRaw: null, quadra: true, registrata: true,
      motivo: 'manca la rimanenza del giorno prima: il venduto non si può calcolare',
    }
  }
  const v = rimanPrec + prod - riman - scarto - spedito
  const accettato = !!corrente.scostamento_accettato
  return {
    prod, riman, scarto, spedito, rimanPrec, giorniIndietro,
    venduto: v, vendutoRaw: v,
    // `quadra` resta il fatto matematico (il conto torna o no).
    // `daControllare` è la domanda pratica: c'è qualcosa da guardare?
    // Una cella accettata non torna e non tornerà mai — è un omaggio, una
    // rottura — ma non va più messa in fila con gli errori di compilazione.
    quadra: v >= 0,
    accettato,
    daControllare: v < 0 && !accettato,
    nota: corrente.scostamento_nota || null,
    registrata: true,
    motivo: !(v >= 0)
      ? "il conto non torna: la rimanenza scritta è più alta di quanto c'era a disposizione"
      : (giorniIndietro > 1
        ? `include ${giorniIndietro - 1} giorn${giorniIndietro === 2 ? 'o' : 'i'} non registrat${giorniIndietro === 2 ? 'o' : 'i'} prima`
        : null),
  }
}

// ── Calcolo venduto per ogni (gusto × giorno) di una settimana ────────
// Lavora interamente in-memory dai dati gia caricati: niente round-trip extra.
//
// righe = output di caricaSettimana(...), che include i giorni PRIMA del
// lunedi target (serve la rimanenza di partenza).
//
// Ritorna { [GUSTO]: { [dataIso]: cella } } con le celle di cellaVenduto().
export function calcolaVendutoSettimana(righe, lunediIso) {
  if (!Array.isArray(righe) || !lunediIso) return {}
  const byKey = indicizzaPerGustoGiorno(righe)
  const gusti = [...new Set(Object.values(byKey).map(r => r.gusto_nome))]
  const out = {}
  for (const g of gusti) {
    out[g] = {}
    for (let i = 0; i < 7; i++) {
      const dIso = piuGiorni(lunediIso, i)
      out[g][dIso] = cellaVenduto(byKey, g, dIso)
    }
  }
  return out
}

// Totali settimana per gusto: somma ALGEBRICA del venduto sui 7 giorni.
// Le celle non calcolabili (venduto null) non entrano nella somma, e
// `dettaglioVenduto` dice quante sono, cosi la pagina può dichiararlo
// invece di far passare un totale parziale per completo.
export function totaliVenduti(matrice) {
  const out = {}
  for (const [gusto, byData] of Object.entries(matrice || {})) {
    let tot = 0
    for (const cell of Object.values(byData)) {
      if (cell.venduto == null) continue
      tot += Number(cell.venduto) || 0
    }
    out[gusto] = tot
  }
  return out
}

// Serie completa (tutte le date presenti) delle celle di ogni gusto.
// La usa il dettaglio storico di un gusto, che prima si riscriveva la formula
// del venduto per conto suo — terza copia, con lo stesso azzeramento del
// negativo e la stessa perdita della rimanenza sui giorni di chiusura.
export function serieVendutoGusto(righe) {
  if (!Array.isArray(righe)) return {}
  const byKey = indicizzaPerGustoGiorno(righe)
  const perGusto = {}
  for (const r of Object.values(byKey)) {
    if (!perGusto[r.gusto_nome]) perGusto[r.gusto_nome] = []
    perGusto[r.gusto_nome].push(r)
  }
  const out = {}
  for (const [g, list] of Object.entries(perGusto)) {
    list.sort((a, b) => a.data.localeCompare(b.data))
    out[g] = list.map(r => ({ data: r.data, ...cellaVenduto(byKey, g, r.data) }))
  }
  return out
}

// Celle del venduto per gusto e giorno, con PIÙ SEDI gestite nel modo giusto.
//
// Il conto si fa SEDE PER SEDE e solo dopo si sommano i risultati. Sommare
// prima le righe e' sbagliato quando ci sono trasferimenti interni: se la sede
// A manda 5 kg alla sede B, quei chili escono dal venduto di A (spedito) e
// restano giacenza di B (rimanenza) — sommando prima del conto verrebbero
// sottratti due volte, e il venduto totale uscirebbe più basso del vero.
//
// Ritorna { [GUSTO]: [ { data, prod, riman, scarto, spedito, venduto,
//                        quadra, registrata, nonCalcolabili } ] } ordinato per
// data. `venduto` e' null solo se NESSUNA sede sa calcolarlo quel giorno.
export function serieVendutoMultiSede(righe) {
  if (!Array.isArray(righe) || righe.length === 0) return {}
  const perSede = new Map()
  for (const r of righe) {
    const k = r?.sede_id || '_'
    if (!perSede.has(k)) perSede.set(k, [])
    perSede.get(k).push(r)
  }
  // { gusto: { data: cella sommata } }
  const acc = {}
  for (const righeSede of perSede.values()) {
    for (const [gusto, celle] of Object.entries(serieVendutoGusto(righeSede))) {
      const perData = acc[gusto] || (acc[gusto] = {})
      for (const c of celle) {
        const t = perData[c.data] || (perData[c.data] = {
          data: c.data, prod: 0, riman: 0, scarto: 0, spedito: 0,
          venduto: null, quadra: true, registrata: false, nonCalcolabili: 0,
          // Anche la cella unita fra sedi deve portarsi dietro se c'è
          // qualcosa DA CONTROLLARE: senza, i contatori a valle vedevano
          // sempre zero.
          daControllare: false,
        })
        t.prod += Number(c.prod) || 0
        t.riman += Number(c.riman) || 0
        t.scarto += Number(c.scarto) || 0
        t.spedito += Number(c.spedito) || 0
        if (c.registrata) t.registrata = true
        if (c.venduto == null) {
          if (c.registrata) t.nonCalcolabili++
          continue
        }
        t.venduto = (t.venduto == null ? 0 : t.venduto) + (Number(c.venduto) || 0)
        if (c.quadra === false) t.quadra = false
        if (cellaDaControllare(c)) t.daControllare = true
      }
    }
  }
  const out = {}
  for (const [gusto, perData] of Object.entries(acc)) {
    out[gusto] = Object.values(perData).sort((a, b) => a.data.localeCompare(b.data))
  }
  return out
}

// Totali per gusto su un periodo qualunque (non solo una settimana).
//
// Perché esiste. La sezione "metodo inventario" dello Storico produzione si
// riscriveva la formula del venduto per conto suo in produzioneStats.js —
// QUARTA copia nel progetto — e quella copia aveva i tre difetti che il motore
// condiviso aveva già risolto: troncava a zero i conti che non tornavano,
// azzerava la rimanenza di partenza a ogni giorno di chiusura (e Mara chiude un
// giorno a settimana), e ignorava del tutto `spedito_g`, contando come venduti
// al banco i chili mandati a un'altra sede. La stessa pagina mostrava percio'
// un venduto diverso da Quadratura e dal conto economico, sugli stessi giorni.
//
// Il conto si fa SEDE PER SEDE e poi si somma, non aggregando prima le righe:
// se la sede A spedisce 5 kg alla sede B, quei 5 kg escono dal venduto di A
// (spedito) e restano giacenza di B (rimanenza). Sommando le righe prima del
// calcolo verrebbero sottratti due volte.
// `opts.da` / `opts.a` (ISO) restringono la somma ai giorni del periodo
// scelto: i giorni caricati PRIMA di `da` servono solo come giacenza di
// partenza e non devono entrare nei totali di produzione e scarto.
export function totaliPerGusto(righe, opts = {}) {
  if (!Array.isArray(righe) || righe.length === 0) return {}
  const { da = null, a = null } = opts
  const out = {}
  for (const [gusto, celle] of Object.entries(serieVendutoMultiSede(righe))) {
    const t = out[gusto] = {
      prodTot: 0, scartoTot: 0, speditoTot: 0, vendTot: 0,
      celleNonQuadrate: 0, gNonQuadrati: 0, celleNonCalcolabili: 0,
    }
    for (const c of celle) {
      if (da && c.data < da) continue
      if (a && c.data > a) continue
      t.prodTot += Number(c.prod) || 0
      t.scartoTot += Number(c.scarto) || 0
      t.speditoTot += Number(c.spedito) || 0
      t.celleNonCalcolabili += c.nonCalcolabili || 0
      if (c.venduto == null) continue
      t.vendTot += Number(c.venduto) || 0
      if (cellaDaControllare(c)) { t.celleNonQuadrate++; t.gNonQuadrati += Number(c.venduto) || 0 }
    }
  }
  return out
}

// Qualita' del dato per gusto: quante celle non tornano, quanti kg valgono,
// quante celle non si possono calcolare. Serve a scrivere accanto al totale
// "3 giorni non tornano" invece di mostrare un numero muto.
export function dettaglioVenduto(matrice) {
  const out = {}
  for (const [gusto, byData] of Object.entries(matrice || {})) {
    let celleNonQuadrate = 0, gNonQuadrati = 0, celleNonCalcolabili = 0, giorniRegistrati = 0
    const giorniNonQuadrati = []
    for (const [dataIso, cell] of Object.entries(byData)) {
      if (cell.registrata) giorniRegistrati++
      if (cell.venduto == null) {
        if (cell.registrata) celleNonCalcolabili++
        continue
      }
      if (cellaDaControllare(cell)) {
        celleNonQuadrate++
        gNonQuadrati += cell.venduto
        giorniNonQuadrati.push(dataIso)
      }
    }
    out[gusto] = { celleNonQuadrate, gNonQuadrati, celleNonCalcolabili, giorniRegistrati, giorniNonQuadrati }
  }
  return out
}

// ── Integrazione magazzino MP ─────────────────────────────────────────────
// Quando un dipendente registra "PROD = X grammi" per un gusto, scaliamo dal
// magazzino la quota proporzionale di ingredienti. Il fattore di scalo e':
//   fattore = delta_g / peso_impasto_per_stampo
// dove peso_impasto_per_stampo = sum(ingredienti.qty1stampo) della ricetta
// del gusto. delta può essere negativo (correzione al ribasso): in quel
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
    // Audit 2026-07-01 LOW: skip se deltaIng non finito (fattore=Infinity con
    // pesoImpasto ≈ 0 per ingredienti decorativi minimi).
    if (!Number.isFinite(deltaIng)) continue
    const k = normIng(ing.nome)
    const corrente = nm[k] || { nome: ing.nome.trim(), giacenza_g: 0, soglia_g: 0, ultimoRifornimento: null }
    // M1 fix: ammettiamo giacenza negativa internamente. Era clampata a 0
    // ma così un PROD eccessivo seguito da correzione al ribasso non
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
// Tutto in-memory dai dati già caricati.
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

// ── Ricavi stimati DALL'INVENTARIO, senza passare dalle chiusure di cassa ──
//
// Perché esiste. Tutto il conto economico, il confronto fra sedi, il margine e
// il food cost in percentuale si reggono sulle chiusure di cassa. Chi lavora
// col metodo inventario — come il design partner — spesso non le compila: nel
// suo database ce ne sono ZERO. Risultato: otto pagine che mostrano zero
// ricavi, margini negativi e allarmi rossi, su un'azienda che invece vende.
//
// L'inventario però sa quanti chili sono usciti. Moltiplicandoli per il prezzo
// medio al chilo dei formati di vendita si ottiene il ricavo. È lo stesso
// conto che la pagina Quadratura fa già per confrontarsi con la cassa: qui
// diventa una stima utilizzabile ovunque, quando la cassa non c'è.
//
// È una STIMA, e chi la mostra deve dirlo: il prezzo medio al chilo è la media
// semplice dei formati (un cono piccolo pesa come una vaschetta da un chilo),
// e non tiene conto di sconti, omaggi o del mix reale di vendita.
//
// Ritorna null se manca quello che serve, invece di un numero inventato:
//   righe   = righe inventario del periodo PIÙ i giorni prima (giacenza iniziale)
//   formati = formati di vendita (per il prezzo al chilo)
//   da / a  = estremi del periodo (ISO)
export function ricaviDaInventario(righe, formati, { da, a } = {}) {
  const euroKg = euroKgMedioFormati(formati)
  if (euroKg == null) {
    return { ricavi: null, kg: null, euroKg: null, motivo: 'nessun formato di vendita con prezzo e peso' }
  }
  const tot = totaliPerGusto(righe, { da, a })
  const gusti = Object.values(tot)
  if (gusti.length === 0) {
    return { ricavi: null, kg: null, euroKg, motivo: 'nessun dato di inventario nel periodo' }
  }
  let g = 0, celleNonQuadrate = 0, celleNonCalcolabili = 0
  for (const t of gusti) {
    g += t.vendTot
    celleNonQuadrate += t.celleNonQuadrate
    celleNonCalcolabili += t.celleNonCalcolabili
  }
  const kg = g / 1000
  return {
    ricavi: Math.max(0, kg * euroKg),
    kg,
    euroKg,
    celleNonQuadrate,
    celleNonCalcolabili,
    nGusti: gusti.length,
    motivo: null,
  }
}

// KPI settimana: somma kg venduti, € attesi, drift vs cassa effettiva.
// matrice = output di calcolaVendutoSettimana
// chiusureSettimana = chiusure SK_CHIUS filtrate alla settimana target
// euroKg = euro/kg medio (output di euroKgMedioFormati)
// venditeB2BSett = (opzionale) array di righe vendite_b2b della settimana,
//                  per sottrarre i kg B2B dal venduto retail nel confronto
//                  con la cassa (la cassa retail NON include i ricavi B2B
//                  perché sono fatturati a parte: senza sottrarre i kg
//                  B2B il drift mostra un negativo cronico falso).
export function kpiQuadraturaSettimana(matrice, chiusureSettimana, euroKg, venditeB2BSett) {
  // Somma algebrica: le celle che non tornano entrano col loro segno, non
  // azzerate. E teniamo il conto di quante sono, perché una quadratura
  // fatta su celle che non tornano non e' una quadratura: e' una coincidenza.
  let totVendutoG = 0
  let celleNonQuadrate = 0, gNonQuadrati = 0, celleNonCalcolabili = 0
  for (const byData of Object.values(matrice || {})) {
    for (const c of Object.values(byData)) {
      if (c.venduto == null) {
        if (c.registrata) celleNonCalcolabili++
        continue
      }
      totVendutoG += Number(c.venduto) || 0
      if (cellaDaControllare(c)) { celleNonQuadrate++; gNonQuadrati += Number(c.venduto) || 0 }
    }
  }
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
    celleNonQuadrate, kgNonQuadrati: gNonQuadrati / 1000, celleNonCalcolabili,
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
  // Stessa regola differenziale della vista settimanale (cellaVenduto):
  // prima queste due copie divergevano e le pagine legacy mostravano kg
  // venduti diversi da quelli dell'inventario sugli stessi giorni.
  const byKey = indicizzaPerGustoGiorno(righeInventario)
  const perGusto = {}
  for (const r of Object.values(byKey)) {
    if (!perGusto[r.gusto_nome]) perGusto[r.gusto_nome] = []
    perGusto[r.gusto_nome].push(r)
  }
  const byData = {}
  for (const [gusto, righe] of Object.entries(perGusto)) {
    righe.sort((a, b) => a.data.localeCompare(b.data))
    for (const r of righe) {
      const cell = cellaVenduto(byKey, gusto, r.data)
      const prodKg = cell.prod / 1000
      // `venduto` null = non calcolabile (manca la rimanenza di partenza):
      // resta fuori dal vendibile, non diventa uno zero.
      const vendutoKg = cell.venduto == null ? 0 : cell.venduto / 1000
      if (prodKg > 0 || vendutoKg !== 0) {
        if (!byData[r.data]) byData[r.data] = []
        byData[r.data].push({
          nome: gusto,
          stampi: Math.round(prodKg * 1000) / 1000,
          vendibile: Math.round(vendutoKg * 1000) / 1000,
          _da_inventario: true,
          _quadra: cell.quadra !== false,
        })
      }
    }
  }
  return Object.entries(byData)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, prodotti]) => ({
      data, id: `inv-${data}`, ts: data + 'T12:00:00.000Z',
      prodotti, _da_inventario: true,
    }))
}

// Fetch paginato di inventario_produzione. Il progetto Supabase ha
// `db-max-rows: 1000` a livello di PostgREST, quindi qualsiasi `.limit()`
// del client viene cappato lato server. Per prendere davvero tutti i dati
// bisogna iterare con `.range(offset, offset+999)` finche' la pagina non
// torna vuota.
//
// opts:
//   sedeIds:   uuid singolo o array di uuid (in) - opzionale
//   dataFrom:  ISO date (>= data) - opzionale
//   dataTo:    ISO date (<= data) - opzionale
//   gustoNome: filtro gusto esatto - opzionale
//   columns:   colonne SELECT (default include sede_id per aggregazione)
export async function fetchAllInventarioProduzione(orgId, opts = {}) {
  if (!orgId) return []
  const { supabase } = await import('./supabase')
  const columns = opts.columns || 'gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g, sede_id'
  // CHUNK deve stare <= db-max-rows di PostgREST (default Supabase 1000).
  // Il progetto Foodos e' stato alzato a 50000 il 2026-09-04. Se abbassano
  // di nuovo il setting, questo valore va tenuto in sync.
  const CHUNK = 50000
  const all = []
  let offset = 0
  // Safety hard cap per evitare loop infiniti su bug di server: 500k righe
  // sono ~6 anni di 3 sedi con 30 gusti/giorno, ben oltre lo scenario reale.
  while (offset < 500000) {
    let q = supabase.from('inventario_produzione').select(columns).eq('organization_id', orgId)
    if (opts.sedeIds !== undefined && opts.sedeIds !== null) {
      if (Array.isArray(opts.sedeIds)) {
        if (opts.sedeIds.length === 0) return []
        q = q.in('sede_id', opts.sedeIds)
      } else {
        q = q.eq('sede_id', opts.sedeIds)
      }
    }
    if (opts.gustoNome) q = q.eq('gusto_nome', opts.gustoNome)
    if (opts.dataFrom) q = q.gte('data', opts.dataFrom)
    if (opts.dataTo) q = q.lte('data', opts.dataTo)
    q = q.order('data').range(offset, offset + CHUNK - 1)
    const { data, error } = await q
    if (error) { console.error('fetchAllInventarioProduzione page:', error); return all }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < CHUNK) break
    offset += CHUNK
  }
  return all
}

// Aggregato mensile per gusto: prova la RPC storico_inventario_per_mese
// (aggregazione lato DB, veloce anche su anni di dati). Se la funzione
// non esiste ancora (migration 20260904 non applicata) o errora,
// fallback a fetch paginato + aggregazione client-side coerente con
// la regola differenziale usata in VistaStorico.
//
// Ritorna: { source: 'rpc'|'client', perMese: [{gusto_nome, mese, prod_g, venduto_g, scarto_g}] }
//   mese formato 'YYYY-MM'
export async function caricaStoricoMensile(orgId, sedeIds, dataFrom, dataTo) {
  if (!orgId) return { source: 'rpc', perMese: [] }
  const { supabase } = await import('./supabase')
  const arr = Array.isArray(sedeIds) ? sedeIds : (sedeIds ? [sedeIds] : null)
  const { data, error } = await supabase.rpc('storico_inventario_per_mese', {
    p_org_id: orgId,
    p_sede_ids: arr,
    p_data_from: dataFrom,
    p_data_to: dataTo,
  })
  if (!error && Array.isArray(data)) return { source: 'rpc', perMese: data }
  // Fallback client-side
  const righe = await fetchAllInventarioProduzione(orgId, {
    sedeIds: arr, dataFrom, dataTo,
    columns: 'gusto_nome, data, produzione_g, rimanenza_g, scarto_g',
  })
  // Aggrega per (gusto, data) normalizzando il nome (somma cross-sede) e poi
  // applica la stessa regola differenziale di cellaVenduto: prima questa
  // copia azzerava la rimanenza di partenza a ogni giorno di chiusura e
  // troncava i negativi, quindi lo storico mensile non tornava con la
  // settimanale sugli stessi giorni.
  const byKey = indicizzaPerGustoGiorno(righe)
  const perGusto = new Map()
  for (const r of Object.values(byKey)) {
    let arr = perGusto.get(r.gusto_nome)
    if (!arr) { arr = []; perGusto.set(r.gusto_nome, arr) }
    arr.push(r)
  }
  const perMese = new Map()  // key = `${gusto}|${YYYY-MM}`
  for (const [gusto, list] of perGusto.entries()) {
    list.sort((a, b) => a.data.localeCompare(b.data))
    for (const r of list) {
      const cell = cellaVenduto(byKey, gusto, r.data)
      const mese = r.data.slice(0, 7)
      const k = `${gusto}|${mese}`
      let bucket = perMese.get(k)
      if (!bucket) { bucket = { gusto_nome: gusto, mese, prod_g: 0, venduto_g: 0, scarto_g: 0 }; perMese.set(k, bucket) }
      bucket.prod_g += cell.prod
      bucket.venduto_g += cell.venduto == null ? 0 : cell.venduto
      bucket.scarto_g += cell.scarto
    }
  }
  return { source: 'client', perMese: [...perMese.values()] }
}

export async function caricaSessioniDaInventario(orgId, sedeId, opts = {}) {
  if (!orgId || !sedeId) return []
  const monthsBack = opts.monthsBack || 12
  const inizio = new Date()
  inizio.setMonth(inizio.getMonth() - monthsBack)
  inizio.setDate(1)
  const inizioIso = formatLocalDate(inizio)
  const rows = await fetchAllInventarioProduzione(orgId, {
    sedeIds: sedeId,
    dataFrom: inizioIso,
    columns: 'gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g',
  })
  return inventarioASessioni(rows)
}

/**
 * Giorni in cui c'è stata produzione, in un intervallo.
 *
 * Serve al Calendario operativo. In metodo inventario la produzione NON sta nel
 * blob `pasticceria-giornaliero-v1` ma in questa tabella: il Calendario leggeva
 * il blob e per una gelateria mostrava un muro di rosso pur avendo mesi di
 * produzione registrata.
 *
 * Ritorna un Set di date ISO. Il Calendario deve solo sapere SE si è prodotto,
 * non quanto: chiediamo la sola colonna `data` e non scarichiamo migliaia di
 * righe di gusti per accendere un pallino verde.
 *
 * Conta come giorno produttivo quello in cui almeno un gusto ha produzione o
 * scarto maggiore di zero: una riga con tutti zero è una cella lasciata aperta
 * nel foglio, non una giornata di lavoro.
 */
export async function giorniConProduzione(orgId, sedeId, dataFrom, dataTo) {
  if (!orgId || !dataFrom || !dataTo) return new Set()
  let q = supabase
    .from('inventario_produzione')
    .select('data')
    .eq('organization_id', orgId)
    .gte('data', dataFrom)
    .lte('data', dataTo)
    .or('produzione_g.gt.0,scarto_g.gt.0')
  if (sedeId) q = q.eq('sede_id', sedeId)
  const { data, error } = await q
  if (error) {
    console.error('giorniConProduzione:', error)
    return new Set()
  }
  return new Set((data || []).map(r => r.data))
}

// ── Helper date: lunedi della settimana che contiene `dateIso` ────────────
export function lunediDellaSettimana(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date()
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=dom, 1=lun, ... 6=sab. Vogliamo arretrare al lunedi.
  const dow = d.getDay()
  const arretra = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - arretra)
  return formatLocalDate(d)
}
