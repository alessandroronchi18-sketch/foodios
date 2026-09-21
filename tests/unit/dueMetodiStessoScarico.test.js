// ── I due metodi devono togliere dal magazzino le stesse cose ────────────
//
// Foodos registra la produzione in due modi, e si sceglie dalle impostazioni:
//
//   • il **metodo diretto** (`ProduzioneGiornalieraView`): quanti stampi di
//     cosa si sono fatti oggi;
//   • il **metodo differenziale** (`InventarioSettimanaleView`): si conta
//     quello che c'è in vetrina, e la produzione è la differenza.
//
// Sono due modi di scrivere la stessa cosa. Quello che esce dal magazzino
// deve essere identico: è lo stesso gelato, fatto con gli stessi ingredienti.
//
// ── L'audit del 21/09/2026, con i numeri ────────────────────────────────
//
// Non era identico. `scaloMagazzinoPerGusto` girava sugli ingredienti della
// ricetta **così come sono scritti**, e le mancavano tre cose che il metodo
// diretto aveva già:
//
//   1. **I semilavorati non si aprivano.** Una ricetta che contiene «pasta
//      frolla», e la pasta frolla non è una voce di magazzino perché la si fa
//      in casa: il metodo diretto scende nella sua ricetta e toglie farina,
//      burro, zucchero a velo, uovo e sale. Il differenziale cercava una voce
//      «pasta frolla», non la trovava, **e la creava** con giacenza negativa.
//      Una riga fantasma che scende per sempre, e intanto farina e burro
//      restano sullo scaffale a quota piena.
//
//      Misurato su un'azienda vera che lavora col differenziale (3 sedi,
//      inventario tenuto davvero): **3 ricette su 13**. Gli ingredienti mai
//      scalati: farina_00, burro, zucchero_velo, uovo, sale.
//
//   2. **Le chiavi non canoniche.** Il magazzino tiene i nomi come sono stati
//      scritti, e `normIng` porta i plurali al singolare. Sulla stessa
//      azienda: «noci», «uova», «mandorle», «mirtilli», «nocciole». Si
//      cercava «noce», non si trovava, e nasceva un doppione accanto a quello
//      pieno.
//
//   3. **Il silenzio.** Il metodo diretto dice a chi ha registrato quali
//      ingredienti non erano in magazzino. Il differenziale no: la giacenza
//      restava ferma e il buco si scopriva all'inventario.
//
// La correzione fa passare tutti e due dalla stessa funzione condivisa,
// `ingredientiDaScaricare`. Queste prove tengono ferma l'uguaglianza: se
// qualcuno cambia una delle due strade, diventano rosse.
import { describe, it, expect } from 'vitest'
import { scaloMagazzinoPerGusto } from '../../src/lib/inventarioProduzione'
import { ingredientiDaScaricare } from '../../src/lib/scaricoIngredienti'
import { normIng } from '../../src/lib/foodcost'

// La forma vera dei dati dell'azienda su cui è stato misurato il difetto:
// una crostata che contiene un semilavorato fatto in casa, e il semilavorato
// con dentro la roba che si compra davvero.
const RICETTARIO = {
  ingredienti_costi: {},
  ricette: {
    'CROSTATA MELE': {
      nome: 'CROSTATA MELE', tipo: 'fetta', unita: 8, prezzo: 3,
      ingredienti: [
        { nome: 'pasta frolla', qty1stampo: 500 },
        { nome: 'mele', qty1stampo: 500 },
      ],
    },
    'PASTA FROLLA': {
      nome: 'PASTA FROLLA', tipo: 'semilavorato', unita: 0, prezzo: 0,
      ingredienti: [
        { nome: 'farina_00', qty1stampo: 500 },
        { nome: 'burro', qty1stampo: 250 },
        { nome: 'zucchero_velo', qty1stampo: 150 },
        { nome: 'uovo', qty1stampo: 90 },
        { nome: 'sale', qty1stampo: 10 },
      ],
    },
  },
}

const voce = (nome, g) => ({ nome, giacenza_g: g, soglia_g: 0, ultimoRifornimento: null })

// Il magazzino vero: la pasta frolla NON c'è (la si fa), gli ingredienti sì.
const MAGAZZINO = {
  farina_00: voce('farina_00', 20000),
  burro: voce('burro', 10000),
  zucchero_velo: voce('zucchero_velo', 5000),
  uova: voce('uova', 3000),          // salvata al plurale, come nei dati veri
  sale: voce('sale', 1000),
  mele: voce('mele', 15000),
}

