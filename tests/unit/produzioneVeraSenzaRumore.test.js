// Quello che si vede solo aprendo la produzione vera.
//
// Il 16/09/2026, aprendo https://foodos-rose.vercel.app in Chromium come lo
// aprirebbe un cliente nuovo, sono usciti due difetti che nessun test poteva
// vedere — perché tutti e due riguardano cose che stanno FUORI dal progetto:
// un file su un server di Google e una variabile d'ambiente su Vercel.
//
// 1. **Un file di font precaricato con l'indirizzo scritto a mano.** Google
//    cambia i nomi di quei file quando aggiorna il font, e quello rispondeva
//    404: ogni visita sprecava una richiesta, scriveva un errore in console, e
//    soprattutto NON precaricava niente — cioè il problema che doveva
//    risolvere (il testo che appare in ritardo) era tornato in silenzio.
//
// 2. **Il DSN di Sentry era rimasto il segnaposto** di `.env.example`. La
//    variabile esisteva, quindi il controllo `!!` la accettava: Sentry si
//    accendeva, non riusciva a mandare niente, e **gli errori dei clienti non
//    li vedeva nessuno** — con l'aggravante che dal pannello sembrava tutto a
//    posto. Un segnaposto non è una configurazione.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const HTML = readFileSync(join(RADICE, 'index.html'), 'utf8')
const MAIN = readFileSync(join(RADICE, 'src', 'main.jsx'), 'utf8')

describe('nessun indirizzo con l\'impronta scritto a mano', () => {
  it('non si precarica un file di font per nome esatto', () => {
    // Un indirizzo con l'impronta dentro, scritto a mano, marcisce sempre: il
    // giorno che cambia si scopre solo guardando la console di un browser.
    expect(HTML).not.toMatch(/rel="preload"[^>]*fonts\.gstatic\.com/s)
  })

  it('ma i font si chiedono lo stesso, per nome', () => {
    // Non si è tolto il font: si è tolto il modo fragile di chiederlo.
    expect(HTML).toMatch(/fonts\.googleapis\.com\/css2\?family=Inter/)
  })

  it('e il preconnect resta, perché quello non marcisce', () => {
    expect(HTML).toMatch(/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/)
  })
})

describe('il controllo degli errori è acceso solo se è vero', () => {
  // Il controllo com'è scritto nel programma.
  const dsnValido = (dsn) => {
    const s = String(dsn || '').trim()
    if (!s) return false
    if (/KEY@|oXXX|PROJECT_ID|<|>/.test(s)) return false
    return /^https:\/\/[0-9a-f]+@[^/]+\/\d+$/i.test(s)
  }

  it('il segnaposto di .env.example non conta come configurazione', () => {
    // È esattamente quello che c'era in produzione.
    expect(dsnValido('https://KEY@oXXX.ingest.sentry.io/PROJECT_ID')).toBe(false)
  })

  it('un DSN vero sì', () => {
    expect(dsnValido('https://abc123def456@o4507.ingest.sentry.io/4508')).toBe(true)
  })

  it('vuoto o assente no', () => {
    expect(dsnValido('')).toBe(false)
    expect(dsnValido(undefined)).toBe(false)
    expect(dsnValido('   ')).toBe(false)
  })

  it('e nemmeno qualcosa che gli somiglia ma non lo è', () => {
    expect(dsnValido('inserisci-qui-il-dsn')).toBe(false)
    expect(dsnValido('https://<KEY>@sentry.io/1')).toBe(false)
    expect(dsnValido('http://abc@sentry.io/1'), 'http non è https').toBe(false)
  })

  it('il programma usa questo controllo, non il semplice «esiste»', () => {
    expect(MAIN).not.toMatch(/enabled: import\.meta\.env\.PROD && !!import\.meta\.env\.VITE_SENTRY_DSN/)
    // Il DSN passa da una costante gia' filtrata, e `enabled` guarda quella.
    expect(MAIN).toMatch(/const DSN = dsnValido\(import\.meta\.env\.VITE_SENTRY_DSN\)/)
    expect(MAIN).toMatch(/enabled: import\.meta\.env\.PROD && !!DSN/)
  })

  // ── Spegnerlo non basta: il DSN sbagliato non va proprio passato ──────
  //
  // 16/09/2026, entrando in produzione con l'account del titolare: la console
  // stampava «Invalid Sentry Dsn» a ogni caricamento della pagina. La guardia
  // c'era gia' e funzionava — Sentry restava spento — ma il DSN segnaposto gli
  // veniva passato lo stesso, e Sentry lo analizza PRIMA di guardare
  // `enabled`. Quindi: nessun errore raccolto (giusto) piu' un errore
  // stampato a ogni avvio (sbagliato), proprio nella console dove si va a
  // cercare cosa non funziona.
  //
  // La correzione di due giorni prima aveva sistemato meta' del problema. Qui
  // si controlla l'altra meta'.
  it('un DSN che non passa la guardia non arriva proprio a Sentry', () => {
    // La chiamata non deve piu' leggere la variabile d'ambiente diretta:
    // deve usare la costante filtrata.
    expect(MAIN).not.toMatch(/dsn: import\.meta\.env\.VITE_SENTRY_DSN/)
    expect(MAIN).toMatch(/dsn: DSN,/)
  })

  it('la costante è filtrata prima di init, non dopo', () => {
    const posDsn = MAIN.indexOf('const DSN = dsnValido(')
    const posInit = MAIN.indexOf('Sentry.init({')
    expect(posDsn, 'la costante DSN deve esistere').toBeGreaterThan(-1)
    expect(posInit, 'Sentry.init deve esistere').toBeGreaterThan(-1)
    expect(posDsn).toBeLessThan(posInit)
  })

  it('un segnaposto diventa «niente DSN», non «DSN sbagliato»', () => {
    // La stessa espressione che usa il programma, applicata al valore vero
    // che c'era in produzione.
    const segnaposto = 'https://KEY@oXXX.ingest.sentry.io/PROJECT_ID'
    const DSN = dsnValido(segnaposto) ? segnaposto : undefined
    expect(DSN).toBeUndefined()
  })
})

describe('le chiavi nuove di Supabase non finiscono nei log', () => {
  // Supabase sta sostituendo le chiavi in formato JWT (`eyJ...`) con le nuove
  // `sb_secret_...` e `sb_publishable_...`. Il giorno in cui si passa alle
  // nuove, una chiave che apre tutto il database non deve poter uscire in
  // chiaro dentro una segnalazione d'errore — sarebbe la seconda volta, dopo
  // quella finita su GitHub.
  const LOGGER = readFileSync(join(RADICE, 'src', 'lib', 'logger.js'), 'utf8')

  it('la segnalazione degli errori nasconde la chiave segreta nuova', () => {
    expect(MAIN).toMatch(/sb_secret_\[\\w-\]\{10,\}/)
  })

  it('e anche quella pubblica', () => {
    expect(MAIN).toMatch(/sb_publishable_\[\\w-\]\{10,\}/)
  })

  it('il registro degli eventi le nasconde tutte e due', () => {
    expect(LOGGER).toMatch(/sb_secret_/)
    expect(LOGGER).toMatch(/sb_publishable_/)
  })

  it('e continua a nascondere il formato vecchio, che resta in giro', () => {
    expect(MAIN).toMatch(/eyJ\[\\w-\]\{20,\}/)
    expect(LOGGER).toMatch(/eyJ/)
  })
})
