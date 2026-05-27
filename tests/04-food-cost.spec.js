// @ts-check
import { test, expect } from '@playwright/test'
import { login, navTo, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth.js'

const euroFromCard = async (card) => {
  const txt = await card.innerText()
  const m = txt.match(/Food Cost[^0-9]*([0-9]+[.,][0-9]+)/i)
  return m ? m[1].replace(',', '.') : null
}

test.describe('Food cost', () => {
  test('cambia prezzo ingrediente -> food cost ricetta cambia', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati')

    await login(page)

    // 1. Food cost iniziale della ricetta seed.
    await navTo(page, 'Ricettario')
    const seedCard = page.locator('div').filter({ hasText: 'SEED TORTA TEST' }).filter({ hasText: 'Food Cost' }).last()
    await seedCard.waitFor({ state: 'visible', timeout: 15000 })
    const fcBefore = await euroFromCard(seedCard)

    // 2. Magazzino -> Prezzi ingredienti -> modifica farina.
    await navTo(page, 'Magazzino')
    await page.getByRole('button', { name: /prezzi ingredienti/i }).first().evaluate((el) => el.click())
    await page.waitForTimeout(500)
    const search = page.getByPlaceholder(/cerca ingrediente/i)
    if (await search.count()) await search.fill('farina')
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /modifica/i }).first().evaluate((el) => el.click())
    const priceInput = page.locator('input[type="number"]').first()
    await priceInput.fill('7.50')
    await page.getByRole('button', { name: /^salva$/i }).first().evaluate((el) => el.click())
    await page.getByRole('button', { name: /conferma e salva/i }).first().evaluate((el) => el.click())
    await page.waitForTimeout(1000)

    // 3. Ricettario: il food cost deve essere cambiato.
    await navTo(page, 'Ricettario')
    const seedCard2 = page.locator('div').filter({ hasText: 'SEED TORTA TEST' }).filter({ hasText: 'Food Cost' }).last()
    await seedCard2.waitFor({ state: 'visible', timeout: 15000 })
    const fcAfter = await euroFromCard(seedCard2)

    expect(fcBefore, 'food cost iniziale leggibile').not.toBeNull()
    expect(fcAfter, 'food cost finale leggibile').not.toBeNull()
    expect(fcAfter).not.toBe(fcBefore)
  })
})
