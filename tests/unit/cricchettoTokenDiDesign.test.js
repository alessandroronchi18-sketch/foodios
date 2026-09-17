// Il cricchetto dei token di design misura bene?
//
// ── Il difetto che ha fatto nascere questo file ────────────────────────
//
// 17/09/2026, audit RIGHELLO. `node scripts/check-design-tokens.mjs` usciva 1
// e teneva fermo il build: quattro file con «nuove deviazioni». Prima di
// chiedere a qualcuno di correggere quattro file, la domanda giusta era se il
// righello stesse misurando bene. Le quattro segnalazioni erano vere — riga
// per riga, confrontate con `git show HEAD:` — ma il righello aveva due
// difetti veri e la sua fotografia un terzo.
//
// 1. CONTAVA I COMMENTI. La regola cercava `#[0-9a-fA-F]{6}` in tutto il file.
//    Sedici colori e due misure a tre vie erano testo di commento: in cinque
//    file l'intero conteggio era commento. E i commenti contati erano proprio
//    quelli che raccontano la regola — `FloatingActions.jsx` riga 20 scrive «i
//    colori dai token, non scritti a mano: #4A0810 non esiste in theme.js», e
//    il cricchetto ci leggeva due colori scritti a mano. Documentare una
//    correzione faceva diventare rosso il cancello. È lo stesso danno del
//    difetto 13 di questo audit (il rilevatore di emoji che bocciava la «→» e
//    la «✓»): un controllo che grida dove non c'è niente costa quanto uno che
//    non grida mai, perché la seconda volta lo si spegne.
//
// 2. VEDEVA `#FFFFFF` E NON `#FFF`. La stessa deviazione in notazione corta
//    era invisibile: 396 volte `#FFF` nel codice, più `#EEE`, `#888`, `#000`,
//    `#DDD`. Peggio del non contare: accorciare `#FFFFFF` in `#FFF` faceva
//    CALARE il numero senza togliere niente, cioè il righello premiava la
//    mossa sbagliata.
//
// 3. LA FOTOGRAFIA ERA PIÙ LARGA DEL VERO DI 344 OCCORRENZE. Il controllo è a
//    cricchetto: fallisce solo se il numero cresce rispetto a
//    `scripts/design-tokens-baseline.json`. Ma dopo ogni ripulitura nessuno
//    rifaceva lo scatto, e il gioco si era accumulato: LandingPage registrava
//    123 dimensioni di testo a mano contro 6 reali, AuthPage 41 contro 0,
//    Dashboard 155 contro 100. Si potevano aggiungere 344 deviazioni senza che
//    il cancello dicesse una parola. Rifatta la fotografia su HEAD con il
//    conteggio corretto, sono saltate fuori quattro deviazioni vere che il
//    righello vecchio non vedeva (Dashboard +3 dimensioni di testo, PLView +1,
//    MarketplaceView e RecipeInventorView +1 colore `#FFF` ciascuno).
//
// ── Cosa protegge questo file ──────────────────────────────────────────
//
// 1. Che il conteggio salti i commenti e NON le stringhe: un colore scritto a
//    mano vive quasi sempre dentro una stringa (`background: '#FFF'`), quindi
//    togliere le stringhe renderebbe cieco il controllo.
// 2. Che le tre notazioni dell'esadecimale contino allo stesso modo.
// 3. Che il cricchetto sappia dire di no (fotografia superata → esito 1) e
//    anche di sì (fotografia rispettata → esito 0): un attrezzo che dice
//    sempre no è rotto nell'altro verso.
// 4. Che la fotografia resti aderente a HEAD, cioè che il gioco non torni.
//
// Audit RIGHELLO, 17/09/2026.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ATTREZZO = join(RADICE, 'scripts', 'check-design-tokens.mjs')

// Fa girare l'attrezzo su un albero finto, con una fotografia finta.
function lancia({ sorgenti, fotografia, aggiorna = false }) {
  const r = spawnSync('node', [ATTREZZO, ...(aggiorna ? ['--aggiorna'] : [])], {
    encoding: 'utf8',
    env: { ...process.env, DIR_SORGENTI: sorgenti, FILE_FOTOGRAFIA: fotografia },
  })
  return { esito: r.status, detto: `${r.stdout || ''}${r.stderr || ''}` }
}

// Un albero finto con i file che servono alla prova.
function albero(file) {
  const dir = mkdtempSync(join(tmpdir(), 'cricchetto-'))
  for (const [nome, contenuto] of Object.entries(file)) {
    const pieno = join(dir, nome)
    mkdirSync(dirname(pieno), { recursive: true })
    writeFileSync(pieno, contenuto)
  }
  return dir
}

const daButtare = []
function temporanea(file) {
  const d = albero(file)
  daButtare.push(d)
  return d
}
afterAll(() => { for (const d of daButtare) rmSync(d, { recursive: true, force: true }) })

