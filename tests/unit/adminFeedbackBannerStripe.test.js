// Inbox feedback, banner globali e report Stripe del pannello admin.
//
// Tre moduli scorporati da api/admin.js che fino al 15/09/2026 non avevano
// nemmeno un test. Il report Stripe è quello che dice al titolare quanto
// incassa davvero al mese: se sbaglia, sbaglia il numero su cui prende le
// decisioni.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Finto database, minimo ma fedele: la libreria di Supabase restituisce
// l'errore, non lo lancia.
function db(tabelle = {}, errori = {}) {
  const scritture = []
  function catena(nome) {
    const stato = { filtri: {} }
    const risposta = () => errori[nome]
      ? { data: null, error: { message: errori[nome] } }
      : { data: tabelle[nome] || [], error: null }
    const c = {
      select: () => c, order: () => c, limit: () => c, in: () => c,
      eq: (k, v) => { stato.filtri[k] = v; return c },
      insert: (v) => { stato.insert = v; return c },
      update: (v) => { stato.update = v; return c },
      delete: () => { stato.delete = true; return c },
      single: async () => {
        if (stato.insert) scritture.push({ tabella: nome, op: 'insert', valori: stato.insert })
        return errori[nome] ? { data: null, error: { message: errori[nome] } } : { data: { id: 'nuovo', ...stato.insert }, error: null }
      },
      then: (r) => {
        if (stato.update) { scritture.push({ tabella: nome, op: 'update', valori: stato.update, filtri: { ...stato.filtri } }); stato.update = null }
        if (stato.delete) { scritture.push({ tabella: nome, op: 'delete', filtri: { ...stato.filtri } }); stato.delete = false }
        if (stato.insert) { scritture.push({ tabella: nome, op: 'insert', valori: stato.insert }); stato.insert = null }
        return Promise.resolve(risposta()).then(r)
      },
    }
    return c
  }
  return { client: { from: catena }, scritture }
}

const stripeFinto = {
  subscriptions: { list: vi.fn() },
  charges: { list: vi.fn(async () => ({ data: [] })) },
  events: { list: vi.fn(async () => ({ data: [] })) },
}
vi.mock('../../api/lib/admin/stripeClient.js', () => ({ getStripe: async () => stripeFinto }))

const { getFeedback, azFeedbackMarcaGestito, getBanners, azBannerCrea, azBannerDisattiva, azBannerElimina } =
  await import('../../api/lib/admin/feedbackBanner.js')
const { getStripeMrr, getStripeEvents, STRIPE_EVENT_TYPES } =
  await import('../../api/lib/admin/stripeReport.js')

beforeEach(() => { vi.clearAllMocks() })

describe('inbox feedback', () => {
  it('attacca a ogni segnalazione il nome dell\'attività', () => {
    // Senza il nome, l'elenco è una colonna di identificativi.
    return (async () => {
      const d = db({
        feedback: [{ id: 'f1', organization_id: 'o1', messaggio: 'non va' }],
        organizations: [{ id: 'o1', nome: 'Mara dei Boschi' }],
      })
      const r = await getFeedback(d.client, false)
      expect(r[0].nome_attivita).toBe('Mara dei Boschi')
    })()
  })

  it('una segnalazione senza organizzazione non fa esplodere niente', async () => {
    const d = db({ feedback: [{ id: 'f1', organization_id: null, messaggio: 'x' }], organizations: [] })
    const r = await getFeedback(d.client, false)
    expect(r[0].nome_attivita).toBe(null)
  })

  it('un\'organizzazione cancellata lascia il nome vuoto, non un errore', async () => {
    const d = db({ feedback: [{ id: 'f1', organization_id: 'sparita' }], organizations: [] })
    expect((await getFeedback(d.client, false))[0].nome_attivita).toBe(null)
  })

  it('nessuna segnalazione: elenco vuoto', async () => {
    expect(await getFeedback(db({ feedback: [] }).client, false)).toEqual([])
  })

  it('un errore del database non si nasconde', async () => {
    const d = db({}, { feedback: 'permission denied' })
    await expect(getFeedback(d.client, false)).rejects.toThrow(/permission denied/)
  })

  it('segnare come gestito scrive chi e quando', async () => {
    const d = db({ feedback: [] })
    await azFeedbackMarcaGestito(d.client, 'f1', 'greg@maradeiboschi.com', true)
    const u = d.scritture.find(s => s.op === 'update')
    expect(u.valori.gestito).toBe(true)
    expect(u.valori.gestito_by).toBe('greg@maradeiboschi.com')
    expect(u.valori.gestito_at).toBeTruthy()
    expect(u.filtri.id).toBe('f1')
  })

  it('e rimetterla da gestire cancella chi e quando', async () => {
    const d = db({ feedback: [] })
    await azFeedbackMarcaGestito(d.client, 'f1', 'greg@x.it', false)
    const u = d.scritture.find(s => s.op === 'update')
    expect(u.valori).toEqual({ gestito: false, gestito_at: null, gestito_by: null })
  })
})

