// @vitest-environment happy-dom
//
// ── Quanto vale quello che si butta, e di che giorno è il prezzo ──────────
//
// «Sprechi e omaggi» (`src/components/SpreciOmaggi.jsx`) è la pagina che dice
// al titolare quanto prodotto se n'è andato senza incasso. Al 20/09/2026 non
// aveva nessun test: i tre file `layoutViste*.test.jsx` che sembravano
// coprirla sono l'attrezzo dell'audit di impaginazione, e dentro hanno un
// `it.skipIf` che di norma non parte.
//
// Guardando i dati veri (organizzazione «Mara dei Boschi», 68 ricette e 46
// modifiche di prezzo in archivio con la data di decorrenza) sono usciti
// quattro difetti, e tutti e quattro mentono nella stessa direzione: fanno
// sembrare la perdita più piccola di quella che è, o inesistente.
//
//   1. **Il prezzo era sempre quello di oggi.** Il costo si calcolava con
//      `calcolaFC`, cioè il listino di adesso, e il movimento nasceva con
//      l'ora di adesso: non c'era modo di dire «questo vassoio l'ho buttato
//      ieri sera». In gelateria l'invenduto si conta la mattina dopo e gli
//      ammanchi escono dall'inventario di fine mese — sono le due occasioni
//      in cui questa pagina si usa davvero. Misurato sul ricettario di Mara:
//      fra il 16 e il 20 settembre cambiano di costo 6 ricette su 68, e
//      LIMONE passa da 1,19 € a 0,56 € (−53%); andando a novembre cambiano
//      58 ricette su 68. Ora il giorno lo sceglie chi registra e il costo si
//      ricostruisce con `calcolaFCStorico` sui prezzi di QUEL giorno.
//
//   2. **Un costo che manca valeva zero.** `Number(m.fcTot) || …`: una
//      registrazione senza costo entrava nei totali come «zero euro», cioè
//      come se buttarla non fosse costato niente. E siccome le due
//      classifiche tengono solo le voci sopra zero, con tutte le righe senza
//      costo restavano vuote e la pagina mostrava la spunta verde «Nessuna
//      perdita registrata nel mese. Ottimo controllo» sopra un elenco pieno
//      di perdite. Ora un costo che non c'è si chiama così, si conta a parte
//      e in archivio si scrive `null`, non 0.
//
//   3. **Il giorno di un istante si ricavava con `ts.slice(0, 10)`**, che è
//      il giorno di Greenwich: chi registra alle 00:30 di Torino non vedeva
//      più la propria registrazione nella lista di oggi.
//
//   4. **Il campo «Mese» si può svuotare**, e da vuoto usciva
//      `{ da: '-01', a: '-NaN' }`: il filtro scartava tutto e tornava il
//      complimento sbagliato.
//
// Le prove montano la pagina vera con `render`, un archivio finto in memoria
// (le funzioni di `movimentiSpeciali` girano per davvero, quindi si prova
// anche il salva-prima-di-cambiare-lo-stato) e il food cost VERO di
// `lib/foodcost`, non una copia.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'
import {
  costoMovimento, istanteDelGiorno, normalizzaMovimento,
} from '../../src/components/SpreciOmaggi.jsx'
import { formatLocalDate, giornoDiTimestamp } from '../../src/lib/dateLocal'
import { ConfirmProvider } from '../../src/components/ConfirmModal.jsx'

// ── Il contorno finto ────────────────────────────────────────────────────

const stato = {
  archivio: {},        // data_key → valore
  salvataggiFalliti: false,
  scarichi: [],
  stock: [{ prodotto_nome: 'TORTA PROVA', giacenza: 5 }],
  tablet: false,
}

vi.mock('../../src/lib/storage', () => ({
  sload: async (chiave) => stato.archivio[chiave] ?? null,
  ssave: async (chiave, valore) => {
    if (stato.salvataggiFalliti) throw new Error('database non raggiungibile')
    stato.archivio[chiave] = valore
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1', email: 'riccardo@maradeiboschi.com' }, access_token: 't' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ruolo: 'titolare', email: 'riccardo@maradeiboschi.com' } }) }) }),
    }),
    rpc: async () => ({ data: null, error: null }),
  },
}))

vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => stato.stock,
  scartoPF: async (arg) => { stato.scarichi.push(arg) },
}))

vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => false,
  useIsTablet: () => stato.tablet,
}))

const { default: SpreciOmaggi } = await import('../../src/components/SpreciOmaggi.jsx')

const SK_MOV = 'pasticceria-movimenti-speciali-v1'
const SK_DISC = 'pasticceria-discrepanze-v1'
const SK_PREZZI = 'pasticceria-log-prezzi-v1'

