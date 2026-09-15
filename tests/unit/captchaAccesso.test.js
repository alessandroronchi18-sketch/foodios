// Il controllo "sei una persona?" davanti ad accesso e registrazione.
//
// Il titolare ha chiesto di valutare reCAPTCHA. Non si può usare, e non è una
// preferenza di gusto: Supabase accetta solo hCaptcha e Turnstile. Il motivo è
// architetturale — quando il browser fa l'accesso, la richiesta va da Foodos
// DIRETTAMENTE a Supabase e non passa mai dai nostri server, quindi un
// reCAPTCHA (che dovremmo verificare noi) resterebbe un disegno aggirabile
// chiamando l'API di Supabase da un terminale.
//
// Questi test tengono ferme le due cose che contano: che il captcha sia
// SPENTO finché non c'è la chiave (altrimenti si resta fuori tutti), e che
// quando è acceso il codice arrivi davvero dentro la chiamata di accesso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

const CAP = leggi('src', 'auth', 'Captcha.jsx')
const AUTH = leggi('src', 'auth', 'AuthPage.jsx')
const USEAUTH = leggi('src', 'auth', 'useAuth.js')

describe('senza chiave non cambia niente', () => {
  it('il widget non si disegna e non blocca il bottone', () => {
    expect(CAP).toMatch(/export const CAPTCHA_ATTIVO = SITE_KEY\.length > 0/)
    expect(CAP).toMatch(/if \(!CAPTCHA_ATTIVO\) return null/)
    expect(CAP).toMatch(/pronto: !CAPTCHA_ATTIVO \|\| rotto \|\| !!token/)
  })

  it('se Cloudflare non risponde si entra lo stesso', () => {
    // Meglio un accesso senza controllo che un cliente chiuso fuori perché un
    // servizio di terzi è giù.
    expect(CAP).toMatch(/'error-callback'/)
    expect(CAP).toMatch(/setRotto\(true\)/)
  })

  it('il codice non è scritto nel sorgente: arriva da una variabile', () => {
    expect(CAP).toMatch(/import\.meta\.env\?\.VITE_TURNSTILE_SITE_KEY/)
    expect(CAP).not.toMatch(/0x[0-9A-Fa-f]{20,}/)
  })
})

describe('quando è acceso, il codice arriva dove serve', () => {
  it('accesso e registrazione lo passano a Supabase', () => {
    expect(USEAUTH).toMatch(/async function signIn\(email, password, captchaToken\)/)
    expect(USEAUTH).toMatch(/\.\.\.\(captchaToken \? \{ options: \{ captchaToken \} \} : \{\}\)/)
    expect(USEAUTH).toMatch(/async function signUp\(email, password, captchaToken, meta\)/)
  })

  it('anche il recupero password, che è un modulo che manda email', () => {
    expect(AUTH).toMatch(/resetPasswordForEmail\(resetEmail, \{[\s\S]{0,400}captchaToken/)
  })

  it('dopo un tentativo fallito se ne chiede uno nuovo', () => {
    // Un codice Turnstile vale una volta sola: senza il reset, il secondo
    // "Accedi" verrebbe rifiutato e sembrerebbe un guasto nostro.
    const dopoLogin = AUTH.slice(AUTH.indexOf('async function handleLogin'))
    expect(dopoLogin.slice(0, 2200)).toMatch(/resetCaptcha\(\)/)
  })

  it('i tre bottoni aspettano che il codice ci sia', () => {
    expect(AUTH).toMatch(/disabled=\{loading \|\| !captchaPronto\}/)
    expect(AUTH).toMatch(/disabled=\{loading \|\| !regStep2Valid\(\) \|\| !captchaPronto\}/)
  })
})

describe('le regole del sito lasciano passare il riquadro', () => {
  const VERCEL = leggi('vercel.json')

  it('lo script e il riquadro di Cloudflare sono ammessi', () => {
    // Con `frame-src 'none'` il riquadro non comparirebbe e nessuno saprebbe
    // perché: la pagina non dà errore, il codice semplicemente non arriva mai.
    expect(VERCEL).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/)
    expect(VERCEL).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/)
    expect(VERCEL).toMatch(/connect-src[^;]*https:\/\/challenges\.cloudflare\.com/)
    expect(VERCEL).not.toMatch(/frame-src 'none'/)
  })

  it('e nient\'altro: la porta si apre solo per quello', () => {
    const csp = JSON.parse(VERCEL).headers
      .flatMap(h => h.headers)
      .find(h => h.key === 'Content-Security-Policy').value
    expect(csp).toMatch(/frame-ancestors 'none'/)
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/base-uri 'self'/)
  })
})
