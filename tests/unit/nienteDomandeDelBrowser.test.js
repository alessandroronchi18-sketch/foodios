// ── Le domande le fa il programma, non il browser ─────────────────────────
//
// La regola sta in CLAUDE.md («`alert()`: NON usare in flussi utente. Usare
// `notify()`… ammesso solo in admin per azioni distruttive») e vale allo
// stesso modo per `prompt()` e `window.confirm()`, per un motivo scritto per
// esteso in `TrasferimentiView.jsx:60` e `Fornitori.jsx:337`: su iOS quella
// finestra arriva senza il nome dell'applicazione, non si legge in due righe
// sul telefono, e non assomiglia a nessun'altra domanda che questo programma
// fa. Chi la vede sopra Foodos non sa se sta rispondendo a Foodos o a Safari.
//
// ── Perché questo file esiste (19/09/2026, audit della suite) ─────────────
//
// La regola era provata in due punti soli, e tutti e due dentro un file che
// parlava d'altro: `trasferimentiSenzaBuchi.test.js` controllava `prompt(` in
// `TrasferimentiView.jsx` e `window.confirm` in `Fornitori.jsx`. Due file su
// centoventi. Gli altri centodiciotto non li guardava nessuno — e infatti ce
// n'erano cinque che la violavano. Oggi ne resta uno solo, elencato qui sotto.
//
// Questo è un CRICCHETTO, non un traguardo: l'elenco delle eccezioni può solo
// accorciarsi. Chi ne aggiunge una deve scrivere qui perché, e chi ne corregge
// una deve toglierla di qui — se no il test diventa rosso e lo dice.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── Le eccezioni, una per una, col motivo ─────────────────────────────────
//
// AMMESSE PER SEMPRE: il pannello di amministrazione. Lo apro io, dal
// computer, e CLAUDE.md lo dice esplicitamente.
const AMMESSI_PER_SEMPRE = [
  'src/admin/AdminPage.jsx',
  'src/admin/PersonalizeDemoModal.jsx',
  // È il componente che SOSTITUISCE window.confirm: il fallback nativo serve
  // a chi lo usa senza il Provider, ed è l'unico posto dove deve comparire.
  'src/components/ConfirmModal.jsx',
]

// DA CORREGGERE: violazioni vere, trovate il 19/09/2026 e non corrette qui
// perché l'audit della suite non tocca `src/`. Ognuna è una finestra del
// browser che compare a un cliente, su un telefono, nel mezzo di un flusso.
//
// 19/09/2026, secondo giro: l'elenco è passato da tre file a uno.
// `ImportWizard.jsx` e `InventarioSettimanaleView.jsx` sono a zero e per questo
// non compaiono più qui — le loro quattro domande adesso le fa `ConfirmModal`.
// Nota per chi legge il numero vecchio: `ImportWizard.jsx` diceva 3 ma le
// chiamate vere erano già 2 (il `window.prompt` del mese era stato tolto e del
// prompt era rimasto solo il racconto in un commento, che il setaccio non
// conta). È il motivo per cui questi numeri si ricontano invece di ereditarli.
// 21/09/2026: l'elenco è **vuoto**. L'ultima era l'import del ricettario in
// `Dashboard.jsx` — la domanda «sovrascrivo?» prima di riscrivere le ricette,
// cioè la più pericolosa del prodotto, e la faceva Safari. Adesso la fa
// `useConfirm` come tutte le altre.
//
// Il cricchetto da qui in avanti è a zero: chi ne aggiunge una deve scriverla
// qui col motivo, e il numero non può che restare zero o scendere.
const DA_CORREGGERE = {}

function tuttiIFile(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) tuttiIFile(p, out)
    else if (/\.jsx?$/.test(n)) out.push(p)
  }
  return out
}

