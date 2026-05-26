// @ts-check
import { test, expect } from '@playwright/test'
import { login, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

test.describe('Ricettario', () => {
  test('aggiungi ricetta con 2 ingredienti → reload → persistenza', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    await login(page)

    // 1. Naviga a Ricettario
    await page.getByText(/^ricettario$/i).first().click()
    await page.waitForLoadState('networkidle').catch(() => {})

    // 2. Apri form "Nuova ricetta" — il bottone esiste sia nella view ricettario sia in home.
    const nuova = page.getByRole('button', { name: /nuova\s+ricetta|aggiungi\s+ricetta/i })
      .or(page.getByText(/nuova\s+ricetta/i))
    await nuova.first().click()

    // 3. Compila la ricetta
    const nomeRicetta = `E2E-Test-${Date.now()}`

    // Cerca il primo input di testo non readonly come campo nome.
    const inputs = page.locator('input[type="text"]:not([readonly])')
    await inputs.first().waitFor({ state: 'visible', timeout: 10_000 })
    await inputs.first().fill(nomeRicetta)

    // 4. Aggiungi 2 ingredienti — il pulsante tipicamente si chiama "Aggiungi ingrediente"
    const addIng = page.getByRole('button', { name: /aggiungi\s+ingrediente|\+\s*ingrediente/i })
      .or(page.getByText(/aggiungi\s+ingrediente/i))

    for (let i = 0; i < 2; i++) {
      await addIng.first().click()
      // L app apre o un select o un input testuale per il nome ingrediente.
      // Riempi gli ultimi input visibili.
      await page.waitForTimeout(300)
      const ingInputs = page.locator('input[type="text"]:not([readonly])')
      const count = await ingInputs.count()
      if (count > i + 1) {
        await ingInputs.nth(count - 1).fill(`Ingrediente-${i + 1}-${Date.now()}`)
      }
      const qtyInputs = page.locator('input[type="number"]')
      const qc = await qtyInputs.count()
      if (qc > 0) {
        await qtyInputs.nth(qc - 1).fill('100')
      }
    }

    // 5. Salva
    const salva = page.getByRole('button', { name: /^salva|salva\s+ricetta/i })
    await salva.first().click()

    // Attendi conferma salvataggio (toast / redirect a ricettario)
    await page.waitForLoadState('networkidle').catch(() => {})

    // 6. Reload
    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})

    // Torna su Ricettario se serve
    await page.getByText(/^ricettario$/i).first().click().catch(() => {})

    // 7. Verifica che la ricetta sia ancora presente
    await expect(page.getByText(nomeRicetta).first()).toBeVisible({ timeout: 15_000 })
  })
})