describe('Un semilavorato che non sta in magazzino si apre', () => {
  // 1000 g di impasto = una crostata intera. Chiediamone due: 2000 g.
  // Dentro ci sono 1000 g di pasta frolla, cioè una volta la sua ricetta
  // (che pesa 1000 g): farina 500, burro 250, zucchero a velo 150, uovo 90,
  // sale 10. E 1000 g di mele.
  const scalo = () => scaloMagazzinoPerGusto(MAGAZZINO, RICETTARIO.ricette['CROSTATA MELE'], 2000, RICETTARIO)

  it('la farina esce davvero dal magazzino', () => {
    const { nuovoMagazzino } = scalo()
    expect(nuovoMagazzino.farina_00.giacenza_g).toBe(20000 - 500)
  })

  it('e anche burro, zucchero a velo e sale', () => {
    const { nuovoMagazzino } = scalo()
    expect(nuovoMagazzino.burro.giacenza_g).toBe(10000 - 250)
    expect(nuovoMagazzino.zucchero_velo.giacenza_g).toBe(5000 - 150)
    expect(nuovoMagazzino.sale.giacenza_g).toBe(1000 - 10)
  })

  it('e le mele, che non sono dentro nessun semilavorato', () => {
    const { nuovoMagazzino } = scalo()
    expect(nuovoMagazzino.mele.giacenza_g).toBe(15000 - 1000)
  })

  it('e NON nasce nessuna riga fantasma «pasta frolla»', () => {
    // Era il difetto: una voce nuova con giacenza negativa, che scendeva a
    // ogni crostata e non risaliva mai, mentre farina e burro restavano
    // fermi. Due bugie in una.
    const { nuovoMagazzino } = scalo()
    const chiavi = Object.keys(nuovoMagazzino)
    expect(chiavi.filter(k => /frolla/i.test(k)), 'è tornata la riga fantasma').toEqual([])
    expect(chiavi.length, 'il magazzino ha una voce in più di prima').toBe(Object.keys(MAGAZZINO).length)
  })

  it('e il magazzino di partenza non viene toccato', () => {
    // La funzione è pura: chi la chiama decide se salvare.
    scalo()
    expect(MAGAZZINO.farina_00.giacenza_g).toBe(20000)
  })
})

describe('Un ingrediente salvato col nome al plurale si ritrova', () => {
  it('«uovo» nella ricetta trova «uova» sullo scaffale', () => {
    // Sui dati veri sono cinque su trentacinque: noci, uova, mandorle,
    // mirtilli, nocciole. Prima nasceva un doppione «uovo» a zero, e la voce
    // vera restava piena.
    const { nuovoMagazzino } = scaloMagazzinoPerGusto(MAGAZZINO, RICETTARIO.ricette['CROSTATA MELE'], 2000, RICETTARIO)
    expect(nuovoMagazzino.uova.giacenza_g).toBe(3000 - 90)
    expect(nuovoMagazzino.uovo, 'è nato il doppione al singolare').toBeUndefined()
  })

  it('e la prova sta in piedi: «uova» e «uovo» sono lo stesso ingrediente', () => {
    // Taratura. Se `normIng` smettesse di portare i plurali al singolare, la
    // prova sopra passerebbe per il motivo sbagliato.
    expect(normIng('uova')).toBe(normIng('uovo'))
  })
})

describe('Quello che in magazzino non c\'è, viene detto', () => {
  it('l\'ingrediente mancante torna nell\'elenco, invece di sparire', () => {
    const magSenzaBurro = { ...MAGAZZINO }
    delete magSenzaBurro.burro
    const { nonTrovati } = scaloMagazzinoPerGusto(magSenzaBurro, RICETTARIO.ricette['CROSTATA MELE'], 2000, RICETTARIO)
    expect(nonTrovati).toContain('burro')
  })

  it('e la giacenza degli altri viene tolta lo stesso', () => {
    // La produzione è successa: quello che c'era va scalato comunque.
    const magSenzaBurro = { ...MAGAZZINO }
    delete magSenzaBurro.burro
    const { nuovoMagazzino } = scaloMagazzinoPerGusto(magSenzaBurro, RICETTARIO.ricette['CROSTATA MELE'], 2000, RICETTARIO)
    expect(nuovoMagazzino.farina_00.giacenza_g).toBe(20000 - 500)
  })

  it('quando non manca niente l\'elenco è vuoto', () => {
    const { nonTrovati } = scaloMagazzinoPerGusto(MAGAZZINO, RICETTARIO.ricette['CROSTATA MELE'], 2000, RICETTARIO)
    expect(nonTrovati).toEqual([])
  })
})