// Conta con l'attrezzo vero: --aggiorna scrive la fotografia, e la fotografia
// È il conteggio. Così si misura quello che l'attrezzo vede davvero, non una
// copia della sua regola scritta qui dentro (il difetto 2 del 16/09: una
// funzione ricopiata nel test non prova niente sul programma).
function conteggio(sorgenti) {
  const foto = join(sorgenti, 'foto.json')
  const r = lancia({ sorgenti: join(sorgenti, 'src'), fotografia: foto, aggiorna: true })
  expect(r.esito, `l'attrezzo non è riuscito a contare: ${r.detto}`).toBe(0)
  return JSON.parse(readFileSync(foto, 'utf8'))
}

describe('il conteggio guarda il codice, non i commenti', () => {
  it('un colore nominato dentro un commento non è una deviazione', () => {
    const dir = temporanea({
      'src/Solo.jsx': [
        '// I colori dai token, non scritti a mano: `#4A0810` non esiste in',
        '// theme.js — il token è `brandDarker: #4A0612`.',
        '/* e anche qui si parla di #FFFFFF senza usarlo */',
        'export default function Solo() { return null }',
        '',
      ].join('\n'),
    })
    expect(conteggio(dir)['src/Solo.jsx']).toBeUndefined()
  })

  it('e il righello di questa prova non è vuoto: la stessa riga, nel codice, conta', () => {
    // Senza questa prova la precedente sarebbe verde anche con un attrezzo
    // che non conta niente.
    const dir = temporanea({
      'src/Solo.jsx': "export const s = { background: '#4A0810', color: '#4A0612' }\n",
    })
    expect(conteggio(dir)['src/Solo.jsx']['colore-a-mano']).toBe(2)
  })

  it('la regola vecchia contava quei commenti: la prova che il difetto era vero', () => {
    const commento = '// il token è `brandDarker: #4A0612` e non `#4A0810`'
    const vecchia = /#[0-9a-fA-F]{6}\b/g
    expect(commento.match(vecchia)).toHaveLength(2)
  })

  it('le stringhe NON si tolgono: la deviazione vive quasi sempre lì dentro', () => {
    const dir = temporanea({
      'src/Solo.jsx': "export const s = { background: '#FAF8F7' } // niente da vedere\n",
    })
    expect(conteggio(dir)['src/Solo.jsx']['colore-a-mano']).toBe(1)
  })

  it("un apostrofo italiano nel testo non fa sparire il resto del file", () => {
    // `l'evento` apre una virgoletta che non si chiude: se il togli-commenti
    // la trattasse come una stringa vera, tutto quello che viene dopo
    // finirebbe dentro e le deviazioni sotto sparirebbero dal conteggio.
    const dir = temporanea({
      'src/Solo.jsx': [
        'export default function S() {',
        "  return <div>Prodotti dell'evento e dell'anno</div>",
        '}',
        "export const s = { background: '#123456', fontSize: 13 }",
        '',
      ].join('\n'),
    })
    const c = conteggio(dir)['src/Solo.jsx']
    expect(c['colore-a-mano']).toBe(1)
    expect(c['testo-a-mano']).toBe(1)
  })
})

describe('le tre notazioni dell\'esadecimale contano allo stesso modo', () => {
  it('#FFF conta come #FFFFFF', () => {
    const dir = temporanea({
      'src/Corta.jsx': "export const a = { color: '#FFF', background: '#EEE' }\n",
      'src/Lunga.jsx': "export const b = { color: '#FFFFFF', background: '#EEEEEE' }\n",
    })
    const c = conteggio(dir)
    expect(c['src/Corta.jsx']['colore-a-mano']).toBe(2)
    expect(c['src/Lunga.jsx']['colore-a-mano']).toBe(2)
  })

  it('la regola vecchia non vedeva #FFF: 396 volte nel codice, invisibili', () => {
    const vecchia = /#[0-9a-fA-F]{6}\b/g
    expect("color: '#FFF'".match(vecchia)).toBe(null)
  })

  it('accorciare #FFFFFF in #FFF non fa più calare il numero', () => {
    const prima = temporanea({ 'src/X.jsx': "export const a = '#FFFFFF'\n" })
    const dopo = temporanea({ 'src/X.jsx': "export const a = '#FFF'\n" })
    expect(conteggio(dopo)['src/X.jsx']['colore-a-mano'])
      .toBe(conteggio(prima)['src/X.jsx']['colore-a-mano'])
  })

  it('i file che definiscono i token restano esenti', () => {
    const dir = temporanea({ 'src/lib/theme.js': "export const C = { red: '#6E0E1A', white: '#FFF' }\n" })
    expect(conteggio(dir)['src/lib/theme.js']).toBeUndefined()
  })
})

