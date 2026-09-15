// Tre moduli piccoli e scoperti: la chiave delle casse, la correzione meteo,
// e la guardia sulle modifiche non salvate.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  impronta, leggiToken, risolviToken, segnaUso, organizzazioneAttiva,
} from '../../api/lib/webhookToken.js'
import {
  correzioneMeteo, spiegaCorrezione, meteoProssimiGiorni,
  SOGLIA_CALDO_C, SOGLIA_FREDDO_C, SOGLIA_PIOGGIA_MM,
} from '../../src/lib/meteoCorrezione.js'

// ══ La chiave con cui una cassa entra in Foodos ═══════════════════════════
//
// Prima c'era una parola d'ordine per marca di cassa, e l'attività a cui
// scrivere arrivava in chiaro in un'intestazione: chi aveva la parola
// d'ordine di una marca poteva scrivere incassi nella cassa di qualsiasi
// cliente. Ora la chiave dice da sola di chi è.

const finta = (headers = {}) => ({
  headers: { get: (n) => headers[n.toLowerCase()] ?? headers[n] ?? null },
})

describe('leggere la chiave dalla richiesta', () => {
  it('la legge dall\'intestazione nuova', () => {
    expect(leggiToken(finta({ 'x-webhook-token': 'abc123' }))).toBe('abc123')
  })

  it('e da quelle storiche delle casse, così chi è già configurato cambia solo il valore', () => {
    expect(leggiToken(finta({ 'x-pos-secret': 'k1' }))).toBe('k1')
    expect(leggiToken(finta({ 'x-zucchetti-secret': 'k2' }))).toBe('k2')
  })

  it('e da «Bearer», togliendo la parola', () => {
    expect(leggiToken(finta({ authorization: 'Bearer tok-999' }))).toBe('tok-999')
    expect(leggiToken(finta({ authorization: 'bearer   tok-999' }))).toBe('tok-999')
  })

  it('gli spazi intorno non contano', () => {
    expect(leggiToken(finta({ 'x-webhook-token': '  abc  ' }))).toBe('abc')
  })

  it('senza nessuna intestazione restituisce una stringa vuota, non esplode', () => {
    expect(leggiToken(finta({}))).toBe('')
  })

  it('l\'intestazione nuova vince sulle vecchie', () => {
    expect(leggiToken(finta({ 'x-webhook-token': 'nuova', 'x-pos-secret': 'vecchia' }))).toBe('nuova')
  })
})

describe('l\'impronta della chiave', () => {
  it('è sempre la stessa per la stessa chiave', async () => {
    expect(await impronta('segreto')).toBe(await impronta('segreto'))
  })

  it('cambia completamente se la chiave cambia di un carattere', async () => {
    const a = await impronta('segreto')
    const b = await impronta('segretp')
    expect(a).not.toBe(b)
  })

  it('è 64 caratteri esadecimali (SHA-256)', async () => {
    expect(await impronta('x')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('l\'impronta non lascia intravedere la chiave', async () => {
    expect(await impronta('NATALE2026SEGRETISSIMO')).not.toMatch(/natale/i)
  })
})

function dbToken(riga, errore = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: riga, error: errore }) }) }),
      }),
    }),
  }
}

describe('dalla chiave all\'organizzazione', () => {
  const lunga = 'k'.repeat(40)

  it('una chiave corta non viene nemmeno cercata', async () => {
    for (const t of ['', null, undefined, 'corta']) {
      const r = await risolviToken(dbToken(null), t, 'tilby')
      expect(r.ok, String(t)).toBe(false)
      expect(r.motivo).toBe('token_mancante')
    }
  })

  it('una chiave valida dà l\'organizzazione', async () => {
    const r = await risolviToken(dbToken({ id: 't1', organization_id: 'org-1', provider: 'tilby' }), lunga, 'tilby')
    expect(r).toMatchObject({ ok: true, tokenId: 't1', organizationId: 'org-1', provider: 'tilby' })
  })

  it('una chiave sconosciuta no, e non dice perché in modo utile a chi prova', async () => {
    const r = await risolviToken(dbToken(null), lunga, 'tilby')
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('token_sconosciuto')
  })

  it('la chiave di una marca non vale per un\'altra', async () => {
    const r = await risolviToken(dbToken({ id: 't1', organization_id: 'o', provider: 'rch' }), lunga, 'tilby')
    expect(r).toMatchObject({ ok: false, motivo: 'token_altra_marca' })
  })

  it('senza marca richiesta non si controlla la marca', async () => {
    const r = await risolviToken(dbToken({ id: 't1', organization_id: 'o', provider: 'rch' }), lunga, null)
    expect(r.ok).toBe(true)
  })

  it('se il database non risponde si dice di no, non si lascia passare', async () => {
    const r = await risolviToken(dbToken(null, { message: 'giù' }), lunga, 'tilby')
    expect(r).toMatchObject({ ok: false, motivo: 'lettura_fallita' })
  })
})

