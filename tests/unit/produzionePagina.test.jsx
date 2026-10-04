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
// Un formato solo: 100 g a 3,30 € = 33 €/kg al banco, 30 €/kg senza IVA
// (04/10/2026: il ricavo stimato è senza IVA, come il Mese).
vi.mock('../../src/lib/storage', () => ({
  sload: async (k) => (k === 'pasticceria-formati-vendita-v1'
    ? [{ id: 'f1', nome: 'Coppetta', categoria: 'Gusto', baseQtaG: 100, prezzoDefault: 3.3, componenti: [] }] : null),
  ssave: async () => {}, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))

const { vociCopertura } = await import('../../src/views/produzione/copertura.js')
const { titoloVetrina, sottotitoloVetrina } = await import('../../src/views/produzione/ContoVetrina.jsx')
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

  it('il calendario dei giorni si apre da qui', () => {
    const vai = () => {}
    const v = voce(vociCopertura({ copertura: LUGLIO_AGOSTO, registrazioneFerma: true, azioni: { inventario: () => {}, giorni: vai } }), 'inventario')
    expect(v.azione).toEqual({ etichetta: 'Vedi i giorni', onClick: vai })
    expect(voce(vociCopertura({ copertura: LUGLIO_AGOSTO, azioni: { giorni: vai, giorniAperti: true } }), 'inventario').azione.etichetta).toBe('Chiudi i giorni')
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
    // Dal 04/10 quei chili sono nel ricavo (decisione del titolare): restano fuori dal margine.
    expect(v.testo).toBe('10 gusti senza ricetta: 1.181 kg venduti fuori dal margine (circa 34.823 € di ricavo senza IVA)')
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
    // Dieci parole al massimo (ANALISI_DESIGN.md §6); il perché nel sottotitolo.
    expect(titoloVetrina({ inizioG: 329400, fineG: 267000 })).toBe('La vetrina è scesa da 329 kg a 267 kg')
    expect(sottotitoloVetrina({ inizioG: 329400, fineG: 267000 })).toMatch(/^Hai venduto più di quanto hai fatto\. /)
    expect(titoloVetrina({ inizioG: 2000, fineG: 9000 })).toBe('La vetrina è salita da 2 kg a 9 kg')
    expect(sottotitoloVetrina({ inizioG: 2000, fineG: 9000 })).toMatch(/^Hai fatto più di quanto hai venduto\. /)
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
    // Qui il confronto è «nessuno», scelto dall'utente: la riga del confronto
    // c'è (pezzo comune, tessere incolonnate) ma resta vuota; «nessun
    // confronto» si scrive solo quando un confronto era atteso e manca
    // (prova «se un confronto era atteso e non c'è» più sotto).
    expect(tessera('Margine stimato')).toBe('Margine stimato166 €79% del ricavo senza IVA dei gusti con ricetta')
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
      'In vetrina all\'inizio2,0 kg', '+Prodotto6,0 kg', '−Venduto7,0 kg', '−Scartonon registrato',
      '=Deve restare1,0 kg', 'In vetrina alla fine, contato1,0 kg',
    ])
    expect(testo()).toMatch(/La vetrina è scesa da 2 kg a 1 kgHai venduto più di quanto hai fatto\./)
    // Non «Il conto torna»: il venduto si calcola da questa riga, torna per
    // costruzione (difetto del 04/10, trovato sui dati veri prima di pubblicare).
    expect(testo()).toMatch(/Il venduto è proprio questa differenza/)
    expect(testo()).not.toMatch(/Il conto torna/)
  })

  it('una rimanenza non scritta: il conto dice di quanto non torna, e perché', async () => {
    apri({ rows: [NOCCIOLA[0], NOCCIOLA[1], { ...NOCCIOLA[2], rimanenza_g: null }] })
    await waitFor(() => expect(screen.getByRole('table', { name: 'Il conto della vetrina' })).toBeTruthy(), { timeout: 5000 })
    // Il 04/08 non si sa: venduto 5 (solo il 03), alla fine 3 (l'ultima
    // scritta). Il conto si chiude con la conta del 03, ma il 04 è fuori.
    expect(testo()).toMatch(/I chili tornano, ma in 1 casella manca la rimanenza/)
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

// ── 3. Il venduto per settimana e il giorno della settimana ────────────────
const { colonneVenduto, titoloVenduto, conclusioneVenduto } = await import('../../src/views/produzione/colonneVenduto.js')
const { titoloGiorni } = await import('../../src/views/produzione/GiornoSettimana.jsx')

/** Una riga al giorno: 5 kg fatti, 1 kg lasciato (dal secondo giorno: 5 kg venduti). */
function giorni(da, a, salta = []) {
  const out = []
  const t = new Date(`${da}T12:00:00Z`)
  const fine = new Date(`${a}T12:00:00Z`)
  while (t <= fine) {
    const d = t.toISOString().slice(0, 10)
    if (!salta.includes(d)) out.push(r('NOCCIOLA', d, 5000, 1000))
    t.setUTCDate(t.getUTCDate() + 1)
  }
  return out
}

describe('Le colonne del grafico: intere e non intere', () => {
  // Il 30/06 è il giorno prima del periodo: serve solo come vetrina di partenza.
  const righe = giorni('2026-06-30', '2026-07-19')
  const reg = { primo: '2026-07-01', ultimo: '2026-07-19' }

  it('la settimana tagliata dal periodo (parte di mercoledì) va nella serie in ambra', () => {
    const c = colonneVenduto(righe, { da: '2026-07-01', a: '2026-07-19', passo: 'settimana', registrati: reg })
    expect(c.map(x => [x.key, x.label, x.intera])).toEqual([
      ['2026-W27', '29/06', false], ['2026-W28', '06/07', true], ['2026-W29', '13/07', true],
    ])
    // 01-05/07: cinque giorni da 5 kg. Una serie o l'altra, mai tutte e due.
    expect(c[0].vend).toBe(0)
    expect(c[0].vendParziale).toBeCloseTo(25, 6)
    expect(c[1].vend).toBeCloseTo(35, 6)
    expect(c[1].vendParziale).toBe(0)
    expect(c[1].prod).toBeCloseTo(35, 6)
  })

  it('la settimana tagliata dai giorni registrati (i dati si fermano di mercoledì) anche', () => {
    const c = colonneVenduto(giorni('2026-06-30', '2026-07-15'), { da: '2026-07-01', a: '2026-07-19', passo: 'settimana', registrati: { primo: '2026-07-01', ultimo: '2026-07-15' } })
    expect(c.find(x => x.key === '2026-W29').intera).toBe(false)
    expect(c.find(x => x.key === '2026-W28').intera).toBe(true)
  })

  it('la settimana tagliata dai dati (il periodo parte di lunedì, i dati di mercoledì) è in ambra', () => {
    const c = colonneVenduto(righe, { da: '2026-06-29', a: '2026-07-19', passo: 'settimana', registrati: reg })
    expect(c.find(x => x.key === '2026-W27').intera).toBe(false)
    expect(c.find(x => x.key === '2026-W28').intera).toBe(true)
  })

  it('un giorno di chiusura dentro la settimana non la rende incompleta', () => {
    const c = colonneVenduto(giorni('2026-06-30', '2026-07-19', ['2026-07-08']), { da: '2026-07-01', a: '2026-07-19', passo: 'settimana', registrati: reg })
    const w28 = c.find(x => x.key === '2026-W28')
    expect(w28.intera).toBe(true)
    expect(w28.giorni).toBe(6)
  })

  it('i mesi: luglio tagliato a metà è in ambra, agosto intero no', () => {
    const tutto = giorni('2026-07-14', '2026-08-31')
    const c = colonneVenduto(tutto, { da: '2026-07-15', a: '2026-08-31', passo: 'mese', registrati: { primo: '2026-07-15', ultimo: '2026-08-31' } })
    expect(c.map(x => [x.key, x.label, x.intera])).toEqual([['2026-07', 'lug', false], ['2026-08', 'ago', true]])
  })

  it('i giorni sono sempre interi, con l\'etichetta del giorno', () => {
    const c = colonneVenduto(righe, { da: '2026-07-01', a: '2026-07-03', passo: 'giorno', registrati: reg })
    expect(c.map(x => [x.label, x.intera])).toEqual([['01/07', true], ['02/07', true], ['03/07', true]])
  })
})

describe('Il titolo del grafico dice la conclusione, sulle colonne intere', () => {
  const col = (dal, vend, intera = true) => ({ key: dal, dal, label: dal, vend: intera ? vend : 0, vendParziale: intera ? 0 : vend, intera })
  it('la settimana migliore e la peggiore, senza contare quelle non intere', () => {
    const c = [col('2026-06-29', 50, false), col('2026-07-06', 1654.2), col('2026-07-13', 900.2), col('2026-08-31', 10, false)]
    expect(conclusioneVenduto(c, 'settimana')).toEqual({ titolo: 'La settimana migliore è quella del 06/07: 1.654 kg', dettaglio: 'La più bassa, quella del 13/07: 900 kg.', forte: '2026-07-06' })
  })
  it('i mesi per nome', () => {
    expect(conclusioneVenduto([{ ...col('2026-07-01', 6900), key: '2026-07' }, { ...col('2026-08-01', 4800), key: '2026-08' }], 'mese'))
      .toEqual({ titolo: 'Il mese migliore è luglio: 6.900 kg', dettaglio: 'Il più basso, agosto: 4.800 kg.', forte: '2026-07' })
  })
  it('una settimana intera sola, o nessuna', () => {
    expect(titoloVenduto([col('2026-07-06', 35)], 'settimana')).toBe('La settimana del 06/07: 35 kg venduti')
    expect(titoloVenduto([col('2026-07-06', 35, false)], 'settimana')).toBe('Nessuna settimana intera nel periodo')
  })
})

describe('Che giorno si vende di più', () => {
  const g = (giorno, nome, kgMedi, n) => ({ giorno, nome, mediaG: kgMedi == null ? null : kgMedi * 1000, nGiorni: n })
  it('il titolo nomina il giorno migliore e il peggiore, con l\'articolo giusto', () => {
    const sett = [g(1, 'Lunedì', 197.7, 3), g(2, 'Martedì', 145.1, 3), g(4, 'Giovedì', 69.6, 3), g(7, 'Domenica', 190, 3)]
    expect(titoloGiorni(sett)).toBe('Il lunedì vendi di più: 198 kg al giorno')
    expect(titoloGiorni([g(7, 'Domenica', 300, 2), g(1, 'Lunedì', 100, 2)])).toBe('La domenica vendi di più: 300 kg al giorno')
    expect(sottotitoloGiorni(sett)).toBe('Il giorno più basso è il giovedì: 69,6 kg. Venduto medio di ogni giorno della settimana, sui giorni registrati.')
  })
  it('un giorno visto una volta sola non decide il titolo', () => {
    expect(titoloGiorni([g(1, 'Lunedì', 500, 1), g(2, 'Martedì', 100, 3), g(3, 'Mercoledì', 120, 3)]))
      .toBe('Il mercoledì vendi di più: 120 kg al giorno')
    expect(titoloGiorni([g(1, 'Lunedì', 500, 1)])).toBe('Il venduto di ogni giorno della settimana')
  })
})

describe('La pagina: il grafico e i giorni', () => {
  it('all\'apertura il grafico è per settimana e le scelte stanno dietro un pulsante', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    const menu = screen.getByRole('button', { name: /^Raggruppa il grafico/ })
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(menu.textContent).toMatch(/per settimana/)
    expect(screen.queryByRole('button', { name: 'Mese' })).toBeNull()
    fireEvent.click(menu)
    fireEvent.click(screen.getByRole('button', { name: 'Mese' }))
    expect(screen.getByRole('button', { name: /^Raggruppa il grafico/ }).textContent).toMatch(/per mese/)
    expect(testo()).toMatch(/Chili venduti per mese/)
  })

  it('i sette giorni della settimana, con «nessun giorno» dove non si sa', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    const giorniLista = screen.getAllByRole('listitem').filter(li => /^(Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica):/.test(li.getAttribute('aria-label') || ''))
    expect(giorniLista.length).toBe(7)
    // 03/08 lunedì: 5 kg; 04/08 martedì: 2 kg. Gli altri giorni non registrati.
    expect(giorniLista[0].getAttribute('aria-label')).toBe('Lunedì: 5 kg al giorno, su un giorno')
    expect(giorniLista[2].textContent).toMatch(/nessun giorno/)
    // «non registrato» nella pagina vuol dire solo lo scarto mai scritto.
    expect(giorniLista[2].textContent).not.toMatch(/non registrato/)
  })

  it('i numeri del grafico, a richiesta, in tabella', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Vedi i numeri in tabella' }))
    expect(testo()).toMatch(/dal 03\/08 al 09\/08 \(non intera\)/)
  })
})

