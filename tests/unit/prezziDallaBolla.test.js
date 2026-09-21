// ── Dalla bolla al prezzo al chilo ────────────────────────────────────────
//
// Il conto che trasforma una riga di bolla («5 SACCHI FARINA 00 25KG —
// 92,50 €») nel prezzo al chilo che finisce nel food cost di tutte le
// ricette che usano quella materia prima.
//
// Qui si prova quello che vale dei soldi: le conversioni, l'IVA, gli sconti,
// e soprattutto **i casi in cui il prezzo NON si deve calcolare**. Un prezzo
// mancante si vede e si corregge; un prezzo sbagliato di venticinque volte
// non lo nota nessuno finché non si guarda il margine a fine mese.
import { describe, it, expect } from 'vitest'
import {
  inGrammi, normalizzaUnita, pesoDiUnLitro, prezzoAlKgDaRiga,
  scostamentoSospetto, decidiPrezzo, identitaBolla, soloGiorno,
  preparaBolla, ultimiCambi, applicaCambiAlListino, preparaScrittureBolla,
} from '../../src/lib/bolle'

describe('Quanti grammi sono davvero', () => {
  it('i chili e i grammi non hanno niente da interpretare', () => {
    expect(inGrammi(5, 'kg').grammi).toBe(5000)
    expect(inGrammi(500, 'g').grammi).toBe(500)
    expect(inGrammi(3, 'hg').grammi).toBe(300)
  })

  it('l\'unità si legge come la scrive il fornitore, non come piace a noi', () => {
    expect(normalizzaUnita('KG')).toBe('kg')
    expect(normalizzaUnita('Kg.')).toBe('kg')
    expect(normalizzaUnita(' Lt ')).toBe('l')
    expect(normalizzaUnita('N.')).toBe('pz')
    expect(normalizzaUnita('CF')).toBe('pz')
    expect(normalizzaUnita('SACCHI')).toBe('pz')
  })

  it('quello che non si riconosce resta «non lo so», non diventa pezzi', () => {
    expect(normalizzaUnita('xyz')).toBe(null)
    expect(normalizzaUnita('')).toBe(null)
    const r = inGrammi(3, 'barattoli')
    expect(r.grammi).toBe(null)
    expect(r.problema).toMatch(/unità di misura sconosciuta/)
  })

  it('«latte» non è un\'unità di misura: sarebbe il latte', () => {
    // Una latta si scrive «latta». Se «latte» valesse come contenitore, una
    // riga di latte con l'unità scritta male diventerebbe un conteggio a
    // pezzi — e il prezzo al chilo del latte sarebbe da buttare.
    expect(normalizzaUnita('latte')).toBe(null)
    expect(normalizzaUnita('latta')).toBe('pz')
  })
})

describe('I litri: un litro non pesa un chilo', () => {
  it('il latte pesa 1,03 kg al litro, l\'olio 0,92', () => {
    expect(pesoDiUnLitro('latte intero fresco')).toBe(1030)
    expect(pesoDiUnLitro('olio di semi di girasole')).toBe(920)
    expect(inGrammi(10, 'l', { nome: 'latte intero' }).grammi).toBe(10300)
  })

  it('il latte di mandorla non è latte: il nome più lungo vince', () => {
    expect(pesoDiUnLitro('latte di mandorla')).toBe(1010)
  })

  it('di un liquido che non conosciamo non si inventa il peso', () => {
    const r = inGrammi(5, 'l', { nome: 'sciroppo di agave biologico xyz' })
    // «sciroppo» è in tabella: questo deve funzionare.
    expect(r.grammi).toBe(6650)
    const s = inGrammi(5, 'l', { nome: 'passata di pomodoro' })
    expect(s.grammi).toBe(null)
    expect(s.problema).toMatch(/non so quanto pesa un litro/)
  })
})

