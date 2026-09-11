// Calcoli KPI aggregati per la produzione (metodo inventario differenziale).
//
// Usato dalla view Produzione (KPI banner + alert rimanenza alta) e dal
// modal drilldown gusto singolo. Puro: nessun I/O, testabile.
//
// Test: tests/unit/ (vitest). Qui c'era scritto
// "Test coverage: scripts/test-import-smoke.mjs", ma quello script non gira
// più da tempo (import senza estensione, che Node non risolve) e non e'
// agganciato alla CI: era una copertura solo sulla carta.

/**
 * @typedef {Object} ProduzioneRow
 * @property {string} gusto_nome
 * @property {string} data   - YYYY-MM-DD
 * @property {number} produzione_g
 * @property {number} rimanenza_g
 * @property {number} scarto_g
 */

/**
 * @typedef {Object} KpiStats
 * @property {number} prod        - grammi totali prodotti
 * @property {number} venduto     - grammi stimati venduti (prod − scarto − rimanenza finale)
 * @property {number} scarto      - grammi totali scartati
 * @property {number} scartoPct   - scarto / prod × 100
 * @property {number} gustiN      - numero di gusti distinti
 * @property {string[]} gustiRimanAlta - gusti con rimanenza finale > produzione totale
 */

/**
 * Calcola KPI aggregati da un elenco di righe di produzione.
 * Per il "venduto stimato" usa: prod_totale − scarto_totale − rimanenza_finale
 * (dove rimanenza_finale = somma per gusto della rimanenza dell'ultima data).
 *
 * @param {ProduzioneRow[]} rows
 * @returns {KpiStats}
 */
export function calcKpiStats(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { prod: 0, venduto: 0, scarto: 0, scartoPct: 0, gustiN: 0, gustiRimanAlta: [] }
  }
  let prod = 0, scarto = 0
  const perG = {}
  for (const r of rows) {
    const p = Number(r.produzione_g) || 0
    const s = Number(r.scarto_g) || 0
    const rm = Number(r.rimanenza_g) || 0
    prod += p
    scarto += s
    const g = r.gusto_nome
    if (!perG[g]) perG[g] = { prod: 0, scarto: 0, rimanFin: 0, rimanFinData: null }
    perG[g].prod += p
    perG[g].scarto += s
    if (!perG[g].rimanFinData || r.data > perG[g].rimanFinData) {
      perG[g].rimanFinData = r.data
      perG[g].rimanFin = rm
    }
  }
  const gustiRimanAlta = Object.entries(perG)
    .filter(([, v]) => v.prod > 0 && v.rimanFin > v.prod)
    .map(([g]) => g)
  const rimanFinale = Object.values(perG).reduce((s, v) => s + v.rimanFin, 0)
  const venduto = Math.max(0, prod - scarto - rimanFinale)
  const scartoPct = prod > 0 ? (scarto / prod) * 100 : 0
  return {
    prod, venduto, scarto, scartoPct,
    gustiN: Object.keys(perG).length,
    gustiRimanAlta,
  }
}

// calcPerGustoDifferenziale viveva qui: era la quarta copia della regola del
// venduto nel progetto, e l'ultima rimasta con i difetti già corretti nel
// motore condiviso (negativi troncati a zero, giacenza di partenza persa sui
// giorni di chiusura, `spedito_g` ignorato). Ora la regola sta in un solo
// posto: inventarioProduzione.totaliPerGusto.
