// @vitest-environment happy-dom
//
// La lista di riordino non deve seppellire il resto della pagina.
//
// Il difetto, segnalato dall'utente il 7/09: la lista sta SOPRA la barra delle
// schede e non aveva alcun limite di righe. In produzione un'azienda ha 56
// ingredienti: con venti sotto soglia la lista da sola fa ~1.200px e spinge
// schede e tabella fuori dallo schermo; con cinquanta, oltre 3.000px — tre
// schermate di scorrimento prima di poter cliccare una scheda.
//
// La lista serve a sapere cosa ordinare ADESSO, e quello lo dicono le prime
// righe se sono ordinate per urgenza vera.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
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
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

/** 30 ingredienti tutti sotto soglia: il caso che seppelliva la pagina. */
function magazzinoAffollato(n = 30) {
  const out = {}
  for (let i = 0; i < n; i++) {
    // Giacenze crescenti: il primo e' il piu' magro, quindi il piu' urgente.
    out[`ingrediente ${String(i).padStart(2, '0')}`] = { giacenza_g: 100 + i * 10, soglia_g: 5000 }
  }
  return out
}

const props = {
  ricettario: { ricette: {}, ingredienti_costi: {} },
  setMagazzino: () => {}, logRif: [], setLogRif: () => {}, logPrezzi: [],
  giornaliero: [], notify: () => {}, orgId: 'org-1', sedeId: 's1',
}

/** Righe della tabella dentro la scheda "Lista di riordino". */
function righeRiordino(container) {
  const card = container.querySelector('#riordino-urgente')
  if (!card) return 0
  return card.querySelectorAll('tbody tr').length
}

beforeEach(() => cleanup())

describe('lista di riordino — quante righe', () => {
  it('con trenta ingredienti da ordinare non ne stampa trenta', async () => {
    const v = render(<MagazzinoView {...props} magazzino={magazzinoAffollato(30)} />)
    await waitFor(() => expect(v.container.textContent).toContain('Lista di riordino'))
    expect(righeRiordino(v.container)).toBe(6)
  })

  it('dice che sta mostrando solo i più urgenti, e quanti restano', async () => {
    const v = render(<MagazzinoView {...props} magazzino={magazzinoAffollato(30)} />)
    await waitFor(() => expect(v.container.textContent).toContain('Lista di riordino'))
    expect(v.container.textContent).toContain('i 6 più urgenti')
    expect(v.container.textContent).toContain('Vedi gli altri 24 da ordinare')
  })

  it('il totale della spesa è su TUTTI, non solo sui visibili', async () => {
    // Ordinare guardando un totale parziale e' peggio che non vederlo: si
    // compra per meta' del fabbisogno credendo di aver coperto tutto.
    const v = render(<MagazzinoView {...props}
      magazzino={magazzinoAffollato(30)}
      ricettario={{ ricette: {}, ingredienti_costi: Object.fromEntries(
        Object.keys(magazzinoAffollato(30)).map(k => [k, { costoKg: 10, costoG: 0.01 }])) }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Spesa stimata'))
    // 30 ingredienti × ~7,4 kg × 10 €/kg ≈ 2.220 €: molto oltre i 6 visibili.
    const testo = v.container.textContent
    const match = testo.match(/Spesa stimata([\d.]+) €/)
    expect(match).toBeTruthy()
    const totale = Number(match[1].replace(/\./g, ''))
    expect(totale).toBeGreaterThan(1500)
  })

  it('aprendo si vedono tutti, e si può richiudere', async () => {
    const v = render(<MagazzinoView {...props} magazzino={magazzinoAffollato(30)} />)
    await waitFor(() => expect(v.container.textContent).toContain('Lista di riordino'))

    fireEvent.click(v.getByText(/Vedi gli altri 24/))
    await waitFor(() => expect(righeRiordino(v.container)).toBe(30))
    expect(v.container.textContent).toContain('Mostra solo i 6 più urgenti')

    fireEvent.click(v.getByText(/Mostra solo i 6/))
    await waitFor(() => expect(righeRiordino(v.container)).toBe(6))
  })

  it('con pochi ingredienti non compare nessun pulsante', async () => {
    const v = render(<MagazzinoView {...props} magazzino={magazzinoAffollato(3)} />)
    await waitFor(() => expect(v.container.textContent).toContain('Lista di riordino'))
    expect(righeRiordino(v.container)).toBe(3)
    expect(v.container.textContent).not.toContain('Vedi gli altri')
    expect(v.container.textContent).not.toContain('più urgenti')
  })
})

describe('lista di riordino — in che ordine', () => {
  it('prima quello che finisce domani, non quello in ordine alfabetico', async () => {
    // Due ingredienti sotto soglia, stesso stato: deve venire prima quello con
    // meno giorni di scorta. Serve uno storico di produzione per avere i
    // giorni di scorta, quindi si passa `giornaliero`.
    const ricettario = {
      ricette: {
        r1: { nome: 'TORTA', tipo: 'torta', porzioni: 8, prezzo: 20, ingredienti: [
          { nome: 'zucchero', qty1stampo: 100 },   // consumo lento
          { nome: 'burro', qty1stampo: 2000 },     // consumo veloce
        ] },
      },
      ingredienti_costi: {},
    }
    const oggi = new Date().toISOString().slice(0, 10)
    const v = render(<MagazzinoView {...props}
      ricettario={ricettario}
      giornaliero={[{ data: oggi, prodotti: [{ nome: 'TORTA', stampi: 5 }] }]}
      magazzino={{
        zucchero: { giacenza_g: 3000, soglia_g: 9000 },
        burro:    { giacenza_g: 3000, soglia_g: 9000 },
      }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Lista di riordino'))

    const card = v.container.querySelector('#riordino-urgente')
    const nomi = [...card.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim())
    // Il burro si consuma venti volte piu' in fretta: finisce prima.
    expect(nomi[0]).toBe('burro')
  })

  it('l\'esaurito viene sempre prima di chi è solo sotto soglia', async () => {
    const v = render(<MagazzinoView {...props} magazzino={{
      'aaa primo alfabetico': { giacenza_g: 4000, soglia_g: 9000 },
      'zzz ultimo alfabetico': { giacenza_g: 0, soglia_g: 9000 },
    }} />)
    await waitFor(() => expect(v.container.textContent).toContain('Lista di riordino'))
    const card = v.container.querySelector('#riordino-urgente')
    const nomi = [...card.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent.trim())
    expect(nomi[0]).toBe('zzz ultimo alfabetico')
  })
})
