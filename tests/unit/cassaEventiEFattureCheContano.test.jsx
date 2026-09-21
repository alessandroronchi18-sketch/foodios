// @vitest-environment happy-dom
//
// ── Quello che la Cassa prevista mostrava senza contarlo ───────────────────
//
// Quattro difetti della stessa famiglia, trovati il 20/09/2026 in
// `src/views/CashflowView.jsx`: roba che sta a schermo e non entra nel conto,
// o che entra nel conto e non sta a schermo.
//
// **1. Gli eventi con la data passata.** La query carica tutti gli eventi
// `stato = 'pianificato'`, anche quelli di ieri; la previsione invece parte da
// oggi (`for (let i = 0; i <= orizzonte; i++)` con il confronto
// `e.data_attesa === iso`). Un affitto segnato per il 1° del mese e mai
// pagato compariva nell'elenco, con tanto di importo, e pesava ZERO. È la
// stessa cosa che per le fatture scadute era già stata sistemata — quelle si
// imputano al giorno 0 — e per gli eventi no. Adesso pesano anche loro, e in
// elenco hanno la pastiglia «in ritardo» che dice perché.
//
// **2. L'elenco tagliato a dodici, in silenzio.** L'intestazione diceva
// «Eventi pianificati (20)» e di righe se ne vedevano dodici: `slice(0, 12)`
// senza una parola. Chi cerca la voce che manca la cerca per un quarto d'ora.
//
// **3. Le fatture senza stato sparivano.** La query filtrava
// `.neq('stato', 'pagata')`. La colonna `fatture.stato` ammette il nulla (ha
// un valore di serie, ma un import che scrive NULL esplicito lo lascia
// vuoto), e in SQL `NULL <> 'pagata'` non è vero: è ignoto, quindi la riga
// non passa il filtro. Una fattura da pagare senza stato non entrava nella
// previsione di cassa. In produzione oggi sono zero righe su 3.104: il
// difetto è armato, non ancora sparato.
//
// **4. La cancellazione senza risposta del database.** Già corretta prima di
// oggi (il `{ error }` di supabase-js non lancia), qui resta coperta: è il
// genere di correzione che si perde alla prima riscrittura.
//
// Le prove montano la pagina vera dentro `ConfirmProvider`, quindi la
// finestra di conferma è quella dell'app e `window.confirm` non viene mai
// chiamata: è la regola «niente finestre del browser nei flussi utente».

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
const { default: CashflowView } = await import('../../src/views/CashflowView.jsx')

async function apri(props = {}) {
  const v = montaCashflow(CashflowView, props)
  await waitFor(() => expect(v.container.textContent).not.toContain('Caricamento…'))
  return v
}
const testo = (v) => v.container.textContent

/**
 * Il numero grande della cassa, letto a schermo: si cerca l'etichetta e si
 * prende il riquadro subito sotto, che è dove sta il valore.
 */
function cassaFinale(v) {
  const etichetta = [...v.container.querySelectorAll('div')]
    .find(d => /^(Cassa fra \d+gg \(atteso\)|Variazione di cassa in \d+gg)$/.test((d.textContent || '').trim()))
  if (!etichetta || !etichetta.nextElementSibling) return null
  const m = /([-−]?[\d.]+)\s*€/.exec(etichetta.nextElementSibling.textContent || '')
  if (!m) return null
  return Number(m[1].replace(/\./g, '').replace('−', '-'))
}

let confermaNativa
beforeEach(() => {
  schermo(LARGHEZZA.computer)
  reset()
  confermaNativa = vi.fn(() => true)
  window.confirm = confermaNativa
})
afterEach(() => { cleanup() })

describe('un evento con la data passata pesa adesso, e si vede che è in ritardo', () => {
  it('l\'affitto di dieci giorni fa è segnato «in ritardo»', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'Affitto agosto', importo: 2400, fra: -10 })],
    })
    const v = await apri()
    expect(testo(v)).toContain('in ritardo')
  })

  it('e toglie davvero i suoi 2.400 € dalla cassa prevista', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const senza = await apri()
    const prima = cassaFinale(senza)
    cleanup()
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'Affitto agosto', importo: 2400, fra: -10 })],
    })
    const con = await apri()
    expect(prima).toBe(10000)
    expect(cassaFinale(con)).toBe(7600)
  })

  it('un evento futuro NON è in ritardo, e pesa il giorno suo', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'IVA', importo: 2400, fra: 15 })],
    })
    const v = await apri()
    expect(testo(v)).not.toContain('in ritardo')
    expect(cassaFinale(v)).toBe(7600)
  })

  it('un evento oltre l\'orizzonte non pesa: 90 giorni non stanno in 60', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'Tredicesime', importo: 2400, fra: 80 })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(10000)
  })

  it('un\'entrata in ritardo alza la cassa, non la abbassa', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: [evento({ id: 'e1', tipo: 'entrata', descrizione: 'Catering di agosto', importo: 1500, fra: -4 })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(11500)
    expect(testo(v)).toContain('in ritardo')
  })

  it('l\'evento in ritardo spiega, al tocco, perché è contato oggi', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: [evento({ id: 'e1', descrizione: 'Affitto agosto', importo: 2400, fra: -10 })],
    })
    const v = await apri()
    const pastiglia = [...v.container.querySelectorAll('span')].find(s => s.textContent === 'in ritardo')
    expect(pastiglia.getAttribute('title')).toContain('primo giorno della previsione')
    expect(pastiglia.getAttribute('title')).toContain('elimina la riga')
  })
})

