// @vitest-environment happy-dom
//
// ── Il nome si accorcia solo se lo spazio manca davvero ───────────────────
//
// Il difetto, segnalato dal titolare il 18/09/2026 mentre modificava la
// ricetta MAROTTO: «Base agrimontana ciocolato» compariva accorciata con i
// puntini **anche se c'era tanto spazio**.
//
// La causa era un tetto fisso: `maxWidth: isMobile ? 130 : 180`. Era stato
// messo per una ragione buona — evitare che un nome lungo spingesse fuori le
// colonne dei numeri — ma un tetto in pixel non sa quanto spazio c'è. Su uno
// schermo largo accorciava lo stesso, e su uno stretto non bastava comunque.
// Su un ricettario di gelateria, dove le basi si chiamano «Base agrimontana
// ciocolato» e «Base bianca senza lattosio», toccava quasi tutte le righe.
//
// Adesso il nome prende quello che la colonna gli lascia, e i puntini
// compaiono solo quando servono.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import NuovaRicettaView from '../../src/views/NuovaRicettaView.jsx'

const RICETTARIO = {
  ingredienti_costi: {
    'base agrimontana ciocolato': { costoKg: 4.38, costoG: 0.00438 },
    panna: { costoKg: 4.7, costoG: 0.0047 },
  },
  ricette: {
    MAROTTO: {
      nome: 'MAROTTO', tipo: 'gusto', unita: 1, prezzo: 0,
      ingredienti: [
        { nome: 'base agrimontana ciocolato', qty1stampo: 1000 },
        { nome: 'panna', qty1stampo: 200 },
      ],
    },
  },
}

function apriMarotto() {
  const utils = render(
    <NuovaRicettaView ricettario={RICETTARIO} notify={() => {}} onSave={async () => {}}
      editingRicetta="MAROTTO" onEditConsumed={() => {}} tipoAttivita="gelateria" />
  )
  return utils
}

/** La cella del nome, nella tabella degli ingredienti. */
function cellaDelNome(container, testo) {
  return [...container.querySelectorAll('span')]
    .find(el => (el.textContent || '').trim() === testo)
}

describe('Il nome lungo di una base non viene accorciato a priori', () => {
  it('nessun tetto in pixel sul nome', () => {
    const { container } = apriMarotto()
    const span = cellaDelNome(container, 'Base agrimontana ciocolato')
    expect(span, 'la riga della base non si trova').toBeTruthy()
    // Era `maxWidth: 180px`: un numero fisso che non sa quanto spazio c'è.
    expect(span.style.maxWidth).toBe('100%')
    expect(span.style.maxWidth).not.toMatch(/\d+px/)
  })

  it('i puntini restano, ma solo per quando lo spazio manca davvero', () => {
    const { container } = apriMarotto()
    const span = cellaDelNome(container, 'Base agrimontana ciocolato')
    expect(span.style.textOverflow).toBe('ellipsis')
    expect(span.style.overflow).toBe('hidden')
  })

  it('la cella può stringersi: senza, il figlio non sa a cosa riferirsi', () => {
    const { container } = apriMarotto()
    const span = cellaDelNome(container, 'Base agrimontana ciocolato')
    const cella = span.closest('td')
    expect(cella, 'il nome non sta in una cella di tabella').toBeTruthy()
    // In una tabella una cella non si stringe sotto il suo contenuto se non
    // glielo si dice: `maxWidth: 0` è il modo con cui si ottiene, ed è quello
    // che fa funzionare `maxWidth: 100%` sul figlio.
    // happy-dom normalizza lo zero senza unità: vanno bene tutt'e due.
    expect(['0', '0px']).toContain(cella.style.maxWidth)
  })

  it('il nome esatto resta raggiungibile, se mai venisse accorciato', () => {
    const { container } = apriMarotto()
    const span = cellaDelNome(container, 'Base agrimontana ciocolato')
    // Il `title` porta il nome com'è salvato, non come si legge: serve a chi
    // deve ritrovarlo nel listino.
    expect(span.getAttribute('title')).toBe('base agrimontana ciocolato')
  })

  it('e si legge con la maiuscola, come chiesto il giorno prima', () => {
    const { container } = apriMarotto()
    expect(cellaDelNome(container, 'Base agrimontana ciocolato')).toBeTruthy()
    expect(cellaDelNome(container, 'BASE AGRIMONTANA CIOCOLATO')).toBeFalsy()
  })
})
