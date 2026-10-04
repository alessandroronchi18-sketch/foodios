// @vitest-environment happy-dom
//
// ── Un'imbottitura sola, e lo spazio fra i blocchi è della pagina ───────
//
// Il difetto (audit del design misurato al pixel, 04/10/2026, C4 e IM5):
// quattro imbottiture diverse nei riquadri dell'Analisi (20 · 10/14 · 20/22 ·
// 14/16), e il testo che cominciava a 135, 137, 141 o 143 px dal bordo della
// pagina: scendendo, il margine «ballava». In più gli spazi fra i blocchi li
// decidevano i pezzi (margini da 10, 12, 14, 18 px), e le righe di testo
// avevano altezze come 28,8 · 20,25 · 17,4 px, per cui due titoli affiancati
// non finivano mai alla stessa altezza.
//
// La regola (ANALISI_DESIGN §6): dentro un riquadro 20 al computer e 16 al
// telefono, per tutti; lo spazio fra i blocchi lo possiede la pagina
// (`PaginaAnalisi`); righe di testo in pixel tondi.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import {
  Riquadro, CoperturaDati, NumeroConConfronto, NumeroPrincipale, IntestazioneAnalisi, TitoloGrafico,
  SPAZI, imbottitura,
} from '../../src/components/analisi/index.js'

afterEach(() => cleanup())

const voci = [{ id: 'a', stato: 'manca', testo: 'personale non registrato' }]

// Il bordo sinistro del testo dentro ogni riquadro dell'Analisi.
function imbottitureSinistre(isMobile) {
  const { container } = render(<div>
    <Riquadro isMobile={isMobile}>testo</Riquadro>
    <CoperturaDati isMobile={isMobile} voci={voci} />
    <NumeroConConfronto isMobile={isMobile} etichetta="Incassi" valore="1 €" />
    <NumeroConConfronto isMobile={isMobile} grande etichetta="Utile" valore="1 €" />
    <NumeroPrincipale isMobile={isMobile} riquadro etichetta="Utile" valore="1 €" />
  </div>)
  const [riq, cop, tessera, grande, principale] = container.firstChild.children
  const bottone = cop.querySelector('button')
  const pannello = document.getElementById(bottone.getAttribute('aria-controls'))
  const sx = (el) => el.style.paddingLeft || el.style.padding.split(' ').pop()
  return [riq, bottone, pannello, tessera, grande, principale].map(sx)
}

describe('Un\'imbottitura sola per tutti i riquadri', () => {
  it('al computer 20 px dappertutto', () => {
    expect(new Set(imbottitureSinistre(false))).toEqual(new Set(['20px']))
  })
  it('al telefono 16 px dappertutto', () => {
    expect(new Set(imbottitureSinistre(true))).toEqual(new Set(['16px']))
  })
  it('le misure stanno in un posto solo', () => {
    expect(imbottitura(false)).toBe(20)
    expect(imbottitura(true)).toBe(16)
    expect(SPAZI.fraRiquadri).toEqual({ computer: 24, telefono: 16 })
    expect(SPAZI.fraSezioni).toEqual({ computer: 40, telefono: 32 })
  })
})

describe('Lo spazio fra i blocchi è della pagina, non dei pezzi', () => {
  it('l\'intestazione non ha margine sotto (prima 14 px)', () => {
    const { container } = render(<IntestazioneAnalisi domanda="Quanto hai guadagnato ad agosto?" sotto="Tutta l'azienda" />)
    expect(container.firstChild.style.marginBottom).toBe('')
  })
  it('nemmeno la copertura, le tessere e il numero principale', () => {
    for (const el of [
      <CoperturaDati key="c" voci={voci} />,
      <NumeroConConfronto key="n" etichetta="A" valore="1 €" />,
      <NumeroPrincipale key="p" etichetta="A" valore="1 €" />,
      <Riquadro key="r">x</Riquadro>,
    ]) {
      const { container, unmount } = render(el)
      expect(container.firstChild.style.marginBottom).toBe('')
      expect(container.firstChild.style.marginTop).toBe('')
      unmount()
    }
  })
})

describe('Le righe di testo hanno l\'altezza in pixel tondi', () => {
  it('domanda, sottotitolo e titoli dei grafici', () => {
    const { container } = render(<div>
      <IntestazioneAnalisi domanda="Quanto hai guadagnato?" sotto="Tutta l'azienda" />
      <IntestazioneAnalisi isMobile domanda="Quanto hai guadagnato?" sotto="Tutta l'azienda" />
      <TitoloGrafico titolo="Su 100 € incassati te ne restano 18" sottotitolo="Dagli incassi all'utile, senza IVA" />
    </div>)
    const conRiga = [...container.querySelectorAll('h2, h3, div')].filter(el => el.style.lineHeight)
    expect(conRiga.length).toBeGreaterThanOrEqual(5)
    for (const el of conRiga) expect(el.style.lineHeight).toMatch(/^\d+px$/)
    const h1 = container.querySelector('h2')
    expect(h1.style.lineHeight).toBe('32px')
  })
  it('i sottotitoli vanno a capo prima dei 640 px (l\'audit ne ha misurato uno da 163 caratteri)', () => {
    const { container } = render(<TitoloGrafico titolo="T" sottotitolo="Quanto pesano sugli incassi" />)
    expect(container.querySelector('h3').nextSibling.style.maxWidth).toBe('640px')
  })
})
