// @ts-check
// Inventario produzione multi-sede + trasferimento: copre i 2 flow operativi
// piu' rotti storicamente (data loss su carico/scarico cross-sede, doppio
// scalo magazzino su spedizione, RLS escalation su trasferimento_ricevi).
//
// Self-contained: crea org + 2 sedi via service key, esegue:
//   1. carico produzione sede A
//   2. trasferimento A -> B (rimanenza_g scalata, non produzione_g)
//   3. ricezione B
//   4. scarico vendita B
//   5. scarto B
// e verifica gli stati di stock_prodotti_finiti + trasferimenti dopo ogni step.
//
// Pulisce a fine test. Skippato se mancano env DB.

import { test, expect } from '@playwright/test'
import { hasDbEnv, serviceClient, createEphemeralOrg, cleanupOrg } from './helpers/db.js'

test.describe('Produzione + trasferimento multi-sede (RPC end-to-end)', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('carico A → trasferimento A→B → ricezione → vendita → scarto: stock coerente', async () => {
    const svc = serviceClient()
    let A = null
    try {
      A = await createEphemeralOrg(svc, 'prod-multi')
      expect(A.orgId).toBeTruthy()
      expect(A.sedeId).toBeTruthy()

      // Aggiungo una seconda sede all'org via service key.
      const { data: sedeB, error: eB } = await svc.from('sedi')
        .insert({ organization_id: A.orgId, nome: 'Sede B test', attiva: true, is_default: false })
        .select('id').single()
      expect(eB).toBeFalsy()
      const sedeAId = A.sedeId
      const sedeBId = sedeB.id

      const PROD = 'TORTA E2E MULTISEDE'

      const stockOf = async (sedeId) => {
        const { data } = await A.userClient.from('stock_prodotti_finiti')
          .select('quantita').eq('sede_id', sedeId).eq('prodotto_nome', PROD).maybeSingle()
        return Number(data?.quantita ?? 0)
      }

      // 1. carico A: 20 pz
      {
        const { error } = await A.userClient.rpc('stock_pf_carico_produzione', {
          p_sede: sedeAId, p_prodotto: PROD, p_quantita: 20, p_unita: 'pz', p_note: 'e2e prod A',
        })
        expect(error, error?.message).toBeFalsy()
      }
      expect(await stockOf(sedeAId)).toBe(20)
      expect(await stockOf(sedeBId)).toBe(0)

      // 2. crea trasferimento A → B di 8 pz (bozza)
      const { data: tras, error: eT } = await A.userClient.from('trasferimenti').insert({
        organization_id: A.orgId, sede_da: sedeAId, sede_a: sedeBId, prodotto_nome: PROD,
        quantita: 8, unita: 'pz', tipo: 'prodotto', stato: 'bozza',
      }).select('id').single()
      expect(eT, eT?.message).toBeFalsy()
      expect(tras.id).toBeTruthy()

      // 3. invio trasferimento: scala A
      {
        const { error } = await A.userClient.rpc('trasferimento_invia', { p_id: tras.id })
        expect(error, error?.message).toBeFalsy()
      }
      expect(await stockOf(sedeAId)).toBe(12) // 20 - 8
      expect(await stockOf(sedeBId)).toBe(0)  // B non ancora ricevuto

      // 4. ricezione B (tutto integro, niente scarto)
      {
        const { error } = await A.userClient.rpc('trasferimento_ricevi', {
          p_id: tras.id, p_quantita_ricevuta: 8, p_scarto: 0, p_note: 'ricevuto integro',
        })
        expect(error, error?.message).toBeFalsy()
      }
      expect(await stockOf(sedeAId)).toBe(12)
      expect(await stockOf(sedeBId)).toBe(8)

      // 5. scarico vendita B: 3 pz → B=5
      {
        const { error } = await A.userClient.rpc('stock_pf_scarico_vendita', {
          p_sede: sedeBId, p_prodotto: PROD, p_quantita: 3, p_unita: 'pz', p_note: 'vendita B',
        })
        expect(error, error?.message).toBeFalsy()
      }
      expect(await stockOf(sedeBId)).toBe(5)

      // 6. scarto B 1 pz → B=4
      {
        const { error } = await A.userClient.rpc('stock_pf_scarto', {
          p_sede: sedeBId, p_prodotto: PROD, p_quantita: 1, p_note: 'scarto B',
        })
        expect(error, error?.message).toBeFalsy()
      }
      expect(await stockOf(sedeBId)).toBe(4)

      // Totale magazzino prodotto (cross-sede): 12 + 4 = 16 (era 20, ne ho venduto 3 e scartato 1).
      const totale = await stockOf(sedeAId) + await stockOf(sedeBId)
      expect(totale).toBe(16)

      // Audit movimenti: deve esserci una riga per ogni movimento.
      const { data: mov } = await A.userClient.from('movimenti_stock_pf')
        .select('causale, delta').eq('prodotto_nome', PROD).order('created_at')
      expect((mov || []).length).toBeGreaterThanOrEqual(5)
    } finally {
      if (A) await cleanupOrg(svc, A.orgId)
    }
  })

  test('scarico oltre stock disponibile va in negativo con causale vendita (by-design)', async () => {
    const svc = serviceClient()
    let A = null
    try {
      A = await createEphemeralOrg(svc, 'prod-neg')
      const PROD = 'PROD NEGATIVO E2E'

      // Carico 5
      await A.userClient.rpc('stock_pf_carico_produzione', {
        p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 5, p_unita: 'pz', p_note: null,
      })

      // Scarico 10 (oltre disponibile) → stock = -5, NO errore (UI mostra alert).
      const { error } = await A.userClient.rpc('stock_pf_scarico_vendita', {
        p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 10, p_unita: 'pz', p_note: 'oversold',
      })
      expect(error, error?.message).toBeFalsy()

      const { data } = await A.userClient.from('stock_prodotti_finiti')
        .select('quantita').eq('sede_id', A.sedeId).eq('prodotto_nome', PROD).maybeSingle()
      expect(Number(data.quantita)).toBe(-5)
    } finally {
      if (A) await cleanupOrg(svc, A.orgId)
    }
  })

  test('scarto con quantita ≤ 0 viene rifiutato dalla RPC', async () => {
    const svc = serviceClient()
    let A = null
    try {
      A = await createEphemeralOrg(svc, 'prod-rej')
      const PROD = 'PROD REJ E2E'

      // Tenta scarto con quantita=0: deve essere rifiutato.
      const { error: e0 } = await A.userClient.rpc('stock_pf_scarto', {
        p_sede: A.sedeId, p_prodotto: PROD, p_quantita: 0, p_note: null,
      })
      expect(e0).toBeTruthy()
      expect(e0?.message || '').toMatch(/positiva|positive|> 0/i)

      // Tenta scarto con quantita negativa: deve essere rifiutato.
      const { error: eNeg } = await A.userClient.rpc('stock_pf_scarto', {
        p_sede: A.sedeId, p_prodotto: PROD, p_quantita: -3, p_note: null,
      })
      expect(eNeg).toBeTruthy()
    } finally {
      if (A) await cleanupOrg(svc, A.orgId)
    }
  })
})
