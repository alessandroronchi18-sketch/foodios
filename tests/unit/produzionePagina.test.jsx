// @vitest-environment happy-dom
//
// ── La pagina Produzione rifatta: il contratto ────────────────────────────
//
// 04/10/2026. L'audit del 03/10 aveva dato 18/100 allo Storico produzione
// (la pagina che Mara vede, perché lavora col metodo inventario). Le critiche
// del titolare: «non capisco cosa guardare, grafici inutili, mancano le cose
// che servono». Sulla pagina, con i dati veri:
//   - quattro tessere senza giudizio («↓ 53,2% vs periodo prec.» in rosso
//     anche quando il calo era un mese non registrato);
//   - la riga «62 giorni registrati…» scritta in piccolo sotto il titolo, e
//     sopra i numeri quattro riquadri gialli (caselle, gusti senza ricetta,
//     gusti senza prezzo, scarto) che spingevano i numeri sotto la piega;
//   - un grafico «Prodotto e venduto per giorno» con tre colori per tre
//     categorie, e una classifica «Top 10» che ripeteva la tabella;
//   - nessuna risposta alle domande che il titolare fa davvero: torna il
//     conto della vetrina? che giorno vendo di più? come vanno i negozi uno
//     accanto all'altro? quale gusto resta in vetrina?
//
// La pagina nuova segue ANALISI_DESIGN.md: la domanda in cima, una riga sola
// su da dove vengono i numeri, ogni numero col suo confronto, i titoli che
// dicono la conclusione, i colori per ruolo, il telefono prima. Questo file
// prova il contratto pezzo per pezzo, sui conti veri delle librerie (niente
// formule rifatte qui dentro: vedi settimaneACavalloDAnno per il perché).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent, within } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const RES = { data: [], error: null }
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(RES)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return { supabase: { from: () => new Proxy({}, h), rpc: () => Promise.resolve({ data: null, error: null }) } }
})
// Un formato solo: 100 g a 3 € = 30 €/kg.
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1'
    ? [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3, componenti: [] }] : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { vociCopertura } = await import('../../src/views/produzione/copertura.js')
const { titoloVetrina } = await import('../../src/views/produzione/ContoVetrina.jsx')
const { confrontoNeutro } = await import('../../src/views/produzione/Tessere.jsx')
const { kgTessera } = await import('../../src/views/produzione/numeri.js')
const { default: AnalisiInventarioSection } = await import('../../src/views/AnalisiInventarioSection.jsx')

afterEach(() => cleanup())
const testo = () => document.body.textContent || ''

// ── 1. La riga «da dove vengono i numeri» ──────────────────────────────────
const LUGLIO_AGOSTO = { n: 62, primo: '2026-07-01', ultimo: '2026-08-31', sedeGiorni: 183 }
const voce = (voci, id) => voci.find(v => v.id === id)

