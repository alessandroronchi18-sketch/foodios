// ── In quale sede va la merce della bolla ────────────────────────────────
//
// Il difetto, raccontato in `ANALISI_PRODOTTO.md`: le bolle finivano tutte
// nella sede che per caso era attiva quando qualcuno premeva il tasto. Con
// tre negozi — Carlina, Berthollet, De Gasperi — vuol dire che due giacenze
// su tre smettono di voler dire qualcosa, e il food cost con loro.
//
// Eppure la destinazione **è scritta sul documento**. Tutti i casi qui sotto
// sono copiati dal blocco «Destinazione merce» / «Destinazione» /
// «DESTINAZIONE DIVERSA» delle 32 bolle vere del design partner, lette il
// 22/09/2026. Nessuno è inventato:
//
//   CARLINA21 - MARA DEI BOSCHI, PIAZZA CARLO EMANUELE II, 21, 10123 TORINO
//   MARA DEI BOSCHI CIOCCOLATERIA, PZA CARLO EMANUELE II N.21, 10100 TORINO
//   CARLINA 21 SRL, VIA PALMIERI 29, 10138 TORINO   (e sotto: P.ZZA CARLINA)
//   MARAMA SRL, C: VIA BERTHOLLET, 30 H CAP. 10125 (TO)
//   MARAMA SRL, C: C.SO DE GASPERI, 20 (TO)
//   CARLINA 21 S.r.l., Corso Re Umberto, 2, 10121 TORINO      (sede legale)
//   MARAMA S.R.L., CORSO DUCA DEGLI ABRUZZI, 6, 10128 TORINO  (sede legale)
//
// Le regole le ha dettate il titolare il 22/09/2026:
//   «Carlina21 vuol dire nella sede Carlina»
//   «Marama vuol dire o Berthollet o De Gasperi»
//   «la cioccolateria è sempre Carlina ma è un altro business»
//
// La seconda è quella che questo file protegge davvero: quando sul documento
// c'è solo «MARAMA S.R.L.» e l'indirizzo della sede legale, la risposta
// giusta è **non saperlo**. Una sede scelta a caso sbaglia metà delle volte,
// e nessuno se ne accorge mai.
import { describe, it, expect } from 'vitest'
import {
  chiaveIndirizzo, indirizzoDaChiave, ragioneSocialeDa, chiaveRegola,
  regoleDiPartenza, sedeDaDestinazione, imparaRegola,
} from '../../src/lib/destinazioneSede.js'

// Gli id sono quelli veri dell'organizzazione di Mara (li ha misurati
// l'agente magazzino il 16/09/2026): Carlina e0d3370b, Berthollet af9f2192,
// De Gasperi bbb7554e.
const CARLINA = 'e0d3370b'
const BERTHOLLET = 'af9f2192'
const GASPERI = 'bbb7554e'

// La forma vera della riga `sedi`, verificata su
// `supabase/migrations/20260909_baseline_tabelle_core.sql`: `indirizzo` è
// NULLABLE, e per questo qui ci sono due elenchi — uno con gli indirizzi
// compilati e uno senza.
const CON_INDIRIZZO = [
  { id: CARLINA, nome: 'Carlina', indirizzo: 'Piazza Carlo Emanuele II, 21' },
  { id: BERTHOLLET, nome: 'Berthollet', indirizzo: 'Via Berthollet 30/H' },
  { id: GASPERI, nome: 'De Gasperi', indirizzo: 'Corso De Gasperi 20' },
]
const SENZA_INDIRIZZO = CON_INDIRIZZO.map(s => ({ id: s.id, nome: s.nome }))

// Le regole del titolare, come le scriverebbe in Impostazioni.
const REGOLE_TITOLARE = {
  ...regoleDiPartenza(SENZA_INDIRIZZO),
  ragioniSociali: {
    carlina21: [CARLINA],
    'mara dei boschi cioccolateria': [CARLINA],
    marama: [BERTHOLLET, GASPERI],
  },
}

