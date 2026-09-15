// Telefono e tablet: l'audit del 15/09/2026.
//
// Il titolare ha chiesto che «si veda tutto perfettamente» e soprattutto che le
// tre versioni — computer, tablet, telefono — «siano aggiornate in tempo reale»
// fra loro, cioè **non divergano**.
//
// Il difetto più grosso era esattamente quello: le due regole che salvano il
// telefono (niente zoom automatico nei campi, bersagli da 44px) stavano dentro
// `@media (max-width: 767px)` e **si fermavano un pixel prima dell'iPad**.
// Risultato misurato: 95 campi di testo sotto i 16px su tablet contro 8 sul
// telefono. Nessuno l'aveva deciso: succedeva perché la soglia era scritta in
// pixel invece che sul tipo di dispositivo.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')
const HTML = leggi('index.html')

describe('le regole del tocco valgono anche sul tablet', () => {
  it('niente zoom automatico nei campi, su tutto quello che si tocca', () => {
    // Sotto i 16px Safari su iOS ingrandisce la pagina da solo appena ci si
    // scrive dentro, e poi tocca rimpicciolire a mano ogni volta.
    expect(HTML).toMatch(/@media \(pointer: coarse\) \{[\s\S]{0,200}input, textarea, select \{ font-size: 16px !important; \}/)
  })

  it('bersagli da 44px su tutto quello che si tocca', () => {
    expect(HTML).toMatch(/@media \(pointer: coarse\) \{[\s\S]{0,300}min-height: 44px;/)
  })

  it('e nessuna delle due si ferma più a 767px', () => {
    // Era il pixel prima dell'iPad.
    // Solo il CONTENUTO dei blocchi `max-width: 767px`, non tutto quello che
    // viene dopo: le regole del tocco stanno più in basso nel file, dentro il
    // loro blocco `pointer: coarse`.
    const blocchi = [...HTML.matchAll(/@media \(max-width: 767px\)\s*\{([\s\S]*?)\n      \}/g)].map(m => m[1])
    expect(blocchi.length, 'nessun blocco 767px trovato').toBeGreaterThan(0)
    for (const b of blocchi) {
      expect(b).not.toMatch(/font-size: 16px !important/)
      expect(b).not.toMatch(/min-height: 44px/)
    }
  })
})

describe('il banco di prova misura la pagina vera', () => {
  // Il difetto di metodo, che vale più di molti difetti di codice: se
  // l'attrezzo mente, ogni audit futuro parte da numeri sbagliati e si
  // inseguono problemi che non esistono.
  const FILE = ['layoutViste.test.jsx', 'layoutVisteMobile.test.jsx', 'layoutVisteTablet.test.jsx']

  for (const f of FILE) {
    describe(f, () => {
      const s = leggi('tests', 'unit', f)

      it('include box-sizing, senza il quale ogni riquadro risulta più alto del vero', () => {
        // Misurato: 38px in più su un riquadro di Produzione, che sembrava
        // sbordare su tutte le larghezze mentre nell'app non sborda di niente.
        expect(s).toMatch(/\*, \*::before, \*::after \{ box-sizing: border-box; \}/)
      })

      it('include le regole del tocco', () => {
        expect(s).toMatch(/@media \(pointer: coarse\)/)
        expect(s).toMatch(/font-size: 16px !important/)
      })

      it('dichiara il meta viewport, altrimenti il browser impagina a 980px', () => {
        expect(s).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />')
      })
    })
  }

  it('ogni variante usa il margine di pagina VERO del suo dispositivo', () => {
    // Con 24px per lato su un telefono che ne usa 16, si misurano 16px di
    // sforamento che nell'app non esistono: più della metà di quelli trovati.
    expect(leggi('tests', 'unit', 'layoutViste.test.jsx')).toMatch(/\.schermo\{padding:24px;\}/)
    expect(leggi('tests', 'unit', 'layoutVisteMobile.test.jsx')).toMatch(/\.schermo\{padding:16px;\}/)
    expect(leggi('tests', 'unit', 'layoutVisteTablet.test.jsx')).toMatch(/\.schermo\{padding:20px;\}/)
  })

  it('la variante tablet esiste: era il buco dove si nascondeva il difetto', () => {
    const t = leggi('tests', 'unit', 'layoutVisteTablet.test.jsx')
    expect(t).toMatch(/default: \(\) => false,\s*\n\s*useIsTablet: \(\) => true,/)
    expect(t).toMatch(/viste-tablet/)
  })
})

describe('le file di pastiglie vanno a capo invece di spingere la pagina fuori', () => {
  it('i filtri del Registro attività', () => {
    // "Personalizzato" (106px) finiva oltre il bordo e tutta la pagina si
    // trascinava di lato.
    const s = leggi('src', 'components', 'RegistroAttivita.jsx')
    expect(s).toMatch(/flexWrap: 'wrap', maxWidth: '100%', minWidth: 0/)
  })

  it('le schede dell\'Inventario', () => {
    const s = leggi('src', 'views', 'InventarioSettimanaleView.jsx')
    expect(s).toMatch(/display: 'inline-flex', gap: 2, padding: 4, flexWrap: 'wrap',/)
  })
})

describe('le tessere si lasciano stringere', () => {
  it('la tessera dello stock in home ha minWidth 0', () => {
    // Senza, una tessera dentro una griglia non scende sotto la larghezza del
    // suo contenuto e spinge fuori tutta la pagina: misurata 356px dentro uno
    // spazio di 344.
    const s = leggi('src', 'views', 'DashboardHomeView.jsx')
    expect(s).toMatch(/cursor: 'pointer', minWidth: 0, overflow: 'hidden' \}\}>/)
  })

  it('e il nome del prodotto si stringe invece di avere una larghezza fissa', () => {
    const s = leggi('src', 'views', 'DashboardHomeView.jsx')
    expect(s).toMatch(/flex: isMobile \? '1 1 90px' : '0 0 128px'/)
  })

  it('il bottone del magazzino accorcia la scritta sul telefono', () => {
    const s = leggi('src', 'views', 'MagazzinoView.jsx')
    expect(s).toMatch(/\{isMobile \? 'Aggiungi' : 'Aggiungi ingrediente'\}/)
  })
})

