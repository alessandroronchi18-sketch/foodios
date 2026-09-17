// @vitest-environment happy-dom
//
// La pagina Previsione vendite deve dire il vero sul perché è vuota.
//
// Due difetti nello stesso punto — `ForecastView.jsx`, funzione `diagnosi` —
// trovati il 17/09/2026. Il primo lo ha segnalato l'agente SOLDI leggendo
// `ForecastView.jsx:48`, il secondo è uscito verificando la correzione del
// primo: sistemata la fonte, la pagina continuava a raccontare una bugia
// diversa.
//
// ── Difetto 1: la query che salta il dirottamento ─────────────────────────
// La diagnosi chiedeva le chiusure direttamente a `user_data`:
//
//     supabase.from('user_data').select('data_value')
//       .eq('data_key', 'pasticceria-chiusure-v1').maybeSingle()
//
// Dal 07/09/2026 (migration 20260907b) le chiusure vivono in
// `chiusure_cassa`. Il blob jsonb non lo aggiorna più nessuno: è la
// fotografia del giorno della migrazione, e per Mara dei Boschi non esiste
// affatto. `storage.js` dirotta la lettura proprio perché nessun callsite
// possa restare indietro — ma chi interroga il database di persona quel
// dirottamento lo salta.
//
// Quello che vedeva il titolare: registra le chiusure dalla pagina Cassa,
// apre la previsione, e legge «Non c'è ancora niente da cui prevedere ·
// Registra le chiusure per qualche settimana». Cioè: fai quello che hai
// appena fatto.
//
// ── Difetto 2: i prodotti di una chiusura non si chiamano «prodotti» ──────
// Il conto delle giornate col dettaglio guardava `c.prodotti` e `c.righe`.
// Nessuna chiusura di oggi ha quei campi: `ChiusuraView` salva l'elenco in
// `venduto`, e `chiusure_cassa` ha una colonna con quel nome (vedi
// `chiusuraRiga.js`). Quindi anche con sessanta giornate compilate prodotto
// per prodotto la pagina rispondeva «Alle tue chiusure manca il dettaglio
// dei prodotti — finché manca, questa pagina resta vuota per quanti giorni
// si aspetti». Un invito ad arrendersi, rivolto a chi aveva fatto tutto.
//
// `OrdiniAiView.jsx:112` era già stato corretto e accetta tutti e quattro i
// nomi: qui si allinea la previsione.
//
// I test rendono la pagina VERA e leggono quello che comparirebbe a schermo.
// Sotto ci passa `storage.js` vero, quindi il dirottamento è esercitato per
// davvero: l'unica cosa finta è il database.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { todayLocal, aggiungiGiorni } from '../../src/lib/dateLocal'

// ── Il database finto ─────────────────────────────────────────────────────
// Tiene il conto delle tabelle interrogate: è la parte che dimostra il
// dirottamento, non solo il risultato.
const stato = {
  toccate: [],
  righeChiusure: [],
  blobUserData: null,
  forecast: [],
}

