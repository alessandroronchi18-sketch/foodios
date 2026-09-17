#!/usr/bin/env node
// Misura l'impaginazione delle viste rese in HTML e riporta:
//   1. riquadri affiancati di altezza diversa (le tessere che "non sono incolonnate")
//   2. elementi fratelli che si sovrappongono in verticale
//   3. testi sotto i 12px
//   4. celle numeriche senza cifre tabellari
//   5. sforamento orizzontale
//
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutViste.test.jsx
//   node scripts/audit-layout.mjs
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.DIR_VISTE || '/private/tmp/claude-501/-Users-aler/7259be07-0e07-42ba-9be1-e672e3a32c10/scratchpad/viste'
const LARGH = Number(process.env.LARGH || 1440)

const misura = () => {
  const out = { righeStorte: [], sovrapposti: [], piccoli: [], numeriNonTabellari: [] }
  const testo = (el) => (el.textContent || '').trim().slice(0, 40)

  // 1. griglie e flex-row: i figli diretti devono avere la stessa altezza
  for (const el of document.querySelectorAll('div, section, ul')) {
    const st = getComputedStyle(el)
    const inRiga = st.display === 'grid'
      ? (st.gridTemplateColumns.split(' ').filter(Boolean).length > 1)
      : ((st.display === 'flex') && st.flexDirection === 'row' && st.flexWrap !== 'wrap')
    if (!inRiga) continue
    const figli = [...el.children].filter(c => c.getBoundingClientRect().height > 24)
    if (figli.length < 2) continue
    const r = figli.map(c => c.getBoundingClientRect())
    // stessa riga = stesso top (entro 2px)
    const top0 = r[0].top
    if (!r.every(x => Math.abs(x.top - top0) < 2)) continue
    const alt = r.map(x => Math.round(x.height))
    const min = Math.min(...alt), max = Math.max(...alt)
    // Due casi che NON sono difetti e vanno esclusi, altrimenti coprono di
    // rumore quelli veri:
    //  - pastiglia + testo ("ATTENZIONE" accanto a una frase che va a capo);
    //  - modulo accanto a un elenco, che è un impianto a due colonne, non due
    //    tessere affiancate.
    const pastiglia = r.some((x, i) => x.height <= 30 && x.width < 140 && alt[i] === min)
    const dueColonne = max > min * 2.5
    if (max - min > 6 && !pastiglia && !dueColonne) {
      out.righeStorte.push({ dove: testo(el), altezze: alt, delta: max - min })
    }
  }

  // 2. fratelli che si accavallano in verticale
  for (const el of document.querySelectorAll('div, section')) {
    const figli = [...el.children]
    for (let i = 1; i < figli.length; i++) {
      const a = figli[i - 1].getBoundingClientRect(), b = figli[i].getBoundingClientRect()
      if (a.height < 20 || b.height < 20) continue
      const stA = getComputedStyle(figli[i - 1]), stB = getComputedStyle(figli[i])
      if (stA.position === 'absolute' || stB.position === 'absolute' || stA.position === 'fixed' || stB.position === 'fixed') continue
      // stessa colonna (si sovrappongono in orizzontale) e b comincia prima che a finisca
      const stessaColonna = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 40
      if (stessaColonna && b.top < a.bottom - 2) {
        out.sovrapposti.push({ sopra: testo(figli[i - 1]), sotto: testo(figli[i]), quanto: Math.round(a.bottom - b.top) })
      }
    }
  }

  // 3. testi minuscoli
  for (const el of document.querySelectorAll('*')) {
    if (!el.children.length && (el.textContent || '').trim()) {
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (fs && fs < 12) out.piccoli.push({ testo: testo(el), px: fs })
    }
  }

  // 4. celle con numeri senza cifre tabellari
  for (const td of document.querySelectorAll('td')) {
    const t = (td.textContent || '').trim()
    if (!/[0-9]/.test(t)) continue
    if (!/[€%]|\d[.,]\d|\d{3}/.test(t)) continue
    const st = getComputedStyle(td)
    // Un font monospaziato incolonna già di suo: non serve chiedergli le
    // cifre tabellari.
    const mono = /mono|JetBrains|Menlo|Consolas/i.test(st.fontFamily || '')
    if (!mono && !/tabular/.test(st.fontVariantNumeric || '') && !/tnum/.test(st.fontFeatureSettings || '')) {
      out.numeriNonTabellari.push({ testo: t.slice(0, 24) })
    }
  }
  return out
}

const b = await chromium.launch()
let problemi = 0
for (const f of readdirSync(DIR).filter(x => x.endsWith('.html'))) {
  const p = await b.newPage({ viewport: { width: LARGH, height: 1000 } })
  await p.goto('file://' + join(DIR, f), { waitUntil: 'networkidle' })
  await p.waitForTimeout(300)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const r = await p.evaluate(misura)
  const nome = f.replace('.html', '')
  console.log(`\n── ${nome} @${LARGH}px ` + '─'.repeat(Math.max(0, 40 - nome.length)))
  if (over > 0) console.log(`  ⟹ sfora in orizzontale di ${over}px`)
  for (const x of r.righeStorte.slice(0, 6)) console.log(`  riquadri affiancati di altezza diversa (Δ${x.delta}px): ${JSON.stringify(x.altezze)} — "${x.dove}"`)
  for (const x of r.sovrapposti.slice(0, 6)) console.log(`  si accavallano di ${x.quanto}px: "${x.sopra}" ↕ "${x.sotto}"`)
  const piccoli = [...new Map(r.piccoli.map(x => [x.px + x.testo, x])).values()]
  for (const x of piccoli.slice(0, 5)) console.log(`  testo a ${x.px}px: "${x.testo}"`)
  if (r.numeriNonTabellari.length) console.log(`  celle numeriche senza cifre tabellari: ${r.numeriNonTabellari.length}`)
  if (!over && !r.righeStorte.length && !r.sovrapposti.length && !piccoli.length && !r.numeriNonTabellari.length) console.log('  nessun problema misurabile')
  else problemi++
  await p.close()
}
await b.close()

// ── L'esito conta ───────────────────────────────────────────────
// Fino al 16/09/2026 questo attrezzo vedeva il difetto e usciva 0: chi lo
// mettesse in una catena (`&&`, un passo di CI, il cancello pre-push) non se
// ne accorgerebbe mai. È la stessa forma del difetto che il 14/09 ha fatto
// passare due pubblicazioni col build rotto (l'esito mangiato da `| tail`).
if (problemi > 0) {
  console.log(`\n${problemi} pagine con almeno un problema di impaginazione.`)
  process.exit(1)
}