// ── 4. Le sedi affiancate e la tabella per gusto ───────────────────────────
const { righeGusti, ordinaGusti, classificaGusti } = await import('../../src/views/produzione/righeGusti.js')
const { titoloSedi } = await import('../../src/views/produzione/SediAffiancate.jsx')
const { titoloClassifica } = await import('../../src/views/produzione/ClassificaGusti.jsx')

describe('Le sedi una accanto all\'altra', () => {
  const s = (nome, venduto, giorni) => ({ nome, vendutoG: venduto * 1000, giorni })
  it('stessi giorni: chi vende di più e quanto pesa sul totale', () => {
    expect(titoloSedi([s('Carlina', 5068.5, 61), s('De Gasperi', 3491.1, 61), s('Berthollet', 3227.5, 61)]))
      .toBe('Carlina vende di più: 5.069 kg, il 43% del totale')
  })
  it('giorni diversi: si confronta il venduto di un giorno registrato', () => {
    // Berthollet ha registrato metà dei giorni: col totale sembrerebbe la più piccola.
    expect(titoloSedi([s('Carlina', 600, 60), s('Berthollet', 400, 30)]))
      .toBe('Berthollet vende di più: 13,3 kg per giorno registrato')
  })
  it('una sede sola non ha confronto', () => {
    expect(titoloSedi([s('Carlina', 600, 60)])).toBe('Le sedi una accanto all\'altra')
  })
})

