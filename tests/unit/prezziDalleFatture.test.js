// ── I prezzi delle materie prime, dalle righe delle fatture ──────────────
//
// Il difetto, 03/10/2026. Il titolare sta caricando gli ZIP dell'Agenzia
// delle Entrate: 3.104 fatture passive 2023-2026 ricevono il dettaglio riga
// per riga (prodotto, quantità, unità, prezzo). La pagina Integrazioni
// prometteva che da lì sarebbero arrivati i prezzi delle materie prime, e
// **nessuna parte di Foodos leggeva quelle righe**: il listino restava quello
// battuto a mano, e lo storico dei prezzi con 46 righe tutte di fine 2025.
//
// La scelta del titolare: «abbini una volta». Fornitore + descrizione si
// abbinano a una materia prima una sola volta, poi ogni fattura aggiorna
// listino e storico da sé.
//
// Strada facendo sono saltati fuori tre difetti nel motore delle bolle, che
// le fatture usano così com'è — e che le fatture avrebbero fatto pagare:
//
//   1. **Un numero letto come testo.** `prezzoAlKgDaRiga` passava gli importi
//      dal lettore italiano, che li trasformava in testo: 3.125 € diventava
//      «3.125», cioè 3.125 euro. Dalla foto arriva testo e non si vedeva;
//      dalle fatture elettroniche arriva sempre un numero, e il prezzo
//      unitario ha spesso tre decimali.
//   2. **Le unità internazionali.** «KGM», «LTR», «PCE» nel campo
//      UnitaMisura davano «unità di misura sconosciuta» a ogni riga.
//   3. **Il tetto di 500 righe di storico**, in tre posti, tagliava le righe
//      scritte prima (i prezzi messi a mano) invece delle più vecchie per
//      data. Tre anni di fatture lo avrebbero sfondato al primo colpo.
//
// Qui si prova anche quello che c'è intorno: lo storico ricostruito deve dare
// il prezzo giusto **a ogni data** (è da lì che il P&L di un mese passato
// rifà il food cost), riapplicare non deve doppiare niente, una nota di
// credito non è un prezzo d'acquisto, uno scostamento sospetto non passa da
// solo.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  prezzoAlKgDaRiga, normalizzaUnita, applicaCambiAlListino, tagliaStorico, TETTO_STORICO,
} from '../../src/lib/bolle'
import { getPrezzoStoricoKg } from '../../src/lib/foodcost'
import {
  leggiAbbinamenti, abbina, ignoraAcquisto, normDescrizione, chiaveGruppo, eNotaDiCredito,
  contoRigaFattura, raggruppaRigheFatture, suggerisciMateria, decidiPrezziDaFatture,
  contaGruppi, filtraGruppi, fraseDopoAbbinamento, chiaviMaterie,
} from '../../src/lib/prezziDaFatture'
import { origineInParole, filtraStorico } from '../../src/views/StoricoPrezziSection.jsx'
import { aggiornaPrezziDopoImport, EVENTO_PREZZI_SCRITTI } from '../../src/lib/prezziDaFattureArchivio'
import { fraseEsitoXml, avvisiEsitoXml } from '../../src/lib/importaFattureXml'

// ── Le forme vere ───────────────────────────────────────────────────────

const CONO = 'CONO ARTIC COMMERCIALE SRL'
const DESA = 'DESA SRL'

let seq = 0
/** Una fattura come la legge la sezione dal database. */
const fattura = (fornitore, numero, data, righe, extra = {}) => ({
  id: `f${++seq}`, numero_rif: numero, data_fattura: data, fornitore, tipo: 'fattura',
  totale: Math.round(righe.reduce((s, r) => s + (Number(r.totale) || 0), 0) * 110) / 100,
  righe, ...extra,
})
/** Una riga come la scrive `parseFatturaXML`. */
const riga = (descrizione, quantita, unita, totale, extra = {}) => ({
  n: 1, codice: null, descrizione, quantita, unita,
  prezzo_unitario: quantita ? Math.round((totale / quantita) * 10000) / 10000 : null,
  totale, iva_pct: 10, ...extra,
})

const PANNA = 'PANNA FRESCA 35% UHT'
const kPanna = chiaveGruppo(CONO, PANNA)
const conPanna = abbina(null, kPanna, { tipo: 'materia', chiave: 'panna', nome: 'panna' })

/** Il prezzo a mano di fine 2025, com'è nello storico vero di Mara. */
const manuale = (ingrediente, prezzo, giorno = '2025-12-31') => ({
  id: `lp-man-${ingrediente}`, data: '2026-09-17T10:00:00.000Z', decorre_da: `${giorno}T00:00:00.000Z`,
  ingrediente, prezzoVecchio: null, prezzoNuovo: prezzo, delta: prezzo, deltaPct: null, utente: 'titolare@x.it',
})

const pannaA = (data, prezzoKg, numero = data) => fattura(CONO, numero, data, [riga(PANNA, 10, 'KG', prezzoKg * 10)])

// ── 1. I difetti del motore delle bolle ─────────────────────────────────

describe('Il motore delle bolle legge le fatture elettroniche', () => {
  it('un numero con tre decimali resta quel numero, non mille volte tanto', () => {
    // Sul codice di prima: 3.125 → «3.125» → 3.125 euro al chilo.
    const r = prezzoAlKgDaRiga({ nome: 'cacao', quantita: 2, unita: 'kg', prezzoUnitario: 3.125 })
    expect(r.prezzoKg).toBe(3.125)
    expect(r.ambiguo).toBe(false)
  })

  it('e come controprova non grida a un errore che non c\'è', () => {
    const r = prezzoAlKgDaRiga({ nome: 'cacao', quantita: 8, unita: 'kg', imponibile: 25, prezzoUnitario: 3.125 })
    expect(r.prezzoKg).toBe(3.125)
    expect(r.avvisi.join(' ')).not.toMatch(/non torna/)
  })

  it('il testo scritto a mano resta letto all\'italiana, col dubbio dichiarato', () => {
    const r = prezzoAlKgDaRiga({ nome: 'cacao', quantita: 2, unita: 'kg', prezzoUnitario: '3.125' })
    expect(r.prezzoKg).toBe(3125)
    expect(r.ambiguo).toBe(true)
  })

  it('un numero negativo resta una nota di credito', () => {
    const r = prezzoAlKgDaRiga({ nome: 'cacao', quantita: 2, unita: 'kg', imponibile: -6.25 })
    expect(r.prezzoKg).toBeNull()
    expect(r.problema).toMatch(/nota di credito/)
  })

  it('le unità internazionali della fattura elettronica', () => {
    expect(normalizzaUnita('KGM')).toBe('kg')
    expect(normalizzaUnita('GRM')).toBe('g')
    expect(normalizzaUnita('LTR')).toBe('l')
    expect(normalizzaUnita('MLT')).toBe('ml')
    for (const u of ['PCE', 'C62', 'NAR', 'BT', 'CRT']) expect(normalizzaUnita(u), u).toBe('pz')
    // E quello che non si conosce resta «non lo so».
    expect(normalizzaUnita('XYZ')).toBeNull()
    expect(normalizzaUnita('KG')).toBe('kg')
  })
})

