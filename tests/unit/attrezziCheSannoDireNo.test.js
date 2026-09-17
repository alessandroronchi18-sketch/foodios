// Gli attrezzi di misura sanno dire di no?
//
// ── Il difetto che ha fatto nascere questo file ────────────────────────
//
// 16/09/2026, audit RIGHELLO. `scripts/audit-contrasto.mjs` rende 32 pagine in
// un browser vero, misura il contrasto di ogni scritta, stampa l'elenco dei
// difetti trovati... e poi esce **0**. Vede il difetto e dichiara che è andato
// tutto bene. Chi lo mettesse in una catena (`&&`, un passo di CI, il cancello
// prima della pubblicazione) non se ne accorgerebbe mai.
//
// L'asimmetria diceva tutto: `process.exit(0)` scritto a mano nel ramo «niente
// da segnalare», e niente nel ramo «ecco i difetti».
//
// Guardando gli altri otto attrezzi, erano **cinque su nove** a non saper dire
// di no:
//
//   audit-contrasto        exit(0) quando è pulito, niente quando trova
//   audit-layout           nessun process.exit
//   audit-scorrimento      nessun process.exit
//   audit-tocco            exit(1) solo se manca la cartella delle viste
//   audit-design-telefono  exit(1) solo se manca la cartella delle viste
//
// È la stessa forma del difetto del 14/09/2026, quello che ha fatto passare
// due pubblicazioni con il build rotto: `npm run build | tail -5` restituisce
// l'esito di `tail`, che riesce sempre. Un controllo che non può fallire non
// è un controllo, è un commento che costa tempo di macchina.
//
// ── Cosa protegge questo file ──────────────────────────────────────────
//
// 1. Che ogni attrezzo in `scripts/check-*.mjs` e `scripts/audit-*.mjs`
//    decida l'esito **in fondo**, dopo aver riportato quello che ha visto.
// 2. Che i cinque corretti escano davvero 1 su una pagina coi difetti — e
//    0 su una pagina pulita, perché un attrezzo che dice sempre no è rotto
//    nell'altro verso e nessuno lo userebbe più.
//
// Audit RIGHELLO, 16-17/09/2026.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPTS = join(RADICE, 'scripts')

const attrezzi = readdirSync(SCRIPTS)
  .filter(f => /^(check|audit)-.+\.mjs$/.test(f))
  .sort()

// ── Il criterio ────────────────────────────────────────────────────────
//
// Dove un programma da riga di comando decide il proprio esito? In fondo,
// dopo aver contato. Un'uscita che sta sopra alla stampa dei risultati è una
// guardia d'apertura («manca la cartella», «manca il file»): serve, ma non è
// il verdetto sulla misura.
//
// Quindi due domande, per ogni attrezzo:
//   a. c'è un punto in cui decide l'esito?
//   b. quel punto sta DOPO l'ultima riga che riporta qualcosa, e può valere
//      un numero diverso da zero?
function verdetto(sorgente) {
  const righe = sorgente.split('\n')
  const uscite = []
  let ultimoResoconto = -1
  righe.forEach((r, i) => {
    const pulita = r.replace(/^\s*\/\/.*$/, '')
    const m = pulita.match(/process\.exit\(([^)]*)\)|process\.exitCode\s*=\s*(.+)$/)
    if (m) uscite.push({ riga: i + 1, valore: (m[1] ?? m[2] ?? '').trim() })
    if (/console\.(log|error|warn|table)/.test(pulita)) ultimoResoconto = i + 1
  })
  const ultima = uscite[uscite.length - 1]
  return {
    uscite,
    ultimoResoconto,
    // `exit(0)` e `exit()` non possono essere un verdetto: valgono sempre zero.
    puoDireNo: !!ultima && !/^0$/.test(ultima.valore) && ultima.valore !== '',
    decideInFondo: !!ultima && ultima.riga > ultimoResoconto,
  }
}

