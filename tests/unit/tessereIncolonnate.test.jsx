// @vitest-environment happy-dom
//
// ── Le tessere affiancate stanno in fila, e la freccia dice il segno ────
//
// I difetti (audit del design misurato al pixel, 04/10/2026, C2 e C3; secondo
// e terzo dei dieci più gravi):
//
// 1. La freccia diceva il contrario del numero. «↘ +52% su agosto 2025»: la
//    spesa era salita del 52% e la freccia puntava in giù, perché l'icona
//    seguiva il giudizio (peggio = giù). Lo stesso nelle frasi: «↘ Confezioni:
//    +11.542 €». Chi guarda di sfuggita legge «calo».
// 2. Le tessere affiancate non erano incolonnate: la tessera grande aveva
//    l'imbottitura 20/22, le altre 14/16 (etichette sfasate di 6 px), e la
//    riga del confronto c'era solo se c'era il confronto: le righe sotto il
//    numero cadevano a tre altezze diverse, 24,6 px di scarto nel Mese e 21,4
//    nelle Previsioni. Viola la regola permanente sui box affiancati.
// 3. Senza valore la risposta diventava una frase grigia da 16 px, accanto a
//    numeri neri da 22: l'elemento più debole della pagina era la risposta.
// 4. Etichette in maiuscoletto, «stimato» in una pillola colorata, cifre
//    tabellari sui numeri grandi (ricerca design §4.7-4.8).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { NumeroConConfronto, FilaTessere, FraseInsight, segnoNellaFrase } from '../../src/components/analisi/index.js'
import { variazione, conSegno, segnoDi } from '../../src/lib/formatoAnalisi.js'
import { color as T } from '../../src/lib/theme.js'
import Icon from '../../src/components/Icon.jsx'

afterEach(() => cleanup())
const MENO = '−'

// Il disegno di un'icona, per riconoscerla dentro una tessera.
function disegno(nome) {
  const { container, unmount } = render(<Icon name={nome} />)
  const html = container.querySelector('svg').innerHTML
  unmount()
  return html
}
const iconaDi = (el) => {
  const html = el.querySelector('svg')?.innerHTML
  return ['trendUp', 'trendDown', 'minus', 'checkCircle', 'alertCircle', 'info', 'arrowR'].find(n => disegno(n) === html) || null
}
// happy-dom scrive i colori in rgb(): si confronta così.
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
const stessoColore = (a, hex) => a === hex || a === rgb(hex) || a?.toLowerCase() === hex.toLowerCase()

// Spese di agosto sui dati veri di Mara: 50.497 € contro 33.200 € di agosto 2025.
const speseSu = variazione({ attuale: 50497, confronto: 33200, piuEMeglio: false })

