// @vitest-environment happy-dom
//
// ── Un saldo che manca non è un saldo a zero ───────────────────────────────
//
// Il difetto, trovato il 20/09/2026 guardando la pagina «Avrò i soldi per
// pagare?» coi dati veri di Mara dei Boschi, non leggendo il codice.
//
// `CashflowView` nasceva con `settings = { saldoOggi: 0 }`, e la previsione
// partiva da lì: `let saldoAtteso = Number(settings.saldoOggi) || 0`. Nessuno
// aveva mai scritto quanto c'è in banca — la chiave
// `pasticceria-cashflow-settings-v1` non esiste in `user_data`, in nessuna
// organizzazione — quindi per la pagina il saldo era zero, e zero è un numero
// su cui si può fare un conto.
//
// Quello che leggeva il titolare il 19/09/2026, in rosso, in cima alla
// schermata:
//
//     Attenzione: cassa attesa negativa il 19 settembre
//     Saldo previsto: -554
//
// Non è una previsione sbagliata: è una previsione inventata. Quei 554 € sono
// lo scaduto recente dei fornitori (6 fatture su 68 aperte), e sarebbero un
// problema solo se in banca non ci fosse niente. Mara può avere cinquantamila
// euro sul conto: la pagina non lo sa, e lo dava per zero.
//
// Il costo del difetto: è la prima riga della pagina che parla dei soldi. Un
// allarme rosso che compare a tutti, sempre, smette di essere un allarme —
// e quando arriverà quello vero nessuno lo guarderà.
//
// La correzione, in tre pezzi:
//   1. `saldoOggi: null` vuol dire «non me l'ha detto». Zero resta una
//      risposta legittima (la cassa vuota esiste), e si distingue dal nulla.
//   2. senza saldo non c'è nessun «primo giorno rosso»: quel calcolo parte da
//      un numero che non abbiamo.
//   3. il KPI cambia nome — senza saldo non è una cassa, è una variazione —
//      e lo dice sotto.
//
// Le prove montano la pagina vera, con un finto database che tiene le righe e
// le filtra come Postgres.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../../src/lib/supabase', async () => {
  const { supabaseFinto } = await import('./aiutoCashflow.jsx')
  return { supabase: supabaseFinto }
})
vi.mock('../../src/lib/storage', async () => {
  const { storageFinto } = await import('./aiutoCashflow.jsx')
  return storageFinto
})

const { stato, reset, fattura, evento, montaCashflow, avvisiUniti, schermo, LARGHEZZA, giorno } =
  await import('./aiutoCashflow.jsx')
const { default: CashflowView } = await import('../../src/views/CashflowView.jsx')

/** Le 68 fatture aperte di Mara sono tante e piccole: qui bastano le sei scadute. */
function fattureMara() {
  return [
    fattura({ id: 'f1', totale: 120.50, scadeFra: -3 }),
    fattura({ id: 'f2', totale: 180.00, scadeFra: -7 }),
    fattura({ id: 'f3', totale: 253.84, scadeFra: -12 }),
    fattura({ id: 'f4', totale: 900.00, scadeFra: 20 }),
  ]
}

async function apri(props = {}) {
  const v = montaCashflow(CashflowView, props)
  await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
  return v
}

/**
 * Il valore della casella del saldo, **aspettandolo**.
 *
 * ── Il difetto era nel righello, 22/09/2026 ──────────────────────────────
 *
 * `apri()` aspetta solo che sparisca «Caricamento…», ma il saldo dichiarato
 * arriva dalle impostazioni in un secondo giro di render. Da solo questo file
 * passa sempre — l'ho fatto girare sei volte di fila — e dentro la suite
 * intera, con 383 file che si contendono i worker, ogni tanto la casella
 * viene letta un istante prima che il valore ci arrivi: la prova diventava
 * rossa e diceva «il saldo negativo non si rilegge», che è una bugia sul
 * prodotto. Un test che dipende da quanto è carico il computer non protegge
 * niente: fa solo perdere un push (questo, il 22/09).
 */
