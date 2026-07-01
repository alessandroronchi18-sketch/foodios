// SetCodiceDialog — il titolare cambia (o imposta la prima volta) il codice
// personale a 6 cifre di un dipendente esistente. Chiama /api/dipendente-crea
// (che gestisce sia create che update, distinguendo dall'esistenza in profiles).
//
// Casi d'uso:
//   - dipendente esistente → cambio codice
//   - dipendente esistente → NON serve reset a nulla (usare tab "Elimina" per rimuovere accesso)

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
const CODICI_BANNATI = new Set([
  '000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
  '123456','654321','012345','543210',
])

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '' }
}

export default function SetCodiceDialog({ dipendente, nomeAttivita, onClose, onDone, notify }) {
  const [codice, setCodice] = useState('')
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState('')

  const hasSetPrima = !!dipendente?.dipendente_codice_set_at

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
          email: dipendente.email,
          nome: dipendente.nome_completo || dipendente.email,
          codice,
          nomeAttivita: nomeAttivita || null,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `errore (${res.status})`)
      }
      notify?.(`Codice aggiornato per ${dipendente.nome_completo || dipendente.email}`)
      onDone?.()
      onClose?.()
    } catch (e) {
      setErrore(e.message || 'Aggiornamento fallito')
    } finally {
      setBusy(false)
    }
  }, [codice, busy, dipendente, nomeAttivita, notify, onDone, onClose])

  useEffect(() => {
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Enter' && codice.length === CODICE_LEN) submit()
      else if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codice, busy])

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
          maxWidth: 380, width: '100%',
          background: '#FFF', borderRadius: 18, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.40)',
        }}>
        <div style={{
          padding: '22px 22px 14px',
          background: `linear-gradient(135deg, ${BRAND} 0%, #4A0612 100%)`,
          color: '#FFF',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.78 }}>
            {hasSetPrima ? 'Cambia codice dipendente' : 'Imposta codice dipendente'}
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
            {dipendente.nome_completo || dipendente.email}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            {dipendente.email}
            {hasSetPrima && ` · ultimo cambio ${fmtDate(dipendente.dipendente_codice_set_at)}`}
          </div>
        </div>

        <div style={{ padding: 22 }}>
          <div style={{
            fontSize: 12.5, color: SOFT, lineHeight: 1.5, marginBottom: 14,
            padding: '10px 12px', background: '#F8FAFC', borderRadius: 10,
          }}>
            Codice a 6 cifre. Il dipendente lo digita sul tablet insieme all'email per entrare. Comuniclielo tu a voce.
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '4px 0 18px' }}>
            {Array.from({ length: CODICE_LEN }).map((_, i) => (
              <div key={i} style={{
                width: 12, height: 12, borderRadius: '50%',
                background: i < codice.length ? BRAND : '#E5E9EF',
                border: `1px solid ${i < codice.length ? BRAND : BORDER}`,
                transition: 'background 0.12s ease',
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
              <button key={d}
                onClick={() => pressDigit(d)} disabled={busy}
                style={{
                  aspectRatio: '1.2', fontSize: 24, fontWeight: 700,
                  background: '#F8FAFC', color: TXT,
                  border: `1px solid ${BORDER}`, borderRadius: 12,
                  cursor: busy ? 'wait' : 'pointer',
                  touchAction: 'manipulation',
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
              aria-label="Conferma codice"
              style={{
                aspectRatio: '1.2', fontSize: 22, fontWeight: 800,
                background: codice.length === CODICE_LEN ? GREEN : '#E5E9EF',
                color: codice.length === CODICE_LEN ? '#FFF' : SOFT,
                border: 'none', borderRadius: 12,
                cursor: codice.length === CODICE_LEN && !busy ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {busy ? '…' : <Icon name="check" size={22} color={codice.length === CODICE_LEN ? '#FFF' : SOFT}/>}
            </button>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={busy}
              style={{
                padding: '9px 14px',
                background: '#FFF', color: TXT,
                border: `1px solid ${BORDER}`, borderRadius: 10,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}>Chiudi</button>
          </div>
        </div>
      </div>
    </div>
  )
}
