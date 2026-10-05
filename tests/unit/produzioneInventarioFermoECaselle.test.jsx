// @vitest-environment happy-dom
//
// ── Produzione: l'inventario fermo si dice accanto al numero, e le caselle
//    si contano una volta sola (06/10/2026) ──────────────────────────────
//
// Difetto 1. La pagina si apre sugli ultimi due mesi FINO all'ultimo giorno
// registrato (31/08). A ottobre il «Venduto 11.787 kg» sembrava il dato di
// oggi: nessuna riga diceva «l'ultimo inventario è di 36 giorni fa», né col
// numero né nella copertura (che parlava di inventario fermo solo se il
// periodo scelto andava oltre l'ultimo giorno). Ora la copertura ha la voce
// «inventario fermo al 31/08» col pulsante Registra, e sotto il Venduto la
// frase dice da quanti giorni.
// Difetto 2. Con 343 caselle a rimanenza 0 e 16 che non tornano, la riga
// chiusa diceva «359 caselle da sistemare» e il riquadro «343 caselle da
// sistemare»: due numeri per la stessa cosa. Ora il riquadro apre col totale
// (359) e spiega 343 + 16.
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { vociCopertura } from '../../src/views/produzione/copertura.js'
import Tessere from '../../src/views/produzione/Tessere.jsx'
import CaselleDaSistemare from '../../src/views/produzione/CaselleDaSistemare.jsx'

const cop = { n: 61, primo: '2026-07-01', ultimo: '2026-08-31', sedeGiorni: 183 }
const base = { copertura: cop, daPartenza: true, azioni: { inventario: vi.fn(), giorni: vi.fn() } }

describe('inventario fermo, accanto al numero', () => {
  it('a 36 giorni dall\'ultimo giorno registrato la copertura lo dice e porta a Registra', () => {
    const v = vociCopertura({ ...base, oggi: '2026-10-06' }).find(x => x.id === 'inventarioFermo')
    expect(v).toBeTruthy()
    expect(v.breve).toMatch(/inventario fermo/i)
    expect(v.testo).toMatch(/36 giorni/)
    expect(v.sistemabile).toBe(true)
    expect(v.azione.etichetta).toBe('Registra')
  })
  it('intorno: un inventario di ieri non è fermo; senza `oggi` niente; periodo scelto a mano niente', () => {
    expect(vociCopertura({ ...base, oggi: '2026-09-02' }).some(x => x.id === 'inventarioFermo')).toBe(false)
    expect(vociCopertura({ ...base }).some(x => x.id === 'inventarioFermo')).toBe(false)
    expect(vociCopertura({ ...base, daPartenza: false, oggi: '2026-10-06' }).some(x => x.id === 'inventarioFermo')).toBe(false)
  })
  it('sotto il Venduto la frase dice da quanti giorni', () => {
    const totali = { vend: 11787, prod: 11779, scarto: 0, margine: 1, margPct: 80, nConMargine: 1, nConVendita: 1 }
    const { container } = render(<Tessere totali={totali} totaliPrev={null} confronto="nessuno" copertura={cop}
      scartoRegistrato={false} nGusti={1} fermoDa={36} isMobile={false} isTablet={false} />)
    expect(container.textContent).toMatch(/36 giorni senza inventario/)
  })
})

describe('caselle: un solo numero', () => {
  const riassunto = { n: 359, nRimanenza: 343, nAltre: 16, kgFuori: 0, kgAltre: -5 }
  const caselle = [{ sedeId: 's', gusto: 'MARO', giornoDaSistemare: '2026-08-17' }]
  it('il riquadro apre col totale uguale a quello della riga chiusa', () => {
    const { container } = render(<CaselleDaSistemare riassunto={riassunto} caselle={caselle} nomeSede={() => ''} />)
    expect(container.textContent).toMatch(/359 caselle da sistemare/)
    expect(container.textContent).toMatch(/343 con la rimanenza a 0/)
    expect(container.textContent).toMatch(/16 che non tornano/)
  })
  it('intorno: solo caselle a rimanenza 0, niente scomposizione; una casella sola', () => {
    const a = render(<CaselleDaSistemare riassunto={{ n: 3, nRimanenza: 3, nAltre: 0, kgFuori: 0, kgAltre: 0 }} caselle={caselle} nomeSede={() => ''} />)
    expect(a.container.textContent).toMatch(/3 caselle da sistemare/)
    expect(a.container.textContent).not.toMatch(/che non tornano/)
    a.unmount()
    const b = render(<CaselleDaSistemare riassunto={{ n: 1, nRimanenza: 1, nAltre: 0, kgFuori: 0, kgAltre: 0 }} caselle={caselle} nomeSede={() => ''} />)
    expect(b.container.textContent).toMatch(/Una casella da sistemare/)
  })
})
