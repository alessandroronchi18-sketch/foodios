// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { autoDetectFormat } from '../../src/lib/autoDetectFormat.js'

// Fake File minimale: name + text()
const fakeFile = (name, text, opts = {}) => ({
  name,
  text: async () => { if (opts.throwText) throw new Error('read fail'); return text },
})

const XML_FATTURA = `<?xml version="1.0"?>
<FatturaElettronica>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <Numero>1</Numero><Data>2026-01-01</Data><ImportoTotaleDocumento>10.00</ImportoTotaleDocumento>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi><DatiRiepilogo><ImponibileImporto>10</ImponibileImporto><Imposta>0</Imposta></DatiRiepilogo></DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

describe('autoDetectFormat', () => {
  it('XML FatturaPA → fattura_elettronica_xml con dati', async () => {
    const r = await autoDetectFormat(fakeFile('fattura.xml', XML_FATTURA))
    expect(r.formato).toBe('fattura_elettronica_xml')
    expect(r.errori).toEqual([])
    expect(r.dati).toHaveLength(1)
  })

  it('XML non-fattura → xml_generico con errore', async () => {
    const r = await autoDetectFormat(fakeFile('altro.xml', '<root><x/></root>'))
    expect(r.formato).toBe('xml_generico')
    expect(r.dati).toEqual([])
    expect(r.errori[0]).toMatch(/FatturaElettronica/)
  })

  it('estensione .p7m è trattata come XML firmato', async () => {
    const r = await autoDetectFormat(fakeFile('fattura.xml.p7m', XML_FATTURA))
    expect(r.formato).toBe('fattura_elettronica_xml')
  })

  it('CSV → rimanda ai parser Zucchetti', async () => {
    const r = await autoDetectFormat(fakeFile('export.csv', 'a,b\n1,2'))
    expect(r.formato).toBe('csv')
    expect(r.errori[0]).toMatch(/Zucchetti/i)
  })

  it('estensione non supportata → sconosciuto', async () => {
    const r = await autoDetectFormat(fakeFile('foto.png', ''))
    expect(r.formato).toBe('sconosciuto')
    expect(r.errori[0]).toMatch(/non supportata/i)
  })

  it('errore di lettura file → sconosciuto con messaggio', async () => {
    const r = await autoDetectFormat(fakeFile('rotto.xml', '', { throwText: true }))
    expect(r.formato).toBe('sconosciuto')
    expect(r.errori[0]).toMatch(/Impossibile leggere/i)
  })
})
