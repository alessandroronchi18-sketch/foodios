// @vitest-environment happy-dom
//
// Il campo Categoria mostra tutte le categorie, non una sola.
//
// Segnalato dal titolare il 16/09/2026: «in nuovo gusto, in categoria mi
// compare di default gusto e se clicco compare solo quello come opzione. E
// poi sotto ci sono dei piccoli tasti da premere con crema, gusto, frutta
// ecc. Togli quei piccoli box e tutti i valori scritti lì dentro mettili in
// un elenco che compare quando clicco il box categoria».
//
// Cos'era: il campo usava un `<datalist>`, che per come è fatto il browser
// mostra SOLO le voci che contengono quello che c'è già scritto nel campo. In
// una gelateria la categoria parte compilata con «Gusto», quindi toccando la
// freccia si vedeva quella sola e sembrava che le altre non esistessero. In
// più, sotto, c'era una fila di pulsantini con le stesse identiche voci:
// due comandi per la stessa cosa, tre righe di schermo.
//
// Adesso è un campo solo, con l'elenco che si apre al tocco e mostra sempre
// tutto. Si può ancora scrivere una categoria che non c'è: è una categoria,
// non un codice.

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CampoConElenco } from '../../src/views/_shared'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATEGORIE_GELATERIA = ['Gusto', 'Crema', 'Frutta', 'Cioccolato', 'Sorbetto', 'Yogurt', 'Vegan', 'Altro']

function Prova({ iniziale = 'Gusto', voci = CATEGORIE_GELATERIA }) {
  const [v, setV] = useState(iniziale)
  return <CampoConElenco valore={v} onCambia={setV} voci={voci} ariaLabel="Categoria" />
}

describe('il campo Categoria', () => {
  it('con «Gusto» già scritto, toccandolo mostra TUTTE le categorie', () => {
    const { container } = render(<Prova />)
    fireEvent.click(screen.getByLabelText('Categoria'))
    const voci = [...container.querySelectorAll('[role="option"]')].map(o => o.textContent.trim())
    // Era questo il difetto: prima ne compariva una sola.
    expect(voci).toHaveLength(CATEGORIE_GELATERIA.length)
    for (const c of CATEGORIE_GELATERIA) expect(voci.some(v => v.startsWith(c))).toBe(true)
  })

  it('e segna quella scelta', () => {
    const { container } = render(<Prova />)
    fireEvent.click(screen.getByLabelText('Categoria'))
    const scelta = container.querySelector('[role="option"][aria-selected="true"]')
    expect(scelta.textContent).toMatch(/^Gusto/)
  })

  it('scrivendo, l\'elenco si restringe', () => {
    const { container } = render(<Prova iniziale="" />)
    const campo = screen.getByLabelText('Categoria')
    fireEvent.change(campo, { target: { value: 'cio' } })
    const voci = [...container.querySelectorAll('[role="option"]')].map(o => o.textContent.trim())
    expect(voci).toEqual(['Cioccolato'])
  })

  it('scegliendo una voce, il campo la prende e l\'elenco si chiude', () => {
    const { container } = render(<Prova />)
    fireEvent.click(screen.getByLabelText('Categoria'))
    const frutta = [...container.querySelectorAll('[role="option"]')].find(o => o.textContent.trim().startsWith('Frutta'))
    fireEvent.mouseDown(frutta)
    expect(screen.getByLabelText('Categoria').value).toBe('Frutta')
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0)
  })

  it('si può scrivere una categoria che non è in elenco', () => {
    render(<Prova iniziale="" />)
    const campo = screen.getByLabelText('Categoria')
    fireEvent.change(campo, { target: { value: 'Semifreddi' } })
    expect(campo.value).toBe('Semifreddi')
  })

  it('si guida con le frecce e si conferma con Invio', () => {
    const { container } = render(<Prova iniziale="" />)
    const campo = screen.getByLabelText('Categoria')
    fireEvent.keyDown(campo, { key: 'ArrowDown' })   // apre, evidenzia la prima
    fireEvent.keyDown(campo, { key: 'ArrowDown' })   // seconda
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(campo.value).toBe('Crema')
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0)
  })

  it('Esc chiude senza scegliere', () => {
    const { container } = render(<Prova />)
    fireEvent.click(screen.getByLabelText('Categoria'))
    fireEvent.keyDown(screen.getByLabelText('Categoria'), { key: 'Escape' })
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(screen.getByLabelText('Categoria').value).toBe('Gusto')
  })

  it('ogni voce si colpisce col dito: almeno 44px di altezza', () => {
    const { container } = render(<Prova />)
    fireEvent.click(screen.getByLabelText('Categoria'))
    for (const o of container.querySelectorAll('[role="option"]')) {
      expect(o.style.minHeight).toBe('44px')
    }
  })
})

describe('la scheda della ricetta non ha più i due comandi doppi', () => {
  const SRC = readFileSync(join(RADICE, 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')

  it('niente più `<datalist>` per la categoria', () => {
    expect(SRC).not.toMatch(/cat-autocomplete/)
  })

  it('niente più fila di pulsantini con le categorie', () => {
    // I pulsantini erano un `CATEGORIE.map` che disegnava dei `<button>`.
    expect(SRC).not.toMatch(/CATEGORIE\.map\(c => \{[\s\S]{0,200}<button/)
  })

  it('e c\'è il campo con l\'elenco', () => {
    expect(SRC).toMatch(/<CampoConElenco/)
    expect(SRC).toMatch(/voci=\{CATEGORIE\}/)
  })
})
