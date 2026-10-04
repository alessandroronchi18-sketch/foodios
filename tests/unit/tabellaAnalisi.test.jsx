// @vitest-environment happy-dom
//
// ── Una tabella sola per i numeri dell'Analisi ──────────────────────────
//
// I difetti (audit del design misurato al pixel, 04/10/2026, C5, CE1, CE4,
// PR7): il Conto e le Previsioni facevano le tabelle ognuno a modo suo —
// intestazioni in maiuscolo spaziato (`typo.overline`) nel Conto e normali
// nelle Previsioni, celle 9/8 contro 10, righe alte 44, 47 o 53 px: il passo
// cambiava sotto «Da classificare». Al telefono la tabella del Conto era larga
// 608 px in un riquadro di 354: «Differenza» e «Sugli incassi» fuori schermo,
// «agosto 2025» tagliata sul bordo, e la colonna dei nomi scorreva via insieme
// ai numeri, senza nessun segno che ci fosse altro a destra.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { TabellaAnalisi, COLONNE } from '../../src/components/analisi/index.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const stesso = (a, hex) => !!a && (a === hex || a === rgb(hex))

const colonne = [
  { chiave: 'voce', titolo: 'Voce' },
  { chiave: 'mese', titolo: 'agosto', tipo: 'euro' },
  { chiave: 'prima', titolo: 'agosto 2025', tipo: 'euro', soloComputer: true },
  { chiave: 'diff', titolo: 'differenza', tipo: 'differenza' },
  { chiave: 'quota', titolo: '% incassi', tipo: 'quota' },
]
const righe = (apri = () => {}) => [
  { chiave: 'inc', celle: { voce: 'Incassi stimati', mese: 124553, prima: 81000, diff: { valore: 43553, verso: 'meglio' } } },
  { chiave: 'mp', celle: { voce: 'Materie prime', mese: -2020, prima: -1286, diff: { valore: 734, verso: 'peggio' }, quota: 1.62 }, onClick: apri, aperta: false },
  { chiave: 'dc', incompleto: true, celle: { voce: 'Da classificare', mese: -27190, prima: -22773, diff: { valore: 4417, verso: 'peggio' }, quota: 21.83 } },
  { chiave: 'pers', celle: { voce: 'Personale', mese: null } },
  { chiave: 'utile', forte: true, celle: { voce: 'Utile', mese: null } },
]
const riga = (nome) => [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.startsWith(nome))

describe('Il difetto: due stili di intestazione, righe alte diverse', () => {
  it('intestazioni in frase normale, 12 px, grigie; a destra sopra i numeri', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    const th = [...document.querySelectorAll('thead th')]
    for (const h of th) {
      expect(h.style.textTransform).not.toBe('uppercase')
      expect(h.style.fontSize).toBe('12px')
      expect(stesso(h.style.color, T.textSoft)).toBe(true)
    }
    expect(th[0].style.textAlign).toBe('left')
    expect(th[1].style.textAlign).toBe('right')
  })

  it('tutte le righe alte uguali, 44 px, anche quella che si apre', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    const altezze = [...document.querySelectorAll('tbody tr')].flatMap(tr => [...tr.children].map(c => c.style.height))
    expect(new Set(altezze)).toEqual(new Set(['44px']))
  })

  it('la voce che si apre: tutta la cella è il pulsante, alto 44 px', () => {
    const apri = vi.fn()
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe(apri)} />)
    const b = screen.getByRole('button', { name: /Materie prime/ })
    expect(b.style.minHeight).toBe('44px')
    expect(b.style.width).toBe('100%')
    expect(b.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(b)
    expect(apri).toHaveBeenCalled()
  })
})

