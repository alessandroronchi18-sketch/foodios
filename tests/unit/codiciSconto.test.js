// I codici sconto: 98 righe che decidono quanto paga un cliente, e fino al
// 15/09/2026 senza nemmeno un test.
//
// Due difetti trovati scrivendoli:
//   • un codice pensato «per i primi cinque clienti» si poteva regalare a
//     mano a cinquanta: il limite di usi non veniva guardato;
//   • un codice scaduto funzionava ancora.
// E il contatore degli usi si alzava solo quando pagava un cliente vero, non
// quando il codice lo regalava il titolare dal pannello.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Un finto database: ricorda cosa gli si chiede e cosa gli si scrive.
function db(tabelle = {}) {
  const scritture = []
  function catena(nome) {
    const stato = { filtri: {} }
    const c = {
      select: () => c,
      insert: (v) => { scritture.push({ tabella: nome, op: 'insert', valori: v }); return c },
      update: (v) => { stato.update = v; return c },
      delete: () => { stato.delete = true; return c },
      // I filtri si raccolgono tutti, e la scrittura si registra solo quando
      // la catena viene attesa: altrimenti un secondo `.eq()` di sicurezza —
      // «aggiorna solo se il conteggio è ancora quello che ho letto» — non
      // risulterebbe da nessuna parte.
      eq: (k, v) => { stato.filtri[k] = v; return c },
      order: () => c, limit: () => c,
      maybeSingle: async () => ({ data: trova(nome, stato.filtri), error: null }),
      single: async () => ({ data: trova(nome, stato.filtri), error: null }),
      then: (r) => {
        if (stato.update) { scritture.push({ tabella: nome, op: 'update', valori: stato.update, filtri: { ...stato.filtri } }); stato.update = null }
        if (stato.delete) { scritture.push({ tabella: nome, op: 'delete', filtri: { ...stato.filtri } }); stato.delete = false }
        return Promise.resolve({ data: tabelle[nome] || [], error: null }).then(r)
      },
    }
    return c
  }
  function trova(nome, filtri) {
    const righe = tabelle[nome] || []
    const chiavi = Object.keys(filtri)
    return righe.find(r => chiavi.every(k => r[k] === filtri[k])) || null
  }
  return { client: { from: catena }, scritture }
}

const stripeFinto = {
  coupons: { create: vi.fn(async (p) => ({ id: 'cp_1', ...p })), del: vi.fn(async () => ({})) },
  promotionCodes: { create: vi.fn(async (p) => ({ id: 'promo_1', ...p })), update: vi.fn(async () => ({})) },
  subscriptions: { retrieve: vi.fn(async () => ({ trial_end: null })), update: vi.fn(async () => ({})) },
}
vi.mock('../../api/lib/admin/stripeClient.js', () => ({ getStripe: async () => stripeFinto }))

const {
  normalizzaCodice, creaCodiceSconto, applicaCodiceManuale,
  disattivaCodiceSconto, eliminaCodiceSconto, getCodiciSconto,
} = await import('../../api/lib/admin/codiciSconto.js')

beforeEach(() => { vi.clearAllMocks() })

describe('normalizzaCodice', () => {
  it('maiuscolo, senza spazi, solo lettere numeri trattino e underscore', () => {
    expect(normalizzaCodice('  natale2026 ')).toBe('NATALE2026')
    expect(normalizzaCodice('primi-5_clienti')).toBe('PRIMI-5_CLIENTI')
    expect(normalizzaCodice('sconto 50%!')).toBe('SCONTO50')
    expect(normalizzaCodice('caffè')).toBe('CAFF')
  })

  it('regge il vuoto e i tipi sbagliati', () => {
    for (const v of ['', null, undefined]) expect(normalizzaCodice(v)).toBe('')
    expect(normalizzaCodice(12345)).toBe('12345')
  })
})

