// FoodOS v1
import React, { useState, useEffect } from 'react'
import { useAuth } from './auth/useAuth'
import AuthPage, { ResetPasswordPage } from './auth/AuthPage'
import Dashboard from './Dashboard'
// Lazy: AdminPage 2581 righe, OnboardingWizard usato solo first-login
const AdminPage = React.lazy(() => import('./admin/AdminPage'))
const OnboardingWizard = React.lazy(() => import('./onboarding/OnboardingWizard'))
// Lazy: pagine legali caricate solo se path corrispondente
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'))
const TerminiServizio = React.lazy(() => import('./pages/TerminiServizio'))
const CookiePolicy = React.lazy(() => import('./pages/CookiePolicy'))
const Rimborsi = React.lazy(() => import('./pages/Rimborsi'))
const Contatti = React.lazy(() => import('./pages/Contatti'))
const ChiSiamo = React.lazy(() => import('./pages/ChiSiamo'))
// Lazy: pagine pubbliche caricate solo se path corrispondente
const LandingPage = React.lazy(() => import('./pages/LandingPage'))
const TvDashboard = React.lazy(() => import('./pages/TvDashboard'))
import Logo from './components/Logo'
import { MfaChallenge } from './components/Mfa'
import AbbonamentoPanel from './components/AbbonamentoPanel'
import AppBanner from './components/AppBanner'
import FeedbackButton from './components/FeedbackButton'
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
      <Logo size={56} style={{ boxShadow: '0 10px 30px rgba(110,14,26,0.30)', borderRadius: 14 }} />
      <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500 }}>Caricamento…</div>
    </div>
  )
}

