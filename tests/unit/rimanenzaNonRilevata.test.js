// Una casella non compilata non è «vetrina vuota». Costava 2.470 kg.
//
// ── Il difetto, e come è saltato fuori (audit magazzino, 16/09/2026) ──────
//
// Sui dati veri di Mara dei Boschi — 7.013 caselle (gusto × giorno × sede) fra
// il 01/05 e il 15/09/2026 — la partita doppia dell'inventario
//
//     venduto = rimanenza di ieri + prodotto oggi − rimanenza stasera
//               − scarto − spedito
//
// non tornava su 575 caselle (8,2%), per 2.587,9 kg.
// Berthollet −1.046,5 kg · Carlina −309,1 kg · De Gasperi −1.232,3 kg.
//
// Classificando quelle 575:
//
//   la rimanenza del giorno PRIMA valeva 0  ->  550 caselle, −2.469,6 kg (95,4%)
//   la rimanenza del giorno prima era > 0   ->   25 caselle,   −118,4 kg
//
// E dall'altro lato: delle 655 caselle che partono da una rimanenza a zero,
// 550 (l'84%) finiscono in negativo. Quando la rimanenza precedente è
// maggiore di zero, le negative sono 25 su 6.271, cioè lo 0,4%.
//
// Quello zero era falso, con tre prove indipendenti:
//   1. le righe con `rimanenza_g = 0` sono 660, e in 658 (99,7%) c'è
//      produzione lo stesso giorno, in media 5,87 kg. Hanno fatto sei chili
//      di un gusto e a fine giornata non ne restava un grammo, 658 volte;
//   2. il venduto che ne esce è il triplo del normale (10,06 kg contro 3,00);
//   3. ha la forma dell'abitudine di una persona: Berthollet lascia la
//      rimanenza a zero il martedì (43%) e il mercoledì (26,5%), De Gasperi
//      il mercoledì (63,6%). Un gusto che finisce davvero non sceglie il
//      giorno della settimana.
//
// La causa nel codice era in due punti:
//   a) `parseFoglioInventario` creava la riga dalla cella PROD con
//      `rimanenza_g: 0`, e poi saltava la cella RIMAN. vuota;
//   b) la colonna era `bigint NOT NULL DEFAULT 0`: anche volendo, non c'era
//      dove scrivere «non lo so» (migrazione 20260916c).
//
// Da qui la regola che questi test proteggono: la rimanenza può valere null,
// null vuol dire «non rilevato», e dove non si sa il venduto non si calcola.

import { describe, it, expect } from 'vitest'
import {
  parseFoglioInventario,
  diffConDb,
} from '../../src/lib/inventarioImport'
import {
  calcolaVendutoSettimana,
  serieVendutoMultiSede,
  rimanenzaDiPartenza,
  classificaGusti,
  kpiQuadraturaSettimana,
} from '../../src/lib/inventarioProduzione'
import { IMPORT_SCHEMAS } from '../../src/lib/importSchemas'

const riga = (gusto, data, p = {}) => ({
  gusto_nome: gusto, data,
  produzione_g: p.prod ?? 0,
  rimanenza_g: 'riman' in p ? p.riman : 0,
  scarto_g: p.scarto ?? 0,
  spedito_g: p.spedito ?? 0,
  ...(p.sede ? { sede_id: p.sede } : {}),
})

// ── 1. Il difetto che si riproduce: il foglio con la casella vuota ────────

