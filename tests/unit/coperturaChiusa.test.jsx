// @vitest-environment happy-dom
//
// ── «Da dove vengono i numeri» si apre al tocco, non sta sempre aperta ──
//
// Il difetto (audit del design misurato al pixel, 04/10/2026, difetto C1 e
// primo dei dieci più gravi): la copertura dei dati stava sempre aperta in
// cima a tutte e quattro le pagine dell'Analisi. 105-139 px al computer e
// 158-235 px al telefono di avvisi, con 1-4 pulsanti bordeaux («Registra la
// cassa», «Carica lo ZIP», «Classifica», «Apri Personale») prima di ogni
// numero. Nel Mese, al telefono, il primo numero arrivava dopo 648 px: a filo
// del bordo dello schermo. Il titolare: «appena atterro sulla pagina non devo
// vedere tutto sto ammasso di cose: un bottone che se clicco si apre e vedo
// tutto».
//
// In più: le voci andavano a capo «a bandiera» (2, poi 1, poi 1) e ognuna
// aveva `minHeight: 28` per un testo alto 19, così al telefono il passo fra
// le voci andava da 6 a 15 px (CS7).
//
// La correzione: chiusa all'apertura, una riga sola con il riassunto
// («Incassi stimati · 3 dati da sistemare ▾»); aperta, l'elenco in colonna
// con un'azione per voce. Le voci restano nel documento dentro un pannello
// `hidden` (lo schema «mostra/nascondi» del W3C): chi legge lo schermo sa
// cosa c'è dietro il pulsante, e le pagine che cercano «Apri Personale»
// continuano a trovarlo.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { CoperturaDati, riassuntoCopertura } from '../../src/components/analisi/index.js'

afterEach(() => cleanup())

// Le voci del Mese di agosto sui dati veri di Mara (foto dell'audit).
const vociMara = (azioni = {}) => [
  { id: 'incassi', stato: 'stima', breve: 'Incassi stimati', testo: "incassi stimati dall'inventario (venduto × prezzo medio dei formati)", azione: { etichetta: 'Registra la cassa', onClick: azioni.cassa || (() => {}) } },
  { id: 'fatture', stato: 'parziale', testo: "76 fatture, 76 senza imponibile: 50.497 € contati con l'IVA", azione: { etichetta: 'Carica lo ZIP', onClick: azioni.zip || (() => {}) } },
  { id: 'categorie', stato: 'parziale', testo: '27.190 € di spese di 27 fornitori senza categoria', azione: { etichetta: 'Classifica', onClick: azioni.classifica || (() => {}) } },
  { id: 'personale', stato: 'manca', testo: 'personale: 1 persona attiva senza stipendio', azione: { etichetta: 'Apri Personale', onClick: azioni.personale || (() => {}) } },
]

