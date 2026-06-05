import { describe, it, expect } from 'vitest'
import { validateCodiceSdi, parseSdiCustomFields } from '../../api/lib/sdiFields.js'

describe('validateCodiceSdi', () => {
  it('accetta 7 caratteri alfanumerici e normalizza a maiuscolo', () => {
    expect(validateCodiceSdi('abcde12')).toBe('ABCDE12')
    expect(validateCodiceSdi('0000000')).toBe('0000000')
    expect(validateCodiceSdi('M5UXCR1')).toBe('M5UXCR1')
  })

  it('ripulisce spazi/separatori prima di validare', () => {
    expect(validateCodiceSdi(' abc-de12 ')).toBe('ABCDE12')
  })

  it('scarta lunghezze diverse da 7 o input vuoto', () => {
    expect(validateCodiceSdi('ABC12')).toBeNull()      // troppo corto
    expect(validateCodiceSdi('ABCDE123')).toBeNull()   // troppo lungo
    expect(validateCodiceSdi('')).toBeNull()
    expect(validateCodiceSdi(null)).toBeNull()
    expect(validateCodiceSdi(undefined)).toBeNull()
  })
})

describe('parseSdiCustomFields', () => {
  const mk = (key, value) => ({ key, type: 'text', text: { value } })

  it('estrae codice destinatario valido e PEC', () => {
    const out = parseSdiCustomFields([
      mk('codice_sdi', 'm5uxcr1'),
      mk('pec', '  studio@pec.it '),
    ])
    expect(out).toEqual({ codice_destinatario: 'M5UXCR1', pec: 'studio@pec.it' })
  })

  it('omette il codice se non valido, mantiene la PEC', () => {
    const out = parseSdiCustomFields([
      mk('codice_sdi', '123'),
      mk('pec', 'studio@pec.it'),
    ])
    expect(out).toEqual({ pec: 'studio@pec.it' })
  })

  it('omette campi vuoti / mancanti', () => {
    expect(parseSdiCustomFields([mk('codice_sdi', ''), mk('pec', '   ')])).toEqual({})
    expect(parseSdiCustomFields([])).toEqual({})
    expect(parseSdiCustomFields(undefined)).toEqual({})
    expect(parseSdiCustomFields(null)).toEqual({})
  })

  it('ignora chiavi non SDI', () => {
    expect(parseSdiCustomFields([mk('altro', 'x'), mk('codice_sdi', 'M5UXCR1')]))
      .toEqual({ codice_destinatario: 'M5UXCR1' })
  })
})
