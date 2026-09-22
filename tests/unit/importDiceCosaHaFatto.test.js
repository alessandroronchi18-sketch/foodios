// ── L'import deve dire cosa ha fatto, non farlo e basta ───────────────────
//
// Audit del 19/09/2026 sull'import generico, partendo dai file come li manda
// un fornitore. Tre difetti, tutti della stessa famiglia: il programma fa una
// scelta al posto dell'utente e non gliela dice.
//
// 1. I NUMERI DI RIGA NEGLI ERRORI ERANO SBAGLIATI. È la seconda metà del
//    difetto corretto il 18/09/2026 (`rigaDelFoglioNonSiSposta.test.js`).
//    Allora si era portata la riga vera del foglio nelle righe VALIDE;
//    nelle righe INVALIDE era rimasto `row_index: i`, la posizione dentro
//    l'array già ripulito dalle righe bianche. Il wizard stampa «Riga N» da
//    quel numero, e con le righe bianche a separare le famiglie di prodotti —
//    il modo normale di scrivere un listino — mandava l'utente righe più su.
//    Cioè l'unico elenco che si guarda davvero quando si cerca l'errore nel
//    proprio file era l'unico rimasto sbagliato. Misurato su un foglio con tre
//    righe bianche: diceva «Riga 3» per un errore che sta alla riga 6, e
//    «Riga 4» per uno che sta alla riga 8.
//
// 2. LA CELLA VUOTA DIVENTAVA ZERO SENZA DIRLO. Se una colonna è mappata e
//    dentro c'è una cella vuota, il campo prende il `default` dello schema:
//    per `costo_orario` è 0. Zero nel costo del lavoro vuol dire «lavora
//    gratis», e dopo il caricamento non si distingue da uno zero scritto
//    davvero. La schermata di riepilogo dichiarava solo i campi NON mappati,
//    non le celle vuote dentro una colonna mappata. Adesso si contano e si
//    possono dichiarare. Nessun dato cambia: cambia che si sa.
//    Insieme si è tolta un'incoerenza vera: una cella di soli spazi («   »)
//    non prendeva il default e lasciava il campo assente, mentre una cella
//    vuota lo prendeva. Stessa cosa per chi scrive, due esiti diversi.
//
// 3. I DOPPIONI DENTRO IL FILE NON ERANO CONTROLLATI. Il file che il titolare
//    descrive — nome fornitore / prodotto / prezzo, una riga per prodotto —
//    ha lo stesso fornitore su più righe: cinque righe, tre fornitori. Il
//    controllo doppioni guardava solo quello che c'era già nel database, mai
//    dentro il file, e scriveva cinque anagrafiche dicendo «Tutto caricato!».
//    Su un listino di 300 righe da 12 fornitori sono 300 anagrafiche.

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorkbook } from '../../src/lib/importParse'
import { validateRows, doppioniNelFile } from '../../src/lib/importValidateCore'
import { getEntitySchema } from '../../src/lib/importSchemas'

/** Un listino con le righe bianche in mezzo e due errori veri. */
function foglioConErrori() {
  const aoa = [
    ['Fornitore', 'Email'],                          // riga 1
    ['Molino Rossi SRL', 'ordini@molinorossi.it'],   // riga 2
    [],                                               // riga 3
    [],                                               // riga 4
    [],                                               // riga 5
    ['Latteria Alpina', 'non-una-email'],             // riga 6: errore
    [],                                               // riga 7
    ['Frutta Secca Piemonte', 'tel. 011 123456'],     // riga 8: errore
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Fornitori')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('Le righe da rivedere dicono la riga vera del foglio', () => {
  const schema = getEntitySchema('fornitori')
  const { firstSheet } = parseWorkbook(foglioConErrori(), XLSX)
  const res = validateRows(firstSheet.rows, { nome: 'Fornitore', email: 'Email' }, schema)

  it('due righe sono da rivedere', () => {
    expect(res.stats).toMatchObject({ total: 3, valid: 1, invalid: 2 })
  })

  it('e stanno alla riga 6 e alla riga 8, non alla 3 e alla 4', () => {
    // `riga_foglio` è il numero che il wizard deve stampare. Prima si
    // stampava `row_index + 2`, cioè 3 e 4.
    expect(res.invalid_rows.map(r => r.riga_foglio)).toEqual([6, 8])
  })

  it('con righe costruite a mano, senza foglio, si ripiega sulla posizione', () => {
    // Non tutti i chiamanti passano da un file Excel: il CLI e i test
    // costruiscono le righe a mano, e li' la posizione è tutto quello che c'è.
    const r = validateRows(
      [{ Fornitore: 'Tizio', Email: 'sbagliata' }],
      { nome: 'Fornitore', email: 'Email' }, schema)
    expect(r.invalid_rows[0].riga_foglio).toBe(2)
    expect(r.invalid_rows[0].row_index).toBe(0)
  })

  it('e il vecchio `row_index` resta dov’era, per chi lo usava', () => {
    expect(res.invalid_rows.map(r => r.row_index)).toEqual([1, 2])
  })
})

