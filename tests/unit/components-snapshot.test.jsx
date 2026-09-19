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

// ── Gli id che React genera non sono stabili, e non devono esserlo ────────
//
// `React.useId()` numera progressivamente: il primo componente disegnato nel
// processo prende `r0`, il secondo `r1`. Il numero dipende da quanti ne sono
// stati disegnati PRIMA, cioe' dall'ordine dei test — non da come e' fatto il
// componente. `ChainBadge` lo usa per l'id del gradiente dorato, e
// `UpgradeModal` mostra un ChainBadge dentro di se'.
//
// Finche' l'ordine e' sempre lo stesso il confronto passa. Il 19/09/2026,
// mescolando l'ordine, quattro di questi dodici test sono andati rossi con il
// prodotto perfettamente integro: bloccavano un numero che React dichiara di
// poter cambiare. Erano verdi per fortuna, non perche' funzionassero.
//
// Il markup si blocca, il numero dell'id no.
function senzaIdVolatili(nodo) {
  if (!nodo || !nodo.cloneNode) return nodo
  const copia = nodo.cloneNode(true)
  for (const el of [copia, ...copia.querySelectorAll('*')]) {
    for (const attr of Array.from(el.attributes || [])) {
      const nuovo = attr.value.replace(/\br\d+\b/g, 'rID')
      if (nuovo !== attr.value) el.setAttribute(attr.name, nuovo)
    }
  }
  return copia
}

describe('Snapshot markup — componenti puri ad alta riusabilita', () => {
  it('Logo default size', async () => {
    const { default: Logo } = await import('../../src/components/Logo')
    const { container } = render(<Logo />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('Logo custom size + dark', async () => {
    const { default: Logo } = await import('../../src/components/Logo')
    const { container } = render(<Logo size={48} variant="dark" />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('ChainBadge default', async () => {
    const { default: ChainBadge } = await import('../../src/components/ChainBadge')
    const { container } = render(<ChainBadge />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('ChainBadge active=true', async () => {
    const { default: ChainBadge } = await import('../../src/components/ChainBadge')
    const { container } = render(<ChainBadge active={true} size={20} title="Custom title" />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('Icon star', async () => {
    const { default: Icon } = await import('../../src/components/Icon')
    const { container } = render(<Icon name="star" size={24} />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('Icon trash con title', async () => {
    const { default: Icon } = await import('../../src/components/Icon')
    const { container } = render(<Icon name="trash" size={16} title="Elimina" />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('Icon money', async () => {
    const { default: Icon } = await import('../../src/components/Icon')
    const { container } = render(<Icon name="money" size={18} />)
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('UpgradeModal piano base -> insegna', async () => {
    const { default: UpgradeModal } = await import('../../src/components/UpgradeModal')
    const { container } = render(
      <UpgradeModal open={true} feature="ai_brain" piano="base" requiredPlan="enterprise" onClose={() => {}} />
    )
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('UpgradeModal piano base -> pro', async () => {
    const { default: UpgradeModal } = await import('../../src/components/UpgradeModal')
    const { container } = render(
      <UpgradeModal open={true} feature="multi_sede" piano="base" requiredPlan="pro" onClose={() => {}} />
    )
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })

  it('SedeContextBanner singola sede', async () => {
    const { default: Banner } = await import('../../src/components/SedeContextBanner')
    const { container } = render(
      <Banner sedi={[{ id: '1', nome: 'Torino' }]} sedeAttiva={{ id: '1', nome: 'Torino' }} contesto="magazzino" />
    )
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
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
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
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
    expect(senzaIdVolatili(container.firstChild)).toMatchSnapshot()
  })
})
