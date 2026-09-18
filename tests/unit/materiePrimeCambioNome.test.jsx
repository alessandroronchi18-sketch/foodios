// @vitest-environment happy-dom
//
// Cambiare il NOME di una materia prima, senza che le ricette perdano il costo.
//
// ═══ Il difetto, e perché esiste questo file ════════════════════════════
//
// Richiesta del titolare, 18/09/2026: «modificando una materia prima si deve
// poter cambiare anche il nome — uno lo salva sbagliato». Fino a quel giorno
// non si poteva: chi aveva battuto «aceto balsamicp» se lo teneva per sempre,
// oppure ne creava una seconda scritta giusta e restava con due voci per la
// stessa cosa.
//
// Ma il guaio vero non è non poterlo cambiare: è cambiarlo a metà. **Il nome
// è la chiave con cui il food cost trova il prezzo** — sotto non c'è nessun
// codice. `calcolaFC` prende il nome scritto dentro la ricetta, lo normalizza
// con `normIng` e lo cerca in `ingredienti_costi`. Se il listino dice «panna
// fresca» e la ricetta dice ancora «panna frescs»:
//
//   - la ricetta NON dà errore;
//   - conta quell'ingrediente zero;
//   - il food cost esce più basso del vero, e il margine migliore del vero.
//
// In silenzio. È la famiglia di difetti che questo prodotto insegue da mesi
// (94 materie prime su 99 senza prezzo, food cost medio al 4,8% invece del
// 25-35% vero), e un cambio di nome fatto male la ricrea da capo in un
// secondo.
//
// Lo stesso nome sta scritto in quattro archivi e vanno riscritti tutti:
// il listino, ogni ricetta che lo usa, lo storico dei prezzi (da cui esce il
// food cost delle produzioni già chiuse) e la resa.
//
// ═══ Cosa prova questo file ═════════════════════════════════════════════
//
// Non che il codice contenga certe parole: che dopo il cambio di nome
// **`calcolaFC` restituisca lo stesso costo di prima**. È l'unica domanda che
// interessa a chi usa il programma, ed è quella che un controllo sul sorgente
// non sa fare.

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

const {
  default: MateriePrimeView, applicaRinominaMateriaPrima, verificaRinominaMateriaPrima,
} = await import('../../src/views/MateriePrimeView.jsx')
const { calcolaFC, buildIngCosti, getPrezzoStoricoKg } = await import('../../src/lib/foodcost.js')

// Un ricettario piccolo ma con tutti i casi dentro: due ricette che usano
// «panna frescs» (il nome battuto storto), una che non la usa, e la voce di
// listino col suo prezzo.
const ricettarioBase = () => ({
  ricette: {
    r1: { nome: 'BAVARESE', tipo: 'torta', porzioni: 8, prezzo: 30, ingredienti: [
      { nome: 'panna frescs', qty1stampo: 500 },
      { nome: 'zucchero', qty1stampo: 100 },
    ] },
    r2: { nome: 'CHANTILLY', tipo: 'torta', porzioni: 8, prezzo: 25, ingredienti: [
      { nome: 'PANNA FRESCS', qty1stampo: 300 },
    ] },
    r3: { nome: 'FROLLA', tipo: 'torta', porzioni: 8, prezzo: 12, ingredienti: [
      { nome: 'zucchero', qty1stampo: 200 },
    ] },
  },
  ingredienti_costi: {
    'panna frescs': { costoKg: 6.4, costoG: 0.0064 },
    zucchero: { costoKg: 1.2, costoG: 0.0012 },
  },
})

const logBase = () => ([
  { id: 'lp1', data: '2026-05-01T10:00:00.000Z', decorre_da: '2026-05-01T00:00:00.000Z',
    ingrediente: 'panna frescs', prezzoVecchio: 5.9, prezzoNuovo: 6.4 },
  { id: 'lp2', data: '2026-05-02T10:00:00.000Z', decorre_da: '2026-05-02T00:00:00.000Z',
    ingrediente: 'zucchero', prezzoVecchio: 1.1, prezzoNuovo: 1.2 },
])

/** Il costo che il programma addebita a una ricetta, in euro. */
const costoDi = (ric, nomeRicetta) => {
  const ingCosti = buildIngCosti(ric.ingredienti_costi)
  return calcolaFC(ric.ricette[nomeRicetta], ingCosti, ric)
}

beforeEach(() => { cleanup() })

