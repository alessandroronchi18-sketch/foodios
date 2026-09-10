// Accesso alle chiusure di cassa.
//
// Prima le chiusure stavano dentro un unico blob jsonb per sede, a cui si
// aggiungeva una voce al giorno. Cresceva per sempre e veniva scaricato tutto
// intero a ogni apertura dell'app, anche solo per guardare una settimana.
// Ora stanno nella tabella chiusure_cassa (migration 20260907b).
//
// Questo modulo espone la STESSA forma dati di prima — un array di oggetti
// { id, data, kpi, venduto, formati } — così i sei componenti che le
// consumano (P&L, Quadratura, Export contabilita', Integrazioni, Benchmark,
// Dashboard) continuano a funzionare senza modifiche. Il cambio di modello
// resta confinato qui dentro.
//
// La chiave naturale e' (organizzazione, sede, data): una chiusura per sede
// per giorno, com'e' sempre stato di fatto.

import { supabase } from './supabase'

const COLONNE = 'id, data, tot_venduto, tot_foodcost, tot_margine, tot_scarti, margine_pct, scontrino_medio, incasso_pos, incasso_contanti, incasso_delivery, venduto, formati, extra, is_demo, legacy_id'

/** Riga di database → forma che i componenti si aspettano. */
function rigaAOggetto(r) {
  return {
    ...(r.extra || {}),
    id: r.legacy_id || r.id,
    data: r.data,
    kpi: {
      totV:  Number(r.tot_venduto) || 0,
      totFC: Number(r.tot_foodcost) || 0,
      totM:  Number(r.tot_margine) || 0,
      totS:  Number(r.tot_scarti) || 0,
      totMP: Number(r.margine_pct) || 0,
      // `scontrino_medio` contiene il SELL-THROUGH in percentuale (nome
      // storico fuorviante, vedi il commento sulla colonna nel DB).
      // null resta null: "non rilevato" non è "0% smaltito".
      avgST: r.scontrino_medio == null ? null : Number(r.scontrino_medio),
      // Euro per scontrino: ha una colonna sua da 10/09/2026. Prima la
      // chiusura rapida lo scriveva dentro avgST e lo Storico lo mostrava
      // come una percentuale di sell-through, in rosso.
      scontrinoMedio: r.scontrino_medio_eur == null ? null : Number(r.scontrino_medio_eur),
      // Scomposizione per canale: null vuol dire "non rilevato", che e' diverso
      // da zero. Chi registra solo il totale continua a non vederli.
      pos:      r.incasso_pos == null ? null : Number(r.incasso_pos),
      contanti: r.incasso_contanti == null ? null : Number(r.incasso_contanti),
      delivery: r.incasso_delivery == null ? null : Number(r.incasso_delivery),
    },
    venduto: r.venduto || [],
    formati: r.formati || [],
    ...(r.is_demo ? { _demo: true } : {}),
  }
}

/** Oggetto dei componenti → riga di database. */
function oggettoARiga(c, orgId, sedeId) {
  // Tutto quello che non è previsto dallo schema finisce in extra: così un
  // campo aggiunto da una feature futura non viene perso nel salvataggio.
  const { id, data, kpi, venduto, formati, _demo, ...extra } = c
  return {
    organization_id: orgId,
    sede_id: sedeId || null,
    data: String(data).slice(0, 10),
    tot_venduto:     Number(kpi?.totV) || 0,
    tot_foodcost:    Number(kpi?.totFC) || 0,
    tot_margine:     Number(kpi?.totM) || 0,
    tot_scarti:      Number(kpi?.totS) || 0,
    margine_pct:     Number(kpi?.totMP) || 0,
    scontrino_medio: kpi?.avgST == null ? null : Number(kpi.avgST),
    scontrino_medio_eur: kpi?.scontrinoMedio == null ? null : Number(kpi.scontrinoMedio),
    incasso_pos:      kpi?.pos == null ? null : Number(kpi.pos),
    incasso_contanti: kpi?.contanti == null ? null : Number(kpi.contanti),
    incasso_delivery: kpi?.delivery == null ? null : Number(kpi.delivery),
    venduto: venduto || [],
    formati: formati || [],
    extra,
    is_demo: !!_demo,
    legacy_id: id ? String(id) : null,
  }
}

/**
 * Carica le chiusure di una sede, opzionalmente ristrette a un intervallo.
 * Senza intervallo le carica tutte, per compatibilita' col comportamento
 * precedente; passare from/to e' il motivo per cui esiste la tabella.
 */
