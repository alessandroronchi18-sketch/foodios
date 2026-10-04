// @vitest-environment happy-dom
//
// ── I gusti col nome diverso dalla ricetta valevano zero euro ─────────────
//
// Trovato dall'audit dello Storico del 03/10/2026 sui dati di Mara dei
// Boschi. Nel foglio dell'inventario i gusti si chiamano come li scrive chi
// compila: MISTIC (la ricetta è MYSTIC), YOGURT (YOGURT GRECO), AMOR FOU
// («AMOUR FOU, MYSTIC, LIMONE»), CAFFÈ FLORA (CAFFÈ), LIQUIRIZIA +BASILICO
// (LIQUIRIZIA E BASILICO). Lo Storico cercava una ricetta con lo stesso nome
// e, non trovandola, valutava quel gelato zero euro: nella finestra di
// apertura 10 gusti, 1.181 kg venduti, circa 34.823 € di ricavo al prezzo
// medio di 29,49 €/kg. L'avviso diceva «28 gusti su 28 non hanno ricetta…
// ricavo e food cost sono a zero» (falso: il ricavo era 88.970 €) e non dava
// modo di sistemare.
//
// Non esisteva un meccanismo di nomi alternativi per i gusti (c'è solo per i
// formati di vendita). Adesso l'avviso dice quanti chili e quanti euro
// mancano, propone le ricette simili, e il collegamento si salva una volta
// (`pasticceria-nomi-gusti-v1`) e vale per tutti i periodi. Con i quattro
// collegamenti più evidenti, sui dati veri, il ricavo stimato passa da
// 88.970 € a 100.273 €.
//
// 04/10/2026, decisione del titolare: il ricavo stimato è lo stesso numero
// in tutte le pagine (tutti i chili venduti per il prezzo medio dei formati,
// come il Mese e «Torna il conto?»), quindi i chili di MISTIC sono nel
// ricavo anche prima del collegamento. Quello che il collegamento sposta
// adesso è il MARGINE: senza ricetta il costo non si sa e quei chili restano
// fuori dal margine; collegati, entrano. Le prove della pagina guardano il
// margine (198 € → 396 €) e che il ricavo resti fermo a 420 €.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
const FORMATI = [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }]
let NOMI_SALVATI = null
const ssave = vi.fn(async () => {})
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1' ? FORMATI : k === 'pasticceria-nomi-gusti-v1' ? NOMI_SALVATI : null),
  ssave: (...a) => ssave(...a),
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { leggiNomiGusti, collegaNome, ricettaCollegata, ricetteSimili } = await import('../../src/lib/nomiGusti.js')
const { ricettaDelGusto } = await import('../../src/lib/inventarioProduzione.js')
const { SK_NOMI_GUSTI } = await import('../../src/lib/storageKeys.js')
// storage è finto qui sopra: l'elenco vero delle chiavi condivise si legge dall'originale.
const { SHARED_KEYS } = await vi.importActual('../../src/lib/storage.js')
const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection.jsx')

const gusto = (nome, ingredienti = [{ nome: 'latte', qty1stampo: 1000 }], extra = {}) =>
  ({ nome, tipo: 'gusto', categoria: 'Gusto', ingredienti, ...extra })
const RICETTARIO = {
  ingredienti_costi: { latte: { costoKg: 2, costoG: 0.002 } },
  ricette: {
    MYSTIC: gusto('MYSTIC'),
    'AMOUR FOU, MYSTIC, LIMONE': gusto('AMOUR FOU, MYSTIC, LIMONE'),
    'YOGURT GRECO': gusto('YOGURT GRECO'),
    'YOGURT GRECO, MIELE E SESAMO': gusto('YOGURT GRECO, MIELE E SESAMO'),
    'LIQUIRIZIA E BASILICO': gusto('LIQUIRIZIA E BASILICO'),
    'CAFFÈ': gusto('CAFFÈ'),
    NOCCIOLA: gusto('NOCCIOLA'),
    'BASE BIANCA': { nome: 'BASE BIANCA', tipo: 'semilavorato', ingredienti: [{ nome: 'latte', qty1stampo: 1000 }] },
  },
}

