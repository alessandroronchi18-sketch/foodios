// Importare i prezzi delle materie prime da un file, senza salvarne uno sbagliato.
//
// ═══ Perché esistono questi test ════════════════════════════════════════
//
// Richiesta del titolare, 18/09/2026: «un pulsante import prezzi in cui uno
// può importare i prezzi in bulk delle materie prime, e un pulsante che se uno
// clicca scarica un esempio del doc excel con già le etichette colonne».
//
// Il motivo per cui questa strada è pericolosa: da qui entrano CENTINAIA di
// prezzi in un colpo solo, e ogni prezzo è un numero di bilancio. Sui dati
// veri di Mara dei Boschi 94 materie prime su 99 non hanno prezzo e il food
// cost medio esce al 4,8% invece del 25-35%: chi userà questo import lo userà
// proprio per riempire quel buco, e si fiderà del risultato.
//
// I due difetti veri che questi test tengono fermi:
//
//  1. **`parseFloat` legge quanto può e butta via il resto.** Trovato la
//     mattina del 18/09/2026: `parseFloat('12,5o')` — la o al posto dello
//     zero, l'errore di battitura più comune sul telefono — risponde `12.5`
//     senza un fiato, e il prezzo sbagliato finisce in archivio senza che
//     nessuno se ne accorga. Su «abc» l'errore si vede, su «12,5o» no. Una
//     cella che non è un numero si scarta e si dice perché.
//  2. **Zero non è «gratis», è «non lo so».** `buildIngCosti` in `foodcost.js`
//     accetta `costoG: 0` come prezzo valido: una materia prima a zero smette
//     di pesare nel food cost senza lasciare traccia. Quindi una cella VUOTA
//     vale `null` e la riga entra lo stesso; una cella con scritto `0` NON
//     viene tradotta in `null` di nascosto, la riga si scarta e si spiega che
//     per «non lo so» la cella va lasciata vuota.
//
// E la terza cosa, che non è un difetto di codice ma di prodotto: l'utente
// deve vedere **cosa succederà prima che succeda**. Il resoconto si prova qui
// riga per riga, compreso il caso «aceto balsamicp» — un nome storpiato non dà
// nessun errore, crea una materia prima gemella senza prezzo, e nel food cost
// non si vede niente di strano.

import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { normIng } from '../../src/lib/foodcost'
import {
  analizzaImportMateriePrime,
  applicaImportMateriePrime,
  costruisciModelloMateriePrime,
  INTESTAZIONI_MODELLO,
  leggiFileMateriePrime,
  leggiPrezzoCella,
  materiaPrimaSimile,
  MOTIVI_SCARTO,
  nomeFileModello,
  normalizzaIntestazione,
  prezzoAmbiguo,
  riconosciColonne,
  righeModelloMateriePrime,
  scaricaModelloMateriePrime,
} from '../../src/lib/materiePrimeImport'

const OPZ = { normalizzaNome: normIng }

/** Un file Excel vero in memoria, come quello che arriva dal fornitore. */
function fileExcel(fogli) {
  const wb = XLSX.utils.book_new()
  for (const [nome, righe] of Object.entries(fogli)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), nome)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function costiDiProva() {
  return {
    burro: { costoKg: 9.2, costoG: 0.0092, fornitore: 'Latteria Rossi' },
    farina: { costoKg: 0.95, costoG: 0.00095 },
    'aceto balsamico': { costoKg: 12, costoG: 0.012 },
    pistacchio: { costoKg: null, costoG: null },
  }
}

// ── 1. Il prezzo scritto in una cella ──────────────────────────────────────