function TrialScadutoPage({ org, onSignOut }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      padding: '40px 20px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Logo size={56} style={{ display: 'inline-block', borderRadius: 14, boxShadow: '0 10px 30px rgba(110,14,26,0.30)', marginBottom: 16 }} />
          <h1 style={{ color: '#1C0A0A', margin: '0 0 8px', fontSize: 26, letterSpacing: '-0.02em' }}>
            Prova gratuita terminata
          </h1>
          <p style={{ color: '#6B4C44', lineHeight: 1.6, fontSize: 14, margin: 0 }}>
            Attiva un abbonamento per continuare ad accedere ai tuoi dati e alle analisi di {org?.nome || 'la tua attività'}.
          </p>
        </div>
        <AbbonamentoPanel org={org} isInline />
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={onSignOut} style={{
            padding: '10px 20px', background: 'transparent', color: '#6B4C44',
            border: '1px solid #E8DDD8', borderRadius: 10, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>Esci dall'account</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  // ⚠️ TUTTI gli hook DEVONO stare qui in cima, prima di qualsiasi `return`
  // condizionale. Le pagine statiche (/privacy, /termini, /tv) tornavano prima
  // di useAuth(): navigando da/verso quelle pagine il numero di hook cambiava
  // tra un render e l'altro → "Rendered fewer hooks than expected" (crash).
  const [path, setPath] = useState(window.location.pathname)
  // Splash solo al primissimo caricamento — non a ogni eventuale loading transitorio
  const [primoCaricamento, setPrimoCaricamento] = useState(true)
  const auth = useAuth()
  const [onboardingVisto, setOnboardingVisto] = useState(null)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [mfaRequired, setMfaRequired] = useState(false)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Intercetta /r/CODICE — salva codice referral in localStorage e pulisce l'URL.
  // In un effect (non durante il render) per non chiamare setState in fase di render.
  useEffect(() => {
    const m = path.match(/^\/r\/([A-Za-z0-9]+)$/)
    if (m) {
      try { localStorage.setItem('referral_code_pendente', m[1].toUpperCase()) } catch {}
      window.history.replaceState(null, '', '/')
      setPath('/')
    }
  }, [path])

  // MFA: se l'utente ha un fattore TOTP verificato (aal2) ma la sessione corrente
  // è ferma a aal1 (solo password), serve completare il challenge prima di proseguire.
  useEffect(() => {
    if (!auth.user) { setMfaRequired(false); return }
    let cancelled = false
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (cancelled || !data) return
      const needsMfa = data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
      setMfaRequired(!!needsMfa)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [auth.user?.id])

  // Intercetta PASSWORD_RECOVERY prima di qualsiasi altra logica di routing
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Onboarding wizard: mostra solo al primissimo login (orgId nuovo non
  // ancora visto) o se l'utente vuole rivederlo (?onboarding=1 in URL).
  // localStorage `onboarding_seen_<orgId>` traccia il completamento.
  // Riattivato il 2026-06-01 con redesign demo-data path (skip-friendly).
  useEffect(() => {
    if (auth.orgId && onboardingVisto === null) {
      const forced = new URLSearchParams(window.location.search).get('onboarding') === '1'
      if (forced) { setOnboardingVisto(false); return }
      let visto = false
      try { visto = !!localStorage.getItem(`onboarding_seen_${auth.orgId}`) } catch {}
      setOnboardingVisto(visto)
    }
  }, [auth.orgId, onboardingVisto])

  function completaOnboarding() {
    if (auth.orgId) {
      try { localStorage.setItem(`onboarding_seen_${auth.orgId}`, '1') } catch {}
    }
    setOnboardingVisto(true)
  }

  // ─── Da qui in poi SOLO return condizionali: nessun hook sotto questa riga. ───

  // Helper: wrappa qualsiasi componente lazy con Suspense + SplashScreen
  // fallback. Tutti i lazy load passano da qui per UX coerente.
  const sus = (el) => <React.Suspense fallback={<SplashScreen/>}>{el}</React.Suspense>

  // Static pages — no auth needed (tutte lazy)
  if (path === '/privacy') return sus(<PrivacyPolicy />)
  if (path === '/termini') return sus(<TerminiServizio />)
  if (path === '/cookie') return sus(<CookiePolicy />)
  if (path === '/rimborsi') return sus(<Rimborsi />)
  if (path === '/contatti') return sus(<Contatti />)
  if (path === '/chi-siamo') return sus(<ChiSiamo />)
  if (path === '/tv') return sus(<TvDashboard />)

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

  // MFA challenge: utente con password ok ma 2FA non ancora completato in questa sessione
  if (auth.user && mfaRequired) {
    return (
      <MfaChallenge
        onComplete={() => setMfaRequired(false)}
        onCancel={async () => { await auth.signOut(); setMfaRequired(false) }}
      />
    )
  }

  // Non loggato
  if (!auth.user) {
    const initialReferralCode = localStorage.getItem('referral_code_pendente') || ''
    if (path === '/login' || path === '/register') {
      return <AuthPage onSignIn={auth.signIn} onSignUp={auth.signUp} initialReferralCode={initialReferralCode} initialMode={path === '/register' ? 'registrati' : 'login'} />
    }
    return sus(
      <LandingPage
        onLogin={() => { window.history.pushState(null, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')) }}
        onRegister={() => { window.history.pushState(null, '', '/register'); window.dispatchEvent(new PopStateEvent('popstate')) }}
      />
    )
  }

  // Admin — fallback se VITE_ADMIN_EMAIL non è configurato in Vercel
  if (auth.isAdmin || (!auth.orgId && !auth.org && auth.user?.email === 'alessandroar@maradeiboschi.com')) return sus(<AdminPage />)

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
          <button onClick={() => window.location.reload()} style={{ padding:'12px 24px', background:'#6E0E1A', color:'#FFF', border:'none', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', marginRight:10 }}>
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
  if (auth.isTrialScaduto) return <TrialScadutoPage org={auth.org} onSignOut={auth.signOut} />

  // Onboarding al primo accesso
  if (auth.orgId && onboardingVisto === false) {
    return sus(
      <OnboardingWizard
        nomeAttivita={auth.org?.nome}
        orgId={auth.orgId}
        onComplete={completaOnboarding}
        onSkip={completaOnboarding}
      />
    )
  }

  // Dashboard — wrap con banner globale (annunci admin) e bottone feedback.
  return (
    <>
      <AppBanner />
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
      <FeedbackButton />
    </>
  )
}
// test Lun 11 Mag 2026 23:41:57 HST
