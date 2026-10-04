// @vitest-environment happy-dom
//
// ── L'avvertimento che cambia un numero sta accanto al numero ───────────
//
// 04/10/2026, nella prima foto dopo la copertura chiusa (ANALISI_DESIGN §6,
// 13a5411): le spese di agosto, 50.497 €, sono IVA compresa — le fatture di
// WebDesk non hanno l'imponibile finché non arriva lo ZIP — e la pagina
// diceva «dagli incassi all'utile, senza IVA». «Contati con l'IVA» era
// rimasto solo dentro la copertura, dietro un tocco. La copertura chiusa
// riassume, non nasconde: un avvertimento che cambia come si legge un numero
// («IVA compresa», «stimato», «mancano 9 giorni») va nella riga subito sotto
// quel numero. I pezzi non avevano un posto per dirlo: adesso c'è `avviso`
// nella tessera, nel numero principale e nella cascata (anche per passo).
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { NumeroConConfronto, FilaTessere, NumeroPrincipale, Cascata } from '../../src/components/analisi/index.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const stesso = (a, hex) => a === hex || a === rgb(hex)
const IVA = "IVA compresa: 76 fatture di agosto non hanno l'imponibile"

describe('Nella tessera', () => {
  it('l\'avvertimento sta nella riga subito sotto il numero, in ambra, e si legge', () => {
    const { container } = render(<NumeroConConfronto etichetta="Spese del mese" valore="50.497 €" avviso={IVA} rispettoA="su agosto 2025" />)
    const t = container.firstChild
    expect(t.children[1].textContent).toBe('50.497 €')
    expect(t.children[2].textContent).toBe(IVA)
    expect(stesso(t.children[2].style.color, T.amberDark)).toBe(true)
    expect(screen.getByRole('note').textContent).toBe(IVA)
  })

  it('senza avvertimento la riga c\'è ma è alta zero: niente spazio in più', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" />)
    const riga = container.firstChild.children[2]
    expect(riga.textContent).toBe('')
    expect(riga.style.paddingTop || '0px').toBe('0px')
    expect(riga.style.minHeight).toBe('')
  })

  it('in fila, una tessera con l\'avvertimento e una senza hanno le stesse righe (la riga si alza per tutte)', () => {
    const { container } = render(<FilaTessere>
      <NumeroConConfronto etichetta="Incassi" valore="124.553 €" />
      <NumeroConConfronto etichetta="Spese del mese" valore="50.497 €" avviso={IVA} />
    </FilaTessere>)
    const [a, b] = container.firstChild.children
    expect(a.children).toHaveLength(b.children.length)
    expect(a.style.gridRow).toBe(b.style.gridRow)
    expect(a.style.gridTemplateRows).toBe('subgrid')
  })

  it('l\'avvertimento c\'è anche quando il numero manca e si mostra quello che si sa', () => {
    const { container } = render(<NumeroConConfronto etichetta="Utile" valore={null} noto={{ valore: '74.057 €' }}
      motivoMancante="manca il personale" avviso="spese IVA compresa" />)
    expect(container.firstChild.children[2].textContent).toBe('spese IVA compresa')
  })
})

describe('Nel numero principale', () => {
  it('subito sotto il numero, prima del confronto', () => {
    const { container } = render(<NumeroPrincipale etichetta="Spese di agosto" valore="50.497 €" avviso={IVA}
      variazione={{ verso: 'peggio', testoDelta: '+52%', delta: 17297 }} rispettoA="su agosto 2025" />)
    const testo = container.textContent
    expect(testo.indexOf('50.497 €')).toBeLessThan(testo.indexOf(IVA))
    expect(testo.indexOf(IVA)).toBeLessThan(testo.indexOf('+52%'))
    expect(stesso(screen.getByRole('note').style.color, T.amberDark)).toBe(true)
  })
  it('senza avvertimento non c\'è la riga', () => {
    render(<NumeroPrincipale etichetta="Utile" valore="12.480 €" />)
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('Nella cascata', () => {
  const passi = [
    { etichetta: 'Incassi stimati', valore: 124553, tipo: 'inizio' },
    { etichetta: 'Materie prime', valore: 2020, tipo: 'meno', avviso: 'IVA compresa' },
    { etichetta: 'Utile', valore: null, tipo: 'fine' },
  ]
  it('l\'avvertimento di tutta la cascata sta sopra le intestazioni', () => {
    const { container } = render(<Cascata passi={passi} ricavi={124553} avviso={IVA} />)
    expect(container.firstChild.firstChild.textContent).toBe(IVA)
    expect(screen.getByRole('note')).toBeTruthy()
  })
  it('quello di un passo sta sotto la sua voce, sulla stessa riga dei numeri, e chi legge lo schermo lo sente', () => {
    const { container } = render(<Cascata passi={passi.map(p => ({ ...p, onClick: () => {} }))} ricavi={124553} />)
    const riga = [...container.querySelectorAll('[role="listitem"]')][1]
    expect(riga.children[0].textContent).toBe('Materie primeIVA compresa')
    expect(riga.children[2].textContent).toBe('−2.020')
    expect(riga.getAttribute('aria-label')).toMatch(/Materie prime: −2\.020 €, IVA compresa/)
  })
})