describe('La copertura dei dati: una frase per fonte', () => {
  it('senza giorni registrati non dice niente (lo dice il periodo vuoto)', () => {
    expect(vociCopertura({ copertura: { n: 0 } })).toEqual([])
  })

  it('i giorni registrati, e perché la pagina mostra quei due mesi', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, daPartenza: true }), 'inventario')
    expect(v.stato).toBe('ok')
    expect(v.testo).toBe('62 giorni registrati, dall\'01/07 al 31/08: ti mostro i due mesi fino all\'ultimo giorno registrato')
    expect(v.azione).toBeNull()
  })

  it('se i dati si fermano prima della fine del periodo è «in parte», e porta a registrare', () => {
    const vai = () => {}
    const v = voce(vociCopertura({ copertura: { ...LUGLIO_AGOSTO, n: 29, primo: '2026-08-03' }, registrazioneFerma: true, azioni: { inventario: vai } }), 'inventario')
    expect(v.stato).toBe('parziale')
    expect(v.testo).toMatch(/^29 giorni registrati, dal 03\/08 al 31\/08/)
    expect(v.testo).toMatch(/dopo il 31\/08 non c'è niente di registrato$/)
    expect(v.azione).toEqual({ etichetta: 'Registra', onClick: vai })
  })

  it('un giorno solo si dice al singolare', () => {
    const v = voce(vociCopertura({ copertura: { n: 1, primo: '2026-08-11', ultimo: '2026-08-11', sedeGiorni: 1 } }), 'inventario')
    expect(v.testo).toBe('Un giorno registrato, l\'11/08')
  })

  it('i giorni senza niente stanno dietro un tocco, sede per sede', () => {
    const v = voce(vociCopertura({
      copertura: LUGLIO_AGOSTO,
      buchi: [{ sede: 'Carlina', giorni: ['2026-08-19'] }, { sede: 'De Gasperi', giorni: [] }],
    }), 'inventario')
    expect(v.testo).not.toMatch(/19\/08/)
    expect(v.dettaglio).toMatch(/Carlina 19\/08/)
    expect(v.dettaglio).not.toMatch(/De Gasperi/)
  })

  it('il confronto vero, con le giornate', () => {
    const stesse = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: true, from: '2026-04-30', to: '2026-06-30', giorniPrev: 183 } }), 'confronto')
    expect(stesse.testo).toBe('Confronto con 30/04–30/06, con le stesse giornate registrate')
    const diverse = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: true, from: '2026-04-30', to: '2026-06-30', giorniPrev: 180 } }), 'confronto')
    expect(diverse.testo).toBe('Confronto con 30/04–30/06, 180 giornate registrate contro 183')
  })

  it('il confronto con l\'anno prima dice l\'anno', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: true, from: '2025-07-01', to: '2025-08-31', giorniPrev: 183 } }), 'confronto')
    expect(v.testo).toMatch(/^Confronto con 01\/07–31\/08 del 2025/)
  })

  it('un confronto che non si fa non è una fonte: lo dicono la barra e la tessera', () => {
    const voci = vociCopertura({ copertura: LUGLIO_AGOSTO, confrontoInfo: { ok: false, motivo: 'il periodo di confronto ha 14 giornate registrate, questo 32' } })
    expect(voce(voci, 'confronto')).toBeUndefined()
  })

  it('ricavo e margine si dichiarano stime, con cosa sono fatti', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO }), 'stima')
    expect(v.stato).toBe('stima')
    expect(v.testo).toMatch(/prezzo medio dei formati/)
    expect(v.testo).toMatch(/prezzi di oggi/)
  })

  it('i gusti senza ricetta: quanti chili e quanti euro restano fuori, e il pulsante per collegarli', () => {
    const vai = () => {}
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, senzaRicetta: { n: 10, kgVenduti: 1181.04, euroStimati: 34823.4 }, azioni: { gusti: vai } }), 'senzaRicetta')
    expect(v.testo).toBe('10 gusti senza ricetta: 1.181 kg venduti fuori dal ricavo (circa 34.823 €)')
    expect(v.azione.etichetta).toBe('Collegali')
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, senzaRicetta: { n: 0 } }), 'senzaRicetta')).toBeUndefined()
  })

  it('i gusti con la ricetta ma senza prezzo: la frase è corta, i nomi dietro un tocco', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, incompleti: ['PISTACCHIO', 'MENTA'] }), 'incompleti')
    expect(v.testo).toBe('2 gusti con la ricetta ma senza prezzo o costo completo: margine non calcolato')
    expect(v.dettaglio).toBe('PISTACCHIO e MENTA')
  })

  it('le caselle da sistemare solo se ci sono', () => {
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, caselle: { n: 151 } }), 'caselle').testo).toBe('151 caselle da sistemare nell\'inventario')
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, caselle: { n: 1 } }), 'caselle').testo).toBe('1 casella da sistemare nell\'inventario')
    const senza = vociCopertura({ copertura: LUGLIO_AGOSTO, caselle: { n: 0 } })
    expect(senza.map(v => v.testo).join(' ')).not.toMatch(/da sistemare/)
  })

  it('lo scarto mai scritto «manca», e si dice dove finisce', () => {
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, scartoRegistrato: false }), 'scarto')
    expect(v.stato).toBe('manca')
    expect(v.testo).toBe('lo scarto, quindi quello che si butta è contato nel venduto')
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, scartoRegistrato: true }), 'scarto')).toBeUndefined()
  })
})