describe('Le righe della tabella', () => {
  const valutate = [
    { gusto: 'A', vendKg: 10, prodKg: 9, margine: 50 },
    { gusto: 'B', vendKg: 30, prodKg: 31, margine: null },
    { gusto: 'C', vendKg: 0, prodKg: 0, margine: null },
    { gusto: 'D', vendKg: 20, prodKg: 20, margine: 80 },
  ]
  const andamento = {
    settimane: ['2026-W27', '2026-W28', '2026-W29'],
    gusti: { A: { perSettimana: [1000, 4000, 5000], quotaVenduta: 111.1, giorniVetrina: 0.9 } },
  }
  it('un gusto senza movimenti non è una riga', () => {
    expect(righeGusti(valutate, andamento).map(r => r.gusto)).toEqual(['A', 'B', 'D'])
  })
  it('l\'andamentino usa solo le settimane intere, in chili', () => {
    const [a] = righeGusti(valutate, andamento, new Set(['2026-W28', '2026-W29']))
    expect(a.serie).toEqual([null, 4, 5])
    expect(a.quotaVenduta).toBe(111.1)
    expect(a.giorniVetrina).toBe(0.9)
  })
  it('un margine che non si sa va in fondo in tutti e due i versi', () => {
    const r = righeGusti(valutate, andamento)
    expect(ordinaGusti(r, 'margine', 'desc').map(x => x.gusto)).toEqual(['D', 'A', 'B'])
    expect(ordinaGusti(r, 'margine', 'asc').map(x => x.gusto)).toEqual(['A', 'D', 'B'])
    expect(ordinaGusti(r, 'vendKg', 'desc').map(x => x.gusto)).toEqual(['B', 'D', 'A'])
    expect(r.map(x => x.gusto)).toEqual(['A', 'B', 'D'])
  })
  it('il titolo della classifica nomina il gusto più venduto e la sua quota', () => {
    expect(titoloClassifica(classificaGusti(righeGusti(valutate, andamento)))).toBe('B è il più venduto: 30 kg, il 50%')
  })
  it('la classifica: i primi sette e «Altri», mai «Altri 1 gusto»', () => {
    const tanti = 'ABCDEFGHIJ'.split('').map((g, i) => ({ gusto: g, vendKg: 100 - i * 10, prodKg: 1 }))
    const cl = classificaGusti(tanti, 7)
    expect(cl.voci.map(v => v.gusto)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    // H, I, J: 30 + 20 + 10 = 60 kg su 550.
    expect(cl.altri).toEqual({ n: 3, kg: 60, quota: (60 / 550) * 100 })
    const otto = classificaGusti(tanti.slice(0, 8), 7)
    expect(otto.voci.length).toBe(8)
    expect(otto.altri).toBeNull()
  })
})

describe('La pagina: sedi e tabella', () => {
  const DUE_SEDI = [...NOCCIOLA, ...NOCCIOLA.map(x => ({ ...x, sede_id: 's2', produzione_g: x.produzione_g / 2, rimanenza_g: x.rimanenza_g / 2 }))]
  const SEDI = [{ id: 's1', nome: 'Carlina' }, { id: 's2', nome: 'De Gasperi' }]

  it('con due sedi le mette affiancate, con la quota di ognuna', async () => {
    apri({ rows: DUE_SEDI, sedeId: null, sedi: SEDI })
    await waitFor(() => expect(testo()).toMatch(/Carlina vende di più: 7 kg, il 66,7% del totale/), { timeout: 5000 })
    expect(testo()).toMatch(/De Gasperi3,5 kg33,3% del venduto/)
    expect(testo()).toMatch(/Tutte le sedi · /)
  })

  it('con una sede sola non c\'è il riquadro delle sedi', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    expect(testo()).not.toMatch(/vende di più/)
  })

  it('all\'arrivo la classifica, la tabella dietro un tocco', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/NOCCIOLA è il più venduto: 7 kg, il 100%/), { timeout: 5000 })
    expect(screen.queryByRole('columnheader', { name: 'Gusto' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Vedi la tabella del gusto: vetrina, costo, margine' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('la tabella ha le colonne che un gelatiere chiede a un gusto', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Vedi (tutti i \d+ gusti|la tabella del gusto)/ }))
    const intestazioni = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(intestazioni).toEqual(['Gusto', 'Venduto kg', 'Prodotto kg', 'Venduto su prodotto', 'Giorni in vetrina', 'Andamento', 'Ricavo stimato', 'Costo al kg', 'Margine stimato'])
    const riga = screen.getByRole('rowheader', { name: 'NOCCIOLA' }).parentElement
    // 7 venduti su 6 fatti: 116,7%; resta in vetrina 2 kg in media (03: 3,
    // 04: 1) su 3,5 venduti al giorno: 0,6 giorni. Costo 8,80 € / 1,2 kg.
    // Margine 166 € = 79%.
    // Stessi decimali in tutta la colonna (§6): «7,0», non «7».
    expect(riga.textContent).toMatch(/NOCCIOLA7,06,0116,7%0,6/)
    expect(riga.textContent).toMatch(/210 €7,33 €\/kg166 € · 79,0%/)
  })

  it('si ordina toccando l\'intestazione, e lo dice', async () => {
    apri({ rows: [...NOCCIOLA, ...NOCCIOLA.map(x => ({ ...x, gusto_nome: 'AMARENA', produzione_g: x.produzione_g * 2, rimanenza_g: x.rimanenza_g * 2 }))] })
    await waitFor(() => expect(testo()).toMatch(/AMARENA è il più venduto/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Vedi (tutti i \d+ gusti|la tabella del gusto)/ }))
    const nomi = () => screen.getAllByRole('rowheader').map(h => h.textContent).filter(t => t !== 'Totale')
    expect(nomi()).toEqual(['AMARENA', 'NOCCIOLA'])
    const gusto = screen.getByRole('columnheader', { name: 'Gusto' })
    fireEvent.click(within(gusto).getByRole('button'))
    expect(nomi()).toEqual(['AMARENA', 'NOCCIOLA'])
    expect(gusto.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(gusto).getByRole('button'))
    expect(nomi()).toEqual(['NOCCIOLA', 'AMARENA'])
  })
})

