// @vitest-environment happy-dom
//
// Il calendario non deve pretendere un modulo che l'azienda non usa.
//
// La regola esisteva già per la cassa: Mara registra la produzione ogni giorno
// ma tiene la cassa altrove, e pretendere entrambe le faceva vedere 121
// "anomalie" e copertura 0% su quattro mesi di lavoro impeccabile. Mancava
// nell'altro verso: chi registra la cassa e tiene la produzione su carta si
// vedeva OGNI giornata segnata come incompleta, per sempre.
//
// Un attrezzo che pretende un flusso che il cliente non segue viene
// abbandonato. Questi test difendono la simmetria.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/giorniChiusura', async () => {
  const real = await vi.importActual('../../src/lib/giorniChiusura')
  return { ...real, caricaRegoleChiusura: () => Promise.resolve({ ricorrenti: [], periodi: [] }) }
})

const { default: CalendarioOperativo } = await import('../../src/components/CalendarioOperativo.jsx')

// Le giornate di prova stanno fra il primo del mese e oggi, che è la finestra
// su cui il calendario calcola la copertura.
const _o = new Date()
const MESE = `${_o.getFullYear()}-${String(_o.getMonth() + 1).padStart(2, '0')}`
const g = (n) => `${MESE}-${String(Math.min(n, _o.getDate())).padStart(2, '0')}`
const GIORNI_PASSATI = _o.getDate()

const chiusura = (data, totV = 400) => ({ data, venduto: [], kpi: { totV, totFC: 0, totM: totV, totS: 0, totMP: 0, avgST: 0 } })
const produzione = (data) => ({ data, prodotti: [{ nome: 'SACHER', stampi: 2 }], ricavoTot: 300 })

/** Tutte le giornate passate del mese, per un solo modulo. */
const tutteLeChiusure = () => Array.from({ length: GIORNI_PASSATI }, (_, i) => chiusura(g(i + 1)))
const tutteLeProduzioni = () => Array.from({ length: GIORNI_PASSATI }, (_, i) => produzione(g(i + 1)))

const base = {
  orgId: 'org-1', sedeId: 'sede-1', setView: () => {}, notify: () => {}, isMobile: false,
}
const monta = (p) => render(<CalendarioOperativo {...base} {...p} />)

beforeEach(() => cleanup())

describe('calendario — moduli che l\'azienda usa davvero', () => {
  it('chi registra SOLO la cassa arriva al 100% di copertura', async () => {
    // Era il difetto: ogni giornata restava "parziale" e la copertura non
    // superava lo zero, anche registrando la cassa tutti i giorni.
    const v = monta({ chiusure: tutteLeChiusure(), giornaliero: [] })
    await waitFor(() => expect(v.container.textContent).toContain('Copertura mese'))
    expect(v.container.textContent).toContain('100%')
    expect(v.container.textContent).toContain('contati sulla cassa')
  })

  it('chi registra SOLO la cassa non ha nessuna anomalia', async () => {
    const v = monta({ chiusure: tutteLeChiusure(), giornaliero: [] })
    await waitFor(() => expect(v.container.textContent).toContain('Giorni con anomalie'))
    expect(v.container.textContent).toContain('nessuna anomalia')
  })

  it('chi registra SOLO la produzione continua ad arrivare al 100%', async () => {
    // La regola che c'era già non deve essersi rotta.
    const v = monta({ chiusure: [], giornaliero: tutteLeProduzioni() })
    await waitFor(() => expect(v.container.textContent).toContain('Copertura mese'))
    expect(v.container.textContent).toContain('100%')
    expect(v.container.textContent).toContain('contati sulla produzione')
  })

  it('chi usa ENTRAMBI i moduli li vede pretendere entrambi', async () => {
    // Metà giornate con la sola cassa: qui l'anomalia è legittima, perché
    // l'azienda registra normalmente anche la produzione.
    const meta = Math.max(1, Math.floor(GIORNI_PASSATI / 2))
    const v = monta({
      chiusure: tutteLeChiusure(),
      giornaliero: tutteLeProduzioni().slice(0, meta),
    })
    await waitFor(() => expect(v.container.textContent).toContain('Copertura mese'))
    expect(v.container.textContent).toContain('produzione + cassa')
    expect(v.container.textContent).not.toContain('100%')
  })

  it('in avvio, senza nessun dato, le chiede entrambe per guidare i primi passi', async () => {
    const v = monta({ chiusure: [], giornaliero: [] })
    await waitFor(() => expect(v.container.textContent).toContain('Copertura mese'))
    expect(v.container.textContent).toContain('produzione + cassa')
  })

  it('a chi tiene la produzione su carta non viene chiesta nel dettaglio del giorno', async () => {
    const v = monta({ chiusure: tutteLeChiusure(), giornaliero: [] })
    await waitFor(() => expect(v.container.textContent).toContain('Copertura mese'))

    const bottone = v.container.querySelector('button[aria-label*="cassa registrata"]')
    expect(bottone).toBeTruthy()
    // L'etichetta parlante non nomina la produzione: non fa parte del giudizio.
    expect(bottone.getAttribute('aria-label')).not.toContain('produzione')
  })
})
