import { describe, it, expect } from 'vitest'
import { canAccessView, planRank, requiredPlanLabel, isPlanBypassEmail, effectivePlan } from '../../src/lib/planAccess.js'

describe('planAccess', () => {
  it('view non gated → accessibile a tutti i piani', () => {
    for (const p of ['trial', 'base', 'pro', 'enterprise', 'sconosciuto', null]) {
      expect(canAccessView('ricettario', p)).toBe(true)
      expect(canAccessView('magazzino', p)).toBe(true)
    }
  })

  it('view Insegna-only: solo enterprise/chain accede', () => {
    // Audit 2026-06-21: Bottega/Maestro/Insegna. Trial assaggia Maestro (rank 2)
    // ma resta gated sulle Insegna (multi-sede + integrazioni real-time).
    for (const v of ['confronto-sedi', 'trasferimenti', 'integrazioni']) {
      expect(canAccessView(v, 'enterprise')).toBe(true)
      expect(canAccessView(v, 'chain')).toBe(true)
      expect(canAccessView(v, 'pro')).toBe(false)
      expect(canAccessView(v, 'base')).toBe(false)
      expect(canAccessView(v, 'trial')).toBe(false) // trial = Maestro (rank 2), non Insegna
    }
  })

  it('planRank: enterprise/chain > pro = trial > base (audit 2026-06-21)', () => {
    expect(planRank('enterprise')).toBeGreaterThan(planRank('pro'))
    expect(planRank('chain')).toBe(planRank('enterprise'))
    expect(planRank('pro')).toBe(planRank('trial')) // trial assaggia Maestro
    expect(planRank('trial')).toBeGreaterThan(planRank('base'))
    expect(planRank('xyz')).toBe(planRank('pro'))   // default prudente
  })

  it('requiredPlanLabel: etichetta solo per view gated', () => {
    expect(requiredPlanLabel('confronto-sedi')).toBe('Insegna')
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

  // ── Audit 2026-06-21: Bottega / Maestro / Insegna ─────────────────────────
  it('view Insegna-only sono gated per piano non-enterprise', () => {
    // Solo le feature multi-sede + integrazioni real-time + WhatsApp + Marketplace
    // sono Insegna-tier (le altre AI sono passate a Maestro)
    for (const v of ['whatsapp', 'marketplace', 'documentary', 'confronto-sedi', 'trasferimenti', 'integrazioni']) {
      expect(canAccessView(v, 'pro')).toBe(false)
      expect(canAccessView(v, 'enterprise')).toBe(true)
    }
  })

  it('view Maestro+ sono accessibili a pro/enterprise/trial, NON a base', () => {
    // Audit 2026-06-21: ai-brain e ricette-ai promossi a Maestro (era Insegna).
    // Trial assaggia tutto Maestro (rank 2) per generare valore prima upgrade.
    for (const v of ['forecast', 'menu-engineering', 'cashflow', 'reformulation', 'competitor-pricing', 'ordini-ai', 'ai-brain', 'ricette-ai']) {
      expect(canAccessView(v, 'base')).toBe(false)
      expect(canAccessView(v, 'trial')).toBe(true)  // trial = Maestro
      expect(canAccessView(v, 'pro')).toBe(true)
      expect(canAccessView(v, 'enterprise')).toBe(true)
    }
  })

  it('logica 3-tier badge: Bottega vede locked su Maestro+Insegna, Maestro solo su Insegna, Insegna nessuno', () => {
    // Bottega: tutte le AI feature gated sono lockate
    for (const v of ['forecast', 'reformulation', 'ai-brain', 'whatsapp']) {
      expect(canAccessView(v, 'base')).toBe(false)
    }
    // Maestro: solo Insegna lockate
    expect(canAccessView('forecast', 'pro')).toBe(true)        // Maestro feature
    expect(canAccessView('reformulation', 'pro')).toBe(true)
    expect(canAccessView('ai-brain', 'pro')).toBe(true)        // ora Maestro
    expect(canAccessView('whatsapp', 'pro')).toBe(false)       // Insegna-only
    expect(canAccessView('confronto-sedi', 'pro')).toBe(false) // Insegna-only
    // Insegna: tutto accessibile
    for (const v of ['forecast', 'reformulation', 'ai-brain', 'whatsapp', 'marketplace', 'documentary', 'confronto-sedi']) {
      expect(canAccessView(v, 'enterprise')).toBe(true)
    }
  })
})
