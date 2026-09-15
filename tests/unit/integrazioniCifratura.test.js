// Le chiavi delle integrazioni stanno cifrate sul database.
//
// Dentro `integrazioni.config` ci sono le chiavi di accesso ai gestionali dei
// clienti: Zucchetti, Cassa in Cloud, SumUp, Deliveroo. Chi legge quella
// tabella in chiaro entra nella cassa di ogni cliente di Foodos, non solo nei
// suoi dati.
//
// 70 righe al 63% di copertura fino al 15/09/2026, e la parte scoperta era
// quella che conta: cosa succede se la chiave manca, se è della lunghezza
// sbagliata, o se qualcuno prova a decifrare con un contenuto manomesso.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Una chiave da 32 byte, come vuole AES-256. Solo per i test.
const CHIAVE = Buffer.from(new Uint8Array(32).fill(7)).toString('base64')

let cifratura
async function caricaModulo() {
  vi.resetModules()
  return import('../../api/lib/integrationsCrypto.js')
}

const envOriginale = process.env.INTEGRATIONS_ENCRYPTION_KEY

beforeEach(async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = CHIAVE
  cifratura = await caricaModulo()
})
afterEach(() => {
  if (envOriginale === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY
  else process.env.INTEGRATIONS_ENCRYPTION_KEY = envOriginale
})

describe('cifrare e decifrare', () => {
  it('quello che entra è quello che esce', async () => {
    const config = { api_key: 'zucchetti-abc-123', endpoint: 'https://api.zucchetti.it', sede: 4 }
    const enc = await cifratura.encryptConfig(config)
    const dec = await cifratura.decryptConfig({ ...enc })
    expect(dec).toEqual(config)
  })

  it('il testo in chiaro non compare da nessuna parte nel risultato', async () => {
    const enc = await cifratura.encryptConfig({ api_key: 'SEGRETISSIMO-999' })
    const tutto = JSON.stringify(enc)
    expect(tutto).not.toContain('SEGRETISSIMO')
    expect(tutto).not.toContain('api_key')
  })

  it('due cifrature dello stesso contenuto sono diverse', async () => {
    // L'IV è casuale a ogni scrittura. Se due righe uguali producessero lo
    // stesso testo cifrato, chi guarda il database saprebbe che due clienti
    // usano la stessa configurazione.
    const a = await cifratura.encryptConfig({ k: 'uguale' })
    const b = await cifratura.encryptConfig({ k: 'uguale' })
    expect(a.config_encrypted).not.toBe(b.config_encrypted)
    expect(a.config_iv).not.toBe(b.config_iv)
    // Ma tutte e due si rileggono.
    expect(await cifratura.decryptConfig(a)).toEqual({ k: 'uguale' })
    expect(await cifratura.decryptConfig(b)).toEqual({ k: 'uguale' })
  })

  it('l\'IV è di 12 byte e il sigillo di 16, come vuole AES-GCM', async () => {
    const enc = await cifratura.encryptConfig({ a: 1 })
    expect(Buffer.from(enc.config_iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(enc.config_tag, 'base64')).toHaveLength(16)
    expect(enc.encryption_version).toBe(1)
  })

  it('regge oggetti vuoti, nulli e annidati', async () => {
    for (const v of [{}, null, undefined, { a: { b: { c: [1, 2, { d: 'x' }] } } }]) {
      const enc = await cifratura.encryptConfig(v)
      expect(await cifratura.decryptConfig(enc)).toEqual(v ?? {})
    }
  })

  it('regge accenti e caratteri non latini', async () => {
    const config = { nome: 'Pasticceria Però — è così', emoji_nel_dato: 'キー' }
    expect(await cifratura.decryptConfig(await cifratura.encryptConfig(config))).toEqual(config)
  })
})

describe('le righe vecchie, non ancora cifrate', () => {
  it('una riga senza versione restituisce la configurazione in chiaro', async () => {
    expect(await cifratura.decryptConfig({ config: { api_key: 'vecchia' } }))
      .toEqual({ api_key: 'vecchia' })
    expect(await cifratura.decryptConfig({ encryption_version: 0, config: { a: 1 } }))
      .toEqual({ a: 1 })
  })

  it('una riga vecchia e vuota dà un oggetto vuoto, non un errore', async () => {
    expect(await cifratura.decryptConfig({ encryption_version: 0 })).toEqual({})
    expect(await cifratura.decryptConfig({ encryption_version: 0, config: null })).toEqual({})
  })

  it('nessuna riga: oggetto vuoto', async () => {
    expect(await cifratura.decryptConfig(null)).toEqual({})
    expect(await cifratura.decryptConfig(undefined)).toEqual({})
  })
})

describe('quando qualcosa non torna, si ferma', () => {
  it('una riga dichiarata cifrata ma senza i pezzi si rifiuta di indovinare', async () => {
    for (const rotta of [
      { encryption_version: 1 },
      { encryption_version: 1, config_encrypted: 'x' },
      { encryption_version: 1, config_encrypted: 'x', config_iv: 'y' },
    ]) {
      await expect(cifratura.decryptConfig(rotta)).rejects.toThrow(/mancano IV\/tag\/ciphertext/)
    }
  })

  it('un contenuto manomesso non si decifra: è il punto del sigillo', async () => {
    const enc = await cifratura.encryptConfig({ api_key: 'vero' })
    const manomesso = { ...enc, config_encrypted: Buffer.from('falso!!!!!!!!').toString('base64') }
    await expect(cifratura.decryptConfig(manomesso)).rejects.toThrow()
  })

  it('un sigillo cambiato nemmeno', async () => {
    const enc = await cifratura.encryptConfig({ api_key: 'vero' })
    const altro = await cifratura.encryptConfig({ api_key: 'altro' })
    await expect(cifratura.decryptConfig({ ...enc, config_tag: altro.config_tag })).rejects.toThrow()
  })

  it('e nemmeno con l\'IV di un\'altra riga', async () => {
    const enc = await cifratura.encryptConfig({ api_key: 'vero' })
    const altro = await cifratura.encryptConfig({ api_key: 'vero' })
    await expect(cifratura.decryptConfig({ ...enc, config_iv: altro.config_iv })).rejects.toThrow()
  })
})

describe('la chiave di cifratura', () => {
  it('se manca lo dice chiaramente, invece di scrivere in chiaro', async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    const m = await caricaModulo()
    await expect(m.encryptConfig({ a: 1 })).rejects.toThrow(/INTEGRATIONS_ENCRYPTION_KEY non configurato/)
  })

  it('se è della lunghezza sbagliata lo dice, col numero di byte', async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.from(new Uint8Array(16)).toString('base64')
    const m = await caricaModulo()
    await expect(m.encryptConfig({ a: 1 })).rejects.toThrow(/ha 16 byte, attesi 32/)
  })

  it('con una chiave diversa il contenuto non si rilegge', async () => {
    // È la prova che la cifratura serve davvero: chi ruba il database senza
    // la chiave non ci fa niente.
    const enc = await cifratura.encryptConfig({ api_key: 'segreto' })
    process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString('base64')
    const altroModulo = await caricaModulo()
    await expect(altroModulo.decryptConfig(enc)).rejects.toThrow()
  })
})

