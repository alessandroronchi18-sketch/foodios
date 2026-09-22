// ── La scheda del fornitore si compila dalla sua bolla ──────────────────
//
// Richiesta del titolare, 22/09/2026: «ci sarebbe da creare un tool se non
// c'è già che caricando una bolla prende tutti i dati e compila la scheda del
// fornitore».
//
// Ogni testata di bolla porta già tutto: nome, via, CAP, comune, provincia,
// telefono, email, P.IVA, codice fiscale, IBAN, condizioni di pagamento. Su
// una sola (ConoArtic) c'è perfino **il numero WhatsApp dichiarato dal
// fornitore** — l'unico posto in tutto il prodotto dove esiste.
//
// ── La regola ────────────────────────────────────────────────────────────
//
// Un dato sbagliato in anagrafica è peggio di un dato mancante: una P.IVA
// storta fa rimbalzare la fattura elettronica, un IBAN storto manda un
// bonifico a qualcun altro. Quindi tutto ciò che si può verificare si
// verifica, e se non passa esce `null`.
//
// I testi qui sotto sono **copiati dalle testate vere** delle 32 bolle
// fotografate il 22/09/2026: cinque fornitori, cinque impaginazioni.
import { describe, it, expect } from 'vitest'
import {
  datiFornitoreDaBolla, partitaIvaValida, ibanValido, normalizzaIban,
  codiceFiscaleValido, telefonoPulito, numeroWhatsApp, condizioniPagamento,
  differenzeScheda,
} from '../../src/lib/datiFornitoreDaBolla.js'

const TESTATE = {
  vecchio: `Vecchio Enrico
Via Torretta, 9
12050 Montelupo Albese    CN
Tel.   335 6039023
P. IVA  04210170041
C. F.   VCCNRC67E03F537M
REA:   CN 296379
Email:  enrico.vecchio@hotmail.com
COND. PAGAMENTO BONIFICO BANCARIO
NS BANCA D' APPOGGIO INTESA SANPAOLO
IBAN: IT70U0306922540100000008183`,

  conoartic: `ConoArtic CENTRO FORNITURE PER GELATERIE
Via Felizzano 7/E - 10127 - Torino
www.conoartic.it - info@conoartic.it
Tel e Whatsapp - 0116964241
CONO ARTIC COMMERCIALE SRL
C.F. e P.IVA 04685360010 // N. R.E.A. TO652981
CONDIZIONI DI PAGAMENTO BONIFICO BANC.RICEVIM.FATTURA`,

  desa: `DESA s.r.l.
Sede Legale ed operativa: Strada Undicesima n.3 Interporto Sito Nord
10040 RIVALTA DI TORINO (TO)
Tel.0114081270-/1 Fax: 011-4080248 E.mail: info@desa.it
P.IVA 07944990014
PAGAMENTO ALLA CONSE`,

  foglia: `LA FOGLIA PRODOTTI ORTOFRUTTICOLI
LA FOGLIA S.R.L.
Sede Operativa: Via Reiss Romoli, 291 - 10154 TORINO
Tel. 011.2745603 - Fax 011.2748044 - Cell. 339.7312087
lafoglia.torino@gmail.com - lafoglia.srl@pec.it
Sede Legale: Via Bligny, 5 - 10128 TORINO
C.F. e P. IVA 08843670012
IT87Q0304801010000000083173`,

  galatea: `galatea gelato secondo natura
Gelinova Group Srl - Societa unipersonale
Sede operativa: via Interporto Centro Ingrosso, 151, 33170 - Pordenone, Italia
P.I. 03762010266 - R.E.A. di TV n. 296438
T. +39 0434 598109 - E. info@galatea-gelati.com
www.galateagelati.it
Condizioni di pagamento: BONIFICO BANCARIO 30 GG.
Iban: IT49Z0708412500000000010611`,
}

