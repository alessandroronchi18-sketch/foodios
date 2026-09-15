// L'audit del login del 15/09/2026.
//
// Tre difetti veri, tutti della stessa famiglia: il server credeva a quello
// che gli diceva il browser.
//
//   1. Chiunque poteva chiudere fuori chiunque. `/api/login-guard` accettava
//      da un anonimo "l'accesso di questo indirizzo è fallito" e faceva
//      crescere l'attesa su QUELL'INDIRIZZO. Provato in produzione: cinque
//      curl senza credenziali e il vero titolare si becca un 423.
//   2. Il passo di verifica del telefono in registrazione non poteva riuscire
//      mai, e nel fallire diceva se un numero è già registrato.
//   3. Il codice a 4 cifre del dipendente si poteva provare all'infinito.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { attesaDopo } from '../../api/login-guard.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

const GUARD = leggi('api', 'login-guard.js')
const AUTH = leggi('src', 'auth', 'AuthPage.jsx')
const USEAUTH = leggi('src', 'auth', 'useAuth.js')

describe('nessuno può chiudere fuori un altro', () => {
  it('l\'attesa si calcola sui fallimenti di QUESTO indirizzo IP', () => {
    // Era `fails.length` sull'email da sola: chi dichiarava fallimenti per
    // conto di un altro glieli faceva pagare a lui.
    expect(GUARD).toMatch(/attesaDopo\(perIp\.length\)/)
    expect(GUARD).not.toMatch(/const fails = rows\.filter/)
  })

  it('il conteggio per email resta, ma serve solo ad avvisare', () => {
    expect(GUARD).toMatch(/const newFailCount = perMail\.length \+ 1/)
    // Il ramo che avvisa non blocca: manda una mail e va avanti.
    const iAvviso = GUARD.indexOf('newFailCount === SOGLIA_AVVISO')
    expect(iAvviso).toBeGreaterThan(-1)
    expect(GUARD.slice(iAvviso, iAvviso + 600)).not.toMatch(/\b423\b/)
  })

  it('la risposta non dice più quanti errori ha collezionato un indirizzo', () => {
    // Era un modo per chiedere, senza nessuna credenziale, quanti tentativi
    // falliti ha sull'account l'indirizzo di un'altra persona.
    expect(GUARD).not.toMatch(/tentativiFalliti: fails\.length/)
    expect(GUARD).not.toMatch(/fails_recenti: newFailCount/)
  })

  it('la lettura separa i due conteggi e regge la tabella assente', () => {
    expect(GUARD).toMatch(/async function recentFails\(supabase, email, ip\)/)
    expect(GUARD).toMatch(/perIp: \[\], perMail: \[\], available: false/)
  })
})

describe('la scala dell\'attesa non è cambiata per chi sbaglia in buona fede', () => {
  it('i primi tre errori non costano niente', () => {
    expect(attesaDopo(0)).toBe(0)
    expect(attesaDopo(3)).toBe(0)
  })

  it('poi cresce, e si ferma a un quarto d\'ora', () => {
    expect(attesaDopo(4)).toBe(5)
    expect(attesaDopo(5)).toBe(15)
    expect(attesaDopo(9)).toBe(300)
    expect(attesaDopo(10)).toBe(900)
    expect(attesaDopo(500)).toBe(900)
  })

  it('un programma che tira a indovinare fa meno di 20 prove in un quarto d\'ora', () => {
    let secondi = 0, prove = 0
    while (secondi < 15 * 60) { prove++; secondi += attesaDopo(prove) }
    expect(prove).toBeLessThan(20)
  })
})

describe('il blocco tenuto nel browser non c\'è più', () => {
  it('niente contatori in localStorage sulla pagina di accesso', () => {
    // Si aggirava svuotando i dati del sito, e intanto chiudeva fuori sul
    // serio il titolare che aveva appena ricordato la password.
    expect(AUTH).not.toMatch(/foodos-login-attempts/)
    expect(AUTH).not.toMatch(/foodos-lockout-until/)
    expect(AUTH).not.toMatch(/lockoutUntil/)
    expect(AUTH).not.toMatch(/setLoginAttempts/)
  })
})

