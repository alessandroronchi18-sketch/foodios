// @vitest-environment happy-dom
// Nella vista per fornitore le colonne restano incolonnate anche quando una
// riga ha una casella in meno.
//
// Segnalato dal titolare il 19/09/2026, parole sue: «le cifre devono stare
// sempre incolonnate fra di loro, le box verdi con "ho pagato" idem, e le
// altre box pure. Se manca una box in una riga non è che scalano tutte le
// altre, ma le altre rimangono incolonnate dove sono».
//
// Era il difetto classico del `flex` senza posti fissi. Su ogni riga possono
// mancare tre cose: il bollino rosso «scaduto …» (se quel fornitore non ha
// niente di scaduto), il pulsante verde «Ho pagato» (se non c'è residuo da
// pagare — capita con le note di credito) e la copia dell'estratto conto (se
// la fattura è una sola). Quando una mancava, la riga si richiudeva verso
// destra e tutto il resto scivolava: il totale di un fornitore non stava sopra
// il totale di quello dopo, e due cifre che servono a essere confrontate non
// si potevano confrontare.
//
// Il rimedio è quello che il progetto usa già in `SemilavoratiView.jsx`
// (`LARG_AVVISO_PREZZO`): ogni posto ha la sua larghezza e resta vuoto invece
// di sparire.
//
// Come si prova senza un motore di impaginazione: happy-dom non calcola le
// posizioni, quindi non si possono misurare i pixel. Si prova la cosa che li
// determina — che ogni riga abbia gli stessi posti, nello stesso ordine, con
// le stesse larghezze. Col codice di prima le righe avevano un numero DIVERSO
// di figli (5 quella completa, 3 quella spoglia) e la prova è rossa.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoFornitori.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', () => ({ sload: async () => null, ssave: async () => {} }))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const { reset, fattura, SEDI_TRE } = await import('./aiutoFornitori.jsx')
const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')

// Tre fornitori fatti apposta perché ognuno abbia caselle diverse:
//  • Latteria Rossi   — ha dello scaduto, più fatture, residuo da pagare:
//                       tutte e tre le caselle facoltative ci sono.
//  • Zucchero Bianchi — niente di scaduto, una fattura sola: niente bollino
//                       rosso, niente copia dell'estratto conto.
//  • Nota Credito Srl — solo una nota di credito (importo negativo): niente
//                       scaduto, niente «Ho pagato», niente copia.
const FATTURE = [
  fattura({ id: 'r1', fornitore: 'Latteria Rossi', totale: 1200, fra: -30 }),
  fattura({ id: 'r2', fornitore: 'Latteria Rossi', totale: 800, fra: 20 }),
  fattura({ id: 'b1', fornitore: 'Zucchero Bianchi', totale: 500, fra: 20 }),
  fattura({ id: 'n1', fornitore: 'Nota Credito Srl', totale: -300, fra: 20 }),
]

const POSTI = ['scaduto', 'dovuto', 'ho-pagato', 'estratto-conto', 'anagrafica']

async function montaPerFornitore() {
  const r = render(<Scadenzario orgId="org-1" sedeId="s1" sedi={SEDI_TRE} pagina="scadenzario" onNavigate={() => {}} />)
  await waitFor(() => { expect(r.container.textContent).toMatch(/Per fornitore/) }, { timeout: 4000 })
  const passa = [...r.container.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === 'Vista Per fornitore')
  expect(passa, 'non c\'è più la vista «Per fornitore»').toBeTruthy()
  act(() => { fireEvent.click(passa) })
  await waitFor(() => { expect(r.container.querySelectorAll('[data-colonne-fornitore]').length).toBeGreaterThan(0) }, { timeout: 4000 })
  return r
}

beforeEach(() => reset({ fatture: FATTURE.map(f => ({ ...f })), fornitori: [] }))
afterEach(() => cleanup())