describe('I pezzi: senza il peso di uno non si va da nessuna parte', () => {
  it('cinque sacchi da 25 kg sono 125 kg', () => {
    const r = inGrammi(5, 'sacchi', { pesoConfezioneG: 25000 })
    expect(r.grammi).toBe(125000)
    expect(r.spiegazione).toMatch(/25 kg/)
  })

  it('senza il peso del sacco la riga si ferma e lo dice', () => {
    const r = inGrammi(5, 'sacchi')
    expect(r.grammi).toBe(null)
    expect(r.problema).toMatch(/manca il peso di uno/)
  })

  // ── Il peso scritto a mano, difetto del 21/09/2026 ─────────────────────
  //
  // Il campo della schermata passava `Number(v) || null`: «25.000» (come si
  // scrive un sacco da 25 kg in Italia) diventava venticinque **grammi** e
  // «12,5» diventava niente. Adesso il peso entra dalla stessa porta della
  // quantità — la regola italiana — e quando la lettura è incerta lo dice.
  it('«25.000» sono venticinquemila grammi, e le due letture si dichiarano', () => {
    const r = inGrammi(5, 'sacchi', { pesoConfezioneG: '25.000' })
    expect(r.grammi).toBe(125000)
    expect(r.ambiguo).toBe(true)
    expect(r.avvisi.join(' ')).toMatch(/25\.000 g/)
    expect(r.avvisi.join(' ')).toMatch(/oppure 25 g/)
  })

  it('«12,5» si legge 12,5 g: con la virgola non c\'è niente da interpretare', () => {
    const r = inGrammi(200, 'cf', { pesoConfezioneG: '12,5' })
    expect(r.grammi).toBe(2500)
    expect(r.ambiguo).toBe(false)
    expect(r.avvisi).toHaveLength(0)
  })

  it('un peso senza punti non fa domande', () => {
    const r = inGrammi(5, 'sacchi', { pesoConfezioneG: '25000' })
    expect(r.grammi).toBe(125000)
    expect(r.ambiguo).toBe(false)
    expect(r.avvisi).toHaveLength(0)
  })

  it('un peso vuoto o a zero non è un peso: la riga si ferma', () => {
    expect(inGrammi(5, 'sacchi', { pesoConfezioneG: '' }).problema).toMatch(/manca il peso di uno/)
    expect(inGrammi(5, 'sacchi', { pesoConfezioneG: '0' }).problema).toMatch(/manca il peso di uno/)
    expect(inGrammi(5, 'sacchi', { pesoConfezioneG: 'abc' }).problema).toMatch(/manca il peso di uno/)
  })
})

// ── I numeri delle spiegazioni: difetto del 21/09/2026 ────────────────────
//
// Le spiegazioni e gli avvisi di questo file passano tutti da `fmt`, che
// toglieva «gli zeri inutili in coda» — anche quando non erano in coda a un
// decimale ma dentro un numero intero. Risultato: `25000` si leggeva `25`,
// `1250` si leggeva `125`, `110` si leggeva `11`. Sono i numeri su cui una
// persona decide se il conto è giusto, e l'avviso sul peso del sacco avrebbe
// detto «si può leggere 25 g oppure 25 g».
describe('I numeri scritti a schermo sono quelli veri', () => {
  it('un numero intero non perde gli zeri: 25.000 g restano 25.000', () => {
    expect(inGrammi(25000, 'g').spiegazione).toBe('25.000 g')
    expect(inGrammi(110, 'g').spiegazione).toBe('110 g')
    expect(inGrammi(1000, 'g').spiegazione).toBe('1.000 g')
  })

  it('le migliaia hanno il punto italiano, i decimali la virgola', () => {
    expect(inGrammi('1.250', 'kg').spiegazione).toBe('1.250 kg')
    expect(inGrammi('10,5', 'kg').spiegazione).toBe('10,5 kg')
  })

  it('e il prezzo al chilo di 1.250 kg a 1.000,00 € è 0,80, non 800', () => {
    const r = prezzoAlKgDaRiga({ nome: 'farina 00', quantita: '1.250', unita: 'kg', imponibile: '1.000,00' })
    expect(r.prezzoKg).toBe(0.8)
    expect(r.spiegazione.join(' | ')).toMatch(/1\.000 € ÷ 1\.250 kg/)
  })
})