const D = {
  carlina21: 'CARLINA21 - MARA DEI BOSCHI, PIAZZA CARLO EMANUELE II, 21, 10123 TORINO',
  cioccolateria: 'MARA DEI BOSCHI CIOCCOLATERIA, PZA CARLO EMANUELE II N.21, 10100 TORINO',
  palmieri: 'CARLINA 21 SRL, VIA PALMIERI 29, 10138 TORINO\nP.ZZA CARLINA',
  berthollet: 'MARAMA SRL, C: VIA BERTHOLLET, 30 H CAP. 10125 (TO)',
  gasperi: 'MARAMA SRL, C: C.SO DE GASPERI, 20 (TO)',
  legaleCarlina: 'CARLINA 21 S.r.l., Corso Re Umberto, 2, 10121 TORINO',
  legaleMarama: 'MARAMA S.R.L., CORSO DUCA DEGLI ABRUZZI, 6, 10128 TORINO',
}

describe('La chiave dell’indirizzo fa combaciare le scritture diverse', () => {
  it('«PZA CARLO EMANUELE II N.21» è «Piazza Carlo Emanuele II, 21»', () => {
    // È il caso che ha fatto nascere la funzione: la stessa piazza, scritta
    // da due fornitori diversi, non si somiglia per niente come stringa.
    expect(chiaveIndirizzo('PZA CARLO EMANUELE II N.21'))
      .toBe(chiaveIndirizzo('Piazza Carlo Emanuele II, 21'))
    expect(chiaveIndirizzo('PZA CARLO EMANUELE II N.21')).toBe('piazza carlo emanuele ii 21')
  })

  it('scioglie le abbreviazioni lette sulle bolle', () => {
    expect(chiaveIndirizzo('C.SO DE GASPERI, 20')).toBe('corso de gasperi 20')
    expect(chiaveIndirizzo('P.ZZA CARLINA')).toBe('piazza carlina')
    expect(chiaveIndirizzo('P.ZA CASTELLO 5')).toBe('piazza castello 5')
    expect(chiaveIndirizzo('V.le Regina Margherita 12')).toBe('viale regina margherita 12')
  })

  it('butta via il CAP, che non è un numero civico', () => {
    expect(chiaveIndirizzo('VIA BERTHOLLET, 30 H CAP. 10125 (TO)')).toBe('via berthollet 30 h to')
    expect(chiaveIndirizzo('PIAZZA CARLO EMANUELE II, 21, 10123 TORINO'))
      .toBe('piazza carlo emanuele ii 21 torino')
  })

  it('il civico con la lettera si scrive in tre modi e vale uno solo', () => {
    // `sedi.indirizzo` lo scrive a modo suo, il fornitore a modo suo. Senza
    // questa riga Berthollet non si aggancia mai.
    const atteso = 'via berthollet 30 h'
    expect(chiaveIndirizzo('Via Berthollet 30/H')).toBe(atteso)
    expect(chiaveIndirizzo('Via Berthollet, 30H')).toBe(atteso)
    expect(chiaveIndirizzo('VIA BERTHOLLET, 30 H')).toBe(atteso)
  })

  it('e non si spaventa di accenti, maiuscole e punteggiatura', () => {
    expect(chiaveIndirizzo('  Località  SANT’ANNA, 3  ')).toBe('localita sant anna 3')
    expect(chiaveIndirizzo('Via Cernaia 12/à')).toBe('via cernaia 12 a')
  })

  it('«S.R.L.» non diventa tre parole da una lettera', () => {
    // Senza questo, ogni chiave si riempie di «s r l» e i confronti saltano.
    expect(chiaveIndirizzo('MARAMA S.R.L.')).toBe('marama srl')
    expect(chiaveIndirizzo('CARLINA 21 S.r.l.')).toBe('carlina 21 srl')
  })

  it('su un testo vuoto o storto torna stringa vuota, non esplode', () => {
    for (const v of [null, undefined, '', '   ', 123, {}, []]) {
      expect(() => chiaveIndirizzo(v)).not.toThrow()
    }
    expect(chiaveIndirizzo(null)).toBe('')
    expect(chiaveIndirizzo('   ')).toBe('')
  })
})

