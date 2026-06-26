import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

const lbl  = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }
// Audit 2026-06-24 UI mobile: fontSize input >=16 evita zoom iOS al focus.
// minHeight 44 per touch target. Card padding ridotto su mobile.

// Componente "Sicurezza" in Impostazioni: gestisce enroll/verify/unenroll del 2FA TOTP
// via Supabase Auth MFA. Mostra QR code per Google Authenticator / Authy / 1Password.
export default function MfaSection({ notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const card = { background: '#FFF', borderRadius: 12, padding: isMobile ? '18px 16px' : isTablet ? '20px 22px' : '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 }
  const inp  = { width: '100%', padding: '12px 14px', minHeight: 48, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 16, color: '#0F172A', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState([])
  const [enrolling, setEnrolling] = useState(null) // { factorId, qrSvg, secret, uri }
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [unenrolling, setUnenrolling] = useState(null)
  const [confirmCode, setConfirmCode] = useState('')

  async function loadFactors() {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      setFactors([...(data?.totp || [])])
    } catch (e) {
      notify?.('Errore lettura fattori: ' + (e.message || e), false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFactors() }, [])

  async function startEnroll() {
    try {
      // Nome friendly visibile nelle app TOTP
      const friendlyName = `Foodos ${new Date().toISOString().slice(0,10)}`
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      })
      if (error) throw error
      // data.totp.qr_code è un SVG inline, data.totp.uri è otpauth://..., data.totp.secret è la chiave
      setEnrolling({
        factorId: data.id,
        qrSvg: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      })
      setCode('')
    } catch (e) {
      notify?.('Impossibile avviare enroll: ' + (e.message || e), false)
    }
  }

  async function verifyEnroll() {
    if (!enrolling || !code) return
    if (!/^\d{6}$/.test(code.trim())) {
      notify?.('Inserisci un codice a 6 cifre', false)
      return
    }
    setVerifying(true)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId })
      if (chErr) throw chErr
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: ch.id,
        code: code.trim(),
      })
      if (verErr) throw verErr
      notify?.('2FA attivato — userai il codice ad ogni login')
      setEnrolling(null)
      setCode('')
      await loadFactors()
    } catch (e) {
      notify?.('Codice errato o scaduto: ' + (e.message || e), false)
    } finally {
      setVerifying(false)
    }
  }

  async function cancelEnroll() {
    if (!enrolling) return
    // Rimuoviamo il factor non ancora verificato per non sporcare la lista
    try {
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId })
    } catch {}
    setEnrolling(null)
    setCode('')
    await loadFactors()
  }

  async function startUnenroll(factor) {
    setUnenrolling(factor)
    setConfirmCode('')
  }

  async function doUnenroll() {
    if (!unenrolling) return
    // Richiediamo conferma con codice TOTP per evitare rimozione accidentale
    if (!/^\d{6}$/.test(confirmCode.trim())) {
      notify?.('Inserisci il codice TOTP attuale per confermare', false)
      return
    }
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: unenrolling.id })
      if (chErr) throw chErr
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: unenrolling.id,
        challengeId: ch.id,
        code: confirmCode.trim(),
      })
      if (verErr) throw verErr
      const { error: unerr } = await supabase.auth.mfa.unenroll({ factorId: unenrolling.id })
      if (unerr) throw unerr
      notify?.('2FA disattivato')
      setUnenrolling(null)
      setConfirmCode('')
      await loadFactors()
    } catch (e) {
      notify?.('Errore rimozione: ' + (e.message || e), false)
    }
  }

  async function copySecret() {
    if (!enrolling?.secret) return
    try {
      await navigator.clipboard.writeText(enrolling.secret)
      notify?.('Chiave copiata')
    } catch {
      notify?.('Impossibile copiare automaticamente, copia manualmente', false)
    }
  }

  const verifiedFactors = factors.filter(f => f.status === 'verified')

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento sicurezza account…</div>

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="lock" size={18} />Verifica in due passaggi (2FA)</div>
            <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.6, maxWidth: 540 }}>
              Aggiunge un secondo passaggio al login: dopo la password ti chiediamo un codice
              a 6 cifre generato dalla tua app di autenticazione (Google Authenticator, Authy, 1Password, Bitwarden…).
              Anche se qualcuno ruba la tua password, senza il telefono non può entrare.
            </div>
          </div>
          {verifiedFactors.length > 0 ? (
            <span style={{ background: '#DCFCE7', color: '#166534', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="dot" size={9} /> ATTIVO
            </span>
          ) : (
            <span style={{ background: '#FEF3C7', color: '#92400E', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="dot" size={9} /> NON ATTIVO
            </span>
          )}
        </div>

        {verifiedFactors.length === 0 && !enrolling && (
          <button onClick={startEnroll}
            style={{ padding: '10px 22px', background: '#0F172A', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Attiva 2FA
          </button>
        )}

        {enrolling && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
              1. Inquadra il QR con la tua app di autenticazione
            </div>
            {enrolling.qrSvg && (
              <div style={{ background: '#FFF', padding: 12, borderRadius: 10, display: 'inline-block', border: '1px solid #E2E8F0' }}
                dangerouslySetInnerHTML={{ __html: enrolling.qrSvg }} />
            )}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                Oppure inserisci manualmente questa chiave:
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'monospace', color: '#0F172A', letterSpacing: '0.05em', wordBreak: 'break-all' }}>
                  {enrolling.secret}
                </code>
                <button onClick={copySecret}
                  style={{ padding: '7px 12px', background: '#0F172A', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Copia
                </button>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                2. Inserisci il codice a 6 cifre dall'app
              </div>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" inputMode="numeric" autoComplete="one-time-code"
                style={{ ...inp, maxWidth: 200, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'monospace' }} />
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button onClick={verifyEnroll} disabled={verifying || code.length !== 6}
                style={{ padding: '10px 22px', background: code.length === 6 ? '#6E0E1A' : '#CBD5E1', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: code.length === 6 ? 'pointer' : 'not-allowed' }}>
                {verifying ? '…' : 'Conferma e attiva'}
              </button>
              <button onClick={cancelEnroll}
                style={{ padding: '10px 18px', background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Annulla
              </button>
            </div>
          </div>
        )}

        {verifiedFactors.length > 0 && !enrolling && !unenrolling && (
          <div style={{ marginTop: 6 }}>
            {verifiedFactors.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                    {f.friendly_name || 'TOTP'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Attivato il {new Date(f.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <button onClick={() => startUnenroll(f)}
                  style={{ padding: '10px 16px', minHeight: 40, background: '#FFF5F5', color: '#6E0E1A', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Disattiva
                </button>
              </div>
            ))}
          </div>
        )}

        {unenrolling && (
          <div style={{ background: '#FEF7F5', border: '2px solid #6E0E1A', borderRadius: 12, padding: 20, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6E0E1A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="warning" size={16} />Disattivare 2FA?
            </div>
            <div style={{ fontSize: 12, color: '#6B4C44', marginBottom: 14, lineHeight: 1.6 }}>
              Per confermare, inserisci il codice TOTP attuale generato dalla tua app.
              Una volta disattivato il 2FA, basterà la password per accedere.
            </div>
            <label style={lbl}>Codice TOTP attuale</label>
            <input value={confirmCode} onChange={e => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" inputMode="numeric" autoComplete="one-time-code"
              style={{ ...inp, maxWidth: 200, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'monospace' }} />
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button onClick={doUnenroll} disabled={confirmCode.length !== 6}
                style={{ padding: '10px 22px', background: confirmCode.length === 6 ? '#6E0E1A' : '#CBD5E1', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: confirmCode.length === 6 ? 'pointer' : 'not-allowed' }}>
                Disattiva 2FA
              </button>
              <button onClick={() => { setUnenrolling(null); setConfirmCode('') }}
                style={{ padding: '10px 18px', background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente challenge MFA durante il login ─────────────────────────────────
// Da renderizzare in App.jsx quando getAuthenticatorAssuranceLevel ritorna
// { currentLevel: 'aal1', nextLevel: 'aal2' } — significa che l'utente ha
// password verificata ma deve ancora completare il 2FA.
export function MfaChallenge({ onComplete, onCancel }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [factor, setFactor] = useState(null)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error || !data?.totp?.length) {
        setErr('Nessun fattore TOTP trovato')
        return
      }
      setFactor(data.totp.find(f => f.status === 'verified') || data.totp[0])
    })
  }, [])

  async function verify() {
    if (!factor) return
    if (!/^\d{6}$/.test(code.trim())) { setErr('Codice a 6 cifre'); return }
    setBusy(true); setErr(null)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (chErr) throw chErr
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code: code.trim(),
      })
      if (verErr) throw verErr
      onComplete?.()
    } catch (e) {
      setErr(e.message || 'Codice errato')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, width: '100%', background: '#FFF', borderRadius: 16, padding: isMobile ? '28px 22px' : isTablet ? '30px 26px' : '36px 32px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 16, textAlign: 'center' }}><Icon name="lock" size={48} color="#6E0E1A" /></div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '0 0 8px', textAlign: 'center' }}>
          Verifica in due passaggi
        </h1>
        <p style={{ fontSize: 13, color: '#64748B', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.6 }}>
          Inserisci il codice a 6 cifre dalla tua app di autenticazione.
        </p>
        <input value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null) }}
          placeholder="123456" inputMode="numeric" autoComplete="one-time-code" autoFocus
          onKeyDown={e => e.key === 'Enter' && verify()}
          style={{ width: '100%', padding: '14px 18px', minHeight: 56, border: `1px solid ${err ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 10, fontSize: 24, letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'monospace', color: '#0F172A', background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
        {err && <div style={{ color: '#6E0E1A', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
        <button onClick={verify} disabled={busy || code.length !== 6}
          style={{ width: '100%', padding: '14px', minHeight: 48, marginTop: 18, background: code.length === 6 ? '#6E0E1A' : '#CBD5E1', color: '#FFF', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: code.length === 6 ? 'pointer' : 'not-allowed' }}>
          {busy ? '…' : 'Accedi'}
        </button>
        <button onClick={onCancel}
          style={{ width: '100%', padding: '12px', minHeight: 40, marginTop: 10, background: 'transparent', color: '#64748B', border: 'none', fontSize: 13, cursor: 'pointer' }}>
          Annulla e torna al login
        </button>
      </div>
    </div>
  )
}
