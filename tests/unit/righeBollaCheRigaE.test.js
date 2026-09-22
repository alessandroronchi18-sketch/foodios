// ── Che riga è: campione, omaggio, reso, servizio, rumore ───────────────
//
// Scritto sulle bolle vere del design partner, fotografate il 22/09/2026:
// dodici documenti di tre fornitori (Galatea, DESA, La Foglia). Ogni caso qui
// sotto è **copiato da un documento**, non inventato.
//
// Il danno è diverso per ogni specie, e il peggiore è silenzioso:
//
//   • un **campione** a 0,001 €/kg che entra nel listino porta la pasta di
//     pistacchio da 30 €/kg a zero, e il food cost di tutti i gusti al
//     pistacchio con lei;
//   • un **omaggio** messo a zero fa sembrare gratis un ingrediente che
//     costa 6,00 €/kg;
//   • un **reso** letto come acquisto viene caricato invece che scaricato:
//     la giacenza sbaglia del doppio;
//   • una riga di **pubblicità** con dentro un prezzo al chilo diventa una
//     materia prima nuova che nessuno ha mai comprato.
import { describe, it, expect } from 'vitest'
import { classificaRiga, classificaRighe, TIPO } from '../../src/lib/righeBolla.js'

const tipo = (r) => classificaRiga(r).tipo

describe('La merce normale resta merce', () => {
  it('una riga qualunque di DESA', () => {
    // PANNA UHT ALBERTI 1lt | LT | 25 | V | 4,98 | | 124,50 | 10
    const c = classificaRiga({ nome: 'panna', quantita: 25, unita: 'LT', tipoRiga: 'V', prezzoUnitario: '4,98', imponibile: '124,50' })
    expect(c.tipo).toBe(TIPO.MERCE)
    expect(c.caricaMagazzino).toBe(true)
    expect(c.applicaPrezzo).toBe(true)
    expect(c.segno).toBe(1)
    expect(c.avviso).toBe(null)
  })

  it('anche con uno sconto vero in percentuale', () => {
    // LATTE FR.A.Q BAR DESA 1lt | 36 | 1,70 | sconto 15,43 | 51,76
    expect(tipo({ nome: 'latte', quantita: 36, unita: 'LT', prezzoUnitario: '1,70', scontoPct: '15,43', imponibile: '51,76' })).toBe(TIPO.MERCE)
  })

  it('e con la quantità netta dell\'ortofrutta', () => {
    // LIMONE FOGLIA COSTI-IT | KG | 9,70 lordi − 0,50 tara = 9,20 netti | 5,80 | 53,36
    expect(tipo({ nome: 'limoni', quantita: '9,20', unita: 'KG', prezzoUnitario: '5,80', imponibile: '53,36' })).toBe(TIPO.MERCE)
  })
})

describe('Il campione si salta, e si dice', () => {
  it('sconto 100% con importo zero — Galatea 001821/2 del 13/05/2026', () => {
    const c = classificaRiga({ nome: 'pasta pistacchio', descrizione: 'Pasta Pistacchio Collection con Sicilia 300gr', quantita: 2, unita: 'NR', prezzoUnitario: '0,001', scontoPct: '100', imponibile: '0,00' })
    expect(c.tipo).toBe(TIPO.CAMPIONE)
    expect(c.caricaMagazzino).toBe(false)
    expect(c.applicaPrezzo).toBe(false)
    expect(c.avviso).toMatch(/campione/)
  })

  it('e il suo prezzo non arriva MAI al listino', () => {
    // È il punto: 0,001 €/kg su una pasta da 30 €/kg è un errore di
    // trentamila volte che non si vede a occhio in nessuna schermata.
    const c = classificaRiga({ nome: 'variegato tropical', descrizione: 'Variegato Tropical Excellence 180GR SAMPLE/CAMPIONE', quantita: 1, unita: 'NR', prezzoUnitario: '0,001', scontoPct: '100', imponibile: '0,00' })
    expect(c.applicaPrezzo).toBe(false)
  })

  it('la parola «campione» basta anche senza lo sconto al 100%', () => {
    expect(tipo({ nome: 'nocciola', descrizione: 'PASTA NOCCIOLA - CAMPIONE', quantita: 1, unita: 'PZ', prezzoUnitario: '0,00', imponibile: '0,00' })).toBe(TIPO.CAMPIONE)
  })

  it('«sample» in inglese lo stesso', () => {
    expect(tipo({ nome: 'variegato', descrizione: 'Sample/Campione', quantita: 1, prezzoUnitario: '0,001', imponibile: '0,00' })).toBe(TIPO.CAMPIONE)
  })

  it('un prezzo simbolico con importo zero, anche senza parole', () => {
    expect(tipo({ nome: 'qualcosa', quantita: 3, unita: 'NR', prezzoUnitario: '0,001', imponibile: '0,00' })).toBe(TIPO.CAMPIONE)
  })

  it('ma un prezzo basso VERO non è un campione', () => {
    // L'acqua costa pochissimo e non è un campione: la soglia è il millesimo
    // di euro con importo zero, non «costa poco».
    expect(tipo({ nome: 'acqua', quantita: 100, unita: 'LT', prezzoUnitario: '0,30', imponibile: '30,00' })).toBe(TIPO.MERCE)
  })

  it('e nemmeno uno sconto grosso ma non pieno', () => {
    expect(tipo({ nome: 'latte', quantita: 36, prezzoUnitario: '1,70', scontoPct: '15,43', imponibile: '51,76' })).toBe(TIPO.MERCE)
  })
})

