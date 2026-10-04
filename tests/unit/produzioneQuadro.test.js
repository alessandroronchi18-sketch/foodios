// ── I conti nuovi della pagina Produzione ─────────────────────────────────
//
// Rifondazione dell'Analisi, 03/10/2026. L'audit dello Storico elencava le
// cose che al titolare servono e che la pagina non aveva: la riga della
// vetrina («in vetrina all'inizio + prodotto − venduto − scarto = in vetrina
// alla fine»), le sedi affiancate, il giorno della settimana, quanto di ogni
// gusto si vende e per quanti giorni resta in vetrina, i buchi nel foglio.
//
// Sui dati veri di Mara (verificati il 03/10): Carlina 10-30/08 la riga
// torna al grammo (100,5 + 1.381,9 − 1.381,3 = 101,1 kg); tutte le sedi
// 10-30/08 non torna di 1,0 kg per una casella senza rimanenza, e la
// pagina lo dice invece di far quadrare per forza; Carlina ha un buco il
// 19/08.
import { describe, it, expect } from 'vitest'
import {
  bilancioVetrina, perGiornoDellaSettimana, sediAffiancate, andamentoGusti, serieVenduto,
  buchiRegistrazione, vendutoPerGiorno,
} from '../../src/lib/produzioneQuadro.js'
import { giorniRegistrati } from '../../src/lib/produzioneAnalisi.js'

const r = (data, prod, riman, extra = {}) => ({
  sede_id: 'A', gusto_nome: 'NOCCIOLA', data, produzione_g: prod, rimanenza_g: riman, scarto_g: 0, spedito_g: 0, ricevuto_g: 0, ...extra,
})

describe('La riga della vetrina', () => {
  // Domenica 9 restano 2 kg. Lunedì 10: fatti 6, restano 3 (venduti 5).
  // Martedì 11: fatti 2, buttati 0,5, restano 1 (venduti 3,5).
  const righe = [r('2026-08-09', 0, 2000), r('2026-08-10', 6000, 3000), r('2026-08-11', 2000, 1000, { scarto_g: 500 })]

  it('inizio + prodotto − scarto − venduto = fine, al grammo', () => {
    const b = bilancioVetrina(righe, { da: '2026-08-10', a: '2026-08-11' })
    expect(b.inizioG).toBe(2000)
    expect(b.prodottoG).toBe(8000)
    expect(b.scartoG).toBe(500)
    expect(b.vendutoG).toBe(8500)
    expect(b.fineG).toBe(1000)
    expect(b.differenzaG).toBe(0)
    expect(b.torna).toBe(true)
    expect(b.scartoRegistrato).toBe(true)
  })

  it('i chili spediti e arrivati da un\'altra sede entrano nella riga', () => {
    const b = bilancioVetrina([
      r('2026-08-09', 0, 2000), r('2026-08-10', 1000, 1000, { spedito_g: 1500, ricevuto_g: 500 }),
    ], { da: '2026-08-10', a: '2026-08-10' })
    // 2 + 1 + 0,5 − 1,5 − venduto = 1  → venduto 1
    expect(b.vendutoG).toBe(1000)
    expect(b.differenzaG).toBe(0)
  })

  it('con una rimanenza non scritta non fa quadrare per forza: dice la differenza', () => {
    const b = bilancioVetrina([r('2026-08-09', 0, 2000), r('2026-08-10', 6000, null), r('2026-08-11', 0, 1000)],
      { da: '2026-08-10', a: '2026-08-11' })
    expect(b.celleNonCalcolabili).toBeGreaterThan(0)
    expect(b.torna).toBe(false)
  })

  it('senza nessuno scarto scritto lo dice', () => {
    expect(bilancioVetrina(righe.map(x => ({ ...x, scarto_g: 0 })), { da: '2026-08-10', a: '2026-08-11' }).scartoRegistrato).toBe(false)
  })

  it('con due sedi si somma sede per sede', () => {
    const due = [...righe, ...righe.map(x => ({ ...x, sede_id: 'B' }))]
    const b = bilancioVetrina(due, { da: '2026-08-10', a: '2026-08-11' })
    expect(b.inizioG).toBe(4000)
    expect(b.vendutoG).toBe(17000)
    expect(b.differenzaG).toBe(0)
  })
})

