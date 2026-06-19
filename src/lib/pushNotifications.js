// pushNotifications — gestisce subscribe/unsubscribe Web Push dal client.
// La key VAPID public viene da VITE_VAPID_PUBLIC_KEY (env Vercel).
// Il backend (api/push-send.js — da implementare in fase 2) usa la corrispondente
// VAPID_PRIVATE_KEY per firmare i messaggi.
//
// Uso:
//   import { isPushSupported, subscribeToPush, unsubscribeFromPush } from '../lib/pushNotifications'
//
//   if (isPushSupported()) {
//     const sub = await subscribeToPush({ deviceLabel: 'iPad cucina' })
//   }

import { supabase } from './supabase'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function isPushSupported() {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission  // 'default' | 'granted' | 'denied'
}

export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  const result = await Notification.requestPermission()
  return result
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

/**
 * Abilita le notifiche push.
 * Restituisce l'oggetto subscription o null in caso di errore.
 *
 * @param {Object} opts
 * @param {string} opts.deviceLabel - Etichetta opzionale (es. "iPad cucina")
 */
export async function subscribeToPush({ deviceLabel } = {}) {
  if (!isPushSupported()) return null
  if (!VAPID_PUBLIC) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY not set — push disabled')
    return null
  }

  // 1) Permission
  let perm = getPermission()
  if (perm === 'default') perm = await requestPermission()
  if (perm !== 'granted') return null

  // 2) Get SW registration
  const reg = await navigator.serviceWorker.ready
  if (!reg) return null

  // 3) Subscribe (idempotent: se già subscribed, riusa endpoint esistente)
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
    } catch (e) {
      console.warn('[push] subscribe failed', e?.message)
      return null
    }
  }

  // 4) Persiste su Supabase via RPC
  try {
    const subJson = subscription.toJSON()
    const { error } = await supabase.rpc('push_subscribe', {
      p_endpoint: subJson.endpoint,
      p_p256dh: subJson.keys.p256dh,
      p_auth: subJson.keys.auth,
      p_user_agent: navigator.userAgent?.slice(0, 200) || null,
      p_device_label: deviceLabel || null,
    })
    if (error) {
      console.warn('[push] persist failed', error.message)
    }
  } catch (e) {
    console.warn('[push] persist exception', e?.message)
  }

  return subscription
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg?.pushManager.getSubscription()
  if (!subscription) return true
  const endpoint = subscription.endpoint
  try {
    await subscription.unsubscribe()
  } catch {}
  try {
    await supabase.rpc('push_unsubscribe', { p_endpoint: endpoint })
  } catch {}
  return true
}

export async function isCurrentlySubscribed() {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg?.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
