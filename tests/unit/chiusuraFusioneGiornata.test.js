// Chiudere la stessa giornata due volte non cancella quello che già si sapeva.
//
// Una giornata si può chiudere in tre modi, anche lo stesso giorno: col
// dettaglio dei prodotti (si sa tutto), col solo totale dell'incasso (si sa
// quanto è entrato, non quanto è costato), o da un import di cassa o delivery.
// Chi arriva secondo non deve cancellare quello che sapeva il primo.
//
// Due difetti veri, trovati il 16/09/2026 mentre si scrivevano i test della
// pagina Cassa, tutti e due sul costo delle materie — cioè sul numero da cui
// dipende ogni margine del mese:
//
//  1. chi registrava il totale la mattina e il dettaglio dei prodotti la sera
//     restava con `solo_totale: true` e `foodcost_noto: false` della mattina:
//     il record del dettaglio non li dichiarava, e la fusione conservava
//     quelli vecchi. Il P&L legge quei due campi e **buttava via un food cost
//     che ormai era noto**;
//  2. il contrario: registrare il totale su una giornata già chiusa col
//     dettaglio azzerava `totFC` (210 → 0) e `totM` (602,40 → 0) e metteva il
//     sell-through a null, pur conservando il `confronto` da cui quei numeri
//     erano stati calcolati.
//
// La regola, in una riga: **il food cost non torna mai da noto a ignoto.**
//
// Prima la fusione era scritta due volte dentro la pagina, in due modi
// diversi; adesso è una funzione sola in `chiusure.js` ed è questa che si
// misura qui.

import { describe, it, expect } from 'vitest'
import { fondiChiusura, foodcostNoto } from '../../src/lib/chiusure'

const colDettaglio = {
  id: 'ch-2026-09-16', data: '2026-09-16',
  venduto: [{ nome: 'SACHER', qta: 10, totale: 300 }],
  confronto: [{ nome: 'SACHER', unitaV: 10, rv: 300, fcV: 210, marg: 90 }],
  formati: [],
  solo_totale: false, foodcost_noto: true,
  kpi: { totV: 812.40, totFC: 210, totM: 602.40, totS: 0, totMP: 74.1, avgST: 88 },
}

const soloTotale = {
  id: 'ch-2026-09-16', data: '2026-09-16',
  venduto: null, confronto: [], formati: [],
  solo_totale: true, foodcost_noto: false,
  kpi: { totV: 1000, totFC: 0, totM: 0, totS: 0, totMP: 0, avgST: null, pos: 700, contanti: 300 },
}

describe('il totale scritto a mano su una giornata già chiusa col dettaglio', () => {
  const fuso = fondiChiusura(colDettaglio, soloTotale)

  it('non cancella il costo delle materie', () => {
    // Era questo il difetto: 210 → 0.
    expect(fuso.kpi.totFC).toBe(210)
  })

  it('l\'incasso è quello nuovo: il totale a mano è il dato fiscale', () => {
    expect(fuso.kpi.totV).toBe(1000)
  })

  it('e il margine si rifà sui due, non resta quello vecchio', () => {
    expect(fuso.kpi.totM).toBe(790)          // 1000 − 210
    expect(fuso.kpi.totMP).toBeCloseTo(79, 1)
  })

  it('la giornata resta una giornata di cui si sa tutto', () => {
    expect(fuso.solo_totale).toBe(false)
    expect(fuso.foodcost_noto).toBe(true)
    expect(foodcostNoto(fuso)).toBe(true)
  })

  it('il dettaglio dei prodotti non si perde', () => {
    expect(fuso.confronto).toHaveLength(1)
    expect(fuso.venduto).toHaveLength(1)
  })

  it('e quello che solo il totale sapeva entra lo stesso', () => {
    expect(fuso.kpi.pos).toBe(700)
    expect(fuso.kpi.contanti).toBe(300)
  })

  it('il sell-through resta quello misurato, non diventa nullo', () => {
    // Non si può ricalcolare: dipende da quanto era stato prodotto, che questo
    // salvataggio non sa. Ma azzerarlo faceva scendere la media del mese.
    expect(fuso.kpi.avgST).toBe(88)
  })
})

describe('il dettaglio dei prodotti su una giornata registrata col solo totale', () => {
  const fuso = fondiChiusura(soloTotale, colDettaglio)

  it('la giornata smette di essere «solo totale»', () => {
    expect(fuso.solo_totale).toBe(false)
  })

  it('e il food cost diventa noto — era questo il difetto', () => {
    expect(fuso.foodcost_noto).toBe(true)
    expect(foodcostNoto(fuso)).toBe(true)
    expect(fuso.kpi.totFC).toBe(210)
  })

  it('i modi di pagamento del totale a mano restano', () => {
    expect(fuso.kpi.pos).toBe(700)
  })
})

describe('quello che ci sta intorno', () => {
  it('senza una giornata precedente, la nuova passa intera', () => {
    expect(fondiChiusura(null, soloTotale)).toBe(soloTotale)
    expect(fondiChiusura(undefined, colDettaglio)).toBe(colDettaglio)
  })

  it('gli import di cassa e delivery non spariscono', () => {
    const conImport = { ...soloTotale, cassaImport: [{ x: 1 }], deliveryImport: [{ y: 2 }] }
    const fuso = fondiChiusura(conImport, colDettaglio)
    expect(fuso.cassaImport).toHaveLength(1)
    expect(fuso.deliveryImport).toHaveLength(1)
  })

  it('due totali di fila: vince l\'ultimo, e resta una giornata senza food cost', () => {
    const secondo = { ...soloTotale, kpi: { ...soloTotale.kpi, totV: 1200 } }
    const fuso = fondiChiusura(soloTotale, secondo)
    expect(fuso.kpi.totV).toBe(1200)
    expect(fuso.solo_totale).toBe(true)
    expect(foodcostNoto(fuso)).toBe(false)
  })

  it('l\'identificativo della giornata non cambia sotto i piedi', () => {
    const fuso = fondiChiusura({ ...colDettaglio, id: 'ch-vecchio' }, { ...soloTotale, id: 'ch-nuovo' })
    expect(fuso.id).toBe('ch-vecchio')
  })

  it('un food cost a zero nel nuovo record non conta come «lo so»', () => {
    // `totFC: 0` è quello che scrive il salvataggio del solo totale: vuol dire
    // «non lo so», non «è costato zero». Se contasse come noto, il P&L
    // aggiungerebbe tutto l'incasso al margine.
    const fuso = fondiChiusura(colDettaglio, soloTotale)
    expect(fuso.kpi.totFC).not.toBe(0)
  })
})