describe('Il tetto dello storico taglia per data, non per ordine di scrittura', () => {
  const riga = (i, giorno, ingrediente = `m${i}`) => ({ id: `r${i}`, ingrediente, decorre_da: `${giorno}T00:00:00.000Z` })

  it('sotto il tetto non si tocca niente', () => {
    const log = [riga(1, '2025-01-01'), riga(2, '2024-01-01')]
    expect(tagliaStorico(log, 5)).toBe(log)
  })

  it('sopra il tetto escono le più vecchie per data, anche se stanno in cima', () => {
    // In cima le righe scritte per ultime ma vecchie (lo storico ricostruito
    // da fatture del 2024), in fondo quelle a mano del 2025.
    const log = [
      riga(1, '2024-01-01', 'panna'), riga(2, '2024-02-01', 'panna'), riga(3, '2024-03-01', 'panna'),
      riga(4, '2025-12-31', 'latte'), riga(5, '2025-12-31', 'zucchero'),
    ]
    const t = tagliaStorico(log, 3)
    expect(t.map(r => r.id)).toEqual(['r3', 'r4', 'r5'])
  })

  it('l\'ultima riga di ogni materia prima non esce mai', () => {
    const log = [riga(1, '2026-01-01', 'panna'), riga(2, '2020-01-01', 'cacao'), riga(3, '2021-01-01', 'panna'), riga(4, '2022-01-01', 'panna')]
    const t = tagliaStorico(log, 2)
    expect(t.map(r => r.id)).toEqual(['r1', 'r2'])
  })

  it('con 600 righe nello storico, una bolla non ne butta via cento (prima: tetto 500)', () => {
    const vecchio = Array.from({ length: 600 }, (_, i) => riga(i, '2025-06-01', `m${i}`))
    const r = applicaCambiAlListino([{ chiave: 'burro', nome: 'burro', prezzoKg: 9.5, prezzoAttuale: 9, azione: 'applica' }],
      { ingredientiCosti: {}, logPrezzi: vecchio, origine: { tipo: 'bolla' } })
    expect(r.logPrezzi).toHaveLength(601)
    expect(TETTO_STORICO).toBeGreaterThanOrEqual(5000)
  })

  it('nel Dashboard non è rimasto il vecchio taglio a 500', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'Dashboard.jsx'), 'utf8')
    expect(src).not.toMatch(/\.slice\(0,\s*500\)/)
    expect((src.match(/tagliaStorico\(\[entry/g) || []).length).toBe(2)
  })
})

// ── 2. Le chiavi e la mappa ─────────────────────────────────────────────

describe('La stessa merce dello stesso fornitore è un gruppo solo', () => {
  it('maiuscole, accenti, punteggiatura e forma societaria non contano', () => {
    expect(chiaveGruppo('CONO ARTIC COMMERCIALE S.R.L.', 'Panna fresca 35 % – UHT'))
      .toBe(chiaveGruppo(CONO, PANNA))
    expect(normDescrizione('Caffè  Etiopia')).toBe('caffe etiopia')
  })

  it('il formato invece conta: il sacco da 25 non è quello da 10', () => {
    expect(chiaveGruppo(CONO, 'FARINA 00 SACCO 25 KG')).not.toBe(chiaveGruppo(CONO, 'FARINA 00 SACCO 10 KG'))
  })

  it('stessa descrizione, fornitore diverso: due gruppi', () => {
    expect(chiaveGruppo(CONO, PANNA)).not.toBe(chiaveGruppo(DESA, PANNA))
  })

  it('senza descrizione o senza fornitore non c\'è gruppo', () => {
    expect(chiaveGruppo(CONO, '  ')).toBeNull()
    expect(chiaveGruppo('', PANNA)).toBeNull()
  })

  it('la mappa: abbina, «non è una materia prima», togli, e un valore storto vale vuota', () => {
    let m = abbina(null, 'a|b', { tipo: 'materia', chiave: 'panna', nome: 'Panna', pesoConfezioneG: 0 }, { utente: 'u', adesso: 'T' })
    expect(m.gruppi['a|b']).toEqual({ tipo: 'materia', chiave: 'panna', nome: 'Panna', il: 'T', utente: 'u' })
    m = abbina(m, 'c|d', { tipo: 'no' }, { adesso: 'T' })
    expect(m.gruppi['c|d'].tipo).toBe('no')
    m = abbina(m, 'a|b', null)
    expect(m.gruppi['a|b']).toBeUndefined()
    expect(leggiAbbinamenti('rotto')).toEqual({ versione: 1, gruppi: {}, ignorate: {} })
    expect(leggiAbbinamenti([1, 2]).gruppi).toEqual({})
    const i = ignoraAcquisto(m, 'x#panna', { adesso: 'T' })
    expect(i.ignorate['x#panna']).toEqual({ il: 'T', utente: null })
    expect(ignoraAcquisto(i, 'x#panna', { togli: true }).ignorate).toEqual({})
  })
})

describe('Le note di credito', () => {
  it('le riconosce dal tipo e dal totale negativo (WebDesk)', () => {
    expect(eNotaDiCredito({ tipo: 'nota_credito', totale: 50 })).toBe(true)
    expect(eNotaDiCredito({ tipo: 'fattura', totale: -10 })).toBe(true)
    expect(eNotaDiCredito({ tipo: 'fattura', totale: 10 })).toBe(false)
    expect(eNotaDiCredito({ tipo: 'fattura', totale: null })).toBe(false)
  })
})

// ── 3. Il conto di una riga ─────────────────────────────────────────────