describe('i posti della riga ci sono sempre, anche vuoti', () => {
  it('tre fornitori con caselle diverse hanno gli stessi cinque posti', async () => {
    const { container } = await montaPerFornitore()
    const righe = [...container.querySelectorAll('[data-colonne-fornitore]')]
    expect(righe.length, 'i fornitori a schermo non sono tre').toBe(3)
    for (const riga of righe) {
      const posti = [...riga.children].map(c => c.getAttribute('data-posto'))
      expect(posti, 'una riga ha posti diversi dalle altre').toEqual(POSTI)
    }
  })

  it('e le colonne sono le stesse su tutte le righe, larghezze comprese', async () => {
    const { container } = await montaPerFornitore()
    const griglie = [...container.querySelectorAll('[data-colonne-fornitore]')]
      .map(r => r.style.gridTemplateColumns)
    expect(new Set(griglie).size, 'le righe hanno colonne di larghezze diverse').toBe(1)
    // Non basta che siano uguali: devono essere FISSE. Con `auto` le colonne
    // si allargano sul contenuto e due righe con contenuti diversi tornano
    // disallineate.
    expect(griglie[0], 'le colonne non hanno una larghezza propria').toMatch(/^\d+px \d+px \d+px \d+px \d+px$/)
  })

  it('la riga senza scaduto tiene il posto vuoto invece di richiudersi', async () => {
    const { container } = await montaPerFornitore()
    const righe = [...container.querySelectorAll('[data-colonne-fornitore]')]
    const conScaduto = righe.filter(r => (r.querySelector('[data-posto="scaduto"]').textContent || '').includes('scaduto'))
    const senzaScaduto = righe.filter(r => !(r.querySelector('[data-posto="scaduto"]').textContent || '').includes('scaduto'))
    expect(conScaduto.length, 'nessuna riga mostra lo scaduto').toBe(1)
    expect(senzaScaduto.length, 'nessuna riga è senza scaduto: la prova non prova niente').toBe(2)
    for (const r of senzaScaduto) {
      expect(r.querySelector('[data-posto="scaduto"]'), 'il posto dello scaduto è sparito').toBeTruthy()
      expect(r.querySelector('[data-posto="scaduto"]').textContent.trim()).toBe('')
    }
  })

  it('la riga senza «Ho pagato» tiene il posto vuoto: è il caso della nota di credito', async () => {
    const { container } = await montaPerFornitore()
    const righe = [...container.querySelectorAll('[data-colonne-fornitore]')]
    const conBottone = righe.filter(r => r.querySelector('[data-posto="ho-pagato"] button'))
    const senzaBottone = righe.filter(r => !r.querySelector('[data-posto="ho-pagato"] button'))
    expect(senzaBottone.length, 'nessuna riga è senza il pulsante verde: la prova non prova niente').toBe(1)
    expect(conBottone.length).toBe(2)
    expect(senzaBottone[0].querySelector('[data-posto="ho-pagato"]'), 'il posto del pulsante verde è sparito').toBeTruthy()
  })

  it('e il posto della copia dell\'estratto conto pure', async () => {
    const { container } = await montaPerFornitore()
    const righe = [...container.querySelectorAll('[data-colonne-fornitore]')]
    const senzaCopia = righe.filter(r => !r.querySelector('[data-posto="estratto-conto"] button'))
    expect(senzaCopia.length, 'tutti i fornitori hanno più di una fattura: la prova non prova niente').toBe(2)
    for (const r of senzaCopia) {
      expect(r.querySelector('[data-posto="estratto-conto"]')).toBeTruthy()
    }
  })

  it('il posto dell\'anagrafica è l\'ultimo su tutte le righe, e ha sempre il suo pulsante', async () => {
    const { container } = await montaPerFornitore()
    for (const riga of container.querySelectorAll('[data-colonne-fornitore]')) {
      const ultimo = riga.children[riga.children.length - 1]
      expect(ultimo.getAttribute('data-posto')).toBe('anagrafica')
      expect(ultimo.querySelector('button'), 'la riga ha perso il pulsante dell\'anagrafica').toBeTruthy()
    }
  })

  it('i pulsanti di quelle colonne restano grandi abbastanza da premerli', async () => {
    const { container } = await montaPerFornitore()
    for (const b of container.querySelectorAll('[data-colonne-fornitore] button')) {
      const h = parseInt(b.style.minHeight, 10)
      expect(h, `un pulsante della riga fornitore è alto ${h}px`).toBeGreaterThanOrEqual(40)
    }
  })
})
