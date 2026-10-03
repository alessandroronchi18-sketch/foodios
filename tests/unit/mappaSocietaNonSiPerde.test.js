// ── La mappa «società → sedi» non si perde, e lo spostamento è prudente ─
//
// 03/10/2026, insieme alla regola che manda ogni fattura alla sede della sua
// società (`fattureDiDueSocieta.test.js`). La mappa si scrive da due strade:
// la domanda durante un caricamento — dallo Scadenzario o da Integrazioni —
// e la pagina Impostazioni → Società. Il rischio è quello classico di
// `user_data`: chi salva la copia che aveva in mano cancella in silenzio la
// società che l'altro ha appena aggiunto, e al caricamento successivo le sue
// fatture tornano a chiedere — o peggio, nessuno se ne accorge.
//
// Qui si prova che:
//   • ogni modifica rilegge la mappa più recente prima di scrivere, e se nel
//     frattempo qualcuno ha scritto riprova invece di sovrascrivere;
//   • una lettura che non riesce lo dice, invece di sembrare «nessuna
//     società»;
//   • lo spostamento delle fatture già in archivio tocca solo sede e sedi
//     condivise, solo quelle ancora di quella società, a blocchi, e conta
//     quelle spostate DAVVERO (non quelle chieste);
//   • senza la colonna nuova (migration non ancora applicata) non si propone
//     niente, e si sa perché.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const archivio = { riga: null, versione: 0, scrittureConcorrenti: 0 }
vi.mock('../../src/lib/storage', () => ({
  sloadWithVersion: vi.fn(async () => ({ value: archivio.riga, version: archivio.versione })),
  ssaveVersioned: vi.fn(async (_k, valore, _o, _s, attesa) => {
    // Qualcun altro scrive fra la nostra lettura e la nostra scrittura.
    if (archivio.scrittureConcorrenti > 0) {
      archivio.scrittureConcorrenti--
      archivio.riga = { ...archivio.riga, '33333333333': { nome: 'GAMMA SRL', sedi: ['s-carlina'] } }
      archivio.versione++
    }
    if (attesa !== archivio.versione) return null
    archivio.riga = valore
    archivio.versione++
    return archivio.versione
  }),
}))

const { aggiornaSocieta, ricordaSocieta, caricaSocieta, fattureConSocieta, spostaFatture } = await import('../../src/lib/societaSediArchivio.js')
const { SK_SOCIETA_SEDI } = await import('../../src/lib/storageKeys.js')

beforeEach(() => {
  archivio.riga = { '11111111111': { nome: 'ALFA SRL', sedi: ['s-carlina'] } }
  archivio.versione = 4
  archivio.scrittureConcorrenti = 0
})

describe('ricordaSocieta: aggiunge senza cancellare', () => {
  it('la società nuova si aggiunge a quelle che c\'erano', async () => {
    await ricordaSocieta('org', { '22222222222': { nome: 'BETA SRL', sedi: ['s-degasperi', 's-berthollet'] } })
    expect(Object.keys(archivio.riga).sort()).toEqual(['11111111111', '22222222222'])
  })

  it('se qualcuno scrive nel frattempo, rilegge e tiene anche la sua', async () => {
    archivio.scrittureConcorrenti = 1
    await ricordaSocieta('org', { '22222222222': { nome: 'BETA SRL', sedi: ['s-degasperi'] } })
    expect(Object.keys(archivio.riga).sort()).toEqual(['11111111111', '22222222222', '33333333333'])
  })

  it('se non riesce mai a scrivere, lo dice invece di far finta', async () => {
    archivio.scrittureConcorrenti = 10
    await expect(ricordaSocieta('org', { '22222222222': { nome: 'BETA SRL', sedi: ['s-degasperi'] } }))
      .rejects.toThrow(/riprova/)
  })
})

describe('aggiornaSocieta: togliere una società', () => {
  it('toglie quella e lascia le altre', async () => {
    archivio.riga['22222222222'] = { nome: 'BETA SRL', sedi: ['s-degasperi'] }
    await aggiornaSocieta('org', (m) => { const o = { ...m }; delete o['22222222222']; return o })
    expect(Object.keys(archivio.riga)).toEqual(['11111111111'])
  })
})

describe('la chiave è dell\'azienda, non di un negozio', () => {
  it('sta fra le chiavi condivise', async () => {
    // storage.js è sostituito in questo file: si legge il vero.
    const vero = await vi.importActual('../../src/lib/storage.js')
    expect(vero.SHARED_KEYS).toContain(SK_SOCIETA_SEDI)
  })
})

