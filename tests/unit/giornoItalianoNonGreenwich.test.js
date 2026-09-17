// ── Il giorno è quello della pasticceria, non quello di Greenwich ────────────
//
// Audit del 16/09/2026, agente DATE, secondo giro. Il primo giro aveva
// sistemato la parte che si vede a schermo; questo file protegge la parte che
// non si vede: il pannello interno, le integrazioni e i documenti.
//
// Le due radici sono sempre le stesse due righe:
//
//     new Date().toISOString().slice(0, 10)   → il giorno di GREENWICH
//     new Date('AAAA-MM-GG')                  → mezzanotte a Greenwich
//
// Sul server non è un dettaglio di stile. Su Vercel il processo gira con
// TZ=UTC, quindi lì «locale» vuol dire Greenwich, e ogni giornata italiana
// comincia con due ore (una d'inverno) attribuite al giorno prima.
//
// Quello che succedeva davvero, prima delle correzioni di questo giro:
//
//  · `api/sdi-emit-invoice.js` — la chiave di idempotenza della fattura
//    elettronica conteneva il giorno UTC. Due retry del webhook Stripe a
//    cavallo della mezzanotte di Greenwich — le 01:00 o le 02:00 italiane —
//    producevano due chiavi diverse, quindi DUE fatture per lo stesso
//    abbonamento. E dopo aver corretto la data della fattura (che ora è il
//    giorno italiano) la chiave contraddiceva pure il documento che
//    proteggeva;
//  · `src/lib/inventarioImport.js` — l'import dell'inventario costruiva le
//    date del mese partendo dal lunedì e sommando giorni con `setDate` su un
//    istante di mezzanotte UTC. Basta che il foglio attraversi il passaggio
//    all'ora legale perché da lì in poi TUTTE le date siano scritte un giorno
//    prima: un foglio di marzo sposta indietro di un giorno tre settimane di
//    produzioni e rimanenze;
//  · `api/webhook-pos.js` — il registro delle sincronizzazioni spezzava la
//    giornata alle 02:00 italiane;
//  · `api/admin.js` — «fatture scadute», «fatturato del mese» e «scade entro
//    sette giorni» contati sul giorno UTC contro colonne che sono giorni di
//    calendario;
//  · `src/Dashboard.jsx` — un prezzo ingrediente messo «da oggi» restava
//    programmato fino alle 02:00: il food cost delle prime lavorazioni del
//    mattino girava ancora sul prezzo vecchio;
//  · `src/views/VenditeB2BView.jsx` — il filtro «ultimo trimestre» confrontava
//    mezzanotte a Greenwich con mezzogiorno locale;
//  · `src/lib/exportPDF.js` — il piè di pagina di ogni PDF dichiarava un'ora
//    di estrazione indietro di due.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  giornoItaliano, giornoItalianoDi, giorniFaItaliano, primoGiornoDelMese,
  aggiungiGiorni, differenzaGiorni, soloData, todayLocal,
} from '../../src/lib/dateLocal.js'
import { parseFoglioInventario } from '../../src/lib/inventarioImport.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')
// Le righe VIVE di un file: i commenti di questo audit citano apposta il
// codice sbagliato, e cercarlo nel file intero farebbe fallire il controllo
// proprio per la spiegazione che lo giustifica.
const vive = (src) => src.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')

// ─────────────────────────────────────────────────────────────────────────────

