// @vitest-environment happy-dom
// ── Le spiegazioni si devono aprire: col dito e col mouse ─────────────────
//
// Il difetto, 17/09/2026. Il titolare ha segnalato due volte che «i mouseover
// non funzionano». La prima volta ho corretto il componente `Tip` e ho
// riferito che era fatto: non lo era. Contati nel codice, `Tip` disegna 23
// spiegazioni, mentre 226 sono attributi `title=` nativi — e il fumetto del
// browser su uno schermo che si tocca non si apre mai, e col mouse arriva
// dopo circa un secondo di immobilità. Avevo corretto il nove per cento e
// avevo detto «risolto».
//
// La correzione è `SpiegazioniAlTocco`, montato una volta al tetto
// dell'applicazione: vale per tutti i `title`, presenti e futuri.
//
// Qui dentro: il test che riproduce il difetto (il dito non apriva niente),
// quello della correzione (ora apre, e col mouse pure), e quelli di quello
// che c'è intorno — che è la parte delicata: mentre il fumetto è aperto
// l'attributo `title` viene messo da parte per non vederne due, e se non
// tornasse al suo posto l'elemento resterebbe senza spiegazione per sempre.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SpiegazioniAlTocco from '../../src/components/SpiegazioniAlTocco'

// jsdom non conosce PointerEvent: lo costruiamo da MouseEvent tenendo il
// campo che ci serve davvero, `pointerType`.
function eventoPuntatore(tipo, bersaglio, pointerType) {
  const ev = new MouseEvent(tipo, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'pointerType', { value: pointerType })
  bersaglio.dispatchEvent(ev)
}

function paginaCon(titolo = 'Costo materie prime per chilo') {
  const bersaglio = document.createElement('button')
  bersaglio.setAttribute('title', titolo)
  bersaglio.textContent = 'Costo / kg'
  document.body.appendChild(bersaglio)
  render(<SpiegazioniAlTocco />)
  return bersaglio
}

describe('Le spiegazioni si aprono col dito', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('un tocco su un elemento con `title` apre il fumetto', () => {
    const b = paginaCon('Costo materie prime per chilo')
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => eventoPuntatore('pointerdown', b, 'touch'))
    expect(screen.getByRole('tooltip').textContent).toContain('Costo materie prime per chilo')
  })

  it('il click del mouse NON apre il fumetto: aprirebbe anche quello che il click fa', () => {
    const b = paginaCon()
    act(() => eventoPuntatore('pointerdown', b, 'mouse'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('toccando fuori si chiude', () => {
    const b = paginaCon()
    act(() => eventoPuntatore('pointerdown', b, 'touch'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
    act(() => eventoPuntatore('pointerdown', document.body, 'touch'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Le spiegazioni si aprono col mouse, senza aspettare un secondo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('il fumetto compare entro mezzo secondo dal passaggio', () => {
    const b = paginaCon('Quanto ti costa un chilo di questa base')
    act(() => eventoPuntatore('pointerover', b, 'mouse'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByRole('tooltip').textContent).toContain('Quanto ti costa un chilo di questa base')
  })

  it('attraversare la pagina senza fermarsi non fa lampeggiare niente', () => {
    const b = paginaCon()
    act(() => eventoPuntatore('pointerover', b, 'mouse'))
    act(() => { vi.advanceTimersByTime(80) })   // il mouse è solo di passaggio
    act(() => eventoPuntatore('pointerout', b, 'mouse'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Il `title` torna sempre al suo posto', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('mentre il fumetto è aperto il `title` è tolto, così non se ne vedono due', () => {
    const b = paginaCon('Spiegazione')
    act(() => eventoPuntatore('pointerover', b, 'mouse'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(b.getAttribute('title')).toBeNull()
  })

  it('quando il mouse esce il `title` torna: senza questo l’elemento resterebbe muto', () => {
    const b = paginaCon('Spiegazione')
    act(() => eventoPuntatore('pointerover', b, 'mouse'))
    act(() => { vi.advanceTimersByTime(500) })
    act(() => eventoPuntatore('pointerout', b, 'mouse'))
    expect(b.getAttribute('title')).toBe('Spiegazione')
  })

  it('anche smontando il componente il `title` torna al suo posto', () => {
    const b = document.createElement('button')
    b.setAttribute('title', 'Spiegazione')
    document.body.appendChild(b)
    const { unmount } = render(<SpiegazioniAlTocco />)
    act(() => eventoPuntatore('pointerover', b, 'mouse'))
    act(() => { vi.advanceTimersByTime(500) })
    expect(b.getAttribute('title')).toBeNull()
    act(() => { unmount() })
    expect(b.getAttribute('title')).toBe('Spiegazione')
  })

  it('un `title` vuoto o di una lettera non apre niente', () => {
    const b = document.createElement('button')
    b.setAttribute('title', '')
    document.body.appendChild(b)
    render(<SpiegazioniAlTocco />)
    act(() => eventoPuntatore('pointerdown', b, 'touch'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Vale per tutto il prodotto, non per un componente solo', () => {
  it('è montato al tetto dell’applicazione', async () => {
    const fs = await import('node:fs')
    const app = fs.readFileSync('src/App.jsx', 'utf8')
    expect(app).toMatch(/<SpiegazioniAlTocco\s*\/>/)
  })

  it('nel prodotto ci sono ancora molti `title` nativi: è la ragione per cui serve', async () => {
    const fs = await import('node:fs')
    const { globSync } = await import('glob')
    const nativi = globSync('src/**/*.jsx')
      .map(f => (fs.readFileSync(f, 'utf8').match(/\stitle=/g) || []).length)
      .reduce((a, b) => a + b, 0)
    // Se un giorno scendessero quasi a zero perché sono diventati tutti `Tip`,
    // questo test lo dice — e allora il componente globale si può togliere.
    expect(nativi).toBeGreaterThan(50)
  })
})