// ── Prima il righello, poi la misura ───────────────────────────────────
// I cinque sorgenti finti qui sotto sono la forma esatta dei cinque attrezzi
// prima della correzione del 16/09. Se il criterio non li boccia, non sta
// misurando niente e tutto quello che c'è sotto vale zero.
const COM_ERANO = {
  'audit-contrasto (exit(0) quando è pulito, niente quando trova)': `
if (tutte.length === 0) {
  console.log('Nessun problema di contrasto.')
  process.exit(0)
}
for (const g of gruppi) console.log(g)
`,
  'audit-layout (nessuna uscita)': `
for (const f of file) console.log(f)
await b.close()
`,
  'audit-scorrimento (nessuna uscita)': `
let n = 0
console.log(\`\${n} pagine si trascinano di lato\`)
`,
  'audit-tocco (esce 1 solo se manca la cartella)': `
if (!DIR) {
  console.error('Serve la cartella delle viste')
  process.exit(1)
}
console.log('bersagli sotto i 44px: ' + piccoli)
`,
  'audit-design-telefono (esce 1 solo se manca la cartella)': `
if (!DIR) {
  console.error('Serve la cartella')
  process.exit(1)
}
console.log('')
`,
}

const COME_SONO = `
if (!DIR) { console.error('Serve la cartella'); process.exit(1) }
console.log('ecco i difetti: ' + quanti)
if (quanti > 0) process.exit(1)
`

describe('il righello di questo file sa riconoscere un attrezzo muto', () => {
  for (const [nome, sorgente] of Object.entries(COM_ERANO)) {
    it(`boccia ${nome}`, () => {
      const v = verdetto(sorgente)
      expect(v.puoDireNo && v.decideInFondo,
        'il criterio promuove un attrezzo che il 16/09 usciva 0 coi difetti in mano').toBe(false)
    })
  }

  it('e promuove un attrezzo che decide in fondo', () => {
    const v = verdetto(COME_SONO)
    expect(v.puoDireNo).toBe(true)
    expect(v.decideInFondo).toBe(true)
  })

  it('e non si lascia ingannare da un\'uscita dentro un commento', () => {
    const v = verdetto(`
console.log('fatto')
// una volta qui c'era process.exit(1)
`)
    expect(v.puoDireNo).toBe(false)
  })

  it('e guarda davvero dentro scripts/, non una cartella vuota', () => {
    // La prova che mancava ai sette setacci: puntato altrove, un censimento
    // resta verde perché non trova niente da esaminare.
    expect(attrezzi.length,
      'nessun attrezzo check-/audit- trovato: il percorso è sbagliato').toBeGreaterThanOrEqual(9)
  })
})

describe('ogni attrezzo di misura decide l\'esito in fondo, dopo aver riportato', () => {
  for (const f of attrezzi) {
    it(`${f}`, () => {
      const v = verdetto(readFileSync(join(SCRIPTS, f), 'utf8'))
      expect(v.uscite.length,
        `${f} non decide mai il proprio esito: chi lo mette in una catena non saprà mai se ha trovato qualcosa.`,
      ).toBeGreaterThan(0)
      expect(v.puoDireNo,
        `${f} finisce sempre con un esito zero: non può fermare niente.`).toBe(true)
      expect(v.decideInFondo,
        `${f} decide l'esito alla riga ${v.uscite[v.uscite.length - 1]?.riga} ma riporta ancora alla ` +
        `riga ${v.ultimoResoconto}: quella è una guardia d'apertura, non il verdetto sulla misura.`,
      ).toBe(true)
    })
  }
})

// ── La prova vera: farli girare ────────────────────────────────────────
//
// Il controllo statico qui sopra legge il sorgente; questo lo esegue. Serve
// Chromium, che in CI si installa solo nel workflow di Playwright: dove non
// c'è, queste prove si dichiarano SALTATE. Non si scrivono passate — il
// 16/09 quattro fotografie di layout finivano con `expect(true).toBe(true)` e
// il riepilogo le contava fra le riuscite.
let chromiumCè = false
try {
  const { chromium } = await import('playwright')
  chromiumCè = existsSync(chromium.executablePath())
} catch { /* playwright non installato: si resta senza browser */ }

