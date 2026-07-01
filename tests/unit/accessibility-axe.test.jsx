// @vitest-environment happy-dom
// Test accessibility (a11y) con axe-core su i form principali esposti al
// pubblico. Garantisce che non ci siano regressioni base tipo:
//   - input senza label
//   - bottoni senza testo o aria-label
//   - contrasto colori insufficiente (axe lo skippa in happy-dom — vedi nota)
//   - landmark mancanti
//   - role/aria semantici sbagliati
//
// Audit 2026-06-22: jest-axe + happy-dom. Contrasto colori non e' verificabile
// in happy-dom (no rendering vero), ma le violation strutturali si.

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import React from 'react'

expect.extend(toHaveNoViolations)

// Mock dipendenze esterne usate dai componenti.
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  },
}))

// Audit 2026-06-24: mock aiClient per evitare fetch '/api/ai' (vedi nota in
// views-render-smoke).
vi.mock('../../src/lib/aiClient', () => ({
  callAi: () => Promise.resolve({ text: '', json: null }),
  parseAiJson: (s) => { try { return JSON.parse(s) } catch { return null } },
  friendlyAiError: () => 'Errore AI (mock).',
  sanitizeUserInput: (t) => String(t || ''),
}))

describe('Accessibility (axe-core) — form pubblici e onboarding', () => {
  it('AuthPage non ha violation strutturali a11y', async () => {
    const { default: AuthPage } = await import('../../src/auth/AuthPage')
    const { container } = render(<AuthPage onAuth={() => {}} />)
    const results = await axe(container, {
      // Skip contrast in happy-dom: non c'e' rendering vero, le rules di contrast falliscono.
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('OnboardingWizard non ha violation strutturali a11y', { timeout: 15000 }, async () => {
    const { default: Wizard } = await import('../../src/onboarding/OnboardingWizard')
    const { container } = render(
      <Wizard auth={{ user: { id: 'u1', email: 'test@test.com' }, organization: { id: 'o1' } }} onComplete={() => {}} notify={() => {}} />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('EmployeeLoginPad non ha violation strutturali a11y', async () => {
    const { default: Pad } = await import('../../src/auth/EmployeeLoginPad')
    const { container } = render(<Pad onBack={() => {}} onSuccess={() => {}} />)
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  // Timeout esteso: dynamic import + render + axe analisi su form 30+ campi
  // può andare oltre i 5s default sotto carico CI (audit 2026-06-24 flake).
  it('NuovaRicettaView (form 30+ campi) non ha violation strutturali a11y', { timeout: 20000 }, async () => {
    const { default: Form } = await import('../../src/views/NuovaRicettaView')
    const { container } = render(
      <Form
        orgId="org-test"
        sedi={[]}
        notify={() => {}}
        ricettario={{ ricette: {} }}
        ingCosti={{}}
        setRicettario={() => {}}
        onChiudi={() => {}}
        isMobile={false}
      />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('ConfirmProvider con confirm aperto non ha violation a11y', async () => {
    const mod = await import('../../src/components/ConfirmModal')
    const { ConfirmProvider, useConfirm } = mod
    function Trigger() {
      const confirm = useConfirm()
      React.useEffect(() => { confirm({ title: 'Conferma', message: 'Sei sicuro?' }) }, [confirm])
      return null
    }
    const { container } = render(
      <ConfirmProvider><Trigger /></ConfirmProvider>
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('UpgradeModal aperto non ha violation a11y', async () => {
    const { default: Up } = await import('../../src/components/UpgradeModal')
    const { container } = render(
      <Up open feature="ai_brain" piano="base" onClose={() => {}} onUpgrade={() => {}} />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('Impostazioni — sezione profilo + cambio email non ha violation a11y', { timeout: 15000 }, async () => {
    const { default: Imp } = await import('../../src/components/Impostazioni')
    const { container } = render(
      <Imp
        auth={{ user: { id: 'u1', email: 'test@test.com' }, organization: { id: 'o1', nome: 'Test' } }}
        nomeAttivita="Test"
        tipoAttivita="pasticceria"
        piano="pro"
        orgId="o1"
        notify={() => {}}
        sedi={[]}
        onLogout={() => {}}
      />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('AICard — loading state non ha violation a11y', async () => {
    const { default: AICard } = await import('../../src/components/AICard')
    const { container } = render(
      <AICard icon="bulb" title="Analisi" subtitle="AI insights" state="loading" />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('AICard — error state con retry non ha violation a11y', async () => {
    const { default: AICard } = await import('../../src/components/AICard')
    const { container } = render(
      <AICard icon="alertCircle" title="Errore" subtitle="..." state="error"
        error="Test errore amichevole" onRetry={() => {}} />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('AICard — empty state con CTA non ha violation a11y', async () => {
    const { default: AICard } = await import('../../src/components/AICard')
    const { container } = render(
      <AICard icon="bulb" title="Analisi" subtitle="..." state="idle"
        emptyExample="es. analizza giugno" ctaLabel="Genera" onCta={() => {}} />
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('ChainBadge variants non hanno violation a11y', async () => {
    const { default: ChainBadge } = await import('../../src/components/ChainBadge')
    const { container } = render(
      <>
        <ChainBadge />
        <ChainBadge active size={18} />
        <ChainBadge size={24} title="Custom" />
      </>
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })

  it('SedeContextBanner singola e multi-sede non hanno violation a11y', async () => {
    const { default: Banner } = await import('../../src/components/SedeContextBanner')
    const { container } = render(
      <>
        <Banner sedi={[{ id: '1', nome: 'Torino' }]} sedeAttiva={{ id: '1', nome: 'Torino' }} contesto="magazzino" />
        <Banner
          sedi={[{ id: '1', nome: 'Torino' }, { id: '2', nome: 'Milano' }]}
          sedeAttiva={{ id: '1', nome: 'Torino' }} contesto="produzione"
        />
      </>
    )
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })
})
