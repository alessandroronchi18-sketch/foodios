// @vitest-environment happy-dom
//
// La data da cui vale un prezzo nuovo — «Decorrenza nuovo prezzo», la
// finestra che si apre da Ricette → Materie prime → Modifica.
//
// Due difetti veri, trovati il 18/09/2026 dopo la segnalazione del titolare
// («il filtro data in modifica prezzi in materie prime non mi fa scrivere
// bene l'anno») e la sua domanda sul cambio d'anno («controlla che non ci
// siano problemi con le date quando si tornerà al 01/01, con gli storici dei
// prezzi»). Sono due cose separate che cascano tutte e due sull'anno.
//
// ── 1. Il fuoco rubato a ogni tasto ──────────────────────────────────────
// In `src/views/MateriePrimeView.jsx` la finestra di conferma è montata con
//
//     ref={el => { if (el) el.focus() }}
//
// (il numero di riga non si scrive apposta: il file sta crescendo mentre
// questo test viene scritto, e la riga si sposta di ora in ora)
//
// Un ref scritto in linea cambia identità a ogni ridisegno, quindi React lo
// stacca e lo riattacca **a ogni ridisegno**, non solo all'apertura. Il campo
// della data è controllato: ogni cifra battuta cambia lo stato, React
// ridisegna, il ref riparte e `el.focus()` si riprende il fuoco. Chi scrive
// l'anno batte «2», il fuoco torna alla finestra, e le altre tre cifre non
// entrano da nessuna parte. Il giorno e il mese hanno due cifre e il browser
// avanza da solo: l'anno ne ha quattro, ed è lì che si vede.
//
// La versione giusta c'è già nel prodotto, a dieci file di distanza:
// `src/views/MagazzinoView.jsx:573` mette il fuoco UNA volta sola
// (`if (el && !el.dataset.visto)`). Qui la guardia si è persa nella copia.
//
// ── 2. La decorrenza che torna indietro di un giorno ─────────────────────
// In `src/views/MateriePrimeView.jsx`, alla riga `const decorreISO`, quello
// che si manda al Dashboard è
//
//     new Date(confirmDecorre + 'T00:00:00').toISOString()
//
// cioè mezzanotte LOCALE riscritta a Greenwich: scegliendo il 01/01/2027 esce
// `2026-12-31T23:00:00.000Z`. Dall'altra parte, in `src/Dashboard.jsx`
// (`const giornoDecorrenza = decorreDa ? soloData(decorreDa) : oggi`), il
// giorno si rilegge con `soloData`, che taglia i
// primi dieci caratteri — ed è la cosa giusta da fare, perché quel campo di
// solito contiene già un giorno. Il risultato è che il giorno scelto arriva
// **sempre indietro di uno**, tutto l'anno, per il solo fatto che l'Italia sta
// a est di Greenwich.
//
// Non è un dettaglio di etichetta: `decorre_da` è il campo su cui
// `getPrezzoStoricoKg` (`src/lib/foodcost.js`) ricostruisce il food cost delle
// produzioni passate. Un prezzo messo «dal 01/01» entra in vigore il 31/12, e
// il 31/12 è l'ultimo giorno dell'esercizio: il P&L dell'anno vecchio si porta
// dentro i prezzi dell'anno nuovo. La finestra stessa, due righe sotto il
// campo, promette il contrario: «cambiando il prezzo dal 01/01, il 31/12 usa
// ancora il vecchio».
//
// ── Corretti tutti e due, 18/09/2026 ─────────────────────────────────────
// Quando questo file è stato scritto `src/views/MateriePrimeView.jsx` era in
// mano a un altro agente e non si tocca in due, quindi i tre test che
// riproducono i difetti erano marcati `it.fails` — cioè «passano finché il
// difetto c'è». Nel pomeriggio dello stesso giorno le due correzioni sono
// state fatte, quelle tre hanno cominciato a fallire *perché passavano*, e il
// marcatore è stato tolto. Adesso sono prove normali, ed è giusto così: sono
// la rete che impedisce ai due difetti di tornare.
//
// **1. Il fuoco.** La finestra se lo prende solo se non ce l'ha già qualcuno
// al suo interno:
//
//     ref={el => { if (el && !el.contains(document.activeElement)) el.focus() }}
//
// Al primo disegno il fuoco è sul corpo della pagina e la finestra se lo
// prende; a ogni ridisegno successivo sta su un campo della finestra, e lì
// resta. `MagazzinoView` (riga 573) risolve lo stesso difetto marcando
// l'elemento con un `dataset`: questa versione fa lo stesso senza sporcare il
// DOM, e regge anche se la finestra viene rimontata.
//
// **2. La decorrenza.** Il giorno scelto si manda com'è, senza passare da
// `Date`:
//
//     const decorreISO = confirmDecorre || todayLocal()
//
// Fra due giorni il fuso non c'entra, e `soloData` dall'altra parte trova già
// la forma che si aspetta.