// ── 5. Dove guardare: le frasi ─────────────────────────────────────────────
const { frasiProduzione } = await import('../../src/views/produzione/frasi.js')
const { righeEsportazione } = await import('../../src/views/produzione/esporta.js')

describe('Le frasi dicono dove guardare, solo quando i numeri le reggono', () => {
  const g = (gusto, vendKg, extra = {}) => ({ gusto, vendKg, prodKg: vendKg, giorniVetrina: 1, margPct: null, margine: null, ricavo: 0, fcKg: null, ...extra })
  const dieci = 'ABCDEFGHIJ'.split('').map((x, i) => g(x, 100 - i * 5))

  it('il gusto che resta in vetrina 3 giorni o più, e gli altri', () => {
    const f = frasiProduzione({ righe: [g('PISTACCHIO', 20, { giorniVetrina: 4.2 }), g('MENTA', 30, { giorniVetrina: 3 }), g('FIORDILATTE', 50, { giorniVetrina: 0.8 })] })
    expect(f.find(x => x.id === 'vetrina').testo).toBe('PISTACCHIO resta in vetrina 4,2 giorni in media: se ne fa più di quanto se ne vende. Anche MENTA')
  })
  it('sotto i 3 giorni, o con meno di 5 kg venduti, niente frase', () => {
    expect(frasiProduzione({ righe: [g('A', 20, { giorniVetrina: 2.9 })] }).find(x => x.id === 'vetrina')).toBeUndefined()
    expect(frasiProduzione({ righe: [g('A', 4, { giorniVetrina: 9 })] }).find(x => x.id === 'vetrina')).toBeUndefined()
  })
  it('i primi cinque gusti, con la quota del venduto', () => {
    // 100+95+90+85+80 = 450 su 775.
    expect(frasiProduzione({ righe: dieci }).find(x => x.id === 'primi').testo)
      .toBe('I cinque gusti più venduti fanno il 58,1% del venduto (450 kg): A, B, C, D e E')
    expect(frasiProduzione({ righe: dieci.slice(0, 5) }).find(x => x.id === 'primi')).toBeUndefined()
  })
  it('chi rende meno, solo se è almeno 5 punti sotto la media', () => {
    const m = (gusto, margPct) => g(gusto, 10, { ricavo: 300, margine: 3 * margPct, margPct, fcKg: 9.1 })
    const f = frasiProduzione({ righe: [m('A', 85), m('B', 84), m('MENTA', 70)] })
    expect(f.find(x => x.id === 'margine').testo).toBe('MENTA rende il 70% del ricavo, il meno di tutti (la media è 79,7%): costa 9,10 € al kg')
    expect(frasiProduzione({ righe: [m('A', 85), m('B', 84), m('C', 82)] }).find(x => x.id === 'margine')).toBeUndefined()
  })
  it('il ricavo che resta fuori, con l\'azione per collegare', () => {
    const f = frasiProduzione({ righe: [], senzaRicetta: { n: 10, euroStimati: 34823.4 } })
    expect(f[0]).toEqual({ id: 'senzaRicetta', verso: 'azione', azione: 'gusti', testo: '10 gusti senza ricetta valgono circa 34.823 € di ricavo senza IVA che restano fuori dal margine: collegandoli alla ricetta il margine li conta' })
    expect(frasiProduzione({ righe: [], senzaRicetta: { n: 1, euroStimati: 210 } })[0].testo).toMatch(/^1 gusto senza ricetta vale circa 210 €/)
  })
  it('al massimo quattro', () => {
    const tutte = frasiProduzione({ righe: [...dieci, g('Z', 20, { giorniVetrina: 5 })], senzaRicetta: { n: 1, euroStimati: 10 } })
    expect(tutte.length).toBeLessThanOrEqual(4)
  })
})