describe('leggere il prezzo di una cella', () => {
  it("«12,5o» NON vale 12,5: si scarta e si dice perché", () => {
    // Il difetto del 18/09/2026. `parseFloat('12.5o')` risponde 12.5.
    const r = leggiPrezzoCella('12,5o')
    expect(r.prezzoKg).toBeNull()
    expect(r.motivo).toBe(MOTIVI_SCARTO.PREZZO_NON_VALIDO)
    expect(r.spiegazione).toContain('12,5o')
  })

  it('anche gli altri mezzi numeri si scartano, non si indovinano', () => {
    for (const storto of ['12.5o', '9,20 circa', '3-4', 'da chiedere', 'n/d', '--', '1,2,3']) {
      expect(leggiPrezzoCella(storto).prezzoKg, storto).toBeNull()
      expect(leggiPrezzoCella(storto).motivo, storto).toBe(MOTIVI_SCARTO.PREZZO_NON_VALIDO)
    }
  })

  it('la cella vuota vale null ed è un caso LECITO, non un errore', () => {
    for (const vuoto of [null, undefined, '', '   ']) {
      const r = leggiPrezzoCella(vuoto)
      expect(r.prezzoKg).toBeNull()
      expect(r.motivo).toBeNull()
    }
  })

  it('lo zero scritto apposta si scarta: zero vorrebbe dire gratis', () => {
    for (const zero of [0, '0', '0,00', '0.00']) {
      const r = leggiPrezzoCella(zero)
      expect(r.prezzoKg, String(zero)).toBeNull()
      expect(r.motivo, String(zero)).toBe(MOTIVI_SCARTO.PREZZO_ZERO)
      expect(r.spiegazione).toContain('vuota')
    }
  })

  it('un prezzo negativo si scarta', () => {
    const r = leggiPrezzoCella('-3,50')
    expect(r.prezzoKg).toBeNull()
    expect(r.motivo).toBe(MOTIVI_SCARTO.PREZZO_NON_VALIDO)
  })

  it("legge la virgola decimale all'italiana", () => {
    expect(leggiPrezzoCella('12,50').prezzoKg).toBe(12.5)
    expect(leggiPrezzoCella('0,95').prezzoKg).toBe(0.95)
  })

  it("legge il punto delle migliaia quando c'è anche la virgola", () => {
    expect(leggiPrezzoCella('1.250,50').prezzoKg).toBe(1250.5)
    expect(leggiPrezzoCella('12.345,67').prezzoKg).toBe(12345.67)
  })

  it('legge i numeri veri di Excel senza passarli per una stringa', () => {
    expect(leggiPrezzoCella(9.2).prezzoKg).toBe(9.2)
    expect(leggiPrezzoCella(0).motivo).toBe(MOTIVI_SCARTO.PREZZO_ZERO)
    expect(leggiPrezzoCella(-4).motivo).toBe(MOTIVI_SCARTO.PREZZO_NEGATIVO)
    expect(leggiPrezzoCella(NaN).motivo).toBe(MOTIVI_SCARTO.PREZZO_NON_VALIDO)
  })

  it("il simbolo della valuta e l'unità attaccati non fanno scartare la riga", () => {
    expect(leggiPrezzoCella('€ 12,50').prezzoKg).toBe(12.5)
    expect(leggiPrezzoCella('12,50 €').prezzoKg).toBe(12.5)
    expect(leggiPrezzoCella('12,50 €/kg').prezzoKg).toBe(12.5)
    expect(leggiPrezzoCella('12,50 euro').prezzoKg).toBe(12.5)
    expect(leggiPrezzoCella('9,20 al kg').prezzoKg).toBe(9.2)
  })

  it('togliere la valuta NON rende indulgente il resto', () => {
    // La ripulitura tocca solo la testa e la coda: dentro il numero non si
    // indovina niente, altrimenti si torna al difetto di partenza.
    expect(leggiPrezzoCella('€ 12,5o').prezzoKg).toBeNull()
    expect(leggiPrezzoCella('12,5o €/kg').prezzoKg).toBeNull()
  })
})

describe('il prezzo che si può leggere in due modi', () => {
  it('«1.250» viene segnalato come ambiguo', () => {
    expect(prezzoAmbiguo('1.250')).toBe(true)
    expect(prezzoAmbiguo('999.000')).toBe(true)
  })

  it('«0,95», «1.250,50» e i numeri veri non sono ambigui', () => {
    expect(prezzoAmbiguo('0,95')).toBe(false)
    expect(prezzoAmbiguo('1.250,50')).toBe(false)
    expect(prezzoAmbiguo('0.95')).toBe(false)
    expect(prezzoAmbiguo(1.25)).toBe(false)
  })
})

