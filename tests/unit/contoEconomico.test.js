// ── I costi del mese dalle fatture: il motore del conto economico ────────
//
// Il difetto, 03/10/2026 (audit del P&L, voto 18/100). Il conto economico di
// Mara dei Boschi diceva **utile 82% dei ricavi** — giugno 125.533 €, luglio
// 120.316 €, agosto 81.381 € — perché le fatture dei fornitori non entravano
// MAI nel conto: 288.686 € in tre mesi (IVA compresa) di materie prime, coni,
// affitto, Enel, commercialista, commissioni delivery, e a schermo affitto,
// utenze e servizi valevano 0. Una sola fattura GECKO di luglio vale
// 86.651 €, probabilmente un investimento.
//
// Da qui nasce `src/lib/contoEconomico.js`. I fatti dei dati veri che questi
// test tengono fermi:
//   • 3.042 fatture su 3.104 hanno imponibile 0: arriva solo il totale IVA
//     compresa. Mai scorporare con un'aliquota supposta: si conta il lordo e
//     lo si dice (`importoIvaCompresa`).
//   • le quattro note di credito in archivio hanno `tipo = 'fattura'` e il
//     totale negativo: il segno si prende anche dall'importo.
//   • 315 fornitori, nessuno con la categoria: senza voce si va in
//     `daClassificare`, mai in una voce scelta a caso.
//   • Berthollet e De Gasperi condividono 142 fatture (sede vuota +
//     `sedi_condivise`): si dividono sui chili prodotti, e lo si dichiara.
//
// Le prove di mutazione fatte il 03/10 sui punti che decidono i soldi sono
// elencate in fondo al file.
import { describe, it, expect } from 'vitest'
import {
  CATEGORIE_SPESA, ID_CATEGORIE, categoriaPerId, categoriaDaEtichetta, chiaveFornitore,
  suggerisciCategoria, importoSenzaIva, costiPerMese, costiPerPeriodo, causeVariazione,
  fraseCausa, nomeBreve, fattureEccezionali, categoriaDellaFattura,
} from '../../src/lib/contoEconomico'

const CARLINA = 'e0d3370b'
const DEGASPERI = 'bbb7554e'
const BERTHOLLET = 'af9f2192'

let progressivo = 0
const fattura = (o = {}) => ({
  id: `f${++progressivo}`, numero_rif: String(progressivo), tipo: 'fattura',
  imponibile: 0, imposta: 0, sede_id: CARLINA, sedi_condivise: null, ...o,
})
const mappa = (coppie) => Object.fromEntries(Object.entries(coppie).map(([nome, id]) => [chiaveFornitore(nome), id]))

describe('le voci di spesa', () => {
  it('hanno gli id che usano «Il mese» e il Conto economico', () => {
    expect(CATEGORIE_SPESA.filter(c => c.tipo === 'costo').map(c => c.id).sort()).toEqual([
      'affitto', 'altro', 'commissioni', 'confezionamento', 'manutenzione', 'marketing',
      'materie-prime', 'personale-esterno', 'servizi', 'utenze',
    ])
    expect(categoriaPerId('attrezzature').tipo).toBe('investimento')
    expect(categoriaPerId('fuori-conto').tipo).toBe('escluso')
    expect(ID_CATEGORIE.MATERIE_PRIME).toBe('materie-prime')
    expect(categoriaPerId('nessuna')).toBeNull()
  })

  it('nomi di una o due parole, ognuno con la sua spiegazione', () => {
    for (const c of CATEGORIE_SPESA) {
      expect(c.nome.split(/\s+/).filter(p => p !== 'e').length).toBeLessThanOrEqual(2)
      expect(c.descrizione.length).toBeGreaterThan(10)
    }
  })

  it("si riconoscono dall'id, dal nome e dalle vecchie etichette della pagina Fornitori", () => {
    expect(categoriaDaEtichetta('materie-prime')).toBe('materie-prime')
    expect(categoriaDaEtichetta('Materie prime')).toBe('materie-prime')
    expect(categoriaDaEtichetta('  MATERIE   PRIME ')).toBe('materie-prime')
    expect(categoriaDaEtichetta('materie_prime')).toBe('materie-prime')
    expect(categoriaDaEtichetta('Latticini')).toBe('materie-prime')
    expect(categoriaDaEtichetta('Imballaggi')).toBe('confezionamento')
    expect(categoriaDaEtichetta('Affitto e noleggi')).toBe('affitto')
  })

  it("un'etichetta che non si capisce non diventa una voce a caso", () => {
    // «Attrezzature» può essere un investimento o una riparazione.
    expect(categoriaDaEtichetta('Attrezzature')).toBeNull()
    expect(categoriaDaEtichetta('Roba varia')).toBeNull()
    expect(categoriaDaEtichetta('')).toBeNull()
    expect(categoriaDaEtichetta(null)).toBeNull()
  })

  it("«Attrezzature» scritto nella scheda del fornitore non lo manda negli investimenti; l'id sì", () => {
    // Trovato da questo file il 03/10/2026: l'id della voce investimenti è la
    // stessa parola dell'etichetta di prodotto della pagina Fornitori.
    const f = { fornitore: 'ACME', data_fattura: '2026-07-01', totale: 100 }
    expect(categoriaDellaFattura(f, { [chiaveFornitore('ACME')]: 'Attrezzature' })).toBeNull()
    expect(categoriaDellaFattura(f, { [chiaveFornitore('ACME')]: 'attrezzature' })).toBe('attrezzature')
    expect(categoriaDellaFattura(f, { [chiaveFornitore('ACME')]: 'Attrezzature e lavori' })).toBe('attrezzature')
    expect(categoriaDellaFattura({ ...f, categoria_spesa: 'attrezzature' }, null)).toBe('attrezzature')
  })
})

