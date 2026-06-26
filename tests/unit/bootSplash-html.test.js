/**
 * Test di integrità del boot-splash inline in index.html.
 *
 * Il boot-splash è critico: se rotto, l'utente non vede caricamento e/o
 * pulsante Riprova in caso di app stuck. Questo test legge index.html e
 * verifica le invarianti chiave:
 *  - presenza nodo #boot-splash + #root nel body
 *  - presenza inline <script> che gestisce removal + recovery
 *  - wordmark "Foodos" e classe CSS .bs-wordmark
 *  - timeout recovery presente (>= 5s, evita rumore se React è lento ma OK)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

describe('index.html — boot-splash invariants', () => {
  it('contiene <div id="boot-splash">', () => {
    expect(html).toMatch(/<div id="boot-splash"/)
  })

  it('contiene <div id="root"></div> dopo il boot-splash', () => {
    const splashPos = html.indexOf('id="boot-splash"')
    const rootPos = html.indexOf('id="root"')
    expect(splashPos).toBeGreaterThan(0)
    expect(rootPos).toBeGreaterThan(splashPos) // root viene DOPO splash
  })

  it('mostra il wordmark "Foodos" (non FoodOS)', () => {
    expect(html).toMatch(/class="bs-wordmark">Foodos</)
    expect(html).not.toMatch(/class="bs-wordmark">FoodOS</)
  })

  it('contiene script inline per rimuovere boot-splash quando React monta', () => {
    expect(html).toMatch(/MutationObserver/)
    expect(html).toMatch(/app-mounted/)
  })

  it('contiene recovery: pulsante Riprova se app stuck', () => {
    expect(html).toMatch(/boot-recovery/)
    expect(html).toMatch(/Riprova/)
    // Recovery deve essere ragionevolmente lontano (>=8s) per non rumoreggiare
    // su connessioni lente normali.
    const m = html.match(/setTimeout\s*\(\s*showRecovery\s*,\s*(\d+)\s*\)/)
    expect(m).toBeTruthy()
    expect(Number(m[1])).toBeGreaterThanOrEqual(8000)
  })

  it('recovery: clear SW + cache + reload nel button onclick', () => {
    expect(html).toMatch(/serviceWorker\.getRegistrations/)
    expect(html).toMatch(/caches\.keys/)
    expect(html).toMatch(/window\.location\.reload/)
  })

  it('title della pagina è "Foodos" (no FoodOS)', () => {
    expect(html).toMatch(/<title>Foodos\b/)
    expect(html).not.toMatch(/<title>FoodOS\b/)
  })

  it('apple-mobile-web-app-title è Foodos (no FoodOS)', () => {
    expect(html).toMatch(/apple-mobile-web-app-title"\s+content="Foodos"/)
  })
})
