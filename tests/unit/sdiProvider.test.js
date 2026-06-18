// sdiProvider — abstraction layer per provider SDI (Fatture in Cloud + futuri).
// Test focalizzati su: id resolution via env, required env list, isConfigured,
// loader dinamico con fallback.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIG_ENV = { ...process.env }

async function loadModule(envOverrides = {}) {
  vi.resetModules()
  process.env = { ...ORIG_ENV, ...envOverrides }
  return await import('../../api/lib/sdiProvider.js')
}

afterEach(() => {
  process.env = { ...ORIG_ENV }
})

describe('activeSdiProviderId', () => {
  it('default = fattureincloud se env non settata', async () => {
    const mod = await loadModule({ SDI_PROVIDER: undefined })
    delete process.env.SDI_PROVIDER
    // re-import dopo aver pulito davvero
    vi.resetModules()
    const fresh = await import('../../api/lib/sdiProvider.js')
    expect(fresh.activeSdiProviderId()).toBe('fattureincloud')
  })

  it('legge SDI_PROVIDER da env e lo lowercaseza', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'ARUBA' })
    expect(mod.activeSdiProviderId()).toBe('aruba')
  })

  it('valore con casing misto → lowercase', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'EasyFatque' })
    expect(mod.activeSdiProviderId()).toBe('easyfatque')
  })
})

describe('activeSdiProviderRequiredEnv', () => {
  it('fattureincloud → [API_TOKEN, COMPANY_ID]', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'fattureincloud' })
    expect(mod.activeSdiProviderRequiredEnv()).toEqual([
      'FATTUREINCLOUD_API_TOKEN',
      'FATTUREINCLOUD_COMPANY_ID',
    ])
  })

  it('aruba → [USERNAME, PASSWORD, TRANSMITTER_ID]', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'aruba' })
    expect(mod.activeSdiProviderRequiredEnv()).toEqual([
      'ARUBA_USERNAME', 'ARUBA_PASSWORD', 'ARUBA_TRANSMITTER_ID',
    ])
  })

  it('easyfatque → [API_KEY]', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'easyfatque' })
    expect(mod.activeSdiProviderRequiredEnv()).toEqual(['EASYFATTURE_API_KEY'])
  })

  it('provider sconosciuto → [] (no crash)', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'qualcosa_di_inesistente' })
    expect(mod.activeSdiProviderRequiredEnv()).toEqual([])
  })
})

describe('isSdiProviderConfigured', () => {
  it('fattureincloud configurato (entrambe le env presenti) → true', async () => {
    const mod = await loadModule({
      SDI_PROVIDER: 'fattureincloud',
      FATTUREINCLOUD_API_TOKEN: 'tok',
      FATTUREINCLOUD_COMPANY_ID: '42',
    })
    expect(mod.isSdiProviderConfigured()).toBe(true)
  })

  it('fattureincloud manca una env → false', async () => {
    vi.resetModules()
    process.env = { ...ORIG_ENV }
    process.env.SDI_PROVIDER = 'fattureincloud'
    process.env.FATTUREINCLOUD_API_TOKEN = 'tok'
    delete process.env.FATTUREINCLOUD_COMPANY_ID
    const mod = await import('../../api/lib/sdiProvider.js')
    expect(mod.isSdiProviderConfigured()).toBe(false)
  })

  it('env vuota stringa "" → false (every !!)', async () => {
    const mod = await loadModule({
      SDI_PROVIDER: 'fattureincloud',
      FATTUREINCLOUD_API_TOKEN: '',
      FATTUREINCLOUD_COMPANY_ID: '42',
    })
    expect(mod.isSdiProviderConfigured()).toBe(false)
  })

  it('provider sconosciuto (requiredEnv = []) → true (every su [] = true)', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'unknown' })
    // every su array vuoto è true: documenta il comportamento attuale
    expect(mod.isSdiProviderConfigured()).toBe(true)
  })

  it('aruba: tutte le 3 env settate → true', async () => {
    const mod = await loadModule({
      SDI_PROVIDER: 'aruba',
      ARUBA_USERNAME: 'u',
      ARUBA_PASSWORD: 'p',
      ARUBA_TRANSMITTER_ID: 't',
    })
    expect(mod.isSdiProviderConfigured()).toBe(true)
  })
})

describe('loadSdiProvider', () => {
  beforeEach(() => { vi.resetModules() })

  it('throw se provider id non in mappa PROVIDERS', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'aruba' })
    // aruba esiste in requiredEnv ma NON è registrato in PROVIDERS (commentato);
    // il loader deve buttare un errore esplicito.
    await expect(mod.loadSdiProvider()).rejects.toThrow(/non supportato.*aruba/)
  })

  it('throw chiaro con nome provider nel messaggio', async () => {
    const mod = await loadModule({ SDI_PROVIDER: 'inesistente' })
    await expect(mod.loadSdiProvider()).rejects.toThrow('SDI provider non supportato: inesistente')
  })

  it('fattureincloud carica il modulo (mocked)', async () => {
    // Mock del modulo fattureInCloud.js per evitare di toccare deps reali.
    vi.doMock('../../api/lib/fattureInCloud.js', () => ({
      upsertCliente: vi.fn(),
      emettiFatturaElettronica: vi.fn(),
      getInvoicePdfUrl: vi.fn(),
    }))
    process.env = { ...ORIG_ENV, SDI_PROVIDER: 'fattureincloud' }
    const mod = await import('../../api/lib/sdiProvider.js')
    const provider = await mod.loadSdiProvider()
    expect(provider).toBeDefined()
    expect(typeof provider.upsertCliente).toBe('function')
    expect(typeof provider.emettiFatturaElettronica).toBe('function')
    expect(typeof provider.getInvoicePdfUrl).toBe('function')
    vi.doUnmock('../../api/lib/fattureInCloud.js')
  })
})
