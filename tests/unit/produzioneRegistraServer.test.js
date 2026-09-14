// L'endpoint con cui il DIPENDENTE registra la produzione.
//
// Il dipendente non riceve gli ingredienti delle ricette (sono un dato di
// costo), quindi lo scarico del magazzino lo fa il server. Per mesi ha fatto
// tre cose diverse da quello che fa il titolare dalla sua pagina, e i tre
// difetti si vedevano solo all'inventario, un mese dopo:
//
//   - non scendeva nei semilavorati, quindi una crostata non scaricava la
//     farina della frolla (in magazzino una voce "frolla" non c'è);
//   - saltava gli ingredienti salvati con la chiave al plurale ("uova");
//   - non aveva idempotenza: se il tablet perdeva la rete dopo la scrittura, il
//     messaggio invitava a riprovare e il secondo invio registrava la stessa
//     produzione due volte, scalando il magazzino due volte.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const STATO = { ric: null, mag: null, gior: null, scritture: [] }

vi.mock('../../api/lib/auth.js', () => ({
  verificaToken: async () => ({ user: { id: 'u1' }, profile: { organization_id: 'org-1' }, supabase: finto(), error: null }),
}))
vi.mock('../../api/lib/cors.js', () => ({
  handleOptions: () => new Response(null, { status: 204 }),
  json: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
}))

function finto() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: (_c2, chiave) => ({
            is: () => coda(chiave),
            eq: () => coda(chiave),
            // la verifica della sede: .eq(id).eq(organization_id).maybeSingle()
            maybeSingle: async () => ({ data: { id: 's1' }, error: null }),
          }),
          maybeSingle: async () => ({ data: { id: 's1' }, error: null }),
        }),
      }),
    }),
    rpc: async (nome, args) => {
      if (nome === 'fos_user_data_set_batch') {
        STATO.scritture.push(args)
        for (const it of args.p_items) {
          if (it.data_key.includes('magazzino')) STATO.mag = it.data_value
          if (it.data_key.includes('giornaliero')) STATO.gior = it.data_value
        }
      }
      return { data: null, error: null }
    },
  }
  function coda(chiave) {
    const valore = chiave.includes('ricettario') ? STATO.ric : chiave.includes('magazzino') ? STATO.mag : STATO.gior
    return {
      order: () => ({ limit: async () => ({ data: [{ data_value: valore, updated_at: '2026-09-14' }], error: null }) }),
      maybeSingle: async () => ({ data: { id: 's1' }, error: null }),
    }
  }
}

const { default: handler } = await import('../../api/produzione-registra.js')

const richiesta = (body) => new Request('http://x/api/produzione-registra', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  STATO.scritture = []
  STATO.ric = {
    ricette: {
      CROSTATA: { nome: 'CROSTATA', tipo: 'torta', porzioni: 8, prezzo: 24, unita: 1,
        ingredienti: [{ nome: 'frolla', qty1stampo: 400 }, { nome: 'uova', qty1stampo: 100 }] },
      FROLLA: { nome: 'FROLLA', tipo: 'semilavorato', porzioni: 1, prezzo: 0, unita: 1,
        ingredienti: [{ nome: 'farina', qty1stampo: 250 }, { nome: 'burro', qty1stampo: 150 }] },
    },
    ingredienti_costi: { farina: { costoKg: 1, costoG: 0.001 }, burro: { costoKg: 8, costoG: 0.008 }, uovo: { costoKg: 4, costoG: 0.004 } },
  }
  // In magazzino le chiavi sono come le ha scritte l'utente: "uova" al plurale.
  STATO.mag = {
    farina: { nome: 'Farina', giacenza_g: 10000, soglia_g: 0 },
    burro: { nome: 'Burro', giacenza_g: 5000, soglia_g: 0 },
    uova: { nome: 'Uova', giacenza_g: 2000, soglia_g: 0 },
  }
  STATO.gior = []
})

describe('produzione registrata dal dipendente', () => {
  it('scende nel semilavorato: la crostata scarica farina e burro della frolla', async () => {
    const res = await handler(richiesta({ sedeId: 's1', data: '2026-09-14', sessioneId: 'g-test-1', prodotti: [{ nome: 'CROSTATA', stampi: 2 }] }))
    expect(res.status).toBe(200)
    // 2 crostate × 400 g di frolla = 800 g di frolla = 2 batch → farina 500, burro 300
    expect(STATO.mag.farina.giacenza_g).toBe(10000 - 500)
    expect(STATO.mag.burro.giacenza_g).toBe(5000 - 300)
  })

  it('trova l\'ingrediente anche se in magazzino è salvato al plurale', async () => {
    await handler(richiesta({ sedeId: 's1', data: '2026-09-14', sessioneId: 'g-test-2', prodotti: [{ nome: 'CROSTATA', stampi: 2 }] }))
    // 2 × 100 g di uova: la ricetta dice "uova", normIng la porta a "uovo", in
    // magazzino la chiave è "uova". Prima non si scalava niente.
    expect(STATO.mag.uova.giacenza_g).toBe(2000 - 200)
  })

  it('registra quanto ha scalato davvero, chiave per chiave', async () => {
    await handler(richiesta({ sedeId: 's1', data: '2026-09-14', sessioneId: 'g-test-3', prodotti: [{ nome: 'CROSTATA', stampi: 1 }] }))
    const sess = STATO.gior[0]
    expect(sess.scalatoPerChiave).toMatchObject({ farina: 250, burro: 150, uova: 100 })
  })

  it('un secondo invio con lo stesso id non registra due volte', async () => {
    const corpo = { sedeId: 's1', data: '2026-09-14', sessioneId: 'g-test-4', prodotti: [{ nome: 'CROSTATA', stampi: 2 }] }
    await handler(richiesta(corpo))
    const magDopoPrimo = JSON.parse(JSON.stringify(STATO.mag))
    const scrittureDopoPrimo = STATO.scritture.length

    const res2 = await handler(richiesta(corpo))
    const body2 = await res2.json()
    expect(body2.giaRegistrata).toBe(true)
    // Niente seconda scrittura, e il magazzino non si muove.
    expect(STATO.scritture.length).toBe(scrittureDopoPrimo)
    expect(STATO.mag).toEqual(magDopoPrimo)
    expect(STATO.gior.filter(g => g.id === 'g-test-4')).toHaveLength(1)
  })

  it('zero pezzi al banco restano zero, non diventano gli stampi', async () => {
    await handler(richiesta({ sedeId: 's1', data: '2026-09-14', sessioneId: 'g-test-5', prodotti: [{ nome: 'CROSTATA', stampi: 3, vendibile: 0 }] }))
    const sess = STATO.gior[0]
    expect(sess.prodotti[0].vendibile).toBe(0)
    expect(sess.ricavoTot).toBe(0)
  })
})
