// Il costo del lavoro ricavato dai TURNI davvero lavorati.
//
// Perche' questo test esiste. Il conto economico usa lo stipendio mensile:
// giusto per un contratto fisso, ma non dice se un mese di straordinari si e'
// mangiato il margine. I turni erano gia' registrati nella pagina Personale e
// non alimentavano niente.
//
// Il rischio vero e' l'opposto di non mostrarli: mostrarli male. Un turno
// senza costo scritto vale 0 sul database (non NULL), e sommarlo come zero fa
// sembrare il lavoro gratis. Sui dati del design partner e' esattamente il
// caso: 4 turni su 4 hanno costo 0,00 e i tre dipendenti hanno costo_orario
// 0,00 — ma lo stipendio mensile c'e' (2.000, 4.000 e 2.038,82 € lordi).

import { describe, it, expect } from 'vitest'
import { costoLavoroDaTurni, costoOrarioDaStipendio } from '../../src/lib/stipendiCalc'

// I tre dipendenti veri di Mara dei Boschi, con i valori che hanno davvero.
const DIP = [
  { id: 'marco', nome: 'Marco', costo_orario: 0, stipendio_lordo_mensile: 2000, ore_settimana: 40 },
  { id: 'coco', nome: 'Coco', costo_orario: 0, stipendio_lordo_mensile: 4000, ore_settimana: 40 },
  { id: 'ale', nome: 'Alessandro', costo_orario: 0, stipendio_lordo_mensile: 2038.82, ore_settimana: 40 },
]

describe('costoOrarioDaStipendio', () => {
  it('ricava il costo orario dal lordo mensile, contributi e TFR inclusi', () => {
    // 2.000 € lordi x 13 mensilita' = 26.000 annui; + 32% contributi + TFR;
    // diviso 12 mesi e diviso 173,3 ore mensili (40 x 52/12).
    expect(costoOrarioDaStipendio(DIP[0])).toBeCloseTo(17.43, 1)
    // Chi guadagna il doppio costa il doppio all'ora.
    expect(costoOrarioDaStipendio(DIP[1])).toBeCloseTo(34.85, 1)
  })

  it('torna 0 quando manca lo stipendio o le ore', () => {
    expect(costoOrarioDaStipendio({ stipendio_lordo_mensile: 2000, ore_settimana: 0 })).toBe(0)
    expect(costoOrarioDaStipendio({ stipendio_lordo_mensile: 0, ore_settimana: 40 })).toBe(0)
    expect(costoOrarioDaStipendio(null)).toBe(0)
    expect(costoOrarioDaStipendio(undefined)).toBe(0)
  })
})

describe('costoLavoroDaTurni', () => {
  it('il costo scritto sul turno vince su tutto il resto', () => {
    const r = costoLavoroDaTurni(
      [{ data: '2026-09-05', ore: 8, costo: 100, dipendente_id: 'marco' }], DIP)
    expect(r.costo).toBe(100)
    expect(r.turniContati).toBe(1)
    // Non e' una stima: il numero era scritto.
    expect(r.turniStimati).toBe(0)
  })

  it('senza costo sul turno usa il costo orario del dipendente', () => {
    const dip = [{ id: 'x', costo_orario: 15, stipendio_lordo_mensile: 9999, ore_settimana: 40 }]
    const r = costoLavoroDaTurni([{ data: '2026-09-05', ore: 8, costo: 0, dipendente_id: 'x' }], dip)
    expect(r.costo).toBe(120)
    // Il costo orario scritto a mano e' un dato, non una stima.
    expect(r.turniStimati).toBe(0)
  })

  it('sui dati veri di Mara ricava il costo dallo stipendio e lo dichiara stimato', () => {
    // I 4 turni registrati, tutti con costo 0,00 sul database.
    const turni = [
      { data: '2026-08-05', ore: 8, costo: 0, dipendente_id: 'marco' },
      { data: '2026-09-05', ore: 8, costo: 0, dipendente_id: 'coco' },
      { data: '2026-09-05', ore: 8, costo: 0, dipendente_id: 'marco' },
      { data: '2026-09-07', ore: 8, costo: 0, dipendente_id: 'ale' },
    ]
    const r = costoLavoroDaTurni(turni, DIP, { da: '2026-09-01', a: '2026-09-30' })
    // Il turno di agosto resta fuori dal periodo.
    expect(r.turniContati).toBe(3)
    expect(r.ore).toBe(24)
    // Prima di questo lavoro il totale era 0 €: i turni sembravano gratis.
    expect(r.costo).toBeGreaterThan(400)
    // E va detto che e' ricavato, non misurato.
    expect(r.turniStimati).toBe(3)
    expect(r.turniSenzaCosto).toBe(0)
    // Due giorni diversi, non tre: il 5 settembre ha due turni.
    expect(r.giorni).toBe(2)
  })

  it('un turno senza nessun dato NON vale zero: si conta a parte', () => {
    const dip = [{ id: 'y', costo_orario: 0, stipendio_lordo_mensile: 0, ore_settimana: 0 }]
    const r = costoLavoroDaTurni([{ data: '2026-09-05', ore: 8, costo: 0, dipendente_id: 'y' }], dip)
    expect(r.costo).toBe(0)
    expect(r.turniContati).toBe(0)
    // Questo e' il numero che impedisce di leggere "il lavoro e' costato 0 €".
    expect(r.turniSenzaCosto).toBe(1)
    expect(r.costoOrarioMedio).toBeNull()
  })

  it('un turno di un dipendente cancellato non fa saltare il conto', () => {
    const r = costoLavoroDaTurni([{ data: '2026-09-05', ore: 8, costo: 0, dipendente_id: 'sparito' }], DIP)
    expect(r.turniSenzaCosto).toBe(1)
    expect(r.costo).toBe(0)
  })

  it('conta i giorni diversi, non i turni', () => {
    const turni = [
      { data: '2026-09-05', ore: 4, costo: 50, dipendente_id: 'marco' },
      { data: '2026-09-05', ore: 4, costo: 50, dipendente_id: 'coco' },
      { data: '2026-09-06', ore: 8, costo: 100, dipendente_id: 'ale' },
    ]
    const r = costoLavoroDaTurni(turni, DIP)
    expect(r.giorni).toBe(2)
    expect(r.ore).toBe(16)
    expect(r.costo).toBe(200)
    expect(r.costoOrarioMedio).toBe(12.5)
  })

  it('le date fuori dal periodo non entrano, e i turni a zero ore si saltano', () => {
    const turni = [
      { data: '2026-07-31', ore: 8, costo: 100, dipendente_id: 'marco' },
      { data: '2026-08-15', ore: 8, costo: 100, dipendente_id: 'marco' },
      { data: '2026-09-01', ore: 8, costo: 100, dipendente_id: 'marco' },
      { data: '2026-08-20', ore: 0, costo: 100, dipendente_id: 'marco' },
    ]
    const r = costoLavoroDaTurni(turni, DIP, { da: '2026-08-01', a: '2026-08-31' })
    expect(r.turniContati).toBe(1)
    expect(r.costo).toBe(100)
  })

  it('non esplode su input vuoti o sbagliati', () => {
    expect(costoLavoroDaTurni(null, null).costo).toBe(0)
    expect(costoLavoroDaTurni([], []).giorni).toBe(0)
    expect(costoLavoroDaTurni(undefined, undefined).ore).toBe(0)
  })
})
