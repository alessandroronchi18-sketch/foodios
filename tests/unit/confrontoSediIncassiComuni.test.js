// Il Confronto sedi contava gli incassi in un modo suo, diverso dal Mese.
//
// Trovato il 05/10/2026 rileggendo la pagina sui dati veri di Mara. La stima
// dall'inventario scattava SOLO se la sede non aveva nessuna chiusura nel
// periodo (`nChiusureCur === 0`); il periodo prima e l'andamento delle 8
// settimane si leggevano solo dalle chiusure. Carlina a settembre ha 22
// chiusure su 30 giorni (44.848,60 € lordi): la pagina contava quelle e gli
// altri 8 giorni valevano zero, senza dirlo. Con UNA sola chiusura nel mese
// avrebbe mostrato l'incasso di un giorno come incasso del mese.
// E il Mese di Carlina diceva un'altra cifra: IVA esclusa, giorni senza dati
// dichiarati.
//
// Ora la pagina usa le stesse funzioni del Mese (`incassiSedeDelMese` e
// `incassiDaSedi`): stesso numero nelle due pagine.
//
// Le spese comuni (fatture di Berthollet e De Gasperi insieme, 40 da pagare
// sui dati veri) sparivano dalla pagina: la lettura non chiedeva la colonna
// `sedi_condivise`, quelle fatture non avevano `sede_id` e finivano sotto una
// chiave che nessuna colonna mostrava. Ora si dividono sui chili del mese
// della fattura (come il Conto economico e il Mese).
import { describe, it, expect } from 'vitest'
import { incassiSedePeriodo, andamentoSettimane, fattureDaPagarePerSede } from '../../src/lib/confrontoSediCalc'
import { incassiSedeDelMese } from '../../src/lib/ilMeseArchivio'
import { incassiDaSedi } from '../../src/lib/ilMese'

// Le chiusure vere di Carlina, settembre 2026 (22 giorni).
const SETT = [['01', 1592.2], ['02', 1861.7], ['03', 1830.7], ['04', 2393.3], ['05', 2647.75], ['06', 3070.03], ['07', 1595.75],
  ['08', 1802.4], ['09', 1043.3], ['10', 1566.0], ['11', 2432.2], ['12', 3565.9], ['13', 2797.0], ['14', 1659.05], ['15', 1599.1],
  ['18', 1913.9], ['20', 3034.0], ['21', 1351.7], ['22', 1548.6], ['27', 3153.98], ['29', 1253.9], ['30', 1136.14]]
const chiusure = SETT.map(([g, t]) => ({ data: `2026-09-${g}`, kpi: { totV: t } }))

describe('incassi del periodo = incassi del Mese', () => {
  it('con 22 chiusure su 30 giorni dichiara i giorni che mancano, non li conta zero in silenzio', () => {
    const r = incassiSedePeriodo({ chiusure, da: '2026-09-01', a: '2026-09-30', nome: 'Carlina' })
    expect(r.giorni).toBe(22)
    expect(r.lordo).toBeCloseTo(44848.6, 1)
    expect(r.valore).toBeCloseTo(40771.45, 1)
    expect(r.scoperti).toBe(8)
    expect(r.parziale).toBe(true)
    expect(r.testo).toMatch(/22 giorni dalla cassa/)
    expect(r.testo).toMatch(/8 giorni senza dati/)
  })

  it('è lo stesso numero che dà il Mese (stessa funzione, stesso conto)', () => {
    const parte = incassiSedeDelMese({ chiusure, righe: null, formati: null, da: '2026-09-01', a: '2026-09-30', nome: 'Carlina' })
    const mese = incassiDaSedi([parte])
    const conf = incassiSedePeriodo({ chiusure, da: '2026-09-01', a: '2026-09-30', nome: 'Carlina' })
    expect(conf.valore).toBe(mese.valore)
    expect(conf.scoperti).toBe(mese.scoperti)
  })

  it('una sola chiusura nel mese non diventa l\'incasso del mese: 29 giorni restano senza dati', () => {
    const r = incassiSedePeriodo({ chiusure: [chiusure[0]], da: '2026-09-01', a: '2026-09-30' })
    expect(r.giorni).toBe(1)
    expect(r.scoperti).toBe(29)
    expect(r.completo).toBe(false)
  })

  it('senza nessuna chiusura e senza inventario il valore è null, non zero', () => {
    const r = incassiSedePeriodo({ chiusure: [], da: '2026-10-01', a: '2026-10-05' })
    expect(r.valore).toBeNull()
    expect(r.scoperti).toBe(5)
  })

  it('il periodo prima si calcola come il periodo scelto, non solo dalle chiusure', () => {
    const agosto = incassiSedePeriodo({ chiusure: [{ data: '2026-08-06', kpi: { totV: 1605.7 } }], da: '2026-08-01', a: '2026-08-31' })
    expect(agosto.giorni).toBe(1)
    expect(agosto.scoperti).toBe(30)
  })
})

describe('andamento delle 8 settimane', () => {
  it('somma le sedi settimana per settimana, e dove nessuno ha dati dice null', () => {
    const sedi = [{ nome: 'Carlina', chiusure }, { nome: 'Berthollet', chiusure: [] }]
    const w = andamentoSettimane(sedi, '2026-09-30', 8)
    expect(w).toHaveLength(8)
    expect(w[7].lunIso).toBe('2026-09-28')
    // 29 e 30/9: 1.253,90 + 1.136,14 = 2.390,04 € lordi, 2.173 senza IVA
    expect(w[7].ricavi).toBeCloseTo(2172.76, 1)
    expect(w[0].lunIso).toBe('2026-08-10')
    expect(w[0].ricavi).toBeNull()
  })
})

describe('spese comuni sulle fatture da pagare', () => {
  const B = 'bert', D = 'dega'
  const fatture = [
    { id: 1, sede_id: null, sedi_condivise: [B, D], stato: 'da_pagare', totale: 1000, importo_pagato: 0, data_fattura: '2026-08-10' },
    { id: 2, sede_id: B, sedi_condivise: null, stato: 'da_pagare', totale: 300, importo_pagato: 0, data_fattura: '2026-08-12' },
  ]
  it('con i chili del mese divide in proporzione, non a metà', () => {
    const r = fattureDaPagarePerSede(fatture, '2026-10-05', () => ({ [B]: 3000, [D]: 1000 }))
    expect(r[B].ripartito).toBeCloseTo(750)
    expect(r[D].ripartito).toBeCloseTo(250)
    expect(r[B].importo).toBe(300)
    expect(r[B].ripartizioneStimata).toBe(false)
  })
  it('la somma delle sedi è quello che si deve: nessuna fattura persa nel limbo', () => {
    const r = fattureDaPagarePerSede(fatture, '2026-10-05', () => ({ [B]: 3000, [D]: 1000 }))
    const tot = Object.values(r).reduce((s, v) => s + v.importo + v.ripartito, 0)
    expect(tot).toBeCloseTo(1300)
  })
  it('senza chili del mese divide a parti uguali e lo dichiara', () => {
    const r = fattureDaPagarePerSede(fatture, '2026-10-05', () => null)
    expect(r[B].ripartito).toBeCloseTo(500)
    expect(r[D].ripartizioneStimata).toBe(true)
  })
  it('la mappa fissa funziona ancora (chi la passava prima)', () => {
    const r = fattureDaPagarePerSede(fatture, '2026-10-05', { [B]: 1000, [D]: 3000 })
    expect(r[D].ripartito).toBeCloseTo(750)
  })
})