describe('creare un codice: cosa non si accetta', () => {
  const base = { codice: 'SCONTO10', valore_sconto: 10 }
  const vuoto = () => db({ discount_codes: [] }).client

  it('il codice deve stare fra 3 e 30 caratteri', async () => {
    await expect(creaCodiceSconto(vuoto(), { ...base, codice: 'AB' }, 'a@b.it'))
      .rejects.toThrow(/3-30/)
    await expect(creaCodiceSconto(vuoto(), { ...base, codice: 'A'.repeat(31) }, 'a@b.it'))
      .rejects.toThrow(/3-30/)
  })

  it('il valore dello sconto dev\'essere un numero positivo', async () => {
    for (const v of [0, -5, 'molto', null, undefined]) {
      await expect(creaCodiceSconto(vuoto(), { ...base, valore_sconto: v }, 'a@b.it'), String(v))
        .rejects.toThrow(/Valore sconto non valido/)
    }
  })

  it('una percentuale sopra il 100 non esiste', async () => {
    await expect(creaCodiceSconto(vuoto(), { ...base, tipo_sconto: 'percent', valore_sconto: 150 }, 'a@b.it'))
      .rejects.toThrow(/Percentuale massima/)
  })

  it('uno sconto fisso spropositato viene fermato', async () => {
    await expect(creaCodiceSconto(vuoto(), { ...base, tipo_sconto: 'amount', valore_sconto: 2_000_000 }, 'a@b.it'))
      .rejects.toThrow(/troppo alto/)
  })

  it('due codici con lo stesso nome no', async () => {
    const d = db({ discount_codes: [{ id: 'x', codice: 'SCONTO10' }] })
    await expect(creaCodiceSconto(d.client, base, 'a@b.it')).rejects.toThrow(/già esistente/)
  })
})

describe('creare un codice: cosa arriva a Stripe', () => {
  it('una percentuale diventa percent_off, un importo amount_off in euro', async () => {
    const d = db({ discount_codes: [] })
    await creaCodiceSconto(d.client, { codice: 'META', tipo_sconto: 'percent', valore_sconto: 50 }, 'a@b.it')
    expect(stripeFinto.coupons.create.mock.calls[0][0]).toMatchObject({ percent_off: 50, duration: 'once' })

    vi.clearAllMocks()
    await creaCodiceSconto(d.client, { codice: 'VENTI', tipo_sconto: 'amount', valore_sconto: 2000 }, 'a@b.it')
    expect(stripeFinto.coupons.create.mock.calls[0][0]).toMatchObject({ amount_off: 2000, currency: 'eur' })
  })

  it('«per N mesi» porta con sé il numero di mesi, fra 1 e 60', async () => {
    const d = db({ discount_codes: [] })
    await creaCodiceSconto(d.client, { codice: 'TREMESI', valore_sconto: 20, durata: 'repeating', durata_mesi: 3 }, 'a@b.it')
    expect(stripeFinto.coupons.create.mock.calls[0][0]).toMatchObject({ duration: 'repeating', duration_in_months: 3 })

    vi.clearAllMocks()
    await creaCodiceSconto(d.client, { codice: 'TROPPI', valore_sconto: 20, durata: 'repeating', durata_mesi: 999 }, 'a@b.it')
    expect(stripeFinto.coupons.create.mock.calls[0][0].duration_in_months).toBe(60)
  })

  it('una durata inventata diventa «una volta sola»', async () => {
    const d = db({ discount_codes: [] })
    await creaCodiceSconto(d.client, { codice: 'STRANO', valore_sconto: 10, durata: 'per_sempre_forse' }, 'a@b.it')
    expect(stripeFinto.coupons.create.mock.calls[0][0].duration).toBe('once')
  })

  it('una scadenza già passata viene ignorata, non salvata a ritroso', async () => {
    const d = db({ discount_codes: [] })
    await creaCodiceSconto(d.client, { codice: 'VECCHIO', valore_sconto: 10, scade_il: '2020-01-01' }, 'a@b.it')
    expect(stripeFinto.coupons.create.mock.calls[0][0].redeem_by).toBeUndefined()
    expect(d.scritture.find(s => s.op === 'insert').valori.scade_il).toBe(null)
  })

  it('una scadenza futura arriva a Stripe come secondi', async () => {
    const d = db({ discount_codes: [] })
    const fra30 = new Date(Date.now() + 30 * 86400000).toISOString()
    await creaCodiceSconto(d.client, { codice: 'NATALE', valore_sconto: 10, scade_il: fra30 }, 'a@b.it')
    const sec = stripeFinto.coupons.create.mock.calls[0][0].redeem_by
    expect(sec).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(String(sec)).toHaveLength(10)
  })

  it('i piani ammessi si filtrano su quelli che esistono', async () => {
    const d = db({ discount_codes: [] })
    await creaCodiceSconto(d.client, { codice: 'SOLOPRO', valore_sconto: 10, piani_validi: ['pro', 'inventato', 'chain'] }, 'a@b.it')
    expect(d.scritture.find(s => s.op === 'insert').valori.piani_validi).toEqual(['pro', 'chain'])
  })

  it('il nome di chi l\'ha creato resta scritto', async () => {
    const d = db({ discount_codes: [] })
    await creaCodiceSconto(d.client, { codice: 'TRACCIA', valore_sconto: 10 }, 'greg@maradeiboschi.com')
    expect(d.scritture.find(s => s.op === 'insert').valori.creato_da).toBe('greg@maradeiboschi.com')
  })
})

