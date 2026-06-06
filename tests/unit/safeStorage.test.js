// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as ss from '../../src/lib/safeStorage.js'

describe('safeStorage — happy path su localStorage disponibile', () => {
  beforeEach(() => localStorage.clear())

  it('set/get stringa', () => {
    expect(ss.set('k', 'v')).toBe(true)
    expect(ss.get('k')).toBe('v')
  })
  it('get di chiave assente → null', () => {
    expect(ss.get('mancante')).toBe(null)
  })
  it('remove cancella la chiave', () => {
    ss.set('k', 'v')
    expect(ss.remove('k')).toBe(true)
    expect(ss.get('k')).toBe(null)
  })
  it('setJSON/getJSON round-trip oggetti', () => {
    const obj = { a: 1, b: ['x', 'y'], c: { d: true } }
    expect(ss.setJSON('o', obj)).toBe(true)
    expect(ss.getJSON('o')).toEqual(obj)
  })
  it('getJSON con chiave assente → fallback', () => {
    expect(ss.getJSON('nope')).toBe(null)
    expect(ss.getJSON('nope', { x: 1 })).toEqual({ x: 1 })
  })
  it('getJSON su JSON corrotto → fallback (no throw)', () => {
    ss.set('bad', '{not json')
    expect(ss.getJSON('bad', 'FB')).toBe('FB')
  })
  it('default export espone le stesse funzioni', () => {
    expect(typeof ss.default.get).toBe('function')
    expect(typeof ss.default.setJSON).toBe('function')
  })
})

describe('safeStorage — resilienza quando localStorage lancia', () => {
  // Spiamo i metodi dell'istanza globale localStorage (happy-dom non passa per
  // Storage.prototype, quindi lo spy va messo sull'oggetto concreto).
  afterEach(() => vi.restoreAllMocks())

  it('set ritorna false (non lancia) se setItem throwa (es. Safari privata / quota)', () => {
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(() => ss.set('k', 'v')).not.toThrow()
    expect(ss.set('k', 'v')).toBe(false)
  })

  it('get ritorna null (non lancia) se getItem throwa', () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(ss.get('k')).toBe(null)
  })

  it('setJSON ritorna false se la scrittura fallisce', () => {
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(ss.setJSON('k', { a: 1 })).toBe(false)
  })
})
