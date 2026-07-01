// EmployeeLoginPad — login dipendente da tablet condiviso.
//
// Flusso:
//   1) Step 1: input email dipendente (autocomplete su localStorage per device)
//   2) Step 2: tastierino XL 6 cifre → il codice e' la password Supabase del dipendente
//   3) supabase.auth.signInWithPassword({email, password: codice}) diretto
//      → sessione JWT Supabase nativa (refresh token, cookie)
//   4) chiama RPC dipendente_marca_login per tracciare last_login_at + IP
//   5) callback onSuccess() ← AuthPage rifara' il session-check e passera' alla Dashboard
//
// Auto-logout: gestito a livello di sessione (short session lifetime + inattivita').

import React, { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import Icon from '../components/Icon'

const BRAND = T.brand || '#6E0E1A'

const CODICE_LEN = 6
const EMAIL_KEY = 'foodios_dip_last_email'   // ricorda l'ultima email usata SU QUESTO device
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmployeeLoginPad({ onBack, onSuccess }) {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(EMAIL_KEY) || '' } catch { return '' }
  })
  const [step, setStep] = useState(() => {
    try { return localStorage.getItem(EMAIL_KEY) ? 'codice' : 'email' } catch { return 'email' }
  })
  const [codice, setCodice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submitCodice = useCallback(async (c) => {
    if (submitting) return
    const em = email.trim().toLowerCase()
    if (!EMAIL_RX.test(em)) { setError('Email non valida'); return }
    if (!c || c.length !== CODICE_LEN) return
    setSubmitting(true)
    setError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: c })
      if (error || !data?.session) {
        const msg = (error?.message || '').toLowerCase()
        // Supabase ritorna "Invalid login credentials" per email/password sbagliati
        // e "Email not confirmed" per account non attivi.
        if (msg.includes('invalid') || msg.includes('credentials')) {
          setError('Email o codice non corretti. Chiedi al titolare di verificare.')
        } else if (msg.includes('confirm')) {
          setError('Il tuo accesso non e\' ancora attivo. Chiedi al titolare.')
        } else if (msg.includes('rate') || msg.includes('too many')) {
          setError('Troppi tentativi. Attendi qualche minuto.')
        } else {
          setError('Accesso non riuscito. Riprova o chiedi al titolare.')
        }
        setCodice('')
        return
      }
      // Successo: memorizza l'email (ricordami su questo device) + marca login.
      try { localStorage.setItem(EMAIL_KEY, em) } catch { /* noop */ }
      try { await supabase.rpc('dipendente_marca_login', { p_ip: null }) } catch { /* best-effort */ }
      onSuccess?.()
    } catch (e) {
      setError('Errore di connessione. Verifica internet.')
      setCodice('')
    } finally {
      setSubmitting(false)
    }
  }, [email, submitting, onSuccess])

  function pressDigit(d) {
    if (submitting) return
    setError(null)
    const next = (codice + String(d)).slice(0, CODICE_LEN)
    setCodice(next)
    if (next.length === CODICE_LEN) {
      // Piccolo debounce per far vedere il 6° pallino
      setTimeout(() => submitCodice(next), 150)
    }
  }
  function pressBack() {
    if (submitting) return
    setCodice(c => c.slice(0, -1))
    setError(null)
  }

  useEffect(() => {
    if (step !== 'codice') return
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Enter' && codice.length === CODICE_LEN) submitCodice(codice)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, codice, submitting])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0B0408 0%, #1C0A0A 100%)',
      color: '#FFF',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 800,
          letterSpacing: '-0.02em', color: '#FFF',
        }}>Foodos · accesso dipendente</h1>
        <p style={{ marginTop: 6, marginBottom: 28, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          {step === 'email' ? 'La tua email di lavoro' : 'Il tuo codice a 6 cifre'}
        </p>

        {step === 'email' && (
          <div>
            <input
              type="email"
              value={email}
              autoFocus
              autoComplete="username"
              autoCapitalize="off"
              placeholder="es. mario.laboratorio@…"
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && EMAIL_RX.test(email.trim().toLowerCase())) {
                  setStep('codice')
                }
              }}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '14px 16px', minHeight: 52,
                fontSize: 16, fontWeight: 600,
                borderRadius: 12, border: '1px solid rgba(255,255,255,0.20)',
                background: 'rgba(255,255,255,0.08)', color: '#FFF',
                outline: 'none', textAlign: 'center',
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
              L'email te l'ha comunicata il titolare quando ha creato il tuo accesso.
            </div>
            <button
              disabled={!EMAIL_RX.test(email.trim().toLowerCase())}
              onClick={() => setStep('codice')}
              style={{
                marginTop: 20, width: '100%', padding: '14px 16px', minHeight: 52,
                background: EMAIL_RX.test(email.trim().toLowerCase()) ? BRAND : 'rgba(255,255,255,0.10)',
                color: EMAIL_RX.test(email.trim().toLowerCase()) ? '#FFF' : 'rgba(255,255,255,0.40)',
                border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 800,
                cursor: EMAIL_RX.test(email.trim().toLowerCase()) ? 'pointer' : 'not-allowed',
              }}
            >Avanti</button>

            <button onClick={onBack}
              style={{
                marginTop: 28, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#FFFFFF', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                padding: '12px 22px', minHeight: 44,
                borderRadius: 10,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              <Icon name="chevL" size={14} color="#FFF"/> Torna al login titolare
            </button>
          </div>
        )}

        {step === 'codice' && (
          <>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
              <span style={{ color: '#FFE7C7', fontWeight: 700 }}>{email}</span>{' '}
              <button onClick={() => { setStep('email'); setCodice('') }} style={{
                background: 'transparent', border: 'none', color: '#FFE7C7',
                cursor: 'pointer', fontSize: 11, textDecoration: 'underline',
                marginLeft: 4,
              }}>cambia</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '24px 0 24px' }}>
              {Array.from({ length: CODICE_LEN }).map((_, i) => (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: i < codice.length ? '#FFE7C7' : 'rgba(255,255,255,0.18)',
                  border: `1px solid ${i < codice.length ? '#FFE7C7' : 'rgba(255,255,255,0.18)'}`,
                  transition: 'background 0.12s ease',
                }}/>
              ))}
            </div>

            {error && (
              <div style={{
                marginBottom: 16,
                padding: '10px 14px',
                background: 'rgba(220,38,38,0.18)',
                border: '1px solid rgba(220,38,38,0.40)',
                borderRadius: 10,
                color: '#FECACA', fontSize: 13, fontWeight: 600,
              }}>{error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d}
                  aria-label={`Cifra ${d}`}
                  onClick={() => pressDigit(d)}
                  disabled={submitting}
                  style={{
                    aspectRatio: '1', minHeight: 56,
                    fontSize: 28, fontWeight: 700,
                    background: 'rgba(255,255,255,0.10)',
                    color: '#FFF', border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 14, cursor: submitting ? 'wait' : 'pointer',
                    touchAction: 'manipulation',
                  }}
                >{d}</button>
              ))}
              <button onClick={pressBack} disabled={submitting}
                aria-label="Cancella ultima cifra"
                style={{
                  aspectRatio: '1', minHeight: 56,
                  background: 'transparent', color: 'rgba(255,255,255,0.75)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 14, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                ⌫
              </button>
              <button onClick={() => pressDigit(0)} disabled={submitting}
                aria-label="Cifra 0"
                style={{
                  aspectRatio: '1', minHeight: 56,
                  fontSize: 28, fontWeight: 700,
                  background: 'rgba(255,255,255,0.10)',
                  color: '#FFF', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 14, cursor: submitting ? 'wait' : 'pointer',
                }}>0</button>
              <button disabled aria-hidden
                style={{ aspectRatio: '1', minHeight: 56, background: 'transparent', border: 'none' }}/>
            </div>

            <button onClick={onBack}
              style={{
                marginTop: 28, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#FFFFFF', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                padding: '12px 22px', minHeight: 44,
                borderRadius: 10,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              <Icon name="chevL" size={14} color="#FFF"/> Torna al login titolare
            </button>
          </>
        )}
      </div>
    </div>
  )
}
