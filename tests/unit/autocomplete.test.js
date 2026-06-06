import { describe, it, expect, vi } from 'vitest'
import { firstMatch, onEnterAutoComplete } from '../../src/lib/autocomplete.js'

describe('firstMatch', () => {
  const opts = ['Farina 00', 'Farina integrale', 'Zucchero', 'Burro']

  it('match esatto (case-insensitive) ritorna l\'option originale', () => {
    expect(firstMatch(opts, 'zucchero')).toBe('Zucchero')
    expect(firstMatch(opts, 'ZUCCHERO')).toBe('Zucchero')
  })
  it('prefisso ha priorità sulla sottostringa', () => {
    // "far" è prefisso di "Farina 00" (prima nell\'array) → vince quello
    expect(firstMatch(opts, 'far')).toBe('Farina 00')
  })
  it('sottostringa quando non c\'è prefisso', () => {
    expect(firstMatch(opts, 'integ')).toBe('Farina integrale')
    expect(firstMatch(opts, 'urr')).toBe('Burro')
  })
  it('trim e case sulla query', () => {
    expect(firstMatch(opts, '  burro  ')).toBe('Burro')
  })
  it('nessun match → null', () => {
    expect(firstMatch(opts, 'xyz')).toBe(null)
  })
  it('query vuota o nulla → null', () => {
    expect(firstMatch(opts, '')).toBe(null)
    expect(firstMatch(opts, '   ')).toBe(null)
    expect(firstMatch(opts, null)).toBe(null)
  })
  it('options vuoto/non array → null', () => {
    expect(firstMatch([], 'far')).toBe(null)
    expect(firstMatch(null, 'far')).toBe(null)
    expect(firstMatch(undefined, 'far')).toBe(null)
  })
})

describe('onEnterAutoComplete', () => {
  const opts = ['Farina', 'Zucchero']
  const evt = (over = {}) => ({ key: 'Enter', preventDefault: vi.fn(), nativeEvent: {}, ...over })

  it('ignora tasti diversi da Enter', () => {
    const setValue = vi.fn(); const onSubmit = vi.fn()
    onEnterAutoComplete(opts, 'far', setValue, onSubmit)(evt({ key: 'a' }))
    expect(setValue).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ignora durante composizione IME', () => {
    const setValue = vi.fn(); const onSubmit = vi.fn()
    onEnterAutoComplete(opts, 'far', setValue, onSubmit)(evt({ nativeEvent: { isComposing: true } }))
    expect(setValue).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Enter con match parziale: completa il valore e chiama onSubmit col match', () => {
    const setValue = vi.fn(); const onSubmit = vi.fn(); const e = evt()
    onEnterAutoComplete(opts, 'far', setValue, onSubmit)(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(setValue).toHaveBeenCalledWith('Farina')
    expect(onSubmit).toHaveBeenCalledWith('Farina')
  })

  it('Enter con valore già completo: NON sostituisce, chiama onSubmit col valore corrente', () => {
    const setValue = vi.fn(); const onSubmit = vi.fn(); const e = evt()
    onEnterAutoComplete(opts, 'Farina', setValue, onSubmit)(e)
    expect(setValue).not.toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalledWith('Farina')
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('Enter senza match: chiama onSubmit col valore digitato così com\'è', () => {
    const setValue = vi.fn(); const onSubmit = vi.fn()
    onEnterAutoComplete(opts, 'xyz', setValue, onSubmit)(evt())
    expect(setValue).not.toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalledWith('xyz')
  })

  it('senza onSubmit e preventOnNoMatch: previene il default sul no-match', () => {
    const setValue = vi.fn(); const e = evt()
    onEnterAutoComplete(opts, 'xyz', setValue, undefined, { preventOnNoMatch: true })(e)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('senza onSubmit né preventOnNoMatch su no-match: non fa nulla', () => {
    const setValue = vi.fn(); const e = evt()
    onEnterAutoComplete(opts, 'xyz', setValue)(e)
    expect(setValue).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