describe('Il prezzo al chilo di una riga di fattura', () => {
  it('in chili: il totale di riga diviso i chili', () => {
    const c = contoRigaFattura(riga(PANNA, 10, 'KG', 49.8))
    expect(c.prezzoKg).toBe(4.98)
    expect(c.spiegazione.join(' ')).toMatch(/4,98 €\/kg/)
    expect(c.classe.tipo).toBe('merce')
  })

  it('in litri: pesa col nome della materia prima abbinata', () => {
    const c = contoRigaFattura(riga('UHT INTERO 1 LT', 12, 'LT', 15.6), { tipo: 'materia', chiave: 'latte', nome: 'latte' })
    expect(c.prezzoKg).toBeCloseTo(15.6 / (12 * 1.03), 4)
  })

  it('a pezzi senza il peso: non lo so, non zero', () => {
    const c = contoRigaFattura(riga('FARINA 00 SACCO', 4, 'PZ', 60))
    expect(c.prezzoKg).toBeNull()
    expect(c.problema).toMatch(/manca il peso di uno/)
  })

  it('a pezzi col peso scritto abbinando', () => {
    const c = contoRigaFattura(riga('FARINA 00 SACCO', 4, 'PZ', 60), { tipo: 'materia', chiave: 'farina 00', nome: 'farina 00', pesoConfezioneG: 25000 })
    expect(c.prezzoKg).toBe(0.6)
  })

  it('a pezzi col peso nella descrizione: letto e detto', () => {
    const c = contoRigaFattura(riga('PASTA NOCCIOLA SECCHIO 5 KG', 2, 'NR', 230))
    expect(c.prezzoKg).toBe(23)
    expect(c.avvisi.join(' ')).toMatch(/l'ho letto da/)
  })

  it('il prezzo unitario a tre decimali, come arriva dall\'XML', () => {
    const c = contoRigaFattura({ descrizione: 'CACAO 22/24', quantita: 8, unita: 'KGM', prezzo_unitario: 3.125, totale: 25, iva_pct: 10 })
    expect(c.prezzoKg).toBe(3.125)
    expect(c.avvisi.join(' ')).not.toMatch(/non torna/)
  })

  it('senza quantità o senza unità lo dice in italiano, senza «null»', () => {
    const a = contoRigaFattura({ descrizione: 'PANNA', quantita: null, unita: 'KG', totale: 10 })
    expect(a.problema).toBe('sulla riga della fattura manca la quantità')
    const b = contoRigaFattura({ descrizione: 'PANNA', quantita: 2, unita: null, totale: 10 })
    expect(b.problema).toMatch(/manca l'unità di misura/)
  })

  it('il trasporto non è merce, anche se è abbinato per sbaglio', () => {
    const c = contoRigaFattura(riga('SPESE DI TRASPORTO', 1, 'NR', 8), { tipo: 'materia', chiave: 'panna', nome: 'panna' })
    expect(c.classe.applicaPrezzo).toBe(false)
  })
})

// ── 4. I gruppi da mostrare ─────────────────────────────────────────────

describe('I gruppi da abbinare', () => {
  const FATTURE = [
    fattura(CONO, '10', '2025-03-01', [riga(PANNA, 10, 'KG', 45), riga('SPESE DI TRASPORTO', 1, 'NR', 8)]),
    fattura(CONO, '22', '2025-06-01', [riga('Panna fresca 35% uht', 20, 'KG', 96), riga('DDT N. 123 DEL 30/05/2025', null, null, 0)]),
    fattura(DESA, '5', '2025-06-02', [riga('YOGURT GRECO 1 KG', 3, 'KG', 14.1), riga('ABBUONO', 1, 'NR', -2)]),
    fattura(DESA, 'NC1', '2025-06-10', [riga('YOGURT GRECO 1 KG', 3, 'KG', 14.1)], { tipo: 'nota_credito' }),
    fattura(DESA, 'NC2', '2025-06-11', [riga('YOGURT GRECO 1 KG', 1, 'KG', 4.7)], { totale: -5.17 }),
    fattura(CONO, '30', '2025-07-01', [riga('COPPETTE 120CC', 4, 'PZ', 30)]),
    { id: 'senza', numero_rif: '9', data_fattura: '2025-07-02', fornitore: CONO, righe: [] },
  ]

  it('raggruppa, conta e ordina per spesa', () => {
    const { gruppi, noteDiCredito, righeSenzaImporto, fattureLette } = raggruppaRigheFatture(FATTURE, { abbinamenti: conPanna })
    expect(fattureLette).toBe(6)
    expect(noteDiCredito).toBe(2)
    // La riga del DDT a zero e l'abbuono in negativo non sono acquisti.
    expect(righeSenzaImporto).toBe(2)
    expect(gruppi.map(g => g.descrizione)).toEqual(['Panna fresca 35% uht', 'COPPETTE 120CC', 'YOGURT GRECO 1 KG', 'SPESE DI TRASPORTO'])
    const panna = gruppi[0]
    expect(panna).toMatchObject({ chiave: kPanna, volte: 2, fatture: 2, spesa: 141, prima: '2025-03-01', ultima: '2025-06-01', ultimoNumero: '22', stato: 'abbinato', prezzoKg: 4.8 })
    // Lo yogurt delle note di credito non entra nella spesa.
    expect(gruppi.find(g => g.descrizione.startsWith('YOGURT')).spesa).toBe(14.1)
  })

  it('lo stato dice cosa resta da fare', () => {
    const m = abbina(conPanna, chiaveGruppo(CONO, 'COPPETTE 120CC'), { tipo: 'no' })
    const { gruppi } = raggruppaRigheFatture(FATTURE, { abbinamenti: m })
    const per = Object.fromEntries(gruppi.map(g => [g.descrizione, g.stato]))
    expect(per).toEqual({
      'Panna fresca 35% uht': 'abbinato',
      'COPPETTE 120CC': 'escluso',
      'YOGURT GRECO 1 KG': 'da-abbinare',
      'SPESE DI TRASPORTO': 'non-merce',
    })
  })

  it('un prezzo che non si sa non è zero', () => {
    const { gruppi } = raggruppaRigheFatture(FATTURE)
    const coppette = gruppi.find(g => g.descrizione === 'COPPETTE 120CC')
    expect(coppette.prezzoKg).toBeNull()
    expect(coppette.problema).toMatch(/manca il peso/)
  })

  it('niente fatture, niente gruppi, e niente errori', () => {
    expect(raggruppaRigheFatture(null).gruppi).toEqual([])
    expect(raggruppaRigheFatture([{ righe: null }]).fattureLette).toBe(0)
  })
})

describe('Il suggerimento', () => {
  const MATERIE = [
    { key: 'nocciola', nome: 'nocciola' },
    { key: 'pasta di nocciola', nome: 'pasta di nocciola' },
    { key: 'panna', nome: 'panna' },
    { key: 'caffè etiopia', nome: 'Caffè Etiopia' },
  ]
  it('vince il nome più lungo che ci sta tutto', () => {
    expect(suggerisciMateria('PASTA DI NOCCIOLA PIEMONTE 5KG', MATERIE)).toEqual({ key: 'pasta di nocciola', nome: 'pasta di nocciola' })
  })
  it('singolare e plurale', () => {
    expect(suggerisciMateria('NOCCIOLE TOSTATE', MATERIE)?.key).toBe('nocciola')
  })
  it('gli accenti non contano', () => {
    expect(suggerisciMateria('CAFFE ETIOPIA GRANI', MATERIE)?.key).toBe('caffè etiopia')
  })
  it('se niente ci sta, non propone niente', () => {
    expect(suggerisciMateria('COPPETTE 120CC', MATERIE)).toBeNull()
    expect(suggerisciMateria('', MATERIE)).toBeNull()
  })
})

// ── 5. Dal gruppo abbinato al listino e allo storico ────────────────────

describe('Le fatture fanno il listino e lo storico', () => {
  it('materia prima senza prezzo: comanda l\'ultima fattura, e lo storico ha solo i cambi', () => {
    const r = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5), pannaA('2024-06-10', 4.5), pannaA('2025-03-10', 4.8)],
      { abbinamenti: conPanna, ingredientiCosti: {}, logPrezzi: [] })
    expect(r.ingredientiCosti.panna).toEqual({ costoKg: 4.8, costoG: 0.0048 })
    expect(r.applicati).toBe(2)
    expect(r.storicizzati).toBe(2)
    expect(r.logPrezzi.map(l => [l.decorre_da.slice(0, 10), l.prezzoVecchio, l.prezzoNuovo])).toEqual([
      ['2025-03-10', 4.5, 4.8],
      ['2024-01-10', null, 4.5],
    ])
    expect(r.logPrezzi[0].origine).toEqual({ tipo: 'fattura', fornitore: CONO, numero: '2025-03-10', data: '2025-03-10' })
  })

  it('col prezzo a mano di fine 2025: le vecchie scrivono lo storico, la nuova il listino', () => {
    const r = decidiPrezziDaFatture(
      [pannaA('2024-01-10', 4.5), pannaA('2024-06-10', 4.5), pannaA('2025-03-10', 4.8), pannaA('2026-02-10', 5.1)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] })
    expect(r.ingredientiCosti.panna.costoKg).toBe(5.1)
    expect(r.applicati).toBe(1)
    expect(r.storicizzati).toBe(3)
    const nuove = r.logPrezzi.filter(l => l.origine?.tipo === 'fattura')
    expect(nuove.map(l => [l.decorre_da.slice(0, 10), l.prezzoVecchio, l.prezzoNuovo, !!l.soloStorico])).toEqual([
      ['2026-02-10', 4.98, 5.1, false],
      ['2025-03-10', 4.5, 4.8, true],
      ['2024-01-10', null, 4.5, true],
    ])
    // La riga scritta a mano resta.
    expect(r.logPrezzi.some(l => l.id === 'lp-man-panna')).toBe(true)
    // Il P&L di ogni mese ritrova il suo prezzo.
    const quando = (g) => getPrezzoStoricoKg(r.logPrezzi, 'panna', g)
    expect(quando('2024-03-01')).toBe(4.5)
    expect(quando('2025-06-01')).toBe(4.8)
    expect(quando('2026-01-15')).toBe(4.98)
    expect(quando('2026-03-01')).toBe(5.1)
    expect(quando('2023-06-01')).toBeNull()
    expect(r.materie).toEqual([{ chiave: 'panna', nome: 'panna', prima: 4.98, dopo: 5.1, righe: 3 }])
  })

  it('una fattura vecchia allo stesso prezzo di oggi scrive lo storico lo stesso, se allora era cambiato', () => {
    // `decidiPrezzo` da solo direbbe «il prezzo è lo stesso»: confronta col
    // listino di oggi. Ma nel 2025 la panna era passata da 4,50 a 4,98, e il
    // P&L di quei mesi deve saperlo.
    const r = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5), pannaA('2025-03-10', 4.98)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] })
    expect(getPrezzoStoricoKg(r.logPrezzi, 'panna', '2025-06-01')).toBe(4.98)
    expect(getPrezzoStoricoKg(r.logPrezzi, 'panna', '2024-06-01')).toBe(4.5)
    expect(r.ingredientiCosti.panna.costoKg).toBe(4.98)
  })

  it('una fattura più vecchia dell\'ultimo cambio non tocca mai il prezzo di oggi', () => {
    const r = decidiPrezziDaFatture([pannaA('2024-01-10', 4.0)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] })
    expect(r.ingredientiCosti.panna.costoKg).toBe(4.98)
    expect(r.applicati).toBe(0)
    expect(r.storicizzati).toBe(1)
    expect(r.logPrezzi[0].soloStorico).toBe(true)
  })

  it('una fattura dello stesso giorno dell\'ultimo cambio aggiorna il listino (la regola delle bolle)', () => {
    const r = decidiPrezziDaFatture([pannaA('2026-02-10', 5.1)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98, '2026-02-10')] })
    expect(r.ingredientiCosti.panna.costoKg).toBe(5.1)
    expect(r.logPrezzi[0].soloStorico).toBeUndefined()
  })

  it('senza un prezzo in listino comandano le fatture, anche se lo storico ha una data più recente', () => {
    // Un prezzo conosciuto, anche del 2024, vale più di nessun prezzo: è la
    // stessa regola di `decidiPrezzo` («prima non aveva prezzo»).
    const r = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5), pannaA('2024-06-10', 4.6)],
      { abbinamenti: conPanna, ingredientiCosti: {}, logPrezzi: [manuale('panna', 4.98)] })
    expect(r.ingredientiCosti.panna.costoKg).toBe(4.6)
    // E una stima di mercato non è un prezzo: comandano lo stesso.
    const s = decidiPrezziDaFatture([pannaA('2024-06-10', 4.6)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 3, costoG: 0.003, isStima: true } }, logPrezzi: [manuale('panna', 4.98)] })
    expect(s.ingredientiCosti.panna.costoKg).toBe(4.6)
  })

  it('riapplicare non doppia niente', () => {
    const fatture = [pannaA('2024-01-10', 4.5), pannaA('2025-03-10', 4.8), pannaA('2026-02-10', 5.1)]
    const ctx = { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] }
    const uno = decidiPrezziDaFatture(fatture, ctx)
    const due = decidiPrezziDaFatture(fatture, { ...ctx, ingredientiCosti: uno.ingredientiCosti, logPrezzi: uno.logPrezzi })
    expect(due.storicizzati).toBe(0)
    expect(due.applicati).toBe(0)
    expect(due.giaPassate).toBe(3)
    expect(due.logPrezzi).toHaveLength(uno.logPrezzi.length)
    expect(due.ingredientiCosti).toEqual(uno.ingredientiCosti)
  })

  it('riconosce la fattura già passata anche col nome del fornitore scritto diverso (XML/Excel)', () => {
    const uno = decidiPrezziDaFatture([pannaA('2026-02-10', 5.1, '77')], { abbinamenti: conPanna, ingredientiCosti: {}, logPrezzi: [] })
    const dallXml = fattura('CONO ARTIC COMMERCIALE S.R.L.', '77', '2026-02-10', [riga(PANNA, 10, 'KG', 51)])
    const due = decidiPrezziDaFatture([dallXml], { abbinamenti: conPanna, ingredientiCosti: uno.ingredientiCosti, logPrezzi: uno.logPrezzi })
    expect(due.storicizzati).toBe(0)
    expect(due.giaPassate).toBe(1)
  })

  it('una fattura vecchia caricata dopo entra solo nello storico', () => {
    const ctx = { abbinamenti: conPanna, ingredientiCosti: {}, logPrezzi: [] }
    const uno = decidiPrezziDaFatture([pannaA('2025-01-10', 4.5), pannaA('2025-09-10', 5.0)], ctx)
    const tardiva = decidiPrezziDaFatture([pannaA('2025-05-10', 4.7)], { ...ctx, ingredientiCosti: uno.ingredientiCosti, logPrezzi: uno.logPrezzi })
    expect(tardiva.ingredientiCosti.panna.costoKg).toBe(5)
    expect(tardiva.applicati).toBe(0)
    expect(tardiva.storicizzati).toBe(1)
    expect(getPrezzoStoricoKg(tardiva.logPrezzi, 'panna', '2025-06-01')).toBe(4.7)
    expect(getPrezzoStoricoKg(tardiva.logPrezzi, 'panna', '2025-10-01')).toBe(5)
  })

  it('due righe della stessa materia nella stessa fattura fanno un prezzo solo, pesato sui chili', () => {
    const m = abbina(conPanna, chiaveGruppo(CONO, 'PANNA 38%'), { tipo: 'materia', chiave: 'panna', nome: 'panna' })
    const f = fattura(CONO, '1', '2026-01-10', [riga(PANNA, 10, 'KG', 40), riga('PANNA 38%', 5, 'KG', 25)])
    const r = decidiPrezziDaFatture([f], { abbinamenti: m, ingredientiCosti: {}, logPrezzi: [] })
    expect(r.storicizzati).toBe(1)
    expect(r.ingredientiCosti.panna.costoKg).toBeCloseTo(65 / 15, 4)
  })

  it('due fornitori della stessa materia: il listino segue l\'acquisto più recente', () => {
    const m = abbina(conPanna, chiaveGruppo(DESA, 'PANNA UHT'), { tipo: 'materia', chiave: 'panna', nome: 'panna' })
    const r = decidiPrezziDaFatture([
      pannaA('2026-01-10', 4.9),
      fattura(DESA, 'D1', '2026-02-10', [riga('PANNA UHT', 10, 'KG', 52)]),
    ], { abbinamenti: m, ingredientiCosti: {}, logPrezzi: [] })
    expect(r.ingredientiCosti.panna.costoKg).toBe(5.2)
    expect(r.logPrezzi[0].origine.fornitore).toBe(DESA)
  })

  it('le note di credito non toccano niente', () => {
    const r = decidiPrezziDaFatture([
      { ...pannaA('2026-02-10', 3.0), tipo: 'nota_credito' },
      { ...pannaA('2026-02-11', 3.0), totale: -33 },
    ], { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [] })
    expect(r.storicizzati).toBe(0)
    expect(r.ingredientiCosti.panna.costoKg).toBe(4.98)
  })

  it('una riga che non è merce non tocca niente, anche se abbinata per sbaglio', () => {
    const m = abbina(null, chiaveGruppo(CONO, 'SPESE DI TRASPORTO'), { tipo: 'materia', chiave: 'panna', nome: 'panna' })
    const r = decidiPrezziDaFatture([fattura(CONO, '1', '2026-01-10', [riga('SPESE DI TRASPORTO', 1, 'KG', 8)])],
      { abbinamenti: m, ingredientiCosti: {}, logPrezzi: [] })
    expect(r.storicizzati).toBe(0)
  })

  it('un gruppo non abbinato o escluso non tocca niente', () => {
    const m = abbina(null, kPanna, { tipo: 'no' })
    expect(decidiPrezziDaFatture([pannaA('2026-01-10', 4.9)], { abbinamenti: m }).storicizzati).toBe(0)
    expect(decidiPrezziDaFatture([pannaA('2026-01-10', 4.9)], { abbinamenti: null }).storicizzati).toBe(0)
  })

  it('una riga senza prezzo calcolabile si conta, e non scrive zero', () => {
    const m = abbina(null, chiaveGruppo(CONO, 'FARINA 00 SACCO'), { tipo: 'materia', chiave: 'farina 00', nome: 'farina 00' })
    const f = fattura(CONO, '1', '2026-01-10', [riga('FARINA 00 SACCO', 4, 'PZ', 60)])
    const r = decidiPrezziDaFatture([f], { abbinamenti: m, ingredientiCosti: {}, logPrezzi: [] })
    expect(r.storicizzati).toBe(0)
    expect(r.ingredientiCosti['farina 00']).toBeUndefined()
    expect(r.senzaPrezzo).toHaveLength(1)
    expect(r.senzaPrezzo[0].problema).toMatch(/peso/)
    // Col peso del sacco scritto abbinando, il prezzo esce.
    const conPeso = abbina(null, chiaveGruppo(CONO, 'FARINA 00 SACCO'), { tipo: 'materia', chiave: 'farina 00', nome: 'farina 00', pesoConfezioneG: 25000 })
    expect(decidiPrezziDaFatture([f], { abbinamenti: conPeso }).ingredientiCosti['farina 00']).toEqual({ costoKg: 0.6, costoG: 0.0006 })
  })

  it('una fattura senza numero o senza data non scrive prezzi', () => {
    const r = decidiPrezziDaFatture([{ ...pannaA('2026-01-10', 4.9), numero_rif: '' }, { ...pannaA('2026-01-11', 4.9), data_fattura: null }],
      { abbinamenti: conPanna })
    expect(r.storicizzati).toBe(0)
  })

  it('ogni riga di storico ha un id suo, e porta chi l\'ha fatta', () => {
    const r = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5), pannaA('2024-06-10', 4.6), pannaA('2025-03-10', 4.8)],
      { abbinamenti: conPanna, utente: 'titolare@x.it' })
    const ids = r.logPrezzi.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(r.logPrezzi.every(l => l.utente === 'titolare@x.it')).toBe(true)
  })
})

