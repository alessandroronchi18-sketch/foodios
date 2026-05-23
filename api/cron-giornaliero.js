export const config = { runtime: 'edge' }

// Cron consolidato per piano Hobby Vercel (max 2 cron/giorno).
// Eseguito ogni mattina alle 07:00 UTC. Esegue in sequenza:
//   1) cron-notifiche (alert magazzino sotto soglia, fatture in scadenza)
//   2) anomaly-detect (login da paese diverso, burst export, fail login)
//   3) cron-report-mensile (solo il 1° del mese)
//
// Ogni sub-handler ha la sua auth via CRON_SECRET → riusiamo le funzioni
// importando l'handler default e chiamandolo con una Request mock che porta
// l'origin reale del cron-giornaliero (serve a cron-notifiche per costruire
// fetch interni a /api/send-email).

import { verifyBearerSecret } from './lib/cryptoCompare.js'
import notificheHandler from './cron-notifiche.js'
import anomalyHandler from './anomaly-detect.js'
import reportMensileHandler from './cron-report-mensile.js'

function makeInternalReq(realUrl, path) {
  const origin = new URL(realUrl).origin
  return new Request(`${origin}${path}`, {
    method: 'GET',
    headers: {
      // Riusa il CRON_SECRET — i sub-handler lo verificano con verifyBearerSecret
      Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
      'user-agent': 'foodios-cron-giornaliero',
    },
  })
}

async function runStep(name, fn) {
  const start = Date.now()
  try {
    const res = await fn()
    const ms = Date.now() - start
    let body = null
    try { body = await res.clone().json() } catch {}
    return { step: name, ok: res.ok, status: res.status, ms, body }
  } catch (e) {
    return { step: name, ok: false, error: e.message || String(e), ms: Date.now() - start }
  }
}

export default async function handler(req) {
  // Auth: stesso pattern degli altri cron (fail-closed)
  const authCheck = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!authCheck.ok) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const isPrimoDelMese = now.getUTCDate() === 1

  const results = []

  // 1) Notifiche giornaliere (alert magazzino + fatture in scadenza)
  results.push(await runStep('cron-notifiche', () =>
    notificheHandler(makeInternalReq(req.url, '/api/cron-notifiche'))
  ))

  // 2) Anomaly detection (login paese cambiato + burst export + fail burst)
  results.push(await runStep('anomaly-detect', () =>
    anomalyHandler(makeInternalReq(req.url, '/api/anomaly-detect'))
  ))

  // 3) Report mensile solo il 1° del mese
  if (isPrimoDelMese) {
    results.push(await runStep('cron-report-mensile', () =>
      reportMensileHandler(makeInternalReq(req.url, '/api/cron-report-mensile'))
    ))
  }

  return new Response(JSON.stringify({
    ok: true,
    triggered_at: now.toISOString(),
    is_primo_del_mese: isPrimoDelMese,
    steps: results,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
