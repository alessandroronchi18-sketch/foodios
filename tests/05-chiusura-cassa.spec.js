// @ts-check
import { test, expect } from '@playwright/test'
import { login, navTo, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

test.describe('Chiusura cassa', () => {
  test('la view Cassa si apre con upload scontrino e selettore data', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    await login(page)
    await navTo(page, 'Cassa')

    // ChiusuraView reale: OCR scontrino + import (no input contante/POS manuali).
    await expect(page.getByText(/foto scontrino|scontrino di chiusura/i).first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /delivery|sistema cassa/i }).first()).toBeVisible({ timeout: 10000 })
  })
})
