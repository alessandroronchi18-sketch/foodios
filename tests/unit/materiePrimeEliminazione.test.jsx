// @vitest-environment happy-dom
//
// Eliminare una materia prima, sapendo cosa si sta facendo.
//
// ═══ Il difetto, e perché il controllo dev'essere DOPPIO e INFORMATO ════
//
// Richiesta del titolare, 18/09/2026: «dammi la possibilità di eliminare una
// materia prima, ovviamente ci deve essere un doppio check importante prima».
//
// Il motivo per cui un «sei sicuro?» non basta è preciso, e non è la paura di
// perdere un dato. Cancellare la voce del listino **non toglie l'ingrediente
// dalle ricette**: quelle restano scritte com'erano, con un ingrediente che da
// quel momento non ha più prezzo. E una ricetta con un ingrediente senza
// prezzo non si lamenta: lo conta zero (`calcolaFC`), quindi costa meno, e il
// margine sembra migliore del vero.
//
// È esattamente la famiglia di difetti per cui la pagina Materie prime esiste:
// sui dati veri di Mara dei Boschi 94 materie prime su 99 erano senza prezzo e
// il food cost medio usciva al 4,8% invece del 25-35% vero. Un pulsante
// «Elimina» con una conferma generica sarebbe un modo comodo per rifarlo.
//
// Quindi il controllo è doppio ma soprattutto è informato: **prima** si vede
// in quante ricette è usata e quali, e cosa succederà a quelle ricette; poi si
// spunta una casella che dice esattamente quello; e solo allora il pulsante
// rosso funziona. Dove il rischio non c'è — nessuna ricetta la usa — la
// casella non compare: la stessa cerimonia per tutti insegna solo a cliccare
// senza leggere.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MateriePrimeView, applicaEliminaMateriaPrima } =
  await import('../../src/views/MateriePrimeView.jsx')
const { calcolaFC, buildIngCosti } = await import('../../src/lib/foodcost.js')

const ricettarioBase = () => ({
  ricette: {
    r1: { nome: 'BAVARESE', ingredienti: [
      { nome: 'colorante blu', qty1stampo: 5 },
      { nome: 'zucchero', qty1stampo: 100 },
    ] },
    r2: { nome: 'CHANTILLY', ingredienti: [{ nome: 'colorante blu', qty1stampo: 3 }] },
    r3: { nome: 'FROLLA', ingredienti: [{ nome: 'zucchero', qty1stampo: 200 }] },
  },
  ingredienti_costi: {
    'colorante blu': { costoKg: 40, costoG: 0.04 },
    zucchero: { costoKg: 1.2, costoG: 0.0012 },
  },
})

beforeEach(() => { cleanup() })

describe('cosa fa e cosa NON fa l’eliminazione', () => {
  it('toglie la voce dal listino', () => {
    const esito = applicaEliminaMateriaPrima(ricettarioBase(), 'colorante blu')
    expect(esito.ok).toBe(true)
    expect('colorante blu' in esito.ricettario.ingredienti_costi).toBe(false)
    expect(esito.ricettario.ingredienti_costi.zucchero).toBeTruthy()
  })

  it('NON tocca le ricette: restano scritte com’erano', () => {
    const prima = ricettarioBase()
    const esito = applicaEliminaMateriaPrima(prima, 'colorante blu')
    expect(esito.ricettario.ricette).toBe(prima.ricette)
    expect(esito.ricettario.ricette.r1.ingredienti[0].nome).toBe('colorante blu')
  })

  it('e proprio per questo la ricetta perde il costo: l’avviso dice il vero', () => {
    // Questo test non protegge una funzione: protegge una FRASE. La finestra
    // promette che quelle ricette resteranno con un ingrediente senza prezzo
    // e che il loro costo scenderà. Qui si verifica che sia vero, perché il
    // giorno in cui non lo fosse più l'avviso diventerebbe rumore.
    const prima = ricettarioBase()
    const costoPrima = calcolaFC(prima.ricette.r1, buildIngCosti(prima.ingredienti_costi), prima)
    expect(costoPrima.mancanti).toEqual([])

    const dopo = applicaEliminaMateriaPrima(prima, 'colorante blu').ricettario
    const costoDopo = calcolaFC(dopo.ricette.r1, buildIngCosti(dopo.ingredienti_costi), dopo)
    expect(costoDopo.tot).toBeLessThan(costoPrima.tot)
    expect(costoDopo.mancanti).toContain('colorante blu')
  })

  it('non si può eliminare quello che nel listino non c’è, e si spiega dove andare', () => {
    // «sale» esiste solo perché lo scrive una ricetta: non ha una riga da
    // cancellare. Far finta di eliminarla lascerebbe tutto com'era, dicendo
    // che è fatto.
    const ric = ricettarioBase()
    ric.ricette.r3.ingredienti.push({ nome: 'sale', qty1stampo: 5 })
    const esito = applicaEliminaMateriaPrima(ric, 'sale')
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/Ricettario/)
  })

  it('senza ricettario non esplode', () => {
    expect(applicaEliminaMateriaPrima(null, 'colorante blu').ok).toBe(false)
  })
})

