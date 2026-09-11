// totaliPerGusto: la somma per gusto su un periodo, usata dal conto economico
// e dalla sezione inventario dello Storico produzione.
//
// Perche' questo file esiste. La stessa somma era scritta in due posti:
// qui nel motore e in produzioneStats.calcPerGustoDifferenziale — quarta copia
// della regola del venduto nel progetto. La copia aveva tre difetti, tutti
// corretti nel motore mesi prima e mai riportati indietro:
//
//   1. troncava a zero i conti che non tornavano (Math.max(0, ...)), quindi un
//      errore di compilazione diventava "zero venduto" invece di un avviso;
//   2. azzerava la giacenza di partenza a ogni giorno di chiusura (gap != 1
//      giorno). Mara chiude un giorno a settimana: il giorno dopo la chiusura
//      ripartiva da "niente in vasca" e il venduto usciva sbagliato ogni
//      settimana;
//   3. ignorava del tutto `spedito_g`: i chili mandati a un'altra sede
//      risultavano venduti al banco, e quindi incassati.
//
// Risultato: lo Storico produzione mostrava un venduto diverso da Quadratura e
// dal conto economico sugli stessi giorni. Questi test fissano il
// comportamento giusto.

import { describe, it, expect } from 'vitest'
import { totaliPerGusto } from '../../src/lib/inventarioProduzione'

const r = (gusto, data, prod, riman, extra = {}) => ({
  gusto_nome: gusto, data, produzione_g: prod, rimanenza_g: riman,
  scarto_g: 0, spedito_g: 0, ...extra,
})

describe('totaliPerGusto', () => {
  it('somma il venduto dei giorni consecutivi, e il primo giorno non lo inventa', () => {
    const t = totaliPerGusto([
      r('NOCCIOLA', '2026-05-01', 3000, 1000, { scarto_g: 100 }),
      r('NOCCIOLA', '2026-05-02', 2000, 1500, { scarto_g: 50 }),
      r('NOCCIOLA', '2026-05-03', 2500, 800),
    ])
    const n = t.NOCCIOLA
    // 01/05 non ha un giorno prima da cui partire: il venduto non si puo'
    // calcolare e la cella resta fuori dal totale (prima veniva calcolata
    // partendo da "zero in vasca", che gonfiava il venduto di 1.900 g).
    expect(n.celleNonCalcolabili).toBe(1)
    // 02/05: 1000 + 2000 - 1500 - 50 = 1450
    // 03/05: 1500 + 2500 - 800     = 3200
    expect(n.vendTot).toBe(4650)
    // Produzione e scarto invece si sommano su tutti i giorni registrati.
    expect(n.prodTot).toBe(7500)
    expect(n.scartoTot).toBe(150)
  })

  it('non perde la giacenza sui giorni di chiusura', () => {
    // 01/05 registrato, poi chiuso fino al 05/05: la vasca il 05 riparte dai
    // 1.500 g rimasti il 01, non da zero.
    const t = totaliPerGusto([
      r('CAFFE', '2026-05-01', 2000, 1500),
      r('CAFFE', '2026-05-05', 3000, 500),
    ])
    // 1500 + 3000 - 500 = 4000. La vecchia copia azzerava e usciva 2.500.
    expect(t.CAFFE.vendTot).toBe(4000)
    expect(t.CAFFE.celleNonQuadrate).toBe(0)
  })

  it('conta le celle che non tornano col loro segno, e le dichiara', () => {
    // Il 02/05 la rimanenza scritta (3.000) e' piu' alta di quanto c'era:
    // 1.000 rimasti + 500 prodotti = 1.500. Venduto = -1.500.
    const t = totaliPerGusto([
      r('STRANO', '2026-05-01', 2000, 1000),
      r('STRANO', '2026-05-02', 500, 3000),
    ])
    expect(t.STRANO.vendTot).toBe(-1500)
    expect(t.STRANO.celleNonQuadrate).toBe(1)
    expect(t.STRANO.gNonQuadrati).toBe(-1500)
  })

  it('toglie dal venduto i chili spediti a un altra sede', () => {
    const t = totaliPerGusto([
      r('PISTACCHIO', '2026-05-01', 5000, 2000),
      r('PISTACCHIO', '2026-05-02', 1000, 500, { spedito_g: 1500 }),
    ])
    // 2000 + 1000 - 500 - 1500 = 1000 venduti al banco.
    // La vecchia copia ignorava spedito_g e ne contava 2.500.
    expect(t.PISTACCHIO.vendTot).toBe(1000)
    expect(t.PISTACCHIO.speditoTot).toBe(1500)
  })

  it('calcola sede per sede e poi somma, senza sottrarre due volte i trasferimenti', () => {
    // Sede A manda 1 kg alla sede B. Per A e' spedito (esce dal venduto), per
    // B e' giacenza (rimanenza). Aggregando le righe PRIMA del calcolo quei
    // chili venivano sottratti due volte: una come spedito di A e una come
    // rimanenza di B.
    const righe = [
      r('MENTA', '2026-05-01', 3000, 2000, { sede_id: 'A' }),
      r('MENTA', '2026-05-02', 0, 0, { sede_id: 'A', spedito_g: 1000 }),
      r('MENTA', '2026-05-01', 0, 0, { sede_id: 'B' }),
      r('MENTA', '2026-05-02', 0, 1000, { sede_id: 'B' }),
    ]
    const t = totaliPerGusto(righe)
    // A il 02: 2000 + 0 - 0 - 1000 = 1000 venduti.
    // B il 02: 0 + 0 - 1000 = -1000 → la merce arrivata risulta "non quadra",
    // perche' per B e' comparsa dal nulla: e' il limite del dato, non del
    // conto, ed e' per questo che le celle che non tornano vanno dichiarate.
    // Il punto del test e' che il conto si fa per sede: il totale e' la somma
    // dei due, non un unico conto sulle righe sommate.
    expect(t.MENTA.vendTot).toBe(0)
    expect(t.MENTA.speditoTot).toBe(1000)
    expect(t.MENTA.celleNonQuadrate).toBe(1)
  })

  it('con la finestra somma solo i giorni del periodo', () => {
    // I giorni prima di `da` servono solo come giacenza di partenza: la loro
    // produzione non e' produzione del periodo.
    const righe = [
      r('LIMONE', '2026-04-28', 4000, 2000),
      r('LIMONE', '2026-05-01', 1000, 500),
      r('LIMONE', '2026-05-02', 800, 300),
    ]
    const t = totaliPerGusto(righe, { da: '2026-05-01', a: '2026-05-02' })
    expect(t.LIMONE.prodTot).toBe(1800)
    // 01/05: 2000 + 1000 - 500 = 2500 (usa la giacenza del 28/04)
    // 02/05: 500 + 800 - 300  = 1000
    expect(t.LIMONE.vendTot).toBe(3500)
    expect(t.LIMONE.celleNonCalcolabili).toBe(0)
  })

  it('regge una lista vuota e un argomento sbagliato', () => {
    expect(totaliPerGusto([])).toEqual({})
    expect(totaliPerGusto(null)).toEqual({})
    expect(totaliPerGusto(undefined)).toEqual({})
  })
})
