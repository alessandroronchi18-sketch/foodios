// ── Una formula sola per «quanto devo riordinare» ───────────────────────────
//
// Il difetto, trovato il 22/09/2026 leggendo le due pagine una accanto
// all'altra: FoodOS rispondeva alla stessa domanda in DUE modi diversi.
//
//   • `src/views/MagazzinoView.jsx:1025-1073` — dentro un `.map`, non
//     esportata, non provata da nessuno: copri 14 giorni fissi di consumo (o
//     una volta e mezza la soglia) e sottrai quello che hai già.
//   • `src/views/OrdiniAiView.jsx:160-227` — copri la cadenza vera del
//     fornitore più tre giorni, col 40% di margine, e non guardare quello che
//     hai già.
//
// Sulla farina di Mara — 2 kg al giorno, soglia 10 kg, 10 kg in magazzino,
// fornitore che passa ogni 7 giorni — la pagina Magazzino diceva «ordina
// 18 kg» e la pagina Ordini AI «ordina 28 kg». Dieci chili di differenza
// sullo stesso ingrediente, nello stesso pomeriggio. Chi le guardava tutte e
// due non poteva sapere quale credere, e chi ne guardava una sola non sapeva
// nemmeno che ci fosse un dubbio.
//
// Decisione del titolare: se ne tiene UNA, quella basata su ogni quanto quel
// fornitore consegna davvero. Queste prove tengono insieme tre cose:
//
//   1. che sui casi normali la formula nuova dà lo STESSO numero delle
//      vecchie (le due vecchie sono qui sotto, copiate riga per riga);
//   2. che dove diverge, diverge per un motivo che si può scrivere in
//      italiano;
//   3. che i casi limite che le vecchie gestivano (soglia 0, giacenza
//      negativa, mai contato, consumo zero) non sono peggiorati.
import { describe, it, expect } from 'vitest'
import {
  statoScorta,
  quantoRiordinare,
  righeDaRiordinare,
  fmtQuantita,
  scriviQuantita,
  arrotondaPassoPratico,
  STATO,
} from '../../src/lib/riordino.js'

// ── Le due formule vecchie, copiate dal codice del 22/09/2026 ───────────────
// Servono per confrontare, e restano qui come documento: se qualcuno domani
// rimette una terza formula in una pagina, queste dicono cosa c'era prima.

// src/views/MagazzinoView.jsx:1025-1073
function vecchiaMagazzino({ giacenza, soglia, consumoG }) {
  const GIORNI_TARGET = 14
  const targetG = Math.max(consumoG * GIORNI_TARGET, soglia > 0 ? soglia * 1.5 : 0)
  return targetG > giacenza ? targetG - giacenza : 0
}

// src/views/OrdiniAiView.jsx:160-227
function vecchiaOrdiniAi({ soglia, cons, cadenzaGiorni = null, leadTimeIng = 3 }) {
  const giorniDaCoprire = cadenzaGiorni
    ? Math.max(7, cadenzaGiorni + 3)
    : Math.max(14, leadTimeIng + 7)
  return Math.round(Math.max(soglia * 2, cons * giorniDaCoprire * 1.4))
}

