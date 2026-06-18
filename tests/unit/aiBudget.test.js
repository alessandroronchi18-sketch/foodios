// aiBudget — hard-cap costo Claude giornaliero per-org (anti cost-runaway).
// Audit 2026-06-14 PM.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estimateCostForCall, checkAndIncrementAiBudget } from '../../api/lib/aiBudget'

describe('estimateCostForCall', () => {
  it('feature mappata → costo tabulato', () => {
    expect(estimateCostForCall({ feature: 'recipe' })).toBe(0.080)
    expect(estimateCostForCall({ feature: 'daily_brief' })).toBe(0.0008)
    expect(estimateCostForCall({ feature: 'ocr_invoice' })).toBe(0.030)
  })

  it('feature ignota + model opus → 0.080', () => {
    expect(estimateCostForCall({ feature: 'xxx', model: 'claude-opus-4-7' })).toBe(0.080)
  })

  it('feature ignota + model haiku → 0.001', () => {
    expect(estimateCostForCall({ feature: 'xxx', model: 'claude-haiku-4-5' })).toBe(0.001)
  })

  it('feature ignota + model sonnet → 0.012', () => {
    expect(estimateCostForCall({ feature: 'xxx', model: 'claude-sonnet-4-6' })).toBe(0.012)
  })

  it('nessuna feature + nessun model → default 0.015', () => {
    expect(estimateCostForCall({})).toBe(0.015)
  })

  it('model case-insensitive', () => {
    expect(estimateCostForCall({ model: 'CLAUDE-OPUS' })).toBe(0.080)
    expect(estimateCostForCall({ model: 'Sonnet' })).toBe(0.012)
  })
})

describe('checkAndIncrementAiBudget', () => {
  let supabase

  beforeEach(() => {
    supabase = {
      rpc: vi.fn(async (name, args) => {
        if (name === 'ai_usage_today_total') return { data: 0 }
        if (name === 'ai_usage_increment') return { data: null }
        return { data: null }
      }),
    }
  })

  it('adminBypass=true → allowed senza chiamare DB', async () => {
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'recipe', adminBypass: true })
    expect(r.allowed).toBe(true)
    expect(r.bypass).toBe('admin')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('piano trial cap 1$, sotto cap → allowed con increment', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total') return { data: 0.50 }
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({
      supabase, feature: 'daily_brief', piano: 'trial',
    })
    expect(r.allowed).toBe(true)
    expect(r.cap).toBe(1.0)
    expect(r.used).toBe(0.50)
    expect(r.charged).toBe(0.0008)  // daily_brief
    // Increment chiamato
    expect(supabase.rpc).toHaveBeenCalledWith('ai_usage_increment', expect.objectContaining({
      p_feature: 'daily_brief',
      p_cost_usd: 0.0008,
    }))
  })

  it('piano chain cap 10$', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total') return { data: 5.0 }
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'recipe', piano: 'chain' })
    expect(r.cap).toBe(10.0)
    expect(r.allowed).toBe(true)
  })

  it('sopra cap → allowed:false, reason budget_exceeded', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total') return { data: 1.50 }  // > cap 1.0 trial
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'recipe', piano: 'trial' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('budget_exceeded')
    expect(r.used).toBe(1.5)
    expect(r.cap).toBe(1.0)
  })

  it('boundary: used == cap → not allowed (>=)', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total') return { data: 1.0 }
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'recipe', piano: 'trial' })
    expect(r.allowed).toBe(false)
  })

  it('read failed → fail-open con flag', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total') throw new Error('table missing')
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'x' })
    expect(r.allowed).toBe(true)
    expect(r.error).toBe('budget_read_failed')
  })

  it('increment failed → comunque allowed (best-effort)', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total') return { data: 0.10 }
      if (name === 'ai_usage_increment') throw new Error('write race')
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'x', piano: 'pro' })
    expect(r.allowed).toBe(true)
  })

  it('piano sconosciuto → fallback trial cap', async () => {
    supabase.rpc.mockImplementation(async () => ({ data: 0 }))
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'x', piano: 'sconosciuto' })
    expect(r.cap).toBe(1.0)
  })

  it('env AI_BUDGET_USD_PRO override default', async () => {
    process.env.AI_BUDGET_USD_PRO = '7.5'
    supabase.rpc.mockImplementation(async () => ({ data: 0 }))
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'x', piano: 'pro' })
    expect(r.cap).toBe(7.5)
    delete process.env.AI_BUDGET_USD_PRO
  })
})