// Una torta che costa 2 € di zucchero a stampo e rende 10 porzioni: 0,200 €
// il pezzo ai prezzi di oggi. Lo zucchero però il 18/09 è passato da 4 a 2
// €/kg, quindi prima di quel giorno la stessa porzione ne costava 0,400.
const RICETTARIO = {
  ricette: {
    'TORTA PROVA': {
      nome: 'TORTA PROVA', unita: 10, prezzo: 3, tipo: 'fetta', categoria: 'Torte',
      ingredienti: [{ nome: 'zucchero', qty1stampo: 1000 }],
    },
    'SENZA PORZIONI': {
      nome: 'SENZA PORZIONI', tipo: 'fetta', categoria: 'Torte',
      ingredienti: [{ nome: 'zucchero', qty1stampo: 500 }],
    },
  },
  ingredienti_costi: { zucchero: { costoKg: 2, costoG: 0.002 } },
}

const LOG_PREZZI = [
  { id: 'lp-1', data: '2026-09-18T09:00:00.000Z', ingrediente: 'zucchero', prezzoVecchio: 4, prezzoNuovo: 2, decorre_da: '2026-09-18' },
]

const AUTH_TITOLARE = { user: { id: 'u-1', email: 'riccardo@maradeiboschi.com' }, isDipendente: false }
const AUTH_DIPENDENTE = { user: { id: 'u-2', email: 'anita@maradeiboschi.com' }, isDipendente: true }

// L'orologio della prova: 20 settembre 2026, le dieci del mattino a Torino.
const ADESSO = new Date(2026, 8, 20, 10, 0, 0)

function movimento(campi = {}) {
  return {
    id: `mov-${Math.random().toString(36).slice(2, 8)}`,
    ts: '2026-09-15T12:00:00.000Z',
    tipo: 'spreco', causale: 'scarto', categoria: '', prodotto: 'TORTA PROVA',
    qta: 2, unita: 'pz', fcUnit: 0.2, fcTot: 0.4, valoreOmaggio: 0, note: '',
    autore_uid: 'u-1', autore_email: 'riccardo@maradeiboschi.com', autore_ruolo: 'titolare',
    ...campi,
  }
}

const notify = vi.fn()

async function apri(props = {}) {
  // Dentro il `ConfirmProvider`, come nell'applicazione vera.
  //
  // Senza, `useConfirm` restituisce il suo ripiego, che chiama
  // `window.confirm` — e in `happy-dom` quella funzione non esiste: il ripiego
  // finisce nel `catch`, risponde «no», e ogni eliminazione risulta annullata.
  // Il test vedrebbe il prodotto rifiutarsi di cancellare e darebbe la colpa
  // al prodotto, mentre è il banco di prova a essere montato a metà.
  const vista = render(
    <ConfirmProvider>
      <SpreciOmaggi
        orgId="org-mara" sedeId="sede-1" sedeAttiva={{ id: 'sede-1', nome: 'Corso Casale' }}
        ricettario={RICETTARIO} chiusure={[]} auth={AUTH_TITOLARE} notify={notify}
        {...props}
      />
    </ConfirmProvider>,
  )
  await waitFor(() => expect(document.body.textContent).not.toContain('Caricamento…'))
  return vista
}

/** Il campo che sta sotto un'etichetta (le label non sono legate con `for`). */
function campo(etichetta) {
  const l = Array.from(document.querySelectorAll('label'))
    .find(e => e.textContent.trim().toLowerCase().startsWith(etichetta.toLowerCase()))
  return l ? l.parentElement.querySelector('input, select') : null
}

/** Apre lo schema di registrazione e sceglie il prodotto. */
async function compila({ prodotto = 'TORTA PROVA', giorno = null, qta = '2', tipo = 'perdita' } = {}) {
  fireEvent.click(screen.getByText(tipo === 'perdita' ? 'Registra perdita' : 'Registra omaggio'))
  if (giorno) fireEvent.change(screen.getByLabelText(/Giorno in cui è successo/), { target: { value: giorno } })
  if (prodotto != null) fireEvent.change(campo('Cosa'), { target: { value: prodotto } })
  if (qta != null) fireEvent.change(campo('Quantità'), { target: { value: qta } })
}

const costoUnitario = () => screen.getByLabelText(/Costo unitario in euro/).value
const registra = () => screen.getByText(/Registra$|Salvo…/).closest('button')