describe('Una materia prima rinominata o eliminata non rinasce', () => {
  // Il gruppo era abbinato a «panna»; poi la panna è stata rinominata
  // «panna fresca». Scrivere il prezzo sotto la chiave vecchia la farebbe
  // ricomparire nel listino: un doppione col prezzo giusto, e quella vera
  // ferma.
  it('le chiavi delle materie prime: listino e ricette', () => {
    const ric = { ingredienti_costi: { zucchero: {} }, ricette: { fiordilatte: { ingredienti: [{ nome: 'Panna Fresca' }, { nome: '' }] } } }
    expect([...chiaviMaterie(ric)].sort()).toEqual(['panna fresca', 'zucchero'])
    expect(chiaviMaterie(null).size).toBe(0)
  })

  it('un abbinamento a una chiave che non c\'è più non scrive niente', () => {
    const r = decidiPrezziDaFatture([pannaA('2026-02-10', 5.1)],
      { abbinamenti: conPanna, ingredientiCosti: { 'panna fresca': { costoKg: 4.98, costoG: 0.00498 } }, chiaviValide: new Set(['panna fresca']) })
    expect(r.storicizzati).toBe(0)
    expect(r.ingredientiCosti.panna).toBeUndefined()
  })

  it('e il gruppo torna da abbinare, dicendo a cosa era abbinato', () => {
    const { gruppi } = raggruppaRigheFatture([pannaA('2026-02-10', 5.1)], { abbinamenti: conPanna, chiaviValide: new Set(['panna fresca']) })
    expect(gruppi[0]).toMatchObject({ stato: 'da-abbinare', abbinamentoPerso: 'panna', abbinamento: null })
  })

  it('senza sapere quali esistono, l\'abbinamento vale com\'è', () => {
    expect(raggruppaRigheFatture([pannaA('2026-02-10', 5.1)], { abbinamenti: conPanna }).gruppi[0].stato).toBe('abbinato')
  })

  it('anche dopo il caricamento degli XML', async () => {
    const ricettario = { ricette: {}, ingredienti_costi: { 'panna fresca': { costoKg: 4.98, costoG: 0.00498 } } }
    const fattura412 = pannaA('2026-02-10', 5.1, '412')
    const db = dbFinto({ fatture: [fattura412], userData: [
      { data_key: 'pasticceria-ricettario-v1', data_value: ricettario, updated_at: 'x' },
      { data_key: 'pasticceria-abbinamenti-fatture-v1', data_value: conPanna, updated_at: 'x' },
    ] })
    const scrivi = vi.fn()
    const r = await aggiornaPrezziDopoImport(db.supabase, 'org', [fattura412], { scrivi })
    expect(scrivi).not.toHaveBeenCalled()
    expect(r.daAbbinare).toBe(1)
  })
})

