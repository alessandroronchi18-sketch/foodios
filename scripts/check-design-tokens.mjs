#!/usr/bin/env node
// Controllo a cricchetto sui token di design.
//
// Il problema. src/lib/theme.js definisce una scala di token (colori, spazi,
// tipografia, raggi) e viene usata oltre 2.600 volte. Accanto pero' convivono
// valori scritti a mano: al 2026-09-07 erano 275 colori esadecimali distinti,
// 28 dimensioni di testo diverse (da 7px a 84px) e 24 raggi. Il colore del
// marchio #6E0E1A da solo compariva 183 volte a mano: cambiarlo significa 183
// modifiche invece di una.
//
// Perche' a cricchetto e non a soglia zero. Sistemare le 275 deviazioni
// esistenti e' lavoro che non produce nulla per il cliente, e bloccare la
// pre-push finche' non e' fatto fermerebbe lo sviluppo. Questo controllo
// registra quante ne esistono oggi, file per file, e fallisce solo se il
// numero CRESCE. Il passato si sistema quando si passa di li'; il presente
// smette di peggiorare.
//
// ── Due difetti del righello, 17/09/2026 (audit, agente RIGHELLO) ─────
//
// 1. CONTAVA I COMMENTI. `#[0-9a-fA-F]{6}` cercava dappertutto, anche nelle
//    righe di spiegazione: 16 colori e 2 misure a tre vie erano testo di
//    commento, non codice che disegna qualcosa. In cinque file TUTTO il
//    conteggio era commento. E la beffa: i commenti contati sono proprio
//    quelli che raccontano la regola. `FloatingActions.jsx` riga 20 dice «i
//    colori dai token, non scritti a mano: #4A0810 non esiste in theme.js» e
//    il cricchetto ci leggeva due colori scritti a mano; `useIsMobile.js`
//    spiega la forma sbagliata `isMobile ? 44 : isTablet ? 44 : 36` e veniva
//    contata come se quella forma fosse nel prodotto. Chi documentava una
//    correzione faceva diventare rosso il cancello: costa quanto un controllo
//    che non grida mai, perché la seconda volta lo si spegne.
//    Ora i commenti si tolgono prima di contare. Le stringhe NO: `'#FFF'` è
//    una stringa ed è esattamente la deviazione che cerchiamo.
//
// 2. VEDEVA `#FFFFFF` E NON `#FFF`. La stessa deviazione, in notazione corta,
//    era invisibile: 396 volte `#FFF` nel codice, più `#EEE`, `#888`, `#000`,
//    `#DDD`. Un righello così non conta poco: si lascia imbrogliare nel verso
//    peggiore, perché accorciare `#FFFFFF` in `#FFF` fa CALARE il numero
//    senza aver tolto niente. Ora contano le tre notazioni (3, 6, 8 cifre).
//
// E un difetto della fotografia, non del codice: era più larga del vero di
// 344 occorrenze (LandingPage 123 registrate contro 6 reali, AuthPage 41
// contro 0), perché dopo ogni ripulitura nessuno rifaceva lo scatto. Il
// cricchetto lasciava aggiungere 344 deviazioni senza dire niente: non è un
// cancello, è un cancello aperto. La fotografia è stata rifatta su HEAD e
// `tests/unit/cricchettoTokenDiDesign.test.js` non la lascia più allargare.
//
// Restano fuori, e si sanno (misurati il 17/09, non corretti qui perché
// allargare la regola è una decisione di chi disegna, non del righello):
// 134 volte il bordeaux del marchio scritto come `rgba(110,14,26,…)`, e 145
// dimensioni di testo dentro un ternario (`fontSize: isMobile ? 12 : 14`),
// che `testo-a-mano` non vede perché dopo i due punti non c'è una cifra.
//
// Aggiornare la fotografia dopo aver ripulito un file:
//   node scripts/check-design-tokens.mjs --aggiorna
//
// Il file di riferimento e' scripts/design-tokens-baseline.json, versionato.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
// Si può puntare l'attrezzo altrove: serve a provarlo su un caso finto senza
// toccare il prodotto (stessa idea di DIR_VISTE in audit-contrasto.mjs). Un
// righello che non si può provare non si sa se misura.
const DIR_SORGENTI = process.env.DIR_SORGENTI ? resolve(process.env.DIR_SORGENTI) : join(ROOT, 'src')
const BASE_REL = dirname(DIR_SORGENTI)   // i nomi restano 'src/...' anche sulla copia
const BASELINE = process.env.FILE_FOTOGRAFIA
  ? resolve(process.env.FILE_FOTOGRAFIA)
  : join(__dirname, 'design-tokens-baseline.json')
