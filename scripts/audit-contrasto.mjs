#!/usr/bin/env node
// Il contrasto dei colori, misurato in un browser vero.
//
// I test di accessibilità del progetto girano in happy-dom, che non disegna
// niente: axe salta il controllo del contrasto e il punteggio resta 60 con la
// nota «WCAG mai validato per davvero». Questo attrezzo lo valida davvero.
//
// Serve alle pasticcerie: chi usa Foodos ha spesso sessant'anni, lavora in un
// laboratorio con luci al neon e guarda il telefono con le mani infarinate.
// Una scritta grigio chiaro su bianco lì non si legge.
//
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutViste.test.jsx
//   node scripts/audit-contrasto.mjs
import { chromium } from 'playwright'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const DIR = process.env.DIR_VISTE
  || '/private/tmp/claude-501/-Users-aler/7259be07-0e07-42ba-9be1-e672e3a32c10/scratchpad/viste'
const AXE = require.resolve('axe-core/axe.min.js')
const sorgenteAxe = readFileSync(AXE, 'utf8')

const file = readdirSync(DIR).filter(f => f.endsWith('.html'))
if (file.length === 0) {
  console.error('Nessuna pagina resa. Lancia prima:\n  DUMP_LAYOUT=1 npx vitest run tests/unit/layoutViste.test.jsx')
  process.exit(1)
}

const b = await chromium.launch()
const tutte = []
const sfumature = []   // scritte sopra una sfumatura: axe non le sa misurare

for (const f of file) {
  for (const [dispositivo, w, touch] of [['telefono', 390, true], ['computer', 1440, false]]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, hasTouch: touch, isMobile: touch })
    await p.goto('file://' + join(DIR, f), { waitUntil: 'networkidle' })
    await p.addScriptTag({ content: sorgenteAxe })
    const esito = await p.evaluate(async () => {
      // ── Quando axe sbaglia il fondo ─────────────────────────────────
      //
      // axe risale gli antenati per trovare il colore di fondo, e in due casi
      // si perde: quando per strada c'è una **sfumatura**, e quando sopra
      // l'elemento c'è un **velo** (un riquadro semitrasparente posizionato
      // sopra, che molte tessere usano per il decoro). In quei casi si ferma
      // e prende il fondo della PAGINA.
      //
      // Il risultato è un difetto che non esiste: su una tessera bordeaux con
      // la scritta bianca dice «bianco su crema, rapporto 1.05» — cioè
      // invisibile — quando in realtà si legge benissimo.
      //
      // La regola qui sotto è precisa: se il primo antenato con un fondo
      // pieno ha un colore **diverso** da quello che axe dice di aver usato,
      // allora axe si è perso e la misura non vale. Si dichiara NON
      // MISURABILE, non violazione: un difetto finto costa tempo quanto uno
      // vero, e in questo progetto è già successo due volte di inseguire
      // difetti creati da un attrezzo tarato male.
      const aRgb = (c) => {
        const m = String(c || '').match(/(\d+),\s*(\d+),\s*(\d+)/)
        if (!m) return null
        return '#' + m.slice(1).map(x => Number(x).toString(16).padStart(2, '0')).join('')
      }
      const fondoVero = (el) => {
        let a = el
        while (a && a !== document.documentElement) {
          const s = getComputedStyle(a)
          if (s.backgroundImage && s.backgroundImage !== 'none' && s.backgroundImage.includes('gradient')) return 'sfumatura'
          const bc = s.backgroundColor
          if (bc && !bc.startsWith('rgba(0, 0, 0, 0')) return aRgb(bc)
          a = a.parentElement
        }
        return null
      }

      const r = await window.axe.run(document, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
        resultTypes: ['violations'],
      })
      return r.violations.flatMap(v => v.nodes.map(n => {
        let nonMisurabile = false
        const sfondoDetto = (n.any?.[0]?.data?.bgColor || '').toLowerCase()
        try {
          const el = document.querySelector(Array.isArray(n.target[0]) ? n.target[0][0] : n.target[0])
          const vero = el ? fondoVero(el) : null
          nonMisurabile = vero === 'sfumatura' || (vero != null && sfondoDetto && vero.toLowerCase() !== sfondoDetto)
        } catch { /* selettore strano: si conta come violazione */ }
        return {
          impatto: n.impact,
          nonMisurabile,
          testo: (n.html || '').replace(/\s+/g, ' ').slice(0, 90),
          motivo: (n.any?.[0]?.message || '').slice(0, 140),
          rapporto: n.any?.[0]?.data?.contrastRatio ?? null,
          atteso: n.any?.[0]?.data?.expectedContrastRatio ?? null,
          primo: n.any?.[0]?.data?.fgColor ?? null,
          sfondo: n.any?.[0]?.data?.bgColor ?? null,
          misura: n.any?.[0]?.data?.fontSize ?? null,
        }
      }))
    })
    for (const e of esito) {
      if (e.nonMisurabile) { sfumature.push({ pagina: f.replace('.html', ''), ...e }); continue }
      tutte.push({ pagina: f.replace('.html', ''), dispositivo, ...e })
    }
    await p.close()
  }
}
await b.close()

const coda = sfumature.length
  ? `\n${sfumature.length} scritte sono sopra una sfumatura: axe non le sa misurare, non sono violazioni.`
  : ''

if (tutte.length === 0) {
  console.log('Nessun problema di contrasto. ' + file.length + ' pagine, due larghezze ciascuna.' + coda)
  process.exit(0)
}

// Raggruppate per coppia di colori: lo stesso token sbagliato compare in
// cinquanta punti, e correggerlo una volta li sistema tutti.
const perCoppia = new Map()
for (const t of tutte) {
  const k = `${t.primo} su ${t.sfondo}`
  if (!perCoppia.has(k)) perCoppia.set(k, { ...t, quanti: 0, pagine: new Set() })
  const g = perCoppia.get(k)
  g.quanti++
  g.pagine.add(t.pagina)
}

console.log(`${tutte.length} scritte con contrasto insufficiente, in ${perCoppia.size} combinazioni di colore.${coda}\n`)
for (const [k, g] of [...perCoppia.entries()].sort((a, b2) => b2[1].quanti - a[1].quanti)) {
  console.log(`${String(g.quanti).padStart(4)}×  ${k}`)
  console.log(`      rapporto ${g.rapporto} (serve ${g.atteso}) · testo ${g.misura}px · ${[...g.pagine].slice(0, 5).join(', ')}`)
  console.log(`      es. ${g.testo}`)
}

// ── L'esito conta ──────────────────────────────────────────────────────
// Fino al 16/09/2026 questo attrezzo vedeva il difetto e usciva 0: chi lo
// mettesse in una catena (`&&`, un passo di CI, il cancello pre-push) non se
// ne accorgerebbe mai. È la stessa forma del difetto che il 14/09 ha fatto
// passare due pubblicazioni col build rotto (l'esito mangiato da `| tail`).
process.exit(1)
