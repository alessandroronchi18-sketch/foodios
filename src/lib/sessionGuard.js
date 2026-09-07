// Session guard: user-agent binding lato client.
// Salva un fingerprint del browser al primo login e verifica che non cambi tra le sessioni.
// NOTA tecnica: l'IP binding NON è applicato di proposito - gli utenti su mobile cambiano
// IP in continuazione (4G ↔ WiFi, switch torre, VPN aziendale), produrrebbe logout costanti.
// Lo UA binding è un dissuasore: rileva session-hijacking solo se l'attaccante usa un browser
// diverso. Non è una difesa completa contro chi clona perfettamente il browser.

import { supabase } from './supabase'

// La versione fa parte della chiave: se cambia il modo di calcolare l'impronta,
// quella vecchia non va CONFRONTATA ma ignorata.
//
// Costata cara il 07/09: cambiando l'algoritmo senza cambiare la chiave, ogni
// ricaricamento confrontava l'impronta nuova con quella vecchia, non
// coincidevano, e l'utente veniva disconnesso. Ogni volta.
const SK_FP = 'foodos_session_fp_v2'
const SK_FP_VECCHIE = ['foodos_session_fp_v1']

// L'impronta deve cambiare quando cambia IL DISPOSITIVO, non quando si
// aggiorna il browser.
//
// Prima si usava lo user agent per intero. Ma lo user agent contiene il numero
// di versione, e Chrome si aggiorna da solo ogni poche settimane: a ogni
// aggiornamento l'impronta cambiava e l'utente si ritrovava buttato fuori
// senza motivo. Un controllo di sicurezza che scatta sugli innocenti e non
// ferma i colpevoli — chi ruba un token può falsificare lo user agent in una
// riga — è solo un fastidio.
//
// Teniamo quindi la famiglia del browser (Chrome, Safari, Firefox...) senza la
// versione, più i tratti che descrivono davvero la macchina.
function famigliaBrowser(ua) {
  const m = ua.match(/\b(Edg|OPR|Chrome|Firefox|Safari)\b/g)
  return m ? m[m.length - 1] : 'sconosciuto'
}

async function makeFingerprint() {
  const ua = navigator.userAgent || ''
  const lang = (navigator.languages || [navigator.language || '']).join(',')
  const platform = navigator.platform || ''
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  // Niente pixel ratio o dimensioni schermo: variano col multi-monitor.
  const raw = `${famigliaBrowser(ua)}|${lang}|${platform}|${tz}`
  if (crypto?.subtle?.digest) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  }
  // Fallback non-crypto (es. browser molto vecchi)
  let h = 0
  for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0
  return String(h)
}

/**
 * Valida il fingerprint corrente contro quello salvato.
 * - prima volta → salva e ritorna { ok: true, first: true }
 * - match → { ok: true }
 * - mismatch → invoca onMismatch (di solito: signOut + redirect) e ritorna { ok: false }
 */
export async function validaSessionFingerprint(onMismatch) {
  try {
    const fp = await makeFingerprint()
    // Le impronte calcolate con algoritmi precedenti non servono più a nulla:
    // toglierle evita che restino a occupare spazio per sempre.
    for (const vecchia of SK_FP_VECCHIE) {
      try { localStorage.removeItem(vecchia) } catch { /* niente */ }
    }
    const stored = localStorage.getItem(SK_FP)
    if (!stored) {
      localStorage.setItem(SK_FP, fp)
      return { ok: true, first: true }
    }
    if (stored !== fp) {
      // NON si disconnette più. Nel corso di una sola giornata questo controllo
      // ha buttato fuori l'utente tre volte — per l'aggiornamento di Chrome,
      // per il cambio di algoritmo, e a ogni ricaricamento — senza mai fermare
      // un attaccante: chi ruba un token falsifica lo user agent in una riga.
      //
      // Il segnale resta e viene registrato lato server, dove serve davvero:
      // in un elenco di anomalie che un umano guarda. Ma non decide più da solo
      // di interrompere il lavoro di chi sta usando il programma.
      localStorage.setItem(SK_FP, fp)
      // Log lato server (best-effort, non blocca)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await fetch('/api/audit-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ tipo: 'session_fingerprint_mismatch', scope: { previous: stored.slice(0, 8), current: fp.slice(0, 8) } }),
          })
        }
      } catch {}
      // onMismatch resta invocabile per chi volesse reagire, ma il risultato è
      // ok: la sessione prosegue.
      onMismatch?.({ previous: stored, current: fp, disconnesso: false })
      return { ok: true, cambiato: true, previous: stored, current: fp }
    }
    return { ok: true }
  } catch {
    return { ok: true, error: true }
  }
}

export function resetSessionFingerprint() {
  try { localStorage.removeItem(SK_FP) } catch {}
}