/** Toglie commenti e stringhe: qui contano le CHIAMATE, non i racconti. */
function soloCodice(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

// `await confirm({ ... })` è il contrario: è il componente `useConfirm` che
// SOSTITUISCE la finestra del browser. Si riconosce perché prende un oggetto
// e si aspetta. Contare anche quello direbbe che chi ha fatto la cosa giusta
// l'ha fatta sbagliata — ed è il modo più veloce per far spegnere un test.
const CHIAMATE = /(?:^|[^.\w$])(?:window\s*\.\s*(?:prompt|confirm|alert)\s*\(|(?<!await\s)(?:prompt|confirm|alert)\s*\((?!\s*\{))/g

function violazioni() {
  const out = {}
  for (const p of tuttiIFile(join(RADICE, 'src'))) {
    const rel = relative(RADICE, p)
    if (AMMESSI_PER_SEMPRE.includes(rel)) continue
    const n = (soloCodice(readFileSync(p, 'utf8')).match(CHIAMATE) || []).length
    if (n > 0) out[rel] = n
  }
  return out
}

describe('niente finestre del browser nei flussi utente', () => {
  it('il righello: il setaccio passa su tutto il prodotto, non su due file', () => {
    // Se il percorso cambia, l'elenco si svuota e il test resta verde senza
    // aver guardato niente. È il modo in cui i controlli statici mentono.
    const file = tuttiIFile(join(RADICE, 'src'))
    expect(file.length, 'non trovo i file del prodotto: percorso sbagliato?').toBeGreaterThan(80)
    expect(file.some(f => f.endsWith('Dashboard.jsx'))).toBe(true)
  })

  it('e sa riconoscere una chiamata quando c\'è', () => {
    // Taratura dell'attrezzo: il setaccio deve vedere una chiamata vera e
    // ignorare la parola dentro un commento o una frase.
    expect((soloCodice('if (window.confirm("ok")) {}').match(CHIAMATE) || []).length).toBe(1)
    expect((soloCodice('const g = prompt("quanti?")').match(CHIAMATE) || []).length).toBe(1)
    expect((soloCodice('// qui c era window.confirm, tolto').match(CHIAMATE) || []).length).toBe(0)
    expect((soloCodice('notify("nessun alert(: è solo testo")').match(CHIAMATE) || []).length).toBe(0)
    // `onConfirm(...)` e `this.alert(...)` non sono la finestra del browser.
    expect((soloCodice('onConfirm(x); obj.alert(y)').match(CHIAMATE) || []).length).toBe(0)
    // E soprattutto: la finestra GIUSTA non deve contare come violazione.
    expect((soloCodice('const ok = await confirm({ titolo: "x" })').match(CHIAMATE) || []).length).toBe(0)
  })

  it('nessun file nuovo chiede col browser', () => {
    const trovate = violazioni()
    const nuovi = Object.keys(trovate).filter(f => !(f in DA_CORREGGERE))
    expect(nuovi,
      `questi file chiedono col browser invece che con una finestra del programma: ${nuovi.join(', ')}`).toEqual([])
  })

  it('e i casi noti che restano non aumentano', () => {
    const trovate = violazioni()
    for (const [file, tetto] of Object.entries(DA_CORREGGERE)) {
      expect(trovate[file] || 0,
        `${file}: le finestre del browser sono aumentate`).toBeLessThanOrEqual(tetto)
    }
  })

  it('e quando uno viene corretto, questo elenco si accorcia', () => {
    // Il cricchetto gira in un verso solo: se un file è stato sistemato,
    // deve uscire dall'elenco, se no l'elenco diventa una bugia tramandata.
    const trovate = violazioni()
    const risolti = Object.keys(DA_CORREGGERE).filter(f => !(f in trovate))
    expect(risolti,
      `corretti ma ancora nell'elenco delle eccezioni: ${risolti.join(', ')} — toglili`).toEqual([])
  })

  it('i due posti da cui la regola è nata restano puliti', () => {
    // Trasferimenti e Fornitori: sono i due file per cui la regola è stata
    // scritta, e la prova che c'era prima guardava solo quelli.
    const trovate = violazioni()
    expect(trovate['src/components/TrasferimentiView.jsx']).toBeUndefined()
    expect(trovate['src/components/Fornitori.jsx']).toBeUndefined()
  })
})