describe('Lo stato della scorta: gli stessi sei di prima', () => {
  it('giacenza negativa è un errore di registrazione, non una scorta', () => {
    // Prima del 09/09/2026 cadeva fino a «ok», verde, e non la contava
    // nessuno: `giacenza === 0` è un'uguaglianza stretta e −500 non la passa.
    expect(statoScorta({ giacenza: -500, soglia: 0, consumoGiornaliero: 100 }).stato).toBe(STATO.NEGATIVO)
  })

  it('mai contato non è esaurito', () => {
    // Nel magazzino vero di Mara erano 40 ingredienti su 48: la pagina li
    // dichiarava ESAURITI in rosso perché nessuno li aveva mai pesati.
    const mai = statoScorta({ giacenza: 0, soglia: 0, consumoGiornaliero: 100, inMagazzino: false })
    const finito = statoScorta({ giacenza: 0, soglia: 0, consumoGiornaliero: 100, inMagazzino: true })
    expect(mai.stato).toBe(STATO.MAI_CONTATO)
    expect(finito.stato).toBe(STATO.ESAURITO)
  })

  it('sotto la soglia è critico, anche con dieci giorni di scorta davanti', () => {
    const r = statoScorta({ giacenza: 1000, soglia: 5000, consumoGiornaliero: 100 })
    expect(r.stato).toBe(STATO.CRITICO)
    expect(r.giorniScorta).toBe(10)
  })

  it('senza soglia decide il tempo: sotto tre giorni critico, sotto sette attenzione', () => {
    expect(statoScorta({ giacenza: 2000, soglia: 0, consumoGiornaliero: 1000 }).stato).toBe(STATO.CRITICO)
    expect(statoScorta({ giacenza: 5000, soglia: 0, consumoGiornaliero: 1000 }).stato).toBe(STATO.ATTENZIONE)
    expect(statoScorta({ giacenza: 9000, soglia: 0, consumoGiornaliero: 1000 }).stato).toBe(STATO.OK)
  })

  it('i confini sono quelli di prima: 3 giorni esatti è attenzione, 7 esatti è ok', () => {
    expect(statoScorta({ giacenza: 3000, soglia: 0, consumoGiornaliero: 1000 }).stato).toBe(STATO.ATTENZIONE)
    expect(statoScorta({ giacenza: 7000, soglia: 0, consumoGiornaliero: 1000 }).stato).toBe(STATO.OK)
  })

  it('«non so quanto se ne consuma» NON è «finisce oggi»', () => {
    // È la regola che tiene su mezzo prodotto: un dato che manca non è zero.
    // Con giorniScorta a 0 questo ingrediente finiva in cima all'elenco
    // dell'urgenza, davanti a quelli davvero finiti.
    const senza = statoScorta({ giacenza: 5000, soglia: 0, consumoGiornaliero: null })
    expect(senza.giorniScorta).toBe(null)
    expect(senza.stato).toBe(STATO.OK)

    const zero = statoScorta({ giacenza: 5000, soglia: 0, consumoGiornaliero: 0 })
    expect(zero.giorniScorta).toBe(null)
  })

  it('la giacenza negativa dice quanti giorni sei sotto, e lo stato dice che è un errore', () => {
    const r = statoScorta({ giacenza: -500, soglia: 0, consumoGiornaliero: 1000 })
    expect(r.giorniScorta).toBeCloseTo(-0.5, 6)
    expect(r.stato).toBe(STATO.NEGATIVO)
  })
})

describe('Sui casi normali la formula nuova dà lo stesso numero delle vecchie', () => {
  it('fornitore settimanale, scaffale vuoto: tutte e tre dicono 14 kg', () => {
    // Non è una coincidenza fortunata, è il motivo per cui la sostituzione si
    // può fare senza spaventare nessuno: 14 giorni senza margine e 10 giorni
    // col 40% di margine sono lo stesso numero (14 × 1,0 = 10 × 1,4).
    const caso = { giacenza: 0, soglia: 0, consumoGiornaliero: 1000, cadenzaGiorni: 7 }
    const nuova = quantoRiordinare(caso)
    expect(nuova.quantitaG).toBe(14000)
    expect(vecchiaMagazzino({ giacenza: 0, soglia: 0, consumoG: 1000 })).toBe(14000)
    expect(vecchiaOrdiniAi({ soglia: 0, cons: 1000, cadenzaGiorni: 7 })).toBe(14000)
    expect(nuova.giorniDaCoprire).toBe(10)
  })

  it('la farina di Mara: la nuova dà lo stesso della pagina Magazzino, 18 kg', () => {
    // 2 kg al giorno, soglia 10 kg, 10 kg sullo scaffale, fornitore ogni 7 gg.
    const caso = { giacenza: 10000, soglia: 10000, consumoGiornaliero: 2000, cadenzaGiorni: 7 }
    expect(quantoRiordinare(caso).quantitaG).toBe(18000)
    expect(vecchiaMagazzino({ giacenza: 10000, soglia: 10000, consumoG: 2000 })).toBe(18000)
  })

  it('soglia sola e consumo a zero: la nuova dà lo stesso della pagina Ordini AI', () => {
    const caso = { giacenza: 0, soglia: 5000, consumoGiornaliero: 0 }
    expect(quantoRiordinare(caso).quantitaG).toBe(10000)
    expect(vecchiaOrdiniAi({ soglia: 5000, cons: 0 })).toBe(10000)
  })
})

