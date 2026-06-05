import { describe, it, expect, vi } from 'vitest'

// storage.js importa il client supabase (che richiederebbe env). Lo mockiamo:
// qui testiamo solo la logica pura di classificazione chiavi.
vi.mock('../../src/lib/supabase.js', () => ({ supabase: {} }))

import { SHARED_KEYS, isSharedKey } from '../../src/lib/storage.js'
import {
  SK_RIC, SK_PROD, SK_MAG, SK_CHIUS, SK_LOG_PRZ, SK_LOGRIF, SK_FORMATI, SK_MOV,
} from '../../src/lib/storageKeys.js'

describe('storage: classificazione chiavi shared vs per-sede', () => {
  it('ricettario, formati e log-prezzi sono SHARED', () => {
    expect(isSharedKey(SK_RIC)).toBe(true)
    expect(isSharedKey(SK_FORMATI)).toBe(true)
    expect(isSharedKey(SK_LOG_PRZ)).toBe(true) // fix: audit prezzi unico per azienda
  })

  it('produzione, magazzino, chiusure, logrif, movimenti sono PER-SEDE', () => {
    expect(isSharedKey(SK_PROD)).toBe(false)
    expect(isSharedKey(SK_MAG)).toBe(false)
    expect(isSharedKey(SK_CHIUS)).toBe(false)
    expect(isSharedKey(SK_LOGRIF)).toBe(false) // il magazzino è per-sede
    expect(isSharedKey(SK_MOV)).toBe(false)
  })

  it('chiave sconosciuta -> non shared (default per-sede)', () => {
    expect(isSharedKey('chiave-inventata-v1')).toBe(false)
  })

  it('SHARED_KEYS contiene esattamente le chiavi attese', () => {
    expect(SHARED_KEYS).toContain('pasticceria-ricettario-v1')
    expect(SHARED_KEYS).toContain('pasticceria-formati-vendita-v1')
    expect(SHARED_KEYS).toContain('pasticceria-log-prezzi-v1')
    expect(SHARED_KEYS).not.toContain('pasticceria-chiusure-v1')
    expect(SHARED_KEYS).not.toContain('pasticceria-magazzino-v1')
  })
})
