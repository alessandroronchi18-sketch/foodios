// @vitest-environment happy-dom
//
// ── La rimanenza lasciata a 0: il buco è nel giorno prima ─────────────────
//
// Trovato dall'audit dello Storico e della Quadratura del 03/10/2026 sui dati
// di Mara dei Boschi.
//
// Nel database ci sono 660 righe con la rimanenza a 0, e in 658 quel giorno
// si era prodotto (in media 5,9 kg): la casella non è stata compilata, o la
// rimanenza è stata scritta il giorno dopo. Il conto sbaglia due volte, in
// versi opposti. De Gasperi, MAROTTO: l'11/08 prodotti 5,0 kg e rimanenza 0,
// quindi «venduti 12,5 kg»; il 12/08 prodotto 0 e rimanenza 4,6 kg, quindi
// «venduti -4,6 kg». Sui due giorni (7,9 kg) il conto torna.
//
// Nelle tre settimane 10-30/08 sono 151 delle 158 caselle negative (95,6%);
// da maggio ad agosto 550 su 575. Le pagine sbagliavano in tre modi:
//   - la Quadratura metteva il buco sul 12/08 («mancano 4,6 kg») e proponeva
//     «È giusta così», cioè accettare come omaggio un errore di compilazione
//     dell'11;
//   - diceva «il totale è più basso del vero», falso: l'errore si annulla col
//     giorno prima;
//   - lo Storico non diceva niente, e il 12/08 il grafico segnava -126,3 kg.
//
// Il dato NON si corregge: non sappiamo quanto c'era davvero in vetrina. Si
// riconosce il caso e si indica la casella giusta da sistemare.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, screen } from '@testing-library/react'