describe('Lo scostamento sospetto non passa da solo', () => {
  const ctx = { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] }
  const dieciVolte = pannaA('2026-02-10', 49.8, '88')

  it('dieci volte il prezzo di oggi: si ferma e chiede', () => {
    const r = decidiPrezziDaFatture([dieciVolte], ctx)
    expect(r.ingredientiCosti.panna.costoKg).toBe(4.98)
    expect(r.storicizzati).toBe(0)
    expect(r.daConfermare).toHaveLength(1)
    expect(r.daConfermare[0]).toMatchObject({ chiave: 'panna', prezzoKg: 49.8, prezzoPrima: 4.98, azione: 'applica', numero: '88', giorno: '2026-02-10' })
  })

  it('confermato, si applica', () => {
    const id = decidiPrezziDaFatture([dieciVolte], ctx).daConfermare[0].id
    const r = decidiPrezziDaFatture([dieciVolte], { ...ctx, forza: [id] })
    expect(r.ingredientiCosti.panna.costoKg).toBe(49.8)
    expect(r.daConfermare).toEqual([])
  })

  it('scartato, non torna a chiedere', () => {
    const id = decidiPrezziDaFatture([dieciVolte], ctx).daConfermare[0].id
    const r = decidiPrezziDaFatture([dieciVolte], { ...ctx, abbinamenti: ignoraAcquisto(conPanna, id) })
    expect(r.daConfermare).toEqual([])
    expect(r.ingredientiCosti.panna.costoKg).toBe(4.98)
  })

  it('anche nello storico: un prezzo vecchio dieci volte quello di allora si ferma', () => {
    const r = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5), pannaA('2024-06-10', 45)], ctx)
    expect(r.storicizzati).toBe(1)
    expect(r.daConfermare).toHaveLength(1)
    expect(r.daConfermare[0]).toMatchObject({ azione: 'soloStorico', prezzoPrima: 4.5, prezzoKg: 45 })
  })

  it('un rincaro vero, sotto la metà, passa da solo', () => {
    const r = decidiPrezziDaFatture([pannaA('2026-02-10', 6.9)], ctx)
    expect(r.ingredientiCosti.panna.costoKg).toBe(6.9)
    expect(r.daConfermare).toEqual([])
  })
})

