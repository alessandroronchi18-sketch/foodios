// @vitest-environment happy-dom
//
// Materie prime: i numeri in cima e la riga rossa che li racconta.
//
// ═══ I due difetti, 18/09/2026, guardando la pagina sui dati veri ═══════
// (117 materie prime di Mara dei Boschi, 75 senza prezzo)
//
// **1. Due delle quattro tessere in cima non dicevano niente di vero.**
//
// «Prezzo tuo» era il totale meno le altre due: un'addizione al contrario,
// che chi guarda può fare da solo. Nessuna informazione nuova, un quarto
// dello spazio.
//
// «Stima di mercato» era peggio che inutile: era falsa. Il 18/09 del mattino
// `STIMA_DI_MERCATO_FA_IL_CONTO` è passato a `false` (`foodcost.js`, decisione
// del titolare: «la stima di mercato in base a cosa la fai? occhio toglila che
// può essere fuorviante»). Da quel momento un prezzo preso dal listino medio
// HoReCa **non entra nel food cost**: una materia prima «stimata» conta zero
// esattamente come una senza prezzo. Ma la pagina la mostrava in una tessera
// ambra accanto a quella rossa dei buchi, cioè nel posto dove si mettono le
// cose sistemate — e la teneva fuori dal conto «Senza prezzo». Il numero su
// cui si decide se fidarsi del food cost era più basso del vero, nella pagina
// che esiste apposta per dire quel numero.
//
// **2. La riga rossa prendeva tre righe per dire due cose.** Trentasette
// parole: «75 materie prime non hanno prezzo e nel food cost contano zero: le
// ricette che le usano costano meno di quanto costano davvero. Cerca il badge
// rosso qui sotto e scrivi il prezzo al chilo». Le due cose che serve dire
// sono quante sono e che il food cost esce più basso del vero; il resto si
// vede scorrendo l'elenco, e scritto lì rubava la riga al numero.

// 19/09/2026 — i nomi delle materie prime si leggono con la prima
// maiuscola («Burro», non «burro»): nel database restano minuscoli, perché
// quella è la chiave con cui il food cost trova il prezzo, e cambiarla
// farebbe sparire un costo in silenzio. Qui cambiano solo le prove su
// quello che si legge a schermo; i dati di prova restano com'erano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
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

const { default: MateriePrimeView, contaMateriePrime, materiePrimeDaRicettario } =
  await import('../../src/views/MateriePrimeView.jsx')

// «burro» e «farina» stanno nel listino medio HoReCa: senza un prezzo tuo
// diventano «stima di mercato». «aceto balsamicp» no — è il nome battuto
// storto, e non ha prezzo in nessun modo.
const conStime = {
  ricette: { r1: { nome: 'TORTA', ingredienti: [
    { nome: 'burro', qty1stampo: 100 },
    { nome: 'farina', qty1stampo: 300 },
    { nome: 'aceto balsamicp', qty1stampo: 10 },
    { nome: 'zucchero', qty1stampo: 50 },
  ] } },
  ingredienti_costi: { zucchero: { costoKg: 1.2, costoG: 0.0012 } },
}

const monta = (ricettario) => render(<MateriePrimeView
  ricettario={ricettario} logPrezzi={[]}
  onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })} />)

beforeEach(() => { cleanup() })

describe('il conto delle «senza prezzo» comprende le stimate', () => {
  it('una stima di mercato conta come un buco, perché il food cost la conta zero', () => {
    const righe = materiePrimeDaRicettario(conStime)
    const c = contaMateriePrime(righe)
    // Gli stati restano tre: chi ha un riferimento di mercato e chi non ha
    // proprio niente sono due situazioni diverse, e servono a chi corregge.
    expect(c.stimate).toBeGreaterThan(0)
    expect(c.senzaPrezzo).toBeGreaterThan(0)
    // Ma il numero che si guarda è uno solo: quante il food cost non sa contare.
    expect(c.senzaPrezzoVero).toBe(c.senzaPrezzo + c.stimate)
  })

  it('a schermo compare quel numero, non quello più basso', async () => {
    const v = monta(conStime)
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('senza prezzo'))
    const c = contaMateriePrime(materiePrimeDaRicettario(conStime))
    expect(c.senzaPrezzoVero).toBeGreaterThan(c.senzaPrezzo)
    expect(v.container.textContent).toContain(`${c.senzaPrezzoVero} materie prime senza prezzo`)
    expect(v.container.textContent).not.toContain(`${c.senzaPrezzo} materie prime senza prezzo`)
  })

  it('le tessere «Stima di mercato» e «Prezzo tuo» non ci sono più', async () => {
    const v = monta(conStime)
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('materie prime'))
    expect(v.container.textContent).not.toContain('Stima di mercato')
    expect(v.container.textContent).not.toContain('Prezzo tuo')
  })

  it('restano due tessere e non quattro', async () => {
    const v = monta(conStime)
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('senza prezzo'))
    expect(v.container.querySelectorAll('.fos-kpi-tile')).toHaveLength(2)
  })
})

