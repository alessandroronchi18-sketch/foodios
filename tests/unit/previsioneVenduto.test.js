// ── La previsione del venduto: misurata fra due conte, provata sugli errori veri ──
//
// Audit del 03/10/2026 sulla pagina Previsioni (voto 15/100). Rifatta giorno
// per giorno sui dati veri di Mara dei Boschi, con i soli dati fino al giorno
// prima, la pagina:
//
// - prevedeva gli impasti PRODOTTI (Holt su 4-5 mesi) invece del venduto, e
//   sbagliava del 51-110% per gusto e giorno; contro il venduto, sugli stessi
//   gusti e giorni, del 31-36% a luglio e del 42-60% ad agosto;
// - mostrava una banda «70-90%» che conteneva il reale il 17-28% delle volte
//   (contro il venduto: 41-46% a luglio, 10-18% ad agosto);
// - nascondeva il 27-29% dei kg (gusti col nome diverso dalla ricetta);
// - con i dati fermi al 31/08 scriveva «Oggi», «Domani» il 03/10.
//
// La causa più subdola stava nei dati, non nel metodo: nel giorno in cui si
// produce la rimanenza viene scritta 0 (casella non compilata: 658 su 660), e
// il venduto di quel giorno esce gonfiato e quello dopo negativo — FONDENTE a
// De Gasperi l'11/08 13,3 kg, il 12/08 -7,8. Un metodo che legge i venduti
// giorno per giorno impara il rumore della compilazione.
//
// `src/lib/previsioneVenduto.js` misura il ritmo fra due conte affidabili,
// prevede il venduto in kg, e ricava la banda dai propri errori delle ultime
// quattro settimane (rifatti con i soli dati fino al giorno prima). Sul
// backtest di luglio e agosto: 24/19/23% e 25/39/34% per gusto e giorno, banda
// «8 su 10» che contiene il reale il 73-82% delle volte.
//
// Questi test riproducono il difetto dei dati, provano ogni pezzo che decide i
// numeri e il comportamento con i dati vecchi (il caso di Mara il 03/10).
import { describe, it, expect } from 'vitest'
import { serieVendutoGusto } from '../../src/lib/inventarioProduzione'
import {
  contaAffidabile, preparaGusti, vendutoFraConte, ritmoGusto, creaContesto,
  rapporti, bandaDaErrori, errorePassato, scortaGusto, lottoTipico, quandoFinisce,
  ultimoGiornoRegistrato, previsioneSede, piuGiorni, giornoSettimana, giorniFra,
  LIVELLO_BANDA, LIVELLO_BANDA_MAX, GIORNI_DATI_VECCHI,
} from '../../src/lib/previsioneVenduto'

// ── Attrezzi ─────────────────────────────────────────────────────────────

function riga(gusto, data, { prod = 0, riman = 0, scarto = 0, spedito = 0, ricevuto = 0 } = {}) {
  return {
    gusto_nome: gusto, data,
    produzione_g: Math.round(prod * 1000),
    rimanenza_g: riman == null ? null : Math.round(riman * 1000),
    scarto_g: Math.round(scarto * 1000), spedito_g: Math.round(spedito * 1000), ricevuto_g: Math.round(ricevuto * 1000),
  }
}

