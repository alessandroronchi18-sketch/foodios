// @vitest-environment happy-dom
//
// ── I pezzi comuni della nuova Analisi ──────────────────────────────────
//
// 03/10/2026. Gli audit della parte Analisi hanno dato P&L 18/100, Storico
// 18, Quadratura 12, Previsioni 15. Il filo comune non era la grafica: erano
// numeri senza confronto, dati mancanti scritti come zero («Costo lavoro
// 0,0%» in verde con il personale non registrato, «margine 100%» con il food
// cost a zero, «-100%» con la cassa che non c'era), quote confrontate in
// percentuale invece che in punti, «-» al posto del segno meno.
//
// Questi pezzi sono quelli con cui tutte le pagine rifatte scrivono i
// numeri: se sbagliano qui, sbagliano dappertutto. Per questo si provano da
// soli, prima delle pagine.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import {
  euro, euroSegno, quota, punti, percentualeSegno, variazione,
  nomeMese, mesePrima, annoPrima, dataBreve, aMese,
} from '../../src/lib/formatoAnalisi.js'
import {
  CoperturaDati, NumeroConConfronto, BarraObiettivo, Cascata, geometriaCascata,
  segmentiAndamentino, Andamentino, FraseInsight,
} from '../../src/components/analisi/index.js'

afterEach(() => cleanup())
const MENO = '−'

describe('Gli euro', () => {
  it('il punto delle migliaia c\'è anche sotto le diecimila', () => {
    expect(euro(1234)).toBe('1.234 €')
    expect(euro(98290.4)).toBe('98.290 €')
  })
  it('il meno è quello tipografico, non un trattino', () => {
    expect(euro(-1500)).toBe(`${MENO}1.500 €`)
    expect(euroSegno(-1500)).toBe(`${MENO}1.500 €`)
    expect(euroSegno(2340)).toBe('+2.340 €')
  })
  it('un numero che non c\'è resta «non c\'è», non zero', () => {
    expect(euro(null)).toBeNull()
    expect(euro(undefined)).toBeNull()
    expect(euro('')).toBeNull()
    expect(euro(0)).toBe('0 €')
  })
  it('con i centesimi quando servono', () => {
    expect(euro(12.5, { decimali: 2 })).toBe('12,50 €')
  })
})

describe('Quote e punti', () => {
  it('una quota ha al massimo un decimale', () => {
    expect(quota(18.44)).toBe('18,4%')
    expect(quota(20)).toBe('20%')
  })
  it('la variazione di una quota si dice in punti', () => {
    expect(punti(1.84)).toBe('+1,8 punti')
    expect(punti(-0.4)).toBe(`${MENO}0,4 punti`)
    expect(punti(1)).toBe('+1 punto')
    expect(punti(0.02)).toBe('invariato')
  })
  it('la variazione di un importo in percentuale intera', () => {
    expect(percentualeSegno(6.4)).toBe('+6%')
    expect(percentualeSegno(-12.2)).toBe(`${MENO}12%`)
  })
})

describe('Il giudizio di un confronto', () => {
  it('per un costo, salire è peggio', () => {
    const v = variazione({ attuale: 12000, confronto: 10000, piuEMeglio: false })
    expect(v).toMatchObject({ verso: 'peggio', testoDelta: '+20%' })
  })
  it('per un incasso, salire è meglio', () => {
    expect(variazione({ attuale: 14210, confronto: 13400 }).verso).toBe('meglio')
  })
  it('una quota si giudica in punti: +0,3 punti è «come»', () => {
    expect(variazione({ attuale: 31.3, confronto: 31.0, piuEMeglio: false, quota: true }).verso).toBe('pari')
    expect(variazione({ attuale: 32.8, confronto: 31.0, piuEMeglio: false, quota: true }))
      .toMatchObject({ verso: 'peggio', testoDelta: '+1,8 punti' })
  })
  it('senza il termine di confronto non c\'è giudizio', () => {
    expect(variazione({ attuale: 100, confronto: null })).toBeNull()
  })
  it('confronto a zero: niente percentuale infinita, la differenza in euro', () => {
    expect(variazione({ attuale: 500, confronto: 0 })).toMatchObject({ deltaPct: null, testoDelta: '+500 €' })
  })
})

describe('I mesi', () => {
  it('nome, mese prima e anno prima, anche a gennaio', () => {
    expect(nomeMese('2026-09')).toBe('settembre 2026')
    expect(nomeMese('2026-09', { anno: false })).toBe('settembre')
    expect(mesePrima('2026-01')).toBe('2025-12')
    expect(annoPrima('2026-09')).toBe('2025-09')
    expect(dataBreve('2026-08-31')).toBe('31/08')
  })
  it('«ad agosto», «ad aprile», «ad ottobre», ma «a settembre»', () => {
    expect(aMese('2025-08')).toBe('ad agosto 2025')
    expect(aMese('2026-04', { anno: false })).toBe('ad aprile')
    expect(aMese('2026-10', { anno: false })).toBe('ad ottobre')
    expect(aMese('2026-09', { anno: false })).toBe('a settembre')
  })
})

