// ── Le righe di totale si saltano, e si dice ────────────────────────────
//
// Quasi ogni file che arriva da un cliente ha in fondo una riga «TOTALE
// 4.850 €», e spesso dei «Subtotale» in mezzo, uno per famiglia di prodotti.
// Letta come riga normale nasce una materia prima che si chiama TOTALE e
// costa 4.850 € al chilo — e da lì entra nel food cost di chi la usa.
//
// Decisione del titolare, 22/09/2026: «saltale però dicendolo, anche
// subtotale, tot. ecc e tutti i simili, dai comunque l'avviso».
//
// Le due metà contano uguale. Saltare senza dirlo è come non leggerle: chi
// guarda il riepilogo vede «120 righe importate» su un file di 123 e non sa
// se le tre mancanti erano somme o merce vera.
//
// Il riconoscitore stava dentro `importIncassi.js` in una forma più stretta
// (`tot` all'inizio, oppure «totale mese») e lì saltava in silenzio.
import { describe, it, expect } from 'vitest'
import { eRigaDiTotale, dividiRigheDiTotale, avvisoRigheDiTotale } from '../../src/lib/righeDiTotale'

describe('Cosa è una riga di totale', () => {
  it('le parole che un foglio italiano usa per sommare', () => {
    for (const s of ['TOTALE', 'Totale', 'totali', 'TOT', 'Tot.', 'Subtotale', 'SUB TOTALE',
      'Somma', 'Sommano', 'Riepilogo', 'Riporto', 'A riportare', 'Saldo', 'Complessivo']) {
      expect(eRigaDiTotale(s), `«${s}» doveva essere riconosciuta`).toBe(true)
    }
  })

  it('anche quando hanno qualcosa dietro', () => {
    expect(eRigaDiTotale('TOTALE MESE')).toBe(true)
    expect(eRigaDiTotale('Totale generale')).toBe(true)
    expect(eRigaDiTotale('Tot. fatture')).toBe(true)
    expect(eRigaDiTotale('Subtotale gelati')).toBe(true)
  })

  it('e non si fa ingannare dalla punteggiatura o dalle maiuscole', () => {
    expect(eRigaDiTotale('  tot.  ')).toBe(true)
    expect(eRigaDiTotale('TOTALE:')).toBe(true)
  })
})

describe('Cosa NON è una riga di totale', () => {
  it('una materia prima che ha quella parola dentro', () => {
    // Buttare via merce vera è peggio che importare una somma: la somma si
    // vede a occhio, la materia prima mancante no.
    for (const s of ['Panettone totale artigianale', 'Pasta per totani', 'Totano fresco',
      'Crema totalmente vegana', 'Sale']) {
      expect(eRigaDiTotale(s), `«${s}» NON doveva essere scambiata per un totale`).toBe(false)
    }
  })

  it('una cella vuota non è un totale', () => {
    expect(eRigaDiTotale('')).toBe(false)
    expect(eRigaDiTotale(null)).toBe(false)
    expect(eRigaDiTotale(undefined)).toBe(false)
    expect(eRigaDiTotale('   ')).toBe(false)
  })

  it('e nemmeno un numero', () => {
    expect(eRigaDiTotale(4850)).toBe(false)
    expect(eRigaDiTotale('4.850,00')).toBe(false)
  })
})

describe('Dividere un foglio', () => {
  const foglio = [
    { nome: 'Burro', prezzo: 9 },
    { nome: 'Farina', prezzo: 0.95 },
    { nome: 'Subtotale', prezzo: 9.95 },
    { nome: 'Zucchero', prezzo: 1 },
    { nome: 'TOTALE', prezzo: 10.95 },
  ]

  it('tiene la merce e mette da parte le somme', () => {
    const { tenute, saltate } = dividiRigheDiTotale(foglio, r => r.nome)
    expect(tenute.map(r => r.nome)).toEqual(['Burro', 'Farina', 'Zucchero'])
    expect(saltate.map(s => s.testo)).toEqual(['Subtotale', 'TOTALE'])
  })

  it('e si ricorda a che riga stavano', () => {
    const { saltate } = dividiRigheDiTotale(foglio, r => r.nome)
    expect(saltate.map(s => s.indice)).toEqual([2, 4])
  })

  it('senza dirgli quale cella guardare, prende la prima scritta', () => {
    const righe = [{ a: '', b: 'TOTALE', c: 99 }, { a: '', b: 'Burro', c: 9 }]
    const { tenute, saltate } = dividiRigheDiTotale(righe)
    expect(saltate).toHaveLength(1)
    expect(tenute).toHaveLength(1)
  })

  it('un foglio senza totali resta intero', () => {
    const { tenute, saltate } = dividiRigheDiTotale([{ nome: 'Burro' }], r => r.nome)
    expect(tenute).toHaveLength(1)
    expect(saltate).toEqual([])
  })

  it('e un foglio vuoto non fa saltare niente', () => {
    expect(dividiRigheDiTotale(null).tenute).toEqual([])
    expect(dividiRigheDiTotale([]).saltate).toEqual([])
  })
})

describe('L\'avviso', () => {
  it('fa i nomi, invece di dire solo quante', () => {
    // «Ho saltato TOTALE MESE» si controlla in due secondi. «Ho saltato 3
    // righe» manda a cercare.
    const a = avvisoRigheDiTotale([{ testo: 'TOTALE MESE' }, { testo: 'Subtotale' }])
    expect(a).toMatch(/TOTALE MESE/)
    expect(a).toMatch(/Subtotale/)
    expect(a).toMatch(/2 righe/)
  })

  it('al singolare parla al singolare', () => {
    expect(avvisoRigheDiTotale([{ testo: 'TOTALE' }])).toMatch(/una riga di totale/)
  })

  it('con tante non le elenca tutte', () => {
    const molte = ['A', 'B', 'C', 'D', 'E', 'F'].map(t => ({ testo: 'Totale ' + t }))
    const a = avvisoRigheDiTotale(molte)
    expect(a).toMatch(/e altre 2/)
  })

  it('e se non c\'è niente da dire non dice niente', () => {
    expect(avvisoRigheDiTotale([])).toBe(null)
    expect(avvisoRigheDiTotale(null)).toBe(null)
  })

  it('spiega anche PERCHÉ le ha saltate', () => {
    // Un avviso che dice solo cosa ha fatto lascia il dubbio che sia un
    // errore. Dicendo «è una somma, non un dato» chiude la domanda.
    expect(avvisoRigheDiTotale([{ testo: 'TOTALE' }])).toMatch(/somma/i)
  })
})