describe('suggerisciCategoria: dal nome del fornitore', () => {
  const voce = (nome, righe) => suggerisciCategoria(nome, righe)?.categoria ?? null

  it('i fornitori veri di Mara che il nome dice da solo', () => {
    expect(voce('Enel Energia S.p.A.')).toBe('utenze')
    expect(voce('Eni Plenitude S.p.A. Società Benefit')).toBe('utenze')
    expect(voce('FASTWEB SpA')).toBe('utenze')
    expect(voce('Deliveroo Italy S.R.L.')).toBe('commissioni')
    expect(voce('Foodinho S.R.L.')).toBe('commissioni')
    expect(voce('Just-Eat Italy S.r.l')).toBe('commissioni')
    expect(voce('COMMERCIALISTIINTORINO S.S. STP')).toBe('servizi')
    expect(voce('STUDIO NOTARILE IOLI-PASSONE - Associazione Professionale')).toBe('servizi')
    expect(voce('CONO ARTIC COMMERCIALE SRL')).toBe('confezionamento')
    expect(voce('CANAVESE ZUCCHERO DI ALBANESE ANDREA & C. SNC')).toBe('materie-prime')
    expect(voce('L.a. Torrefazione Insieme s.r.l.')).toBe('materie-prime')
    expect(voce('la trivalente traslochi snc di valenti antonio e valenti vincenzo')).toBe('servizi')
  })

  it('dice perché, con la parola trovata', () => {
    const s = suggerisciCategoria('Enel Energia S.p.A.')
    expect(s).toEqual({ categoria: 'utenze', motivo: "nel nome c'è «ENEL»", fonte: 'nome', certezza: 'alta' })
  })

  it('se il nome non dice niente: null, non una voce a caso', () => {
    expect(suggerisciCategoria('DESA SRL')).toBeNull()
    expect(suggerisciCategoria('PRONTOSERVICE S.r.l.')).toBeNull()
    expect(suggerisciCategoria('SUQQO S.R.L.')).toBeNull()
    expect(suggerisciCategoria('Vecchio Enrico')).toBeNull()
    expect(suggerisciCategoria('')).toBeNull()
    expect(suggerisciCategoria(null)).toBeNull()
  })

  it('le parole intere, non pezzi di parola', () => {
    expect(voce('ICONA DESIGN SRL')).toBeNull()        // non è un cono
    expect(voce('TIMBRIFICIO ROSSI')).toBeNull()       // non è TIM
    expect(voce('ITALO ROSSI FALEGNAME')).toBeNull()   // Italo è un nome, non il treno
  })

  it('il caffè sì, chi ripara le macchine del caffè no', () => {
    expect(voce('HIS MAJESTY THE COFFEE S.R.L.')).toBe('materie-prime')
    expect(voce('TURIN COFFEE TECH SRL')).toBeNull()
  })

  it('la ricarica dell\'auto non è la luce del negozio', () => {
    expect(voce('ENEL X WAY S.R.L.')).toBe('altro')
  })

  it("nessun nome propone un investimento con certezza alta: lo decide il titolare", () => {
    const s = suggerisciCategoria('Costruzioni Europa s.r.l.')
    expect(s.categoria).toBe('attrezzature')
    expect(s.certezza).toBe('media')
  })
})

