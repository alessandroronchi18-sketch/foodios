// @vitest-environment happy-dom
/**
 * SplashScreen smoke test.
 *
 * Garanzia minima: il componente renderizza senza throw, contiene il wordmark
 * "Foodos" e la tagline. Niente snapshot perché lo styling è ampio e fragile
 * (cambierebbe ogni volta tweakkiamo l'aurora).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import SplashScreen from '../../src/components/SplashScreen.jsx'

describe('SplashScreen', () => {
  it('renderizza senza throw', () => {
    const { container } = render(<SplashScreen />)
    expect(container).toBeTruthy()
    cleanup()
  })

  it('contiene il wordmark "Foodos"', () => {
    const { getByText } = render(<SplashScreen />)
    expect(getByText('Foodos')).toBeTruthy()
    cleanup()
  })

  it('default subtitle "Caricamento"', () => {
    const { getByText } = render(<SplashScreen />)
    expect(getByText('Caricamento')).toBeTruthy()
    cleanup()
  })

  it('subtitle custom via prop', () => {
    const { getByText } = render(<SplashScreen subtitle="Preparazione dati" />)
    expect(getByText('Preparazione dati')).toBeTruthy()
    cleanup()
  })

  it('non chiama console.error durante il render (no warnings React)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SplashScreen />)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    cleanup()
  })
})
