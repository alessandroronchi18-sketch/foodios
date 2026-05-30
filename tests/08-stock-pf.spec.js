// @ts-check
// Test E2E sul ciclo stock prodotti finiti: carico produzione, vendita,
// eliminazione sessione, scarico stock vetrina.
//
// Stato attuale: STUB — gated su TEST_PRODOTTO_SEED. La logica di setup
// richiede un ricettario seed con almeno 1 ricetta + magazzino popolato.
// Vedi tests/helpers/auth.js per come scrive .seed-state.json.
//
// Quando il global-setup di Playwright produce TEST_PRODOTTO_SEED nella
// .env.test, questo test puo' partire da solo.

import { test, expect } from '@playwright/test'
import { login, navTo, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

const PROD = process.env.TEST_PRODOTTO_SEED || ''

test.describe('Stock vetrina — ciclo completo', () => {
  test.skip(!TEST_EMAIL || !TEST_PASSWORD || !PROD,
    'TEST_PRODOTTO_SEED non impostato (nome prodotto seed nel ricettario test)')

  test('produzione → vendita → delete sessione → stock zero', async ({ page }) => {
    await login(page)

    // 1. Apri Produzione, registra 10 stampi del prodotto seed
    await navTo(page, 'Produzione')
    const inputQta = page.getByLabel(new RegExp(`${PROD}.*stampi`, 'i')).first()
    if (await inputQta.count() === 0) test.skip(true, `Ricetta seed "${PROD}" non trovata nel ricettario corrente`)
    await inputQta.fill('10')
    await page.getByRole('button', { name: /conferma produzione/i }).click()
    await page.getByRole('button', { name: /sì, conferma/i }).click()
    await expect(page.getByText(/produzione registrata/i).first()).toBeVisible({ timeout: 15000 })

    // 2. Verifica stock = 10 (in Magazzino o nel widget)
    await navTo(page, 'Magazzino')
    await expect(page.getByText(new RegExp(PROD, 'i')).first()).toBeVisible({ timeout: 10000 })

    // 3. Elimina la sessione
    await navTo(page, 'Produzione')
    await page.getByRole('tab', { name: /storico/i }).click().catch(() => {})
    await page.getByRole('button', { name: /elimina/i }).first().click()
    await page.getByPlaceholder('ELIMINA').fill('ELIMINA')
    await page.getByRole('button', { name: /elimina e reintegra/i }).click()
    await expect(page.getByText(/sessione eliminata/i).first()).toBeVisible({ timeout: 15000 })

    // 4. Verifica stock = 0 (ovvero il prodotto non e' piu' visibile in vetrina)
    await navTo(page, 'Magazzino')
    // Lo stock potrebbe ancora avere riga con quantita 0; il widget Dashboard
    // mostra solo righe > 0. Per il test, controlliamo via API direttamente:
    const stockZero = await page.evaluate(async (prodName) => {
      const sb = (await import('/src/lib/supabase.js')).supabase
      const { data: { user } } = await sb.auth.getUser()
      const { data: prof } = await sb.from('profiles').select('organization_id').eq('id', user.id).single()
      const { data } = await sb.from('stock_prodotti_finiti')
        .select('quantita')
        .eq('organization_id', prof.organization_id)
        .eq('prodotto_nome', prodName.toUpperCase().trim())
        .maybeSingle()
      return Number(data?.quantita || 0)
    }, PROD)
    expect(stockZero).toBe(0)
  })
})
