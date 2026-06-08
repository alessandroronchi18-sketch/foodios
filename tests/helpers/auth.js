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

// true se il seed dell'account di test è andato a buon fine (orgId presente).
// Gli spec browser (login + dato seed) devono skippare se è false: senza seed
// l'onboarding non è soppresso e il test fallirebbe in modo fuorviante.
export const SEED_OK = seedOrgId() !== null

// Etichette "umane" → id-view interni (lo stato `view` del Dashboard).
const LABEL_TO_VIEW = {
  Dashboard: 'home', Home: 'home',
  Ricettario: 'ricettario',
  Cassa: 'chiusura',
  Magazzino: 'magazzino',
  Produzione: 'giornaliero',
  'Food cost': 'simulatore', Listino: 'simulatore',
}

// Init script (gira a ogni navigazione): sopprime l'onboarding, apre i gruppi
// sidebar e — se passato — imposta la view attiva via sessionStorage (la nav
// del Dashboard legge `foodios_view_<orgId>` al mount).
async function primeLocalStorage(page, viewId = null) {
  const orgId = seedOrgId()
  await page.addInitScript(({ oid, view }) => {
    try {
      if (oid) localStorage.setItem(`onboarding_seen_${oid}`, '1')
      localStorage.setItem('foodios-sidebar-sec', JSON.stringify({
        oggi: true, ricette: true, numeri: true, acquisti: true, azienda: true, strumenti: true,
      }))
      if (oid && view) sessionStorage.setItem(`foodios_view_${oid}`, view)
    } catch {}
  }, { oid: orgId, view: viewId })
}

// Appiglio stabile di "sei loggato": il bottone "Menu profilo" in topbar
// (aria-label) esiste in ogni layout una volta dentro l'app.
export async function attendiLoggato(page) {
  await page.getByRole('button', { name: 'Menu profilo' }).first().waitFor({ state: 'visible', timeout: 30_000 })
}

/**
 * Login UI. Atterra nell'app (onboarding soppresso via localStorage).
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

  const submitBtn = page.locator('form button[type="submit"]').first()
  if (await submitBtn.count()) await submitBtn.click()
  else await pwdInput.press('Enter')

  await attendiLoggato(page)
  await page.waitForLoadState('networkidle').catch(() => {})
}

/**
 * Naviga a una view in modo ROBUSTO al layout: imposta `view` in sessionStorage
 * e ricarica. `target` è una label (es. 'Ricettario') o direttamente un viewId.
 */
export async function navTo(page, target) {
  const viewId = LABEL_TO_VIEW[target] || target
  await primeLocalStorage(page, viewId)
  await page.goto('/')
  await attendiLoggato(page).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
}

/**
 * Logout: apre il menu profilo (topbar) e clicca "Esci".
 */
export async function logout(page) {
  // Apri il menu profilo (topbar), poi clicca "Esci" tra i bottoni VISIBILI
  // (esiste un duplicato nascosto nel drawer mobile: `.first()` lo prenderebbe).
  await page.getByRole('button', { name: 'Menu profilo' }).first().click()
  await page.locator('button:visible', { hasText: /esci/i }).first().click({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Menu profilo' }).first().waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
}

/**
 * Login partendo dalla landing/qualsiasi pagina: forza il path /login.
 */
export async function gotoLogin(page) {
  await page.goto('/login')
}
