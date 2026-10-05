// @vitest-environment happy-dom
//
// «Segna come incassata» al telefono è un pulsante da dito.
//
// Trovato il 06/10/2026 dall'agente che ha rifatto le Vendite B2B: nelle
// schede del telefono il pulsante «Da incassare / Incassato» era alto 28 px,
// sotto i 44 della regola (CLAUDE.md, «Touch target»). È il comando che si
// usa di più in questa pagina: segnare che il bar ha pagato.
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => {
  const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }
  return { supabase: { from: () => new Proxy({}, h), rpc: async () => ({ data: null, error: null }) } }
})
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => true, useIsTablet: () => false, useDevice: () => 'telefono' }))
let VENDITE = []
vi.mock('../../src/lib/venditeB2B.js', async (orig) => ({ ...(await orig()), loadVenditeB2B: async () => VENDITE, loadClientiB2B: async () => [] }))
const { default: VenditeB2BView } = await import('../../src/views/VenditeB2BView.jsx')
afterEach(() => cleanup())

const oggi = new Date().toISOString().slice(0, 10)
const v = (o) => ({ id: Math.random().toString(36).slice(2), data: oggi, cliente_nome: 'BAR PROVA', stato: 'consegnata', pagata: false, totale: 120, righe: [], ...o })

it('al telefono «Segna come incassata» è alto 44 px, anche da incassato', async () => {
  VENDITE = [v({}), v({ pagata: true, data_pagamento: oggi })]
  render(<VenditeB2BView orgId="o1" sedeId="s1" sedi={[]} ricettario={{ ricette: {} }} notify={() => {}} />)
  const da = await screen.findByRole('button', { name: 'Segna come incassata' })
  const gia = await screen.findByRole('button', { name: 'Segna come da incassare' })
  for (const b of [da, gia]) expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
})
