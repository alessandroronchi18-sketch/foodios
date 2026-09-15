// Il controllo "sei una persona?" davanti ad accesso e registrazione.
//
// ── Perché Turnstile e non reCAPTCHA ───────────────────────────────────────
//
// La domanda naturale è "mettiamo reCAPTCHA". Non si può, e non è una
// preferenza: **Supabase accetta solo hCaptcha e Cloudflare Turnstile**
// (supabase.com/docs/guides/auth/auth-captcha). Il motivo è architetturale:
// quando il browser fa `signInWithPassword`, la richiesta va da Foodos
// DIRETTAMENTE a Supabase e non passa mai dai nostri server. Un reCAPTCHA lo
// dovremmo verificare noi, su un endpoint nostro, che in quella chiamata non
// c'è: il controllo resterebbe un disegno sullo schermo, aggirabile chiamando
// l'API di Supabase da un terminale. Con Turnstile invece il codice viaggia
// dentro la chiamata di login e **lo verifica Supabase**, quindi vale anche
// per chi salta la nostra pagina.
//
// Fra i due supportati, Turnstile: è gratis senza limiti, nella quasi totalità
// dei casi è invisibile (niente semafori da cliccare a un pasticcere alle
// cinque del mattino) e non installa cookie di profilazione — cosa che per un
// prodotto italiano con una privacy policy conta.
//
// ── Come si accende ────────────────────────────────────────────────────────
//
// Finché `VITE_TURNSTILE_SITE_KEY` è vuota questo componente non disegna
// niente e non blocca niente: l'accesso funziona esattamente come prima.
// Per accenderlo servono tre cose, in quest'ordine:
//
//   1. Cloudflare → Turnstile → crea un sito. Si ottengono una chiave
//      pubblica (site key) e una segreta.
//   2. Supabase → Authentication → Attack Protection → CAPTCHA: provider
//      "Turnstile", incolla la chiave segreta, salva.
//   3. Vercel → variabile `VITE_TURNSTILE_SITE_KEY` con la chiave pubblica,
//      poi un nuovo deploy.
//
// L'ordine conta: dal momento in cui il punto 2 è attivo, Supabase RIFIUTA
// ogni accesso che arriva senza codice. Quindi il punto 3 deve essere già
// pronto, o si resta fuori tutti. In caso di guaio, si spegne il CAPTCHA in
// Supabase e si torna come prima.

import React, { useCallback, useEffect, useRef, useState } from 'react'

const SITE_KEY = (import.meta.env?.VITE_TURNSTILE_SITE_KEY || '').trim()
export const CAPTCHA_ATTIVO = SITE_KEY.length > 0

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let caricamento = null

function caricaScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve()
  if (caricamento) return caricamento
  caricamento = new Promise((risolvi, rifiuta) => {
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.defer = true
    s.onload = () => risolvi()
    s.onerror = () => { caricamento = null; rifiuta(new Error('turnstile non raggiungibile')) }
    document.head.appendChild(s)
  })
  return caricamento
}

/**
 * Restituisce { token, pronto, reset, Widget }.
 *
 * `pronto` è true quando si può premere il bottone: senza chiave è sempre
 * true, con la chiave diventa true quando il codice è stato ottenuto. Se
 * Cloudflare non risponde, torna true lo stesso: meglio un accesso senza
 * controllo che un cliente chiuso fuori perché un servizio esterno è giù.
 */
export function useCaptcha() {
  const [token, setToken] = useState(null)
  const [rotto, setRotto] = useState(false)
  const widgetId = useRef(null)
  const box = useRef(null)

  const reset = useCallback(() => {
    setToken(null)
    try {
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.reset(widgetId.current)
      }
    } catch { /* il widget se n'è già andato */ }
  }, [])

  useEffect(() => {
    if (!CAPTCHA_ATTIVO) return
    let vivo = true
    caricaScript()
      .then(() => {
        if (!vivo || !box.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          language: 'it',
          appearance: 'interaction-only',  // si vede solo se serve davvero
          callback: (t) => vivo && setToken(t),
          'expired-callback': () => vivo && setToken(null),
          'error-callback': () => { if (vivo) { setRotto(true); setToken(null) } },
        })
      })
      .catch(() => { if (vivo) setRotto(true) })
    return () => {
      vivo = false
      try {
        if (widgetId.current !== null && window.turnstile) {
          window.turnstile.remove(widgetId.current)
        }
      } catch { /* niente da togliere */ }
      widgetId.current = null
    }
  }, [])

  const Widget = useCallback(({ style }) => {
    if (!CAPTCHA_ATTIVO) return null
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, ...style }}>
        <div ref={box} />
      </div>
    )
  }, [])

  return {
    token,
    // Senza chiave, o se Cloudflare è irraggiungibile, non si blocca nessuno.
    pronto: !CAPTCHA_ATTIVO || rotto || !!token,
    reset,
    Widget,
  }
}