export async function caricaChiusure(orgId, sedeId, { from, to, tutteLeSedi = false } = {}) {
  if (!orgId) return []
  let q = supabase.from('chiusure_cassa').select(COLONNE).eq('organization_id', orgId)
  // tutteLeSedi serve alla vista aziendale, che aggrega tutti i punti vendita.
  if (!tutteLeSedi) q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
  if (from) q = q.gte('data', from)
  if (to) q = q.lte('data', to)
  const { data, error } = await q.order('data', { ascending: true })
  if (error) {
    console.error('caricaChiusure:', error)
    throw new Error(error.message || 'caricaChiusure fallita')
  }
  return (data || []).map(rigaAOggetto)
}

/**
 * Salva l'elenco completo delle chiusure di una sede.
 *
 * Mantiene volutamente la firma "passa tutto l'array" dei sei callsite che
 * prima facevano ssave(SK_CHIUS, nuove): qui dentro diventa un confronto, con
 * upsert delle giornate presenti e cancellazione di quelle sparite. Così il
 * passaggio alla tabella non ha richiesto di riscrivere la logica delle viste,
 * che ragionano in termini di "ecco l'elenco aggiornato".
 */
export async function salvaChiusure(orgId, sedeId, chiusure) {
  if (!orgId) throw new Error('salvaChiusure: orgId mancante')
  const elenco = Array.isArray(chiusure) ? chiusure : []

  const righe = elenco
    .filter(c => c && c.data)
    .map(c => oggettoARiga(c, orgId, sedeId))

  if (righe.length > 0) {
    const { error } = await supabase
      .from('chiusure_cassa')
      .upsert(righe, { onConflict: 'organization_id,sede_id,data' })
    if (error) {
      console.error('salvaChiusure upsert:', error)
      throw new Error(error.message || 'salvataggio chiusure fallito')
    }
  }

  // Le giornate non più presenti nell'elenco sono state eliminate dall'utente.
  const date = righe.map(r => r.data)
  let del = supabase.from('chiusure_cassa').delete().eq('organization_id', orgId)
  del = sedeId ? del.eq('sede_id', sedeId) : del.is('sede_id', null)
  if (date.length > 0) del = del.not('data', 'in', `(${date.map(d => `"${d}"`).join(',')})`)
  const { error: errDel } = await del
  if (errDel) {
    console.error('salvaChiusure delete:', errDel)
    throw new Error(errDel.message || 'pulizia chiusure fallita')
  }
}

/**
 * Somma ricavi, food cost e giorni su un intervallo, direttamente nel
 * database. Evita di scaricare le righe per sommarle nel browser.
 * sedeIds null = tutte le sedi dell'organizzazione.
 */
export async function kpiPeriodo(orgId, sedeIds, from, to) {
  if (!orgId || !from || !to) return { ricavi: 0, foodcost: 0, margine: 0, scarti: 0, giorni: 0 }
  const { data, error } = await supabase.rpc('chiusure_kpi_periodo', {
    p_org_id: orgId,
    p_sede_ids: sedeIds == null ? null : (Array.isArray(sedeIds) ? sedeIds : [sedeIds]),
    p_data_from: from,
    p_data_to: to,
  })
  if (error) {
    console.error('kpiPeriodo:', error)
    throw new Error(error.message || 'aggregazione chiusure fallita')
  }
  const r = Array.isArray(data) ? data[0] : data
  return {
    ricavi:   Number(r?.ricavi) || 0,
    foodcost: Number(r?.foodcost) || 0,
    margine:  Number(r?.margine) || 0,
    scarti:   Number(r?.scarti) || 0,
    giorni:   Number(r?.giorni) || 0,
  }
}

/**
 * Il food cost di questa giornata lo sappiamo davvero?
 *
 * Una chiusura registrata col solo totale conosce l'incasso ma non quanto e'
 * costata la merce. Contarla come zero e' l'errore più costoso che il P&L
 * possa fare: aggiunge tutto l'incasso al margine e racconta una redditivita'
 * che non esiste. Meglio dire "di questi giorni non lo so".
 */
export function foodcostNoto(c) {
  if (c?.foodcost_noto != null) return !!c.foodcost_noto   // dichiarato al salvataggio
  if (c?.solo_totale) return false                         // solo totale, materie non inserite
  return true                                              // chiusura col dettaglio prodotti
}

