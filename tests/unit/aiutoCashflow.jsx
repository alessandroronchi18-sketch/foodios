// Non è un file di prove: è l'impalcatura condivisa delle prove sulla pagina
// Cassa prevista (`src/views/CashflowView.jsx`). Sta qui e non dentro un
// `.test.jsx` perché `vitest.config.js` raccoglie solo `*.test.{js,jsx}`.
//
// Un finto Supabase che tiene davvero le righe in memoria e le FILTRA come
// farebbe Postgres. Non è pignoleria: uno dei difetti corretti il 20/09/2026
// è proprio un filtro — `neq('stato','pagata')` butta via anche le righe con
// lo stato nullo, perché in SQL `NULL <> 'pagata'` non è vero, è ignoto. Con
// un finto database che ignora i filtri, quella prova sarebbe verde su tutti
// e due i codici e non proteggerebbe niente.

import React from 'react'
import { render } from '@testing-library/react'
import { ConfirmProvider } from '../../src/components/ConfirmModal.jsx'

export const stato = {
  fatture: [],
  eventi: [],
  chiusure: [],
  impostazioni: null,      // quello che risponde `sload`
  salvataggi: [],          // le `ssave` andate a buon fine
  scritture: [],           // insert/delete arrivati al database
  avvisi: [],              // i toast della pagina: [testo, positivo]
  erroreSsave: null,       // se valorizzato, `ssave` lancia
  erroreDb: null,          // { tabella, azione, messaggio }
}

export function reset({ fatture = [], eventi = [], chiusure = [], impostazioni = null } = {}) {
  stato.fatture = fatture
  stato.eventi = eventi
  stato.chiusure = chiusure
  stato.impostazioni = impostazioni
  stato.salvataggi = []
  stato.scritture = []
  stato.avvisi = []
  stato.erroreSsave = null
  stato.erroreDb = null
}

// ── Il finto database ──────────────────────────────────────────────────
function righeDi(tabella) {
  if (tabella === 'fatture') return stato.fatture
  if (tabella === 'cashflow_eventi') return stato.eventi
  if (tabella === 'chiusure_cassa') return stato.chiusure
  return []
}

/** Una clausola di `or()`: 'stato.is.null' oppure 'stato.neq.pagata'. */
function clausola(riga, testo) {
  const [col, op, ...resto] = testo.split('.')
  const val = resto.join('.')
  const v = riga[col]
  if (op === 'is') return val === 'null' ? (v === null || v === undefined) : String(v) === val
  if (op === 'eq') return String(v ?? '') === val
  if (op === 'neq') return v !== null && v !== undefined && String(v) !== val
  return true
}

function esegui(q) {
  if (stato.erroreDb && stato.erroreDb.tabella === q.tabella && stato.erroreDb.azione === q.azione) {
    return { data: null, error: { message: stato.erroreDb.messaggio || 'errore finto' } }
  }
  if (q.azione === 'insert') {
    const nuova = { id: `ev-nuovo-${stato.eventi.length + 1}`, ...q.valori }
    stato.eventi = [...stato.eventi, nuova]
    stato.scritture.push({ tabella: q.tabella, azione: 'insert', valori: q.valori })
    return { data: nuova, error: null }
  }
  if (q.azione === 'delete') {
    const perId = q.filtri.find(([op, col]) => op === 'eq' && col === 'id')
    stato.scritture.push({ tabella: q.tabella, azione: 'delete', filtri: q.filtri })
    if (perId) stato.eventi = stato.eventi.filter(r => r.id !== perId[2])
    return { data: null, error: null }
  }
  let righe = [...righeDi(q.tabella)]
  for (const [op, col, val] of q.filtri) {
    if (op === 'eq') righe = righe.filter(r => String(r[col] ?? '') === String(val))
    else if (op === 'neq') righe = righe.filter(r => r[col] !== null && r[col] !== undefined && String(r[col]) !== String(val))
    else if (op === 'gte') righe = righe.filter(r => String(r[col] ?? '') >= String(val))
    else if (op === 'lte') righe = righe.filter(r => String(r[col] ?? '') <= String(val))
    else if (op === 'is') righe = righe.filter(r => (val === null ? r[col] == null : r[col] === val))
    else if (op === 'or') righe = righe.filter(r => String(val).split(',').some(c => clausola(r, c)))
  }
  if (q.ordine) righe.sort((a, b) => String(a[q.ordine] ?? '').localeCompare(String(b[q.ordine] ?? '')))
  return { data: righe, error: null }
}