// ── 2. Riconoscere le colonne ──────────────────────────────────────────────

describe('riconoscere le colonne, comunque le abbiano chiamate', () => {
  it('riconosce le intestazioni del modello', () => {
    expect(riconosciColonne(INTESTAZIONI_MODELLO)).toEqual({ nome: 0, prezzo: 1, fornitore: 2 })
  })

  it('riconosce come le scrivono davvero', () => {
    expect(riconosciColonne(['MATERIA PRIMA', 'Prezzo €/Kg', 'Fornitore'])).toEqual({ nome: 0, prezzo: 1, fornitore: 2 })
    expect(riconosciColonne(['Ingrediente', 'Costo al chilo', 'Ragione sociale'])).toEqual({ nome: 0, prezzo: 1, fornitore: 2 })
    expect(riconosciColonne(['  nome  ', 'prezzo', 'fornitori'])).toEqual({ nome: 0, prezzo: 1, fornitore: 2 })
  })

  it("ignora quello che sta fra parentesi nell'intestazione", () => {
    expect(normalizzaIntestazione('Prezzo al kg (IVA esclusa)')).toBe('prezzo al kg')
    expect(riconosciColonne(['Materia prima', 'Prezzo al kg (IVA esclusa)', 'Fornitore']).prezzo).toBe(1)
  })

  it('le colonne possono stare in un ordine qualunque', () => {
    expect(riconosciColonne(['Fornitore', 'Prezzo al kg', 'Materia prima'])).toEqual({ nome: 2, prezzo: 1, fornitore: 0 })
  })

  it('«Nome fornitore» NON diventa la colonna del nome della merce', () => {
    // Senza questa precedenza l'import creerebbe materie prime che si
    // chiamano «Molino Rossi».
    const c = riconosciColonne(['Nome fornitore', 'Prezzo', 'Nome materia prima'])
    expect(c.fornitore).toBe(0)
    expect(c.nome).toBe(2)
  })

  it('dice -1 per le colonne che nel file non ci sono', () => {
    expect(riconosciColonne(['Materia prima'])).toEqual({ nome: 0, prezzo: -1, fornitore: -1 })
    expect(riconosciColonne([]).nome).toBe(-1)
  })
})

// ── 3. Leggere il file ─────────────────────────────────────────────────────