describe('Il difetto: all\'apertura si vedevano tutti i comandi', () => {
  it('chiusa, si vede UN pulsante solo, non i quattro delle voci', () => {
    render(<CoperturaDati voci={vociMara()} />)
    // `getAllByRole` salta quello che è nascosto: è quello che vede chi guarda.
    const visibili = screen.getAllByRole('button')
    expect(visibili).toHaveLength(1)
    expect(visibili[0].getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Apri Personale' })).toBeNull()
  })

  it('il pulsante dice lo stato in una riga: «Incassi stimati · 3 dati da sistemare»', () => {
    render(<CoperturaDati voci={vociMara()} />)
    const p = screen.getByRole('button')
    expect(p.textContent).toMatch(/Incassi stimati · 3 dati da sistemare/)
    // Il testo lungo delle voci non sta nel pulsante.
    expect(p.textContent).not.toMatch(/senza imponibile/)
  })

  it('le voci non hanno più l\'altezza minima che faceva ballare il passo', () => {
    render(<CoperturaDati voci={vociMara()} />)
    fireEvent.click(screen.getByRole('button'))
    for (const li of screen.getAllByRole('listitem')) expect(li.style.minHeight).toBe('')
  })

  it('il pezzo non porta margini suoi: lo spazio fra i blocchi è della pagina', () => {
    const { container } = render(<CoperturaDati voci={vociMara()} />)
    expect(container.firstChild.style.marginBottom).toBe('')
  })
})

describe('Aperta: l\'elenco in colonna, un\'azione per voce', () => {
  it('al tocco si apre, e ogni azione funziona', () => {
    const personale = vi.fn()
    render(<CoperturaDati voci={vociMara({ personale })} />)
    const p = screen.getByRole('button')
    fireEvent.click(p)
    expect(p.getAttribute('aria-expanded')).toBe('true')
    const elenco = screen.getByRole('list')
    expect(within(elenco).getAllByRole('listitem')).toHaveLength(4)
    expect(within(elenco).getAllByRole('button').map(b => b.textContent))
      .toEqual(['Registra la cassa', 'Carica lo ZIP', 'Classifica', 'Apri Personale'])
    fireEvent.click(screen.getByRole('button', { name: 'Apri Personale' }))
    expect(personale).toHaveBeenCalled()
  })

  it('l\'elenco è in colonna, non a bandiera', () => {
    render(<CoperturaDati voci={vociMara()} />)
    fireEvent.click(screen.getByRole('button'))
    const ul = screen.getByRole('list')
    expect(ul.style.flexWrap).not.toBe('wrap')
    expect(ul.style.flexDirection).toBe('column')
  })

  it('ogni voce dice il suo stato a parole, non col colore solo', () => {
    render(<CoperturaDati voci={vociMara()} />)
    fireEvent.click(screen.getByRole('button'))
    const testi = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(testi[0]).toMatch(/^Stima: incassi stimati/)
    expect(testi[1]).toMatch(/^In parte: 76 fatture/)
    expect(testi[3]).toMatch(/^Manca: personale/)
  })

  it('il pulsante si richiude, e il pannello è legato al pulsante', () => {
    render(<CoperturaDati voci={vociMara()} />)
    const p = screen.getAllByRole('button')[0]
    fireEvent.click(p)
    const pannello = document.getElementById(p.getAttribute('aria-controls'))
    expect(pannello).toBeTruthy()
    expect(pannello.hidden).toBe(false)
    fireEvent.click(p)
    expect(p.getAttribute('aria-expanded')).toBe('false')
    expect(pannello.hidden).toBe(true)
  })

  it('il dettaglio si legge, non sta solo nel passaggio del mouse (che al telefono non c\'è)', () => {
    render(<CoperturaDati voci={[{ id: 'iva', stato: 'parziale', testo: '3 fatture con solo il totale', dettaglio: 'Carica lo ZIP delle fatture.' }]} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listitem').textContent).toMatch(/Carica lo ZIP delle fatture\./)
  })

  it('pulsante e pannello hanno la stessa imbottitura (20 computer, 16 telefono): le icone cadono in colonna', () => {
    for (const [isMobile, px] of [[false, '20px'], [true, '16px']]) {
      render(<CoperturaDati voci={vociMara()} isMobile={isMobile} />)
      const p = screen.getByRole('button')
      const pannello = document.getElementById(p.getAttribute('aria-controls'))
      expect(p.style.paddingLeft).toBe(px)
      expect(pannello.style.paddingLeft).toBe(px)
      cleanup()
    }
  })

  it('pulsanti alti 44 px, per un dito', () => {
    render(<CoperturaDati voci={vociMara()} />)
    const p = screen.getByRole('button')
    expect(p.style.minHeight).toBe('44px')
    fireEvent.click(p)
    for (const b of within(screen.getByRole('list')).getAllByRole('button')) expect(b.style.minHeight).toBe('44px')
  })
})

describe('Il riassunto, nei casi intorno', () => {
  it('tutto a posto: lo dice, e da chiusa non elenca le voci buone', () => {
    render(<CoperturaDati voci={[
      { id: 'fatture', stato: 'ok', testo: '37 fatture del mese, senza IVA' },
      { id: 'personale', stato: 'ok', testo: 'Personale: 5 persone' },
    ]} />)
    const p = screen.getByRole('button')
    expect(p.textContent).toMatch(/Tutti i dati ci sono/)
    expect(p.textContent).not.toMatch(/37 fatture/)
  })

  it('uno o due problemi con il nome breve: li nomina invece di contarli', () => {
    expect(riassuntoCopertura([
      { id: 'inv', stato: 'manca', breve: 'Inventario fermo al 31/08', testo: 'x' },
    ])).toBe('Inventario fermo al 31/08')
    expect(riassuntoCopertura([
      { id: 'a', stato: 'parziale', breve: 'Fatture fino al 10/09', testo: 'x' },
      { id: 'b', stato: 'manca', breve: 'Personale incompleto', testo: 'x' },
    ])).toBe('Fatture fino al 10/09 · Personale incompleto')
  })

  it('senza nome breve conta: «1 dato da sistemare», «2 numeri stimati»', () => {
    expect(riassuntoCopertura([{ id: 'a', stato: 'manca', testo: 'x' }])).toBe('1 dato da sistemare')
    expect(riassuntoCopertura([
      { id: 'a', stato: 'stima', testo: 'x' }, { id: 'b', stato: 'stima', testo: 'y' },
      { id: 'c', stato: 'ok', testo: 'z' },
    ])).toBe('2 numeri stimati')
  })

  it('tre problemi o più si contano anche se hanno il nome breve', () => {
    expect(riassuntoCopertura([
      { id: 'a', stato: 'parziale', breve: 'A', testo: 'x' },
      { id: 'b', stato: 'parziale', breve: 'B', testo: 'x' },
      { id: 'c', stato: 'manca', breve: 'C', testo: 'x' },
    ])).toBe('3 dati da sistemare')
  })

  it('la pagina può scrivere il riassunto da sé', () => {
    render(<CoperturaDati riassunto="Incassi stimati fino al 31/08" voci={vociMara()} />)
    expect(screen.getByRole('button').textContent).toMatch(/Incassi stimati fino al 31\/08/)
  })

  it('senza voci non occupa spazio', () => {
    const { container } = render(<CoperturaDati voci={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('chi legge lo schermo sente il nome della riga, e la regione resta trovabile', () => {
    render(<CoperturaDati voci={vociMara()} />)
    expect(screen.getByRole('region', { name: 'Da dove vengono i numeri' })).toBeTruthy()
    expect(screen.getByRole('button').textContent).toMatch(/^Da dove vengono i numeri/)
  })
})

describe('Le pagine di oggi continuano a funzionare', () => {
  it('le azioni sono nel documento anche da chiusa: chi le cerca per testo le trova', () => {
    const personale = vi.fn()
    render(<CoperturaDati voci={vociMara({ personale })} />)
    const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Apri Personale')
    expect(b).toBeTruthy()
    fireEvent.click(b)
    expect(personale).toHaveBeenCalled()
    // E il testo delle voci c'è, per chi lo controlla nella regione.
    expect(screen.getByRole('region', { name: 'Da dove vengono i numeri' }).textContent).toMatch(/27\.190 € di spese/)
  })
})