describe('il foglio di Mara con la casella della rimanenza vuota', () => {
  // La matrice ha la forma del file vero: riga 0 con le date della settimana,
  // riga 1 con le intestazioni PROD/RIMAN. alternate, poi un gusto per riga.
  const matrice = [
    ['', 'LUN', '', 'MAR', '', 'MER', ''],
    ['GUSTI'],
    ['', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.', 'PROD', 'RIMAN.'],
    ['MAROTTO', '8000', '', '', '4800', '', ''],
  ]
  const lunedi = '2026-08-03'

  it('la casella vuota diventa null, non zero', () => {
    // Prima della correzione qui usciva `rimanenza_g: 0`, cioè «lunedì sera
    // in vetrina non c'era niente»: il martedì il venduto usciva −4.800 g.
    const out = parseFoglioInventario(matrice, lunedi)
    const lun = out.righe.find(r => r.data === lunedi && r.gusto_nome === 'MAROTTO')
    expect(lun).toBeTruthy()
    expect(lun.produzione_g).toBe(8000)
    expect(lun.rimanenza_g).toBe(null)
  })

  it('la casella scritta a zero resta zero: è un fatto, non un buco', () => {
    const conZero = [
      ['', 'LUN', ''],
      ['GUSTI'],
      ['', 'PROD', 'RIMAN.'],
      ['MAROTTO', '8000', '0'],
    ]
    const out = parseFoglioInventario(conZero, lunedi)
    const lun = out.righe.find(r => r.data === lunedi)
    expect(lun.rimanenza_g).toBe(0)
  })

  it('il venduto del giorno dopo non esce più negativo: non si calcola', () => {
    const out = parseFoglioInventario(matrice, lunedi)
    const matriceVenduto = calcolaVendutoSettimana(out.righe, lunedi)
    const martedi = matriceVenduto.MAROTTO['2026-08-04']
    expect(martedi.venduto).toBe(null)
    expect(martedi.motivo).toMatch(/non è stata scritta/)
  })
})

// ── 2. La correzione: cosa fa il motore quando la rimanenza è null ────────

describe('cellaVenduto con la rimanenza non rilevata', () => {
  it('se manca la rimanenza di OGGI il venduto di oggi non si calcola', () => {
    const righe = [
      riga('FIORDILATTE', '2026-06-15', { prod: 5000, riman: 1500 }),
      riga('FIORDILATTE', '2026-06-16', { prod: 3000, riman: null }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-06-15')
    const c = m.FIORDILATTE['2026-06-16']
    expect(c.venduto).toBe(null)
    expect(c.registrata).toBe(true)
    expect(c.motivo).toMatch(/la rimanenza di questo giorno non è stata scritta/)
  })

  it('se manca la rimanenza di IERI il venduto di oggi non si calcola', () => {
    const righe = [
      riga('FIORDILATTE', '2026-06-15', { prod: 8000, riman: null }),
      riga('FIORDILATTE', '2026-06-16', { prod: 0, riman: 4800 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-06-15')
    // Prima usciva 0 + 0 − 4800 = −4.800 g.
    expect(m.FIORDILATTE['2026-06-16'].venduto).toBe(null)
  })

  it('il motivo distingue «giorno assente» da «casella vuota»', () => {
    // Due rimedi diversi: nel primo caso il giorno va registrato, nel secondo
    // va riaperto il foglio e compilata una casella. Dirlo uguale non aiuta.
    const assente = calcolaVendutoSettimana(
      [riga('PISTACCHIO', '2026-06-16', { prod: 1000, riman: 200 })], '2026-06-15',
    )
    expect(assente.PISTACCHIO['2026-06-16'].motivo).toBe(
      'manca la rimanenza del giorno prima: il venduto non si può calcolare',
    )
    const vuota = calcolaVendutoSettimana([
      riga('PISTACCHIO', '2026-06-15', { prod: 1000, riman: null }),
      riga('PISTACCHIO', '2026-06-16', { prod: 1000, riman: 200 }),
    ], '2026-06-15')
    expect(vuota.PISTACCHIO['2026-06-16'].motivo).toBe(
      'la rimanenza del giorno prima non è stata scritta: il venduto non si può calcolare',
    )
  })

  it('il giorno dopo ancora riparte, non resta bloccato per sempre', () => {
    // La regola differenziale risale all'ultimo giorno REGISTRATO: se quello
    // ha la casella vuota, si ferma lì e basta, senza propagare il buco.
    const righe = [
      riga('CIOCCOLATO', '2026-06-15', { prod: 5000, riman: null }),
      riga('CIOCCOLATO', '2026-06-16', { prod: 0, riman: 3000 }),
      riga('CIOCCOLATO', '2026-06-17', { prod: 1000, riman: 500 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-06-15')
    expect(m.CIOCCOLATO['2026-06-16'].venduto).toBe(null)
    expect(m.CIOCCOLATO['2026-06-17'].venduto).toBe(3500)  // 3000 + 1000 − 500
  })
})

// ── 3. La famiglia: tutti gli altri posti che leggono la rimanenza ───────

describe('gli altri conti che toccano la rimanenza', () => {
  it('la giacenza di partenza dice «non lo so», non un numero più basso', () => {
    const righe = [
      riga('NOCCIOLA', '2026-06-15', { prod: 1000, riman: null, sede: 'A' }),
      riga('NOCCIOLA', '2026-06-15', { prod: 1000, riman: 2000, sede: 'B' }),
    ]
    // Due sedi, di una non sappiamo cosa è rimasto: la somma non si sa.
    // Prima usciva 2.000 g, cioè il gelato della sede A spariva.
    expect(rimanenzaDiPartenza(righe, '2026-06-16').NOCCIOLA.grammi).toBe(null)
  })

  it('la giacenza di partenza somma normalmente quando si sa tutto', () => {
    const righe = [
      riga('NOCCIOLA', '2026-06-15', { prod: 1000, riman: 500, sede: 'A' }),
      riga('NOCCIOLA', '2026-06-15', { prod: 1000, riman: 2000, sede: 'B' }),
    ]
    expect(rimanenzaDiPartenza(righe, '2026-06-16').NOCCIOLA.grammi).toBe(2500)
  })

  it('il residuo medio si fa sui giorni rilevati, non su tutti', () => {
    // Tre giorni, in uno la rimanenza non è scritta. Il residuo medio deve
    // essere la media dei due giorni noti (3.000 g), non la somma diviso tre
    // (2.000 g): con il terzo contato come zero un gusto che resta in vasca
    // sembrava girare, e la pagina non lo segnalava più come «soffre».
    const righe = [
      riga('MENTA', '2026-06-15', { prod: 4000, riman: 3000 }),
      riga('MENTA', '2026-06-16', { prod: 4000, riman: null }),
      riga('MENTA', '2026-06-17', { prod: 4000, riman: 3000 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-06-15')
    const { totale } = classificaGusti(m)
    const menta = totale.find(x => x.gusto === 'MENTA')
    expect(menta.residuoMedioG).toBe(3000)
  })

  it('la serie unita fra sedi non somma una rimanenza che non conosce', () => {
    const righe = [
      riga('MAROTTO', '2026-06-15', { prod: 1000, riman: 400, sede: 'A' }),
      riga('MAROTTO', '2026-06-16', { prod: 1000, riman: null, sede: 'A' }),
      riga('MAROTTO', '2026-06-15', { prod: 1000, riman: 600, sede: 'B' }),
      riga('MAROTTO', '2026-06-16', { prod: 1000, riman: 300, sede: 'B' }),
    ]
    const serie = serieVendutoMultiSede(righe)
    const g16 = serie.MAROTTO.find(c => c.data === '2026-06-16')
    expect(g16.riman).toBe(null)
    // Il venduto della sede che il conto ce l'ha resta buono, e si dichiara
    // che una sede non sa rispondere.
    expect(g16.venduto).toBe(1300)  // sede B: 600 + 1000 − 300
    expect(g16.nonCalcolabili).toBe(1)
  })

  it('la quadratura conta le celle non calcolabili invece di ignorarle', () => {
    const righe = [
      riga('NOCCIOLA', '2026-06-15', { prod: 5000, riman: null }),
      riga('NOCCIOLA', '2026-06-16', { prod: 0, riman: 3000 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-06-15')
    const k = kpiQuadraturaSettimana(m, [], 30)
    expect(k.celleNonCalcolabili).toBeGreaterThanOrEqual(2)
    expect(k.totVendutoG).toBe(0)
  })

  it('il confronto col database non scambia «vuoto» per «zero»', () => {
    // Se il file non porta la rimanenza e nel database c'è scritto 0, le due
    // righe NON sono identiche: una dice «non lo so», l'altra «vetrina
    // vuota». Prima finivano entrambe fra gli «identici» e la correzione non
    // veniva mai proposta.
    const d = diffConDb(
      [{ gusto_nome: 'MAROTTO', data: '2026-08-03', produzione_g: 8000, rimanenza_g: null }],
      [{ gusto_nome: 'MAROTTO', data: '2026-08-03', produzione_g: 8000, rimanenza_g: 0 }],
    )
    expect(d.identici).toHaveLength(0)
    expect(d.divergenti).toHaveLength(1)
  })

  it('lo schema di import lascia vuota la rimanenza invece di scriverci zero', () => {
    const f = IMPORT_SCHEMAS.produzione_inventario.fields.find(x => x.name === 'rimanenza_g')
    expect(f.default).toBe(null)
    expect(f.required).toBe(false)
    // La produzione invece resta a zero, ed è voluto: nel foglio del cliente
    // la colonna PROD è vuota esattamente quando quel giorno non si è
    // prodotto niente (2.559 righe su 7.013, e non sono loro a generare le
    // caselle negative).
    const p = IMPORT_SCHEMAS.produzione_inventario.fields.find(x => x.name === 'produzione_g')
    expect(p.default).toBe(0)
  })
})

// ── 4. Il righello: questi test saprebbero accorgersi del difetto? ───────

describe('controprova: col vecchio comportamento questi test fallirebbero', () => {
  it('trattare null come zero rimette il venduto negativo', () => {
    // Simuliamo il codice di prima: la casella vuota scritta come 0.
    const comePrima = [
      riga('MAROTTO', '2026-08-03', { prod: 8000, riman: 0 }),
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 4800 }),
    ]
    const m = calcolaVendutoSettimana(comePrima, '2026-08-03')
    // Ecco il difetto, esattamente come si vedeva sui dati di Mara.
    expect(m.MAROTTO['2026-08-04'].venduto).toBe(-4800)
    expect(m.MAROTTO['2026-08-04'].quadra).toBe(false)
  })

  it('la stessa settimana con la casella vuota non produce nessun negativo', () => {
    const corretto = [
      riga('MAROTTO', '2026-08-03', { prod: 8000, riman: null }),
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 4800 }),
    ]
    const m = calcolaVendutoSettimana(corretto, '2026-08-03')
    const celle = Object.values(m.MAROTTO)
    expect(celle.every(c => c.venduto == null || c.venduto >= 0)).toBe(true)
  })
})
