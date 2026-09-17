// «Fatture scadute: 0» quando ne erano scadute 410, per 150.193,60 €.
//
// Difetto trovato il 16/09/2026 dall'agente SOLDI dell'audit, leggendo
// `ConfrontoSedi.jsx:181`. La pagina che confronta i punti vendita contava le
// fatture in ritardo così:
//
//     if (f.data_scadenza && f.data_scadenza < todayIso) ...
//
// La colonna `data_scadenza` in produzione è VUOTA. Non «quasi sempre»: su
// 3.520 fatture è nulla 3.520 volte, e sulle 478 ancora aperte è nulla 478
// volte su 478. Gli XML di questi fornitori non portano il blocco
// DatiPagamento e nessun'altra strada di importazione la compila. Una
// condizione su un campo sempre nullo è sempre falsa: il contatore restava a
// zero, l'allarme rosso non si accendeva mai, e il punteggio della sede non
// veniva mai penalizzato.
//
// Misurato sul database vero il 17/09/2026:
//
//     regola vecchia (data_scadenza < oggi)                 0 scadute
//     regola dello Scadenzario (data_fattura + termini)   410 scadute   150.193,60 €
//         Mara             209 scadute    80.180,07 €
//         Gelateria Demo   200 scadute    69.998,59 €
//         Mara dei Boschi    1 scaduta         14,94 €
//
// Due pagine sugli stessi dati: lo Scadenzario diceva «410 in ritardo», il
// Confronto sedi diceva «tutto a posto».
//
// La correzione è `fattureDaPagarePerSede` in `src/lib/confrontoSediCalc.js`:
// la scadenza la chiede a `scadenzaFattura` (la stessa funzione dello
// Scadenzario e del Cashflow, che la deriva da `data_fattura + termini`) e
// l'importo a `residuoFattura`. Porta fuori anche `stimate`: quelle date sono
// convenzioni a trenta giorni, non accordi scritti sul documento, e chi legge
// un allarme ha diritto di sapere su cosa si regge.

import { describe, it, expect } from 'vitest'
import { fattureDaPagarePerSede } from '../../src/lib/confrontoSediCalc'

const OGGI = '2026-09-17'
const SEDE_A = 'sede-corso-casale'
const SEDE_B = 'sede-san-donato'

// La forma vera delle righe di produzione: `data_scadenza` nulla su tutte.
const FATTURE_VERE = [
  { id: 'f1', sede_id: SEDE_A, stato: 'aperta', totale: 1204.88, importo_pagato: 0, data_fattura: '2026-06-30', data_scadenza: null },
  { id: 'f2', sede_id: SEDE_A, stato: 'aperta', totale: 842.10, importo_pagato: 0, data_fattura: '2026-07-15', data_scadenza: null },
  { id: 'f3', sede_id: SEDE_B, stato: 'aperta', totale: 310.00, importo_pagato: 0, data_fattura: '2026-08-01', data_scadenza: null },
  // Questa non è ancora scaduta: 30 giorni dal 5 settembre sono il 5 ottobre.
  { id: 'f4', sede_id: SEDE_B, stato: 'aperta', totale: 500.00, importo_pagato: 0, data_fattura: '2026-09-05', data_scadenza: null },
  // Pagata: non deve entrare da nessuna parte.
  { id: 'f5', sede_id: SEDE_A, stato: 'pagata', totale: 2000.00, importo_pagato: 2000, data_fattura: '2026-05-02', data_scadenza: null },
]

/** La regola com'era scritta nella pagina prima della correzione. */
function contaAllaVecchiaManiera(fatture, oggiIso) {
  let scadute = 0
  for (const f of fatture) {
    if (f.stato !== 'pagata' && f.data_scadenza && f.data_scadenza < oggiIso) scadute++
  }
  return scadute
}

// ---------------------------------------------------------------------------
// 1. Riproduce
// ---------------------------------------------------------------------------

