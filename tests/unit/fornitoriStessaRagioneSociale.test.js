// «FOODINHO, SRL» e «Foodinho S.R.L.» sono la stessa azienda.
//
// ═══ Il difetto vero, 16/09/2026 ═══════════════════════════════════════════
//
// Il nome del fornitore è la chiave con cui FoodOS tiene insieme le fatture,
// i termini di pagamento, l'IBAN e la spesa. La funzione che lo normalizza
// faceva solo tre cose — maiuscolo, trim, spazi singoli — e quindi bastava un
// punto o una virgola in più per creare un secondo fornitore.
//
// Misurato sulle 3.520 fatture di produzione di Mara dei Boschi: NOVE
// fornitori avevano due schede ciascuno, per **104.619,41 € su 221 fatture**,
// di cui **9.925,33 € ancora da pagare**.
//
//     FOODINHO S.R.L. + FOODINHO, SRL              93 fatture   45.352,97 €
//     RBS S.R.L. + RBS SRL                         64 fatture   40.047,52 €
//     SPAZIOTTANTOTTO S.R.L. + ... SRL             15 fatture    7.191,90 €
//     PERINOVESCO S.R.L. + ... SRL                 22 fatture    5.645,81 €
//     PEYRANO TORINO S.R.L. + ... SRL               7 fatture    2.527,64 €
//     FARCOMI S.R.L. + FARCOMI SRL                  6 fatture    2.257,36 €
//     LUOGO DIVINO S.R.L. + ... SRL                 5 fatture      986,80 €
//     RCH S.P.A. + RCH SPA                          7 fatture      585,60 €
//     CASALINGHI SICIGNANO S.R.L. + ... SRL         2 fatture       23,81 €
//
// ═══ Cosa costava ═════════════════════════════════════════════════════════
//
// · Lo Scadenzario mostrava due schede per lo stesso fornitore, e il dovuto
//   di ciascuna era una parte del vero: FOODINHO appariva come 38.237,72 € in
//   una riga e 7.115,25 € in un'altra, invece dei 45.352,97 € che sono.
// · I termini di pagamento e l'IBAN scritti su una scheda non valevano per
//   l'altra: quelle fatture tornavano ai trenta giorni predefiniti e restavano
//   senza IBAN, quindi fuori dal bonifico SEPA.
// · Il piano di pagamento cumulativo imputava solo le fatture di una delle due
//   schede.
// · Nella classifica «quanto spendo con chi», SPAZIOTTANTOTTO stava al 44° e
//   al 105° posto invece che al 37°.
//
// ═══ La regola, e dove si ferma ═══════════════════════════════════════════
//
// La punteggiatura della forma societaria si TOGLIE, non si sostituisce con
// uno spazio: «S.R.L.» deve diventare «SRL», non «S R L». Gli accenti si
// appiattiscono perché nei dati veri convivono «SOCIETÀ» e «SOCIETA'».
// Trattino e barra diventano spazio.
//
// Quello che la regola NON fa, di proposito: non toglie la forma societaria.
// «ROSSI SRL» e «ROSSI SPA» possono essere due società diverse dello stesso
// gruppo. Sui dati veri toglierla non unirebbe nessun'altra coppia: non
// serve, e costa un rischio.
//
// **Il righello.** Applicata alle 321 scritture distinte di produzione, la
// regola ne lascia 312 — nove accorpamenti, esattamente le nove coppie qui
// sopra, e nessun altro. Se ne unisse di più ci sarebbe da sospettare della
// regola prima che dei dati: i test qui sotto lo verificano nei due sensi.

import { describe, it, expect } from 'vitest'
import { normNome, arricchisci } from '../../src/lib/scadenzeFatture'
import { normNomeFornitore, spesaDaFatture, raggruppaFornitoriDaFatture } from '../../src/lib/fornitoriDaFatture'
import { imputaPagamento } from '../../src/lib/pagamentiFornitore'

// La vecchia regola, tenuta qui per misurare lo scarto.
const normVecchia = s => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')