describe('suggerisciCategoria: dalle righe delle fatture', () => {
  it('le righe chiare vincono sul nome: Cono Artic che fattura panna è materie prime', () => {
    const s = suggerisciCategoria('CONO ARTIC COMMERCIALE SRL', [
      { descrizione: 'PANNA FRESCA 35% UHT LT 1', totale: 800 },
      { descrizione: 'LATTE INTERO LT 1', totale: 300 },
      { descrizione: 'CONO CIALDA GRANDE', totale: 60 },
    ])
    expect(s.categoria).toBe('materie-prime')
    expect(s.fonte).toBe('righe')
    expect(s.certezza).toBe('alta')                 // 1.100 su 1.160 = 95%
    expect(s.motivo).toMatch(/95%/)
    expect(s.motivo).toMatch(/PANNA/)
  })

  it('si pesa per importo: tante righe piccole non battono una grande', () => {
    const s = suggerisciCategoria('FORNITORE X', [
      { descrizione: 'PALETTINE', totale: 5 }, { descrizione: 'CUCCHIAINI', totale: 5 },
      { descrizione: 'TOVAGLIOLI', totale: 5 }, { descrizione: 'PISTACCHIO PASTA PURA', totale: 900 },
    ])
    expect(s.categoria).toBe('materie-prime')
  })

  it('senza importi una riga vale uno', () => {
    const s = suggerisciCategoria('FORNITORE X', ['COPPETTE 100 CC', 'COPPETTE 150 CC', 'VASCHETTE 500 G'])
    expect(s).toMatchObject({ categoria: 'confezionamento', fonte: 'righe', certezza: 'alta' })
    expect(s.motivo).toMatch(/3 righe su 3/)
  })

  it('righe miste: resta il nome, ma la proposta scende a «media»', () => {
    const s = suggerisciCategoria('CONO ARTIC COMMERCIALE SRL', [
      { descrizione: 'PANNA FRESCA', totale: 500 }, { descrizione: 'CONI', totale: 500 },
    ])
    expect(s).toMatchObject({ categoria: 'confezionamento', fonte: 'nome', certezza: 'media' })
    expect(s.motivo).toMatch(/non lo confermano/)
  })

  it('righe che non si riconoscono non tolgono niente al nome', () => {
    const s = suggerisciCategoria('Enel Energia S.p.A.', ['ONERI DI SISTEMA', 'ACCISE'])
    expect(s).toMatchObject({ categoria: 'utenze', certezza: 'alta', fonte: 'nome' })
  })
})

describe('importoSenzaIva: mai un\'aliquota inventata', () => {
  it("l'imponibile, quando c'è", () => {
    expect(importoSenzaIva({ totale: 122, imponibile: 100, imposta: 22 })).toEqual({ importo: 100, fonte: 'imponibile', motivo: null })
  })

  it("il totale meno l'imposta, quando c'è l'imposta e non l'imponibile", () => {
    expect(importoSenzaIva({ totale: 5152.4, imponibile: 0, imposta: 468.4 })).toMatchObject({ importo: 4684, fonte: 'totale_meno_imposta' })
  })

  it("dalle righe, se ognuna ha l'aliquota e tornano col totale", () => {
    const f = { totale: 132, imponibile: 0, imposta: 0, righe: [{ totale: 100, iva_pct: 22 }, { totale: 10, iva_pct: 0 }] }
    expect(importoSenzaIva(f)).toMatchObject({ importo: 110, fonte: 'righe' })
  })

  it("righe che non tornano col totale, o senza aliquota: null col motivo", () => {
    expect(importoSenzaIva({ totale: 500, righe: [{ totale: 100, iva_pct: 22 }] })).toMatchObject({ importo: null, motivo: expect.stringMatching(/non tornano/) })
    expect(importoSenzaIva({ totale: 122, righe: [{ totale: 100, iva_pct: null }] })).toMatchObject({ importo: null, motivo: expect.stringMatching(/solo il totale/) })
  })

  it("solo il totale: null, e NON il totale diviso 1,22 o 1,10", () => {
    const r = importoSenzaIva({ totale: 122, imponibile: 0, imposta: 0 })
    expect(r.importo).toBeNull()
    expect(r.motivo).toBe("c'è solo il totale con l'IVA")
  })

  it('una fattura a zero vale zero, una senza totale non si sa', () => {
    expect(importoSenzaIva({ totale: 0 })).toMatchObject({ importo: 0, fonte: 'zero' })
    expect(importoSenzaIva({})).toMatchObject({ importo: null, motivo: 'manca il totale' })
  })

  it("l'imposta più grande del totale è un dato rotto, non un importo negativo", () => {
    expect(importoSenzaIva({ totale: 10, imposta: 22 })).toMatchObject({ importo: null })
  })

  it('le note di credito sono negative, che arrivino col tipo o col meno', () => {
    // dall'XML: tipo nota_credito, importi positivi
    expect(importoSenzaIva({ tipo: 'nota_credito', totale: 122, imponibile: 100, imposta: 22 }).importo).toBe(-100)
    // dall'Excel: tipo «fattura», totale negativo (le quattro vere)
    expect(importoSenzaIva({ tipo: 'fattura', totale: -122, imponibile: -100, imposta: -22 }).importo).toBe(-100)
    expect(importoSenzaIva({ tipo: 'fattura', totale: -122, imponibile: 0, imposta: -22 }).importo).toBe(-100)
    // mai due volte il meno
    expect(importoSenzaIva({ tipo: 'nota_credito', totale: -122, imponibile: -100 }).importo).toBe(-100)
  })
})