describe('la doppia fattura elettronica a cavallo della mezzanotte', () => {
  const SDI = leggi('api', 'sdi-emit-invoice.js')

  // La chiave di idempotenza, rifatta com'è nel codice. Il punto è che due
  // tentativi dentro la STESSA giornata italiana devono dare la stessa
  // stringa, altrimenti il secondo emette una seconda fattura vera.
  const chiave = (orgId, centesimi, dataFattura, quando) =>
    `manual:${orgId}:${centesimi}:${giornoItalianoDi(dataFattura) || giornoItaliano(quando)}`

  it('due retry a cinque minuti l’uno dall’altro danno la stessa chiave', () => {
    // 00:58 e 01:03 italiane del 12 marzo: fra i due c'è la mezzanotte di
    // Greenwich. Per la pasticceria è la stessa notte, lo stesso abbonamento,
    // la stessa fattura.
    const primo  = new Date('2026-03-11T23:58:00Z') // 00:58 a Torino
    const secondo = new Date('2026-03-12T00:03:00Z') // 01:03 a Torino
    expect(chiave('org-1', 12900, null, primo)).toBe(chiave('org-1', 12900, null, secondo))
    expect(giornoItaliano(primo)).toBe('2026-03-12')
  })

  it('e col vecchio conto ne davano due diverse — è il difetto', () => {
    const primo  = new Date('2026-03-11T23:58:00Z')
    const secondo = new Date('2026-03-12T00:03:00Z')
    const vecchia = (d) => `manual:org-1:12900:${d.toISOString().slice(0, 10)}`
    expect(vecchia(primo)).not.toBe(vecchia(secondo))
  })

  it('la chiave dice lo stesso giorno che c’è scritto sulla fattura', () => {
    // Il 31 dicembre alle 23:30Z è già il 1° gennaio a Torino: la fattura
    // porta la data del nuovo anno, e la chiave deve seguirla. Se restassero
    // disallineate, la protezione varrebbe per un documento diverso da quello
    // emesso.
    const capodanno = new Date('2026-12-31T23:30:00Z')
    expect(giornoItaliano(capodanno)).toBe('2027-01-01')
    expect(chiave('org-1', 12900, null, capodanno)).toContain('2027-01-01')
  })

  it('se la data della fattura arriva da fuori, comanda quella', () => {
    expect(chiave('org-1', 12900, '2026-05-04', new Date('2026-12-31T23:30:00Z')))
      .toContain('2026-05-04')
  })

  it('e il codice usa davvero quegli attrezzi, non `toISOString`', () => {
    expect(vive(SDI)).toMatch(/const dataFatturaFallback = giornoItalianoDi\(body\.data_fattura\) \|\| giornoItaliano\(\)/)
    // La data e la scadenza del documento: fatti fiscali.
    expect(vive(SDI)).toMatch(/data: giornoItaliano\(\)/)
    expect(vive(SDI)).toMatch(/scadenza: aggiungiGiorni\(giornoItaliano\(\), 30\)/)
  })

  it('la scadenza a trenta giorni è un conto di calendario', () => {
    // A cavallo del 25 ottobre, 30 × 86.400.000 millisecondi cadono il 24.
    expect(aggiungiGiorni('2026-09-25', 30)).toBe('2026-10-25')
    expect(differenzaGiorni('2026-09-25', aggiungiGiorni('2026-09-25', 30))).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('l’import dell’inventario che sposta indietro tre settimane', () => {
  // Il foglio vero del cliente: una riga di header con GUSTI, sotto una riga
  // di sub-header con PROD / RIMAN. per ogni giorno, e sotto i gusti.
  // `lunediBase` è il lunedì della prima settimana; le date le calcola il
  // parser sommando i giorni.
  function foglio(settimane, gusto = 'FIORDILATTE') {
    const header = ['GUSTI']
    const sub = ['']
    const riga = [gusto]
    for (let s = 0; s < settimane; s++) {
      for (let g = 0; g < 7; g++) {
        header.push('', '')
        sub.push('PROD', 'RIMAN.')
        riga.push(1000, 200)
      }
    }
    return [header, sub, riga]
  }

  it('quattro settimane dal 23 marzo sono ventotto giorni consecutivi', () => {
    // 23 marzo → 19 aprile. In mezzo c'è il 29, il giorno in cui l'Italia
    // passa a +2: con il vecchio conto, dal 30 marzo in poi ogni riga era
    // datata un giorno prima, e il 29 compariva due volte.
    const out = parseFoglioInventario(foglio(4), '2026-03-23')
    const date = out.righe.map(r => r.data)
    expect(date.length).toBe(28)
    expect(new Set(date).size).toBe(28)
    expect(date[0]).toBe('2026-03-23')
    expect(date[6]).toBe('2026-03-29')
    expect(date[7]).toBe('2026-03-30') // il giorno che spariva
    expect(date[27]).toBe('2026-04-19')
  })

  it('anche la settimana del ritorno all’ora solare', () => {
    const out = parseFoglioInventario(foglio(2), '2026-10-19')
    const date = out.righe.map(r => r.data)
    expect(date[6]).toBe('2026-10-25')
    expect(date[7]).toBe('2026-10-26')
    expect(new Set(date).size).toBe(14)
  })

  it('le date sono le stesse viste da qualunque fuso', () => {
    // È un fatto di calendario: il lunedì più sei è la domenica, a Torino
    // come ad Auckland. Se questo test passasse solo in Italia, vorrebbe dire
    // che il conto dipende ancora dall'orologio della macchina.
    const out = parseFoglioInventario(foglio(1), '2026-03-23')
    expect(out.righe.map(r => r.data)).toEqual([
      '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26',
      '2026-03-27', '2026-03-28', '2026-03-29',
    ])
  })

  it('i valori restano attaccati al giorno giusto', () => {
    const out = parseFoglioInventario(foglio(4), '2026-03-23')
    const r = out.righe.find(x => x.data === '2026-03-30')
    expect(r).toBeDefined()
    expect(r.produzione_g).toBe(1000)
    expect(r.rimanenza_g).toBe(200)
  })

  it('il conto vecchio, scritto per intero, sbaglia dove questo ha ragione', () => {
    // La dimostrazione che il controllo saprebbe trovare un difetto. Il
    // vecchio `addGiorni` parte da mezzanotte ESATTA a Greenwich: basta che il
    // passaggio all'ora legale — quello che porta l'orologio avanti, in
    // qualunque paese — capiti dentro l'intervallo, e l'istante scivola
    // indietro di un'ora, cioè al giorno UTC precedente. Da lì in avanti
    // sbaglia tutto. Il passaggio inverso lo sposta in avanti di un'ora e
    // resta dentro lo stesso giorno: per questo il difetto si vede una volta
    // l'anno sola, e in primavera.
    const vecchioAddGiorni = (dataIso, n) => {
      const d = new Date(dataIso); d.setDate(d.getDate() + n)
      return d.toISOString().slice(0, 10)
    }
    // Il giorno in cui l'orologio di QUESTA macchina va avanti, cercato sui
    // dati veri: in Italia il 29 marzo, in Nuova Zelanda il 27 settembre, in
    // California l'8 marzo. In UTC non esiste, e allora non c'è niente da
    // dimostrare.
    let avanti = null
    for (let m = 0; m < 12 && !avanti; m++) {
      for (let g = 1; g <= 31; g++) {
        const a = new Date(2026, m, g)
        if (a.getDate() !== g) break
        const b = new Date(2026, m, g + 1)
        if ((b.getTime() - a.getTime()) / 3600000 < 24) {
          avanti = `${2026}-${String(m + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`
          break
        }
      }
    }
    if (!avanti) {
      expect(vecchioAddGiorni('2026-03-23', 7)).toBe('2026-03-30')
      return
    }
    const base = aggiungiGiorni(avanti, -6)
    expect(vecchioAddGiorni(base, 7)).toBe(aggiungiGiorni(base, 6))   // un giorno indietro
    expect(vecchioAddGiorni(base, 20)).toBe(aggiungiGiorni(base, 19)) // e non si riprende più
    // Il parser, invece, dà le date giuste comunque.
    const out = parseFoglioInventario(foglio(4), base)
    expect(out.righe.map(r => r.data)[7]).toBe(aggiungiGiorni(base, 7))
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('il pannello interno conta i giorni a Roma', () => {
  const ADMIN = leggi('api', 'admin.js')

  it('«oggi», «il primo del mese» e «fra sette giorni» non passano da toISOString', () => {
    const v = vive(ADMIN)
    expect(v).toMatch(/const todayIso = giornoItaliano\(\)/)
    expect(v).toMatch(/const isoMonthDate = primoGiornoDelMese\(/)
    expect(v).toMatch(/const next7gg = aggiungiGiorni\(todayIso, 7\)/)
    expect(v).toMatch(/const sinceDate = giorniFaItaliano\(days\)/)
    // Nessuna colonna-giorno confrontata col giorno di Greenwich.
    expect(v).not.toMatch(/todayIso = new Date\(\)\.toISOString\(\)/)
    expect(v).not.toMatch(/next7gg = new Date\(Date\.now\(\)/)
  })

  it('«fra sette giorni» sono sette giorni anche a cavallo del cambio ora', () => {
    // Con 7 × 86.400.000 millisecondi, partendo dal 22 ottobre si arriva al
    // 28 invece che al 29: una fattura in scadenza il 29 non compariva fra
    // quelle «in scadenza questa settimana».
    expect(aggiungiGiorni('2026-10-22', 7)).toBe('2026-10-29')
    expect(aggiungiGiorni('2026-03-26', 7)).toBe('2026-04-02')
  })

  it('il primo del mese è il primo, anche chiesto all’una di notte', () => {
    // Le 00:30 italiane del 1° ottobre sono ancora il 30 settembre a
    // Greenwich: il «fatturato del mese» ripartiva da settembre.
    const mezzanotteEMezza = new Date('2026-09-30T22:30:00Z')
    expect(giornoItaliano(mezzanotteEMezza)).toBe('2026-10-01')
    expect(primoGiornoDelMese(giornoItaliano(mezzanotteEMezza))).toBe('2026-10-01')
  })

  it('«ultimi N giorni» del costo AI sono N giorni di calendario', () => {
    const oggi = giornoItaliano(new Date('2026-11-10T12:00:00Z'))
    expect(differenzaGiorni(giorniFaItaliano(30, new Date('2026-11-10T12:00:00Z')), oggi)).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('il prezzo ingrediente «da oggi» vale da mezzanotte', () => {
  const DASH = leggi('src', 'Dashboard.jsx')

  // La regola, rifatta com'è nel codice: due GIORNI a confronto, non un
  // giorno contro un istante.
  const eFuturo = (decorreDa, oggi) => (decorreDa ? soloData(decorreDa) : oggi) > oggi

  it('messo per oggi, entra in vigore subito', () => {
    expect(eFuturo('2026-09-16', '2026-09-16')).toBe(false)
    expect(eFuturo(null, '2026-09-16')).toBe(false)
  })

  it('messo per domani, resta programmato', () => {
    expect(eFuturo('2026-09-17', '2026-09-16')).toBe(true)
  })

  it('messo per ieri, è già in vigore', () => {
    expect(eFuturo('2026-09-15', '2026-09-16')).toBe(false)
  })

  it('il conto vecchio lo dava futuro per le prime due ore — il difetto', () => {
    // `new Date('2026-09-16')` è mezzanotte a Greenwich, cioè le 02:00
    // italiane. All'una di notte del 16, un prezzo «da oggi» risultava futuro:
    // restava programmato, e il food cost delle prime lavorazioni girava
    // ancora sul prezzo vecchio.
    const adesso = new Date('2026-09-15T23:00:00Z') // 01:00 a Torino del 16
    expect(new Date('2026-09-16') > adesso).toBe(true)      // com'era: futuro
    expect(eFuturo('2026-09-16', '2026-09-16')).toBe(false) // com'è: in vigore
  })

  it('e il codice confronta giorni, non istanti', () => {
    const v = vive(DASH)
    expect(v).toMatch(/const giornoDecorrenza = decorreDa \? soloData\(decorreDa\) : oggi/)
    expect(v).toMatch(/const isFuture = giornoDecorrenza > oggi/)
    expect(v).toMatch(/e\?\.decorre_da && soloData\(e\.decorre_da\) <= oggi/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('il filtro «ultimo trimestre» delle vendite B2B', () => {
  const VB2B = leggi('src', 'views', 'VenditeB2BView.jsx')

  it('il novantesimo giorno è dentro, il novantunesimo è fuori', () => {
    const oggi = '2026-09-16'
    expect(differenzaGiorni(aggiungiGiorni(oggi, -90), oggi)).toBe(90)
    expect(differenzaGiorni(aggiungiGiorni(oggi, -91), oggi)).toBe(91)
  })

  it('il bordo non si sposta attraversando il cambio ora', () => {
    // Novanta giorni indietro dal 5 gennaio passano sopra il 25 ottobre.
    const oggi = '2027-01-05'
    expect(differenzaGiorni(aggiungiGiorni(oggi, -90), oggi)).toBe(90)
    expect(aggiungiGiorni(oggi, -90)).toBe('2026-10-07')
  })

  it('una data che non c’è non entra nel trimestre per sbaglio', () => {
    expect(Number.isFinite(differenzaGiorni('', '2026-09-16'))).toBe(false)
    expect(Number.isFinite(differenzaGiorni('boh', '2026-09-16'))).toBe(false)
  })

  it('e il codice non mescola più mezzanotte UTC con mezzogiorno locale', () => {
    const v = vive(VB2B)
    expect(v).toMatch(/const giorni = differenzaGiorni\(v\.data \|\| '', oggi\)/)
    expect(v).not.toMatch(/new Date\(todayLocal\(\)\)/)
    expect(v).not.toMatch(/\(oggi - d\) \/ 86400000/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('il piè di pagina dei PDF dice l’ora dell’orologio del titolare', () => {
  const PDF = leggi('src', 'lib', 'exportPDF.js')

  it('non è più l’ora di Greenwich', () => {
    const v = vive(PDF)
    expect(v).toMatch(/const ora = new Date\(\)/)
    expect(v).toMatch(/formatLocalDate\(ora\)/)
    expect(v).not.toMatch(/new Date\(\)\.toISOString\(\)\.replace\('T', ' '\)/)
  })

  it('la forma resta AAAA-MM-GG hh:mm:ss e legge l’orologio di chi esporta', () => {
    // Si ricostruisce la stessa formula del file: quello che conta è che
    // l'orario venga dai campi locali. `new Date(2026, 6, 15, 15, 30, 9)` è
    // «le 15:30:09 di questo orologio», dovunque giri il test.
    const ora = new Date(2026, 6, 15, 15, 30, 9)
    const due = (n) => String(n).padStart(2, '0')
    const ts = `${ora.getFullYear()}-${due(ora.getMonth() + 1)}-${due(ora.getDate())} ${due(ora.getHours())}:${due(ora.getMinutes())}:${due(ora.getSeconds())}`
    expect(ts).toBe('2026-07-15 15:30:09')

    // E il contrasto col conto vecchio. Vale solo se la macchina NON è a
    // Greenwich: lì le due scritture coincidono e non c'è niente da
    // dimostrare — ed è proprio per questo che il difetto è campato tanto,
    // su un server che gira in UTC. La riga qui sotto è la stessa trappola
    // raccontata in `fusoOrarioDeiTest.test.js`: se la si scrive senza
    // guardia, passa a Roma e cade in CI.
    const vecchio = ora.toISOString().replace('T', ' ').slice(0, 19)
    if (ora.getTimezoneOffset() !== 0) expect(vecchio).not.toBe(ts)
    else expect(vecchio).toBe(ts)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('quello che c’è intorno: gli attrezzi non si contraddicono', () => {
  it('«oggi» italiano NON segue l’orologio della macchina', () => {
    // È la proprietà che conta, e si prova senza girare in tondo: per un
    // istante FISSO, il giorno a Roma è un fatto, e deve venire lo stesso da
    // Torino, da Greenwich, da Auckland e da Los Angeles. Se `giornoItaliano`
    // seguisse l'orologio della macchina, su Vercel tornerebbe a dire
    // Greenwich — cioè il difetto da cui è nato tutto questo file.
    expect(giornoItaliano(new Date('2026-09-16T22:30:00Z'))).toBe('2026-09-17') // 00:30 a Torino, d'estate
    expect(giornoItaliano(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16') // 00:30 a Torino, d'inverno
    expect(giornoItaliano(new Date('2026-09-16T21:30:00Z'))).toBe('2026-09-16') // 23:30 a Torino

    // `todayLocal()`, invece, l'orologio della macchina lo segue apposta: è
    // il giorno di chi guarda il browser. I due possono non coincidere, e
    // non è un difetto — è la differenza fra «il giorno del server» e «il
    // giorno del negozio».
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(giornoItaliano()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Math.abs(differenzaGiorni(todayLocal(), giornoItaliano()))).toBeLessThanOrEqual(1)
  })

  it('un GIORNO già scritto non viene toccato, un ISTANTE viene portato a Roma', () => {
    expect(giornoItalianoDi('2026-10-16')).toBe('2026-10-16')
    expect(giornoItalianoDi('2026-10-15T22:30:00Z')).toBe('2026-10-16')
    expect(giornoItalianoDi('')).toBe('')
    expect(giornoItalianoDi('non è una data')).toBe('')
  })

  it('i giorni si confrontano come stringhe, e l’ordine è quello giusto', () => {
    expect('2026-09-16' > '2026-09-15').toBe(true)
    expect('2026-10-01' > '2026-09-30').toBe(true)
    expect('2027-01-01' > '2026-12-31').toBe(true)
  })
})
