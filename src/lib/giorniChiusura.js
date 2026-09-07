// Giorni in cui il negozio è chiuso.
//
// Non confondere con src/lib/chiusure.js, che sono le chiusure DI CASSA. Qui
// si parla di serrande abbassate.
//
// Una chiusura può avere due forme, perché nella realtà di un negozio sono due
// cose diverse:
//
//   RICORRENTE — "chiuso il lunedì". Ha una finestra di validità, perché
//   l'abitudine cambia con la stagione: d'estate si apre anche il lunedì.
//   Cambiare non riscrive il passato: si chiude il periodo vecchio e se ne apre
//   uno nuovo, così il calendario dei mesi scorsi resta veritiero.
//
//   A INTERVALLO — ferie, feste comandate, chiusure straordinarie. Non seguono
//   nessuna regola settimanale. Un solo giorno è un intervallo che comincia e
//   finisce lo stesso giorno: non serve un terzo meccanismo.

import { supabase } from './supabase'

/** Giorno della settimana ISO: 1 = lunedì ... 7 = domenica. */
export function isoWeekday(dataIso) {
  const js = new Date(dataIso + 'T12:00').getDay()   // 0 = domenica
  return js === 0 ? 7 : js
}

/**
 * Carica le regole di chiusura di una sede.
 * Le regole senza sede (sede_id null) valgono per tutta l'azienda.
 */
export async function caricaRegoleChiusura(orgId, sedeId) {
  if (!orgId) return { ricorrenti: [], periodi: [] }

  const perSede = (q) => sedeId
    ? q.or(`sede_id.is.null,sede_id.eq.${sedeId}`)
    : q.is('sede_id', null)

  const [ric, per] = await Promise.all([
    perSede(supabase.from('chiusure_ricorrenti')
      .select('id, sede_id, giorni, valido_da, valido_a').eq('organization_id', orgId)),
    perSede(supabase.from('chiusure_periodo')
      .select('id, sede_id, data_da, data_a, motivo').eq('organization_id', orgId)),
  ])

  if (ric.error) console.error('caricaRegoleChiusura ricorrenti:', ric.error)
  if (per.error) console.error('caricaRegoleChiusura periodi:', per.error)

  return { ricorrenti: ric.data || [], periodi: per.data || [] }
}

/**
 * Il negozio era chiuso in questa data?
 *
 * Le regole ricorrenti valgono solo dentro la loro finestra: una data del 2025
 * non viene giudicata con l'abitudine impostata oggi.
 */
export function giornoChiuso(dataIso, { ricorrenti = [], periodi = [] } = {}) {
  if (!dataIso) return false

  for (const p of periodi) {
    if (dataIso >= p.data_da && dataIso <= p.data_a) return true
  }
  const dow = isoWeekday(dataIso)
  for (const r of ricorrenti) {
    if (dataIso < r.valido_da) continue
    if (r.valido_a && dataIso > r.valido_a) continue
    if ((r.giorni || []).includes(dow)) return true
  }
  return false
}

/** Motivo leggibile, per spiegare all'utente perché un giorno risulta chiuso. */
export function motivoChiusura(dataIso, { ricorrenti = [], periodi = [] } = {}) {
  for (const p of periodi) {
    if (dataIso >= p.data_da && dataIso <= p.data_a) {
      if (p.motivo) return p.motivo
      return p.data_da === p.data_a ? 'chiusura straordinaria' : 'chiusura programmata'
    }
  }
  const dow = isoWeekday(dataIso)
  const NOMI = ['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica']
  for (const r of ricorrenti) {
    if (dataIso < r.valido_da) continue
    if (r.valido_a && dataIso > r.valido_a) continue
    if ((r.giorni || []).includes(dow)) return `chiuso il ${NOMI[dow-1]}`
  }
  return null
}

/** La regola ricorrente in vigore a una certa data (la più recente che la copre). */
export function regolaInVigore(ricorrenti = [], dataIso) {
  const valide = ricorrenti
    .filter(r => dataIso >= r.valido_da && (!r.valido_a || dataIso <= r.valido_a))
    .sort((a, b) => b.valido_da.localeCompare(a.valido_da))
  return valide[0] || null
}

/**
 * Cambia i giorni di chiusura ricorrenti A PARTIRE DA una data.
 *
 * Non modifica la regola precedente: la chiude il giorno prima. Così il
 * calendario dei mesi passati continua a raccontare come si lavorava allora,
 * invece di essere riscritto ogni volta che si cambia abitudine.
 */
export async function impostaChiusuraRicorrente(orgId, sedeId, giorni, daIso) {
  if (!orgId || !daIso) throw new Error('impostaChiusuraRicorrente: parametri mancanti')

  const giornoPrima = new Date(new Date(daIso + 'T12:00').getTime() - 86400000)
    .toISOString().slice(0, 10)

  // PRIMA cancella le regole che partono esattamente da questa data.
  //
  // Senza questo passaggio, cambiare idea nello stesso giorno non funzionava:
  // il primo clic creava una regola valida da oggi, il secondo non la chiudeva
  // (si chiudono solo quelle iniziate PRIMA di oggi) e ne aggiungeva un'altra.
  // Restavano due regole attive e il giorno non si poteva più togliere: chi
  // cliccava il lunedi per sbaglio se lo teneva chiuso per sempre.
  //
  // Cancellare invece di chiudere e' corretto: una regola nata oggi e già
  // sostituita oggi non e' mai stata in vigore per un solo giorno.
  let del = supabase.from('chiusure_ricorrenti').delete()
    .eq('organization_id', orgId)
    .eq('valido_da', daIso)
  del = sedeId ? del.eq('sede_id', sedeId) : del.is('sede_id', null)
  const { error: errDel } = await del
  if (errDel) throw new Error(errDel.message)

  // Poi chiude le regole ancora aperte che partivano prima della nuova.
  let q = supabase.from('chiusure_ricorrenti')
    .update({ valido_a: giornoPrima })
    .eq('organization_id', orgId)
    .is('valido_a', null)
    .lt('valido_da', daIso)
  q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
  const { error: errChiudi } = await q
  if (errChiudi) throw new Error(errChiudi.message)

  // Una regola che parte oggi e non chiude nessun giorno equivale a "non chiudo
  // più": basta aver chiuso la precedente, non serve una riga vuota.
  if (!giorni || giorni.length === 0) return null

  const { data, error } = await supabase.from('chiusure_ricorrenti')
    .insert({ organization_id: orgId, sede_id: sedeId || null, giorni, valido_da: daIso })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

/** Segna un intervallo come chiuso: ferie, festività, chiusura straordinaria. */
export async function aggiungiPeriodoChiuso(orgId, sedeId, dataDa, dataA, motivo) {
  if (!orgId || !dataDa) throw new Error('aggiungiPeriodoChiuso: parametri mancanti')
  const { data, error } = await supabase.from('chiusure_periodo')
    .insert({
      organization_id: orgId, sede_id: sedeId || null,
      data_da: dataDa, data_a: dataA || dataDa, motivo: motivo || null,
    })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

/** Toglie la chiusura da un singolo giorno. */
export async function rimuoviPeriodiCheCoprono(orgId, sedeId, dataIso) {
  if (!orgId || !dataIso) return
  let q = supabase.from('chiusure_periodo').delete()
    .eq('organization_id', orgId)
    .lte('data_da', dataIso).gte('data_a', dataIso)
  q = sedeId ? q.or(`sede_id.is.null,sede_id.eq.${sedeId}`) : q.is('sede_id', null)
  const { error } = await q
  if (error) throw new Error(error.message)
}