describe('costiPerMese: le voci del mese', () => {
  const cat = mappa({ 'DESA SRL': 'materie-prime', 'Enel Energia S.p.A.': 'utenze', 'CONO ARTIC COMMERCIALE SRL': 'confezionamento' })

  it('somma per voce, con i fornitori dentro dal più pesante', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-03', totale: 2077.85, imponibile: 1888.95, imposta: 188.9 }),
      fattura({ fornitore: 'DESA S.r.l.', data_fattura: '2026-06-20', totale: 1100, imponibile: 1000, imposta: 100 }),
      fattura({ fornitore: 'Enel Energia S.p.A.', data_fattura: '2026-06-12', totale: 610, imponibile: 500, imposta: 110 }),
    ], { mese: '2026-06', categoriePerFornitore: cat })
    expect(r.mese).toBe('2026-06')
    expect(r.perCategoria.map(v => v.id)).toEqual(['materie-prime', 'utenze'])
    const mp = r.perCategoria[0]
    expect(mp).toMatchObject({ nome: 'Materie prime', tipo: 'costo', importo: 2888.95, nFatture: 2, nSenzaImponibile: 0, importoIvaCompresa: 0 })
    // «DESA SRL» e «DESA S.r.l.» sono lo stesso fornitore
    expect(mp.fornitori).toHaveLength(1)
    expect(r.totaleCosti).toBe(3388.95)
  })

  it('competenza: conta la data della fattura, dal primo all\'ultimo giorno compresi', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-05-31', totale: 100, imponibile: 100 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-01', totale: 10, imponibile: 10 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-30T00:00:00', totale: 20, imponibile: 20, data_pagamento: '2026-09-15' }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-07-01', totale: 1000, imponibile: 1000 }),
    ], { mese: '2026-06', categoriePerFornitore: cat })
    expect(r.totaleCosti).toBe(30)
    expect(costiPerMese([fattura({ fornitore: 'DESA SRL', data_fattura: '2024-02-29', totale: 5, imponibile: 5 })], { mese: '2024-02', categoriePerFornitore: cat }).totaleCosti).toBe(5)
  })

  it("senza imponibile entra il totale IVA compresa, e lo si conta a parte", () => {
    const r = costiPerMese([
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-07-02', totale: 1100 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-07-03', totale: 220, imponibile: 200, imposta: 20 }),
    ], { mese: '2026-07', categoriePerFornitore: cat })
    expect(r.perCategoria[0]).toMatchObject({ importo: 1300, nSenzaImponibile: 1, importoIvaCompresa: 1100 })
    expect(r.copertura).toMatchObject({ nFatture: 2, nSenzaImponibile: 1, importoIvaCompresa: 1100 })
  })

  it('le note di credito sottraggono nella voce del fornitore', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'Enel Energia S.p.A.', data_fattura: '2026-06-05', totale: 1220, imponibile: 1000, imposta: 220 }),
      fattura({ fornitore: 'Enel Energia S.p.A.', data_fattura: '2026-06-06', totale: -365.55 }),
    ], { mese: '2026-06', categoriePerFornitore: cat })
    expect(r.perCategoria[0].importo).toBe(634.45)
    expect(r.noteDiCredito).toEqual({ importo: -365.55, nFatture: 1 })
    expect(r.perCategoria[0].fornitori[0].importo).toBe(634.45)
  })

  it('senza voce: daClassificare, FUORI da perCategoria e da totaleCosti', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-08-01', totale: 100, imponibile: 100 }),
      fattura({ fornitore: 'SUQQO S.R.L.', data_fattura: '2026-08-02', totale: 500 }),
      fattura({ fornitore: 'SUQQO SRL', data_fattura: '2026-08-03', totale: 300 }),
      fattura({ fornitore: 'PRONTOSERVICE S.r.l.', data_fattura: '2026-08-04', totale: 200, imponibile: 200 }),
    ], { mese: '2026-08', categoriePerFornitore: cat })
    expect(r.perCategoria.map(v => v.id)).toEqual(['materie-prime'])
    expect(r.totaleCosti).toBe(100)
    expect(r.daClassificare).toMatchObject({ importo: 1000, nFornitori: 2, nFatture: 3, nSenzaImponibile: 2, importoIvaCompresa: 800 })
    expect(r.daClassificare.fornitori[0]).toMatchObject({ importo: 800, nFatture: 2 })
    expect(r.totaleCostiEDaClassificare).toBe(1100)
    expect(r.copertura).toMatchObject({ nSenzaCategoria: 3, importoSenzaCategoria: 1000 })
  })

  it('con zero fornitori classificati (Mara oggi) tutto è da classificare, niente sparisce', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-08-01', totale: 100 }),
      fattura({ fornitore: 'Enel Energia S.p.A.', data_fattura: '2026-08-02', totale: 50 }),
    ], { mese: '2026-08' })
    expect(r.perCategoria).toEqual([])
    expect(r.totaleCosti).toBe(0)
    expect(r.totaleCostiEDaClassificare).toBe(150)
  })

  it('investimenti a parte: la fattura GECKO di luglio non pesa sul mese', () => {
    const cat2 = { ...cat, ...mappa({ 'GECKO CIOCCOLATI E GELATI TORINO SRL': 'materie-prime', 'ACME ARREDI': 'attrezzature' }) }
    const r = costiPerMese([
      fattura({ id: 'gecko', fornitore: 'GECKO CIOCCOLATI E GELATI TORINO SRL', numero_rif: '6', data_fattura: '2026-07-10', totale: 86651, categoria_spesa: 'attrezzature' }),
      fattura({ fornitore: 'GECKO CIOCCOLATI E GELATI TORINO SRL', data_fattura: '2026-07-11', totale: 2002 }),
      fattura({ fornitore: 'ACME ARREDI', data_fattura: '2026-07-12', totale: 1220, imponibile: 1000, imposta: 220 }),
    ], { mese: '2026-07', categoriePerFornitore: cat2 })
    expect(r.totaleCosti).toBe(2002)
    expect(r.investimenti.importo).toBe(87651)
    expect(r.investimenti.fatture[0]).toMatchObject({ id: 'gecko', numero: '6', data: '2026-07-10', importo: 86651, fornitore: 'GECKO CIOCCOLATI E GELATI TORINO SRL' })
    expect(r.investimenti).toMatchObject({ nFatture: 2, nSenzaImponibile: 1, importoIvaCompresa: 86651 })
  })

  it('la voce della fattura vince su quella del fornitore, anche al contrario', () => {
    const cat2 = mappa({ 'ACME ARREDI': 'attrezzature' })
    const r = costiPerMese([
      fattura({ fornitore: 'ACME ARREDI', data_fattura: '2026-07-12', totale: 50, imponibile: 50, categoria_spesa: 'manutenzione' }),
    ], { mese: '2026-07', categoriePerFornitore: cat2 })
    expect(r.perCategoria[0]).toMatchObject({ id: 'manutenzione', importo: 50 })
    expect(r.investimenti.importo).toBe(0)
  })

  it('fuori conto: non entra né nei costi né negli investimenti', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'MARAMIA S.R.L.', data_fattura: '2026-07-01', totale: 999 }),
    ], { mese: '2026-07', categoriePerFornitore: mappa({ 'MARAMIA S.R.L.': 'fuori-conto' }) })
    expect(r.totaleCostiEDaClassificare).toBe(0)
    expect(r.investimenti.importo).toBe(0)
    expect(r.esclusi).toEqual({ importo: 999, nFatture: 1 })
  })

  it('il fornitore si trova anche per P.IVA, e la P.IVA vince sul nome', () => {
    const c = { ['piva:01234567890']: 'utenze', [chiaveFornitore('NOME DIVERSO')]: 'marketing' }
    const f = fattura({ fornitore: 'NOME DIVERSO', piva: 'IT 01234567890', data_fattura: '2026-06-01', totale: 10, imponibile: 10 })
    expect(categoriaDellaFattura(f, c)).toBe('utenze')
    expect(categoriaDellaFattura(f, new Map(Object.entries(c)))).toBe('utenze')
  })

  it('la copertura: ultima fattura di tutto l\'elenco e del mese, fatture senza data', () => {
    const r = costiPerMese([
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-10', totale: 1 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-09-10', totale: 1 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: null, totale: 1 }),
    ], { mese: '2026-06', categoriePerFornitore: cat })
    expect(r.copertura).toMatchObject({ nFatture: 1, ultimaFattura: '2026-09-10', ultimaFatturaDelMese: '2026-06-10', nSenzaData: 1 })
  })

  it('un mese scritto male è un errore, non un conto vuoto', () => {
    expect(() => costiPerMese([], { mese: '2026-6' })).toThrow(/AAAA-MM/)
    expect(() => costiPerPeriodo([], { dal: '2026-06-01' })).toThrow(/periodo/)
  })
})