describe('Dove divergevano, e perché la nuova è quella giusta', () => {
  it('la pagina Ordini AI non guardava lo scaffale: 28 kg invece di 18', () => {
    const caso = { giacenza: 10000, soglia: 10000, consumoGiornaliero: 2000, cadenzaGiorni: 7 }
    const nuova = quantoRiordinare(caso).quantitaG
    const vecchia = vecchiaOrdiniAi({ soglia: 10000, cons: 2000, cadenzaGiorni: 7 })

    expect(vecchia).toBe(28000)
    expect(nuova).toBe(18000)
    // La differenza è ESATTAMENTE la merce che c'è già in magazzino.
    expect(vecchia - nuova).toBe(10000)
    // Perché la nuova è giusta: con 28 kg in arrivo e 10 sullo scaffale la
    // pasticceria si ritrova 19 giorni di farina per un fornitore che ripassa
    // fra 7. Sono soldi fermi e un sacco che scade.
  })

  it('la pagina Magazzino ignorava ogni quanto passa il fornitore: 6 kg invece di 22', () => {
    // Fornitore mensile (cadenza 30 giorni), 500 g al giorno, 1 kg sullo
    // scaffale. La pagina Magazzino copriva 14 giorni fissi per tutti.
    const caso = { giacenza: 1000, soglia: 0, consumoGiornaliero: 500, cadenzaGiorni: 30 }
    const nuova = quantoRiordinare(caso)
    const vecchia = vecchiaMagazzino({ giacenza: 1000, soglia: 0, consumoG: 500 })

    expect(vecchia).toBe(6000)
    expect(nuova.quantitaG).toBe(22100)
    expect(nuova.giorniDaCoprire).toBe(33)
    // Perché la nuova è giusta: con 6 kg + 1 kg che hai, al quattordicesimo
    // giorno sei a secco e il fornitore ripassa il trentesimo. Sedici giorni
    // senza quell'ingrediente, e la pagina ti aveva detto che era tutto a
    // posto.
  })

  it('il pavimento della soglia: una volta e mezza (Magazzino) contro il doppio (Ordini AI)', () => {
    const caso = { giacenza: 0, soglia: 10000, consumoGiornaliero: 0 }
    expect(vecchiaMagazzino({ giacenza: 0, soglia: 10000, consumoG: 0 })).toBe(15000)
    expect(vecchiaOrdiniAi({ soglia: 10000, cons: 0 })).toBe(20000)
    // Si tiene il doppio, che è la regola della formula scelta: la soglia è
    // il punto in cui si ordina, non il punto in cui si vuole stare.
    expect(quantoRiordinare(caso).quantitaG).toBe(20000)
  })

  it('e il pavimento è un LIVELLO da raggiungere, non una quantità da ordinare', () => {
    // Differenza che si vede solo con la merce già in casa: la pagina Ordini
    // AI ordinava due volte la soglia anche avendone già una.
    const caso = { giacenza: 10000, soglia: 10000, consumoGiornaliero: 0 }
    expect(vecchiaOrdiniAi({ soglia: 10000, cons: 0 })).toBe(20000)
    expect(quantoRiordinare(caso).quantitaG).toBe(10000)
    // Dopo la consegna sullo scaffale ci sono 20 kg: esattamente il doppio
    // della soglia, che è quello che la regola voleva dire.
  })
})