describe('Il giorno della settimana', () => {
  it('media dei soli giorni registrati; un giorno mai registrato è null, non zero', () => {
    // Lunedì 10 e lunedì 17: venduti 5 e 3 kg → media 4. Martedì 11: 1 kg.
    const righe = [
      r('2026-08-09', 0, 0), r('2026-08-10', 5000, 0), r('2026-08-11', 2000, 1000),
      r('2026-08-16', 0, 0), r('2026-08-17', 3000, 0),
    ]
    const g = perGiornoDellaSettimana(righe, { da: '2026-08-10', a: '2026-08-17' })
    expect(g[0]).toMatchObject({ nome: 'Lunedì', nGiorni: 2, mediaG: 4000 })
    expect(g[1]).toMatchObject({ nome: 'Martedì', nGiorni: 1, mediaG: 1000 })
    expect(g[2].mediaG).toBeNull()
    expect(g[6].nome).toBe('Domenica')
  })
  it('il venduto per giorno somma le sedi', () => {
    const righe = [r('2026-08-09', 0, 0), r('2026-08-10', 5000, 0), r('2026-08-09', 0, 0, { sede_id: 'B' }), r('2026-08-10', 1000, 0, { sede_id: 'B' })]
    expect(vendutoPerGiorno(righe, { da: '2026-08-10', a: '2026-08-10' })).toEqual({ '2026-08-10': 6000 })
  })
})

describe('Le sedi affiancate', () => {
  it('una riga per sede, la più venduta prima, coi giorni registrati', () => {
    const righe = [
      r('2026-08-09', 0, 0), r('2026-08-10', 5000, 1000),
      r('2026-08-09', 0, 0, { sede_id: 'B' }), r('2026-08-10', 9000, 1000, { sede_id: 'B' }), r('2026-08-11', 0, 500, { sede_id: 'B' }),
    ]
    const s = sediAffiancate(righe, { da: '2026-08-10', a: '2026-08-11' })
    expect(s.map(x => x.sedeId)).toEqual(['B', 'A'])
    expect(s[0]).toMatchObject({ giorni: 2, ultimo: '2026-08-11', prodottoG: 9000, vendutoG: 8500, fineG: 500 })
    expect(s[1]).toMatchObject({ giorni: 1, vendutoG: 4000 })
  })
})

describe('L\'andamento per gusto', () => {
  const righe = [
    r('2026-08-09', 0, 0), r('2026-08-10', 5000, 2000), r('2026-08-11', 0, 1000),   // settimana 33
    r('2026-08-17', 4000, 2000),                                                       // settimana 34
  ]
  const a = andamentoGusti(righe, { da: '2026-08-10', a: '2026-08-23' })
  it('venduto per settimana, con le settimane in ordine', () => {
    expect(a.settimane).toEqual(['2026-W33', '2026-W34'])
    expect(a.gusti.NOCCIOLA.perSettimana).toEqual([4000, 3000])
  })
  it('quanto del prodotto si vende', () => {
    expect(a.gusti.NOCCIOLA.quotaVenduta).toBeCloseTo((7000 / 9000) * 100, 6)
  })
  it('per quanti giorni basta la vetrina: rimanenza media / venduto medio di un giorno', () => {
    // vetrina media (2+1+2)/3 = 1,667 kg; venduto medio 7/3 = 2,333 kg
    expect(a.gusti.NOCCIOLA.giorniVetrina).toBeCloseTo((5000 / 3) / (7000 / 3), 6)
  })
})

describe('La serie del grafico', () => {
  const righe = [r('2026-08-09', 0, 2000), r('2026-08-10', 6000, 0), r('2026-08-11', 0, 4600), r('2026-08-17', 1000, 4000)]
  it('per settimana, con il prodotto accanto, i giorni e le caselle da sistemare', () => {
    const s = serieVenduto(righe, { da: '2026-08-10', a: '2026-08-23' })
    expect(s.map(x => x.chiave)).toEqual(['2026-W33', '2026-W34'])
    expect(s[0]).toMatchObject({ vendutoG: 8000 - 4600, prodottoG: 6000, giorni: 2, daSistemare: 1 })
    expect(s[1].giorni).toBe(1)
  })
  it('la domenica sta nella settimana del lunedì prima, non di quello dopo', () => {
    const s = serieVenduto([r('2026-08-15', 0, 2000), r('2026-08-16', 1000, 1000), r('2026-08-17', 1000, 500)],
      { da: '2026-08-16', a: '2026-08-17' })
    expect(s.map(x => [x.chiave, x.giorni])).toEqual([['2026-W33', 1], ['2026-W34', 1]])
  })
  it('per giorno e per mese', () => {
    expect(serieVenduto(righe, { da: '2026-08-10', a: '2026-08-11', passo: 'giorno' }).map(x => x.chiave)).toEqual(['2026-08-10', '2026-08-11'])
    expect(serieVenduto(righe, { da: '2026-08-10', a: '2026-08-23', passo: 'mese' }).map(x => x.chiave)).toEqual(['2026-08'])
  })
})

