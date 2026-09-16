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

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import BarraPeriodo from '../../src/components/BarraPeriodo'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

function Prova({ iniziale = { from: '2026-09-01', to: '2026-09-16' } }) {
  const [p, setP] = useState(iniziale)
  const [c, setC] = useState('prev')
  return <BarraPeriodo from={p.from} to={p.to} onPeriodo={(f, t) => setP({ from: f, to: t })}
    confronto={c} onConfronto={setC} />
}

describe('la barra del periodo', () => {
  it('offre le nove scorciatoie', () => {
    render(<Prova />)
    for (const l of ['Oggi', 'Ieri', '7 giorni', '30 giorni', '90 giorni',
      'Questa settimana', 'Questo mese', 'Mese scorso', "Quest'anno"]) {
      expect(screen.getByRole('button', { name: l })).toBeTruthy()
    }
  })

  it('premendo una scorciatoia le due date cambiano insieme', () => {
    render(<Prova />)
    const prima = screen.getByLabelText('Data di inizio').value
    fireEvent.click(screen.getByRole('button', { name: 'Mese scorso' }))
    expect(screen.getByLabelText('Data di inizio').value).not.toBe(prima)
    // Il mese scorso finisce l'ultimo giorno del mese, qualunque sia.
    expect(screen.getByLabelText('Data di fine').value).toMatch(/-(28|29|30|31)$/)
  })

  it('e la scorciatoia scelta resta accesa', () => {
    render(<Prova />)
    fireEvent.click(screen.getByRole('button', { name: 'Questo mese' }))
    expect(screen.getByRole('button', { name: 'Questo mese' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Ieri' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('le date si possono ancora scrivere a mano', () => {
    render(<Prova />)
    fireEvent.change(screen.getByLabelText('Data di inizio'), { target: { value: '2026-07-03' } })
    expect(screen.getByLabelText('Data di inizio').value).toBe('2026-07-03')
    // E allora nessuna scorciatoia è accesa: è un periodo suo.
    for (const l of ['Oggi', 'Questo mese', 'Mese scorso']) {
      expect(screen.getByRole('button', { name: l }).getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('il confronto si può spegnere', () => {
    // Shopify lo prevede, e ha ragione: il primo mese di apertura non ha un
    // mese precedente, e un confronto col nulla racconta una storia falsa.
    render(<Prova />)
    expect(screen.getByRole('button', { name: 'Nessuno' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nessuno' }))
    expect(screen.getByRole('button', { name: 'Nessuno' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('dice a parole che periodo stai guardando, e contro cosa', () => {
    // Le date in cifre dicono già tutto, ma vanno lette. Questa riga si
    // capisce di sfuggita, ed è quella che evita di guardare un mese credendo
    // di guardarne un altro.
    const { container } = render(<Prova />)
    expect(container.textContent).toMatch(/Stai guardando/)
    expect(container.textContent).toMatch(/1–16 settembre 2026/)
    expect(container.textContent).toMatch(/confronto con/)
  })

  it('e col confronto spento non promette confronti', () => {
    const { container } = render(<Prova />)
    fireEvent.click(screen.getByRole('button', { name: 'Nessuno' }))
    expect(container.textContent).not.toMatch(/confronto con/)
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
