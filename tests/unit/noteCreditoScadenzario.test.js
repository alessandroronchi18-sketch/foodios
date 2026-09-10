// Le note di credito devono COMPENSARE il debito verso quel fornitore, non
// restare un credito appeso.
//
// PERCHE' QUESTO TEST ESISTE: nell'archivio di Mara le note di credito sono
// zero, quindi tutto il percorso non è mai stato provato su dati veri. Prima
// che arrivi la prima — e arriva sempre, appena un fornitore sbaglia una
// consegna — va verificato che il segno sia quello giusto in ogni punto:
// nel residuo, nell'ordine di pagamento, nell'imputazione di un bonifico,
// nell'estratto conto e nella riconciliazione bancaria. Un segno sbagliato
// qui fa pagare due volte.
import { describe, it, expect } from 'vitest'
import {
  residuoDa, ordinePagamento, imputaPagamento, testoEstrattoConto,
} from '../../src/lib/pagamentiFornitore'
import { proponiAbbinamenti } from '../../src/lib/riconciliazioneBanca'

const doc = (p) => ({
  id: p.id, fornitore: p.forn || 'MOLINO ROSSI', numero_rif: p.n || null,
  data_fattura: p.data, dueIso: p.due || p.data,
  totale: p.tot, importo_pagato: p.pagato || 0,
  stato: p.stato || 'da_pagare', tipo: p.tipo || 'fattura',
})

describe('note di credito: il segno', () => {
  it('una nota di credito abbassa il dovuto, non lo alza', () => {
    const fatture = [
      doc({ id: 'f', data: '2026-03-01', tot: 1000 }),
      doc({ id: 'nc', data: '2026-03-05', tot: 250, tipo: 'nota_credito' }),
    ]
    const dovuto = fatture.reduce((s, f) => s + residuoDa(f), 0)
    expect(dovuto).toBe(750)
  })

  it('la nota di credito si usa PRIMA delle fatture: un credito fermo non serve a niente', () => {
    const ordine = ordinePagamento([
      doc({ id: 'vecchia', data: '2026-01-01', tot: 500 }),
      doc({ id: 'nc', data: '2026-06-01', tot: 100, tipo: 'nota_credito' }),
    ]).map(x => x.id)
    expect(ordine[0]).toBe('nc')
  })

  it('con 750 di dovuto, un bonifico da 750 chiude tutto usando il credito', () => {
    const piano = imputaPagamento([
      doc({ id: 'f', data: '2026-03-01', tot: 1000 }),
      doc({ id: 'nc', data: '2026-03-05', tot: 250, tipo: 'nota_credito' }),
    ], 750)
    expect(piano.dovutoTotale).toBe(750)
    expect(piano.creditiUsati).toBe(250)
    expect(piano.righe.find(r => r.id === 'f').saldata).toBe(true)
    expect(piano.righe.find(r => r.id === 'nc').saldata).toBe(true)
    // Niente eccedenza: i 750 pagati più i 250 di credito coprono i 1.000.
    expect(piano.eccedenza).toBe(0)
  })

  it('il credito più grande del debito: si chiude quello che si può e il resto resta credito', () => {
    const piano = imputaPagamento([
      doc({ id: 'f', data: '2026-03-01', tot: 100 }),
      doc({ id: 'nc', data: '2026-03-05', tot: 400, tipo: 'nota_credito' }),
    ], 0)
    // Senza pagare niente, il credito da solo copre la fattura.
    expect(piano.dovutoTotale).toBe(-300)
    expect(piano.righe.find(r => r.id === 'f')?.saldata).toBe(true)
    // E avanza credito: NON si spalma su fatture che non esistono.
    expect(piano.eccedenza).toBe(300)
  })

  it('nell\'estratto conto al fornitore i crediti stanno a parte, col totale netto', () => {
    const t = testoEstrattoConto('MOLINO ROSSI', [
      doc({ id: 'f', n: '120', data: '2026-03-01', tot: 1000 }),
      doc({ id: 'nc', n: 'NC/3', data: '2026-03-05', tot: 250, tipo: 'nota_credito' }),
    ])
    expect(t).toContain('A nostro credito')
    expect(t).toContain('NC/3')
    expect(t).toContain('Totale a saldo: 750,00 €')
  })

  it('la riconciliazione bancaria NON abbina un\'uscita a una nota di credito', () => {
    // Un credito non si paga: se un bonifico ha lo stesso importo di una NC è
    // una coincidenza, e abbinarlo chiuderebbe il credito senza motivo.
    const { abbinamenti, nonAbbinati } = proponiAbbinamenti([
      { data: '2026-03-10', importo: 250, descrizione: 'BONIFICO MOLINO ROSSI' },
    ], [doc({ id: 'nc', data: '2026-03-05', tot: 250, tipo: 'nota_credito' })])
    expect(abbinamenti).toHaveLength(0)
    expect(nonAbbinati).toHaveLength(1)
  })
})