// Le nove coppie vere, copiate dal database di produzione.
const COPPIE = [
  ['FOODINHO S.R.L.', 'FOODINHO, SRL'],
  ['RBS S.R.L.', 'RBS SRL'],
  ['SPAZIOTTANTOTTO S.R.L.', 'SPAZIOTTANTOTTO SRL'],
  ['PERINOVESCO S.R.L.', 'PERINOVESCO SRL'],
  ['PEYRANO TORINO S.R.L.', 'PEYRANO TORINO SRL'],
  ['FARCOMI S.R.L.', 'FARCOMI SRL'],
  ['LUOGO DIVINO S.R.L.', 'LUOGO DIVINO SRL'],
  ['RCH S.P.A.', 'RCH SPA'],
  ['CASALINGHI SICIGNANO S.R.L.', 'CASALINGHI SICIGNANO SRL'],
]

// ═══ 1. RIPRODUCE ═════════════════════════════════════════════════════════
describe('il difetto di prima: due schede per lo stesso fornitore', () => {
  it('la vecchia regola teneva separate tutte e nove le coppie', () => {
    for (const [a, b] of COPPIE) {
      expect(normVecchia(a)).not.toBe(normVecchia(b))
    }
  })

  it('e con due chiavi la spesa del fornitore si spezzava in due righe', () => {
    const fatture = [
      { fornitore: 'FOODINHO S.R.L.', totale: 38237.72, data_fattura: '2026-06-01' },
      { fornitore: 'FOODINHO, SRL', totale: 7115.25, data_fattura: '2026-06-02' },
    ]
    const chiaviVecchie = new Set(fatture.map(f => normVecchia(f.fornitore)))
    expect(chiaviVecchie.size).toBe(2)
  })
})

// ═══ 2. LA CORREZIONE ═════════════════════════════════════════════════════
describe('adesso la stessa ragione sociale è una chiave sola', () => {
  it('le nove coppie di produzione si uniscono', () => {
    for (const [a, b] of COPPIE) {
      expect(normNome(a)).toBe(normNome(b))
    }
  })

  it('«S.R.L.» diventa «SRL», non «S R L»', () => {
    // È il dettaglio su cui il primo tentativo di correzione era sbagliato:
    // sostituire i punti con uno SPAZIO spezza la sigla e non unisce niente.
    expect(normNome('RBS S.R.L.')).toBe('RBS SRL')
    expect(normNome('RCH S.P.A.')).toBe('RCH SPA')
  })

  it('appiattisce gli accenti, perché nei dati veri convivono le due forme', () => {
    // Nel database ci sono sia «Eni Plenitude S.p.A. Società Benefit» sia
    // «REVA SOCIETA' AGRICOLA...»: la À e la A-apostrofo sono la stessa lettera.
    expect(normNome("SOCIETA' AGRICOLA")).toBe(normNome('Società Agricola'))
    expect(normNome('CAFFÈ BORBONE SRL')).toBe(normNome("CAFFE' BORBONE SRL"))
  })

  it('tratta trattino e barra come spazi', () => {
    expect(normNome('COCA-COLA HBC')).toBe(normNome('COCA COLA HBC'))
  })

  it('le due copie della regola ora sono la stessa funzione', () => {
    // Prima `normNome` e `normNomeFornitore` erano due costanti identiche in
    // due file: due copie che possono divergere alla prima modifica.
    expect(normNomeFornitore).toBe(normNome)
    expect(normNomeFornitore('FOODINHO, SRL')).toBe(normNome('FOODINHO S.R.L.'))
  })
})

// ═══ 3. IL RIGHELLO: non deve unire quello che è diverso ══════════════════
describe('quello che NON deve unire', () => {
  it('non toglie la forma societaria: SRL e SPA restano due società', () => {
    expect(normNome('ROSSI SRL')).not.toBe(normNome('ROSSI SPA'))
    expect(normNome('MONTEGLIO SPA')).not.toBe(normNome('MONTEGLIO SRL'))
  })

  it('non unisce fornitori con nomi diversi', () => {
    expect(normNome('PEYRANO TORINO SRL')).not.toBe(normNome('PEYRANO MILANO SRL'))
    expect(normNome('CONO ARTIC COMMERCIALE SRL')).not.toBe(normNome('CONO ARTIC SRL'))
  })

  it('su un elenco misto unisce esattamente le coppie vere e nient altro', () => {
    // Il righello in forma di test: 12 scritture, 9 fornitori distinti.
    const nomi = [
      'FOODINHO S.R.L.', 'FOODINHO, SRL',            // → 1
      'RBS S.R.L.', 'RBS SRL',                       // → 1
      'RCH S.P.A.', 'RCH SPA',                       // → 1
      'DESA SRL', 'SUQQO S.R.L.', 'CONO ARTIC COMMERCIALE SRL',
      'PEYRANO TORINO SRL', 'PEYRANO MILANO SRL',
      'MONTEGLIO SPA',
    ]
    expect(new Set(nomi.map(normVecchia)).size).toBe(12)
    expect(new Set(nomi.map(normNome)).size).toBe(9)
  })

  it('il vuoto e la spazzatura restano vuoti, non una chiave finta', () => {
    expect(normNome('')).toBe('')
    expect(normNome(null)).toBe('')
    expect(normNome(undefined)).toBe('')
    expect(normNome('   ')).toBe('')
    // Un nome fatto di sola punteggiatura non diventa una chiave: diventa
    // stringa vuota, e chi la usa la scarta (`if (!chiave) continue`).
    expect(normNome('...')).toBe('')
  })
})

