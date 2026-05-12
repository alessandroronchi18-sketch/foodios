// FoodOS v1
import React, { useState, useEffect } from 'react'
import { useAuth } from './auth/useAuth'
import AuthPage, { ResetPasswordPage } from './auth/AuthPage'
import Dashboard from './Dashboard'
import AdminPage from './admin/AdminPage'
import OnboardingWizard from './onboarding/OnboardingWizard'
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
      <div style={{
        width: 52, height: 52,
        background: 'linear-gradient(135deg, #C0392B, #E74C3C)',
        borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26,
        boxShadow: '0 8px 24px rgba(192,57,43,0.25)',
      }}>🍰</div>
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
  useState(() => {
    if (auth.orgId && onboardingVisto === null) {
      const visto = !!localStorage.getItem(`onboarding_seen_${auth.orgId}`)
      setOnboardingVisto(visto)
    }
  })

  function completaOnboarding() {
    if (auth.orgId) localStorage.setItem(`onboarding_seen_${auth.orgId}`, '1')
    setOnboardingVisto(true)
  }

  // Reset password — intercetta PRIMA del check auth.loading/auth.user
  if (showResetPassword) {
    return <ResetPasswordPage onDone={() => setShowResetPassword(false)} />
  }

  if (auth.loading) return <SplashScreen />

  // Non loggato
  if (!auth.user) {
    return <AuthPage onSignIn={auth.signIn} onSignUp={auth.signUp} />
  }

  // Admin
  if (auth.isAdmin) return <AdminPage />

  // Trial scaduto
  if (auth.isTrialScaduto) return <TrialScadutoPage org={auth.org} />

  // Onboarding al primo accesso
  if (auth.orgId && onboardingVisto === false) {
    return (
      <OnboardingWizard
        nomeAttivita={auth.org?.nome}
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
