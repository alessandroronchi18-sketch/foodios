// @vitest-environment happy-dom
//
// ── «La merce è entrata, il prezzo non è mai arrivato» ───────────────────
//
// Metà delle bolle vere del design partner sono DDT puri: la merce entra, i
// prezzi arrivano con la fattura settimane dopo. È una scelta del titolare e
// va benissimo. Il problema comincia quando quella fattura **non arriva**: in
// magazzino resta roba di cui nessuno sa il costo, e il food cost di tutte le
// ricette che la usano è costruito su un prezzo vecchio.
//
// IL DIFETTO, trovato dall'audit del 23/09/2026: `merceSenzaPrezzo()` e
// `avvisoMerceSenzaPrezzo()` erano scritte in `bolle.js`, commentate bene, e
// avevano pure un file di prove tutto loro (`merceSenzaPrezzoDopo45Giorni`).
// Chiamate da una schermata: **zero**. Il conto era giusto, la frase era
// scritta, e non le leggeva nessuno.
//
// È la sesta volta in due giorni che esce questa forma — una metà che decide
// e una metà che agisce, mai collegate — e il cricchetto che dovrebbe
// impedirla (`campiNuoviRaggiungibili`) sorvegliava dieci librerie scritte a
// mano, senza `bolle.js` dentro. Da oggi c'è anche quello.
//
// Queste prove partono dal registro dei movimenti vero e arrivano a **quello
// che si legge sullo schermo**: è l'unico punto in cui il difetto si vedeva.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null,
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')

/** Una data di N giorni fa, scritta come la scrive il registro. */
function giorniFa(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const riga = (ingrediente, giorni, extra = {}) => ({
  id: `r-${ingrediente}-${giorni}`,
  data: giorniFa(giorni),
  ingrediente,
  quantita_g: 5000,
  senzaPrezzo: true,
  bolla: 'DDT-1',
  ...extra,
})

const base = {
  ricettario: { ricette: {}, ingredienti_costi: {} },
  setLogRif: () => {}, logPrezzi: [], giornaliero: [],
  notify: () => {}, orgId: 'org-1', sedeId: 's1',
  magazzino: { 'pasta nocciola': { giacenza_g: 5000, nome: 'Pasta nocciola' } },
  setMagazzino: () => {},
}

const apri = (p = {}) => render(<MagazzinoView {...base} logRif={[]} {...p} />)
const cartello = (v) => v.container.querySelector('[data-avviso="merce-senza-prezzo"]')
const aspettaPagina = (v) => waitFor(() => expect(v.container.textContent).toContain('Materie prime'))

afterEach(() => cleanup())

describe('Il cartello compare quando serve', () => {
  it('una materia prima entrata 90 giorni fa senza prezzo si vede a schermo', async () => {
    const v = apri({ logRif: [riga('pasta nocciola', 90)] })
    await aspettaPagina(v)
    const c = cartello(v)
    expect(c, 'il cartello non c\'è: il conto esiste e nessuno lo mostra — è esattamente il difetto').toBeTruthy()
    expect(c.textContent).toContain('pasta nocciola')
    expect(c.textContent).toContain('90')
  })

  it('e dice anche cosa fare, non solo che c\'è un problema', async () => {
    // Un avviso che non dice il rimedio è un cartello che dopo una settimana
    // nessuno guarda più.
    const v = apri({ logRif: [riga('pasta nocciola', 90)] })
    await aspettaPagina(v)
    expect(cartello(v).textContent).toMatch(/carica la fattura/i)
    expect(cartello(v).textContent).toMatch(/non seguire/i)
  })

  it('con più materie prime le elenca, invece di dire solo quante sono', async () => {
    // «3 materie prime» manda a cercare fra quaranta righe; i nomi mandano a
    // correggere.
    const v = apri({ logRif: [
      riga('pasta nocciola', 90), riga('pasta pistacchio', 70), riga('cacao', 60),
    ] })
    await aspettaPagina(v)
    const t = cartello(v).textContent
    expect(t).toContain('pasta nocciola')
    expect(t).toContain('pasta pistacchio')
    expect(t).toContain('cacao')
  })
})

describe('E soprattutto: quando NON deve comparire', () => {
  it('merce entrata ieri senza prezzo non è un allarme', async () => {
    // I DDT senza prezzo sono la normalità: se il cartello suonasse subito,
    // suonerebbe sempre, e allora non direbbe più niente.
    const v = apri({ logRif: [riga('pasta nocciola', 1)] })
    await aspettaPagina(v)
    expect(cartello(v)).toBeFalsy()
  })

  it('merce entrata col suo prezzo non compare mai', async () => {
    const v = apri({ logRif: [riga('pasta nocciola', 200, { senzaPrezzo: undefined })] })
    await aspettaPagina(v)
    expect(cartello(v)).toBeFalsy()
  })

  it('un registro vuoto non fa comparire niente', async () => {
    const v = apri({ logRif: [] })
    await aspettaPagina(v)
    expect(cartello(v)).toBeFalsy()
  })

  it('e una riga rotta nel registro non fa cadere la pagina', async () => {
    // Il registro è scritto da tre strade diverse: prima o poi ci finisce
    // dentro una riga senza data o senza nome.
    const v = apri({ logRif: [null, {}, { data: null, senzaPrezzo: true }, riga('pasta nocciola', 90)] })
    await aspettaPagina(v)
    expect(cartello(v)).toBeTruthy()
    expect(v.container.textContent).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})

describe('Le materie prime che non aspettano nessuna fattura', () => {
  it('quelle escluse restano fuori dal conto', async () => {
    // Il titolare, 22/09/2026, sulla granella di nocciola: «non considerarla».
    // C'è merce che il fornitore dà dentro e non fattura mai a parte: senza
    // questo elenco il cartello diventerebbe fisso.
    const v = apri({
      logRif: [riga('granella di nocciola', 120)],
      esclusi: new Set(['granella di nocciola']),
    })
    await aspettaPagina(v)
    expect(cartello(v)).toBeFalsy()
  })

  it('ma se ce n\'è anche una non esclusa, il cartello resta', async () => {
    const v = apri({
      logRif: [riga('granella di nocciola', 120), riga('pasta nocciola', 90)],
      esclusi: new Set(['granella di nocciola']),
    })
    await aspettaPagina(v)
    const c = cartello(v)
    expect(c).toBeTruthy()
    expect(c.textContent).toContain('pasta nocciola')
    expect(c.textContent).not.toContain('granella')
  })
})

describe('Il righello di questo file', () => {
  it('la pagina si disegna davvero, se no le prove qui sopra non guardano niente', async () => {
    const v = apri({ logRif: [riga('pasta nocciola', 90)] })
    await aspettaPagina(v)
    expect(v.container.textContent.length).toBeGreaterThan(200)
  })
})
