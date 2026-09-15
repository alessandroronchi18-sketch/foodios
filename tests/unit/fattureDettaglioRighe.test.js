// @vitest-environment happy-dom
// Il dettaglio riga di una fattura elettronica, letto fino in fondo.
//
// È il dato con cui si calcola quanto costa DAVVERO un ingrediente e come
// cambia nel tempo: prodotto, quantità, unità, prezzo unitario, aliquota.
// `parseFatturaXML` scorreva già quel blocco, ma teneva solo le prime tre
// descrizioni incollate in un campo `note` e scartava tutto il resto.

import { describe, it, expect } from 'vitest'
import { parseFatturaXML } from '../../src/lib/parseFatturaXML.js'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
 <FatturaElettronicaHeader>
  <CedentePrestatore><DatiAnagrafici>
    <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
    <Anagrafica><Denominazione>Latteria Alpina Srl</Denominazione></Anagrafica>
  </DatiAnagrafici></CedentePrestatore>
 </FatturaElettronicaHeader>
 <FatturaElettronicaBody>
  <DatiGenerali><DatiGeneraliDocumento>
    <TipoDocumento>TD01</TipoDocumento><Data>2026-09-01</Data><Numero>2026/451</Numero>
    <ImportoTotaleDocumento>244.00</ImportoTotaleDocumento>
  </DatiGeneraliDocumento></DatiGenerali>
  <DatiBeniServizi>
   <DettaglioLinee>
    <NumeroLinea>1</NumeroLinea>
    <CodiceArticolo><CodiceTipo>EAN</CodiceTipo><CodiceValore>8001234567890</CodiceValore></CodiceArticolo>
    <Descrizione>Panna fresca 35% MG</Descrizione>
    <Quantita>20.00</Quantita><UnitaMisura>LT</UnitaMisura>
    <PrezzoUnitario>4.20</PrezzoUnitario><PrezzoTotale>84.00</PrezzoTotale>
    <AliquotaIVA>10.00</AliquotaIVA>
   </DettaglioLinee>
   <DettaglioLinee>
    <NumeroLinea>2</NumeroLinea>
    <Descrizione>Latte intero UHT</Descrizione>
    <Quantita>100.00</Quantita><UnitaMisura>LT</UnitaMisura>
    <PrezzoUnitario>1.36</PrezzoUnitario>
    <AliquotaIVA>10.00</AliquotaIVA>
   </DettaglioLinee>
   <DatiRiepilogo><AliquotaIVA>10.00</AliquotaIVA><ImponibileImporto>220.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo>
  </DatiBeniServizi>
  <DatiPagamento><DettaglioPagamento>
    <DataScadenzaPagamento>2026-10-31</DataScadenzaPagamento>
    <IBAN>IT60X0542811101000000123456</IBAN>
  </DettaglioPagamento></DatiPagamento>
 </FatturaElettronicaBody>
</p:FatturaElettronica>`

describe('una fattura vera, con la radice come la scrive lo SDI', () => {
  const f = parseFatturaXML(XML)[0]

  it('la radice col prefisso `p:` non fa respingere il file', () => {
    // Le fatture che escono dallo SDI hanno quasi sempre `<p:FatturaElettronica>`.
    // Il controllo era un selettore senza prefisso: un browser la trova lo
    // stesso guardando il nome locale, ma non è una gentilezza su cui
    // appoggiare la porta che decide se un file intero entra o no.
    expect(f).toBeDefined()
    expect(f.fornitore).toBe('Latteria Alpina Srl')
  })

  it('i dati di testa si leggono', () => {
    expect(f.numero_rif).toBe('2026/451')
    expect(f.totale).toBe(244)
    expect(f.imponibile).toBe(220)
    expect(f.imposta).toBe(22)
    expect(f.iban).toBe('IT60X0542811101000000123456')
    expect(f.data_scadenza).toBe('2026-10-31')
  })

  it('e con loro tutte le righe', () => {
    expect(f.righe).toHaveLength(2)
  })

  it('la prima riga ha tutto: codice, quantità, prezzo unitario, aliquota', () => {
    expect(f.righe[0]).toEqual({
      n: 1, codice: '8001234567890', descrizione: 'Panna fresca 35% MG',
      quantita: 20, unita: 'LT', prezzo_unitario: 4.2, totale: 84, iva_pct: 10,
    })
  })

  it('e quando il totale della riga manca, si ricava', () => {
    // 100 LT × 1,36 €: è quello che farebbe chiunque guardando la carta.
    expect(f.righe[1].totale).toBe(136)
    expect(f.righe[1].codice).toBeNull()
  })

  it('il campo note resta com\'era, per non rompere chi lo legge già', () => {
    expect(f.note).toContain('Panna fresca')
  })
})

describe('un file che non è una fattura', () => {
  it('viene respinto con una frase che si capisce', () => {
    expect(() => parseFatturaXML('<Qualcosa><Altro/></Qualcosa>'))
      .toThrow(/non sembra una fattura elettronica italiana/)
  })
})
