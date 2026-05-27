// @ts-check
import { test, expect } from '@playwright/test'
import { login, logout, navTo, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

test.describe('Login / Logout', () => {
  test('login -> dashboard -> logout -> login', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    await login(page)
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible({ timeout: 20000 })

    await logout(page)
    // Dopo logout: landing page (bottoni Accedi / Prova gratis), niente dashboard.
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0, { timeout: 15000 })

    await login(page)
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible({ timeout: 20000 })
    // Dato persistente (ricetta seed) ancora accessibile.
    await navTo(page, 'Ricettario')
    await expect(page.getByText('SEED TORTA TEST').first()).toBeVisible({ timeout: 15000 })
  })
})
