import { describe, it, expect } from 'vitest'
import { canAccessView, planRank, requiredPlanLabel, isPlanBypassEmail, effectivePlan } from '../../src/lib/planAccess.js'

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

  // ── Email bypass (account demo) ─────────────────────────────────────────
  it('isPlanBypassEmail: demo@maradeiboschi.com riconosciuto', () => {
    expect(isPlanBypassEmail('demo@maradeiboschi.com')).toBe(true)
    expect(isPlanBypassEmail('DEMO@MARADEIBOSCHI.COM')).toBe(true)
    expect(isPlanBypassEmail('  demo@maradeiboschi.com  ')).toBe(true)
    expect(isPlanBypassEmail('altro@example.com')).toBe(false)
    expect(isPlanBypassEmail('')).toBe(false)
    expect(isPlanBypassEmail(null)).toBe(false)
  })

  it('canAccessView con email bypass: accede a TUTTO indipendentemente dal piano', () => {
    const email = 'demo@maradeiboschi.com'
    for (const v of ['confronto-sedi', 'ai-brain', 'whatsapp', 'documentary', 'marketplace', 'forecast', 'cashflow']) {
      expect(canAccessView(v, 'trial', email)).toBe(true)
    }
  })

  it('effectivePlan: per email bypass ritorna sempre enterprise', () => {
    expect(effectivePlan('trial', 'demo@maradeiboschi.com')).toBe('enterprise')
    expect(effectivePlan('pro',   'demo@maradeiboschi.com')).toBe('enterprise')
    expect(effectivePlan('trial', 'altro@example.com')).toBe('trial')
    expect(effectivePlan(null,    'altro@example.com')).toBe('trial')
  })

  // ── Nuove 5 Chain view (post 2026-06) ───────────────────────────────────
  it('le 5 nuove Chain view sono gated per piano non-enterprise', () => {
    for (const v of ['ai-brain', 'whatsapp', 'ricette-ai', 'marketplace', 'documentary']) {
      expect(canAccessView(v, 'pro')).toBe(false)
      expect(canAccessView(v, 'enterprise')).toBe(true)
    }
  })

  it('le 6 view Pro+ sono accessibili a trial/pro (in attuale PLAN_RANK)', () => {
    for (const v of ['forecast', 'menu-engineering', 'cashflow', 'reformulation', 'competitor-pricing', 'ordini-ai']) {
      // PLAN_RANK attuale: trial=pro=2, quindi le view Pro+ sono visibili gia' in trial.
      expect(canAccessView(v, 'trial')).toBe(true)
      expect(canAccessView(v, 'pro')).toBe(true)
    }
  })
})