describe('riproduce: il controllo su una colonna sempre vuota non si accende mai', () => {
  it('con data_scadenza nulla la regola vecchia conta zero ritardi, la nuova ne conta tre', () => {
    expect(contaAllaVecchiaManiera(FATTURE_VERE, OGGI)).toBe(0)

    const perSede = fattureDaPagarePerSede(FATTURE_VERE, OGGI)
    expect(perSede[SEDE_A].scadute + perSede[SEDE_B].scadute).toBe(3)
  })

  it('non è un caso limite: nessuna fattura aperta in produzione ha la data di scadenza', () => {
    // 478 aperte su 478 con `data_scadenza` nulla. Per quante ne aggiungi, la
    // regola vecchia resta a zero: è il motivo per cui il difetto non si
    // vedeva crescere insieme al debito.
    const tante = Array.from({ length: 50 }, (_, i) => ({
      id: `x${i}`, sede_id: SEDE_A, stato: 'aperta',
      totale: 100, importo_pagato: 0, data_fattura: '2026-01-10', data_scadenza: null,
    }))
    expect(contaAllaVecchiaManiera(tante, OGGI)).toBe(0)
    expect(fattureDaPagarePerSede(tante, OGGI)[SEDE_A].scadute).toBe(50)
  })

  it('anche l’importo era sbagliato: la copia «totale − pagato» trasforma una nota di credito in un debito', () => {
    const conNotaCredito = [
      { id: 'a', sede_id: SEDE_A, stato: 'aperta', totale: 1000, importo_pagato: 0, data_fattura: '2026-07-01', data_scadenza: null },
      { id: 'nc', sede_id: SEDE_A, stato: 'aperta', totale: -365.55, importo_pagato: 0, data_fattura: '2026-07-02', data_scadenza: null },
    ]
    // La quarta copia della formula, quella che stava nella pagina.
    const vecchioImporto = conNotaCredito.reduce((s, f) => s + (Number(f.totale) - Number(f.importo_pagato)), 0)
    expect(vecchioImporto).toBeCloseTo(634.45, 2)

    // Con `residuoFattura` il credito vale col segno meno, come deve.
    const perSede = fattureDaPagarePerSede(conNotaCredito, OGGI)
    expect(perSede[SEDE_A].importo).toBeCloseTo(634.45, 2)

    // Il conto torna uguale qui perché la vecchia copia, per caso, sommava un
    // numero già negativo. Cambia quando la nota di credito è scritta in
    // positivo con l'etichetta: allora la vecchia formula la sommava come
    // debito.
    const ncEtichettata = [{ id: 'nc2', sede_id: SEDE_A, stato: 'aperta', tipo: 'nota_credito', totale: 365.55, importo_pagato: 0, data_fattura: '2026-07-02', data_scadenza: null }]
    expect(ncEtichettata.reduce((s, f) => s + (f.totale - f.importo_pagato), 0)).toBeCloseTo(365.55, 2)
    expect(fattureDaPagarePerSede(ncEtichettata, OGGI)[SEDE_A].importo).toBeCloseTo(-365.55, 2)
  })
})

// ---------------------------------------------------------------------------
// 2. La correzione
// ---------------------------------------------------------------------------

describe('la correzione: la scadenza si deriva, e si dice che è derivata', () => {
  it('conta le fatture in ritardo usando data fattura + trenta giorni', () => {
    const perSede = fattureDaPagarePerSede(FATTURE_VERE, OGGI)
    expect(perSede[SEDE_A].scadute).toBe(2)   // 30 giugno e 15 luglio
    expect(perSede[SEDE_B].scadute).toBe(1)   // 1 agosto; il 5 settembre no
  })

  it('dichiara quante di quelle scadenze sono stimate', () => {
    // Tutte e tre: nessuna di queste fatture porta la data di scadenza.
    const perSede = fattureDaPagarePerSede(FATTURE_VERE, OGGI)
    expect(perSede[SEDE_A].stimate).toBe(2)
    expect(perSede[SEDE_B].stimate).toBe(1)
  })

  it('l’importo aperto è il residuo, non il totale', () => {
    const conAcconto = [
      { id: 'p', sede_id: SEDE_A, stato: 'aperta', totale: 1000, importo_pagato: 400, data_fattura: '2026-07-01', data_scadenza: null },
    ]
    expect(fattureDaPagarePerSede(conAcconto, OGGI)[SEDE_A].importo).toBe(600)
  })

  it('raggruppa per sede e conta anche le aperte non ancora scadute', () => {
    const perSede = fattureDaPagarePerSede(FATTURE_VERE, OGGI)
    expect(perSede[SEDE_A].aperte).toBe(2)
    expect(perSede[SEDE_B].aperte).toBe(2)
    expect(perSede[SEDE_A].importo).toBeCloseTo(2046.98, 2)
    expect(perSede[SEDE_B].importo).toBeCloseTo(810, 2)
  })
})

// ---------------------------------------------------------------------------
// 3. Quello che c'è intorno
// ---------------------------------------------------------------------------

