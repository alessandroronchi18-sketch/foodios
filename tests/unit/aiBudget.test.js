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
    expect(estimateCostForCall({ feature: 'xxx', model: 'claude-opus-5' })).toBe(0.080)
  })

  it('feature ignota + model haiku → 0.001', () => {
    expect(estimateCostForCall({ feature: 'xxx', model: 'claude-haiku-4-5' })).toBe(0.001)
  })

  it('feature ignota + model sonnet → 0.008', () => {
    // Sonnet 5 costa meno di Sonnet 4.6: la stima per chiamata è scesa con lui.
    expect(estimateCostForCall({ feature: 'xxx', model: 'claude-sonnet-5' })).toBe(0.008)
  })

  it('nessuna feature + nessun model → default 0.015', () => {
    expect(estimateCostForCall({})).toBe(0.015)
  })

  it('model case-insensitive', () => {
    expect(estimateCostForCall({ model: 'CLAUDE-OPUS' })).toBe(0.080)
    expect(estimateCostForCall({ model: 'Sonnet' })).toBe(0.008)
  })
})

describe('checkAndIncrementAiBudget', () => {
  // Il 15/09/2026 questa funzione è cambiata per un motivo grosso: **non
  // contava niente**. Le due funzioni sul database cercavano l'azienda con
  // `where id = auth.uid()`, ma chi le chiama è il server con la chiave di
  // servizio, dove `auth.uid()` è vuoto: l'incremento usciva senza scrivere e
  // il totale tornava sempre 0. `0 >= tetto` non è mai vero, quindi il limite
  // non è mai scattato per nessuno.
  //
  // Prova sul database di produzione: `ai_usage_daily` vuota con 327
  // organizzazioni, e sette chiavi `ai:…` in `rate_limits` che dimostrano che
  // le chiamate c'erano state davvero.
  //
  // Adesso l'organizzazione si passa in modo esplicito, e le funzioni si
  // chiamano `..._org`. Il tetto è 5 $ al giorno, deciso dal titolare.
  let supabase
  const ORG = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    supabase = {
      rpc: vi.fn(async (name) => {
        if (name === 'ai_usage_today_total_org') return { data: 0 }
        if (name === 'ai_credit_consuma') return { data: false }
        return { data: null }
      }),
    }
  })

  it('adminBypass=true → passa senza toccare il database', async () => {
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'recipe', adminBypass: true })
    expect(r.allowed).toBe(true)
    expect(r.bypass).toBe('admin')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('senza organizzazione non blocca, ma lo dichiara', async () => {
    // Non è colpa di chi sta chiedendo, ma è la condizione in cui il tetto non
    // protegge: va detta forte invece che passare in silenzio.
    const r = await checkAndIncrementAiBudget({ supabase, feature: 'recipe' })
    expect(r.allowed).toBe(true)
    expect(r.error).toBe('org_mancante')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('sotto il tetto passa, e registra la spesa CON l\'organizzazione', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total_org') return { data: 0.50 }
      if (name === 'ai_credit_consuma') return { data: false }
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'daily_brief', piano: 'trial' })
    expect(r.allowed).toBe(true)
    expect(r.cap).toBe(5.0)
    expect(r.used).toBe(0.50)
    expect(r.charged).toBe(0.0008)
    expect(supabase.rpc).toHaveBeenCalledWith('ai_usage_increment_org', expect.objectContaining({
      p_org: ORG, p_feature: 'daily_brief', p_cost_usd: 0.0008,
    }))
  })

  it('il tetto è 5 $ per tutti i piani', async () => {
    for (const piano of ['trial', 'base', 'pro', 'enterprise', 'chain']) {
      const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'recipe', piano })
      expect(r.cap, `${piano}`).toBe(5.0)
    }
  })

  it('sopra il tetto si ferma', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total_org') return { data: 6.0 }
      if (name === 'ai_credit_consuma') return { data: false }
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'recipe', piano: 'trial' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('budget_exceeded')
    expect(r.used).toBe(6)
    expect(r.cap).toBe(5.0)
  })

  it('esattamente al tetto si ferma già', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total_org') return { data: 5.0 }
      if (name === 'ai_credit_consuma') return { data: false }
      return { data: null }
    })
    expect((await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'recipe' })).allowed).toBe(false)
  })

  it('i pacchetti comprati vengono prima del tetto, e non ci pesano', async () => {
    // La migration del 06/07 lo dichiarava già, ma quel codice non era mai
    // stato scritto: un cliente che paga per mille chiamate sarebbe stato
    // tagliato fuori lo stesso.
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_credit_consuma') return { data: true }
      if (name === 'ai_usage_today_total_org') return { data: 99 }  // ben oltre il tetto
      return { data: null }
    })
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'recipe', piano: 'trial' })
    expect(r.allowed).toBe(true)
    expect(r.daPacchetto).toBe(true)
    expect(r.charged).toBe(0)
    // Si registra lo stesso, per vedere il consumo nel pannello, ma a costo zero.
    expect(supabase.rpc).toHaveBeenCalledWith('ai_usage_increment_org', expect.objectContaining({
      p_org: ORG, p_cost_usd: 0,
    }))
  })

  it('se la lettura fallisce si passa, ma resta scritto nel log', async () => {
    // Meglio una chiamata non conteggiata che un cliente bloccato da un guasto
    // nostro.
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total_org') throw new Error('tabella assente')
      return { data: false }
    })
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'x' })
    expect(r.allowed).toBe(true)
    expect(r.error).toBe('budget_read_failed')
  })

  it('se la scrittura fallisce la chiamata passa lo stesso', async () => {
    supabase.rpc.mockImplementation(async (name) => {
      if (name === 'ai_usage_today_total_org') return { data: 0.10 }
      if (name === 'ai_credit_consuma') return { data: false }
      if (name === 'ai_usage_increment_org') throw new Error('scrittura contesa')
      return { data: null }
    })
    expect((await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'x', piano: 'pro' })).allowed).toBe(true)
  })

  it('un piano che non conosciamo ricade sul tetto di riserva', async () => {
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'x', piano: 'sconosciuto' })
    expect(r.cap).toBe(5.0)
  })

  it('la variabile d\'ambiente vince sul valore scritto nel codice', async () => {
    process.env.AI_BUDGET_USD_PRO = '25'
    const r = await checkAndIncrementAiBudget({ supabase, orgId: ORG, feature: 'x', piano: 'pro' })
    expect(r.cap).toBe(25)
    delete process.env.AI_BUDGET_USD_PRO
  })
})