describe('segnare quando la chiave è stata usata', () => {
  it('aggiorna la riga giusta', async () => {
    const chiamate = []
    const db = { from: () => ({ update: (v) => ({ eq: async (k, id) => { chiamate.push({ v, k, id }); return {} } }) }) }
    await segnaUso(db, 't1')
    expect(chiamate[0].id).toBe('t1')
    expect(chiamate[0].v.ultimo_uso_il).toBeTruthy()
  })

  it('senza id non fa niente', async () => {
    const db = { from: () => { throw new Error('non doveva chiamare') } }
    await expect(segnaUso(db, null)).resolves.toBeUndefined()
  })

  it('se fallisce, la richiesta va avanti: è una nota, non un controllo', async () => {
    const db = { from: () => { throw new Error('giù') } }
    await expect(segnaUso(db, 't1')).resolves.toBeUndefined()
  })
})

describe('l\'organizzazione è ancora attiva?', () => {
  const dbOrg = (riga, errore = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: riga, error: errore }) }) }) }),
  })

  it('attiva: si passa', async () => {
    expect(await organizzazioneAttiva(dbOrg({ id: 'o', attivo: true }), 'o')).toEqual({ ok: true })
  })

  it('un\'attività senza il campo si considera attiva', async () => {
    expect((await organizzazioneAttiva(dbOrg({ id: 'o' }), 'o')).ok).toBe(true)
  })

  it('disattivata: 403, e lo dice in italiano', async () => {
    const r = await organizzazioneAttiva(dbOrg({ id: 'o', attivo: false }), 'o')
    expect(r).toMatchObject({ ok: false, stato: 403 })
    expect(r.errore).toMatch(/disattivata/)
  })

  it('inesistente: 404', async () => {
    expect(await organizzazioneAttiva(dbOrg(null), 'o')).toMatchObject({ ok: false, stato: 404 })
  })

  it('se il database va in errore: 500, e non si passa', async () => {
    expect(await organizzazioneAttiva(dbOrg(null, { message: 'giù' }), 'o')).toMatchObject({ ok: false, stato: 500 })
    const esplode = { from: () => { throw new Error('rete') } }
    expect(await organizzazioneAttiva(esplode, 'o')).toMatchObject({ ok: false, stato: 500 })
  })
})

// ══ Quanto il tempo sposta la domanda ═════════════════════════════════════

describe('correzione meteo', () => {
  const caldo = { t_max: 32, precip: 0 }
  const freddo = { t_max: 5, precip: 0 }
  const pioggia = { t_max: 18, precip: 20 }
  const mite = { t_max: 20, precip: 0 }

  it('senza meteo non corregge niente', () => {
    expect(correzioneMeteo(null, 'gelateria')).toBe(1)
    expect(correzioneMeteo(undefined, 'pasticceria')).toBe(1)
  })

  it('una giornata mite non sposta niente', () => {
    expect(correzioneMeteo(mite, 'gelateria')).toBe(1)
    expect(correzioneMeteo(mite, 'pasticceria')).toBe(1)
  })

  it('col caldo la gelateria vende di più e la pasticceria un po\' meno', () => {
    expect(correzioneMeteo(caldo, 'gelateria')).toBeGreaterThan(1)
    expect(correzioneMeteo(caldo, 'pasticceria')).toBeLessThan(1)
  })

  it('col freddo è il contrario, e per il gelato pesa di più', () => {
    const gel = correzioneMeteo(freddo, 'gelateria')
    const past = correzioneMeteo(freddo, 'pasticceria')
    expect(gel).toBeLessThan(1)
    expect(past).toBeGreaterThan(1)
    expect(1 - gel).toBeGreaterThan(past - 1)
  })

  it('la pioggia vera toglie gente a tutti', () => {
    expect(correzioneMeteo(pioggia, 'gelateria')).toBeLessThan(1)
    expect(correzioneMeteo(pioggia, 'pasticceria')).toBeLessThan(1)
  })

  it('caldo e pioggia insieme si compongono', () => {
    const solo = correzioneMeteo({ t_max: 32, precip: 0 }, 'gelateria')
    const entrambi = correzioneMeteo({ t_max: 32, precip: 30 }, 'gelateria')
    expect(entrambi).toBeLessThan(solo)
  })

  it('le soglie sono quelle dichiarate, non numeri sparsi nel codice', () => {
    expect(correzioneMeteo({ t_max: SOGLIA_CALDO_C, precip: 0 }, 'gelateria')).toBeGreaterThan(1)
    expect(correzioneMeteo({ t_max: SOGLIA_CALDO_C - 1, precip: 0 }, 'gelateria')).toBe(1)
    expect(correzioneMeteo({ t_max: SOGLIA_FREDDO_C, precip: 0 }, 'gelateria')).toBeLessThan(1)
    expect(correzioneMeteo({ t_max: 20, precip: SOGLIA_PIOGGIA_MM }, 'gelateria')).toBe(1)
    expect(correzioneMeteo({ t_max: 20, precip: SOGLIA_PIOGGIA_MM + 0.1 }, 'gelateria')).toBeLessThan(1)
  })

  it('valori mancanti o storti non fanno esplodere il conto', () => {
    for (const m of [{}, { t_max: null }, { t_max: 'caldo', precip: 'tanta' }]) {
      const r = correzioneMeteo(m, 'gelateria')
      expect(Number.isFinite(r), JSON.stringify(m)).toBe(true)
      expect(r).toBeGreaterThan(0)
    }
  })
})