describe('I buchi nel foglio', () => {
  it('i giorni senza niente fra il primo e l\'ultimo registrato', () => {
    const g = giorniRegistrati([r('2026-08-17', 1000, 0), r('2026-08-18', 1000, 0), r('2026-08-20', 1000, 0)], {})
    expect(buchiRegistrazione(g)).toEqual(['2026-08-19'])
  })
  it('con un giorno solo, o nessuno, niente buchi', () => {
    expect(buchiRegistrazione(giorniRegistrati([r('2026-08-17', 1000, 0)], {}))).toEqual([])
    expect(buchiRegistrazione(null)).toEqual([])
  })
})

// ── Il giorno della settimana falsato dalla rimanenza lasciata a zero ─────
// Trovato il 04/10/2026 sui dati veri (01/07-31/08): «Il martedì vendi di
// più (272 kg al giorno)», ma 141 caselle con la rimanenza lasciata a 0
// cadevano di martedì: almeno 574 kg contati il martedì invece del mercoledì.
import { giorniFalsati, SOGLIA_GIORNO_FALSATO } from '../../src/lib/produzioneQuadro.js'
import { caselleDaSistemare } from '../../src/lib/inventarioProduzione.js'

describe('Il giorno della settimana falsato', () => {
  // Due settimane, NOCCIOLA: ogni giorno 5 kg fatti, 1 kg lasciato (5
  // venduti). I martedì la rimanenza è rimasta a 0: il martedì «vende» 6 kg,
  // il mercoledì 4 (−1 rispetto al vero) ... e la casella del mercoledì non
  // è negativa. Per avere la casella negativa vera: il mercoledì non si
  // produce, e resta 1 kg: venduto = 0 + 0 − 1 = −1 kg.
  const righe = []
  const t = new Date('2026-08-02T12:00:00Z')   // domenica
  for (let i = 0; i < 15; i++) {
    const d = t.toISOString().slice(0, 10)
    const g = t.getUTCDay()
    if (g === 2) righe.push(r(d, 5000, 0))          // martedì: rimanenza lasciata a 0
    else if (g === 3) righe.push(r(d, 0, 1000))     // mercoledì: niente fatto, resta 1 kg
    else righe.push(r(d, 5000, 1000))
    t.setUTCDate(t.getUTCDate() + 1)
  }
  const da = '2026-08-03', a = '2026-08-16'
  const settimana = perGiornoDellaSettimana(righe, { da, a })
  const caselle = caselleDaSistemare(righe, { da, a })

  it('senza la misura il martedì sembra il giorno migliore (il difetto)', () => {
    const mar = settimana.find(g => g.nome === 'Martedì')
    const lun = settimana.find(g => g.nome === 'Lunedì')
    expect(mar.mediaG).toBeGreaterThan(lun.mediaG)
  })

  it('martedì e mercoledì sono falsati, gli altri no', () => {
    const f = giorniFalsati(settimana, caselle)
    expect(f.filter(g => g.falsato).map(g => g.nome)).toEqual(['Martedì', 'Mercoledì'])
    const mar = f.find(g => g.nome === 'Martedì')
    const mer = f.find(g => g.nome === 'Mercoledì')
    // Due caselle da −1 kg: il martedì le prende, il mercoledì le perde.
    expect(mar.presiKg).toBeCloseTo(2, 6)
    expect(mar.persiKg).toBe(0)
    expect(mer.persiKg).toBeCloseTo(2, 6)
    expect(mer.presiKg).toBe(0)
  })

  it('sotto la soglia del 10% il giorno non è falsato', () => {
    expect(SOGLIA_GIORNO_FALSATO).toBe(0.1)
    // Il martedì ha venduto 12 kg in due giorni (6 + 6), spostati 2: il 16,7%.
    expect(giorniFalsati(settimana, caselle, { soglia: 0.17 }).find(g => g.nome === 'Martedì').falsato).toBe(false)
    expect(giorniFalsati(settimana, caselle, { soglia: 0.16 }).find(g => g.nome === 'Martedì').falsato).toBe(true)
  })

  it('se il giorno da sistemare è prima del periodo, conta solo il giorno che ha perso', () => {
    const c = caselleDaSistemare(righe, { da: '2026-08-05', a })
    const f = giorniFalsati(perGiornoDellaSettimana(righe, { da: '2026-08-05', a }), c)
    // Il martedì 04/08 è fuori: il martedì 11 prende 1 kg solo.
    expect(f.find(g => g.nome === 'Martedì').presiKg).toBeCloseTo(1, 6)
    expect(f.find(g => g.nome === 'Mercoledì').persiKg).toBeCloseTo(2, 6)
  })

  it('le caselle che non tornano per altri motivi non spostano niente', () => {
    const f = giorniFalsati(settimana, caselle.map(c => ({ ...c, causa: 'non-torna' })))
    expect(f.every(g => !g.falsato && g.spostatiKg === 0)).toBe(true)
  })
})