describe('L\'omaggio entra in magazzino, col suo prezzo vero', () => {
  it('POLPA DI MANGO, 3,1 kg, «Omaggio» scritto nella colonna sconto', () => {
    // Galatea 001821/2: imponibile 18,60 su 3,1 kg = 6,00 €/kg. In fondo al
    // documento «Totale Omaggi 18,60 €» e da pagare 5.486,46 invece di
    // 5.505,06. La merce è arrivata: 3,1 kg da caricare.
    const c = classificaRiga({ nome: 'polpa di mango', quantita: '3,1', unita: 'KG', prezzoUnitario: '6,000', scontoTesto: 'Omaggio', imponibile: '18,60' })
    expect(c.tipo).toBe(TIPO.OMAGGIO)
    expect(c.caricaMagazzino).toBe(true)
    expect(c.applicaPrezzo).toBe(true)   // decisione del titolare: «metti il valore vero»
    expect(c.segno).toBe(1)
    expect(c.avviso).toMatch(/non zero/)
  })

  it('la colonna T di DESA: (O)=Omaggio', () => {
    expect(tipo({ nome: 'panna', quantita: 6, unita: 'LT', tipoRiga: 'O', prezzoUnitario: '4,98', imponibile: '29,88' })).toBe(TIPO.OMAGGIO)
  })

  it('e (I)=Omaggio Riv. Iva', () => {
    expect(tipo({ nome: 'panna', quantita: 6, tipoRiga: 'I', prezzoUnitario: '4,98', imponibile: '29,88' })).toBe(TIPO.OMAGGIO)
  })

  it('e (M)=Sconto in merce', () => {
    expect(tipo({ nome: 'panna', quantita: 6, tipoRiga: 'M', prezzoUnitario: '4,98', imponibile: '29,88' })).toBe(TIPO.OMAGGIO)
  })

  it('un omaggio SENZA prezzo vero resta un campione, non un omaggio a zero', () => {
    // Se non si sa quanto vale, non si finge di saperlo: si salta dicendolo.
    expect(tipo({ nome: 'tale', quantita: 1, scontoTesto: 'Omaggio', prezzoUnitario: '0,001', imponibile: '0,00' })).toBe(TIPO.CAMPIONE)
  })
})

describe('Il reso si scarica, e non tocca il listino', () => {
  it('la colonna T di DESA: (R)=Reso', () => {
    const c = classificaRiga({ nome: 'panna', quantita: 4, unita: 'LT', tipoRiga: 'R', prezzoUnitario: '4,98', imponibile: '19,92' })
    expect(c.tipo).toBe(TIPO.RESO)
    expect(c.caricaMagazzino).toBe(true)
    expect(c.segno).toBe(-1)
    expect(c.applicaPrezzo).toBe(false)
  })

  it('e (N)=Reso Inv.', () => {
    expect(classificaRiga({ nome: 'panna', quantita: 4, tipoRiga: 'N', imponibile: '19,92' }).segno).toBe(-1)
  })

  it('anche la parola scritta, quando la colonna non c\'è', () => {
    expect(tipo({ nome: 'panna', descrizione: 'RESO PANNA SCADUTA', quantita: 2, imponibile: '9,96' })).toBe(TIPO.RESO)
  })

  it('il prezzo di un reso non entra nel listino', () => {
    // Un documento che va nell'altro verso non è una trattativa sul prezzo.
    expect(classificaRiga({ nome: 'panna', tipoRiga: 'R', quantita: 4, prezzoUnitario: '99,00', imponibile: '396,00' }).applicaPrezzo).toBe(false)
  })
})

