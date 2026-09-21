// ── Un'interpolazione fuori da un template è CSS buttato via ─────────────
//
// Il 21/09/2026, cercando un difetto segnalato in una pagina sola, ne sono
// saltati fuori **110 in undici pagine**. Tutti della stessa forma:
//
//     background: '${T.white}FFF'          ← doveva essere  #FFFFFF
//     border:     '1px solid ${T.blue}'    ← doveva essere un template
//     color:      '${T.brand}'             ← doveva essere  T.brand
//
// `${…}` funziona **solo dentro gli apici inversi**. Fra apici normali resta
// testo: il browser riceve `1px solid ${T.blue}`, non lo capisce, e **butta
// via la proprietà**. Il codice compila, i test passano, e a schermo il
// colore semplicemente non c'è.
//
// Dove faceva più male: nel Ricettario il nome di ogni ricetta ha
// `backgroundClip: 'text'` con `WebkitTextFillColor: 'transparent'` e nessun
// `color` di riserva. Senza lo sfondo, **il nome era trasparente su niente**:
// invisibile.
//
// Da dove viene: le sostituzioni di massa dei colori verso i token del tema.
// È il difetto che CLAUDE.md racconta dal 19/09 («un colore vive in almeno
// tre contesti diversi, e ognuno vuole una scrittura diversa») — solo che la
// riparazione di allora aveva guardato un file solo.
//
// Questo file è il cricchetto che chiude la porta: **zero**, e zero deve
// restare. Non guarda una regex sul testo, monta un piccolo parser — perché
// una regex non sa dire se un apice sta dentro un template o no, ed è
// esattamente l'errore che ha lasciato passare le altre 109.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(process.cwd(), 'src')

/** Le stringhe vere di un file: (tipo, testo, riga). */
function stringhe(src) {
  let i = 0, riga = 1
  const n = src.length
  const fuori = []
  while (i < n) {
    const c = src[i]
    if (c === '\n') { riga++; i++; continue }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') riga++; i++ }
      i += 2; continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const apre = c, inizio = i, r0 = riga
      i++
      let prof = 0
      while (i < n) {
        const d = src[i]
        if (d === '\\') { i += 2; continue }
        if (d === '\n') riga++
        if (apre === '`' && d === '$' && src[i + 1] === '{') { prof++; i += 2; continue }
        if (apre === '`' && d === '}' && prof > 0) { prof--; i++; continue }
        if (d === apre && prof === 0) break
        if (apre !== '`' && d === '\n') break
        i++
      }
      fuori.push({ tipo: apre, testo: src.slice(inizio, i + 1), riga: r0 })
      i++; continue
    }
    i++
  }
  return fuori
}

function tuttiIFile(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) tuttiIFile(p, out)
    else if (/\.jsx?$/.test(n)) out.push(p)
  }
  return out
}

const FILE = tuttiIFile(RADICE)

describe('Nessuna interpolazione fuori da un template', () => {
  it('in tutto src/', () => {
    const rotte = []
    for (const p of FILE) {
      const src = readFileSync(p, 'utf8')
      for (const s of stringhe(src)) {
        // ── Due modi in cui questo lettore può abbagliarsi, e come si tarano
        //
        // 1. Un apostrofo dentro un testo JSX — «da tenere d'occhio» scritto
        //    fra i tag — non è una stringa JavaScript, ma un parser che legge
        //    solo JS lo scambia per l'inizio di una. Da lì in poi legge male,
        //    e quello che «trova» contiene un apice inverso: un valore CSS
        //    vero non ne contiene mai.
        // 2. Una espressione regolare che contiene virgolette
        //    (`/[&<>"']/g`, in `ExportContabilita.jsx`) fa lo stesso effetto.
        //
        // Per questo non si cerca «una stringa con dentro `${`», ma la forma
        // esatta del difetto: **un oggetto col punto**, cioè `${T.brand}`,
        // `${C.border}`. È quello che le sostituzioni verso i token scrivono,
        // ed è il 100% dei 110 casi trovati il 21/09. `${yearMonth}` dentro un
        // template non somiglia a niente di tutto questo, e resta fuori.
        const abbaglio = s.testo.includes('`')
        const paDiToken = /\$\{\s*[A-Za-z_$][\w$]*\.[\w$]/.test(s.testo)
        if (s.tipo !== '`' && paDiToken && !abbaglio) {
          rotte.push(`${p.replace(process.cwd() + '/', '')}:${s.riga}  ${s.testo.slice(0, 70)}`)
        }
      }
    }
    expect(rotte, `${rotte.length} stringhe con un'interpolazione fuori da un template:\n${rotte.join('\n')}`).toEqual([])
  })

  it('e nessun attributo JSX riceve un token senza graffe', () => {
    // L'altra metà dello stesso difetto: riparando `color="#6E0E1A"` si
    // ottiene `color=T.brand`, che non è JSX valido. Il parser lo dice, ma
    // solo per il primo errore di ogni file: qui si contano tutti.
    const rotte = []
    for (const p of FILE.filter(f => f.endsWith('.jsx'))) {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/(?<![\w.])([a-zA-Z][\w-]*)=(T\.[A-Za-z0-9_]+)(?=[\s/>])/g)) {
        rotte.push(`${p.replace(process.cwd() + '/', '')}  ${m[0]}`)
      }
    }
    expect(rotte, `attributi JSX senza graffe:\n${rotte.join('\n')}`).toEqual([])
  })
})

describe('Il righello di questo file', () => {
  it('il parser distingue un template da una stringa normale', () => {
    // Taratura: se sbagliasse, la prova sopra sarebbe verde per sempre.
    const finto = [
      'const a = `ciao ${nome}`',            // giusto
      "const b = 'ciao ${nome}'",            // sbagliato
      'const c = `nel testo c\'è un apice ${x}`', // apice dentro un template
    ].join('\n')
    const trovate = stringhe(finto).filter(s => s.tipo !== '`' && s.testo.includes('${'))
    expect(trovate).toHaveLength(1)
    expect(trovate[0].riga).toBe(2)
  })

  it('e legge davvero tutto il progetto, non una cartella vuota', () => {
    expect(FILE.length).toBeGreaterThan(100)
  })
})
