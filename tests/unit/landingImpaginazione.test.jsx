// @vitest-environment happy-dom
//
// La pagina di benvenuto, riscritta il 16/09/2026.
//
// Quella di prima era lunga 9.729 px sul computer e 13.201 px sul telefono:
// undici blocchi, 1.280 parole, 24 misure di carattere diverse, dieci pulsanti
// che portano allo stesso posto e "3 mesi gratis" scritto nove volte. Il
// titolare l'ha definita «troppo lunga e dispersiva».
//
// Questi test tengono ferme le cose che si perdono per prime quando una
// pagina di presentazione ricomincia a crescere: il numero di blocchi, il
// numero di parole, le cinque risposte che deve dare subito, e la scala
// tipografica dichiarata invece che scritta a mano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'pages', 'LandingPage.jsx'), 'utf8')

function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }),
                      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
              from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }) },
}))
vi.mock('../../src/lib/apiFetch', () => ({ apiFetch: async () => ({ json: async () => ({}) }) }))

const { default: LandingPage } = await import('../../src/pages/LandingPage.jsx')

const disegna = () => render(<LandingPage onLogin={() => {}} onRegister={() => {}} />)

beforeEach(() => cleanup())

describe('la pagina resta corta', () => {
  it('non più di sei blocchi', () => {
    // Erano undici. Ogni blocco in più è mezza schermata in più da scorrere.
    const v = disegna()
    expect(v.container.querySelectorAll('section').length).toBeLessThanOrEqual(6)
  })

  it('non più di settecento parole', () => {
    // Erano 1.280. Il conto comprende il piè di pagina e la tessera del prezzo.
    const v = disegna()
    const parole = v.container.textContent.trim().split(/\s+/).filter(Boolean)
    expect(parole.length).toBeLessThanOrEqual(700)
  })

  it('un solo invito all\'azione, ripetuto in cima e in fondo', () => {
    // Prima erano dieci pulsanti che aprivano tutti la stessa registrazione,
    // uno per blocco. Qui se ne ammettono al massimo cinque in tutta la pagina
    // (barra, apertura, tessera del prezzo, chiusura, piè di pagina).
    const v = disegna()
    const inviti = [...v.container.querySelectorAll('button')]
      .filter(b => /prova|crea il tuo account|inizia/i.test(b.textContent || ''))
    expect(inviti.length).toBeLessThanOrEqual(5)
  })
})

describe('le cinque domande, nella prima schermata', () => {
  it('cos\'è e per chi', () => {
    const t = disegna().container.textContent
    expect(t).toContain('gestionale')
    for (const chi of ['pasticcerie', 'gelaterie', 'bar', 'ristoranti']) {
      expect(t.toLowerCase()).toContain(chi)
    }
  })

  it('quanto costa, senza dover scorrere fino ai prezzi', () => {
    const apertura = SRC.slice(SRC.indexOf('{/* ── 1. APERTURA'), SRC.indexOf('{/* ── 2. PER CHI'))
    expect(apertura).toMatch(/fmtPrezzo\(prezzi\.pro\)/)
    expect(apertura).toMatch(/Tre mesi di prova/)
  })

  it('come si comincia', () => {
    const t = disegna().container.textContent
    expect(t).toContain('Prova tre mesi gratis')
    expect(t).toContain('Ho già un account')
  })
})

describe('le regole di casa', () => {
  it('il simbolo dell\'euro sta DOPO la cifra', () => {
    // "149 €", mai "€149". Regola del titolare. Si guarda il sorgente: nel
    // testo reso i blocchi si attaccano fra loro ("618 €" + "73% degli
    // incassi") e sembrerebbero violazioni che a schermo non esistono.
    expect(SRC).not.toMatch(/€\s*\{/)
    expect(SRC).not.toMatch(/€\s*\d/)
    expect(SRC).toMatch(/\{fmtPrezzo\([^)]+\)\} €/)
  })

  it('niente emoji: le icone sono SVG', () => {
    const v = disegna()
    // Il segno di copyright non è un'emoji: si guardano i blocchi pittografici.
    expect(v.container.textContent).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}]/u)
    expect(v.container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })

  it('la scala tipografica è dichiarata una volta, non scritta a mano', () => {
    // Nel file vivo (senza commenti) le misure numeriche scritte a mano sono
    // poche: il resto passa dalla costante S in cima al file.
    const vivo = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n')
    expect(vivo).toMatch(/const S = \{/)
    expect((vivo.match(/fontSize: \d/g) || []).length).toBeLessThanOrEqual(12)
  })

  it('nessuna misura di carattere sotto i 12 px', () => {
    const fuori = []
    for (const m of SRC.matchAll(/fontSize: (\d+)/g)) {
      if (Number(m[1]) < 12) fuori.push(m[1])
    }
    expect(fuori).toEqual([])
  })
})

