import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { validaSessionFingerprint, resetSessionFingerprint } from '../lib/sessionGuard'
import { startIdleTimeout, clearIdleTimestamp } from '../lib/idleTimeout'
import * as Sentry from '@sentry/react'

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000 // 8 ore di inattività → auto-logout

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [org, setOrg]         = useState(null)
  const [sedi, setSedi]       = useState([])
  const [sedeAttiva, setSedeAttivaState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)
  // Ref per tracciare l'ultimo userId profilato: usato per evitare che un
  // SIGNED_IN ripetuto (browser tab visibility change) ri-chiami loadProfile
  // resettando sedeAttiva al default.
  const lastProfiledUserId = useRef(null)

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 8000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // UA binding: se il fingerprint del browser è cambiato dall'ultimo login,
        // forziamo logout per proteggere da session hijacking.
        const check = await validaSessionFingerprint(async () => {
          console.warn('fingerprint sessione cambiato: forced sign-out')
          await supabase.auth.signOut()
        })
        if (!check.ok) { setLoading(false); return }
      }
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id, session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED / USER_UPDATED non devono ricaricare il profilo:
      // altrimenti loadProfile→setLoading(true)→App mostra Splash→Dashboard smontato (perdita stato view)
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) setUser(session.user)
        return
      }
      // SIGNED_IN puo' essere triggerato anche dal recupero della sessione
      // quando la tab torna in foreground dopo essere stata sospesa (browser
      // background). In quel caso il profilo e' GIA' caricato e ri-chiamare
      // loadProfile resetterebbe sedeAttiva al default (e l'utente vedrebbe
      // saltare la sede su quella di default es. "de gasperi" ogni volta che
      // cambia desktop). Saltiamo se lo userId e' lo stesso gia' profilato.
      if (event === 'SIGNED_IN' && session?.user?.id && session.user.id === lastProfiledUserId.current) {
        setUser(session.user)
        return
      }
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id, session.user)
      } else {
        lastProfiledUserId.current = null
        setProfile(null)
        setOrg(null)
        setSedi([])
        setSedeAttivaState(null)
        setLoading(false)
      }
    })

    return () => { subscription.unsubscribe(); clearTimeout(safetyTimeout) }
  }, [])

  // Idle-timeout: dopo 8h senza interazione, logout automatico.
  // Si attiva solo quando c'è un utente loggato; viene ripulito al cambio utente.
  useEffect(() => {
    if (!user) return
    const cleanup = startIdleTimeout({
      timeoutMs: IDLE_TIMEOUT_MS,
      onTimeout: async () => {
        try {
          console.warn('Sessione scaduta per inattività — logout automatico')
          clearIdleTimestamp()
          await supabase.auth.signOut()
        } catch (e) { /* ignore */ }
      },
    })
    return cleanup
  }, [user?.id])

  async function loadProfile(userId, userObj) {
    setLoading(true)
    setProfileError(null)
    lastProfiledUserId.current = userId  // marker per evitare reload su SIGNED_IN ripetuti
    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (profErr) throw profErr
      // Niente log di email/userId in production: leakable via console di shared computer.
      if (import.meta.env.DEV) {
        console.log('loadProfile OK — userId:', userId?.slice(0, 8), 'orgId:', prof?.organization_id?.slice(0, 8));
      }
      // Imposta utente per Sentry (id e org_id come tag — niente email in chiaro)
      Sentry.setUser({ id: userId })
      Sentry.setTag('organization_id', prof?.organization_id || 'unknown')
      setProfile(prof)

      if (prof?.organization_id) {
        const [{ data: orgData }, { data: sediData }] = await Promise.all([
          supabase.from('organizations').select('*').eq('id', prof.organization_id).single(),
          supabase.from('sedi').select('*').eq('organization_id', prof.organization_id).eq('attiva', true).order('is_default', { ascending: false })
        ])

        setOrg(orgData)
        setSedi(sediData || [])

        // try/catch: in Safari private mode / storage disabilitato getItem lancia.
        // Senza guard l'eccezione risalirebbe al catch di loadProfile e bloccherebbe
        // l'accesso (profileError) pur con sessione e profilo validi.
        let savedId = null
        try { savedId = localStorage.getItem(`sede_attiva_${prof.organization_id}`) } catch {}
        const defaultSede = (sediData || []).find(s => s.id === savedId)
                         || (sediData || []).find(s => s.is_default)
                         || (sediData || [])[0]
                         || null
        setSedeAttivaState(defaultSede)

        // Applica codice referral se presente e non ancora usato
        if (orgData && !orgData.referral_code_usato) {
          const codice = localStorage.getItem('referral_code_pendente')
            || userObj?.user_metadata?.codice_invito
          if (codice) {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (token) {
              fetch('/api/referral', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ codice }),
              }).then(r => r.json()).then(data => {
                if (data.success) {
                  localStorage.removeItem('referral_code_pendente')
                  setOrg(prev => ({ ...prev, referral_code_usato: codice }))
                }
              }).catch(console.error)
            }
          }
        }
      }
    } catch (err) {
      console.error('loadProfile error:', err)
      setProfileError(err)
    } finally {
      setLoading(false)
    }
  }

  function setSedeAttiva(sede) {
    setSedeAttivaState(sede)
    if (sede?.id && profile?.organization_id) {
      try {
        localStorage.setItem(`sede_attiva_${profile.organization_id}`, sede.id)
      } catch { /* Safari private / quota piena: in-memory only ok */ }
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(tradurciErrore(error.message))
  }

  async function signUp(email, password, meta) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: 'https://foodios-rose.vercel.app',
      }
    })
    if (error) {
      // Alcune config restituiscono un errore esplicito sull'email già usata.
      if (/already registered|already.*exist|user.*exist/i.test(error.message || '')) {
        throw new Error('EMAIL_ESISTENTE')
      }
      // Rate limit del provider email di Supabase (non è il blocco anti-brute-force
      // del login, che è client-side e solo per il login). Messaggio chiaro per il signup.
      if (/rate limit|too many|after \d+ seconds|email.*limit/i.test(error.message || '')) {
        throw new Error('Troppe registrazioni in poco tempo (limite temporaneo del provider email). Attendi qualche minuto e riprova — l\'account potrebbe già essere stato creato: prova ad accedere.')
      }
      throw new Error(tradurciErrore(error.message))
    }
    // Anti-enumeration di Supabase: per un'email GIÀ registrata e confermata, signUp
    // ritorna un finto successo con identities=[] (nessun errore). Lo intercettiamo
    // per mostrare "sei già registrato → accedi / recupera password".
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('EMAIL_ESISTENTE')
    }
  }

  async function refreshOrg() {
    const orgId = profile?.organization_id
    if (!orgId) return
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()
    if (orgData) setOrg(orgData)
  }

  async function signOut() {
    resetSessionFingerprint()
    clearIdleTimestamp()
    Sentry.setUser(null)
    // Pulizia stato app-specifico: su dispositivo condiviso (cassa banco) il
    // login successivo erediterebbe sede attiva, lockout brute-force, last
    // activity, referral pending. Audit 2026-06-17 MEDIUM.
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k) continue
        if (
          k.startsWith('foodios') ||
          k.startsWith('sede_attiva') ||
          k.startsWith('pasticceria') ||
          k === 'referral_code_pendente'
        ) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => { try { localStorage.removeItem(k) } catch {} })
    } catch {}
    await supabase.auth.signOut()
  }

  function tradurciErrore(msg) {
    if (msg.includes('Invalid login')) return 'Email o password non corretti'
    if (msg.includes('Email not confirmed')) return 'Controlla la tua email per confermare la registrazione'
    if (msg.includes('already registered')) return 'Questa email è già registrata'
    if (msg.includes('Password should be')) return 'La password deve essere di almeno 8 caratteri'
    if (msg.includes('rate limit')) return 'Troppi tentativi. Aspetta qualche minuto e riprova.'
    return 'Si è verificato un errore. Riprova.'
  }

  const now = new Date()
  const trialEnd = org?.trial_ends_at ? new Date(org.trial_ends_at) : null
  const isPagante      = org?.approvato === true
  const isTrialAttivo  = org && trialEnd && trialEnd > now   // indipendente da approvato
  const isTrialScaduto = org && !isPagante && (!trialEnd || trialEnd <= now)
  // Match case-insensitive: Supabase normalizza email a lowercase ma la env
  // var potrebbe avere casing diverso → trim+lower per essere robusti.
  const isAdmin = (user?.email || '').toLowerCase().trim() ===
                  (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
  // Ruolo dell'utente nell'organizzazione: 'titolare' (default) o 'dipendente'.
  // Il dipendente ha accesso solo alle viste operative (vedi Dashboard).
  const ruolo          = profile?.ruolo || 'titolare'
  const isDipendente   = ruolo === 'dipendente'
  // Dipendente non ancora attivato (o disattivato) dal titolare: accesso negato a
  // livello DB (get_user_org_id ritorna null). L'app mostra una schermata "in attesa".
  const inAttesa       = isDipendente && profile?.approvato !== true
  // Audit 2026-06-21: titolari nuovi devono essere approvati manualmente dall'admin
  // per evitare scam. La colonna organizations.in_attesa=true blocca l'accesso.
  // Admin e dipendenti (gestiti via flag profile.approvato) sono esclusi dal gate.
  const orgInAttesa    = !isAdmin && !isDipendente && org?.in_attesa === true

  return {
    user,
    profile,
    org,
    sedi,
    sedeAttiva,
    setSedeAttiva,
    loading,
    profileError,
    signIn,
    signUp,
    signOut,
    refreshOrg,
    isTrialAttivo,
    isTrialScaduto,
    isPagante,
    isAdmin,
    ruolo,
    isDipendente,
    inAttesa,
    orgInAttesa,
    orgId: profile?.organization_id || null,
    sedeId: sedeAttiva?.id || null,
  }
}