/**
 * Upsert delle sole giornate passate, senza cancellare niente.
 *
 * Differenza da salvaChiusure: quella riceve l'elenco COMPLETO e cancella le
 * date che non ci sono più (giusto per una vista che ragiona su tutto lo
 * storico). Questa parla solo dei giorni che le passi: serve a chi importa un
 * periodo — un export delivery, un file di cassa, un mese di registro — e non
 * deve toccare il resto dell'anno.
 *
 * Ritorna il numero di giornate scritte.
 */
export async function upsertChiusure(orgId, sedeId, chiusure) {
  if (!orgId) throw new Error('upsertChiusure: orgId mancante')
  const valide = (Array.isArray(chiusure) ? chiusure : []).filter(c => c?.data)
  if (valide.length === 0) return 0
  const righeDb = valide.map(c => oggettoARiga(c, orgId, sedeId))
  const { error } = await supabase.from('chiusure_cassa')
    .upsert(righeDb, { onConflict: 'organization_id,sede_id,data' })
  if (error) throw new Error(error.message)
  return righeDb.length
}

/**
 * Importa le giornate lette da un registro incassi tenuto a mano.
 *
 * Non usa salvaChiusure di proposito: quella riceve l'elenco COMPLETO e
 * cancella le giornate che non ci sono più — giusto per una vista che
 * ragiona su tutto lo storico, sbagliato per un'importazione, che parla solo
 * del mese caricato e non deve toccare il resto dell'anno.
 *
 * Delle giornate già chiuse aggiorna solo i soldi. Il dettaglio prodotti e il
 * costo delle materie, se qualcuno li aveva inseriti, valgono più di quello
 * che c'è scritto nel registro e restano dove sono: il registro sa quanto e'
 * entrato, non cosa e' stato venduto.
 */
export async function importaChiusureIncassi(orgId, sedeId, righe) {
  if (!orgId) throw new Error('importaChiusureIncassi: orgId mancante')
  const valide = (Array.isArray(righe) ? righe : [])
    .filter(r => r && r.data && Number(r.totale) > 0)
  if (valide.length === 0) return { nuove: 0, aggiornate: 0 }

  const date = valide.map(r => r.data).sort()
  const esistenti = await caricaChiusure(orgId, sedeId, { from: date[0], to: date[date.length - 1] })
  const perData = new Map(esistenti.map(c => [c.data, c]))

  const righeDb = valide.map(r => {
    const vecchia = perData.get(r.data)
    const totV = Number(r.totale) || 0
    const totFC = Number(vecchia?.kpi?.totFC) || 0
    // Un canale non indicato nel registro non cancella quello che sapevamo:
    // null qui vuol dire "il foglio non lo dice", non "era zero".
    const canale = (nuovo, vecchio) => nuovo == null
      ? (vecchio == null ? null : Number(vecchio))
      : Number(nuovo)
    // Ai centesimi: la colonna e' numeric(12,2) e un margine di
    // 776,4000000000001 in memoria non serve a nessuno.
    const cent = (v) => Math.round(v * 100) / 100
    return oggettoARiga({
      ...(vecchia || {}),
      data: r.data,
      venduto: vecchia?.venduto || [],
      formati: vecchia?.formati || [],
      solo_totale:   vecchia ? !!vecchia.solo_totale : true,
      foodcost_noto: vecchia ? foodcostNoto(vecchia) : false,
      fonte_incassi: 'registro',
      kpi: {
        ...(vecchia?.kpi || {}),
        totV,
        totFC,
        totM:  cent(totV - totFC),
        totS:  Number(vecchia?.kpi?.totS) || 0,
        totMP: totV > 0 ? cent((totV - totFC) / totV * 100) : 0,
        avgST: Number(vecchia?.kpi?.avgST) || 0,
        pos:      canale(r.pos, vecchia?.kpi?.pos),
        contanti: canale(r.contanti, vecchia?.kpi?.contanti),
        delivery: canale(r.delivery, vecchia?.kpi?.delivery),
      },
    }, orgId, sedeId)
  })

  const { error } = await supabase.from('chiusure_cassa')
    .upsert(righeDb, { onConflict: 'organization_id,sede_id,data' })
  if (error) {
    console.error('importaChiusureIncassi:', error)
    throw new Error(error.message || 'importazione degli incassi fallita')
  }

  let nuove = 0, aggiornate = 0
  for (const r of valide) perData.has(r.data) ? aggiornate++ : nuove++
  return { nuove, aggiornate }
}
