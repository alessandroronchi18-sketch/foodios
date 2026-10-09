// Il registro incassi di settembre 2026 di Marama (Berthollet e De Gasperi),
// letto in automatico. Difetti scoperti il 09/10/2026 sul file vero:
//
//  1. il nome «INCASSI MARAMA SETEMBRE 2026» (una T sola) non dava il mese;
//  2. 62 chiusure invece di 60: la riga del «31» (formule a 0,00) diventava il
//     «31 settembre», che non esiste;
//  3. «MACCH.NER.20,4;MINIMARKET238(F)» = 258,40 € veniva diviso a metà
//     (129,20 + 129,20) perché l'importo sta in coda al nome;
//  4. «F)» da sola in una cella (27,37 €) usciva come descrizione «F)»;
//  5. la spesa copiata nell'intestazione della colonna e la nota dello
//     scontrino annullato (2.230 €, 3/9) non erano segnalate.
//
// Il file vero è nella fixture JSON (celle così come le legge il lettore).

import { describe, it, expect } from 'vitest'
import righe from './dati/registroIncassiSettembre2026.json'
import luglio from './dati/registroIncassiLuglio2026.json'
import {
  estraiIncassi, annoMeseDaNomeFile, rilevaPeriodo, meseDaParola, giorniNelMese, spesaDaCella,
} from '../../src/lib/importIncassi'

const somma = (a, f) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100) / 100

describe('il mese dal nome del file', () => {
  it('capisce «SETEMBRE» scritto con una T sola', () => {
    expect(annoMeseDaNomeFile('INCASSI MARAMA SETEMBRE 2026.xlsx')).toBe('2026-09')
  })
  it('capisce abbreviazioni e refusi vicini', () => {
    expect(annoMeseDaNomeFile('incassi sett 2026.xlsx')).toBe('2026-09')
    expect(annoMeseDaNomeFile('Incassi OTTOBE 2026.xlsx')).toBe('2026-10')
    expect(annoMeseDaNomeFile('registro agost 2026.xlsx')).toBe('2026-08')
  })
  it('il nome dell\'azienda non è un mese', () => {
    expect(meseDaParola('MARAMA')).toBe(-1)
    expect(meseDaParola('incassi')).toBe(-1)
    expect(annoMeseDaNomeFile('INCASSI MARAMA 2026.xlsx')).toBeNull()
  })
})

describe('il periodo da tutte le fonti', () => {
  it('nome del file con il mese: nessun dubbio', () => {
    const p = rilevaPeriodo({ nomeFile: 'INCASSI MARAMA SETEMBRE 2026.xlsx', nomiFogli: ['Foglio1'], righe })
    expect(p.annoMese).toBe('2026-09')
    expect(p.dubbio).toBeNull()
  })
  it('nome senza mese: lo prende dalla nota con la data dentro il foglio', () => {
    const p = rilevaPeriodo({ nomeFile: 'incassi.xlsx', nomiFogli: ['Foglio1'], righe })
    expect(p.annoMese).toBe('2026-09')
    expect(p.fonte).toMatch(/testo/)
  })
  it('il mese è nel nome del foglio', () => {
    const p = rilevaPeriodo({ nomeFile: 'incassi.xlsx', nomiFogli: ['Agosto 2026'], righe: [] })
    expect(p.annoMese).toBe('2026-08')
  })
  it('fonti che non concordano: lo dice', () => {
    const p = rilevaPeriodo({ nomeFile: 'INCASSI OTTOBRE 2026.xlsx', righe })
    expect(p.annoMese).toBe('2026-10')
    expect(p.dubbio).toMatch(/settembre 2026/)
  })
  it('niente da nessuna parte: non inventa', () => {
    const p = rilevaPeriodo({ nomeFile: 'incassi.xlsx', righe: [['GIORNO', 'POS'], [1, 10]] })
    expect(p.annoMese).toBe('')
    expect(p.dubbio).toBeTruthy()
  })
  it('giorni dei mesi', () => {
    expect(giorniNelMese('2026-09')).toBe(30)
    expect(giorniNelMese('2026-02')).toBe(28)
    expect(giorniNelMese('2028-02')).toBe(29)
    expect(giorniNelMese('2026-10')).toBe(31)
  })
})

describe('le giornate del file di settembre', () => {
  const r = estraiIncassi(righe, '2026-09')

  it('60 chiusure (30 giorni × 2 sedi), nessun 31 settembre', () => {
    expect(r.chiusure.length).toBe(60)
    expect(r.chiusure.some(c => c.data === '2026-09-31')).toBe(false)
  })
  it('i totali tornano con la riga TOTALE MESE del foglio', () => {
    const b = r.chiusure.filter(c => c.sede === 'Berthollet')
    const d = r.chiusure.filter(c => c.sede === 'De Gasperi')
    expect(somma(b, c => c.totale)).toBe(39604.18)
    expect(somma(d, c => c.totale)).toBe(44985.4)
    expect(somma(b, c => c.delivery || 0)).toBe(2685)
    expect(somma(d, c => c.delivery || 0)).toBe(4181.2)
    expect(r.avvisi.some(a => a.tipo === 'totale_mese_non_quadra')).toBe(false)
  })
  it('il delivery non entra nel totale della giornata (misura, non decisione)', () => {
    const c = r.chiusure.find(x => x.sede === 'Berthollet' && x.data === '2026-09-01')
    expect(c.totale).toBe(1161.9)
    expect(c.delivery).toBe(158)
  })
  it('una giornata col 31 vero in un mese da 31 giorni resta', () => {
    const riga31 = righe.map(x => [...x])
    expect(estraiIncassi(riga31, '2026-10').chiusure.length).toBe(60)
  })
})