// ─── Il doppio controllo ────────────────────────────────────────────────────

const monta = (props = {}) => render(<MateriePrimeView
  ricettario={ricettarioBase()} logPrezzi={[]}
  onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })}
  onRinominaMateriaPrima={async () => ({ ok: true })}
  onEliminaMateriaPrima={async () => ({ ok: true })}
  {...props} />)

const apriElimina = async (v, nome) => {
  await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain(nome.toLowerCase()))
  // 19/09/2026 — la riga ferma adesso ha UN solo pulsante, «Modifica».
  // «Cambia il nome» ed «Elimina» stanno dentro e compaiono a riga aperta: il
  // titolare aveva fatto notare che sulla riga c'erano due comandi che a colpo
  // d'occhio erano lo stesso, per centodiciassette righe.
  // Si apre la riga GIUSTA, non la prima che capita: aprendo due materie prime
  // di fila, il primo «Modifica» della pagina è quello della riga di sopra.
  const riga = [...v.container.querySelectorAll('tr')]
    .find(r => r.textContent.toLowerCase().includes(nome.toLowerCase())
      && [...r.querySelectorAll('button')].some(x => x.textContent.includes('Modifica')))
  if (riga) {
    fireEvent.click([...riga.querySelectorAll('button')]
      .find(x => x.textContent.includes('Modifica') && !x.getAttribute('aria-label')))
  }
  const b = [...v.container.querySelectorAll('button')]
    .find(x => x.getAttribute('aria-label') === `Elimina ${nome}`)
  expect(b, `manca il comando per eliminare ${nome}`).toBeTruthy()
  fireEvent.click(b)
  await waitFor(() => expect(v.container.querySelector('[role="dialog"]')).toBeTruthy())
  return v.container.querySelector('[role="dialog"]')
}

/** Il pulsante rosso di conferma dentro la finestra (non quello di riga). */
const bottoneConferma = (finestra) => [...finestra.querySelectorAll('button')]
  .find(b => b.textContent.trim() === 'Elimina' && !b.getAttribute('aria-label'))

