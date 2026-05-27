// @ts-check
// Helper di autenticazione condiviso tra i test.
// Usa le env var TEST_EMAIL / TEST_PASSWORD (vedi .env.test.example).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const TEST_EMAIL = process.env.TEST_EMAIL || ''
export const TEST_PASSWORD = process.env.TEST_PASSWORD || ''

// orgId del test user (scritto da global-setup.js). Serve per impostare i flag
// localStorage che sopprimono l'onboarding e aprono i gruppi della sidebar.
function seedOrgId() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.seed-state.json'), 'utf8')
    return JSON.parse(raw).orgId || null
  } catch { return null }
}

// Init script eseguito a ogni navigazione: marca onboarding come visto e apre
// tutti i gruppi della sidebar (la nav per-testo richiede i gruppi espansi).
async function primeLocalStorage(page) {
  const orgId = seedOrgId()
  await page.addInitScript((oid) => {
    try {
      if (oid) localStorage.setItem(`onboarding_seen_${oid}`, '1')
      localStorage.setItem('foodios-sidebar-sec', JSON.stringify({
        oggi: true, ricette: true, numeri: true, acquisti: true, azienda: true, strumenti: true,
      }))
    } catch {}
  }, orgId)
}

/**
 * Login UI. Atterra in dashboard (onboarding soppresso via localStorage).
 */
export async function login(page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  if (!email || !password) {
    throw new Error('TEST_EMAIL / TEST_PASSWORD non impostati (vedi .env.test.example).')
  }

  await primeLocalStorage(page)
  await page.goto('/login')

  const emailInput = page.getByPlaceholder('tua@email.com').first()
  const pwdInput = page.locator('input[type="password"]').first()
  await emailInput.waitFor({ state: 'visible' })
  await emailInput.fill(email)
  await pwdInput.fill(password)

  // Submit del form login: il bottone submit (non il tab toggle "Accedi").
  const submitBtn = page.locator('form button[type="submit"]').first()
  if (await submitBtn.count()) {
    await submitBtn.click()
  } else {
    await pwdInput.press('Enter')
  }

  // Attendi che la dashboard sia montata: la voce "Dashboard" è sempre in cima alla sidebar.
  await page.getByText(/^dashboard$/i).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
}

/**
 * Naviga a una view cliccando il BOTTONE di sidebar (le voci nav sono <button>).
 * `label` è una stringa esatta (es. 'Cassa', 'Magazzino', 'Ricettario').
 * I gruppi sono già aperti via initScript.
 */
export async function navTo(page, label) {
  const btn = page.getByRole('button', { name: label, exact: true }).first()
  await btn.waitFor({ state: 'visible', timeout: 15_000 })
  // Un overlay fixed (toast) può "rubare" i pointer events sulla sidebar: anche
  // force:true dispatcha alle coordinate coperte. Click DOM diretto → bubbla al
  // handler React (setView) indipendentemente dall'overlay visivo.
  await btn.evaluate((el) => el.click())
  await page.waitForLoadState('networkidle').catch(() => {})
}

/**
 * Logout UI. Il pulsante "Esci" è nel footer della sidebar.
 */
export async function logout(page) {
  await page.getByRole('button', { name: /esci/i }).first().evaluate((el) => el.click())
  // Dopo logout la dashboard sparisce (si atterra sulla landing, non sul form login).
  await page.getByText(/^dashboard$/i).first().waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
}

/**
 * Login partendo dalla landing/qualsiasi pagina: forza il path /login.
 */
export async function gotoLogin(page) {
  await page.goto('/login')
}
