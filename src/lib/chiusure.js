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

const COLONNE = 'id, data, tot_venduto, tot_foodcost, tot_margine, tot_scarti, margine_pct, scontrino_medio, venduto, formati, extra, is_demo, legacy_id'

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
      avgST: r.scontrino_medio == null ? 0 : Number(r.scontrino_medio),
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
