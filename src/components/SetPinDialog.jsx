// SetPinDialog — modal per il titolare per impostare/cambiare/rimuovere il PIN
// di un dipendente. Layout: nome dipendente in alto, stato attuale,
// tastierino numerico XL, bottoni Conferma/Rimuovi/Annulla.

import React, { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { color as T } from '../lib/theme'

const BRAND = T.brand || '#6E0E1A'
const TXT = T.text || '#0E1726'
const SOFT = T.textSoft || '#8B95A7'
const BORDER = T.border || '#E5E9EF'
const GREEN = '#16A34A'
const RED = '#DC2626'

const PIN_LEN_MIN = 4
const PIN_LEN_MAX = 6

function fmtDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '' }
}

export default function SetPinDialog({ dipendente, currentStatus, onClose, onDone, notify }) {
  // currentStatus: { has_pin: boolean, pin_set_at: timestamptz | null }
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const hasPin = !!currentStatus?.has_pin

  function pressDigit(d) {
    if (busy) return
    setPin(p => (p + String(d)).slice(0, PIN_LEN_MAX))
  }
  function pressBack() {
    if (busy) return
    setPin(p => p.slice(0, -1))
  }

  const submit = useCallback(async () => {
    if (busy || pin.length < PIN_LEN_MIN) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('set_dipendente_pin', {
        p_user_id: dipendente.id,
        p_pin: pin,
      })
      if (error) throw error
      notify?.(`PIN ${hasPin ? 'aggiornato' : 'impostato'} per ${dipendente.nome_completo || dipendente.email}`)
      onDone?.()
      onClose?.()
    } catch (e) {
      notify?.('Errore: ' + (e.message || 'PIN non impostato'), false)
    } finally {
      setBusy(false)
    }
  }, [pin, dipendente, busy, hasPin, notify, onDone, onClose])

  const remove = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('remove_dipendente_pin', {
        p_user_id: dipendente.id,
      })
      if (error) throw error
      notify?.(`PIN rimosso per ${dipendente.nome_completo || dipendente.email}`)
      onDone?.()
      onClose?.()
    } catch (e) {
      notify?.('Errore: ' + (e.message || 'rimozione fallita'), false)
    } finally {
      setBusy(false)
    }
  }, [dipendente, busy, notify, onDone, onClose])

  useEffect(() => {
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Enter' && pin.length >= PIN_LEN_MIN) submit()
      else if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, busy])

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
        {/* Header */}
        <div style={{
          padding: '22px 22px 14px',
          background: `linear-gradient(135deg, ${BRAND} 0%, #4A0612 100%)`,
          color: '#FFF',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.78 }}>
            {hasPin ? 'Cambia PIN dipendente' : 'Imposta PIN dipendente'}
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>
            {dipendente.nome_completo || dipendente.email}
          </div>
          {hasPin && currentStatus?.pin_set_at && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
              PIN impostato il {fmtDate(currentStatus.pin_set_at)}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 22 }}>
          {/* Info */}
          <div style={{
            fontSize: 12.5, color: SOFT, lineHeight: 1.5, marginBottom: 16,
            padding: '10px 12px', background: '#F8FAFC', borderRadius: 10,
          }}>
            Il dipendente userà questo PIN (4-6 cifre) per entrare velocemente da tablet senza email e password. Comunicaglielo a voce o via WhatsApp.
          </div>

          {confirmRemove ? (
            <>
              <div style={{ fontSize: 13, color: TXT, lineHeight: 1.55, marginBottom: 18 }}>
                Confermi la rimozione del PIN? Il dipendente dovrà accedere con email e password.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmRemove(false)} disabled={busy}
                  style={{
                    padding: '10px 18px', minHeight: 42,
                    background: '#FFF', color: TXT, border: `1px solid ${BORDER}`,
                    borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>Annulla</button>
                <button onClick={remove} disabled={busy}
                  style={{
                    padding: '10px 18px', minHeight: 42,
                    background: RED, color: '#FFF', border: 'none',
                    borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
                  }}>{busy ? '...' : 'Rimuovi PIN'}</button>
              </div>
            </>
          ) : (
            <>
              {/* Indicatore PIN: pallini */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '4px 0 18px' }}>
                {Array.from({ length: PIN_LEN_MAX }).map((_, i) => (
                  <div key={i} style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: i < pin.length ? BRAND : '#E5E9EF',
                    border: `1px solid ${i < pin.length ? BRAND : BORDER}`,
                    transition: 'background 0.12s ease',
                  }}/>
                ))}
              </div>

              {/* Tastierino XL */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              }}>
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
                <button onClick={submit} disabled={busy || pin.length < PIN_LEN_MIN}
                  style={{
                    aspectRatio: '1.2', fontSize: 14, fontWeight: 800,
                    background: pin.length >= PIN_LEN_MIN ? GREEN : '#E5E9EF',
                    color: pin.length >= PIN_LEN_MIN ? '#FFF' : SOFT,
                    border: 'none', borderRadius: 12,
                    cursor: pin.length >= PIN_LEN_MIN && !busy ? 'pointer' : 'not-allowed',
                  }}>{busy ? '...' : '✓'}</button>
              </div>

              {/* Bottoni inferiori */}
              <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                {hasPin ? (
                  <button onClick={() => setConfirmRemove(true)} disabled={busy}
                    style={{
                      padding: '9px 14px',
                      background: 'transparent', color: RED,
                      border: `1px solid ${RED}40`, borderRadius: 10,
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    <Icon name="trash" size={13} color={RED}/>
                    Rimuovi PIN
                  </button>
                ) : <span />}
                <button onClick={onClose} disabled={busy}
                  style={{
                    padding: '9px 14px',
                    background: '#FFF', color: TXT,
                    border: `1px solid ${BORDER}`, borderRadius: 10,
                    fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}>Chiudi</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
