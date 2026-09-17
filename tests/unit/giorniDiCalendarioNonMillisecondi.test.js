// ── I giorni si contano in giorni ──────────────────────────────────────
//
// Audit del 16/09/2026, agente DATE. È la sesta volta che sullo stesso
// progetto una data si sposta di un giorno, e ogni volta era stata corretta
// solo nel punto dove si vedeva. Cercandola in tutti i file assegnati è
// venuta fuori una radice sola, scritta in due mosse che sembrano innocue:
//
//     new Date('2026-03-29')            → mezzanotte a GREENWICH, non a Torino
//     d.setDate(d.getDate() + 7)        → sposta il giorno LOCALE
//     d.toISOString().slice(0, 10)      → e rilegge il risultato a Greenwich
//
// Andata e ritorno fra due riferimenti diversi. Finché l'offset del fuso non
// cambia il conto torna per caso; nelle due notti del cambio ora no. Nel 2026
// l'Italia passa a +2 il 29 marzo e torna a +1 il 25 ottobre.
//
// Quello che succedeva davvero, prima delle correzioni:
//
//  · il planning turni (`Personale.jsx`) nella settimana del 29 marzo
//    stampava il 29 due volte e il 30 non lo stampava affatto: i turni di un
//    giorno intero non comparivano a chi doveva farli. E «settimana
//    successiva», dal 29 marzo, portava al 4 aprile invece che al 5;
//  · la previsione di cassa (`CashflowView.jsx`) avanzava di 86.400.000
//    millisecondi per volta: il 25 ottobre ripeteva un giorno e ne saltava un
//    altro, e il «primo giorno in rosso» veniva annunciato con la data
//    sbagliata;
//  · «fornitori attivi negli ultimi 30 giorni» ne contava 31, e in Italia 32;
//  · il controllo duplicati dell'import leggeva un mese corto di un giorno:
//    se le righe già caricate erano quelle del 31, l'avviso non compariva e
//    l'import le raddoppiava in silenzio. Fine mese è quando si importa la
//    cassa.
//
// Sul lato server la stessa radice ha una variante peggiore: su Vercel il
// processo gira con TZ=UTC, quindi lì «locale» vuol dire Greenwich. La data
// della fattura elettronica, il giorno della chiusura di cassa arrivata dal
// registratore Zucchetti e la finestra chiesta a SumUp per il delivery erano
// tutti giorni UTC. A cavallo del 31 dicembre la fattura sbagliava anche anno.
//
// Gli attrezzi stanno tutti in `src/lib/dateLocal.js` e fanno il conto in UTC
// interno, dove i giorni durano 24 ore per definizione: il fuso di chi guarda
// non entra mai.

import { describe, it, expect } from 'vitest'
import {
  aggiungiGiorni, differenzaGiorni, giorniTra, aggiungiMesi,
  lunediDellaSettimana, primoGiornoDelMese, ultimoGiornoDelMese,
  giornoItaliano, giorniFaItaliano, ieriItaliano, giornoItalianoDi,
  inizioGiornoItaliano, fineGiornoItaliano,
  todayLocal, giorniFaLocal, meseLocale, soloData,
} from '../../src/lib/dateLocal.js'
import { raggruppaFornitoriDaFatture } from '../../src/lib/fornitoriDaFatture.js'

// I due modi sbagliati, scritti per intero.
//
// Il primo è quello che c'era in `Personale.isoMonday` e in
// `QuadraturaInventarioView.addDays`: parte da mezzanotte a Greenwich, sposta
// i campi LOCALI, e rilegge a Greenwich.
function vecchioAddDays(dateIso, n) {
  const d = new Date(dateIso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Il secondo è quello di `CashflowView`, `MenuEngineeringView`, `OrdiniAiView`
// e del `periodCompare` di prima: somma millisecondi a una mezzanotte locale.
// Un giorno non è 86.400.000 millisecondi due volte l'anno.
function vecchioAddGiorniMs(dateIso, n) {
  const d = new Date(`${dateIso}T00:00:00`)
  const x = new Date(d.getTime() + n * 86400000)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// Quante ore dura, per la macchina che gira il test, il giorno locale `g`.
// Quasi sempre 24; 23 il giorno in cui l'orologio va avanti, 25 quello in cui
// torna indietro.
function oreDelGiornoLocale(g) {
  const a = new Date(Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10)))
  const b = new Date(Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10)) + 1)
  return (b.getTime() - a.getTime()) / 3600000
}

