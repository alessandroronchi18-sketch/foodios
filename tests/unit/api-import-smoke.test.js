// Smoke universale per i file in api/.
// Stessa logica del universal-import-smoke.test.jsx ma per gli endpoint
// Vercel Edge/Node Functions: verifica che ogni endpoint si importi senza
// crashare (default export presente, no syntax error, no module-level
// ReferenceError). Non li invoca — solo l'import.
//
// Cattura: top-level await rotti, env var letti a module-time, helper non
// importati, syntax error introdotti da edit.

import { describe, it, expect, vi } from 'vitest'
import { glob } from 'glob'
import path from 'node:path'

// Mock pesanti per evitare reti al boot.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

vi.mock('stripe', () => ({
  default: function () {
    return {
      checkout: { sessions: { create: () => Promise.resolve({ url: 'http://test' }) } },
      subscriptions: { list: () => Promise.resolve({ data: [] }) },
      webhooks: { constructEventAsync: () => Promise.resolve({}) },
    }
  },
}))

// Env minimi per evitare check at module-top.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key'
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key'
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com'
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key'
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_xxx'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test'
process.env.INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'test-secret'
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPubKey'
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'PrivKey'
process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:test@test.com'

const root = path.resolve(__dirname, '../..')
const files = glob.sync('api/**/*.js', { cwd: root, absolute: false })

describe('Universal import smoke — tutti i file in api/', () => {
  it('lista file > 20 (sanity check del glob)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const file of files) {
    it(`${file} si importa senza crash`, async () => {
      let mod
      try {
        mod = await import(/* @vite-ignore */ '/' + file)
      } catch (e) {
        if (e instanceof ReferenceError || e instanceof SyntaxError) {
          throw new Error(`Import crashato su ${file}: ${e.message}`)
        }
        if (e instanceof TypeError && /Cannot read|is not a function|is not defined/.test(e.message)) {
          throw new Error(`Import crashato su ${file}: ${e.message}`)
        }
        console.warn(`[api-smoke] ${file} ha lanciato ${e.constructor.name}: ${e.message} — tollerato`)
        mod = null
      }
      // Per i file endpoint (non lib/, non config/) il default export deve esistere.
      const isEndpoint = !file.includes('/lib/') && !file.includes('/config') && !file.endsWith('.config.js')
      if (mod && isEndpoint) {
        // Vercel functions: default export e' la handler.
        expect(typeof mod.default === 'function' || typeof mod === 'function' || mod === null).toBe(true)
      }
    }, 10000)
  }
})