describe('Il trasporto è un costo, non merce', () => {
  it('La Foglia: 1 TRASPORTO | NR | 1 | 3,00 | 22 | 3,00', () => {
    const c = classificaRiga({ nome: 'trasporto', quantita: 1, unita: 'NR', prezzoUnitario: '3,00', aliquotaIva: 22, imponibile: '3,00' })
    expect(c.tipo).toBe(TIPO.SERVIZIO)
    expect(c.caricaMagazzino).toBe(false)
    expect(c.applicaPrezzo).toBe(false)
    expect(c.avviso).toMatch(/costo/)
  })

  it('e le altre spese che girano sulle bolle', () => {
    for (const n of ['spese di trasporto', 'contributo CONAI', 'imballaggio', 'cauzione bancali', 'imposta di bollo', 'spese incasso']) {
      expect(tipo({ nome: n, quantita: 1, prezzoUnitario: '2,00', imponibile: '2,00' }), n).toBe(TIPO.SERVIZIO)
    }
  })

  it('ma «sacchetti» e «coppette» sono merce: si comprano davvero', () => {
    expect(tipo({ nome: 'sacchetti carta', quantita: 10, unita: 'CF', prezzoUnitario: '4,00', imponibile: '40,00' })).toBe(TIPO.MERCE)
  })
})

describe('Il rumore non diventa una materia prima', () => {
  it('la pubblicità di DESA, che ha un codice E un prezzo al chilo', () => {
    // «OFFERTA FINO AD ESAURIMENTO PROSC.CRUDO ANTICA PIEVE(7208) A 8,98
    // EURO AL KG» — stampata in mezzo al documento, in grande.
    expect(tipo({ nome: 'OFFERTA FINO AD ESAURIMENTO PROSC.CRUDO ANTICA PIEVE(7208) A 8,98 EURO AL KG', quantita: 1, prezzoUnitario: '8,98' })).toBe(TIPO.RUMORE)
  })

  it('il muro di testo legale de La Foglia', () => {
    for (const t of [
      'Assolve gli obblighi di cui all\'art.62, comma 1 del decreto legge 24/1/2012',
      'CATEGORIA : OVE NON INDICATO LA MERCE E\' DA INTENDERSI DI PRIMA CATEGORIA',
      'NON SI ACCETTANO RECLAMI SE NON PERVENUTI ENTRO LE 24 ORE',
      'IN OTTEMPERANZA AL REG. CE 178/2002',
    ]) {
      expect(tipo({ nome: t, quantita: 1, prezzoUnitario: '1,00' }), t.slice(0, 30)).toBe(TIPO.RUMORE)
    }
  })

  it('le istruzioni di consegna di Galatea', () => {
    for (const t of [
      'Consegna TASSATIVA GIOVEDì 10.09.2026 (non prima e non dopo)',
      'ORARIO DI SCARICO dalle 9 alle 12',
      'CONSEGNA SOLO DI MATTINA',
      '*** ATTENZIONE - VOGLIATE AGGIORNARE LE COORDINATE BANCARIE***',
    ]) {
      expect(tipo({ nome: t, quantita: 1, prezzoUnitario: '1,00' }), t.slice(0, 30)).toBe(TIPO.RUMORE)
    }
  })

  it('l\'IBAN, che è pieno di cifre e sembra un codice articolo', () => {
    expect(tipo({ nome: '*** IBAN : IT49Z0708412500000000010611 ***', quantita: 1, prezzoUnitario: '1,00' })).toBe(TIPO.RUMORE)
    expect(tipo({ nome: 'IT87Q0304801010000000083173', quantita: 1, prezzoUnitario: '1,00' })).toBe(TIPO.RUMORE)
  })

  it('le righe di totale', () => {
    for (const t of ['TOTALE IMPONIBILE', 'Totale documento', 'TOT. DA PAGARE', 'Subtotale']) {
      expect(tipo({ nome: t, imponibile: '495,14' }), t).toBe(TIPO.RUMORE)
    }
  })

  it('una riga senza nessun numero', () => {
    expect(tipo({ nome: 'qualcosa di scritto' })).toBe(TIPO.RUMORE)
  })

  it('e una riga senza descrizione', () => {
    expect(tipo({ quantita: 5, prezzoUnitario: '2,00' })).toBe(TIPO.RUMORE)
  })

  it('ma «Pasta per totani» NON è un totale: la parola deve stare all\'inizio', () => {
    expect(tipo({ nome: 'Pasta per totani', quantita: 2, unita: 'KG', prezzoUnitario: '12,00', imponibile: '24,00' })).toBe(TIPO.MERCE)
  })
})