describe('Il difetto: al telefono il confronto non si vedeva', () => {
  it('la prima colonna resta ferma, il resto scorre dentro il suo riquadro', () => {
    render(<TabellaAnalisi isMobile etichetta="Conto" colonne={colonne} righe={righe()} />)
    const tabella = screen.getByRole('table', { name: 'Conto' })
    expect(tabella.parentElement.style.overflowX).toBe('auto')
    const prima = riga('Materie prime').children[0]
    expect(prima.style.position).toBe('sticky')
    expect(prima.style.left).toBe('0px')
    expect(stesso(prima.style.background || prima.style.backgroundColor, T.bgCard)).toBe(true)
    expect(document.querySelector('thead th').style.position).toBe('sticky')
  })

  it('al telefono la colonna «agosto 2025» si toglie: la differenza la contiene già', () => {
    render(<TabellaAnalisi isMobile etichetta="Conto" colonne={colonne} righe={righe()} />)
    expect([...document.querySelectorAll('thead th')].map(h => h.textContent)).toEqual(['Voce', 'agosto, €', 'differenza, €', '% incassi'])
  })

  it('la tabella non si stringe: è larga quanto le sue colonne, e scorre', () => {
    render(<TabellaAnalisi isMobile etichetta="Conto" colonne={colonne} righe={righe()} />)
    const t = screen.getByRole('table')
    const attesa = COLONNE.voce.telefono + COLONNE.euro.telefono + (COLONNE.euro.telefono + COLONNE.barretta.telefono) + COLONNE.quota.telefono + 8 * 2 * 4
    expect(t.style.minWidth).toBe(`${attesa}px`)
  })
})

describe('I numeri in colonna', () => {
  it('l\'euro sta nell\'intestazione, le celle col numero e il meno vero, a destra, tabellari', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    expect(document.querySelector('thead').textContent).toMatch(/agosto, €/)
    const c = riga('Materie prime').children[1]
    expect(c.textContent).toBe('−2.020')
    expect(c.style.textAlign).toBe('right')
    expect(c.style.fontVariantNumeric).toBe('tabular-nums')
  })

  it('le quote con un decimale fisso', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    expect(riga('Materie prime').children[4].textContent).toBe('1,6%')
    expect(riga('Da classificare').children[4].textContent).toBe('21,8%')
  })

  it('la differenza ha il segno e il giudizio scritto; quella di un dato incompleto no, ed è ambra', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    const mp = riga('Materie prime').children[3]
    expect(mp.textContent).toBe('+734 · peggio')
    // 04/10/2026: il peggio ha il colore dei grafici (T.graficoPeggio), non più
    // il rosso degli allarmi (theme.js).
    expect(stesso(mp.firstChild.style.color, T.graficoPeggio)).toBe(true)
    const dc = riga('Da classificare').children[3]
    expect(dc.textContent).toBe('+4.417')
    expect(stesso(dc.firstChild.style.color, T.amberDark)).toBe(true)
  })

  it('un numero che non c\'è dice «non lo so», non zero', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    expect(riga('Personale').children[1].textContent).toBe('non lo so')
  })

  it('una cella che la pagina non dà resta vuota (non «non lo so»)', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    expect(riga('Personale').children[2].textContent).toBe('')
  })

  it('i disegni nelle celle stanno a destra, sotto la loro intestazione', () => {
    render(<TabellaAnalisi etichetta="T" colonne={[{ chiave: 'v', titolo: 'Voce' }, { chiave: 'a', titolo: '12 mesi', tipo: 'nodo' }]}
      righe={[{ chiave: 'r', celle: { v: 'Materie prime', a: <svg data-x="1" /> } }]} />)
    expect(document.querySelectorAll('thead th')[1].style.textAlign).toBe('right')
    expect(document.querySelector('svg[data-x]').parentElement.style.justifyContent).toBe('flex-end')
  })

  it('il totale è in grassetto con il filo sopra più scuro', () => {
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={righe()} />)
    const u = riga('Utile').children[0]
    expect(u.style.fontWeight).toBe('700')
    expect(u.style.borderTop).toMatch(/1px solid/)
  })

  it('quello che si apre sotto una riga occupa tutta la larghezza', () => {
    const r = righe()
    r[1] = { ...r[1], aperta: true, sotto: <div>DESA SRL 7.500 €</div> }
    render(<TabellaAnalisi etichetta="Conto" colonne={colonne} righe={r} />)
    const sotto = [...document.querySelectorAll('tbody td')].find(td => td.textContent === 'DESA SRL 7.500 €')
    expect(sotto.getAttribute('colspan')).toBe('5')
  })
})