describe('La mappa dei nomi', () => {
  it('un valore storto vale «vuota»', () => {
    expect(leggiNomiGusti(null)).toEqual({ versione: 1, nomi: {} })
    expect(leggiNomiGusti([1, 2])).toEqual({ versione: 1, nomi: {} })
    expect(leggiNomiGusti({ nomi: { mistic: 5 } })).toEqual({ versione: 1, nomi: {} })
  })
  it('i nomi si scrivono come li indicizza l\'inventario (maiuscolo, senza spazi ai lati)', () => {
    expect(leggiNomiGusti({ nomi: { ' mistic ': 'MYSTIC' } }).nomi).toEqual({ MISTIC: { ricetta: 'MYSTIC' } })
  })
  it('collegare aggiunge, scollegare toglie, e la mappa di prima non cambia', () => {
    const vuota = leggiNomiGusti(null)
    const una = collegaNome(vuota, 'Mistic', 'MYSTIC', { adesso: '2026-10-03T10:00:00Z', utente: 'mara' })
    expect(vuota.nomi).toEqual({})
    expect(una.nomi.MISTIC).toEqual({ ricetta: 'MYSTIC', il: '2026-10-03T10:00:00Z', utente: 'mara' })
    expect(ricettaCollegata(una, 'mistic')).toBe('MYSTIC')
    expect(collegaNome(una, 'MISTIC', null).nomi).toEqual({})
  })
})

describe('Le ricette proposte', () => {
  const prima = (nome) => ricetteSimili(nome, RICETTARIO)[0]?.nome || null
  it('MISTIC → MYSTIC (prima di «AMOUR FOU, MYSTIC, LIMONE»)', () => {
    expect(prima('MISTIC')).toBe('MYSTIC')
  })
  it('YOGURT → YOGURT GRECO (prima della ricetta più lunga)', () => {
    expect(prima('YOGURT')).toBe('YOGURT GRECO')
  })
  it('LIQUIRIZIA +BASILICO → LIQUIRIZIA E BASILICO', () => {
    expect(prima('LIQUIRIZIA +BASILICO')).toBe('LIQUIRIZIA E BASILICO')
  })
  it('AMOR FOU → «AMOUR FOU, MYSTIC, LIMONE», CAFFÈ FLORA → CAFFÈ', () => {
    expect(prima('AMOR FOU')).toBe('AMOUR FOU, MYSTIC, LIMONE')
    expect(prima('CAFFÈ FLORA')).toBe('CAFFÈ')
  })
  it('un semilavorato non si propone mai', () => {
    expect(ricetteSimili('BASE BIANCA', RICETTARIO).map(r => r.nome)).not.toContain('BASE BIANCA')
  })
  it('un nome senza niente di simile non riceve proposte a caso', () => {
    expect(ricetteSimili('FRAGOLA', RICETTARIO)).toEqual([])
  })
})

describe('La ricetta di un gusto, coi nomi collegati', () => {
  const mappa = collegaNome(collegaNome(null, 'MISTIC', 'MYSTIC'), 'NOCCIOLA', 'MYSTIC')
  it('il nome collegato trova la sua ricetta', () => {
    expect(ricettaDelGusto(RICETTARIO, 'MISTIC', mappa)?.nome).toBe('MYSTIC')
  })
  it('senza la mappa si comporta come prima (lo scarico del magazzino non cambia)', () => {
    expect(ricettaDelGusto(RICETTARIO, 'MISTIC')).toBeNull()
  })
  it('un nome che ha già la sua ricetta resta suo', () => {
    expect(ricettaDelGusto(RICETTARIO, 'NOCCIOLA', mappa)?.nome).toBe('NOCCIOLA')
  })
  it('un collegamento a una ricetta che non c\'è più non inventa niente', () => {
    expect(ricettaDelGusto(RICETTARIO, 'ZZZ', collegaNome(null, 'ZZZ', 'CANCELLATA'))).toBeNull()
  })
})

describe('La chiave è dell\'azienda', () => {
  it('sta fra le chiavi condivise, come il ricettario', () => {
    expect(SK_NOMI_GUSTI).toBe('pasticceria-nomi-gusti-v1')
    expect(SHARED_KEYS).toContain(SK_NOMI_GUSTI)
  })
})

// ── La pagina ──────────────────────────────────────────────────────────────
// MISTIC: 7 kg venduti (2 rimasti, 6 fatti il 03, 1 rimasto il 04);
// NOCCIOLA uguale. Formati: 30 €/kg.
const righe = (nome) => [
  { sede_id: 's1', gusto_nome: nome, data: '2026-08-02', produzione_g: 0, rimanenza_g: 2000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: nome, data: '2026-08-03', produzione_g: 6000, rimanenza_g: 3000, scarto_g: 0, spedito_g: 0 },
  { sede_id: 's1', gusto_nome: nome, data: '2026-08-04', produzione_g: 0, rimanenza_g: 1000, scarto_g: 0, spedito_g: 0 },
]
const RIGHE = [...righe('MISTIC'), ...righe('NOCCIOLA')]
const testo = () => document.body.textContent || ''
const apri = (extra = {}) => render(
  <AnalisiInventarioSection rows={RIGHE} rowsPrev={[]} dateFrom="2026-08-03" dateTo="2026-08-04" confronto="nessuno"
    ricettario={RICETTARIO} orgId="org-1" sedeId="s1" sedi={[]} {...extra} />
)

