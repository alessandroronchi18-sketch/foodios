// Wrapper unificato per chiamate alle Vercel Functions autenticate
// (/api/admin, /api/feedback, /api/ai, ecc.).
//
// Cosa fa diverso da fetch():
// 1. Inietta automaticamente Authorization: Bearer <token> dalla sessione Supabase.
// 2. Su 401 (sessione scaduta), prova un refresh token + retry UNA volta.
// 3. Se il refresh fallisce, fa signOut() + redirect a /login.
// 4. Throw con messaggi parlanti per 4xx/5xx, restituisce Response per 2xx.
//
// USAGE:
//   import { apiFetch } from '../lib/apiFetch'
//   const res = await apiFetch('/api/admin?action=stats')
//   const data = await res.json()
//
//   // POST
//   const res = await apiFetch('/api/admin', {
//     method: 'POST',
//     body: JSON.stringify({ tipo: 'invia_email', ... })
//   })

import { supabase } from './supabase'

let _redirecting = false  // evita redirect doppi se più chiamate 401 in parallelo

async function redirectToLogin() {
  if (_redirecting) return
  _redirecting = true
  try { await supabase.auth.signOut() } catch { /* ignore */ }
  // Replace e non push: l'utente non deve poter "indietro" alla pagina autenticata.
  window.location.replace('/login?reason=session_expired')
}

async function getCurrentToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

async function tryRefreshToken() {
  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) return null
    return data?.session?.access_token || null
  } catch {
    return null
  }
}

export async function apiFetch(path, opts = {}) {
  let token = await getCurrentToken()
  if (!token) {
    // Sessione assente in partenza: vai a login.
    redirectToLogin()
    throw new Error('Sessione non valida - login richiesto')
  }

  const callWithToken = (tok) => fetch(path, {
    ...opts,
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
      'Authorization': `Bearer ${tok}`,
    },
  })

  let res = await callWithToken(token)

  // 401 → prova refresh + retry una volta. Se ancora 401 → logout.
  if (res.status === 401) {
    const refreshed = await tryRefreshToken()
    if (!refreshed) {
      redirectToLogin()
      throw new Error('Sessione scaduta')
    }
    res = await callWithToken(refreshed)
    if (res.status === 401) {
      // Anche dopo refresh: la sessione e' davvero invalida (utente revocato,
      // pwd cambiata, account disattivato lato admin). Logout pulito.
      redirectToLogin()
      throw new Error('Sessione non più valida')
    }
  }

  if (!res.ok) {
    let msg = `Errore ${res.status}`
    try {
      const data = await res.clone().json()
      if (data?.error) msg = data.error + (data.reason ? ` (${data.reason})` : '')
    } catch { /* not json */ }
    const e = new Error(msg)
    e.status = res.status
    throw e
  }

  return res
}

// Convenience helpers
export async function apiGet(path) {
  const res = await apiFetch(path)
  return res.json()
}
export async function apiPost(path, body) {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
  return res.json()
}