// 19/09/2026 — i nomi delle materie prime adesso si leggono con la prima
// maiuscola. Nel database restano minuscoli (è la chiave con cui il food
// cost trova il prezzo), quindi qui le prove di PRESENZA confrontano senza
// distinguere il maiuscolo: la regola sulla maiuscola ha un test suo.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { soloData, todayLocal } from '../../src/lib/dateLocal'
import { getPrezzoStoricoKg } from '../../src/lib/foodcost'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { default: MateriePrimeView } = await import('../../src/views/MateriePrimeView.jsx')

const ricettario = {
  ricette: {
    r1: {
      nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30,
      ingredienti: [{ nome: 'burro', qty1stampo: 300 }],
    },
  },
  ingredienti_costi: { burro: { costoKg: 8.4, costoG: 0.0084 } },
}

// Apre la finestra «Conferma modifica prezzo» e restituisce il campo della
// data, che è l'unico posto della pagina dove si scrive un anno.
async function apriFinestraDecorrenza(extra = {}) {
  const v = render(<MateriePrimeView
    ricettario={ricettario} logPrezzi={[]}
    onUpdatePrezzo={async () => {}} onCreaMateriaPrima={async () => ({ ok: true })}
    {...extra} />)
  await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('burro'))
  fireEvent.click(v.getByTitle('Clicca per modificare'))
  const campoPrezzo = await waitFor(() => v.getByLabelText('Prezzo per chilo di burro'))
  fireEvent.change(campoPrezzo, { target: { value: '9,50' } })
  fireEvent.keyDown(campoPrezzo, { key: 'Enter' })
  await waitFor(() => expect(v.container.textContent.toLowerCase()).toContain('conferma modifica prezzo'))
  const campoData = v.container.querySelector('#mp-decorre')
  expect(campoData).toBeTruthy()
  return { v, campoData }
}

beforeEach(() => { cleanup() })