const AGGIORNA = process.argv.includes('--aggiorna')

// I file che DEFINISCONO i token possono ovviamente contenere valori grezzi.
const ESENTI = new Set([
  'src/lib/theme.js',
  // La tavolozza delle pagine pubbliche (presentazione, accesso). È un file di
  // token come theme.js: qui i colori esadecimali CI DEVONO stare, è il posto
  // dove sono definiti una volta sola invece di essere copiati a mano.
  'src/lib/temaPubblico.js',
  'src/lib/uiKit.js',
  'src/lib/icons.jsx',
  'src/styles/global.css',
])

const REGOLE = [
  {
    id: 'colore-a-mano',
    // Tre notazioni, una sola deviazione: #FFFFFF, #FFF e #FFFFFF80.
    re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g,
    spiega: 'colore esadecimale scritto a mano invece di un token di color in theme.js',
  },
  {
    id: 'testo-a-mano',
    re: /fontSize:\s*'?\d+/g,
    spiega: 'dimensione del testo scritta a mano invece di typo/getTypo in theme.js',
  },
  {
    // La stessa misura scritta tre volte: computer, tablet, telefono. Chi ne
    // cambia una sola fa divergere le altre due, ed è già successo — il
    // 15/09/2026 il tablet aveva 95 campi di testo sotto i 16px perché la
    // regola anti-zoom era scritta `isMobile ? 16 : 13` e su iPad prendeva il
    // valore del computer.
    id: 'tripla-a-mano',
    re: /is(?:Mobile|Tablet)\s*\?[^?:\n]{0,70}:\s*is(?:Tablet|Mobile)\s*\?/g,
    spiega: 'misura scritta tre volte (computer/tablet/telefono): usa getTypo(isMobile) o un token a tre vie',
  },
  {
    // La regola che impedisce a iOS di ingrandire la pagina, scritta a mano.
    // `isMobile` è falso su iPad, quindi questa forma salta SEMPRE il tablet.
    // Dal 15/09/2026 la regola sta in index.html sotto `@media (pointer: coarse)`
    // e vale per telefono e tablet insieme: qui non serve più scriverla.
    id: 'antizoom-a-mano',
    re: /fontSize:\s*isMobile\s*\?\s*16\s*:/g,
    spiega: "regola anti-zoom scritta a mano: salta il tablet. Sta gia' in index.html per tutti i dispositivi a tocco",
  },
]

function raccogliFile(dir, out = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) raccogliFile(p, out)
    else if (['.jsx', '.js'].includes(extname(nome))) out.push(p)
  }
  return out
}

