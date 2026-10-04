// @vitest-environment happy-dom
//
// ── Il nome del gusto non si riduce a «CA…» al telefono ─────────────────
//
// 04/10/2026, trovato fotografando la Quadratura del 31/08 a 420 px dopo aver
// corretto il righello (che fino a quel giorno misurava lo <span> nascosto di
// Recharts invece della pagina, e su 6 viste su 8 non vedeva niente). Nei
// «Gusti in sofferenza» nome, dettaglio («in vetrina 3,8 kg, vende 0,9 kg al
// giorno») e bollino («4,2 giorni») stavano su una riga sola: il dettaglio e
// il bollino non vanno mai a capo, quindi il nome restava con 30 px e a
// schermo si leggeva «CA…» al posto di CAFFÈ FLORA.
//
// La correzione: la riga va a capo. Il nome ha una larghezza minima: se non ci
// sta accanto al dettaglio prende la prima riga intera e il dettaglio col
// bollino scende sotto, col bollino sempre a destra. Al computer resta tutto su
// una riga come prima.
//
// happy-dom non calcola le larghezze: qui si prova la regola dello stile; la
// misura vera la fa il righello sulle foto (tagliati = 0).
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PanelSofferenza, NOME_SOFFERENZA_MIN } from '../../src/views/QuadraturaInventarioView.jsx'

afterEach(() => cleanup())

const flora = { gusto: 'CAFFÈ FLORA', residuoMedioG: 3800, vendutoMedioG: 900, giorniVetrina: 4.2 }
const lungo = { gusto: 'NOCCIOLA PIEMONTE IGP TOSTATA', residuoMedioG: 5100, vendutoMedioG: 1200, giorniVetrina: 4.25 }

describe('Gusti in sofferenza: il nome non si schiaccia', () => {
  it('la riga va a capo e il nome tiene la sua larghezza minima', () => {
    render(<PanelSofferenza sofferenza={[flora, lungo]} zeroVenduto={[]} />)
    for (const g of [flora, lungo]) {
      const nome = screen.getByTitle(g.gusto)
      expect(nome.textContent).toBe(g.gusto)
      const riga = nome.parentElement
      expect(riga.style.flexWrap).toBe('wrap')
      // la larghezza minima è quella che fa scendere il dettaglio, non il nome
      expect(NOME_SOFFERENZA_MIN).toBeGreaterThanOrEqual(120)
      expect(nome.style.flexBasis || nome.style.flex).toContain(`${NOME_SOFFERENZA_MIN}px`)
      expect(nome.style.flexGrow || nome.style.flex.split(' ')[0]).toBe('1')
    }
  })

  it('il bollino dei giorni resta a destra anche quando scende sotto', () => {
    render(<PanelSofferenza sofferenza={[flora]} zeroVenduto={[]} />)
    const bollino = screen.getByText(/4,2 giorni/)
    expect(bollino.style.marginLeft).toBe('auto')
    expect(bollino.style.whiteSpace).toBe('nowrap')
    expect(screen.getByText(/in vetrina 3,8 kg, vende 0,9 kg al giorno/)).toBeTruthy()
  })

  it('vicino: zero venduto e nessun gusto in sofferenza si leggono come prima', () => {
    render(<PanelSofferenza sofferenza={[]} zeroVenduto={[{ gusto: 'MENTA' }, { gusto: 'LIQUIRIZIA' }]} />)
    expect(screen.getByText(/Zero venduto \(2\)/)).toBeTruthy()
    expect(screen.getByText('MENTA · LIQUIRIZIA')).toBeTruthy()
    expect(screen.getByText(/Nessun gusto resta in vetrina per 3 giorni di vendita o più/)).toBeTruthy()
  })
})