// ── 6. Da lì in poi da solo: dopo il caricamento degli XML ──────────────

/** Un database finto: le due tabelle che servono, con i filtri annotati. */
function dbFinto({ fatture = [], userData = [], erroreUserData = null } = {}) {
  const chiamate = []
  const from = (nome) => {
    const q = { filtri: {} }
    for (const m of ['select', 'not', 'order', 'range']) q[m] = () => q
    q.eq = (k, v) => { q.filtri[k] = v; return q }
    q.is = (k, v) => { q.filtri[`${k} is`] = v; return q }
    q.in = (k, v) => { q.filtri[`${k} in`] = v; return q }
    q.gte = (k, v) => { q.filtri[`${k} >=`] = v; return q }
    q.lte = (k, v) => { q.filtri[`${k} <=`] = v; return q }
    q.then = (ok, ko) => {
      chiamate.push({ nome, filtri: q.filtri })
      const res = nome === 'user_data'
        ? (erroreUserData ? { data: null, error: { message: erroreUserData } } : { data: userData, error: null })
        : { data: fatture.filter(f => (!q.filtri['data_fattura >='] || f.data_fattura >= q.filtri['data_fattura >=']) && (!q.filtri['data_fattura <='] || f.data_fattura <= q.filtri['data_fattura <='])), error: null }
      return Promise.resolve(res).then(ok, ko)
    }
    return q
  }
  return { supabase: { from }, chiamate }
}

const RICETTARIO = { ricette: { fiordilatte: { nome: 'fiordilatte', ingredienti: [{ nome: 'panna', qty1stampo: 300 }] } }, ingredienti_costi: { panna: { costoKg: 4.98, costoG: 0.00498 } } }
const STATO = (extra = {}) => [
  { data_key: 'pasticceria-ricettario-v1', data_value: RICETTARIO, updated_at: '2026-10-01' },
  { data_key: 'pasticceria-log-prezzi-v1', data_value: [manuale('panna', 4.98)], updated_at: '2026-10-01' },
  { data_key: 'pasticceria-abbinamenti-fatture-v1', data_value: conPanna, updated_at: '2026-10-01' },
  ...(extra.righe || []),
]

