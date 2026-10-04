// @vitest-environment happy-dom
//
// ── La cascata è la tabella del conto, e «non so dove va» non è grigio ──
//
// I difetti (audit del design misurato al pixel, 04/10/2026, C8, IM11, IM13):
//
// 1. «Da classificare» si disegnava come una spesa normale, grigia: era la
//    barra più lunga dopo gli incassi (21,8% ad agosto, 40,5% all'apertura,
//    quando era l'unica). Non è una spesa che si conosce: sono 27.190 € di
//    fatture senza voce. Il ruolo «incompleto» (ambra) c'era nella tavolozza
//    e non era usato.
// 2. Al telefono l'etichetta si tagliava a 112 px: «Servizi e commi…»
//    (ne servono 135).
// 3. «Vedi i numeri in tabella» alto 32 px, sotto i 44 di un dito.
//
// E la scelta 1 della ricerca (IBCS): la cascata non sta sopra la tabella, È
// la tabella. Una riga per voce con barra, € (l'euro nell'intestazione, non
// in ogni cella), % sugli incassi con un decimale fisso, e la differenza con
// l'anno prima come barretta da uno zero comune. Colonne della stessa
// larghezza della tabella del conto (COLONNE in misure.js).
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { Cascata, conConfronto, differenzaPasso, COLONNE } from '../../src/components/analisi/index.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const stesso = (a, hex) => !!a && (a === hex || a === rgb(hex) || a.toLowerCase() === hex.toLowerCase())

// Agosto 2026 di Mara (incassi stimati), dalle foto dell'audit.
const agosto = [
  { etichetta: 'Incassi stimati', valore: 124553, tipo: 'inizio', chiave: 'incassi' },
  { etichetta: 'Materie prime', valore: 2020, tipo: 'meno', chiave: 'materiePrime' },
  { etichetta: 'Confezioni', valore: 15790, tipo: 'meno', chiave: 'confezioni' },
  { etichetta: 'Servizi e commissioni', valore: 2288, tipo: 'meno', chiave: 'servizi' },
  { etichetta: 'Da classificare', valore: 27190, tipo: 'meno', chiave: 'daClassificare' },
  { etichetta: 'Personale', valore: null, tipo: 'meno', chiave: 'personale' },
  { etichetta: 'Utile', valore: null, tipo: 'fine', chiave: 'utile' },
]
const agosto2025 = [
  { valore: 81000, chiave: 'incassi' },
  { valore: 1286, chiave: 'materiePrime' },
  { valore: 4248, chiave: 'confezioni' },
  { valore: 2700, chiave: 'servizi' },
  { valore: 30000, chiave: 'daClassificare' },
]

const righe = (container) => [...container.querySelectorAll('[role="listitem"]')]
const barraDi = (riga) => riga.children[1].children[1]

describe('Il difetto: «Da classificare» grigio come una spesa vera', () => {
  it('si disegna come zona incompleta: contorno tratteggiato ambra e righe a 45°', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} />)
    const riga = righe(container).find(r => r.textContent.startsWith('Da classificare'))
    const barra = barraDi(riga)
    expect(barra.style.borderStyle).toBe('dashed')
    // 04/10/2026: l'incompleto nei grafici è ocra (T.graficoIncompleto): l'ambra
    // degli avvisi accanto al mattone del peggio era quasi lo stesso colore.
    expect(stesso(barra.style.borderColor, T.graficoIncompleto)).toBe(true)
    expect(barra.style.backgroundImage).toMatch(/repeating-linear-gradient\(135deg/)
    expect(stesso(barra.style.background || barra.style.backgroundColor, T.graficoConfronto)).toBe(false)
  })

  it('il suo importo è in ambra, e chi legge lo schermo sente «spese senza voce»', () => {
    const { container } = render(<Cascata passi={agosto.map(p => ({ ...p, onClick: () => {} }))} ricavi={124553} />)
    const riga = righe(container).find(r => r.textContent.startsWith('Da classificare'))
    expect(stesso(riga.children[2].style.color, T.amberDark)).toBe(true)
    expect(riga.getAttribute('aria-label')).toMatch(/spese senza voce/)
  })

  it('la pagina può dire «incompleto» su un passo qualsiasi, o toglierlo', () => {
    const { container, unmount } = render(<Cascata passi={[{ etichetta: 'Fatture di settembre', valore: 100, tipo: 'meno', incompleto: true }]} />)
    expect(barraDi(righe(container)[0]).style.borderStyle).toBe('dashed')
    unmount()
    const r = render(<Cascata passi={[{ etichetta: 'Da classificare', valore: 100, tipo: 'meno', chiave: 'daClassificare', incompleto: false }]} />)
    expect(barraDi(righe(r.container)[0]).style.borderStyle).not.toBe('dashed')
  })

  it('le altre spese restano grigie piene; incassi e utile scuri', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} />)
    const [incassi, materie] = righe(container)
    expect(stesso(barraDi(incassi).style.background, T.graficoReale)).toBe(true)
    expect(stesso(barraDi(materie).style.background, T.graficoConfronto)).toBe(true)
  })
})