describe('l\'elenco degli eventi dice quanti ne sta mostrando', () => {
  const venti = () => Array.from({ length: 20 }, (_, i) =>
    evento({ id: `e${i}`, descrizione: `Uscita ${i}`, importo: 10, fra: i + 1 }))

  it('con venti eventi l\'intestazione ne conta venti', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: venti() })
    const v = await apri()
    expect(testo(v)).toContain('Eventi pianificati (20)')
  })

  it('ma di righe se ne vedono dodici, e la pagina lo dice', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: venti() })
    const v = await apri()
    expect(testo(v)).toContain('Ne mostro 12 su 20')
    expect(testo(v)).toContain('Gli altri 8 contano')
  })

  it('e i venti pesano tutti sulla previsione, non solo i dodici mostrati', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: venti() })
    const v = await apri()
    expect(cassaFinale(v)).toBe(9800)
  })

  it('con dodici eventi o meno non dice niente: non c\'è niente da dire', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      eventi: venti().slice(0, 12),
    })
    const v = await apri()
    expect(testo(v)).not.toContain('Ne mostro')
  })

  it('senza eventi invita a metterceli, e non mostra elenchi vuoti', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const v = await apri()
    expect(testo(v)).toContain('Nessun evento pianificato')
    expect(testo(v)).not.toContain('Ne mostro')
  })
})

describe('eliminare un evento: la finestra è quella dell\'app', () => {
  const uno = () => [evento({ id: 'e1', descrizione: 'Affitto', importo: 2400, fra: 5 })]

  it('il browser non viene mai interpellato', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: uno() })
    const v = await apri()
    fireEvent.click(screen.getByLabelText('Elimina evento Affitto'))
    await waitFor(() => expect(v.container.textContent).toContain('Eliminare evento?'))
    expect(confermaNativa).not.toHaveBeenCalled()
  })

  it('se annulli, l\'evento resta dov\'è', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: uno() })
    const v = await apri()
    fireEvent.click(screen.getByLabelText('Elimina evento Affitto'))
    await waitFor(() => expect(v.container.textContent).toContain('Eliminare evento?'))
    fireEvent.click(screen.getByText('Annulla'))
    await waitFor(() => expect(v.container.textContent).not.toContain('Eliminare evento?'))
    expect(testo(v)).toContain('Affitto')
    expect(stato.scritture.length).toBe(0)
  })

  it('se confermi, sparisce dall\'elenco e dalla previsione', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: uno() })
    const v = await apri()
    expect(cassaFinale(v)).toBe(7600)
    fireEvent.click(screen.getByLabelText('Elimina evento Affitto'))
    await waitFor(() => expect(v.container.textContent).toContain('Eliminare evento?'))
    fireEvent.click(screen.getByText('Elimina'))
    await waitFor(() => expect(v.container.textContent).not.toContain('Affitto'))
    expect(cassaFinale(v)).toBe(10000)
  })

  it('se il database rifiuta, la riga NON sparisce e l\'avviso lo dice', async () => {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] }, eventi: uno() })
    const v = await apri()
    stato.erroreDb = { tabella: 'cashflow_eventi', azione: 'delete', messaggio: 'permesso negato' }
    fireEvent.click(screen.getByLabelText('Elimina evento Affitto'))
    await waitFor(() => expect(v.container.textContent).toContain('Eliminare evento?'))
    fireEvent.click(screen.getByText('Elimina'))
    await waitFor(() => expect(avvisiUniti()).toContain('permesso negato'))
    expect(testo(v)).toContain('Affitto')
    expect(cassaFinale(v)).toBe(7600)
  })
})

