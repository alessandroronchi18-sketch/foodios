// ── Una vendita all'ingrosso annullata toglieva i chili e teneva i soldi ──
//
// Trovato il 04/10/2026 scrivendo la prova che il ricavo stimato è lo stesso
// numero nella Produzione, nel Mese e nella Quadratura (ricavoStimatoUguale).
// `kgB2B` saltava le vendite annullate, ma `scorporaB2B` e
// `kpiQuadraturaSettimana` sommavano il loro importo nel fatturato: 2 kg
// tornati in vetrina e 40 € incassati lo stesso.
//
// Nel Mese non si vedeva, perché `venditeB2BPeriodo` scarta le annullate
// già alla lettura. La Quadratura invece leggeva `vendite_b2b` da sola, senza
// chiedere lo stato: lì un'annullata contava chili e soldi. E chiedeva solo
// le vendite con una sede, mentre il Mese conta anche quelle senza: lo
// stesso ingrosso dava due incassi diversi. Adesso la Quadratura legge con
// `venditeB2BPeriodo`, e le due somme saltano le annullate anche se gliele si
// passa.
import { describe, it, expect } from 'vitest'
import { scorporaB2B, kpiQuadraturaSettimana, kgB2B } from '../../src/lib/inventarioProduzione.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const VENDITE = [
  { sede_id: 'A', totale: 40, stato: 'annullata', righe: [{ qta: 2, unita: 'kg' }] },
  { sede_id: 'A', totale: 25, stato: 'consegnata', righe: [{ qta: 1, unita: 'kg' }] },
]

describe('L\'ingrosso annullato non conta, né nei chili né nei soldi', () => {
  it('i chili: solo la vendita valida', () => {
    expect(kgB2B(VENDITE)).toBe(1)
  })
  it('scorporaB2B: fatturato 25 €, non 65', () => {
    const r = scorporaB2B({ kg: 10, euroKg: 30, venditeB2B: VENDITE })
    expect(r.ricaviB2b).toBe(25)
    expect(r.ricaviTotali).toBe(9 * 30 + 25)
  })
  it('la settimana della Quadratura: lo stesso', () => {
    const k = kpiQuadraturaSettimana({}, [], 30, VENDITE)
    expect(k.ricaviB2b).toBe(25)
    expect(k.b2bKg).toBe(1)
  })
  it('senza stato (vendite vecchie) la vendita conta', () => {
    expect(scorporaB2B({ kg: 10, euroKg: 30, venditeB2B: [{ totale: 25, righe: [{ qta: 1 }] }] }).ricaviB2b).toBe(25)
  })
  it('la Quadratura legge l\'ingrosso con la funzione del Mese, non da sola', () => {
    const src = readFileSync(join(process.cwd(), 'src/views/QuadraturaInventarioView.jsx'), 'utf8')
    expect(src).toMatch(/venditeB2BPeriodo\(orgId/)
    expect(src).not.toMatch(/from\('vendite_b2b'\)/)
  })
})