describe('La freccia segue il segno, il colore il giudizio', () => {
  it('«+52%» di spese: freccia in SU, rossa (prima era in giù)', () => {
    expect(speseSu).toMatchObject({ verso: 'peggio', testoDelta: '+52%' })
    const { container } = render(<NumeroConConfronto etichetta="Spese del mese" valore="50.497 €" variazione={speseSu} rispettoA="su agosto 2025" />)
    // la riga più interna che contiene il confronto
    const riga = [...container.querySelectorAll('div')].filter(d => /\+52%su agosto 2025/.test(d.textContent) && d.querySelector('svg')).pop()
    expect(iconaDi(riga)).toBe('trendUp')
    // 04/10/2026: meglio e peggio hanno i colori dei grafici (T.graficoMeglio,
    // T.graficoPeggio), non più il verde e il rosso degli allarmi (theme.js).
    expect(stessoColore(riga.querySelector('span').style.color, T.graficoPeggio)).toBe(true)
  })

  it('incassi scesi: freccia in giù, rossa; spese scese: freccia in giù, verde', () => {
    const giu = variazione({ attuale: 80000, confronto: 100000 })
    const { container, unmount } = render(<NumeroConConfronto etichetta="Incassi" valore="80.000 €" variazione={giu} />)
    expect(iconaDi(container)).toBe('trendDown')
    expect(stessoColore(container.querySelector('svg').parentElement.style.color, T.graficoPeggio)).toBe(true)
    unmount()
    const speseGiu = variazione({ attuale: 8000, confronto: 10000, piuEMeglio: false })
    const r = render(<NumeroConConfronto etichetta="Spese" valore="8.000 €" variazione={speseGiu} />)
    expect(iconaDi(r.container)).toBe('trendDown')
    expect(stessoColore(r.container.querySelector('svg').parentElement.style.color, T.graficoMeglio)).toBe(true)
  })

  it('nelle frasi: «Confezioni: +11.542 €» peggio → freccia in su; «−368 €» meglio → in giù', () => {
    const { container, unmount } = render(<FraseInsight verso="peggio">Confezioni: +11.542 € di spesa rispetto ad agosto 2025</FraseInsight>)
    expect(iconaDi(container)).toBe('trendUp')
    expect(stessoColore(container.querySelector('svg').parentElement.style.color, T.graficoPeggio)).toBe(true)
    unmount()
    const r = render(<FraseInsight verso="meglio">Affitto e utenze: {'−368 €'} di spesa</FraseInsight>)
    expect(iconaDi(r.container)).toBe('trendDown')
    expect(stessoColore(r.container.querySelector('svg').parentElement.style.color, T.graficoMeglio)).toBe(true)
  })

  it('nelle frasi il segno dato dalla pagina vince su quello letto nel testo', () => {
    const { container } = render(<FraseInsight verso="peggio" segno={-1}>Margine: +3 punti di food cost</FraseInsight>)
    expect(iconaDi(container)).toBe('trendDown')
  })

  it('una frase senza numero col segno non inventa una direzione', () => {
    const { container, unmount } = render(<FraseInsight verso="peggio">Le spese di luglio sono quasi gli incassi</FraseInsight>)
    expect(iconaDi(container)).toBe('alertCircle')
    unmount()
    expect(iconaDi(render(<FraseInsight verso="info">Una fattura fuori scala</FraseInsight>).container)).toBe('info')
  })

  it('il segno si legge solo davanti a una cifra, non nei trattini delle parole', () => {
    expect(segnoNellaFrase('Covid-19: +4 €')).toBe(1)
    expect(segnoNellaFrase('S.p.A. (−1.009 €)')).toBe(-1)
    expect(segnoNellaFrase('nessun numero')).toBe(0)
  })
})

describe('Il segno vero, una funzione sola', () => {
  it('conSegno: il meno è U+2212, largo come il più; lo zero senza segno', () => {
    expect(conSegno(1.84, { decimali: 1 })).toBe('+1,8')
    expect(conSegno(-1.84, { decimali: 1 })).toBe(`${MENO}1,8`)
    expect(conSegno(-1234, { unita: '€' })).toBe(`${MENO}1.234 €`)
    expect(conSegno(0.04, { decimali: 1 })).toBe('0,0')
    expect(conSegno(-0.4)).toBe('0')
    expect(conSegno(null)).toBeNull()
  })
  it('conSegno non scrive mai il trattino', () => {
    for (const n of [-1, -12.5, -1000000]) expect(conSegno(n, { decimali: 1 })).not.toMatch(/-/)
  })
  it('segnoDi legge numeri, testi col segno (anche col trattino) e variazioni', () => {
    expect(segnoDi(-3)).toBe(-1)
    expect(segnoDi('+52%')).toBe(1)
    expect(segnoDi(`${MENO}368 €`)).toBe(-1)
    expect(segnoDi('-368 €')).toBe(-1)
    expect(segnoDi('invariato')).toBe(0)
    expect(segnoDi(speseSu)).toBe(1)
    expect(segnoDi({ testoDelta: `${MENO}2 punti` })).toBe(-1)
    expect(segnoDi(null)).toBe(0)
  })
})

