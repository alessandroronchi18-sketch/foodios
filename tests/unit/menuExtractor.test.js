// Estrazione del listino di un cliente da testo o fotografie.
//
// Serve alla demo personalizzata: il titolare carica il listino vero di chi
// sta per incontrare, e il programma gli genera tre mesi di storia con quei
// prodotti. È la cosa che il cliente vede per prima, prima ancora di
// comprare, e va bene per definizione.
//
// 111 righe senza nemmeno un test fino al 15/09/2026. Scrivendoli è saltato
// fuori un difetto: un prodotto **senza prezzo** finiva nella demo a
// cinquanta centesimi.

import { describe, it, expect, vi } from 'vitest'
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))

const { normalizeMenu, menuToRicettario, extractMenuFromInput } = await import('../../src/lib/menuExtractor')

const prodotto = (x = {}) => ({
  nome: 'TIRAMISÙ', categoria: 'Dolci al cucchiaio', tipo: 'pezzo', unita: 1, prezzo: 4.5,
  ingredienti: [{ nome: 'mascarpone', qty_g: 200 }, { nome: 'savoiardi', qty_g: 100 }],
  ...x,
})

describe('normalizeMenu: quando si ferma', () => {
  it('senza un oggetto non si va da nessuna parte', () => {
    for (const v of [null, undefined, 'testo', 42]) {
      expect(() => normalizeMenu(v), String(v)).toThrow(/formato non valido/)
    }
  })

  it('nessun prodotto: lo dice a chi sta preparando la demo', () => {
    expect(() => normalizeMenu({ prodotti: [] })).toThrow(/Nessun prodotto estratto/)
    expect(() => normalizeMenu({})).toThrow(/Nessun prodotto estratto/)
  })

  it('tutti malformati: si ferma invece di consegnare un listino vuoto', () => {
    expect(() => normalizeMenu({ prodotti: [{ nome: '' }, { nome: 'X' }] }))
      .toThrow(/malformati/)
  })
})

describe('normalizeMenu: il prezzo', () => {
  it('un prodotto senza prezzo NON entra a cinquanta centesimi', () => {
    // Il difetto: `clamp(Number(p.prezzo) || 0, 0.50, 80)` e poi
    // `if (prezzo <= 0) continue` — una riga che non poteva mai scattare,
    // perché il minimo del clamp è 0,50. Una Sacher senza prezzo entrava
    // nella demo a 0,50 €, e ce ne si accorgeva davanti al cliente.
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'SACHER', prezzo: null }),
      prodotto({ nome: 'CROSTATA', prezzo: 0 }),
      prodotto({ nome: 'BABÀ', prezzo: 'quattro euro' }),
      prodotto({ nome: 'BIGNÈ', prezzo: 2.5 }),
    ] })
    expect(r.prodotti.map(p => p.nome)).toEqual(['BIGNÈ'])
    expect(r.scartati).toHaveLength(3)
    expect(r.scartati.every(s => s.motivo === 'senza prezzo')).toBe(true)
  })

  it('un prezzo fuori scala viene riportato dentro, non buttato', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'MINI', prezzo: 0.10 }),
      prodotto({ nome: 'MAXI', prezzo: 500 }),
    ] })
    expect(r.prodotti.find(p => p.nome === 'MINI').prezzo).toBe(0.5)
    expect(r.prodotti.find(p => p.nome === 'MAXI').prezzo).toBe(80)
  })

  it('il prezzo si arrotonda al centesimo', () => {
    const r = normalizeMenu({ prodotti: [prodotto({ prezzo: 4.5678 })] })
    expect(r.prodotti[0].prezzo).toBe(4.57)
  })
})

describe('normalizeMenu: i nomi', () => {
  it('maiuscolo, senza caratteri strani, al massimo 45 lettere', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'tiramisù al caffè' }),
      prodotto({ nome: 'Torta "Sacher" (grande)!' }),
      prodotto({ nome: 'A'.repeat(60) }),
    ] })
    const nomi = r.prodotti.map(p => p.nome)
    expect(nomi[0]).toBe('TIRAMISÙ AL CAFFÈ')
    expect(nomi[1]).toBe('TORTA SACHER GRANDE')
    expect(nomi[2]).toHaveLength(45)
  })

  it('gli accenti italiani sopravvivono', () => {
    // Un listino italiano senza accenti è un listino sbagliato.
    const r = normalizeMenu({ prodotti: [prodotto({ nome: 'BABÀ · PERCHÉ · CAFFÈ · PIÙ · PERÒ' })] })
    expect(r.prodotti[0].nome).toContain('BABÀ')
    expect(r.prodotti[0].nome).toContain('CAFFÈ')
  })

  it('due prodotti con lo stesso nome diventano uno', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'SACHER', prezzo: 30 }),
      prodotto({ nome: 'sacher', prezzo: 25 }),
    ] })
    expect(r.prodotti).toHaveLength(1)
    expect(r.prodotti[0].prezzo).toBe(30)   // vince il primo
  })

  it('un nome di una lettera sola non è un prodotto', () => {
    expect(() => normalizeMenu({ prodotti: [prodotto({ nome: 'X' })] })).toThrow(/malformati/)
  })
})

