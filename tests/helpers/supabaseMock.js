// Helper riutilizzabile per mockare il pattern fluent del client Supabase
// (`.from().select().eq().eq().order().limit()` ecc.). Ogni metodo ritorna
// la stessa chain in modo che il caller possa concatenare arbitrariamente;
// la chain e' poi await-able tramite `then`, che risolve con `returnValue`.
//
// Uso tipico:
//   import { mockSupabase, mockChain } from '../helpers/supabaseMock.js'
//   vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase() }))
//   ...
//   import { supabase } from '../../src/lib/supabase'
//   supabase.from.mockImplementationOnce(() => mockChain({ data: [...], error: null }))

import { vi } from 'vitest'

export function mockChain(returnValue = { data: [], error: null }) {
  const chain = {}
  const methods = [
    'from', 'select', 'eq', 'is', 'not', 'in', 'or',
    'order', 'limit', 'gte', 'lt', 'gt', 'lte',
    'insert', 'update', 'delete', 'upsert',
    'maybeSingle', 'single', 'abortSignal',
  ]
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  // I terminali (`limit` / `single` / `maybeSingle` / chain awaitata
  // direttamente) usano `then` per restituire il valore mockato.
  chain.then = (resolve) => Promise.resolve(returnValue).then(resolve)
  return chain
}

export function mockSupabase(returnValue) {
  const chainFactory = () => mockChain(returnValue)
  return {
    from: vi.fn().mockImplementation(chainFactory),
    rpc: vi.fn().mockResolvedValue(returnValue ?? { data: null, error: null }),
  }
}
