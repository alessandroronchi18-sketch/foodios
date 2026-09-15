/**
 * Test di integrità del boot-splash inline in index.html.
 *
 * Il boot-splash è critico: se rotto, l'utente non vede caricamento e/o
 * pulsante Riprova in caso di app stuck. Questo test legge index.html e
 * verifica le invarianti chiave:
 *  - presenza nodo #boot-splash + #root nel body
 *  - presenza inline <script> che gestisce removal + recovery
 *  - wordmark "Foodos" e classe CSS .bs-wordmark
 *  - timeout recovery presente (>= 5s, evita rumore se React è lento ma OK)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

describe('index.html — boot-splash invariants', () => {
  it('contiene <div id="boot-splash">', () => {
    expect(html).toMatch(/<div id="boot-splash"/)
  })

  it('contiene <div id="root"></div> dopo il boot-splash', () => {
    const splashPos = html.indexOf('id="boot-splash"')
    const rootPos = html.indexOf('id="root"')
    expect(splashPos).toBeGreaterThan(0)
    expect(rootPos).toBeGreaterThan(splashPos) // root viene DOPO splash
  })

  it('mostra il wordmark "Foodos" (non FoodOS)', () => {
    expect(html).toMatch(/class="bs-wordmark">Foodos</)
    expect(html).not.toMatch(/class="bs-wordmark">FoodOS</)
  })

  it('contiene script inline per rimuovere boot-splash quando React monta', () => {
    expect(html).toMatch(/MutationObserver/)
    expect(html).toMatch(/app-mounted/)
  })

  it('contiene recovery: pulsante Riprova se app stuck', () => {
    expect(html).toMatch(/boot-recovery/)
    expect(html).toMatch(/Riprova/)
    // Recovery deve essere ragionevolmente lontano (>=8s) per non rumoreggiare
    // su connessioni lente normali.
    const m = html.match(/setTimeout\s*\(\s*showRecovery\s*,\s*(\d+)\s*\)/)
    expect(m).toBeTruthy()
    expect(Number(m[1])).toBeGreaterThanOrEqual(8000)
  })

  it('recovery: clear SW + cache + reload nel button onclick', () => {
    expect(html).toMatch(/serviceWorker\.getRegistrations/)
    expect(html).toMatch(/caches\.keys/)
    expect(html).toMatch(/window\.location\.reload/)
  })

  it('title della pagina è "Foodos" (no FoodOS)', () => {
    expect(html).toMatch(/<title>Foodos\b/)
    expect(html).not.toMatch(/<title>FoodOS\b/)
  })

  it('apple-mobile-web-app-title è Foodos (no FoodOS)', () => {
    expect(html).toMatch(/apple-mobile-web-app-title"\s+content="Foodos"/)
  })
})

// ─── Anticipare il collegamento al database ─────────────────────────────────
//
// Fra il momento in cui si tocca l'icona e quello in cui si vedono i propri
// dati c'è l'apertura di un collegamento sicuro verso Supabase: su una rete
// mobile, in negozio, sono due o trecento millisecondi. Succede a **ogni**
// apertura dell'app.
describe('il collegamento al database si apre in anticipo', () => {
  it('c\'è un preconnect, non solo un dns-prefetch', () => {
    // `dns-prefetch` risolve solo il nome; il pezzo lungo è il collegamento
    // sicuro. `preconnect` fa nome, collegamento e cifratura.
    expect(html).toMatch(/<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin>/)
  })

  it('e punta all\'indirizzo VERO, non al dominio principale', () => {
    // C'era `dns-prefetch` verso `supabase.co`, che non serviva a niente:
    // l'indirizzo vero è un sottodominio (`<progetto>.supabase.co`), e
    // risolvere il dominio principale non risolve il sottodominio — sono due
    // voci DNS diverse.
    expect(html).not.toMatch(/href="https:\/\/supabase\.co"/)
    expect(html).toMatch(/dns-prefetch" href="%VITE_SUPABASE_URL%"/)
  })

  it('l\'indirizzo si scrive da solo alla compilazione', () => {
    // Vite sostituisce %VITE_...% in index.html: non c'è un indirizzo
    // scritto a mano che può restare indietro quando si cambia progetto.
    expect(html).toContain('%VITE_SUPABASE_URL%')
  })

  it('gli altri servizi restano in dns-prefetch: non si aprono a ogni avvio', () => {
    // Anthropic e Stripe si contattano solo quando servono davvero: aprire
    // un collegamento sicuro verso di loro a ogni avvio costerebbe più di
    // quanto farebbe risparmiare.
    for (const h of ['api.anthropic.com', 'api.stripe.com', 'js.stripe.com']) {
      expect(html).toMatch(new RegExp(`dns-prefetch" href="https://${h.replace(/\./g, '\\.')}"`))
    }
  })
})