// ═══ 4. QUELLO CHE C'È INTORNO ════════════════════════════════════════════
describe('cosa cambia nelle pagine che usano la chiave', () => {
  const FATTURE = [
    { id: 1, fornitore: 'FOODINHO S.R.L.', totale: 1000, importo_pagato: 0, stato: 'da_pagare', data_fattura: '2026-06-01' },
    { id: 2, fornitore: 'FOODINHO, SRL', totale: 500, importo_pagato: 0, stato: 'da_pagare', data_fattura: '2026-06-10' },
    { id: 3, fornitore: 'DESA SRL', totale: 300, importo_pagato: 0, stato: 'da_pagare', data_fattura: '2026-06-05' },
  ]

  it('la spesa del fornitore torna in una riga sola', () => {
    const { righe } = spesaDaFatture(FATTURE)
    expect(righe.length).toBe(2)
    const foodinho = righe.find(r => normNome(r.nome).startsWith('FOODINHO'))
    expect(foodinho.totale).toBe(1500)
    expect(foodinho.nFatture).toBe(2)
  })

  it('la pagina Fornitori propone una scheda sola da importare', () => {
    const { daImportare } = raggruppaFornitoriDaFatture(FATTURE, [], '2026-09-16')
    expect(daImportare.length).toBe(2)
    expect(daImportare[0].nome).toBe('FOODINHO S.R.L.')   // la scrittura più frequente
    expect(daImportare[0].totale).toBe(1500)
  })

  it('e un fornitore già in anagrafica non torna fra quelli da importare per via di un punto', () => {
    // Questo era il caso peggiore: l'anagrafica dice «FOODINHO SRL», le
    // fatture dicono «FOODINHO S.R.L.», e la pagina proponeva di inserirlo
    // una seconda volta.
    const { daImportare, giaPresenti } = raggruppaFornitoriDaFatture(
      FATTURE, [{ nome: 'Foodinho Srl' }], '2026-09-16')
    expect(giaPresenti.map(v => v.totale)).toEqual([1500])
    expect(daImportare.some(v => normNome(v.nome).startsWith('FOODINHO'))).toBe(false)
  })

  it('i termini di pagamento concordati valgono per tutte e due le scritture', () => {
    // L'anagrafica è scritta una volta sola, con una delle due grafie: prima
    // le fatture dell'altra grafia ricadevano sui 30 giorni predefiniti.
    const anagrafiche = { [normNome('FOODINHO SRL')]: { termini_pagamento: 60, termini_tipo: 'netti', iban: 'IT60X0542811101000000123456' } }
    const arr = arricchisci(FATTURE, anagrafiche)
    const a = arr.find(f => f.id === 1)
    const b = arr.find(f => f.id === 2)
    expect(a._termini).toBe(60)
    expect(b._termini).toBe(60)
    // E l'IBAN arriva a tutte e due: senza, la fattura resta fuori dal SEPA.
    expect(a.iban).toBe('IT60X0542811101000000123456')
    expect(b.iban).toBe('IT60X0542811101000000123456')
  })

  it('un bonifico cumulativo imputa le fatture di tutte e due le scritture', () => {
    const foodinho = FATTURE.filter(f => normNome(f.fornitore).startsWith('FOODINHO'))
    const piano = imputaPagamento(foodinho, 1500)
    expect(piano.dovutoTotale).toBe(1500)
    expect(piano.chiuse).toBe(2)
    expect(piano.eccedenza).toBe(0)
  })
})