describe('I casi limite che le vecchie gestivano — e uno che gestivano male', () => {
  it('soglia a zero non manda in errore e non fa ordinare niente di finto', () => {
    const r = quantoRiordinare({ giacenza: 5000, soglia: 0, consumoGiornaliero: 0 })
    expect(r.quantitaG).toBe(0)
    expect(r.perche).toMatch(/ne hai già abbastanza/)
  })

  it('la giacenza negativa NON gonfia l’ordine (la pagina Magazzino lo faceva)', () => {
    // −500 g è un errore di registrazione: qualcuno ha scaricato più di
    // quello che c'era. La formula vecchia faceva `target − (−500)` e
    // ordinava mezzo chilo in più *per l'errore di battitura*.
    const caso = { giacenza: -500, soglia: 0, consumoGiornaliero: 1000, cadenzaGiorni: 7 }
    expect(vecchiaMagazzino({ giacenza: -500, soglia: 0, consumoG: 1000 })).toBe(14500)
    expect(quantoRiordinare(caso).quantitaG).toBe(14000)
  })

  it('consumo sconosciuto: nessun numero inventato, e una frase che dice cosa fare', () => {
    const r = quantoRiordinare({ giacenza: 0, soglia: 10000, consumoGiornaliero: null })
    expect(r.quantitaG).toBe(null)
    expect(r.perche).toMatch(/non so quanto se ne consuma/)
    // I giorni da coprire si sanno lo stesso: dipendono dal fornitore, non
    // dal consumo.
    expect(r.giorniDaCoprire).toBe(14)
  })

  it('consumo zero MISURATO invece è un numero, e resta quello di prima', () => {
    // La differenza fra `null` e `0` è tutta qui: zero vuol dire «l'ho
    // contato, non se ne usa», e allora la soglia basta a decidere.
    expect(quantoRiordinare({ giacenza: 0, soglia: 10000, consumoGiornaliero: 0 }).quantitaG).toBe(20000)
  })

  it('un consumo negativo è un dato sbagliato, non un consumo', () => {
    expect(quantoRiordinare({ giacenza: 0, soglia: 0, consumoGiornaliero: -5 }).quantitaG).toBe(null)
  })

  it('senza niente in mano non esplode', () => {
    const r = quantoRiordinare()
    expect(r.quantitaG).toBe(null)
    expect(r.giorniDaCoprire).toBe(14)
    expect(statoScorta().stato).toBe(STATO.ESAURITO)
  })
})

describe('I giorni da coprire, e la frase che li spiega', () => {
  it('la cadenza vera del fornitore vince su tutto', () => {
    const r = quantoRiordinare({ giacenza: 0, soglia: 0, consumoGiornaliero: 1000, cadenzaGiorni: 7, leadTimeGiorni: 30 })
    expect(r.giorniDaCoprire).toBe(10)
    expect(r.perche).toBe('il fornitore passa ogni 7 giorni: copro 10 giorni')
  })

  it('accetta anche l’oggetto che ritorna cadenzaConsegne', () => {
    const r = quantoRiordinare({ giacenza: 0, soglia: 0, consumoGiornaliero: 1000, cadenzaGiorni: { giorni: 7, campione: 12 } })
    expect(r.giorniDaCoprire).toBe(10)
  })

  it('sotto la settimana non si scende, anche per chi passa tutti i giorni', () => {
    expect(quantoRiordinare({ giacenza: 0, soglia: 0, consumoGiornaliero: 100, cadenzaGiorni: 1 }).giorniDaCoprire).toBe(7)
  })

  it('senza cadenza vale il tempo di consegna dichiarato, più una settimana', () => {
    const r = quantoRiordinare({ giacenza: 0, soglia: 0, consumoGiornaliero: 1000, leadTimeGiorni: 10 })
    expect(r.giorniDaCoprire).toBe(17)
    expect(r.perche).toBe('il fornitore consegna in 10 giorni: copro 17 giorni')
  })

  it('senza niente, quattordici giorni e lo dice che è prudenza', () => {
    const r = quantoRiordinare({ giacenza: 0, soglia: 0, consumoGiornaliero: 1000 })
    expect(r.giorniDaCoprire).toBe(14)
    expect(r.perche).toBe('non so ogni quanto passa questo fornitore: copro 14 giorni per prudenza')
  })

  it('la frase dice anche quanto c’è già, perché il numero torni', () => {
    const r = quantoRiordinare({ giacenza: 10000, soglia: 10000, consumoGiornaliero: 2000, cadenzaGiorni: 7 })
    expect(r.perche).toBe('il fornitore passa ogni 7 giorni: copro 10 giorni, meno 10,0 kg che hai già')
  })

  it('quando comanda la soglia, la frase lo dice invece di parlare di giorni', () => {
    const r = quantoRiordinare({ giacenza: 0, soglia: 10000, consumoGiornaliero: 100, cadenzaGiorni: 7 })
    expect(r.quantitaG).toBe(20000)
    expect(r.perche).toBe('la soglia di riordino è 10,0 kg: tengo la scorta al doppio')
  })
})

