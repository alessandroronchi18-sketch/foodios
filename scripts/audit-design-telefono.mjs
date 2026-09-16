#!/usr/bin/env node
// Le cose del design che si vedono solo misurandole, sul telefono.
//
// Gli attrezzi che c'erano già rispondevano a tre domande: la pagina scorre di
// lato? i bersagli si colpiscono col dito? le scritte si leggono sul loro
// fondo? Tutte e tre necessarie, nessuna sufficiente: una pagina può passarle
// tutte ed essere lo stesso fatta male — lunga ottomila pixel, con undici
// misure di carattere diverse, con le etichette tagliate a metà dai puntini,
// con due pulsanti appiccicati che si colpiscono per sbaglio.
//
// Questo misura quelle. Non dà un voto: dà i numeri, e i numeri si guardano
// insieme alla fotografia.
//
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutVisteMobile.test.jsx
//   node scripts/audit-design-telefono.mjs [cartella] [larghezza]
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] || process.env.DIR_VISTE
const LARG = Number(process.argv[3] || 390)
if (!DIR) {
  console.error('Serve la cartella delle viste: node scripts/audit-design-telefono.mjs <cartella> [larghezza]')
  process.exit(1)
}

// La scala del progetto (src/lib/theme.js). Sotto i 12 non si scende.
const SCALA = new Set([12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48])
// Una pagina più alta di così, sul telefono, vuol dire scorrere per mezzo
// minuto prima di arrivare in fondo. 20 schermate.
const ALTEZZA_SOSPETTA = 844 * 20

const file = readdirSync(DIR).filter(f => f.endsWith('.html')).sort()
const b = await chromium.launch()
const tutto = []

for (const f of file) {
  const p = await b.newPage({ viewport: { width: LARG, height: 844 }, hasTouch: true })
  await p.goto('file://' + join(DIR, f), { waitUntil: 'networkidle' })
  await p.waitForTimeout(250)
  const m = await p.evaluate((SCALA_ARR) => {
    const scala = new Set(SCALA_ARR)
    const visibile = (e) => {
      const s = getComputedStyle(e)
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const conTesto = [...document.querySelectorAll('*')].filter(e =>
      visibile(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))

    // 1. scritte fuori scala e sotto la soglia di leggibilità
    const misure = new Map()
    const sottoSoglia = []
    const fuoriScala = []
    for (const e of conTesto) {
      const px = Math.round(parseFloat(getComputedStyle(e).fontSize) * 2) / 2
      misure.set(px, (misure.get(px) || 0) + 1)
      const t = e.textContent.trim().slice(0, 32)
      if (px < 12) sottoSoglia.push(`${px}px "${t}"`)
      else if (!scala.has(px)) fuoriScala.push(`${px}px "${t}"`)
    }

    // 2. scritte tagliate davvero (non quelle che *potrebbero* esserlo)
    const tagliate = []
    for (const e of conTesto) {
      const s = getComputedStyle(e)
      if (s.textOverflow !== 'ellipsis' && s.overflow !== 'hidden') continue
      if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
        tagliate.push(`"${e.textContent.trim().slice(0, 40)}" (${e.clientWidth}px per ${e.scrollWidth}px)`)
      }
    }

    // 3. bersagli troppo vicini fra loro.
    //
    // Attenzione a cosa si conta. La prima versione di questo controllo ne
    // trovò 77, e settanta erano **schede affiancate**: «Oggi | Settimana |
    // Mese | Storico», «Fornitori | Ordini | Spesa». Lì i due bersagli si
    // toccano di proposito — è un comando solo diviso in parti — e sbagliare
    // mira cambia scheda, cioè fa una cosa che si vede subito e si annulla
    // premendo di nuovo. Contarli come difetti avrebbe portato a «correggere»
    // settanta volte un disegno giusto.
    //
    // Quello che fa male davvero è un bersaglio appiccicato a un altro che fa
    // una cosa DIVERSA: il pulsante che archivia accanto a quello che apre.
    // Si riconoscono così: stesso genitore diretto + stessa altezza = gruppo.
    const elenco = [...document.querySelectorAll('button,a,[role="button"],input,select')]
      .filter(visibile).map(e => ({
        e, r: e.getBoundingClientRect(),
        t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24),
      }))
    const vicini = []
    const gruppi = []
    for (let i = 0; i < elenco.length; i++) {
      for (let j = i + 1; j < elenco.length; j++) {
        const A = elenco[i], B = elenco[j]
        const a = A.r, c = B.r
        const dx = Math.max(0, Math.max(a.left, c.left) - Math.min(a.right, c.right))
        const dy = Math.max(0, Math.max(a.top, c.top) - Math.min(a.bottom, c.bottom))
        if (dx === 0 && dy === 0) continue          // annidati: non è vicinanza
        const d = Math.hypot(dx, dy)
        if (d <= 0 || d >= 8) continue
        // Un campo di testo in mezzo a due pulsanti è il «meno / numero /
        // più»: sbagliare mira lì mette il cursore nel campo, che è la cosa
        // meno grave che possa succedere. Non è il caso pericoloso.
        const unCampo = A.e.tagName === 'INPUT' || B.e.tagName === 'INPUT'
        const stessoGruppo = A.e.parentElement === B.e.parentElement
          && (unCampo || Math.abs(a.height - c.height) < 3)
        const riga = `"${A.t}" / "${B.t}" a ${Math.round(d)}px`
        if (stessoGruppo) gruppi.push(riga); else vicini.push(riga)
      }
    }

    // 4. tabelle che sul telefono restano larghe
    const tabelleLarghe = [...document.querySelectorAll('table')]
      .filter(t => t.scrollWidth > document.documentElement.clientWidth + 1)
      .map(t => `${t.scrollWidth}px`)

    // 5. quante misure diverse di raggio e di spaziatura: l'incoerenza è
    //    quello che fa sembrare una pagina "storta" senza saper dire perché
    const raggi = new Set(); const gap = new Set()
    for (const e of document.querySelectorAll('*')) {
      if (!visibile(e)) continue
      const s = getComputedStyle(e)
      const r = parseFloat(s.borderTopLeftRadius)
      if (r > 0 && r < 100) raggi.add(Math.round(r))
      const g = parseFloat(s.gap)
      if (g > 0) gap.add(Math.round(g))
    }

    return {
      altezza: document.documentElement.scrollHeight,
      sottoSoglia: [...new Set(sottoSoglia)],
      fuoriScala: [...new Set(fuoriScala)],
      misure: [...misure.keys()].sort((a, b) => a - b),
      tagliate: [...new Set(tagliate)],
      vicini: [...new Set(vicini)],
      gruppi: [...new Set(gruppi)],
      tabelleLarghe,
      raggi: [...raggi].sort((a, b) => a - b),
      gap: [...gap].sort((a, b) => a - b),
    }
  }, [...SCALA])
  m.pagina = f.replace('.html', '')
  tutto.push(m)
  await p.close()
}
await b.close()

