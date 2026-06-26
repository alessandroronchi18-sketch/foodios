// PushNotificationToggle — controllo on/off per Web Push notifications.
// Lo metti nelle impostazioni profilo. Mostra stato corrente + bottone di azione.
//
// Note:
// - Su iOS Safari, Web Push richiede che l'app sia installata come PWA
//   (display: standalone) — altrimenti l'API è bloccata.
// - Se VAPID public key manca, il toggle si nasconde.

import React, { useState, useEffect } from 'react'
import {
  isPushSupported,
  getPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isCurrentlySubscribed,
} from '../lib/pushNotifications'
import { isStandalonePWA } from '../lib/pwa'
import Icon from './Icon'
import { color as T } from '../lib/theme'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export default function PushNotificationToggle({ deviceLabel }) {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const standalone = isStandalonePWA()
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

  useEffect(() => {
    setSupported(isPushSupported())
    setPermission(getPermission())
    isCurrentlySubscribed().then(setSubscribed)
  }, [])

  // Se VAPID public key manca, mostra placeholder informativo (non blocca UI).
  if (!VAPID_PUBLIC) {
    return (
      <div style={infoBox()}>
        <strong style={{ color: T.text }}>Notifiche push</strong>
        <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
          Funzione in arrivo. Sarà attiva quando il titolare configurerà il server delle notifiche.
        </div>
      </div>
    )
  }

  if (!supported) {
    return (
      <div style={infoBox()}>
        <strong style={{ color: T.text }}>Notifiche push non supportate</strong>
        <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
          {isIOS
            ? 'Su iPhone/iPad, aggiungi prima Foodos alla schermata Home come app per ricevere le notifiche.'
            : 'Il tuo browser non supporta le notifiche push.'}
        </div>
      </div>
    )
  }

  if (isIOS && !standalone) {
    return (
      <div style={infoBox()}>
        <strong style={{ color: T.text }}>Aggiungi alla schermata Home</strong>
        <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
          Per ricevere notifiche su iPhone/iPad: tocca il menu condivisione del browser → "Aggiungi a Home" → riapri da lì.
        </div>
      </div>
    )
  }

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (subscribed) {
        await unsubscribeFromPush()
        setSubscribed(false)
      } else {
        const sub = await subscribeToPush({ deviceLabel })
        if (!sub) {
          setError('Permesso negato. Vai nelle impostazioni del browser per riattivarlo.')
        } else {
          setSubscribed(true)
        }
        setPermission(getPermission())
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px',
      background: T.bgCard || '#FFFFFF',
      border: `1px solid ${T.border || '#E5E9EF'}`,
      borderRadius: 12,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: subscribed ? '#10B98118' : '#F1F5F9',
        color: subscribed ? '#059669' : T.textSoft,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="bell" size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
          Notifiche push
        </div>
        <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2, lineHeight: 1.45 }}>
          {subscribed
            ? 'Riceverai avvisi su questo dispositivo (scadenze, alert, daily brief).'
            : 'Attiva per ricevere reminder operativi su questo dispositivo.'}
        </div>
        {error && (
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 6 }}>{error}</div>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        style={{
          minHeight: 38, padding: '8px 16px',
          background: subscribed ? '#FFF' : (T.brand || '#6E0E1A'),
          color: subscribed ? T.text : '#FFF',
          border: subscribed ? `1px solid ${T.border}` : 'none',
          borderRadius: 9,
          fontSize: 12.5, fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}>
        {busy ? '...' : (subscribed ? 'Disattiva' : 'Attiva')}
      </button>
    </div>
  )
}

function infoBox() {
  return {
    padding: '14px 16px',
    background: T.bgCard || '#FFFFFF',
    border: `1px solid ${T.border || '#E5E9EF'}`,
    borderRadius: 12,
  }
}
