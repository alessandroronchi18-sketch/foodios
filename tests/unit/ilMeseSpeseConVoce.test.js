// 05/10/2026 — Il mese: ora che alcuni fornitori hanno una voce (Foodinho →
// Commissioni, commercialisti → Servizi, DPTEC → Attrezzature e lavori, METRO
// Italia → Altre spese, le fatture non della gelateria → Fuori conto), il
// conto deve metterle nelle righe giuste e lasciare «Fuori conto» fuori da
// tutto: spese, «Da classificare», investimenti. Quello che resta senza voce
// resta in «Da classificare», dichiarato.
// Titolo dei negozi: senza l'utile diceva solo «I negozi uno accanto all'altro»;
// ora dice quale lascia di più prima del personale, e la scheda dà quel
// numero col suo nome invece di «non lo so».
import { describe, it, expect } from 'vitest'
import { costiPerMese } from '../../src/lib/contoEconomico.js'
import { mappaCategorie } from '../../src/lib/contoEconomicoArchivio.js'
import { contoDelMese, incassiDelMese, personaleDelMese } from '../../src/lib/ilMese.js'
import { titoloSedi } from '../../src/views/IlMeseView.jsx'

const FORNITORI = [
  { id: 1, nome: 'Foodinho S.r.l.', categoria: 'Commissioni' },
  { id: 2, nome: 'Studio Rossi Commercialisti', categoria: 'Servizi' },
  { id: 3, nome: 'DPTEC S.r.l.', categoria: 'Attrezzature e lavori' },
  { id: 4, nome: 'METRO Italia Cash and Carry', categoria: 'Altre spese' },
  { id: 5, nome: 'Societa Sorella S.r.l.', categoria: 'Fuori conto' },
  { id: 6, nome: 'Fornitore Ignoto', categoria: null },
]
const fatt = (id, fornitore, importo) => ({ id, fornitore, data_fattura: '2026-08-10', totale: importo * 1.22, imponibile: importo, imposta: importo * 0.22, tipo: 'fattura', sede_id: null })
const FATTURE = [fatt('a', 'Foodinho S.r.l.', 1000), fatt('b', 'Studio Rossi Commercialisti', 500), fatt('c', 'DPTEC S.r.l.', 8000),
  fatt('d', 'METRO Italia Cash and Carry', 700), fatt('e', 'Societa Sorella S.r.l.', 20000), fatt('f', 'Fornitore Ignoto', 300)]

const conto = () => {
  const { categoriePerFornitore } = mappaCategorie(FORNITORI)
  const costi = costiPerMese(FATTURE, { mese: '2026-08', categoriePerFornitore })
  const incassi = incassiDelMese({ stima: { ricavi: 22000 } })
  const personale = personaleDelMese([{ attivo: true, stipendio_lordo_mensile: null }], { mese: '2026-08' })
  return contoDelMese({ incassi, costi, personale })
}
const gruppo = (c, k) => c.gruppi.find(g => g.chiave === k).importo

describe('Le spese con la voce vera, e «Fuori conto» fuori', () => {
  it('ogni fornitore finisce nella sua riga del conto', () => {
    const c = conto()
    expect(gruppo(c, 'servizi')).toBe(1500) // Foodinho 1.000 (commissioni) + commercialista 500
    expect(gruppo(c, 'altre')).toBe(700) // METRO
    expect(c.daClassificare).toBe(300) // solo l'ignoto
  })

  it('«Fuori conto» non entra in nessuna somma', () => {
    const c = conto()
    expect(c.speseFatture).toBe(1000 + 500 + 700 + 300) // 2.500: senza i 20.000 della società sorella
    expect(c.passi.map(p => p.etichetta)).not.toContain('Fuori conto')
  })

  it('gli investimenti (DPTEC) stanno fuori dalle spese e sono detti a parte', () => {
    const c = conto()
    expect(c.investimenti).toBe(8000)
    expect(c.speseFatture).toBeLessThan(8000)
  })

  it('il numero che si sa: incassi 20.000 − spese 2.500 = 17.500 prima del personale', () => {
    // 22.000 con IVA al 10% = 20.000 senza IVA
    expect(conto().primaDelPersonale).toBe(17500)
    expect(conto().utile).toBeNull()
  })
})

describe('I negozi senza utile', () => {
  const sede = (nome, ricavi, prima) => ({ sede: { id: nome, nome }, conto: { utile: null, ricavi, primaDelPersonale: prima, quote: {} } })
  it('il titolo dice quale lascia di più prima del personale', () => {
    const t = titoloSedi({ a: sede('Carlina', 40000, 10000), b: sede('Berthollet', 30000, 15000), c: sede('De Gasperi', 20000, 2000) })
    expect(t).toBe('Berthollet è il negozio che lascia di più, prima del personale')
  })
  it('se di un solo negozio si sa il numero, non si fa una classifica', () => {
    expect(titoloSedi({ a: sede('Carlina', 40000, 10000), b: sede('Berthollet', 30000, null) })).toBe('I negozi uno accanto all\'altro')
  })
  it('con l\'utile di due negozi vale ancora il titolo di prima', () => {
    const u = (nome, q) => ({ sede: { id: nome, nome }, conto: { utile: 1000, ricavi: 5000, quote: { utile: q } } })
    expect(titoloSedi({ a: u('Carlina', 10), b: u('Berthollet', 25) })).toBe('Berthollet è il negozio che rende di più')
  })
})