describe('Le quantità si scrivono come si ordinano', () => {
  it('sotto il chilo si sale al centinaio di grammi', () => {
    expect(arrotondaPassoPratico(250)).toBe(300)
    expect(fmtQuantita(250)).toBe('300 g')
  })

  it('sopra il chilo si sale al mezzo chilo', () => {
    expect(arrotondaPassoPratico(1234)).toBe(1500)
    expect(fmtQuantita(1234)).toBe('1,5 kg')
  })

  it('è la stessa regola di fmtRiordino in MagazzinoView, non una nuova', () => {
    // Copiata dal file: `g < 1000 ? ceil(g/100)*100 : ceil(g/1000*2)/2*1000`.
    const comeMagazzino = g => (g < 1000 ? Math.ceil(g / 100) * 100 : Math.ceil((g / 1000) * 2) / 2 * 1000)
    for (const g of [1, 99, 100, 101, 250, 999, 1000, 1001, 1234, 2500, 18000, 22100, 999999]) {
      expect(arrotondaPassoPratico(g)).toBe(comeMagazzino(g))
    }
  })

  it('999 g arrotondati diventano un chilo, e si scrivono in chili', () => {
    expect(fmtQuantita(999)).toBe('1,0 kg')
  })

  it('niente da ordinare resta vuoto, non «0 g» che sembra una misura', () => {
    expect(fmtQuantita(0)).toBe(null)
    expect(fmtQuantita(null)).toBe(null)
    expect(fmtQuantita(-100)).toBe(null)
  })

  it('il punto delle migliaia c’è sempre, anche dove toLocaleString se lo dimentica', () => {
    // Senza `useGrouping: 'always'` alcuni runtime (Node senza ICU completo,
    // Safari in navigazione privata) scrivono «9628 g».
    expect(scriviQuantita(9628)).toBe('9,6 kg')
    expect(scriviQuantita(999)).toBe('999 g')
    expect(scriviQuantita(1500000)).toBe('1.500,0 kg')
  })
})

