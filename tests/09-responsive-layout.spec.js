// @ts-check
// Test responsive: garantisce che le pagine principali non abbiano
// horizontal overflow ai tre viewport target (mobile/tablet/desktop).
//
// Filosofia: un layout "rotto" produce quasi sempre uno scrollWidth maggiore
// del viewport. Il check e' rapido, deterministico e cattura la maggior parte
// delle regressioni UI senza dover scrivere screenshot test per ogni view.
//
// Cosa NON copre questo test:
//   - regressioni visive sottili (font diversi, colori, micro-spacing)
//   - bottoni che si accavallano dentro al viewport ma senza overflow
//   - testi tagliati con ellipsis quando dovrebbero wrappare
// Per quelle, valutare l'aggiunta di test screenshot.

import { test, expect } from '@playwright/test'
import { login, TEST_EMAIL, TEST_PASSWORD, SEED_OK } from './helpers/auth.js'

// Viewport canonici target. iPhone SE (375), iPad mini portrait (768),
// laptop 13" comune (1280). Coprono le tre fasce in cui i nostri breakpoint
// useIsMobile/useIsTablet/desktop cambiano comportamento.
const VIEWPORTS = [
  { name: 'mobile-iphone',  width: 375,  height: 812 },
  { name: 'tablet-ipad',    width: 768,  height: 1024 },
  { name: 'desktop-laptop', width: 1280, height: 800 },
]

// Tolleranza in pixel: scrollbar, sub-pixel rounding, bordi.
const OVERFLOW_TOLERANCE_PX = 2

async function expectNoHorizontalOverflow(page, label) {
  // Misuriamo scrollWidth del root html — se eccede la viewport, layout broken.
  const overflow = await page.evaluate(() => {
    const html = document.documentElement
    return {
      scrollWidth: html.scrollWidth,
      clientWidth: html.clientWidth,
      innerWidth: window.innerWidth,
    }
  })

  // scrollWidth deve essere ≤ innerWidth + tolleranza.
  const max = overflow.innerWidth + OVERFLOW_TOLERANCE_PX
  expect.soft(
    overflow.scrollWidth,
    `[${label}] orizzontale overflow: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`,
  ).toBeLessThanOrEqual(max)

  // Identifica gli offenders per il log se il check fallisce. Cerchiamo
  // elementi visibili con scrollWidth > viewport (sono i candidati).
  if (overflow.scrollWidth > max) {
    const offenders = await page.evaluate((viewportW) => {
      const out = []
      const all = document.querySelectorAll('body *')
      for (const el of all) {
        const rect = el.getBoundingClientRect()
        if (rect.right > viewportW + 2 && rect.width < viewportW * 2) {
          // Solo i diretti offenders, non i contenitori che inglobano tutto.
          // Skip elementi marcati overflow-x:auto (es. tabelle scrollabili).
          const overflowX = getComputedStyle(el).overflowX
          if (overflowX === 'auto' || overflowX === 'scroll') continue
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 60),
            right: Math.round(rect.right),
            text: (el.textContent || '').trim().slice(0, 40),
          })
          if (out.length >= 5) break
        }
      }
      return out
    }, overflow.innerWidth)
    console.log(`[${label}] Top offenders:`, JSON.stringify(offenders, null, 2))
  }
}

test.describe('Responsive layout — no horizontal overflow', () => {
  for (const vp of VIEWPORTS) {
    test(`landing pubblica @ ${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')
      // Landing si carica con animazioni Reveal: aspetta che il main sia visibile
      await expect(page.locator('main, body')).toBeVisible({ timeout: 15000 })
      // Dai tempo ad eventuali asset lazy (immagini hero, fonts) di settling.
      await page.waitForTimeout(800)
      await expectNoHorizontalOverflow(page, `landing@${vp.name}`)
    })
  }

  for (const vp of VIEWPORTS) {
    test(`auth / sign-in @ ${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/?login=1')
      await page.waitForTimeout(500)
      await expectNoHorizontalOverflow(page, `auth@${vp.name}`)
    })
  }

  // Solo se abbiamo un account di test seedato, navighiamo nelle view
  // logged-in principali.
  const ROUTES_AUTH = [
    { label: 'Dashboard',  nav: 'Dashboard' },
    { label: 'Ricettario', nav: 'Ricettario' },
    { label: 'Magazzino',  nav: 'Magazzino' },
    { label: 'Cassa',      nav: 'Cassa' },
  ]

  for (const vp of VIEWPORTS) {
    for (const r of ROUTES_AUTH) {
      test(`${r.label} loggato @ ${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
        test.skip(!TEST_EMAIL || !TEST_PASSWORD || !SEED_OK, 'TEST_EMAIL/TEST_PASSWORD o seed non disponibili')
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await login(page)
        // navTo non sempre c'e' un drawer su mobile — semplifico: dopo login
        // siamo gia' su Dashboard. Per le altre route, click nel menu/sidebar.
        if (r.nav !== 'Dashboard') {
          // Su mobile sidebar e' un drawer (hamburger). Apriamolo se serve.
          if (vp.width < 760) {
            const hamburger = page.getByRole('button', { name: /menu|apri navigazione/i }).first()
            if (await hamburger.isVisible().catch(() => false)) {
              await hamburger.click()
              await page.waitForTimeout(200)
            }
          }
          const link = page.getByRole('button', { name: new RegExp(`^${r.nav}$`, 'i') }).first()
            .or(page.getByRole('link', { name: new RegExp(`^${r.nav}$`, 'i') }).first())
          if (await link.isVisible().catch(() => false)) {
            await link.click()
            await page.waitForTimeout(700)
          }
        }
        await expectNoHorizontalOverflow(page, `${r.label.toLowerCase()}@${vp.name}`)
      })
    }
  }
})
