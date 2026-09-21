// @vitest-environment happy-dom
//
// ── Eliminare un dipendente: il doppio controllo ─────────────────────────
//
// Richiesta del titolare, 21/09/2026: «in personale, in archivia dipendenti
// devo poter anche eliminare un dipendente, ovviamente con doppio check per
// non rischiare di fare un errore».
//
// Perché il doppio controllo qui non è una cortesia: **eliminare una persona
// cancella i suoi turni**. La tabella `turni` ha `on delete cascade` sul
// dipendente (migrazione 20260513_personale.sql, riga 20), e i turni sono
// quelli con cui il P&L calcola il costo del lavoro dei mesi passati.
// Cancellare una persona che ha lavorato sei mesi **riscrive il costo di quei
// sei mesi**, e nessuno se ne accorge guardando la pagina.
//
// Quindi la finestra non chiede «sei sicuro?». Dice quanti turni spariscono e
// da che giorno, e per procedere fa scrivere il nome della persona. Un clic
// sbagliato non basta, e nemmeno due.
//
// Misurato sul database del design partner lo stesso giorno: 4 persone in
// anagrafica (1 attiva) e 4 turni registrati. Su numeri così piccoli un
// errore non si nota finché non si guarda il costo del lavoro di un mese.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

const DB = { dipendenti: [], turni: [], dipendenti_codici: [] }
const CHIAMATE = []
let LARGHEZZA = 1440

function fluente(nome) {
  const h = {
    get(_t, p) {
      if (p === 'then') return (res) => res({ data: DB[nome] || [], error: null, count: (DB[nome] || []).length })
      if (p === 'single' || p === 'maybeSingle') return () => Promise.resolve({ data: (DB[nome] || [])[0] || null, error: null })
      return (...args) => { CHIAMATE.push({ tabella: nome, op: p, args }); return new Proxy({}, h) }
    },
  }
  return new Proxy({}, h)
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'x' } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (nome) => fluente(nome),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => LARGHEZZA <= 767,
  useIsTablet: () => LARGHEZZA >= 768 && LARGHEZZA <= 1023,
}))

const ARCHIVIATA = { id: 'd9', nome: 'Carla Innocenti', ruolo: 'Aiuto', tipo_contratto: 'Stagionale',
  attivo: false, costo_orario: 12, ore_settimana: 20, sede_id: null }
const TURNI = [
  { id: 't1', data: '2026-03-02' }, { id: 't2', data: '2026-03-03' }, { id: 't3', data: '2026-07-14' },
]

beforeEach(() => {
  DB.dipendenti = [ARCHIVIATA]
  DB.turni = TURNI
  DB.dipendenti_codici = []
  CHIAMATE.length = 0
  LARGHEZZA = 1440
})
afterEach(() => { cleanup(); vi.resetModules() })

async function montaArchivio() {
  const [{ default: Personale }, { ConfirmProvider }] = await Promise.all([
    import('../../src/components/Personale.jsx'),
    import('../../src/components/ConfirmModal.jsx'),
  ])
  const r = render(
    <ConfirmProvider>
      <Personale orgId="org-1" sedeId="s1" sedi={[{ id: 's1', nome: 'Centro', attiva: true }]}
        notify={() => {}} adminNome="Anita" nomeAttivita="Pasticceria di prova" />
    </ConfirmProvider>,
  )
  await waitFor(() => expect(r.container.textContent).toContain('Carla Innocenti'), { timeout: 8000 })
  // Si passa all'archivio: il comando di eliminazione esiste solo lì.
  const versoArchivio = [...r.container.querySelectorAll('button')]
    .find(b => /archivi/i.test(b.textContent || ''))
  if (versoArchivio) act(() => { fireEvent.click(versoArchivio) })
  await waitFor(() => expect(r.container.textContent).toContain('Carla Innocenti'), { timeout: 8000 })
  return r
}

const bottoni = () => [...document.querySelectorAll('button')]
const elimina = () => bottoni().find(b => /^Elimina definitivamente/.test(b.getAttribute('aria-label') || ''))
const perTesto = (re) => bottoni().find(b => re.test(b.textContent || ''))

describe('Il comando c\'è, e solo nell\'archivio', () => {
  it('nell\'archivio si può eliminare', async () => {
    await montaArchivio()
    expect(elimina(), 'dall\'archivio non si elimina').toBeTruthy()
  })

  it('e dice di chi si tratta, non solo «elimina»', async () => {
    // Un lettore di schermo che annuncia dodici volte «elimina» non aiuta
    // nessuno a capire quale riga sta per cancellare.
    await montaArchivio()
    expect(elimina().getAttribute('aria-label')).toMatch(/Carla Innocenti/)
  })
})