describe('Il file Excel', () => {
  const totali = { prod: 6, vend: 7, scarto: 0, ricavo: 210, fc: 44, margine: 166, margPct: 79.0476 }
  const riga = { gusto: 'NOCCIOLA', prodKg: 6, vendKg: 7, scartoKg: 0, ricavoKg: 30, ricavo: 210, fcKg: 7.3333, fc: 44, margine: 166, margPct: 79.0476 }
  it('una riga per gusto con le colonne nuove, e il totale', () => {
    const r = righeEsportazione({ righe: [riga], totali, scartoRegistrato: false, andamento: { gusti: { NOCCIOLA: { quotaVenduta: 116.666, giorniVetrina: 0.571 } } } })
    expect(r[0]).toEqual(['Gusto', 'Prodotto kg', 'Venduto kg', 'Venduto su prodotto %', 'Giorni in vetrina', 'Scarto kg (non registrato)', 'Ricavo/kg € senza IVA', 'Ricavo € senza IVA', 'Costo al kg €', 'Food cost €', 'Margine €', 'Margine %'])
    expect(r[1]).toEqual(['NOCCIOLA', 6, 7, 116.7, 0.6, '', 30, 210, 7.33, 44, 166, 79])
    expect(r[2]).toEqual(['Totale', 6, 7, 116.7, '', '', '', 210, '', 44, 166, 79])
  })
  it('un margine che non si sa resta vuoto, non 100', () => {
    const r = righeEsportazione({ righe: [{ ...riga, margine: null, margPct: null }], totali: { ...totali, margine: null, margPct: null }, scartoRegistrato: true })
    expect(r[1].slice(-2)).toEqual(['', ''])
    expect(r[2].slice(-2)).toEqual(['', ''])
    expect(r[0][5]).toBe('Scarto kg')
  })
})

describe('La pagina: le frasi', () => {
  it('il gusto senza ricetta porta al collegamento', async () => {
    apri({ rows: [...NOCCIOLA, ...NOCCIOLA.map(x => ({ ...x, gusto_nome: 'MISTIC' }))] })
    await waitFor(() => expect(testo()).toMatch(/Dove guardare/), { timeout: 5000 })
    expect(testo()).toMatch(/1 gusto senza ricetta vale circa 210 € di ricavo senza IVA che restano fuori dal margine/)
    expect(screen.getByRole('button', { name: /1 gusto senza ricetta vale/ })).toBeTruthy()
  })
})

// ── 6. Il giorno della settimana falsato (difetto trovato il 04/10/2026) ───
// Sui dati veri 01/07-31/08 il titolo diceva «Il martedì vendi di più (272
// kg al giorno), il giovedì di meno (96,9 kg)». Ma le rimanenze lasciate a 0
// nel giorno della produzione cadono quasi tutte di martedì e mercoledì: il
// martedì prende chili del mercoledì, il mercoledì del giovedì. La pagina
// adesso misura i chili spostati (lib giorniFalsati) e non conclude sui
// giorni falsati.
const { sottotitoloGiorni } = await import('../../src/views/produzione/GiornoSettimana.jsx')

describe('Il titolo dei giorni non conclude sui giorni falsati', () => {
  // I numeri veri di Mara, 01/07-31/08 (media al giorno, giornate, chili presi e persi).
  const g = (giorno, nome, kgMedi, n, presi = 0, persi = 0, falsato = false) =>
    ({ giorno, nome, mediaG: kgMedi * 1000, nGiorni: n, presiKg: presi, persiKg: persi, spostatiKg: presi + persi, falsato })
  const MARA = [
    g(1, 'Lunedì', 187.5, 9, 180, 0, true), g(2, 'Martedì', 271.8, 8, 574.5, 180, true),
    g(3, 'Mercoledì', 166.2, 9, 592.7, 574.5, true), g(4, 'Giovedì', 96.9, 9, 111.3, 592.7, true),
    g(5, 'Venerdì', 180.6, 9, 61.3, 111.3), g(6, 'Sabato', 214.8, 9, 1.2, 61.3), g(7, 'Domenica', 222, 9, 10.4, 1.2),
  ]
  it('con quattro giorni falsati il titolo dice che non si confrontano (non «il martedì vendi di più»)', () => {
    expect(titoloGiorni(MARA)).toBe('4 giorni su 7 non si possono confrontare')
    expect(titoloGiorni(MARA)).not.toMatch(/martedì vendi di più/)
  })
  it('il sottotitolo conta ogni casella una volta', () => {
    // I chili persi: 180 + 574,5 + 592,7 + 111,3 + 61,3 + 1,2 = 1.521 kg (con
    // anche i presi sarebbero il doppio).
    expect(sottotitoloGiorni(MARA)).toBe('Lunedì, martedì, mercoledì e giovedì: la rimanenza lasciata a 0 fa contare almeno 1.521 kg il giorno prima del vero. Venduto medio di ogni giorno della settimana, sui giorni registrati. A righe ambra i giorni falsati.')
  })
  it('con uno o due giorni falsati conclude sugli altri, e lo dice', () => {
    const due = MARA.map(x => ({ ...x, falsato: x.nome === 'Martedì' || x.nome === 'Mercoledì' }))
    expect(titoloGiorni(due)).toBe('La domenica vendi di più: 222 kg al giorno')
    expect(sottotitoloGiorni(due)).toMatch(/^Il giorno più basso è il giovedì: 96,9 kg\. Martedì e mercoledì sono falsati dalla rimanenza lasciata a 0 \(in tutto almeno 1\.521 kg contati il giorno prima del vero\): restano fuori dal confronto\. /)
  })
  it('senza giorni falsati il sottotitolo non parla di ambra', () => {
    expect(sottotitoloGiorni(MARA.map(x => ({ ...x, falsato: false, presiKg: 0, persiKg: 0 })))).not.toMatch(/ambra/)
  })
})

describe('La pagina segna i giorni falsati', () => {
  // Due settimane: ogni giorno 5 kg fatti e 1 kg lasciato, ma il martedì la
  // rimanenza è rimasta a 0 e il mercoledì non si produce (resta 1 kg): il
  // martedì «vende» 6 kg, il mercoledì −1 kg.
  const righe = []
  const t = new Date('2026-08-02T12:00:00Z')
  for (let i = 0; i < 15; i++) {
    const d = t.toISOString().slice(0, 10)
    const wd = t.getUTCDay()
    righe.push(wd === 2 ? r('NOCCIOLA', d, 5000, 0) : wd === 3 ? r('NOCCIOLA', d, 0, 1000) : r('NOCCIOLA', d, 5000, 1000))
    t.setUTCDate(t.getUTCDate() + 1)
  }
  it('martedì e mercoledì in ambra, e il titolo non li usa', async () => {
    apri({ rows: righe, dateFrom: '2026-08-03', dateTo: '2026-08-16' })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato/), { timeout: 5000 })
    const voce = (nome) => screen.getAllByRole('listitem').find(li => (li.getAttribute('aria-label') || '').startsWith(`${nome}:`))
    expect(voce('Martedì').getAttribute('aria-label')).toMatch(/falsato: almeno 2 kg contati nel giorno sbagliato/)
    expect(voce('Mercoledì').getAttribute('aria-label')).toMatch(/falsato/)
    expect(voce('Lunedì').getAttribute('aria-label')).not.toMatch(/falsato/)
    expect(testo()).not.toMatch(/Il martedì vendi di più/)
    expect(testo()).toMatch(/Martedì e mercoledì sono falsati dalla rimanenza lasciata a 0 \(in tutto almeno 2 kg contati il giorno prima del vero\): restano fuori dal confronto/)
  })
})