describe('materie prime — scrivere l\'anno nella data di decorrenza', () => {
  it('il campo della data esiste, si chiama per esteso e parte da oggi', async () => {
    // Il contorno: serve a distinguere «il campo è rotto» da «il campo non
    // c'è più», quando fra sei mesi qualcuno leggerà i rossi qui sotto.
    const { v, campoData } = await apriFinestraDecorrenza()
    expect(campoData.getAttribute('type')).toBe('date')
    expect(campoData.value).toBe(todayLocal())
    expect(v.container.textContent.toLowerCase()).toContain('decorrenza nuovo prezzo')
  })

  it('battendo l\'anno una cifra per volta il fuoco resta nel campo', async () => {
    // Come si riproduce a mano: apri Ricette → Materie prime, premi Modifica
    // su una riga, scrivi un prezzo, conferma. Nella finestra clicca sull'anno
    // della data e batti 2-0-2-7: dopo la prima cifra il fuoco se ne va.
    //
    // Qui si batte una cifra per volta come fa il browser, che dopo ogni tasto
    // riscrive il valore intero del campo (in Chrome l'anno passa per 0002,
    // 0020, 0202, 2027).
    const { campoData } = await apriFinestraDecorrenza()
    campoData.focus()
    expect(document.activeElement).toBe(campoData)

    for (const passo of ['0002-01-01', '0020-01-01', '0202-01-01', '2027-01-01']) {
      fireEvent.change(campoData, { target: { value: passo } })
      // Basta il primo tasto: il ref in linea riparte e si riprende il fuoco.
      expect(document.activeElement).toBe(campoData)
    }
    expect(campoData.value).toBe('2027-01-01')
  })

  it('scegliendo il 01/01/2027 la decorrenza salvata è il 01/01/2027', async () => {
    // Come si riproduce a mano: stessa finestra, metti 01/01/2027 nella data e
    // premi «Conferma e salva». Nello storico dei prezzi la riga risulta
    // decorrente dal 31/12/2026, e il messaggio in alto lo dice pure.
    //
    // `soloData` è esattamente quello che fa il Dashboard con questo valore
    // (`const giornoDecorrenza = decorreDa ? soloData(decorreDa) : oggi`),
    // quindi il test misura il giro vero e non una sua imitazione.
    const arrivati = []
    const { v } = await apriFinestraDecorrenza({
      onUpdatePrezzo: async (...a) => { arrivati.push(a) },
    })
    const campoData = v.container.querySelector('#mp-decorre')
    fireEvent.change(campoData, { target: { value: '2027-01-01' } })
    const conferma = [...v.container.querySelectorAll('button')].find(b => /Conferma e salva/.test(b.textContent))
    fireEvent.click(conferma)
    await waitFor(() => expect(arrivati).toHaveLength(1))

    const decorreDa = arrivati[0][2]
    expect(soloData(decorreDa)).toBe('2027-01-01')
  })

  it('la decorrenza non torna indietro di un giorno, nessun giorno dell\'anno', async () => {
    // La famiglia intorno: non è il capodanno a essere speciale, è il fuso.
    // L'Italia sta a est di Greenwich tutto l'anno, quindi il giorno scelto
    // arretra sempre — d'inverno di un'ora, d'estate di due, e in entrambi i
    // casi mezzanotte finisce nel giorno prima.
    const giorni = [
      '2026-12-31', // ultimo giorno dell'esercizio
      '2027-01-01', // primo giorno del nuovo
      '2027-03-28', // vigilia del passaggio all'ora legale
      '2027-10-31', // dopo il ritorno all'ora solare
      '2028-02-29', // il 29 febbraio esiste, il 2028 è bisestile
    ]
    for (const giorno of giorni) {
      cleanup()
      const arrivati = []
      const { v } = await apriFinestraDecorrenza({
        onUpdatePrezzo: async (...a) => { arrivati.push(a) },
      })
      fireEvent.change(v.container.querySelector('#mp-decorre'), { target: { value: giorno } })
      fireEvent.click([...v.container.querySelectorAll('button')].find(b => /Conferma e salva/.test(b.textContent)))
      await waitFor(() => expect(arrivati).toHaveLength(1))
      expect(soloData(arrivati[0][2])).toBe(giorno)
    }
  })
})

describe('storico prezzi — la conseguenza sul food cost del 31 dicembre', () => {
  // Questi passano: lo storico dei prezzi fa il suo mestiere. Stanno qui per
  // dire dove il difetto NON è, e per mostrare cosa cambia il giorno in cui la
  // decorrenza arriva giusta.
  const log = giornoDecorrenza => ([
    {
      id: 'lp-1', data: '2026-12-31T22:59:00.000Z',
      decorre_da: `${giornoDecorrenza}T00:00:00.000Z`,
      ingrediente: 'burro', prezzoVecchio: 8, prezzoNuovo: 12,
    },
  ])
  // Lo Storico produzione chiede il food cost a mezzogiorno del giorno della
  // sessione (`StoricoProduzioneView.jsx:278`): è l'ora in cui nessun fuso del
  // mondo cambia la data.
  const mezzogiornoDi = g => `${g}T12:00:00`

  it('con la decorrenza giusta, il 31/12 tiene il prezzo vecchio e il 01/01 prende il nuovo', () => {
    const l = log('2027-01-01')
    expect(getPrezzoStoricoKg(l, 'burro', mezzogiornoDi('2026-12-31'))).toBe(8)
    expect(getPrezzoStoricoKg(l, 'burro', mezzogiornoDi('2027-01-01'))).toBe(12)
    expect(getPrezzoStoricoKg(l, 'burro', mezzogiornoDi('2027-01-02'))).toBe(12)
  })

  it('con la decorrenza arretrata di un giorno, il prezzo nuovo entra nell\'esercizio vecchio', () => {
    // È il valore che oggi arriva davvero in archivio scegliendo il 01/01/2027.
    // Il 31/12 usa già 12 €/kg: il food cost dell'ultimo giorno dell'anno, e
    // quindi il P&L dell'anno, sale del 50% su quell'ingrediente.
    const l = log('2026-12-31')
    expect(getPrezzoStoricoKg(l, 'burro', mezzogiornoDi('2026-12-31'))).toBe(12)
    expect(getPrezzoStoricoKg(l, 'burro', mezzogiornoDi('2026-12-30'))).toBe(8)
  })
})