function catena(tabella) {
  const q = { tabella, filtri: [], azione: 'select', valori: null, ordine: null }
  const c = {
    select: () => c,
    insert: (v) => { q.azione = 'insert'; q.valori = v; return c },
    update: (v) => { q.azione = 'update'; q.valori = v; return c },
    delete: () => { q.azione = 'delete'; return c },
    eq: (col, val) => { q.filtri.push(['eq', col, val]); return c },
    neq: (col, val) => { q.filtri.push(['neq', col, val]); return c },
    gte: (col, val) => { q.filtri.push(['gte', col, val]); return c },
    lte: (col, val) => { q.filtri.push(['lte', col, val]); return c },
    is: (col, val) => { q.filtri.push(['is', col, val]); return c },
    or: (testo) => { q.filtri.push(['or', null, testo]); return c },
    in: () => c, not: () => c, lt: () => c, gt: () => c, ilike: () => c, limit: () => c, range: () => c,
    order: (col) => { q.ordine = col; return c },
    single: () => Promise.resolve(esegui(q)),
    maybeSingle: () => Promise.resolve(esegui(q)),
    then: (risolvi) => Promise.resolve(esegui(q)).then(risolvi),
  }
  return c
}

export const supabaseFinto = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'u', email: 'anita@maradeiboschi.com' } } }),
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: (t) => catena(t),
  rpc: () => Promise.resolve({ data: [], error: null }),
  channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }),
  removeChannel: () => {},
}

export const storageFinto = {
  sload: async () => stato.impostazioni,
  ssave: async (chiave, valore) => {
    if (stato.erroreSsave) throw new Error(stato.erroreSsave)
    stato.salvataggi.push({ chiave, valore })
    stato.impostazioni = valore
  },
  ssaveBatch: async () => {},
  sloadAllSedi: async () => ({}),
  _resetVersions: () => {},
}

// ── Fabbriche di righe ─────────────────────────────────────────────────

/** Un giorno a N giorni da oggi, scritto come lo scrive il database. */
export function giorno(n = 0) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Una fattura fornitore come arrivano quelle vere di Mara dei Boschi:
 * `data_scadenza` VUOTA (su 3.104 documenti lo è su tutti), quindi la
 * scadenza la calcola `scadenzaFattura` a 30 giorni dalla data del documento.
 * `scadeFra` è in giorni: negativo = già scaduta.
 */
export function fattura({ id = 'f1', fornitore = 'MORRA S.r.l.', totale = 100, scadeFra = 10, pagato = 0, stato: st = 'da_pagare' } = {}) {
  return {
    id,
    organization_id: 'org-1',
    fornitore,
    data_fattura: giorno(scadeFra - 30),
    data_scadenza: null,
    totale,
    importo_pagato: pagato,
    stato: st,
  }
}

/** Una riga di `chiusure_cassa` come la restituisce il database. */
export function chiusura({ data, venduto = 500 } = {}) {
  return {
    id: `c-${data}`,
    organization_id: 'org-1',
    sede_id: 's1',
    data,
    tot_venduto: venduto,
    tot_foodcost: 0, tot_margine: 0, tot_scarti: 0, margine_pct: 0,
    scontrino_medio: null, scontrino_medio_eur: null,
    incasso_pos: null, incasso_contanti: null, incasso_delivery: null,
    venduto: [], formati: [], extra: {}, is_demo: false, legacy_id: null,
  }
}

/** Un evento pianificato di `cashflow_eventi`. */
export function evento({ id = 'e1', tipo = 'uscita', descrizione = 'Affitto', fra = 5, importo = 1000 } = {}) {
  return {
    id, organization_id: 'org-1', sede_id: 's1',
    tipo, descrizione, data_attesa: giorno(fra), importo,
    ricorrenza: null, stato: 'pianificato', created_at: new Date().toISOString(),
  }
}

// ── Montaggio ──────────────────────────────────────────────────────────

/** Le tre larghezze del progetto: sotto 768 telefono, 768–1023 tablet, da 1024 computer. */
export const LARGHEZZA = { telefono: 390, tablet: 768, computer: 1440 }

export function schermo(px) {
  window.innerWidth = px
  window.innerHeight = 900
}

/**
 * Monta la pagina davvero, dentro il fornitore della finestra di conferma
 * dell'app: così `useConfirm` NON ricade su `window.confirm` e le prove sulle
 * finestre del browser misurano quello che succede in produzione.
 */
export function montaCashflow(Componente, props = {}) {
  const notify = (testo, positivo) => { stato.avvisi.push([String(testo), positivo]) }
  return render(
    <ConfirmProvider>
      <Componente orgId="org-1" sedeId="s1" sedi={[{ id: 's1', nome: 'Carlina' }]} notify={notify} {...props} />
    </ConfirmProvider>
  )
}

/** Tutti gli avvisi messi insieme, per cercarci dentro una frase. */
export function avvisiUniti() {
  return stato.avvisi.map(a => a[0]).join(' | ')
}
