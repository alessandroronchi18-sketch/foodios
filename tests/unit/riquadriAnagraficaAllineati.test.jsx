// @vitest-environment happy-dom
//
// I riquadri affiancati della scheda Anagrafica devono restare incolonnati.
//
// Segnalato dal titolare il 19/09/2026: «Partita IVA / Giorni di consegna /
// Minimo d'ordine devono essere incolonnati e allineati. "Giorni di consegna"
// è troppo lungo, va a capo, e mandando a capo l'etichetta fa crescere il suo
// riquadro più degli altri due».
//
// Cos'era: tre celle di griglia, ognuna con la sua etichetta sopra e il suo
// campo sotto. Sul computer la colonna del modulo è larga circa 320px, quindi
// ogni cella sta sui 100: «Giorni di consegna» non ci stava su una riga,
// andava a capo, e la sua etichetta alta il doppio spingeva il campo più in
// basso degli altri due. Tre caselle sfalsate.
//
// Il rimedio è doppio perché i problemi sono due, e il secondo da solo non
// basterebbe:
//
//  1. **stessa altezza minima per tutte le etichette**, col testo appoggiato
//     in basso. Così i campi partono dalla stessa riga anche quando
//     un'etichetta va a capo — e continueranno a partirne insieme con lo zoom
//     del browser, o il giorno che una parola diventerà più lunga;
//  2. **«Giorni di consegna» diventa «Consegna (gg)»**, che sta su una riga e
//     parla la lingua che il modulo usa già due campi sopra («Termini pag.
//     (gg)»). Non è un accorciamento a caso: il significato per esteso resta
//     nel suggerimento e nell'etichetta per il lettore di schermo.
//
// Qui non si misura in pixel — non c'è un motore di impaginazione — si misura
// il contratto che produce l'allineamento: le etichette affiancate hanno la
// stessa altezza minima dichiarata, e l'etichetta lunga non c'è più.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'

const db = vi.hoisted(() => ({ fornitori: [], fatture: [] }))

vi.mock('../../src/lib/supabase', () => {
  const risposta = (t, conteggio) => conteggio
    ? { data: null, error: null, count: (db[t] || []).length }
    : { data: db[t] || [], error: null, count: (db[t] || []).length }
  function catena(t) {
    let conteggio = false
    const c = {
      select(_cols, o) { if (o?.count) conteggio = true; return c },
      insert() { return c }, update() { return c }, delete() { return c },
      eq() { return c }, or() { return c }, gte() { return c }, order() { return c }, limit() { return c },
      single: async () => risposta(t, conteggio),
      maybeSingle: async () => risposta(t, conteggio),
      then: (res, rej) => Promise.resolve(risposta(t, conteggio)).then(res, rej),
    }
    return c
  }
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: (t) => catena(t),
      rpc: async () => ({ data: null, error: null }),
    },
  }
})

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null,
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const schermo = vi.hoisted(() => ({ mobile: false, tablet: false }))
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => schermo.mobile, useIsTablet: () => schermo.tablet,
}))

async function apri() {
  const { default: Fornitori } = await import('../../src/components/Fornitori.jsx')
  let v
  await act(async () => {
    v = render(<Fornitori orgId="org-mara" sedeId={null} sedi={[]} notify={() => {}} />)
  })
  await act(async () => { await new Promise(r => setTimeout(r, 40)) })
  return v
}

// L'etichetta di un riquadro: il riquadro che contiene quel testo e che
// dichiara un'altezza minima.
function etichetta(v, testo) {
  return [...v.container.querySelectorAll('div')]
    .find(d => d.style.minHeight && d.textContent.trim() === testo)
}

const I_TRE = ['Partita IVA', 'Consegna (gg)', "Minimo d'ordine"]

beforeEach(() => { schermo.mobile = false; schermo.tablet = false })

// ────────────────────────────────────────────────────────────────────────────

