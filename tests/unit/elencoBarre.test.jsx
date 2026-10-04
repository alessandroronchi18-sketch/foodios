// @vitest-environment happy-dom
//
// ── Classifiche come elenco a barre, cause come barre dallo zero ────────
//
// 04/10/2026. L'audit del design (IM9) ha trovato «Cosa è cambiato» del Mese
// scritto come cinque paragrafi da 2-4 righe, ognuno con «di spesa rispetto
// ad agosto 2025» ripetuto e le ragioni sociali intere in maiuscolo: 520 px
// al telefono per dire quale voce è salita di più. È il caso da manuale delle
// barre divergenti da uno zero comune. E la ricerca (scelta 13) chiede le
// classifiche (fornitori, gusti, nature di spesa) come elenco a barre: nome e
// valore su una riga, traccia sotto, primi 7 più «Altro». Due forme, un pezzo
// comune che le pagine usano.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { ElencoBarre, ElencoDivergente, primiEAltro, versoDiff, COLONNE } from '../../src/components/analisi/index.js'
import { color as T } from '../../src/lib/theme.js'

afterEach(() => cleanup())

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
const stesso = (a, hex) => !!a && (a === hex || a === rgb(hex))

// I fornitori senza voce di Mara (12 mesi, IVA compresa), i primi dieci.
const fornitori = [
  ['GECKO', 86651], ['DESA SRL', 23670], ['CONO ARTIC', 15790], ['ENEL', 2303], ['Foodinho', 1900],
  ['SIAE', 1065], ['Europcar', 1009], ['FERRAMENTA CALCAGNO', 261], ['EasyPark', 7], ['Amazon', 120],
].map(([etichetta, valore]) => ({ chiave: etichetta, etichetta, valore }))

describe('Primi 7 più «Altro»', () => {
  it('ordina per grandezza e somma il resto in una voce sola', () => {
    const r = primiEAltro(fornitori, 7)
    expect(r).toHaveLength(8)
    expect(r[0].etichetta).toBe('GECKO')
    expect(r[7]).toMatchObject({ etichetta: 'Altro (3 voci)', valore: 261 + 120 + 7, altro: true })
  })
  it('con 7 voci o meno non aggiunge niente; le voci senza numero restano in fondo', () => {
    const r = primiEAltro([{ etichetta: 'A', valore: null }, { etichetta: 'B', valore: 5 }, { etichetta: 'C', valore: 9 }], 7)
    expect(r.map(v => v.etichetta)).toEqual(['C', 'B', 'A'])
  })
  it('«Altro (1 voce)» al singolare', () => {
    expect(primiEAltro(fornitori.slice(0, 8), 7)[7].etichetta).toBe('Altro (1 voce)')
  })
})

describe('L\'elenco a barre', () => {
  it('nome e valore sulla stessa riga, il valore a destra in cifre tabellari', () => {
    render(<ElencoBarre voci={fornitori} etichetta="Fornitori" />)
    const prima = within(screen.getByRole('list', { name: 'Fornitori' })).getAllByRole('listitem')[0]
    const riga = prima.firstChild
    expect(riga.children[0].textContent).toBe('GECKO')
    expect(riga.children[1].textContent).toBe('86.651 €')
    expect(riga.children[1].style.textAlign).toBe('right')
    expect(riga.children[1].style.fontVariantNumeric).toBe('tabular-nums')
  })

  it('la traccia è alta 8 px e il riempimento è proporzionale', () => {
    render(<ElencoBarre voci={fornitori} />)
    const voci = screen.getAllByRole('listitem')
    const traccia = (li) => li.children[1]
    expect(traccia(voci[0]).style.height).toBe('8px')
    expect(traccia(voci[0]).firstChild.style.width).toBe('100%')
    expect(parseFloat(traccia(voci[1]).firstChild.style.width)).toBeCloseTo(23670 / 86651 * 100, 6)
  })

  it('la prima è scura, le altre grigie; «Altro» grigia; la pagina può scegliere quale', () => {
    const { unmount } = render(<ElencoBarre voci={fornitori} />)
    const fill = (i) => screen.getAllByRole('listitem')[i].children[1].firstChild.style.background
    expect(stesso(fill(0), T.graficoReale)).toBe(true)
    expect(stesso(fill(1), T.graficoConfronto)).toBe(true)
    expect(stesso(fill(7), T.graficoConfronto)).toBe(true)
    unmount()
    render(<ElencoBarre voci={fornitori} evidenzia="CONO ARTIC" />)
    expect(stesso(fill(2), T.graficoReale)).toBe(true)
    expect(stesso(fill(0), T.graficoConfronto)).toBe(true)
  })

  it('una voce incompleta è tratteggiata in ambra', () => {
    render(<ElencoBarre voci={[{ etichetta: 'Senza voce', valore: 100, incompleto: true }, { etichetta: 'Materie prime', valore: 50 }]} />)
    const fill = screen.getAllByRole('listitem')[0].children[1].firstChild
    expect(fill.style.borderStyle).toBe('dashed')
  })

  it('una voce che porta al dettaglio è un pulsante alto almeno 44 px', () => {
    const apri = vi.fn()
    render(<ElencoBarre voci={[{ etichetta: 'GECKO', valore: 86651, onClick: apri }]} />)
    const b = screen.getByRole('button', { name: /GECKO: 86\.651 €\. Apri il dettaglio/ })
    expect(b.style.minHeight).toBe('44px')
    fireEvent.click(b)
    expect(apri).toHaveBeenCalled()
  })

  it('due elenchi con lo stesso fondo scala si confrontano', () => {
    render(<div><ElencoBarre voci={[{ etichetta: 'A', valore: 50 }]} massimo={200} /><ElencoBarre voci={[{ etichetta: 'B', valore: 100 }]} massimo={200} /></div>)
    const [a, b] = screen.getAllByRole('listitem').map(li => li.children[1].firstChild.style.width)
    expect(a).toBe('25%')
    expect(b).toBe('50%')
  })
})