describe('le tessere dei piani', () => {
  it('sono un componente solo, non tre blocchi copiati', () => {
    // Copiati, le fasce si erano già disallineate: il prezzo del centrale
    // stava 23 px più in basso degli altri due.
    expect(SRC).toMatch(/function Piano\(/)
    for (const k of ['base', 'pro', 'chain']) {
      expect(SRC, `la tessera ${k} non è dietro il controllo`).toContain(`{mostraPiano('${k}') && (`)
    }
  })

  it('in vetrina oggi c\'è solo il Plus', () => {
    const t = disegna().container.textContent
    expect(t).toContain('Plus')
    expect(t).not.toContain('Bottega')
    expect(t).not.toContain('Maestro')
    expect(t).not.toContain('Insegna')
  })

  it('la griglia si stringe invece di lasciare due buchi', () => {
    expect(SRC).toMatch(/repeat\(\$\{nPianiMostrati\}, minmax\(0, 1fr\)\)/)
  })
})

describe('piè di pagina', () => {
  it('è una griglia a quattro colonne, non un flex che si allarga a caso', () => {
    const piede = SRC.slice(SRC.indexOf('{/* ── PIÈ DI PAGINA'))
    expect(piede).toMatch(/gridTemplateColumns: isMobile \? '1fr' : '1\.6fr 1fr 1fr 1fr'/)
  })

  it('i link legali e di supporto ci sono ancora tutti', () => {
    const t = disegna().container.textContent
    for (const voce of ['Privacy Policy', 'Termini di Servizio', 'Cookie Policy', 'Rimborsi', 'Contatti', 'Chi siamo']) {
      expect(t).toContain(voce)
    }
  })
})

describe('i blocchi che entrano scorrendo non lasciano buchi bianchi', () => {
  // Trovato il 16/09/2026 rifotografando la pagina: `Reveal` partiva da
  // `opacity: 0` e contava solo sull'osservatore dello scorrimento per
  // tornare a 1. Senza `IntersectionObserver` i tre riquadri di "Cosa fa" e
  // le tre tappe di "Come si comincia" restano bianchi per sempre — il testo
  // è nel DOM, ma a zero. Ed è metà pagina.
  it('senza osservatore dello scorrimento si parte già visibili', () => {
    const fn = SRC.slice(SRC.indexOf('function Reveal'), SRC.indexOf('function Reveal') + 1400)
    expect(fn).toMatch(/typeof IntersectionObserver === 'undefined'/)
  })

  it('chi ha chiesto meno animazioni le trova già al loro posto', () => {
    expect(SRC).toMatch(/prefers-reduced-motion: reduce/)
    // Vale sia per l'apertura sia per i blocchi sotto.
    expect(SRC).toMatch(/useState\(\(\) => menoAnimazioni\(\)\)/)
    const fn = SRC.slice(SRC.indexOf('function Reveal'), SRC.indexOf('function Reveal') + 1400)
    expect(fn).toMatch(/menoAnimazioni\(\)/)
  })
})

describe('quello che la vetrina promette, il prodotto lo mantiene', () => {
  // Verificato il 16/09/2026 leggendo il codice, una promessa alla volta.
  // «Tutto Foodos, senza limiti di sede o di utenti» regge solo finché vale
  // la decisione del titolare del 15/09/2026: un piano solo, il Plus, con
  // tutto sbloccato (`SBLOCCO_TUTTE_LE_PAGINE`). Se quella riga torna a
  // `false`, `VIEW_MIN_PLAN` rimette confronto-sedi, trasferimenti e il
  // riepilogo WhatsApp dietro Ultra, e la tessera del prezzo diventa falsa.
  // `PLAN_LIMITS.pro` dichiara già 2 sedi e 3 utenti: oggi non lo legge
  // nessuno, ma il giorno che qualcuno lo collega la frase va riscritta.
  it('«senza limiti» vale finché tutte le pagine sono sbloccate', async () => {
    const { SBLOCCO_TUTTE_LE_PAGINE } = await import('../../src/lib/planAccess.js')
    const t = disegna().container.textContent
    if (t.includes('senza limiti')) {
      expect(SBLOCCO_TUTTE_LE_PAGINE,
        'la vetrina dice "senza limiti" ma le pagine sono tornate dietro ai piani').toBe(true)
    }
  })

  it('le funzioni elencate nella tessera esistono davvero', () => {
    // Ognuna è stata ritrovata nel prodotto: ricettario e semilavorati
    // (SemilavoratiView), food cost (lib/foodcost.js), produzione e magazzino
    // (ProduzioneGiornalieraView, MagazzinoView), sprechi (SpreciOmaggi),
    // cassa e prima nota (ChiusuraView), fatture e scadenzario (Fornitori,
    // Scadenzario), P&L (PLView), AI (api/ai.js), più sedi (lib/trasferimenti.js),
    // esportazione (lib/xlsx.js, lib/exportPDF.js).
    const t = disegna().container.textContent
    for (const promessa of ['Food cost', 'Cassa e prima nota', 'P&L', 'Excel e PDF']) {
      expect(t).toContain(promessa)
    }
  })
})