// ── 7. Le sedi in pannelli uguali (ricerca del 04/10, scelta 10) ───────────
const { pannelliSedi } = await import('../../src/views/produzione/pannelliSedi.js')
const { trattiSerie } = await import('../../src/views/produzione/SediAffiancate.jsx')

describe('I pannelli delle sedi', () => {
  // Due sedi, tre settimane piene (29/06-19/07, con la vetrina del 28/06):
  // la seconda vende la metà e smette di registrare il 15/07.
  const giorniSede = (sede, da, a, prod, riman) => {
    const out = []
    const t = new Date(`${da}T12:00:00Z`)
    while (t <= new Date(`${a}T12:00:00Z`)) { out.push({ ...r('NOCCIOLA', t.toISOString().slice(0, 10), prod, riman), sede_id: sede }); t.setUTCDate(t.getUTCDate() + 1) }
    return out
  }
  const righe = [...giorniSede('s1', '2026-06-28', '2026-07-19', 5000, 1000), ...giorniSede('s2', '2026-06-28', '2026-07-15', 2500, 500)]
  const sedi = [
    { sedeId: 's1', nome: 'Carlina', primo: '2026-06-29', ultimo: '2026-07-19' },
    { sedeId: 's2', nome: 'Berthollet', primo: '2026-06-29', ultimo: '2026-07-15' },
  ]
  const p = pannelliSedi(righe, { da: '2026-06-29', a: '2026-07-19' }, sedi)

  it('le stesse settimane per tutte le sedi, e la stessa scala', () => {
    expect(p.settimane.map(w => w.dal)).toEqual(['2026-06-29', '2026-07-06', '2026-07-13'])
    expect(p.sedi[0].serie).toEqual([35, 35, 35])
    // La settimana del 13/07 di Berthollet è tagliata (si ferma il 15): un buco, non un calo.
    expect(p.sedi[1].serie).toEqual([17.5, 17.5, null])
    expect(p.max).toBe(35)
  })
  it('la linea si spezza dove manca la settimana', () => {
    expect(trattiSerie([10, null, 10], 10).length).toBe(2)
    expect(trattiSerie([10, 5, 10], 10)).toHaveLength(1)
    // Stessa scala: il massimo in alto, la metà a metà.
    const [[[, alto], [, meta]]] = trattiSerie([10, 5], 10)
    expect(alto).toBeLessThan(meta)
  })
  it('nella pagina: un pannello per sede, il nome dentro, «registrato fino al» per chi si ferma prima', async () => {
    apri({ rows: righe, dateFrom: '2026-06-29', dateTo: '2026-07-19', sedeId: null, sedi: [{ id: 's1', nome: 'Carlina' }, { id: 's2', nome: 'Berthollet' }] })
    await waitFor(() => expect(screen.getByRole('img', { name: 'Carlina: venduto per settimana' })).toBeTruthy(), { timeout: 5000 })
    expect(screen.getByRole('img', { name: 'Berthollet: venduto per settimana' })).toBeTruthy()
    expect(testo()).toMatch(/registrato fino al 15\/07/)
    // Giorni diversi: il titolo confronta il venduto per giorno registrato.
    expect(testo()).toMatch(/Carlina vende di più: 5 kg per giorno registrato/)
  })
})

// ── 8. Il calendario dei giorni e i buchi dentro il grafico (scelta 6) ─────
const { calendarioGiorni, titoloCalendario } = await import('../../src/views/produzione/calendario.js')

describe('Il calendario da muro dei giorni registrati', () => {
  // Agosto 2026 comincia di sabato. Carlina registra 1-4/08, De Gasperi solo 1-2/08.
  const righe = [
    ...['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(d => ({ ...r('NOCCIOLA', d, 1000, 0), sede_id: 'c' })),
    ...['2026-08-01', '2026-08-02'].map(d => ({ ...r('NOCCIOLA', d, 1000, 0), sede_id: 'd' })),
    // Una riga tutta a zero non è un giorno registrato (la regola di tutta la pagina).
    { ...r('NOCCIOLA', '2026-08-05', 0, 0), sede_id: 'c' },
  ]
  const cal = calendarioGiorni(righe, { da: '2026-07-30', a: '2026-08-05', sedi: ['c', 'd'] })

  it('un blocco per mese, sette colonne da lunedì, i giorni prima del primo lasciati vuoti', () => {
    expect(cal.mesi.map(m => m.chiave)).toEqual(['2026-07', '2026-08'])
    // 30/07 è giovedì: tre caselle vuote davanti, e dopo il 31 la settimana si chiude vuota.
    expect(cal.mesi[0].settimane[0].map(c => c && c.data)).toEqual([null, null, null, '2026-07-30', '2026-07-31', null, null])
    // 01/08 è sabato.
    expect(cal.mesi[1].settimane[0].map(c => c && c.data)).toEqual([null, null, null, null, null, '2026-08-01', '2026-08-02'])
    expect(cal.mesi[1].settimane.every(s => s.length === 7)).toBe(true)
  })
  it('pieno se tutte le sedi hanno registrato, «parziale» se solo qualcuna, vuoto se nessuna', () => {
    const stato = Object.fromEntries(cal.mesi.flatMap(m => m.settimane.flat()).filter(Boolean).map(c => [c.data, c.stato]))
    expect(stato).toEqual({
      '2026-07-30': 'vuoto', '2026-07-31': 'vuoto', '2026-08-01': 'registrato', '2026-08-02': 'registrato',
      '2026-08-03': 'parziale', '2026-08-04': 'parziale', '2026-08-05': 'vuoto',
    })
    expect(cal.conteggio).toEqual({ registrati: 2, parziali: 2, vuoti: 3, totale: 7 })
  })
  it('con una sede sola un giorno registrato è pieno', () => {
    const una = calendarioGiorni(righe.filter(x => x.sede_id === 'c'), { da: '2026-08-03', a: '2026-08-04', sedi: ['c'] })
    expect(una.conteggio.registrati).toBe(2)
  })
  it('il titolo: quanti giorni su quanti', () => {
    expect(titoloCalendario(cal.conteggio, { piuSedi: true })).toBe('2 giorni registrati su 7, in tutte le sedi')
    expect(titoloCalendario({ registrati: 62, totale: 62 })).toBe('Registrati tutti i 62 giorni del periodo')
  })
  it('nella pagina si apre da «Vedi i giorni», con una casella per giorno', async () => {
    apri()
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato210/), { timeout: 5000 })
    expect(screen.queryByRole('grid')).toBeNull()
    // «Vedi i giorni» sta nella copertura, che all'apertura è chiusa (04/10, C1):
    // prima si apre la riga, poi il pulsante.
    fireEvent.click(within(screen.getByRole('region', { name: 'Da dove vengono i numeri' })).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Vedi i giorni' }))
    const grid = screen.getByRole('grid', { name: 'Giorni registrati di agosto 2026' })
    expect(within(grid).getAllByRole('gridcell').map(c => c.getAttribute('aria-label'))).toEqual(['03/08: registrato', '04/08: registrato'])
    expect(screen.getByRole('button', { name: 'Chiudi i giorni' })).toBeTruthy()
  })
})