describe('il cricchetto impedisce alle tre versioni di divergere di nuovo', () => {
  const CHK = leggi('scripts', 'check-design-tokens.mjs')

  it('conta le misure scritte tre volte', () => {
    expect(CHK).toMatch(/id: 'tripla-a-mano'/)
  })

  it('e le regole anti-zoom scritte a mano, che saltano sempre il tablet', () => {
    expect(CHK).toMatch(/id: 'antizoom-a-mano'/)
  })

  it('la fotografia di partenza è registrata, quindi può solo scendere', async () => {
    const base = JSON.parse(leggi('scripts', 'design-tokens-baseline.json'))
    const tripla = Object.values(base).reduce((s, v) => s + (v['tripla-a-mano'] || 0), 0)
    const anti = Object.values(base).reduce((s, v) => s + (v['antizoom-a-mano'] || 0), 0)
    expect(tripla).toBeGreaterThan(0)
    expect(anti).toBeGreaterThan(0)
  })
})

describe('gli attrezzi di misura restano nel progetto', () => {
  it('c\'è quello che misura quanto è comodo toccare', () => {
    const s = leggi('scripts', 'audit-tocco.mjs')
    expect(s).toMatch(/hasTouch: true/)
    // Senza emulare il tocco, Chromium dichiara `pointer: fine` e le regole
    // `@media (pointer: coarse)` non si applicano: si misurerebbero problemi
    // che su un dispositivo vero non esistono.
    expect(s).toMatch(/pointer: fine/)
  })
})