describe('regalare mesi a mano: i limiti del codice si rispettano', () => {
  const org = { id: 'org-1', stripe_subscription_id: null, trial_ends_at: null }

  it('un codice scaduto non si può più usare', async () => {
    // Il difetto: si controllava solo «esiste ed è acceso». Uno scaduto a
    // marzo funzionava ancora a settembre.
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'MARZO', attivo: true, scade_il: '2026-03-01T00:00:00Z', redemptions: 0 }],
      organizations: [org],
    })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'MARZO', 3)).rejects.toThrow(/scaduto il 01\/03\/2026/)
  })

  it('un codice con la scadenza futura passa', async () => {
    const domani = new Date(Date.now() + 86400000).toISOString()
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'VALIDO', attivo: true, scade_il: domani, redemptions: 0 }],
      organizations: [org],
    })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'VALIDO', 2)).resolves.toMatchObject({ mesi: 2 })
  })

  it('un codice esaurito non si può regalare ancora', async () => {
    // «Primi 5 clienti»: al sesto ci si ferma.
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'PRIMI5', attivo: true, max_redemptions: 5, redemptions: 5 }],
      organizations: [org],
    })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'PRIMI5', 1)).rejects.toThrow(/già stato usato 5 volte su 5/)
  })

  it('al quinto su cinque passa ancora', async () => {
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'PRIMI5', attivo: true, max_redemptions: 5, redemptions: 4 }],
      organizations: [org],
    })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'PRIMI5', 1)).resolves.toBeTruthy()
  })

  it('senza limite di usi non si ferma mai per quello', async () => {
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'LIBERO', attivo: true, max_redemptions: null, redemptions: 900 }],
      organizations: [org],
    })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'LIBERO', 1)).resolves.toBeTruthy()
  })

  it('un codice spento non si usa', async () => {
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'SPENTO', attivo: false, redemptions: 0 }],
      organizations: [org],
    })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'SPENTO', 1)).rejects.toThrow(/non valido o disattivato/)
  })

  it('un codice che non esiste nemmeno', async () => {
    const d = db({ discount_codes: [], organizations: [org] })
    await expect(applicaCodiceManuale(d.client, 'org-1', 'MAIVISTO', 1)).rejects.toThrow(/non valido o disattivato/)
  })

  it('senza codice si può comunque regalare (è un regalo del titolare)', async () => {
    const d = db({ discount_codes: [], organizations: [org] })
    await expect(applicaCodiceManuale(d.client, 'org-1', '', 3)).resolves.toMatchObject({ mesi: 3, codice: null })
    expect(d.scritture.find(s => s.tabella === 'discount_redemptions').valori.codice).toBe('ADMIN_GIFT_3M')
  })
})

