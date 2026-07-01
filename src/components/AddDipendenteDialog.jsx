// AddDipendenteDialog — il titolare crea un nuovo accesso dipendente in un
// solo passo: email + nome + codice a 6 cifre. Chiama /api/dipendente-crea.
//
// Il codice se lo sceglie il titolare e va comunicato di persona al
// dipendente (non viene inviato via email in chiaro).

import React, { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { color as T } from '../lib/theme'

const BRAND = T.brand || '#6E0E1A'
const TXT = T.text || '#0E1726'
const SOFT = T.textSoft || '#8B95A7'
const BORDER = T.border || '#E5E9EF'
const GREEN = '#16A34A'

const CODICE_LEN = 6
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODICI_BANNATI = new Set([
  '000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
  '123456','654321','012345','543210',
])

export default function AddDipendenteDialog({ nomeAttivita, onClose, onDone, notify }) {
  const [step, setStep] = useState(1) // 1 = email+nome, 2 = codice
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [codice, setCodice] = useState('')
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState('')

  function avantiStep1() {
    setErrore('')
    const e = email.trim().toLowerCase()
    if (!EMAIL_RX.test(e)) { setErrore('Email non valida'); return }
    if (!nome.trim() || nome.trim().length < 2) { setErrore('Serve almeno il nome (2 caratteri)'); return }
    setEmail(e)
    setNome(nome.trim())
    setStep(2)
  }

  function pressDigit(d) {
    if (busy) return
    setErrore('')
    setCodice(c => (c + String(d)).slice(0, CODICE_LEN))
  }
  function pressBack() {
    if (busy) return
    setErrore('')
    setCodice(c => c.slice(0, -1))
  }

  const submit = useCallback(async () => {
    if (busy || codice.length !== CODICE_LEN) return
    if (CODICI_BANNATI.has(codice)) {
      setErrore('Codice troppo semplice (evita 123456, 000000, ecc.)')
      return
    }
    setBusy(true)
    setErrore('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/dipendente-crea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({
          email, nome, codice,
          nomeAttivita: nomeAttivita || null,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `errore (${res.status})`)
      }
      notify?.(j.action === 'creato'
        ? `Accesso creato per ${nome}. Ora comunicagli email e codice a voce.`
        : `Accesso aggiornato per ${nome}.`)
      onDone?.()
      onClose?.()
    } catch (e) {
      setErrore(e.message || 'Creazione fallita')
    } finally {
      setBusy(false)
    }
  }, [codice, busy, email, nome, nomeAttivita, notify, onDone, onClose])

  useEffect(() => {
    function onKey(e) {
      if (step !== 2) return
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Enter' && codice.length === CODICE_LEN) submit()
      else if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, codice, busy])

  return (
    <div role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(11,4,8,0.65)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 400, width: '100%',
          background: '#FFF', borderRadius: 18, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.40)',
        }}>
        <div style={{
          padding: '22px 22px 14px',
          background: `linear-gradient(135deg, ${BRAND} 0%, #4A0612 100%)`,
          color: '#FFF',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.78 }}>
            Nuovo accesso dipendente
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
            {step === 1 ? 'Chi è il dipendente?' : `Scegli un codice per ${nome}`}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            Passo {step} di 2
          </div>
        </div>

        <div style={{ padding: 22 }}>
          {step === 1 && (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Email del dipendente
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="es. mario.laboratorio@…"
                  autoFocus autoComplete="off"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', minHeight: 44, borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 16, color: TXT }}/>
                <div style={{ marginTop: 6, fontSize: 11, color: SOFT, lineHeight: 1.5 }}>
                  Meglio un'email dedicata al lavoro (es. <em>mario.laboratorio@tuodominio.it</em>), separata da quella personale del dipendente.
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Nome del dipendente
                </label>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="es. Mario Rossi"
                  onKeyDown={e => { if (e.key === 'Enter') avantiStep1() }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', minHeight: 44, borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 16, color: TXT }}/>
              </div>

              {errore && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="alert" size={13} color="#991B1B"/> {errore}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose}
                  style={{ padding: '10px 16px', background: '#FFF', color: TXT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Annulla
                </button>
                <button onClick={avantiStep1}
                  style={{ padding: '10px 18px', background: BRAND, color: '#FFF', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Avanti <Icon name="chevR" size={13} color="#FFF"/>
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{
                fontSize: 12.5, color: SOFT, lineHeight: 1.5, marginBottom: 14,
                padding: '10px 12px', background: '#F8FAFC', borderRadius: 10,
              }}>
                Codice a 6 cifre. Comunicalo a voce al dipendente — non lo mandiamo nell'email per sicurezza.
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '4px 0 18px' }}>
                {Array.from({ length: CODICE_LEN }).map((_, i) => (
                  <div key={i} style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: i < codice.length ? BRAND : '#E5E9EF',
                    border: `1px solid ${i < codice.length ? BRAND : BORDER}`,
                  }}/>
                ))}
              </div>

              {errore && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="alert" size={13} color="#991B1B"/> {errore}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[1,2,3,4,5,6,7,8,9].map(d => (
                  <button key={d} onClick={() => pressDigit(d)} disabled={busy}
                    style={{
                      aspectRatio: '1.2', fontSize: 24, fontWeight: 700,
                      background: '#F8FAFC', color: TXT,
                      border: `1px solid ${BORDER}`, borderRadius: 12,
                      cursor: busy ? 'wait' : 'pointer', touchAction: 'manipulation',
                    }}>{d}</button>
                ))}
                <button onClick={pressBack} disabled={busy} aria-label="Cancella ultima cifra"
                  style={{
                    aspectRatio: '1.2', fontSize: 14, fontWeight: 700,
                    background: '#FFF', color: SOFT, border: `1px solid ${BORDER}`,
                    borderRadius: 12, cursor: 'pointer',
                  }}>⌫</button>
                <button onClick={() => pressDigit(0)} disabled={busy}
                  style={{
                    aspectRatio: '1.2', fontSize: 24, fontWeight: 700,
                    background: '#F8FAFC', color: TXT,
                    border: `1px solid ${BORDER}`, borderRadius: 12,
                    cursor: busy ? 'wait' : 'pointer',
                  }}>0</button>
                <button onClick={submit} disabled={busy || codice.length !== CODICE_LEN}
                  aria-label="Conferma"
                  style={{
                    aspectRatio: '1.2',
                    background: codice.length === CODICE_LEN ? GREEN : '#E5E9EF',
                    color: codice.length === CODICE_LEN ? '#FFF' : SOFT,
                    border: 'none', borderRadius: 12,
                    cursor: codice.length === CODICE_LEN && !busy ? 'pointer' : 'not-allowed',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {busy ? '…' : <Icon name="check" size={22} color={codice.length === CODICE_LEN ? '#FFF' : SOFT}/>}
                </button>
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button onClick={() => setStep(1)} disabled={busy}
                  style={{ padding: '9px 14px', background: '#FFF', color: TXT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  ← Indietro
                </button>
                <button onClick={onClose} disabled={busy}
                  style={{ padding: '9px 14px', background: '#FFF', color: TXT, border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  Annulla
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