describe('leggere il file che arriva dal fornitore', () => {
  it('legge un foglio normale', () => {
    const buf = fileExcel({
      Listino: [
        ['Nome materia prima', 'Prezzo al kg', 'Fornitore'],
        ['Farina 00', '0,95', 'Molino Rossi'],
        ['Burro', 9.2, 'Latteria Bianchi'],
      ],
    })
    const r = leggiFileMateriePrime(buf, XLSX)
    expect(r.foglio).toBe('Listino')
    expect(r.rigaIntestazioni).toBe(1)
    expect(r.righe).toHaveLength(2)
    expect(r.righe[0]).toEqual({ riga: 2, nome: 'Farina 00', prezzo: '0,95', fornitore: 'Molino Rossi' })
  })

  it("trova le intestazioni anche se sopra c'è il titolo del listino", () => {
    const buf = fileExcel({
      Foglio1: [
        ['LISTINO PREZZI 2026 - Molino Rossi S.r.l.'],
        ['Aggiornato al 01/09/2026'],
        [],
        ['Materia prima', 'Prezzo €/Kg', 'Fornitore'],
        ['Farina 00', '0,95', 'Molino Rossi'],
      ],
    })
    const r = leggiFileMateriePrime(buf, XLSX)
    expect(r.rigaIntestazioni).toBe(4)
    expect(r.righe).toEqual([{ riga: 5, nome: 'Farina 00', prezzo: '0,95', fornitore: 'Molino Rossi' }])
  })

  it("il numero di riga è quello che l'utente vede aprendo il file", () => {
    // Un resoconto che dice «riga 7» mentre nel file il problema e alla 9
    // manda a cercare nel posto sbagliato.
    const buf = fileExcel({
      F: [
        ['Materia prima', 'Prezzo'],
        ['Farina', '0,95'],
        [],
        ['Burro', '12,5o'],
      ],
    })
    const r = leggiFileMateriePrime(buf, XLSX)
    expect(r.righe.map(x => [x.riga, x.nome])).toEqual([[2, 'Farina'], [4, 'Burro']])
  })

  it('salta le righe completamente vuote', () => {
    const buf = fileExcel({ F: [['Materia prima', 'Prezzo'], ['Farina', 1], [], [null, null], ['Burro', 2]] })
    expect(leggiFileMateriePrime(buf, XLSX).righe).toHaveLength(2)
  })

  it('salta le righe che hanno solo una nota in una colonna che non ci serve', () => {
    const buf = fileExcel({
      F: [
        ['Materia prima', 'Prezzo al kg', 'Fornitore', 'Note'],
        ['Farina', 1, 'Molino Rossi', ''],
        ['', '', '', 'I prezzi sono IVA esclusa'],
      ],
    })
    expect(leggiFileMateriePrime(buf, XLSX).righe.map(r => r.nome)).toEqual(['Farina'])
  })

  it('senza la colonna del fornitore legge lo stesso i prezzi', () => {
    const buf = fileExcel({ F: [['Ingrediente', 'Prezzo al kg'], ['Farina', '0,95']] })
    const r = leggiFileMateriePrime(buf, XLSX)
    expect(r.colonne.fornitore).toBe(-1)
    expect(r.righe[0]).toEqual({ riga: 2, nome: 'Farina', prezzo: '0,95', fornitore: '' })
  })

  it('legge anche un CSV', () => {
    const csv = 'Materia prima;Prezzo al kg;Fornitore\nFarina 00;0,95;Molino Rossi\n'
    const buf = new TextEncoder().encode(csv)
    const r = leggiFileMateriePrime(buf, XLSX)
    expect(r.righe[0].nome).toBe('Farina 00')
    expect(r.righe[0].fornitore).toBe('Molino Rossi')
  })

  it('se manca la colonna del nome lo dice, e dice cosa ha letto', () => {
    const buf = fileExcel({ F: [['Data', 'Importo'], ['01/09/2026', 12]] })
    let errore = null
    try { leggiFileMateriePrime(buf, XLSX) } catch (e) { errore = e }
    expect(errore).toBeTruthy()
    expect(errore.message).toContain('Data')
    expect(errore.message).toContain('Importo')
    expect(errore.message).toContain(INTESTAZIONI_MODELLO[0])
  })

  it('con più fogli prende il primo che sembra un listino', () => {
    const buf = fileExcel({
      Copertina: [['Listino Molino Rossi'], ['valido dal 01/09/2026']],
      Prezzi: [['Materia prima', 'Prezzo al kg'], ['Farina', '0,95']],
    })
    const r = leggiFileMateriePrime(buf, XLSX)
    expect(r.foglio).toBe('Prezzi')
    expect(r.fogli).toEqual(['Copertina', 'Prezzi'])
  })

  it('si può dire quale foglio leggere', () => {
    const buf = fileExcel({
      Secco: [['Materia prima', 'Prezzo al kg'], ['Farina', '0,95']],
      Fresco: [['Materia prima', 'Prezzo al kg'], ['Burro', '9,20']],
    })
    expect(leggiFileMateriePrime(buf, XLSX, { foglio: 'Fresco' }).righe[0].nome).toBe('Burro')
  })
})

// ── 4. Il resoconto, prima di scrivere ─────────────────────────────────────

