// ── Gli ingredienti in ordine di quantità, e la riga che non scappa ────
//
// Richiesta del titolare, 17/09/2026: «quando modifico una ricetta e vedo la
// lista degli ingredienti fammeli vedere in ordine di qty e aggiornameli live
// in base alla qty che metto, e dammi la possibilità di ordinare le colonne
// toccando le etichette».
//
// Prima era in ordine alfabetico — una sua richiesta del 13/07/2026. Per
// quantità è più utile quando si lavora sul food cost: quello che pesa sta in
// cima, e sotto ci sono i grammi che non spostano niente.
//
// Il punto delicato è il «live». Se la riga si sposta MENTRE il dito è dentro
// il campo, si finisce a scrivere nella riga sbagliata: su un telefono è
// quasi garantito. Per questo l'ordine si CONGELA quando un campo prende il
// fuoco e si scioglie quando lo perde — si riordina nel momento in cui si
// passa alla riga dopo, che è quando serve vederlo.
//
// Qui si prova la regola dell'ordinamento come funzione pura, senza disegnare
// la pagina: è la stessa `useSortable` che ordina tutte le tabelle del
// prodotto, e quello che va protetto è il criterio, non il pixel.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const VISTA = readFileSync(join(__dirname, '..', '..', 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')

// La stessa funzione di confronto che usa `useSortable`, applicata al
// criterio scritto nella vista.
const ordina = (righe, chiave, verso = 'desc') => {
  const valore = (r) => {
    if (chiave === 'nome') return String(r.ing.nome || '')
    if (chiave === 'costo') return Number(r.ing.costo) || 0
    return Number(r.ing.qty1stampo) || 0
  }
  const mul = verso === 'desc' ? -1 : 1
  return [...righe].sort((a, b) => {
    const va = valore(a), vb = valore(b)
    return typeof va === 'string' ? mul * va.localeCompare(vb) : mul * (va - vb)
  })
}

const RIGHE = [
  { ing: { nome: 'ZUCCHERO', qty1stampo: 180, costo: 0.18 }, originalIndex: 0 },
  { ing: { nome: 'ACQUA', qty1stampo: 620, costo: 0 }, originalIndex: 1 },
  { ing: { nome: 'NEUTRO', qty1stampo: 5, costo: 0.42 }, originalIndex: 2 },
  { ing: { nome: 'PASTA NOCCIOLA', qty1stampo: 95, costo: 3.80 }, originalIndex: 3 },
]

describe('l’ordine di partenza è la quantità', () => {
  it('il più pesante sta in cima', () => {
    expect(ordina(RIGHE, 'qty1stampo').map(r => r.ing.nome))
      .toEqual(['ACQUA', 'ZUCCHERO', 'PASTA NOCCIOLA', 'NEUTRO'])
  })

  it('e non è più alfabetico', () => {
    // La richiesta del 13/07 (alfabetico) è stata superata da quella del
    // 17/09 (per quantità). Si prova con un caso in cui i due ordini DANNO
    // RISULTATI DIVERSI, altrimenti l'asserzione non distingue niente:
    // per quantità comincia con ACQUA (620 g), in alfabetico pure — quindi
    // si guarda la coda, dove i due ordini divergono davvero.
    const perPeso = ordina(RIGHE, 'qty1stampo').map(r => r.ing.nome)
    const perNome = ordina(RIGHE, 'nome', 'asc').map(r => r.ing.nome)
    expect(perPeso).not.toEqual(perNome)
    expect(perPeso.at(-1)).toBe('NEUTRO')      // il più leggero, 5 g
    expect(perNome.at(-1)).toBe('ZUCCHERO')    // l'ultimo in alfabeto
    expect(VISTA).toContain("useSortable('qty1stampo', 'desc')")
    expect(VISTA).not.toContain("Ordine alfabetico per nome (richiesta utente 13/07/2026)")
  })
})

describe('le colonne si ordinano toccando l’etichetta', () => {
  it('per nome', () => {
    expect(ordina(RIGHE, 'nome', 'asc').map(r => r.ing.nome))
      .toEqual(['ACQUA', 'NEUTRO', 'PASTA NOCCIOLA', 'ZUCCHERO'])
  })

  it('per costo, che è la domanda vera quando si lavora sul food cost', () => {
    expect(ordina(RIGHE, 'costo').map(r => r.ing.nome)[0]).toBe('PASTA NOCCIOLA')
  })

  it('la vista usa SortTH, lo stesso delle altre tabelle', () => {
    // Non un'intestazione cliccabile scritta a mano: quella non avrebbe il
    // fuoco da tastiera né Invio/Spazio.
    expect(VISTA).toContain('<SortTH k="nome"')
    expect(VISTA).toContain('<SortTH k="qty1stampo"')
    expect(VISTA).toContain('<SortTH k="costo"')
  })
})

describe('la riga non scappa sotto il dito mentre si scrive', () => {
  it('entrando in un campo l’ordine si congela', () => {
    expect(VISTA).toMatch(/onFocus=\{\(\) => setOrdineCongelato\(prev => prev \|\| righeVisibili\.map/)
  })

  it('uscendo si scioglie, e il riordino avviene lì', () => {
    expect(VISTA).toMatch(/onBlur=\{\(\) => setOrdineCongelato\(null\)\}/)
  })

  it('finché è congelato l’ordine resta quello di prima, anche se la quantità cambia', () => {
    const congelato = [1, 0, 3, 2]   // l'ordine per quantità del momento
    const posizione = new Map(congelato.map((idx, n) => [idx, n]))
    // NEUTRO diventa il più pesante mentre ci si scrive dentro
    const dopo = RIGHE.map(r => r.originalIndex === 2 ? { ...r, ing: { ...r.ing, qty1stampo: 9999 } } : r)
    const visibili = [...dopo].sort((a, b) =>
      (posizione.get(a.originalIndex) ?? 1e9) - (posizione.get(b.originalIndex) ?? 1e9))
    expect(visibili.map(r => r.ing.nome)).toEqual(['ACQUA', 'ZUCCHERO', 'PASTA NOCCIOLA', 'NEUTRO'])
    // e appena si esce, NEUTRO sale in cima
    expect(ordina(dopo, 'qty1stampo').map(r => r.ing.nome)[0]).toBe('NEUTRO')
  })

  it('una riga nuova, che il congelato non conosce, finisce in fondo invece di sparire', () => {
    const posizione = new Map([[0, 0], [1, 1]])
    const righe = [{ ing: { nome: 'NUOVO' }, originalIndex: 9 }, { ing: { nome: 'A' }, originalIndex: 0 }]
    const visibili = [...righe].sort((a, b) =>
      (posizione.has(a.originalIndex) ? posizione.get(a.originalIndex) : 1e9)
      - (posizione.has(b.originalIndex) ? posizione.get(b.originalIndex) : 1e9))
    expect(visibili.map(r => r.ing.nome)).toEqual(['A', 'NUOVO'])
  })
})

describe('quello che c’è intorno', () => {
  it('l’indice originale non segue l’ordine a schermo', () => {
    // Modifica e rimozione agiscono su `form.ingredienti` per indice: se
    // seguisse l'ordine visivo si cancellerebbe la riga sbagliata.
    expect(VISTA).toContain('originalIndex')
    expect(VISTA).toMatch(/removeIng\(i\)/)
  })

  it('le spiegazioni delle colonne passano da SortTH, non da title scritti a mano', () => {
    const blocco = VISTA.slice(VISTA.indexOf('<SortTH k="nome"'), VISTA.indexOf('<SortTH k="nome"') + 900)
    expect(blocco).toContain('tip=')
  })
})
