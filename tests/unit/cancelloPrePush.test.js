// Il cancello prima della pubblicazione blocca davvero? Tutti e quattro i passi.
//
// Il 14/09/2026 due pubblicazioni sono passate da qui **con il build rotto**:
// la riga era `npm run build --silent 2>&1 | tail -5`, e in una catena di
// comandi conta l'esito dell'**ultimo** — `tail` riesce sempre. Il cancello
// diceva «ok», Vercel bocciava il deploy in quattro secondi, e la produzione
// restava tre commit indietro senza nessun segnale.
//
// Il 16/09/2026 lo stesso identico difetto si è ripetuto fuori dal cancello
// (l'uscita mandata dentro `tail` da chi lanciava il comando a mano), e tre
// pubblicazioni sono state date per riuscite mentre erano state bloccate.
// Due volte lo stesso errore in tre settimane: qui ci va una prova.
//
// Il modo di provarlo: si prende il cancello vero — quello scritto dentro
// `scripts/install-hooks.sh`, che è il file versionato — e lo si fa girare
// con comandi finti (`npx`, `npm`, `node`) che falliscono uno alla volta.
// Se il passo blocca, il cancello esce con un codice diverso da zero.
//
// Audit RIGHELLO, 16/09/2026.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INSTALLATORE = readFileSync(join(RADICE, 'scripts', 'install-hooks.sh'), 'utf8')

// Il cancello sta dentro l'installatore, fra i due marcatori.
function testoDelCancello () {
  const apre = INSTALLATORE.indexOf('<<\'HOOK_EOF\'')
  const inizio = INSTALLATORE.indexOf('\n', apre) + 1
  const fine = INSTALLATORE.indexOf('\nHOOK_EOF', inizio)
  if (apre < 0 || fine < 0) throw new Error('in install-hooks.sh non si trova più il testo del cancello')
  return INSTALLATORE.slice(inizio, fine)
}

let banco
beforeAll(() => {
  banco = mkdtempSync(join(tmpdir(), 'cancello-'))
  // Comandi finti: fanno finta di essere lint, test, build e controllo
  // migrazioni. Quale deve fallire lo dice la variabile FALLISCI.
  const finti = {
    npx: `#!/bin/sh
case "$1" in
  eslint) [ "$FALLISCI" = "lint" ] && exit 1 ;;
esac
exit 0
`,
    npm: `#!/bin/sh
case "$1" in
  test) [ "$FALLISCI" = "test" ] && exit 1 ;;
  run)
    if [ "$2" = "build" ]; then
      # Un build vero stampa decine di righe: è il motivo per cui qualcuno
      # aveva messo \`| tail -5\`.
      i=0; while [ $i -lt 30 ]; do echo "riga di build $i"; i=$((i+1)); done
      if [ "$FALLISCI" = "build" ]; then echo "errore: cricchetto dei token"; exit 1; fi
    fi ;;
esac
exit 0
`,
    node: `#!/bin/sh
case "$1" in
  scripts/check-migrazioni-applicate.mjs) [ "$FALLISCI" = "migrazioni" ] && exit 1 ;;
esac
exit 0
`,
  }
  for (const [nome, corpo] of Object.entries(finti)) {
    const p = join(banco, nome)
    writeFileSync(p, corpo)
    chmodSync(p, 0o755)
  }
})
afterAll(() => { if (banco && existsSync(banco)) rmSync(banco, { recursive: true, force: true }) })

// Fa girare il cancello e torna il codice di uscita.
function lancia (testo, { fallisci = '', ref = 'refs/heads/main' } = {}) {
  const p = join(banco, 'pre-push')
  writeFileSync(p, testo)
  chmodSync(p, 0o755)
  try {
    execFileSync('bash', [p], {
      cwd: RADICE,
      input: `${ref} 1111111111111111111111111111111111111111 ${ref} 0000000000000000000000000000000000000000\n`,
      env: { ...process.env, PATH: `${banco}:${process.env.PATH}`, FALLISCI: fallisci },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return 0
  } catch (e) {
    return e.status ?? -1
  }
}

describe('il cancello prima di pubblicare', () => {
  const CANCELLO = testoDelCancello()

  it('il testo del cancello si trova davvero dentro install-hooks.sh', () => {
    // Prova di controllo sul righello: se il ritaglio fallisse, tutte le
    // prove qui sotto girerebbero su una stringa vuota — e una stringa vuota
    // non blocca niente, quindi «cade», e sembrerebbero tutte vere.
    expect(CANCELLO.length).toBeGreaterThan(500)
    expect(CANCELLO).toContain('[1/4] ESLint')
    expect(CANCELLO).toContain('[4/4] Migrazioni applicate')
  })

  it('quando tutto è a posto, lascia passare', () => {
    expect(lancia(CANCELLO)).toBe(0)
  })

  it('[1/4] un errore di ESLint blocca', () => {
    expect(lancia(CANCELLO, { fallisci: 'lint' })).not.toBe(0)
  })

  it('[2/4] un test fallito blocca', () => {
    expect(lancia(CANCELLO, { fallisci: 'test' })).not.toBe(0)
  })

  it('[3/4] un build fallito blocca — è quello che il 14/09 non bloccava', () => {
    expect(lancia(CANCELLO, { fallisci: 'build' })).not.toBe(0)
  })

  it('[4/4] una migrazione mancante blocca', () => {
    expect(lancia(CANCELLO, { fallisci: 'migrazioni' })).not.toBe(0)
  })

  it('un ramo personale passa senza controlli: il controllo lo fa la CI', () => {
    expect(lancia(CANCELLO, { fallisci: 'build', ref: 'refs/heads/feat/qualcosa' })).toBe(0)
  })
})

describe('il difetto del 14/09, rimesso apposta', () => {
  const CANCELLO = testoDelCancello()

  it('senza `set -o pipefail` il build rotto passa: era esattamente così', () => {
    // Si toglie la sola riga che tiene in piedi il passo 3 e si rilancia.
    // Se questa prova diventa verde con la riga tolta... vuol dire che la
    // riga non serve. Deve restare rossa: cioè il cancello deve tornare 0.
    const senzaRete = CANCELLO.replace(/^set -o pipefail\n/m, '')
    expect(senzaRete, 'la riga `set -o pipefail` non è più nel cancello').not.toBe(CANCELLO)
    expect(lancia(senzaRete, { fallisci: 'build' })).toBe(0)
  })

  it('e con la riga al suo posto, lo stesso build rotto viene fermato', () => {
    expect(lancia(CANCELLO, { fallisci: 'build' })).not.toBe(0)
  })
})

describe('il cancello installato è quello scritto nel repo', () => {
  it('.git/hooks/pre-push coincide con install-hooks.sh', () => {
    const installato = join(RADICE, '.git', 'hooks', 'pre-push')
    if (!existsSync(installato)) {
      // Su una macchina appena clonata il hook lo mette `npm install`.
      expect(INSTALLATORE).toContain('postinstall')
      return
    }
    const a = readFileSync(installato, 'utf8').trim()
    expect(a).toBe(testoDelCancello().trim())
  })
})
