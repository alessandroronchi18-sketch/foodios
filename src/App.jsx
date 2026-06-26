// Foodos v1
import React, { useState, useEffect } from 'react'
import { useAuth } from './auth/useAuth'
import AuthPage, { ResetPasswordPage } from './auth/AuthPage'
import Dashboard from './Dashboard'
import Icon from './components/Icon'
import { lazyWithReload } from './lib/lazyWithReload'
// Lazy: AdminPage 2581 righe, OnboardingWizard usato solo first-login
const AdminPage = lazyWithReload(() => import('./admin/AdminPage'))
const OnboardingWizard = lazyWithReload(() => import('./onboarding/OnboardingWizard'))
// Lazy: pagine legali caricate solo se path corrispondente
const PrivacyPolicy = lazyWithReload(() => import('./pages/PrivacyPolicy'))
const TerminiServizio = lazyWithReload(() => import('./pages/TerminiServizio'))
const CookiePolicy = lazyWithReload(() => import('./pages/CookiePolicy'))
const Rimborsi = lazyWithReload(() => import('./pages/Rimborsi'))
const Contatti = lazyWithReload(() => import('./pages/Contatti'))
const ChiSiamo = lazyWithReload(() => import('./pages/ChiSiamo'))
// Lazy: pagine pubbliche caricate solo se path corrispondente
const LandingPage = lazyWithReload(() => import('./pages/LandingPage'))
const TvDashboard = lazyWithReload(() => import('./pages/TvDashboard'))
import Logo from './components/Logo'
import SplashScreen from './components/SplashScreen'
import { MfaChallenge } from './components/Mfa'
import AbbonamentoPanel from './components/AbbonamentoPanel'
import AppBanner from './components/AppBanner'
import FloatingActions from './components/FloatingActions'
import { supabase } from './lib/supabase'

