// k6 load test script per FoodOS.
//
// NON viene lanciato dal CI automaticamente — devi eseguirlo a mano.
//
// PREREQUISITI:
//   - Installa k6: brew install k6  (o https://k6.io/docs/get-started/installation/)
//   - Env var richieste:
//       BASE_URL                  default: https://foodios-rose.vercel.app
//       VITE_SUPABASE_URL         es: https://xxx.supabase.co
//       VITE_SUPABASE_ANON_KEY    chiave pubblica anon Supabase
//       K6_TEST_EMAIL             email di un account E2E reale (es. e2e-load@foodios-e2e.test)
//       K6_TEST_PASSWORD          password dell'account E2E
//
// COMANDI:
//   # Smoke (1 VU, 30s) — verifica che lo script gira
//   k6 run tests/load/foodios.k6.js -e BASE_URL=... -e K6_TEST_EMAIL=... -e K6_TEST_PASSWORD=...
//
//   # Carico realistico (50 VU per 5min, dopo ramp-up)
//   k6 run --vus 50 --duration 5m tests/load/foodios.k6.js -e ...
//
//   # Stress test (push fino al breakdown)
//   k6 run --stage 2m:50,5m:200,2m:0 tests/load/foodios.k6.js -e ...
//
// ATTENZIONE:
//   - Non eseguire contro prod live con > 20 VU senza testare prima su staging.
//     Saturare l'API Vercel Edge limit (~10k req/min hobby) o esaurire la quota
//     AI Anthropic costa soldi.
//   - L'account K6_TEST_EMAIL deve esistere in DB (creabile con /api/admin?action=...
//     o tramite createEphemeralOrg dei test e2e).
//   - Il bucket Resend ha quota 100/giorno; lo scenario "registrazione" lo brucia
//     in 1 minuto a 50 VU.

import http from 'k6/http'
import { sleep, check, group } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://foodios-rose.vercel.app'
const SUPABASE_URL = __ENV.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = __ENV.VITE_SUPABASE_ANON_KEY || ''
const EMAIL = __ENV.K6_TEST_EMAIL || ''
const PASSWORD = __ENV.K6_TEST_PASSWORD || ''

// Custom metrics — utili per dashboard Grafana o report finale.
const loginDuration = new Trend('foodios_login_duration')
const healthDuration = new Trend('foodios_health_duration')
const dashboardLoadDuration = new Trend('foodios_dashboard_load_duration')
const errorRate = new Rate('foodios_error_rate')

export const options = {
  // Default: smoke (1 VU per 30s). Override con --vus/--duration/--stage.
  vus: 1,
  duration: '30s',

  // SLO (Service Level Objectives): se uno fallisce, k6 exit code !=0.
  thresholds: {
    http_req_failed: ['rate<0.02'],            // <2% errori HTTP
    http_req_duration: ['p(95)<2000'],         // p95 < 2s
    foodios_login_duration: ['p(95)<1500'],    // login p95 < 1.5s
    foodios_health_duration: ['p(95)<500'],    // health p95 < 500ms
    foodios_dashboard_load_duration: ['p(95)<3000'],
    foodios_error_rate: ['rate<0.02'],
  },

  // Tag globali per filtrare in Grafana.
  tags: { service: 'foodios', env: __ENV.ENV || 'prod' },
}

// ── Setup: login una volta, riusa il token ───────────────────────────────
export function setup() {
  if (!EMAIL || !PASSWORD || !SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error('Mancano env: K6_TEST_EMAIL, K6_TEST_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
  }
  console.log(`[setup] Login con ${EMAIL} su ${SUPABASE_URL}`)
  const t0 = Date.now()
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON } }
  )
  loginDuration.add(Date.now() - t0)
  if (res.status !== 200) {
    throw new Error(`Setup login failed: status ${res.status} body ${res.body}`)
  }
  const body = JSON.parse(res.body)
  return { accessToken: body.access_token, userId: body.user.id }
}

// ── Scenari ──────────────────────────────────────────────────────────────
export default function (data) {
  group('health-check', () => {
    const t0 = Date.now()
    const res = http.get(`${BASE_URL}/api/health`)
    healthDuration.add(Date.now() - t0)
    const ok = check(res, {
      'health 200': r => r.status === 200,
      'health risponde JSON': r => r.headers['Content-Type']?.includes('json'),
    })
    errorRate.add(!ok)
  })

  group('dashboard-data-load', () => {
    const headers = {
      Authorization: `Bearer ${data.accessToken}`,
      apikey: SUPABASE_ANON,
    }
    // Tipiche fetch del Dashboard al primo mount: profile + organization + sedi + user_data ricettario.
    const t0 = Date.now()
    const responses = http.batch([
      ['GET', `${SUPABASE_URL}/rest/v1/profiles?select=id,organization_id,nome_completo,ruolo&id=eq.${data.userId}`, null, { headers }],
      ['GET', `${SUPABASE_URL}/rest/v1/organizations?select=*`, null, { headers }],
      ['GET', `${SUPABASE_URL}/rest/v1/sedi?select=*&order=is_default.desc`, null, { headers }],
      ['GET', `${SUPABASE_URL}/rest/v1/user_data?select=data_key,data_value&data_key=eq.pasticceria-ricettario-v1`, null, { headers }],
    ])
    dashboardLoadDuration.add(Date.now() - t0)
    const ok = check(responses[0], { 'profile 200': r => r.status === 200 })
      && check(responses[1], { 'org 200': r => r.status === 200 })
      && check(responses[2], { 'sedi 200': r => r.status === 200 })
      && check(responses[3], { 'ricettario 200': r => r.status === 200 })
    errorRate.add(!ok)
  })

  // NB: NON includiamo scenari per /api/ai (Claude API): costa soldi per call.
  // Aggiungere solo se vuoi specificamente misurare il rate-limit del proxy AI.
  // NB: NON includiamo signup: brucia quota Resend e crea utenti in DB da
  // pulire. Per testare signup usa createEphemeralOrg dei test e2e Playwright.

  sleep(Math.random() * 2 + 1)  // jitter 1-3s tra iterations
}

// ── Teardown opzionale ───────────────────────────────────────────────────
export function teardown(data) {
  console.log(`[teardown] Test completato. User ${data.userId} resta loggato.`)
}