// I giorni in cui il fuso della macchina cambia offset, cercati sui dati veri
// invece che scritti a mano. Ogni paese lo fa in una data sua: l'Italia il 29
// marzo e il 25 ottobre 2026, la Nuova Zelanda il 5 aprile e il 27 settembre,
// la California l'8 marzo e il 1° novembre. In UTC la lista è vuota, e il
// controllo lo dice invece di fingere.
function giorniConCambioOra(anno) {
  const out = []
  for (let m = 0; m < 12; m++) {
    for (let g = 1; g <= 31; g++) {
      const a = new Date(anno, m, g)
      if (a.getDate() !== g) break
      const giorno = `${anno}-${String(m + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`
      if (oreDelGiornoLocale(giorno) !== 24) out.push(giorno)
    }
  }
  return out
}

describe('il righello: questo controllo saprebbe trovare un difetto', () => {
  // Questo controllo aveva trovato un difetto in se stesso, ed è il motivo per
  // cui è scritto così. Diceva: «la somma in millisecondi sbaglia OGNI giorno
  // di cambio ora». Non è vero, ed è falso in un modo istruttivo. Sommare
  // 24 ore a mezzanotte del giorno che ne dura 23 porta all'una del giorno
  // dopo: il giorno giusto, per fortuna. Sommarle a quello che ne dura 25
  // porta alle 23:00 dello stesso giorno: il giorno prima di quello atteso.
  // All'indietro succede il contrario. Quindi ogni fuso con l'ora legale ha
  // una direzione rotta per ciascuna delle sue due notti, non due su due.
  // L'affermazione comoda va resa vera, non tenuta perché suona meglio.
  it('la somma in millisecondi sbaglia in ogni fuso con l’ora legale, in una delle due direzioni', () => {
    const cambi = giorniConCambioOra(2026)
    if (cambi.length === 0) {
      // Fuso senza ora legale (UTC): non c'è niente da attraversare, e infatti
      // lì il vecchio conto non sbagliava mai, in nessuna direzione. È
      // esattamente per questo che il difetto è sopravvissuto a una suite che
      // per mesi ha girato in UTC: il righello era tarato sul posto sbagliato.
      expect(vecchioAddGiorniMs('2026-03-29', 1)).toBe('2026-03-30')
      expect(vecchioAddGiorniMs('2026-10-26', -1)).toBe('2026-10-25')
      return
    }

    const rottoAvanti = []
    const rottoIndietro = []
    for (const g of cambi) {
      const dopo = aggiungiGiorni(g, 1)
      const avanti = vecchioAddGiorniMs(g, 1) !== dopo
      const indietro = vecchioAddGiorniMs(dopo, -1) !== g

      // Su un giorno di cambio ora una direzione sbaglia sempre.
      expect(avanti || indietro).toBe(true)
      // E quale delle due lo decide la durata del giorno, non il paese.
      expect(avanti).toBe(oreDelGiornoLocale(g) > 24)
      expect(indietro).toBe(oreDelGiornoLocale(g) < 24)

      if (avanti) rottoAvanti.push(g)
      if (indietro) rottoIndietro.push(g)
    }

    // Un anno di ora legale ha un giorno corto e uno lungo: tutte e due le
    // direzioni sono rotte, su date diverse. In Italia il 25 ottobre rompe la
    // previsione di cassa che va avanti, il 29 marzo rompe «ultimi 30 giorni»
    // che va indietro.
    expect(rottoAvanti.length).toBeGreaterThan(0)
    expect(rottoIndietro.length).toBeGreaterThan(0)
  })

  it('una finestra che ATTRAVERSA il cambio ora perde o guadagna un giorno', () => {
    // La forma vera del difetto in Foodos: nessuno somma un giorno solo, si
    // sommano trenta o sessanta. Se la finestra scavalca il cambio, il bordo
    // si sposta. La prova è costruita sul cambio di QUESTO fuso, non su una
    // data italiana scritta a mano: da Auckland il 25 ottobre non dimostra
    // niente, ma il 5 aprile sì.
    const cambi = giorniConCambioOra(2026)
    if (cambi.length === 0) return // UTC: niente da attraversare

    for (const g of cambi) {
      const partenza = aggiungiGiorni(g, -29) // la finestra passa sopra il cambio
      const arrivoGiusto = aggiungiGiorni(partenza, 60)
      const arrivoNaif = vecchioAddGiorniMs(partenza, 60)
      if (oreDelGiornoLocale(g) > 24) {
        // Il giorno lungo: la somma resta indietro di un giorno.
        expect(arrivoNaif).toBe(aggiungiGiorni(arrivoGiusto, -1))
      } else {
        // Il giorno corto: andando avanti la somma sopravvive (è l'ora in più
        // che finisce comunque dentro il giorno giusto), ma la stessa finestra
        // percorsa all'indietro no.
        expect(arrivoNaif).toBe(arrivoGiusto)
        expect(vecchioAddGiorniMs(arrivoGiusto, -60)).toBe(aggiungiGiorni(partenza, -1))
      }
    }
  })

  it('il conto coi campi locali sbaglia dove l’offset è piccolo: in Europa', () => {
    // Questo secondo modo si rompe solo se mezzanotte a Greenwich cade vicino
    // a mezzanotte locale — cioè in Europa, dove l'offset è di un'ora o due.
    // Ad Auckland (+12) mezzanotte UTC è mezzogiorno, il cambio ora avviene
    // alle 3 del mattino e il conto torna per fortuna. Vale la pena dirlo: il
    // difetto NON si vede da qualunque fuso, e Foodos lo usano a Torino.
    const offsetOre = -new Date('2026-03-29T00:00:00Z').getTimezoneOffset() / 60
    const vicinoAGreenwich = Math.abs(offsetOre) <= 2
    const cambi = giorniConCambioOra(2026)
    const sbagliati = cambi.filter(g => vecchioAddDays(g, 1) !== aggiungiGiorni(g, 1))
    if (vicinoAGreenwich && cambi.length > 0) {
      expect(sbagliati.length).toBeGreaterThan(0)
    }
    // E comunque, dove il vecchio conto sbaglia, quello nuovo ha ragione.
    for (const g of sbagliati) {
      expect(aggiungiGiorni(g, 1)).not.toBe(vecchioAddDays(g, 1))
      expect(differenzaGiorni(g, aggiungiGiorni(g, 1))).toBe(1)
    }
  })

  it('il fatto di calendario che rompeva i conti, misurato a Roma', () => {
    // Indipendente dal fuso della macchina: il 29 marzo 2026, a Roma, dura 23
    // ore e il 25 ottobre ne dura 25. Ogni conto che dà per scontate 24 ore
    // sbaglia quei due giorni, e con loro tutte le finestre che li attraversano.
    const durata = (g) =>
      (new Date(fineGiornoItaliano(g)).getTime() - new Date(inizioGiornoItaliano(g)).getTime()) / 3600000
    expect(durata('2026-03-29')).toBe(23)
    expect(durata('2026-10-25')).toBe(25)
    expect(durata('2026-03-28')).toBe(24)
  })

  it('il modo nuovo non sbaglia in nessuno di quei giorni', () => {
    for (const g of giorniConCambioOra(2026)) {
      const atteso = new Date(Date.UTC(
        Number(g.slice(0, 4)), Number(g.slice(5, 7)) - 1, Number(g.slice(8, 10)) + 1,
      ))
      expect(aggiungiGiorni(g, 1)).toBe(atteso.toISOString().slice(0, 10))
    }
  })
})

