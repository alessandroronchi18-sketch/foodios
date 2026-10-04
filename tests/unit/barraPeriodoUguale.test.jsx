// @vitest-environment happy-dom
//
// La stessa barra del periodo in tutte le pagine di analisi.
//
// Dall'audit dell'analytics di Shopify: la cosa che mancava di più non era un
// grafico, era l'impalcatura. Ogni pagina aveva il suo periodo — il P&L
// «dal/al» e basta, lo Storico nove scorciatoie più il confronto, il Confronto
// sedi solo settimana/mese. Passando da una pagina all'altra si ricominciava
// da capo, e la stessa domanda («com'è andato settembre?») andava riposta tre
// volte in tre modi.
//
// E il P&L, del periodo precedente, aveva una riga sola dentro il sottotitolo
// dei Ricavi: Utile, Food cost e Costo lavoro non avevano confronto. È proprio
// lì che serve — che i ricavi siano saliti lo si vede anche dalla cassa, che
// il food cost sia salito di tre punti no.

//
// 04/10/2026, il titolare: «i filtri temporali sono tanto voluminosi, con
// tante scritte. Deve esserci un bottone che se clicco si apre e vedo tutto,
// ma appena atterro sulla pagina non devo vedere tutto sto ammasso di cose».
// La barra erano tre righe sempre aperte — nove scorciatoie, due date, tre
// confronti — più una frase, prima del primo numero. Ora all'arrivo c'è una
// riga sola: ‹ il periodo e contro cosa ▾ ›. Le prove di prima restano tutte,
// solo che prima si apre il pulsante; e le date scritte a mano si confermano
// con «Applica», perché la pagina ricaricava a ogni cifra.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React, { useState } from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import BarraPeriodo from '../../src/components/BarraPeriodo'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

function Prova({ iniziale = { from: '2026-09-01', to: '2026-09-16' }, onPeriodo, ...altre }) {
  const [p, setP] = useState(iniziale)
  const [c, setC] = useState('prev')
  return <BarraPeriodo from={p.from} to={p.to}
    onPeriodo={(f, t) => { onPeriodo?.(f, t); setP({ from: f, to: t }) }}
    confronto={c} onConfronto={setC} {...altre} />
}