describe('Dopo l\'ultimo giorno registrato il grafico mostra il buco', () => {
  const righe = giorni('2026-07-31', '2026-08-31')
  const reg = { primo: '2026-08-01', ultimo: '2026-08-31' }
  it('le settimane senza niente fino a oggi ci sono, vuote, e non contano nel titolo', () => {
    const c = colonneVenduto(righe, { da: '2026-08-01', a: '2026-10-03', passo: 'settimana', registrati: reg, finoA: '2026-09-20' })
    const vuote = c.filter(x => x.vuota)
    // 31/08 è lunedì: la settimana del 31/08 ha un giorno (non intera); poi 07/09 e 14/09 vuote.
    expect(vuote.map(x => x.label)).toEqual(['07/09', '14/09'])
    expect(c.find(x => x.label === '31/08')).toMatchObject({ intera: false, vuota: false })
    expect(conclusioneVenduto(c, 'settimana').titolo).toMatch(/^La settimana migliore è quella del/)
  })
  it('senza `finoA`, o con i dati fino alla fine, niente colonne vuote', () => {
    expect(colonneVenduto(righe, { da: '2026-08-01', a: '2026-10-03', passo: 'settimana', registrati: reg }).some(x => x.vuota)).toBe(false)
    expect(colonneVenduto(righe, { da: '2026-08-01', a: '2026-08-31', passo: 'settimana', registrati: reg, finoA: '2026-08-31' }).some(x => x.vuota)).toBe(false)
  })
  it('anche per mese', () => {
    const c = colonneVenduto(righe, { da: '2026-08-01', a: '2026-10-03', passo: 'mese', registrati: reg, finoA: '2026-10-03' })
    expect(c.map(x => [x.label, x.vuota])).toEqual([['ago', false], ['set', true], ['ott', true]])
  })
})

// ── 9. Dalle foto del 04/10: colonne incolonnate, comandi in fondo ─────────
const { numFisso, kgFisso, quotaFissa } = await import('../../src/views/produzione/numeri.js')

describe('Stessi decimali in tutta la colonna (ANALISI_DESIGN.md §6)', () => {
  it('«865,0» sotto «874,2», «101,0%» sotto «100,2%», il meno vero', () => {
    expect(numFisso(865)).toBe('865,0')
    expect(numFisso(1130.66)).toBe('1.130,7')
    expect(kgFisso(1)).toBe('1,0 kg')
    expect(kgFisso(188.4, 0)).toBe('188 kg')
    expect(quotaFissa(101)).toBe('101,0%')
    expect(quotaFissa(-6.94)).toBe('−6,9%')
    expect(numFisso(null)).toBeNull()
  })
})

