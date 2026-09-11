import { describe, it, expect } from 'vitest'
import {
  canAccessView, vistaInclusaNelPiano, planRank, requiredPlanLabel,
  isPlanBypassEmail, effectivePlan, SBLOCCO_TUTTE_LE_PAGINE,
} from '../../src/lib/planAccess.js'

// I test sui TIER usano `vistaInclusaNelPiano`, che è la regola dei piani pura.
// `canAccessView` invece risponde "puoi aprirla ADESSO" e tiene conto anche
// dello sblocco temporaneo (SBLOCCO_TUTTE_LE_PAGINE, acceso l'11/09/2026 su
// richiesta del titolare). Tenerli separati serve a questo: i controlli sui
// piani continuano a proteggere il ritorno indietro anche mentre tutto è
// aperto, e il giorno in cui lo sblocco si spegne non c'è niente da riscrivere.

describe('planAccess', () => {
  it('view non gated → accessibile a tutti i piani', () => {
    for (const p of ['trial', 'base', 'pro', 'enterprise', 'sconosciuto', null]) {
      expect(vistaInclusaNelPiano('ricettario', p)).toBe(true)
      expect(vistaInclusaNelPiano('magazzino', p)).toBe(true)
    }
  })

  it('view Insegna-only: solo enterprise/chain accede', () => {
    // Audit 2026-06-21: Bottega/Maestro/Insegna. Trial assaggia Maestro (rank 2)
    // ma resta gated sulle Insegna (multi-sede + integrazioni real-time).
    for (const v of ['confronto-sedi', 'trasferimenti', 'integrazioni']) {
      expect(vistaInclusaNelPiano(v, 'enterprise')).toBe(true)
      expect(vistaInclusaNelPiano(v, 'chain')).toBe(true)
      expect(vistaInclusaNelPiano(v, 'pro')).toBe(false)
      expect(vistaInclusaNelPiano(v, 'base')).toBe(false)
      expect(vistaInclusaNelPiano(v, 'trial')).toBe(false) // trial = Maestro (rank 2), non Insegna
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
    expect(vistaInclusaNelPiano('integrazioni', 'ENTERPRISE')).toBe(true)
    expect(vistaInclusaNelPiano('integrazioni', ' Pro ')).toBe(false)
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
      expect(vistaInclusaNelPiano(v, 'pro')).toBe(false)
      expect(vistaInclusaNelPiano(v, 'enterprise')).toBe(true)
    }
  })

  it('view Maestro+ sono accessibili a pro/enterprise/trial, NON a base', () => {
    // Audit 2026-06-21: ai-brain e ricette-ai promossi a Maestro (era Insegna).
    // Trial assaggia tutto Maestro (rank 2) per generare valore prima upgrade.
    for (const v of ['forecast', 'menu-engineering', 'cashflow', 'reformulation', 'competitor-pricing', 'ordini-ai', 'ai-brain', 'ricette-ai']) {
      expect(vistaInclusaNelPiano(v, 'base')).toBe(false)
      expect(vistaInclusaNelPiano(v, 'trial')).toBe(true)  // trial = Maestro
      expect(vistaInclusaNelPiano(v, 'pro')).toBe(true)
      expect(vistaInclusaNelPiano(v, 'enterprise')).toBe(true)
    }
  })

  it('logica 3-tier badge: Bottega vede locked su Maestro+Insegna, Maestro solo su Insegna, Insegna nessuno', () => {
    // Bottega: tutte le AI feature gated sono lockate
    for (const v of ['forecast', 'reformulation', 'ai-brain', 'whatsapp']) {
      expect(vistaInclusaNelPiano(v, 'base')).toBe(false)
    }
    // Maestro: solo Insegna lockate
    expect(vistaInclusaNelPiano('forecast', 'pro')).toBe(true)        // Maestro feature
    expect(vistaInclusaNelPiano('reformulation', 'pro')).toBe(true)
    expect(vistaInclusaNelPiano('ai-brain', 'pro')).toBe(true)        // ora Maestro
    expect(vistaInclusaNelPiano('whatsapp', 'pro')).toBe(false)       // Insegna-only
    expect(vistaInclusaNelPiano('confronto-sedi', 'pro')).toBe(false) // Insegna-only
    // Insegna: tutto accessibile
    for (const v of ['forecast', 'reformulation', 'ai-brain', 'whatsapp', 'marketplace', 'documentary', 'confronto-sedi']) {
      expect(vistaInclusaNelPiano(v, 'enterprise')).toBe(true)
    }
  })
})

// ── Sblocco temporaneo di tutte le pagine ──────────────────────────────────
//
// Acceso l'11/09/2026 su richiesta del titolare: tutte le pagine visibili a
// qualsiasi piano mentre si lavora alla ripulitura, senza cambiare piano.
// Questo controllo è scritto per passare in TUTTI E DUE gli stati: il giorno
// in cui lo sblocco si spegne non va riscritto, dice solo la cosa giusta.
describe('sblocco temporaneo tutte le pagine', () => {
  const gated = ['confronto-sedi', 'trasferimenti', 'integrazioni', 'whatsapp', 'forecast', 'cashflow']

  it('coerente con lo stato dello sblocco', () => {
    for (const v of gated) {
      if (SBLOCCO_TUTTE_LE_PAGINE) {
        // Acceso: il piano Bottega apre tutto.
        expect(canAccessView(v, 'base')).toBe(true)
      } else {
        // Spento: torna a valere la regola dei piani.
        expect(canAccessView(v, 'base')).toBe(vistaInclusaNelPiano(v, 'base'))
      }
    }
  })

  it('la tabella dei piani resta intatta, così tornare indietro è una riga', () => {
    // Lo sblocco NON cancella VIEW_MIN_PLAN: la regola c'è ancora e si può
    // interrogare. Se un giorno qualcuno "pulisse" la tabella pensando che
    // non serva più, tornare al gating diventerebbe un lavoro.
    expect(vistaInclusaNelPiano('confronto-sedi', 'base')).toBe(false)
    expect(vistaInclusaNelPiano('forecast', 'base')).toBe(false)
    expect(vistaInclusaNelPiano('ricettario', 'base')).toBe(true)
  })
})