describe('Dopo il caricamento degli XML i prezzi abbinati si aggiornano da soli', () => {
  // La fattura nel database ha il nome del fornitore dell'Excel di WebDesk;
  // l'XML lo scrive con la forma societaria per esteso.
  const inDb = { ...pannaA('2026-02-10', 5.1, '412'), fornitore: 'CONO ARTIC COMMERCIALE SRL' }
  const dallXml = { numero_rif: '412', data_fattura: '2026-02-10', fornitore: 'CONO ARTIC COMMERCIALE S.R.L.', tipo: 'fattura', totale: inDb.totale, righe: inDb.righe }

  it('aggiorna listino e storico in una sola scrittura, e lascia le ricette come sono', async () => {
    const db = dbFinto({ fatture: [inDb, pannaA('2025-01-10', 4.0, 'non-toccata')], userData: STATO() })
    const scritte = []
    const r = await aggiornaPrezziDopoImport(db.supabase, 'org', [dallXml], { scrivi: async (items) => { scritte.push(items) } })
    expect(r).toMatchObject({ applicati: 1, storicizzati: 1, daConfermare: 0, daAbbinare: 0 })
    expect(scritte).toHaveLength(1)
    const [ric, log] = scritte[0]
    expect(ric.key).toBe('pasticceria-ricettario-v1')
    expect(ric.value.ingredienti_costi.panna).toEqual({ costoKg: 5.1, costoG: 0.0051 })
    expect(ric.value.ricette).toEqual(RICETTARIO.ricette)
    expect(log.key).toBe('pasticceria-log-prezzi-v1')
    // Il nome del fornitore è quello del database, non quello dell'XML: è
    // così che la sezione e il caricamento riconoscono la stessa fattura.
    expect(log.value[0].origine).toEqual({ tipo: 'fattura', fornitore: 'CONO ARTIC COMMERCIALE SRL', numero: '412', data: '2026-02-10' })
    // Solo il periodo toccato, e la fattura non toccata resta fuori.
    const lettura = db.chiamate.find(c => c.nome === 'fatture')
    expect(lettura.filtri).toMatchObject({ organization_id: 'org', 'data_fattura >=': '2026-02-10', 'data_fattura <=': '2026-02-10' })
    expect(log.value.some(l => l.origine?.numero === 'non-toccata')).toBe(false)
  })

  it('lo dice alla pagina aperta, così la prossima modifica a mano non riparte dal listino vecchio', async () => {
    const eventi = []
    vi.stubGlobal('window', { dispatchEvent: (e) => { eventi.push(e); return true } })
    try {
      const db = dbFinto({ fatture: [inDb], userData: STATO() })
      await aggiornaPrezziDopoImport(db.supabase, 'org', [dallXml], { scrivi: async () => {} })
    } finally { vi.unstubAllGlobals() }
    expect(eventi).toHaveLength(1)
    expect(eventi[0].type).toBe(EVENTO_PREZZI_SCRITTI)
    expect(eventi[0].detail.ricettario.ingredienti_costi.panna.costoKg).toBe(5.1)
    expect(eventi[0].detail.logPrezzi[0].prezzoNuovo).toBe(5.1)
  })

  it('una nota di credito per l\'XML resta fuori, anche se nel database è segnata fattura', async () => {
    const db = dbFinto({ fatture: [inDb], userData: STATO() })
    const scrivi = vi.fn()
    const r = await aggiornaPrezziDopoImport(db.supabase, 'org', [{ ...dallXml, tipo: 'nota_credito' }], { scrivi })
    expect(r.applicati).toBe(0)
    expect(scrivi).not.toHaveBeenCalled()
  })

  it('i gruppi nuovi si contano, e senza abbinamenti non si scrive niente', async () => {
    const nuovo = fattura(CONO, '413', '2026-02-11', [riga('ZUCCHERO SEMOLATO 25 KG', 2, 'NR', 45), riga('DESTROSIO', 10, 'KG', 11)])
    const db = dbFinto({ fatture: [nuovo], userData: STATO().filter(r => r.data_key !== 'pasticceria-abbinamenti-fatture-v1') })
    const scrivi = vi.fn()
    const r = await aggiornaPrezziDopoImport(db.supabase, 'org', [nuovo], { scrivi })
    expect(r).toEqual({ applicati: 0, storicizzati: 0, daConfermare: 0, daAbbinare: 2, materie: [] })
    expect(scrivi).not.toHaveBeenCalled()
  })

  it('senza ricettario letto non riscrive niente: lo cancellerebbe', async () => {
    const db = dbFinto({ fatture: [inDb], userData: STATO().filter(r => r.data_key !== 'pasticceria-ricettario-v1') })
    const scrivi = vi.fn()
    const r = await aggiornaPrezziDopoImport(db.supabase, 'org', [dallXml], { scrivi })
    expect(r.applicati).toBe(0)
    expect(scrivi).not.toHaveBeenCalled()
  })

  it('uno storico illeggibile non si riscrive: si perderebbe', async () => {
    const stato = STATO().map(r => (r.data_key === 'pasticceria-log-prezzi-v1' ? { ...r, data_value: { rotto: true } } : r))
    const scrivi = vi.fn()
    await aggiornaPrezziDopoImport(dbFinto({ fatture: [inDb], userData: stato }).supabase, 'org', [dallXml], { scrivi })
    expect(scrivi).not.toHaveBeenCalled()
  })

  it('niente righe nei file, niente letture', async () => {
    const db = dbFinto()
    expect(await aggiornaPrezziDopoImport(db.supabase, 'org', [{ numero_rif: '1', data_fattura: '2026-01-01', righe: [] }])).toBeNull()
    expect(db.chiamate).toEqual([])
  })

  it('se la lettura fallisce lo dice, e il caricamento delle fatture non si rompe', async () => {
    const db = dbFinto({ fatture: [inDb], erroreUserData: 'permesso negato' })
    await expect(aggiornaPrezziDopoImport(db.supabase, 'org', [dallXml])).rejects.toThrow('permesso negato')
  })
})

// ── 7. Quello che serve alla schermata, e lo storico che lo racconta ────

