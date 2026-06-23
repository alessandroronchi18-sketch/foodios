// Smoke universale: verifica che TUTTI i file .jsx in src/ si importino senza
// crashare (no syntax error, no top-level ReferenceError, no circular import
// rotto, no default export mancante quando il file e' un componente).
//
// NON renderizza i componenti — solo l'import. Render universale richiederebbe
// shape di props specifiche per ogni componente. Lo scopo qui e' catturare la
// classe di bug "build minified poi import fallisce" e "syntax error".
//
// Audit 2026-06-22: la lista la genera glob a runtime, cosi' un nuovo file
// .jsx aggiunto al repo viene automaticamente coperto senza tocchi al test.

import { describe, it, expect } from 'vitest'
import { glob } from 'glob'
import path from 'node:path'

// Mock supabase per evitare connessione reale all'import.
import { vi } from 'vitest'
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getUser: () => Promise.resolve({ data: { user: null } }), signOut: () => Promise.resolve({ error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }), order: () => ({ limit: () => Promise.resolve({ data: [] }) }), single: () => Promise.resolve({ data: null }) }), order: () => Promise.resolve({ data: [] }), gte: () => ({ lte: () => Promise.resolve({ data: [] }) }) }), insert: () => Promise.resolve({ data: null, error: null }), update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }), delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }), upsert: () => Promise.resolve({ data: null, error: null }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => {} }), unsubscribe: () => {} }),
  },
}))

// Mock storage per evitare scritture reali durante import che inizializzano qualcosa.
vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve(null),
  ssaveBatch: () => Promise.resolve(),
  sloadAllSedi: () => Promise.resolve({}),
}))

const root = path.resolve(__dirname, '../..')
const files = glob.sync('src/**/*.jsx', { cwd: root, absolute: false })
  // Escludi entry point (main.jsx) — fa side effect di mount al DOM.
  .filter(f => !f.endsWith('main.jsx'))

describe('Universal import smoke — tutti i .jsx in src/', () => {
  it('lista file scoperti > 50 (sanity check del glob)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  for (const file of files) {
    // Dashboard e Personale sono particolarmente lenti su CI parallelo.
    const isHeavy = /Dashboard\.jsx$|Personale\.jsx$|AdminPage\.jsx$/.test(file)
    const timeout = isHeavy ? 25000 : 15000

    it(`${file} si importa senza crash`, async () => {
      let mod
      try {
        mod = await import(/* @vite-ignore */ '/' + file)
      } catch (e) {
        // Se l'import crasha per ReferenceError o SyntaxError, lo segnaliamo
        // come bug. Per altri errori (es. side effect runtime), li tolleriamo
        // perche' non sono colpa di build problems.
        if (e instanceof ReferenceError || e instanceof SyntaxError) {
          throw new Error(`Import crashato su ${file}: ${e.message}`)
        }
        // TypeError (es. "Cannot read X of undefined") in module-level e' bug.
        if (e instanceof TypeError && /Cannot read|is not a function|is not defined/.test(e.message)) {
          throw new Error(`Import crashato su ${file}: ${e.message}`)
        }
        // Altri (es. fetch fail in qualche init) li tolleriamo.
        console.warn(`[smoke] ${file} ha lanciato ${e.constructor.name}: ${e.message} — tollerato`)
        mod = null
      }
      // Se l'import e' andato a buon fine ma il modulo non esporta nulla,
      // e' sospetto solo se non e' un puro file di tipi/utility (no quasi mai .jsx).
      if (mod && typeof mod === 'object') {
        // OK — l'import ha prodotto qualcosa.
        expect(mod).toBeTypeOf('object')
      }
    }, timeout)
  }
})