describe('Tutto insieme: una bolla vera', () => {
  // Galatea 001821/2 del 13/05/2026, riga per riga come è stampata.
  const GALATEA = [
    { nome: 'base latte', quantita: '300,0000', unita: 'KG', prezzoUnitario: '8,300', imponibile: '2.490,00' },
    { nome: 'base frutta', quantita: '480,0000', unita: 'KG', prezzoUnitario: '5,200', imponibile: '2.496,00' },
    { nome: 'pasta pistacchio', descrizione: 'Sample/Campione', quantita: '2,0000', unita: 'NR', prezzoUnitario: '0,001', scontoPct: '100', imponibile: '0,00' },
    { nome: 'variegato tropical', descrizione: 'SAMPLE/CAMPIONE', quantita: '1,0000', unita: 'NR', prezzoUnitario: '0,001', scontoPct: '100', imponibile: '0,00' },
    { nome: 'polpa di mango', quantita: '3,1000', unita: 'KG', prezzoUnitario: '6,000', scontoTesto: 'Omaggio', imponibile: '18,60' },
    { nome: '*** IBAN : IT49Z0708412500000000010611 ***' },
    { nome: 'ORARIO DI SCARICO dalle 9 alle 13' },
  ]

  it('due righe di merce, due campioni, un omaggio, due di rumore', () => {
    const { righe, fuori } = classificaRighe(GALATEA)
    expect(righe.filter(r => r._classe.tipo === TIPO.MERCE).length).toBe(2)
    expect(fuori[TIPO.CAMPIONE].length).toBe(2)
    expect(fuori[TIPO.OMAGGIO].length).toBe(1)
    expect(fuori[TIPO.RUMORE].length).toBe(2)
  })

  it('e lo dice, invece di togliere le righe in silenzio', () => {
    const { avvisi } = classificaRighe(GALATEA)
    const tutto = avvisi.join(' | ')
    expect(tutto).toMatch(/2 righe sono campioni/)
    expect(tutto).toMatch(/pasta pistacchio/)
    expect(tutto).toMatch(/omaggio/i)
    expect(tutto).toMatch(/2 righe erano testo del documento/)
  })

  it('la merce da caricare è solo quella comprata più l\'omaggio', () => {
    const { righe } = classificaRighe(GALATEA)
    const daCaricare = righe.filter(r => r._classe.caricaMagazzino)
    expect(daCaricare.map(r => r.nome)).toEqual(['base latte', 'base frutta', 'polpa di mango'])
  })
})

describe('Il righello di questo file', () => {
  it('senza classificazione il campione entrerebbe: è il motivo del file', () => {
    // Taratura: se `classificaRiga` tornasse a dire MERCE per tutto, qui si
    // vedrebbe subito.
    const campione = { nome: 'pasta pistacchio', quantita: 2, prezzoUnitario: '0,001', scontoPct: '100', imponibile: '0,00' }
    expect(classificaRiga(campione).tipo).not.toBe(TIPO.MERCE)
  })

  it('e una riga scritta storta non fa cadere niente', () => {
    for (const storta of [null, undefined, {}, { nome: null }, { nome: 123 }, { quantita: NaN }]) {
      expect(() => classificaRiga(storta)).not.toThrow()
    }
    expect(() => classificaRighe(null)).not.toThrow()
    expect(classificaRighe(null).righe).toEqual([])
  })
})