describe('La finestra dice cosa sparisce, coi numeri', () => {
  it('conta i turni della persona', async () => {
    await montaArchivio()
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.body.textContent).toMatch(/3 turni/))
  })

  it('e dice da quando: un mese senza turni è un costo del lavoro diverso', async () => {
    await montaArchivio()
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.body.textContent).toMatch(/02 marzo 2026/))
    expect(document.body.textContent).toMatch(/14 luglio 2026/)
    expect(document.body.textContent).toMatch(/costo del lavoro/i)
  })

  it('dice anche che non si torna indietro, e che l\'archivio invece si disfa', async () => {
    await montaArchivio()
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.body.textContent).toMatch(/non si torna indietro/i))
    expect(document.body.textContent).toMatch(/riattivare/i)
  })
})

describe('Il doppio controllo', () => {
  async function apri() {
    await montaArchivio()
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.getElementById('elim-conferma')).toBeTruthy())
    return document.getElementById('elim-conferma')
  }

  it('finché non scrivi il nome, il comando è spento', async () => {
    await apri()
    const conferma = perTesto(/Elimina per sempre/)
    expect(conferma).toBeTruthy()
    expect(conferma.disabled).toBe(true)
  })

  it('un nome sbagliato non lo accende', async () => {
    const campo = await apri()
    act(() => { fireEvent.change(campo, { target: { value: 'Carla' } }) })
    await waitFor(() => expect(perTesto(/Elimina per sempre/).disabled).toBe(true))
  })

  it('il nome giusto lo accende', async () => {
    const campo = await apri()
    act(() => { fireEvent.change(campo, { target: { value: 'Carla Innocenti' } }) })
    await waitFor(() => expect(perTesto(/Elimina per sempre/).disabled).toBe(false))
  })

  it('e non si è pignoli su maiuscole e spazi: è una conferma, non un esame', async () => {
    const campo = await apri()
    act(() => { fireEvent.change(campo, { target: { value: '  carla innocenti  ' } }) })
    await waitFor(() => expect(perTesto(/Elimina per sempre/).disabled).toBe(false))
  })

  it('premendolo, la cancellazione porta con sé l\'organizzazione', async () => {
    // Senza il filtro sull'organizzazione una cancellazione che girasse con
    // la chiave di servizio toccherebbe i dipendenti di un altro cliente.
    const campo = await apri()
    act(() => { fireEvent.change(campo, { target: { value: 'Carla Innocenti' } }) })
    await waitFor(() => expect(perTesto(/Elimina per sempre/).disabled).toBe(false))
    act(() => { fireEvent.click(perTesto(/Elimina per sempre/)) })
    await waitFor(() => {
      const del = CHIAMATE.filter(c => c.tabella === 'dipendenti' && c.op === 'delete')
      expect(del.length, 'la cancellazione non è partita').toBeGreaterThan(0)
    })
    const dopoDelete = CHIAMATE.slice(CHIAMATE.findIndex(c => c.tabella === 'dipendenti' && c.op === 'delete'))
    const eq = dopoDelete.filter(c => c.op === 'eq').map(c => c.args[0])
    expect(eq).toContain('organization_id')
    expect(eq).toContain('id')
  })

  it('«Annulla» non cancella niente', async () => {
    const campo = await apri()
    act(() => { fireEvent.change(campo, { target: { value: 'Carla Innocenti' } }) })
    act(() => { fireEvent.click(perTesto(/^Annulla$/)) })
    await waitFor(() => expect(document.getElementById('elim-conferma')).toBeFalsy())
    expect(CHIAMATE.filter(c => c.tabella === 'dipendenti' && c.op === 'delete')).toEqual([])
  })

  it('e riaprendo la finestra il campo è di nuovo vuoto', async () => {
    // Se restasse scritto, la seconda eliminazione sarebbe a un clic solo —
    // e sarebbe la persona sbagliata.
    const campo = await apri()
    act(() => { fireEvent.change(campo, { target: { value: 'Carla Innocenti' } }) })
    act(() => { fireEvent.click(perTesto(/^Annulla$/)) })
    await waitFor(() => expect(document.getElementById('elim-conferma')).toBeFalsy())
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.getElementById('elim-conferma')).toBeTruthy())
    expect(document.getElementById('elim-conferma').value).toBe('')
  })
})

describe('Quello che non deve succedere', () => {
  it('niente NaN, undefined o Invalid Date nella finestra', async () => {
    await montaArchivio()
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.body.textContent).toMatch(/Eliminare/))
    const t = document.body.textContent
    expect(t).not.toMatch(/NaN/)
    expect(t).not.toMatch(/undefined/)
    expect(t).not.toMatch(/Invalid Date/)
  })

  it('e con zero turni non dice «0 turni», dice che non ce ne sono', async () => {
    DB.turni = []
    await montaArchivio()
    act(() => { fireEvent.click(elimina()) })
    await waitFor(() => expect(document.body.textContent).toMatch(/Nessun turno registrato/))
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero e la persona archiviata è a schermo', async () => {
    const r = await montaArchivio()
    expect(r.container.textContent).toContain('Carla Innocenti')
  })

  it('e i turni di prova esistono, se no le prove sopra non guardano niente', () => {
    expect(TURNI.length).toBe(3)
  })
})