describe('sommare giorni al giorno del cambio ora', () => {
  // Le due notti italiane del 2026. I valori attesi sono fatti di calendario:
  // valgono uguali a Torino, a Londra, a Los Angeles e ad Auckland.
  it('il 29 marzo (l’Italia passa a +2) più un giorno è il 30 marzo', () => {
    expect(aggiungiGiorni('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('il 25 ottobre (l’Italia torna a +1) più un giorno è il 26 ottobre', () => {
    expect(aggiungiGiorni('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('una settimana che scavalca il cambio ora è di sette giorni', () => {
    expect(aggiungiGiorni('2026-03-23', 7)).toBe('2026-03-30')
    expect(aggiungiGiorni('2026-10-19', 7)).toBe('2026-10-26')
    expect(differenzaGiorni('2026-03-23', '2026-03-30')).toBe(7)
    expect(differenzaGiorni('2026-10-19', '2026-10-26')).toBe(7)
  })

  it('indietro funziona come avanti', () => {
    expect(aggiungiGiorni('2026-03-30', -1)).toBe('2026-03-29')
    expect(aggiungiGiorni('2026-10-26', -7)).toBe('2026-10-19')
  })

  it('scavalca i mesi, gli anni e il 29 febbraio', () => {
    expect(aggiungiGiorni('2026-01-31', 1)).toBe('2026-02-01')
    expect(aggiungiGiorni('2026-12-31', 1)).toBe('2027-01-01')
    expect(aggiungiGiorni('2028-02-28', 1)).toBe('2028-02-29')
    expect(aggiungiGiorni('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('su un valore che non è un giorno non inventa niente', () => {
    expect(aggiungiGiorni('', 1)).toBe('')
    expect(aggiungiGiorni(null, 1)).toBe('')
    expect(aggiungiGiorni('marzo', 1)).toBe('')
    expect(differenzaGiorni('2026-01-01', 'boh')).toBeNaN()
  })
})

describe('la settimana renderizzata nel planning turni', () => {
  // Il difetto vero: il 29 marzo compariva due volte, il 30 mai.
  it('la settimana del cambio ora ha sette giorni diversi', () => {
    const lun = lunediDellaSettimana('2026-03-29')
    const giorni = giorniTra(lun, aggiungiGiorni(lun, 6))
    expect(giorni).toEqual([
      '2026-03-23', '2026-03-24', '2026-03-25',
      '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29',
    ])
    expect(new Set(giorni).size).toBe(7)
  })

  it('anche quella di ottobre, che dura 169 ore', () => {
    const giorni = giorniTra('2026-10-19', '2026-10-25')
    expect(giorni).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21',
      '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ])
  })

  it('la domenica appartiene alla settimana che comincia il lunedì prima', () => {
    expect(lunediDellaSettimana('2026-03-29')).toBe('2026-03-23') // domenica
    expect(lunediDellaSettimana('2026-03-23')).toBe('2026-03-23') // lunedì
    expect(lunediDellaSettimana('2026-10-25')).toBe('2026-10-19') // domenica del cambio
  })

  it('un intervallo rovesciato non produce giorni, invece di ciclare all’infinito', () => {
    expect(giorniTra('2026-03-30', '2026-03-29')).toEqual([])
  })

  it('«mese successivo» dal 31 gennaio non salta febbraio', () => {
    expect(aggiungiMesi('2026-01-31', 1)).toBe('2026-02-28')
    expect(aggiungiMesi('2028-01-31', 1)).toBe('2028-02-29')
    expect(aggiungiMesi('2026-03-31', -1)).toBe('2026-02-28')
    expect(aggiungiMesi('2026-01-15', -1)).toBe('2025-12-15')
    expect(aggiungiMesi('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('il mese di un giorno ha il primo e l’ultimo giusti', () => {
    expect(primoGiornoDelMese('2026-02-17')).toBe('2026-02-01')
    expect(ultimoGiornoDelMese('2026-02-17')).toBe('2026-02-28')
    expect(ultimoGiornoDelMese('2028-02-17')).toBe('2028-02-29')
    expect(ultimoGiornoDelMese('2026-12-03')).toBe('2026-12-31')
    expect(ultimoGiornoDelMese('2026-04-03')).toBe('2026-04-30')
  })
})

describe('il controllo duplicati dell’import salta l’ultimo giorno del mese', () => {
  // `ImportWizard` chiede al database le righe con `data >= primo` e
  // `data < nextMonth`. `nextMonth` si calcolava con
  // `new Date(anno, mese, 1).toISOString().slice(0, 10)`: mezzanotte LOCALE
  // del 1° del mese dopo, riletta a Greenwich — in Italia l'ULTIMO giorno del
  // mese in corso. Chi aveva già caricato solo il 31 non vedeva l'avviso.
  const nextMonth = (ym) => aggiungiGiorni(ultimoGiornoDelMese(`${ym}-01`), 1)

  it('il confine alto è il 1° del mese dopo, per tutti i mesi del 2026', () => {
    const attesi = {
      '2026-01': '2026-02-01', '2026-02': '2026-03-01', '2026-03': '2026-04-01',
      '2026-04': '2026-05-01', '2026-05': '2026-06-01', '2026-06': '2026-07-01',
      '2026-07': '2026-08-01', '2026-08': '2026-09-01', '2026-09': '2026-10-01',
      '2026-10': '2026-11-01', '2026-11': '2026-12-01', '2026-12': '2027-01-01',
    }
    for (const [ym, atteso] of Object.entries(attesi)) {
      expect(nextMonth(ym)).toBe(atteso)
    }
  })

  it('il 31 del mese cade DENTRO la finestra, che è il punto del difetto', () => {
    const primo = '2026-07-01'
    const trentuno = '2026-07-31'
    expect(trentuno >= primo).toBe(true)
    expect(trentuno < nextMonth('2026-07')).toBe(true)
  })

  it('febbraio bisestile compreso', () => {
    expect(nextMonth('2028-02')).toBe('2028-03-01')
    expect('2028-02-29' < nextMonth('2028-02')).toBe(true)
  })
})

describe('«ultimi 30 giorni» dei fornitori sono trenta', () => {
  const OGGI = '2026-09-16'
  const fatt = (giorno, totale) => ({ fornitore: 'MOLINO ROSSI', totale, data_fattura: giorno })

  function totale30(fatture) {
    const r = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    return r.daImportare[0]?.totale30gg ?? 0
  }

  it('il trentesimo giorno indietro è dentro, il trentunesimo è fuori', () => {
    // Giorno 0 = oggi. La finestra è [oggi-29, oggi]: trenta giorni contati.
    expect(totale30([fatt(aggiungiGiorni(OGGI, -29), 100)])).toBe(100)
    expect(totale30([fatt(aggiungiGiorni(OGGI, -30), 100)])).toBe(0)
    expect(totale30([fatt(aggiungiGiorni(OGGI, -31), 100)])).toBe(0)
  })

  it('oggi ci sta dentro', () => {
    expect(totale30([fatt(OGGI, 250)])).toBe(250)
  })

  it('trenta fatture, una al giorno, fanno trenta contate — non trentuno', () => {
    const fatture = []
    for (let i = 0; i <= 40; i++) fatture.push(fatt(aggiungiGiorni(OGGI, -i), 1))
    expect(totale30(fatture)).toBe(30)
  })

  it('il totale complessivo resta quello di tutte le fatture', () => {
    const fatture = [fatt(OGGI, 10), fatt(aggiungiGiorni(OGGI, -100), 90)]
    const r = raggruppaFornitoriDaFatture(fatture, [], OGGI)
    expect(r.daImportare[0].totale).toBe(100)
    expect(r.daImportare[0].totale30gg).toBe(10)
    expect(r.totaleFatture).toBe(2)
  })

  it('senza una data di riferimento non si inventa una finestra', () => {
    const r = raggruppaFornitoriDaFatture([fatt(OGGI, 10)], [], null)
    expect(r.daImportare[0].totale30gg).toBe(0)
    expect(r.daImportare[0].totale).toBe(10)
  })
})

describe('il giorno della pasticceria visto da un server in UTC', () => {
  // Su Vercel il processo gira con TZ=UTC. Questi conti devono venire uguali
  // dovunque, perché li fanno la fattura elettronica, la cassa Zucchetti e la
  // sync notturna del delivery.
  it('le 00:30 italiane del 1° gennaio sono il 1° gennaio, non il 31 dicembre', () => {
    // Le 00:30 del 01/01/2027 a Roma (+1) sono le 23:30Z del 31/12/2026.
    const istante = new Date('2026-12-31T23:30:00Z')
    expect(giornoItaliano(istante)).toBe('2027-01-01')
    // Ed è il punto: `toISOString().slice(0,10)` avrebbe datato la fattura
    // all'anno di esercizio precedente.
    expect(istante.toISOString().slice(0, 10)).toBe('2026-12-31')
  })

  it('le 23:30 italiane restano nello stesso giorno', () => {
    expect(giornoItaliano(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-15')
  })

  it('«ieri» del cron notturno è ieri per Mara', () => {
    // Il cron delivery parte alle 02:00 UTC, cioè le 04:00 italiane d'estate.
    expect(ieriItaliano(new Date('2026-07-16T02:00:00Z'))).toBe('2026-07-15')
    // E regge anche se un domani lo schedule si sposta alle 23:00 UTC.
    expect(ieriItaliano(new Date('2026-07-16T23:00:00Z'))).toBe('2026-07-16')
    expect(giorniFaItaliano(7, new Date('2026-07-16T02:00:00Z'))).toBe('2026-07-09')
  })

  it('la scadenza a trenta giorni della fattura è un conto di calendario', () => {
    // Attraversa il cambio ora: con 30 × 86.400.000 millisecondi sarebbe
    // caduta il 24.
    expect(aggiungiGiorni('2026-09-25', 30)).toBe('2026-10-25')
    expect(aggiungiGiorni('2026-10-01', 30)).toBe('2026-10-31')
  })

  it('un GIORNO già fatto non si tocca, un ISTANTE si porta a Roma', () => {
    expect(giornoItalianoDi('2026-10-16')).toBe('2026-10-16')
    expect(giornoItalianoDi('2026-10-15T22:30:00Z')).toBe('2026-10-16') // 00:30 a Torino
    expect(giornoItalianoDi('2026-10-15T20:30:00Z')).toBe('2026-10-15') // 22:30 a Torino
    expect(giornoItalianoDi('')).toBe('')
    expect(giornoItalianoDi(null)).toBe('')
  })
})

describe('la finestra di una giornata italiana, chiesta a un’API straniera', () => {
  // È quello che sync-delivery manda a SumUp. Prima chiedeva le 24 ore UTC:
  // le prime due ore della giornata di Torino restavano fuori e al loro posto
  // entravano le ultime due della sera prima. Ogni notte, in automatico.
  it('d’estate la giornata comincia alle 22:00Z del giorno prima', () => {
    expect(inizioGiornoItaliano('2026-09-16')).toBe('2026-09-15T22:00:00.000Z')
    expect(fineGiornoItaliano('2026-09-16')).toBe('2026-09-16T22:00:00.000Z')
  })

  it('d’inverno alle 23:00Z', () => {
    expect(inizioGiornoItaliano('2026-01-15')).toBe('2026-01-14T23:00:00.000Z')
    expect(fineGiornoItaliano('2026-01-15')).toBe('2026-01-15T23:00:00.000Z')
  })

  it('il giorno del cambio ora dura venticinque ore, e il conto lo sa', () => {
    const da = new Date(inizioGiornoItaliano('2026-10-25')).getTime()
    const a = new Date(fineGiornoItaliano('2026-10-25')).getTime()
    expect((a - da) / 3600000).toBe(25)
  })

  it('e quello di marzo ne dura ventitré', () => {
    const da = new Date(inizioGiornoItaliano('2026-03-29')).getTime()
    const a = new Date(fineGiornoItaliano('2026-03-29')).getTime()
    expect((a - da) / 3600000).toBe(23)
  })

  it('le giornate si toccano senza buchi e senza sovrapposizioni', () => {
    for (const g of ['2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25', '2026-12-31']) {
      expect(fineGiornoItaliano(g)).toBe(inizioGiornoItaliano(aggiungiGiorni(g, 1)))
    }
  })
})

describe('quello che c’è intorno: gli attrezzi del browser', () => {
  // Qui «locale» è il fuso di chi guarda, e i valori assoluti cambiano da
  // macchina a macchina: si controllano le relazioni, non i numeri.
  it('oggi è un giorno scritto bene', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('«N giorni fa» è davvero N giorni prima di oggi', () => {
    for (const n of [0, 1, 7, 29, 30, 60, 365]) {
      expect(differenzaGiorni(giorniFaLocal(n), todayLocal())).toBe(n)
    }
  })

  it('«N giorni fa» e «aggiungi -N» dicono la stessa cosa', () => {
    for (const n of [1, 7, 30, 90]) {
      expect(giorniFaLocal(n)).toBe(aggiungiGiorni(todayLocal(), -n))
    }
  })

  it('il mese corrente è quello del giorno corrente', () => {
    expect(meseLocale()).toBe(todayLocal().slice(0, 7))
  })

  it('soloData taglia un giorno e non lo sposta', () => {
    expect(soloData('2026-03-29T23:30:00+02:00')).toBe('2026-03-29')
    expect(soloData('2026-03-29')).toBe('2026-03-29')
  })
})