describe('Partita IVA / Consegna / Minimo d’ordine', () => {
  it('le tre etichette ci sono tutte', async () => {
    const v = await apri()
    for (const t of I_TRE) expect(etichetta(v, t), `manca l’etichetta «${t}»`).toBeTruthy()
  })

  it('e hanno tutte e tre la stessa altezza minima', async () => {
    // È questo che tiene i tre campi sulla stessa riga quando una delle
    // etichette va a capo.
    const v = await apri()
    const altezze = I_TRE.map(t => etichetta(v, t).style.minHeight)
    expect(new Set(altezze).size, `altezze diverse: ${altezze.join(' / ')}`).toBe(1)
    expect(parseInt(altezze[0], 10)).toBeGreaterThan(0)
  })

  it('l’altezza minima basta per due righe di etichetta', async () => {
    // Se bastasse per una sola, il rimedio reggerebbe finché nessuno cambia
    // una parola: l'etichetta andrebbe a capo e crescerebbe di nuovo.
    const v = await apri()
    const box = etichetta(v, 'Partita IVA')
    const righe = parseInt(box.style.minHeight, 10) / (parseInt(box.style.fontSize, 10) * 1.2)
    expect(righe).toBeGreaterThanOrEqual(2)
  })

  it('il testo delle etichette è appoggiato in basso, non in alto', async () => {
    // Con l'altezza minima uguale ma il testo in alto, le etichette di una
    // riga e quelle di due tornerebbero a partire da punti diversi.
    const v = await apri()
    for (const t of I_TRE) {
      const box = etichetta(v, t)
      expect(box.style.display).toBe('flex')
      expect(box.style.alignItems).toBe('flex-end')
    }
  })

  it('«Giorni di consegna» non c’è più: era quella che andava a capo', async () => {
    const v = await apri()
    const etichette = [...v.container.querySelectorAll('div')]
      .filter(d => d.style.minHeight).map(d => d.textContent.trim())
    expect(etichette).not.toContain('Giorni di consegna')
    expect(etichette).toContain('Consegna (gg)')
  })

  it('e nessuna delle tre è più lunga di «Termini pag. (gg)», che ci sta', async () => {
    // Il metro non è un numero inventato: è l'etichetta più lunga che in
    // questo modulo, in quella stessa larghezza, sta già su una riga.
    const v = await apri()
    const metro = 'Termini pag. (gg)'.length
    for (const t of I_TRE) expect(t.length, `«${t}» è più lunga del metro`).toBeLessThanOrEqual(metro)
  })

  it('accorciando non si è perso il significato', async () => {
    // Per esteso resta in due posti: nel suggerimento che si apre passandoci
    // sopra, e nell'etichetta per chi usa il lettore di schermo — che il
    // «(gg)» da solo non saprebbe come leggere.
    const v = await apri()
    expect(v.container.querySelector('input[aria-label="Giorni di consegna"]')).toBeTruthy()
    fireEvent.mouseEnter(etichetta(v, 'Consegna (gg)').querySelector('span'))
    expect(document.body.textContent).toContain('Quanti giorni passano fra l\'ordine e la consegna')
  })

  it('anche Categoria e Termini di pagamento, che stanno affiancati, sono allineati', async () => {
    const v = await apri()
    const a = etichetta(v, 'CategoriaLe tue')
    const b = etichetta(v, 'Termini pag. (gg)')
    expect(a, 'manca l’etichetta Categoria').toBeTruthy()
    expect(b, 'manca l’etichetta Termini pag.').toBeTruthy()
    expect(a.style.minHeight).toBe(b.style.minHeight)
  })

  it('sul computer stanno in tre colonne', async () => {
    const v = await apri()
    const griglia = etichetta(v, 'Partita IVA').parentElement.parentElement
    expect(griglia.style.gridTemplateColumns).toBe('1fr 1fr 1fr')
  })

  it('sul telefono vanno uno sotto l’altro, non in tre colonne da 100px', async () => {
    schermo.mobile = true
    const v = await apri()
    // Sul telefono il modulo si apre col pulsante in fondo allo schermo.
    const apriModulo = [...v.container.querySelectorAll('button')].find(b2 => /Aggiungi fornitore/.test(b2.textContent))
    await act(async () => { fireEvent.click(apriModulo) })
    const griglia = etichetta(v, 'Partita IVA').parentElement.parentElement
    expect(griglia.style.gridTemplateColumns).toBe('1fr')
  })

  it('e sul telefono i campi restano a 16px: sotto, iOS ingrandisce la pagina da solo', async () => {
    schermo.mobile = true
    const v = await apri()
    const apriModulo = [...v.container.querySelectorAll('button')].find(b2 => /Aggiungi fornitore/.test(b2.textContent))
    await act(async () => { fireEvent.click(apriModulo) })
    const campo = v.container.querySelector('input[aria-label="Giorni di consegna"]')
    expect(parseInt(campo.style.fontSize, 10)).toBeGreaterThanOrEqual(16)
  })
})