describe('La partita IVA si verifica, non si copia e basta', () => {
  it('le cinque vere passano', () => {
    for (const p of ['04210170041', '04685360010', '07944990014', '08843670012', '03762010266']) {
      expect(partitaIvaValida(p), p).toBe(true)
    }
  })
  it('una cifra cambiata non passa', () => {
    // È il punto: una P.IVA storta fa rimbalzare la fattura elettronica, e
    // il guaio si scopre settimane dopo dal commercialista.
    expect(partitaIvaValida('04210170042')).toBe(false)
    expect(partitaIvaValida('04685360011')).toBe(false)
  })
  it('e nemmeno una lunghezza sbagliata o undici zeri', () => {
    expect(partitaIvaValida('0421017004')).toBe(false)
    expect(partitaIvaValida('042101700411')).toBe(false)
    expect(partitaIvaValida('00000000000')).toBe(false)
    expect(partitaIvaValida(null)).toBe(false)
  })
})

describe('L\'IBAN si verifica col resto 97', () => {
  it('i due veri passano', () => {
    expect(ibanValido('IT70U0306922540100000008183')).toBe(true)
    expect(ibanValido('IT49Z0708412500000000010611')).toBe(true)
    expect(ibanValido('IT87Q0304801010000000083173')).toBe(true)
  })
  it('una cifra cambiata no', () => {
    // Un IBAN sbagliato spesso non è un bonifico che torna indietro: è un
    // bonifico che arriva a qualcun altro.
    expect(ibanValido('IT70U0306922540100000008184')).toBe(false)
  })
  it('e la forma va rispettata', () => {
    expect(ibanValido('DE89370400440532013000')).toBe(false)  // non italiano
    expect(ibanValido('IT70U03069225401000000081')).toBe(false)  // corto
    expect(ibanValido('')).toBe(false)
  })
  it('lo si normalizza come lo vuole il SEPA: maiuscolo, senza spazi', () => {
    expect(normalizzaIban('it70 u030 6922 5401 0000 0008 183')).toBe('IT70U0306922540100000008183')
    expect(normalizzaIban('IT70-U0306922540100000008183')).toBe('IT70U0306922540100000008183')
  })
  it('ma uno storto non si normalizza: esce null', () => {
    expect(normalizzaIban('IT70U0306922540100000008184')).toBe(null)
  })
})

describe('Codice fiscale, telefono, WhatsApp', () => {
  it('il codice fiscale ha una forma sola', () => {
    expect(codiceFiscaleValido('VCCNRC67E03F537M')).toBe(true)
    expect(codiceFiscaleValido('VCCNRC67E03F537')).toBe(false)
    expect(codiceFiscaleValido('04210170041')).toBe(false)
  })
  it('il telefono perde la punteggiatura ma non il prefisso', () => {
    expect(telefonoPulito('011.2745603')).toBe('0112745603')
    expect(telefonoPulito('335 6039023')).toBe('3356039023')
    expect(telefonoPulito('+39 0434 598109')).toBe('+390434598109')
    expect(telefonoPulito('0039 0434 598109')).toBe('+390434598109')
  })
  it('e un numero che non è un numero esce null', () => {
    expect(telefonoPulito('12345')).toBe(null)
    expect(telefonoPulito('')).toBe(null)
    expect(telefonoPulito('chiedere in negozio')).toBe(null)
  })
  it('per wa.me serve il prefisso paese, e si dice quando è supposto', () => {
    // Un numero italiano senza prefisso è un link che non si apre. Il 39 lo
    // mettiamo noi, ma lo dichiariamo: è una supposizione, non un dato.
    expect(numeroWhatsApp('0116964241')).toEqual({ numero: '390116964241', supposto: true })
    expect(numeroWhatsApp('+39 011 6964241')).toEqual({ numero: '390116964241', supposto: false })
  })
})