describe('Lo Storico dice quanto vale il gusto senza ricetta e lo fa collegare', () => {
  beforeEach(() => { NOMI_SALVATI = null; ssave.mockReset(); ssave.mockImplementation(async () => {}) })
  afterEach(() => cleanup())

  it('dice quanti chili e quanti euro mancano', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Un gusto non trova la ricetta/), { timeout: 5000 })
    expect(testo()).toMatch(/7 kg venduti \(6 kg prodotti\) che sono nel ricavo ma non nel margine/)
    expect(testo()).toMatch(/circa 210\s?€ di ricavo fuori dal margine/)
    // l'avviso falso di prima
    expect(testo()).not.toMatch(/gusti su \d+ non hanno ricetta/)
  })

  it('propone la ricetta simile e la collega col pulsante, salvando prima', async () => {
    apri()
    await waitFor(() => expect(screen.getByLabelText('Ricetta di MISTIC').value).toBe('MYSTIC'), { timeout: 5000 })
    // Prima del collegamento: ricavo della sola NOCCIOLA.
    // Prima del collegamento: ricavo di tutti e due i gusti (14 kg × 30 €),
    // margine della sola NOCCIOLA (210 € − 6 kg × 2 €/kg).
    expect(testo()).toMatch(/Ricavo stimato420\s?€/)
    expect(testo()).toMatch(/Margine stimato198\s?€/)
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    await waitFor(() => expect(testo()).toMatch(/Collegati: MISTIC → MYSTIC/), { timeout: 5000 })
    expect(ssave).toHaveBeenCalledTimes(1)
    const [chiave, valore, org, sede] = ssave.mock.calls[0]
    expect(chiave).toBe('pasticceria-nomi-gusti-v1')
    expect(valore.nomi.MISTIC.ricetta).toBe('MYSTIC')
    expect(org).toBe('org-1')
    expect(sede).toBeNull()
    // Dopo: il ricavo non cambia, il margine conta anche MISTIC.
    expect(testo()).toMatch(/Ricavo stimato420\s?€/)
    expect(testo()).toMatch(/Margine stimato396\s?€/)
    expect(testo()).not.toMatch(/non trova la ricetta/)
  })

  it('se il salvataggio non va, non cambia niente e lo dice', async () => {
    ssave.mockImplementation(async () => { throw new Error('rete giù') })
    apri()
    await waitFor(() => expect(screen.getByLabelText('Ricetta di MISTIC').value).toBe('MYSTIC'), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    await waitFor(() => expect(testo()).toMatch(/Non sono riuscito a salvare \(rete giù\)/), { timeout: 5000 })
    expect(testo()).toMatch(/Margine stimato198\s?€/)
    expect(testo()).toMatch(/Un gusto non trova la ricetta/)
  })

  it('un collegamento già salvato vale all\'apertura, e si può scollegare', async () => {
    NOMI_SALVATI = { versione: 1, nomi: { MISTIC: { ricetta: 'MYSTIC' } } }
    apri()
    await waitFor(() => expect(testo()).toMatch(/Collegati: MISTIC → MYSTIC/), { timeout: 5000 })
    expect(testo()).toMatch(/Margine stimato396\s?€/)
    fireEvent.click(screen.getByRole('button', { name: 'Scollega MISTIC' }))
    await waitFor(() => expect(testo()).toMatch(/Un gusto non trova la ricetta/), { timeout: 5000 })
    expect(ssave.mock.calls[0][1].nomi).toEqual({})
  })

  it('senza una proposta molto simile non preseleziona niente', async () => {
    render(
      <AnalisiInventarioSection rows={righe('FRAGOLA')} rowsPrev={[]} dateFrom="2026-08-03" dateTo="2026-08-04" confronto="nessuno"
        ricettario={RICETTARIO} orgId="org-1" sedeId="s1" sedi={[]} onNavigate={() => {}} />
    )
    await waitFor(() => expect(screen.getByLabelText('Ricetta di FRAGOLA')).toBeTruthy(), { timeout: 5000 })
    expect(screen.getByLabelText('Ricetta di FRAGOLA').value).toBe('')
    expect(screen.getByRole('button', { name: 'Collega' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'apri il Ricettario' })).toBeTruthy()
  })
})
