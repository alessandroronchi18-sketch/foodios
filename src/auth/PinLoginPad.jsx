// PinLoginPad - schermata di login alternativo via PIN per dipendenti.
// Pensato per tablet condiviso in laboratorio (Modalità Dipendente PWA).
//
// Flusso:
// 1) Dipendente seleziona/conferma slug attività (memorizzato in localStorage)
// 2) Inserisce PIN 4-6 cifre via tastierino numerico XL
// 3) Submit → POST /api/pin-login → riceve magic link
// 4) Apre magic link → Supabase setta cookie sessione → redirect a /
//
// Usato come alternativa al login email+pwd in AuthPage (entry via link
// "Sono un dipendente").

import React, { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../lib/apiFetch'
import { color as T } from '../lib/theme'
import Icon from '../components/Icon'

const BRAND = T.brand || '#6E0E1A'
const TXT = T.text || '#0E1726'
const SOFT = T.textSoft || '#8B95A7'
const BORDER = T.border || '#E5E9EF'

const PIN_LEN_MIN = 4
const PIN_LEN_MAX = 6
const ORG_KEY = 'foodios_dip_org'

export default function PinLoginPad({ onBack, onSuccess }) {
  const [orgSlug, setOrgSlug] = useState(() => {
    try { return localStorage.getItem(ORG_KEY) || '' } catch { return '' }
  })
  const [step, setStep] = useState(() => (orgSlug ? 'pin' : 'org'))
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submitPin = useCallback(async (p) => {
    if (submitting) return
    if (!orgSlug) { setError('Inserisci prima il nome dell\'attività'); return }
    if (!p || p.length < PIN_LEN_MIN) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await apiFetch('/api/pin-login', {
        method: 'POST',
        body: JSON.stringify({ org_slug: orgSlug.toLowerCase().trim(), pin: p }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        const code = j?.error || `errore_${r.status}`
        if (code === 'invalid_pin') setError('PIN non riconosciuto. Riprova.')
        else if (code === 'too_many_attempts') setError('Troppi tentativi. Attendi 15 minuti.')
        else if (code === 'invalid_org') setError('Attività non trovata.')
        else setError('Errore di rete. Riprova.')
        setPin('')
        return
      }
      const j = await r.json()
      try { localStorage.setItem(ORG_KEY, orgSlug.toLowerCase().trim()) } catch {}
      // Apri magic link: Supabase setta i cookie sessione → redirect a /
      if (j.magic_link) {
        window.location.href = j.magic_link
      } else if (onSuccess) {
        onSuccess()
      }
    } catch (e) {
      setError('Errore di connessione. Verifica internet.')
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }, [orgSlug, submitting, onSuccess])

  function pressDigit(d) {
    if (submitting) return
    setError(null)
    const next = (pin + String(d)).slice(0, PIN_LEN_MAX)
    setPin(next)
    if (next.length >= PIN_LEN_MIN) {
      // Auto-submit a 4 cifre. Se servono 5-6 cifre, l'utente attende auto-submit
      // dopo l'ultima pressione o preme il tasto verde esplicito.
      // Logic: auto-submit a 4 cifre per default UX.
      if (next.length === 4) {
        // Piccolo debounce per permettere di vedere il 4° pallino
        setTimeout(() => submitPin(next), 150)
      }
    }
  }
  function pressBack() {
    if (submitting) return
    setPin(p => p.slice(0, -1))
    setError(null)
  }
  function pressSubmit() {
    if (submitting) return
    if (pin.length >= PIN_LEN_MIN) submitPin(pin)
  }

  // Tastierino fisico opzionale
  useEffect(() => {
    if (step !== 'pin') return
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Enter') pressSubmit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pin, submitting])

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
          letterSpacing: '-0.02em',
          color: '#FFF',
        }}>Foodos · accesso rapido</h1>
        <p style={{ marginTop: 6, marginBottom: 28, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          {step === 'org' ? 'Quale attività?' : `Inserisci il tuo PIN`}
        </p>

        {step === 'org' && (
          <div>
            <input
              type="text"
              value={orgSlug}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              placeholder="nome-attività"
              onChange={e => setOrgSlug(e.target.value.replace(/[^a-z0-9-]/g, ''))}
              onKeyDown={e => {
                if (e.key === 'Enter' && orgSlug.length > 0) setStep('pin')
              }}
              style={{
                width: '100%', padding: '14px 16px', minHeight: 52,
                fontSize: 18, fontWeight: 600,
                borderRadius: 12, border: '1px solid rgba(255,255,255,0.20)',
                background: 'rgba(255,255,255,0.08)', color: '#FFF',
                outline: 'none', textAlign: 'center',
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
              È il nome breve dell'attività che ti ha dato il titolare (solo lettere, numeri o trattini).
            </div>
            <button
              disabled={!orgSlug}
              onClick={() => setStep('pin')}
              style={{
                marginTop: 20, width: '100%', padding: '14px 16px', minHeight: 52,
                background: orgSlug ? BRAND : 'rgba(255,255,255,0.10)',
                color: orgSlug ? '#FFF' : 'rgba(255,255,255,0.40)',
                border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 800,
                cursor: orgSlug ? 'pointer' : 'not-allowed',
              }}
            >Avanti</button>
          </div>
        )}

        {step === 'pin' && (
          <>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', marginBottom: 8 }}>
              Attività: <strong style={{ color: '#FFE7C7' }}>{orgSlug}</strong>{' '}
              <button onClick={() => setStep('org')} style={{
                background: 'transparent', border: 'none', color: '#FFE7C7',
                cursor: 'pointer', fontSize: 11, textDecoration: 'underline',
              }}>cambia</button>
            </div>

            {/* Indicatore PIN: pallini */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '24px 0 28px' }}>
              {Array.from({ length: PIN_LEN_MAX }).map((_, i) => (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: i < pin.length ? '#FFE7C7' : 'rgba(255,255,255,0.18)',
                  border: `1px solid ${i < pin.length ? '#FFE7C7' : 'rgba(255,255,255,0.18)'}`,
                  transition: 'background 0.12s ease',
                }}/>
              ))}
            </div>

            {/* Errore */}
            {error && (
              <div style={{
                marginBottom: 18,
                padding: '10px 14px',
                background: 'rgba(220,38,38,0.18)',
                border: '1px solid rgba(220,38,38,0.40)',
                borderRadius: 10,
                color: '#FECACA', fontSize: 13, fontWeight: 600,
              }}>{error}</div>
            )}

            {/* Tastierino XL */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
            }}>
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
                    transition: 'background 0.08s ease, transform 0.08s ease',
                    touchAction: 'manipulation',
                  }}
                  onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                  onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
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
                  touchAction: 'manipulation',
                }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 5H9l-7 7 7 7h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/>
                  <line x1="18" y1="9" x2="12" y2="15"/>
                  <line x1="12" y1="9" x2="18" y2="15"/>
                </svg>
              </button>
              <button onClick={() => pressDigit(0)} disabled={submitting}
                aria-label="Cifra 0"
                style={{
                  aspectRatio: '1', minHeight: 56,
                  fontSize: 28, fontWeight: 700,
                  background: 'rgba(255,255,255,0.10)',
                  color: '#FFF', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 14, cursor: submitting ? 'wait' : 'pointer',
                  touchAction: 'manipulation',
                }}>0</button>
              <button onClick={pressSubmit} disabled={submitting || pin.length < PIN_LEN_MIN}
                aria-label="Conferma PIN"
                style={{
                  aspectRatio: '1', minHeight: 56,
                  background: pin.length >= PIN_LEN_MIN ? '#16A34A' : 'rgba(255,255,255,0.10)',
                  color: pin.length >= PIN_LEN_MIN ? '#FFF' : 'rgba(255,255,255,0.40)',
                  border: 'none',
                  borderRadius: 14,
                  cursor: pin.length >= PIN_LEN_MIN && !submitting ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  touchAction: 'manipulation',
                }}>
                {submitting ? '…' : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            </div>

            {/* Torna al login normale - bottone più evidente (audit 2026-06-25:
                utente diceva "non posso tornare indietro" → underline su nero era poco visibile). */}
            <button onClick={onBack}
              style={{
                marginTop: 28, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#FFFFFF', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                padding: '12px 22px', minHeight: 44,
                borderRadius: 10,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Torna al login con email
            </button>
          </>
        )}
      </div>
    </div>
  )
}
