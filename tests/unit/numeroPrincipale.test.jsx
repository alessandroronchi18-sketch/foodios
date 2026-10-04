// @vitest-environment happy-dom
//
// ── Una risposta grande per pagina ──────────────────────────────────────
//
// 04/10/2026. L'audit del design misurato al pixel (IM3 e «cosa manca per
// l'effetto figo») ha trovato che nelle quattro pagine dell'Analisi tutto
// pesava uguale: riquadri bianchi identici, numeri da 22 px, il 75% dei testi
// a 12-13 px. Nel Mese la risposta alla domanda della pagina («quanto ho
// guadagnato?») era l'elemento più debole: una frase grigia da 16 px accanto
// a numeri neri da 22. ANALISI_DESIGN §6: una risposta grande per pagina,
// 36-48 px, con unità piccola, confronto e una frase. `NumeroPrincipale` è
// quel pezzo; qui si prova che faccia quello che promette, anche quando il
// numero non c'è.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { NumeroPrincipale, Andamentino } from '../../src/components/analisi/index.js'
import { variazione } from '../../src/lib/formatoAnalisi.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const cifraDi = (container) => [...container.querySelectorAll('span')].find(s => /^\d/.test(s.textContent) && parseFloat(s.style.fontSize) >= 36)
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const stessoColore = (a, hex) => a === hex || a === rgb(hex)

describe('Il numero grande', () => {
  it('48 px al computer, 36 al telefono: più grande di qualunque tessera', () => {
    const { container, unmount } = render(<NumeroPrincipale etichetta="Utile di agosto" valore="12.480 €" />)
    expect(parseFloat(cifraDi(container).style.fontSize)).toBe(48)
    unmount()
    const r = render(<NumeroPrincipale isMobile etichetta="Utile di agosto" valore="12.480 €" />)
    expect(parseFloat(cifraDi(r.container).style.fontSize)).toBe(36)
  })

  it('l\'euro è piccolo e grigio, il numero ha le cifre proporzionali', () => {
    const { container } = render(<NumeroPrincipale etichetta="Utile" valore="12.480 €" />)
    const cifra = cifraDi(container)
    const euro = cifra.querySelector('span')
    expect(euro.textContent).toBe(' €')
    expect(parseFloat(euro.style.fontSize)).toBeLessThan(parseFloat(cifra.style.fontSize) * 0.7)
    expect(cifra.style.fontVariantNumeric).not.toBe('tabular-nums')
  })

  it('una stima lo dice in parole accanto al numero', () => {
    const { container } = render(<NumeroPrincipale etichetta="Incassi" valore="124.553 €" stimato />)
    expect(container.textContent).toMatch(/124\.553 €stimato/)
  })

  it('il confronto: freccia dal segno, colore dal giudizio, il numero di allora', () => {
    const v = variazione({ attuale: 50497, confronto: 33200, piuEMeglio: false })
    const { container } = render(<NumeroPrincipale etichetta="Spese" valore="50.497 €" variazione={v} rispettoA="su agosto 2025" valoreConfronto="33.200 €" />)
    expect(container.textContent).toMatch(/\+52%su agosto 2025\(33\.200 €\)peggio/)
    const icona = container.querySelector('svg').parentElement
    expect(stessoColore(icona.style.color, T.red)).toBe(true)
  })

  it('una frase sola, stretta abbastanza da leggersi', () => {
    const { container } = render(<NumeroPrincipale etichetta="Utile" valore="12.480 €" frase="Su 100 € incassati te ne restano 18." />)
    const p = container.querySelectorAll('p')
    expect(p).toHaveLength(1)
    expect(p[0].textContent).toBe('Su 100 € incassati te ne restano 18.')
    expect(p[0].style.maxWidth).toBe('640px')
  })

  it('a destra c\'è posto per l\'andamento; al telefono va sotto', () => {
    const el = (isMobile) => <NumeroPrincipale isMobile={isMobile} etichetta="Utile" valore="12.480 €" destra={<Andamentino valori={[1, 2, 3, 4]} />} />
    const { container, unmount } = render(el(false))
    expect(container.firstChild.style.gridTemplateColumns).toBe('minmax(0, 1fr) auto')
    expect(container.querySelector('svg[role="img"]')).toBeTruthy()
    unmount()
    expect(render(el(true)).container.firstChild.style.gridTemplateColumns).toBe('minmax(0, 1fr)')
  })

  it('chi legge lo schermo trova la risposta per nome', () => {
    render(<NumeroPrincipale etichetta="Utile di agosto" valore="12.480 €" />)
    expect(screen.getByRole('region', { name: 'Utile di agosto' }).textContent).toMatch(/12\.480 €/)
  })
})

describe('Quando il numero non si sa', () => {
  it('mostra grande il numero che si sa, e sotto il perché in ambra con l\'azione', () => {
    const apri = vi.fn()
    const { container } = render(<NumeroPrincipale etichetta="Utile di agosto" valore={null}
      motivoMancante="manca il personale: l'utile vero sarà più basso"
      noto={{ valore: '74.057 €', etichetta: 'Utile prima del personale', stimato: true }}
      azione={{ etichetta: 'Apri Personale', onClick: apri }} />)
    expect(screen.getByRole('region', { name: 'Utile prima del personale' })).toBeTruthy()
    expect(parseFloat(cifraDi(container).style.fontSize)).toBe(48)
    expect(container.textContent).toMatch(/74\.057 €stimato/)
    const motivo = [...container.querySelectorAll('div')].filter(d => /manca il personale/.test(d.textContent)).pop()
    expect(stessoColore(motivo.style.color, T.amberDark)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apri Personale' }))
    expect(apri).toHaveBeenCalled()
  })

  it('senza un numero noto, il perché è la risposta, grande; mai zero', () => {
    const { container } = render(<NumeroPrincipale etichetta="Utile di settembre" valore={null} motivoMancante="Non posso dirtelo: mancano gli incassi" />)
    const frase = [...container.querySelectorAll('span')].find(s => s.textContent === 'Non posso dirtelo: mancano gli incassi')
    expect(parseFloat(frase.style.fontSize)).toBeGreaterThanOrEqual(22)
    expect(container.textContent).not.toMatch(/0 €/)
  })

  it('senza confronto e senza termine di confronto non scrive una riga vuota', () => {
    const { container } = render(<NumeroPrincipale etichetta="Da rifare entro domani" valore="18 gusti" />)
    expect(container.textContent).toBe('Da rifare entro domani18 gusti')
  })
})