describe('banner globali', () => {
  it('un banner senza messaggio non si crea', async () => {
    const d = db({ app_banners: [] })
    for (const m of ['', '   ', null, undefined]) {
      await expect(azBannerCrea(d.client, { messaggio: m }, 'a@b.it'), String(m))
        .rejects.toThrow(/Messaggio obbligatorio/)
    }
  })

  it('la gravità sta fra le quattro previste, altrimenti è «info»', async () => {
    const d = db({ app_banners: [] })
    for (const [chiesta, attesa] of [['warn', 'warn'], ['critical', 'critical'], ['success', 'success'],
                                     ['info', 'info'], ['catastrofe', 'info'], [undefined, 'info']]) {
      const r = await azBannerCrea(d.client, { messaggio: 'x', severity: chiesta }, 'a@b.it')
      expect(r.tipo, String(chiesta)).toBe(attesa)
    }
  })

  it('una scadenza già passata viene ignorata', async () => {
    const d = db({ app_banners: [] })
    const r = await azBannerCrea(d.client, { messaggio: 'x', scade_il: '2020-01-01' }, 'a@b.it')
    expect(r.scade_il).toBe(null)
  })

  it('una scadenza futura si tiene', async () => {
    const d = db({ app_banners: [] })
    const domani = new Date(Date.now() + 86400000).toISOString()
    const r = await azBannerCrea(d.client, { messaggio: 'x', scade_il: domani }, 'a@b.it')
    expect(new Date(r.scade_il).getTime()).toBeGreaterThan(Date.now())
  })

  it('una data senza senso non fa esplodere niente', async () => {
    const d = db({ app_banners: [] })
    const r = await azBannerCrea(d.client, { messaggio: 'x', scade_il: 'domani forse' }, 'a@b.it')
    expect(r.scade_il).toBe(null)
  })

  it('nasce acceso e con il nome di chi l\'ha scritto', async () => {
    const d = db({ app_banners: [] })
    const r = await azBannerCrea(d.client, { messaggio: 'Manutenzione stanotte' }, 'greg@x.it')
    expect(r.attivo).toBe(true)
    expect(r.creato_da).toBe('greg@x.it')
    expect(r.messaggio).toBe('Manutenzione stanotte')
  })

  it('spegnere e cancellare fanno cose diverse', async () => {
    const d = db({ app_banners: [] })
    await azBannerDisattiva(d.client, 'b1')
    await azBannerElimina(d.client, 'b2')
    expect(d.scritture.find(s => s.op === 'update')).toMatchObject({ valori: { attivo: false }, filtri: { id: 'b1' } })
    expect(d.scritture.find(s => s.op === 'delete')).toMatchObject({ filtri: { id: 'b2' } })
  })

  it('gli errori del database arrivano a chi chiama', async () => {
    const d = db({}, { app_banners: 'tabella assente' })
    await expect(getBanners(d.client)).rejects.toThrow(/tabella assente/)
    await expect(azBannerDisattiva(d.client, 'b1')).rejects.toThrow(/tabella assente/)
    await expect(azBannerElimina(d.client, 'b1')).rejects.toThrow(/tabella assente/)
  })
})

// ── Stripe: il numero su cui il titolare prende le decisioni ───────────────
const abb = (status, importo, interval = 'month', interval_count = 1, quantity = 1) => ({
  status,
  items: { data: [{ quantity, price: { unit_amount: importo, recurring: { interval, interval_count } } }] },
})