describe('normalizeMenu: tipo, unità, categoria', () => {
  it('«fetta» porta con sé quante fette, fra 4 e 16', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'SACHER', tipo: 'fetta', unita: 8 }),
      prodotto({ nome: 'CROSTATA', tipo: 'fetta', unita: 2 }),
      prodotto({ nome: 'MILLEFOGLIE', tipo: 'fetta', unita: 100 }),
      prodotto({ nome: 'BAVARESE', tipo: 'fetta', unita: null }),
    ] })
    const u = Object.fromEntries(r.prodotti.map(p => [p.nome, p.unita]))
    expect(u).toEqual({ SACHER: 8, CROSTATA: 4, MILLEFOGLIE: 16, BAVARESE: 8 })
  })

  it('«pezzo» e «gusto» valgono sempre uno', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'BIGNÈ', tipo: 'pezzo', unita: 12 }),
      prodotto({ nome: 'NOCCIOLA', tipo: 'gusto', unita: 12 }),
    ] })
    expect(r.prodotti.every(p => p.unita === 1)).toBe(true)
  })

  it('«kg» è il vecchio nome di «gusto» e si traduce', () => {
    const r = normalizeMenu({ prodotti: [prodotto({ nome: 'NOCCIOLA', tipo: 'kg' })] })
    expect(r.prodotti[0].tipo).toBe('gusto')
  })

  it('un tipo inventato diventa «pezzo»', () => {
    const r = normalizeMenu({ prodotti: [prodotto({ tipo: 'vaschetta' })] })
    expect(r.prodotti[0].tipo).toBe('pezzo')
  })

  it('una categoria che non esiste diventa «Altro»', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'SACHER', categoria: 'Torte' }),
      prodotto({ nome: 'BABÀ', categoria: 'Roba buona' }),
      prodotto({ nome: 'BIGNÈ', categoria: undefined }),
    ] })
    const c = Object.fromEntries(r.prodotti.map(p => [p.nome, p.categoria]))
    expect(c).toEqual({ SACHER: 'Torte', BABÀ: 'Altro', BIGNÈ: 'Altro' })
  })
})

describe('normalizeMenu: gli ingredienti', () => {
  it('senza ingredienti il prodotto non entra, e si dice perché', () => {
    const r = normalizeMenu({ prodotti: [
      prodotto({ nome: 'BUONO' }),
      prodotto({ nome: 'VUOTO', ingredienti: [] }),
      prodotto({ nome: 'SENZA', ingredienti: null }),
    ] })
    expect(r.prodotti.map(p => p.nome)).toEqual(['BUONO'])
    expect(r.scartati.map(s => s.motivo)).toEqual(['senza ingredienti', 'senza ingredienti'])
  })

  it('i nomi diventano minuscoli con gli spazi uniti', () => {
    const r = normalizeMenu({ prodotti: [prodotto({ ingredienti: [{ nome: 'Farina 00 Tipo A', qty_g: 500 }] })] })
    expect(r.prodotti[0].ingredienti[0].nome).toBe('farina_00_tipo_a')
  })

  it('le quantità stanno fra 5 e 3000 grammi', () => {
    const r = normalizeMenu({ prodotti: [prodotto({ ingredienti: [
      { nome: 'sale', qty_g: 1 }, { nome: 'farina', qty_g: 99999 }, { nome: 'burro', qty_g: 300 },
    ] })] })
    const q = Object.fromEntries(r.prodotti[0].ingredienti.map(i => [i.nome, i.qty1stampo]))
    expect(q).toEqual({ sale: 5, farina: 3000, burro: 300 })
  })

  it('al massimo otto ingredienti', () => {
    const molti = Array.from({ length: 20 }, (_, i) => ({ nome: `ing${i}`, qty_g: 50 }))
    const r = normalizeMenu({ prodotti: [prodotto({ ingredienti: molti })] })
    expect(r.prodotti[0].ingredienti.length).toBeLessThanOrEqual(8)
  })

  it('un ingrediente senza nome si salta, gli altri restano', () => {
    const r = normalizeMenu({ prodotti: [prodotto({ ingredienti: [
      { nome: '', qty_g: 100 }, { nome: '!!!', qty_g: 100 }, { nome: 'burro', qty_g: 100 },
    ] })] })
    expect(r.prodotti[0].ingredienti).toEqual([{ nome: 'burro', qty1stampo: 100 }])
  })
})

