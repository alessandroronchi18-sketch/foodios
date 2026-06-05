// @ts-check
// RLS isolation: un cliente NON può leggere né scrivere i dati di un altro.
// Self-contained: crea due org effimere via service key, ottiene un token utente
// reale per ognuna e verifica l'isolamento a livello DB (RLS). Niente browser,
// niente secondo account manuale. Pulisce a fine test.
//
// Gira se ci sono: SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY.

import { test, expect } from '@playwright/test'
import { hasDbEnv, serviceClient, createEphemeralOrg, cleanupOrg } from './helpers/db.js'

test.describe('RLS isolation cross-org', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('un cliente non vede né scrive i dati di un altro', async () => {
    const svc = serviceClient()
    let A = null, B = null
    try {
      A = await createEphemeralOrg(svc, 'rls-a')
      B = await createEphemeralOrg(svc, 'rls-b')
      expect(A.orgId).toBeTruthy()
      expect(B.orgId).toBeTruthy()
      expect(A.orgId).not.toBe(B.orgId)

      // Semina un dato per A (service key, bypassa RLS).
      const seed = await svc.from('user_data').insert({
        organization_id: A.orgId, sede_id: null,
        data_key: 'pasticceria-ai-v1', data_value: { secret: 'di A' },
        updated_at: new Date().toISOString(),
      })
      expect(seed.error).toBeFalsy()

      // B, col proprio token, non deve vedere NULLA di A.
      const leak = async (tabella) => {
        const { data } = await B.userClient.from(tabella).select('id').eq('organization_id', A.orgId)
        return (data || []).length
      }
      expect(await leak('user_data')).toBe(0)
      expect(await leak('sedi')).toBe(0)

      const { data: leakOrg } = await B.userClient.from('organizations').select('id').eq('id', A.orgId)
      expect((leakOrg || []).length).toBe(0)

      // B vede SOLO la propria org.
      const { data: ownOrg } = await B.userClient.from('organizations').select('id')
      expect((ownOrg || []).map(o => o.id)).toEqual([B.orgId])

      // INSERT cross-org da B → bloccato dalla RLS (with check).
      const { error: insErr } = await B.userClient.from('user_data').insert({
        organization_id: A.orgId, sede_id: null,
        data_key: 'pasticceria-ai-v1', data_value: { stolen: true },
        updated_at: new Date().toISOString(),
      })
      expect(insErr).toBeTruthy()
      expect(['42501', '23503', '23505']).toContain(insErr.code)

      // Sanity: A col proprio token vede il proprio dato (la RLS non blocca il legittimo).
      const { data: ownA } = await A.userClient.from('user_data').select('id').eq('organization_id', A.orgId)
      expect((ownA || []).length).toBeGreaterThan(0)
    } finally {
      await cleanupOrg(svc, A)
      await cleanupOrg(svc, B)
    }
  })
})