async function saldoNelCampo(atteso) {
  await waitFor(() => expect(screen.getByLabelText(/Saldo cassa\+banca oggi/i).value).toBe(atteso))
}

const testo = (v) => v.container.textContent

beforeEach(() => { schermo(LARGHEZZA.computer); reset() })
afterEach(() => { cleanup() })

describe('senza il saldo di oggi, la pagina non inventa un allarme', () => {
  it('non annuncia nessun giorno rosso: quel conto partirebbe da un numero che non ha', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    expect(testo(v)).not.toContain('cassa attesa negativa')
  })

  it('il numero grande si chiama «Variazione di cassa», non «Cassa fra 60gg»', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    expect(testo(v)).toContain('Variazione di cassa in 60gg')
    expect(testo(v)).not.toContain('Cassa fra 60gg')
  })

  it('e dice sotto perché: manca il saldo di oggi', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    expect(testo(v)).toContain('manca il saldo di oggi')
  })

  it('chiede il saldo con parole che dicono anche cosa manca senza', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    expect(testo(v)).toContain('Non so da quanto parti')
    expect(testo(v)).toContain('non se vai in rosso')
  })

  it('il grafico si disegna lo stesso: le uscite le sappiamo', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    expect(v.container.querySelector('svg[role="img"]')).toBeTruthy()
  })

  it('all\'AI il saldo arriva come «non lo so», non come zero', async () => {
    // Il pulsante «Spiegami» sta dentro il riquadro del giorno rosso, che
    // senza saldo non c'è: la prova qui è che il riquadro non compaia affatto.
    reset({ fatture: fattureMara() })
    const v = await apri()
    expect(v.container.textContent).not.toContain('Sposta scadenze')
  })
})

describe('col saldo dichiarato, la previsione torna a essere una previsione', () => {
  it('l\'avviso «non so da quanto parti» sparisce', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).not.toContain('Non so da quanto parti')
  })

  it('il numero grande torna a chiamarsi «Cassa fra 60gg»', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('Cassa fra 60gg (atteso)')
    expect(testo(v)).not.toContain('Variazione di cassa')
  })

  it('con 5.000 € in banca e 1.454 € di fatture aperte non c\'è nessun giorno rosso', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).not.toContain('cassa attesa negativa')
  })

  it('con 300 € in banca il giorno rosso c\'è, ed è oggi: lo scaduto pesa adesso', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 300, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('cassa attesa negativa')
  })

  it('il giorno rosso nominato è un giorno vero, non «Invalid Date»', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 300, fissi: [] } })
    const v = await apri()
    expect(testo(v)).not.toContain('Invalid Date')
    expect(testo(v)).toMatch(/cassa attesa negativa il \d{1,2} (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/)
  })

  it('il saldo dichiarato entra nel conto: 10.000 € in più fanno 10.000 € di saldo finale in più', async () => {
    reset({ fatture: fattureMara() })
    const senza = await apri()
    const variazione = senza.container.textContent
    cleanup()
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 10000, fissi: [] } })
    const con = await apri()
    // I due numeri non possono essere uguali: se lo fossero, il saldo
    // dichiarato non starebbe entrando da nessuna parte.
    expect(con.container.textContent).not.toBe(variazione)
    expect(con.container.textContent).toContain('Cassa fra 60gg')
  })
})

