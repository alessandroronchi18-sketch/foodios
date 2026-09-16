// La riconciliazione bancaria spunta gli abbinamenti giusti.
//
// Trovato il 16/09/2026 guardando lo Scadenzario, che è il file più grande del
// prodotto senza test (3.119 righe, 0,7% coperto) e quello che tocca i soldi:
// il titolare ha appena detto che Mara paga **tutti** i fornitori con
// bonifico, quindi questa è la strada da cui passano i pagamenti.
//
// Cos'era. Caricando l'estratto conto, le uscite abbinate con certezza
// partono già spuntate e le altre no — «la conferma è un gesto, non un
// automatismo», dice il commento. Ma gli indici venivano contati sulla lista
// FILTRATA:
//
//     new Set(abbinamenti.filter(a => a.certezza === 'certo').map((a, i) => i))
//
// Con tre uscite [incerta, certa, certa] il filtro ne dà due e gli indici
// {0, 1}; nella lista intera quei due indici puntano alla PRIMA (incerta) e
// alla seconda. Quindi partiva spuntata un'uscita da controllare, una sicura
// restava fuori, e alla conferma **venivano segnate pagate le fatture
// sbagliate**.
//
// Si vedeva solo quando la prima uscita del file non era sicura: è il motivo
// per cui era rimasto lì.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'components', 'Scadenzario.jsx'), 'utf8')

// Come si scelgono, adesso.
const preSpuntati = (abbinamenti) => new Set(abbinamenti.reduce((acc, a, i) => {
  if (a.certezza === 'certo') acc.push(i)
  return acc
}, []))
// Come si sceglievano prima: si tiene per far vedere che il test coglie la
// differenza, e non passerebbe sul codice di ieri.
const preSpuntatiPrima = (abbinamenti) => new Set(abbinamenti.filter(a => a.certezza === 'certo').map((a, i) => i))

const A = { certezza: 'probabile', movimento: { importo: 100 }, fatture: [{ id: 'f1' }] }
const B = { certezza: 'certo',     movimento: { importo: 200 }, fatture: [{ id: 'f2' }] }
const C = { certezza: 'certo',     movimento: { importo: 300 }, fatture: [{ id: 'f3' }] }

describe('quali uscite partono spuntate', () => {
  it('quelle sicure, e solo quelle — anche se non sono le prime', () => {
    const scelti = preSpuntati([A, B, C])
    expect([...scelti].sort()).toEqual([1, 2])
  })

  it('e il difetto di prima spuntava proprio quella da controllare', () => {
    // La prova che il test coglie la differenza.
    const prima = preSpuntatiPrima([A, B, C])
    expect([...prima].sort()).toEqual([0, 1])
    expect(prima.has(0)).toBe(true)          // A, che è «probabile»
    expect(prima.has(2)).toBe(false)         // C, che è sicura, restava fuori
  })

  it('le fatture che verrebbero segnate pagate sono quelle giuste', () => {
    // È il conto che fa `applicaAbbinamenti`: indicizza la lista INTERA.
    const abbinamenti = [A, B, C]
    const scelte = [...preSpuntati(abbinamenti)].map(i => abbinamenti[i])
    expect(scelte.map(x => x.fatture[0].id)).toEqual(['f2', 'f3'])
    // Con il conto di prima si sarebbe pagata f1, che nessuno aveva
    // confermato, e non f3.
    const sbagliate = [...preSpuntatiPrima(abbinamenti)].map(i => abbinamenti[i])
    expect(sbagliate.map(x => x.fatture[0].id)).toEqual(['f1', 'f2'])
  })

  it('con le sicure in testa i due conti coincidevano: per questo non si vedeva', () => {
    const abbinamenti = [B, C, A]
    expect([...preSpuntati(abbinamenti)].sort()).toEqual([0, 1])
    expect([...preSpuntatiPrima(abbinamenti)].sort()).toEqual([0, 1])
  })

  it('senza nessuna sicura non parte spuntato niente', () => {
    expect(preSpuntati([A, { ...A, certezza: 'incerto' }]).size).toBe(0)
  })

  it('e con tutte sicure partono tutte', () => {
    expect([...preSpuntati([B, C, { ...B, certezza: 'certo' }])].sort()).toEqual([0, 1, 2])
  })

  it('una lista vuota non rompe niente', () => {
    expect(preSpuntati([]).size).toBe(0)
  })
})

describe('la correzione è nel codice vero', () => {
  it('gli indici si contano sulla lista intera', () => {
    expect(SRC).toMatch(/scelti: new Set\(abbinamenti\.reduce\(\(acc, a, i\) => \{/)
    expect(SRC).not.toMatch(/abbinamenti\.filter\(a => a\.certezza === 'certo'\)\.map\(\(a, i\) => i\)/)
  })

  it('e chi applica indicizza la stessa lista', () => {
    expect(SRC).toMatch(/\[\.\.\.banca\.scelti\]\.map\(i => banca\.abbinamenti\[i\]\)/)
  })

  it('la spunta resta un gesto: le incerte non partono segnate', () => {
    expect(SRC).toMatch(/a\.certezza === 'certo'/)
  })
})