// Generatore deterministico (mulberry32): i test statistici devono dare
// sempre lo stesso risultato.
function rng(seme) {
  let a = seme >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Una gelateria finta: il gusto si fa a lotti quando la vetrina scende sotto
 * la soglia, si vende `vendite(data, i)` al giorno (mai più di quello che c'è).
 * Con `casellaVuota` nei giorni di produzione la rimanenza si scrive 0, come
 * nei fogli veri: la vetrina vera intanto resta piena.
 */
function simula({ gusto = 'FONDENTE', inizio = '2026-06-01', giorni = 70, vendite, lotto = 8, soglia = 5, scorta = 6, casellaVuota = false }) {
  const righe = []
  let s = scorta
  for (let i = 0; i < giorni; i++) {
    const d = piuGiorni(inizio, i)
    const prod = s < soglia ? lotto : 0
    const v = Math.min(vendite(d, i), s + prod)
    s = s + prod - v
    righe.push(riga(gusto, d, { prod, riman: casellaVuota && prod > 0 ? 0 : s }))
  }
  return righe
}

const costante = kg => () => kg

// ── 1. Il difetto dei dati ───────────────────────────────────────────────

describe('riproduce il difetto: la rimanenza a zero nel giorno di produzione', () => {
  // De Gasperi, FONDENTE, agosto 2026 (dati veri, arrotondati)
  const righe = [
    riga('FONDENTE', '2026-08-10', { prod: 5, riman: 8.3 }),
    riga('FONDENTE', '2026-08-11', { prod: 5, riman: 0 }),      // casella non compilata
    riga('FONDENTE', '2026-08-12', { prod: 0, riman: 7.8 }),
  ]

  it('il venduto giorno per giorno dell’inventario esce +13,3 e −7,8', () => {
    const s = serieVendutoGusto(righe).FONDENTE
    expect(s[1].venduto / 1000).toBeCloseTo(13.3, 5)
    expect(s[2].venduto / 1000).toBeCloseTo(-7.8, 5)
  })

  it('quei due giorni NON sono giornate misurate bene', () => {
    const G = preparaGusti(righe).FONDENTE
    expect(G.celle['2026-08-11'].conta).toBe(false)
    expect(G.celle['2026-08-11'].pulito).toBe(false)
    expect(G.celle['2026-08-12'].pulito).toBe(false)
  })

  it('fra le due conte buone il venduto torna giusto: 8,3 + 5 − 7,8 = 5,5 kg', () => {
    const G = preparaGusti(righe).FONDENTE
    expect(vendutoFraConte(G, '2026-08-10', '2026-08-12')).toBeCloseTo(5.5, 5)
    // con una delle due conte inaffidabile non si dà un numero
    expect(vendutoFraConte(G, '2026-08-10', '2026-08-11')).toBeNull()
  })

  it('anche quando il giorno dopo il conto esce positivo, non è una giornata misurata', () => {
    // Il 12 si rifà il gusto: 0 (casella vuota) + 8 − 3 = 5 kg, un numero
    // credibile e sbagliato — la vetrina vera dell'11 non era vuota.
    const righe2 = [
      riga('FONDENTE', '2026-08-10', { prod: 5, riman: 8.3 }),
      riga('FONDENTE', '2026-08-11', { prod: 5, riman: 0 }),
      riga('FONDENTE', '2026-08-12', { prod: 8, riman: 3 }),
    ]
    const G = preparaGusti(righe2).FONDENTE
    expect(G.celle['2026-08-12'].venduto).toBeCloseTo(5, 6)
    expect(G.celle['2026-08-12'].pulito).toBe(false)
  })

  it('una rimanenza a zero SENZA produzione è una vetrina vuota vera, ed è affidabile', () => {
    expect(contaAffidabile({ riman: 0, prod: 0 })).toBe(true)
    expect(contaAffidabile({ riman: 0, prod: 3 })).toBe(false)
    expect(contaAffidabile({ riman: null, prod: 0 })).toBe(false)
    expect(contaAffidabile({ riman: 2, prod: 3 })).toBe(true)
  })

  it('il ritmo non sente le caselle vuote: 4 kg al giorno restano 4', () => {
    const righe2 = simula({ vendite: costante(4), casellaVuota: true })
    const G = preparaGusti(righe2).FONDENTE
    const r = ritmoGusto(G, '2026-08-01')
    expect(r.kgGiorno).toBeCloseTo(4, 5)
    // ...mentre leggendo il venduto giorno per giorno si vede il rumore
    const giorni = serieVendutoGusto(righe2).FONDENTE.map(c => c.venduto / 1000)
    expect(Math.max(...giorni)).toBeGreaterThan(8)
    expect(Math.min(...giorni)).toBeLessThan(0)
  })
})

describe('vendutoFraConte è la regola dell’inventario sommata, non una copia', () => {
  it('con tutte le conte buone è uguale alla somma dei venduti giornalieri, con scarto, spedito e ricevuto', () => {
    const righe = [
      riga('PESCA', '2026-07-01', { prod: 0, riman: 6 }),
      riga('PESCA', '2026-07-02', { prod: 5, riman: 7, scarto: 0.5 }),
      riga('PESCA', '2026-07-03', { prod: 0, riman: 3, spedito: 1 }),
      riga('PESCA', '2026-07-04', { prod: 0, riman: 4, ricevuto: 3 }),
    ]
    const somma = serieVendutoGusto(righe).PESCA.slice(1).reduce((s, c) => s + c.venduto / 1000, 0)
    const G = preparaGusti(righe).PESCA
    expect(vendutoFraConte(G, '2026-07-01', '2026-07-04')).toBeCloseTo(somma, 6)
    // 6 + 5 − 0,5 − 1 + 3 − 4 = 8,5
    expect(somma).toBeCloseTo(8.5, 6)
  })
})

// ── 2. Il ritmo e il fattore del giorno ──────────────────────────────────

describe('il ritmo', () => {
  it('usa solo i dati PRIMA del giorno: cambiare il futuro non lo sposta', () => {
    const righe = simula({ vendite: costante(4) })
    const futuroDiverso = righe.map(r => r.data >= '2026-07-20' ? { ...r, rimanenza_g: 99000 } : r)
    const a = ritmoGusto(preparaGusti(righe).FONDENTE, '2026-07-20')
    const b = ritmoGusto(preparaGusti(futuroDiverso).FONDENTE, '2026-07-20')
    expect(a.kgGiorno).toBeCloseTo(b.kgGiorno, 9)
    expect(a.a < '2026-07-20').toBe(true)
  })

  it('divide per i giorni in cui il gusto era in vetrina, non per il calendario', () => {
    // Ogni giorno se ne fanno 4 kg e se ne vendono 4 (la vetrina resta a 6),
    // ma il 24 e il 25 il gusto non c'è: nessuna riga, nessuna vendita.
    const righe = []
    for (let i = 0; i < 30; i++) {
      const d = piuGiorni('2026-06-01', i)
      if (d === '2026-06-24' || d === '2026-06-25') continue
      righe.push(riga('LIMONE', d, { prod: 4, riman: 6 }))
    }
    const r = ritmoGusto(preparaGusti(righe).LIMONE, '2026-07-01')
    expect(r.giorni).toBe(5)
    // Quando c'è, ne vende 4 al giorno. Diviso per il calendario farebbe
    // 20 ÷ 7 = 2,86: la previsione di domani, con il gusto in vetrina, sarebbe
    // corta di un terzo.
    expect(r.kgGiorno).toBeCloseTo(4, 9)
  })

  it('senza una conta affidabile nell’ultima settimana non c’è ritmo', () => {
    const righe = simula({ vendite: costante(4), giorni: 30 })
    expect(ritmoGusto(preparaGusti(righe).FONDENTE, '2026-07-15')).toBeNull()
  })
})

describe('il fattore del giorno della settimana', () => {
  // Il sabato si vende il doppio: 4 kg i giorni feriali, 8 il sabato.
  const vendite = d => giornoSettimana(d) === 6 ? 8 : 4
  const righe = ['A', 'B', 'C', 'D'].flatMap(g => simula({ gusto: g, vendite, giorni: 90, lotto: 30, soglia: 10, scorta: 20 }))
  const ctx = creaContesto(righe, { correzioneRecente: false })

  it('il sabato vale circa il doppio di un giorno feriale', () => {
    const f = ctx.fattori('2026-08-25')
    expect(f[6] / f[2]).toBeGreaterThan(1.8)
    expect(f[6] / f[2]).toBeLessThan(2.2)
  })

  it('e la previsione del sabato è il doppio di quella del martedì', () => {
    const sab = ctx.prevedi('A', '2026-08-25', '2026-08-29')
    const mar = ctx.prevedi('A', '2026-08-25', '2026-08-25')
    expect(sab).toBeCloseTo(8, 0)
    expect(mar).toBeCloseTo(4, 0)
  })

  it('con poche giornate il fattore resta 1: non lo so', () => {
    const poche = creaContesto(simula({ vendite, giorni: 15 }))
    expect(poche.fattori('2026-06-16')).toEqual([1, 1, 1, 1, 1, 1, 1])
  })
})

// ── 3. Il backtest automatico e la banda ─────────────────────────────────

describe('il backtest automatico', () => {
  // Vendite che cambiano ogni giorno: se il backtest sbirciasse il giorno che
  // sta provando, la sua previsione cambierebbe e il confronto lo vedrebbe.
  const caso = rng(3)
  const righe = 'AB'.split('').flatMap(g => simula({ gusto: g, vendite: (d, i) => (i < 40 ? 4 : 6) * (0.6 + 0.8 * caso()), giorni: 70, lotto: 12, soglia: 7, scorta: 10 }))
    .map(r => ({ ...r, gusto_nome: r.gusto_nome === 'A' ? 'FONDENTE' : 'LIMONE' }))

  it('ogni errore è la previsione fatta con i soli dati fino al giorno prima', () => {
    const ctx = creaContesto(righe)
    const err = ctx.errori('FONDENTE', '2026-08-01')
    expect(err.length).toBeGreaterThan(10)
    for (const e of err.slice(-5)) {
      // stesso conto con un contesto che il futuro non l'ha proprio
      const cieco = creaContesto(righe.filter(r => r.data < e.data))
      expect(e.previsto).toBeCloseTo(cieco.prevedi('FONDENTE', e.data, e.data), 9)
    }
  })

  it('guarda le ultime 4 settimane, non di più', () => {
    const err = creaContesto(righe).errori('FONDENTE', '2026-08-01')
    expect(giorniFra(err[0].data, '2026-08-01')).toBeLessThanOrEqual(28)
  })

  it('l’errore passato è errore assoluto ÷ venduto', () => {
    const e = errorePassato([{ previsto: 4, reale: 5 }, { previsto: 6, reale: 5 }])
    expect(e.pct).toBeCloseTo(0.2, 9)
    expect(e.kgGiorno).toBeCloseTo(1, 9)
    expect(errorePassato([])).toBeNull()
  })
})

describe('la banda «fra X e Y» viene dagli errori veri', () => {
  const venti = Array.from({ length: 21 }, (_, i) => 0.5 + i * 0.05)   // 0,5 … 1,5

  it('quantili 10% e 90% dei rapporti reale/previsto', () => {
    const b = bandaDaErrori(10, venti)
    expect(b.basso).toBeCloseTo(6, 6)
    expect(b.alto).toBeCloseTo(14, 6)
    expect(b.daSede).toBe(false)
  })

  it('con pochi errori del gusto usa quelli della sede, e lo dice', () => {
    const b = bandaDaErrori(10, [1, 1, 1], venti)
    expect(b.daSede).toBe(true)
    expect(b.basso).toBeCloseTo(6, 6)
  })

  it('senza abbastanza errori da nessuna parte non inventa una banda', () => {
    expect(bandaDaErrori(10, [1, 1], [1, 1])).toBeNull()
    expect(bandaDaErrori(null, venti)).toBeNull()
  })

  it('i rapporti ignorano le previsioni a zero', () => {
    expect(rapporti([{ previsto: 0, reale: 3 }, { previsto: 2, reale: 3 }])).toEqual([1.5])
  })

  it('la banda dichiarata all’80% contiene davvero circa 8 volte su 10 (vendite rumorose)', () => {
    const r = rng(42)
    const rumore = () => Math.exp(0.35 * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()))
    const gusti = 'ABCDEFGHIJ'.split('')
    const righe = gusti.flatMap((g, k) => simula({ gusto: g, vendite: () => (3 + k * 0.4) * rumore(), giorni: 110, lotto: 40, soglia: 15, scorta: 30 }))
    const ctx = creaContesto(righe)
    let dentro = 0, tot = 0
    for (let d = '2026-08-20'; d <= '2026-09-17'; d = piuGiorni(d, 1)) {
      for (const g of gusti) {
        const c = ctx.gusti[g].celle[d]
        if (!c?.pulito) continue
        const b = ctx.banda(g, d, ctx.prevedi(g, d, d))
        if (!b) continue
        tot++
        if (c.venduto >= b.basso && c.venduto <= b.alto) dentro++
      }
    }
    expect(tot).toBeGreaterThan(150)
    expect(dentro / tot).toBeGreaterThan(0.72)
    expect(dentro / tot).toBeLessThan(0.93)
  })
})

describe('la banda si controlla da sola', () => {
  it('con vendite regolari resta all’80%', () => {
    const righe = 'ABCD'.split('').flatMap(g => simula({ gusto: g, vendite: costante(4), giorni: 80 }))
    expect(creaContesto(righe).livelloBanda('2026-08-15')).toBe(LIVELLO_BANDA)
  })

  it('dopo un cambio di passo (il ritorno dalle ferie) si allarga, mai oltre il 96%', () => {
    const r = rng(7)
    const vendite = (d, i) => (i < 60 ? 3 : 6) * (0.9 + 0.2 * r())
    const righe = 'ABCDEF'.split('').flatMap(g => simula({ gusto: g, vendite, giorni: 80, lotto: 25, soglia: 10, scorta: 20 }))
    const ctx = creaContesto(righe)
    const liv = ctx.livelloBanda('2026-08-15')
    expect(liv).toBeGreaterThan(LIVELLO_BANDA)
    expect(liv).toBeLessThanOrEqual(LIVELLO_BANDA_MAX)
    // senza il controllo la banda resterebbe stretta
    expect(creaContesto(righe, { bandaAdattiva: false }).livelloBanda('2026-08-15')).toBe(LIVELLO_BANDA)
  })
})

describe('la correzione delle ultime due settimane', () => {
  it('quando le vendite ripartono (fine agosto), la previsione non resta indietro', () => {
    // Cinquanta giorni fermi a 3 kg, poi un aumento di un quarto di chilo al
    // giorno: il ritmo di una settimana lo insegue sempre con mezza settimana
    // di ritardo, e il fattore del giorno (otto settimane) non se ne accorge.
    const vendite = (d, i) => i < 50 ? 3 : 3 + (i - 50) * 0.25
    const righe = 'ABCD'.split('').flatMap(g => simula({ gusto: g, vendite, giorni: 70, lotto: 20, soglia: 10, scorta: 15 }))
    const ctx = creaContesto(righe)
    expect(ctx.correzione('2026-08-10')).toBeGreaterThan(1.08)
    const senza = creaContesto(righe, { correzioneRecente: false })
    expect(senza.correzione('2026-08-10')).toBe(1)
    // La correzione alza la previsione di quanto dice, né più né meno. Che
    // convenga non lo prova questo test (su una rampa finta è pari), lo prova
    // il backtest sui dati veri: -1/-2 punti di errore in 5 finestre su 6.
    const conC = ctx.prevedi('A', '2026-08-10'), senzaC = senza.prevedi('A', '2026-08-10')
    expect(conC).toBeCloseTo(senzaC * ctx.correzione('2026-08-10'), 9)
  })

  it('resta fra 0,7 e 1,4 anche se i dati dicono altro', () => {
    // Ogni giorno si rifà quello che si vende (la vetrina resta a 5 kg): le
    // vendite si quadruplicano, o crollano a un decimo, nelle ultime due
    // settimane. Con un ritmo lungo e senza fattore del giorno la correzione
    // grezza andrebbe ben oltre: il tetto la tiene.
    const fisso = (g, salto) => Array.from({ length: 70 }, (_, i) =>
      riga(g, piuGiorni('2026-06-01', i), { prod: i < 56 ? 2 : 2 * salto, riman: 5 }))
    const opz = { fattoreGiorno: false, giorniRitmo: 21 }
    const su = creaContesto('ABCD'.split('').flatMap(g => fisso(g, 4)), opz)
    const giu = creaContesto('ABCD'.split('').flatMap(g => fisso(g, 0.1)), opz)
    expect(su.correzione('2026-08-10')).toBe(1.4)
    expect(giu.correzione('2026-08-10')).toBe(0.7)
  })
})

// ── 4. Scorta, lotti, quando finisce ─────────────────────────────────────

describe('scorta e lotti', () => {
  it('l’ultima conta buona è la scorta, non stimata', () => {
    const righe = simula({ vendite: costante(4), giorni: 40 })
    const ctx = creaContesto(righe)
    const ultimo = righe.at(-1)
    const s = scortaGusto(ctx, 'FONDENTE', ultimo.data)
    expect(s.stimata).toBe(false)
    expect(s.kg).toBeCloseTo(ultimo.rimanenza_g / 1000, 6)
  })

  it('se l’ultima conta è la casella a zero, la scorta si stima dalla conta prima e si dice', () => {
    const righe = [
      ...simula({ vendite: costante(4), giorni: 30 }),
    ]
    const ultimo = righe.at(-1).data
    const dopo = piuGiorni(ultimo, 1)
    const vera = righe.at(-1).rimanenza_g / 1000
    righe.push(riga('FONDENTE', dopo, { prod: 8, riman: 0 }))   // in vetrina ci sono vera + 8 − 4
    const ctx = creaContesto(righe)
    const s = scortaGusto(ctx, 'FONDENTE', dopo)
    expect(s.stimata).toBe(true)
    expect(s.daConta).toBe(ultimo)
    expect(s.kg).toBeCloseTo(vera + 8 - 4, 0)
  })

  it('il lotto tipico è la mediana delle produzioni recenti', () => {
    const righe = [5, 8, 8, 13, 8].map((kg, i) => riga('X', piuGiorni('2026-08-01', i * 3), { prod: kg, riman: 2 }))
    const l = lottoTipico(preparaGusti(righe).X, '2026-08-20')
    expect(l.kg).toBe(8)
    expect(l.volte).toBe(5)
  })

  it('quando finisce: 10 kg a 4 al giorno finiscono il terzo giorno', () => {
    expect(quandoFinisce(10, () => 4, '2026-10-04')).toBe('2026-10-06')
    expect(quandoFinisce(8, () => 4, '2026-10-04')).toBe('2026-10-05')
  })

  it('i giorni di chiusura non consumano la vetrina', () => {
    const chiuso = d => d === '2026-10-05'
    expect(quandoFinisce(10, () => 4, '2026-10-04', { chiuso })).toBe('2026-10-07')
  })

  it('se basta oltre due settimane, o il previsto non c’è, non dà una data', () => {
    expect(quandoFinisce(100, () => 1, '2026-10-04')).toBeNull()
    expect(quandoFinisce(10, () => null, '2026-10-04')).toBeNull()
    expect(quandoFinisce(null, () => 4, '2026-10-04')).toBeNull()
  })
})

// ── 5. La previsione di una sede ─────────────────────────────────────────

describe('previsioneSede', () => {
  const righe = [
    ...simula({ gusto: 'FONDENTE', vendite: costante(6), giorni: 61, lotto: 13, soglia: 7, scorta: 8 }),
    ...simula({ gusto: 'AMOR FOU', vendite: costante(2), giorni: 61, lotto: 5, soglia: 3, scorta: 4 }),
    ...simula({ gusto: 'PISTACCHIO', vendite: costante(4), giorni: 61, lotto: 8, soglia: 2, scorta: 30 }),
  ]
  const ultimo = '2026-07-31'

  it('il caso di Mara il 03/10: dati fermi al 31/08, 33 giorni fa → non prevede e dice da quando', () => {
    const vecchie = righe.map(r => ({ ...r, data: piuGiorni(r.data, 31) }))
    const p = previsioneSede(vecchie, { oggi: '2026-10-03' })
    expect(p.ultimoDato).toBe('2026-08-31')
    expect(p.giorniVecchi).toBe(33)
    expect(p.stato).toBe('vecchi')
    expect(p.gusti).toEqual([])
  })

  it('fino a una settimana di ritardo prevede ancora; oltre no', () => {
    expect(previsioneSede(righe, { oggi: piuGiorni(ultimo, GIORNI_DATI_VECCHI) }).stato).toBe('ok')
    expect(previsioneSede(righe, { oggi: piuGiorni(ultimo, GIORNI_DATI_VECCHI + 1) }).stato).toBe('vecchi')
  })

  it('le righe tutte a zero non contano come «dato» (le due ABIS di settembre a Carlina)', () => {
    const conAbis = [...righe, riga('ABIS', '2026-09-15', { prod: 0, riman: 0, spedito: 0.001 })]
    expect(ultimoGiornoRegistrato(conAbis)).toBe(ultimo)
    expect(previsioneSede(conAbis, { oggi: '2026-10-03' }).stato).toBe('vecchi')
  })

  it('senza righe dice «vuoto», non zero', () => {
    expect(previsioneSede([], { oggi: '2026-10-03' }).stato).toBe('vuoto')
  })

  it('i gusti si chiamano come nell’inventario, anche senza ricetta («AMOR FOU»)', () => {
    const p = previsioneSede(righe, { oggi: piuGiorni(ultimo, 1) })
    expect(p.gusti.map(g => g.gusto).sort()).toEqual(['AMOR FOU', 'FONDENTE', 'PISTACCHIO'])
  })

  it('dati di ieri: prevede da oggi, con la scorta di ieri sera e il giorno in cui finisce', () => {
    const oggi = piuGiorni(ultimo, 1)
    const p = previsioneSede(righe, { oggi })
    expect(p.giorniPrevisti[0]).toBe(oggi)
    const f = p.gusti.find(g => g.gusto === 'FONDENTE')
    expect(f.previsti[0].kg).toBeCloseTo(6, 0)
    expect(f.previsti[0].basso).toBeLessThanOrEqual(f.previsti[0].kg)
    expect(f.previsti[0].alto).toBeGreaterThanOrEqual(f.previsti[0].kg)
    expect(f.scorta.data).toBe(ultimo)
    expect(f.finisce).not.toBeNull()
    expect(f.lotto.kg).toBe(13)
  })

  it('dati di oggi (registrati la sera): prevede da domani', () => {
    const p = previsioneSede(righe, { oggi: ultimo })
    expect(p.giorniPrevisti[0]).toBe(piuGiorni(ultimo, 1))
    expect(p.giorniVecchi).toBe(0)
  })

  it('con due giorni di buco la scorta non si dà: non si sa cosa è stato prodotto', () => {
    const p = previsioneSede(righe, { oggi: piuGiorni(ultimo, 2) })
    expect(p.stato).toBe('ok')
    expect(p.gusti.every(g => g.scorta === null && g.finisce === null)).toBe(true)
    expect(p.giorniPrevisti[0]).toBe(piuGiorni(ultimo, 2))
  })

  it('ordina per urgenza: prima chi finisce prima, poi chi basta oltre due settimane', () => {
    // Ogni giorno si rifà quello che si vende; la sera del 31/07 in vetrina
    // restano: CREMA 2 kg (ne vende 4: finisce domani), YOGURT 10 kg (ne vende
    // 4: finisce fra tre giorni), MANGO 50 kg (ne vende 1: oltre l'orizzonte).
    const fissi = [['MANGO', 1, 50], ['YOGURT', 4, 10], ['CREMA', 4, 2]].flatMap(([g, v, ultima]) =>
      Array.from({ length: 40 }, (_, i) => {
        const d = piuGiorni('2026-06-22', i)
        return d === ultimo ? riga(g, d, { prod: v + ultima - 6, riman: ultima }) : riga(g, d, { prod: v, riman: 6 })
      }))
    const p = previsioneSede(fissi, { oggi: piuGiorni(ultimo, 1) })
    expect(p.gusti.map(g => g.gusto)).toEqual(['CREMA', 'YOGURT', 'MANGO'])
    expect(p.gusti[0].finisce).toBe(piuGiorni(ultimo, 1))
    expect(p.gusti[1].finisce).toBe(piuGiorni(ultimo, 3))
    expect(p.gusti[2].finisce).toBeNull()
  })

  it('ordina per urgenza anche sui dati simulati a lotti', () => {
    const p = previsioneSede(righe, { oggi: piuGiorni(ultimo, 1) })
    const date = p.gusti.map(g => g.finisce).filter(Boolean)
    expect(date).toEqual([...date].sort())
    // chi non si sa quando finisce sta in fondo
    const primoNull = p.gusti.findIndex(g => !g.finisce)
    if (primoNull >= 0) expect(p.gusti.slice(primoNull).every(g => !g.finisce)).toBe(true)
  })

  it('i giorni di chiusura non sono fra i giorni previsti', () => {
    const oggi = piuGiorni(ultimo, 1)
    const chiuso = d => d === piuGiorni(oggi, 1)
    const p = previsioneSede(righe, { oggi, chiuso })
    expect(p.giorniPrevisti).not.toContain(piuGiorni(oggi, 1))
    expect(p.giorniPrevisti).toHaveLength(3)
  })

  it('con `base` si guarda la previsione come sarebbe stata quel giorno, senza il futuro', () => {
    const p = previsioneSede(righe, { oggi: '2026-10-03', base: '2026-07-15' })
    expect(p.simulata).toBe(true)
    expect(p.ultimoDato).toBe('2026-07-14')
    expect(p.base).toBe('2026-07-15')
    const cieca = previsioneSede(righe.filter(r => r.data < '2026-07-15'), { oggi: '2026-07-15' })
    expect(p.gusti.map(g => g.previsti[0].kg)).toEqual(cieca.gusti.map(g => g.previsti[0].kg))
  })

  it('il totale del giorno è la somma dei gusti, con la sua banda (non la somma delle bande)', () => {
    const r = rng(11)
    const rumorose = 'ABCDEF'.split('').flatMap((g, k) => simula({ gusto: g, vendite: () => (2 + k) * (0.6 + 0.8 * r()), giorni: 61, lotto: 20, soglia: 8, scorta: 12 }))
    const p = previsioneSede(rumorose, { oggi: piuGiorni(ultimo, 1) })
    p.totali.forEach((t, i) => {
      expect(t.kg).toBeCloseTo(p.gusti.reduce((s, g) => s + g.previsti[i].kg, 0), 9)
      expect(t.basso).toBeLessThanOrEqual(t.kg)
      expect(t.alto).toBeGreaterThanOrEqual(t.kg)
    })
    // gli errori dei gusti si compensano: la banda del totale, in proporzione,
    // è più stretta della somma delle bande dei gusti
    const t0 = p.totali[0]
    const sommaBande = p.gusti.reduce((s, g) => s + (g.previsti[0].alto - g.previsti[0].basso), 0)
    expect(t0.alto - t0.basso).toBeLessThan(sommaBande)
    // ...e anche della banda che verrebbe dagli scarti dei singoli gusti
    // messi tutti insieme: con sei gusti che sbagliano ognuno per conto suo,
    // il totale sbaglia molto meno di ciascuno
    const ctx = creaContesto(rumorose)
    const bandaGusti = bandaDaErrori(1, [], ctx.rapportiSede(p.base), p.livelloBanda)
    expect((t0.alto - t0.basso) / t0.kg).toBeLessThan(0.7 * (bandaGusti.alto - bandaGusti.basso))
    expect(p.erroreTotale.giorni).toBeGreaterThan(10)
  })

  it('il confronto del totale è un giorno medio dell’ultima settimana', () => {
    const p = previsioneSede(righe, { oggi: piuGiorni(ultimo, 1) })
    const atteso = p.gusti.reduce((s, g) => s + g.ritmo.kgGiorno, 0) * p.correzione
    expect(p.mediaGiorno).toBeCloseTo(atteso, 9)
    // 6 + 2 + 4 kg al giorno
    expect(p.mediaGiorno).toBeCloseTo(12, 0)
  })

  it('conta le conte della vetrina non affidabili delle ultime 4 settimane', () => {
    const conVuote = simula({ gusto: 'FONDENTE', vendite: costante(6), giorni: 61, lotto: 13, soglia: 7, scorta: 8, casellaVuota: true })
    const p = previsioneSede(conVuote, { oggi: piuGiorni(ultimo, 1) })
    const attese = conVuote.filter(x => x.data >= piuGiorni(ultimo, -27) && x.produzione_g > 0).length
    expect(p.conte.totale).toBe(28)
    expect(p.conte.inaffidabili).toBe(attese)
    expect(attese).toBeGreaterThan(5)
    expect(previsioneSede(righe, { oggi: piuGiorni(ultimo, 1) }).conte.inaffidabili).toBe(0)
  })

  it('dice l’errore passato per gusto e per sede', () => {
    const p = previsioneSede(righe, { oggi: piuGiorni(ultimo, 1) })
    expect(p.erroreSede.giorni).toBeGreaterThan(20)
    for (const g of p.gusti) expect(g.errore.giorni).toBeGreaterThan(5)
  })
})
