// @ts-check
// Webhook Stripe — proprietà di sicurezza + (opzionale) evento firmato valido.
//
// I test di sicurezza girano SEMPRE (nessun secret): verificano che un evento
// non firmato / con firma errata NON venga mai accettato (mai 200) e che GET dia
// 405. Il test positivo (evento firmato valido) gira solo se è impostato
// STRIPE_WEBHOOK_SECRET_TEST = stesso secret del webhook in produzione.

import { test, expect, request } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://foodios-rose.vercel.app'

test.describe('Stripe webhook — sicurezza firma', () => {
  test('evento NON firmato → mai accettato (400 o 503, mai 200)', async () => {
    const ctx = await request.newContext()
    try {
      const res = await ctx.post(`${BASE}/api/stripe-webhook`, {
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify({ id: 'evt_fake', type: 'customer.subscription.updated', data: { object: {} } }),
      })
      expect(res.status()).not.toBe(200)        // un evento non firmato non passa MAI
      expect([400, 503]).toContain(res.status()) // 400 firma mancante / 503 Stripe non configurato
    } finally { await ctx.dispose() }
  })

  test('firma palesemente errata → rifiutata', async () => {
    const ctx = await request.newContext()
    try {
      const res = await ctx.post(`${BASE}/api/stripe-webhook`, {
        headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
        data: '{"id":"evt_x","type":"ping"}',
      })
      expect(res.status()).not.toBe(200)
      expect([400, 503]).toContain(res.status())
    } finally { await ctx.dispose() }
  })

  test('metodo GET non consentito → 405', async () => {
    const ctx = await request.newContext()
    try {
      const res = await ctx.get(`${BASE}/api/stripe-webhook`)
      expect(res.status()).toBe(405)
    } finally { await ctx.dispose() }
  })
})

const WHSEC = process.env.STRIPE_WEBHOOK_SECRET_TEST || ''

test.describe('Stripe webhook — evento firmato valido', () => {
  test.skip(!WHSEC, 'STRIPE_WEBHOOK_SECRET_TEST non impostato (deve combaciare col secret del webhook in prod)')

  test('evento firmato correttamente → 200 received', async () => {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST || 'sk_test_placeholder', { apiVersion: '2024-06-20' })
    const payload = JSON.stringify({
      id: `evt_e2e_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      data: { object: {
        id: 'sub_e2e_test',
        status: 'active',
        items: { data: [] },
        metadata: { organization_id: process.env.TEST_ORG_ID || '' },
      } },
    })
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC })
    const ctx = await request.newContext()
    try {
      const res = await ctx.post(`${BASE}/api/stripe-webhook`, {
        headers: { 'content-type': 'application/json', 'stripe-signature': header },
        data: payload,
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.received).toBe(true)
    } finally { await ctx.dispose() }
  })
})
