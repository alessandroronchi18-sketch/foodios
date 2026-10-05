// @vitest-environment happy-dom
//
// ── «Il mese» e «Il conto»: le pagine dicono la verità sui dati di Mara ──
//
// 03/10/2026. Sui dati veri di Mara il vecchio P&L mostrava «Utile 82%» in
// verde. Le due pagine nuove si montano qui con dati nella forma vera (quella
// di `caricaIlMese`) e si controlla quello che si legge a schermo:
//
//   • con il personale non registrato non c'è un utile: c'è il perché, e il
//     pulsante per sistemarlo;
//   • gli incassi stimati portano «stimato» dentro la tessera;
//   • le spese senza categoria e quelle con l'IVA dentro sono dichiarate;
//   • il confronto con l'anno prima ha il giudizio scritto, non solo il colore;
//   • la tabella del conto non scrive zero dove non sa.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import { incassiDelMese, personaleDelMese, contoDelMese } from '../../src/lib/ilMese.js'
import { mesePrima, annoPrima, nomeMese, aMese } from '../../src/lib/formatoAnalisi.js'
import { todayLocal } from '../../src/lib/dateLocal.js'

// La pagina parte dall'ultimo mese chiuso: i dati finti si chiamano come lui.
const M = mesePrima(todayLocal().slice(0, 7))
const MA = annoPrima(M)

let DATI = null
let PER_MESE = null
vi.mock('../../src/lib/ilMeseArchivio', () => ({ caricaIlMese: async ({ mese: m }) => (PER_MESE ? PER_MESE(m) : DATI) }))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { default: IlMeseView } = await import('../../src/views/IlMeseView.jsx')
const { default: ContoEconomicoView } = await import('../../src/views/ContoEconomicoView.jsx')

afterEach(() => { cleanup(); PER_MESE = null })
const testo = () => document.body.textContent || ''

const DIPENDENTI_MARA = [
  { attivo: true, stipendio_lordo_mensile: 0 },
  { attivo: false, stipendio_lordo_mensile: 2000 },
  { attivo: false, stipendio_lordo_mensile: 4000 },
  { attivo: false, stipendio_lordo_mensile: 2038.82 },
]
const costi = (mp, conf) => ({
  perCategoria: [
    { id: 'materie-prime', importo: mp, fornitori: [{ nome: 'DESA SRL', importo: mp * 0.5 }] },
    { id: 'confezionamento', importo: conf, fornitori: [{ nome: 'CONO ARTIC', importo: conf }] },
  ],
  investimenti: { importo: 0 },
  daClassificare: { importo: 12000, nFornitori: 280, nFatture: 60 },
  copertura: { nFatture: 76, nSenzaImponibile: 74, importoIvaCompresa: 41000 },
})
const mese = (m, { ricavi, personale = DIPENDENTI_MARA, mp = 15000, conf = 3000 }) => {
  const incassi = incassiDelMese({ stima: { ricavi } })
  const c = costi(mp, conf)
  const p = personaleDelMese(personale, { mese: m })
  return { mese: m, incassi, costi: c, personale: p, conto: contoDelMese({ incassi, costi: c, personale: p }) }
}
const conDati = (opts = {}) => ({
  mese: M, confronto: MA,
  attuale: mese(M, { ricavi: 99000, ...opts }),
  annoPrima: mese(MA, { ricavi: 88000, mp: 13000, ...opts }),
  andamento: [mesePrima(mesePrima(M)), mesePrima(M), M].map(m => mese(m, { ricavi: 60000, ...opts })),
  perSede: null, ultimoInventario: '2026-08-31', errori: [],
})

describe('Il mese, con il personale com\'è oggi', () => {
  it('non dà un utile: dice perché, e porta alla pagina Personale', async () => {
    DATI = conDati()
    const vai = vi.fn()
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={vai} />)
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
    // Dal 04/10 (audit IM3) la risposta è il numero che si sa, grande, col
    // perché in ambra; prima era «Non posso dirtelo: manca il personale» e il
    // numero stava in una riga piccola («Prima del personale ti restano…»).
    expect(testo()).toMatch(/Senza questi costi l'utile non si può calcolare/)
    expect(testo()).not.toMatch(/Utile di \w+0 €/)
    expect(testo()).toMatch(/3 persone con stipendio sono segnate non attive/)
    expect(testo()).toMatch(/Rimasti prima del personale60\.000 €stimato/) // 90.000 − 15.000 − 3.000 − 12.000
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === 'Metti i costi in Personale')) })
    expect(vai).toHaveBeenCalledWith('personale')
  })

  // Dal 04/10 «stimati» sta nel nome della tessera, uguale in tutte le pagine
  // (nomeIncassi), e «senza IVA» nella riga sotto il numero: prima la tessera
  // si chiamava «Incassi senza IVA» e il Conto «Incassi (stimati)».
  it('gli incassi stimati lo dicono nella tessera, e senza IVA', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Incassi stimati90\.000 €/)) // 99.000 lordi / 1,10
    expect(testo()).toMatch(/dall'inventario, senza IVA/)
  })

  it('le spese con l\'IVA dentro e quelle senza categoria sono dichiarate in cima', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/Da dove vengono i numeri/))
    expect(testo()).toMatch(/74 senza imponibile: 41\.000 € contati con l'IVA/)
    expect(testo()).toMatch(/12\.000 € di spese di 280 fornitori senza categoria/)
  })
})