describe('ricavo mensile da Stripe', () => {
  const pagina = (subs, has_more = false) => ({ data: subs, has_more })

  it('somma solo gli abbonamenti attivi e in prova', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([
      abb('active', 14900),
      abb('trialing', 14900),
      abb('canceled', 14900),
      abb('past_due', 14900),
      abb('incomplete', 14900),
    ]))
    const r = await getStripeMrr()
    expect(r.mrr_cents).toBe(14900)              // solo l'attivo
    expect(r.mrr_trialing_cents).toBe(14900)     // la prova sta a parte
    expect(r.mrr_totale_cents).toBe(29800)
    expect(r.sub_canceled).toBe(1)
    expect(r.sub_past_due).toBe(1)
  })

  it('un abbonamento annuale vale un dodicesimo al mese', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([abb('active', 120000, 'year')]))
    expect((await getStripeMrr()).mrr_cents).toBe(10000)
  })

  it('e uno settimanale vale 4,33 settimane', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([abb('active', 1000, 'week')]))
    expect((await getStripeMrr()).mrr_cents).toBe(4330)
  })

  it('ogni due mesi vale la metà', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([abb('active', 20000, 'month', 2)]))
    expect((await getStripeMrr()).mrr_cents).toBe(10000)
  })

  it('più licenze sullo stesso abbonamento si moltiplicano', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([abb('active', 14900, 'month', 1, 3)]))
    expect((await getStripeMrr()).mrr_cents).toBe(44700)
  })

  it('una voce senza importo non fa esplodere il conto', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([
      { status: 'active', items: { data: [{ price: { unit_amount: null } }, { price: null }] } },
      { status: 'active' },
    ]))
    const r = await getStripeMrr()
    expect(r.mrr_cents).toBe(0)
    expect(r.sub_active).toBe(2)
  })

  it('legge più pagine, ma non all\'infinito', async () => {
    // Senza il freno, un errore di Stripe che risponde sempre `has_more`
    // terrebbe la funzione in un giro senza fine.
    stripeFinto.subscriptions.list.mockImplementation(async () => ({
      data: [{ ...abb('active', 100), id: 'sub_x' }], has_more: true,
    }))
    const r = await getStripeMrr()
    expect(stripeFinto.subscriptions.list.mock.calls.length).toBeLessThanOrEqual(10)
    expect(r.mrr_cents).toBe(1000)
  })

  it('conta i pagamenti falliti dell\'ultimo mese', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([]))
    stripeFinto.charges.list.mockResolvedValueOnce({ data: [
      { status: 'failed' }, { status: 'succeeded' }, { status: 'failed' },
    ] })
    expect((await getStripeMrr()).failed_30d).toBe(2)
  })

  it('se i pagamenti non si leggono, il ricavo si dà lo stesso', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([abb('active', 14900)]))
    stripeFinto.charges.list.mockRejectedValueOnce(new Error('Stripe giù'))
    const r = await getStripeMrr()
    expect(r.mrr_cents).toBe(14900)
    expect(r.failed_30d).toBe(0)
  })

  it('senza abbonamenti risponde zero, non un errore', async () => {
    stripeFinto.subscriptions.list.mockResolvedValueOnce(pagina([]))
    const r = await getStripeMrr()
    expect(r.mrr_totale_cents).toBe(0)
    expect(r.valuta).toBe('EUR')
  })
})

describe('eventi Stripe recenti', () => {
  it('chiede solo i tipi che interessano', async () => {
    await getStripeEvents()
    expect(stripeFinto.events.list.mock.calls[0][0].types).toBe(STRIPE_EVENT_TYPES)
    expect(STRIPE_EVENT_TYPES).toContain('invoice.payment_failed')
    expect(STRIPE_EVENT_TYPES).toContain('customer.subscription.deleted')
  })

  it('tira fuori email, importo e cliente da forme diverse', async () => {
    stripeFinto.events.list.mockResolvedValueOnce({ data: [
      { id: 'e1', created: 1700000000, type: 'invoice.payment_succeeded', livemode: true,
        data: { object: { customer: 'cus_1', customer_email: 'a@b.it', amount_paid: 14900, currency: 'eur', status: 'paid' } } },
      { id: 'e2', created: 1700000001, type: 'charge.failed', livemode: false,
        data: { object: { customer: { id: 'cus_2' }, receipt_email: 'c@d.it', amount: 900 } } },
      { id: 'e3', created: 1700000002, type: 'customer.created', data: { object: { total: 50 } } },
    ] })
    const r = await getStripeEvents()
    expect(r[0]).toMatchObject({ customer_id: 'cus_1', customer_email: 'a@b.it', amount_cents: 14900, currency: 'eur' })
    expect(r[1]).toMatchObject({ customer_id: 'cus_2', customer_email: 'c@d.it', amount_cents: 900 })
    expect(r[2].amount_cents).toBe(50)
    expect(r[2].customer_id).toBe(null)
  })

  it('la data arriva in millisecondi, non in secondi', async () => {
    stripeFinto.events.list.mockResolvedValueOnce({ data: [{ id: 'e', created: 1700000000, type: 'x', data: { object: {} } }] })
    expect((await getStripeEvents())[0].created).toBe(1700000000000)
  })

  it('nessun evento: elenco vuoto', async () => {
    stripeFinto.events.list.mockResolvedValueOnce({ data: null })
    expect(await getStripeEvents()).toEqual([])
  })
})
