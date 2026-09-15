// @vitest-environment happy-dom
//
// La pagina di presentazione, rifatta il 14/09/2026 sul modello di notco.ai.
//
// Contenuto e colori sono rimasti quelli: cambia come sono messe le cose. Il
// test guarda le scelte che si perdono facilmente in una modifica successiva —
// l'apertura centrata, i link alle sezioni nella barra, e soprattutto le
// tessere che devono restare della stessa altezza.

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

beforeEach(() => cleanup())

describe('apertura della pagina', () => {
  it('il titolo è centrato e alla misura più grande della pagina', () => {
    const v = render(<LandingPage onLogin={() => {}} onRegister={() => {}} />)
    const h1 = v.container.querySelector('h1')
    expect(h1).toBeTruthy()
    expect(h1.textContent).toContain('Sai quanto')
    // L'apertura è un blocco centrato: il contenitore ha textAlign center.
    const hero = SRC.slice(SRC.indexOf('{/* HERO'), SRC.indexOf('{/* STAT STRIP'))
    expect(hero).toMatch(/textAlign: 'center'/)
    // La misura è fluida e parte da 56px (prima era 44).
    expect(hero).toMatch(/clamp\(56px, 6\.4vw, 84px\)/)
    // E il prodotto sta SOTTO il testo, non di fianco: niente due colonne.
    expect(hero).not.toMatch(/gridTemplateColumns: isMobile \? '1fr' : '1\.05fr 1fr'/)
  })

  it('il contenuto dell\'apertura è rimasto quello di prima', () => {
    const v = render(<LandingPage onLogin={() => {}} onRegister={() => {}} />)
    const t = v.container.textContent
    expect(t).toContain('guadagni davvero')
    expect(t).toContain('Inizia 3 mesi gratis')
    expect(t).toContain('Vedi come funziona')
    expect(t).toContain('3 mesi gratuiti')
    expect(t).toContain('Disdici quando vuoi')
    expect(t).toContain('In italiano')
  })

  it('la barra in alto porta alle sezioni, non solo al login', () => {
    // Su una pagina lunga nove schermate, senza questi si naviga solo scorrendo.
    const v = render(<LandingPage onLogin={() => {}} onRegister={() => {}} />)
    const t = v.container.textContent
    expect(t).toContain('Come funziona')
    expect(t).toContain('Prezzi')
    expect(t).toContain('Domande')
    expect(SRC).toContain("id=\"prezzi\"")
    expect(SRC).toContain("id=\"domande\"")
    expect(SRC).toContain("id=\"come-funziona\"")
  })
})

describe('le tessere restano della stessa altezza', () => {
  it('l\'involucro che le fa comparire non annulla l\'altezza piena', () => {
    // Era il difetto nascosto: `Reveal` sta fra la griglia e la tessera, e
    // senza `height: 100%` spezzava lo stretch dei figli. Risultato: quattro
    // riquadri affiancati alti in modo diverso, coi titoli fuori riga.
    const reveal = SRC.slice(SRC.indexOf('function Reveal'), SRC.indexOf('function Reveal') + 1600)
    expect(reveal).toMatch(/height: '100%'/)
    // E la tessera dentro: colonna flessibile ad altezza piena, così il testo
    // parte dalla stessa riga anche quando è lungo la metà.
    const tessere = SRC.slice(SRC.indexOf("{ icon:'cake'"), SRC.indexOf("{ icon:'cake'") + 1800)
    expect(tessere).toMatch(/height: '100%'/)
    expect(tessere).toMatch(/flexDirection: 'column'/)
  })

  it('le tessere dei piani hanno le stesse fasce, e si distinguono col colore', () => {
    const v = render(<LandingPage onLogin={() => {}} onRegister={() => {}} />)
    const t = v.container.textContent
    // Dal 15/09/2026 in vetrina c'è un piano solo, il Plus: gli altri due
    // restano scritti nel codice ma non si mostrano finché non tornano in
    // vendita (PIANI_IN_VENDITA in planAccess.js).
    expect(t).toContain('Plus')
    expect(t).not.toContain('Bottega')
    expect(t).not.toContain('Maestro')
    expect(t).not.toContain('Insegna')
    // Le misure delle fasce restano identiche in tutte e tre le tessere: il
    // giorno che se ne riaccende una, torna già incolonnata con le altre.
    const prezzi = SRC.slice(SRC.indexOf('{/* Standard'), SRC.indexOf('Esigenze custom'))
    expect((prezzi.match(/minHeight: 28/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((prezzi.match(/minHeight: 38/g) || []).length).toBe(3)
    expect((prezzi.match(/minHeight: 58/g) || []).length).toBe(3)
    // E la stessa misura del prezzo: prima il centrale era 64 e gli altri 48.
    expect((prezzi.match(/fontSize: 56/g) || []).length).toBe(3)
  })
})

describe('piè di pagina', () => {
  it('è una griglia a quattro colonne, non un flex che si allarga a caso', () => {
    const piede = SRC.slice(SRC.indexOf('{/* FOOTER */}'))
    expect(piede).toMatch(/gridTemplateColumns: isMobile \? '1fr' : '1\.6fr 1fr 1fr 1fr'/)
  })

  it('i link legali e di supporto ci sono ancora tutti', () => {
    const v = render(<LandingPage onLogin={() => {}} onRegister={() => {}} />)
    const t = v.container.textContent
    for (const voce of ['Privacy Policy', 'Termini di Servizio', 'Cookie Policy', 'Rimborsi', 'Contatti', 'Chi siamo']) {
      expect(t).toContain(voce)
    }
  })
})
