import { describe, it, expect } from 'vitest'
import { parseZucchettiInfinity, parseZucchettiKassa } from '../../src/lib/importZucchetti.js'

describe('parseZucchettiInfinity', () => {
  it('parsa con header, gestisce migliaia IT e classifica entrata/uscita', () => {
    const csv = [
      'Data;Causale;Dare;Avere;Saldo;Descrizione',
      '01/02/2026;Acquisto;"1.000,00";0;"1.000,00";Fornitore X',
      '02/02/2026;Vendita;0;"500,00";"500,00";Cliente Y',
    ].join('\n')
    const mov = parseZucchettiInfinity(csv)
    expect(mov).toHaveLength(2)
    expect(mov[0]).toMatchObject({ data: '2026-02-01', dare: 1000, tipo: 'uscita', importo: 1000 })
    expect(mov[1]).toMatchObject({ data: '2026-02-02', avere: 500, tipo: 'entrata', importo: 500 })
  })

  it('funziona anche senza header (ordine colonne di default)', () => {
    const mov = parseZucchettiInfinity('15/03/2026;Pagamento;100;0;100;Tizio')
    expect(mov[0]).toMatchObject({ data: '2026-03-15', importo: 100, tipo: 'uscita' })
  })

  it('ignora righe senza data valida', () => {
    const csv = 'Data;Causale;Dare;Avere;Saldo;Descrizione\nTOTALE;;;;;\n01/01/2026;X;10;0;10;y'
    expect(parseZucchettiInfinity(csv)).toHaveLength(1)
  })

  it('lancia su file vuoto o senza movimenti', () => {
    expect(() => parseZucchettiInfinity('')).toThrow()
    expect(() => parseZucchettiInfinity('Data;Causale;Dare;Avere;Saldo;Descrizione\n')).toThrow()
  })
})

describe('parseZucchettiKassa', () => {
  it('aggrega per giorno con totali per metodo e reparto', () => {
    const csv = [
      'Data;Ora;Reparto;Importo;IVA;Metodo pagamento',
      '01/02/2026;10:00;Bar;"10,00";"2,20";contante',
      '01/02/2026;11:00;Cucina;"20,00";"4,40";carta',
      '02/02/2026;09:00;Bar;"5,00";"1,10";contante',
    ].join('\n')
    const { vendite, chiusure_giornaliere } = parseZucchettiKassa(csv)
    expect(vendite).toHaveLength(3)
    expect(chiusure_giornaliere).toHaveLength(2)
    const g1 = chiusure_giornaliere.find(c => c.data === '2026-02-01')
    expect(g1.totale).toBe(30)
    expect(g1.per_metodo).toEqual({ contante: 10, carta: 20 })
    expect(g1.per_reparto).toEqual({ Bar: 10, Cucina: 20 })
  })

  it('salta righe con importo 0', () => {
    const csv = 'Data;Ora;Reparto;Importo;IVA;Metodo pagamento\n01/02/2026;10:00;Bar;0;0;contante\n01/02/2026;11:00;Bar;"5,00";0;carta'
    expect(parseZucchettiKassa(csv).vendite).toHaveLength(1)
  })

  it('chiusure ordinate per data crescente', () => {
    const csv = [
      'Data;Ora;Reparto;Importo;IVA;Metodo pagamento',
      '05/02/2026;10:00;Bar;"5,00";0;contante',
      '01/02/2026;10:00;Bar;"5,00";0;contante',
    ].join('\n')
    expect(parseZucchettiKassa(csv).chiusure_giornaliere.map(c => c.data)).toEqual(['2026-02-01', '2026-02-05'])
  })

  it('lancia se nessuna vendita', () => {
    expect(() => parseZucchettiKassa('')).toThrow()
  })
})
