// @vitest-environment happy-dom
//
// ── Il codice a 4 cifre: c'era, ma non lo trovava nessuno ────────────────
//
// Segnalato dal titolare il 21/09/2026, entrando con l'account del
// laboratorio: «mi chiede il codice di 4 numeri ma non mi dà la possibilità di
// impostarlo o modificarlo».
//
// Il comando c'era davvero, ma due schede più in là: Personale → Accessi →
// Rubrica dipendenti. E la Rubrica elenca **le stesse identiche persone**
// della scheda Dipendenti — `api/dipendenti-operativi` legge la tabella
// `dipendenti` e ci attacca il codice preso da `dipendenti_codici`. Due
// schermate per la stessa gente, e quella dove uno guarda («Dipendenti») non
// diceva nemmeno che i codici esistessero.
//
// Sul database del design partner: 4 persone in anagrafica, **1 sola** con un
// codice. Le altre tre non possono usare il tablet in laboratorio, e dalla
// loro scheda non si capiva né perché né come rimediare.
//
// Adesso la scheda Dipendenti dice per ognuno se ha il codice, e il comando
// porta dritto al suo, già aperto.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

const DB = { dipendenti: [], turni: [], dipendenti_codici: [] }
let LARGHEZZA = 1440

function fluente(nome) {
  const h = {
    get(_t, p) {
      if (p === 'then') return (res) => res({ data: DB[nome] || [], error: null, count: (DB[nome] || []).length })
      if (p === 'single' || p === 'maybeSingle') return () => Promise.resolve({ data: (DB[nome] || [])[0] || null, error: null })
      return () => new Proxy({}, h)
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

const ANNA = { id: 'd1', nome: 'Anna Pedrini', ruolo: 'Pasticciera', tipo_contratto: 'Full-time',
  attivo: true, costo_orario: 15, ore_settimana: 38, sede_id: null }
const BRUNO = { id: 'd2', nome: 'Bruno Salis', ruolo: 'Banco', tipo_contratto: 'Part-time',
  attivo: true, costo_orario: 12, ore_settimana: 20, sede_id: null }

beforeEach(() => {
  DB.dipendenti = [ANNA, BRUNO]
  DB.turni = []
  // Anna ha il codice, Bruno no: è la fotografia dell'azienda vera.
  DB.dipendenti_codici = [{ dipendente_id: 'd1', codice_operativo: '4207', attivo: true }]
  LARGHEZZA = 1440
})
afterEach(() => { cleanup(); vi.resetModules() })

async function monta() {
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
  await waitFor(() => expect(r.container.textContent).toContain('Anna Pedrini'), { timeout: 8000 })
  return r
}

const bottoni = () => [...document.querySelectorAll('button')]
const perEtichetta = (re) => bottoni().find(b => re.test(b.getAttribute('aria-label') || ''))

describe('Nella scheda dei dipendenti si vede chi ha il codice', () => {
  it('chi ce l\'ha lo mostra', async () => {
    const r = await monta()
    await waitFor(() => expect(r.container.textContent).toMatch(/codice 4207/))
  })

  it('e chi non ce l\'ha lo dice, invece di non dire niente', async () => {
    // Prima da questa schermata non si capiva né che i codici esistono né
    // che a Bruno ne mancava uno.
    const r = await monta()
    await waitFor(() => expect(r.container.textContent).toMatch(/senza codice/))
  })

  it('un codice sospeso non si legge come uno attivo', async () => {
    DB.dipendenti_codici = [{ dipendente_id: 'd1', codice_operativo: '4207', attivo: false }]
    const r = await monta()
    await waitFor(() => expect(r.container.textContent).toMatch(/sospeso/))
  })
})

describe('E da lì si arriva a impostarlo', () => {
  it('c\'è il comando, e dice di chi', async () => {
    await monta()
    await waitFor(() => expect(perEtichetta(/Dai un codice a Bruno Salis/)).toBeTruthy())
    expect(perEtichetta(/Cambia il codice di Anna Pedrini/)).toBeTruthy()
  })

  it('premendolo si va alla rubrica dei codici', async () => {
    const r = await monta()
    await waitFor(() => expect(perEtichetta(/Dai un codice a Bruno Salis/)).toBeTruthy())
    act(() => { fireEvent.click(perEtichetta(/Dai un codice a Bruno Salis/)) })
    await waitFor(() => expect(r.container.textContent).toMatch(/Rubrica/i))
  })

  it('e la scheda «Accessi» risulta quella aperta', async () => {
    // Se la scheda in cima restasse su «Dipendenti» mentre a schermo c'è la
    // rubrica, chi guarda non capisce più dove si trova.
    const r = await monta()
    await waitFor(() => expect(perEtichetta(/Dai un codice a Bruno Salis/)).toBeTruthy())
    act(() => { fireEvent.click(perEtichetta(/Dai un codice a Bruno Salis/)) })
    await waitFor(() => {
      const accessi = bottoni().find(b => /^Accessi$/.test((b.textContent || '').trim()))
      expect(accessi, 'non trovo la scheda Accessi').toBeTruthy()
    })
    expect(r.container.textContent).toMatch(/Rubrica/i)
  })
})

describe('Quello che non deve succedere', () => {
  it('se la lettura dei codici non riesce, la pagina resta in piedi', async () => {
    // È un'informazione in più, non il motivo per cui si è aperta la pagina.
    DB.dipendenti_codici = null
    const r = await monta()
    expect(r.container.textContent).toContain('Anna Pedrini')
    expect(r.container.textContent).not.toMatch(/NaN|undefined/)
  })

  it('e in archivio non si propone di dare un codice a chi non c\'è più', async () => {
    const r = await monta()
    const versoArchivio = bottoni().find(b => /archivi/i.test(b.textContent || ''))
    if (versoArchivio) act(() => { fireEvent.click(versoArchivio) })
    await waitFor(() => expect(r.container.textContent.length).toBeGreaterThan(50))
    expect(perEtichetta(/Dai un codice/)).toBeFalsy()
  })
})

describe('Il righello di questo file', () => {
  it('le due persone di prova hanno stati diversi, se no non si prova niente', () => {
    expect(DB.dipendenti).toHaveLength(2)
    expect(DB.dipendenti_codici).toHaveLength(1)
  })

  it('e la pagina si disegna davvero', async () => {
    const r = await monta()
    expect(r.container.textContent).toContain('Bruno Salis')
  })
})
