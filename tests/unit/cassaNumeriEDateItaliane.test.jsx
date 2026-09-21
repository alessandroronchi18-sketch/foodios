// @vitest-environment happy-dom
//
// ── I numeri e le date della Cassa prevista, scritti in italiano ───────────
//
// Tre difetti della stessa pagina, trovati il 20/09/2026, tutti nel modo in
// cui un numero entra o esce da `src/views/CashflowView.jsx`.
//
// **1. Gli importi non avevano il simbolo.** La pagina si era scritta un
// `fmt0` suo:
//
//     function fmt0(n) {
//       return Number(n || 0).toLocaleString('it-IT', { … })
//     }
//
// cioè `toLocaleString` nudo, senza euro. In una schermata che parla solo di
// soldi il KPI diceva «-43.051» e basta: di cosa, pezzi? giorni? In
// `src/lib/formatIt.js` c'era già `fmt0`, che mette il simbolo DOPO la cifra
// come si scrive in Italia («1.477 €», non «€ 1.477»). Due regole per la
// stessa cosa, e quella locale era la sbagliata.
//
// **2. «1.250» valeva 1,25.** Il campo del saldo e quello dell'importo di un
// evento leggevano con `Number(testo)`. In italiano il punto sono le
// migliaia e la virgola i decimali: chi scrive nel campo «quanto hai in
// banca» il numero 12.500 salvava dodici euro e cinquanta. Fra le due
// letture ci sono tre ordini di grandezza, e il numero è il punto di
// partenza di tutta la previsione di cassa. I campi erano anche
// `type="number"`, che è il modo in cui il browser stesso rilegge il punto
// come separatore decimale prima ancora che il codice lo veda.
//
// **3. La data del giorno rosso passava da `new Date('2026-09-24')`.**
// Quella forma è mezzanotte a Greenwich: a ovest di Greenwich si rilegge come
// il 23. Nello stesso riquadro, due righe più sotto, la stessa data era già
// costruita bene (`new Date(iso + 'T12:00:00')`): due modi per la stessa
// cosa, e uno sbagliava.
//
// A Roma questo difetto NON si vede: l'Italia è sempre avanti a Greenwich, e
// mezzanotte UTC lì è già lo stesso giorno. È il motivo per cui è
// sopravvissuto a tre revisioni. Le prove qui sotto lo fanno vedere leggendo
// lo stesso istante con un orologio a ovest (`timeZone` esplicito in
// `Intl`): è quello che succede sul tablet di chi ha il fuso impostato male,
// o a chi apre Foodos in viaggio. La funzione nuova non passa mai da un
// istante, quindi non c'è orologio che la possa spostare.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoCashflow.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', async () => {
  const { storageFinto } = await import('./aiutoCashflow.jsx')
  return storageFinto
})

const { stato, reset, fattura, evento, montaCashflow, avvisiUniti, schermo, LARGHEZZA } =
  await import('./aiutoCashflow.jsx')
const { default: CashflowView, giornoEsteso, giornoBreve, leggiImporto } =
  await import('../../src/views/CashflowView.jsx')

/** Come si leggeva la data col codice di prima, guardata da un fuso a ovest. */
function allaVecchiaManiera(iso, fuso, opzioni = { day: 'numeric', month: 'long' }) {
  return new Date(iso).toLocaleDateString('it-IT', { ...opzioni, timeZone: fuso })
}

async function apri(props = {}) {
  const v = montaCashflow(CashflowView, props)
  await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
  return v
}
const testo = (v) => v.container.textContent
const MESI_ATTESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const campoSaldo = () => screen.getByLabelText(/Saldo cassa\+banca oggi/i)

async function scriviSaldo(valore) {
  const c = campoSaldo()
  fireEvent.change(c, { target: { value: valore } })
  fireEvent.blur(c)
}

beforeEach(() => { schermo(LARGHEZZA.computer); reset() })
afterEach(() => { cleanup() })

