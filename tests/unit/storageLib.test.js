// storage.js — test del subset puro (SHARED_KEYS gating, isSharedKey).
// Le funzioni con Supabase richiedono un mock chain piu' elaborato che
// non aggiunge valore senza @testing-library; ci concentriamo su pure.

import { describe, it, expect } from 'vitest'
import { SHARED_KEYS, isSharedKey } from '../../src/lib/storage'

describe('SHARED_KEYS / isSharedKey', () => {
  it('SHARED_KEYS contiene chiavi note dell\'app', () => {
    expect(SHARED_KEYS).toContain('pasticceria-ricettario-v1')
    expect(SHARED_KEYS).toContain('pasticceria-ai-v1')
    expect(SHARED_KEYS).toContain('pasticceria-formati-vendita-v1')
    expect(SHARED_KEYS).toContain('pasticceria-log-prezzi-v1')
    expect(SHARED_KEYS).toContain('pasticceria-organigramma-v1')
  })

  it('SHARED_KEYS NON contiene chiavi per-sede', () => {
    expect(SHARED_KEYS).not.toContain('pasticceria-magazzino-v1')
    expect(SHARED_KEYS).not.toContain('pasticceria-chiusure-v1')
    expect(SHARED_KEYS).not.toContain('pasticceria-giornaliero-v1')
  })

  it('isSharedKey true per chiavi note', () => {
    expect(isSharedKey('pasticceria-ricettario-v1')).toBe(true)
    expect(isSharedKey('pasticceria-ai-v1')).toBe(true)
    expect(isSharedKey('pasticceria-actions-v1')).toBe(true)
    expect(isSharedKey('pasticceria-regole-v1')).toBe(true)
    expect(isSharedKey('pasticceria-semilavorati-v1')).toBe(true)
    expect(isSharedKey('pasticceria-log-prezzi-v1')).toBe(true)
  })

  it('isSharedKey false per chiavi per-sede', () => {
    expect(isSharedKey('pasticceria-magazzino-v1')).toBe(false)
    expect(isSharedKey('pasticceria-chiusure-v1')).toBe(false)
    expect(isSharedKey('pasticceria-giornaliero-v1')).toBe(false)
  })

  it('isSharedKey false su input invalido / sconosciuto', () => {
    expect(isSharedKey(null)).toBe(false)
    expect(isSharedKey('')).toBe(false)
    expect(isSharedKey(undefined)).toBe(false)
    expect(isSharedKey('chiave-mai-vista')).toBe(false)
  })
})
