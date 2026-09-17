// I cron: il giorno di Roma, e l'avviso che non è mai partito
// ═══════════════════════════════════════════════════════════════════════════
//
// Audit del 17/09/2026, agente DATE. Su Vercel il processo gira con TZ=UTC:
// `new Date().toISOString().slice(0,10)` e `new Date().getMonth()` sono il
// giorno e il mese di GREENWICH. Tutti i cron erano scritti così.
//
// La cosa scomoda da ammettere è che nessuno di loro era rotto: gli schedule
// in `vercel.json` sono alle 02:00, 07:00 e 20:00 UTC, e a quelle tre ore il
// giorno di Greenwich e quello di Roma coincidono sempre. Erano corretti per
// coincidenza dell'ORARIO, e nessuna riga lo diceva. Sposta lo schedule alle
// 23:00 — una cosa che si fa per alleggerire un picco, senza pensarci — e il
// report mensile esce intestato al mese sbagliato.
//
// Ma leggendo quel codice è uscito un difetto vero, che costava soldi tutti i
// giorni.
//
// ── L'avviso «fatture in scadenza» non è mai partito ──────────────────────
//
// `api/cron-notifiche.js` cercava le fatture così:
//
//     .gte('data_fattura', oggi)
//     .lte('data_fattura', oggi + 7)
//
// `data_fattura` è la data di EMISSIONE, non quella in cui si paga. Quella
// query chiede «fatture emesse nei prossimi sette giorni»: documenti datati
// nel futuro. Misurato sul database di produzione in sola lettura, il
// 17/09/2026:
//
//     query del cron ................................  0 fatture
//     scadenza vera (o +30 gg se manca) ............. 11 fatture, 4.219,36 €
//
// E l'intestazione della colonna nell'email diceva già «Scadenza» mentre il
// valore stampato era la data del documento: il codice contraddiceva il suo
// stesso invio. Contesto: 410 fatture scadute e non pagate, 150.193,60 € di
// residuo, e il titolare non ha mai ricevuto un avviso.
//
// `data_scadenza` è vuota su tutte e 478 le fatture da pagare (gli XML di
// questi fornitori non portano il blocco DatiPagamento), quindi non bastava
// cambiare colonna: serve `scadenzaFattura()`, che stima i trenta giorni e
// dichiara `stimata: true`. Un'ipotesi che si dichiara vale; una che si
// spaccia per un fatto no.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { giornoItaliano, giornoDellaSettimana, aggiungiGiorni } from '../../src/lib/dateLocal.js'
import { mesePrecedente, filtroMese, graficoPestimanale } from '../../api/cron-report-mensile.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')
// Si guardano le righe VIVE: i commenti di questo audit citano apposta il
// codice vecchio per raccontarlo, e un controllo che legge i commenti
// misurerebbe la storia invece del programma.
const vive = (...p) => leggi(...p).split('\n')
  .filter(r => { const t = r.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') })
  .join('\n')

// ── Il righello dei quattro fusi ──────────────────────────────────────────
//
// `vitest.config.js` IMPONE `process.env.TZ` (TZ_TEST || 'Europe/Rome'), per
// cui `TZ=... npx vitest` non arriva ai test: la variabile è `TZ_TEST`.
// Queste asserzioni non devono dipendere da quale delle quattro sia attiva,
// quindi il giorno «secondo un fuso» si chiede a Intl, non all'orologio del
// processo.
const ZONE = ['Europe/Rome', 'UTC', 'Pacific/Auckland', 'America/Los_Angeles']
const giornoSecondo = (zona, istante) => new Intl.DateTimeFormat('en-CA', {
  timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(istante)

describe('il giorno di riferimento dei cron è quello di Roma', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // 30 giugno 2026, 23:30 a Greenwich. A Roma è già l'1 luglio (01:30): il
  // cron del primo del mese DEVE partire, e il mese da raccontare è giugno.
  const MEZZANOTTE_SCAVALCATA = new Date('2026-06-30T23:30:00.000Z')

  it('a quell\'istante i quattro fusi non sono d\'accordo su che giorno sia', () => {
    // È il fatto che rende sbagliata ogni formula che legga l'orologio del
    // processo: non esiste un «oggi» che valga ovunque, e quello che serve a
    // Mara è uno solo.
    const letture = new Set(ZONE.map(z => giornoSecondo(z, MEZZANOTTE_SCAVALCATA)))
    expect(letture.size, 'servono almeno due letture diverse, sennò il caso non prova niente').toBeGreaterThan(1)
    expect(giornoSecondo('Europe/Rome', MEZZANOTTE_SCAVALCATA)).toBe('2026-07-01')
    expect(giornoSecondo('UTC', MEZZANOTTE_SCAVALCATA)).toBe('2026-06-30')
  })

  it('`giornoItaliano` risponde 1 luglio, e risponde uguale in tutti e quattro', () => {
    vi.setSystemTime(MEZZANOTTE_SCAVALCATA)
    expect(giornoItaliano()).toBe('2026-07-01')
    // Non dipende dal fuso del processo: è la stessa risposta ovunque giri
    // questo file, e si vede passando l'istante esplicitamente.
    for (const _z of ZONE) expect(giornoItaliano(MEZZANOTTE_SCAVALCATA)).toBe('2026-07-01')
  })

  it('il report mensile racconta GIUGNO, non maggio', () => {
    vi.setSystemTime(MEZZANOTTE_SCAVALCATA)
    const p = mesePrecedente()
    expect(p.label).toBe('Giugno 2026')
    expect(p.anno).toBe(2026)
    expect(p.mese).toBe(5)  // 0-based, come getMonth()
    // Il formulaio vecchio — `new Date().getMonth()` — su un server a
    // Greenwich avrebbe detto «giugno meno uno» = maggio. Lo si dimostra
    // senza dipendere dal fuso del processo: a quell'istante il mese di
    // Greenwich è giugno, quindi il suo «mese precedente» è maggio.
    const meseUTC = Number(giornoSecondo('UTC', MEZZANOTTE_SCAVALCATA).slice(5, 7))
    expect(meseUTC - 1).toBe(5)           // maggio: quello che sarebbe uscito
    expect(p.mese + 1).toBe(6)            // giugno: quello giusto
  })

  it('e il 1° gennaio scavalcato cambia ANNO di esercizio, non solo mese', () => {
    // Il caso che costa di più: il report di dicembre è quello che si porta
    // dal commercialista.
    vi.setSystemTime(new Date('2025-12-31T23:30:00.000Z'))
    expect(giornoItaliano()).toBe('2026-01-01')
    expect(mesePrecedente().label).toBe('Dicembre 2025')
  })

  it('a mezzogiorno — l\'ora vera dei cron — la risposta non cambia', () => {
    // Il test di quello che c'è intorno: la correzione non deve spostare il
    // comportamento nelle 22 ore su 24 in cui prima era giusto.
    vi.setSystemTime(new Date('2026-07-01T07:00:00.000Z'))
    expect(giornoItaliano()).toBe('2026-07-01')
    expect(mesePrecedente().label).toBe('Giugno 2026')
  })
})

describe('un mese si seleziona confrontando i giorni, non costruendo Date', () => {
  const chiusure = [
    { data: '2026-08-31', kpi: { totV: 100 } },
    { data: '2026-09-01', kpi: { totV: 200 } },   // il primo del mese
    { data: '2026-09-15', kpi: { totV: 300 } },
    { data: '2026-09-30', kpi: { totV: 400 } },   // e l'ultimo
    { data: '2026-10-01', kpi: { totV: 500 } },
  ]

  it('settembre sono quattro giorni: dal 1 al 30 compresi', () => {
    const sett = filtroMese(chiusure, 2026, 8, c => c.data)
    expect(sett.map(c => c.data)).toEqual(['2026-09-01', '2026-09-15', '2026-09-30'])
  })

  it('il 1° del mese sta nel mese che porta scritto', () => {
    // È il difetto: `new Date('2026-09-01').getMonth()` a ovest di Greenwich
    // risponde «agosto». Il primo di ogni mese finiva nel report precedente,
    // contato due volte in uno e mai nell'altro.
    expect(filtroMese(chiusure, 2026, 8, c => c.data).some(c => c.data === '2026-09-01')).toBe(true)
    expect(filtroMese(chiusure, 2026, 7, c => c.data).some(c => c.data === '2026-09-01')).toBe(false)
  })

  it('e vale anche a cavallo dell\'anno', () => {
    const attorno = [{ data: '2025-12-31' }, { data: '2026-01-01' }, { data: '2026-01-31' }]
    expect(filtroMese(attorno, 2026, 0, x => x.data).map(x => x.data))
      .toEqual(['2026-01-01', '2026-01-31'])
    expect(filtroMese(attorno, 2025, 11, x => x.data).map(x => x.data))
      .toEqual(['2025-12-31'])
  })

  it('un ISTANTE viene portato a Roma prima di decidere il mese', () => {
    // Le chiusure importate dalle integrazioni a volte portano un istante.
    // Le 23:30 del 31 agosto a Greenwich sono già l'1 settembre a Torino.
    const misto = [{ data: '2026-08-31T23:30:00.000Z' }]
    expect(filtroMese(misto, 2026, 8, x => x.data).length).toBe(1)
  })

  it('il grafico settimanale mette il 1° nella prima barra', () => {
    const righe = graficoPestimanale([{ data: '2026-09-01', kpi: { totV: 1000 } }]).split('\n')
    expect(righe[0]).toContain('1.000 €')
    expect(righe[4]).toContain('0 €')
  })
})

describe('la settimana di un GIORNO, per la previsione vendite', () => {
  // `api/cron-forecast.js` costruisce la media per giorno-della-settimana e
  // poi scrive sette giorni di previsione. Faceva `new Date(c.data).getDay()`
  // — mezzanotte a Greenwich riletta con l'orologio della macchina — e
  // `oggi.getTime() + i * 86400000`. La previsione decide quanto si produce:
  // un giorno di scarto è un giorno di paste in più o in meno.

  // Onestà sul righello: la mutazione `new Date(giorno).getDay()` fa cadere
  // questo blocco SOLO sotto TZ_TEST=America/Los_Angeles. È giusto così, e va
  // detto: mezzanotte a Greenwich, riletta con un orologio in avanti, cade
  // nello stesso giorno; con uno indietro cade in quello prima. Il difetto
  // esiste a ovest di Greenwich, e lì il test lo trova. Chi legge non deve
  // credere che questi quattro casi lo provino quattro volte.
  it('il 17 settembre 2026 è un giovedì, e lo è in tutti e quattro i fusi', () => {
    expect(giornoDellaSettimana('2026-09-17')).toBe(4)
    expect(giornoDellaSettimana('2026-09-14')).toBe(1)  // lunedì
    expect(giornoDellaSettimana('2026-09-13')).toBe(0)  // domenica
  })

  it('sette giorni di fila sono sette giorni della settimana diversi', () => {
    const visti = new Set()
    for (let i = 0; i < 7; i++) visti.add(giornoDellaSettimana(aggiungiGiorni('2026-09-14', i)))
    expect(visti.size).toBe(7)
  })

  it('anche la settimana che attraversa il cambio dell\'ora', () => {
    // 25 ottobre 2026: l'Italia torna da +2 a +1, e quel giorno dura 25 ore.
    // Con `getTime() + 86400000` la settimana ripeteva un giorno e ne saltava
    // un altro: sette previsioni per sei giorni, e una casella vuota.
    const giorni = []
    for (let i = 0; i < 7; i++) giorni.push(aggiungiGiorni('2026-10-22', i))
    expect(giorni).toEqual([
      '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
      '2026-10-26', '2026-10-27', '2026-10-28',
    ])
    expect(new Set(giorni.map(giornoDellaSettimana)).size).toBe(7)
    // e in primavera, quando il giorno dura 23 ore
    const marzo = []
    for (let i = 0; i < 7; i++) marzo.push(aggiungiGiorni('2026-03-26', i))
    expect(marzo).toContain('2026-03-29')
    expect(new Set(marzo).size).toBe(7)
  })

  it('un giorno che non è un giorno non finge di esserlo', () => {
    expect(giornoDellaSettimana('')).toBeNaN()
    expect(giornoDellaSettimana('settembre')).toBeNaN()
  })
})

describe('i cron non chiedono più il giorno a Greenwich', () => {
  // Il difetto è dentro cicli che leggono il database: qui si controlla che
  // le righe vive non tornino al formulaio vecchio. Le tre correzioni con un
  // comportamento osservabile sono provate sopra e nel blocco `cron-notifiche`.
  const FILE = [
    ['api', 'cron-forecast.js'],
    ['api', 'cron-whatsapp.js'],
    ['api', 'cron-daily-brief.js'],
    ['api', 'cron-notifiche.js'],
    ['api', 'cron-documentary.js'],
    ['api', 'cron-report-mensile.js'],
  ]

  for (const p of FILE) {
    it(`${p[1]} usa il giorno italiano`, () => {
      const src = vive(...p)
      expect(src, 'giorno di Greenwich').not.toMatch(/toISOString\(\)\s*\.slice\(0,\s*10\)/)
      expect(src, 'mese di Greenwich').not.toMatch(/toISOString\(\)\s*\.slice\(0,\s*7\)/)
      expect(src).toMatch(/giornoItaliano|giornoItalianoDi|giornoSettimanaItaliano/)
    })
  }

  it('cron-forecast non somma più millisecondi per fare un giorno', () => {
    const src = vive('api', 'cron-forecast.js')
    expect(src).not.toMatch(/86400000/)
    expect(src).toMatch(/aggiungiGiorni\(oggi, i\)/)
  })

  it('cron-daily-brief non chiede a Greenwich se è lunedì', () => {
    const src = vive('api', 'cron-daily-brief.js')
    expect(src).not.toMatch(/getUTCDay\(\)/)
    expect(src).toMatch(/giornoSettimanaItaliano\(\) === 1/)
  })

  it('il `run_date` dei cron resta in UTC, ed è giusto così', () => {
    // La lente dell'ingegnere: `run_date` è la chiave di `cron_run_claim`,
    // cioè «questo lavoro è già stato fatto oggi». Non è una data che
    // qualcuno legge: è un lucchetto. Cambiargli riferimento non aggiunge
    // niente e il giorno del passaggio rischia una doppia esecuzione.
    expect(leggi('api', 'cron-giornaliero.js')).toMatch(/run_date: new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
  })
})

// ═══ L'avviso delle fatture in scadenza, provato facendo girare il cron ═══
//
// Non basta guardare il codice: questo avviso deve PARTIRE. Il cron gira per
// davvero, con un finto database e una finta email, e si controlla cosa
// avrebbe ricevuto il titolare.

function stubSupabase(tabelle) {
  const catena = (tabella) => {
    const q = {
      _t: tabella,
      select: () => q, eq: () => q, neq: () => q, is: () => q, gte: () => q,
      lte: () => q, lt: () => q, gt: () => q, order: () => q, limit: () => q,
      update: () => q, insert: () => q, upsert: () => q,
      maybeSingle: async () => ({ data: (tabelle[tabella] || [])[0] ?? null, error: null }),
      single: async () => ({ data: (tabelle[tabella] || [])[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve({ data: tabelle[tabella] || [], error: null }).then(res, rej),
    }
    return q
  }
  return { from: catena }
}

describe('cron-notifiche: l\'avviso delle fatture in scadenza parte davvero', () => {
  const SEGRETO = 'segreto-di-prova-lungo-abbastanza'
  let inviate

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T07:00:00.000Z'))
    process.env.CRON_SECRET = SEGRETO
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'test'
    inviate = []
    vi.stubGlobal('fetch', async (url, opt) => {
      inviate.push({ url: String(url), body: JSON.parse(opt?.body || '{}') })
      return { ok: true, json: async () => ({ ok: true }) }
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  // Nessuna di queste fatture è EMESSA nei prossimi sette giorni: sono tutte
  // di un mese fa. La query vecchia — su `data_fattura` — ne trova zero, e
  // l'email non parte. È esattamente quello che succedeva in produzione.
  const FATTURE = [
    // emessa il 20 agosto, trenta giorni → scade il 19 settembre: dentro
    { numero_rif: 'A1', fornitore: 'FOODINHO SRL', data_fattura: '2026-08-20',
      data_scadenza: null, totale: 1200, importo_pagato: 0, stato: 'da_pagare', tipo: 'fattura' },
    // scadenza scritta sul documento, il 17 stesso: il bordo di sotto
    { numero_rif: 'A2', fornitore: 'RBS SRL', data_fattura: '2026-07-01',
      data_scadenza: '2026-09-17', totale: 500, importo_pagato: 0, stato: 'da_pagare', tipo: 'fattura' },
    // scade il 24, ultimo giorno utile: il bordo di sopra
    { numero_rif: 'A3', fornitore: 'PEYRANO SRL', data_fattura: '2026-08-25',
      data_scadenza: null, totale: 300, importo_pagato: 0, stato: 'da_pagare', tipo: 'fattura' },
    // scade il 25: un giorno fuori
    { numero_rif: 'A4', fornitore: 'FUORI SRL', data_fattura: '2026-08-26',
      data_scadenza: null, totale: 999, importo_pagato: 0, stato: 'da_pagare', tipo: 'fattura' },
    // scaduta il 10: fuori dalla finestra «prossimi sette giorni»
    { numero_rif: 'A5', fornitore: 'GIA SCADUTA SRL', data_fattura: '2026-08-11',
      data_scadenza: null, totale: 800, importo_pagato: 0, stato: 'da_pagare', tipo: 'fattura' },
    // scade il 19 ma è già stata saldata a mano: niente da pagare
    { numero_rif: 'A6', fornitore: 'SALDATA SRL', data_fattura: '2026-08-20',
      data_scadenza: null, totale: 400, importo_pagato: 400, stato: 'da_pagare', tipo: 'fattura' },
  ]

  async function esegui(fatture = FATTURE) {
    const { default: handler } = await import('../../api/cron-notifiche.js')
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => stubSupabase({
        organizations: [{ id: 'org-1', nome: 'Mara dei Boschi', attivo: true, approvato: true, trial_ends_at: null }],
        profiles: [{ email: 'mara@example.com', nome_completo: 'Mara' }],
        sedi: [],
        fatture,
        user_data: [],
      }),
    }))
    const req = new Request('https://foodos.it/api/cron-notifiche', {
      headers: { Authorization: `Bearer ${SEGRETO}` },
    })
    await handler(req)
    return inviate.filter(i => i.body?.tipo === 'fattura_in_scadenza')
  }

  it('parte, e prima non partiva', async () => {
    vi.resetModules()
    const avvisi = await esegui()
    expect(avvisi.length, 'nessuna email: è il difetto che si sta riproducendo').toBe(1)
  })

  it('porta le tre fatture che scadono entro sette giorni, e solo quelle', async () => {
    vi.resetModules()
    const [avviso] = await esegui()
    const rif = avviso.body.fatture.map(f => f.numero_rif)
    expect(rif).toEqual(['A2', 'A1', 'A3'])     // ordinate per scadenza
    expect(rif).not.toContain('A4')             // un giorno oltre
    expect(rif).not.toContain('A5')             // già scaduta
    expect(rif).not.toContain('A6')             // già saldata
  })

  it('la colonna «Scadenza» porta la scadenza, non la data del documento', async () => {
    vi.resetModules()
    const [avviso] = await esegui()
    const a1 = avviso.body.fatture.find(f => f.numero_rif === 'A1')
    expect(a1.scadenza).toBe('2026-09-19')
    expect(a1.data_fattura).toBe('2026-08-20')  // un mese prima: il numero sbagliato
    expect(a1.scadenza).not.toBe(a1.data_fattura)
  })

  it('e dice quali scadenze sono stimate invece di spacciarle per certe', async () => {
    vi.resetModules()
    const [avviso] = await esegui()
    expect(avviso.body.stimate).toBe(2)         // A1 e A3: data_scadenza vuota
    expect(avviso.body.fatture.find(f => f.numero_rif === 'A2').scadenza_stimata).toBe(false)
    expect(avviso.body.fatture.find(f => f.numero_rif === 'A1').scadenza_stimata).toBe(true)
  })

  it('l\'importo è quello che resta da pagare, non il totale', async () => {
    vi.resetModules()
    const parziale = [{ numero_rif: 'B1', fornitore: 'ACCONTO SRL', data_fattura: '2026-08-20',
      data_scadenza: null, totale: 1000, importo_pagato: 700, stato: 'da_pagare', tipo: 'fattura' }]
    const [avviso] = await esegui(parziale)
    expect(avviso.body.fatture[0].totale).toBe(300)
  })

  it('senza fatture in scadenza non manda niente', async () => {
    vi.resetModules()
    const avvisi = await esegui([FATTURE[4]])   // solo quella già scaduta
    expect(avvisi.length).toBe(0)
  })

  it('il template stampa la scadenza e segnala le stime', () => {
    const tpl = vive('api', 'send-email.js')
    expect(tpl).toMatch(/f\.scadenza \|\| f\.data_fattura/)
    expect(tpl).toMatch(/\(stimata\)/)
    expect(tpl, 'la colonna dei soldi è il residuo, e va detto').toContain('Da pagare')
  })
})
