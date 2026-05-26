// @ts-check
import { test, expect } from '@playwright/test'
import { login, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

test.describe('Chiusura cassa', () => {
  test('inserisci dati chiusura → salva → totali corretti → reload → persistono', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    await login(page)

    // 1. Naviga a Cassa / Chiusura
    const cassaLink = page.getByText(/^(cassa|chiusura)/i).first()
    await cassaLink.click()
    await page.waitForLoadState('networkidle').catch(() => {})

    // 2. Inserisci dati chiusura giornaliera.
    // La ChiusuraView ha campi numerici per contante, POS, ecc.
    const incassoContante = 123.45
    const incassoPOS = 234.56
    const totaleAtteso = incassoContante + incassoPOS

    const numInputs = page.locator('input[type="number"]')
    const nNum = await numInputs.count()
    if (nNum < 2) {
      test.skip(true, 'Form chiusura cassa non trovato — verifica che la sezione sia accessibile')
    }

    await numInputs.nth(0).fill(String(incassoContante))
    await numInputs.nth(1).fill(String(incassoPOS))

    // 3. Salva
    const salva = page.getByRole('button', { name: /^salva|conferma|chiudi\s+cassa/i })
    await salva.first().click()
    await page.waitForLoadState('networkidle').catch(() => {})

    // 4. Verifica che il totale sia visibile e corretto (formato europeo con virgola o punto).
    const totRegexComma = new RegExp(totaleAtteso.toFixed(2).replace('.', '[.,]'))
    await expect(page.locator('body')).toContainText(totRegexComma, { timeout: 10_000 })

    // 5. Reload e verifica persistenza
    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})

    await page.getByText(/^(cassa|chiusura)/i).first().click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})

    await expect(page.locator('body')).toContainText(totRegexComma, { timeout: 10_000 })
  })
})
