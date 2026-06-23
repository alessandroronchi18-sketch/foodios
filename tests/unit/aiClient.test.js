// Test per src/lib/aiClient.js — pin sulle funzioni puri (sanitize, parse, friendly).
//
// Il fetch a /api/ai è coperto altrove (api-import-smoke); qui testiamo la
// logica pura senza network: il valore di questo modulo è proprio la
// resilienza dell'output parsing e l'error mapping.

import { describe, it, expect } from 'vitest'
import { sanitizeUserInput, parseAiJson, friendlyAiError } from '../../src/lib/aiClient.js'

describe('aiClient — sanitizeUserInput', () => {
  it('strip zero-width unicode (prompt injection invisibile)', () => {
    const zw = '​‌‍⁠﻿'
    expect(sanitizeUserInput(`ciao${zw}mondo`)).toBe('ciaomondo')
  })

  it('trim + tronca a maxLen', () => {
    expect(sanitizeUserInput('  hello  ')).toBe('hello')
    expect(sanitizeUserInput('a'.repeat(200), 50)).toHaveLength(50)
  })

  it('null/undefined → stringa vuota (no crash)', () => {
    expect(sanitizeUserInput(null)).toBe('')
    expect(sanitizeUserInput(undefined)).toBe('')
  })
})

describe('aiClient — parseAiJson resiliente', () => {
  it('JSON pulito', () => {
    expect(parseAiJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('JSON in markdown fence ```json ... ```', () => {
    expect(parseAiJson('```json\n{"foo":"bar"}\n```')).toEqual({ foo: 'bar' })
  })

  it('JSON in fence senza linguaggio', () => {
    expect(parseAiJson('```\n{"x":2}\n```')).toEqual({ x: 2 })
  })

  it('JSON con testo introduttivo (Claude prima del JSON)', () => {
    const text = 'Ecco i risultati richiesti:\n\n{"prodotti":[{"nome":"X","prezzo":3.5}]}\n\nGrazie!'
    expect(parseAiJson(text)).toEqual({ prodotti: [{ nome: 'X', prezzo: 3.5 }] })
  })

  it('JSON nested con stringhe contenenti graffe → bilanciamento corretto', () => {
    const text = 'qui: {"templ":"ciao {nome}", "n":1}'
    expect(parseAiJson(text)).toEqual({ templ: 'ciao {nome}', n: 1 })
  })

  it('input non-stringa o vuoto → null', () => {
    expect(parseAiJson(null)).toBe(null)
    expect(parseAiJson(undefined)).toBe(null)
    expect(parseAiJson('')).toBe(null)
    expect(parseAiJson(123)).toBe(null)
  })

  it('JSON irrecuperabile → null (no throw)', () => {
    expect(parseAiJson('not json at all')).toBe(null)
    expect(parseAiJson('{ broken')).toBe(null)
  })
})

describe('aiClient — friendlyAiError mappatura status', () => {
  it('429 → limite giornaliero italiano', () => {
    expect(friendlyAiError({}, 429)).toMatch(/limite/i)
    expect(friendlyAiError({}, 429)).toMatch(/domani/i)
  })

  it('401 → sessione scaduta', () => {
    expect(friendlyAiError({}, 401)).toMatch(/sessione/i)
  })

  it('403 → piano superiore', () => {
    expect(friendlyAiError({}, 403)).toMatch(/piano superiore/i)
  })

  it('5xx → sovraccarico riprova', () => {
    expect(friendlyAiError({}, 503)).toMatch(/sovracc/i)
    expect(friendlyAiError({}, 504)).toMatch(/sovracc/i)
  })

  it('AbortError → tempo scaduto', () => {
    expect(friendlyAiError({ name: 'AbortError' })).toMatch(/Tempo scaduto/i)
  })

  it('network fail → connessione', () => {
    expect(friendlyAiError({ message: 'Failed to fetch' })).toMatch(/connessione/i)
  })

  it('errore generico → fallback amichevole (no stack trace)', () => {
    const msg = friendlyAiError(new Error('something internal'))
    expect(msg).toMatch(/Riprova/i)
    expect(msg).not.toMatch(/something internal/)
  })
})
