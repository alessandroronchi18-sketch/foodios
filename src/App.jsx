// FoodOS v1
import React, { useState, useEffect } from 'react'
import { useAuth } from './auth/useAuth'
import AuthPage, { ResetPasswordPage } from './auth/AuthPage'
import Dashboard from './Dashboard'
import AdminPage from './admin/AdminPage'
import OnboardingWizard from './onboarding/OnboardingWizard'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TerminiServizio from './pages/TerminiServizio'
import LandingPage from './pages/LandingPage'
import FoodOSLogo from './components/FoodOSLogo'
import { supabase } from './lib/supabase'

function SplashScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 14,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <FoodOSLogo size={56} style={{ boxShadow: '0 8px 28px rgba(192,57,43,0.30)', borderRadius: 14 }} />
      <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500 }}>Caricamento…</div>
    </div>
  )
}

function TrialScadutoPage({ org }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
        <h1 style={{ color: '#1C0A0A', marginBottom: 12 }}>
          La tua prova gratuita è terminata
        </h1>
        <p style={{ color: '#6B4C44', lineHeight: 1.7, marginBottom: 32 }}>
          Hai usato FoodOS per 3 mesi. Per continuare ad accedere ai tuoi dati
          e alle analisi, attiva il tuo abbonamento.
        </p>
        <div style={{
          background: '#FFF',
          border: '2px solid #C0392B',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#C0392B' }}>€39/mese</div>
          <div style={{ fontSize: 13, color: '#6B4C44', marginTop: 4 }}>
            Piano Base · disdici quando vuoi
          </div>
        </div>
        <a
          href={`mailto:support@foodios.it?subject=Attivazione%20abbonamento%20-%20${encodeURIComponent(org?.nome || '')}`}
          style={{
            display: 'inline-block',
            padding: '14px 32px',
            background: '#C0392B',
            color: '#FFF',
            borderRadius: 10,
            fontWeight: 800,
            textDecoration: 'none',
            fontSize: 15,
          }}
        >
          Contattaci per attivare →
        </a>
        <p style={{ fontSize: 11, color: '#9C7B76', marginTop: 16 }}>
          I tuoi dati sono al sicuro e ti aspettano.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  // Splash solo al primissimo caricamento — non a ogni eventuale loading transitorio
  const [primoCaricamento, setPrimoCaricamento] = useState(true)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Static pages — no auth needed
  if (path === '/privacy') return <PrivacyPolicy />
  if (path === '/termini') return <TerminiServizio />

  // Intercetta /r/CODICE — salva codice in localStorage e pulisce l'URL
  const referralMatch = path.match(/^\/r\/([A-Za-z0-9]+)$/)
  if (referralMatch) {
    localStorage.setItem('referral_code_pendente', referralMatch[1].toUpperCase())
    window.history.replaceState(null, '', '/')
    setPath('/')
  }

  const auth = useAuth()
  const [onboardingVisto, setOnboardingVisto] = useState(null)
  const [showResetPassword, setShowResetPassword] = useState(false)

  // Intercetta PASSWORD_RECOVERY prima di qualsiasi altra logica di routing
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Controlla localStorage quando l'orgId è disponibile
  useEffect(() => {
    if (auth.orgId && onboardingVisto === null) {
      const visto = !!localStorage.getItem(`onboarding_seen_${auth.orgId}`)
      setOnboardingVisto(visto)
    }
  }, [auth.orgId, onboardingVisto])

  function completaOnboarding() {
    if (auth.orgId) localStorage.setItem(`onboarding_seen_${auth.orgId}`, '1')
    setOnboardingVisto(true)
  }

  // Reset password — intercetta PRIMA del check auth.loading/auth.user
  if (showResetPassword) {
    return <ResetPasswordPage onDone={() => setShowResetPassword(false)} />
  }

  // Sblocca primoCaricamento quando auth ha finito la prima volta
  if (!auth.loading && primoCaricamento) {
    // Defer setState fuori dal render
    Promise.resolve().then(() => setPrimoCaricamento(false))
  }
  // Splash solo al primissimo caricamento. Se ricarica auth dopo (improbabile con
  // useAuth.js fix su TOKEN_REFRESHED), Dashboard resta montato e mantiene lo stato.
  if (auth.loading && primoCaricamento) return <SplashScreen />

  // Non loggato
  if (!auth.user) {
    const initialReferralCode = localStorage.getItem('referral_code_pendente') || ''
    if (path === '/login' || path === '/register') {
      return <AuthPage onSignIn={auth.signIn} onSignUp={auth.signUp} initialReferralCode={initialReferralCode} />
    }
    return (
      <LandingPage
        onLogin={() => { window.history.pushState(null, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')) }}
        onRegister={() => { window.history.pushState(null, '', '/register'); window.dispatchEvent(new PopStateEvent('popstate')) }}
      />
    )
  }

  // Admin — fallback se VITE_ADMIN_EMAIL non è configurato in Vercel
  if (auth.isAdmin || (!auth.orgId && !auth.org && auth.user?.email === 'alessandroar@maradeiboschi.com')) return <AdminPage />

  // Profilo non caricabile (es. RLS recursion) — mostra errore invece di Dashboard rotto
  if (auth.profileError) {
    return (
      <div style={{ minHeight:'100vh', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ maxWidth:560, textAlign:'center', background:'#FFF', padding:'32px 40px', borderRadius:16, boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize:42, marginBottom:14 }}>⚠️</div>
          <h1 style={{ color:'#1C0A0A', marginBottom:10, fontSize:22 }}>Impossibile caricare il profilo</h1>
          <p style={{ color:'#6B4C44', lineHeight:1.6, marginBottom:18, fontSize:14 }}>
            Errore database: <code style={{ background:'#FEF2F2', padding:'2px 6px', borderRadius:4, fontSize:12, color:'#B91C1C' }}>{auth.profileError.code || 'unknown'}</code>
          </p>
          <p style={{ color:'#6B4C44', lineHeight:1.6, marginBottom:24, fontSize:13 }}>
            {auth.profileError.message || 'Errore sconosciuto'}
          </p>
          <button onClick={() => window.location.reload()} style={{ padding:'12px 24px', background:'#C0392B', color:'#FFF', border:'none', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', marginRight:10 }}>
            Riprova
          </button>
          <button onClick={() => auth.signOut()} style={{ padding:'12px 24px', background:'transparent', color:'#6B4C44', border:'1px solid #E8DDD8', borderRadius:10, fontSize:14, cursor:'pointer' }}>
            Esci
          </button>
        </div>
      </div>
    )
  }

  // Trial scaduto
  if (auth.isTrialScaduto) return <TrialScadutoPage org={auth.org} />

  // Onboarding al primo accesso
  if (auth.orgId && onboardingVisto === false) {
    return (
      <OnboardingWizard
        nomeAttivita={auth.org?.nome}
        orgId={auth.orgId}
        onComplete={completaOnboarding}
        onSkip={completaOnboarding}
      />
    )
  }

  // Dashboard
  return (
    <Dashboard
      auth={auth}
      orgId={auth.orgId}
      sedeId={auth.sedeId}
      sedi={auth.sedi}
      sedeAttiva={auth.sedeAttiva}
      onSetSedeAttiva={auth.setSedeAttiva}
      nomeAttivita={auth.org?.nome || 'La mia attività'}
      tipoAttivita={auth.org?.tipo || 'bar'}
      piano={auth.org?.piano || 'trial'}
      isTrialAttivo={auth.isTrialAttivo}
      onSignOut={auth.signOut}
    />
  )
}
// test Lun 11 Mag 2026 23:41:57 HST
