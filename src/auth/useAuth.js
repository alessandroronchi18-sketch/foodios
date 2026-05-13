import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [org, setOrg]         = useState(null)
  const [sedi, setSedi]       = useState([])
  const [sedeAttiva, setSedeAttivaState] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id, session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id, session.user)
      } else {
        setProfile(null)
        setOrg(null)
        setSedi([])
        setSedeAttivaState(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId, userObj) {
    setLoading(true)
    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (profErr) throw profErr
      setProfile(prof)

      if (prof?.organization_id) {
        const [{ data: orgData }, { data: sediData }] = await Promise.all([
          supabase.from('organizations').select('*').eq('id', prof.organization_id).single(),
          supabase.from('sedi').select('*').eq('organization_id', prof.organization_id).eq('attiva', true).order('is_default', { ascending: false })
        ])

        setOrg(orgData)
        setSedi(sediData || [])

        const savedId = localStorage.getItem(`sede_attiva_${prof.organization_id}`)
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
    } finally {
      setLoading(false)
    }
  }

  function setSedeAttiva(sede) {
    setSedeAttivaState(sede)
    if (profile?.organization_id) {
      localStorage.setItem(`sede_attiva_${profile.organization_id}`, sede.id)
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(tradurciErrore(error.message))
  }

  async function signUp(email, password, meta) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: 'https://foodios-rose.vercel.app',
      }
    })
    if (error) throw new Error(tradurciErrore(error.message))
  }

  async function signOut() {
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
  const isAdmin        = user?.email === import.meta.env.VITE_ADMIN_EMAIL

  return {
    user,
    profile,
    org,
    sedi,
    sedeAttiva,
    setSedeAttiva,
    loading,
    signIn,
    signUp,
    signOut,
    isTrialAttivo,
    isTrialScaduto,
    isPagante,
    isAdmin,
    orgId: profile?.organization_id || null,
    sedeId: sedeAttiva?.id || null,
  }
}
