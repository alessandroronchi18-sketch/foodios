import { describe, it, expect } from 'vitest'
import {
  residuoDa, ordinePagamento, imputaPagamento, terminiOsservati,
  ricorrenti, fattureAnomale, testoEstrattoConto,
} from '../../src/lib/pagamentiFornitore'

const ft = (p) => ({
  id: p.id, fornitore: p.fornitore || 'CONO ARTIC', numero_rif: p.n || null,
  data_fattura: p.data, data_scadenza: p.scad || null, dueIso: p.due || p.scad || p.data,
  totale: p.tot, importo_pagato: p.pagato || 0,
  stato: p.stato || 'da_pagare', tipo: p.tipo || 'fattura',
  data_pagamento: p.dataPag || null,
})

describe('residuoDa', () => {
  it('una pagata non ha residuo', () => {
    expect(residuoDa(ft({ id: 1, data: '2026-01-01', tot: 100, stato: 'pagata' }))).toBe(0)
  })
  it('sottrae l\'acconto già versato', () => {
    expect(residuoDa(ft({ id: 1, data: '2026-01-01', tot: 100, pagato: 30 }))).toBe(70)
  })
  it('una nota di credito è NEGATIVA: è un credito, non un debito', () => {
    expect(residuoDa(ft({ id: 1, data: '2026-01-01', tot: 50, tipo: 'nota_credito' }))).toBe(-50)
  })
})

describe('ordinePagamento', () => {
  it('prima le note di credito, poi dalla più vecchia', () => {
    const ordine = ordinePagamento([
      ft({ id: 'b', data: '2026-03-01', tot: 100 }),
      ft({ id: 'nc', data: '2026-05-01', tot: 20, tipo: 'nota_credito' }),
      ft({ id: 'a', data: '2026-01-01', tot: 100 }),
    ]).map(f => f.id)
    expect(ordine).toEqual(['nc', 'a', 'b'])
  })
  it('a pari data paga prima la più grossa: chiude più debito con lo stesso giro', () => {
    const ordine = ordinePagamento([
      ft({ id: 'piccola', data: '2026-01-01', tot: 50 }),
      ft({ id: 'grossa', data: '2026-01-01', tot: 900 }),
    ]).map(f => f.id)
    expect(ordine).toEqual(['grossa', 'piccola'])
  })
  it('le pagate restano fuori', () => {
    expect(ordinePagamento([ft({ id: 'x', data: '2026-01-01', tot: 100, stato: 'pagata' })])).toHaveLength(0)
  })
})