describe('Conti, filtri e frasi della sezione', () => {
  const G = [
    { stato: 'da-abbinare', descrizione: 'PANNA FRESCA', fornitore: CONO, abbinamento: null },
    { stato: 'abbinato', descrizione: 'LATTE UHT', fornitore: DESA, abbinamento: { nome: 'latte' } },
    { stato: 'escluso', descrizione: 'DETERSIVO', fornitore: DESA, abbinamento: { tipo: 'no' } },
    { stato: 'non-merce', descrizione: 'TRASPORTO', fornitore: CONO, abbinamento: null },
  ]
  it('conta per stato, e i non-merce stanno con gli esclusi', () => {
    expect(contaGruppi(G)).toEqual({ tutti: 4, daAbbinare: 1, abbinati: 1, esclusi: 2 })
  })
  it('filtra per stato e per testo, anche sul nome abbinato', () => {
    expect(filtraGruppi(G).map(g => g.descrizione)).toEqual(['PANNA FRESCA'])
    expect(filtraGruppi(G, { filtro: 'esclusi' }).map(g => g.descrizione)).toEqual(['DETERSIVO', 'TRASPORTO'])
    expect(filtraGruppi(G, { filtro: 'tutti', testo: 'desa' })).toHaveLength(2)
    expect(filtraGruppi(G, { filtro: 'tutti', testo: 'LATTE' }).map(g => g.descrizione)).toEqual(['LATTE UHT'])
    expect(filtraGruppi(G, { filtro: 'abbinati', testo: 'panna' })).toEqual([])
  })
  it('dopo un abbinamento dice cosa è cambiato, o perché no', () => {
    const materia = { key: 'panna', nome: 'panna' }
    const esito = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5), pannaA('2026-02-10', 5.1)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] })
    expect(fraseDopoAbbinamento({ descrizione: PANNA, materia, chiaveGruppo: kPanna, esito }))
      .toBe('«PANNA FRESCA 35% UHT» ora è panna. Listino: 5,10 €/kg (prima 4,98 €/kg). Storico: 2 righe dalle fatture.')
    const fermo = decidiPrezziDaFatture([pannaA('2024-01-10', 4.5)],
      { abbinamenti: conPanna, ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [manuale('panna', 4.98)] })
    expect(fraseDopoAbbinamento({ descrizione: PANNA, materia, chiaveGruppo: kPanna, esito: fermo }))
      .toBe('«PANNA FRESCA 35% UHT» ora è panna. Il listino resta a 4,98 €/kg. Storico: 1 riga dalle fatture.')
    expect(fraseDopoAbbinamento({ descrizione: PANNA, materia, chiaveGruppo: kPanna, esito: { materie: [], daConfermare: [], senzaPrezzo: [] } }))
      .toMatch(/Nessun prezzo cambiato: le fatture dicono gli stessi prezzi/)
    expect(fraseDopoAbbinamento({ descrizione: PANNA, materia, chiaveGruppo: kPanna, esito: { materie: [], daConfermare: [], senzaPrezzo: [{ gruppo: kPanna, problema: '4 pezzi: manca il peso di uno, scrivilo tu' }] } }))
      .toMatch(/non si calcola \(4 pezzi: manca il peso di uno/)
    expect(fraseDopoAbbinamento({ descrizione: PANNA, materia, chiaveGruppo: kPanna, esito: { materie: [], daConfermare: [{ chiave: 'panna' }], senzaPrezzo: [] } }))
      .toBe('«PANNA FRESCA 35% UHT» ora è panna. Un prezzo è da confermare: lo trovi in cima.')
  })
})

describe('Lo storico racconta le righe delle fatture', () => {
  it('una riga da fattura si chiama fattura, non bolla', () => {
    const o = origineInParole({ origine: { tipo: 'fattura', fornitore: CONO, numero: '412', data: '2026-02-10' } })
    expect(o).toEqual({ fornitore: CONO, testo: `fattura 412 · ${CONO}` })
    // E le bolle restano bolle.
    expect(origineInParole({ origine: { tipo: 'bolla', fornitore: 'DESA', numero: '7' } }).testo).toBe('bolla 7 · DESA')
  })
  it('«ultimi 30 giorni» guarda da quando vale il prezzo, non quando è stata scritta la riga', () => {
    const oggi = new Date().toISOString()
    const log = [
      { id: 'ricostruita', data: oggi, decorre_da: '2024-01-10T00:00:00.000Z', ingrediente: 'panna', prezzoNuovo: 4.5 },
      { id: 'di-ieri', data: oggi, decorre_da: new Date(Date.now() - 86400000).toISOString(), ingrediente: 'panna', prezzoNuovo: 5 },
      { id: 'senza-decorrenza', data: oggi, ingrediente: 'latte', prezzoNuovo: 1.7 },
    ]
    expect(filtraStorico(log, { periodo: '30' }).map(l => l.id)).toEqual(['di-ieri', 'senza-decorrenza'])
    expect(filtraStorico(log, { periodo: 'tutto' })).toHaveLength(3)
  })
})

describe('Ogni conto nuovo è chiamato da qualche schermata', () => {
  it('le due librerie sono sorvegliate dal cricchetto delle funzioni mai chiamate', () => {
    const src = readFileSync(join(__dirname, 'campiNuoviRaggiungibili.test.js'), 'utf8')
    expect(src).toMatch(/'prezziDaFatture'/)
    expect(src).toMatch(/'prezziDaFattureArchivio'/)
  })
})

describe('Il riepilogo del caricamento parla dei prezzi', () => {
  const base = { completate: 3, nuove: 0, giaPresenti: 0, fornitoriCompletati: 0, lette: 3, ambigue: [], illeggibili: [], fileFalliti: [], errori: [], troncato: false }

  it('quanti prezzi, e quanti prodotti aspettano, con dove andare', () => {
    expect(fraseEsitoXml({ ...base, prezzi: { applicati: 2, daAbbinare: 1240 } }))
      .toBe('3 fatture completate con righe e dati del fornitore · 2 prezzi di materie prime aggiornati · 1.240 prodotti da abbinare in Materie prime › Dalle fatture')
    expect(fraseEsitoXml({ ...base, prezzi: { applicati: 1, daAbbinare: 1 } }))
      .toMatch(/1 prezzo di materia prima aggiornato · 1 prodotto da abbinare/)
    expect(fraseEsitoXml({ ...base, prezzi: null })).toBe('3 fatture completate con righe e dati del fornitore')
  })

  it('i sospetti e gli errori sono avvisi', () => {
    expect(avvisiEsitoXml({ ...base, prezzi: { daConfermare: 1 } })[0]).toMatch(/^1 prezzo cambia più della metà rispetto a prima: non lo applico da solo, guardalo in Materie prime › Dalle fatture\.$/)
    expect(avvisiEsitoXml({ ...base, prezzi: { daConfermare: 3 } })[0]).toMatch(/^3 prezzi cambiano .* non li applico da solo, guardali/)
    expect(avvisiEsitoXml({ ...base, prezzi: { errore: 'rete' } })[0]).toMatch(/non li ho aggiornati \(rete\)\. Le fatture sono entrate/)
    expect(avvisiEsitoXml({ ...base, prezzi: { applicati: 2 } })).toEqual([])
  })
})
