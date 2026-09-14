// @vitest-environment happy-dom
//
// L'intestazione delle pagine AI parla la lingua del resto del tool.
//
// Scelta del titolare, 14/09/2026. Prima era un pannello a parte: gradiente
// bordeaux-oro animato, due aloni che galleggiavano, griglia di puntini, titolo
// fino a 46px con le parole in oro sfumato, pastiglia "LIVE" che pulsava. Il
// tool intorno è fatto di tessere bianche, tabelle e numeri incolonnati — lì
// dentro si apriva un manifesto, ed era la ragione principale per cui quelle
// pagine sembravano generate.
//
// Questo componente da solo decide la faccia di undici pagine, quindi il test
// guarda sia cosa mostra sia cosa NON fa più.

import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import AiPageHero from '../../src/components/AiPageHero.jsx'
import { typo } from '../../src/lib/theme.js'

beforeEach(() => cleanup())

const base = {
  eyebrow: 'Approvvigionamento',
  title: 'Ordini ai fornitori',
  accentText: 'già scritti',
  subtitle: 'Guardo magazzino e consumo medio, e ti preparo la lista.',
  stats: [{ n: '30 gg', l: 'Consumi analizzati' }, { n: '+40%', l: 'Scorta di sicurezza' }],
}

describe('intestazione delle pagine AI', () => {
  it('mostra quello che serve: titolo, riga di spiegazione e numeri', () => {
    const v = render(<AiPageHero {...base} />)
    expect(v.container.textContent).toContain('Ordini ai fornitori già scritti')
    expect(v.container.textContent).toContain('Guardo magazzino e consumo medio')
    expect(v.container.textContent).toContain('30 gg')
    expect(v.container.textContent).toContain('Consumi analizzati')
  })

  it('niente gradienti, aloni o animazioni: era quello a farla sembrare un\'altra app', () => {
    const v = render(<AiPageHero {...base} />)
    const html = v.container.innerHTML
    expect(html).not.toMatch(/linear-gradient/i)
    expect(html).not.toMatch(/radial-gradient/i)
    expect(html).not.toMatch(/animation/i)
    expect(html).not.toMatch(/backdrop-filter/i)
    // Il titolo in oro sfumato si faceva ritagliando il testo sullo sfondo.
    expect(html).not.toMatch(/background-clip: *text/i)
  })

  it('il titolo sta nella scala del tema, non a 46px', () => {
    const v = render(<AiPageHero {...base} />)
    const h1 = v.container.querySelector('h1')
    expect(h1).toBeTruthy()
    expect(h1.style.fontSize).toBe(`${typo.h1.fontSize}px`)
  })

  it('in versione compatta il titolo scende di un gradino, restando in scala', () => {
    const v = render(<AiPageHero {...base} compact />)
    expect(v.container.querySelector('h1').style.fontSize).toBe(`${typo.h2.fontSize}px`)
  })

  it('la pastiglia dello stato dice una parola, non fa un LED che pulsa', () => {
    const v = render(<AiPageHero {...base} statusBadge="LIVE" />)
    expect(v.container.textContent).toContain('attiva')
    expect(v.container.textContent).not.toContain('LIVE')
    const beta = render(<AiPageHero {...base} statusBadge="BETA" />)
    expect(beta.container.textContent).toContain('in prova')
  })

  it('i numeri hanno le cifre tabellari, come in tutto il resto', () => {
    const v = render(<AiPageHero {...base} />)
    const numeri = [...v.container.querySelectorAll('div')].filter(d => d.textContent === '30 gg')
    expect(numeri.length).toBeGreaterThan(0)
    expect(numeri[0].style.fontVariantNumeric).toBe('tabular-nums')
  })

  it('i pulsanti passati dalla pagina restano, a destra', () => {
    const v = render(<AiPageHero {...base}><button>Rigenera</button></AiPageHero>)
    expect(v.container.textContent).toContain('Rigenera')
  })

  it('senza numeri e senza occhiello non si rompe', () => {
    const v = render(<AiPageHero title="Solo un titolo" />)
    expect(v.container.textContent).toContain('Solo un titolo')
  })
})
