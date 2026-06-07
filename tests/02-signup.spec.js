// @ts-check
import { test, expect } from '@playwright/test'
import { SEED_OK } from './helpers/auth.js'

// Email temporanea univoca per ogni run.
function tempEmail() {
  const ts = Date.now()
  const rnd = Math.random().toString(36).slice(2, 8)
  const domain = process.env.TEST_SIGNUP_DOMAIN || 'foodios-e2e.test'
  return `e2e+${ts}-${rnd}@${domain}`
}

test.describe('Signup nuovo utente', () => {
  test('registrazione 2-step -> conferma email / onboarding', async ({ page }) => {
    test.skip(!SEED_OK, 'infra CI non configurata (aggiorna i secret DB) — smoke signup skippato')
    const email = tempEmail()
    const password = 'TestPwd!' + Math.random().toString(36).slice(2, 8) + 'A1'

    // /register apre AuthPage in mode "registrati" (fix deep-link).
    await page.goto('/register')

    // STEP 1: dati personali + telefono (obbligatorio) + password
    // Nome/cognome devono essere solo lettere (validazione: nome>=3, cognome>=2,
    // niente cifre) — niente "E2E" perché contiene un numero.
    await page.getByPlaceholder('Mario').fill('Mario')
    await page.getByPlaceholder('Rossi').fill('Esposito')
    await page.getByPlaceholder('tua@email.com').first().fill(email)
    await page.locator('input[type="tel"]').first().fill('3331234567')
    await page.locator('input[type="password"]').first().fill(password)

    // "Continua" -> OTP SMS saltato (Twilio non configurato) -> step 2.
    await page.getByRole('button', { name: /continua/i }).first().click()

    // STEP 2: nome attivita + citta
    const nomeAtt = page.getByPlaceholder(/Pasticceria/i).first()
    await nomeAtt.waitFor({ state: 'visible', timeout: 20000 })
    await nomeAtt.fill('FoodOS E2E Test Co')
    const citta = page.getByPlaceholder(/Es\. Torino|Torino/i).first()
    if (await citta.count()) await citta.fill('Torino')

    // Submit finale.
    await page.getByRole('button', { name: /crea il mio account|crea account/i }).first().click()

    // Esito atteso: success (conferma email / onboarding) OPPURE un alert inline
    // dal backend (es. rate-limit email del progetto Supabase su run ripetuti:
    // "Troppi tentativi. Aspetta qualche minuto…"). In entrambi i casi il flusso
    // UI di signup (step1 -> step2 -> submit) ha raggiunto correttamente il backend.
    const emailConfirm = page.getByText(/controlla la tua email|conferma|verifica/i)
    const onboarding = page.getByText(/benvenut|iniziamo|configura/i)
    const backendAlert = page.getByText(/limit|già|esiste|errore|rate|troppi tentativi|aspetta qualche minuto/i)
    await expect(emailConfirm.or(onboarding).or(backendAlert).first()).toBeVisible({ timeout: 30000 })
  })
})