describe('Le tessere affiancate sono incolonnate', () => {
  it('stessa imbottitura per la tessera grande e le altre (prima 20/22 contro 14/16)', () => {
    const { container } = render(<div>
      <NumeroConConfronto grande etichetta="Utile" valore="12.000 €" />
      <NumeroConConfronto etichetta="Incassi" valore="124.553 €" />
    </div>)
    const [a, b] = container.firstChild.children
    expect(a.style.padding).toBe('20px')
    expect(b.style.padding).toBe(a.style.padding)
  })

  it('al telefono l\'imbottitura è 16', () => {
    const { container } = render(<NumeroConConfronto isMobile etichetta="Incassi" valore="124.553 €" />)
    expect(container.firstChild.style.padding).toBe('16px')
  })

  it('la riga del confronto c\'è sempre: se il confronto era atteso e manca, lo dice', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi senza IVA" valore="124.553 €" stimato rispettoA="su agosto 2025" />)
    const t = container.firstChild
    expect(t.children).toHaveLength(5)
    expect(t.children[3].textContent).toBe('nessun confronto')
    expect(t.children[3].style.minHeight).toBe('20px')
  })

  it('`senzaConfronto={null}` dalla pagina vuol dire riga vuota anche con il termine di confronto', () => {
    // Trovato il 04/10 unendo le pagine: il null esplicito diventava «nessun confronto».
    const { container } = render(<NumeroConConfronto etichetta="Venduto" valore="1,5 kg" rispettoA="sulla settimana prima" senzaConfronto={null} />)
    const riga = container.firstChild.children[3]
    expect(riga.textContent).toBe('')
    expect(riga.style.minHeight).toBe('20px')
  })

  it('una tessera che non confronta (le Previsioni) ha la riga vuota, alta uguale', () => {
    const { container } = render(<NumeroConConfronto etichetta="Di solito sbaglio" valore="±26% per gusto" />)
    const riga = container.firstChild.children[3]
    expect(riga.textContent).toBe('')
    expect(riga.style.minHeight).toBe('20px')
  })

  it('la pagina può dire perché il confronto manca', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" senzaConfronto="agosto 2025: nessun incasso registrato" />)
    expect(container.firstChild.children[3].textContent).toBe('agosto 2025: nessun incasso registrato')
  })

  it('cinque righe in ogni stato (etichetta · numero · avvertimento · confronto · nota): con il numero, senza, con il numero che si sa', () => {
    for (const el of [
      <NumeroConConfronto key="1" etichetta="A" valore="1 €" variazione={speseSu} contesto="x" />,
      <NumeroConConfronto key="2" etichetta="B" valore={null} motivoMancante="nessun dato" />,
      <NumeroConConfronto key="3" etichetta="C" valore={null} noto={{ valore: '74.057 €' }} motivoMancante="manca il personale" />,
    ]) {
      const { container, unmount } = render(el)
      expect(container.firstChild.children).toHaveLength(5)
      unmount()
    }
  })

  it('in una FilaTessere le tessere prendono le righe della fila (subgrid)', () => {
    const { container } = render(<FilaTessere colonne="2fr 1fr 1fr">
      <NumeroConConfronto grande etichetta="Utile di agosto" valore="12.000 €" />
      <NumeroConConfronto etichetta="Incassi" valore="124.553 €" />
      <NumeroConConfronto etichetta="Spese" valore="50.497 €" variazione={speseSu} />
    </FilaTessere>)
    const fila = container.firstChild
    expect(fila.style.display).toBe('grid')
    expect(fila.style.gridTemplateColumns).toBe('2fr 1fr 1fr')
    for (const t of fila.children) {
      expect(t.style.gridRow).toMatch(/span 5/)
      expect(t.style.gridTemplateRows).toBe('subgrid')
    }
  })

  it('fuori da una fila la tessera non si prende righe che non sono sue', () => {
    // Una pagina che avvolge una tessera in un altro <div> (il Mese oggi)
    // non deve vedersi allungare le tessere accanto.
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" />)
    expect(container.firstChild.style.gridRow).toBe('')
    expect(container.firstChild.style.gridTemplateRows).not.toBe('subgrid')
    // e se la griglia della pagina la allunga, lo spazio va sopra il numero
    expect(container.firstChild.style.gridTemplateRows).toBe('auto 1fr auto auto auto')
  })

  it('la fila al telefono è una colonna sola, con 16 fra le tessere (24 al computer)', () => {
    const { container, unmount } = render(<FilaTessere isMobile><NumeroConConfronto etichetta="A" valore="1 €" /><NumeroConConfronto etichetta="B" valore="2 €" /></FilaTessere>)
    expect(container.firstChild.style.gridTemplateColumns).toBe('minmax(0, 1fr)')
    expect(container.firstChild.style.columnGap).toBe('16px')
    unmount()
    const r = render(<FilaTessere><NumeroConConfronto etichetta="A" valore="1 €" /><NumeroConConfronto etichetta="B" valore="2 €" /></FilaTessere>)
    expect(r.container.firstChild.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
    expect(r.container.firstChild.style.columnGap).toBe('24px')
  })
})

