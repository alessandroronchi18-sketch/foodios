// Giorni di chiusura del negozio (serranda abbassata).
//
// Non confondere con le chiusure DI CASSA, che stanno in src/lib/chiusure.js.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const chiamate = []
function catena(nome) {
  const c = {
    _tabella: nome, _op: null, _filtri: [],
    select: vi.fn(() => c),
    insert: vi.fn((v) => { c._op = 'insert'; c._valori = v; return c }),
    update: vi.fn((v) => { c._op = 'update'; c._valori = v; return c }),
    delete: vi.fn(() => { c._op = 'delete'; return c }),
    eq: vi.fn((k, v) => { c._filtri.push(['eq', k, v]); return c }),
    is: vi.fn((k, v) => { c._filtri.push(['is', k, v]); return c }),
    lt: vi.fn((k, v) => { c._filtri.push(['lt', k, v]); return c }),
    lte: vi.fn((k, v) => { c._filtri.push(['lte', k, v]); return c }),
    gte: vi.fn((k, v) => { c._filtri.push(['gte', k, v]); return c }),
    or: vi.fn(() => c),
    single: vi.fn(async () => ({ data: { id: 'x' }, error: null })),
    then: (cb) => Promise.resolve({ data: [], error: null }).then(cb),
  }
  chiamate.push(c)
  return c
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: (n) => catena(n) },
}))

import {
  giornoChiuso, motivoChiusura, regolaInVigore, isoWeekday,
  impostaChiusuraRicorrente,
} from '../../src/lib/giorniChiusura'

beforeEach(() => { chiamate.length = 0 })

describe('giorno della settimana', () => {
  it('usa la numerazione che si legge sul calendario: 1 = lunedì', () => {
    expect(isoWeekday('2026-09-07')).toBe(1)   // lunedì
    expect(isoWeekday('2026-09-13')).toBe(7)   // domenica
  })
})

describe('chiusure ricorrenti valide nel tempo', () => {
  const regole = {
    ricorrenti: [
      { giorni: [1], valido_da: '2026-01-01', valido_a: '2026-05-31' },  // chiuso il lun d'inverno
      { giorni: [],  valido_da: '2026-06-01', valido_a: null },          // d'estate aperto sempre
    ],
    periodi: [],
  }

  it('un lunedì di gennaio resta chiuso anche dopo aver cambiato abitudine', () => {
    // È il punto della finestra di validità: cambiare oggi non deve riscrivere
    // come si lavorava sei mesi fa.
    expect(giornoChiuso('2026-01-05', regole)).toBe(true)
  })

  it('un lunedì di luglio è aperto, perché da giugno la regola è cambiata', () => {
    expect(giornoChiuso('2026-07-06', regole)).toBe(false)
  })

  it('una regola non vale prima della sua data di inizio', () => {
    expect(giornoChiuso('2025-12-29', regole)).toBe(false)
  })

  it('la regola in vigore è la più recente fra quelle che coprono la data', () => {
    expect(regolaInVigore(regole.ricorrenti, '2026-07-06').valido_da).toBe('2026-06-01')
  })
})

describe('chiusure a intervallo', () => {
  const regole = {
    ricorrenti: [],
    periodi: [{ data_da: '2026-08-10', data_a: '2026-08-24', motivo: 'ferie estive' }],
  }

  it('tutti i giorni dell\'intervallo risultano chiusi', () => {
    expect(giornoChiuso('2026-08-10', regole)).toBe(true)
    expect(giornoChiuso('2026-08-17', regole)).toBe(true)
    expect(giornoChiuso('2026-08-24', regole)).toBe(true)
  })

  it('il giorno prima e quello dopo no', () => {
    expect(giornoChiuso('2026-08-09', regole)).toBe(false)
    expect(giornoChiuso('2026-08-25', regole)).toBe(false)
  })

  it('un giorno solo è un intervallo che inizia e finisce lo stesso giorno', () => {
    const r = { ricorrenti: [], periodi: [{ data_da: '2026-09-07', data_a: '2026-09-07' }] }
    expect(giornoChiuso('2026-09-07', r)).toBe(true)
    expect(giornoChiuso('2026-09-08', r)).toBe(false)
  })

  it('il motivo viene riportato all\'utente, che deve capire perché', () => {
    expect(motivoChiusura('2026-08-17', regole)).toBe('ferie estive')
  })

  it('senza motivo scritto si spiega comunque di che si tratta', () => {
    const r = { ricorrenti: [], periodi: [{ data_da: '2026-09-07', data_a: '2026-09-07' }] }
    expect(motivoChiusura('2026-09-07', r)).toMatch(/straordinaria/)
  })

  it('per una chiusura ricorrente il motivo nomina il giorno', () => {
    const r = { ricorrenti: [{ giorni: [1], valido_da: '2020-01-01', valido_a: null }], periodi: [] }
    expect(motivoChiusura('2026-09-07', r)).toBe('chiuso il lunedì')
  })
})

describe('cambiare idea nello stesso giorno', () => {
  it('cancella la regola nata oggi prima di crearne una nuova', async () => {
    // Il bug: cliccando il lunedì per sbaglio e ri-cliccando per toglierlo, la
    // regola creata un minuto prima non veniva chiusa (si chiudono solo quelle
    // iniziate PRIMA di oggi) e se ne aggiungeva un'altra. Restavano due regole
    // attive e il lunedì non si poteva più togliere.
    await impostaChiusuraRicorrente('org', 'sede', [], '2026-09-07')

    const cancellazioni = chiamate.filter(c => c._op === 'delete')
    expect(cancellazioni.length).toBe(1)
    expect(cancellazioni[0]._filtri).toContainEqual(['eq', 'valido_da', '2026-09-07'])
  })

  it('togliere tutti i giorni non lascia una regola vuota in giro', async () => {
    await impostaChiusuraRicorrente('org', 'sede', [], '2026-09-07')
    expect(chiamate.some(c => c._op === 'insert')).toBe(false)
  })

  it('impostare dei giorni crea la regola nuova a partire da oggi', async () => {
    await impostaChiusuraRicorrente('org', 'sede', [1, 2], '2026-09-07')
    const ins = chiamate.find(c => c._op === 'insert')
    expect(ins._valori).toMatchObject({ giorni: [1, 2], valido_da: '2026-09-07' })
  })

  it('la regola precedente viene chiusa il giorno prima, non cancellata', async () => {
    await impostaChiusuraRicorrente('org', 'sede', [3], '2026-09-07')
    const upd = chiamate.find(c => c._op === 'update')
    expect(upd._valori).toEqual({ valido_a: '2026-09-06' })
    expect(upd._filtri).toContainEqual(['lt', 'valido_da', '2026-09-07'])
  })
})

describe('nessuna regola', () => {
  it('senza regole nessun giorno risulta chiuso', () => {
    expect(giornoChiuso('2026-09-07', { ricorrenti: [], periodi: [] })).toBe(false)
    expect(giornoChiuso('2026-09-07', {})).toBe(false)
    expect(motivoChiusura('2026-09-07', {})).toBe(null)
  })
})