describe('non si cancella niente senza aver visto quante ricette la usano', () => {
  it('la finestra dice il numero e i nomi delle ricette', async () => {
    const v = monta()
    const finestra = await apriElimina(v, 'colorante blu')
    expect(finestra.textContent).toMatch(/2 ricette/)
    expect(finestra.textContent).toContain('BAVARESE')
    expect(finestra.textContent).toContain('CHANTILLY')
    // e non nomina una ricetta che non la usa
    expect(finestra.textContent).not.toContain('FROLLA')
  })

  it('dice cosa succederà a quelle ricette, non solo che sono tante', async () => {
    const v = monta()
    const finestra = await apriElimina(v, 'colorante blu')
    expect(finestra.textContent).toMatch(/senza prezzo/)
    expect(finestra.textContent).toMatch(/margine|costo/)
  })

  it('il pulsante rosso è spento finché la casella non è spuntata', async () => {
    const v = monta()
    const finestra = await apriElimina(v, 'colorante blu')
    expect(bottoneConferma(finestra).disabled).toBe(true)
    fireEvent.click(finestra.querySelector('input[type="checkbox"]'))
    await waitFor(() => expect(bottoneConferma(finestra).disabled).toBe(false))
  })

  it('premendolo senza aver spuntato, non elimina NIENTE', async () => {
    // Il controllo non è solo l'aspetto del pulsante: se un giorno lo stile
    // cambiasse, la funzione non deve partire lo stesso.
    const chiamate = []
    const v = monta({ onEliminaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } } })
    const finestra = await apriElimina(v, 'colorante blu')
    fireEvent.click(bottoneConferma(finestra))
    await new Promise(r => setTimeout(r, 30))
    expect(chiamate, 'ha eliminato senza il secondo controllo').toHaveLength(0)
  })

  it('spuntata la casella, elimina e manda il nome giusto', async () => {
    const chiamate = []
    const v = monta({ onEliminaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } } })
    const finestra = await apriElimina(v, 'colorante blu')
    fireEvent.click(finestra.querySelector('input[type="checkbox"]'))
    fireEvent.click(bottoneConferma(finestra))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0][0]).toBe('colorante blu')
  })

  it('la casella riparte da vuota sulla materia prima dopo', async () => {
    // Se restasse spuntata, il secondo controllo sarebbe già superato prima
    // ancora di leggere di cosa si parla.
    const v = monta()
    let finestra = await apriElimina(v, 'colorante blu')
    fireEvent.click(finestra.querySelector('input[type="checkbox"]'))
    await waitFor(() => expect(bottoneConferma(finestra).disabled).toBe(false))
    fireEvent.click([...finestra.querySelectorAll('button')].find(b => b.textContent === 'Annulla'))
    await waitFor(() => expect(v.container.querySelector('[role="dialog"]')).toBeFalsy())
    finestra = await apriElimina(v, 'colorante blu')
    expect(finestra.querySelector('input[type="checkbox"]').checked).toBe(false)
  })
})

describe('dove non c’è rischio, non c’è cerimonia', () => {
  it('una materia prima che non usa nessuno si elimina con una conferma sola', async () => {
    const chiamate = []
    const v = monta({
      ricettario: { ricette: {}, ingredienti_costi: { 'colorante blu': { costoKg: 40 } } },
      onEliminaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    const finestra = await apriElimina(v, 'colorante blu')
    expect(finestra.querySelector('input[type="checkbox"]'), 'casella inutile su una materia prima non usata').toBeFalsy()
    expect(bottoneConferma(finestra).disabled).toBe(false)
    fireEvent.click(bottoneConferma(finestra))
    await waitFor(() => expect(chiamate).toHaveLength(1))
  })

  it('e lo dice, invece di far pensare che ci sia un rischio', async () => {
    const v = monta({ ricettario: { ricette: {}, ingredienti_costi: { 'colorante blu': { costoKg: 40 } } } })
    const finestra = await apriElimina(v, 'colorante blu')
    expect(finestra.textContent).toMatch(/nessuna ricetta/)
  })
})

describe('quando il salvataggio non va', () => {
  it('la finestra resta aperta e dice cosa è successo', async () => {
    const v = monta({ onEliminaMateriaPrima: async () => ({ ok: false, errore: 'La rete non risponde.' }) })
    const finestra = await apriElimina(v, 'colorante blu')
    fireEvent.click(finestra.querySelector('input[type="checkbox"]'))
    fireEvent.click(bottoneConferma(finestra))
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('la rete non risponde.'))
    expect(v.container.querySelector('[role="dialog"]'), 'la finestra si è chiusa su un errore').toBeTruthy()
  })
})
