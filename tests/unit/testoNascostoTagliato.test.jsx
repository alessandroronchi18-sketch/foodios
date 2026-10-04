// @vitest-environment happy-dom
//
// ── Niente testo nascosto a 1 px nei pezzi dell'Analisi ─────────────────
//
// 04/10/2026, segnalato dall'agente delle pagine guardando le foto misurate:
// al telefono il righello trovava «tagliati» la parola «peggio» nelle tessere
// (larga 1 px, ne servivano 42) e «Da dove vengono i numeri:» nel pulsante
// della copertura (1 px su 180). Non erano scritte troncate per sbaglio: erano
// testi per chi legge lo schermo, nascosti con il trucco del riquadro da 1 px
// e `overflow: hidden`. Ma il giudizio («peggio») detto solo a chi usa un
// lettore di schermo voleva dire, per tutti gli altri, giudizio affidato al
// colore solo — contro la regola 7 di ANALISI_DESIGN («lo stato si scrive a
// parole»). E un righello che grida a ogni foto per un falso allarme finisce
// per non essere più ascoltato.
//
// La correzione: il giudizio si scrive, visibile, come nella tabella del conto
// («↗ +52% su agosto 2025 · peggio»); il nome della copertura sta in cima al
// pannello aperto. Nessun pezzo comune nasconde più testo in 1 px.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import * as A from '../../src/components/analisi/index.js'
import { variazione } from '../../src/lib/formatoAnalisi.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const stesso = (a, hex) => a === hex || a === rgb(hex)

// Un testo «nascosto a 1 px»: riquadro largo 1 px con overflow nascosto (o
// ritagliato a zero) e dentro delle lettere.
const nascostiA1px = (root) => [...root.querySelectorAll('*')].filter(el => {
  const s = el.style
  const minuscolo = s.width === '1px' || s.height === '1px'
  const ritagliato = s.overflow === 'hidden' || /rect\(0/.test(s.clip || '') || /inset\(50%\)/.test(s.clipPath || '')
  return minuscolo && ritagliato && el.textContent.trim().length > 0
})

const speseSu = variazione({ attuale: 50497, confronto: 33200, piuEMeglio: false })
const voci = [
  { id: 'incassi', stato: 'stima', breve: 'Incassi stimati', testo: 'incassi stimati dall\'inventario' },
  { id: 'personale', stato: 'manca', testo: 'personale non registrato', azione: { etichetta: 'Apri Personale', onClick: () => {} } },
]

describe('Il difetto: testi nascosti che il righello vedeva tagliati', () => {
  it('le tessere non hanno testo nascosto a 1 px', () => {
    const { container } = render(<A.NumeroConConfronto etichetta="Spese del mese" valore="50.497 €" variazione={speseSu} rispettoA="su agosto 2025" />)
    expect(nascostiA1px(container)).toEqual([])
  })
  it('il numero principale nemmeno', () => {
    const { container } = render(<A.NumeroPrincipale etichetta="Spese" valore="50.497 €" variazione={speseSu} rispettoA="su agosto 2025" />)
    expect(nascostiA1px(container)).toEqual([])
  })
  it('la copertura nemmeno, chiusa e aperta', () => {
    const { container } = render(<A.CoperturaDati voci={voci} />)
    expect(nascostiA1px(container)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Incassi stimati/ }))
    expect(nascostiA1px(container)).toEqual([])
  })
})

describe('Il giudizio si scrive, visibile', () => {
  it('«peggio» accanto al confronto, nel colore del giudizio, e non ritagliato', () => {
    const { container } = render(<A.NumeroConConfronto etichetta="Spese del mese" valore="50.497 €" variazione={speseSu} rispettoA="su agosto 2025" />)
    const parola = [...container.querySelectorAll('span')].find(s => s.textContent === 'peggio')
    expect(parola).toBeTruthy()
    expect(parola.style.width).toBe('')
    expect(parola.style.overflow).toBe('')
    // 04/10/2026: meglio e peggio hanno i colori dei grafici (T.graficoMeglio,
    // T.graficoPeggio), non più il verde e il rosso degli allarmi (theme.js).
    expect(stesso(parola.style.color, T.graficoPeggio)).toBe(true)
    // Il testo resta quello che le pagine controllano: «… 2025peggio».
    expect(container.textContent).toMatch(/\+52%su agosto 2025peggio/)
  })
  it('«meglio» in verde; «come prima» senza parola', () => {
    const giu = variazione({ attuale: 8000, confronto: 10000, piuEMeglio: false })
    const { container, unmount } = render(<A.NumeroConConfronto etichetta="Spese" valore="8.000 €" variazione={giu} />)
    const parola = [...container.querySelectorAll('span')].find(s => s.textContent === 'meglio')
    expect(stesso(parola.style.color, T.graficoMeglio)).toBe(true)
    unmount()
    const pari = variazione({ attuale: 10050, confronto: 10000 })
    const r = render(<A.NumeroConConfronto etichetta="Incassi" valore="10.050 €" variazione={pari} />)
    expect(r.container.textContent).not.toMatch(/peggio|meglio/)
  })
})
