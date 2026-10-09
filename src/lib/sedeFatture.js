// Di quale negozio è una fattura che non ha la sede.
//
// Le fatture MARAMA arrivano dall'Agenzia delle Entrate senza sede (e senza la
// P.IVA di chi le riceve: `cessionario_piva` è vuoto). Il registro di cassa
// invece la sede la dice: «koko» scritto sotto De Gasperi. Da lì si propone la
// sede, in due modi, dal più sicuro:
//   1. la fattura è collegata a una spesa (F) del registro (fornitore, importo,
//      data: vedi speseFatture.js) → la sede della spesa;
//   2. il fornitore, nel registro, compare sempre sotto lo stesso negozio →
//      tutte le sue fatture vanno lì; se compare sotto due negozi → spesa
//      condivisa («a metà»); se non compare → nessuna proposta.
//
// NON sposta niente: restituisce la proposta, da mostrare al titolare. Niente
// nomi di fornitori scritti qui: gli alias arrivano da `fornitori.alias`.

import { collegaSpeseAFatture, chiaviFornitore, normalizzaNome } from './speseFatture'

const contiene = (testo, chiave) => chiave.length >= 3 && (` ${testo} `).includes(` ${chiave} `)

/**
 * @param {object} o
 * @param {{ id, fornitore, data_fattura, totale }[]} o.fatture  fatture senza sede
 * @param {{ data, importo, descrizione, documento, sede }[]} o.spese  spese del registro; `sede` = id o nome della sede
 * @param {{ nome, alias }[]} o.fornitori
 * @returns {{ proposte: { fatturaId, sedi: string[], motivo: string, forza: 'sicura'|'probabile'|'nessuna' }[], perFornitore: object[] }}
 */
export function proponiSedeFatture({ fatture = [], spese = [], fornitori = [] }) {
  const speseId = spese.map((s, i) => ({ ...s, id: `s${i}` }))
  const sedeDi = new Map(speseId.map(s => [s.id, s.sede]))
  const { collegamenti } = collegaSpeseAFatture(speseId, fatture, fornitori)
  const diretta = new Map(collegamenti.map(c => [c.fatturaId, c]))

  // Per ogni fornitore (nome come scritto nelle fatture) le sedi in cui il
  // registro lo cita, con quante spese.
  const nomi = [...new Set(fatture.map(f => f.fornitore).filter(Boolean))]
  const perFornitore = nomi.map(nome => {
    const chiavi = chiaviFornitore(nome, fornitori)
    const sedi = new Map()
    for (const s of speseId) {
      if (s.documento === 'senza') continue
      const testo = normalizzaNome(s.descrizione || '')
      if (chiavi.some(k => contiene(testo, k))) sedi.set(s.sede, (sedi.get(s.sede) || 0) + 1)
    }
    return { nome, sedi: Object.fromEntries(sedi) }
  })
  const voti = new Map(perFornitore.map(p => [p.nome, p.sedi]))

  const proposte = fatture.map(f => {
    const d = diretta.get(f.id)
    if (d) {
      return { fatturaId: f.id, sedi: [sedeDi.get(d.spesaId)], forza: d.livello === 'sicuro' ? 'sicura' : 'probabile',
        motivo: `collegata a una spesa (F) del registro (${d.livello === 'sicuro' ? 'fornitore, importo e data' : 'importo uguale, data a ' + d.giorni + ' giorni'})` }
    }
    const v = voti.get(f.fornitore) || {}
    const sedi = Object.keys(v)
    if (sedi.length === 1) {
      return { fatturaId: f.id, sedi, forza: 'probabile', motivo: `il fornitore nel registro compare solo sotto questo negozio (${v[sedi[0]]} spese)` }
    }
    if (sedi.length > 1) {
      return { fatturaId: f.id, sedi, forza: 'probabile', motivo: 'il fornitore nel registro compare sotto più negozi: spesa condivisa' }
    }
    return { fatturaId: f.id, sedi: [], forza: 'nessuna', motivo: 'il fornitore non compare nel registro' }
  })
  return { proposte, perFornitore }
}