describe('costiPerMese per una sede: le spese comuni si dividono e lo si dice', () => {
  const cat = mappa({ 'DESA SRL': 'materie-prime' })
  const condivisa = (o) => fattura({ fornitore: 'DESA SRL', sede_id: null, sedi_condivise: [BERTHOLLET, DEGASPERI], ...o })
  const prod = { [DEGASPERI]: 7304.5, [BERTHOLLET]: 6618.6 }

  it('Berthollet + De Gasperi: in proporzione ai chili prodotti', () => {
    const fat = [condivisa({ data_fattura: '2026-06-10', totale: 1000, imponibile: 1000 })]
    const dg = costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: DEGASPERI, produzionePerSede: prod })
    const be = costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: BERTHOLLET, produzionePerSede: prod })
    expect(dg.totaleCosti).toBeCloseTo(524.6, 1)
    expect(be.totaleCosti).toBeCloseTo(475.4, 1)
    expect(dg.totaleCosti + be.totaleCosti).toBeCloseTo(1000, 2)
    expect(dg.ripartizione).toMatchObject({ sedeId: DEGASPERI, certa: true, nFatture: 1, criterio: 'in proporzione ai chili prodotti' })
    expect(dg.ripartizione.importoRipartito).toBeCloseTo(524.6, 1)
  })

  it('senza produzione: parti uguali, e certa = false', () => {
    const r = costiPerMese([condivisa({ data_fattura: '2026-06-10', totale: 1000, imponibile: 1000 })], { mese: '2026-06', categoriePerFornitore: cat, sedeId: BERTHOLLET })
    expect(r.totaleCosti).toBe(500)
    expect(r.ripartizione.certa).toBe(false)
    expect(r.ripartizione.criterio).toMatch(/parti uguali/)
  })

  it('ogni fattura si divide con la produzione del suo mese', () => {
    const perMese = (m) => (m === '2026-06' ? { [DEGASPERI]: 3, [BERTHOLLET]: 1 } : { [DEGASPERI]: 1, [BERTHOLLET]: 1 })
    const r = costiPerPeriodo([
      condivisa({ data_fattura: '2026-06-10', totale: 400, imponibile: 400 }),
      condivisa({ data_fattura: '2026-07-10', totale: 400, imponibile: 400 }),
    ], { dal: '2026-06-01', al: '2026-07-31', categoriePerFornitore: cat, sedeId: DEGASPERI, produzionePerSede: perMese })
    expect(r.totaleCosti).toBe(300 + 200)
  })

  it('le fatture di una sede non entrano nel conto di un\'altra', () => {
    const fat = [fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-10', totale: 100, imponibile: 100, sede_id: CARLINA })]
    expect(costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: CARLINA }).totaleCosti).toBe(100)
    expect(costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: BERTHOLLET }).totaleCosti).toBe(0)
    expect(costiPerMese([condivisa({ data_fattura: '2026-06-10', totale: 100, imponibile: 100 })], { mese: '2026-06', categoriePerFornitore: cat, sedeId: CARLINA }).totaleCosti).toBe(0)
  })

  it('una spesa di tutta l\'azienda: si divide fra le sedi se le conosco, altrimenti si dichiara', () => {
    const fat = [fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-10', totale: 300, imponibile: 300, sede_id: null })]
    const senza = costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: CARLINA })
    expect(senza.totaleCosti).toBe(0)
    expect(senza.ripartizione.senzaSede).toEqual({ importo: 300, nFatture: 1 })
    const con = costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: CARLINA, sedi: [{ id: CARLINA }, { id: DEGASPERI }, { id: BERTHOLLET }] })
    expect(con.totaleCosti).toBe(100)
    expect(con.ripartizione.certa).toBe(false)
  })

  it("tutta l'azienda: ogni fattura conta una volta, niente si divide", () => {
    const r = costiPerMese([
      condivisa({ data_fattura: '2026-06-10', totale: 1000, imponibile: 1000 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-11', totale: 100, imponibile: 100 }),
    ], { mese: '2026-06', categoriePerFornitore: cat })
    expect(r.totaleCosti).toBe(1100)
    expect(r.ripartizione).toBeNull()
  })

  it('le tre sedi sommate fanno il totale dell\'azienda', () => {
    const fat = [
      condivisa({ data_fattura: '2026-06-10', totale: 1000, imponibile: 1000 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-11', totale: 100, imponibile: 100 }),
      fattura({ fornitore: 'DESA SRL', data_fattura: '2026-06-12', totale: 90, imponibile: 90, sede_id: null }),
    ]
    const sedi = [CARLINA, DEGASPERI, BERTHOLLET]
    const somma = sedi.reduce((s, id) => s + costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat, sedeId: id, sedi, produzionePerSede: prod }).totaleCosti, 0)
    expect(somma).toBeCloseTo(costiPerMese(fat, { mese: '2026-06', categoriePerFornitore: cat }).totaleCosti, 1)
  })
})

