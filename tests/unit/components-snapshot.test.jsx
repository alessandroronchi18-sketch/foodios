// @vitest-environment happy-dom
// Snapshot test su componenti React puri (no fetch, no useEffect con side
// effect). Pin di non-regressione del MARKUP: se domani qualcuno cambia tag/
// classi/struttura, il test fallisce e il diff e' esplicito.
//
// Coprono i componenti riusati in molti posti (KpiCard, Logo, Icon,
// ChainBadge, UpgradeModal) — la regressione qui ha impatto a cascata.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

describe('Snapshot markup — componenti puri ad alta riusabilita', () => {
  it('Logo default size', async () => {
    const { default: Logo } = await import('../../src/components/Logo')
    const { container } = render(<Logo />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('Logo custom size + dark', async () => {
    const { default: Logo } = await import('../../src/components/Logo')
    const { container } = render(<Logo size={48} variant="dark" />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('ChainBadge default', async () => {
    const { default: ChainBadge } = await import('../../src/components/ChainBadge')
    const { container } = render(<ChainBadge />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('ChainBadge active=true', async () => {
    const { default: ChainBadge } = await import('../../src/components/ChainBadge')
    const { container } = render(<ChainBadge active={true} size={20} title="Custom title" />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('Icon star', async () => {
    const { default: Icon } = await import('../../src/components/Icon')
    const { container } = render(<Icon name="star" size={24} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('Icon trash con title', async () => {
    const { default: Icon } = await import('../../src/components/Icon')
    const { container } = render(<Icon name="trash" size={16} title="Elimina" />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('Icon money', async () => {
    const { default: Icon } = await import('../../src/components/Icon')
    const { container } = render(<Icon name="money" size={18} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('UpgradeModal piano base -> insegna', async () => {
    const { default: UpgradeModal } = await import('../../src/components/UpgradeModal')
    const { container } = render(
      <UpgradeModal open={true} feature="ai_brain" piano="base" requiredPlan="enterprise" onClose={() => {}} />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('UpgradeModal piano base -> pro', async () => {
    const { default: UpgradeModal } = await import('../../src/components/UpgradeModal')
    const { container } = render(
      <UpgradeModal open={true} feature="multi_sede" piano="base" requiredPlan="pro" onClose={() => {}} />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('SedeContextBanner singola sede', async () => {
    const { default: Banner } = await import('../../src/components/SedeContextBanner')
    const { container } = render(
      <Banner sedi={[{ id: '1', nome: 'Torino' }]} sedeAttiva={{ id: '1', nome: 'Torino' }} contesto="magazzino" />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('SedeContextBanner multisede', async () => {
    const { default: Banner } = await import('../../src/components/SedeContextBanner')
    const { container } = render(
      <Banner
        sedi={[{ id: '1', nome: 'Torino' }, { id: '2', nome: 'Milano' }]}
        sedeAttiva={{ id: '1', nome: 'Torino' }}
        contesto="magazzino"
      />
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('ToastProvider con tre toast (success/warn/error)', async () => {
    const { ToastProvider, useToast } = await import('../../src/components/Toast')
    let api = null
    function Driver() {
      api = useToast()
      return null
    }
    const { container, rerender } = render(<ToastProvider><Driver /></ToastProvider>)
    // Push i toast fuori dal render iniziale per evitare warning act().
    api.success('Salvato')
    api.warn('Attenzione')
    api.error('Errore')
    rerender(<ToastProvider><Driver /></ToastProvider>)
    expect(container.firstChild).toMatchSnapshot()
  })
})