const somma = (k) => tutto.reduce((s, x) => s + x[k].length, 0)
console.log(`\n── design @${LARG}px · ${tutto.length} pagine ──────────────────────\n`)
console.log(`  scritte sotto i 12px:        ${somma('sottoSoglia')}`)
console.log(`  scritte fuori dalla scala:   ${somma('fuoriScala')}`)
console.log(`  scritte tagliate dai puntini:${somma('tagliate')}`)
console.log(`  bersagli diversi a meno di 8px: ${somma('vicini')}`)
console.log(`  (comandi a schede affiancate, che si toccano di proposito: ${somma('gruppi')} — non sono difetti)`)
console.log(`  tabelle più larghe dello schermo: ${somma('tabelleLarghe')}`)
const lunghe = tutto.filter(x => x.altezza > ALTEZZA_SOSPETTA)
console.log(`  pagine oltre 20 schermate:   ${lunghe.length}`)

console.log('\n  pagina                    alt.  mis.  <12  fuori  tagl.  vicini  tab.  raggi')
for (const x of tutto.sort((a, b) => b.altezza - a.altezza)) {
  const seg = [
    String(x.altezza).padStart(5),
    String(x.misure.length).padStart(4),
    String(x.sottoSoglia.length).padStart(4),
    String(x.fuoriScala.length).padStart(5),
    String(x.tagliate.length).padStart(6),
    String(x.vicini.length).padStart(6),
    String(x.tabelleLarghe.length).padStart(5),
    String(x.raggi.length).padStart(6),
  ].join(' ')
  console.log(`  ${x.pagina.padEnd(24)} ${seg}`)
}

const dettagli = tutto.filter(x => x.sottoSoglia.length || x.fuoriScala.length || x.tagliate.length || x.vicini.length || x.tabelleLarghe.length)
if (dettagli.length) {
  console.log('\n  dove ─────────────────────────────────────────────')
  for (const x of dettagli) {
    console.log(`\n  ${x.pagina}`)
    for (const [et, v] of [['sotto i 12px', x.sottoSoglia], ['fuori scala', x.fuoriScala],
      ['tagliate', x.tagliate], ['bersagli vicini', x.vicini], ['tabelle larghe', x.tabelleLarghe]]) {
      if (v.length) console.log(`    ${et}: ${v.slice(0, 6).join(' · ')}${v.length > 6 ? ` … e altre ${v.length - 6}` : ''}`)
    }
  }
}
console.log('')
