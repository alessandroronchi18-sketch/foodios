// ── Le sedi come pannelli uguali ──────────────────────────────────────────
//
// Ricerca del 04/10/2026, scelta 10 (Datawrapper): le sedi in pannelli
// uguali, con la STESSA scala (le scale diverse ingannano, perché nessuno
// guarda gli assi), e in ogni pannello le altre sedi in grigio dietro, così
// ognuna si confronta con le altre senza leggere numeri.
//
// Qui solo i dati: per ogni sede il venduto delle settimane intere (le
// settimane tagliate restano un buco, come nell'andamentino), sulle stesse
// settimane per tutte, e il massimo comune per la scala. Il venduto è quello
// di `colonneVenduto`, sede per sede.
import { colonneVenduto } from './colonneVenduto'

/**
 * @param {Array} righe  righe di tutte le sedi
 * @param {{ da: string, a: string }} periodo
 * @param {Array} sedi  da `sediAffiancate` (con sedeId, primo, ultimo)
 * @returns {{ settimane: { key: string, dal: string }[], sedi: Array, max: number }}
 *   ogni sede con `serie`: (kg | null)[] sulle `settimane`
 */
export function pannelliSedi(righe = [], { da = null, a = null } = {}, sedi = []) {
  const perSede = new Map()
  for (const r of righe || []) {
    const k = r?.sede_id || '_'
    if (!perSede.has(k)) perSede.set(k, [])
    perSede.get(k).push(r)
  }
  const colonne = sedi.map(s => colonneVenduto(perSede.get(s.sedeId || '_') || [], {
    da, a, passo: 'settimana', registrati: { primo: s.primo, ultimo: s.ultimo },
  }))
  const tutte = new Map()
  for (const lista of colonne) for (const c of lista) if (!tutte.has(c.key)) tutte.set(c.key, c.dal)
  const settimane = [...tutte.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, dal]) => ({ key, dal }))
  let max = 0
  const conSerie = sedi.map((s, i) => {
    const per = new Map(colonne[i].map(c => [c.key, c]))
    const serie = settimane.map(w => {
      const c = per.get(w.key)
      return c && c.intera ? c.vend : null
    })
    for (const v of serie) if (v != null && v > max) max = v
    return { ...s, serie }
  })
  return { settimane, sedi: conSerie, max }
}