describe('Dal blocco destinazione si ritagliano le due cose che contano', () => {
  it('l’indirizzo, senza la ragione sociale davanti né la città dietro', () => {
    expect(indirizzoDaChiave(chiaveIndirizzo(D.carlina21))).toBe('piazza carlo emanuele ii 21')
    expect(indirizzoDaChiave(chiaveIndirizzo(D.berthollet))).toBe('via berthollet 30 h')
    expect(indirizzoDaChiave(chiaveIndirizzo(D.legaleMarama))).toBe('corso duca degli abruzzi 6')
  })

  it('e se una strada non c’è, non se ne inventa una', () => {
    expect(indirizzoDaChiave(chiaveIndirizzo('MARAMA SRL'))).toBe(null)
    expect(indirizzoDaChiave('')).toBe(null)
  })

  it('la ragione sociale, senza la forma societaria in coda', () => {
    expect(ragioneSocialeDa(D.carlina21)).toBe('carlina21')
    expect(ragioneSocialeDa(D.cioccolateria)).toBe('mara dei boschi cioccolateria')
    expect(ragioneSocialeDa(D.palmieri)).toBe('carlina 21')
    expect(ragioneSocialeDa(D.berthollet)).toBe('marama')
    expect(ragioneSocialeDa(D.legaleMarama)).toBe('marama')
    expect(ragioneSocialeDa(D.legaleCarlina)).toBe('carlina 21')
  })
})

describe('Le regole di partenza si costruiscono con quello che c’è, e basta', () => {
  it('un alias per ogni nome di sede e un indirizzo per chi ce l’ha', () => {
    const r = regoleDiPartenza(CON_INDIRIZZO)
    expect(r.alias).toEqual({ carlina: CARLINA, berthollet: BERTHOLLET, 'de gasperi': GASPERI })
    expect(r.indirizzi).toEqual({
      'piazza carlo emanuele ii 21': CARLINA,
      'via berthollet 30 h': BERTHOLLET,
      'corso de gasperi 20': GASPERI,
    })
  })

  it('nessuna ragione sociale inventata: quelle le sa il titolare, non il database', () => {
    // Che «Marama» voglia dire Berthollet o De Gasperi non sta scritto da
    // nessuna parte nella tabella `sedi`. Dedurlo sarebbe inventare.
    expect(regoleDiPartenza(CON_INDIRIZZO).ragioniSociali).toEqual({})
    expect(regoleDiPartenza(CON_INDIRIZZO).imparate).toEqual({})
  })

  it('una sede senza indirizzo non mette niente fra gli indirizzi', () => {
    expect(regoleDiPartenza(SENZA_INDIRIZZO).indirizzi).toEqual({})
  })

  it('due sedi allo stesso indirizzo restano due, non si sovrascrivono', () => {
    // Difetto trovato dalle prove il 22/09/2026: le regole erano «chiave →
    // un id», e la seconda sede cancellava la prima. Vinceva l'ultima, in
    // silenzio — cioè la scelta a caso che questo file esiste per non fare.
    const doppie = [
      { id: CARLINA, nome: 'Carlina', indirizzo: 'Piazza Carlo Emanuele II, 21' },
      { id: BERTHOLLET, nome: 'Bertho', indirizzo: 'Piazza Carlo Emanuele II 21' },
    ]
    expect(regoleDiPartenza(doppie).indirizzi['piazza carlo emanuele ii 21'])
      .toEqual([CARLINA, BERTHOLLET])
  })

  it('e due sedi con lo stesso nome nemmeno', () => {
    const omonime = [
      { id: CARLINA, nome: 'Centro' },
      { id: GASPERI, nome: 'centro' },
    ]
    expect(regoleDiPartenza(omonime).alias.centro).toEqual([CARLINA, GASPERI])
  })

  it('ma una regola con un id solo resta scritta com’è: si legge a occhio', () => {
    expect(regoleDiPartenza(CON_INDIRIZZO).alias.carlina).toBe(CARLINA)
  })

  it('è un oggetto che si può salvare in user_data così com’è', () => {
    const r = regoleDiPartenza(CON_INDIRIZZO)
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })

  it('e con un elenco storto non cade', () => {
    for (const v of [null, undefined, [], [null], [{}], [{ nome: 'senza id' }]]) {
      expect(() => regoleDiPartenza(v)).not.toThrow()
    }
    expect(regoleDiPartenza([{ nome: 'senza id' }]).alias).toEqual({})
  })
})