describe('il resoconto dice cosa succederà prima che succeda', () => {
  const righe = [
    { riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: 'Molino Rossi' },      // aggiorna il prezzo
    { riga: 3, nome: 'Burro', prezzo: '9,20', fornitore: 'Latteria Rossi' },     // invariata
    { riga: 4, nome: 'Vaniglia', prezzo: '180,00', fornitore: 'Spezie Gialli' }, // nuova
    { riga: 5, nome: 'Cacao', prezzo: '', fornitore: 'Cioccolataio Neri' },      // nuova senza prezzo
    { riga: 6, nome: 'Zucchero', prezzo: '12,5o', fornitore: '' },               // scartata
  ]

  it('divide le righe in quattro mucchi che non si sovrappongono', () => {
    const r = analizzaImportMateriePrime(righe, costiDiProva(), OPZ)
    expect(r.totali.lette).toBe(5)
    expect(r.totali.nuove + r.totali.aggiornate + r.totali.invariate + r.totali.scartate).toBe(5)
    expect(r.nuove.map(x => x.nome).sort()).toEqual(['Cacao', 'Vaniglia'])
    expect(r.aggiornate.map(x => x.nome)).toEqual(['Farina'])
    expect(r.invariate.map(x => x.nome)).toEqual(['Burro'])
    expect(r.scartate.map(x => x.nome)).toEqual(['Zucchero'])
  })

  it('su una riga che cambia il prezzo dice il vecchio e il nuovo', () => {
    const r = analizzaImportMateriePrime(righe, costiDiProva(), OPZ)
    expect(r.aggiornate[0]).toMatchObject({
      riga: 2, nome: 'Farina', chiave: 'farina',
      prezzoPrecedente: 0.95, prezzoKg: 1.1, cambiaPrezzo: true,
    })
  })

  it('conta separatamente i prezzi cambiati e quelli che restano da scoprire', () => {
    const r = analizzaImportMateriePrime(righe, costiDiProva(), OPZ)
    expect(r.totali.prezziAggiornati).toBe(1)
    expect(r.totali.prezziNuovi).toBe(1)   // Vaniglia
    expect(r.totali.senzaPrezzo).toBe(1)   // Cacao
  })

  it("su una riga scartata dice quale, perché, e cosa c'era scritto", () => {
    const r = analizzaImportMateriePrime(righe, costiDiProva(), OPZ)
    expect(r.scartate[0]).toMatchObject({ riga: 6, nome: 'Zucchero', motivo: MOTIVI_SCARTO.PREZZO_NON_VALIDO, valore: '12,5o' })
    expect(r.scartate[0].spiegazione).toContain('12,5o')
  })

  it('NON tocca la mappa dei costi: il resoconto è solo una lettura', () => {
    const costi = costiDiProva()
    const copia = JSON.parse(JSON.stringify(costi))
    analizzaImportMateriePrime(righe, costi, OPZ)
    expect(costi).toEqual(copia)
  })

  it('una materia prima nuova senza prezzo entra con null, mai con zero', () => {
    const r = analizzaImportMateriePrime(righe, costiDiProva(), OPZ)
    const cacao = r.nuove.find(x => x.nome === 'Cacao')
    expect(cacao.prezzoKg).toBeNull()
    expect(cacao.prezzoKg).not.toBe(0)
    expect(cacao.fornitore).toBe('Cioccolataio Neri')
  })

  it('cambiare solo il fornitore conta come aggiornamento, non come prezzo nuovo', () => {
    const r = analizzaImportMateriePrime(
      [{ riga: 2, nome: 'Burro', prezzo: '', fornitore: 'Latteria Bianchi' }],
      costiDiProva(), OPZ,
    )
    expect(r.aggiornate[0]).toMatchObject({
      cambiaPrezzo: false, cambiaFornitore: true,
      fornitorePrecedente: 'Latteria Rossi', fornitore: 'Latteria Bianchi',
    })
    expect(r.totali.prezziAggiornati).toBe(0)
  })

  it("una riga identica a quello che c'è già non risulta come modifica", () => {
    const r = analizzaImportMateriePrime(
      [{ riga: 2, nome: 'burro', prezzo: '9,20', fornitore: 'LATTERIA ROSSI' }],
      costiDiProva(), OPZ,
    )
    expect(r.totali.aggiornate).toBe(0)
    expect(r.invariate).toHaveLength(1)
  })

  it('la riga senza nome si scarta e lo dice', () => {
    const r = analizzaImportMateriePrime([{ riga: 7, nome: '   ', prezzo: '9,20', fornitore: 'X' }], {}, OPZ)
    expect(r.scartate[0].motivo).toBe(MOTIVI_SCARTO.NOME_MANCANTE)
  })

  it('lo zero scritto nel file non entra e non diventa null di nascosto', () => {
    const r = analizzaImportMateriePrime([{ riga: 2, nome: 'Farina', prezzo: '0', fornitore: '' }], costiDiProva(), OPZ)
    expect(r.nuove).toHaveLength(0)
    expect(r.aggiornate).toHaveLength(0)
    expect(r.scartate[0].motivo).toBe(MOTIVI_SCARTO.PREZZO_ZERO)
  })

  it('lo stesso nome due volte nel file: tiene la prima e lo dichiara', () => {
    const r = analizzaImportMateriePrime([
      { riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: '' },
      { riga: 9, nome: ' FARINA ', prezzo: '2,00', fornitore: '' },
    ], costiDiProva(), OPZ)
    expect(r.aggiornate).toHaveLength(1)
    expect(r.aggiornate[0].prezzoKg).toBe(1.1)
    expect(r.scartate[0]).toMatchObject({ riga: 9, motivo: MOTIVI_SCARTO.DUPLICATO_NEL_FILE })
    expect(r.scartate[0].spiegazione).toContain('riga 2')
  })

  it('il nome storpiato entra, ma viene segnalato: il caso «aceto balsamicp»', () => {
    const r = analizzaImportMateriePrime(
      [{ riga: 2, nome: 'aceto balsamicp', prezzo: '13,00', fornitore: 'Acetaia Neri' }],
      costiDiProva(), OPZ,
    )
    expect(r.nuove).toHaveLength(1)
    expect(r.somiglianze[0]).toMatchObject({ riga: 2, nome: 'aceto balsamicp', simileA: 'aceto balsamico', distanza: 1 })
    expect(r.totali.somiglianze).toBe(1)
  })

  it('una materia prima davvero nuova non viene segnalata come sospetta', () => {
    const r = analizzaImportMateriePrime(
      [{ riga: 2, nome: 'Vaniglia Bourbon', prezzo: '180,00', fornitore: '' }],
      costiDiProva(), OPZ,
    )
    expect(r.somiglianze).toHaveLength(0)
  })

  // ROSSO DI PROPOSITO — 18/09/2026, e va tolto appena qualcuno sistema
  // `src/lib/materiePrimeImport.js`.
  //
  // Il titolare ha fissato la regola: «di base comunque il punto sono le
  // migliaia, la virgola i decimali». `leggiPrezzoKg` è stata corretta di
  // conseguenza e «1.250» adesso vale 1250, non più 1,25. Questa pagina
  // dell'importazione era rimasta con la scelta opposta, perché il file era in
  // mano a un altro agente: la riga segnalata diceva «lo prendo come 1.250 €;
  // se intendevi 1.250 € scrivilo con la virgola», cioè proponeva come
  // alternativa lo stesso numero.
  //
  // Corretto lo stesso giorno, in tre punti di `materiePrimeImport.js`:
  //   - l'alternativa proposta è adesso la lettura decimale (`Number(testo)`),
  //     perché quella a migliaia è diventata la principale;
  //   - `RE_MIGLIAIA_NUDE` pretende che il gruppo di testa non cominci per
  //     zero: «0.950» è la farina a novantacinque centesimi, non 950 €/kg, e
  //     non è più un caso dubbio;
  //   - il commento sopra `prezzoAmbiguo` raccontava la scelta di prima e
  //     adesso racconta questa, con il motivo per cui è cambiata.
  //
  // Il test era stato lasciato `it.fails`, cioè rosso di proposito finché il
  // difetto c'era. Adesso è una prova normale.
  it('segnala i prezzi che si possono leggere in due modi', () => {
    const r = analizzaImportMateriePrime(
      [{ riga: 2, nome: 'Farina', prezzo: '1.250', fornitore: '' }],
      costiDiProva(), OPZ,
    )
    expect(r.totali.ambigue).toBe(1)
    expect(r.ambigue[0]).toMatchObject({ riga: 2, testo: '1.250', letto: 1250, alternativa: 1.25 })
  })

  it('con normIng iniettato «uova» aggiorna «uovo» invece di sdoppiarlo', () => {
    const r = analizzaImportMateriePrime(
      [{ riga: 2, nome: 'Uova', prezzo: '4,00', fornitore: 'Az. Verdi' }],
      { uovo: { costoKg: 3, costoG: 0.003 } }, OPZ,
    )
    expect(r.nuove).toHaveLength(0)
    expect(r.aggiornate[0].chiave).toBe('uovo')
  })

  it('regge un file vuoto e un ricettario vuoto', () => {
    const r = analizzaImportMateriePrime([], null, OPZ)
    expect(r.totali).toMatchObject({ lette: 0, nuove: 0, aggiornate: 0, invariate: 0, scartate: 0 })
  })
})

