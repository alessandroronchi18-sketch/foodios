import { describe, it, expect } from 'vitest'
import { isSessionOperativaError, friendlyErrorMessage } from '../../src/lib/errors.js'

describe('isSessionOperativaError', () => {
  it('true per messaggio del trigger sessione', () => {
    const err = { message: 'Nessuna sessione operativa attiva per il dipendente selezionato' }
    expect(isSessionOperativaError(err)).toBe(true)
  })
  it('true case-insensitive (match soft su "sessione operativa")', () => {
    expect(isSessionOperativaError({ message: 'Sessione Operativa scaduta' })).toBe(true)
    expect(isSessionOperativaError({ message: 'SESSIONE OPERATIVA non trovata' })).toBe(true)
  })
  it('true se l\'errore è una stringa nuda', () => {
    expect(isSessionOperativaError('nessuna sessione operativa')).toBe(true)
  })
  it('false per altri errori Supabase', () => {
    expect(isSessionOperativaError({ message: 'duplicate key value violates unique constraint' })).toBe(false)
    expect(isSessionOperativaError({ message: 'permission denied for table stock_prodotti_finiti' })).toBe(false)
  })
  it('false per input nullish', () => {
    expect(isSessionOperativaError(null)).toBe(false)
    expect(isSessionOperativaError(undefined)).toBe(false)
    expect(isSessionOperativaError({})).toBe(false)
  })
})

describe('friendlyErrorMessage', () => {
  it('sessione operativa → messaggio italiano user-friendly', () => {
    const msg = friendlyErrorMessage({ message: 'Nessuna sessione operativa attiva per il dipendente selezionato' })
    expect(msg).toContain('Sessione operativa scaduta')
    expect(msg).toContain('Chi sei?')
    expect(msg).toContain('codice')
  })
  it('errore generico → passa il messaggio originale', () => {
    expect(friendlyErrorMessage({ message: 'duplicate key' })).toBe('duplicate key')
  })
  it('null / undefined → fallback "Errore sconosciuto"', () => {
    expect(friendlyErrorMessage(null)).toBe('Errore sconosciuto')
    expect(friendlyErrorMessage(undefined)).toBe('Errore sconosciuto')
  })
  it('oggetto err senza message → coerce a String', () => {
    expect(friendlyErrorMessage({ code: '42501' })).toBe('[object Object]')
  })
})