describe('normalizeMenu: i dati dell\'attività', () => {
  it('nome, città e tipo si tengono, tagliati se lunghissimi', () => {
    const r = normalizeMenu({
      nome_attivita: 'N'.repeat(200), citta: 'C'.repeat(200), tipo_attivita: 'T'.repeat(200),
      prodotti: [prodotto()],
    })
    expect(r.nome_attivita).toHaveLength(100)
    expect(r.citta).toHaveLength(60)
    expect(r.tipo_attivita).toHaveLength(30)
  })

  it('se mancano, restano vuoti invece di dire «undefined»', () => {
    const r = normalizeMenu({ prodotti: [prodotto()] })
    expect(r).toMatchObject({ nome_attivita: '', citta: '', tipo_attivita: '' })
  })
})

describe('menuToRicettario', () => {
  it('ogni prodotto diventa una ricetta con la sua chiave', () => {
    const menu = normalizeMenu({ prodotti: [prodotto({ nome: 'SACHER', tipo: 'fetta', unita: 8, prezzo: 30 })] })
    const { ricette } = menuToRicettario(menu)
    expect(Object.keys(ricette)).toEqual(['SACHER'])
    expect(ricette.SACHER).toMatchObject({ nome: 'SACHER', tipo: 'fetta', unita: 8, prezzo: 30 })
    expect(ricette.SACHER.ingredienti[0]).toHaveProperty('qty1stampo')
  })

  it('gli ingredienti noti arrivano con un costo stimato, segnato come stima', () => {
    const menu = normalizeMenu({ prodotti: [prodotto({ ingredienti: [{ nome: 'mascarpone', qty_g: 200 }] })] })
    const { ingredienti_costi } = menuToRicettario(menu)
    expect(ingredienti_costi.mascarpone).toMatchObject({ isStima: true })
    expect(ingredienti_costi.mascarpone.costoG).toBeGreaterThan(0)
  })

  it('un ingrediente sconosciuto non prende un costo inventato', () => {
    // Meglio lasciarlo al listino HORECA del calcolo food cost che
    // attribuirgli un numero a caso.
    const menu = normalizeMenu({ prodotti: [prodotto({ ingredienti: [{ nome: 'ingrediente_mai_visto', qty_g: 100 }] })] })
    const { ingredienti_costi } = menuToRicettario(menu)
    expect(ingredienti_costi.ingrediente_mai_visto).toBeUndefined()
  })

  it('lo stesso ingrediente in due ricette si scrive una volta sola', () => {
    const menu = normalizeMenu({ prodotti: [
      prodotto({ nome: 'SACHER', ingredienti: [{ nome: 'mascarpone', qty_g: 100 }] }),
      prodotto({ nome: 'BABÀ', ingredienti: [{ nome: 'mascarpone', qty_g: 300 }] }),
    ] })
    const { ingredienti_costi, ricette } = menuToRicettario(menu)
    expect(Object.keys(ingredienti_costi)).toEqual(['mascarpone'])
    expect(Object.keys(ricette)).toEqual(['SACHER', 'BABÀ'])
  })

  it('un menu vuoto dà un ricettario vuoto, non un errore', () => {
    expect(menuToRicettario({ prodotti: [] })).toEqual({ ricette: {}, ingredienti_costi: {} })
  })
})

describe('extractMenuFromInput: cosa rifiuta prima di chiamare l\'AI', () => {
  it('senza testo e senza foto non parte', async () => {
    await expect(extractMenuFromInput({})).rejects.toThrow(/almeno una foto o del testo/)
    await expect(extractMenuFromInput({ text: '', images: [] })).rejects.toThrow(/almeno una foto/)
  })

  it('più di otto foto no', async () => {
    const foto = Array.from({ length: 9 }, () => ({ base64: 'x', media_type: 'image/jpeg' }))
    await expect(extractMenuFromInput({ images: foto })).rejects.toThrow(/Massimo 8 foto/)
  })

  it('senza sessione lo dice in italiano, non «401»', async () => {
    await expect(extractMenuFromInput({ text: 'Sacher 30 euro' })).rejects.toThrow(/Sessione scaduta/)
  })
})