beforeEach(() => {
  stato.archivio = {}
  stato.salvataggiFalliti = false
  stato.scarichi = []
  stato.tablet = false
  notify.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(ADESSO)
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

// ─────────────────────────────────────────────────────────────────────────
describe('il costo di un movimento: il numero, oppure «non lo so»', () => {
  it('legge il totale quando c’è', () => {
    expect(costoMovimento({ fcTot: 12.5 })).toBe(12.5)
  })

  it('moltiplica costo unitario per quantità quando il totale manca', () => {
    expect(costoMovimento({ fcUnit: 0.4, qta: 3 })).toBeCloseTo(1.2, 6)
  })

  it('il totale vince sul prodotto dei due fattori', () => {
    expect(costoMovimento({ fcTot: 9, fcUnit: 1, qta: 2 })).toBe(9)
  })

  it('senza costo risponde «non lo so», non zero', () => {
    expect(costoMovimento({ qta: 3, prodotto: 'TORTA PROVA' })).toBeNull()
  })

  it('zero euro non è una perdita: è una perdita non valorizzata', () => {
    expect(costoMovimento({ fcTot: 0, fcUnit: 0, qta: 4 })).toBeNull()
  })

  it('un costo unitario senza quantità non basta', () => {
    expect(costoMovimento({ fcUnit: 0.4, qta: 0 })).toBeNull()
  })

  it('il campo vuoto non diventa zero', () => {
    expect(costoMovimento({ fcTot: '', fcUnit: '', qta: '' })).toBeNull()
  })

  it('un numero illeggibile resta illeggibile', () => {
    expect(costoMovimento({ fcTot: 'due euro' })).toBeNull()
  })

  it('un costo negativo non è un costo', () => {
    expect(costoMovimento({ fcTot: -3 })).toBeNull()
  })

  it('regge null e undefined senza rompersi', () => {
    expect(costoMovimento(null)).toBeNull()
    expect(costoMovimento(undefined)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('l’istante da salvare per il giorno scelto', () => {
  it('per oggi salva l’ora vera, non mezzogiorno', () => {
    expect(istanteDelGiorno(formatLocalDate(ADESSO), ADESSO)).toBe(ADESSO.toISOString())
  })

  it('per un giorno passato salva mezzogiorno di QUEL giorno', () => {
    expect(giornoDiTimestamp(istanteDelGiorno('2026-09-12', ADESSO))).toBe('2026-09-12')
  })

  it('il primo del mese non scivola nel mese prima', () => {
    expect(giornoDiTimestamp(istanteDelGiorno('2026-09-01', ADESSO))).toBe('2026-09-01')
  })

  it('il primo gennaio non scivola nell’anno prima', () => {
    expect(giornoDiTimestamp(istanteDelGiorno('2026-01-01', ADESSO))).toBe('2026-01-01')
  })

  it('il 29 febbraio di un anno bisestile resta il 29 febbraio', () => {
    expect(giornoDiTimestamp(istanteDelGiorno('2024-02-29', ADESSO))).toBe('2024-02-29')
  })

  it('l’ultimo giorno dell’anno non diventa capodanno', () => {
    expect(giornoDiTimestamp(istanteDelGiorno('2025-12-31', ADESSO))).toBe('2025-12-31')
  })

  it('senza giorno usa adesso', () => {
    expect(istanteDelGiorno('', ADESSO)).toBe(ADESSO.toISOString())
  })

  it('il giorno del cambio dell’ora legale resta quel giorno', () => {
    // La notte fra il 25 e il 26 ottobre 2026 l'Italia torna a +1.
    expect(giornoDiTimestamp(istanteDelGiorno('2026-10-25', ADESSO))).toBe('2026-10-25')
    expect(giornoDiTimestamp(istanteDelGiorno('2026-10-26', ADESSO))).toBe('2026-10-26')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('le registrazioni scritte dalla versione di prima si leggono lo stesso', () => {
  // In produzione sono 19 righe su 19, per 363,77 € di prodotto perso, e la
  // pagina le contava tutte come «date che non riesco a leggere».
  const vecchia = { id: 'demo-mov-0-1', qta: 3, data: '2026-06-18', nome: 'CROSTATA ALBICOCCA', tipo: 'spreco', valore: 15.6, causale: 'rotto', creatoAt: '2026-06-18T22:00:00.000Z' }

  it('ricava il giorno dal campo `data`', () => {
    expect(giornoDiTimestamp(normalizzaMovimento(vecchia).ts)).toBe('2026-06-18')
  })

  it('ricava il nome del prodotto dal campo `nome`', () => {
    expect(normalizzaMovimento(vecchia).prodotto).toBe('CROSTATA ALBICOCCA')
  })

  it('ricava il costo dal campo `valore`', () => {
    expect(costoMovimento(normalizzaMovimento(vecchia))).toBe(15.6)
  })

  it('traduce la causale «rotto» in «scarto»', () => {
    expect(normalizzaMovimento(vecchia).causale).toBe('scarto')
  })

  it('traduce «omaggio_cliente» in «regalo»', () => {
    expect(normalizzaMovimento({ ...vecchia, causale: 'omaggio_cliente' }).causale).toBe('regalo')
  })

  it('se manca `data` ripiega su `creatoAt`', () => {
    const { data, ...senzaData } = vecchia
    expect(data).toBeTruthy()
    expect(giornoDiTimestamp(normalizzaMovimento(senzaData).ts)).toBe('2026-06-19')
  })

  it('una registrazione di oggi non viene toccata', () => {
    const m = movimento()
    const n = normalizzaMovimento(m)
    expect(n.ts).toBe(m.ts)
    expect(n.prodotto).toBe('TORTA PROVA')
    expect(n.causale).toBe('scarto')
  })

  it('quello che davvero non si capisce resta senza data', () => {
    expect(normalizzaMovimento({ id: 'x', tipo: 'spreco' }).ts).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('il prezzo è quello del giorno dello spreco, non quello di oggi', () => {
  beforeEach(() => { stato.archivio[SK_PREZZI] = LOG_PREZZI })

  it('per una perdita di oggi propone il costo di oggi', async () => {
    await apri()
    await compila()
    expect(costoUnitario()).toBe('0.200')
  })

  it('per una perdita di una settimana fa propone il costo di allora', async () => {
    await apri()
    await compila({ giorno: '2026-09-10' })
    // Lo zucchero costava il doppio: 0,400 € la porzione invece di 0,200 €.
    expect(costoUnitario()).toBe('0.400')
  })

  it('cambiando il giorno dopo aver scelto il prodotto il costo si rifà', async () => {
    await apri()
    await compila()
    expect(costoUnitario()).toBe('0.200')
    fireEvent.change(screen.getByLabelText(/Giorno in cui è successo/), { target: { value: '2026-09-10' } })
    expect(costoUnitario()).toBe('0.400')
  })

  it('tornando a oggi il costo torna quello di oggi', async () => {
    await apri()
    await compila({ giorno: '2026-09-10' })
    fireEvent.change(screen.getByLabelText(/Giorno in cui è successo/), { target: { value: '2026-09-20' } })
    expect(costoUnitario()).toBe('0.200')
  })

  it('il giorno in cui il prezzo è cambiato usa già il prezzo nuovo', async () => {
    await apri()
    await compila({ giorno: '2026-09-18' })
    expect(costoUnitario()).toBe('0.200')
  })

  it('il giorno prima del cambio usa ancora il prezzo vecchio', async () => {
    await apri()
    await compila({ giorno: '2026-09-17' })
    expect(costoUnitario()).toBe('0.400')
  })

  it('dice a schermo con i prezzi di che giorno ha fatto il conto', async () => {
    await apri()
    await compila({ giorno: '2026-09-10' })
    expect(document.body.textContent).toContain('Costo ai prezzi del 10/09/2026')
  })

  it('per una perdita di oggi non dice niente di date', async () => {
    await apri()
    await compila()
    expect(document.body.textContent).not.toContain('Costo ai prezzi del')
  })

  it('senza storico dei prezzi ripiega sul listino di adesso invece di inventare', async () => {
    stato.archivio[SK_PREZZI] = []
    await apri()
    await compila({ giorno: '2026-09-10' })
    expect(costoUnitario()).toBe('0.200')
  })

  it('un costo scritto a mano non viene sovrascritto cambiando giorno', async () => {
    await apri()
    await compila()
    fireEvent.change(screen.getByLabelText(/Costo unitario in euro/), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText(/Giorno in cui è successo/), { target: { value: '2026-09-10' } })
    expect(costoUnitario()).toBe('1.5')
  })

  it('il giorno salvato è quello scelto, non quello di oggi', async () => {
    await apri()
    await compila({ giorno: '2026-09-10' })
    fireEvent.click(registra())
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(giornoDiTimestamp(stato.archivio[SK_MOV][0].ts)).toBe('2026-09-10')
  })

  it('il costo salvato è quello dei prezzi di quel giorno', async () => {
    await apri()
    await compila({ giorno: '2026-09-10' })
    fireEvent.click(registra())
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(stato.archivio[SK_MOV][0].fcUnit).toBeCloseTo(0.4, 6)
    expect(stato.archivio[SK_MOV][0].fcTot).toBeCloseTo(0.8, 6)
  })

  it('il campo del giorno non finisce in archivio: resta roba dello schema', async () => {
    await apri()
    await compila({ giorno: '2026-09-10' })
    fireEvent.click(registra())
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(stato.archivio[SK_MOV][0]).not.toHaveProperty('giorno')
  })

  it('non si può registrare una perdita di domani', async () => {
    await apri()
    await compila({ giorno: '2026-09-25' })
    fireEvent.click(registra())
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Il giorno non può essere nel futuro', false))
    expect(stato.archivio[SK_MOV]).toBeUndefined()
  })

  it('il calendario stesso non lascia scegliere oltre oggi', async () => {
    await apri()
    fireEvent.click(screen.getByText('Registra perdita'))
    expect(screen.getByLabelText(/Giorno in cui è successo/).getAttribute('max')).toBe('2026-09-20')
  })

  it('senza porzioni dichiarate non propone nessun costo, e spiega perché', async () => {
    await apri()
    await compila({ prodotto: 'SENZA PORZIONI' })
    expect(costoUnitario()).toBe('')
    expect(document.body.textContent).toContain('non hai indicato quante porzioni')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('un costo che manca non è zero euro', () => {
  const senzaCosto = [
    movimento({ id: 'm1', ts: '2026-09-05T12:00:00.000Z', fcUnit: 0, fcTot: 0 }),
    movimento({ id: 'm2', ts: '2026-09-06T12:00:00.000Z', fcUnit: null, fcTot: null }),
    movimento({ id: 'm3', ts: '2026-09-07T12:00:00.000Z', prodotto: 'BABÀ', fcUnit: '', fcTot: '' }),
  ]

  it('non si prende il complimento quando le registrazioni ci sono ma non sono valorizzate', async () => {
    stato.archivio[SK_MOV] = senzaCosto
    await apri()
    expect(document.body.textContent).not.toContain('Ottimo controllo')
  })

  it('dice quante registrazioni non hanno un costo', async () => {
    stato.archivio[SK_MOV] = senzaCosto
    await apri()
    expect(document.body.textContent).toContain('3 registrazioni nel mese, ma nessuna ha un costo')
  })

  it('lo dice anche nella tessera della perdita totale', async () => {
    stato.archivio[SK_MOV] = [...senzaCosto, movimento({ id: 'm4', ts: '2026-09-08T12:00:00.000Z', fcTot: 10 })]
    await apri()
    expect(document.body.textContent).toContain('3 registrazioni senza costo, non contate')
  })

  it('al singolare scrive al singolare', async () => {
    stato.archivio[SK_MOV] = [senzaCosto[0], movimento({ id: 'm9', ts: '2026-09-08T12:00:00.000Z', fcTot: 10 })]
    await apri()
    expect(document.body.textContent).toContain('1 registrazione senza costo, non contata')
  })

  it('la classifica dei prodotti non dice «nessun prodotto» quando il problema è il costo', async () => {
    stato.archivio[SK_MOV] = senzaCosto
    await apri()
    expect(document.body.textContent).toContain('non hanno un costo')
    expect(document.body.textContent).not.toContain('Nessun prodotto con perdite nel mese')
  })

  it('nell’elenco scrive «non valorizzato», non «0,00 €»', async () => {
    stato.archivio[SK_MOV] = senzaCosto
    await apri()
    expect(document.body.textContent).toContain('non valorizzato')
    expect(document.body.textContent).not.toContain('0,00 €')
  })

  it('il totale del mese somma solo quello che sa', async () => {
    stato.archivio[SK_MOV] = [
      ...senzaCosto,
      movimento({ id: 'm5', ts: '2026-09-09T12:00:00.000Z', fcTot: 12.4 }),
      movimento({ id: 'm6', ts: '2026-09-10T12:00:00.000Z', fcTot: 7.6 }),
    ]
    await apri()
    expect(document.body.textContent).toContain('20 €')
  })

  it('con niente in archivio il complimento è meritato', async () => {
    stato.archivio[SK_MOV] = []
    await apri()
    expect(document.body.textContent).toContain('Nessuna perdita registrata nel mese. Ottimo controllo.')
  })

  it('una registrazione senza costo si salva lo stesso, ma l’avviso lo dice', async () => {
    await apri()
    await compila({ prodotto: 'SENZA PORZIONI' })
    fireEvent.click(registra())
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('senza costo'))
  })

  it('in archivio il costo mancante è vuoto, non zero', async () => {
    await apri()
    await compila({ prodotto: 'SENZA PORZIONI' })
    fireEvent.click(registra())
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(stato.archivio[SK_MOV][0].fcUnit).toBeNull()
    expect(stato.archivio[SK_MOV][0].fcTot).toBeNull()
  })

  it('nel riepilogo dello schema il totale senza costo si chiama «da indicare»', async () => {
    await apri()
    await compila({ prodotto: 'SENZA PORZIONI' })
    expect(document.body.textContent).toContain('da indicare')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('il mese e i suoi confini', () => {
  it('il movimento del primo giorno del mese è dentro il mese', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'p', ts: '2026-09-01T09:00:00.000Z', fcTot: 5 })]
    await apri()
    expect(document.body.textContent).toContain('5 €')
  })

  it('il movimento dell’ultimo giorno del mese è dentro il mese', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'u', ts: '2026-09-30T20:00:00.000Z', fcTot: 5 })]
    await apri()
    expect(document.body.textContent).toContain('5 €')
  })

  it('il movimento del mese prima resta fuori', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'v', ts: '2026-08-31T20:00:00.000Z', fcTot: 5 })]
    await apri()
    expect(document.body.textContent).toContain('Nessuna perdita registrata nel mese')
  })

  it('cambiando mese si vedono i movimenti di quel mese', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'ag', ts: '2026-08-12T12:00:00.000Z', fcTot: 33 })]
    await apri()
    fireEvent.change(campo('Mese'), { target: { value: '2026-08' } })
    await waitFor(() => expect(document.body.textContent).toContain('33 €'))
  })

  it('febbraio finisce il 28, e il 28 si vede', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'f', ts: '2026-02-28T12:00:00.000Z', fcTot: 8 })]
    await apri()
    fireEvent.change(campo('Mese'), { target: { value: '2026-02' } })
    await waitFor(() => expect(document.body.textContent).toContain('8 €'))
  })

  it('il 29 febbraio di un anno bisestile si vede', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'b', ts: '2024-02-29T12:00:00.000Z', fcTot: 9 })]
    await apri()
    fireEvent.change(campo('Mese'), { target: { value: '2024-02' } })
    await waitFor(() => expect(document.body.textContent).toContain('9 €'))
  })

  it('il 31 dicembre si vede a dicembre, non a gennaio', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'd', ts: '2025-12-31T18:00:00.000Z', fcTot: 14 })]
    await apri()
    fireEvent.change(campo('Mese'), { target: { value: '2025-12' } })
    await waitFor(() => expect(document.body.textContent).toContain('14 €'))
  })

  it('svuotando il campo del mese la pagina non fa sparire tutto', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 's', ts: '2026-09-15T12:00:00.000Z', fcTot: 21 })]
    await apri()
    fireEvent.change(campo('Mese'), { target: { value: '' } })
    await waitFor(() => expect(document.body.textContent).toContain('21 €'))
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('registrare: una volta sola, e solo se il salvataggio riesce', () => {
  it('due clic di fila registrano una perdita sola', async () => {
    await apri()
    await compila()
    const bottone = registra()
    fireEvent.click(bottone)
    fireEvent.click(bottone)
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(stato.archivio[SK_MOV]).toHaveLength(1)
  })

  it('durante il salvataggio il bottone è spento', async () => {
    await apri()
    await compila()
    fireEvent.click(registra())
    expect(registra().disabled).toBe(true)
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
  })

  it('finito il salvataggio lo schema si chiude', async () => {
    await apri()
    await compila()
    fireEvent.click(registra())
    await waitFor(() => expect(document.body.textContent).toContain('Registra perdita'))
  })

  it('se il database rifiuta, in elenco non compare niente', async () => {
    stato.salvataggiFalliti = true
    await apri()
    await compila()
    fireEvent.click(registra())
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Errore'), false))
    expect(stato.archivio[SK_MOV]).toBeUndefined()
    expect(document.body.textContent).toContain('Nessuna perdita registrata nel mese')
  })

  it('dopo un salvataggio fallito si può riprovare (il bottone torna acceso)', async () => {
    stato.salvataggiFalliti = true
    await apri()
    await compila()
    fireEvent.click(registra())
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Errore'), false))
    await waitFor(() => expect(registra().disabled).toBe(false))
  })

  it('senza prodotto né categoria non registra niente', async () => {
    await apri()
    fireEvent.click(screen.getByText('Registra perdita'))
    fireEvent.change(campo('Quantità'), { target: { value: '2' } })
    fireEvent.click(registra())
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Specifica almeno il prodotto o la categoria', false))
    expect(stato.archivio[SK_MOV]).toBeUndefined()
  })

  it('senza quantità non registra niente', async () => {
    await apri()
    await compila({ qta: '0' })
    fireEvent.click(registra())
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Quantita non valida', false))
    expect(stato.archivio[SK_MOV]).toBeUndefined()
  })

  it('la perdita registrata scarica la vetrina del prodotto giusto', async () => {
    await apri()
    await compila()
    fireEvent.click(registra())
    await waitFor(() => expect(stato.scarichi).toHaveLength(1))
    expect(stato.scarichi[0]).toMatchObject({ prodotto: 'TORTA PROVA', quantita: 2 })
  })

  it('un prodotto che non è in vetrina non crea giacenze negative, e lo dice', async () => {
    stato.stock = []
    await apri()
    await compila()
    fireEvent.click(registra())
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('non è in vetrina'), true))
    expect(stato.scarichi).toHaveLength(0)
    stato.stock = [{ prodotto_nome: 'TORTA PROVA', giacenza: 5 }]
  })

  it('nessuna finestra del browser durante la registrazione', async () => {
    // `happy-dom` non implementa `confirm` e `alert`: non esistono proprio, e
    // `vi.spyOn` su una cosa che non c'è fallisce con «can only spy on a
    // function». Quindi si definiscono, invece di spiarle — e se il prodotto
    // le chiamasse, qui si vedrebbe.
    const finestra = vi.fn(() => true)
    const avviso = vi.fn()
    window.confirm = finestra
    window.alert = avviso
    await apri()
    await compila()
    fireEvent.click(registra())
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
    expect(finestra).not.toHaveBeenCalled()
    expect(avviso).not.toHaveBeenCalled()
    delete window.confirm
    delete window.alert
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('la giornata del dipendente', () => {
  it('una registrazione fatta a notte fonda resta nella lista di oggi', async () => {
    // Le 00:30 di Torino sono ancora ieri a Greenwich: tagliando l'istante coi
    // primi dieci caratteri, la riga spariva dalla lista di chi l'ha scritta.
    const mezzanotteEMezza = new Date(2026, 8, 20, 0, 30, 0)
    stato.archivio[SK_MOV] = [movimento({ id: 'notte', ts: mezzanotteEMezza.toISOString(), autore_uid: 'u-2', prodotto: 'BRIOCHE NOTTE' })]
    await apri({ auth: AUTH_DIPENDENTE })
    expect(document.body.textContent).toContain('BRIOCHE NOTTE')
  })

  it('la registrazione di ieri non compare nella lista di oggi', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'ieri', ts: new Date(2026, 8, 19, 18, 0, 0).toISOString(), autore_uid: 'u-2', prodotto: 'BRIOCHE IERI' })]
    await apri({ auth: AUTH_DIPENDENTE })
    expect(document.body.textContent).not.toContain('BRIOCHE IERI')
  })

  it('quella di un altro dipendente non compare', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'altro', ts: ADESSO.toISOString(), autore_uid: 'u-9', prodotto: 'NON MIA' })]
    await apri({ auth: AUTH_DIPENDENTE })
    expect(document.body.textContent).not.toContain('NON MIA')
  })

  it('il dipendente non vede i totali dell’azienda', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'x', fcTot: 99 })]
    await apri({ auth: AUTH_DIPENDENTE })
    expect(document.body.textContent).not.toContain('Perdita totale del mese')
    expect(document.body.textContent).not.toContain('Incidenza sul food cost')
  })

  it('il dipendente può registrare: lo schema c’è', async () => {
    await apri({ auth: AUTH_DIPENDENTE })
    expect(screen.getByText('Registra perdita')).toBeTruthy()
  })

  it('e anche lui sceglie il giorno', async () => {
    await apri({ auth: AUTH_DIPENDENTE })
    fireEvent.click(screen.getByText('Registra perdita'))
    expect(screen.getByLabelText(/Giorno in cui è successo/)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('eliminare chiede conferma, e non con la finestra del browser', () => {
  it('la conferma passa da useConfirm, non da window.confirm', async () => {
    // `happy-dom` non ha `confirm`: si definisce invece di spiarla.
    const finestra = vi.fn(() => true)
    window.confirm = finestra
    stato.archivio[SK_MOV] = [movimento({ id: 'da-togliere', fcTot: 4 })]
    await apri()
    fireEvent.click(screen.getAllByTitle('Elimina')[0])
    await waitFor(() => expect(document.body.textContent).toContain('Eliminare la perdita?'))
    expect(finestra).not.toHaveBeenCalled()
    delete window.confirm
  })

  it('annullando la conferma la riga resta dov’è', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'resta', fcTot: 4 })]
    await apri()
    fireEvent.click(screen.getAllByTitle('Elimina')[0])
    await waitFor(() => expect(screen.getByText('Annulla')).toBeTruthy())
    fireEvent.click(screen.getByText('Annulla'))
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(1))
  })

  it('confermando la riga sparisce dall’archivio', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'via', fcTot: 4 })]
    await apri()
    fireEvent.click(screen.getAllByTitle('Elimina')[0])
    // «Elimina» compare più volte: sul cestino di ogni riga e dentro il
    // riquadro di conferma. Si prende quello del riquadro, per nome.
    const riquadro = await waitFor(() => {
      const d = document.querySelector('[role="dialog"]')
      expect(d, 'il riquadro di conferma non si è aperto').toBeTruthy()
      return d
    })
    const conferma = [...riquadro.querySelectorAll('button')]
      .find(b => (b.textContent || '').trim() === 'Elimina')
    expect(conferma, 'nel riquadro manca il pulsante Elimina').toBeTruthy()
    fireEvent.click(conferma)
    await waitFor(() => expect(stato.archivio[SK_MOV]).toHaveLength(0))
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('sul tablet si tocca col dito', () => {
  it('i filtri sono alti abbastanza da centrarli', async () => {
    stato.tablet = true
    await apri()
    const tipo = campo('Tipo')
    expect(tipo.style.minHeight).toBe('44px')
  })

  it('i filtri non fanno ingrandire la pagina su iOS (testo da 16px)', async () => {
    stato.tablet = true
    await apri()
    expect(campo('Tipo').style.fontSize).toBe('16px')
  })

  it('sul computer i filtri restano compatti', async () => {
    stato.tablet = false
    await apri()
    expect(campo('Tipo').style.minHeight).toBe('34px')
  })

  it('i bottoni delle causali sono bersagli da 44 sul tablet', async () => {
    stato.tablet = true
    await apri()
    fireEvent.click(screen.getByText('Registra perdita'))
    // «Scaduto» compare sia fra i bottoni delle causali sia nell'elenco
    // delle righe già registrate: qui serve il bottone.
    const scaduto = screen.getAllByText('Scaduto')
      .map(n => n.closest('button')).find(Boolean)
    expect(scaduto.style.minHeight).toBe('44px')
  })

  it('il bottone Registra è un bersaglio da 44 sul tablet', async () => {
    stato.tablet = true
    await apri()
    fireEvent.click(screen.getByText('Registra perdita'))
    expect(registra().style.minHeight).toBe('44px')
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe('i numeri e le parole della pagina', () => {
  it('gli importi hanno il simbolo dopo la cifra', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'n', fcTot: 1234.5 })]
    await apri()
    expect(document.body.textContent).toMatch(/1\.2\d\d\s€/)
    expect(document.body.textContent).not.toContain('€ 1.234')
  })

  it('il migliaio si scrive col punto', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'k', fcTot: 2500 })]
    await apri()
    expect(document.body.textContent).toContain('2.500 €')
  })

  it('le registrazioni storiche di «Discrepanze» si sommano al resto', async () => {
    stato.archivio[SK_DISC] = [{ id: 'd1', tipo: 'scarto', data: '2026-09-11', prodotto: 'CROSTATA', quantita: 2, costo_totale: 30 }]
    await apri()
    expect(document.body.textContent).toContain('30 €')
    expect(document.body.textContent).toContain('record storici')
  })

  it('il drift di porzionatura resta un avviso, non una perdita', async () => {
    stato.archivio[SK_DISC] = [{ id: 'd2', tipo: 'porzione_grande', data: '2026-09-11', prodotto: 'CROSTATA', quantita: 2, costo_totale: 30 }]
    await apri()
    expect(document.body.textContent).toContain('Drift di porzionatura')
    expect(document.body.textContent).toContain('Nessuna perdita registrata nel mese')
  })

  it('l’incidenza non si mostra senza chiusure di cassa', async () => {
    // Senza le chiusure il rapporto non si può fare: il riquadro mostra «—» e
    // dice come ottenerlo, invece di inventare una percentuale.
    stato.archivio[SK_MOV] = [movimento({ id: 'i', fcTot: 10 })]
    await apri()
    expect(document.body.textContent).toContain('registra le chiusure e il conto si fa da sé')
  })

  it('con le chiusure l’incidenza si calcola sul food cost vero', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'i2', fcTot: 10 })]
    await apri({ chiusure: [{ data: '2026-09-15', kpi: { totFC: 100, totV: 400 } }] })
    expect(document.body.textContent).toContain('su 1 giorno di cassa')
  })

  it('il banner della soglia usa i ricavi delle chiusure del mese scelto', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'i3', fcTot: 30 })]
    await apri({ chiusure: [{ data: '2026-09-15', kpi: { totFC: 100, totV: 400 } }] })
    // 30 su 400 è il 7,5%: sopra il 5%, quindi allarme.
    expect(document.body.textContent).toContain('Sprechi elevati')
  })

  it('i ricavi di un altro mese non entrano nel conto', async () => {
    stato.archivio[SK_MOV] = [movimento({ id: 'i4', fcTot: 30 })]
    await apri({ chiusure: [{ data: '2026-08-15', kpi: { totFC: 100, totV: 400 } }] })
    expect(document.body.textContent).not.toContain('Sprechi elevati')
  })
})
