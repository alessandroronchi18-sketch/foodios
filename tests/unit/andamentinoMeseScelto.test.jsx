// @vitest-environment happy-dom
//
// ── L'andamentino: linea che si vede, punto sul mese guardato ───────────
//
// Il difetto (audit del design misurato al pixel, 04/10/2026, C7 e CE8):
// negli andamentini del Conto la linea era di 1,75 px e il punto finale di
// raggio 3 (la guida dei grafici vuole 2 px e almeno 4), e il punto stava
// sempre sull'ultimo mese dei dodici, anche quando la pagina guardava un
// mese prima: nessun segno di quale fosse il mese di cui si parla. Un mese
// isolato fra due buchi era un puntino di raggio 1,5, quasi invisibile.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Andamentino, segmentiAndamentino } from '../../src/components/analisi/index.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const DODICI = [10, 12, 11, 13, 9, 14, 15, 13, 12, 16, 15, 14]
const puntoGrande = (c) => [...c.querySelectorAll('circle')].find(x => Number(x.getAttribute('r')) >= 4)

describe('Il difetto: linea sottile, punto piccolo, sempre sull\'ultimo mese', () => {
  it('la linea è di 2 px', () => {
    const { container } = render(<Andamentino valori={DODICI} />)
    expect(container.querySelector('polyline').getAttribute('stroke-width')).toBe('2')
  })

  it('il punto ha raggio 4 e l\'anello bianco di 2 px', () => {
    const { container } = render(<Andamentino valori={DODICI} />)
    const p = puntoGrande(container)
    expect(p).toBeTruthy()
    expect(p.getAttribute('r')).toBe('4')
    expect(p.getAttribute('stroke')).toBe(T.bgCard)
    expect(p.getAttribute('stroke-width')).toBe('2')
  })

  it('il punto sta sul mese scelto, non sull\'ultimo', () => {
    const { container } = render(<Andamentino valori={DODICI} scelto={9} larghezza={120} altezza={24} />)
    const atteso = segmentiAndamentino(DODICI, 120, 24).punto(9)
    const p = puntoGrande(container)
    expect(Number(p.getAttribute('cx'))).toBeCloseTo(atteso[0], 6)
    expect(Number(p.getAttribute('cy'))).toBeCloseTo(atteso[1], 6)
    const ultimo = segmentiAndamentino(DODICI, 120, 24).ultimo
    expect(Number(p.getAttribute('cx'))).not.toBeCloseTo(ultimo[0], 1)
  })
})

describe('Intorno', () => {
  it('senza `scelto` il punto resta sull\'ultimo mese con un dato (le pagine di oggi)', () => {
    const valori = [...DODICI.slice(0, 10), null, null]
    const { container } = render(<Andamentino valori={valori} larghezza={84} altezza={22} />)
    const atteso = segmentiAndamentino(valori, 84, 22).punto(9)
    expect(Number(puntoGrande(container).getAttribute('cx'))).toBeCloseTo(atteso[0], 6)
  })

  it('se il mese scelto non ha dato, niente punto inventato', () => {
    const valori = [...DODICI.slice(0, 10), null, 14]
    const { container } = render(<Andamentino valori={valori} scelto={10} />)
    expect(puntoGrande(container)).toBeUndefined()
  })

  it('un mese isolato fra due buchi è un punto largo il doppio della linea', () => {
    const { container } = render(<Andamentino valori={[10, null, 12, null, 14, 15]} scelto={5} />)
    // 10 e 12 stanno da soli fra due buchi; 14-15 sono una linea
    const isolati = [...container.querySelectorAll('circle')].filter(c => c.getAttribute('r') === '2')
    expect(isolati).toHaveLength(2)
  })

  it('si spezza dove manca un mese, non scende a zero', () => {
    expect(segmentiAndamentino([10, 12, null, 14, 15]).segmenti.map(s => s.length)).toEqual([2, 2])
  })

  it('la banda della normalità sta dietro la linea, e la scala la contiene', () => {
    const { container } = render(<Andamentino valori={DODICI} banda={[11, 14]} altezza={24} />)
    const rect = container.querySelector('rect')
    expect(rect).toBeTruthy()
    expect(rect.getAttribute('fill')).toBe(T.bgMuted)
    // il rettangolo viene prima della linea: sta dietro
    expect(container.querySelector('svg').firstElementChild.tagName.toLowerCase()).toBe('rect')
    const g = segmentiAndamentino([1, 2], 84, 24, undefined, [0, 10])
    expect(g.y(10)).toBeGreaterThanOrEqual(0)
  })

  it('senza nessun dato non disegna niente', () => {
    const { container } = render(<Andamentino valori={[null, null]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