describe('causeVariazione e fraseCausa: perché i costi sono cambiati', () => {
  const cat = mappa({ 'DESA SRL': 'materie-prime', 'GELINOVA GROUP SRL società unipersonale': 'materie-prime', 'Enel Energia S.p.A.': 'utenze' })
  const conto = (mese, righe) => costiPerMese(righe.map(([fornitore, imponibile]) => fattura({ fornitore, data_fattura: `${mese}-10`, totale: imponibile * 1.1, imponibile })), { mese, categoriePerFornitore: cat })

  it("le voci dalla più pesante, e dentro i fornitori che pesano di più", () => {
    const a = conto('2026-07', [['DESA SRL', 3000], ['GELINOVA GROUP SRL società unipersonale', 2240], ['Enel Energia S.p.A.', 900]])
    const b = conto('2025-07', [['DESA SRL', 1900], ['GELINOVA GROUP SRL società unipersonale', 1000], ['Enel Energia S.p.A.', 1000]])
    const c = causeVariazione(a, b)
    expect(c.differenza).toBe(2240)
    expect(c.voci.map(v => v.id)).toEqual(['materie-prime', 'utenze'])
    expect(c.voci[0]).toMatchObject({ attuale: 5240, confronto: 2900, differenza: 2340 })
    expect(c.voci[0].fornitori.map(f => f.differenza)).toEqual([1240, 1100])
    expect(fraseCausa(c.voci[0])).toBe('Materie prime +2.340 €: soprattutto GELINOVA GROUP +1.240 € e DESA +1.100 €')
    expect(fraseCausa(c.voci[1])).toBe('Utenze −100 €: soprattutto Enel Energia −100 €')
  })

  it('una voce che c\'è solo in uno dei due mesi conta lo stesso', () => {
    const a = conto('2026-07', [['Enel Energia S.p.A.', 500]])
    const b = conto('2025-07', [['DESA SRL', 800]])
    const c = causeVariazione(a, b)
    expect(c.voci.map(v => [v.id, v.differenza])).toEqual([['materie-prime', -800], ['utenze', 500]])
  })

  it('la frase cita solo i fornitori che vanno nello stesso verso', () => {
    const voce = { nome: 'Materie prime', differenza: 500, fornitori: [{ nome: 'DESA SRL', differenza: -300 }, { nome: 'GELINOVA', differenza: 800 }] }
    expect(fraseCausa(voce)).toBe('Materie prime +500 €: soprattutto GELINOVA +800 €')
    expect(fraseCausa({ nome: 'Utenze', differenza: 40, fornitori: [] })).toBe('Utenze +40 €')
  })

  it('avverte quando una parte della differenza è IVA', () => {
    const a = costiPerMese([fattura({ fornitore: 'DESA SRL', data_fattura: '2026-07-10', totale: 1100 })], { mese: '2026-07', categoriePerFornitore: cat })
    const b = costiPerMese([fattura({ fornitore: 'DESA SRL', data_fattura: '2025-07-10', totale: 1100, imponibile: 1000, imposta: 100 })], { mese: '2025-07', categoriePerFornitore: cat })
    const c = causeVariazione(a, b)
    expect(c.voci[0]).toMatchObject({ differenza: 100, ivaMista: true })
  })

  it('i da classificare sono una voce, gli investimenti stanno a parte', () => {
    const a = costiPerMese([
      fattura({ fornitore: 'SUQQO S.R.L.', data_fattura: '2026-07-10', totale: 700 }),
      fattura({ fornitore: 'GECKO', data_fattura: '2026-07-10', totale: 86651, categoria_spesa: 'attrezzature' }),
    ], { mese: '2026-07', categoriePerFornitore: cat })
    const b = costiPerMese([], { mese: '2025-07', categoriePerFornitore: cat })
    const c = causeVariazione(a, b)
    expect(c.voci).toHaveLength(1)
    expect(c.voci[0]).toMatchObject({ id: null, nome: 'Da classificare', differenza: 700 })
    expect(c.investimenti).toEqual({ attuale: 86651, confronto: 0, differenza: 86651 })
    expect(c.differenza).toBe(700)
  })

  it('al massimo tre fornitori per voce, se non si chiede altro', () => {
    const nomi = ['A1 SRL', 'B2 SRL', 'C3 SRL', 'D4 SRL']
    const cat4 = mappa(Object.fromEntries(nomi.map(n => [n, 'materie-prime'])))
    const a = costiPerMese(nomi.map((n, i) => fattura({ fornitore: n, data_fattura: '2026-07-01', totale: 100 * (i + 1), imponibile: 100 * (i + 1) })), { mese: '2026-07', categoriePerFornitore: cat4 })
    const b = costiPerMese([], { mese: '2025-07', categoriePerFornitore: cat4 })
    expect(causeVariazione(a, b).voci[0].fornitori.map(f => f.nome)).toEqual(['D4 SRL', 'C3 SRL', 'B2 SRL'])
    expect(causeVariazione(a, b, { maxFornitori: 1 }).voci[0].fornitori).toHaveLength(1)
  })
})