// ── 5. Scrivere, solo dopo la conferma ─────────────────────────────────────

describe("applicare l'import", () => {
  it('non muta la mappa di partenza', () => {
    const costi = costiDiProva()
    const copia = JSON.parse(JSON.stringify(costi))
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: '' }], costi, OPZ)
    const nuovi = applicaImportMateriePrime(costi, res, OPZ)
    expect(costi).toEqual(copia)
    expect(nuovi).not.toBe(costi)
    expect(nuovi.farina).not.toBe(costi.farina)
  })

  it('scrive il prezzo sia al chilo sia al grammo', () => {
    // Il food cost guarda `costoG`, le schermate guardano `costoKg`: una voce
    // con solo uno dei due si comporta in modo diverso a seconda di chi legge.
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: '' }], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, OPZ)
    expect(nuovi.farina.costoKg).toBe(1.1)
    expect(nuovi.farina.costoG).toBe(0.0011)
  })

  it('una materia prima nuova senza prezzo nasce con null, MAI con zero', () => {
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Cacao amaro', prezzo: '', fornitore: 'Neri' }], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, OPZ)
    const voce = nuovi[normIng('Cacao amaro')]
    expect(voce.costoKg).toBeNull()
    expect(voce.costoG).toBeNull()
    expect(voce.fornitore).toBe('Neri')
    expect(voce.nome).toBe('Cacao amaro')
  })

  it("una cella del prezzo VUOTA non cancella il prezzo che c'era", () => {
    // Un listino parziale del fornitore avrebbe azzerato mezzo archivio.
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Burro', prezzo: '', fornitore: 'Latteria Bianchi' }], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, OPZ)
    expect(nuovi.burro.costoKg).toBe(9.2)
    expect(nuovi.burro.costoG).toBe(0.0092)
    expect(nuovi.burro.fornitore).toBe('Latteria Bianchi')
  })

  it('una riga scartata non scrive niente', () => {
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Farina', prezzo: '12,5o', fornitore: 'X' }], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, OPZ)
    expect(nuovi).toEqual(costiDiProva())
  })

  it('segna da dove viene il prezzo e quando, ma solo se il prezzo cambia', () => {
    const res = analizzaImportMateriePrime([
      { riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: '' },
      { riga: 3, nome: 'Burro', prezzo: '', fornitore: 'Latteria Bianchi' },
    ], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, { ...OPZ, data: '2026-09-18' })
    expect(nuovi.farina).toMatchObject({ prezzoDa: 'import-prezzi', prezzoAggiornatoAl: '2026-09-18' })
    expect(nuovi.burro.prezzoDa).toBeUndefined()
  })

  it("il fornitore scritto nel file arriva nella voce, com'è in fattura", () => {
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: '  Molino   Rossi S.r.l. ' }], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, OPZ)
    expect(nuovi.farina.fornitore).toBe('Molino Rossi S.r.l.')
  })

  it('non tocca le materie prime che il file non nomina', () => {
    const res = analizzaImportMateriePrime([{ riga: 2, nome: 'Farina', prezzo: '1,10', fornitore: '' }], costiDiProva(), OPZ)
    const nuovi = applicaImportMateriePrime(costiDiProva(), res, OPZ)
    expect(nuovi.burro).toEqual(costiDiProva().burro)
    expect(nuovi.pistacchio).toEqual(costiDiProva().pistacchio)
  })
})

