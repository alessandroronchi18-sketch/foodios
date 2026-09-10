// Una giornata importata da un registro incassi NON ha un food cost noto.
//
// Nasce da un file di sonda lasciato da un audit (tests/unit/_audit_tmp.test.js)
// che asseriva il contrario: `expect(foodcostNoto(g)).toBe(true)` su una
// giornata con totFC 0. Era il difetto, non il comportamento giusto.
//
// Perché conta: foodcostNoto() decide chi entra nei conti come "food cost
// misurato". Con gli import che rispondevano true e un food cost a 0, il food
// cost del periodo risultava più basso del vero, e l'incidenza delle perdite
// — che si calcola proprio su quel denominatore — più alta.
import { describe, it, expect } from 'vitest'
import { foodcostNoto } from '../../src/lib/chiusure'
import { mergeInChiusureCassa } from '../../src/lib/importCassa'
import { mergeInChiusure } from '../../src/lib/importDelivery'

describe('food cost di una giornata importata', () => {
  it('cassa: la giornata nuova dichiara "solo totale" e food cost NON noto', () => {
    const nuove = mergeInChiusureCassa([], [{ data: '2026-08-01', importo: 812.5, iva: 0, fonte: 'Cassa in Cloud' }], 'cassaincloud')
    const g = nuove[0]
    expect(g.solo_totale).toBe(true)
    expect(g.foodcost_noto).toBe(false)
    expect(foodcostNoto(g)).toBe(false)
    // I soldi invece li sa, e sono quelli.
    expect(g.kpi.totV).toBe(812.5)
    expect(g.kpi.totFC).toBe(0)
  })

  it('delivery: stessa regola', () => {
    const nuove = mergeInChiusure([], [{ data: '2026-08-02', netto: 210, lordo: 250, commissioni: 40 }], 'Deliveroo')
    const g = nuove.find(x => x.data === '2026-08-02')
    expect(foodcostNoto(g)).toBe(false)
  })

  it('una chiusura fatta col dettaglio prodotti invece SÌ', () => {
    expect(foodcostNoto({ data: '2026-08-03', venduto: [{ nome: 'CONO' }], kpi: { totFC: 120 } })).toBe(true)
  })

  it('quello che il titolare ha dichiarato al salvataggio vince su tutto', () => {
    expect(foodcostNoto({ solo_totale: true, foodcost_noto: true })).toBe(true)
    expect(foodcostNoto({ venduto: [{ nome: 'X' }], foodcost_noto: false })).toBe(false)
  })
})