const PAGINA_ROTTA = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>rotta</title></head>
<body style="margin:0;background:#ffffff;font-family:system-ui">
  <p style="color:#cccccc;background:#ffffff;font-size:14px">grigio chiarissimo su bianco</p>
  <p style="color:#e8e8e8;background:#ffffff;font-size:13px">ancora più chiaro</p>
  <p style="font-size:9px;color:#000">scritta a nove pixel</p>
  <p style="font-size:30px;color:#000">misura fuori scala</p>
  <button style="width:30px;height:30px">x</button>
  <button style="width:120px;height:28px">basso e largo</button>
  <a href="#" style="display:inline-block;height:24px">link basso</a>
  <input type="text" style="font-size:12px;height:20px">
  <div style="display:flex;flex-direction:row">
    <div style="height:120px;width:100px;background:#eee">alto</div>
    <div style="height:60px;width:100px;background:#ddd">basso</div>
  </div>
  <div style="width:1600px;height:20px;background:#f3f3f3">sfora in orizzontale</div>
  <table style="width:1400px"><tr><td style="text-align:right">1.234</td></tr></table>
  <div style="width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">una etichetta lunghissima tagliata dai puntini di sospensione</div>
</body></html>`

const PAGINA_PULITA = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>pulita</title></head>
<body style="margin:0;background:#ffffff;font-family:system-ui;font-size:16px;color:#111111">
  <p style="font-size:16px;color:#111111;background:#ffffff">testo nero su bianco, sedici pixel</p>
  <button style="width:120px;height:48px;font-size:16px;color:#111111;background:#ffffff">conferma</button>
  <div style="height:40px"></div>
  <input type="text" style="font-size:16px;height:48px;width:200px;color:#111111;background:#ffffff">
</body></html>`

// Come si lancia ognuno dei cinque: chi vuole la cartella in un argomento,
// chi in una variabile d'ambiente.
const CON_BROWSER = [
  ['audit-contrasto.mjs', (d) => ({ args: [], env: { DIR_VISTE: d } })],
  ['audit-layout.mjs', (d) => ({ args: [], env: { DIR_VISTE: d, LARGH: '1440' } })],
  ['audit-scorrimento.mjs', (d) => ({ args: [d, '390'], env: {} })],
  ['audit-tocco.mjs', (d) => ({ args: [d, '390'], env: {} })],
  ['audit-design-telefono.mjs', (d) => ({ args: [d, '390'], env: {} })],
]

function lancia(script, cartella) {
  const { args, env } = CON_BROWSER.find(([n]) => n === script)[1](cartella)
  const r = spawnSync('node', [join(SCRIPTS, script), ...args], {
    cwd: RADICE, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000,
  })
  return { codice: r.status, uscita: (r.stdout || '') + (r.stderr || '') }
}

function cartellaCon(html, nome) {
  const d = mkdtempSync(join(tmpdir(), 'righello-'))
  writeFileSync(join(d, nome + '.html'), html)
  return d
}

describe.skipIf(!chromiumCè)('i cinque attrezzi corretti, provati sul serio', () => {
  it('su una pagina piena di difetti escono tutti diverso da zero', () => {
    const d = cartellaCon(PAGINA_ROTTA, 'rotta')
    try {
      const muti = []
      for (const [script] of CON_BROWSER) {
        const { codice, uscita } = lancia(script, d)
        if (codice === 0) muti.push(`${script} → esce 0 avendo stampato:\n${uscita.slice(0, 400)}`)
      }
      expect(muti, 'attrezzi che vedono il difetto e dicono che va tutto bene').toEqual([])
    } finally { rmSync(d, { recursive: true, force: true }) }
  }, 180000)

  it('e su una pagina pulita escono tutti zero (non dicono no a caso)', () => {
    const d = cartellaCon(PAGINA_PULITA, 'pulita')
    try {
      const isterici = []
      for (const [script] of CON_BROWSER) {
        const { codice, uscita } = lancia(script, d)
        if (codice !== 0) isterici.push(`${script} → esce ${codice} su una pagina senza difetti:\n${uscita.slice(0, 400)}`)
      }
      expect(isterici, 'attrezzi che bocciano anche quando non c\'è niente da bocciare').toEqual([])
    } finally { rmSync(d, { recursive: true, force: true }) }
  }, 180000)
})