describe('Con gli indirizzi in anagrafica, la sede si legge dall’indirizzo', () => {
  const dove = (t) => sedeDaDestinazione(t, CON_INDIRIZZO)

  it('CARLINA21 in Piazza Carlo Emanuele II 21 → Carlina', () => {
    const e = dove(D.carlina21)
    expect(e.sedeId).toBe(CARLINA)
    expect(e.sedeNome).toBe('Carlina')
    expect(e.come).toBe('indirizzo')
    expect(e.sicura).toBe(true)
    expect(e.alternative).toEqual([])
  })

  it('la cioccolateria è un altro business, ma la stessa sede', () => {
    // Regola del titolare: «la cioccolateria è sempre Carlina ma è un altro
    // business». Qui l'indirizzo lo dice da solo, anche scritto «PZA … N.21».
    const e = dove(D.cioccolateria)
    expect(e.sedeId).toBe(CARLINA)
    expect(e.come).toBe('indirizzo')
    expect(e.sicura).toBe(true)
  })

  it('MARAMA in Via Berthollet 30 H → Berthollet, non un Marama qualunque', () => {
    // È il punto dove l'ordine conta: la ragione sociale «Marama» è ambigua,
    // l'indirizzo no. Vince l'indirizzo.
    const e = dove(D.berthollet)
    expect(e.sedeId).toBe(BERTHOLLET)
    expect(e.come).toBe('indirizzo')
    expect(e.sicura).toBe(true)
  })

  it('MARAMA in C.SO DE GASPERI 20 → De Gasperi', () => {
    const e = dove(D.gasperi)
    expect(e.sedeId).toBe(GASPERI)
    expect(e.come).toBe('indirizzo')
    expect(e.sicura).toBe(true)
  })

  it('Via Palmieri 29 non è un negozio, ma «CARLINA» sì → Carlina per il nome', () => {
    const e = dove(D.palmieri)
    expect(e.sedeId).toBe(CARLINA)
    expect(e.come).toBe('alias')
    expect(e.sicura).toBe(true)
  })

  it('la sede legale di Carlina21 in Corso Re Umberto 2 → Carlina lo stesso', () => {
    // «Carlina21 vuol dire nella sede Carlina»: l'indirizzo è un ufficio, ma
    // la ragione sociale non lascia dubbi.
    const e = dove(D.legaleCarlina)
    expect(e.sedeId).toBe(CARLINA)
    expect(e.come).toBe('alias')
    expect(e.sicura).toBe(true)
  })
})