describe('La cascata', () => {
  const passi = [
    { etichetta: 'Ricavi', valore: 100, tipo: 'inizio' },
    { etichetta: 'Materie prime', valore: 30, tipo: 'meno' },
    { etichetta: 'Personale', valore: 50, tipo: 'meno' },
    { etichetta: 'Utile', valore: 20, tipo: 'fine' },
  ]
  it('ogni costo parte dove è finito il precedente', () => {
    const { righe } = geometriaCascata(passi)
    expect(righe.map(r => [r.da, r.a])).toEqual([[0, 100], [70, 100], [20, 70], [0, 20]])
  })
  it('un utile negativo si segna, e la scala scende sotto zero', () => {
    const g = geometriaCascata([
      { etichetta: 'Ricavi', valore: 100, tipo: 'inizio' },
      { etichetta: 'Costi', valore: 130, tipo: 'meno' },
      { etichetta: 'Utile', valore: -30, tipo: 'fine' },
    ])
    expect(g.righe[2].negativo).toBe(true)
    expect(g.min).toBe(-30)
  })
  it('un passo che non si sa dice «non lo so», non zero', () => {
    const { container } = render(<Cascata passi={[
      { etichetta: 'Ricavi', valore: 100, tipo: 'inizio' },
      { etichetta: 'Personale', valore: null, tipo: 'meno' },
    ]} ricavi={100} />)
    expect(container.textContent).toMatch(/Personale.*non lo so/)
    expect(container.textContent).not.toMatch(/Personale.*0 €/)
  })
  it('i numeri si possono vedere in tabella', () => {
    const { container } = render(<Cascata passi={passi} ricavi={100} />)
    fireEvent.click([...container.querySelectorAll('button')].find(b => /tabella/.test(b.textContent)))
    expect(container.querySelector('table').textContent).toMatch(/Materie prime.*30,00 €.*30%/)
  })
  it('un passo cliccabile è un pulsante con un nome', () => {
    const apri = vi.fn()
    const { getByRole } = render(<Cascata passi={[{ etichetta: 'Ricavi', valore: 100, tipo: 'inizio', onClick: apri }]} />)
    fireEvent.click(getByRole('listitem', { name: /Ricavi: 100 €\. Apri il dettaglio/ }))
    expect(apri).toHaveBeenCalled()
  })
})

describe('La linea minuscola', () => {
  it('si spezza dove manca un mese, non scende a zero', () => {
    const { segmenti } = segmentiAndamentino([10, 12, null, 14, 15])
    expect(segmenti.map(s => s.length)).toEqual([2, 2])
  })
  it('senza nessun dato non disegna niente', () => {
    expect(segmentiAndamentino([null, null]).segmenti).toEqual([])
    const { container } = render(<Andamentino valori={[null]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('Il numero con il suo confronto', () => {
  it('quando il numero non c\'è dice perché, e non scrive zero', () => {
    const { container } = render(<NumeroConConfronto etichetta="Utile di settembre" valore={null} motivoMancante="mancano gli incassi" />)
    expect(container.textContent).toMatch(/mancano gli incassi/)
    expect(container.textContent).not.toMatch(/0 €/)
  })
  it('una stima lo dice dentro la tessera', () => {
    const { container } = render(<NumeroConConfronto etichetta="Ricavi" valore="98.290 €" stimato />)
    expect(container.textContent).toMatch(/98\.290 €stimato/)
  })
  it('il confronto ha il segno, il termine e il giudizio scritto, non solo il colore', () => {
    const v = variazione({ attuale: 32000, confronto: 28000, piuEMeglio: false })
    const { container } = render(<NumeroConConfronto etichetta="Costi" valore="32.000 €" variazione={v} rispettoA="sull'anno prima" valoreConfronto="28.000 €" />)
    expect(container.textContent).toMatch(/\+14%sull'anno prima\(28\.000 €\)peggio/)
  })
})

describe('La barra con l\'obiettivo', () => {
  it('dice di quanti punti si è sopra, a parole', () => {
    const { container } = render(<BarraObiettivo etichetta="Food cost" valore={34.2} obiettivo={30} />)
    expect(container.textContent).toMatch(/34,2%/)
    expect(container.textContent).toMatch(/4,2 punti sopra l'obiettivo/)
  })
  it('senza il dato non disegna una barra a zero', () => {
    const { container } = render(<BarraObiettivo etichetta="Personale" valore={null} obiettivo={30} motivoMancante="stipendi non registrati" />)
    expect(container.textContent).toMatch(/stipendi non registrati/)
    expect(container.textContent).not.toMatch(/0%sotto/)
  })
})

describe('La copertura dei dati', () => {
  it('ogni buco ha il suo pulsante per sistemarlo', () => {
    const sistema = vi.fn()
    const { container, getByText } = render(<CoperturaDati voci={[
      { id: 'cassa', stato: 'manca', testo: 'nessuna chiusura di cassa a settembre', azione: { etichetta: 'Registra', onClick: sistema } },
      { id: 'fatture', stato: 'ok', testo: '37 fatture' },
    ]} />)
    expect(container.textContent).toMatch(/Manca: nessuna chiusura di cassa/)
    fireEvent.click(getByText('Registra'))
    expect(sistema).toHaveBeenCalled()
  })
  it('senza voci non occupa spazio', () => {
    const { container } = render(<CoperturaDati voci={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('La frase con il numero dietro', () => {
  it('se porta al dettaglio è un pulsante alto abbastanza per un dito', () => {
    const vai = vi.fn()
    const { getByRole } = render(<FraseInsight verso="peggio" onClick={vai}>Materie prime +2.340 €</FraseInsight>)
    const b = getByRole('button')
    expect(b.style.minHeight).toBe('44px')
    fireEvent.click(b)
    expect(vai).toHaveBeenCalled()
  })
})