describe('la correzione spiegata a parole', () => {
  it('un numero corretto senza dire perché è un numero di cui non ci si fida', () => {
    expect(spiegaCorrezione({ t_max: 32, precip: 0 }, 'gelateria')).toMatch(/caldo, più gelato/)
    expect(spiegaCorrezione({ t_max: 32, precip: 0 }, 'pasticceria')).toMatch(/caldo, meno caffè/)
    expect(spiegaCorrezione({ t_max: 5, precip: 0 }, 'gelateria')).toMatch(/freddo, meno gelato/)
    expect(spiegaCorrezione({ t_max: 18, precip: 20 }, 'gelateria')).toMatch(/pioggia/)
  })

  it('più motivi si leggono di fila', () => {
    const s = spiegaCorrezione({ t_max: 32, precip: 20 }, 'gelateria')
    expect(s).toMatch(/caldo/)
    expect(s).toMatch(/pioggia/)
    expect(s).toContain(' · ')
  })

  it('se non c\'è niente da dire non dice niente', () => {
    expect(spiegaCorrezione({ t_max: 20, precip: 0 }, 'gelateria')).toBe(null)
    expect(spiegaCorrezione(null, 'gelateria')).toBe(null)
  })

  it('la spiegazione concorda col numero', () => {
    for (const m of [{ t_max: 32, precip: 0 }, { t_max: 5, precip: 0 }, { t_max: 18, precip: 20 }, { t_max: 20, precip: 0 }]) {
      for (const tipo of ['gelateria', 'pasticceria']) {
        const corretto = correzioneMeteo(m, tipo) !== 1
        const spiegato = spiegaCorrezione(m, tipo) !== null
        expect(corretto, `${JSON.stringify(m)} ${tipo}`).toBe(spiegato)
      }
    }
  })
})

describe('il meteo dei prossimi giorni', () => {
  const vero = globalThis.fetch
  afterEach(() => { globalThis.fetch = vero })

  it('senza città non chiama nessuno', async () => {
    globalThis.fetch = vi.fn()
    expect(await meteoProssimiGiorni('')).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('trasforma la risposta nella forma che usa il programma', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ results: [{ latitude: 45, longitude: 7 }] }) })
      .mockResolvedValueOnce({ json: async () => ({ daily: {
        time: ['2026-09-16', '2026-09-17'],
        temperature_2m_max: [30, 22],
        temperature_2m_min: [18, 14],
        precipitation_sum: [0, 12],
        weather_code: [0, 61],
      } }) })
    const r = await meteoProssimiGiorni('Torino', 2)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ data: '2026-09-16', t_max: 30, t_min: 18, precip: 0, weather_code: 0 })
    expect(r[1].precip).toBe(12)
  })

  it('una città che non esiste dà un elenco vuoto, non un errore', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ json: async () => ({ results: [] }) })
    expect(await meteoProssimiGiorni('Vattelapesca')).toEqual([])
  })

  it('se il servizio non risponde, la pagina si apre lo stesso', async () => {
    // Una previsione senza meteo è meno buona; una pagina che non si apre è
    // peggio.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('rete'))
    expect(await meteoProssimiGiorni('Torino')).toEqual([])
  })

  it('una risposta senza i giorni non fa esplodere niente', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ results: [{ latitude: 45, longitude: 7 }] }) })
      .mockResolvedValueOnce({ json: async () => ({}) })
    expect(await meteoProssimiGiorni('Torino')).toEqual([])
  })

  it('valori mancanti diventano null, non «undefined»', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ results: [{ latitude: 45, longitude: 7 }] }) })
      .mockResolvedValueOnce({ json: async () => ({ daily: { time: ['2026-09-16'] } }) })
    const r = await meteoProssimiGiorni('Torino')
    expect(r[0]).toEqual({ data: '2026-09-16', t_max: null, t_min: null, precip: 0, weather_code: null })
  })
})