describe('regalare mesi a mano: cosa scrive', () => {
  const org = { id: 'org-1', stripe_subscription_id: null, trial_ends_at: null }

  it('alza il contatore degli usi del codice', async () => {
    // Prima si alzava solo quando pagava un cliente vero (dal webhook di
    // Stripe): il pannello mostrava «0 volte usato» per un codice già dato a
    // dieci clienti, e il limite di usi non arrivava mai.
    const d = db({
      discount_codes: [{ id: 'c1', codice: 'REGALO', attivo: true, redemptions: 2 }],
      organizations: [org],
    })
    await applicaCodiceManuale(d.client, 'org-1', 'REGALO', 1)
    const su = d.scritture.find(s => s.tabella === 'discount_codes' && s.op === 'update')
    expect(su, 'il contatore non è stato aggiornato').toBeTruthy()
    expect(su.valori.redemptions).toBe(3)
    // E non sovrascrive un conteggio cambiato nel frattempo.
    expect(su.filtri.redemptions).toBe(2)
  })

  it('registra chi ha ricevuto il regalo', async () => {
    const d = db({ discount_codes: [{ id: 'c1', codice: 'X', attivo: true, redemptions: 0 }], organizations: [org] })
    await applicaCodiceManuale(d.client, 'org-1', 'X', 4)
    const r = d.scritture.find(s => s.tabella === 'discount_redemptions')
    expect(r.valori).toMatchObject({ codice: 'X', organization_id: 'org-1' })
  })

  it('senza abbonamento Stripe allunga la prova interna', async () => {
    const d = db({ discount_codes: [], organizations: [{ id: 'org-1', stripe_subscription_id: null, trial_ends_at: null }] })
    await applicaCodiceManuale(d.client, 'org-1', '', 2)
    const u = d.scritture.find(s => s.tabella === 'organizations' && s.op === 'update')
    const nuovo = new Date(u.valori.trial_ends_at)
    const attesi = Date.now() + 2 * 30 * 86400000
    expect(Math.abs(nuovo.getTime() - attesi)).toBeLessThan(60_000)
  })

  it('se la prova è ancora aperta, i mesi si sommano a quella', async () => {
    const fra10 = new Date(Date.now() + 10 * 86400000)
    const d = db({ discount_codes: [], organizations: [{ id: 'org-1', stripe_subscription_id: null, trial_ends_at: fra10.toISOString() }] })
    await applicaCodiceManuale(d.client, 'org-1', '', 1)
    const u = d.scritture.find(s => s.tabella === 'organizations' && s.op === 'update')
    const nuovo = new Date(u.valori.trial_ends_at)
    expect(Math.abs(nuovo.getTime() - (fra10.getTime() + 30 * 86400000))).toBeLessThan(60_000)
  })

  it('con un abbonamento Stripe sposta la fine della prova là', async () => {
    stripeFinto.subscriptions.retrieve.mockResolvedValueOnce({ trial_end: null })
    const d = db({ discount_codes: [], organizations: [{ id: 'org-1', stripe_subscription_id: 'sub_1' }] })
    await applicaCodiceManuale(d.client, 'org-1', '', 1)
    expect(stripeFinto.subscriptions.update).toHaveBeenCalledWith('sub_1',
      expect.objectContaining({ proration_behavior: 'none' }))
    const arg = stripeFinto.subscriptions.update.mock.calls[0][1]
    expect(arg.trial_end).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('i mesi regalati stanno fra 1 e 60', async () => {
    for (const [chiesti, attesi] of [[0, 1], [-5, 1], ['tre', 1], [999, 60], [7, 7]]) {
      const d = db({ discount_codes: [], organizations: [{ id: 'org-1' }] })
      const r = await applicaCodiceManuale(d.client, 'org-1', '', chiesti)
      expect(r.mesi, String(chiesti)).toBe(attesi)
    }
  })

  it('un\'organizzazione che non esiste si ferma subito', async () => {
    const d = db({ discount_codes: [], organizations: [] })
    await expect(applicaCodiceManuale(d.client, 'org-fantasma', '', 1)).rejects.toThrow(/non trovata/)
  })
})

describe('spegnere e cancellare un codice', () => {
  it('spegnere lo disattiva su Stripe e lo marca come spento', async () => {
    const d = db({ discount_codes: [{ id: 'c1', stripe_promo_code_id: 'promo_1' }] })
    await disattivaCodiceSconto(d.client, 'c1')
    expect(stripeFinto.promotionCodes.update).toHaveBeenCalledWith('promo_1', { active: false })
    const u = d.scritture.find(s => s.op === 'update')
    expect(u.valori.attivo).toBe(false)
    expect(u.valori.disattivato_il).toBeTruthy()
  })

  it('se Stripe non risponde, il codice si spegne lo stesso da noi', async () => {
    stripeFinto.promotionCodes.update.mockRejectedValueOnce(new Error('Stripe giù'))
    const d = db({ discount_codes: [{ id: 'c1', stripe_promo_code_id: 'promo_1' }] })
    await expect(disattivaCodiceSconto(d.client, 'c1')).resolves.toBeUndefined()
    expect(d.scritture.find(s => s.op === 'update').valori.attivo).toBe(false)
  })

  it('un codice che non esiste dà un errore chiaro', async () => {
    const d = db({ discount_codes: [] })
    await expect(disattivaCodiceSconto(d.client, 'boh')).rejects.toThrow(/non trovato/)
    await expect(eliminaCodiceSconto(d.client, 'boh')).rejects.toThrow(/non trovato/)
  })

  it('cancellare un codice mai usato toglie anche il coupon da Stripe', async () => {
    const d = db({ discount_codes: [{ id: 'c1', stripe_promo_code_id: 'promo_1', stripe_coupon_id: 'cp_1', redemptions: 0 }] })
    await eliminaCodiceSconto(d.client, 'c1')
    expect(stripeFinto.coupons.del).toHaveBeenCalledWith('cp_1')
    expect(d.scritture.some(s => s.op === 'delete')).toBe(true)
  })

  it('un codice già usato resta su Stripe, solo spento', async () => {
    const d = db({ discount_codes: [{ id: 'c1', stripe_promo_code_id: 'promo_1', stripe_coupon_id: 'cp_1', redemptions: 3 }] })
    await eliminaCodiceSconto(d.client, 'c1')
    expect(stripeFinto.coupons.del).not.toHaveBeenCalled()
    expect(stripeFinto.promotionCodes.update).toHaveBeenCalledWith('promo_1', { active: false })
  })

  it('un conteggio nullo conta come «mai usato»', async () => {
    // Con `redemptions === 0` una riga vecchia col campo nullo non passava, e
    // il coupon su Stripe restava lì per sempre.
    const d = db({ discount_codes: [{ id: 'c1', stripe_coupon_id: 'cp_1', redemptions: null }] })
    await eliminaCodiceSconto(d.client, 'c1')
    expect(stripeFinto.coupons.del).toHaveBeenCalledWith('cp_1')
  })
})

describe('leggere l\'elenco', () => {
  it('restituisce le righe', async () => {
    const d = db({ discount_codes: [{ id: 'a' }, { id: 'b' }] })
    expect(await getCodiciSconto(d.client)).toHaveLength(2)
  })

  it('un errore del database non si nasconde', async () => {
    const rotto = { from: () => ({ select: () => ({ order: () => ({ limit: () => ({ then: (r) => r({ data: null, error: { message: 'permission denied' } }) }) }) }) }) }
    await expect(getCodiciSconto(rotto)).rejects.toThrow(/permission denied/)
  })
})