// ── 2. Le tessere e il conto della vetrina ─────────────────────────────────
// NOCCIOLA: il 02/08 restano 2 kg; il 03/08 se ne fanno 6 e ne restano 3
// (venduti 5); il 04/08 ne resta 1 (venduti 2). Nel periodo 03-04/08:
// in vetrina all'inizio 2, prodotto 6, venduto 7, alla fine 1.
const RICETTARIO = {
  ingredienti_costi: { latte: { costoKg: 1, costoG: 0.001 }, nocciola: { costoKg: 20, costoG: 0.02 } },
  ricette: {
    NOCCIOLA: { nome: 'NOCCIOLA', tipo: 'gusto', categoria: 'Gusto',
      ingredienti: [{ nome: 'latte', qty1stampo: 800 }, { nome: 'nocciola', qty1stampo: 400 }] },
  },
}
const r = (gusto, data, produzione_g, rimanenza_g, extra = {}) => ({
  sede_id: 's1', gusto_nome: gusto, data, produzione_g, rimanenza_g, scarto_g: 0, spedito_g: 0, ...extra,
})
const NOCCIOLA = [
  r('NOCCIOLA', '2026-08-02', 0, 2000),
  r('NOCCIOLA', '2026-08-03', 6000, 3000),
  r('NOCCIOLA', '2026-08-04', 0, 1000),
]
const apri = (props = {}) => render(
  <AnalisiInventarioSection rows={NOCCIOLA} rowsPrev={[]} dateFrom="2026-08-03" dateTo="2026-08-04"
    confronto="nessuno" ricettario={RICETTARIO} orgId="org-1" sedeId="s1" sedi={[]} {...props} />
)
// Il contenuto di una tessera: l'etichetta e quello che segue.
const tessera = (etichetta) => {
  const el = [...document.querySelectorAll('div')].find(d => d.textContent === etichetta && d.parentElement?.children.length >= 2)
  return el ? el.parentElement.textContent : ''
}

describe('Il titolo del conto della vetrina dice la conclusione', () => {
  it('scesa, salita, com\'era', () => {
    expect(titoloVetrina({ inizioG: 329400, fineG: 267000 })).toBe('La vetrina è scesa da 329 kg a 267 kg: hai venduto più di quanto hai fatto')
    expect(titoloVetrina({ inizioG: 2000, fineG: 9000 })).toBe('La vetrina è salita da 2 kg a 9 kg: hai fatto più di quanto hai venduto')
    expect(titoloVetrina({ inizioG: 100500, fineG: 100800 })).toBe('La vetrina è rimasta com\'era: 101 kg')
  })
  it('i chili delle tessere: interi da 100 in su, un decimale sotto', () => {
    expect(kgTessera(11787.04)).toBe('11.787 kg')
    expect(kgTessera(7.44)).toBe('7,4 kg')
    expect(kgTessera(null)).toBeNull()
  })
  it('il prodotto si confronta senza giudizio, nella riga sotto', () => {
    expect(confrontoNeutro(110, 100, 'periodo prima', kgTessera)).toBe('periodo prima 100 kg (+10%)')
    expect(confrontoNeutro(110, null, 'periodo prima', kgTessera)).toBeNull()
  })
})

