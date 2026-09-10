import { describe, it, expect } from 'vitest'
import {
  fornitoreDiIngrediente, costoGDaRigaOrdine, costiDaOrdine, raggruppaPerFornitore,
} from '../../src/lib/fornitoreIngrediente'

describe('costoGDaRigaOrdine', () => {
  it('kg e litri diventano costo per grammo', () => {
    expect(costoGDaRigaOrdine({ prezzo_unitario: 9.2, unita: 'kg' })).toBeCloseTo(0.0092, 6)
    expect(costoGDaRigaOrdine({ prezzo_unitario: 1.5, unita: 'l' })).toBeCloseTo(0.0015, 6)
  })
  it('grammi e millilitri sono già per unità', () => {
    expect(costoGDaRigaOrdine({ prezzo_unitario: 0.01, unita: 'g' })).toBe(0.01)
  })
  it('i pezzi NON si convertono: un uovo non pesa un grammo', () => {
    expect(costoGDaRigaOrdine({ prezzo_unitario: 0.35, unita: 'pz' })).toBeNull()
  })
  it('prezzo mancante o zero → null, non zero', () => {
    expect(costoGDaRigaOrdine({ prezzo_unitario: 0, unita: 'kg' })).toBeNull()
    expect(costoGDaRigaOrdine({ unita: 'kg' })).toBeNull()
  })
})

describe('costiDaOrdine', () => {
  const ordine = {
    id: 'ord-1', data_ordine: '2026-09-10', fornitore_nome: 'Latteria Rossi',
    righe_ordine: [
      { prodotto: 'Burro', quantita: 10, unita: 'kg', prezzo_unitario: 9.2 },
      { prodotto: 'Uova', quantita: 120, unita: 'pz', prezzo_unitario: 0.35 },
      { prodotto: 'Panna', quantita: 5, unita: 'l', prezzo_unitario: 2.5 },
    ],
  }

  it('scrive il prezzo, il fornitore e la data, e dice cosa cambia', () => {
    const { nuovi, cambi, nonConvertibili } = costiDaOrdine({ panna: { costoG: 0.0047, costoKg: 4.7 } }, ordine)
    expect(nuovi.burro.costoKg).toBeCloseTo(9.2, 4)
    expect(nuovi.burro.fornitore).toBe('Latteria Rossi')
    expect(nuovi.burro.prezzoAggiornatoAl).toBe('2026-09-10')
    // la panna c'era già a 4,70: il cambio va dichiarato col prima e il dopo
    const panna = cambi.find(c => c.nome === 'Panna')
    expect(panna.da).toBeCloseTo(4.7, 4)
    expect(panna.a).toBeCloseTo(2.5, 4)
    expect(panna.primaVolta).toBe(false)
    // il burro è nuovo
    expect(cambi.find(c => c.nome === 'Burro').primaVolta).toBe(true)
    // le uova sono a pezzi: non si inventa un costo al grammo, e si dichiara
    expect(nonConvertibili).toEqual([{ nome: 'Uova', unita: 'pz' }])
  })

  it('non riscrive un prezzo identico', () => {
    const { cambi } = costiDaOrdine({ burro: { costoG: 0.0092 } }, {
      ...ordine, righe_ordine: [{ prodotto: 'Burro', unita: 'kg', prezzo_unitario: 9.2 }],
    })
    expect(cambi).toHaveLength(0)
  })

  it('è pura: non tocca la mappa in ingresso', () => {
    const originale = { panna: { costoG: 0.0047 } }
    costiDaOrdine(originale, ordine)
    expect(originale.panna.costoG).toBe(0.0047)
    expect(originale.burro).toBeUndefined()
  })
})

describe('fornitoreDiIngrediente', () => {
  it('null quando non lo sappiamo (non una stringa vuota)', () => {
    expect(fornitoreDiIngrediente({ burro: { costoG: 1 } }, 'burro')).toBeNull()
    expect(fornitoreDiIngrediente({}, 'burro')).toBeNull()
  })
  it('trova il fornitore anche se il nome è scritto diverso', () => {
    const m = { burro: { fornitore: 'Latteria Rossi', prezzoAggiornatoAl: '2026-09-10' } }
    expect(fornitoreDiIngrediente(m, '  BURRO ')?.nome).toBe('Latteria Rossi')
  })
})

describe('raggruppaPerFornitore', () => {
  it('un gruppo per fornitore, e chi non ce l\'ha finisce in fondo dichiarato', () => {
    const ing = {
      burro: { fornitore: 'Latteria Rossi' },
      cacao: { fornitore: 'Cioccolateria Sud' },
      sale: {},
    }
    const g = raggruppaPerFornitore([{ nome: 'sale' }, { nome: 'burro' }, { nome: 'cacao' }], ing)
    expect(g.map(x => x.fornitore)).toEqual(['Cioccolateria Sud', 'Latteria Rossi', null])
    expect(g[2].righe).toEqual([{ nome: 'sale' }])
  })
})

// ── Chi non è merce: la pre-selezione dell'import da fatture ─────────────
import { motivoNonMerce, marcaNonMerce } from '../../src/lib/fornitoriDaFatture'

describe('motivoNonMerce', () => {
  it('riconosce utenze, enti, commissioni e professionisti veri di Mara', () => {
    expect(motivoNonMerce('ENEL ENERGIA SPA')).toMatch(/utenze/)
    expect(motivoNonMerce('Eni Plenitude')).toMatch(/utenze/)
    expect(motivoNonMerce('FASTWEB SPA')).toMatch(/telefono/)
    expect(motivoNonMerce('INPS')).toMatch(/contributi/)
    expect(motivoNonMerce('Deliveroo Italy srl')).toMatch(/commissioni/)
    expect(motivoNonMerce('JUST-EAT ITALIA')).toMatch(/commissioni/)
    expect(motivoNonMerce('TeamSystem')).toMatch(/professionali/)
    expect(motivoNonMerce('Pixartprinting')).toMatch(/stampa/)
    expect(motivoNonMerce('EasyPark Italia')).toMatch(/servizi vari/)
  })
  it('un fornitore di merce non viene marcato', () => {
    expect(motivoNonMerce('Molino Rossi')).toBeNull()
    expect(motivoNonMerce('Agrimontana')).toBeNull()
    expect(motivoNonMerce('Latteria Sociale')).toBeNull()
    expect(motivoNonMerce('Frutta Felicità')).toBeNull()
  })
  it('marcaNonMerce non butta via niente: aggiunge solo il motivo', () => {
    const voci = marcaNonMerce([{ nome: 'ENEL' }, { nome: 'Molino Rossi' }])
    expect(voci).toHaveLength(2)
    expect(voci[0].nonMerce).toBe(true)
    expect(voci[1].nonMerce).toBe(false)
  })
})
