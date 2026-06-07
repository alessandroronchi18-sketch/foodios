// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { parseFatturaXML } from '../../src/lib/parseFatturaXML.js'

const XML_OK = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica versione="FPR12">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678901</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>Molino Rossi SRL</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <Numero>123</Numero>
        <Data>2026-01-15</Data>
        <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><Descrizione>Farina 00 25kg</Descrizione><PrezzoTotale>100.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DatiRiepilogo><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

describe('parseFatturaXML', () => {
  it('estrae fornitore, numero, data, imponibile/imposta/totale', () => {
    const f = parseFatturaXML(XML_OK)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({
      numero_rif: '123',
      data_fattura: '2026-01-15',
      fornitore: 'Molino Rossi SRL',
      piva: '12345678901',
      imponibile: 100,
      imposta: 22,
      totale: 122,
      stato: 'da_pagare',
    })
    expect(f[0].note).toContain('Farina 00')
  })

  it('rifiuta XML che non è una fattura elettronica', () => {
    expect(() => parseFatturaXML('<root><foo/></root>')).toThrow(/FatturaElettronica/)
  })

  it('lancia se manca il corpo fattura', () => {
    expect(() => parseFatturaXML('<FatturaElettronica><FatturaElettronicaHeader/></FatturaElettronica>')).toThrow(/corpo/)
  })

  it('somma più corpi fattura (lotto)', () => {
    const due = XML_OK.replace('</FatturaElettronica>', `
      <FatturaElettronicaBody>
        <DatiGenerali><DatiGeneraliDocumento>
          <Numero>124</Numero><Data>2026-01-16</Data><ImportoTotaleDocumento>61.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento></DatiGenerali>
        <DatiBeniServizi><DatiRiepilogo><ImponibileImporto>50.00</ImponibileImporto><Imposta>11.00</Imposta></DatiRiepilogo></DatiBeniServizi>
      </FatturaElettronicaBody>
    </FatturaElettronica>`)
    const f = parseFatturaXML(due)
    expect(f).toHaveLength(2)
    expect(f[1]).toMatchObject({ numero_rif: '124', totale: 61, imponibile: 50 })
  })

  it('default: tipo=fattura, scadenza null, iban vuoto se non specificati', () => {
    const f = parseFatturaXML(XML_OK)
    expect(f[0].tipo).toBe('fattura')
    expect(f[0].data_scadenza).toBeNull()
    expect(f[0].iban).toBe('')
  })

  it('estrae scadenza reale e IBAN dal blocco DatiPagamento', () => {
    const xml = XML_OK.replace('</DatiBeniServizi>', `</DatiBeniServizi>
      <DatiPagamento><DettaglioPagamento>
        <DataScadenzaPagamento>2026-03-15</DataScadenzaPagamento>
        <ImportoPagamento>122.00</ImportoPagamento>
        <IBAN>IT60 X054 2811 1010 0000 0123 456</IBAN>
      </DettaglioPagamento></DatiPagamento>`)
    const f = parseFatturaXML(xml)
    expect(f[0].data_scadenza).toBe('2026-03-15')
    expect(f[0].iban).toBe('IT60X0542811101000000123456')
  })

  it('con più rate prende la scadenza più lontana', () => {
    const xml = XML_OK.replace('</DatiBeniServizi>', `</DatiBeniServizi>
      <DatiPagamento>
        <DettaglioPagamento><DataScadenzaPagamento>2026-03-15</DataScadenzaPagamento></DettaglioPagamento>
        <DettaglioPagamento><DataScadenzaPagamento>2026-04-15</DataScadenzaPagamento></DettaglioPagamento>
      </DatiPagamento>`)
    const f = parseFatturaXML(xml)
    expect(f[0].data_scadenza).toBe('2026-04-15')
  })

  it('riconosce la nota di credito (TD04) come tipo=nota_credito', () => {
    const xml = XML_OK.replace('<Numero>123</Numero>', '<TipoDocumento>TD04</TipoDocumento><Numero>NC1</Numero>')
    const f = parseFatturaXML(xml)
    expect(f[0].tipo).toBe('nota_credito')
  })
})