describe('le uscite di cassa', () => {
  const r = estraiIncassi(righe, '2026-09')
  const b = r.movimenti.filter(m => m.sede === 'Berthollet')
  const d = r.movimenti.filter(m => m.sede === 'De Gasperi')

  it('i totali tornano con la riga TOT del foglio', () => {
    expect(somma(b, m => m.importo)).toBe(364.33)
    expect(somma(d, m => m.importo)).toBe(332.13)
  })
  it('«MACCH.NER.20,4;MINIMARKET238(F)» si divide in 20,40 e 238, non a metà', () => {
    const del15 = b.filter(m => m.data === '2026-09-15').map(m => m.importo).sort((x, y) => x - y)
    expect(del15).toEqual([20.4, 238])
    expect(b.filter(m => m.data === '2026-09-15').every(m => m.documento === 'fattura')).toBe(true)
  })
  it('«F)» da sola è una spesa con fattura, senza descrizione, e viene segnalata', () => {
    const m = d.find(x => x.data === '2026-09-08')
    expect(m.importo).toBe(27.37)
    expect(m.documento).toBe('fattura')
    expect(m.descrizione).toBe('spesa non descritta')
    expect(r.avvisi.some(a => a.tipo === 'spesa_da_controllare' && /27,37/.test(a.messaggio))).toBe(true)
  })
  it('«anguria,olio(no F)» resta una voce sola senza fattura', () => {
    const m = d.find(x => x.data === '2026-09-01')
    expect(m).toMatchObject({ importo: 16.68, documento: 'senza' })
  })
  it('la spesa scritta sopra la colonna non diventa una spesa in più, ma è segnalata', () => {
    expect(b.length).toBe(8)
    const a = r.avvisi.find(x => x.tipo === 'intestazione_con_spesa')
    expect(a.messaggio).toMatch(/giorno 15/)
  })
  it('intorno: pezzi con importo davanti e notazione per pezzo restano com\'erano', () => {
    const v = spesaDaCella(33.7, '10,5 anguria(noF);23,2 carta(F)')
    expect(v.map(x => [x.importo, x.documento])).toEqual([[10.5, 'senza'], [23.2, 'fattura']])
    expect(spesaDaCella(10, 'limoni (No F)')[0].documento).toBe('senza')
    // il numero in coda non è un importo se la somma non torna col totale
    const w = spesaDaCella(50, 'coop 2;bar 3')
    expect(w.reduce((s, x) => s + x.importo, 0)).toBe(50)
    expect(w.some(x => x.importo === 2)).toBe(false)
  })
})

describe('lo scontrino annullato', () => {
  it('la nota è segnalata con sede, giorno e importo, e dice se il totale lo contiene', () => {
    const a = estraiIncassi(righe, '2026-09').avvisi.find(x => x.tipo === 'scontrino_annullato')
    expect(a).toMatchObject({ sede: 'Berthollet', data: '2026-09-03', importo: 2230 })
    expect(a.messaggio).toMatch(/non è dentro/)
  })
})

describe('ogni file vale per le sedi che nomina', () => {
  it('un registro con una sola sede produce chiusure solo di quella sede', () => {
    const una = righe.map(x => x.slice(0, 4))
    const sedi = new Set(estraiIncassi(una, '2026-09').chiusure.map(c => c.sede))
    expect(sedi.has('De Gasperi')).toBe(false)
  })
  it('un mese da 28 giorni: niente giornate 29-31', () => {
    const r = estraiIncassi(righe, '2026-02')
    expect(Math.max(...r.chiusure.map(c => Number(c.data.slice(8))))).toBe(28)
    expect(r.avvisi.some(a => a.tipo === 'giorno_fuori_mese')).toBe(true)
  })
})

describe('il registro di luglio (mese da 31 giorni, formato vecchio) non si rompe', () => {
  const r = estraiIncassi(luglio, '2026-07')
  it('62 chiusure: il 31 luglio esiste', () => {
    expect(r.chiusure.length).toBe(62)
    expect(r.chiusure.some(c => c.data === '2026-07-31')).toBe(true)
  })
  it('i totali tornano con la riga TOTALE MESE', () => {
    expect(somma(r.chiusure.filter(c => c.sede === 'Berthollet'), c => c.totale)).toBe(52193.78)
    expect(r.avvisi.some(a => a.tipo === 'totale_mese_non_quadra' && !/uscite/.test(a.messaggio))).toBe(false)
  })
  it('la nota «annullo di 3000 euro in data 20 luglio» è segnalata col giorno giusto', () => {
    const a = r.avvisi.find(x => x.tipo === 'scontrino_annullato')
    expect(a).toMatchObject({ sede: 'Berthollet', data: '2026-07-20', importo: 3000 })
  })
})
