// Gli esiti mangiati per strada.
//
// ── Il difetto che ha fatto nascere questo file ────────────────────────
//
// 14/09/2026: due pubblicazioni sono passate dal cancello pre-push con il
// build rotto. Su Vercel il deploy è morto in quattro secondi, due volte, e la
// produzione è rimasta ferma tre commit indietro senza nessun segnale.
//
// La causa era una riga sola:
//
//     if ! npm run build --silent 2>&1 | tail -5; then
//
// In una pipeline di shell l'esito è quello dell'**ultimo** comando. `tail`
// riesce sempre. Il build poteva morire quanto voleva: il cancello guardava
// `tail` e diceva di sì. La correzione è `set -o pipefail`, che fa contare il
// primo comando che fallisce.
//
// ── Cosa è uscito cercando lo stesso schema altrove, il 16/09/2026 ─────
//
// 1. `.github/workflows/bundle-size.yml` — il peso del bundle si misurava con
//    `find dist/assets -name "*.js" ... | wc -c`. Provato con `dist/assets`
//    INESISTENTE: il passo stampa «Bundle size OK: 0 KB» ed esce **0**. Un
//    controllo che passa avendo misurato zero. In più girava solo su
//    `pull_request`, e qui si pubblica spingendo dritto su main: non è mai
//    partito una volta, esattamente come `migration-check.yml` prima del 16/09.
//
// 2. `scripts/check-migrazioni-applicate.mjs` — `catch { return 0 }` sulla
//    connessione al database, con lo stesso messaggio del caso «non ho le
//    credenziali». Provato con `SUPABASE_DB_URL` su una porta chiusa:
//    «controllo saltato», uscita 0. Una password scaduta spegneva quel passo
//    del cancello per sempre, in silenzio.
//
// 3. `.github/workflows/security-audit.yml` — il passo «License check (no GPL
//    viral)» aveva `continue-on-error: true` **e** `> /dev/null`: il `--failOn`
//    che è la sua ragione d'essere non poteva fermare niente, e l'output non
//    si vedeva nemmeno.
//
// Nei workflow il difetto è di sistema: `run:` senza `shell:` gira con
// `bash -e`, che **non** ha `pipefail`. Solo scrivendo `shell: bash` GitHub usa
// `bash --noprofile --norc -eo pipefail`.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')
const WF = join(RADICE, '.github', 'workflows')
const workflow = readdirSync(WF).filter(f => f.endsWith('.yml'))

// Un righello che non sa trovare niente è peggio di nessun righello: qui c'è
// il caso finto su cui si prova prima di credergli.
const FINTO_ROTTO = `
jobs:
  x:
    steps:
      - name: misura
        run: |
          TOT=$(find dist -name "*.js" | wc -c)
`
const FINTO_SANO = `
defaults:
  run:
    shell: bash
jobs:
  x:
    steps:
      - name: misura
        run: |
          TOT=$(find dist -name "*.js" | wc -c)
`

const haPipeDentroRun = (s) => {
  // Solo le righe dentro un blocco `run:`, non i commenti.
  const righe = s.split('\n')
  let dentro = false
  for (const r of righe) {
    if (/^\s+run:\s*\|/.test(r)) { dentro = true; continue }
    if (/^\s+(-\s+)?(name|uses|with|env|if|shell|continue-on-error):/.test(r)) dentro = false
    if (/^\s+run:\s*\S/.test(r) && r.includes('|')) return true
    if (!dentro) continue
    const pulita = r.replace(/#.*$/, '')
    if (/\|\s*(tail|head|wc|grep|awk|sed|jq|xargs|tee)\b/.test(pulita)) return true
  }
  return false
}
const haPipefail = (s) => /defaults:\s*\n\s*run:\s*\n\s*shell:\s*bash/.test(s)

describe('il righello degli esiti mangiati sa trovarne uno', () => {
  it('riconosce una pipe dentro un run:', () => {
    expect(haPipeDentroRun(FINTO_ROTTO)).toBe(true)
  })

  it('e vede quando manca la riga che accende pipefail', () => {
    expect(haPipefail(FINTO_ROTTO)).toBe(false)
    expect(haPipefail(FINTO_SANO)).toBe(true)
  })

  it('e guarda davvero dentro il progetto, non una cartella vuota', () => {
    // La prova che mancava ai sette setacci del 16/09: puntato altrove, un
    // censimento resta verde perché non trova niente da esaminare.
    expect(workflow.length, 'nessun workflow trovato: il percorso è sbagliato').toBeGreaterThan(4)
  })
})

describe('nei workflow, una pipe non nasconde più il fallimento', () => {
  for (const f of workflow) {
    const s = leggi('.github', 'workflows', f)
    if (!haPipeDentroRun(s)) continue
    it(`${f} accende pipefail (ha comandi in pipeline)`, () => {
      expect(haPipefail(s),
        `${f} usa una pipe dentro un run: senza "defaults: run: shell: bash".\n` +
        'Senza quella riga conta solo l\'ultimo comando della pipeline, e quello riesce quasi sempre.',
      ).toBe(true)
    })
  }
})

describe('il peso del bundle non si dichiara a posto avendo misurato zero', () => {
  const S = leggi('.github', 'workflows', 'bundle-size.yml')

  it('si ferma se la cartella del build non c\'è', () => {
    expect(S).toContain('if [ ! -d dist/assets ]')
  })

  it('e si ferma anche se la cartella c\'è ma è vuota', () => {
    expect(S).toMatch(/QUANTI=\$\(find dist\/assets -name "\*\.js" \| wc -l\)/)
    expect(S).toMatch(/\[ "\$QUANTI" -eq 0 \]/)
  })

  it('e gira anche quando si pubblica dritto su main, non solo sulle PR', () => {
    // Il motivo per cui migration-check.yml non è mai partito in due mesi.
    expect(S).toMatch(/push:\s*\n\s*branches: \[main\]/)
  })
})

describe('il cancello pre-push conta l\'esito del build, non quello di tail', () => {
  const HOOK = leggi('scripts', 'install-hooks.sh')

  it('la riga che ha fatto passare due pubblicazioni rotte è ancora tappata', () => {
    expect(HOOK).toContain('set -o pipefail')
    // E sta PRIMA della pipeline del build, altrimenti non serve a niente.
    expect(HOOK.indexOf('set -o pipefail')).toBeLessThan(HOOK.indexOf('npm run build --silent'))
  })
})

describe('un passo che promette di bloccare, blocca', () => {
  it('nessun passo si chiama «check» mentre ha continue-on-error acceso', () => {
    // Era il caso di «License check (no GPL viral)»: il nome prometteva un
    // controllo, `continue-on-error: true` lo rendeva un commento.
    const colpevoli = []
    for (const f of workflow) {
      const righe = leggi('.github', 'workflows', f).split('\n')
      for (let i = 0; i < righe.length; i++) {
        const m = righe[i].match(/^\s*-\s*name:\s*(.+)$/)
        if (!m) continue
        const nome = m[1].trim()
        const promette = /check|verifica|audit|controllo/i.test(nome)
        const dichiaraNonBlocca = /informativo|no fail|non blocca|info\b/i.test(nome)
        if (!promette || dichiaraNonBlocca) continue
        const blocco = righe.slice(i, i + 14).join('\n')
        const fine = blocco.search(/\n\s*-\s*name:/)
        const passo = fine > 0 ? blocco.slice(0, fine) : blocco
        if (/continue-on-error:\s*true/.test(passo)) colpevoli.push(`${f} → «${nome}»`)
      }
    }
    expect(colpevoli, 'passi che promettono un controllo ma non possono fallire').toEqual([])
  })
})