describe('il simbolo dell\'euro sta DOPO la cifra, e c\'è', () => {
  it('il numero grande della cassa porta l\'euro', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 12500, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('12.500 €')
  })

  it('e non lo mette davanti, che è la forma inglese', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 12500, fissi: [] } })
    const v = await apri()
    expect(testo(v)).not.toContain('€ 12.500')
  })

  it('le migliaia hanno il punto italiano, non la virgola', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 1234567, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('1.234.567 €')
  })

  it('l\'importo di un evento in elenco porta l\'euro e il segno', async () => {
    reset({
      fatture: [], impostazioni: { saldoOggi: 50000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'Affitto', importo: 2400, fra: 7 })],
    })
    const v = await apri()
    expect(testo(v)).toContain('−2.400 €')
  })

  it('un\'entrata pianificata ha il più davanti e l\'euro dopo', async () => {
    reset({
      fatture: [], impostazioni: { saldoOggi: 50000, fissi: [] },
      eventi: [evento({ id: 'e1', tipo: 'entrata', descrizione: 'Catering', importo: 800, fra: 7 })],
    })
    const v = await apri()
    expect(testo(v)).toContain('+800 €')
  })

  it('anche le tacche del grafico sono importi, non numeri nudi', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 7000, fissi: [] } })
    const v = await apri()
    const testi = [...v.container.querySelectorAll('svg text')].map(t => t.textContent)
    expect(testi.some(t => t.includes('€'))).toBe(true)
  })

  it('lo scaduto dei fornitori è scritto in euro', async () => {
    reset({
      fatture: [fattura({ id: 'f1', totale: 554.34, scadeFra: -5 })],
      impostazioni: { saldoOggi: 50000, fissi: [] },
    })
    const v = await apri()
    expect(testo(v)).toContain('Scaduto da pagare: 554 €')
  })
})

describe('leggere un importo scritto a mano, con la regola italiana', () => {
  // La regola del titolare, 18/09/2026: «di base il punto sono le migliaia,
  // la virgola i decimali».
  const casi = [
    ['1.250', 1250, 'il punto con tre cifre sono le migliaia'],
    ['12.500', 12500, 'idem, con una cifra in più'],
    ['1.250,50', 1250.5, 'la virgola decide, i punti prima sono migliaia'],
    ['12,50', 12.5, 'solo virgola: decimali'],
    ['0.950', 0.95, 'lo zero di testa non fa migliaia: sono novantacinque centesimi'],
    ['12.5', 12.5, 'un gruppo da una cifra non è migliaia: è un decimale inglese'],
    ['380', 380, 'niente punti, niente da chiedere'],
    ['1.250.000', 1250000, 'più punti: migliaia'],
    ['12.500 €', 12500, 'col simbolo attaccato, come è scritto a schermo'],
    ['-1.250', -1250, 'il conto scoperto esiste e ha il segno meno'],
    ['−1.250', -1250, 'anche col meno tipografico, che è quello che scrive la pagina'],
    ['', null, 'vuoto vuol dire «non lo so», non zero'],
    ['abc', null, 'non è un numero'],
    ['12,5o', null, 'la o al posto dello zero: l\'errore di battitura del telefono'],
  ]
  for (const [scritto, atteso, perche] of casi) {
    it(`«${scritto}» → ${atteso} (${perche})`, () => {
      expect(leggiImporto(scritto)).toBe(atteso)
    })
  }
})