describe('imputaPagamento — il caso CONO ARTIC', () => {
  const tre = [
    ft({ id: 'a', n: '1/100', data: '2026-01-10', tot: 1000 }),
    ft({ id: 'b', n: '1/200', data: '2026-02-10', tot: 1000 }),
    ft({ id: 'c', n: '1/300', data: '2026-03-10', tot: 1000 }),
  ]

  it('un bonifico da 2.500 € chiude due fatture e ne lascia una a metà', () => {
    const p = imputaPagamento(tre, 2500)
    expect(p.chiuse).toBe(2)
    expect(p.parziali).toBe(1)
    expect(p.usato).toBe(2500)
    expect(p.eccedenza).toBe(0)
    expect(p.righe.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(p.righe[2].imputato).toBe(500)
    expect(p.righe[2].residuoDopo).toBe(500)
    expect(p.righe[2].saldata).toBe(false)
  })

  it('paga dalla più vecchia, non dalla prima della lista', () => {
    const p = imputaPagamento([tre[2], tre[0], tre[1]], 1000)
    expect(p.righe[0].id).toBe('a')
    expect(p.chiuse).toBe(1)
  })

  it('l\'importo che supera il dovuto NON si spalma: resta fuori e si dichiara', () => {
    const p = imputaPagamento(tre, 5000)
    expect(p.usato).toBe(3000)
    expect(p.eccedenza).toBe(2000)
    expect(p.chiuse).toBe(3)
  })

  it('gli acconti già versati contano: 700 chiudono una fattura da 1.000 con 300 già dati', () => {
    const p = imputaPagamento([ft({ id: 'x', data: '2026-01-01', tot: 1000, pagato: 300 })], 700)
    expect(p.chiuse).toBe(1)
    expect(p.righe[0].residuoPrima).toBe(700)
    expect(p.righe[0].residuoDopo).toBe(0)
  })

  it('una nota di credito si USA: aumenta quello che il pagamento riesce a chiudere', () => {
    const p = imputaPagamento([
      ft({ id: 'nc', data: '2026-01-05', tot: 400, tipo: 'nota_credito' }),
      ft({ id: 'f1', data: '2026-01-10', tot: 1000 }),
    ], 600)
    // 600 pagati + 400 di credito = 1.000: la fattura si chiude tutta
    expect(p.creditiUsati).toBe(400)
    expect(p.righe.find(r => r.id === 'f1').saldata).toBe(true)
    expect(p.dovutoTotale).toBe(600)
  })

  it('importo zero o negativo: nessuna riga toccata', () => {
    expect(imputaPagamento(tre, 0).righe).toHaveLength(0)
    expect(imputaPagamento(tre, -50).righe).toHaveLength(0)
  })

  it('i centesimi tornano: 33,33 su tre fatture da 11,11', () => {
    const p = imputaPagamento([
      ft({ id: 'a', data: '2026-01-01', tot: 11.11 }),
      ft({ id: 'b', data: '2026-01-02', tot: 11.11 }),
      ft({ id: 'c', data: '2026-01-03', tot: 11.11 }),
    ], 33.33)
    expect(p.chiuse).toBe(3)
    expect(p.eccedenza).toBe(0)
    expect(p.usato).toBe(33.33)
  })
})

describe('terminiOsservati', () => {
  const pagata = (data, dataPag) => ft({ id: data, data, tot: 100, stato: 'pagata', dataPag })

  it('impara la mediana dei giorni, non la media: un ritardo non sposta tutto', () => {
    const t = terminiOsservati([
      pagata('2026-01-01', '2026-01-31'),   // 30
      pagata('2026-02-01', '2026-03-03'),   // 30
      pagata('2026-03-01', '2026-03-31'),   // 30
      pagata('2026-04-01', '2026-10-01'),   // 183, il ritardo
    ])
    expect(t.giorni).toBe(30)
    expect(t.proposto).toBe(30)
    expect(t.campione).toBe(4)
    expect(t.max).toBe(183)
  })

  it('con meno di tre pagamenti non si inventa un termine', () => {
    expect(terminiOsservati([pagata('2026-01-01', '2026-01-31')])).toBeNull()
    expect(terminiOsservati([])).toBeNull()
  })

  it('propone il numero tondo più vicino: 57 giorni diventa "60"', () => {
    const t = terminiOsservati([
      pagata('2026-01-01', '2026-02-27'),   // 57
      pagata('2026-02-01', '2026-03-30'),   // 57
      pagata('2026-03-01', '2026-04-27'),   // 57
    ])
    expect(t.giorni).toBe(57)
    expect(t.proposto).toBe(60)
  })

  it('scarta i dati impossibili: pagamento prima della fattura, o di due anni dopo', () => {
    const t = terminiOsservati([
      pagata('2026-03-01', '2026-01-01'),   // negativo: scartato
      pagata('2024-01-01', '2026-01-01'),   // 731 giorni: scartato
      pagata('2026-01-01', '2026-01-31'),
      pagata('2026-02-01', '2026-03-03'),
    ])
    expect(t).toBeNull()   // ne restano due: sotto il minimo
  })
})

describe('ricorrenti', () => {
  const bolletta = (mese, tot) => ft({ id: `enel-${mese}`, fornitore: 'Enel Energia', data: `${mese}-15`, tot })

  it('riconosce il canone: una al mese, importi simili', () => {
    const r = ricorrenti([
      bolletta('2026-01', 480), bolletta('2026-02', 510),
      bolletta('2026-03', 495), bolletta('2026-04', 505),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].nome).toBe('Enel Energia')
    expect(r[0].ricorrenza).toBe('canone')
    expect(r[0].mesi).toBe(4)
  })

  it('una fornitura ordinata tre volte al mese NON è un canone', () => {
    const tante = []
    for (const m of ['2026-01', '2026-02', '2026-03']) {
      for (const g of ['05', '15', '25']) {
        tante.push(ft({ id: `${m}-${g}`, fornitore: 'CONO ARTIC', data: `${m}-${g}`, tot: 800 }))
      }
    }
    expect(ricorrenti(tante)).toHaveLength(0)
  })

  it('importi che ballano molto: mensile ma non canone', () => {
    const r = ricorrenti([
      bolletta('2026-01', 100), bolletta('2026-02', 900),
      bolletta('2026-03', 200), bolletta('2026-04', 1500),
    ])
    expect(r[0].ricorrenza).toBe('mensile-variabile')
  })

  it('con due mesi soli non si conclude niente', () => {
    expect(ricorrenti([bolletta('2026-01', 480), bolletta('2026-02', 490)])).toHaveLength(0)
  })
})

describe('fattureAnomale — il caso GECKO', () => {
  it('segnala la fattura fuori scala rispetto alla mediana di quel fornitore', () => {
    const lista = [
      ft({ id: 1, fornitore: 'DESA', data: '2026-01-01', tot: 1000 }),
      ft({ id: 2, fornitore: 'DESA', data: '2026-02-01', tot: 1100 }),
      ft({ id: 3, fornitore: 'DESA', data: '2026-03-01', tot: 900 }),
      ft({ id: 4, fornitore: 'DESA', data: '2026-04-01', tot: 1050 }),
      ft({ id: 5, fornitore: 'DESA', data: '2026-05-01', tot: 86651 }),   // il punto di troppo
    ]
    const a = fattureAnomale(lista)
    expect(a).toHaveLength(1)
    expect(a[0].id).toBe(5)
    expect(a[0].mediana).toBe(1050)
    expect(a[0].quanteVolte).toBeGreaterThan(80)
  })

  it('con poca storia non si accusa nessuno', () => {
    expect(fattureAnomale([
      ft({ id: 1, fornitore: 'X', data: '2026-01-01', tot: 100 }),
      ft({ id: 2, fornitore: 'X', data: '2026-02-01', tot: 90000 }),
    ])).toHaveLength(0)
  })

  it('gli importi piccoli non fanno rumore anche se sono dieci volte la mediana', () => {
    const lista = [1, 2, 3, 4].map(i => ft({ id: i, fornitore: 'Y', data: `2026-0${i}-01`, tot: 10 }))
    lista.push(ft({ id: 9, fornitore: 'Y', data: '2026-05-01', tot: 300 }))
    expect(fattureAnomale(lista)).toHaveLength(0)
  })
})

describe('testoEstrattoConto', () => {
  it('elenca le aperte con gli acconti, i crediti a parte, e il totale', () => {
    const t = testoEstrattoConto('CONO ARTIC', [
      ft({ id: 'a', n: '1/100', data: '2026-01-10', tot: 1000, pagato: 300 }),
      ft({ id: 'b', n: '1/200', data: '2026-02-10', tot: 500 }),
      ft({ id: 'nc', n: 'NC/5', data: '2026-02-20', tot: 200, tipo: 'nota_credito' }),
    ], { nomeAzienda: 'Mara dei Boschi', oggiIso: '2026-09-10' })
    expect(t).toContain('1/100')
    expect(t).toContain('acconto di 300,00 €')
    expect(t).toContain('A nostro credito')
    expect(t).toContain('NC/5')
    // 700 + 500 - 200 = 1.000
    expect(t).toContain('Totale a saldo: 1.000,00 €')
    expect(t).toContain('Mara dei Boschi')
    expect(t).toContain('10/09/2026')
  })
})