describe('Il prezzo al chilo', () => {
  it('il caso normale: cinque sacchi da 25 kg a 92,50 € in tutto', () => {
    const r = prezzoAlKgDaRiga({
      nome: 'farina 00', quantita: 5, unita: 'sacchi',
      pesoConfezioneG: 25000, imponibile: '92,50',
    })
    expect(r.prezzoKg).toBeCloseTo(0.74, 4)   // 92,50 ÷ 125 kg
    expect(r.problema).toBe(null)
  })

  it('l\'imponibile di riga vince sul prezzo di listino, perché è quello che paghi', () => {
    // Listino 10 €/kg su 10 kg farebbe 100 €, ma in fattura ce ne sono 85:
    // lo sconto è già dentro l'imponibile, e il prezzo vero è 8,50 €/kg.
    const r = prezzoAlKgDaRiga({
      nome: 'burro', quantita: 10, unita: 'kg',
      prezzoUnitario: '10,00', imponibile: '85,00',
    })
    expect(r.prezzoKg).toBeCloseTo(8.5, 4)
  })

  it('senza imponibile si usa il listino, e lo sconto di riga si applica', () => {
    const r = prezzoAlKgDaRiga({
      nome: 'zucchero', quantita: 20, unita: 'kg',
      prezzoUnitario: '1,50', scontoPct: 10,
    })
    // 1,50 × 20 = 30 €, meno 10% = 27 €, su 20 kg = 1,35 €/kg
    expect(r.prezzoKg).toBeCloseTo(1.35, 4)
    expect(r.spiegazione.join(' ')).toMatch(/sconto/)
  })

  it('il totale con IVA si riporta a imponibile, se l\'aliquota c\'è', () => {
    const r = prezzoAlKgDaRiga({
      nome: 'panna', quantita: 10, unita: 'kg',
      totaleConIva: '44,00', aliquotaIva: 10,
    })
    expect(r.prezzoKg).toBeCloseTo(4, 3)   // 44 ÷ 1,10 = 40 € su 10 kg
  })

  it('con il solo lordo e nessuna aliquota la riga NON fa il prezzo', () => {
    // Fra il 4% e il 22% ci sono diciotto punti: indovinare qui vuol dire
    // sbagliare il food cost di quella materia prima per sempre.
    const r = prezzoAlKgDaRiga({
      nome: 'panna', quantita: 10, unita: 'kg', totaleConIva: '44,00',
    })
    expect(r.prezzoKg).toBe(null)
    expect(r.problema).toMatch(/aliquota/)
  })

  it('una riga a zero euro è un omaggio, non un prezzo da zero', () => {
    const r = prezzoAlKgDaRiga({
      nome: 'campione', quantita: 1, unita: 'kg', imponibile: '0',
    })
    expect(r.prezzoKg).toBe(null)
    expect(r.problema).toMatch(/omaggio/)
  })

  it('«1.250» resta ambiguo e lo dichiara, invece di decidere di nascosto', () => {
    // È il difetto da mille volte: 1.250 € o 1,25 €. La regola italiana vale
    // e vince, ma la schermata deve poterlo chiedere.
    const r = prezzoAlKgDaRiga({
      nome: 'vaniglia', quantita: 1, unita: 'kg', imponibile: '1.250',
    })
    expect(r.ambiguo).toBe(true)
    expect(r.prezzoKg).toBeCloseTo(1250, 2)
  })

  it('ogni passaggio del conto è scritto, così si può contestare', () => {
    const r = prezzoAlKgDaRiga({
      nome: 'farina 00', quantita: 5, unita: 'sacchi',
      pesoConfezioneG: 25000, imponibile: '92,50',
    })
    const testo = r.spiegazione.join(' | ')
    expect(testo).toMatch(/125 kg/)
    expect(testo).toMatch(/92,5/)
    expect(testo).toMatch(/0,74/)
  })
})