describe('il passo SMS che non poteva funzionare', () => {
  it('non si chiede più un codice via SMS in registrazione', () => {
    // `signInWithOtp({ phone, shouldCreateUser: false })` su un numero che non
    // è ancora di nessun utente — cioè sempre, in registrazione — fallisce per
    // costruzione. E il modo in cui falliva diceva se un numero è registrato.
    expect(AUTH).not.toMatch(/signInWithOtp/)
    expect(AUTH).not.toMatch(/verifyOtp/)
    expect(AUTH).not.toMatch(/regStep === 1\.5/)
  })

  it('il telefono si raccoglie ancora, ma non si finge di averlo verificato', () => {
    expect(AUTH).toMatch(/telefono: telNorm/)
    expect(AUTH).toMatch(/telefono_verificato: false/)
  })

  it('la pagina non promette più un SMS che non arriva', () => {
    expect(AUTH).not.toMatch(/Ti invieremo un codice SMS/)
  })
})

describe('gli indirizzi di ritorno non sono più inchiodati a Vercel', () => {
  it('la conferma della registrazione torna dove ti sei registrato', () => {
    expect(USEAUTH).not.toMatch(/emailRedirectTo: 'https:\/\/foodos-rose/)
    expect(USEAUTH).toMatch(/emailRedirectTo: typeof window !== 'undefined' \? window\.location\.origin/)
  })

  it('il link per rifare la password pure', () => {
    expect(AUTH).not.toMatch(/redirectTo: 'https:\/\/foodos-rose/)
    expect(AUTH).toMatch(/redirectTo: typeof window !== 'undefined' \? window\.location\.origin/)
  })
})

describe('il recupero password non dice chi è cliente', () => {
  it('la risposta è la stessa che l\'indirizzo esista o no', () => {
    const iMsg = AUTH.indexOf('Se ${resetEmail} ha un account')
    expect(iMsg).toBeGreaterThan(-1)
    // Compare due volte: nel ramo riuscito e in quello fallito.
    expect(AUTH.split('ha un account').length - 1).toBeGreaterThanOrEqual(2)
    expect(AUTH).not.toMatch(/Link di reset inviato a/)
  })
})

describe('il codice a 4 cifre del dipendente', () => {
  const DIR = join(RADICE, 'supabase', 'migrations')
  const MIGR = readFileSync(
    join(DIR, readdirSync(DIR).find(f => f.includes('codice_dipendente_attesa'))), 'utf8')

  it('conta i tentativi sbagliati', () => {
    expect(MIGR).toMatch(/create table if not exists public\.dipendente_codice_tentativi/)
    expect(MIGR).toMatch(/riuscito = false/)
  })

  it('l\'attesa cresce e si ferma a due minuti', () => {
    expect(MIGR).toMatch(/when n <= 3 then 0/)
    expect(MIGR).toMatch(/else 120/)
  })

  it('non blocca il tablet: aspetta e basta', () => {
    // Il tablet è condiviso da tutto il banco. Un muro dopo 5 errori
    // fermerebbe il laboratorio in piena produzione, e basterebbe un
    // dispettoso che digita cinque codici a caso.
    expect(MIGR).toMatch(/troppi_tentativi/)
    expect(MIGR).not.toMatch(/bloccato_fino|lockout_until/)
  })

  it('il codice giusto azzera l\'attesa', () => {
    expect(MIGR).toMatch(/delete from public\.dipendente_codice_tentativi\s*\n\s*where auth_user_id = v_uid and riuscito = false/)
  })

  it('la tabella dei tentativi non si tocca dal browser', () => {
    expect(MIGR).toMatch(/revoke all on public\.dipendente_codice_tentativi from anon, authenticated/)
    expect(MIGR).toMatch(/enable row level security/)
  })

  it('la schermata del tablet sa dire quanto aspettare', () => {
    const S = leggi('src', 'auth', 'SelezionaDipendente.jsx')
    expect(S).toMatch(/res\.error === 'troppi_tentativi'/)
    expect(S).toMatch(/Aspetta \$\{s\} second/)
  })
})
