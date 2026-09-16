// ── «+51.654% FC tollerabile» ──────────────────────────────────────────
//
// Difetto vero, 16/09/2026, visto entrando nel P&L con l'account del
// titolare di Mara dei Boschi. Nella tabella «Sensitivity: impatto aumento
// costi» una riga diceva:
//
//     MANGO JERRY SPICY     +51.654% FC tollerabile
//
// Cinquantunmila per cento. Il conto è `(ricavo / food cost - 1) × 100`: una
// divisione, e dividere per un numero quasi zero fa esplodere il risultato.
// A quella ricetta mancavano i prezzi di quasi tutti gli ingredienti, quindi
// il food cost calcolato era una briciola. Il costo non era basso: era
// **incompleto**.
//
// Il filtro che c'era, `fc > 0`, non poteva accorgersene: bastava un solo
// ingrediente col prezzo perché il costo fosse «maggiore di zero».
//
// Perché conta: «puoi assorbire un rincaro del 50.000%» e «non so quanto
// costa questo prodotto» sono frasi opposte, e quella vera è la seconda. È la
// stessa regola del food cost a zero nelle chiusure — un dato che non c'è non
// si scrive come se ci fosse.
//
// Le righe sapevano già quali ingredienti erano senza prezzo (`fcParziale`):
// mancava solo guardarlo.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { righeSensibilita, margineDiSicurezza } from '../../src/lib/plSensibilita.js'

// Il caso vero, con i numeri che producono quel 51.654%.
const MANGO = { nome: 'MANGO JERRY SPICY', ricavo: 517.54, fc: 1.0, fcParziale: true }
const FICO = { nome: 'FICO', ricavo: 120, fc: 40, fcParziale: false }
const SENZA_PREZZO = { nome: 'BASE BIANCA', ricavo: 0, fc: 30, fcParziale: false }
const SENZA_COSTO = { nome: 'PISTACCHIO', ricavo: 90, fc: 0, fcParziale: false }

describe('il difetto: un costo incompleto produce un numero assurdo', () => {
  it('la formula, su un food cost a briciole, dà davvero decine di migliaia di punti', () => {
    // Questo è il numero che finiva a schermo. Serve a ricordare che il
    // problema non è la formula: è a chi la si applica.
    expect(margineDiSicurezza(MANGO)).toBeCloseTo(51654, 0)
  })

  it('il vecchio filtro «fc > 0» lo lasciava passare', () => {
    // Come era prima: bastavano ricavo e costo maggiori di zero.
    const vecchioFiltro = [MANGO, FICO].filter(r => r.ricavo > 0 && r.fc > 0)
    expect(vecchioFiltro.map(r => r.nome)).toContain('MANGO JERRY SPICY')
  })
})

describe('la correzione: chi non sa rispondere resta fuori', () => {
  it('il prodotto col costo incompleto non è più in tabella', () => {
    const { validi } = righeSensibilita([MANGO, FICO])
    expect(validi.map(r => r.nome)).toEqual(['FICO'])
  })

  it('e viene contato col suo motivo, separato dagli altri', () => {
    const r = righeSensibilita([MANGO, FICO, SENZA_PREZZO, SENZA_COSTO])
    expect(r.costoIncompleto).toBe(1)   // MANGO: prezzi ingredienti mancanti
    expect(r.senzaPrezzo).toBe(2)       // BASE BIANCA e PISTACCHIO
    expect(r.validi.map(x => x.nome)).toEqual(['FICO'])
  })

  it('i due motivi non si sovrappongono e tornano col totale', () => {
    const righe = [MANGO, FICO, SENZA_PREZZO, SENZA_COSTO]
    const r = righeSensibilita(righe)
    expect(r.senzaPrezzo + r.costoIncompleto).toBe(r.nEsclusi)
    expect(r.validi.length + r.nEsclusi).toBe(righe.length)
  })
})

describe('quello che c\'è intorno continua a funzionare', () => {
  it('un prodotto completo resta, col suo margine di sicurezza sensato', () => {
    const { validi } = righeSensibilita([FICO])
    expect(validi).toHaveLength(1)
    expect(margineDiSicurezza(FICO)).toBeCloseTo(200, 0)  // 120/40 = 3 → +200%
  })

  it('senza ricavo o senza costo la domanda non ha risposta: null, non zero', () => {
    expect(margineDiSicurezza(SENZA_PREZZO)).toBeNull()
    expect(margineDiSicurezza(SENZA_COSTO)).toBeNull()
    expect(margineDiSicurezza(null)).toBeNull()
  })

  it('un elenco vuoto o non valido non fa esplodere niente', () => {
    expect(righeSensibilita([]).nEsclusi).toBe(0)
    expect(righeSensibilita(undefined).validi).toEqual([])
  })

  it('un prodotto in perdita resta in tabella: è proprio quello da vedere', () => {
    const perdita = { nome: 'IN PERDITA', ricavo: 30, fc: 50, fcParziale: false }
    expect(righeSensibilita([perdita]).validi).toHaveLength(1)
    expect(margineDiSicurezza(perdita)).toBeCloseTo(-40, 0)
  })
})

describe('la regola sta in un posto solo', () => {
  it('il P&L usa la funzione, non la riscrive a mano', () => {
    const pl = readFileSync(join(__dirname, '..', '..', 'src', 'views', 'PLView.jsx'), 'utf8')
    expect(pl).toContain('righeSensibilita(rows)')
    expect(pl).toContain('margineDiSicurezza(r)')
    // Se qualcuno reinserisce il filtro debole, questo test lo ferma.
    expect(pl).not.toMatch(/rows\.filter\(r => r\.ricavo > 0 && r\.fc > 0\)/)
  })

  it('e dice a chi legge perché quei prodotti mancano', () => {
    const pl = readFileSync(join(__dirname, '..', '..', 'src', 'views', 'PLView.jsx'), 'utf8')
    expect(pl).toContain('food cost incompleto')
  })
})
