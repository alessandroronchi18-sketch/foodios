// POST /api/push-send — invio notifica push a un utente o a un'org intera.
// Solo service_role / cron / admin può chiamarlo. Auth via x-internal-secret
// oppure CRON_SECRET, mai pubblico.
//
// Body:
//   { user_id?: uuid, organization_id?: uuid, title, body, url?, tag?, data? }
//
// Per inviare a tutta una org: omettere user_id, passare organization_id.
// Per inviare a uno specifico utente: passare user_id (e ignorare organization_id).
//
// VAPID keys: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT (mailto:...)
// nelle env Vercel. Generate via web-push:
//   npx web-push generate-vapid-keys
//
// Dipendenza: web-push (aggiungere a package.json: "web-push": "^3.6.0")

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { jsonError, jsonOk, safeLog } from './lib/safeError.js'

export const config = { runtime: 'nodejs' }

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@foodios.it'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || process.env.CRON_SECRET

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  } catch (e) {
    console.error('[push-send] VAPID setup failed', e.message)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'method_not_allowed')

  // Auth: solo interno (cron/admin)
  const provided = req.headers['x-internal-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
    return jsonError(res, 401, 'unauthorized')
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return jsonError(res, 503, 'vapid_not_configured', 'Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env to enable push')
  }

  let body
  try { body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}') } catch {
    return jsonError(res, 400, 'invalid_json')
  }
  const { user_id, organization_id, title, body: msgBody, url, tag, data } = body || {}

  if (!title || typeof title !== 'string' || title.length > 200) {
    return jsonError(res, 400, 'invalid_title')
  }
  if (!user_id && !organization_id) {
    return jsonError(res, 400, 'must_specify_target')
  }

  const admin = createClient(SUPA_URL, SUPA_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Carica subscription target
  let q = admin.from('push_subscriptions').select('*').eq('active', true)
  if (user_id) q = q.eq('user_id', user_id)
  if (organization_id) q = q.eq('organization_id', organization_id)
  const { data: subs, error: loadErr } = await q
  if (loadErr) {
    safeLog('push_load_failed', { error: loadErr.message })
    return jsonError(res, 500, 'load_failed')
  }
  if (!subs || subs.length === 0) return jsonOk(res, { sent: 0, failed: 0, no_subscribers: true })

  const payload = JSON.stringify({
    title,
    body: msgBody || '',
    url: url || '/',
    tag: tag || 'foodios-generic',
    data: data || {},
  })

  let sent = 0
  let failed = 0
  const deadEndpoints = []
  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload)
      sent++
      // Update last_notified (best-effort)
      admin.from('push_subscriptions')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('id', sub.id)
        .then(() => {}, () => {})
    } catch (err) {
      failed++
      // 410 Gone / 404 Not Found → subscription scaduta, marca inattiva
      if (err.statusCode === 410 || err.statusCode === 404) {
        deadEndpoints.push(sub.id)
      }
    }
  }

  // Cleanup endpoint morti
  if (deadEndpoints.length > 0) {
    await admin.from('push_subscriptions')
      .update({ active: false })
      .in('id', deadEndpoints)
  }

  return jsonOk(res, { sent, failed, dead: deadEndpoints.length })
}