describe('una riga «stima» non mostra il prezzo di mercato come se fosse il tuo', () => {
  it('una materia prima a prezzo di mercato mostra solo «—»', () => {
    // 19/09/2026, il titolare: «togli questa scritta mercato, non serve, molti
    // utenti hanno accordi loro con i fornitori».
    //
    // Sotto il trattino compariva «mercato 1,80 €/kg», cioè il prezzo medio di
    // un listino scritto a mano nel codice. Dal 18/09 quel numero non fa più il
    // conto del food cost, quindi non serviva — e faceva peggio che niente: chi
    // ha un accordo col fornitore lo legge come il prezzo che dovrebbe pagare,
    // e con la sua azienda non c'entra.
    const v = monta(conStime)
    const stimata = materiePrimeDaRicettario(conStime).find(r => r.statoPrezzo === 'stima')
    expect(stimata, 'il dato di prova non ha piu una materia prima a stima').toBeTruthy()
    // Il trattino resta — dice la cosa vera, che il prezzo non lo sappiamo —
    // ma il numero del listino medio non si mostra piu.
    expect(v.container.textContent).toContain('—')
    expect(v.container.textContent).not.toMatch(/mercato\s*\d/i)
  })

  it('un prezzo tuo resta un numero e basta', async () => {
    const v = monta({
      ricette: { r1: { nome: 'TORTA', ingredienti: [{ nome: 'burro', qty1stampo: 100 }] } },
      ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
    const cella = v.getByTitle('Clicca per modificare')
    expect(cella.textContent).toBe('8,40 €/kg')
    expect(cella.textContent).not.toMatch(/mercato/)
  })
})

describe('la riga rossa sta su una riga sola dal computer', () => {
  // In un test non c'è impaginazione, quindi «una riga sola» non si può
  // misurare in pixel. Si misurano le due cose che la determinano: quanto è
  // lungo il testo, e se gli è permesso andare a capo.
  // Il riquadro più interno che contiene la frase: partendo dall'alto si
  // prenderebbe l'intera pagina, che contiene tutto.
  const avviso = (v) => [...v.container.querySelectorAll('div')]
    .filter(d => /materie prime senza prezzo|materia prima senza prezzo/.test(d.textContent) && d.querySelector('strong'))
    .sort((a, b) => a.textContent.length - b.textContent.length)[0]

  it('il testo sta in meno di cento caratteri', async () => {
    const v = monta(conStime)
    await waitFor(() => expect(v.container.textContent).toMatch(/senza prezzo/))
    const testo = avviso(v).textContent.trim()
    // Il vecchio ne aveva 190 e prendeva tre righe. Cento è la larghezza che
    // entra comoda anche con la barra laterale aperta su un portatile.
    expect(testo.length, `avviso troppo lungo per una riga: «${testo}»`).toBeLessThanOrEqual(100)
  })

  it('dice ancora tutte e due le cose: quante sono e che il food cost è più basso', async () => {
    const v = monta(conStime)
    await waitFor(() => expect(v.container.textContent).toMatch(/senza prezzo/))
    const testo = avviso(v).textContent
    expect(testo).toMatch(/\d+ materie prime senza prezzo/)
    expect(testo).toMatch(/food cost.*più basso del vero/)
  })

  it('dal computer non gli è permesso andare a capo', async () => {
    const v = monta(conStime)
    await waitFor(() => expect(v.container.textContent).toMatch(/senza prezzo/))
    const riga = avviso(v).querySelector('span[style*="nowrap"]')
    expect(riga, 'la riga può andare a capo anche sul computer').toBeTruthy()
  })

  it('con una sola materia prima parla al singolare', async () => {
    const v = monta({
      ricette: { r1: { nome: 'TORTA', ingredienti: [
        { nome: 'aceto balsamicp', qty1stampo: 10 },
        { nome: 'zucchero', qty1stampo: 50 },
      ] } },
      ingredienti_costi: { zucchero: { costoKg: 1.2, costoG: 0.0012 } },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('aceto balsamicp'))
    expect(v.container.textContent.toLowerCase()).toContain('una materia prima senza prezzo')
  })

  it('quando non manca niente la riga rossa sparisce', async () => {
    const v = monta({
      ricette: { r1: { nome: 'TORTA', ingredienti: [{ nome: 'zucchero', qty1stampo: 50 }] } },
      ingredienti_costi: { zucchero: { costoKg: 1.2, costoG: 0.0012 } },
    })
    await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('zucchero'))
    expect(v.container.textContent).not.toMatch(/senza prezzo.*food cost esce/)
  })
})
