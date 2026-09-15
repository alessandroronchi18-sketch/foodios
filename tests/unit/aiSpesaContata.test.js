// Il costo dell'AI si conta tutto, non solo un quinto.
//
// Fino al 15/09/2026 `api/lib/aiBudget.js` era chiamato **soltanto** da
// `api/ai.js`. La stessa chiave di Anthropic veniva usata anche da:
//   • i due lavori notturni (riepilogo del mattino, fotografia del mese)
//   • la lettura automatica delle fatture — la chiamata più cara di tutte
//   • i due passaggi AI dell'importazione
//
// Nessuno di questi passava dal contatore. Sul database di produzione:
// `ai_usage_daily` con zero righe, e intanto 1.301 suggerimenti e 96
// riepiloghi già generati. Il pannello «quanto mi costa questo cliente»
// mostrava 0 € per tutti, e il tetto di spesa non poteva scattare.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registraSpesaAi, estimateCostForCall } from '../../api/lib/aiBudget.js'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
const vive = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')

function finto() {
  const chiamate = []
  return {
    chiamate,
    client: { rpc: async (nome, args) => { chiamate.push({ nome, args }); return { data: null, error: null } } },
  }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('registraSpesaAi', () => {
  it('scrive una riga di consumo con il costo della funzione', async () => {
    const f = finto()
    const r = await registraSpesaAi({ supabase: f.client, orgId: 'org-1', feature: 'daily_brief', model: 'claude-haiku-4-5' })
    expect(r.registrato).toBe(true)
    expect(f.chiamate).toHaveLength(1)
    expect(f.chiamate[0].nome).toBe('ai_usage_increment_org')
    expect(f.chiamate[0].args.p_org).toBe('org-1')
    expect(f.chiamate[0].args.p_feature).toBe('daily_brief')
    expect(f.chiamate[0].args.p_cost_usd).toBe(estimateCostForCall({ feature: 'daily_brief' }))
  })

  it('porta dentro i token quando li conosce', async () => {
    const f = finto()
    await registraSpesaAi({
      supabase: f.client, orgId: 'org-1', feature: 'documentary',
      usage: { input_tokens: 1200, output_tokens: 340 },
    })
    expect(f.chiamate[0].args.p_tokens_in).toBe(1200)
    expect(f.chiamate[0].args.p_tokens_out).toBe(340)
  })

  it('senza organizzazione non inventa una riga, ma lo dice forte', async () => {
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = finto()
    const r = await registraSpesaAi({ supabase: f.client, orgId: null, feature: 'x' })
    expect(r.registrato).toBe(false)
    expect(f.chiamate).toHaveLength(0)
    expect(avviso).toHaveBeenCalled()
  })

  it('se la scrittura fallisce non esplode, ma si vede', async () => {
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = { rpc: async () => ({ data: null, error: { message: 'permission denied' } }) }
    const r = await registraSpesaAi({ supabase: client, orgId: 'o', feature: 'x' })
    expect(r.registrato).toBe(false)
    expect(errori).toHaveBeenCalled()
  })

  it('se il client va in eccezione, idem', async () => {
    const errori = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = { rpc: async () => { throw new Error('rete') } }
    expect((await registraSpesaAi({ supabase: client, orgId: 'o', feature: 'x' })).registrato).toBe(false)
    expect(errori).toHaveBeenCalled()
  })
})

describe('tutte le porte verso Claude passano dal contatore', () => {
  const porte = [
    ['la lettura delle fatture',            'api/ocr-fattura.js',          'checkAndIncrementAiBudget'],
    ['la mappatura delle colonne',          'api/import-map.js',           'checkAndIncrementAiBudget'],
    ['il riconoscimento del formato',       'api/import-detect-format.js', 'checkAndIncrementAiBudget'],
    ['l\'assistente',                       'api/ai.js',                   'checkAndIncrementAiBudget'],
  ]

  it.each(porte)('%s chiede al contatore prima di spendere', (_n, file, atteso) => {
    const t = vive(leggi(file))
    expect(t, `${file} non importa il contatore`).toMatch(new RegExp(`import \\{[^}]*${atteso}`))
    const usa = t.indexOf(`${atteso}(`)
    expect(usa, `${file} importa il contatore e non lo usa`).toBeGreaterThan(-1)
    // E lo fa PRIMA di chiamare Anthropic, non dopo.
    const claude = t.indexOf('api.anthropic.com')
    if (claude > -1) expect(usa, `${file} chiama Claude prima di controllare il budget`).toBeLessThan(claude)
  })

  it('quando il tetto è raggiunto risponde 429, in italiano', () => {
    for (const [, file] of porte) {
      const t = leggi(file)
      if (!/limite_raggiunto/.test(t)) continue
      expect(t).toMatch(/limite giornaliero/)
      expect(t).toMatch(/\}, 429, req\)/)
    }
  })

  it('i lavori notturni registrano la spesa (senza bloccarsi)', () => {
    // Fermare a metà un riepilogo del mattino per un tetto di spesa farebbe
    // più danno della spesa: questi registrano e basta.
    for (const file of ['api/cron-daily-brief.js', 'api/cron-documentary.js']) {
      const t = vive(leggi(file))
      expect(t, `${file} non passa l'organizzazione a callClaude`).toMatch(/supabase, orgId: org\.id, feature: '/)
    }
    const motore = vive(leggi('api/lib/aiEngine.js'))
    expect(motore).toMatch(/registraSpesaAi\(\{ supabase, orgId, feature/)
  })

  it('callClaude senza organizzazione non registra e non si rompe', () => {
    const motore = vive(leggi('api/lib/aiEngine.js'))
    expect(motore).toMatch(/if \(supabase && orgId\) \{/)
  })
})

describe('il costo stimato per chiamata', () => {
  it('la lettura di una fattura costa più di una richiesta normale', () => {
    expect(estimateCostForCall({ feature: 'ocr_invoice' }))
      .toBeGreaterThan(estimateCostForCall({ model: 'claude-sonnet-5' }))
  })

  it('un modello economico costa meno di uno grande', () => {
    expect(estimateCostForCall({ model: 'claude-haiku-4-5' }))
      .toBeLessThan(estimateCostForCall({ model: 'claude-sonnet-5' }))
    expect(estimateCostForCall({ model: 'claude-sonnet-5' }))
      .toBeLessThan(estimateCostForCall({ model: 'claude-opus-5' }))
  })

  it('un modello sconosciuto ha comunque un costo, non zero', () => {
    expect(estimateCostForCall({ model: 'qualcosa-di-nuovo' })).toBeGreaterThan(0)
    expect(estimateCostForCall({})).toBeGreaterThan(0)
  })
})