describe('caricaSocieta', () => {
  const client = (risposta) => {
    const q = {}
    for (const m of ['select', 'eq', 'is', 'order']) q[m] = () => q
    q.limit = async () => risposta
    return { from: () => q }
  }

  it('legge e ripulisce', async () => {
    const m = await caricaSocieta('org', client({ data: [{ data_value: { 'IT22222222222': { nome: 'BETA SRL', sedi: ['a', 'a'] } } }], error: null }))
    expect(m).toEqual({ '22222222222': { nome: 'BETA SRL', sedi: ['a'] } })
  })

  it('nessuna riga: mappa vuota', async () => {
    expect(await caricaSocieta('org', client({ data: [], error: null }))).toEqual({})
  })

  it('una lettura che non riesce lancia: «non so» non è «nessuna società»', async () => {
    await expect(caricaSocieta('org', client({ data: null, error: { message: 'rete caduta' } }))).rejects.toThrow(/rete caduta/)
  })
})

describe('fattureConSocieta', () => {
  const client = ({ manca = false, righe = [] } = {}) => {
    const q = {}
    for (const m of ['select', 'eq', 'not', 'order']) q[m] = () => q
    q.range = async () => manca
      ? { data: null, error: { code: '42703', message: 'column fatture.cessionario_piva does not exist' } }
      : { data: righe, error: null }
    return { from: () => q }
  }

  it('senza la colonna: niente da proporre, e si sa perché', async () => {
    expect(await fattureConSocieta(client({ manca: true }), 'org')).toEqual({ colonna: false, fatture: [] })
  })

  it('con la colonna: le fatture che sanno di chi sono', async () => {
    const r = await fattureConSocieta(client({ righe: [{ id: 'f1', cessionario_piva: '2' }] }), 'org')
    expect(r).toEqual({ colonna: true, fatture: [{ id: 'f1', cessionario_piva: '2' }] })
  })

  it('un altro errore non si nasconde', async () => {
    const q = {}
    for (const m of ['select', 'eq', 'not', 'order']) q[m] = () => q
    q.range = async () => ({ data: null, error: { message: 'permission denied' } })
    await expect(fattureConSocieta({ from: () => q }, 'org')).rejects.toThrow(/permission denied/)
  })
})

describe('spostaFatture: solo dopo il sì, e con prudenza', () => {
  function client({ ferme = [] } = {}) {
    const chiamate = []
    const tabella = () => {
      const q = { filtri: {} }
      q.update = (patch) => { q.patch = patch; return q }
      q.eq = (k, v) => { q.filtri[k] = v; return q }
      q.in = (k, v) => { q.filtri[k] = v; return q }
      q.select = async () => {
        chiamate.push({ patch: q.patch, filtri: { ...q.filtri } })
        // Le fatture «ferme» hanno avuto la P.IVA corretta a mano: il filtro
        // su cessionario_piva le lascia dove sono.
        return { data: q.filtri.id.filter(id => !ferme.includes(id)).map(id => ({ id })), error: null }
      }
      return q
    }
    return { supabase: { from: tabella }, chiamate }
  }
  const gruppo = (n) => ({
    piva: '22222222222', verso: { sedeId: null, sediCondivise: ['s-degasperi', 's-berthollet'] },
    ids: Array.from({ length: n }, (_, i) => `f${i}`),
  })

  it('scrive solo sede e sedi condivise, filtrando per azienda e per società', async () => {
    const db = client()
    const r = await spostaFatture(db.supabase, 'org', gruppo(3))
    expect(r).toEqual({ spostate: 3, errori: [] })
    expect(db.chiamate[0].patch).toEqual({ sede_id: null, sedi_condivise: ['s-degasperi', 's-berthollet'] })
    expect(db.chiamate[0].filtri).toMatchObject({ organization_id: 'org', cessionario_piva: '22222222222' })
  })

  it('a blocchi da cento, e conta quelle spostate davvero', async () => {
    const db = client({ ferme: ['f5', 'f150'] })
    const passi = []
    const r = await spostaFatture(db.supabase, 'org', gruppo(250), { onProgresso: (f, t) => passi.push([f, t]) })
    expect(db.chiamate.map(c => c.filtri.id.length)).toEqual([100, 100, 50])
    expect(r.spostate).toBe(248)
    expect(passi).toEqual([[100, 250], [200, 250], [250, 250]])
  })

  it('verso una sede sola: la sede e niente condivise', async () => {
    const db = client()
    await spostaFatture(db.supabase, 'org', { piva: '1', verso: { sedeId: 's-carlina', sediCondivise: null }, ids: ['a'] })
    expect(db.chiamate[0].patch).toEqual({ sede_id: 's-carlina', sedi_condivise: null })
  })
})