describe('La sede legale di Marama non si sceglie: si chiede', () => {
  it('senza nessuna regola, dice che non lo sa e mette tutte le sedi a scelta', () => {
    const e = sedeDaDestinazione(D.legaleMarama, CON_INDIRIZZO)
    expect(e.sedeId).toBe(null)
    expect(e.sicura).toBe(false)
    expect(e.alternative.map(a => a.nome)).toEqual(['Carlina', 'Berthollet', 'De Gasperi'])
    expect(e.motivo).toMatch(/dimmi tu/)
  })

  it('con la regola del titolare restano due sedi, e sono quelle giuste', () => {
    // «Marama vuol dire o Berthollet o De Gasperi».
    const e = sedeDaDestinazione(D.legaleMarama, SENZA_INDIRIZZO, REGOLE_TITOLARE)
    expect(e.sedeId).toBe(null)
    expect(e.come).toBe('ragione-sociale')
    expect(e.sicura).toBe(false)
    expect(e.alternative.map(a => a.nome)).toEqual(['Berthollet', 'De Gasperi'])
    expect(e.motivo).toMatch(/Berthollet o De Gasperi/)
  })

  it('e NON sceglie la prima, né la sede di default', () => {
    // È il difetto da cui siamo partiti, scritto meglio: una sede di ripiego.
    const e = sedeDaDestinazione(D.legaleMarama, SENZA_INDIRIZZO, REGOLE_TITOLARE)
    expect(e.sedeId).not.toBe(BERTHOLLET)
    expect(e.sedeId).not.toBe(GASPERI)
    expect(e.sedeId).not.toBe(CARLINA)
  })

  it('una ragione sociale che vale per una sede sola invece è sicura', () => {
    const e = sedeDaDestinazione(D.cioccolateria, SENZA_INDIRIZZO, REGOLE_TITOLARE)
    expect(e.sedeId).toBe(CARLINA)
    expect(e.come).toBe('ragione-sociale')
    expect(e.sicura).toBe(true)
  })
})

describe('Senza gli indirizzi in anagrafica si va avanti lo stesso, ma si sa meno', () => {
  // `sedi.indirizzo` è NULLABLE e nei dati veri spesso è vuoto: è la
  // differenza fra cinque destinazioni riconosciute e sette.
  const dove = (t) => sedeDaDestinazione(t, SENZA_INDIRIZZO)

  it('il nome della sede scritto nel testo basta: «C.SO DE GASPERI»', () => {
    expect(dove(D.gasperi).sedeId).toBe(GASPERI)
    expect(dove(D.gasperi).come).toBe('alias')
    expect(dove(D.berthollet).sedeId).toBe(BERTHOLLET)
  })

  it('«CARLINA21» attaccato al numero conta come «Carlina»', () => {
    expect(dove(D.carlina21).sedeId).toBe(CARLINA)
    expect(dove(D.carlina21).come).toBe('alias')
  })

  it('ma la cioccolateria non si aggancia più, e lo dice invece di tirare a indovinare', () => {
    // Nel suo blocco destinazione la parola «Carlina» non compare: senza
    // l'indirizzo in anagrafica il programma non può saperlo, e lo ammette.
    const e = dove(D.cioccolateria)
    expect(e.sedeId).toBe(null)
    expect(e.sicura).toBe(false)
    expect(e.alternative.length).toBe(3)
  })

  it('un nome di sede dentro un’altra parola non aggancia', () => {
    const e = sedeDaDestinazione('VIA SCARLINA 4, 10100 TORINO', SENZA_INDIRIZZO)
    expect(e.sedeId).toBe(null)
  })
})

