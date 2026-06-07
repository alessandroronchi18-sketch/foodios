import { describe, it, expect } from 'vitest'
import { ibanIsValid, normalizeIban, generateSepaXml, causaleFattura, bonificoText } from '../../src/lib/sepa.js'

// IBAN di esempio noti-validi (mod-97)
const IBAN_IT = 'IT60X0542811101000000123456'
const IBAN_DE = 'DE89370400440532013000'

describe('ibanIsValid (mod-97)', () => {
  it('accetta IBAN validi IT e DE', () => {
    expect(ibanIsValid(IBAN_IT)).toBe(true)
    expect(ibanIsValid(IBAN_DE)).toBe(true)
  })
  it('accetta IBAN con spazi', () => {
    expect(ibanIsValid('IT60 X054 2811 1010 0000 0123 456')).toBe(true)
  })
  it('rifiuta IBAN con checksum errato', () => {
    expect(ibanIsValid('IT00X0542811101000000123456')).toBe(false)
  })
  it('rifiuta stringhe non IBAN / vuote', () => {
    expect(ibanIsValid('')).toBe(false)
    expect(ibanIsValid('ABC')).toBe(false)
    expect(ibanIsValid(null)).toBe(false)
  })
  it('normalizeIban toglie spazi e fa uppercase', () => {
    expect(normalizeIban(' it60 x054 ')).toBe('IT60X054')
  })
})

describe('causaleFattura / bonificoText', () => {
  it('compone causale leggibile', () => {
    expect(causaleFattura({ numero_rif: '123', data_fattura: '2026-01-15' })).toBe('Fatt. 123 del 2026-01-15')
  })
  it('fallback senza dati', () => {
    expect(causaleFattura({})).toBe('Pagamento fattura')
  })
  it('bonificoText include IBAN normalizzato e importo IT', () => {
    const t = bonificoText({ beneficiario: 'Molino Rossi', iban: 'it60 x054 2811 1010 0000 0123 456', importo: 1234.5, causale: 'Fatt. 1' })
    expect(t).toContain('IBAN: IT60X0542811101000000123456')
    // separatore migliaia dipende dall'ICU dell'ambiente (in browser → "1.234,50")
    expect(t).toMatch(/1\.?234,50/)
    expect(t).toContain('Molino Rossi')
  })
})

describe('generateSepaXml (pain.001.001.03)', () => {
  const debtor = { nome: 'Mara dei Boschi SRL', iban: IBAN_IT }
  const opts = { executionDate: '2026-06-10', msgId: 'TEST-1', creationDateTime: '2026-06-06T10:00:00Z' }

  it('genera XML valido con totale e n. transazioni corretti', () => {
    const { xml, included, skipped, totale } = generateSepaXml({
      debtor,
      payments: [
        { id: 'a', beneficiario: 'Molino Rossi', iban: IBAN_DE, importo: 100.5, causale: 'Fatt. 1' },
        { id: 'b', beneficiario: 'Latteria Bianchi', iban: IBAN_IT, importo: 50, causale: 'Fatt. 2' },
      ],
      ...opts,
    })
    expect(included).toHaveLength(2)
    expect(skipped).toHaveLength(0)
    expect(totale).toBe(150.5)
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03')
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>')
    expect(xml).toContain('<CtrlSum>150.50</CtrlSum>')
    expect(xml).toContain('<ReqdExctnDt>2026-06-10</ReqdExctnDt>')
    expect(xml).toContain(`<IBAN>${IBAN_DE}</IBAN>`)
    expect(xml).toContain('<InstdAmt Ccy="EUR">100.50</InstdAmt>')
  })

  it('salta beneficiari con IBAN non valido o importo ≤ 0', () => {
    const { included, skipped } = generateSepaXml({
      debtor,
      payments: [
        { id: 'a', beneficiario: 'Buono', iban: IBAN_DE, importo: 10, causale: 'ok' },
        { id: 'b', beneficiario: 'NoIban', iban: 'XX', importo: 10, causale: 'no' },
        { id: 'c', beneficiario: 'Zero', iban: IBAN_DE, importo: 0, causale: 'no' },
      ],
      ...opts,
    })
    expect(included).toHaveLength(1)
    expect(skipped).toHaveLength(2)
    expect(skipped.map(s => s.motivo)).toContain('IBAN mancante o non valido')
    expect(skipped.map(s => s.motivo)).toContain('importo non positivo')
  })

  it('lancia se IBAN azienda mancante/non valido', () => {
    expect(() => generateSepaXml({ debtor: { nome: 'X', iban: 'bad' }, payments: [{ iban: IBAN_DE, importo: 1 }], ...opts }))
      .toThrow(/IBAN.*azienda/i)
  })

  it('lancia se nessuna fattura pagabile', () => {
    expect(() => generateSepaXml({ debtor, payments: [{ iban: 'XX', importo: 1 }], ...opts }))
      .toThrow(/Nessuna fattura pagabile/i)
  })
})
