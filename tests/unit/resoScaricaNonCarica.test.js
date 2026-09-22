// ── Un reso scarica. Non carica. ────────────────────────────────────────
//
// ── Il difetto, trovato dall'audit del 22/09/2026 ───────────────────────
//
// DESA stampa su ogni riga delle sue bolle una colonna «T», con la legenda
// in fondo al documento:
//
//     (V)=Vendita (M)=Sconto in merce (O)=Omaggio (I)=Omaggio Riv. Iva
//     (R)=Reso (N)=Reso Inv.
//
// Una riga marcata R o N è merce che **torna indietro**. `classificaRiga`
// lo riconosceva e diceva `segno: -1`… e **nessuno lo leggeva**.
// `preparaScrittureBolla` faceva `giacenza_g + g` sempre, senza guardare il
// verso: un reso di 4 litri di panna ne **aggiungeva** quattro invece di
// toglierne quattro.
//
// Cioè: la giacenza sbagliava del **doppio** della quantità resa, e in
// silenzio. È il difetto più grave che possa esserci in questo flusso,
// perché tutto il resto del prodotto — food cost, riordino, valore del
// magazzino — è costruito sopra quella giacenza.
//
// Il difetto era invisibile ai test perché le due metà erano giuste
// separatamente: la classificazione diceva la cosa giusta, la scrittura
// faceva la cosa giusta per il caso normale. Nessuna prova le metteva
// insieme. Questo file le mette insieme.
import { describe, it, expect } from 'vitest'
import { preparaScrittureBolla, preparaBolla } from '../../src/lib/bolle.js'

const DOC = { fornitore: 'DESA', numero: '004617/002', identita: 'desa|004617002|2026-09-19' }
const stato = () => ({
  magazzino: { panna: { nome: 'Panna', giacenza_g: 10000, soglia_g: 2000 } },
  logRif: [], ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } }, logPrezzi: [],
})
const riga = (extra) => ({ chiave: 'panna', nome: 'Panna', grammi: 4000, azione: 'nessuna', ...extra })

describe('Il verso del movimento', () => {
  it('una consegna somma', () => {
    const r = preparaScrittureBolla([riga({ segno: 1 })], DOC, stato())
    expect(r.magazzino.panna.giacenza_g).toBe(14000)
  })

  it('un reso sottrae', () => {
    // È il difetto: prima faceva 14.000 g, cioè otto litri di errore su
    // quattro resi.
    const r = preparaScrittureBolla([riga({ segno: -1 })], DOC, stato())
    expect(r.magazzino.panna.giacenza_g).toBe(6000)
  })

  it('e senza il campo si comporta come una consegna, come ieri', () => {
    // Retrocompatibilità: chi passa righe senza `segno` — i test vecchi, un
    // import, una bolla scritta a mano — non cambia comportamento.
    const r = preparaScrittureBolla([riga({})], DOC, stato())
    expect(r.magazzino.panna.giacenza_g).toBe(14000)
  })

  it('un valore strano nel campo non diventa un segno meno', () => {
    for (const s of [0, null, undefined, 'meno', -2, NaN]) {
      const r = preparaScrittureBolla([riga({ segno: s })], DOC, stato())
      expect(r.magazzino.panna.giacenza_g, String(s)).toBe(14000)
    }
  })
})

describe('Lo storico dei carichi racconta cos\'è successo', () => {
  it('la riga del reso è negativa', () => {
    const r = preparaScrittureBolla([riga({ segno: -1 })], DOC, stato())
    expect(r.logRif[0].quantita_g).toBe(-4000)
  })

  it('e si legge che è un reso, non una riga negativa senza spiegazione', () => {
    const r = preparaScrittureBolla([riga({ segno: -1 })], DOC, stato())
    expect(r.logRif[0].note).toMatch(/^reso — bolla DESA/)
  })

  it('una consegna normale mantiene la nota di prima', () => {
    const r = preparaScrittureBolla([riga({ segno: 1 })], DOC, stato())
    expect(r.logRif[0].note).toBe('bolla DESA n. 004617/002')
    expect(r.logRif[0].note).not.toMatch(/reso/)
  })
})

describe('Un reso che porta la giacenza sotto zero', () => {
  it('si registra com\'è, senza tagliare a zero', () => {
    // Nascondere il taglio vorrebbe dire far sparire il problema invece del
    // sintomo: il magazzino ha già lo stato «negativo» per dire che c'è un
    // errore di registrazione, ed è lì che va visto.
    const r = preparaScrittureBolla([riga({ segno: -1, grammi: 25000 })], DOC, stato())
    expect(r.magazzino.panna.giacenza_g).toBe(-15000)
  })

  it('e di una materia prima che non c\'è in magazzino', () => {
    const r = preparaScrittureBolla(
      [{ chiave: 'burro', nome: 'Burro', grammi: 3000, segno: -1, azione: 'nessuna' }],
      DOC, stato(),
    )
    expect(r.magazzino.burro.giacenza_g).toBe(-3000)
  })
})

describe('Il prezzo di un reso non tocca il listino', () => {
  it('la riga classificata reso non porta nessuna azione sul prezzo', () => {
    // Un documento che va nell'altro verso non è una trattativa sul prezzo.
    const [r] = preparaBolla(
      [{ nome: 'panna', quantita: 4, unita: 'LT', tipoRiga: 'R', prezzoUnitario: '99,00', imponibile: '396,00' }],
      { ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } } },
    )
    expect(r.classe).toBe('reso')
    expect(r.segno).toBe(-1)
    expect(r.azione).toBe('nessuna')
  })

  it('e registrandola il listino resta quello di prima', () => {
    const righe = preparaBolla(
      [{ nome: 'panna', quantita: 4, unita: 'LT', tipoRiga: 'R', prezzoUnitario: '99,00', imponibile: '396,00' }],
      { ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } } },
    ).map(r => ({ ...r, esisteInElenco: true }))
    const out = preparaScrittureBolla(righe, DOC, stato())
    expect(out.ingredientiCosti.panna.costoKg).toBe(4.98)
    expect(out.applicati).toBe(0)
  })
})

describe('Dalla colonna T fino alla giacenza, tutto il percorso', () => {
  it('«R» sulla bolla diventa meno quattro litri in magazzino', () => {
    // Le due metà erano giuste separatamente, e insieme sbagliavano: questa
    // prova è quella che mancava.
    const righe = preparaBolla(
      [{ nome: 'panna', quantita: 4, unita: 'LT', tipoRiga: 'R', imponibile: '19,92' }],
      { ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } } },
    ).map(r => ({ ...r, esisteInElenco: true }))
    const out = preparaScrittureBolla(righe, DOC, stato())
    // La panna pesa 1,01 kg al litro: quattro litri sono 4.040 g.
    expect(out.magazzino.panna.giacenza_g).toBeLessThan(10000)
    expect(out.logRif[0].quantita_g).toBeLessThan(0)
  })

  it('e «V» sulla stessa bolla li aggiunge', () => {
    const righe = preparaBolla(
      [{ nome: 'panna', quantita: 4, unita: 'LT', tipoRiga: 'V', imponibile: '19,92' }],
      { ingredientiCosti: { panna: { costoKg: 4.98, costoG: 0.00498 } } },
    ).map(r => ({ ...r, esisteInElenco: true }))
    const out = preparaScrittureBolla(righe, DOC, stato())
    expect(out.magazzino.panna.giacenza_g).toBeGreaterThan(10000)
  })
})