describe('il cricchetto sa dire di no, e sa dire di sì', () => {
  let dir
  beforeAll(() => {
    dir = temporanea({ 'src/Uno.jsx': "export const a = { color: '#123456', fontSize: 12 }\n" })
  })

  it('fotografia superata: esito 1 e il file per nome', () => {
    const foto = join(dir, 'stretta.json')
    writeFileSync(foto, JSON.stringify({ 'src/Uno.jsx': { 'colore-a-mano': 0, 'testo-a-mano': 0 } }))
    const r = lancia({ sorgenti: join(dir, 'src'), fotografia: foto })
    expect(r.esito).toBe(1)
    expect(r.detto).toContain('src/Uno.jsx')
  })

  it('fotografia rispettata: esito 0', () => {
    const foto = join(dir, 'giusta.json')
    writeFileSync(foto, JSON.stringify({ 'src/Uno.jsx': { 'colore-a-mano': 1, 'testo-a-mano': 1 } }))
    expect(lancia({ sorgenti: join(dir, 'src'), fotografia: foto }).esito).toBe(0)
  })

  it('fotografia più larga del vero: passa, ma lo dice ad alta voce', () => {
    const foto = join(dir, 'larga.json')
    writeFileSync(foto, JSON.stringify({ 'src/Uno.jsx': { 'colore-a-mano': 40, 'testo-a-mano': 1 } }))
    const r = lancia({ sorgenti: join(dir, 'src'), fotografia: foto })
    expect(r.esito).toBe(0)
    expect(r.detto, 'un gioco di 39 occorrenze passa in silenzio: è il difetto 3').toContain('39')
  })

  it('e non si inventa un esito quando la fotografia non c\'è', () => {
    const r = lancia({ sorgenti: join(dir, 'src'), fotografia: join(dir, 'non-esiste.json') })
    expect(r.esito).toBe(1)
  })
})

describe('il controllo vero guarda davvero dentro il progetto', () => {
  it('conta più di cento file di src/, non una cartella vuota', () => {
    // La prova che mancava ai sette setacci del 16/09: puntato altrove, un
    // censimento resta verde perché non trova niente da esaminare.
    const foto = join(temporanea({ 'src/.tieni': '' }), 'foto.json')
    const r = lancia({ sorgenti: join(RADICE, 'src'), fotografia: foto, aggiorna: true })
    expect(r.esito).toBe(0)
    const c = JSON.parse(readFileSync(foto, 'utf8'))
    expect(Object.keys(c).length).toBeGreaterThan(100)
    expect(c['src/Dashboard.jsx']).toBeTruthy()
  })
})

// ── La fotografia deve restare aderente ────────────────────────────────
//
// Un cricchetto con del gioco non è un cricchetto. La fotografia versionata
// deve dire esattamente quante deviazioni ci sono nel codice pubblicato
// (HEAD): se ne dichiara di più, quella differenza è spazio libero per
// peggiorare in silenzio. Il 17/09 lo spazio libero era di 344 occorrenze.
//
// Quando questa prova diventa rossa vuol dire che qualcuno ha ripulito dei
// file senza rifare lo scatto: si rimedia con
//   node scripts/check-design-tokens.mjs --aggiorna
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: RADICE, encoding: 'utf8' })
const conGit = git.status === 0

describe.skipIf(!conGit)('la fotografia versionata resta aderente al codice pubblicato', () => {
  it('nessuna voce dichiara più deviazioni di quante ce ne sono in HEAD', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cricchetto-head-'))
    daButtare.push(dir)
    const archivio = spawnSync('sh', ['-c', `git archive HEAD src | tar -x -C ${JSON.stringify(dir)}`],
      { cwd: RADICE, encoding: 'utf8' })
    expect(archivio.status, `non sono riuscito a leggere src da HEAD: ${archivio.stderr}`).toBe(0)

    const foto = join(dir, 'da-head.json')
    expect(lancia({ sorgenti: join(dir, 'src'), fotografia: foto, aggiorna: true }).esito).toBe(0)
    const inHead = JSON.parse(readFileSync(foto, 'utf8'))
    const versionata = JSON.parse(readFileSync(join(RADICE, 'scripts', 'design-tokens-baseline.json'), 'utf8'))

    const gioco = []
    for (const [file, regole] of Object.entries(versionata)) {
      for (const [id, n] of Object.entries(regole)) {
        const vero = inHead[file]?.[id] ?? 0
        if (n > vero) gioco.push(`${file} · ${id}: la fotografia dice ${n}, in HEAD ce ne sono ${vero}`)
      }
    }
    expect(gioco,
      'la fotografia è più larga del vero: tante deviazioni nuove passerebbero senza un fiato. ' +
      'Rifai lo scatto con: node scripts/check-design-tokens.mjs --aggiorna',
    ).toEqual([])
  })
})