// ── Contare il codice, non i commenti ──────────────────────────────────
//
// Toglie `//` e i blocchi, lascia stringhe e template dove sono: un colore
// scritto a mano vive quasi sempre dentro una stringa (`background: '#FFF'`),
// quindi le stringhe SI CONTANO. Una virgoletta singola che resta aperta a
// fine riga non è una stringa ma un apostrofo del testo italiano nel JSX
// («l'evento»): lì si torna in codice, altrimenti il resto del file
// sparirebbe dal conteggio e le deviazioni vere resterebbero nascoste.
function senzaCommenti(testo) {
  let fuori = ''
  let stato = 'codice'
  let apice = ''
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]
    const d = testo[i + 1]
    if (stato === 'codice') {
      if (c === '/' && d === '/') { stato = 'riga'; i++; continue }
      if (c === '/' && d === '*') { stato = 'blocco'; i++; continue }
      if (c === "'" || c === '"' || c === '`') { stato = 'stringa'; apice = c }
      fuori += c
      continue
    }
    if (stato === 'riga') {
      if (c === '\n') { stato = 'codice'; fuori += c }
      continue
    }
    if (stato === 'blocco') {
      if (c === '*' && d === '/') { stato = 'codice'; i++; continue }
      if (c === '\n') fuori += c
      continue
    }
    // dentro una stringa
    if (c === '\\') { fuori += c + (d || ''); i++; continue }
    fuori += c
    if (c === apice) stato = 'codice'
    else if (c === '\n' && apice !== '`') stato = 'codice'  // era un apostrofo
  }
  return fuori
}

const conteggi = {}
for (const file of raccogliFile(DIR_SORGENTI)) {
  const rel = relative(BASE_REL, file)
  if (ESENTI.has(rel)) continue
  const testo = senzaCommenti(readFileSync(file, 'utf8'))
  for (const regola of REGOLE) {
    const n = (testo.match(regola.re) || []).length
    if (n > 0) {
      conteggi[rel] = conteggi[rel] || {}
      conteggi[rel][regola.id] = n
    }
  }
}

if (AGGIORNA) {
  writeFileSync(BASELINE, JSON.stringify(conteggi, null, 2) + '\n')
  const tot = Object.values(conteggi).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0)
  console.log(`[design] fotografia aggiornata: ${tot} occorrenze in ${Object.keys(conteggi).length} file.`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('[design] manca scripts/design-tokens-baseline.json. Crealo con: node scripts/check-design-tokens.mjs --aggiorna')
  process.exit(1)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const peggiorati = []

for (const [file, regole] of Object.entries(conteggi)) {
  for (const [id, n] of Object.entries(regole)) {
    const prima = base[file]?.[id] ?? 0
    if (n > prima) peggiorati.push({ file, id, prima, ora: n })
  }
}

// ── Il gioco del cricchetto ────────────────────────────────────────────
// Una fotografia più larga del vero è un cancello aperto: se registra 123
// deviazioni dove ce ne sono 6, se ne possono aggiungere 117 senza che questo
// controllo dica niente. Il 17/09/2026 il gioco era di 344 occorrenze, messo
// su da anni di ripuliture mai rifotografate. Non fa fallire il controllo —
// il codice non è peggiorato — ma va detto ad alta voce.
let gioco = 0
for (const [file, regole] of Object.entries(base)) {
  for (const [id, n] of Object.entries(regole)) {
    const ora = conteggi[file]?.[id] ?? 0
    if (n > ora) gioco += n - ora
  }
}
if (gioco > 0) {
  console.log(`[design] la fotografia è più larga del vero di ${gioco} occorrenze: ` +
    'sono state ripulite e non rifotografate. Rifai lo scatto con --aggiorna, ' +
    'altrimenti tante deviazioni nuove passerebbero senza un fiato.')
}

if (peggiorati.length === 0) {
  const tot = Object.values(conteggi).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0)
  console.log(`[design] OK — nessuna nuova deviazione dai token (${tot} preesistenti, invariate o in calo).`)
  process.exit(0)
}

console.error(`\n[design] ${peggiorati.length} file hanno NUOVE deviazioni dai token:\n`)
for (const p of peggiorati) {
  const regola = REGOLE.find(r => r.id === p.id)
  console.error(`  ${p.file}`)
  console.error(`    ${p.id}: erano ${p.prima}, ora ${p.ora}  (+${p.ora - p.prima})`)
  console.error(`    ${regola.spiega}\n`)
}
console.error('Usa i token di src/lib/theme.js: color.* per i colori, typo/getTypo per il testo.')
console.error('Se la crescita e\' voluta e motivata: node scripts/check-design-tokens.mjs --aggiorna\n')
process.exit(1)