describe('Quando un prezzo merita un\'occhiata prima di entrare', () => {
  it('un rincaro del 30% passa: i prezzi si muovono davvero', () => {
    expect(scostamentoSospetto(10, 13)).toBe(false)
  })

  it('mille volte no: quello non è un rincaro, è una virgola', () => {
    expect(scostamentoSospetto(1.25, 1250)).toBe(true)
  })

  it('venticinque volte no: quello è un sacco contato come un pezzo', () => {
    expect(scostamentoSospetto(0.74, 18.5)).toBe(true)
  })

  it('se prima non c\'era prezzo non c\'è nessuno scostamento', () => {
    expect(scostamentoSospetto(null, 12)).toBe(false)
    expect(scostamentoSospetto(0, 12)).toBe(false)
  })
})

describe('Cosa farsene, di questo prezzo', () => {
  it('se prima non c\'era, si applica', () => {
    const d = decidiPrezzo({ prezzoAttuale: null, prezzoNuovo: 4.5, dataBolla: '2026-09-19' })
    expect(d.azione).toBe('applica')
  })

  it('se è lo stesso di prima non si scrive niente', () => {
    const d = decidiPrezzo({ prezzoAttuale: 4.5, prezzoNuovo: 4.5, dataBolla: '2026-09-19' })
    expect(d.azione).toBe('nessuna')
  })

  it('una bolla vecchia va nello storico ma non diventa il prezzo di oggi', () => {
    // Il caso vero: si carica oggi la bolla della settimana scorsa, ma il
    // prezzo è già stato corretto a mano ieri. Il P&L della settimana scorsa
    // deve sapere della bolla; il listino di oggi non si tocca.
    const d = decidiPrezzo({
      prezzoAttuale: 5.0, prezzoNuovo: 4.5,
      dataBolla: '2026-09-10', dataUltimoCambio: '2026-09-18',
    })
    expect(d.azione).toBe('soloStorico')
    expect(d.motivo).toMatch(/10\/09\/2026/)
    expect(d.motivo).toMatch(/18\/09\/2026/)
  })

  it('una bolla più recente dell\'ultimo cambio invece si applica', () => {
    const d = decidiPrezzo({
      prezzoAttuale: 5.0, prezzoNuovo: 4.5,
      dataBolla: '2026-09-19', dataUltimoCambio: '2026-09-18',
    })
    expect(d.azione).toBe('applica')
  })
})

describe('Riconoscere una bolla già caricata', () => {
  it('lo stesso documento scritto in due modi è lo stesso documento', () => {
    const a = identitaBolla({ fornitore: 'Molino Rossi', numero: 'N. 1234/A', data: '2026-09-19' })
    const b = identitaBolla({ fornitore: 'molino rossi', numero: 'n1234a', data: '19/09/2026' })
    expect(a).toBe(b)
  })

  it('senza numero non si inventa un\'identità', () => {
    // Rispondere «nuova» qui vorrebbe dire raddoppiare le giacenze in
    // silenzio al secondo tentativo.
    expect(identitaBolla({ fornitore: 'Molino Rossi', data: '2026-09-19' })).toBe(null)
    expect(identitaBolla({ numero: '123' })).toBe(null)
  })
})