describe('leggere e scrivere una riga', () => {
  const db = (riga) => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: riga, error: null }) }) }) }) }),
    }),
  })

  it('leggere una riga restituisce la configurazione già decifrata', async () => {
    const enc = await cifratura.encryptConfig({ api_key: 'zucchetti' })
    const r = await cifratura.loadIntegrazione(db({ id: 'i1', tipo: 'zucchetti', attiva: true, ...enc }), 'org-1', 'zucchetti')
    expect(r.config).toEqual({ api_key: 'zucchetti' })
    expect(r.tipo).toBe('zucchetti')
  })

  it('nessuna riga: null, non un errore', async () => {
    expect(await cifratura.loadIntegrazione(db(null), 'org-1', 'zucchetti')).toBe(null)
  })

  it('un errore del database si propaga: non si finge che non ci sia', async () => {
    const rotto = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('permission denied') }) }) }) }) }) }) }
    await expect(cifratura.loadIntegrazione(rotto, 'o', 't')).rejects.toThrow(/permission denied/)
  })

  it('scrivendo, la colonna in chiaro viene azzerata', async () => {
    // Se restasse il vecchio valore, la cifratura non servirebbe a niente:
    // il segreto sarebbe ancora lì accanto, leggibile.
    const scritture = []
    const dbScrittura = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        upsert: (v) => { scritture.push(v); return { select: () => ({ single: async () => ({ data: v, error: null }) }) } },
        insert: (v) => { scritture.push(v); return { select: () => ({ single: async () => ({ data: v, error: null }) }) } },
        update: (v) => { scritture.push(v); return { eq: () => ({ select: () => ({ single: async () => ({ data: v, error: null }) }) }) } },
      }),
    }
    await cifratura.saveIntegrazione(dbScrittura, { orgId: 'o1', tipo: 'sumup', config: { api_key: 'x' } })
    expect(scritture.length).toBeGreaterThan(0)
    const scritta = scritture[0]
    expect(scritta.config, 'la colonna in chiaro non è stata azzerata').toBe(null)
    expect(scritta.encryption_version).toBe(1)
    expect(JSON.stringify(scritta)).not.toContain('api_key')
  })
})
