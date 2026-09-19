// Non è un file di prove: è l'impalcatura condivisa delle prove sulla pagina
// Fornitori (`src/components/Scadenzario.jsx`). Sta qui e non dentro un
// `.test.jsx` perché `vitest.config.js` raccoglie solo `*.test.{js,jsx}`.
//
// Un finto Supabase che tiene davvero le righe in memoria: le prove non
// controllano che una funzione sia stata chiamata, ma che le righe giuste
// siano state aggiornate con i valori giusti.

export const stato = { fatture: [], fornitori: [], scritture: [] }

export function reset({ fatture = [], fornitori = [] } = {}) {
  stato.fatture = fatture
  stato.fornitori = fornitori
  stato.scritture = []
}

function esegui(q) {
  if (q.azione === 'update' || q.azione === 'insert') {
    stato.scritture.push({ tabella: q.tabella, azione: q.azione, valori: q.valori, filtri: q.filtri })
    if (q.tabella === 'fatture' && q.azione === 'update') {
      const dentro = q.filtri.find(([op, col]) => op === 'in' && col === 'id')
      const ids = dentro ? dentro[2] : []
      stato.fatture = stato.fatture.map(f => ids.includes(f.id) ? { ...f, ...q.valori } : f)
    }
    if (q.tabella === 'fornitori') {
      const perId = q.filtri.find(([op, col]) => op === 'eq' && col === 'id')
      if (perId) stato.fornitori = stato.fornitori.map(f => f.id === perId[2] ? { ...f, ...q.valori } : f)
      else stato.fornitori = [...stato.fornitori, { id: `nuovo-${stato.fornitori.length}`, ...q.valori }]
    }
    return { data: null, error: null, count: 0 }
  }
  let righe = q.tabella === 'fatture' ? stato.fatture : q.tabella === 'fornitori' ? stato.fornitori : []
  for (const [op, col, val] of q.filtri) {
    if (col === 'organization_id') continue
    if (op === 'eq') righe = righe.filter(r => String(r[col] ?? '') === String(val))
    if (op === 'neq') righe = righe.filter(r => String(r[col] ?? '') !== String(val))
  }
  if (q.head) return { data: null, error: null, count: righe.length }
  return { data: righe, error: null, count: righe.length }
}

function catena(tabella) {
  const q = { tabella, filtri: [], azione: 'select', valori: null, head: false }
  const c = {
    select: (_campi, opzioni) => { q.head = !!opzioni?.head; return c },
    insert: (v) => { q.azione = 'insert'; q.valori = v; return c },
    update: (v) => { q.azione = 'update'; q.valori = v; return c },
    delete: () => { q.azione = 'delete'; return c },
    eq: (col, val) => { q.filtri.push(['eq', col, val]); return c },
    neq: (col, val) => { q.filtri.push(['neq', col, val]); return c },
    in: (col, val) => { q.filtri.push(['in', col, val]); return c },
    gte: () => c, lte: () => c, lt: () => c, gt: () => c, is: () => c, or: () => c, ilike: () => c,
    order: () => c, limit: () => c, range: () => c,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (risolvi) => risolvi(esegui(q)),
  }
  return c
}

export const supabaseFinto = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'u', email: 't@x.it' } } }),
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: (t) => catena(t),
  rpc: () => Promise.resolve({ data: [], error: null }),
  channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }),
  removeChannel: () => {},
}

/** Una data a N giorni da oggi, come la scrive il database. */
export function giorno(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Una fattura finta. `fra` = giorni da oggi alla scadenza (negativo = scaduta). */
export function fattura({ id, fornitore, totale = 100, fra = 0, stato: st = 'aperta', sede = null, iban = null, numero }) {
  return {
    id,
    numero_rif: numero || `FT-${id}`,
    data_fattura: giorno(-40),
    data_scadenza: giorno(fra),
    tipo: 'fattura',
    fornitore,
    totale,
    imponibile: totale,
    imposta: 0,
    stato: st,
    importo_pagato: 0,
    data_pagamento: null,
    metodo_pagamento: null,
    iban,
    sede_id: sede,
  }
}

export const SEDI_TRE = [
  { id: 's1', nome: 'Carlina', attiva: true },
  { id: 's2', nome: 'Berthollet', attiva: true },
  { id: 's3', nome: 'De Gasperi', attiva: true },
]