describe('Le condizioni di pagamento, come le scrivono davvero', () => {
  it('«BONIFICO BANCARIO 30 GG.» → 30 giorni netti', () => {
    expect(condizioniPagamento('BONIFICO BANCARIO 30 GG.')).toMatchObject({ giorni: 30, tipo: 'netti' })
  })
  it('«PAGAMENTO ALLA CONSEGNA» → zero giorni', () => {
    expect(condizioniPagamento('PAGAMENTO ALLA CONSE')).toMatchObject({ giorni: 0, tipo: 'netti' })
  })
  it('«60 gg f.m.» → fine mese', () => {
    expect(condizioniPagamento('BONIFICO 60 gg f.m.')).toMatchObject({ giorni: 60, tipo: 'fine_mese' })
  })
  it('«RICEVIM.FATTURA» non è un numero di giorni, e non si inventa', () => {
    // ConoArtic paga quando arriva la fattura. Dedurre «30» sarebbe una
    // scadenza inventata dentro lo Scadenzario.
    const c = condizioniPagamento('BONIFICO BANC.RICEVIM.FATTURA')
    expect(c.giorni).toBe(null)
    expect(c.detto).toMatch(/ricevimento/)
  })
  it('e un testo che non dice niente resta null', () => {
    expect(condizioniPagamento('')).toBe(null)
    expect(condizioniPagamento('Grazie e arrivederci')).toBe(null)
  })
})

describe('Le cinque testate vere, lette una per una', () => {
  it('Vecchio Enrico: dieci campi', () => {
    const { campi, dubbi } = datiFornitoreDaBolla(TESTATE.vecchio, { fornitore: 'Vecchio Enrico' })
    expect(campi).toMatchObject({
      nome: 'Vecchio Enrico',
      partita_iva: '04210170041',
      codice_fiscale: 'VCCNRC67E03F537M',
      iban: 'IT70U0306922540100000008183',
      email: 'enrico.vecchio@hotmail.com',
      telefono: '3356039023',
      cap: '12050',
      citta: 'Montelupo Albese',
      provincia: 'CN',
      indirizzo: 'Via Torretta, 9',
    })
    expect(dubbi).toEqual([])
  })

  it('ConoArtic: il WhatsApp dichiarato dal fornitore', () => {
    // «Tel e Whatsapp - 0116964241». È l'unico fornitore su cinque che lo
    // scrive, ed è esattamente il campo che serve per mandargli l'ordine.
    const { campi, dubbi } = datiFornitoreDaBolla(TESTATE.conoartic, { fornitore: 'Cono Artic Commerciale SRL' })
    expect(campi.whatsapp).toBe('0116964241')
    expect(campi.telefono).toBe('0116964241')
    expect(campi.partita_iva).toBe('04685360010')
    expect(campi.indirizzo).toBe('Via Felizzano 7/E')
    expect(campi.citta).toBe('Torino')
    expect(campi.sito).toBe('www.conoartic.it')
    // I giorni non ci sono: paga al ricevimento della fattura.
    expect(campi.termini_pagamento).toBeUndefined()
    expect(dubbi.join(' ')).toMatch(/ricevimento/)
  })

  it('DESA: il fax non diventa il telefono', () => {
    const { campi } = datiFornitoreDaBolla(TESTATE.desa, { fornitore: 'DESA s.r.l.' })
    expect(campi.telefono).toBe('0114081270')
    expect(campi.telefono).not.toContain('4080248')
    expect(campi.citta).toBe('RIVALTA DI TORINO')
    expect(campi.provincia).toBe('TO')
    expect(campi.termini_pagamento).toBe(0)
  })

  it('La Foglia: la PEC non diventa l\'indirizzo a cui si scrive', () => {
    // A `lafoglia.srl@pec.it` non si manda un ordine: si manda una
    // raccomandata elettronica. L'indirizzo per ordinare è l'altro.
    const { campi } = datiFornitoreDaBolla(TESTATE.foglia, { fornitore: 'La Foglia S.r.l.' })
    expect(campi.email).toBe('lafoglia.torino@gmail.com')
    expect(campi.pec).toBe('lafoglia.srl@pec.it')
    expect(campi.iban).toBe('IT87Q0304801010000000083173')
  })

  it('Galatea: «P.I.» invece di «P.IVA», e la sede operativa prima della legale', () => {
    // La merce arriva dalla sede operativa: è quella che serve.
    const { campi } = datiFornitoreDaBolla(TESTATE.galatea, { fornitore: 'Gelinova Group Srl' })
    expect(campi.partita_iva).toBe('03762010266')
    expect(campi.citta).toBe('Pordenone')
    expect(campi.termini_pagamento).toBe(30)
    expect(campi.iban).toBe('IT49Z0708412500000000010611')
  })

  it('tutte e cinque danno almeno nove campi', () => {
    for (const [nome, testo] of Object.entries(TESTATE)) {
      const { quanti } = datiFornitoreDaBolla(testo, { fornitore: nome })
      expect(quanti, nome).toBeGreaterThanOrEqual(9)
    }
  })
})

