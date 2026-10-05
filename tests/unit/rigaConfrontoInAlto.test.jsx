// @vitest-environment happy-dom
//
// ── La riga del confronto senza variazione sta in alto (06/10/2026) ──────
//
// Difetto trovato guardando la foto della Produzione a 1440: nella fila delle
// quattro tessere, «periodo prima 13.974 kg (−16%)» (il confronto neutro del
// Prodotto, una riga sola) cadeva a 330 px, mentre «−13% sul periodo prima»
// delle tessere accanto, che va a capo su due righe, partiva da 320: la riga
// era centrata dentro l'altezza condivisa, 10 px più in basso. Le righe del
// confronto devono partire tutte dalla stessa linea.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RigaConfronto } from '../../src/components/analisi/parti.jsx'

describe('RigaConfronto: allineamento verticale', () => {
  it('senza variazione (confronto neutro, «nessun confronto») parte dall\'alto', () => {
    const { container } = render(<RigaConfronto senzaConfronto="periodo prima 13.974 kg" />)
    expect(container.firstChild.style.alignItems).toBe('flex-start')
  })
  it('anche «nessun confronto» di base', () => {
    const { container } = render(<RigaConfronto />)
    expect(container.firstChild.style.alignItems).toBe('flex-start')
  })
  it('intorno: con la variazione resta centrata con la freccia e il testo', () => {
    const { container } = render(<RigaConfronto variazione={{ verso: 'peggio', testoDelta: '−13%', delta: -13 }} rispettoA="sul periodo prima" />)
    expect(container.firstChild.style.alignItems).toBe('center')
    expect(container.textContent).toMatch(/−13%.*sul periodo prima.*peggio/)
  })
})