describe('intorno: le altre strade per cui una fattura è in ritardo, o non lo è', () => {
  it('quando la data di scadenza c’è davvero, vince lei e non è più una stima', () => {
    const conScadenza = [
      // Trenta giorni dal 1 settembre sarebbe il 1 ottobre: non scaduta.
      // Il documento però dice 10 settembre: scaduta.
      { id: 's', sede_id: SEDE_A, stato: 'aperta', totale: 100, importo_pagato: 0, data_fattura: '2026-09-01', data_scadenza: '2026-09-10' },
    ]
    const v = fattureDaPagarePerSede(conScadenza, OGGI)[SEDE_A]
    expect(v.scadute).toBe(1)
    expect(v.stimate).toBe(0)
  })

  it('le fatture pagate restano fuori da tutto, anche se la data è passata', () => {
    const perSede = fattureDaPagarePerSede(FATTURE_VERE, OGGI)
    const totaleAperte = perSede[SEDE_A].aperte + perSede[SEDE_B].aperte
    expect(totaleAperte).toBe(4)   // cinque righe, una pagata
    expect(perSede[SEDE_A].importo).not.toBeCloseTo(4046.98, 2)
  })

  it('una fattura segnata pagata a mano vale zero anche se i numeri dicono il contrario', () => {
    const pagataAMano = [
      { id: 'm', sede_id: SEDE_A, stato: 'pagata', totale: 900, importo_pagato: 0, data_fattura: '2026-01-01', data_scadenza: null },
    ]
    expect(fattureDaPagarePerSede(pagataAMano, OGGI)).toEqual({})
  })

  it('il giorno della scadenza non è ancora un ritardo: lo diventa il giorno dopo', () => {
    // 18 agosto + 30 giorni = 17 settembre, cioè oggi.
    const oggiScade = [
      { id: 'o', sede_id: SEDE_A, stato: 'aperta', totale: 100, importo_pagato: 0, data_fattura: '2026-08-18', data_scadenza: null },
    ]
    expect(fattureDaPagarePerSede(oggiScade, OGGI)[SEDE_A].scadute).toBe(0)
    expect(fattureDaPagarePerSede(oggiScade, '2026-09-18')[SEDE_A].scadute).toBe(1)
  })

  it('rispetta i termini del fornitore, anche «trenta giorni fine mese»', () => {
    const fm = [
      // 3 marzo, 30 giorni fine mese: si paga il 30 aprile, non il 2 aprile.
      { id: 'fm', sede_id: SEDE_A, stato: 'aperta', totale: 100, importo_pagato: 0, data_fattura: '2026-03-03', data_scadenza: null, _termini: 30, _terminiTipo: 'fine_mese' },
    ]
    expect(fattureDaPagarePerSede(fm, '2026-04-15')[SEDE_A].scadute).toBe(0)
    expect(fattureDaPagarePerSede(fm, '2026-05-01')[SEDE_A].scadute).toBe(1)

    const sessanta = [
      { id: '60', sede_id: SEDE_A, stato: 'aperta', totale: 100, importo_pagato: 0, data_fattura: '2026-08-01', data_scadenza: null, _termini: 60 },
    ]
    expect(fattureDaPagarePerSede(sessanta, OGGI)[SEDE_A].scadute).toBe(0)
  })

  it('le fatture senza sede restano in una voce loro, non si spalmano sulle sedi vere', () => {
    // Nel database di Mara dei Boschi ce ne sono 24 aperte per 14.793,22 €:
    // sono entrate quando l'organizzazione aveva un punto vendita solo. Non
    // appartengono né all'una né all'altra sede, e sommarle a una delle due
    // sarebbe inventare.
    const senzaSede = [
      ...FATTURE_VERE,
      { id: 'ns', sede_id: null, stato: 'aperta', totale: 14793.22, importo_pagato: 0, data_fattura: '2026-03-01', data_scadenza: null },
    ]
    const perSede = fattureDaPagarePerSede(senzaSede, OGGI)
    expect(perSede[SEDE_A].aperte).toBe(2)
    expect(perSede[SEDE_B].aperte).toBe(2)
    expect(perSede[null].aperte).toBe(1)
    expect(perSede[null].importo).toBeCloseTo(14793.22, 2)
  })

  it('righello — senza fatture non inventa voci, e un input storto non fa cadere la pagina', () => {
    expect(fattureDaPagarePerSede([], OGGI)).toEqual({})
    expect(fattureDaPagarePerSede(null, OGGI)).toEqual({})
    expect(fattureDaPagarePerSede(undefined, OGGI)).toEqual({})
    expect(fattureDaPagarePerSede([null, undefined], OGGI)).toEqual({})
  })

  it('righello — il controllo sa contare: spostando la data di oggi il numero cambia', () => {
    // Se questo test passasse con qualunque data, il conteggio sarebbe finto.
    expect(fattureDaPagarePerSede(FATTURE_VERE, '2026-08-01')[SEDE_A].scadute).toBe(1)
    expect(fattureDaPagarePerSede(FATTURE_VERE, '2026-08-20')[SEDE_A].scadute).toBe(2)
    expect(fattureDaPagarePerSede(FATTURE_VERE, '2026-12-31')[SEDE_B].scadute).toBe(2)
  })

  it('senza la data di oggi non dichiara nessun ritardo, ma continua a contare il dovuto', () => {
    // Meglio «non lo so» che un allarme costruito su una data che non c'è.
    const v = fattureDaPagarePerSede(FATTURE_VERE, null)
    expect(v[SEDE_A].scadute).toBe(0)
    expect(v[SEDE_A].aperte).toBe(2)
    expect(v[SEDE_A].importo).toBeCloseTo(2046.98, 2)
  })
})
