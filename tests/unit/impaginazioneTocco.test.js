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

  // ── 16/09/2026, audit del righello: questa prova prometteva più di
  // quello che controlla ─────────────────────────────────────────────────
  //
  // Si chiamava «bersagli da 44px su tutto quello che si tocca» e cercava la
  // stringa `min-height: 44px` dentro un blocco `pointer: coarse`. Cioè
  // controllava che la riga **esista**, non che **copra** qualcosa.
  //
  // Provato: riscritto il selettore come `.questo-unico-bottone-qui` — una
  // regola che al mondo copre un bottone solo — la prova **passava lo
  // stesso**. Cadeva solo togliendo del tutto il blocco.
  //
  // La regola vera copre `button[aria-label]`: i pulsanti con la sola icona.
  // Tutto il resto — i pulsanti con una scritta dentro, i link, i campi, le
  // etichette — non è coperto da niente. Misurato lo stesso giorno sulle 32
  // pagine rese in Chromium: **319 bersagli su 410 stanno sotto i 44px**.
  //
  // Le due prove qui sotto dicono la verità: cos'è coperto e cosa no. Non
  // allargano la regola CSS — allargarla sposta la grafica di tutto il
  // prodotto, ed è una decisione di chi disegna, non del righello.
  it('la regola dei 44px c\'è, ed è scritta sul tipo di dispositivo', () => {
    expect(HTML).toMatch(/@media \(pointer: coarse\) \{[\s\S]{0,300}min-height: 44px;/)
  })

  it('ma copre SOLO i pulsanti a sola icona: tutto il resto non è protetto', () => {
    // Se un giorno la regola viene allargata, questa prova cade e va
    // aggiornata: è quello il segnale che si aspetta.
    const blocco = HTML.slice(HTML.indexOf('min-height: 44px') - 400, HTML.indexOf('min-height: 44px') + 40)
    expect(blocco).toContain('button[aria-label]')
    expect(blocco).not.toMatch(/\ba\[href\]/)
    expect(blocco).not.toMatch(/\[role="button"\]/)
  })

  it('e nessuna delle due si ferma più a 767px', () => {
    // Era il pixel prima dell'iPad.
    // Solo il CONTENUTO dei blocchi `max-width: 767px`, non tutto quello che
    // viene dopo: le regole del tocco stanno più in basso nel file, dentro il
    // loro blocco `pointer: coarse`.
    const blocchi = [...HTML.matchAll(/@media \(max-width: 767px\)\s*\{([\s\S]*?)\n {6}\}/g)].map(m => m[1])
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

  it('e sul telefono il nome del prodotto sta su una riga sua, intero', () => {
    // Prima nome, barra e quantità stavano tutti e tre affiancati e al nome
    // restavano 110px: «GELATO NOCCIOLA» ne chiede 115 e usciva «GELATO
    // NOCCIO…». Di un numero tagliato ci si accorge; di un nome tagliato si
    // legge l'inizio e si crede di aver letto tutto, e in un ricettario i nomi
    // si somigliano. Ora sul telefono la riga si sdoppia: nome e quantità
    // sopra, barra sotto a tutta larghezza. Sul computer restano in fila.
    const s = leggi('src', 'views', 'DashboardHomeView.jsx')
    expect(s).toMatch(/overflowWrap: 'anywhere' \}\}>\{r\.prodotto_nome\}/)
    expect(s).not.toMatch(/maxWidth: isMobile \? 110/)
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

  // ── 16/09/2026: l'attrezzo misurava solo quelli già a norma ───────────
  //
  // `audit-tocco.mjs` contava i bersagli con
  // `document.querySelectorAll('button[aria-label]')` — cioè **esattamente**
  // l'insieme che la regola CSS dei 44px costringe a passare. Non poteva che
  // rispondere zero: un metro che misura solo le cose già giuste.
  //
  // Provato con una pagina finta (un pulsante 30x30, uno 120x28, un link alto
  // 24, un campo, una tendina, e un solo pulsante a norma con `aria-label`):
  // l'attrezzo rispondeva «bersagli sotto i 44px: 0 su 1». La misura vera è
  // **6 su 7**. Sulle 32 pagine del prodotto: da 0 a **319 su 410**.
  it('e conta tutto quello che si tocca, non solo i pulsanti a sola icona', () => {
    const s = leggi('scripts', 'audit-tocco.mjs')
    for (const bersaglio of ['button', 'a[href]', '[role="button"]', 'select', 'textarea', 'label[for]']) {
      expect(s, `manca ${bersaglio} fra i bersagli misurati`).toContain(bersaglio)
    }
    // Il difetto vero: la lista dei bersagli ristretta a chi ha `aria-label`.
    expect(s).not.toMatch(/querySelectorAll\('button\[aria-label\]'\)/)
  })

  it('e guarda la larghezza oltre all\'altezza: un 120x28 si sbaglia come un 28x120', () => {
    const s = leggi('scripts', 'audit-tocco.mjs')
    expect(s).toMatch(/height < 44 \|\| q\.width < 44/)
  })

  it('e non conta i campi nascosti, che gonfiano il totale e abbelliscono la percentuale', () => {
    const s = leggi('scripts', 'audit-tocco.mjs')
    expect(s).toContain('input:not([type=hidden])')
    expect(s).toMatch(/visibility === 'hidden'/)
  })
})

// ── Il piè di pagina, l'ultimo testo fuori scala ───────────────────────
//
// 16/09/2026, misurando le 19 pagine dentro l'account vero del titolare: su
// OGNI pagina uscivano «4 testi sotto i 12px». Erano sempre gli stessi —
// Privacy, Termini, Cookie, Contatti — scritti a 11px dentro un'area alta
// 24px, e colorati al 28% di bianco.
//
// Tre cose sbagliate insieme: sotto il minimo di leggibilità che il progetto
// si è dato (12px), sotto il bersaglio da dito (44px), e il testo col
// contrasto più basso di tutto il prodotto.
//
// Non li proteggeva la regola CSS dei 44px, perché quella vale per
// `button[aria-label]` e questi sono link `<a>`: nessuno l'aveva notato
// perché la regola *sembra* coprire tutto ciò che si tocca.
describe('il piè di pagina si legge e si tocca', () => {
  const DASH = leggi('src', 'Dashboard.jsx')
  // Il blocco dei quattro link legali nella versione telefono. I piè di
  // pagina sono due — quello della finestra larga e quello del telefono — e
  // quello del telefono è il secondo nel file.
  const CHIAVE = '["Privacy","/privacy"],["Termini","/termini"],["Cookie","/cookie"],["Contatti","/contatti"]'
  const blocco = DASH.slice(DASH.lastIndexOf(CHIAVE), DASH.lastIndexOf(CHIAVE) + 900)

  it('non è più scritto a 11px', () => {
    expect(blocco).not.toContain('fontSize:11')
  })

  it('usa la scala tipografica, che ha 12px come minimo', () => {
    expect(blocco).toContain('fontSize:font.size.xs')
  })

  it('e l’area da toccare arriva ai 44px', () => {
    expect(blocco).toContain('minHeight:44')
    expect(blocco).not.toContain('minHeight:24')
  })

  it('la regola CSS dei 44px non copre i link: per questo serviva scriverlo', () => {
    // Se un domani la regola venisse estesa agli `a`, questo test lo dice —
    // e allora il minHeight scritto a mano si può togliere.
    expect(HTML).toMatch(/@media \(pointer: coarse\) \{[\s\S]{0,120}button\[aria-label\]/)
    const regola = HTML.slice(HTML.indexOf('button[aria-label]'), HTML.indexOf('button[aria-label]') + 160)
    expect(regola).not.toMatch(/\ba\[href\]|^\s*a\s*,/m)
  })
})

// ── I bersagli del menu, misurati in produzione col tocco acceso ───────
//
// 17/09/2026. Due misure si contraddicevano, e nessuna delle due era buona:
//
//   · la mia, fatta entrando in produzione col browser: «zero bersagli sotto
//     i 44px». Era sbagliata perché il browser non aveva il tocco acceso, e
//     la regola CSS `@media (pointer: coarse)` non si attivava nemmeno:
//     misuravo un telefono che il browser credeva un computer;
//   · quella di un agente, su pagine disegnate a parte: «319 su 410, il 78%».
//     Misurava il DOM senza nessun foglio di stile del telefono applicato.
//
// Rimisurato in produzione con `hasTouch: true` su otto pagine vere: **36
// bersagli su 928, il 4%**. E quasi tutti erano gli stessi tre, che tornavano
// su OGNI pagina perché stanno nel menu:
//
//     la casella «Cerca nel menu»        207 × 38
//     l'intestazione di sezione «OGGI»   223 × 35
//     la voce di menu                    223 × 36
//
// La voce di menu è il bersaglio che si tocca più spesso di tutto il
// prodotto. Questi test difendono le tre altezze: sono numeri scritti a mano
// nel foglio di stile in linea, e senza una prova tornano a 36 al primo
// ritocco grafico.
describe('i bersagli del menu reggono un dito', () => {
  const DASH = leggi('src', 'Dashboard.jsx')

  it('la voce di menu arriva a 44px', () => {
    const blocco = DASH.slice(DASH.indexOf('padding:"10px 14px 10px 26px"'), DASH.indexOf('padding:"10px 14px 10px 26px"') + 500)
    expect(blocco).toContain('minHeight: 44')
  })

  it('l’intestazione che apre e chiude una sezione pure', () => {
    const i = DASH.indexOf('padding:"10px 12px 10px 14px"')
    expect(i, 'intestazione di sezione non trovata').toBeGreaterThan(-1)
    expect(DASH.slice(i, i + 400)).toContain('minHeight: 44')
  })

  it('e la casella di ricerca del menu, che era alta 38', () => {
    expect(DASH).toContain('width:"100%", height:44, padding:"0 32px 0 36px"')
    expect(DASH).not.toContain('width:"100%", height:38')
  })

  it('anche quella della barra larga, che aveva solo il bordo interno', () => {
    // Era `padding:"8px ..."` senza altezza: 8+8+testo faceva 34.
    expect(DASH).toContain('width:150,height:44')
  })
})