function catena(risultato) {
  const c = {}
  const metodi = ['select', 'eq', 'is', 'not', 'in', 'or', 'order', 'limit', 'gte', 'lte', 'lt', 'gt']
  for (const m of metodi) c[m] = () => c
  c.maybeSingle = () => Promise.resolve(risultato)
  c.single = () => Promise.resolve(risultato)
  c.then = (res) => Promise.resolve(risultato).then(res)
  return c
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from(tabella) {
      stato.toccate.push(tabella)
      if (tabella === 'chiusure_cassa') return catena({ data: stato.righeChiusure, error: null })
      if (tabella === 'user_data') return catena({ data: stato.blobUserData, error: null })
      if (tabella === 'forecast_giornaliero') return catena({ data: stato.forecast, error: null })
      return catena({ data: [], error: null })
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

import ForecastView from '../../src/views/ForecastView'
import { _resetVersions } from '../../src/lib/storage'

const ORG = 'org-mara'
const SEDE = 'sede-corso-casale'

/** Una riga di `chiusure_cassa` come la restituisce il database. */
function riga(giorno, prodotti) {
  return {
    id: `uuid-${giorno}`,
    legacy_id: null,
    data: giorno,
    tot_venduto: '820.00',
    venduto: prodotti,
    formati: [],
    extra: null,
  }
}

/** N giornate consecutive che finiscono ieri, col dettaglio prodotti. */
function giornateConDettaglio(n) {
  const out = []
  for (let i = n; i >= 1; i--) {
    out.push(riga(aggiungiGiorni(todayLocal(), -i), [
      { nome: 'SACHER', venduto: 6, prezzo: 30 },
      { nome: 'BIGNÈ', venduto: 40, prezzo: 1.8 },
    ]))
  }
  return out
}

/** N giornate consecutive registrate col solo totale (niente prodotti). */
function giornateSoloTotale(n) {
  const out = []
  for (let i = n; i >= 1; i--) out.push(riga(aggiungiGiorni(todayLocal(), -i), []))
  return out
}

async function rendi() {
  render(<ForecastView orgId={ORG} sedeId={SEDE} sedeAttiva={{ nome: 'Corso Casale' }} setView={() => {}} />)
  // La diagnosi arriva dopo due await: si aspetta che il messaggio ci sia.
  await waitFor(() => expect(document.body.textContent).not.toMatch(/Caricamento/i))
}

beforeEach(() => {
  stato.toccate = []
  stato.righeChiusure = []
  stato.blobUserData = null
  stato.forecast = []
  _resetVersions()
})
afterEach(() => cleanup())

describe('riproduce il difetto: la fonte sbagliata', () => {
  it('con le chiusure nella tabella non dice più «non c’è ancora niente da cui prevedere»', async () => {
    // Quaranta giornate registrate dalla Cassa, tutte nella tabella nuova.
    stato.righeChiusure = giornateConDettaglio(40)
    // Il blob è quello che vedeva la query vecchia: per Mara non esiste.
    stato.blobUserData = null

    await rendi()

    // Il messaggio del difetto. Con la query vecchia usciva questo, perché il
    // blob era vuoto: quaranta giornate di lavoro lette come zero.
    expect(document.body.textContent).not.toContain("Non c'è ancora niente da cui prevedere")
  })

  it('le chiusure non si chiedono mai a user_data', async () => {
    stato.righeChiusure = giornateConDettaglio(40)
    await rendi()
    expect(stato.toccate).toContain('chiusure_cassa')
    expect(stato.toccate).not.toContain('user_data')
  })

  it('il blob fermo alla migrazione non può più contraddire la tabella', async () => {
    // La fotografia vecchia dice «due giornate senza dettaglio», la tabella
    // dice «quaranta giornate col dettaglio». Vince la tabella.
    stato.blobUserData = {
      data_value: [
        { id: 'ch-1', data: aggiungiGiorni(todayLocal(), -50), prodotti: [] },
        { id: 'ch-2', data: aggiungiGiorni(todayLocal(), -49), prodotti: [] },
      ],
    }
    stato.righeChiusure = giornateConDettaglio(40)
    await rendi()
    expect(document.body.textContent).toContain('La previsione non è ancora stata calcolata')
  })
})

describe('riproduce il difetto: il campo sbagliato', () => {
  it('quaranta giornate con il venduto prodotto per prodotto non sono «senza dettaglio»', async () => {
    stato.righeChiusure = giornateConDettaglio(40)
    await rendi()
    // Questo era il messaggio che usciva prima: «finché manca quel dettaglio
    // questa pagina resta vuota», su chi il dettaglio ce l'aveva.
    expect(document.body.textContent).not.toContain('manca il dettaglio dei prodotti')
    expect(document.body.textContent).toContain('La previsione non è ancora stata calcolata')
  })

  it('accetta anche `confronto`, e i due nomi vecchi delle chiusure nel blob', async () => {
    const forme = [
      { confronto: [{ nome: 'SACHER', venduto: 3 }] },
      { prodotti:  [{ nome: 'SACHER', venduto: 3 }] },
      { righe:     [{ nome: 'SACHER', venduto: 3 }] },
    ]
    for (const forma of forme) {
      stato.toccate = []
      // `extra` è la colonna dove finisce tutto quello che non ha una colonna
      // sua: è da lì che riemergono i campi delle chiusure vecchie.
      stato.righeChiusure = Array.from({ length: 40 }, (_, k) => ({
        ...riga(aggiungiGiorni(todayLocal(), -(k + 1)), []),
        extra: forma,
      }))
      await rendi()
      expect(document.body.textContent).toContain('La previsione non è ancora stata calcolata')
      cleanup()
    }
  })
})

describe('intorno: le altre tre risposte restano quelle giuste', () => {
  it('nessuna chiusura → «non c’è ancora niente da cui prevedere», col bottone per la cassa', async () => {
    stato.righeChiusure = []
    await rendi()
    expect(document.body.textContent).toContain("Non c'è ancora niente da cui prevedere")
    expect(screen.getByText('Vai alla cassa')).toBeTruthy()
  })

  it('chiusure col solo totale → «manca il dettaglio», e dice quante sono', async () => {
    stato.righeChiusure = giornateSoloTotale(12)
    await rendi()
    expect(document.body.textContent).toContain('manca il dettaglio dei prodotti')
    expect(document.body.textContent).toContain('Hai 12 chiusure negli ultimi due mesi')
  })

  it('dodici giornate col dettaglio → «ci sei quasi», ne mancano diciotto', async () => {
    stato.righeChiusure = giornateConDettaglio(12)
    await rendi()
    expect(document.body.textContent).toContain('Ci sei quasi')
    expect(document.body.textContent).toContain('mancano circa 18 giorni')
  })

  it('trenta giornate esatte bastano: non dice più «ci sei quasi»', async () => {
    stato.righeChiusure = giornateConDettaglio(30)
    await rendi()
    expect(document.body.textContent).not.toContain('Ci sei quasi')
    expect(document.body.textContent).toContain('La previsione non è ancora stata calcolata')
  })

  it('le giornate più vecchie di sessanta giorni non contano', async () => {
    // Trenta giornate col dettaglio, ma tutte fuori dalla finestra.
    stato.righeChiusure = Array.from({ length: 30 }, (_, k) =>
      riga(aggiungiGiorni(todayLocal(), -(90 + k)), [{ nome: 'SACHER', venduto: 6 }]))
    await rendi()
    // Ci sono chiusure, quindi non è il caso «niente_chiusure»; ma nella
    // finestra non ce n'è nessuna col dettaglio.
    expect(document.body.textContent).toContain('manca il dettaglio dei prodotti')
    expect(document.body.textContent).toContain('Hai 0 chiusure negli ultimi due mesi')
  })
})

describe('intorno: quando la previsione c’è, la diagnosi non si scomoda', () => {
  it('con le righe di forecast la pagina mostra i prodotti e non chiede le chiusure', async () => {
    stato.forecast = [
      { data: todayLocal(), prodotto: 'SACHER', qta_prevista: 7, qta_min: 5, qta_max: 9, confidence: 0.8, fattori: {} },
    ]
    await rendi()
    expect(stato.toccate).not.toContain('chiusure_cassa')
    expect(stato.toccate).not.toContain('user_data')
    expect(document.body.textContent).toContain('SACHER')
  })
})

describe('righello — il controllo saprebbe accorgersi del difetto', () => {
  it('se la tabella tornasse vuota mentre il blob è pieno, la pagina direbbe «niente chiusure»', async () => {
    // È la situazione di prima della migrazione, rovesciata: serve a
    // dimostrare che questi test distinguono davvero le due fonti, invece di
    // passare comunque.
    stato.righeChiusure = []
    stato.blobUserData = { data_value: giornateConDettaglio(40).map(r => ({ data: r.data, venduto: r.venduto })) }
    await rendi()
    expect(document.body.textContent).toContain("Non c'è ancora niente da cui prevedere")
  })
})
