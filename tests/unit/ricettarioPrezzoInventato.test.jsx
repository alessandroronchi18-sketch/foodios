// @vitest-environment happy-dom
//
// Ricettario: il tool inventava il prezzo di vendita e ci costruiva sopra un
// giudizio.
//
// getR (foodcost.js) per una ricetta senza prezzo restituiva
// `{ unita: 8, prezzo: 4, tipo: 'fetta' }`. Le ricette importate da Excel non
// hanno unita/prezzo, e nel database di produzione del 09/09/2026 erano 24 delle
// 27 ricette del design partner — che e' una GELATERIA, dove le "fette da 4 €"
// non esistono.
//
// Quello che si vedeva davvero:
//   NOCCIOLA  "8 fette × 4,00 €" · Ricavo 32,00 € · Margine 29,69 € · 92,8%
//             · badge verde "Eccellente"
//   LIMONE    Margine 99,8% · badge verde "Eccellente"
//   KPI in cima: "Food cost medio 5,6%" in verde (in gelateria e' 25-35%)
//
// Nessuno di quei numeri era stato inserito da qualcuno. E il secondo difetto
// li peggiorava: il badge "N prezzi stimati" contava gli ingredienti SENZA
// prezzo, che calcolaFC esclude dal totale valendo zero. Su NOCCIOLA la pasta
// nocciola (110 g, 25-40 €/kg) non era contata: il food cost vero e' più che
// doppio, e la card diceva "Base bianca 100%".

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { getR } from '../../src/lib/foodcost'

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, ssaveBatch: async () => {},
  sload: async () => null, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/listinoSede', async (orig) => {
  const vero = await orig()
  return { ...vero, useListinoSede: () => ({ listino: null, salva: async () => {} }) }
})
vi.mock('../../src/lib/useRicavoFlat', () => ({
  useRicavoFlat: () => ({
    formati: [], byCategoria: {},
    ricavoFlatFor: () => 0,
    ricavoEffettivo: () => 0,
  }),
}))

const RicettarioView = (await import('../../src/views/RicettarioView.jsx')).default

// Ricalca il caso vero: nessun tipo/unita/prezzo (import da Excel), un
// ingrediente col prezzo e uno senza.
const ricettario = {
  ricette: {
    'NOCCIOLA': {
      nome: 'NOCCIOLA',
      ingredienti: [
        { nome: 'base bianca', qty1stampo: 1000 },
        { nome: 'pasta nocciola', qty1stampo: 110 },
      ],
    },
  },
  ingredienti_costi: { 'base bianca': { costoKg: 2.31, costoG: 0.00231 } },
}

function monta() {
  return render(
    <RicettarioView
      ricettario={ricettario}
      onUpdateRegola={async () => {}}
      onUpload={() => {}}
      onEditRicetta={() => {}}
      orgId="org-test"
      sedi={[]}
      sedeAttiva={null}
      notify={() => {}}
    />
  )
}

afterEach(() => cleanup())

describe('Ricettario — niente prezzi inventati', () => {
  it('getR non restituisce piu 4,00 € per una ricetta senza prezzo', () => {
    const r = getR('NOCCIOLA', ricettario.ricette['NOCCIOLA'])
    expect(r.prezzo).toBe(0)
    expect(r.senzaRegola).toBe(true)
  })

  it('la card chiusa non mostra un margine, dice che il prezzo va impostato', () => {
    monta()
    expect(screen.queryByText(/8 fette × 4,00/)).toBeNull()
    expect(screen.queryByText('92,8%')).toBeNull()
    // Le card sono chiuse di default: questo e' cio che l'utente vede per primo.
    expect(screen.getAllByText(/prezzo da impostare/i).length).toBeGreaterThan(0)
  })

  it('aprendo la card, la riga del prezzo lo dichiara e i box mostrano un trattino', () => {
    monta()
    fireEvent.click(screen.getByText('NOCCIOLA'))
    expect(screen.getByText(/Prezzo di vendita da impostare/i)).toBeTruthy()
    expect(screen.queryByText('32,00 €')).toBeNull()   // il Ricavo inventato
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('non compare nessun badge verde di merito su una ricetta senza prezzo', () => {
    monta()
    for (const bugia of ['Eccellente', 'Buono', 'Accettabile', 'Basso - rivedere']) {
      expect(screen.queryByText(bugia), `il badge "${bugia}" non deve comparire`).toBeNull()
    }
    expect(screen.getAllByText(/prezzo da impostare/i).length).toBeGreaterThan(0)
  })

  it('gli ingredienti senza prezzo sono chiamati "senza prezzo", non "stimati"', () => {
    monta()
    // La pasta nocciola vale ZERO nel calcolo: chiamarla "stima" nascondeva che
    // il food cost mostrato e' meno della meta' del vero.
    expect(screen.queryByText(/prezzi stimati/i)).toBeNull()
    expect(screen.queryByText(/^1 stime$/i)).toBeNull()
    expect(screen.getByText(/1 senza prezzo/i)).toBeTruthy()
  })

  it('il KPI food cost medio dichiara che nessuna ricetta ha un prezzo', () => {
    monta()
    expect(screen.getByText(/serve il prezzo di vendita di almeno una ricetta/i)).toBeTruthy()
    // E non mostra una percentuale verde inventata.
    expect(screen.queryByText('5,6%')).toBeNull()
  })
})