// ── 6. Nomi che si assomigliano ────────────────────────────────────────────

describe('riconoscere il nome storpiato', () => {
  it('perdona una lettera su un nome lungo', () => {
    expect(materiaPrimaSimile('aceto balsamicp', ['aceto balsamico', 'burro'])).toEqual({ nome: 'aceto balsamico', distanza: 1 })
  })

  it('non accosta due materie prime che sono davvero diverse', () => {
    expect(materiaPrimaSimile('cioccolato fondente', ['burro', 'farina', 'panna'])).toBeNull()
  })

  it('sui nomi cortissimi non azzarda', () => {
    // Con tre lettere ogni parola assomiglia a ogni altra.
    expect(materiaPrimaSimile('the', ['tha', 'sale'])).toBeNull()
  })

  it('se il nome combacia esattamente non è una somiglianza', () => {
    expect(materiaPrimaSimile('farina', ['farina', 'farin'])).toBeNull()
  })
})

// ── 7. Il modello da scaricare ─────────────────────────────────────────────

describe('il modello Excel da scaricare', () => {
  it('ha le tre intestazioni chieste, sulla prima riga', () => {
    const righe = righeModelloMateriePrime()
    expect(righe[0].slice(0, 3)).toEqual(['Nome materia prima', 'Prezzo al kg', 'Fornitore'])
  })

  it('ha due righe compilate che si capiscono', () => {
    const righe = righeModelloMateriePrime()
    expect(righe[1][0]).toBeTruthy()
    expect(righe[1][1]).toBeGreaterThan(0)
    expect(righe[1][2]).toBeTruthy()
    expect(righe[2][0]).toBeTruthy()
    expect(righe[2][1]).toBeGreaterThan(0)
    expect(righe[2][2]).toBeTruthy()
  })

  it("nel foglio c'è scritto che il nome del fornitore è quello della fattura", () => {
    const wb = costruisciModelloMateriePrime(XLSX)
    const testo = XLSX.utils.sheet_to_csv(wb.Sheets['Materie prime']).toLowerCase()
    expect(testo).toContain('fattura')
    expect(testo).toContain('esattamente')
  })

  it("nel foglio c'è scritto che senza prezzo si lascia la cella vuota", () => {
    const wb = costruisciModelloMateriePrime(XLSX)
    const testo = XLSX.utils.sheet_to_csv(wb.Sheets['Materie prime']).toLowerCase()
    expect(testo).toContain('vuota')
  })

  it('il modello scaricato si ricarica senza scartare niente', () => {
    // Un modello che il nostro stesso lettore rifiuta e peggio che non averlo.
    const buf = XLSX.write(costruisciModelloMateriePrime(XLSX), { type: 'array', bookType: 'xlsx' })
    const letto = leggiFileMateriePrime(buf, XLSX)
    expect(letto.rigaIntestazioni).toBe(1)
    expect(letto.righe.map(r => r.nome)).toEqual(['Farina 00', 'Burro di panna'])

    const res = analizzaImportMateriePrime(letto.righe, {}, OPZ)
    expect(res.scartate).toEqual([])
    expect(res.totali.nuove).toBe(2)
    expect(res.nuove[0].prezzoKg).toBe(0.95)
    expect(res.nuove[0].fornitore).toBe('Molino Rossi')
  })

  it('il nome del file parla italiano e finisce in .xlsx', () => {
    expect(nomeFileModello('Mara dei Boschi')).toMatch(/^modello-prezzi-materie-prime-mara-dei-boschi-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(nomeFileModello('')).toMatch(/^modello-prezzi-materie-prime-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })

  it('scaricare scrive il file e lo dice', () => {
    const writeFile = vi.fn()
    const notify = vi.fn()
    const finto = { ...XLSX, writeFile }
    const r = scaricaModelloMateriePrime({ XLSX: finto, nomeAttivita: 'Mara dei Boschi', notify })
    return r.then(esito => {
      expect(esito.ok).toBe(true)
      expect(writeFile).toHaveBeenCalledTimes(1)
      expect(writeFile.mock.calls[0][1]).toBe(esito.nomeFile)
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('.xlsx'))
    })
  })

  it('se il salvataggio va storto NON fa saltare la pagina: lo dice e basta', () => {
    const notify = vi.fn()
    const rotto = { ...XLSX, writeFile: () => { throw new Error('disco pieno') } }
    return scaricaModelloMateriePrime({ XLSX: rotto, notify }).then(esito => {
      expect(esito.ok).toBe(false)
      expect(notify).toHaveBeenCalledWith(expect.any(String), false)
    })
  })
})
