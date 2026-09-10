// Il giro completo cifra → decifra come lo fa la migrazione in api/admin.js.
//
// Il test che esisteva passava a decryptConfig l'oggetto INTERO restituito da
// encryptConfig, che contiene già `encryption_version`, e per questo non
// vedeva il difetto: la migrazione ricostruiva a mano un oggetto con solo
// ciphertext, iv e tag, senza la version. decryptConfig in quel caso prende il
// ramo legacy e restituisce `row.config` — che lì non c'è — quindi {}. Il
// confronto col config originale falliva SEMPRE e ogni riga con un segreto
// dentro veniva saltata.
import { describe, it, expect, beforeAll } from 'vitest'
import { encryptConfig, decryptConfig } from '../../api/lib/integrationsCrypto.js'

beforeAll(() => {
  // 32 byte in base64: la chiave che si aspetta il modulo.
  process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')
})

describe('integrations crypto: giro completo', () => {
  it('con la version il giro torna (è il caso della migrazione)', async () => {
    const config = { api_key: 'segreto-123', store: 'mara' }
    const enc = await encryptConfig(config)
    const roundTrip = await decryptConfig({
      config_encrypted: enc.config_encrypted,
      config_iv: enc.config_iv,
      config_tag: enc.config_tag,
      encryption_version: enc.encryption_version,
    })
    expect(roundTrip).toEqual(config)
  })

  it('SENZA la version si cade nel ramo legacy e non si decifra niente', async () => {
    const config = { api_key: 'segreto-123' }
    const enc = await encryptConfig(config)
    const roundTrip = await decryptConfig({
      config_encrypted: enc.config_encrypted,
      config_iv: enc.config_iv,
      config_tag: enc.config_tag,
    })
    // Questo è il comportamento documentato di decryptConfig, non un difetto
    // suo: è il chiamante che deve passare la version. Il test lo blocca, così
    // se qualcuno ricostruisce a mano una riga se ne accorge.
    expect(roundTrip).toEqual({})
    expect(roundTrip).not.toEqual(config)
  })

  it('encryptConfig dichiara sempre la version', async () => {
    const enc = await encryptConfig({ a: 1 })
    expect(enc.encryption_version).toBe(1)
  })
})