describe('il cambio di nome non fa perdere il costo alle ricette', () => {
  it('dopo il cambio, la ricetta costa ESATTAMENTE come prima', () => {
    // È la prova che conta. Tutto il resto di questo file descrive il come;
    // questo dice se il risultato è giusto.
    const prima = ricettarioBase()
    const costoPrima = costoDi(prima, 'r1')
    expect(costoPrima.tot).toBeGreaterThan(0)
    expect(costoPrima.mancanti).toEqual([])

    const esito = applicaRinominaMateriaPrima(
      { ricettario: prima, logPrezzi: logBase(), rese: {} }, 'panna frescs', 'panna fresca')
    expect(esito.ok).toBe(true)

    const costoDopo = costoDi(esito.ricettario, 'r1')
    expect(costoDopo.tot).toBe(costoPrima.tot)
    // E soprattutto: nessun ingrediente è diventato «senza prezzo». È lì che
    // il costo scende in silenzio.
    expect(costoDopo.mancanti).toEqual([])
  })

  it('vale per TUTTE le ricette che la usano, non solo per la prima', () => {
    const prima = ricettarioBase()
    const costoPrima = costoDi(prima, 'r2')
    const esito = applicaRinominaMateriaPrima(
      { ricettario: prima, logPrezzi: [], rese: {} }, 'panna frescs', 'panna fresca')
    const costoDopo = costoDi(esito.ricettario, 'r2')
    expect(costoDopo.tot).toBe(costoPrima.tot)
    expect(costoDopo.mancanti).toEqual([])
  })

  it('il nome nuovo è scritto davvero dentro le ricette', () => {
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }, 'panna frescs', 'panna fresca')
    expect(esito.ricettario.ricette.r1.ingredienti[0].nome).toBe('panna fresca')
    expect(esito.ricettario.ricette.r2.ingredienti[0].nome).toBe('panna fresca')
  })

  it('la voce del listino trasloca col suo prezzo, e la vecchia sparisce', () => {
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }, 'panna frescs', 'panna fresca')
    expect(esito.ricettario.ingredienti_costi['panna fresca']).toEqual({ costoKg: 6.4, costoG: 0.0064 })
    expect('panna frescs' in esito.ricettario.ingredienti_costi).toBe(false)
  })

  it('conta le ricette toccate, e conta solo quelle', () => {
    // Il numero finisce nel messaggio all'utente: è l'unico modo che ha di
    // capire quanto pesava quel nome. Se contasse anche le ricette che non
    // la usano, direbbe una cosa falsa su un'operazione delicata.
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }, 'panna frescs', 'panna fresca')
    expect(esito.ricetteAggiornate).toBe(2)
  })

  it('le ricette che non la usano non vengono nemmeno ricopiate', () => {
    const prima = ricettarioBase()
    const esito = applicaRinominaMateriaPrima(
      { ricettario: prima, logPrezzi: [], rese: {} }, 'panna frescs', 'panna fresca')
    // Stesso oggetto, non una copia: se una ricetta estranea venisse
    // riscritta, un difetto in questa funzione potrebbe raggiungere ricette
    // che non c'entrano niente.
    expect(esito.ricettario.ricette.r3).toBe(prima.ricette.r3)
  })
})

describe('gli archivi che si dimenticano sempre', () => {
  it('lo storico dei prezzi segue il nome, o il food cost di ieri lo perde', () => {
    // `getPrezzoStoricoKg` filtra lo storico per nome dell'ingrediente: è da
    // lì che esce il food cost di una produzione già chiusa. Se lo storico
    // restasse sotto il nome vecchio, il P&L del mese scorso perderebbe quel
    // prezzo e non lo direbbe a nessuno.
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: logBase(), rese: {} }, 'panna frescs', 'panna fresca')
    expect(getPrezzoStoricoKg(esito.logPrezzi, 'panna fresca', '2026-05-01T12:00:00.000Z')).toBe(6.4)
    // e la riga di un altro ingrediente non è stata toccata
    expect(getPrezzoStoricoKg(esito.logPrezzi, 'zucchero', '2026-05-02T12:00:00.000Z')).toBe(1.2)
  })

  it('la resa segue il nome: una resa persa cambia il costo di tutte le ricette', () => {
    // Una resa dell'85% che torna al 100% abbassa il costo per grammo usabile
    // del 15%. Nessuno l'ha chiesto, e non lo dice nessuno.
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: { 'panna frescs': 0.85, zucchero: 0.98 } },
      'panna frescs', 'panna fresca')
    expect(esito.rese['panna fresca']).toBe(0.85)
    expect('panna frescs' in esito.rese).toBe(false)
    expect(esito.rese.zucchero).toBe(0.98)
  })

  it('se una resa non c’è, non se ne inventa una', () => {
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: { zucchero: 0.98 } }, 'panna frescs', 'panna fresca')
    // `null` vuol dire «l'archivio delle rese non va nemmeno riscritto».
    expect(esito.rese).toBe(null)
  })
})

