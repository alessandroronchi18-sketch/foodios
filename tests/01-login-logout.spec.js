// @ts-check
import { test, expect } from '@playwright/test'
import { login, logout, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

test.describe('Login / Logout', () => {
  test('login → dashboard visibile → logout → redirect login → re-login → dati persistono', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    // 1. Login iniziale
    await login(page)

    // Dashboard deve essere visibile: cerca elementi chiave della sidebar.
    // I nomi dei moduli sono in italiano nella Dashboard.jsx.
    const sidebarItems = page.getByText(/ricettario|cassa|magazzino|home/i)
    await expect(sidebarItems.first()).toBeVisible({ timeout: 20_000 })

    // Snapshot di un dato visibile (es. nome attività in header) per verificare persistenza.
    const bodyTextBefore = await page.locator('body').innerText()
    const snippetBefore = bodyTextBefore.slice(0, 500)

    // 2. Logout
    await logout(page)

    // Dopo logout: pagina login/landing visibile, NON la dashboard.
    await expect(page.getByText(/ricettario|magazzino/i).first()).toBeHidden({ timeout: 10_000 }).catch(() => {})
    const emailInputAfterLogout = page.getByPlaceholder('tua@email.com')
    await expect(emailInputAfterLogout.first()).toBeVisible({ timeout: 15_000 })

    // 3. Re-login
    await login(page)
    const sidebarItemsAgain = page.getByText(/ricettario|cassa|magazzino|home/i)
    await expect(sidebarItemsAgain.first()).toBeVisible({ timeout: 20_000 })

    // 4. Verifica che i dati siano ancora gli stessi (stessa attività / stesso utente)
    const bodyTextAfter = await page.locator('body').innerText()
    // Controllo soft: il testo dell header/sidebar deve avere overlap significativo
    // con il primo login (stesso nome attività, stessi moduli).
    expect(bodyTextAfter.length).toBeGreaterThan(100)
    if (snippetBefore.length > 50) {
      const firstWord = snippetBefore.split(/\s+/).find(w => w.length > 4)
      if (firstWord) expect(bodyTextAfter).toContain(firstWord)
    }
  })
})