describe('La risposta data una volta non si chiede due', () => {
  it('imparata la sede legale di Marama, la volta dopo è sicura', () => {
    const prima = sedeDaDestinazione(D.legaleMarama, SENZA_INDIRIZZO, REGOLE_TITOLARE)
    expect(prima.sicura).toBe(false)

    const dopo = imparaRegola(REGOLE_TITOLARE, { testo: D.legaleMarama, sedeId: BERTHOLLET })
    const poi = sedeDaDestinazione(D.legaleMarama, SENZA_INDIRIZZO, dopo)
    expect(poi.sedeId).toBe(BERTHOLLET)
    expect(poi.sicura).toBe(true)
    expect(poi.motivo).toMatch(/l’hai già assegnata tu/)
  })

  it('e vale anche se il fornitore la riscrive in un altro modo', () => {
    // Stesso posto, stampato diverso: «S.R.L.» invece di «SRL», «C.SO»
    // invece di «CORSO», il CAP attaccato. La chiave è la stessa.
    const dopo = imparaRegola(REGOLE_TITOLARE, { testo: D.legaleMarama, sedeId: BERTHOLLET })
    const altra = 'MARAMA SRL, C.SO DUCA DEGLI ABRUZZI, 6 10128 TORINO'
    expect(sedeDaDestinazione(altra, SENZA_INDIRIZZO, dopo).sedeId).toBe(BERTHOLLET)
  })

  it('ma NON generalizza: un altro Marama resta da chiedere', () => {
    // «Marama in Corso Duca degli Abruzzi 6 è Berthollet» non vuol dire che
    // ogni Marama sia Berthollet. Generalizzare qui è il modo di ricominciare
    // a sbagliare in silenzio.
    const dopo = imparaRegola(REGOLE_TITOLARE, { testo: D.legaleMarama, sedeId: BERTHOLLET })
    const altroPosto = 'MARAMA S.R.L., VIA SACCHI, 42, 10128 TORINO'
    const e = sedeDaDestinazione(altroPosto, SENZA_INDIRIZZO, dopo)
    expect(e.sedeId).toBe(null)
    expect(e.sicura).toBe(false)
    expect(e.alternative.map(a => a.nome)).toEqual(['Berthollet', 'De Gasperi'])
  })

  it('la chiave è ragione sociale + indirizzo, come ha chiesto il titolare', () => {
    expect(chiaveRegola(D.legaleMarama)).toBe('marama|corso duca degli abruzzi 6')
    expect(chiaveRegola(D.gasperi)).toBe('marama|corso de gasperi 20')
    expect(chiaveRegola(D.carlina21)).toBe('carlina21|piazza carlo emanuele ii 21')
  })

  it('non tocca le regole che gli passi: ne torna di nuove', () => {
    const dopo = imparaRegola(REGOLE_TITOLARE, { testo: D.legaleMarama, sedeId: BERTHOLLET })
    expect(REGOLE_TITOLARE.imparate).toEqual({})
    expect(dopo).not.toBe(REGOLE_TITOLARE)
    expect(JSON.parse(JSON.stringify(dopo))).toEqual(dopo)
  })

  it('e se non c’è niente da imparare, lascia tutto com’era', () => {
    expect(imparaRegola(REGOLE_TITOLARE, { testo: '', sedeId: BERTHOLLET })).toBe(REGOLE_TITOLARE)
    expect(imparaRegola(REGOLE_TITOLARE, { testo: D.legaleMarama, sedeId: null })).toBe(REGOLE_TITOLARE)
    expect(() => imparaRegola(null, {})).not.toThrow()
    expect(() => imparaRegola(REGOLE_TITOLARE)).not.toThrow()
  })
})