// Il pulsante che apre le scelte: è l'unico con aria-haspopup.
const pulsantePeriodo = () => screen.getByRole('button', { name: /^Periodo:/ })
const apri = () => {
  if (pulsantePeriodo().getAttribute('aria-expanded') !== 'true') fireEvent.click(pulsantePeriodo())
}
const scriviDate = (da, a) => {
  apri()
  fireEvent.change(screen.getByLabelText('Data di inizio'), { target: { value: da } })
  fireEvent.change(screen.getByLabelText('Data di fine'), { target: { value: a } })
  fireEvent.click(screen.getByRole('button', { name: 'Applica' }))
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('all\'arrivo: una riga sola, non un ammasso di comandi', () => {
  it('si vede il periodo, non le scelte', () => {
    const { container } = render(<Prova />)
    expect(pulsantePeriodo().getAttribute('aria-expanded')).toBe('false')
    expect(pulsantePeriodo().getAttribute('aria-haspopup')).toBe('dialog')
    // Niente date, niente scorciatoie, niente confronti finché non si tocca.
    expect(screen.queryByLabelText('Data di inizio')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mese scorso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nessuno' })).toBeNull()
    // Tre comandi in tutto: ‹, il pulsante, ›.
    expect(container.querySelectorAll('button').length).toBe(3)
    expect(container.querySelectorAll('input').length).toBe(0)
  })

  it('il pulsante dice che periodo è e contro cosa si confronta, mai «Filtri»', () => {
    // È la frase «Stai guardando…» di prima, dentro il pulsante: si capisce
    // di sfuggita, ed evita di guardare un mese credendo di guardarne un altro.
    render(<Prova />)
    expect(pulsantePeriodo().textContent).toMatch(/1–16 settembre 2026/)
    expect(pulsantePeriodo().textContent).toMatch(/contro 16–31 agosto 2026/)
    expect(pulsantePeriodo().textContent).not.toMatch(/Filtr/)
  })

  it('toccandolo si apre, e toccandolo di nuovo si chiude', () => {
    render(<Prova />)
    fireEvent.click(pulsantePeriodo())
    expect(pulsantePeriodo().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Scegli il periodo' })).toBeTruthy()
    fireEvent.click(pulsantePeriodo())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Esc chiude e rimette lo stato attivo sul pulsante', () => {
    render(<Prova />)
    apri()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(pulsantePeriodo())
  })

  it('la crocetta chiude', () => {
    render(<Prova />)
    apri()
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('toccando fuori, sul computer, si chiude', () => {
    render(<div><p>fuori</p><Prova /></div>)
    apri()
    fireEvent.mouseDown(screen.getByText('fuori'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sul telefono sale un foglio dal basso, con il velo dietro', () => {
    render(<Prova isMobile />)
    apri()
    const foglio = screen.getByRole('dialog')
    expect(foglio.getAttribute('aria-modal')).toBe('true')
    expect(foglio.style.position).toBe('fixed')
    expect(foglio.style.bottom).toBe('0px')
    // Il velo sta subito prima del foglio e copre la pagina. Toccarlo chiude,
    // come in ogni foglio del telefono.
    const velo = foglio.previousElementSibling
    expect(velo.getAttribute('aria-hidden')).toBe('true')
    expect(velo.style.position).toBe('fixed')
    fireEvent.click(velo)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('senza confronto il pulsante lo dice in due parole, e dentro c\'è il perché', () => {
    render(<Prova confrontoEffettivo={{ motivo: 'nel periodo di confronto non c\'è nessun giorno registrato' }} />)
    expect(pulsantePeriodo().textContent).toMatch(/senza confronto/)
    expect(pulsantePeriodo().textContent).not.toMatch(/registrato/)
    apri()
    expect(screen.getByRole('dialog').textContent).toMatch(/Nessun confronto: nel periodo di confronto non c'è nessun giorno registrato/)
  })

  it('una pagina senza confronto non lo nomina nemmeno', () => {
    render(<Prova mostraConfronto={false} />)
    expect(pulsantePeriodo().textContent).not.toMatch(/contro|confronto/)
    apri()
    expect(screen.queryByRole('group', { name: 'Confronta con' })).toBeNull()
  })

  it('ogni comando ha un bersaglio da dito, anche sul computer', () => {
    const { container } = render(<Prova />)
    for (const b of container.querySelectorAll('button')) {
      const h = b.style.minHeight || b.style.height
      expect(h, b.getAttribute('aria-label') || b.textContent).toBe('44px')
    }
    apri()
    for (const b of screen.getByRole('dialog').querySelectorAll('button')) {
      const h = b.style.minHeight || b.style.height
      expect(h, b.getAttribute('aria-label') || b.textContent).toBe('44px')
    }
  })
})

describe('le frecce: il periodo prima e dopo senza aprire niente', () => {
  it('‹ porta al mese intero prima, › torna indietro', () => {
    const visti = []
    render(<Prova iniziale={{ from: '2026-08-01', to: '2026-08-31' }} onPeriodo={(f, t) => visti.push(`${f} ${t}`)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Periodo precedente' }))
    expect(visti.at(-1)).toBe('2026-07-01 2026-07-31')
    expect(pulsantePeriodo().textContent).toMatch(/1–31 luglio 2026/)
    fireEvent.click(screen.getByRole('button', { name: 'Periodo successivo' }))
    expect(visti.at(-1)).toBe('2026-08-01 2026-08-31')
    // Le frecce non aprono il pannello.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('in avanti oltre oggi la freccia è spenta', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 4, 15, 0))
    render(<Prova iniziale={{ from: '2026-10-01', to: '2026-10-04' }} />)
    expect(screen.getByRole('button', { name: 'Periodo successivo' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Periodo precedente' }).disabled).toBe(false)
  })
})

describe('dentro: un tocco applica e chiude', () => {
  it('offre le nove scorciatoie', () => {
    render(<Prova />)
    apri()
    for (const l of ['Oggi', 'Ieri', '7 giorni', '30 giorni', '90 giorni',
      'Questa settimana', 'Questo mese', 'Mese scorso', "Quest'anno"]) {
      expect(screen.getByRole('button', { name: l })).toBeTruthy()
    }
  })

  it('una scorciatoia cambia le due date insieme e chiude il pannello', () => {
    // Un periodo lontano da oggi: partendo da settembre, il 3/10/2026 «Mese
    // scorso» ridava proprio settembre e il test diceva che il pulsante non
    // faceva niente.
    const visti = []
    render(<Prova iniziale={{ from: '2025-03-01', to: '2025-03-16' }} onPeriodo={(f, t) => visti.push([f, t])} />)
    apri()
    fireEvent.click(screen.getByRole('button', { name: 'Mese scorso' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const [f, t] = visti.at(-1)
    expect(f).not.toBe('2025-03-01')
    // Il mese scorso finisce l'ultimo giorno del mese, qualunque sia.
    expect(t).toMatch(/-(28|29|30|31)$/)
    expect(pulsantePeriodo().textContent).not.toMatch(/marzo 2025/)
  })

  it('e la scorciatoia scelta resta accesa', () => {
    render(<Prova />)
    apri()
    fireEvent.click(screen.getByRole('button', { name: 'Questo mese' }))
    apri()
    expect(screen.getByRole('button', { name: 'Questo mese' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Ieri' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('aperto, lo stato attivo va sulla scelta accesa', () => {
    render(<Prova />)
    apri()
    fireEvent.click(screen.getByRole('button', { name: 'Questo mese' }))
    apri()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Questo mese' }))
  })

  it('il confronto si può spegnere, e il tocco chiude', () => {
    // Shopify lo prevede, e ha ragione: il primo mese di apertura non ha un
    // mese precedente, e un confronto col nulla racconta una storia falsa.
    render(<Prova />)
    apri()
    fireEvent.click(screen.getByRole('button', { name: 'Nessuno' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pulsantePeriodo().textContent).not.toMatch(/contro/)
    apri()
    expect(screen.getByRole('button', { name: 'Nessuno' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('dialog').textContent).not.toMatch(/Stai confrontando/)
  })

  it('dentro dice a parole contro cosa si confronta', () => {
    render(<Prova />)
    apri()
    expect(screen.getByRole('dialog').textContent).toMatch(/Stai confrontando con 16–31 agosto 2026/)
  })
})

describe('le date scritte a mano: si confermano con «Applica»', () => {
  it('le date si possono ancora scrivere a mano', () => {
    const visti = []
    render(<Prova onPeriodo={(f, t) => visti.push([f, t])} />)
    scriviDate('2026-07-03', '2026-07-20')
    expect(visti.at(-1)).toEqual(['2026-07-03', '2026-07-20'])
    expect(pulsantePeriodo().textContent).toMatch(/3–20 luglio 2026/)
    // E allora nessuna scorciatoia è accesa: è un periodo suo.
    apri()
    for (const l of ['Oggi', 'Questo mese', 'Mese scorso']) {
      expect(screen.getByRole('button', { name: l }).getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('scrivere una data non ricarica la pagina: solo «Applica» lo fa', () => {
    // Prima ogni cifra cambiava il periodo, e fra la prima data e la seconda
    // la pagina mostrava un periodo che nessuno aveva chiesto.
    const visti = []
    render(<Prova onPeriodo={(f, t) => visti.push([f, t])} />)
    apri()
    fireEvent.change(screen.getByLabelText('Data di inizio'), { target: { value: '2026-07-03' } })
    expect(visti).toEqual([])
    expect(pulsantePeriodo().textContent).toMatch(/1–16 settembre 2026/)
  })

  it('chiudere senza «Applica» butta la bozza', () => {
    render(<Prova />)
    apri()
    fireEvent.change(screen.getByLabelText('Data di inizio'), { target: { value: '2026-07-03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    apri()
    expect(screen.getByLabelText('Data di inizio').value).toBe('2026-09-01')
  })

  it('una data di inizio dopo quella di fine non si applica, e lo dice', () => {
    render(<Prova />)
    apri()
    fireEvent.change(screen.getByLabelText('Data di inizio'), { target: { value: '2026-09-20' } })
    expect(screen.getByRole('button', { name: 'Applica' }).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toMatch(/inizio viene dopo quella di fine/)
  })

  it('senza cambiare niente «Applica» è spento', () => {
    render(<Prova />)
    apri()
    expect(screen.getByRole('button', { name: 'Applica' }).disabled).toBe(true)
  })
})

describe('e sta nelle pagine, non solo in una', () => {
  it('lo Storico usa la barra condivisa', () => {
    const s = leggi('src', 'views', 'StoricoProduzioneView.jsx')
    expect(s).toMatch(/<BarraPeriodo/)
    // E non ha più le sue scorciatoie scritte a mano, che usavano la data UTC.
    expect(s).not.toMatch(/const applicaPreset = \(id\) =>/)
    expect(s).not.toMatch(/const iso = \(dt\) => dt\.toISOString\(\)\.slice\(0, 10\)/)
  })

  it('il P&L pure, e adesso ha un confronto', () => {
    const s = leggi('src', 'views', 'PLView.jsx')
    expect(s).toMatch(/<BarraPeriodo/)
    expect(s).toMatch(/const \[confrontoPL, setConfrontoPL\] = useState\('prev'\)/)
    // Il periodo di confronto non se lo calcola più da sé.
    expect(s).toMatch(/finestraConfronto\(from, to, confrontoPL\)/)
  })

  it('e il confronto arriva a tutte e quattro le tessere, non a una sola', () => {
    const s = leggi('src', 'views', 'PLView.jsx')
    // Food cost e costo lavoro si confrontano in PUNTI, non in euro.
    expect(s).toMatch(/const fcPctPrev = prev\.ricaviConFc > 0/)
    expect(s).toMatch(/const lavPctPrev = prev\.ricavi > 0/)
    expect(s).toMatch(/plMese\.fcPct - plMese\.fcPctPrev/)
    expect(s).toMatch(/plMese\.lavPct - plMese\.lavPctPrev/)
    expect(s).toMatch(/plMese\.utile - plMese\.utilePrev/)
  })

  it('e l\'etichetta dice con COSA si confronta', () => {
    const s = leggi('src', 'views', 'PLView.jsx')
    expect(s).toMatch(/confrontoPL === 'year_prev' \? "vs l'anno scorso" : 'vs periodo prec\.'/)
  })
})