describe('Un semilavorato TENUTO in magazzino si scala com\'è', () => {
  it('se la pasta frolla sta sullo scaffale, esce quella e non la farina', () => {
    // È l'altra metà della regola, e vale per tutti e due i metodi: se uno
    // tiene il semilavorato in magazzino, è da lì che esce. Aprirlo lo stesso
    // scalerebbe due volte la stessa merce.
    const magConFrolla = { ...MAGAZZINO, 'pasta frolla': voce('pasta frolla', 4000) }
    const { nuovoMagazzino } = scaloMagazzinoPerGusto(magConFrolla, RICETTARIO.ricette['CROSTATA MELE'], 2000, RICETTARIO)
    expect(nuovoMagazzino['pasta frolla'].giacenza_g).toBe(4000 - 1000)
    expect(nuovoMagazzino.farina_00.giacenza_g, 'la farina è stata scalata due volte').toBe(20000)
  })
})

describe('I due metodi tolgono le stesse cose', () => {
  // È l'invariante che tiene insieme tutto il resto: qualunque ricetta,
  // qualunque magazzino, le due strade devono muovere le stesse voci per le
  // stesse quantità. Il metodo diretto passa da `ingredientiDaScaricare`:
  // qui si confronta il differenziale con lui.
  const casi = [
    ['una ricetta con un semilavorato non in magazzino', MAGAZZINO],
    ['la stessa con il semilavorato sullo scaffale', { ...MAGAZZINO, 'pasta frolla': voce('pasta frolla', 4000) }],
    ['un magazzino a cui manca metà roba', { farina_00: voce('farina_00', 9000), mele: voce('mele', 9000) }],
  ]
  for (const [nome, mag] of casi) {
    it(nome, () => {
      const ric = RICETTARIO.ricette['CROSTATA MELE']
      const pesoImpasto = ric.ingredienti.reduce((s, i) => s + i.qty1stampo, 0)
      const volte = 2000 / pesoImpasto
      const inMag = new Set(Object.keys(mag).map(normIng))
      const atteso = ingredientiDaScaricare(ric, volte, RICETTARIO, inMag).ings

      const { nuovoMagazzino } = scaloMagazzinoPerGusto(mag, ric, 2000, RICETTARIO)
      const tolto = {}
      for (const k of Object.keys(nuovoMagazzino)) {
        const prima = Number(mag[k]?.giacenza_g) || 0
        const dopo = Number(nuovoMagazzino[k].giacenza_g) || 0
        if (prima !== dopo) tolto[normIng(k)] = prima - dopo
      }
      // Dal confronto restano fuori gli ingredienti che in magazzino non ci
      // sono: il diretto li segnala e non li scala, il differenziale adesso
      // fa lo stesso.
      const attesoInMag = {}
      for (const [k, g] of Object.entries(atteso)) if (inMag.has(k)) attesoInMag[k] = Math.round(g)
      expect(tolto).toEqual(attesoInMag)
    })
  }
})

describe('Le correzioni al ribasso rimettono a posto la stessa roba', () => {
  it('registrare 2 kg e poi correggere a 1 kg lascia il magazzino come dopo 1 kg', () => {
    // È il motivo per cui la giacenza può andare sotto zero senza essere
    // clampata: il conto deve tornare anche al contrario.
    const ric = RICETTARIO.ricette['CROSTATA MELE']
    const dopo2 = scaloMagazzinoPerGusto(MAGAZZINO, ric, 2000, RICETTARIO).nuovoMagazzino
    const corretto = scaloMagazzinoPerGusto(dopo2, ric, -1000, RICETTARIO).nuovoMagazzino
    const diretto1 = scaloMagazzinoPerGusto(MAGAZZINO, ric, 1000, RICETTARIO).nuovoMagazzino
    for (const k of Object.keys(MAGAZZINO)) {
      expect(corretto[k].giacenza_g, `${k} non torna`).toBe(diretto1[k].giacenza_g)
    }
  })
})

describe('Il righello di questo file', () => {
  it('senza il ricettario il semilavorato non si può aprire, e si dice', () => {
    // Chi chiama deve passare il ricettario. Se se lo dimentica, il
    // semilavorato non è apribile: finisce fra i non trovati invece che in
    // una riga fantasma.
    const { nuovoMagazzino, nonTrovati } = scaloMagazzinoPerGusto(MAGAZZINO, RICETTARIO.ricette['CROSTATA MELE'], 2000, null)
    expect(Object.keys(nuovoMagazzino).filter(k => /frolla/i.test(k))).toEqual([])
    expect(nonTrovati.length).toBeGreaterThan(0)
  })

  it('e le prove guardano un magazzino vero, non uno vuoto', () => {
    expect(Object.keys(MAGAZZINO).length).toBeGreaterThanOrEqual(6)
  })
})

