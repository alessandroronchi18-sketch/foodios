// fattureInCloud — wrapper API FiC per emissione fatture SDI.
// Test mockando safeFetch sotto-jacent (globalThis.fetch) per simulare
// le risposte FiC senza chiamare la rete.
//
// Audit coverage:
//   - upsertCliente: escape P.IVA (alfanumerico, max 16 char, encodeURIComponent)
//     vs vecchio confronto buggy (audit 2026-07-01 HIGH).
//   - emettiFatturaElettronica: throw con partialCreated:true se manca
//     invoice id; flag sdiTransmitFailed se /e_invoice/send fallisce.
//   - getInvoicePdfUrl: ritorna attachment_url o null.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('fattureInCloud', () => {
  let origFetch
  let origToken
  let origCompany
  let mod

  beforeEach(async () => {
    origFetch = globalThis.fetch
    origToken = process.env.FATTUREINCLOUD_API_TOKEN
    origCompany = process.env.FATTUREINCLOUD_COMPANY_ID
    process.env.FATTUREINCLOUD_API_TOKEN = 'token-test-abc'
    process.env.FATTUREINCLOUD_COMPANY_ID = '12345'
    // Re-import per isolare la _vatTypeCache (module-level Map).
    vi.resetModules()
    mod = await import('../../api/lib/fattureInCloud.js')
  })

  afterEach(() => {
    globalThis.fetch = origFetch
    process.env.FATTUREINCLOUD_API_TOKEN = origToken
    process.env.FATTUREINCLOUD_COMPANY_ID = origCompany
  })

  // ─── getConfig (via altre funzioni) ────────────────────────────────────

  describe('config fail-closed', () => {
    it('manca FATTUREINCLOUD_API_TOKEN → throw', async () => {
      delete process.env.FATTUREINCLOUD_API_TOKEN
      vi.resetModules()
      const m = await import('../../api/lib/fattureInCloud.js')
      await expect(m.upsertCliente({ ragioneSociale: 'X', partitaIva: '12345678901' }))
        .rejects.toThrow(/FATTUREINCLOUD_API_TOKEN/)
    })

    it('manca FATTUREINCLOUD_COMPANY_ID → throw', async () => {
      delete process.env.FATTUREINCLOUD_COMPANY_ID
      vi.resetModules()
      const m = await import('../../api/lib/fattureInCloud.js')
      await expect(m.upsertCliente({ ragioneSociale: 'X', partitaIva: '12345678901' }))
        .rejects.toThrow(/FATTUREINCLOUD_COMPANY_ID/)
    })
  })

  // ─── upsertCliente ────────────────────────────────────────────────────

  describe('upsertCliente', () => {
    it('cliente esistente per P.IVA → ritorna id senza POST', async () => {
      globalThis.fetch = vi.fn(async (url, opts) => {
        // GET ricerca
        expect(opts.method).toBe('GET')
        expect(url).toContain('/entities/clients?q=')
        expect(url).toContain('vat_number')
        return new Response(JSON.stringify({ data: [{ id: 999, name: 'Mara dei Boschi SRL' }] }), { status: 200 })
      })
      const out = await mod.upsertCliente({
        ragioneSociale: 'Mara dei Boschi SRL',
        partitaIva: 'IT12345678901',
      })
      expect(out).toEqual({ id: 999, name: 'Mara dei Boschi SRL', isNew: false })
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('cliente NON esistente → POST insert + ritorna isNew:true', async () => {
      let call = 0
      globalThis.fetch = vi.fn(async (url, opts) => {
        call++
        if (call === 1) {
          expect(opts.method).toBe('GET')
          return new Response(JSON.stringify({ data: [] }), { status: 200 })
        }
        expect(opts.method).toBe('POST')
        const body = JSON.parse(opts.body)
        expect(body.data.name).toBe('Nuovo Cliente')
        expect(body.data.vat_number).toBe('IT12345678901')
        return new Response(JSON.stringify({ data: { id: 42, name: 'Nuovo Cliente' } }), { status: 200 })
      })
      const out = await mod.upsertCliente({
        ragioneSociale: 'Nuovo Cliente',
        partitaIva: 'IT12345678901',
      })
      expect(out).toEqual({ id: 42, name: 'Nuovo Cliente', isNew: true })
      expect(call).toBe(2)
    })

    it('P.IVA con punti/caratteri sporchi → sanitizzata alfanumerico (audit 2026-07-01 HIGH)', async () => {
      // input '12345.678901' → alfanum '12345678901' (11 char OK).
      let getUrl = null
      globalThis.fetch = vi.fn(async (url, opts) => {
        if (opts.method === 'GET') {
          getUrl = url
          return new Response(JSON.stringify({ data: [{ id: 1, name: 'X' }] }), { status: 200 })
        }
      })
      await mod.upsertCliente({ ragioneSociale: 'X', partitaIva: '12345.678901' })
      // L'URL contiene la stringa sanitizzata "12345678901" encoded.
      expect(getUrl).toBeTruthy()
      const decoded = decodeURIComponent(getUrl)
      expect(decoded).toContain('vat_number = "12345678901"')
      // NON contiene il punto.
      expect(decoded).not.toContain('12345.678901')
    })

    it('P.IVA con virgolette → escape (no injection)', async () => {
      let getUrl = null
      globalThis.fetch = vi.fn(async (url, opts) => {
        if (opts.method === 'GET') {
          getUrl = url
          return new Response(JSON.stringify({ data: [] }), { status: 200 })
        }
        return new Response(JSON.stringify({ data: { id: 7, name: 'Y' } }), { status: 200 })
      })
      await mod.upsertCliente({ ragioneSociale: 'Y', partitaIva: '12345" OR 1=1 --' })
      // I caratteri non alfanumerici (incluse virgolette dentro l'input)
      // sono stripped → rimangono solo alfanumerici tra le virgolette del
      // query language: vat_number = "12345OR11" (max 16 char).
      const decoded = decodeURIComponent(getUrl)
      // Estrae il valore interno fra le virgolette del query.
      const m = decoded.match(/vat_number = "([^"]*)"/)
      expect(m).toBeTruthy()
      const sanitized = m[1]
      // Solo alfanumerico, niente quote/spazi/operatori SQL.
      expect(sanitized).toMatch(/^[A-Za-z0-9]+$/)
      expect(sanitized).not.toContain(' ')
      expect(sanitized).not.toContain('--')
      expect(sanitized.length).toBeLessThanOrEqual(16)
    })

    it('P.IVA < 8 char → salta search, fa direttamente POST', async () => {
      let calls = []
      globalThis.fetch = vi.fn(async (url, opts) => {
        calls.push(opts.method)
        return new Response(JSON.stringify({ data: { id: 100, name: 'Z' } }), { status: 200 })
      })
      const out = await mod.upsertCliente({ ragioneSociale: 'Z', partitaIva: '1234' })
      expect(calls).toEqual(['POST'])
      expect(out.isNew).toBe(true)
    })

    it('senza P.IVA → direttamente POST insert', async () => {
      let calls = []
      globalThis.fetch = vi.fn(async (url, opts) => {
        calls.push(opts.method)
        return new Response(JSON.stringify({ data: { id: 11, name: 'W' } }), { status: 200 })
      })
      await mod.upsertCliente({ ragioneSociale: 'W' })
      expect(calls).toEqual(['POST'])
    })

    it('search FiC throws → NON blocca, prosegue con POST', async () => {
      let call = 0
      globalThis.fetch = vi.fn(async (url, opts) => {
        call++
        if (call === 1) return new Response('{"error":{"message":"boom"}}', { status: 500 })
        return new Response(JSON.stringify({ data: { id: 50, name: 'Q' } }), { status: 200 })
      })
      const out = await mod.upsertCliente({ ragioneSociale: 'Q', partitaIva: '12345678901' })
      expect(out.isNew).toBe(true)
      expect(out.id).toBe(50)
    })

    it('header Authorization Bearer + Content-Type JSON', async () => {
      let opts = null
      globalThis.fetch = vi.fn(async (url, o) => {
        opts = o
        return new Response(JSON.stringify({ data: [{ id: 1, name: 'X' }] }), { status: 200 })
      })
      await mod.upsertCliente({ ragioneSociale: 'X', partitaIva: '12345678901' })
      expect(opts.headers.Authorization).toBe('Bearer token-test-abc')
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(opts.headers.Accept).toBe('application/json')
    })

    it('payload include tutti i campi cliente (PEC, codice destinatario, indirizzo)', async () => {
      let body = null
      globalThis.fetch = vi.fn(async (url, opts) => {
        if (opts.method === 'GET') return new Response('{"data":[]}', { status: 200 })
        body = JSON.parse(opts.body)
        return new Response(JSON.stringify({ data: { id: 9, name: 'Foo' } }), { status: 200 })
      })
      await mod.upsertCliente({
        ragioneSociale: 'Foo SRL',
        partitaIva: 'IT12345678901',
        codiceFiscale: 'RSSMRA80A01H501Z',
        indirizzo: 'Via Roma 1',
        cap: '10100',
        citta: 'Torino',
        provincia: 'TO',
        codiceDestinatario: '0000000',
        pec: 'foo@pec.it',
        email: 'foo@example.com',
      })
      expect(body.data.address_street).toBe('Via Roma 1')
      expect(body.data.address_city).toBe('Torino')
      expect(body.data.address_postal_code).toBe('10100')
      expect(body.data.address_province).toBe('TO')
      expect(body.data.certified_email).toBe('foo@pec.it')
      expect(body.data.ei_code).toBe('0000000')
      expect(body.data.email).toBe('foo@example.com')
      expect(body.data.tax_code).toBe('RSSMRA80A01H501Z')
      expect(body.data.country).toBe('IT')
    })
  })

  // ─── emettiFatturaElettronica ─────────────────────────────────────────

  describe('emettiFatturaElettronica', () => {
    it('crea fattura + trasmette SDI con successo', async () => {
      const calls = []
      globalThis.fetch = vi.fn(async (url, opts) => {
        calls.push({ url, method: opts.method })
        // vat_types
        if (url.includes('/info/vat_types')) {
          return new Response(JSON.stringify({ data: [{ id: 7, value: 22 }, { id: 8, value: 10 }] }), { status: 200 })
        }
        // POST issued_documents
        if (url.endsWith('/issued_documents') && opts.method === 'POST') {
          return new Response(JSON.stringify({ data: { id: 555, number: '1/A' } }), { status: 200 })
        }
        // POST e_invoice/send
        if (url.endsWith('/e_invoice/send')) {
          return new Response(JSON.stringify({ data: { status: 'ok' } }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      })
      const out = await mod.emettiFatturaElettronica({
        clienteId: 999,
        data: '2026-06-17',
        scadenza: '2026-07-17',
        importoNetto: 100,
        aliquotaIva: 22,
        stripeInvoiceId: 'in_test_123',
      })
      expect(out.id).toBe(555)
      expect(out.sdiTransmitFailed).toBeUndefined()
      expect(calls.some(c => c.url.includes('/e_invoice/send'))).toBe(true)
    })

    it('FiC NON ritorna invoice id → throw Error con partialCreated:true (audit 2026-07-01 HIGH)', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('/info/vat_types')) {
          return new Response(JSON.stringify({ data: [{ id: 7, value: 22 }] }), { status: 200 })
        }
        // Risposta senza id
        return new Response(JSON.stringify({ data: {} }), { status: 200 })
      })
      let err
      try {
        await mod.emettiFatturaElettronica({ clienteId: 1, data: '2026-06-17', scadenza: '2026-07-17', importoNetto: 89, transmit: false })
      } catch (e) { err = e }
      expect(err).toBeDefined()
      expect(err.message).toMatch(/invoice id/i)
      expect(err.partialCreated).toBe(true)
      expect(err.ficRawResponse).toBeDefined()
    })

    it('SDI send fallisce → ritorna fattura con sdiTransmitFailed:true (audit 2026-07-01 LOW)', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('/info/vat_types')) {
          return new Response(JSON.stringify({ data: [{ id: 7, value: 22 }] }), { status: 200 })
        }
        if (url.endsWith('/issued_documents')) {
          return new Response(JSON.stringify({ data: { id: 777 } }), { status: 200 })
        }
        if (url.endsWith('/e_invoice/send')) {
          return new Response(JSON.stringify({ error: { message: 'sdi temporaneo down' } }), { status: 502 })
        }
        return new Response('{}', { status: 200 })
      })
      const out = await mod.emettiFatturaElettronica({
        clienteId: 1, data: '2026-06-17', scadenza: '2026-07-17',
        importoNetto: 89, transmit: true,
      })
      expect(out.id).toBe(777)
      expect(out.sdiTransmitFailed).toBe(true)
      expect(out.sdiError).toMatch(/sdi temporaneo down|502/)
    })

    it('transmit:false → NON chiama /e_invoice/send', async () => {
      const calls = []
      globalThis.fetch = vi.fn(async (url) => {
        calls.push(url)
        if (url.includes('/info/vat_types')) {
          return new Response(JSON.stringify({ data: [{ id: 7, value: 22 }] }), { status: 200 })
        }
        return new Response(JSON.stringify({ data: { id: 888 } }), { status: 200 })
      })
      const out = await mod.emettiFatturaElettronica({
        clienteId: 1, data: '2026-06-17', scadenza: '2026-07-17',
        importoNetto: 89, transmit: false,
      })
      expect(out.id).toBe(888)
      expect(calls.some(u => u.includes('/e_invoice/send'))).toBe(false)
    })

    it('vatId null se aliquota non in vat_types → fallback solo percentage', async () => {
      let postBody = null
      globalThis.fetch = vi.fn(async (url, opts) => {
        if (url.includes('/info/vat_types')) {
          // 22% non presente
          return new Response(JSON.stringify({ data: [{ id: 7, value: 10 }] }), { status: 200 })
        }
        if (opts.method === 'POST' && url.endsWith('/issued_documents')) {
          postBody = JSON.parse(opts.body)
          return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      })
      await mod.emettiFatturaElettronica({
        clienteId: 1, data: '2026-06-17', scadenza: '2026-07-17',
        importoNetto: 100, aliquotaIva: 22, transmit: false,
      })
      expect(postBody.data.items_list[0].vat).toEqual({ percentage: 22 })
    })

    it('cache vat_types: 2 chiamate sequenziali → /info/vat_types invocato 1 sola volta', async () => {
      let vatCalls = 0
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('/info/vat_types')) {
          vatCalls++
          return new Response(JSON.stringify({ data: [{ id: 7, value: 22 }] }), { status: 200 })
        }
        return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 })
      })
      await mod.emettiFatturaElettronica({ clienteId: 1, data: '2026-06-17', scadenza: '2026-07-17', importoNetto: 50, transmit: false })
      await mod.emettiFatturaElettronica({ clienteId: 2, data: '2026-06-17', scadenza: '2026-07-17', importoNetto: 50, transmit: false })
      expect(vatCalls).toBe(1)
    })

    it('payload include tutti i campi richiesti: ei_data, payments_list, items_list', async () => {
      let body = null
      globalThis.fetch = vi.fn(async (url, opts) => {
        if (url.includes('/info/vat_types')) {
          return new Response(JSON.stringify({ data: [{ id: 7, value: 22 }] }), { status: 200 })
        }
        if (url.endsWith('/issued_documents')) {
          body = JSON.parse(opts.body)
          return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      })
      await mod.emettiFatturaElettronica({
        clienteId: 7, data: '2026-06-17', scadenza: '2026-07-17',
        importoNetto: 89, aliquotaIva: 22, stripeInvoiceId: 'in_X',
        transmit: false,
      })
      expect(body.data.type).toBe('invoice')
      expect(body.data.e_invoice).toBe(true)
      expect(body.data.ei_data.payment_method).toBe('MP08')
      expect(body.data.entity.id).toBe(7)
      expect(body.data.currency.id).toBe('EUR')
      // Payment list importo = 89 * 1.22 = 108.58
      expect(body.data.payments_list[0].amount).toBeCloseTo(108.58, 2)
      expect(body.data.payments_list[0].status).toBe('paid')
      expect(body.data.items_list[0].code).toBe('FOODIOS-SUB')
      expect(body.data.items_list[0].vat.id).toBe(7)
      expect(body.data.notes).toContain('in_X')
    })

    it('data default = oggi se non passata', async () => {
      let body = null
      globalThis.fetch = vi.fn(async (url, opts) => {
        if (url.includes('/info/vat_types')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 })
        }
        body = JSON.parse(opts.body)
        return new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 })
      })
      await mod.emettiFatturaElettronica({ clienteId: 1, scadenza: '2026-07-17', importoNetto: 10, transmit: false })
      expect(body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ─── getInvoicePdfUrl ─────────────────────────────────────────────────

  describe('getInvoicePdfUrl', () => {
    it('ritorna attachment_url se presente', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        expect(url).toContain('/issued_documents/123')
        expect(url).toContain('attachment_url')
        return new Response(JSON.stringify({ data: { attachment_url: 'https://fic.it/pdf/abc.pdf' } }), { status: 200 })
      })
      const url = await mod.getInvoicePdfUrl(123)
      expect(url).toBe('https://fic.it/pdf/abc.pdf')
    })

    it('ritorna null se attachment_url mancante', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ data: {} }), { status: 200 }))
      const url = await mod.getInvoicePdfUrl(999)
      expect(url).toBeNull()
    })

    it('HTTP error → throw Error con status', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 }))
      let err
      try { await mod.getInvoicePdfUrl(1) } catch (e) { err = e }
      expect(err).toBeDefined()
      expect(err.status).toBe(404)
      expect(err.message).toMatch(/not found/i)
    })
  })

  // ─── getFicVatTypeId (esposto) ─────────────────────────────────────────

  describe('getFicVatTypeId', () => {
    it('percentage non finita → null', async () => {
      const id = await mod.getFicVatTypeId('12345', NaN)
      expect(id).toBeNull()
    })

    it('match tolleranza 0.001 sul valore', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 7, value: 22 }, { id: 8, value: 10 }] }), { status: 200 }))
      const id = await mod.getFicVatTypeId('12345', 22.0001)
      expect(id).toBe(7)
    })

    it('no match → null', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 7, value: 22 }] }), { status: 200 }))
      const id = await mod.getFicVatTypeId('12345', 4)
      expect(id).toBeNull()
    })

    it('fetch errore → null (degradation graceful)', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response('boom', { status: 500 }))
      const id = await mod.getFicVatTypeId('12345', 22)
      expect(id).toBeNull()
    })
  })
})
