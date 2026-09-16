// @vitest-environment happy-dom
//
// La settimana e il mese di «Produzione» sul telefono.
//
// Il titolare, il 16/09/2026: «in produzione se vedo settimana o mese non
// riesco a leggere nulla, la tabella è troppo grande». Misurato: la tabella
// della settimana è larga 1.280px (sedici colonne — il gusto, sette giorni per
// due valori, due totali) e quella del mese 680px. Su un telefono da 390px
// sono tre schermate e mezza e quasi due.
//
// Sul telefono le due viste ora sono fatte a schede, una per gusto. Questi
// test tengono ferme le tre cose che si possono perdere rifacendo la pagina:
// che sul telefono la tabella larga non venga renderizzata, che i campi
// restino scrivibili, e che l'avviso dei giorni che non tornano resti
// leggibile senza passare il mouse (sul telefono il mouse non c'è).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

vi.mock('../../src/lib/useIsMobile', () => ({ default: () => true, useIsTablet: () => false }))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/stockPF', () => ({ caricoProduzionePF: async () => 0 }))

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
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

const ricettario = {
  ricette: {
    r1: { nome: 'NOCCIOLA', tipo: 'gusto', is_gusto: true, categoria: 'Gusti', ingredienti: [] },
    r2: { nome: 'PISTACCHIO', tipo: 'gusto', is_gusto: true, categoria: 'Gusti', ingredienti: [] },
  },
  ingredienti_costi: {},
}
const comuni = {
  ricettario, magazzino: {}, giornaliero: [], chiusure: [],
  orgId: 'org-1', sedeId: 's1', notify: () => {}, setMagazzino: () => {},
  sedi: [{ id: 's1', nome: 'Corso Vittorio', attiva: true }],
  sedeAttiva: { id: 's1', nome: 'Corso Vittorio' },
  tipoAttivita: 'gelateria', metodoProduzione: 'inventario',
}

async function apri(scheda) {
  const { default: View } = await import('../../src/views/InventarioSettimanaleView.jsx')
  try { localStorage.setItem('foodos_inventario_onboarding_v1', '1') } catch { /* senza storage */ }
  const v = render(<View {...comuni} />)
  await new Promise(r => setTimeout(r, 60))
  const b = [...v.container.querySelectorAll('button')].find(x => x.textContent.trim() === scheda)
  expect(b, `la scheda "${scheda}" deve esistere`).toBeTruthy()
  fireEvent.click(b)
  await new Promise(r => setTimeout(r, 60))
  return v
}

describe('produzione sul telefono: settimana e mese a schede', () => {
  it('la settimana non renderizza la tabella da 1.280px', async () => {
    const v = await apri('Settimana')
    const larghe = [...v.container.querySelectorAll('table')]
      .filter(t => Number(t.style.minWidth.replace('px', '')) > 390)
    expect(larghe).toHaveLength(0)
    v.unmount()
  })

  it('la settimana mostra una scheda per gusto col totale già visibile', async () => {
    const v = await apri('Settimana')
    expect(screen.getAllByText('NOCCIOLA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PISTACCHIO').length).toBeGreaterThan(0)
    // I totali del gusto si leggono senza aprire niente.
    expect(screen.getAllByText('Prodotto').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Venduto').length).toBeGreaterThan(0)
    v.unmount()
  })

  it('aprendo una scheda compaiono i sette giorni con i due campi', async () => {
    const v = await apri('Settimana')
    const chevron = v.container.querySelector('button[aria-label^="Apri i sette giorni"]')
    expect(chevron).toBeTruthy()
    fireEvent.click(chevron)
    // Sette giorni × 2 campi = 14 campi scrivibili per gusto.
    const campi = [...v.container.querySelectorAll('input[inputmode="numeric"]')]
    expect(campi.length).toBeGreaterThanOrEqual(14)
    v.unmount()
  })

  it('«Apri tutte» apre tutte le schede insieme', async () => {
    const v = await apri('Settimana')
    const tutte = [...v.container.querySelectorAll('button')].find(b => b.textContent.trim() === 'Apri tutte')
    expect(tutte).toBeTruthy()
    fireEvent.click(tutte)
    // Due gusti × 14 campi.
    expect(v.container.querySelectorAll('input[inputmode="numeric"]').length).toBeGreaterThanOrEqual(28)
    v.unmount()
  })

  it('il mese non renderizza la tabella da 680px', async () => {
    const v = await apri('Mese')
    const larghe = [...v.container.querySelectorAll('table')]
      .filter(t => Number(t.style.minWidth.replace('px', '')) > 390)
    expect(larghe).toHaveLength(0)
    // Le cinque settimane restano leggibili come etichette.
    expect(screen.getAllByText('W1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('W5').length).toBeGreaterThan(0)
    v.unmount()
  })
})

describe('quello che il telefono non può mostrare con il passaggio del mouse', () => {
  const SRC = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'views', 'InventarioSettimanaleView.jsx'),
    'utf8',
  )

  it('i giorni che non tornano si spiegano a schermo, non solo in un title', () => {
    // Nella tabella da tavolo la spiegazione sta in un `title`: sul telefono
    // non esiste il passaggio del mouse, quindi quel messaggio non lo legge
    // nessuno. Nelle schede la stessa frase è scritta in chiaro.
    const schede = SRC.slice(SRC.indexOf('function SchedeSettimana'))
    expect(schede).toMatch(/il conto non torna di/)
    expect(schede).toMatch(/manca la rimanenza del giorno prima/)
  })

  it('la regola anti-zoom NON è riscritta qui: sta in index.html', () => {
    // Sotto i 16px iOS ingrandisce la pagina a ogni tocco su un campo, ma la
    // regola giusta è quella globale (`@media (pointer: coarse)` in
    // index.html): vale per telefono E tablet. Riscriverla nel componente con
    // `isMobile` la applica a metà dei dispositivi a tocco e si dimentica
    // dell'altra metà — è il difetto che il cricchetto dei token chiama
    // «antizoom-a-mano».
    const cella = SRC.slice(SRC.indexOf('function CellInput'), SRC.indexOf('function CellInput') + 3000)
    expect(cella).not.toMatch(/fontSize: isMobile \? 16/)
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8')
    expect(html).toMatch(/@media \(pointer: coarse\)[\s\S]{0,120}font-size: 16px/)
  })

  it('la fascia dei totali in alto usa colonne che possono restringersi', () => {
    // `1fr` non scende sotto il contenuto: con le scritte su una riga sola la
    // fascia diventava larga 581px dentro uno schermo da 390, e la pagina
    // scorreva di lato di 191px.
    const fascia = SRC.slice(SRC.indexOf('function KpiCompactBar'))
    expect(fascia).toMatch(/minmax\(0,1fr\) minmax\(0,1fr\)/)
    expect(fascia).not.toMatch(/gridTemplateColumns: '1fr 1fr 1fr'/)
  })
})