describe('nomeBreve: il fornitore come lo si dice', () => {
  it.each([
    ['GELINOVA GROUP SRL società unipersonale', 'GELINOVA GROUP'],
    ['ALBAGEL sas di Vecchio Enrico & C.', 'ALBAGEL'],
    ['Foodinho, SRL', 'Foodinho'],
    ['Enel Energia S.p.A.', 'Enel Energia'],
    ['COMMERCIALISTIINTORINO S.S. STP', 'COMMERCIALISTIINTORINO'],
    ['MORE & MACINE BORGOGNO & CARBONE SNC', 'MORE & MACINE BORGOGNO & CARBONE'],
    ['Vecchio Enrico', 'Vecchio Enrico'],
    ['', ''],
  ])('%s → %s', (nome, atteso) => {
    expect(nomeBreve(nome)).toBe(atteso)
  })
})

describe('fattureEccezionali: le candidate a investimento', () => {
  const gecko = (o) => fattura({ fornitore: 'GECKO CIOCCOLATI E GELATI TORINO SRL', ...o })

  it('la fattura GECKO da 86.651 € contro le solite da 2-3 mila', () => {
    const r = fattureEccezionali([
      gecko({ id: 'g1', data_fattura: '2025-01-08', totale: 3200.67 }),
      gecko({ id: 'g2', data_fattura: '2025-03-08', totale: 2002 }),
      gecko({ id: 'g3', data_fattura: '2026-07-10', totale: 86651, numero_rif: '6' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'g3', numero: '6', data: '2026-07-10', importo: 86651, tipica: 2601.34 })
    expect(r[0].volteLaTipica).toBeCloseTo(33.3, 1)
    expect(r[0].motivo).toMatch(/33 volte la sua fattura tipica/)
  })

  it('una fattura grande ma nella norma del fornitore non è eccezionale', () => {
    const r = fattureEccezionali([
      fattura({ fornitore: 'Vecchio Enrico', data_fattura: '2026-05-30', totale: 5152 }),
      fattura({ fornitore: 'Vecchio Enrico', data_fattura: '2026-06-30', totale: 4900 }),
      fattura({ fornitore: 'Vecchio Enrico', data_fattura: '2026-07-30', totale: 6100 }),
    ])
    expect(r).toEqual([])
  })

  it('cinque volte la tipica ma sotto i 5.000 €: non si disturba il titolare', () => {
    const r = fattureEccezionali([
      fattura({ fornitore: 'X SRL', data_fattura: '2026-01-01', totale: 100 }),
      fattura({ fornitore: 'X SRL', data_fattura: '2026-02-01', totale: 100 }),
      fattura({ fornitore: 'X SRL', data_fattura: '2026-03-01', totale: 4000 }),
    ])
    expect(r).toEqual([])
  })

  it('un fornitore con una fattura sola: segnalata solo da 10.000 € in su', () => {
    expect(fattureEccezionali([fattura({ fornitore: 'MERCATO CENTRALE MILANO SRL', data_fattura: '2024-11-07', totale: 35063 })])[0].motivo).toBe('unica fattura di questo fornitore')
    expect(fattureEccezionali([fattura({ fornitore: 'Y SRL', data_fattura: '2024-11-07', totale: 9000 })])).toEqual([])
  })

  it('già decisa, già investimento, nota di credito o prima di «dal»: non si ripropone', () => {
    const storico = [gecko({ data_fattura: '2025-01-08', totale: 3200 }), gecko({ data_fattura: '2025-03-08', totale: 2000 })]
    const grande = gecko({ data_fattura: '2026-07-10', totale: 86651 })
    expect(fattureEccezionali([...storico, { ...grande, categoria_spesa: 'materie-prime' }])).toEqual([])
    expect(fattureEccezionali([...storico, grande], { categoriePerFornitore: mappa({ 'GECKO CIOCCOLATI E GELATI TORINO SRL': 'attrezzature' }) })).toEqual([])
    expect(fattureEccezionali([...storico, { ...grande, totale: -86651 }])).toEqual([])
    expect(fattureEccezionali([...storico, grande], { dal: '2026-08-01' })).toEqual([])
    expect(fattureEccezionali([...storico, grande], { dal: '2026-07-01' })).toHaveLength(1)
  })
})

// ── Prove di mutazione (03/10/2026) ─────────────────────────────────────
// Ogni mutazione è stata applicata a src/lib/contoEconomico.js, questo file
// rieseguito da solo, il sorgente rimesso a posto. Tutte e dieci rosse:
//   1. note di credito: `segno = 1` sempre in importoSenzaIva       1 rosso
//   2. scorporo inventato: totale / 1,1 al posto di null           10 rossi
//   3. competenza: `d > al` → `d >= al` (ultimo giorno fuori)        1 rosso
//   4. ripartizione: quota sempre 1 sulle fatture condivise          4 rossi
//   5. precedenza: categoria del fornitore prima di categoria_spesa  3 rossi
//   6. daClassificare dentro totaleCosti                             3 rossi
//   7. investimenti trattati come costi                              2 rossi
//   8. fattureEccezionali: soglia 5 volte → 50 volte                 2 rossi
//   9. fattureEccezionali: note di credito non escluse               1 rosso
//  10. «Attrezzature» del fornitore di nuovo letto come investimento 2 rossi
