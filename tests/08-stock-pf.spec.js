// @ts-check
// Stock prodotti finiti: carico (produzione) → scarico (vendita) → scarto.
// Self-contained: crea un'org effimera e chiama le RPC col token utente (le RPC
// usano get_user_org_id() dal JWT), verificando lo stock dopo ogni movimento.
// Pulisce a fine test.
//
// Gira se ci sono: SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY.

import { test, expect } from '@playwright/test'
import { hasDbEnv, serviceClient, createEphemeralOrg, cleanupOrg } from './helpers/db.js'

test.describe('Stock prodotti finiti — carico/scarico/scarto via RPC', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('il carico aumenta lo stock, scarico e scarto lo riducono', async () => {
    const svc = serviceClient()
    let A = null
    try {
      A = await createEphemeralOrg(svc, 'stock')
      expect(A.sedeId).toBeTruthy()
      const PROD = 'TORTA TEST PF' // convenzione: prodotto_nome uppercase().trim()

      const stockOf = async () => {
        const { data } = await A.userClient.from('stock_prodotti_finiti')
          .select('quantita').eq('sede_id', A.sedeId).eq('prodotto_nome', PROD).maybeSingle()
        return Number(data?.quantita ?? 0)
      }

      // carico 10
      {
        const { error } = await A.userClient.rpc('stock_pf_carico_produzione', {
          p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 10, p_unita: 'pz', p_note: 'e2e carico',
        })
        expect(error).toBeFalsy()
      }
      expect(await stockOf()).toBe(10)

      // scarico vendita 4 → 6
      {
        const { error } = await A.userClient.rpc('stock_pf_scarico_vendita', {
          p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 4, p_unita: 'pz', p_note: 'e2e vendita',
        })
        expect(error).toBeFalsy()
      }
      expect(await stockOf()).toBe(6)

      // scarto 6 → 0
      {
        const { error } = await A.userClient.rpc('stock_pf_scarto', {
          p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 6, p_note: 'e2e scarto',
        })
        expect(error).toBeFalsy()
      }
      expect(await stockOf()).toBe(0)

      // carico con quantità non valida (0) → la RPC deve rifiutare
      {
        const { error } = await A.userClient.rpc('stock_pf_carico_produzione', {
          p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 0, p_unita: 'pz', p_note: null,
        })
        expect(error).toBeTruthy()
      }

      // un movimento su una sede di un'ALTRA org sarebbe bloccato: la RPC ricava
      // l'org dal JWT, quindi non può toccare sedi non proprie (coperto da RLS).
    } finally {
      await cleanupOrg(svc, A)
    }
  })
})
