// @ts-check
import { test, expect } from '@playwright/test'
import { login, navTo, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

test.describe('Ricettario', () => {
  test('ricetta seed visibile -> reload -> persistenza', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    await login(page)
    await navTo(page, 'Ricettario')
    await expect(page.getByText('SEED TORTA TEST').first()).toBeVisible({ timeout: 15000 })

    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})
    await navTo(page, 'Ricettario').catch(() => {})
    await expect(page.getByText('SEED TORTA TEST').first()).toBeVisible({ timeout: 15000 })
  })
})
