// Il tipo di una ricetta non cambia da solo.
//
// Segnalato dal titolare il 16/09/2026, mentre caricava il ricettario vero:
// «se modifico un gusto, magari la qty di un ingrediente, e salvo, mi modifica
// il tipo e da gusto mi passa a fette e mi scasina tutti i calcoli».
//
// Cos'era. Il campo `tipo` manca su tutte le ricette arrivate da un file: nel
// ricettario di Mara dei Boschi (gelateria) erano **venti su trenta**. Quando
// manca, `getR` risponde «fetta», perché una scheda deve pur disegnare
// qualcosa. Ma quel ripiego finiva dentro il modulo di modifica, e al primo
// salvataggio diventava il dato: un gelato al pistacchio usciva come torta da
// otto fette, e da lì in poi ricavo, margine, food cost, cassa e produzione
// contavano un'altra cosa.
//
// Due correzioni, in due punti diversi:
//  1. il tipo non era ignoto: tutte e venti quelle ricette avevano
//     `categoria: "Gusto"`, scritta dall'importazione. Adesso si guarda anche
//     lì, perché è una dichiarazione dell'utente e non una deduzione nostra;
//  2. quando davvero non lo sa nessuno, `getR` marca la risposta con
//     `tipoPresunto`, e la scheda di modifica non la salva come se l'utente
//     l'avesse scelta.
//
// Qui si prova la correzione E quello che ci sta intorno: la catena di
// precedenza fra i tre posti in cui il tipo può essere scritto, i tipi che non
// sono prodotti da vendere, e il fatto che un tipo presunto non diventi mai un
// dato.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getR } from '../../src/lib/foodcost'
import { tipoDichiarato, isGustoTipo, isSemiOInterno, labelPlurale } from '../../src/lib/tipoRicetta'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('dove può stare scritto il tipo di una ricetta', () => {
  it('il campo `tipo` viene prima di tutto', () => {
    expect(tipoDichiarato({ tipo: 'gusto', categoria: 'Torte' })).toBe('gusto')
  })

  it('senza `tipo`, vale la categoria', () => {
    expect(tipoDichiarato({ categoria: 'Gusto' })).toBe('gusto')
    expect(tipoDichiarato({ categoria: 'Gusti' })).toBe('gusto')
    expect(tipoDichiarato({ categoria: 'Semilavorato' })).toBe('semilavorato')
    expect(tipoDichiarato({ categoria: 'Base' })).toBe('interno')
  })

  it('le maiuscole e gli spazi non contano', () => {
    expect(tipoDichiarato({ categoria: '  gusto  ' })).toBe('gusto')
    expect(tipoDichiarato({ tipo: ' GUSTO ' })).toBe('gusto')
  })

  it('quando non c\'è niente da leggere, risponde `null` e non un tipo a caso', () => {
    expect(tipoDichiarato({})).toBe(null)
    expect(tipoDichiarato(null)).toBe(null)
    expect(tipoDichiarato({ categoria: 'Torte' })).toBe(null)
    expect(tipoDichiarato({ categoria: '' })).toBe(null)
  })
})

describe('le venti ricette vere del ricettario di Mara', () => {
  // Forma esatta letta dal database il 16/09/2026: nome e categoria, senza
  // `tipo`, senza `unita`, senza `prezzo`.
  const comeInProduzione = ['BUNET', 'CAFFÈ', 'LIMONE', 'SACHER', 'MAROTTO', 'FONDENTE',
    'GIANDUIA', 'MANDORLA', 'NOCCIOLA', 'CARAMELLO', 'LANGAROLO', 'PISTACCHIO',
    'MARRON GLACE', 'FIOR DI PANNA', 'STRACCIATELLA']
    .map(nome => ({ nome, categoria: 'Gusto', ingredienti: [] }))

  it('sono gusti, non torte a fette', () => {
    for (const r of comeInProduzione) {
      const reg = getR(r.nome, r)
      expect(reg.tipo, r.nome).toBe('gusto')
      expect(isGustoTipo(reg.tipo), r.nome).toBe(true)
    }
  })

  it('e il tipo non è marcato come presunto: è dichiarato', () => {
    for (const r of comeInProduzione) {
      expect(getR(r.nome, r).tipoPresunto, r.nome).toBeUndefined()
    }
  })

  it('quindi si misurano in chili, non in fette', () => {
    for (const r of comeInProduzione) {
      expect(labelPlurale(getR(r.nome, r).tipo), r.nome).toBe('kg')
    }
  })
})

describe('quando il tipo non lo sa nessuno', () => {
  it('«fetta» è un ripiego, ed è marcato come tale', () => {
    const reg = getR('MISTERO', { nome: 'MISTERO', ingredienti: [] })
    expect(reg.tipo).toBe('fetta')
    expect(reg.tipoPresunto).toBe(true)
  })

  it('la scheda di modifica non salva un ripiego al posto di una scelta', () => {
    const src = readFileSync(join(RADICE, 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')
    expect(src).toMatch(/const tipoIniziale = reg\.tipoPresunto \? empty\.tipo : reg\.tipo/)
    expect(src).toMatch(/tipo: tipoIniziale/)
  })
})

describe('quello che ci sta intorno: i tipi che non si vendono', () => {
  it('una base non diventa un prodotto da vendere', () => {
    const reg = getR('BASE BIANCA', { nome: 'BASE BIANCA', categoria: 'Base', ingredienti: [] })
    expect(reg.tipo).toBe('interno')
    expect(reg.unita).toBe(0)
    expect(reg.prezzo).toBe(0)
    expect(isSemiOInterno(reg.tipo)).toBe(true)
  })

  it('un semilavorato nemmeno', () => {
    const reg = getR('CREMA', { nome: 'CREMA', categoria: 'Semilavorati', ingredienti: [] })
    expect(reg.tipo).toBe('semilavorato')
    expect(reg.unita).toBe(0)
    expect(isSemiOInterno(reg.tipo)).toBe(true)
  })

  it('un prezzo di vendita non si inventa mai, qualunque sia il tipo', () => {
    for (const cat of ['Gusto', 'Base', 'Semilavorati', 'Torte', '']) {
      expect(getR('X', { nome: 'X', categoria: cat }).prezzo, cat).toBe(0)
    }
  })
})