describe('All\'arrivo i numeri, i comandi in fondo', () => {
  it('«Apri l\'inventario» ed «Esporta Excel» vengono dopo la classifica, non in testa', async () => {
    apri({ onBack: () => {} })
    await waitFor(() => expect(testo()).toMatch(/NOCCIOLA è il più venduto/), { timeout: 5000 })
    const apriInv = screen.getByRole('button', { name: /Apri l'inventario/ })
    const titolo = screen.getByRole('heading', { level: 2 })
    const classifica = screen.getByRole('list', { name: 'Gusti più venduti' })
    // DOCUMENT_POSITION_FOLLOWING = 4: il pulsante viene dopo.
    expect(titolo.compareDocumentPosition(apriInv) & 4).toBe(4)
    expect(classifica.compareDocumentPosition(apriInv) & 4).toBe(4)
    expect(classifica.compareDocumentPosition(screen.getByRole('button', { name: /Esporta Excel/ })) & 4).toBe(4)
  })
})

// ── 10. Dopo i pezzi comuni nuovi (04/10): la riga chiusa e il confronto ───
// Dal 04/10 la riga la scrive il pezzo comune (riassuntoCopertura), con la
// regola che prima stava qui: «da sistemare» solo per le voci `sistemabile`.
const { riassuntoCopertura: riassuntoSistemabili } = await import('../../src/components/analisi/CoperturaDati.jsx')

describe('La riga chiusa della copertura dice «da sistemare» solo di quello che si sistema', () => {
  // Il riassunto comune contava ogni voce non «ok» come «dati da sistemare»:
  // con lo scarto mai scritto (che all'indietro non si sistema) e un gusto
  // senza ricetta diceva «2 dati da sistemare» anche senza nessuna casella
  // storta (rimanenzaAZeroGiornoGiusto, «senza caselle storte non dice niente»).
  it('i dati di Mara: le stime e le cose da sistemare per nome, lo scarto per nome', () => {
    const voci = vociCopertura({
      copertura: LUGLIO_AGOSTO, scartoRegistrato: false, caselle: { n: 359 },
      senzaRicetta: { n: 14, kgVenduti: 3496.9, euroStimati: 103114 },
    })
    expect(riassuntoSistemabili(voci)).toBe('Ricavo e margine stimati · 14 gusti senza ricetta · 359 caselle da sistemare · scarto mai scritto')
  })
  it('senza caselle storte la parola «da sistemare» non compare', () => {
    const voci = vociCopertura({ copertura: LUGLIO_AGOSTO, scartoRegistrato: false, senzaRicetta: { n: 1, kgVenduti: 7, euroStimati: 210 } })
    expect(riassuntoSistemabili(voci)).toBe('Ricavo e margine stimati · 1 gusto senza ricetta · scarto mai scritto')
  })
  it('con più di due cose da sistemare le conta, ma solo quelle', () => {
    const voci = vociCopertura({
      copertura: LUGLIO_AGOSTO, registrazioneFerma: true, scartoRegistrato: false, caselle: { n: 3 },
      senzaRicetta: { n: 2, kgVenduti: 10, euroStimati: 300 }, incompleti: ['MENTA'],
    })
    expect(riassuntoSistemabili(voci)).toBe('Ricavo e margine stimati · 4 dati da sistemare · scarto mai scritto')
  })
  it('tutto a posto', () => {
    expect(riassuntoSistemabili([{ id: 'x', stato: 'ok', testo: 'ok' }])).toBe('Tutti i dati ci sono')
  })
})

describe('La risposta grande e il confronto atteso', () => {
  it('il venduto è il numero principale della pagina, e i dati fermi si dicono accanto', async () => {
    apri({ dateTo: '2026-08-20' })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato/), { timeout: 5000 })
    const risposta = screen.getByRole('region', { name: 'Venduto' })
    expect(risposta.textContent).toMatch(/^Venduto7 kg/)
    expect(risposta.textContent).toMatch(/Registrato fino al 04\/08: dopo non c'è niente\./)
  })
  it('se un confronto era atteso e non c\'è, la riga lo dice; se l\'utente non lo vuole, resta vuota', async () => {
    apri({ confronto: 'periodoPrec', confrontoInfo: { ok: false, motivo: 'il periodo di confronto ha 14 giornate registrate, questo 32' } })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato/), { timeout: 5000 })
    expect(screen.getByRole('region', { name: 'Venduto' }).textContent).toMatch(/nessun confronto: il periodo di confronto ha 14 giornate registrate, questo 32/)
    expect(tessera('Ricavo stimato')).toMatch(/nessun confronto/)
    // Il prodotto non ha giudizio: niente «nessun confronto», niente freccia.
    expect(tessera('Prodotto')).not.toMatch(/nessun confronto/)
    cleanup()
    apri({ confronto: 'nessuno' })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato/), { timeout: 5000 })
    expect(testo()).not.toMatch(/nessun confronto/)
  })
})

// ── 11. Il ricavo stimato è lo stesso numero di tutte le pagine (04/10) ────
// Decisione del titolare: tutti i chili venduti per il prezzo medio dei
// formati, con l'ingrosso al suo fatturato, come il Mese e «Torna il
// conto?» (prova d'insieme in ricavoStimatoUguale). Il margine resta sui
// gusti con la ricetta, e la tessera dice cosa resta fuori.
describe('La tessera del ricavo e quella del margine', () => {
  const DUE = [...NOCCIOLA, ...NOCCIOLA.map(x => ({ ...x, gusto_nome: 'MISTIC' }))]
  it('il gusto senza ricetta è nel ricavo e fuori dal margine, e lo si dice', async () => {
    apri({ rows: DUE })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato420/), { timeout: 5000 })
    expect(tessera('Ricavo stimato')).toMatch(/senza IVA \(10%\) · tutti i chili × 33,00 €\/kg al banco$/)
    expect(tessera('Margine stimato')).toBe('Margine stimato166 €79% del ricavo senza IVA dei gusti con ricetta · su 1 gusto su 2; fuori 7 kg, circa 210 €')
  })
  it('l\'ingrosso vale il suo fatturato, non il prezzo del banco', async () => {
    apri({ rows: DUE, venditeB2B: [{ sede_id: 's1', data: '2026-08-03', totale: 22, stato: 'consegnata', righe: [{ qta: 1, unita: 'kg' }] }] })
    // 14 kg − 1 all'ingrosso = 13 × 33 € + 22 € fatturati = 451 € con l'IVA,
    // 410 € senza (il fatturato passa per la stessa funzione, come nel Mese).
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato410/), { timeout: 5000 })
    expect(tessera('Ricavo stimato')).toMatch(/ingrosso 20 € fatturati$/)
  })
  it('la colonna del ricavo della tabella somma alla tessera', async () => {
    apri({ rows: DUE })
    await waitFor(() => expect(testo()).toMatch(/Ricavo stimato420/), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /^Vedi (tutti i \d+ gusti|la tabella del gusto)/ }))
    const totale = screen.getAllByRole('rowheader').find(h => h.textContent === 'Totale').parentElement
    expect(totale.textContent).toMatch(/420 €/)
    expect(screen.getByRole('rowheader', { name: /MISTIC/ }).parentElement.textContent).toMatch(/210 €/)
  })
  it('il confronto del ricavo è col ricavo stimato del periodo prima, con la stessa regola', async () => {
    const prima = [r('NOCCIOLA', '2026-07-31', 0, 1000), r('NOCCIOLA', '2026-08-01', 3000, 1000), r('NOCCIOLA', '2026-08-02', 0, 500)]
    apri({ rows: DUE, rowsPrev: prima, prevFrom: '2026-08-01', prevTo: '2026-08-02', confronto: 'periodoPrec', confrontoInfo: { ok: true, from: '2026-08-01', to: '2026-08-02', giorniPrev: 2 } })
    // Prima: 3,5 kg × 30 € = 105 €; adesso 420 €: +300%.
    await waitFor(() => expect(tessera('Ricavo stimato')).toMatch(/\+300%sul periodo prima\(105 €\)/), { timeout: 5000 })
  })
})