describe('La pagina: tessere e vetrina sui conti veri', () => {
  it('il venduto è il numero grande, e porta la media al giorno', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210\s?€/), { timeout: 5000 })
    expect(tessera('Venduto')).toMatch(/^Venduto7 kg/)
    expect(tessera('Venduto')).toMatch(/3,5 kg al giorno registrato, in media/)
    expect(tessera('Prodotto')).toMatch(/^Prodotto6 kg1 gusto$/)
  })

  it('il margine stimato è quello vero, in € e in quota del ricavo', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210\s?€/), { timeout: 5000 })
    // 210 € − 6 kg × 7,33 €/kg = 166 €, il 79% del ricavo.
    expect(tessera('Margine stimato')).toBe('Margine stimato166 €79% del ricavo')
  })

  it('lo scarto mai scritto: «non registrato», non zero', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210\s?€/), { timeout: 5000 })
    expect(tessera('Scarto')).toMatch(/^Scartonon registrato/)
    expect(tessera('Scarto')).not.toMatch(/0 kg/)
  })

  it('con lo scarto scritto mostra i chili e la quota del prodotto', async () => {
    apri({ rows: [NOCCIOLA[0], { ...NOCCIOLA[1], scarto_g: 600 }, NOCCIOLA[2]] })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato/), { timeout: 5000 })
    expect(tessera('Scarto')).toBe('Scarto0,6 kg10% del prodotto')
  })

  it('il confronto: freccia, percentuale, «sul periodo prima» e il valore di prima', async () => {
    // Il periodo prima: stessi giorni, la metà del venduto (3,5 kg).
    // 31/07 restano 1 kg; 01/08 fatti 3, restano 1 (venduti 3); 02/08 resta
    // mezzo chilo (venduto mezzo): 3,5 kg.
    const prima = [r('NOCCIOLA', '2026-07-31', 0, 1000), r('NOCCIOLA', '2026-08-01', 3000, 1000), r('NOCCIOLA', '2026-08-02', 0, 500)]
    apri({ rowsPrev: prima, prevFrom: '2026-08-01', prevTo: '2026-08-02', confronto: 'periodoPrec', confrontoInfo: { ok: true, from: '2026-08-01', to: '2026-08-02', giorniPrev: 2 } })
    await waitFor(() => expect(tessera('Venduto')).toMatch(/sul periodo prima/), { timeout: 5000 })
    expect(tessera('Venduto')).toMatch(/\+100%sul periodo prima\(3,5 kg\)/)
    expect(tessera('Venduto')).toMatch(/meglio/)
    expect(testo()).toMatch(/Confronto con 01\/08–02\/08/)
  })

  it('senza confronto la tessera dice perché, e non mostra frecce', async () => {
    apri({ confronto: 'periodoPrec', confrontoInfo: { ok: false, motivo: 'il periodo di confronto ha 14 giornate registrate, questo 32' } })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    expect(tessera('Venduto')).toMatch(/nessun confronto: il periodo di confronto ha 14 giornate registrate, questo 32/)
    expect(testo()).not.toMatch(/[+−]\d+%/)
  })

  it('il conto della vetrina: c\'era 2, fatto 6, venduto 7, resta 1, e torna', async () => {
    apri()
    await waitFor(() => expect(screen.getByRole('table', { name: 'Il conto della vetrina' })).toBeTruthy(), { timeout: 5000 })
    const righe = within(screen.getByRole('table', { name: 'Il conto della vetrina' })).getAllByRole('row').map(x => x.textContent)
    expect(righe).toEqual([
      'In vetrina all\'inizio2 kg', '+Prodotto6 kg', '−Venduto7 kg', '−Scartonon registrato',
      '=Deve restare1 kg', 'In vetrina alla fine, contato1 kg',
    ])
    expect(testo()).toMatch(/La vetrina è scesa da 2 kg a 1 kg: hai venduto più di quanto hai fatto/)
    expect(testo()).toMatch(/Il conto torna/)
  })

  it('una rimanenza non scritta: il conto dice di quanto non torna, e perché', async () => {
    apri({ rows: [NOCCIOLA[0], NOCCIOLA[1], { ...NOCCIOLA[2], rimanenza_g: null }] })
    await waitFor(() => expect(screen.getByRole('table', { name: 'Il conto della vetrina' })).toBeTruthy(), { timeout: 5000 })
    // Il 04/08 non si sa: venduto 5 (solo il 03), alla fine 3 (l'ultima
    // scritta). Il conto si chiude con la conta del 03, ma il 04 è fuori.
    expect(testo()).toMatch(/Il conto torna, ma in 1 casella manca la rimanenza/)
  })

  it('se in quel giorno si era anche prodotto, il conto non torna di quei chili', async () => {
    apri({ rows: [NOCCIOLA[0], NOCCIOLA[1], { ...NOCCIOLA[2], produzione_g: 2000, rimanenza_g: null }] })
    await waitFor(() => expect(screen.getByRole('table', { name: 'Il conto della vetrina' })).toBeTruthy(), { timeout: 5000 })
    // c'era 2 + fatto 8 − venduto 5 = 5; contato alla fine 3: mancano 2 kg.
    expect(testo()).toMatch(/Non tornano 2 kg: in 1 casella manca la rimanenza/)
  })

  it('il pulsante per aprire l\'inventario è alto 44 px', async () => {
    const onBack = vi.fn()
    apri({ onBack })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    const b = screen.getByRole('button', { name: /Apri l'inventario/ })
    expect(b.style.minHeight).toBe('44px')
    fireEvent.click(b)
    expect(onBack).toHaveBeenCalled()
  })
})