describe('Il giorno, senza che il fuso lo sposti', () => {
  it('legge sia AAAA-MM-GG sia GG/MM/AAAA', () => {
    expect(soloGiorno('2026-09-19')).toBe('2026-09-19')
    expect(soloGiorno('19/09/2026')).toBe('2026-09-19')
    expect(soloGiorno('2026-09-19T22:30:00.000Z')).toBe('2026-09-19')
  })

  it('da un oggetto Date prende il giorno LOCALE, non quello di Greenwich', () => {
    // Mezzanotte e mezza del 19 in Italia è ancora il 18 a Greenwich: con
    // `toISOString` tutte le decorrenze slitterebbero indietro di un giorno.
    const d = new Date(2026, 8, 19, 0, 30)
    expect(soloGiorno(d)).toBe('2026-09-19')
  })
})

describe('Una bolla intera, pronta da rivedere a schermo', () => {
  const COSTI = {
    'farina 00': { costoKg: 0.70, costoG: 0.0007 },
    burro: { costoKg: 9.0, costoG: 0.009 },
    'pasta di nocciola': { costoKg: 22, costoG: 0.022, isStima: true },
  }
  const LOG = [
    { ingrediente: 'burro', decorre_da: '2026-09-18T00:00:00.000Z', prezzoNuovo: 9 },
    { ingrediente: 'farina 00', decorre_da: '2026-09-01T00:00:00.000Z', prezzoNuovo: 0.7 },
  ]

  it('mette insieme conto, decisione e motivo per ogni riga', () => {
    const righe = preparaBolla([
      { nome: 'farina 00', quantita: 5, unita: 'sacchi', pesoConfezioneG: 25000, imponibile: '92,50' },
      { nome: 'burro', quantita: 10, unita: 'kg', imponibile: '95,00' },
      { nome: 'misteriosa', quantita: 3, unita: 'barattoli', imponibile: '30,00' },
    ], { ingredientiCosti: COSTI, logPrezzi: LOG, dataBolla: '2026-09-19' })

    expect(righe[0].prezzoKg).toBeCloseTo(0.74, 3)
    expect(righe[0].azione).toBe('applica')
    expect(righe[1].prezzoKg).toBeCloseTo(9.5, 3)
    expect(righe[1].azione).toBe('applica')
    expect(righe[2].prezzoKg).toBe(null)
    expect(righe[2].azione).toBe('nessuna')
    expect(righe[2].problema).toMatch(/unità/)
  })

  it('dice quali nomi NON sono nell\'elenco delle materie prime', () => {
    // Una bolla non deve poter creare materie prime da sola: è così che
    // nascono «aceto balsamicp» e i food cost che scendono in silenzio.
    const righe = preparaBolla([
      { nome: 'farina 00', quantita: 1, unita: 'kg', imponibile: '1' },
      { nome: 'farina 0000', quantita: 1, unita: 'kg', imponibile: '1' },
    ], { ingredientiCosti: COSTI, dataBolla: '2026-09-19' })
    expect(righe[0].esisteInElenco).toBe(true)
    expect(righe[1].esisteInElenco).toBe(false)
  })

  it('un prezzo che il prodotto aveva stimato si lascia sostituire senza storie', () => {
    const righe = preparaBolla([
      { nome: 'pasta di nocciola', quantita: 5, unita: 'kg', imponibile: '150' },
    ], { ingredientiCosti: COSTI, dataBolla: '2026-09-19' })
    expect(righe[0].eraUnaStima).toBe(true)
    expect(righe[0].prezzoAttuale).toBe(null)
    expect(righe[0].azione).toBe('applica')
    expect(righe[0].motivo).toMatch(/prima non aveva prezzo/)
  })

  it('una bolla più vecchia dell\'ultimo cambio va solo nello storico', () => {
    const righe = preparaBolla([
      { nome: 'burro', quantita: 10, unita: 'kg', imponibile: '95,00' },
    ], { ingredientiCosti: COSTI, logPrezzi: LOG, dataBolla: '2026-09-15' })
    expect(righe[0].azione).toBe('soloStorico')
  })

  it('lo scostamento fuori scala viene segnalato, non applicato di nascosto', () => {
    const righe = preparaBolla([
      { nome: 'farina 00', quantita: 1, unita: 'kg', imponibile: '18,50' },
    ], { ingredientiCosti: COSTI, dataBolla: '2026-09-19' })
    expect(righe[0].sospetto).toBe(true)
  })

  it('l\'ultimo cambio si legge dallo storico, il più recente per ingrediente', () => {
    const m = ultimiCambi([
      { ingrediente: 'burro', decorre_da: '2026-09-01' },
      { ingrediente: 'burro', decorre_da: '2026-09-18' },
      { ingrediente: 'Burro', decorre_da: '2026-09-05' },
    ])
    expect(m.get('burro')).toBe('2026-09-18')
  })
})