// ── La produzione che non appariva più ──────────────────────────────────
//
// Sempre 21/09/2026, stesso audit, difetto diverso e più grave del primo:
// **una produzione registrata spariva dallo schermo**.
//
// Com'è fatto il giro: un'azienda a metodo differenziale tiene la produzione
// in `inventario_produzione`, e un ponte nel telaio la proietta in forma di
// sessioni perché le venti pagine che la leggono (P&L, storico, previsioni,
// home, calendario, confronto sedi, simulatore prezzi…) sanno leggere solo
// quelle. Il ponte faceva `setGiornaliero(proiezione)`: **sostituiva tutto**,
// perché si dava per scontato che il vecchio blob fosse vuoto.
//
// Non è vuoto. Ci scrive dentro «Porta in produzione» delle Ordinazioni, e ci
// sta tutta la storia di chi ha cambiato metodo strada facendo.
//
// Misurato sul database dell'azienda del design partner: **2 sessioni**, una
// delle quali nata da un'ordinazione portata in produzione il 30/09. Il
// programma aveva risposto «righe portate in Produzione» e quella produzione
// non si vedeva più da nessuna parte — nemmeno nella pagina Produzione, che
// col metodo differenziale è un'altra.
import { unisciSessioni } from '../../src/lib/inventarioProduzione'

const sessione = (data, id, extra = {}) => ({ data, id, prodotti: [{ nome: 'NOCCIOLA', stampi: 2, vendibile: 2 }], ...extra })

describe('Le sessioni fuori dall\'inventario non si buttano via', () => {
  it('un\'ordinazione portata in produzione resta visibile', () => {
    const daInventario = [sessione('2026-09-20', 'inv-2026-09-20', { _da_inventario: true })]
    const dalBlob = [sessione('2026-09-30', 'g-evento-abc', { daEvento: 'ev1' })]
    const unite = unisciSessioni(daInventario, dalBlob)
    expect(unite.map(s => s.id)).toContain('g-evento-abc')
  })

  it('e la storia di prima del cambio metodo pure', () => {
    const daInventario = [sessione('2026-09-20', 'inv-2026-09-20')]
    const dalBlob = [sessione('2026-09-01', 'g-1788256620128')]
    expect(unisciSessioni(daInventario, dalBlob).map(s => s.id)).toContain('g-1788256620128')
  })

  it('ma lo stesso giorno non si conta due volte', () => {
    // Se l'inventario ha righe per quel giorno, è lì che quel giorno si
    // registra: la sessione vecchia sarebbe lo stesso gelato scritto due
    // volte, e due volte è peggio di zero.
    const daInventario = [sessione('2026-09-20', 'inv-2026-09-20')]
    const dalBlob = [sessione('2026-09-20', 'g-vecchia')]
    const unite = unisciSessioni(daInventario, dalBlob)
    expect(unite).toHaveLength(1)
    expect(unite[0].id).toBe('inv-2026-09-20')
  })

  it('le sessioni escono dalla più recente alla più vecchia', () => {
    const unite = unisciSessioni(
      [sessione('2026-09-20', 'a'), sessione('2026-09-10', 'b')],
      [sessione('2026-09-30', 'c'), sessione('2026-08-01', 'd')],
    )
    expect(unite.map(s => s.data)).toEqual(['2026-09-30', '2026-09-20', '2026-09-10', '2026-08-01'])
  })

  it('senza niente nel blob torna esattamente la proiezione', () => {
    const inv = [sessione('2026-09-20', 'inv-2026-09-20')]
    expect(unisciSessioni(inv, [])).toEqual(inv)
    expect(unisciSessioni(inv, null)).toEqual(inv)
    expect(unisciSessioni(inv, undefined)).toEqual(inv)
  })

  it('e senza inventario restano le sessioni del blob', () => {
    // È il caso di chi ha appena cambiato metodo e non ha ancora registrato
    // niente col nuovo: la sua storia non deve sparire il giorno del cambio.
    const blob = [sessione('2026-09-01', 'g-1')]
    expect(unisciSessioni([], blob)).toEqual(blob)
    expect(unisciSessioni(null, blob)).toEqual(blob)
  })

  it('una sessione senza data non manda in crisi il cucito', () => {
    const unite = unisciSessioni([sessione('2026-09-20', 'a')], [{ id: 'rotta' }, null, sessione('2026-09-05', 'b')])
    expect(unite.map(s => s.id)).toEqual(['a', 'b'])
  })

  it('e due liste vuote danno una lista vuota, non un errore', () => {
    expect(unisciSessioni(null, null)).toEqual([])
  })
})