describe('La risposta che manca resta grande', () => {
  it('con il numero che si sa: lo mostra grande, e sotto il perché in ambra con l\'azione', () => {
    const apri = vi.fn()
    const { container } = render(<NumeroConConfronto grande etichetta="Utile di agosto" valore={null}
      motivoMancante="manca il personale: l'utile vero sarà più basso"
      noto={{ valore: '74.057 €', etichetta: 'Utile prima del personale', stimato: true }}
      azione={{ etichetta: 'Apri Personale', onClick: apri }} />)
    const t = container.firstChild
    expect(t.children[0].textContent).toBe('Utile prima del personale')
    expect(t.children[1].textContent).toBe('74.057 €stimato')
    const cifra = t.children[1].querySelector('span')
    expect(parseFloat(cifra.style.fontSize)).toBe(36)
    expect(t.children[3].textContent).toMatch(/manca il personale/)
    expect(stessoColore(t.children[3].style.color, T.amberDark)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Apri Personale' }))
    expect(apri).toHaveBeenCalled()
  })

  it('senza numero: la frase è grande (non più 16 px grigio chiaro) e non scrive zero', () => {
    const { container } = render(<NumeroConConfronto etichetta="Utile di agosto" valore={null} motivoMancante="Non posso dirtelo: manca il personale" />)
    const frase = container.firstChild.children[1].querySelector('span')
    expect(frase.textContent).toBe('Non posso dirtelo: manca il personale')
    expect(parseFloat(frase.style.fontSize)).toBeGreaterThanOrEqual(18)
    expect(container.textContent).not.toMatch(/0 €/)
  })
})

describe('La tessera si legge come un numero, non come un modulo', () => {
  it('etichetta in frase normale, non in maiuscoletto', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi senza IVA" valore="124.553 €" />)
    expect(container.firstChild.children[0].style.textTransform).not.toBe('uppercase')
  })

  it('l\'euro è più piccolo del numero, sulla stessa riga', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" />)
    const cifra = container.firstChild.children[1].querySelector('span')
    const euro = cifra.querySelector('span')
    expect(cifra.textContent).toBe('124.553 €')
    expect(euro.textContent).toBe(' €')
    expect(parseFloat(euro.style.fontSize)).toBeLessThan(parseFloat(cifra.style.fontSize))
  })

  it('«stimato» in parole, non in una pillola colorata', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" stimato />)
    const parola = [...container.querySelectorAll('span')].find(s => s.textContent === 'stimato')
    expect(parola.style.background).toBe('')
    expect(parola.style.backgroundColor).toBe('')
    expect(parola.style.fontStyle).toBe('italic')
  })

  it('cifre proporzionali sul numero grande (le tabellari servono solo in colonna)', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" />)
    const cifra = container.firstChild.children[1].querySelector('span')
    expect(cifra.style.fontVariantNumeric).not.toBe('tabular-nums')
  })

  it('righe di testo in pixel tondi', () => {
    const { container } = render(<NumeroConConfronto etichetta="Incassi" valore="124.553 €" contesto="stimati dall'inventario" variazione={speseSu} />)
    for (const el of container.querySelectorAll('[style*="line-height"]')) {
      const lh = el.style.lineHeight
      expect(lh).toMatch(/^\d+px$/)
    }
  })
})