describe('il campo del saldo legge all\'italiana', () => {
  it('«12.500» salva dodicimilacinquecento, non dodici e cinquanta', async () => {
    reset({ fatture: [] })
    await apri()
    await scriviSaldo('12.500')
    await waitFor(() => expect(stato.salvataggi.length).toBe(1))
    expect(stato.salvataggi[0].valore.saldoOggi).toBe(12500)
  })

  it('«1.250,50» tiene anche i centesimi', async () => {
    reset({ fatture: [] })
    await apri()
    await scriviSaldo('1.250,50')
    await waitFor(() => expect(stato.salvataggi.length).toBe(1))
    expect(stato.salvataggi[0].valore.saldoOggi).toBe(1250.5)
  })

  it('un saldo negativo si salva col segno', async () => {
    reset({ fatture: [] })
    await apri()
    await scriviSaldo('-2.000')
    await waitFor(() => expect(stato.salvataggi.length).toBe(1))
    expect(stato.salvataggi[0].valore.saldoOggi).toBe(-2000)
  })

  it('una scritta che non è un numero non salva niente e lo dice', async () => {
    reset({ fatture: [] })
    await apri()
    await scriviSaldo('dodicimila')
    await waitFor(() => expect(avvisiUniti()).toContain('Non ho capito il saldo'))
    expect(stato.salvataggi.length).toBe(0)
  })

  it('quando la lettura è dubbia, la pagina dice come l\'ha letta', async () => {
    reset({ fatture: [] })
    await apri()
    await scriviSaldo('1.250')
    await waitFor(() => expect(avvisiUniti()).toContain('Ho letto 1.250 €'))
    expect(avvisiUniti()).toContain('scrivilo con la virgola')
  })

  it('su «12.500,00» non c\'è nessun dubbio da sollevare', async () => {
    reset({ fatture: [] })
    await apri()
    await scriviSaldo('12.500,00')
    await waitFor(() => expect(stato.salvataggi.length).toBe(1))
    expect(avvisiUniti()).not.toContain('Ho letto')
  })

  it('il campo non è `type="number"`: il browser mangerebbe il punto prima di noi', async () => {
    reset({ fatture: [] })
    await apri()
    expect(campoSaldo().getAttribute('type')).toBe('text')
    expect(campoSaldo().getAttribute('inputmode')).toBe('decimal')
  })

  it('il saldo letto all\'italiana arriva fino al numero grande della pagina', async () => {
    reset({ fatture: [] })
    const v = await apri()
    await scriviSaldo('12.500')
    await waitFor(() => expect(v.container.textContent).toContain('12.500 €'))
  })
})

