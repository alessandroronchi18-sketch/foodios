import { describe, it, expect } from 'vitest'
import { canAccessView, planRank, requiredPlanLabel } from '../../src/lib/planAccess.js'

describe('planAccess', () => {
  it('view non gated → accessibile a tutti i piani', () => {
    for (const p of ['trial', 'base', 'pro', 'enterprise', 'sconosciuto', null]) {
      expect(canAccessView('ricettario', p)).toBe(true)
      expect(canAccessView('magazzino', p)).toBe(true)
    }
  })

  it('view Chain-only: solo enterprise/chain accede', () => {
    for (const v of ['confronto-sedi', 'trasferimenti', 'integrazioni']) {
      expect(canAccessView(v, 'enterprise')).toBe(true)
      expect(canAccessView(v, 'chain')).toBe(true)
      expect(canAccessView(v, 'pro')).toBe(false)
      expect(canAccessView(v, 'base')).toBe(false)
      expect(canAccessView(v, 'trial')).toBe(false) // trial = livello Pro
    }
  })

  it('planRank: enterprise/chain > pro = base = trial', () => {
    expect(planRank('enterprise')).toBeGreaterThan(planRank('pro'))
    expect(planRank('chain')).toBe(planRank('enterprise'))
    expect(planRank('pro')).toBe(planRank('trial'))
    expect(planRank('xyz')).toBe(planRank('pro')) // default prudente
  })

  it('requiredPlanLabel: etichetta solo per view gated', () => {
    expect(requiredPlanLabel('confronto-sedi')).toBe('Chain')
    expect(requiredPlanLabel('ricettario')).toBeNull()
  })

  it('è case-insensitive sul nome del piano', () => {
    expect(canAccessView('integrazioni', 'ENTERPRISE')).toBe(true)
    expect(canAccessView('integrazioni', ' Pro ')).toBe(false)
  })
})
