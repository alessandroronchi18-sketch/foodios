// All'avvio non si scarica la libreria dei PDF.
//
// Misurato il 16/09/2026 guardando il file compilato: `index.html` metteva in
// `modulepreload` il pacchetto `pdf-*.js` — **649 kB, 196 compressi** — e il
// browser se lo tirava giù prima di disegnare qualsiasi cosa. Su una rete di
// negozio è la differenza fra aprire l'app e aspettare.
//
// Il motivo non era jsPDF: era l'**aiutante di Vite** per il caricamento a
// richiesta (`__vitePreload`). Rollup lo mette nel primo pacchetto che lo usa,
// ed era finito dentro `pdf`; ma quell'aiutante serve a tutti, quindi il
// pacchetto principale se lo importava — e si portava dietro tutto il resto
// del pacchetto. Nel file compilato si leggeva `import{_ as D}from"./pdf-*.js"`,
// dove `_` è l'aiutante, non jsPDF.
//
// La correzione è una riga in `vite.config.js`: l'aiutante ha un pacchetto suo,
// da 1,7 kB.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('la libreria dei PDF non si scarica all\'avvio', () => {
  it('l\'aiutante del caricamento a richiesta ha un pacchetto suo', () => {
    const cfg = readFileSync(join(RADICE, 'vite.config.js'), 'utf8')
    expect(cfg).toMatch(/vite\/preload-helper/)
    expect(cfg).toMatch(/return 'preload'/)
    // E la regola deve stare PRIMA di quelle su node_modules, altrimenti non
    // scatta mai: l'aiutante è un modulo virtuale, non sta in node_modules.
    expect(cfg.indexOf("vite/preload-helper")).toBeLessThan(cfg.indexOf("id.includes('node_modules')"))
  })

  it('se il programma è già compilato, la pagina non lo mette in preload', () => {
    const html = join(RADICE, 'dist', 'index.html')
    if (!existsSync(html)) return    // niente build in questo momento: non è un errore
    const s = readFileSync(html, 'utf8')
    const preload = [...s.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(m => m[1])
    expect(preload.filter(h => /\/pdf-/.test(h)), 'il pacchetto dei PDF è in preload').toEqual([])
    expect(preload.filter(h => /\/charts-/.test(h)), 'il pacchetto dei grafici è in preload').toEqual([])
  })
})