describe('I casi di contorno', () => {
  it('nessuna destinazione scritta: non si sceglie, si chiede', () => {
    const e = sedeDaDestinazione('', CON_INDIRIZZO)
    expect(e.sedeId).toBe(null)
    expect(e.sicura).toBe(false)
    expect(e.motivo).toMatch(/nessuna destinazione/)
  })

  it('una sede sola non è una scelta: è l’unica che c’è', () => {
    const una = [{ id: CARLINA, nome: 'Carlina' }]
    expect(sedeDaDestinazione('', una).sedeId).toBe(CARLINA)
    expect(sedeDaDestinazione('', una).sicura).toBe(true)
    expect(sedeDaDestinazione('QUALUNQUE COSA, VIA IGNOTA 9', una).sedeId).toBe(CARLINA)
  })

  it('senza elenco sedi non inventa un id', () => {
    const e = sedeDaDestinazione(D.carlina21, [])
    expect(e.sedeId).toBe(null)
    expect(e.alternative).toEqual([])
  })

  it('una regola che punta a una sede cancellata viene ignorata', () => {
    const r = { ...REGOLE_TITOLARE, imparate: { [chiaveRegola(D.legaleMarama)]: 'sede-che-non-esiste-piu' } }
    const e = sedeDaDestinazione(D.legaleMarama, SENZA_INDIRIZZO, r)
    expect(e.sedeId).toBe(null)
    expect(e.alternative.map(a => a.nome)).toEqual(['Berthollet', 'De Gasperi'])
  })

  it('se due sedi dichiarano lo stesso indirizzo, chiede invece di tirare a sorte', () => {
    const doppie = [
      { id: CARLINA, nome: 'Carlina', indirizzo: 'Piazza Carlo Emanuele II, 21' },
      { id: BERTHOLLET, nome: 'Bertho', indirizzo: 'Piazza Carlo Emanuele II 21' },
    ]
    const e = sedeDaDestinazione(D.carlina21, doppie)
    expect(e.sedeId).toBe(null)
    expect(e.sicura).toBe(false)
    expect(e.alternative.length).toBe(2)
  })

  it('due sedi con lo stesso nome: chiede anche loro', () => {
    const omonime = [{ id: CARLINA, nome: 'Centro' }, { id: GASPERI, nome: 'Centro' }]
    const e = sedeDaDestinazione('NEGOZIO CENTRO, VIA ROMA 1', omonime)
    expect(e.sedeId).toBe(null)
    expect(e.come).toBe('alias')
    expect(e.alternative.length).toBe(2)
  })

  it('una regola scritta a mano con un id solo vale quanto una con l’elenco', () => {
    const conStringa = { ...regoleDiPartenza(SENZA_INDIRIZZO), ragioniSociali: { marama: BERTHOLLET } }
    expect(sedeDaDestinazione(D.legaleMarama, SENZA_INDIRIZZO, conStringa).sedeId).toBe(BERTHOLLET)
  })

  it('e con qualunque porcheria in ingresso non cade', () => {
    for (const t of [null, undefined, 0, {}, [], '   ', 'aaaa'.repeat(500)]) {
      expect(() => sedeDaDestinazione(t, CON_INDIRIZZO, REGOLE_TITOLARE)).not.toThrow()
    }
    for (const s of [null, undefined, 'non un array', [null, undefined]]) {
      expect(() => sedeDaDestinazione(D.carlina21, s)).not.toThrow()
    }
    for (const r of [null, 'stringa', 42, { alias: null, indirizzi: null }]) {
      expect(() => sedeDaDestinazione(D.carlina21, CON_INDIRIZZO, r)).not.toThrow()
    }
  })

  it('una regola con caratteri da espressione regolare non fa saltare niente', () => {
    const r = { ...regoleDiPartenza(SENZA_INDIRIZZO), ragioniSociali: { 'a(b|c[': [CARLINA] } }
    expect(() => sedeDaDestinazione(D.carlina21, SENZA_INDIRIZZO, r)).not.toThrow()
  })
})

describe('Il righello di questo file', () => {
  // Le prove qui sopra sarebbero tutte verdi anche con una funzione rotta in
  // tre modi diversi. Queste quattro dimostrano che se ne accorgerebbero.
  const tutte = Object.values(D).map(t => sedeDaDestinazione(t, CON_INDIRIZZO))

  it('una funzione che risponde sempre la stessa sede sarebbe bocciata', () => {
    const risposte = new Set(tutte.map(e => e.sedeId))
    expect(risposte.size).toBeGreaterThanOrEqual(3)
    expect(risposte.has(CARLINA)).toBe(true)
    expect(risposte.has(BERTHOLLET)).toBe(true)
    expect(risposte.has(GASPERI)).toBe(true)
  })

  it('una funzione che dice sempre «non lo so» sarebbe bocciata', () => {
    expect(tutte.filter(e => e.sicura).length).toBe(6)
  })

  it('una funzione che dice sempre «sono sicuro» sarebbe bocciata', () => {
    expect(tutte.filter(e => !e.sicura).length).toBe(1)
  })

  it('una chiave che restituisce il testo com’è sarebbe bocciata', () => {
    // Se `chiaveIndirizzo` smettesse di normalizzare, le due scritture della
    // stessa piazza tornerebbero diverse e nient'altro se ne accorgerebbe.
    const a = 'PZA CARLO EMANUELE II N.21'
    expect(chiaveIndirizzo(a)).not.toBe(a)
    expect(chiaveIndirizzo(a)).toBe(chiaveIndirizzo('Piazza Carlo Emanuele II, 21'))
  })
})