function TrialScadutoPage({ org, onSignOut }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      padding: isMobile ? '24px 14px' : '40px 20px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 22 : 32 }}>
          <Logo size={isMobile ? 48 : 56} style={{ display: 'inline-block', borderRadius: 14, boxShadow: '0 10px 30px rgba(110,14,26,0.30)', marginBottom: 16 }} />
          <h1 style={{ color: '#1C0A0A', margin: '0 0 8px', fontSize: isMobile ? 22 : 26, letterSpacing: '-0.02em' }}>
            Prova gratuita terminata
          </h1>
          <p style={{ color: '#6B4C44', lineHeight: 1.6, fontSize: 14, margin: 0, padding: '0 4px' }}>
            Attiva un abbonamento per continuare ad accedere ai tuoi dati e alle analisi di {org?.nome || 'la tua attività'}.
          </p>
        </div>
        <AbbonamentoPanel org={org} isInline />
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={onSignOut} style={{
            padding: '12px 20px', minHeight: 44,
            background: 'transparent', color: '#6B4C44',
            border: '1px solid #E8DDD8', borderRadius: 10, fontSize: 14, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>Esci dall'account</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  // ATTENZIONE: TUTTI gli hook DEVONO stare qui in cima, prima di qualsiasi `return`
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

  // Onboarding wizard: mostra solo al primissimo login dopo la creazione
  // dell'organizzazione. Source-of-truth: organizations.onboarding_completato_at
  // (DB, sopravvive cambio device/browser/safari privata). localStorage e'
  // solo cache per evitare il flash al primo render.
  // Force re-show via ?onboarding=1 in URL (utile per QA / preview pitch).
  useEffect(() => {
    if (auth.orgId && onboardingVisto === null) {
      const forced = new URLSearchParams(window.location.search).get('onboarding') === '1'
      if (forced) { setOnboardingVisto(false); return }
      // 1) DB e' la verita': se onboarding_completato_at != null → skippa
      if (auth.org?.onboarding_completato_at) {
        setOnboardingVisto(true)
        try { localStorage.setItem(`onboarding_seen_${auth.orgId}`, '1') } catch {}
        return
      }
      // 2) Fallback localStorage per il flash iniziale (org ancora in caricamento)
      let visto = false
      try { visto = !!localStorage.getItem(`onboarding_seen_${auth.orgId}`) } catch {}
      setOnboardingVisto(visto)
    }
  }, [auth.orgId, auth.org?.onboarding_completato_at, onboardingVisto])

  async function completaOnboarding() {
    if (auth.orgId) {
      try { localStorage.setItem(`onboarding_seen_${auth.orgId}`, '1') } catch {}
      // Persisti su DB così il flag sopravvive cambio device/browser/privata.
      try {
        await supabase.from('organizations')
          .update({ onboarding_completato_at: new Date().toISOString() })
          .eq('id', auth.orgId)
        await auth.refreshOrg?.()
      } catch { /* fail-soft: localStorage già setato sopra */ }
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
    // try/catch: in Safari private mode getItem può lanciare durante il render,
    // crashando l'intera pagina (nessun error boundary su questo path in prod).
    let initialReferralCode = ''
    try { initialReferralCode = localStorage.getItem('referral_code_pendente') || '' } catch {}
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

  // Admin — gate per URL (/admin) + email match (auth.isAdmin = match con
  // VITE_ADMIN_EMAIL env, normalizzato lower+trim in useAuth.js).
  //   - su /admin → AdminPage se admin
  //   - altrove   → dashboard attività normale come qualsiasi titolare
  // NB: rimosso il fallback hardcoded email (audit 2026-06-14 PM: era info
  // disclosure nel bundle pubblico, e duplicava il check env). Se VITE_ADMIN_EMAIL
  // non è settato in Vercel, niente admin accessibile — fail-closed.
  if (path === '/admin') {
    if (auth.isAdmin) return sus(<AdminPage />)
    // Non admin che tenta /admin: silenzioso, fall-through verso Dashboard
    // dopo aver normalizzato l'URL (così il refresh non riporta su /admin).
    window.history.replaceState(null, '', '/')
  }

  // Profilo non caricabile (es. RLS recursion) — mostra errore invece di Dashboard rotto
  if (auth.profileError) {
    return (
      <div style={{ minHeight:'100vh', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ maxWidth:560, textAlign:'center', background:'#FFF', padding:'32px 40px', borderRadius:16, boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ marginBottom:14, color:'#B91C1C' }}><Icon name="warning" size={42} /></div>
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

  // Dipendente non ancora attivato (o disattivato) dal titolare: nessun accesso.
  if (auth.inAttesa) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAF7F5', padding:24 }}>
        <div style={{ maxWidth:440, width:'100%', background:'#FFF', border:'1px solid #E8DDD8', borderRadius:16, padding:'32px 28px', textAlign:'center', boxShadow:'0 10px 28px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#3F2D29', marginBottom:10 }}>Account in attesa di attivazione</div>
          <div style={{ fontSize:14, color:'#6B4C44', lineHeight:1.6, marginBottom:22 }}>
            Il tuo account è collegato alla tua azienda ma deve ancora essere <b>attivato dal titolare</b>.
            Appena ti abilita potrai accedere alle funzioni operative. Riprova più tardi.
          </div>
          <button onClick={() => auth.signOut()} style={{ padding:'12px 24px', background:'transparent', color:'#6B4C44', border:'1px solid #E8DDD8', borderRadius:10, fontSize:14, cursor:'pointer' }}>
            Esci
          </button>
        </div>
      </div>
    )
  }

  // Account cancellato dall'utente (soft-delete): l'org e' ripristinabile
  // entro 90 giorni. Blocchiamo l'accesso e mostriamo come riattivare.
  if (auth.orgCancellata) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAF7F5', padding:24 }}>
        <div style={{ maxWidth:480, width:'100%', background:'#FFF', border:'1px solid #FECACA', borderRadius:16, padding:'32px 28px', textAlign:'center', boxShadow:'0 10px 28px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#991B1B', marginBottom:12 }}>
            Questo account è stato cancellato
          </div>
          <div style={{ fontSize:14, color:'#6B4C44', lineHeight:1.6, marginBottom:22 }}>
            Hai cancellato l'account il {auth.org?.deleted_at ? new Date(auth.org.deleted_at).toLocaleDateString('it-IT') : '—'}. I dati sono conservati per <b>90 giorni</b>.
            <br/><br/>
            Hai cambiato idea? Scrivici a <a href="mailto:supporto@foodios.it?subject=Recupero%20account" style={{ color:'#6E0E1A', fontWeight:700 }}>supporto@foodios.it</a> e ripristiniamo tutto.
          </div>
          <button onClick={() => auth.signOut()} style={{ padding:'10px 20px', background:'transparent', color:'#6B4C44', border:'1px solid #E8DDD8', borderRadius:10, fontSize:13, cursor:'pointer' }}>
            Esci
          </button>
        </div>
      </div>
    )
  }

  // Titolare nuovo signup in attesa di approvazione admin (audit 2026-06-21).
  if (auth.orgInAttesa) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAF7F5', padding:24 }}>
        <div style={{ maxWidth:480, width:'100%', background:'#FFF', border:'1px solid #E8DDD8', borderRadius:16, padding:'36px 32px', textAlign:'center', boxShadow:'0 10px 28px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize:30, marginBottom:14 }}>⏳</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#3F2D29', marginBottom:12 }}>
            Stiamo verificando il tuo account
          </div>
          <div style={{ fontSize:14, color:'#6B4C44', lineHeight:1.6, marginBottom:24 }}>
            Per evitare scam e account fittizi, ogni nuova azienda viene controllata a mano. Di solito ci vogliono <strong>poche ore lavorative</strong>.
            <br/><br/>
            Riceverai un'email a <b>{auth.user?.email}</b> quando sarà tutto pronto.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, fontSize:12, color:'#94785D', marginBottom:24, background:'#FBF6F1', borderRadius:10, padding:'14px 16px', textAlign:'left' }}>
            <div><strong style={{ color:'#3F2D29' }}>Hai dubbi o vuoi velocizzare?</strong></div>
            <div>Scrivici a <a href="mailto:supporto@foodios.it" style={{ color:'#6E0E1A', fontWeight:700 }}>supporto@foodios.it</a> raccontando della tua attività.</div>
          </div>
          <button onClick={() => auth.signOut()} style={{ padding:'10px 20px', background:'transparent', color:'#6B4C44', border:'1px solid #E8DDD8', borderRadius:10, fontSize:13, cursor:'pointer' }}>
            Esci
          </button>
        </div>
      </div>
    )
  }

  // Trial scaduto
  if (auth.isTrialScaduto) return <TrialScadutoPage org={auth.org} onSignOut={auth.signOut} />

  // Onboarding al primo accesso — SOLO per il titolare. Il dipendente entra
  // direttamente nelle viste operative (l'azienda è già configurata dal titolare).
  if (auth.orgId && onboardingVisto === false && !auth.isDipendente) {
    return sus(
      <OnboardingWizard
        nomeAttivita={auth.org?.nome}
        tipoAttivita={auth.org?.tipo || 'pasticceria'}
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
      <FloatingActions />
    </>
  )
}
// test Lun 11 Mag 2026 23:41:57 HST
