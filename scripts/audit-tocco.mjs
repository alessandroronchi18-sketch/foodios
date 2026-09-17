#!/usr/bin/env node
// Quanto è comodo toccare il tool con le dita.
//
// Due misure che `audit-layout.mjs` non fa, e che sono quelle che si sentono
// davvero usando telefono e tablet:
//
//   1. **Campi di testo sotto i 16px.** Sotto quella soglia Safari su iOS
//      ingrandisce la pagina da solo appena ci si scrive dentro, e poi tocca
//      rimpicciolire a mano. Il 15/09/2026 erano 95 su tablet contro 8 su
//      telefono: la regola che lo impedisce si fermava un pixel prima
//      dell'iPad.
//   2. **Bersagli sotto i 44px.** È la misura di un polpastrello: sotto quella
//      si sbaglia il bottone.
//
// Uso:
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutVisteTablet.test.jsx --testTimeout=900000
//   node scripts/audit-tocco.mjs <cartella-viste> <larghezza>
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2]
const LARGH = Number(process.argv[3] || 390)
if (!DIR) {
  console.error('Serve la cartella delle viste: node scripts/audit-tocco.mjs <cartella> <larghezza>')
  process.exit(1)
}

const browser = await chromium.launch()
// `hasTouch` serve davvero: senza, Chromium dichiara `pointer: fine` (il
// mouse) e le regole scritte `@media (pointer: coarse)` NON si applicano —
// misurando si vedrebbero problemi che su un iPad vero non esistono. È lo
// stesso genere di errore del foglio di stile mancante: un metro che misura
// una pagina diversa da quella vera.
const pagina = await browser.newPage({
  viewport: { width: LARGH, height: 900 },
  hasTouch: true,
  isMobile: LARGH < 768,
})
let campiPiccoli = 0, campiTot = 0, bersagliPiccoli = 0, bersagliTot = 0
const colpevoli = []

for (const f of readdirSync(DIR).filter(x => x.endsWith('.html'))) {
  await pagina.goto('file://' + join(DIR, f))
  const r = await pagina.evaluate(() => {
    const out = { cp: 0, ct: 0, bp: 0, bt: 0, quali: [] }
    // Solo quello che si vede davvero: un campo nascosto non lo tocca nessuno,
    // e contarlo gonfia il totale facendo sembrare la percentuale migliore.
    const visibile = (el) => {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    for (const el of document.querySelectorAll('input:not([type=hidden]), textarea, select')) {
      if (!visibile(el)) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      out.ct++
      if (fs < 16) { out.cp++; if (out.quali.length < 3) out.quali.push(`campo ${Math.round(fs)}px`) }
    }
    // Tutto quello che si tocca, non solo i pulsanti con `aria-label`.
    for (const el of document.querySelectorAll('button, a[href], [role="button"], input:not([type=hidden]), select, textarea, label[for]')) {
      if (!visibile(el)) continue
      const q = el.getBoundingClientRect()
      out.bt++
      // Un bersaglio è scomodo se è stretto **o** se è basso: un pulsante
      // 120x28 si sbaglia come uno 28x120.
      if (q.height < 44 || q.width < 44) {
        out.bp++
        if (out.quali.length < 40) {
          const t = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)
          out.quali.push(`${Math.round(q.width)}x${Math.round(q.height)} "${t}"`)
        }
      }
    }
    return out
  })
  campiPiccoli += r.cp; campiTot += r.ct
  bersagliPiccoli += r.bp; bersagliTot += r.bt
  if (r.cp > 0 || r.bp > 0) {
    colpevoli.push(`  ${f.replace('.html', '').padEnd(24)} campi ${r.cp}/${r.ct}  bersagli ${r.bp}/${r.bt}`)
  }
}
await browser.close()

console.log(`\n── tocco @${LARGH}px ─────────────────────────────`)
console.log(`  campi di testo sotto i 16px: ${campiPiccoli} su ${campiTot}`)
console.log(`  bersagli sotto i 44px:       ${bersagliPiccoli} su ${bersagliTot}`)
if (colpevoli.length) {
  console.log('\n  dove:')
  console.log(colpevoli.join('\n'))
} else {
  console.log('\n  nessun problema di tocco misurabile.')
}

// ── L'esito conta ───────────────────────────────────────────────
// Fino al 16/09/2026 questo attrezzo vedeva il difetto e usciva 0: chi lo
// mettesse in una catena (`&&`, un passo di CI, il cancello pre-push) non se
// ne accorgerebbe mai. È la stessa forma del difetto che il 14/09 ha fatto
// passare due pubblicazioni col build rotto (l'esito mangiato da `| tail`).
if (campiPiccoli > 0 || bersagliPiccoli > 0) process.exit(1)
