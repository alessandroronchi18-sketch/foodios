// @vitest-environment happy-dom
// L'elenco «giorni da guardare» nella Cassa (09/10/2026).
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GiorniDaGuardare from '../../src/components/GiorniDaGuardare'

const g = (data, fonti, extra = {}) => ({ data, fonteTotale: 'foto', confrontoFonti: fonti, ...extra })

describe('GiorniDaGuardare', () => {
  it('non compare con cifre uguali, centesimi o una fonte sola', () => {
    const { container } = render(<GiorniDaGuardare chiusure={[
      g('2026-09-01', [{ fonte: 'foto', totale: 1000 }, { fonte: 'registro', totale: 1000.4 }]),
      g('2026-09-02', [{ fonte: 'foto', totale: 1000 }]),
    ]} />)
    expect(container.textContent).toBe('')
  })
  it('mostra le due cifre, la differenza e la nota di annullo', () => {
    render(<GiorniDaGuardare chiusure={[
      g('2026-09-03', [{ fonte: 'foto', totale: 3641.3 }, { fonte: 'registro', totale: 1411.3, nota: 'scontrino annullato da 2230,00 €' }]),
    ]} />)
    const t = screen.getByTestId('giorni-da-guardare').textContent
    expect(t).toMatch(/03\/09/)
    expect(t).toMatch(/scontrino della cassa/)
    expect(t).toMatch(/registro Excel/)
    expect(t).toMatch(/2\.230/)
    expect(t).toMatch(/annullato/)
  })
})
