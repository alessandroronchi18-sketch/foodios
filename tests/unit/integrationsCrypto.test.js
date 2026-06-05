import { describe, it, expect } from 'vitest'

// Chiave di test 32 byte (base64) impostata PRIMA che getKey() venga chiamato.
process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

const { encryptConfig, decryptConfig } = await import('../../api/lib/integrationsCrypto.js')

describe('integrationsCrypto', () => {
  it('roundtrip: decrypt(encrypt(x)) === x', async () => {
    const cfg = { apiKey: 'sk_test_abc', companyId: 42, nested: { a: [1, 2, 3] } }
    const enc = await encryptConfig(cfg)
    expect(enc.encryption_version).toBe(1)
    expect(enc.config_encrypted).toBeTruthy()
    expect(enc.config_iv).toBeTruthy()
    expect(enc.config_tag).toBeTruthy()
    const dec = await decryptConfig(enc)
    expect(dec).toEqual(cfg)
  })

  it('IV random: due cifrature dello stesso oggetto differiscono', async () => {
    const a = await encryptConfig({ x: 1 })
    const b = await encryptConfig({ x: 1 })
    expect(a.config_iv).not.toBe(b.config_iv)
    expect(a.config_encrypted).not.toBe(b.config_encrypted)
    // ma entrambe decifrano allo stesso valore
    expect(await decryptConfig(a)).toEqual(await decryptConfig(b))
  })

  it('row legacy (encryption_version 0) → ritorna config in chiaro', async () => {
    expect(await decryptConfig({ encryption_version: 0, config: { foo: 'bar' } })).toEqual({ foo: 'bar' })
    expect(await decryptConfig({ config: { foo: 'bar' } })).toEqual({ foo: 'bar' }) // version assente
  })

  it('row nulla → {}', async () => {
    expect(await decryptConfig(null)).toEqual({})
  })

  it('manomissione del ciphertext → decrypt fallisce (auth tag GCM)', async () => {
    const enc = await encryptConfig({ secret: 'top' })
    // corrompe il tag (16 byte) → l’autenticazione GCM deve fallire
    const tampered = { ...enc, config_tag: Buffer.alloc(16, 0).toString('base64') }
    await expect(decryptConfig(tampered)).rejects.toBeDefined()
  })

  it('row encrypted senza iv/tag → errore esplicito', async () => {
    await expect(decryptConfig({ encryption_version: 1, config_encrypted: 'x' })).rejects.toThrow(/IV|tag|ciphertext/i)
  })
})