describe('L’elenco: in cima quello che va ordinato oggi', () => {
  const magazzino = [
    { nome: 'burro', giacenza: 0, soglia: 0, consumoGiornaliero: 500 },
    { nome: 'farina', giacenza: -500, soglia: 0, consumoGiornaliero: 1000 },
    { nome: 'zucchero', giacenza: 1000, soglia: 5000, consumoGiornaliero: 200 },
    { nome: 'panna', giacenza: 3000, soglia: 0, consumoGiornaliero: 1000 },
    { nome: 'pistacchio', giacenza: 0, soglia: 0, consumoGiornaliero: 100, inMagazzino: false },
    { nome: 'sale', giacenza: 50000, soglia: 1000, consumoGiornaliero: 100 },
  ]

  it('tiene solo quello che serve ordinare, e nell’ordine dell’urgenza', () => {
    const r = righeDaRiordinare(magazzino)
    expect(r.map(x => x.nome)).toEqual(['burro', 'farina', 'zucchero', 'panna'])
    expect(r.map(x => x.stato)).toEqual([STATO.ESAURITO, STATO.NEGATIVO, STATO.CRITICO, STATO.ATTENZIONE])
  })

  it('con soloDaOrdinare: false restano tutte, e sotto ci sono quelle a posto', () => {
    const r = righeDaRiordinare(magazzino, { soloDaOrdinare: false })
    expect(r.map(x => x.nome)).toEqual(['burro', 'farina', 'zucchero', 'panna', 'pistacchio', 'sale'])
    expect(r.find(x => x.nome === 'sale').daOrdinare).toBe(false)
  })

  it('mai contato non si ordina: prima si conta', () => {
    // Il pistacchio è nel ricettario e non è mai stato inventariato. Ordinarne
    // 1,4 kg «perché la giacenza è 0» vuol dire comprare merce che magari è
    // già in cantina: da Mara erano 40 ingredienti su 48.
    const r = righeDaRiordinare(magazzino, { soloDaOrdinare: false })
    const p = r.find(x => x.nome === 'pistacchio')
    expect(p.stato).toBe(STATO.MAI_CONTATO)
    expect(p.daOrdinare).toBe(false)
  })

  it('verde nel semaforo ma il fornitore ripassa fra un mese: va ordinato oggi', () => {
    // Venti giorni di scorta sono «ok» per il semaforo (tarato su 3 e 7
    // giorni), ma il fornitore passa ogni 30: se non si ordina adesso si
    // resta dieci giorni senza. La pagina Ordini AI guardava solo il tempo di
    // consegna (3 giorni di riferimento) e questa riga non la vedeva mai.
    const r = righeDaRiordinare([
      { nome: 'cacao', giacenza: 10000, soglia: 0, consumoGiornaliero: 500, cadenzaGiorni: 30 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].stato).toBe(STATO.OK)
    expect(r[0].daOrdinare).toBe(true)
    expect(r[0].urgenza).toBe('media')
    expect(r[0].quantitaTesto).toBe('13,5 kg')  // 23.100 g da coprire meno i 10 kg che ci sono, al mezzo chilo
  })

  it('chi non si sa va in fondo, non in cima', () => {
    const r = righeDaRiordinare([
      { nome: 'vaniglia', giacenza: 5000, soglia: 0, consumoGiornaliero: null },
      { nome: 'nocciola', giacenza: 50000, soglia: 0, consumoGiornaliero: 100 },
    ], { soloDaOrdinare: false })
    expect(r.map(x => x.nome)).toEqual(['nocciola', 'vaniglia'])
    expect(r[1].giorniScorta).toBe(null)
  })

  it('porta con sé tutto quello che serve per mostrarla', () => {
    const r = righeDaRiordinare([{
      nome: 'farina 00', giacenza: 10000, soglia: 10000, consumoGiornaliero: 2000,
      cadenzaGiorni: 7, fornitore: 'Vecchio Enrico', codice: 'DOT.001', costoKg: 1.2,
    }])
    expect(r[0]).toMatchObject({
      nome: 'farina 00',
      fornitore: 'Vecchio Enrico',
      codice: 'DOT.001',
      quantitaG: 18000,
      quantitaTesto: '18,0 kg',
      giorniDaCoprire: 10,
      urgenza: 'alta',
    })
    expect(r[0].costoStimato).toBeCloseTo(21.6, 6)
  })

  it('il costo stimato è null quando il prezzo non si sa: zero vorrebbe dire gratis', () => {
    const r = righeDaRiordinare([{ nome: 'burro', giacenza: 0, soglia: 0, consumoGiornaliero: 500 }])
    expect(r[0].costoStimato).toBe(null)
  })

  it('senza righe, o con spazzatura dentro, ritorna un elenco vuoto', () => {
    expect(righeDaRiordinare()).toEqual([])
    expect(righeDaRiordinare(null)).toEqual([])
    expect(righeDaRiordinare([null, undefined])).toEqual([])
  })

  it('l’ordine è stabile: a parità di tutto decide il nome', () => {
    const uguali = [
      { nome: 'zafferano', giacenza: 0, soglia: 0, consumoGiornaliero: 100 },
      { nome: 'anice', giacenza: 0, soglia: 0, consumoGiornaliero: 100 },
      { nome: 'menta', giacenza: 0, soglia: 0, consumoGiornaliero: 100 },
    ]
    expect(righeDaRiordinare(uguali).map(x => x.nome)).toEqual(['anice', 'menta', 'zafferano'])
  })
})

describe('Il righello: questo controllo saprebbe accorgersi se la formula smettesse di funzionare', () => {
  // Una prova che passa su qualunque implementazione non prova niente. Qui
  // sotto ci sono tre modi realistici di rompere `quantoRiordinare` — sono i
  // tre difetti veri delle due formule vecchie — e per ognuno si verifica che
  // almeno una delle affermazioni di sopra CADREBBE.

  const casi = [
    { nome: 'farina di Mara', p: { giacenza: 10000, soglia: 10000, consumoGiornaliero: 2000, cadenzaGiorni: 7 }, atteso: 18000 },
    { nome: 'fornitore mensile', p: { giacenza: 1000, soglia: 0, consumoGiornaliero: 500, cadenzaGiorni: 30 }, atteso: 22100 },
    { nome: 'giacenza negativa', p: { giacenza: -500, soglia: 0, consumoGiornaliero: 1000, cadenzaGiorni: 7 }, atteso: 14000 },
  ]

  it('prima di tutto: sui casi buoni la formula vera passa', () => {
    for (const c of casi) expect(quantoRiordinare(c.p).quantitaG).toBe(c.atteso)
  })

  it('se smettesse di sottrarre la giacenza, almeno un caso cadrebbe', () => {
    // Niente `giacenza` nella firma: è esattamente il difetto da riprodurre.
    const rotta = ({ soglia, consumoGiornaliero, cadenzaGiorni }) => {
      const gg = cadenzaGiorni ? Math.max(7, cadenzaGiorni + 3) : 14
      return Math.round(Math.max(soglia * 2, consumoGiornaliero * gg * 1.4))
    }
    const cadute = casi.filter(c => rotta(c.p) !== c.atteso)
    expect(cadute.map(c => c.nome)).toEqual(['farina di Mara', 'fornitore mensile'])
  })

  it('se tornasse ai quattordici giorni fissi, il fornitore mensile cadrebbe', () => {
    const rotta = ({ giacenza, soglia, consumoGiornaliero }) => {
      const target = Math.max(consumoGiornaliero * 14 * 1.4, soglia * 2)
      return Math.round(Math.max(0, target - Math.max(0, giacenza)))
    }
    const cadute = casi.filter(c => rotta(c.p) !== c.atteso)
    expect(cadute.map(c => c.nome)).toContain('fornitore mensile')
  })

  it('se la giacenza negativa tornasse a gonfiare l’ordine, quel caso cadrebbe', () => {
    const rotta = ({ giacenza, soglia, consumoGiornaliero, cadenzaGiorni }) => {
      const gg = cadenzaGiorni ? Math.max(7, cadenzaGiorni + 3) : 14
      const target = Math.max(consumoGiornaliero * gg * 1.4, soglia * 2)
      return Math.round(Math.max(0, target - giacenza))  // senza il Math.max(0, giacenza)
    }
    const cadute = casi.filter(c => rotta(c.p) !== c.atteso)
    expect(cadute.map(c => c.nome)).toEqual(['giacenza negativa'])
  })

  it('e se «non lo so» tornasse a valere zero, la differenza si vedrebbe', () => {
    // È il difetto più silenzioso: nessun errore, solo un numero in più che
    // nessuno ha calcolato.
    const vero = quantoRiordinare({ giacenza: 5000, soglia: 4000, consumoGiornaliero: null })
    const rotta = quantoRiordinare({ giacenza: 5000, soglia: 4000, consumoGiornaliero: 0 })
    expect(vero.quantitaG).toBe(null)
    expect(rotta.quantitaG).toBe(3000)
    expect(vero.quantitaG).not.toBe(rotta.quantitaG)
  })
})