describe('quello che il cambio di nome deve RIFIUTARE', () => {
  it('un nome già preso non si unisce: si rifiuta e si spiega', () => {
    const prima = ricettarioBase()
    const esito = applicaRinominaMateriaPrima(
      { ricettario: prima, logPrezzi: [], rese: {} }, 'panna frescs', 'zucchero')
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/c’è già/)
    // E il ricettario non è stato toccato nemmeno un po'.
    expect(prima.ingredienti_costi['panna frescs']).toBeTruthy()
  })

  it('è preso anche il nome di una materia prima che non usa nessuno', () => {
    // «cacao» ha un prezzo nel listino ma nessuna ricetta lo scrive. Il
    // controllo che guarda dentro le ricette non lo vedrebbe, e senza un
    // controllo suo sul listino la rinomina ci passerebbe sopra buttando
    // via uno dei due prezzi.
    //
    // Questo test è nato da un buco nei test stessi, il 18/09/2026:
    // rimettendo il codice vecchio (controllo sul listino spento) restavano
    // tutti verdi, perché il caso di prova usava «zucchero» — che sta anche
    // dentro due ricette, quindi lo fermava l'altro controllo.
    const ric = ricettarioBase()
    ric.ingredienti_costi.cacao = { costoKg: 12, costoG: 0.012 }
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ric, logPrezzi: [], rese: {} }, 'panna frescs', 'cacao')
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/fra le materie prime/)
    expect(ric.ingredienti_costi.cacao).toEqual({ costoKg: 12, costoG: 0.012 })
  })

  it('il nome di una ricetta non si può rubare', () => {
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }, 'panna frescs', 'FROLLA')
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/ricetta o di un semilavorato/)
  })

  it('un nome usato da una ricetta ma senza voce di listino è comunque preso', () => {
    // «sale» esiste solo perché lo scrive una ricetta: non ha una riga nel
    // listino, ma è a tutti gli effetti una materia prima. Rinominare sopra
    // di lui fonderebbe due cose diverse.
    const ric = ricettarioBase()
    ric.ricette.r3.ingredienti.push({ nome: 'sale', qty1stampo: 5 })
    const esito = applicaRinominaMateriaPrima({ ricettario: ric, logPrezzi: [], rese: {} }, 'panna frescs', 'sale')
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/FROLLA/)
  })

  it('il nome vuoto, quello di una parola sola sbagliata e quello identico', () => {
    const a = { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }
    expect(applicaRinominaMateriaPrima(a, 'panna frescs', '   ').ok).toBe(false)
    expect(applicaRinominaMateriaPrima(a, 'panna frescs', 'n/d').ok).toBe(false)
    expect(applicaRinominaMateriaPrima(a, 'panna frescs', 'panna frescs').ok).toBe(false)
  })

  it('senza ricettario non esplode e lo dice', () => {
    const esito = applicaRinominaMateriaPrima({ ricettario: null, logPrezzi: [], rese: {} }, 'a', 'b')
    expect(esito.ok).toBe(false)
    expect(esito.errore).toMatch(/ricettario/i)
  })
})

describe('correggere solo le maiuscole è un cambio legittimo', () => {
  it('«panna frescs» → «Panna Frescs» passa e riscrive le ricette', () => {
    // `normIng` dà la stessa chiave, quindi non c'è nessun doppione: è solo
    // il nome come si legge. Rifiutarlo vorrebbe dire che una materia prima
    // scritta tutta in minuscolo resta così per sempre.
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }, 'panna frescs', 'Panna Frescs')
    expect(esito.ok).toBe(true)
    expect(esito.ricetteAggiornate).toBe(2)
    expect(esito.ricettario.ricette.r1.ingredienti[0].nome).toBe('Panna Frescs')
    // Il costo non si muove: è la stessa materia prima.
    expect(costoDi(esito.ricettario, 'r1').tot).toBe(costoDi(ricettarioBase(), 'r1').tot)
  })

  it('gli spazi doppi in mezzo al nome si chiudono', () => {
    const esito = applicaRinominaMateriaPrima(
      { ricettario: ricettarioBase(), logPrezzi: [], rese: {} }, 'panna frescs', 'panna   fresca')
    expect(esito.ok).toBe(true)
    expect(esito.nome).toBe('panna fresca')
  })

  it('il controllo del modulo non scambia una materia prima per il doppione di sé stessa', () => {
    // `chiaviGiaUsate` contiene anche la chiave di chi si sta rinominando.
    const chiavi = new Set(['panna frescs', 'zucchero'])
    const riga = { key: 'panna frescs', nome: 'panna frescs' }
    expect(verificaRinominaMateriaPrima('Panna Frescs', riga, chiavi).ok).toBe(true)
    expect(verificaRinominaMateriaPrima('zucchero', riga, chiavi).ok).toBe(false)
  })
})

