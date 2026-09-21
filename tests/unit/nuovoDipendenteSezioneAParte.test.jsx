// @vitest-environment happy-dom
//
// ── Il modulo del nuovo dipendente è una sezione, non una colonna ────────
//
// Segnalato dal titolare il 21/09/2026: «rivedi la sezione dipendenti,
// l'inserimento di un nuovo dipendente è tutto schiacciato sulla sinistra con
// molte box disallineate, piuttosto rendila una sezione a parte».
//
// La causa stava in una riga sola. La pagina era una griglia
// `340px 1fr` con il modulo **sempre aperto** nella colonna stretta di
// sinistra:
//
//   • quindici campi in 340 pixel vanno per forza uno sotto l'altro;
//   • le coppie dentro (paga/ore, lordo/netto, contratto/livello) erano
//     griglie `1fr 1fr` dentro 340 px, cioè caselle da 160 px che non si
//     incolonnavano con niente di quello che avevano sopra;
//   • e il modulo stava lì anche quando non serviva a nessuno, mangiandosi un
//     terzo dello schermo all'elenco.
//
// Adesso l'elenco prende tutta la larghezza e «Nuovo dipendente» apre una
// sezione sua, con i campi su una griglia a due colonne e le coppie che
// prendono la riga intera con lo stesso passo — così le caselle di una riga
// stanno esattamente sotto quelle della riga sopra.
//
// Queste prove guardano la STRUTTURA, non i pixel: happy-dom non impagina, ma
// la griglia e le sue colonne sono quello che i pixel poi seguono.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

const DB = { dipendenti: [], turni: [] }
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

beforeEach(() => { DB.dipendenti = [ANNA]; DB.turni = []; LARGHEZZA = 1440 })
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
const perTesto = (re) => bottoni().find(b => re.test(b.textContent || ''))
const perEtichetta = (re) => bottoni().find(b => re.test(b.getAttribute('aria-label') || ''))
const campoNome = () => [...document.querySelectorAll('input')]
  .find(i => /Mario Rossi/.test(i.getAttribute('placeholder') || ''))

describe('All\'apertura si vede l\'elenco, non il modulo', () => {
  it('il campo del nome non c\'è finché non lo chiedi', async () => {
    // Prima il modulo era sempre aperto sul computer: quindici campi vuoti
    // accanto all'elenco, tutte le volte.
    await monta()
    expect(campoNome(), 'il modulo è ancora sempre aperto').toBeFalsy()
  })

  it('e c\'è il comando per aprirlo, anche sul computer', async () => {
    // Sul computer non esisteva: il modulo stava lì e basta. Senza comando,
    // togliendolo non ci sarebbe più modo di aggiungere una persona.
    await monta()
    expect(perTesto(/Nuovo dipendente/)).toBeTruthy()
  })
})

describe('Aprire e chiudere la sezione', () => {
  it('«Nuovo dipendente» apre il modulo', async () => {
    await monta()
    act(() => { fireEvent.click(perTesto(/Nuovo dipendente/)) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
  })

  it('e mentre il modulo è aperto l\'elenco non c\'è: è una sezione a parte', async () => {
    const r = await monta()
    act(() => { fireEvent.click(perTesto(/Nuovo dipendente/)) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
    expect(r.container.textContent, 'l\'elenco è ancora lì accanto').not.toContain('Anna Pedrini')
  })

  it('«Torna all\'elenco» riporta indietro', async () => {
    const r = await monta()
    act(() => { fireEvent.click(perTesto(/Nuovo dipendente/)) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
    act(() => { fireEvent.click(perEtichetta(/Torna all'elenco/)) })
    await waitFor(() => expect(r.container.textContent).toContain('Anna Pedrini'))
    expect(campoNome()).toBeFalsy()
  })

  it('e il comando per tornare indietro dice dove porta', async () => {
    await monta()
    act(() => { fireEvent.click(perTesto(/Nuovo dipendente/)) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
    const b = perEtichetta(/Torna all'elenco/)
    expect(b).toBeTruthy()
    expect(b.textContent).toMatch(/elenco/i)
  })

  it('«Modifica» su una persona apre la stessa sezione, già compilata', async () => {
    await monta()
    const mod = bottoni().find(b => /modifica/i.test(b.getAttribute('title') || ''))
    expect(mod, 'non c\'è il comando di modifica').toBeTruthy()
    act(() => { fireEvent.click(mod) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
    expect(campoNome().value).toBe('Anna Pedrini')
  })
})

describe('I campi sono incolonnati', () => {
  async function apriModulo() {
    await monta()
    act(() => { fireEvent.click(perTesto(/Nuovo dipendente/)) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
    // La griglia dei campi è l'antenata comune del campo del nome.
    let el = campoNome()
    while (el && el.style?.display !== 'grid') el = el.parentElement
    return el
  }

  it('sul computer stanno su due colonne, non una', async () => {
    const griglia = await apriModulo()
    expect(griglia, 'i campi non stanno su una griglia').toBeTruthy()
    expect(griglia.style.gridTemplateColumns).toMatch(/repeat\(2/)
  })

  it('sul telefono tornano su una colonna sola', async () => {
    LARGHEZZA = 390
    const griglia = await apriModulo()
    expect(griglia.style.gridTemplateColumns).toBe('1fr')
  })

  it('le coppie di campi prendono la riga intera, con lo stesso passo', async () => {
    // È il punto della lamentela: le coppie dentro una colonna stretta
    // diventavano caselle da 160 px che non si incolonnavano con niente.
    // Prendendo la riga intera e usando lo stesso passo della griglia di
    // fuori, ogni casella sta esattamente sotto quella della riga sopra.
    await apriModulo()
    const larghe = [...document.querySelectorAll('div')]
      .filter(d => d.style?.gridColumn === '1 / -1')
    expect(larghe.length, 'nessun blocco prende la riga intera').toBeGreaterThanOrEqual(3)
    const coppie = larghe.filter(d => /repeat\(2/.test(d.style.gridTemplateColumns || ''))
    expect(coppie.length, 'le coppie non usano il passo della griglia').toBeGreaterThanOrEqual(1)
    for (const c of coppie) expect(c.style.columnGap).toBe('20px')
  })

  it('e la sezione non è più larga di quanto si legga comodamente', async () => {
    await apriModulo()
    let el = campoNome()
    while (el && !el.style?.maxWidth) el = el.parentElement
    expect(el, 'la sezione non ha una larghezza massima').toBeTruthy()
    expect(parseInt(el.style.maxWidth, 10)).toBeLessThanOrEqual(1000)
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero e la persona è a schermo', async () => {
    const r = await monta()
    expect(r.container.textContent).toContain('Anna Pedrini')
    expect(bottoni().length).toBeGreaterThan(3)
  })

  it('e il campo del nome si riconosce dal suo esempio', async () => {
    await monta()
    act(() => { fireEvent.click(perTesto(/Nuovo dipendente/)) })
    await waitFor(() => expect(campoNome()).toBeTruthy())
    expect(campoNome().getAttribute('placeholder')).toMatch(/Mario Rossi/)
  })
})