describe('Le celle vuote riempite col valore predefinito si contano', () => {
  const schema = getEntitySchema('dipendenti')
  const righe = [
    { Nome: 'Anna', Costo: '15,00' },
    { Nome: 'Luca', Costo: '' },
    { Nome: 'Sara', Costo: null },
    { Nome: 'Gino', Costo: '   ' },
  ]
  const res = validateRows(righe, { nome: 'Nome', costo_orario: 'Costo' }, schema)

  it('il dato non cambia: chi aveva il costo lo tiene', () => {
    expect(res.valid_rows[0].costo_orario).toBe(15)
  })

  it('ma si sa quante celle vuote ci sono', () => {
    // Tre su quattro: Luca (vuota), Sara (null) e Gino (soli spazi).
    expect(res.stats.celle_vuote_col_predefinito).toEqual({ costo_orario: 3 })
  })

  // ── 22/09/2026: qui il comportamento è CAMBIATO, per decisione ────────
  //
  // Questa prova diceva «una cella vuota diventa zero», e per il costo orario
  // era la cosa sbagliata: zero vuol dire «questa persona non costa niente»,
  // e il costo del lavoro spariva dal P&L. Su un'azienda vera: 8.038,82 € di
  // stipendi al mese mostrati come **0 €**.
  //
  // Decisione del titolare: «vuoto = non lo so, e il programma lo dice». Il
  // campo resta assente e il riepilogo dell'import lo dichiara.
  //
  // La parte che NON è cambiata, ed è ancora provata qui sotto: una cella di
  // soli spazi si comporta esattamente come una cella vuota. Era un difetto a
  // sé — «   » saltava il ramo del vuoto e finiva altrove.
  it('una cella vuota resta vuota: non diventa uno zero', () => {
    expect('costo_orario' in res.valid_rows[1]).toBe(false)
  })

  it('e una cella di soli spazi si comporta come una cella vuota', () => {
    expect('costo_orario' in res.valid_rows[3]).toBe(false)
  })

  it('i campi che nel file non ci sono proprio non si contano qui', () => {
    // Quelli li dichiara già la schermata di riepilogo, come campi non
    // mappati: contarli due volte confonderebbe e basta.
    expect(res.stats.celle_vuote_col_predefinito.ore_settimana).toBeUndefined()
    expect(res.stats.celle_vuote_col_predefinito.attivo).toBeUndefined()
  })

  it('se non c’è nessuna cella vuota il conto è vuoto', () => {
    const r = validateRows([{ Nome: 'Anna', Costo: '15,00' }],
      { nome: 'Nome', costo_orario: 'Costo' }, schema)
    expect(r.stats.celle_vuote_col_predefinito).toEqual({})
  })
})

describe('Lo stesso fornitore su piu’ righe è un fornitore solo', () => {
  // Il file che il titolare descrive: nome fornitore / prodotto / prezzo.
  const righe = [
    { nome: 'Molino Rossi SRL' },
    { nome: 'Molino Rossi SRL' },
    { nome: 'Latteria Alpina' },
    { nome: 'Latteria Alpina' },
    { nome: 'Frutta Secca Piemonte' },
  ]

  it('cinque righe, tre fornitori', () => {
    const d = doppioniNelFile(righe, 'nome')
    expect(d.tenute).toHaveLength(3)
    expect(d.tenute.map(r => r.nome)).toEqual([
      'Molino Rossi SRL', 'Latteria Alpina', 'Frutta Secca Piemonte',
    ])
    expect(d.scartate).toBe(2)
  })

  it('si dice quali nomi erano ripetuti e quante volte', () => {
    const d = doppioniNelFile(righe, 'nome')
    expect(d.ripetuti).toEqual([
      { valore: 'Molino Rossi SRL', volte: 2 },
      { valore: 'Latteria Alpina', volte: 2 },
    ])
  })

  it('si tiene la prima riga, non l’ultima', () => {
    // La prima è quella che l'utente vede nell'anteprima: tenere l'ultima
    // vorrebbe dire mostrargliene una e caricarne un'altra.
    const d = doppioniNelFile(
      [{ nome: 'Molino Rossi SRL', note: 'prima' }, { nome: 'Molino Rossi SRL', note: 'seconda' }],
      'nome')
    expect(d.tenute[0].note).toBe('prima')
  })

  it('maiuscole, minuscole e spazi non fanno due fornitori', () => {
    const d = doppioniNelFile(
      [{ nome: 'Molino Rossi SRL' }, { nome: '  molino rossi srl  ' }], 'nome')
    expect(d.tenute).toHaveLength(1)
    expect(d.tenute[0].nome).toBe('Molino Rossi SRL')
  })

  it('senza doppioni non tocca niente e non ha niente da dire', () => {
    const d = doppioniNelFile([{ nome: 'Uno' }, { nome: 'Due' }], 'nome')
    expect(d.tenute).toHaveLength(2)
    expect(d.scartate).toBe(0)
    expect(d.ripetuti).toEqual([])
  })

  it('le righe senza la chiave restano tutte: non sono doppioni', () => {
    const d = doppioniNelFile([{ nome: '' }, { nome: null }, { nome: 'Uno' }], 'nome')
    expect(d.tenute).toHaveLength(3)
    expect(d.scartate).toBe(0)
  })
})
