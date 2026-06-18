// ConfirmModal — sostituisce window.confirm() nativo nei flussi utente.
// Audit 2026-07-01 MEDIUM: confirm() nativo blocca il thread, ignora la
// notify pipeline, ha look-and-feel del browser (non brand FoodOS).
//
// Uso (hook-based, single-shot):
//   const confirm = useConfirm()
//   ...
//   const ok = await confirm({
//     title: 'Eliminare?',
//     message: 'Questa azione non e\' reversibile.',
//     confirmLabel: 'Elimina', cancelLabel: 'Annulla',
//     destructive: true,
//   })
//   if (!ok) return
//
// Implementazione: portal in body con stato locale al provider; ritorna una
// Promise<boolean>. Non e' bloccante per l'event loop.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { color as T, z as Z } from '../lib/theme'

const ConfirmCtx = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setState({
        title: opts?.title || 'Confermi?',
        message: opts?.message || '',
        confirmLabel: opts?.confirmLabel || 'OK',
        cancelLabel: opts?.cancelLabel || 'Annulla',
        destructive: !!opts?.destructive,
      })
    })
  }, [])

  const resolveWith = useCallback((value) => {
    const r = resolverRef.current
    resolverRef.current = null
    setState(null)
    if (r) r(value)
  }, [])

  const api = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      {state && (
        <Overlay
          {...state}
          onConfirm={() => resolveWith(true)}
          onCancel={() => resolveWith(false)}
        />
      )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) {
    // Fallback ragionevole se ConfirmProvider non e' montato: usa il confirm
    // nativo (deprecato). Cosi' il componente non crasha durante migrazioni.
    return async (opts) => {
      try {
        const msg = `${opts?.title || ''}\n\n${opts?.message || ''}`.trim()
        return window.confirm(msg || 'Confermi?')
      } catch { return false }
    }
  }
  return ctx.confirm
}

function Overlay({ title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel }) {
  // Esc = cancel, Enter = confirm (focus su confirm button).
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel()
      // Enter gestito dal pulsante con autoFocus.
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const accent = destructive ? (T.brand || '#6E0E1A') : (T.green || '#16A34A')
  const accentBg = destructive ? '#FEF2F2' : '#F0FDF4'
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="confirm-title"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: (Z?.modal || 1000) + 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'fos-fade-in 0.15s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFF', borderRadius: 14,
          maxWidth: 440, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{
          padding: '16px 20px', background: accentBg,
          borderBottom: `1px solid ${destructive ? '#FECACA' : '#BBF7D0'}`,
        }}>
          <div id="confirm-title" style={{ fontSize: 15, fontWeight: 800, color: accent }}>
            {title}
          </div>
        </div>
        {message && (
          <div style={{ padding: '16px 20px', fontSize: 13.5, color: '#1F2937', lineHeight: 1.55 }}>
            {message}
          </div>
        )}
        <div style={{
          padding: '12px 20px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 18px', minWidth: 100, minHeight: 40,
              borderRadius: 8, border: `1px solid #E5E7EB`,
              background: '#FFF', color: '#475569',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            style={{
              padding: '9px 18px', minWidth: 100, minHeight: 40,
              borderRadius: 8, border: 'none',
              background: accent, color: '#FFF',
              fontWeight: 800, fontSize: 13, cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
