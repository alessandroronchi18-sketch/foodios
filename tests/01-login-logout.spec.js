// @ts-check
import { test, expect } from '@playwright/test'
import { login, logout, navTo, TEST_EMAIL, TEST_PASSWORD , SEED_OK} from './helpers/auth.js'

test.describe('Login / Logout', () => {
  test('login -> dashboard -> logout -> login', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD || !SEED_OK, 'TEST_EMAIL/TEST_PASSWORD o seed non disponibili (aggiorna i secret DB)')

    await login(page)
    // Loggato: il menu profilo (topbar) è presente in ogni layout.
    await expect(page.getByRole('button', { name: 'Menu profilo' }).first()).toBeVisible({ timeout: 20000 })

    await logout(page)
    // Dopo logout: landing/login, il menu profilo non c'è più.
    await expect(page.getByRole('button', { name: 'Menu profilo' })).toHaveCount(0, { timeout: 15000 })

    await login(page)
    await expect(page.getByRole('button', { name: 'Menu profilo' }).first()).toBeVisible({ timeout: 20000 })
    // Dato persistente (ricetta seed) ancora accessibile dopo re-login.
    await navTo(page, 'Ricettario')
    await expect(page.getByText('SEED TORTA TEST').first()).toBeVisible({ timeout: 15000 })
  })
})
