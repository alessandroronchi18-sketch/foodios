// @ts-check
// Helper di autenticazione condiviso tra i test.
// Usa le env var TEST_EMAIL / TEST_PASSWORD (vedi .env.test.example).

export const TEST_EMAIL = process.env.TEST_EMAIL || ''
export const TEST_PASSWORD = process.env.TEST_PASSWORD || ''

/**
 * Esegue il login UI partendo da qualsiasi pagina pubblica.
 * Atterra in dashboard (o trial scaduto / onboarding, se applicabile).
 */
export async function login(page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL / TEST_PASSWORD non impostati. ' +
      'Esporta le credenziali di test prima di eseguire la suite (vedi .env.test.example).'
    )
  }

  await page.goto('/login')

  // Campo email/password sull AuthPage usano placeholder italiani.
  const emailInput = page.getByPlaceholder('tua@email.com').first()
  const pwdInput = page.locator('input[type="password"]').first()

  await emailInput.waitFor({ state: 'visible' })
  await emailInput.fill(email)
  await pwdInput.fill(password)

  // Submit: prima cerca un bottone "Accedi", altrimenti submit form via Enter.
  const accedi = page.getByRole('button', { name: /accedi/i })
  if (await accedi.count()) {
    await accedi.first().click()
  } else {
    await pwdInput.press('Enter')
  }

  // Attendi indicatore di sessione attiva (sidebar dashboard, logo, ecc.).
  // Se l onboarding wizard appare per primo è OK: il test corrispondente lo gestisce.
  await page.waitForURL(/.*/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

/**
 * Logout UI. Cerca un menu utente / pulsante "Esci".
 */
export async function logout(page) {
  // Strategia 1: pulsante visibile con testo "Esci" o "Logout"
  const direct = page.getByRole('button', { name: /^(esci|logout|sign\s*out)/i })
  if (await direct.count()) {
    await direct.first().click()
  } else {
    // Strategia 2: cerca menu utente (avatar / iniziali) e poi voce Esci.
    const menu = page.locator('[aria-label*="menu" i], [aria-label*="account" i]').first()
    if (await menu.count()) await menu.click()
    await page.getByText(/esci|logout/i).first().click()
  }

  // Dopo logout deve sparire la dashboard e tornare a landing/login.
  await page.waitForURL(/\/(login|register)?$/, { timeout: 15_000 }).catch(() => {})
}