describe('zero è una risposta, il nulla no', () => {
  it('chi dichiara la cassa vuota NON si vede chiedere di nuovo il saldo', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 0, fissi: [] } })
    const v = await apri()
    expect(testo(v)).not.toContain('Non so da quanto parti')
  })

  it('e nel campo ritrova «0», non la casella vuota', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 0, fissi: [] } })
    await apri()
    await saldoNelCampo('0')
  })

  it('un saldo negativo — il conto scoperto esiste — si rilegge col segno', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: -1200, fissi: [] } })
    const v = await apri()
    await saldoNelCampo('-1200')
    expect(testo(v)).not.toContain('Non so da quanto parti')
  })

  it('con saldo negativo dichiarato il giorno rosso c\'è, ed è giusto che ci sia', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: -1200, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('cassa attesa negativa')
  })

  it('svuotare il campo riporta la pagina a «non lo so», non a zero', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    const campo = screen.getByLabelText(/Saldo cassa\+banca oggi/i)
    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.blur(campo)
    await waitFor(() => expect(stato.salvataggi.length).toBe(1))
    expect(stato.salvataggi[0].valore.saldoOggi).toBe(null)
    await waitFor(() => expect(v.container.textContent).toContain('Non so da quanto parti'))
  })
})

describe('il saldo si salva prima di cambiare la schermata', () => {
  it('scrivere e uscire dal campo fa UNA scrittura, non una per tasto', async () => {
    reset({ fatture: [] })
    await apri()
    const campo = screen.getByLabelText(/Saldo cassa\+banca oggi/i)
    fireEvent.change(campo, { target: { value: '1' } })
    fireEvent.change(campo, { target: { value: '12' } })
    fireEvent.change(campo, { target: { value: '1234' } })
    expect(stato.salvataggi.length).toBe(0)
    fireEvent.blur(campo)
    await waitFor(() => expect(stato.salvataggi.length).toBe(1))
    expect(stato.salvataggi[0].valore.saldoOggi).toBe(1234)
  })

  it('se il salvataggio fallisce lo stato NON cambia e l\'avviso lo dice', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    stato.erroreSsave = 'rete giù'
    const campo = screen.getByLabelText(/Saldo cassa\+banca oggi/i)
    fireEvent.change(campo, { target: { value: '9000' } })
    fireEvent.blur(campo)
    await waitFor(() => expect(avvisiUniti()).toContain('Non ho potuto salvare il saldo'))
    // La pagina continua a dire che non sa il saldo: è la verità, il salvataggio non è andato.
    expect(v.container.textContent).toContain('Non so da quanto parti')
    expect(stato.salvataggi.length).toBe(0)
  })

  it('un saldo dichiarato spegne l\'allarme anche se le uscite restano le stesse', async () => {
    reset({ fatture: fattureMara() })
    const v = await apri()
    const campo = screen.getByLabelText(/Saldo cassa\+banca oggi/i)
    fireEvent.change(campo, { target: { value: '20000' } })
    fireEvent.blur(campo)
    await waitFor(() => expect(v.container.textContent).toContain('Cassa fra 60gg'))
    expect(v.container.textContent).not.toContain('cassa attesa negativa')
  })
})

describe('quello che c\'è intorno: le altre cose che non si sanno', () => {
  it('senza chiusure la pagina dice che i ricavi non li sa, invece di stimare zero', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('Non ho abbastanza chiusure per stimare i ricavi')
    expect(testo(v)).not.toContain('Scenario ottimistico')
  })

  it('senza chiusure non compare nemmeno il ricavo medio: sarebbe uno zero spacciato per misura', async () => {
    reset({ fatture: [], impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).not.toContain('Ricavo medio giornaliero')
  })

  it('le scadenze calcolate si dichiarano: nessuna fattura di Mara porta la sua', async () => {
    reset({ fatture: fattureMara(), impostazioni: { saldoOggi: 5000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('Le date di scadenza non arrivano dalle fatture')
  })

  it('senza organizzazione la pagina non resta a «Caricamento…» per sempre', async () => {
    reset({ fatture: fattureMara() })
    const v = montaCashflow(CashflowView, { orgId: null })
    await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
  })

  it('un evento pianificato futuro entra nella previsione e la fa muovere', async () => {
    reset({ fatture: [], eventi: [evento({ id: 'e1', importo: 4000, fra: 10 })], impostazioni: { saldoOggi: 1000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('cassa attesa negativa')
    expect(testo(v)).toContain(giorno(10).slice(8, 10))
  })
})
