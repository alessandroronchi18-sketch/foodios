// @vitest-environment happy-dom
//
// ── La barra con l'obiettivo: fasce che si vedono, e niente binari vuoti ─
//
// I difetti (audit del design misurato al pixel, 04/10/2026, C6 e IM6, settimo
// dei dieci più gravi):
//
// 1. Le due fasce di grigio che dovevano dire «bene» e «da guardare» non si
//    vedevano: il binario era `bgMuted` #EEF1F6 e la fascia «da guardare»
//    `borderSoft` #EEF1F6 — LO STESSO colore — e la fascia «bene» #F1F4F8
//    stava a 1,03:1 dalle altre.
// 2. Senza il dato si disegnava comunque il binario vuoto con il trattino
//    dell'obiettivo: nel Mese tre barre vuote, 158 px al computer e 345 al
//    telefono. Un grafico senza dato non si disegna: la forma giusta per «non
//    lo so» è una frase.
//
// La correzione segue la specifica di Stephen Few (ricerca design §3.4,
// scelta 12): barra spessa un terzo del binario, trattino dell'obiettivo,
// punto dell'anno prima, tre fasce di un grigio solo con più scuro = peggio,
// e il tratto chiaro di «dove arrivi a fine mese».
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { BarraObiettivo } from '../../src/components/analisi/index.js'

afterEach(() => cleanup())

// Contrasto WCAG fra due colori scritti come li scrive happy-dom (rgb o #hex).
function canali(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c)
  if (m) return [m[1], m[2], m[3]].map(Number)
  const h = c.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}
const luminanza = (c) => {
  const [r, g, b] = canali(c).map(x => x / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrasto = (a, b) => { const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

// Le fasce: i figli del binario alti quanto il binario (top 0 e bottom 0).
const fasceDi = (binario) => [...binario.children].filter(s => s.style.top === '0px' && s.style.bottom === '0px')

describe('Il difetto: fasce dello stesso colore', () => {
  it('tre fasce, e ognuna si distingue dalla vicina (≥ 1,2:1)', () => {
    render(<BarraObiettivo etichetta="Food cost" valore={34.2} obiettivo={30} />)
    const fasce = fasceDi(screen.getByRole('img'))
    expect(fasce).toHaveLength(3)
    const colori = fasce.map(f => f.style.background || f.style.backgroundColor)
    expect(new Set(colori).size).toBe(3)
    expect(contrasto(colori[0], colori[1])).toBeGreaterThanOrEqual(1.2)
    expect(contrasto(colori[1], colori[2])).toBeGreaterThanOrEqual(1.2)
  })

  it('per un costo la fascia più scura è a destra (più scuro = peggio)', () => {
    render(<BarraObiettivo etichetta="Food cost" valore={34.2} obiettivo={30} />)
    const l = fasceDi(screen.getByRole('img')).map(f => luminanza(f.style.background || f.style.backgroundColor))
    expect(l[0]).toBeGreaterThan(l[1])
    expect(l[1]).toBeGreaterThan(l[2])
  })

  it('per un margine (più è meglio) la più scura è a sinistra', () => {
    render(<BarraObiettivo etichetta="Margine" valore={62} obiettivo={65} piuEMeglio />)
    const l = fasceDi(screen.getByRole('img')).map(f => luminanza(f.style.background || f.style.backgroundColor))
    expect(l[0]).toBeLessThan(l[1])
    expect(l[1]).toBeLessThan(l[2])
  })

  it('la barra scura si legge sulla fascia più scura (≥ 3:1)', () => {
    render(<BarraObiettivo etichetta="Food cost" valore={40} obiettivo={30} />)
    const binario = screen.getByRole('img')
    const scura = fasceDi(binario)[2]
    const barra = [...binario.children].find(s => s.style.height === '8px' && s.style.opacity !== '0.35')
    expect(contrasto(barra.style.background || barra.style.backgroundColor, scura.style.background || scura.style.backgroundColor)).toBeGreaterThanOrEqual(3)
  })
})

describe('Il difetto: senza dato si disegnava un binario vuoto', () => {
  it('senza il dato niente barra: una riga di testo con il perché e l\'obiettivo', () => {
    const { container } = render(<BarraObiettivo etichetta="Personale" valore={null} obiettivo={30} motivoMancante="stipendi non registrati" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.textContent).toBe('Personale: stipendi non registratiobiettivo 30%')
    expect(container.textContent).not.toMatch(/0%sotto|—/)
  })
  it('anche un valore non numerico conta come mancante', () => {
    render(<BarraObiettivo etichetta="Personale" valore={NaN} obiettivo={30} />)
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Le misure di Few', () => {
  it('la barra è spessa un terzo del binario', () => {
    render(<BarraObiettivo etichetta="Food cost" valore={28} obiettivo={30} />)
    const binario = screen.getByRole('img')
    expect(binario.style.height).toBe('24px')
    const barra = [...binario.children].find(s => s.style.height === '8px')
    expect(barra).toBeTruthy()
    expect(barra.style.top).toBe('8px')
  })

  it('dice di quanti punti si è sopra, a parole, e il valore', () => {
    const { container } = render(<BarraObiettivo etichetta="Food cost" valore={34.2} obiettivo={30} />)
    expect(container.textContent).toMatch(/34,2%/)
    expect(container.textContent).toMatch(/4,2 punti sopra l'obiettivo/)
  })

  it('l\'anno prima è un punto, detto anche a parole e a chi legge lo schermo', () => {
    const { container } = render(<BarraObiettivo etichetta="Food cost" valore={31.2} obiettivo={30} annoPrima={28.4} etichettaAnnoPrima="agosto 2025" />)
    expect(container.textContent).toMatch(/agosto 2025 28,4%/)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Food cost: 31,2%, obiettivo 30%, agosto 2025 28,4%')
    const punto = [...screen.getByRole('img').children].find(s => s.style.borderRadius === '9999px')
    // fondo scala: il più grande fra 30 × 1,2 × 1,35 = 48,6 · 31,2 × 1,1 · 30 × 1,5 · 28,4 × 1,1
    expect(parseFloat(punto.style.left)).toBeCloseTo((28.4 / 48.6) * 100, 6)
  })

  it('il tratto chiaro dice dove si arriva a fine mese', () => {
    const { container } = render(<BarraObiettivo etichetta="Incasso" valore={40} obiettivo={60} piuEMeglio proiezione={55} />)
    const chiaro = [...screen.getByRole('img').children].find(s => s.style.opacity === '0.35')
    expect(chiaro).toBeTruthy()
    expect(container.textContent).toMatch(/a fine mese, a questo ritmo: 55%/)
  })

  it('barre impilate con lo stesso fondo scala: l\'obiettivo cade nello stesso punto', () => {
    const { container } = render(<div>
      <BarraObiettivo etichetta="Materie prime" valore={28} obiettivo={30} massimo={80} />
      <BarraObiettivo etichetta="Personale" valore={35} obiettivo={30} massimo={80} />
    </div>)
    const trattini = [...container.querySelectorAll('[role="img"]')].map(b => [...b.children].find(s => s.style.width === '2px').style.left)
    expect(trattini[0]).toBe(trattini[1])
  })

  it('le barre si muovono in un quarto di secondo (si cambia mese senza perdere il filo)', () => {
    render(<BarraObiettivo etichetta="Food cost" valore={28} obiettivo={30} />)
    const barra = [...screen.getByRole('img').children].find(s => s.style.height === '8px')
    expect(barra.style.transition).toMatch(/250ms/)
  })
})
