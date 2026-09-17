#!/usr/bin/env node
// La prova vera: la pagina si trascina di lato, sì o no?
//
// È la domanda che conta, e `audit-layout.mjs` non la risponde: quello segnala
// ogni elemento il cui bordo destro esce dallo schermo, ma un figlio dentro un
// genitore con `overflow: hidden` **è già ritagliato** e non fa scorrere
// niente. Il 15/09/2026 questo ha fatto inseguire per un'ora dei cerchi
// decorativi messi apposta a sbordare dall'angolo delle tessere.
//
// Uso:
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutVisteMobile.test.jsx --testTimeout=900000
//   node scripts/audit-scorrimento.mjs <cartella-viste> <larghezza>
// `scrollWidth` del documento è quello che decide se compare la barra
// orizzontale. Un figlio dentro un genitore con `overflow: hidden` ha ancora
// un rettangolo che sborda, ma è RITAGLIATO: non fa scorrere niente.
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
const DIR = process.argv[2], L = Number(process.argv[3])
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: L, height: 900 }, hasTouch: true })
let n = 0
for (const f of readdirSync(DIR).filter(x => x.endsWith('.html'))) {
  await p.goto('file://' + join(DIR, f))
  const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  if (over > 0) { console.log(`  ${f.replace('.html','').padEnd(26)} scorre di ${over}px`); n++ }
}
await b.close()
console.log(`\n@${L}px → ${n} pagine si trascinano di lato`)

// ── L'esito conta ───────────────────────────────────────────────
// Fino al 16/09/2026 questo attrezzo vedeva il difetto e usciva 0: chi lo
// mettesse in una catena (`&&`, un passo di CI, il cancello pre-push) non se
// ne accorgerebbe mai. È la stessa forma del difetto che il 14/09 ha fatto
// passare due pubblicazioni col build rotto (l'esito mangiato da `| tail`).
if (n > 0) process.exit(1)
