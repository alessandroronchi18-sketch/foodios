#!/usr/bin/env node
// Apre le viste rese in HTML da tests/unit/layoutViste.test.jsx e le fotografa
// a 1440 e 420 px. Serve a guardare le pagine, non solo a misurarle.
//
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutViste.test.jsx
//   node scripts/foto-layout.mjs
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.DIR_VISTE || '/private/tmp/claude-501/-Users-aler/7259be07-0e07-42ba-9be1-e672e3a32c10/scratchpad/viste'
const file = readdirSync(DIR).filter(f => f.endsWith('.html'))
const b = await chromium.launch()
for (const f of file) {
  for (const [nome, w] of [['desktop', 1440], ['mobile', 420]]) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } })
    await p.goto('file://' + join(DIR, f), { waitUntil: 'networkidle' })
    await p.waitForTimeout(400)
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await p.screenshot({ path: join(DIR, `${f.replace('.html','')}-${nome}.png`), fullPage: true })
    console.log(`${f.replace('.html','')} ${nome} — sforamento orizzontale: ${over}px`)
    await p.close()
  }
}
await b.close()