describe('l\'importo di un evento legge all\'italiana anche lui', () => {
  async function apriModulo() {
    reset({ fatture: [], impostazioni: { saldoOggi: 50000, fissi: [] } })
    const v = await apri()
    fireEvent.click(screen.getByText(/Aggiungi evento/))
    await waitFor(() => expect(screen.getByLabelText(/Importo in euro/i)).toBeTruthy())
    return v
  }

  async function compila({ descrizione = 'Affitto', data = '2026-12-01', importo }) {
    fireEvent.change(screen.getByLabelText(/Descrizione dell'evento/i), { target: { value: descrizione } })
    fireEvent.change(screen.getByLabelText(/Data in cui te lo aspetti/i), { target: { value: data } })
    fireEvent.change(screen.getByLabelText(/Importo in euro/i), { target: { value: importo } })
    fireEvent.click(screen.getByText('OK'))
  }

  it('«2.400» diventa duemilaquattrocento', async () => {
    await apriModulo()
    await compila({ importo: '2.400' })
    await waitFor(() => expect(stato.scritture.length).toBe(1))
    expect(stato.scritture[0].valori.importo).toBe(2400)
  })

  it('«2.400,50» tiene i centesimi', async () => {
    await apriModulo()
    await compila({ importo: '2.400,50' })
    await waitFor(() => expect(stato.scritture.length).toBe(1))
    expect(stato.scritture[0].valori.importo).toBe(2400.5)
  })

  it('una scritta che non è un numero non crea niente', async () => {
    await apriModulo()
    await compila({ importo: 'tanti' })
    await waitFor(() => expect(avvisiUniti()).toContain('Serve un importo maggiore di zero'))
    expect(stato.scritture.length).toBe(0)
  })

  it('il campo dell\'importo non è `type="number"`', async () => {
    await apriModulo()
    expect(screen.getByLabelText(/Importo in euro/i).getAttribute('type')).toBe('text')
  })
})

describe('le date si scrivono coi pezzi della stringa, non passando da un istante', () => {
  it('giornoEsteso legge il giorno e il mese in italiano', () => {
    expect(giornoEsteso('2026-09-24')).toBe('24 settembre')
    expect(giornoEsteso('2026-01-01')).toBe('1 gennaio')
    expect(giornoEsteso('2026-12-31')).toBe('31 dicembre')
  })

  it('giornoBreve è la forma da elenco', () => {
    expect(giornoBreve('2026-09-24')).toBe('24 set 2026')
    expect(giornoBreve('2027-01-01')).toBe('01 gen 2027')
  })

  it('su una stringa che non è un giorno rispondono vuoto, non «Invalid Date»', () => {
    for (const brutto of ['', null, undefined, 'domani', '2026-13-01xx']) {
      expect(giornoEsteso(brutto)).toBe('')
      expect(giornoBreve(brutto)).toBe('')
    }
  })

  // ── Il fuso: le tre prove che a Roma non si vedono ────────────────────
  it('col codice di prima, a Los Angeles «2026-09-24» diventava il 23', () => {
    // Questa prova non guarda il prodotto: guarda il DIFETTO, e serve a
    // dimostrare che l'orologio che usiamo qui sotto sa vederlo davvero. Un
    // controllo che non sa riconoscere quello che cerca è verde per sbaglio.
    expect(allaVecchiaManiera('2026-09-24', 'America/Los_Angeles')).toBe('23 settembre')
  })

  it('la pagina invece scrive il 24, perché non passa da nessun istante', () => {
    expect(giornoEsteso('2026-09-24')).toBe('24 settembre')
  })

  it('il capodanno col codice di prima scivolava nell\'anno vecchio', () => {
    expect(allaVecchiaManiera('2027-01-01', 'America/Los_Angeles', { day: 'numeric', month: 'long', year: 'numeric' }))
      .toContain('2026')
    expect(giornoBreve('2027-01-01')).toBe('01 gen 2027')
  })

  it('tutti i giorni di un anno si rileggono uguali, in qualunque fuso', () => {
    const fusi = ['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo', 'UTC', 'Europe/Rome']
    let quanteVolteIlVecchioSbagliava = 0
    for (let g = 0; g < 365; g++) {
      const iso = new Date(Date.UTC(2026, 0, 1 + g)).toISOString().slice(0, 10)
      const nostro = giornoEsteso(iso)
      const atteso = `${Number(iso.slice(8, 10))} ${MESI_ATTESI[Number(iso.slice(5, 7)) - 1]}`
      expect(nostro, iso).toBe(atteso)
      for (const fuso of fusi) {
        // Il nostro non si muove col fuso, per costruzione: qui si conta
        // quante volte il modo vecchio invece si muoveva.
        if (allaVecchiaManiera(iso, fuso) !== atteso) quanteVolteIlVecchioSbagliava++
      }
    }
    // A ovest di Greenwich sbagliava ogni singolo giorno dell'anno: due fusi
    // su cinque, 365 giorni ciascuno.
    expect(quanteVolteIlVecchioSbagliava).toBe(730)
  })

  it('la data del giorno rosso, a schermo, è scritta a parole e col giorno giusto', async () => {
    reset({
      fatture: [fattura({ id: 'f1', totale: 5000, scadeFra: 10 })],
      impostazioni: { saldoOggi: 100, fissi: [] },
    })
    const v = await apri()
    expect(testo(v)).toMatch(/cassa attesa negativa il \d{1,2} [a-zà-ù]+/)
    expect(testo(v)).not.toMatch(/negativa il \d{4}-\d{2}-\d{2}/)
  })

  it('la data di un evento in elenco è quella da foglio, non quella da database', async () => {
    reset({
      fatture: [], impostazioni: { saldoOggi: 50000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'IVA', fra: 12 })],
    })
    const v = await apri()
    expect(testo(v)).toMatch(/\d{2} (gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic) \d{4}/)
    expect(testo(v)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('un evento senza data non stampa «Invalid Date» ma un trattino', async () => {
    const senzaData = { ...evento({ id: 'e1' }), data_attesa: null }
    reset({ fatture: [], impostazioni: { saldoOggi: 50000, fissi: [] }, eventi: [senzaData] })
    const v = await apri()
    expect(testo(v)).not.toContain('Invalid Date')
    expect(testo(v)).toContain('—')
  })

  it('una data con l\'ora attaccata viene letta come giorno lo stesso', async () => {
    const conOra = { ...evento({ id: 'e1', fra: 12 }) }
    conOra.data_attesa = `${conOra.data_attesa}T00:00:00+00:00`
    reset({ fatture: [], impostazioni: { saldoOggi: 50000, fissi: [] }, eventi: [conOra] })
    const v = await apri()
    expect(testo(v)).not.toContain('Invalid Date')
    expect(testo(v)).toMatch(/\d{2} (gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic) \d{4}/)
  })
})