let RIGHE_SETT = []
vi.mock('../../src/lib/inventarioProduzione', async () => {
  const vero = await vi.importActual('../../src/lib/inventarioProduzione')
  return { ...vero, caricaSettimana: vi.fn(async () => RIGHE_SETT) }
})
vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
vi.mock('../../src/lib/storage', () => ({
  sload: async () => [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }],
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const {
  calcolaVendutoSettimana, kpiQuadraturaSettimana, caselleDaSistemare, riassuntoCaselle,
  CAUSA_RIMANENZA_A_ZERO,
} = await import('../../src/lib/inventarioProduzione')
const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView')
const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection')

const riga = (data, produzione_g, rimanenza_g, extra = {}) => ({
  sede_id: 'dg', gusto_nome: 'MAROTTO', data, produzione_g, rimanenza_g, scarto_g: 0, spedito_g: 0, ...extra,
})
// Il caso vero di De Gasperi.
const MAROTTO = [
  riga('2026-08-10', 2000, 7500),
  riga('2026-08-11', 5000, 0),      // prodotti 5 kg, rimanenza lasciata a 0
  riga('2026-08-12', 0, 4600),      // il gelato «ricompare»: -4,6 kg
  riga('2026-08-13', 3000, 2000),
]

afterEach(() => cleanup())

describe('La casella negativa dopo una rimanenza a zero', () => {
  const m = () => calcolaVendutoSettimana(MAROTTO, '2026-08-10').MAROTTO

  it('indica come giorno da sistemare quello PRIMA', () => {
    const c = m()['2026-08-12']
    expect(c.venduto).toBe(-4600)
    expect(c.causa).toBe(CAUSA_RIMANENZA_A_ZERO)
    expect(c.giornoDaSistemare).toBe('2026-08-11')
    expect(c.motivo).toMatch(/rimanenza dell'11\/08 è rimasta a 0/)
  })

  it('il dato non si corregge: i due giorni restano quelli scritti, e insieme tornano', () => {
    const c = m()
    expect(c['2026-08-11'].venduto).toBe(12500)
    expect(c['2026-08-12'].venduto).toBe(-4600)
    expect(c['2026-08-11'].venduto + c['2026-08-12'].venduto).toBe(7900)
  })

  it('resta da controllare (c\'è una casella da sistemare)', () => {
    expect(m()['2026-08-12'].daControllare).toBe(true)
  })

  it('il giorno con la rimanenza a zero non ha la causa (è positivo)', () => {
    expect(m()['2026-08-11'].causa).toBeNull()
  })

  it('con un giorno di chiusura in mezzo il giorno da sistemare è l\'ultimo registrato', () => {
    const righe = [riga('2026-08-09', 0, 2000), riga('2026-08-10', 5000, 0), riga('2026-08-12', 0, 3000)]
    const c = calcolaVendutoSettimana(righe, '2026-08-10').MAROTTO['2026-08-12']
    expect(c.giornoDaSistemare).toBe('2026-08-10')
  })

  it('una casella negativa con la rimanenza di prima scritta è un «non torna» vero', () => {
    const righe = [riga('2026-08-10', 0, 400), riga('2026-08-11', 300, 900)]
    const c = calcolaVendutoSettimana(righe, '2026-08-10').MAROTTO['2026-08-11']
    expect(c.causa).toBe('non-torna')
    expect(c.giornoDaSistemare).toBeNull()
    expect(c.motivo).toMatch(/rimanenza scritta è più alta/)
  })

  it('una vetrina davvero vuota senza produzione il giorno prima non è la stessa cosa', () => {
    // Domenica niente prodotto e niente rimasto (vetrina vuota davvero),
    // lunedì compaiono 2 kg senza produzione: è un altro errore.
    const righe = [riga('2026-08-09', 0, 0), riga('2026-08-10', 0, 2000)]
    const c = calcolaVendutoSettimana(righe, '2026-08-10').MAROTTO['2026-08-10']
    expect(c.causa).toBe('non-torna')
  })

  it('una casella già accettata non è più da sistemare', () => {
    const righe = MAROTTO.map(r => (r.data === '2026-08-12' ? { ...r, scostamento_accettato: true } : r))
    expect(caselleDaSistemare(righe, { da: '2026-08-10', a: '2026-08-13' })).toEqual([])
  })
})

describe('La data si legge come si dice', () => {
  // «la rimanenza del 11/08» si legge «del undici»: si dice «dell'11/08».
  it('uno, otto e undici prendono l\'apostrofo', async () => {
    const { conGiorno } = await import('../../src/lib/produzioneAnalisi.js')
    expect(conGiorno('del', '2026-08-11')).toBe('dell\'11/08')
    expect(conGiorno('il', '2026-08-08')).toBe('l\'08/08')
    expect(conGiorno('dal', '2026-07-01')).toBe('dall\'01/07')
    expect(conGiorno('al', '2026-08-31')).toBe('al 31/08')
    expect(conGiorno('il', '2026-08-12', { lunga: true })).toBe('il 12/08/2026')
    expect(conGiorno('il', null)).toBe('')
  })
})

describe('Le caselle da sistemare in un periodo', () => {
  it('col giorno prima dentro il periodo l\'errore si annulla', () => {
    const cas = caselleDaSistemare(MAROTTO, { da: '2026-08-10', a: '2026-08-13' })
    expect(cas).toHaveLength(1)
    expect(cas[0]).toMatchObject({ sedeId: 'dg', gusto: 'MAROTTO', data: '2026-08-12', giornoDaSistemare: '2026-08-11', compensata: true })
    expect(cas[0].kg).toBeCloseTo(-4.6, 6)
    const r = riassuntoCaselle(cas)
    expect(r.nRimanenza).toBe(1)
    expect(r.kgFuori).toBe(0)
    expect(r.giorni).toEqual(['2026-08-11'])
  })

  it('col giorno prima fuori dal periodo il totale è più basso del vero', () => {
    const r = riassuntoCaselle(caselleDaSistemare(MAROTTO, { da: '2026-08-12', a: '2026-08-13' }))
    expect(r.kgFuori).toBeCloseTo(-4.6, 6)
    expect(r.kgCompensati).toBe(0)
  })

  it('le altre caselle che non tornano si contano a parte', () => {
    const righe = [...MAROTTO, riga('2026-08-10', 0, 400, { gusto_nome: 'FIORDILATTE' }), riga('2026-08-11', 300, 900, { gusto_nome: 'FIORDILATTE' })]
    const r = riassuntoCaselle(caselleDaSistemare(righe, { da: '2026-08-10', a: '2026-08-13' }))
    expect(r.nRimanenza).toBe(1)
    expect(r.nAltre).toBe(1)
    expect(r.kgAltre).toBeCloseTo(-0.2, 6)
  })

  it('il conto si fa sede per sede', () => {
    const righe = [...MAROTTO, ...MAROTTO.map(r => ({ ...r, sede_id: 'ca', rimanenza_g: r.rimanenza_g === 0 ? 1000 : r.rimanenza_g }))]
    const cas = caselleDaSistemare(righe, { da: '2026-08-10', a: '2026-08-13' })
    expect(cas.filter(c => c.causa === CAUSA_RIMANENZA_A_ZERO).map(c => c.sedeId)).toEqual(['dg'])
  })
})

describe('La settimana della Quadratura', () => {
  it('conta le caselle con la rimanenza a zero e dice quante pesano davvero sul totale', () => {
    const k = kpiQuadraturaSettimana(calcolaVendutoSettimana(MAROTTO, '2026-08-10'), [], 30, [])
    expect(k.celleNonQuadrate).toBe(1)
    expect(k.celleRimanenzaAZero).toBe(1)
    expect(k.kgRimanenzaAZero).toBeCloseTo(-4.6, 6)
    expect(k.kgRimanenzaFuori).toBe(0)
  })

  it('se il giorno da sistemare è la domenica prima, quei chili mancano davvero dalla settimana', () => {
    const righe = [riga('2026-08-08', 0, 2000), riga('2026-08-09', 5000, 0), riga('2026-08-10', 0, 4600)]
    const k = kpiQuadraturaSettimana(calcolaVendutoSettimana(righe, '2026-08-10'), [], 30, [])
    expect(k.kgRimanenzaFuori).toBeCloseTo(-4.6, 6)
  })
})

describe('La pagina della Quadratura indica il giorno giusto', () => {
  beforeEach(() => {
    RIGHE_SETT = MAROTTO.map(({ sede_id: _sede, ...r }) => r)
    vi.setSystemTime(new Date('2026-08-10T10:00:00'))
  })
  afterEach(() => vi.useRealTimers())
  const props = {
    orgId: 'org-1', sedeId: 'dg', sedi: [{ id: 'dg', nome: 'De Gasperi', attiva: true, is_sede_produzione: true }],
    sedeAttiva: { id: 'dg', nome: 'De Gasperi' }, chiusure: [], metodoProduzione: 'inventario', onNavigate: () => {},
  }
  const testo = () => document.body.textContent || ''

  it('scrive «rimanenza mancante» sul giorno prima, non «mancano» sul giorno dopo', async () => {
    render(<QuadraturaInventarioView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/MAROTTO/), { timeout: 5000 })
    expect(testo()).toMatch(/rimanenza mancante il mar 11 ago/)
    expect(testo()).not.toMatch(/mancano 4,6 kg/)
  })

  it('non propone «È giusta così» per un errore di compilazione', async () => {
    render(<QuadraturaInventarioView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/MAROTTO/), { timeout: 5000 })
    expect(screen.queryByRole('button', { name: /è giusta così/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Apri l'inventario/ })).toBeTruthy()
  })

  it('non dice che il totale è più basso del vero quando l\'errore si annulla', async () => {
    render(<QuadraturaInventarioView {...props} />)
    await waitFor(() => expect(testo()).toMatch(/MAROTTO/), { timeout: 5000 })
    expect(testo()).not.toMatch(/più basso del vero/)
    expect(testo()).toMatch(/il totale della settimana è giusto/)
  })
})

describe('Lo Storico dice quali caselle sistemare', () => {
  const apri = (da, a, righe = MAROTTO) => render(
    <AnalisiInventarioSection rows={righe} rowsPrev={[]} dateFrom={da} dateTo={a} confronto="nessuno"
      ricettario={{ ricette: {}, ingredienti_costi: {} }} orgId="org-1" sedeId={null}
      sedi={[{ id: 'dg', nome: 'De Gasperi' }]} />
  )
  const testo = () => document.body.textContent || ''

  it('nomina la casella da sistemare, con gusto, sede e giorno giusto', async () => {
    apri('2026-08-10', '2026-08-13')
    await waitFor(() => expect(testo()).toMatch(/(casella|caselle) da sistemare/i), { timeout: 5000 })
    expect(testo()).toMatch(/MAROTTO a De Gasperi l'11\/08/)
    expect(testo()).toMatch(/Il venduto del periodo è giusto/)
  })

  it('se il giorno da sistemare è prima del periodo, dice di quanto il venduto è più basso', async () => {
    apri('2026-08-12', '2026-08-13')
    await waitFor(() => expect(testo()).toMatch(/(casella|caselle) da sistemare/i), { timeout: 5000 })
    expect(testo()).toMatch(/più basso del vero di 4,6 kg/)
  })

  it('sotto il grafico per giorno spiega il dente e i giorni da sistemare', async () => {
    apri('2026-08-10', '2026-08-13')
    await waitFor(() => expect(testo()).toMatch(/Giorni da sistemare: 11\/08/), { timeout: 5000 })
  })

  it('senza caselle storte non dice niente', async () => {
    apri('2026-08-10', '2026-08-11', MAROTTO.slice(0, 2))
    await waitFor(() => expect(testo()).toMatch(/giorn[oi] registrat/), { timeout: 5000 })
    // Le parole delle caselle storte, non «N dati da sistemare» del riassunto
    // della copertura chiusa (04/10, C1), che parla di altro (cassa, ricette).
    expect(testo()).not.toMatch(/(casella|caselle) da sistemare|Giorni da sistemare/i)
  })
})
