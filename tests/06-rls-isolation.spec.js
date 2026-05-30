// @ts-check
// RLS isolation test: cliente A non puo' leggere/scrivere dati di cliente B.
//
// Richiede 2 utenti Supabase in 2 ORG DIVERSE. Variabili d'ambiente:
//   TEST_EMAIL / TEST_PASSWORD          → utente A (vedi .env.test)
//   TEST_EMAIL_2 / TEST_PASSWORD_2      → utente B (nuovo - aggiungi a .env.test)
//
// Il test e' skipped se TEST_EMAIL_2 manca, evita rotture in CI fino a setup
// del secondo account.

import { test, expect } from '@playwright/test'
import { login, logout, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

const TEST_EMAIL_2 = process.env.TEST_EMAIL_2 || ''
const TEST_PASSWORD_2 = process.env.TEST_PASSWORD_2 || ''

test.describe('RLS Isolation cross-org', () => {
  test.skip(!TEST_EMAIL_2 || !TEST_PASSWORD_2, 'TEST_EMAIL_2 / TEST_PASSWORD_2 non impostati — setup 2 account in org diverse e riprova')

  test('user B non legge dati di user A', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    // ── A. Login user A, estrai org_id ───────────────────────────────────
    await login(page, TEST_EMAIL, TEST_PASSWORD)
    const orgIdA = await page.evaluate(async () => {
      // accediamo a window.supabase tramite il modulo gia' importato
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data: { user } } = await sb.auth.getUser()
      const { data: prof } = await sb.from('profiles').select('organization_id').eq('id', user.id).single()
      return prof?.organization_id
    })
    expect(orgIdA).toBeTruthy()

    // Conta quanti record ha A (per smentire eventuale leak)
    const recordsA = await page.evaluate(async () => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { count } = await sb.from('user_data').select('id', { count: 'exact', head: true })
      return count || 0
    })

    await logout(page)

    // ── B. Login user B, prova a leggere org A ───────────────────────────
    await login(page, TEST_EMAIL_2, TEST_PASSWORD_2)
    const orgIdB = await page.evaluate(async () => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data: { user } } = await sb.auth.getUser()
      const { data: prof } = await sb.from('profiles').select('organization_id').eq('id', user.id).single()
      return prof?.organization_id
    })
    expect(orgIdB).toBeTruthy()
    expect(orgIdB).not.toBe(orgIdA)

    // 1. user_data: select esplicito sull'org A → deve essere vuoto
    const leakUserData = await page.evaluate(async (orgA) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data, error } = await sb.from('user_data').select('id').eq('organization_id', orgA).limit(5)
      return { count: data?.length || 0, error: error?.message || null }
    }, orgIdA)
    expect(leakUserData.count).toBe(0)

    // 2. sedi di A → deve essere vuoto
    const leakSedi = await page.evaluate(async (orgA) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data } = await sb.from('sedi').select('id').eq('organization_id', orgA).limit(5)
      return data?.length || 0
    }, orgIdA)
    expect(leakSedi).toBe(0)

    // 3. organizations di A → 0 row visibili (RLS sull'org)
    const leakOrg = await page.evaluate(async (orgA) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data } = await sb.from('organizations').select('id').eq('id', orgA).limit(1)
      return data?.length || 0
    }, orgIdA)
    expect(leakOrg).toBe(0)

    // 4. audit_log di A → 0 row visibili
    const leakAudit = await page.evaluate(async (orgA) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data } = await sb.from('audit_log').select('id').eq('organization_id', orgA).limit(5)
      return data?.length || 0
    }, orgIdA)
    expect(leakAudit).toBe(0)

    // 5. stock_prodotti_finiti di A → 0 visibili
    const leakStock = await page.evaluate(async (orgA) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data } = await sb.from('stock_prodotti_finiti').select('id').eq('organization_id', orgA).limit(5)
      return data?.length || 0
    }, orgIdA)
    expect(leakStock).toBe(0)

    // 6. Provo INSERT su org A da user B → deve fallire (RLS with check)
    const insertAttempt = await page.evaluate(async (orgA) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { error } = await sb.from('user_data').insert({
        organization_id: orgA,
        sede_id: null,
        data_key: 'pasticceria-ai-v1',
        data_value: { stolen: true },
        updated_at: new Date().toISOString(),
      })
      return { error: error?.code || null, message: error?.message || null }
    }, orgIdA)
    expect(insertAttempt.error).toBeTruthy()
    // 42501 = RLS denial, 23505 = unique key (anche valido — l'insert non e' passato comunque)
    expect(['42501', '23503', '23505']).toContain(insertAttempt.error)

    // ── C. Sanity: A aveva record, B ha visto 0. Non e' un caso di "DB vuoto".
    expect(recordsA).toBeGreaterThan(0)
  })
})
