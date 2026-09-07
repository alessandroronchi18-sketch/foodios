// @vitest-environment happy-dom
//
// P&L: le giornate di cui non conosciamo il costo delle materie.
//
// Il problema che questo test difende. Da quando la chiusura col solo totale
// è il modo rapido di registrare la cassa, molte giornate hanno l'incasso ma
// non il food cost. Sommarlo come zero fa apparire un margine che non esiste:
// su un mese registrato tutto col solo totale il P&L dichiarava food cost 0%
// e utile pari all'incasso meno le buste paga. Nessun numero a schermo
// diceva che era un conto senza il costo della merce.
//
// Qui verifichiamo le tre cose che rendono il conto leggibile: la percentuale
// di food cost si misura solo sui giorni misurati, quando non ce n'è nessuno
// non viene inventata, e in ogni caso quante giornate restano fuori è scritto
// sopra i numeri.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

function fluent() {
  const RESULT = { data: [], error: null }
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve(RESULT)
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null })
      return () => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => fluent(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

vi.mock('../../src/lib/storage', () => ({
  ssave: () => Promise.resolve(),
  sload: () => Promise.resolve(null),
  ssaveBatch: () => Promise.resolve(),
  sloadAllSedi: () => Promise.resolve({}),
}))

vi.mock('../../src/lib/aiClient', () => ({
  callAi: () => Promise.resolve({ text: '', json: null, raw: null, ms: 0 }),
  parseAiJson: () => null,
  friendlyAiError: () => 'Errore AI (mock).',
  sanitizeUserInput: (t) => String(t || ''),
  default: () => Promise.resolve({ text: '', json: null, raw: null, ms: 0 }),
}))

// Le uscite di cassa arrivano da una somma fatta nel database: qui la
// pilotiamo per verificare che entrino nel conto.
const uscitePeriodo = vi.fn(() => Promise.resolve({ totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 }))
vi.mock('../../src/lib/primaNota', async () => {
  const real = await vi.importActual('../../src/lib/primaNota')
  return { ...real, totaliPeriodo: (...a) => uscitePeriodo(...a) }
})

const { default: PLView } = await import('../../src/views/PLView.jsx')

// Il P&L parte sempre dal primo del mese corrente a oggi. Le giornate di
// prova devono cadere in quella finestra, altrimenti la pagina risponde
// "nessuna chiusura" e il test non prova niente. Il giorno si tiene entro
// oggi: eseguito il primo del mese, le prove finiscono tutte sul giorno 1 —
// il conteggio non ne soffre, e il test non diventa capriccioso a seconda
// del giorno in cui gira.
const _oggi = new Date()
const mese = `${_oggi.getFullYear()}-${String(_oggi.getMonth() + 1).padStart(2, '0')}`
const g = (n) => `${mese}-${String(Math.min(n, _oggi.getDate())).padStart(2, '0')}`

// Chiusura registrata col solo totale: incasso sì, costo materie no.
const soloTotale = (data, totV) => ({
  data, solo_totale: true, foodcost_noto: false, venduto: [],
  kpi: { totV, totFC: 0, totM: totV, totS: 0, totMP: 0, avgST: 0 },
})
// Chiusura col dettaglio prodotti: il food cost è calcolato.
const conDettaglio = (data, totV, totFC) => ({
  data, venduto: [{ nome: 'TORTA', qta: 1, totale: totV }],
  kpi: { totV, totFC, totM: totV - totFC, totS: 0, totMP: 0, avgST: 0 },
})

const props = {
  orgId: 'org-test', sedeId: 'sede-test',
  sedi: [{ id: 'sede-test', nome: 'Test', is_default: true }],
  sedeAttiva: { id: 'sede-test', nome: 'Test' },
  notify: () => {}, ricettario: { ricette: {} }, magazzino: {}, giornaliero: {},
  setView: () => {}, LEX: {}, piano: 'pro', nomeAttivita: 'Test Lab',
  auth: { user: { id: 'u1', email: 'test@test.com' }, organization: { id: 'org-test' } },
}

const monta = (chiusure) => render(<PLView {...props} chiusure={chiusure} />)

beforeEach(() => {
  uscitePeriodo.mockReset()
  uscitePeriodo.mockResolvedValue({ totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 })
  cleanup()
})

describe('P&L — food cost non noto', () => {
  it('con tutte le giornate col solo totale non stampa una percentuale inventata', async () => {
    // Prima della correzione qui si leggeva "0.0%" di food cost, che è la
    // cosa peggiore: sembra un dato misurato e invece è un buco.
    const v = monta([soloTotale(g(1), 1000), soloTotale(g(2), 1200)])
    await waitFor(() => expect(v.container.textContent).toContain('Food cost'))
    expect(v.container.textContent).toContain('non noto')
    expect(v.container.textContent).toContain('nessuna giornata col costo materie')
  })

  it('avverte quante giornate restano fuori dal conto', async () => {
    const v = monta([
      soloTotale(g(1), 1000),
      conDettaglio(g(2), 1000, 300),
      soloTotale(g(3), 1000),
    ])
    await waitFor(() => expect(v.container.textContent).toContain('senza costo delle materie'))
    expect(v.container.textContent).toContain('2 giornate su 3')
    // Dice anche cosa fare per sistemarle.
    expect(v.container.textContent).toContain('pagina Cassa')
  })

  it('misura la percentuale sui soli giorni che il costo lo hanno', async () => {
    // Un giorno misurato (1.000 di ricavo, 300 di food cost = 30%) e uno no.
    // Sulla base sbagliata — tutti i ricavi — sarebbe uscito 15%.
    const v = monta([conDettaglio(g(1), 1000, 300), soloTotale(g(2), 1000)])
    await waitFor(() => expect(v.container.textContent).toContain('Food cost'))
    expect(v.container.textContent).toContain('30.0%')
    expect(v.container.textContent).not.toContain('15.0%')
    // E dichiara la base su cui è calcolata.
    expect(v.container.textContent).toContain('su 1 giorni di 2')
  })

  it('quando tutte le giornate hanno il costo materie non avverte di niente', async () => {
    const v = monta([conDettaglio(g(1), 1000, 300), conDettaglio(g(2), 1000, 300)])
    await waitFor(() => expect(v.container.textContent).toContain('Food cost'))
    expect(v.container.textContent).toContain('30.0%')
    expect(v.container.textContent).not.toContain('senza costo delle materie')
    expect(v.container.textContent).not.toContain('non noto')
  })

  it('le chiusure storiche, senza nessuno dei due campi, contano come misurate', async () => {
    // Sono nate dal dettaglio dello scontrino: il food cost c'era. Trattarle
    // come "non note" cancellerebbe la storia di chi usa Foodos da mesi.
    const senzaFlag = { data: g(1), venduto: [], kpi: { totV: 1000, totFC: 250, totM: 750, totS: 0, totMP: 0, avgST: 0 } }
    const v = monta([senzaFlag])
    await waitFor(() => expect(v.container.textContent).toContain('Food cost'))
    expect(v.container.textContent).toContain('25.0%')
    expect(v.container.textContent).not.toContain('senza costo delle materie')
  })
})

// ── Le uscite di cassa nel conto ────────────────────────────────────────────
//
// La prima nota registrava le spese ma nessun conto le guardava: erano soldi
// usciti dal cassetto che l'utile ignorava. Questi test difendono il fatto
// che ora entrino, e che si veda quanto di quelle spese non ha fattura.

describe('P&L — uscite di cassa', () => {
  it('sottrae le uscite di cassa dall\'utile e le mostra nella cascata', async () => {
    uscitePeriodo.mockResolvedValue({
      totale: 827.19, conFattura: 300, senzaFattura: 500, daVerificare: 27.19, numero: 37,
    })
    const v = monta([conDettaglio(g(1), 1000, 300)])
    await waitFor(() => expect(v.container.textContent).toContain('Uscite di cassa (prima nota)'))

    // 1.000 di ricavo − 300 di food cost − 827,19 di uscite = perdita di 127,19.
    expect(v.container.textContent).toContain('PERDITA DEL PERIODO')
    expect(v.container.textContent).toContain('127 €')
    // Quante voci sono e quanto di quelle non ha fattura: serve al commercialista.
    expect(v.container.textContent).toContain('37 voci')
    expect(v.container.textContent).toContain('500 € senza fattura')
  })

  it('chiede al database solo il periodo e la sede mostrati', async () => {
    uscitePeriodo.mockResolvedValue({ totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 })
    monta([conDettaglio(g(1), 1000, 300)])
    await waitFor(() => expect(uscitePeriodo).toHaveBeenCalled())
    const [orgId, sedeId, from, to] = uscitePeriodo.mock.calls[0]
    expect(orgId).toBe('org-test')
    expect(sedeId).toBe('sede-test')
    expect(from.startsWith(mese)).toBe(true)
    expect(to.startsWith(mese)).toBe(true)
  })

  it('senza uscite non aggiunge una riga da zero euro', async () => {
    uscitePeriodo.mockResolvedValue({ totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 })
    const v = monta([conDettaglio(g(1), 1000, 300)])
    await waitFor(() => expect(v.container.textContent).toContain('Ricavi'))
    expect(v.container.textContent).not.toContain('Uscite di cassa (prima nota)')
  })

  it('se la lettura delle uscite fallisce il conto resta leggibile', async () => {
    // Meglio un P&L senza la riga delle uscite che una pagina bianca.
    uscitePeriodo.mockRejectedValue(new Error('rpc assente'))
    const v = monta([conDettaglio(g(1), 1000, 300)])
    await waitFor(() => expect(v.container.textContent).toContain('UTILE DEL PERIODO'))
    expect(v.container.textContent).not.toContain('Uscite di cassa (prima nota)')
  })
})