describe('Il difetto: al telefono le etichette si tagliavano', () => {
  it('l\'etichetta va a capo, niente puntini', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} isMobile />)
    const voce = righe(container).find(r => /Servizi e commissioni/.test(r.textContent)).children[0]
    expect(voce.textContent).toBe('Servizi e commissioni')
    expect(voce.style.whiteSpace).not.toBe('nowrap')
    expect(voce.style.textOverflow).not.toBe('ellipsis')
    expect(voce.style.overflow).not.toBe('hidden')
  })

  it('al telefono restano voce, barra, euro', () => {
    const { container } = render(<Cascata passi={conConfronto(agosto, agosto2025)} ricavi={124553} isMobile />)
    expect(righe(container)[0].style.gridTemplateColumns).toBe(`${COLONNE.voce.telefono}px minmax(0, 1fr) ${COLONNE.euro.telefono}px`)
  })

  it('«Vedi i numeri in tabella» è alto 44 px (era 32)', () => {
    render(<Cascata passi={agosto} ricavi={124553} />)
    expect(screen.getByRole('button', { name: 'Vedi i numeri in tabella' }).style.minHeight).toBe('44px')
  })
})

describe('La cascata è la tabella', () => {
  it('colonne a larghezza fissa, le stesse della tabella del conto', () => {
    const { container } = render(<Cascata passi={conConfronto(agosto, agosto2025)} ricavi={124553} />)
    const c = COLONNE
    expect(righe(container)[0].style.gridTemplateColumns)
      .toBe(`${c.voce.computer}px minmax(0, 1fr) ${c.euro.computer}px ${c.quota.computer}px ${c.barretta.computer}px ${c.differenza.computer}px`)
  })

  it('l\'euro sta nell\'intestazione, le celle hanno solo il numero col meno vero', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} titoloValore="agosto" />)
    expect(container.textContent).toMatch(/agosto, €/)
    const materie = righe(container).find(r => r.textContent.startsWith('Materie prime'))
    expect(materie.children[2].textContent).toBe('−2.020')
    expect(materie.textContent).not.toMatch(/-/)
  })

  it('le quote in colonna con un decimale fisso (le virgole una sotto l\'altra)', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} />)
    const quote = righe(container).map(r => r.children[3].textContent).filter(Boolean)
    expect(quote).toContain('1,6%')
    expect(quote).toContain('12,7%')
    for (const q of quote) expect(q).toMatch(/^\d+,\d%$/)
  })

  it('la differenza con l\'anno prima: barretta da uno zero comune, rossa se peggio, verde se meglio', () => {
    const passi = conConfronto(agosto, agosto2025)
    const { container } = render(<Cascata passi={passi} ricavi={124553} titoloConfronto="su agosto 2025" />)
    expect(container.textContent).toMatch(/su agosto 2025, €/)
    const [incassi, materie, confezioni, servizi] = righe(container)
    const barretta = (r) => r.children[4].children[1]
    // Materie prime: +734 di spesa → peggio, a destra dello zero, rossa
    expect(materie.children[5].textContent).toBe('+734')
    // 04/10/2026: meglio e peggio hanno i colori dei grafici (T.graficoMeglio,
    // T.graficoPeggio), non più il verde e il rosso degli allarmi (theme.js).
    expect(stesso(barretta(materie).style.background, T.graficoPeggio)).toBe(true)
    expect(barretta(materie).style.left).toBe('50%')
    // Servizi: −412 di spesa → meglio, a sinistra, verde
    expect(servizi.children[5].textContent).toBe('−412')
    expect(stesso(barretta(servizi).style.background, T.graficoMeglio)).toBe(true)
    expect(parseFloat(barretta(servizi).style.left)).toBeLessThan(50)
    // Incassi: +43.553 → meglio, verde. La più grande è lunga mezza colonna.
    expect(stesso(barretta(incassi).style.background, T.graficoMeglio)).toBe(true)
    expect(barretta(incassi).style.width).toBe('50%')
    expect(confezioni.children[5].textContent).toBe('+11.542')
  })

  it('«Da classificare» ha la differenza senza giudizio: niente barretta rossa o verde', () => {
    const { container } = render(<Cascata passi={conConfronto(agosto, agosto2025)} ricavi={124553} />)
    const riga = righe(container).find(r => r.textContent.startsWith('Da classificare'))
    expect(riga.children[4].children).toHaveLength(1) // solo la linea dello zero
    expect(riga.children[5].textContent).toBe('−2.810')
    expect(stesso(riga.children[5].style.color, T.textSoft)).toBe(true)
  })

  it('differenzaPasso: per una spesa + è peggio, per gli incassi + è meglio; senza confronto niente', () => {
    expect(differenzaPasso({ v: 120, confronto: 100, tipo: 'meno' })).toEqual({ d: 20, verso: 'peggio' })
    expect(differenzaPasso({ v: 120, confronto: 100, tipo: 'inizio' })).toEqual({ d: 20, verso: 'meglio' })
    expect(differenzaPasso({ v: 100.2, confronto: 100, tipo: 'meno' })).toEqual({ d: 0, verso: 'pari' })
    expect(differenzaPasso({ v: 100, confronto: null, tipo: 'meno' })).toBeNull()
    expect(differenzaPasso({ v: null, confronto: 100, tipo: 'meno' })).toBeNull()
  })

  it('senza confronto le colonne della differenza non ci sono', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} />)
    expect(righe(container)[0].children).toHaveLength(4)
  })

  it('il titolo parla di una voce: quella è l\'unica barra scura', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} evidenzia="confezioni" />)
    const [incassi, , confezioni] = righe(container)
    expect(stesso(barraDi(confezioni).style.background, T.graficoReale)).toBe(true)
    expect(stesso(barraDi(incassi).style.background, T.graficoConfronto)).toBe(true)
  })

  it('i numeri in tabella hanno le intestazioni e il giudizio scritto', () => {
    const { container } = render(<Cascata passi={conConfronto(agosto, agosto2025)} ricavi={124553} titoloValore="agosto" titoloConfronto="su agosto 2025" />)
    fireEvent.click(screen.getByRole('button', { name: 'Vedi i numeri in tabella' }))
    const t = container.querySelector('table')
    expect([...t.querySelectorAll('th')].map(th => th.textContent)).toEqual(['Voce', 'agosto', '% incassi', 'su agosto 2025'])
    expect(t.textContent).toMatch(/Materie prime−2\.020,00 €1,6%\+734 € · peggio/)
    expect(t.textContent).toMatch(/Da classificare \(senza voce\)/)
  })

  it('le barre si muovono in un quarto di secondo', () => {
    const { container } = render(<Cascata passi={agosto} ricavi={124553} />)
    expect(barraDi(righe(container)[1]).style.transition).toMatch(/250ms/)
  })
})