describe('La partita IVA del cliente non diventa quella del fornitore', () => {
  it('sulla bolla ce ne sono due, e la tua si scarta', () => {
    // Su ogni bolla c'è anche la P.IVA di Mara (12077850019). Prenderla per
    // buona vorrebbe dire creare un fornitore che sei tu.
    const conCliente = TESTATE.vecchio + '\nSPETT.LE CARLINA 21 S.r.l.\nP.IVA 12077850019'
    const { campi, dubbi } = datiFornitoreDaBolla(conCliente, {
      fornitore: 'Vecchio Enrico', pivaCliente: '12077850019',
    })
    expect(campi.partita_iva).toBe('04210170041')
    expect(dubbi).toEqual([])
  })

  it('e se non si sa quale è la tua, si chiede invece di indovinare', () => {
    const conCliente = TESTATE.vecchio + '\nP.IVA 12077850019'
    const { campi, dubbi } = datiFornitoreDaBolla(conCliente, { fornitore: 'Vecchio Enrico' })
    expect(campi.partita_iva).toBeUndefined()
    expect(dubbi.join(' ')).toMatch(/2 partite IVA/)
  })
})

describe('Quello che c\'è già scritto a mano non si sovrascrive', () => {
  it('i campi vuoti si riempiono, quelli pieni si mostrano e basta', () => {
    const { vuoti, diversi } = differenzeScheda(
      { nome: 'Vecchio Enrico', email: 'altro@vecchio.it', telefono: '' },
      { nome: 'Vecchio Enrico', email: 'enrico.vecchio@hotmail.com', telefono: '3356039023', iban: 'IT70U0306922540100000008183' },
    )
    expect(vuoti.map(v => v.campo).sort()).toEqual(['iban', 'telefono'])
    expect(diversi).toHaveLength(1)
    expect(diversi[0]).toMatchObject({ campo: 'email', attuale: 'altro@vecchio.it' })
  })

  it('e le maiuscole non contano come differenza', () => {
    const { diversi } = differenzeScheda({ email: 'INFO@DESA.IT' }, { email: 'info@desa.it' })
    expect(diversi).toEqual([])
  })
})

describe('Il righello di questo file', () => {
  it('un testo vuoto non inventa un fornitore', () => {
    expect(datiFornitoreDaBolla('').quanti).toBe(0)
    expect(datiFornitoreDaBolla(null).campi).toEqual({})
  })

  it('e testo a caso non produce campi finti', () => {
    const { campi } = datiFornitoreDaBolla('Buongiorno, ecco la merce. Grazie mille. 1234')
    expect(campi.partita_iva).toBeUndefined()
    expect(campi.iban).toBeUndefined()
    expect(campi.email).toBeUndefined()
  })

  it('saprebbe accorgersi se la verifica sparisse', () => {
    // Taratura: se `partitaIvaValida` tornasse `true` sempre, questa
    // diventerebbe rossa e con lei metà del file.
    expect(partitaIvaValida('12345678901')).toBe(false)
  })
})