describe('aggiungere un evento: dice quale campo manca, e salva prima di mostrare', () => {
  async function apriModulo() {
    reset({ impostazioni: { saldoOggi: 10000, fissi: [] } })
    const v = await apri()
    fireEvent.click(screen.getByText(/Aggiungi evento/))
    await waitFor(() => expect(screen.getByLabelText(/Importo in euro/i)).toBeTruthy())
    return v
  }
  const scrivi = (etichetta, valore) =>
    fireEvent.change(screen.getByLabelText(etichetta), { target: { value: valore } })

  it('senza descrizione dice che serve la descrizione', async () => {
    await apriModulo()
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(avvisiUniti()).toContain('Serve una descrizione'))
    expect(stato.scritture.length).toBe(0)
  })

  it('senza data dice che serve la data', async () => {
    await apriModulo()
    scrivi(/Descrizione dell'evento/i, 'Affitto')
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(avvisiUniti()).toContain('Serve la data'))
  })

  it('con importo zero dice che serve un importo maggiore di zero', async () => {
    await apriModulo()
    scrivi(/Descrizione dell'evento/i, 'Affitto')
    scrivi(/Data in cui te lo aspetti/i, '2026-12-01')
    scrivi(/Importo in euro/i, '0')
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(avvisiUniti()).toContain('importo maggiore di zero'))
    expect(stato.scritture.length).toBe(0)
  })

  it('compilato per bene, l\'evento arriva al database e poi in elenco', async () => {
    const v = await apriModulo()
    scrivi(/Descrizione dell'evento/i, 'Stipendi novembre')
    scrivi(/Data in cui te lo aspetti/i, '2026-12-01')
    scrivi(/Importo in euro/i, '3.200')
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(v.container.textContent).toContain('Stipendi novembre'))
    expect(stato.scritture.length).toBe(1)
    expect(stato.scritture[0].valori.importo).toBe(3200)
    expect(stato.scritture[0].valori.descrizione).toBe('Stipendi novembre')
  })

  it('se il database rifiuta, in elenco non compare niente e l\'avviso lo dice', async () => {
    const v = await apriModulo()
    stato.erroreDb = { tabella: 'cashflow_eventi', azione: 'insert', messaggio: 'no' }
    scrivi(/Descrizione dell'evento/i, 'Stipendi novembre')
    scrivi(/Data in cui te lo aspetti/i, '2026-12-01')
    scrivi(/Importo in euro/i, '3200')
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(avvisiUniti()).toContain('Non ho potuto salvare l\'evento'))
    expect(testo(v)).not.toContain('Stipendi novembre')
  })

  it('il modulo si chiude solo dopo che il salvataggio è andato', async () => {
    const v = await apriModulo()
    scrivi(/Descrizione dell'evento/i, 'IVA')
    scrivi(/Data in cui te lo aspetti/i, '2026-12-16')
    scrivi(/Importo in euro/i, '900')
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(v.container.querySelector('input[type="date"]')).toBeFalsy())
  })
})

describe('le fatture: quelle che contano, quelle che no, e quelle che sparivano', () => {
  it('una fattura senza stato entra lo stesso nella previsione', async () => {
    // `NULL <> 'pagata'` in SQL non è vero: con il vecchio filtro questa riga
    // non arrivava proprio al browser.
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [{ ...fattura({ id: 'f1', totale: 3000, scadeFra: 10 }), stato: null }],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(7000)
  })

  it('una fattura pagata resta fuori', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: 3000, scadeFra: 10, stato: 'pagata' })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(10000)
  })

  it('lo scaduto degli ultimi tre mesi si dichiara come numero a sé', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [
        fattura({ id: 'f1', totale: 300, scadeFra: -5 }),
        fattura({ id: 'f2', totale: 254.34, scadeFra: -40 }),
      ],
    })
    const v = await apri()
    expect(testo(v)).toContain('Scaduto da pagare: 554 €')
    expect(testo(v)).toContain('su 2 fatture degli ultimi tre mesi')
  })

  it('e pesa sul primo giorno: sono soldi che il fornitore aspetta adesso', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: 554, scadeFra: -5 })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(9446)
  })

  it('lo scaduto da oltre tre mesi resta FUORI dalla cassa, e la pagina spiega perché', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: 50000, scadeFra: -400 })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(10000)
    expect(testo(v)).toContain('scadute da più di tre mesi')
    expect(testo(v)).toContain('NON le conto nella previsione di cassa')
  })

  it('una fattura mezza pagata pesa solo per il residuo', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: 1000, pagato: 400, scadeFra: 10 })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(9400)
  })

  it('una nota di credito (totale negativo) è un credito, non un debito', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: -365.55, scadeFra: 10 })],
    })
    const v = await apri()
    // 10.000 + 365,55 arrotondato: la nota di credito ALZA la cassa attesa.
    expect(cassaFinale(v)).toBe(10366)
  })

  it('una fattura pagata per intero ma con lo stato ancora aperto non conta due volte', async () => {
    reset({
      impostazioni: { saldoOggi: 10000, fissi: [] },
      fatture: [fattura({ id: 'f1', totale: 1000, pagato: 1000, scadeFra: 10 })],
    })
    const v = await apri()
    expect(cassaFinale(v)).toBe(10000)
  })
})