// ─── La finestra ────────────────────────────────────────────────────────────

const ricettarioView = {
  ricette: {
    r1: { nome: 'BAVARESE', ingredienti: [{ nome: 'panna frescs', qty1stampo: 500 }] },
    r2: { nome: 'CHANTILLY', ingredienti: [{ nome: 'panna frescs', qty1stampo: 300 }] },
  },
  ingredienti_costi: { 'panna frescs': { costoKg: 6.4, costoG: 0.0064 } },
}

const apriFinestra = async (props = {}) => {
  const v = render(<MateriePrimeView
    ricettario={ricettarioView} logPrezzi={[]}
    onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })}
    onRinominaMateriaPrima={async () => ({ ok: true, ricetteAggiornate: 2 })}
    onEliminaMateriaPrima={async () => ({ ok: true })}
    {...props} />)
  await waitFor(() => expect(v.container.textContent).toContain('panna frescs'))
  const apri = [...v.container.querySelectorAll('button')]
    .find(b => /Cambia il nome di panna frescs/.test(b.getAttribute('aria-label') || ''))
  expect(apri, 'manca il comando per cambiare il nome').toBeTruthy()
  fireEvent.click(apri)
  await waitFor(() => expect(v.getByLabelText('Come si deve chiamare')).toBeTruthy())
  return v
}

describe('la finestra del cambio nome', () => {
  it('dice quante ricette verranno riscritte prima di toccarle', async () => {
    const v = await apriFinestra()
    const finestra = v.container.querySelector('[role="dialog"]')
    expect(finestra.textContent).toMatch(/2 ricette/)
  })

  it('parte dal nome di adesso, così si corregge invece di riscriverlo', async () => {
    const v = await apriFinestra()
    expect(v.getByLabelText('Come si deve chiamare').value).toBe('panna frescs')
  })

  it('manda a chi salva il nome vecchio e quello nuovo, in quest’ordine', async () => {
    const chiamate = []
    const v = await apriFinestra({
      onRinominaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true, ricetteAggiornate: 2 } },
    })
    fireEvent.change(v.getByLabelText('Come si deve chiamare'), { target: { value: 'panna fresca' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.includes('Cambia il nome') && !b.getAttribute('aria-label')))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0]).toEqual(['panna frescs', 'panna fresca'])
  })

  it('un doppione viene fermato PRIMA di arrivare a chi salva', async () => {
    const chiamate = []
    const v = await apriFinestra({
      ricettario: {
        ricette: { r1: { nome: 'BAVARESE', ingredienti: [{ nome: 'panna frescs', qty1stampo: 500 }] } },
        ingredienti_costi: { 'panna frescs': { costoKg: 6.4 }, zucchero: { costoKg: 1.2 } },
      },
      onRinominaMateriaPrima: async (...a) => { chiamate.push(a); return { ok: true } },
    })
    fireEvent.change(v.getByLabelText('Come si deve chiamare'), { target: { value: 'zucchero' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.includes('Cambia il nome') && !b.getAttribute('aria-label')))
    await waitFor(() => expect(v.container.textContent).toMatch(/c’è già/))
    expect(chiamate, 'la pagina ha chiesto di salvare un doppione').toHaveLength(0)
  })

  it('se il salvataggio fallisce la finestra NON si chiude, e lo dice', async () => {
    // Una finestra che si chiude dopo un errore racconta che è andata bene.
    const v = await apriFinestra({
      onRinominaMateriaPrima: async () => ({ ok: false, errore: 'La rete non risponde.' }),
    })
    fireEvent.change(v.getByLabelText('Come si deve chiamare'), { target: { value: 'panna fresca' } })
    fireEvent.click([...v.container.querySelectorAll('button')].find(b => b.textContent.includes('Cambia il nome') && !b.getAttribute('aria-label')))
    await waitFor(() => expect(v.container.textContent).toContain('La rete non risponde.'))
    expect(v.queryByLabelText('Come si deve chiamare'), 'la finestra si è chiusa su un errore').toBeTruthy()
  })
})