describe('Le barre dallo zero (che cosa è cambiato)', () => {
  // Le cause del Mese di agosto contro agosto 2025, in euro di spesa.
  const cause = [
    { chiave: 'materiePrime', etichetta: 'Materie prime', valore: 734, nota: 'soprattutto CONVICINUM' },
    { chiave: 'confezioni', etichetta: 'Confezioni', valore: 11542, nota: 'soprattutto CONO ARTIC' },
    { chiave: 'locale', etichetta: 'Affitto e utenze', valore: -368 },
    { chiave: 'servizi', etichetta: 'Servizi e commissioni', valore: 739 },
    { chiave: 'altre', etichetta: 'Altre spese', valore: 268 },
    { chiave: 'x', etichetta: 'Imposte', valore: 50 },
  ]
  const righe = () => within(screen.getByRole('list')).getAllByRole('listitem')
  const barra = (li) => li.children[1].children[1]

  it('ordinate per euro di impatto, al massimo 5 più «Altro»', () => {
    render(<ElencoDivergente voci={cause} />)
    expect(righe().map(r => r.children[0].firstChild.textContent))
      .toEqual(['Confezioni', 'Servizi e commissioni', 'Materie prime', 'Affitto e utenze', 'Altre spese', 'Altro (1 voce)'])
  })

  it('lo zero è la stessa verticale in tutte le righe; su a destra, giù a sinistra', () => {
    render(<ElencoDivergente voci={cause} />)
    for (const r of righe()) expect(r.children[1].firstChild.style.left).toBe('50%')
    const confezioni = righe()[0]
    expect(barra(confezioni).style.left).toBe('50%')
    expect(barra(confezioni).style.width).toBe('50%')
    const affitto = righe()[3]
    expect(parseFloat(barra(affitto).style.left)).toBeLessThan(50)
  })

  it('il colore dice il giudizio: spesa salita rossa, scesa verde; il numero col segno vero', () => {
    render(<ElencoDivergente voci={cause} />)
    const [confezioni, , , affitto] = righe()
    expect(stesso(barra(confezioni).style.background, T.red)).toBe(true)
    expect(stesso(barra(affitto).style.background, T.green)).toBe(true)
    expect(confezioni.children[2].textContent).toBe('+11.542')
    expect(affitto.children[2].textContent).toBe('−368')
    expect(confezioni.getAttribute('aria-label')).toBe('Confezioni: +11.542 €, peggio')
  })

  it('per gli incassi salire è meglio; la pagina può dare il giudizio da sé', () => {
    expect(versoDiff({ valore: 100 }, true)).toBe('meglio')
    expect(versoDiff({ valore: 100 }, false)).toBe('peggio')
    expect(versoDiff({ valore: 100, verso: 'pari' }, false)).toBe('pari')
    expect(versoDiff({ valore: 0.3 }, false)).toBe('pari')
  })

  it('le colonne sono quelle della cascata, così le cause cadono sulle sue verticali', () => {
    render(<ElencoDivergente voci={cause} titoloValore="su agosto 2025, €" />)
    expect(righe()[0].style.gridTemplateColumns).toBe(`${COLONNE.voce.computer}px minmax(0, 1fr) ${COLONNE.euro.computer}px`)
    expect(screen.getByText('su agosto 2025, €')).toBeTruthy()
  })

  it('il fornitore principale sta sotto la voce, piccolo, non in un paragrafo', () => {
    render(<ElencoDivergente voci={cause} />)
    expect(righe()[0].children[0].textContent).toBe('Confezionisoprattutto CONO ARTIC')
  })
})