// ── Il listino e lo storico cambiano insieme, sempre ──────────────────────
//
// Questa è la parte che ha fatto nascere tutta la richiesta. Fino al
// 19/09/2026 i prezzi letti da una foto finivano dritti in
// `ingredienti_costi` e **basta**: nessuna riga in `logPrezzi`, nessuna data
// di decorrenza.
//
// Due conseguenze, e nessuna delle due si vedeva a schermo:
//
//   1. `calcolaFCStorico` ricostruisce il costo di una produzione passata
//      camminando all'indietro proprio su `logPrezzi`. Se lì non c'è scritto
//      niente, per il prodotto quel prezzo è sempre stato così: il P&L di
//      agosto veniva rifatto con i prezzi di settembre.
//   2. Nella pagina Materie prime il numero cambiava e non c'era modo di
//      sapere da dove venisse — cioè esattamente la domanda che uno si fa
//      quando un margine non torna.
describe('Il listino e lo storico cambiano insieme', () => {
  const COSTI = { 'farina 00': { costoKg: 0.70, costoG: 0.0007 } }
  const ORIGINE = { tipo: 'bolla', fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19' }

  it('un prezzo che cambia lascia SEMPRE una riga nello storico', () => {
    const r = applicaCambiAlListino([
      { chiave: 'farina 00', nome: 'farina 00', prezzoKg: 0.74, prezzoAttuale: 0.70, azione: 'applica' },
    ], { ingredientiCosti: COSTI, logPrezzi: [], origine: ORIGINE })

    expect(r.ingredientiCosti['farina 00'].costoKg).toBeCloseTo(0.74, 4)
    expect(r.logPrezzi).toHaveLength(1)
    expect(r.logPrezzi[0].prezzoVecchio).toBeCloseTo(0.70, 4)
    expect(r.logPrezzi[0].prezzoNuovo).toBeCloseTo(0.74, 4)
  })

  it('lo storico dice da dove viene il numero, non solo che è cambiato', () => {
    const r = applicaCambiAlListino([
      { chiave: 'farina 00', nome: 'farina 00', prezzoKg: 0.74, prezzoAttuale: 0.70, azione: 'applica' },
    ], { ingredientiCosti: COSTI, origine: ORIGINE, utente: 'riccardo@maradeiboschi.com' })
    expect(r.logPrezzi[0].origine.tipo).toBe('bolla')
    expect(r.logPrezzi[0].origine.fornitore).toBe('Molino Rossi')
    expect(r.logPrezzi[0].origine.numero).toBe('1234/A')
    expect(r.logPrezzi[0].utente).toBe('riccardo@maradeiboschi.com')
  })

  it('vale da quando è arrivata la merce, non da quando carichi il foglio', () => {
    // La bolla è di giovedì e la registri il lunedì dopo: il costo è
    // cambiato giovedì, e il P&L di quei giorni deve saperlo.
    const r = applicaCambiAlListino([
      { chiave: 'farina 00', nome: 'farina 00', prezzoKg: 0.74, prezzoAttuale: 0.70, azione: 'applica' },
    ], { ingredientiCosti: COSTI, origine: ORIGINE })
    expect(r.logPrezzi[0].decorre_da).toBe('2026-09-19T00:00:00.000Z')
  })

  it('«solo storico» scrive la riga e NON tocca il listino di oggi', () => {
    const r = applicaCambiAlListino([
      { chiave: 'farina 00', nome: 'farina 00', prezzoKg: 0.60, prezzoAttuale: 0.70, azione: 'soloStorico' },
    ], { ingredientiCosti: COSTI, origine: ORIGINE })
    expect(r.ingredientiCosti['farina 00'].costoKg).toBeCloseTo(0.70, 4)  // intatto
    expect(r.logPrezzi).toHaveLength(1)
    expect(r.logPrezzi[0].soloStorico).toBe(true)
    expect(r.applicati).toBe(0)
    expect(r.storicizzati).toBe(1)
  })

  it('«prima non c\'era prezzo» si scrive null, non zero', () => {
    // Uno zero qui vorrebbe dire «prima era gratis», e il conto storico
    // leggerebbe zero per tutte le date precedenti.
    const r = applicaCambiAlListino([
      { chiave: 'vaniglia', nome: 'vaniglia', prezzoKg: 380, prezzoAttuale: null, azione: 'applica' },
    ], { ingredientiCosti: {}, origine: ORIGINE })
    expect(r.logPrezzi[0].prezzoVecchio).toBe(null)
    expect(r.logPrezzi[0].delta).toBe(null)
    expect(r.logPrezzi[0].deltaPct).toBe(null)
  })

  it('scrive costoKg e costoG, come si aspetta il resto del prodotto', () => {
    const r = applicaCambiAlListino([
      { chiave: 'burro', nome: 'burro', prezzoKg: 9.5, prezzoAttuale: 9, azione: 'applica' },
    ], { ingredientiCosti: {}, origine: ORIGINE })
    expect(r.ingredientiCosti.burro.costoKg).toBe(9.5)
    expect(r.ingredientiCosti.burro.costoG).toBe(0.0095)
  })

  it('non tocca le materie prime che non sono nella bolla', () => {
    const r = applicaCambiAlListino([
      { chiave: 'burro', nome: 'burro', prezzoKg: 9.5, prezzoAttuale: null, azione: 'applica' },
    ], { ingredientiCosti: COSTI, origine: ORIGINE })
    expect(r.ingredientiCosti['farina 00'].costoKg).toBeCloseTo(0.70, 4)
  })

  it('una riga senza prezzo o senza chiave non entra da nessuna parte', () => {
    const r = applicaCambiAlListino([
      { chiave: 'burro', nome: 'burro', prezzoKg: 0, azione: 'applica' },
      { chiave: '', nome: '', prezzoKg: 5, azione: 'applica' },
      { chiave: 'zucchero', nome: 'zucchero', prezzoKg: 1.2, azione: 'nessuna' },
    ], { ingredientiCosti: COSTI, origine: ORIGINE })
    expect(r.logPrezzi).toHaveLength(0)
    expect(r.ingredientiCosti).toEqual(COSTI)
  })

  it('lo storico non cresce all\'infinito, ma le righe nuove stanno in cima', () => {
    const vecchio = Array.from({ length: 500 }, (_, i) => ({ id: `v${i}`, ingrediente: 'x' }))
    const r = applicaCambiAlListino([
      { chiave: 'burro', nome: 'burro', prezzoKg: 9.5, prezzoAttuale: 9, azione: 'applica' },
    ], { ingredientiCosti: {}, logPrezzi: vecchio, origine: ORIGINE })
    expect(r.logPrezzi).toHaveLength(500)
    expect(r.logPrezzi[0].ingrediente).toBe('burro')
  })
})

// ── Tutto quello che una bolla scrive ─────────────────────────────────────
//
// Quattro pezzi di dati che cambiano insieme, e stanno in due posti diversi:
// giacenze e registro dei rifornimenti sono **della sede**, listino e storico
// dei prezzi sono **dell'azienda** (la pagina Materie prime il selettore
// delle sedi non ce l'ha). Se ne entrasse solo una metà, il prodotto
// sembrerebbe a posto e non lo sarebbe.
describe('Tutto quello che una bolla scrive', () => {
  const RIGHE = [
    { chiave: 'farina 00', nome: 'farina 00', grammi: 125000, prezzoKg: 0.74, prezzoAttuale: 0.70, azione: 'applica' },
    { chiave: 'burro', nome: 'burro', grammi: 10000, prezzoKg: 9.5, prezzoAttuale: 9, azione: 'applica' },
  ]
  const DOC = { fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19', identita: 'molinorossi|1234a|2026-09-19' }
  const STATO = {
    magazzino: { 'farina 00': { nome: 'Farina 00', giacenza_g: 5000, soglia_g: 2000 } },
    logRif: [],
    ingredientiCosti: { 'farina 00': { costoKg: 0.70, costoG: 0.0007 }, burro: { costoKg: 9, costoG: 0.009 } },
    logPrezzi: [],
    utente: 'riccardo@maradeiboschi.com',
  }

  it('la merce si somma alla giacenza, non la sostituisce', () => {
    const p = preparaScrittureBolla(RIGHE, DOC, STATO)
    expect(p.magazzino['farina 00'].giacenza_g).toBe(130000)   // 5 kg + 125 kg
    expect(p.magazzino['farina 00'].soglia_g).toBe(2000)       // la soglia resta
    expect(p.magazzino.burro.giacenza_g).toBe(10000)
  })

  it('e i prezzi cambiano nello stesso colpo, con lo storico', () => {
    const p = preparaScrittureBolla(RIGHE, DOC, STATO)
    expect(p.ingredientiCosti['farina 00'].costoKg).toBeCloseTo(0.74, 4)
    expect(p.logPrezzi).toHaveLength(2)
    expect(p.applicati).toBe(2)
    expect(p.caricati).toBe(2)
  })

  it('il registro dei rifornimenti dice da quale bolla arriva la merce', () => {
    const p = preparaScrittureBolla(RIGHE, DOC, STATO)
    expect(p.logRif[0].note).toBe('bolla Molino Rossi n. 1234/A')
    expect(p.logRif[0].bolla).toBe('molinorossi|1234a|2026-09-19')
    expect(p.logRif[0].utente).toBe('riccardo@maradeiboschi.com')
  })

  it('una riga senza quantità aggiorna il prezzo ma non le giacenze', () => {
    // Capita con le fatture: il prezzo c'è, la quantità in chili no perché
    // manca il peso della confezione. Meglio metà giusta che niente.
    const p = preparaScrittureBolla([
      { chiave: 'burro', nome: 'burro', grammi: null, prezzoKg: 9.5, prezzoAttuale: 9, azione: 'applica' },
    ], DOC, STATO)
    expect(p.caricati).toBe(0)
    expect(p.applicati).toBe(1)
    expect(p.magazzino.burro).toBeUndefined()
  })

  it('non inventa una materia prima che non c\'è: la riga senza chiave sparisce', () => {
    const p = preparaScrittureBolla([
      { chiave: '', nome: 'aceto balsamicp', grammi: 1000, prezzoKg: 5, azione: 'applica' },
    ], DOC, STATO)
    expect(p.caricati).toBe(0)
    expect(p.storicizzati).toBe(0)
    expect(p.ingredientiCosti).toEqual(STATO.ingredientiCosti)
  })

  it('il nome già in magazzino vince su quello scritto sulla bolla', () => {
    // In magazzino la voce si chiama «Farina 00» con la maiuscola: la bolla
    // del fornitore non deve rinominare le cose di casa.
    const p = preparaScrittureBolla(RIGHE, DOC, STATO)
    expect(p.magazzino['farina 00'].nome).toBe('Farina 00')
  })
})
