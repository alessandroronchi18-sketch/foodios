// Toast riusabile (con stack) + hook useToast().
// Sostituisce gli alert() nativi del browser in tutta l'app.
// Stack: i toast si impilano dal basso, auto-dismiss 4-6s, click su X chiude.

import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react'
import { color as T, z as Z } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'

const ToastCtx = createContext(null)

// Palette toast allineata al theme.js (era hardcoded con tonalità Tailwind
// che non matchavano il resto dell'app).
// icon: stringa testuale (✓ ! i) o, per warn, l'icona SVG renderizzata via iconName.
const VARIANTS = {
  success: { bg: T.green, fg: T.white, border: '#0C7C56', icon: '✓' },
  error:   { bg: T.brand, fg: T.white, border: T.brandDarker, icon: '!' },
  warn:    { bg: T.amber, fg: T.white, border: '#A65906',    iconName: 'warning' },
  info:    { bg: T.blue,  fg: T.white, border: '#1E40AF',    icon: 'i' },
}

let _idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const push = useCallback((message, opts = {}) => {
    const id = ++_idSeq
    const variant = opts.variant || (opts.error ? 'error' : 'success')
    const duration = opts.duration ?? (variant === 'error' ? 6000 : 4000)
    setToasts(t => [...t, { id, message, variant, duration }])
    if (duration > 0) {
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
    }
    return id
  }, [])

  // Shortcut: success, error, warn, info, e una "notify" compat retro
  // (compatibile con la firma legacy notify(msg, ok=true)).
  const api = useMemo(() => ({
    success: (msg, opts) => push(msg, { ...opts, variant: 'success' }),
    error:   (msg, opts) => push(msg, { ...opts, variant: 'error' }),
    warn:    (msg, opts) => push(msg, { ...opts, variant: 'warn' }),
    info:    (msg, opts) => push(msg, { ...opts, variant: 'info' }),
    push,
    dismiss,
    // Legacy adapter: notify(msg, ok=true) → push variant ok/error
    notify: (msg, ok = true) => push(msg, { variant: ok ? 'success' : 'error' }),
  }), [push, dismiss])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

function ToastStack({ toasts, dismiss }) {
  const isMobile = useIsMobile()
  if (toasts.length === 0) return null
  // Su mobile la bottom-nav e' alta ~58px: il toast a bottom:20 la copriva,
  // nascondendo Cassa/Magazzino/Altro proprio dopo una conferma di salvataggio.
  // Alziamo il toast sopra la nav + safe-area iOS.
  const bottomOffset = isMobile
    ? 'calc(70px + env(safe-area-inset-bottom, 0px))'
    : '20px'
  return (
    <div
      role="region" aria-live="polite" aria-label="Notifiche"
      style={{
        position: 'fixed', bottom: bottomOffset, right: isMobile ? 12 : 20, zIndex: Z.toast,
        display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 'calc(100vw - 40px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => <ToastItem key={t.id} {...t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  )
}

function ToastItem({ message, variant, duration, onDismiss }) {
  const v = VARIANTS[variant] || VARIANTS.info
  // Progress bar via CSS transition (audit 2026-06-17 MEDIUM: prima setInterval
  // 50ms per ogni toast attivo, con N toast = N timer a 20Hz). Animazione
  // partita al mount via requestAnimationFrame + transition CSS lineare.
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    if (!duration || duration <= 0) return
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [duration])

  return (
    <div
      role="status"
      style={{
        background: v.bg, color: v.fg, border: `1px solid ${v.border}`,
        borderRadius: 10, padding: '10px 14px', minWidth: 280, maxWidth: 420,
        boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, lineHeight: 1.45,
        pointerEvents: 'auto',
        animation: 'fos-toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        background: 'rgba(255,255,255,0.22)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13,
      }}>{v.iconName ? <Icon name={v.iconName} size={13} /> : v.icon}</span>
      <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</span>
      <button
        aria-label="Chiudi notifica"
        onClick={onDismiss}
        style={{
          background: 'transparent', color: v.fg, border: 'none',
          padding: 0, marginLeft: 4, fontSize: 18, lineHeight: 1, cursor: 'pointer',
          opacity: 0.7,
        }}
      >×</button>
      {duration > 0 && (
        <div style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: animate ? '0%' : '100%',
          background: 'rgba(255,255,255,0.35)',
          transition: `width ${duration}ms linear`,
        }} />
      )}
      <style>{`@keyframes fos-toast-in { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) {
    // Fallback no-op se il provider manca (evita crash in test isolati).
    return {
      success: () => {}, error: () => {}, warn: () => {}, info: () => {},
      push: () => {}, dismiss: () => {}, notify: () => {},
    }
  }
  return ctx
}

// Helper globale: window.__foodos_toast viene popolato dal Provider per
// codice non-React (es. backgroundManager) che ha bisogno di mostrare toast.
export function GlobalToastBridge() {
  const toast = useToast()
  useEffect(() => {
    window.__foodos_toast = toast
    return () => { if (window.__foodos_toast === toast) delete window.__foodos_toast }
  }, [toast])
  return null
}