describe('Il mese, con il personale sistemato', () => {
  const attivi = DIPENDENTI_MARA.map((d, i) => ({ ...d, attivo: i > 0 }))
  it('dà l\'utile, il suo peso e il confronto con l\'anno prima a parole', async () => {
    DATI = conDati({ personale: attivi })
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(new RegExp(`Utile di ${nomeMese(M, { anno: false })}`)))
    expect(testo()).not.toMatch(/Non posso dirtelo/)
    expect(testo()).toMatch(new RegExp(`su ${nomeMese(MA)}`))
    expect(testo()).toMatch(/Su 100 € incassati te ne restano/)
    // Dal 04/10 (audit IM9) le cause sono barre divergenti, non frasi: il
    // titolo dice la causa più pesante, ogni riga voce · barra · differenza,
    // e il fornitore principale in nome breve sotto la voce.
    // … e dalla sera del 04/10 stanno dietro «Perché è cambiato da …?».
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Perché'))) })
    expect(testo()).toMatch(new RegExp(`Hai incassato 10\\.000 € in più rispetto ${aMese(MA)}`))
    const mp = document.querySelector('ul[aria-label="Che cosa è cambiato"] li[aria-label^="Materie prime"]')
    expect(mp.getAttribute('aria-label')).toBe('Materie prime: +2.000 €, peggio')
    expect(mp.textContent).toMatch(/soprattutto DESA \+1\.000/)
  })
})

describe('Il conto, voce per voce', () => {
  it('ogni voce col mese, l\'anno prima e il giudizio; il personale che manca dice «non lo so»', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    // Il titolo era «Il conto di agosto 2026»; dal 04/10 è una domanda (CE9).
    await waitFor(() => expect(testo()).toMatch(new RegExp(`Dove sono andati i soldi ${aMese(M, { anno: false })}\\?`)))
    // Dalla sera del 04/10 è la tabella comune dell'Analisi (TabellaAnalisi):
    // l'euro sta nell'intestazione, non in ogni cella.
    const righe = [...document.querySelectorAll('tbody tr')].map(r => r.textContent)
    expect(righe.find(r => r.startsWith('Incassi stimati'))).toMatch(/90\.00080\.000\+10\.000 · meglio/)
    expect(righe.find(r => /Materie prime/.test(r))).toMatch(/−15\.000−13\.000\+2\.000 · peggio/)
    expect(righe.find(r => r.startsWith('Personale'))).toMatch(/non lo so/)
    expect(righe.find(r => r.startsWith('Utile'))).toMatch(/non lo so/)
    // Nessuna riga «−0»: le voci a zero in tutti e due i mesi non ci sono.
    expect(righe.some(r => /\u22120(?![.,\d])/.test(r))).toBe(false)
  })

  it('una voce di spesa si apre sui fornitori', async () => {
    DATI = conDati()
    render(<ContoEconomicoView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/Dove sono andati i soldi/))
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => /Materie prime/.test(b.textContent))) })
    // I fornitori sono righe della stessa tabella, sotto la voce: i loro numeri
    // cadono nelle stesse colonne (spese col meno, euro in testa).
    const desa = [...document.querySelectorAll('tbody tr')].find(r => /DESA SRL/.test(r.textContent))
    expect(desa.textContent).toMatch(/DESA SRL−7\.500−6\.500\+1\.000/)
  })
})

describe('All\'apertura', () => {
  it('se l\'ultimo mese chiuso non ha incassi, mostra l\'ultimo che li ha, e lo dice', async () => {
    const M1 = mesePrima(M)
    PER_MESE = (m) => {
      const base = conDati()
      if (m === M) {
        const vuoto = { ...mese(M, { ricavi: null }) }
        return { ...base, mese: M, attuale: vuoto, andamento: [mese(M1, { ricavi: 99000 }), vuoto] }
      }
      return { ...base, mese: m, confronto: annoPrima(m), attuale: mese(m, { ricavi: 99000 }) }
    }
    render(<IlMeseView orgId="o1" sedi={[]} />)
    // Dal 04/10 l'avviso è una riga dentro il controllo del mese, accanto
    // alla freccia che porta al mese chiuso (prima una frase con «Vai a …»).
    await waitFor(() => expect(testo()).toMatch(new RegExp(`${nomeMese(M, { anno: false })} ancora incompleto`)))
    expect(testo()).toMatch(new RegExp(`Quanto hai guadagnato ${aMese(M1, { anno: false })}`))
    expect([...document.querySelectorAll('button')].some(b => b.getAttribute('title') === `Vai a ${nomeMese(M, { anno: false })}`)).toBe(true)
  })

  it('con le fatture del mese a metà non confronta le spese e lo dice', async () => {
    const d = conDati()
    d.attuale.costi.copertura.ultimaFattura = `${M}-10`
    DATI = d
    render(<IlMeseView orgId="o1" sedi={[]} />)
    await waitFor(() => expect(testo()).toMatch(/fatture registrate fino al 10\//))
    expect(testo()).not.toMatch(/Spese del mese[^]*su [a-z]+ \d{4}peggio|Spese del mese[^]*su [a-z]+ \d{4}meglio/)
  })
})

describe('Classificare le spese senza uscire dalla pagina', () => {
  it('«Classifica» apre la schermata, «Torna» riporta al mese', async () => {
    DATI = conDati()
    render(<IlMeseView orgId="o1" sedi={[]} onNavigate={() => {}} />)
    await waitFor(() => expect(testo()).toMatch(/senza categoria/))
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === 'Classifica')) })
    await waitFor(() => expect(testo()).toMatch(/Di che cosa sono queste spese/))
    await act(async () => { fireEvent.click([...document.querySelectorAll('button')].find(b => /^Torna/.test(b.textContent))) })
    await waitFor(() => expect(testo()).toMatch(/Quanto hai guadagnato/))
  })
})
