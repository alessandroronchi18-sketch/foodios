// Perdite e cessioni: 19 movimenti registrati, e la pagina diceva
// "Nessuna perdita registrata nel mese. Ottimo controllo."
//
// Il seed della demo scriveva i movimenti con i campi `data`, `nome`, `valore`
// e le causali 'rotto'/'omaggio_cliente'. La pagina invece legge `ts`,
// `prodotto`, `fcTot`, `fcUnit`, `valoreOmaggio` — che è lo shape che
// aggiungiMovimento scrive davvero (movimentiSpeciali.js:74-79) — e riconosce
// solo le causali dichiarate in CAUSALI.
//
// Effetto: `new Date(m.ts)` su undefined dà Invalid Date, il filtro per
// intervallo scartava TUTTE le 19 righe presenti nel database, e la pagina
// mostrava una card verde con la spunta e il complimento "Ottimo controllo".
//
// È lo stesso schema del food cost 0 che diventava "margine 100%": il dato che
// non si riesce a leggere diventa assenza, e l'assenza diventa una buona
// notizia. Su una pagina che serve a tenere sotto controllo gli sprechi, è il
// contrario di quello che deve fare.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { filtraPerIntervallo, contaDateIlleggibili } from '../../src/lib/movimentiSpeciali'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('filtro per data — non nasconde ciò che non riesce a leggere', () => {
  const conTs = { ts: '2026-06-18T16:00:00.000Z', prodotto: 'CROSTATA', qta: 3, fcTot: 15.6 }
  // Lo shape vecchio del seed: data al posto di ts.
  const vecchio = { data: '2026-06-18', nome: 'CROSTATA', qta: 3, valore: 15.6 }

  it('tiene i movimenti dentro il periodo', () => {
    const out = filtraPerIntervallo([conTs], '2026-06-01', '2026-06-30')
    expect(out).toHaveLength(1)
  })

  it('scarta chi ha una data illeggibile, ma lo si può contare', () => {
    const lista = [conTs, vecchio, { ts: 'domani' }, {}]
    expect(filtraPerIntervallo(lista, '2026-06-01', '2026-06-30')).toHaveLength(1)
    // Tre righe non hanno una data leggibile: la pagina deve saperlo.
    expect(contaDateIlleggibili(lista)).toBe(3)
  })

  it('con tutte le date buone il contatore è zero', () => {
    expect(contaDateIlleggibili([conTs, { ts: '2026-01-01T10:00:00Z' }])).toBe(0)
  })

  it('regge liste vuote e input strani', () => {
    for (const x of [null, undefined, []]) {
      expect(filtraPerIntervallo(x, '2026-01-01', '2026-12-31')).toEqual([])
      expect(contaDateIlleggibili(x)).toBe(0)
    }
  })
})

describe('il seed della demo usa lo shape che la pagina legge', () => {
  const seed = readFileSync(join(RADICE, 'src', 'lib', 'demoSeedFull.js'), 'utf8')
  const pagina = readFileSync(join(RADICE, 'src', 'components', 'SpreciOmaggi.jsx'), 'utf8')

  it('scrive ts, prodotto e fcTot, non data, nome e valore', () => {
    const i = seed.indexOf('function buildMovimenti(')
    expect(i).toBeGreaterThan(-1)
    // Fino alla riga di ritorno: dentro la funzione ci sono altre graffe.
    const fn = seed.slice(i, seed.indexOf('return out.sort', i))
    // I campi possono essere scritti in forma abbreviata (`fcUnit,`) o esplicita.
    for (const campo of ['ts', 'prodotto', 'fcTot', 'fcUnit', 'valoreOmaggio', 'unita']) {
      expect(fn, `il seed deve scrivere ${campo}`).toMatch(new RegExp(`\\b${campo}[,:]`))
    }
    // I campi vecchi non devono più comparire come chiavi del movimento.
    expect(fn).not.toMatch(/^\s+data: isoDate/m)
    expect(fn).not.toMatch(/^\s+nome: choice/m)
    expect(fn).not.toMatch(/^\s+valore: roundCents/m)
  })

  it('usa solo causali che la pagina sa tradurre', () => {
    const i = seed.indexOf('function buildMovimenti(')
    const fn = seed.slice(i, seed.indexOf('return out.sort', i))
    const usate = [...fn.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    // Le causali dichiarate nella pagina.
    const valide = [...pagina.matchAll(/\{ id: '([a-z_]+)',\s+label:/g)].map(m => m[1])
    expect(valide.length).toBeGreaterThan(5)
    for (const c of usate) {
      // Consideriamo solo le stringhe che sembrano causali (quelle nelle due liste).
      if (!/^(scaduto|scarto|avanzo|errore_produzione|regalo|cortesia|test_ricetta|rotto|omaggio_cliente|danneggiato_trasporto|ammanco)$/.test(c)) continue
      expect(valide, `la causale "${c}" non esiste nella pagina`).toContain(c)
    }
  })

  it('la pagina non dice "Ottimo controllo" quando ci sono righe illeggibili', () => {
    expect(pagina).toMatch(/nIlleggibili > 0 \?/)
    expect(pagina).toMatch(/non riesco a leggere/)
    expect(pagina).toMatch(/Non è "nessuna perdita"/)
  })
})

describe('lo scarico della vetrina non fallisce piu in silenzio', () => {
  const api = readFileSync(join(RADICE, 'api', 'spreco-registra.js'), 'utf8')

  it('chiama la funzione col nome di parametro che esiste nel database', () => {
    // La funzione in produzione è stock_pf_scarto(p_sede, p_prodotto,
    // p_quantita, p_note[, p_dipendente_op]): nessuna versione accetta
    // p_sede_id, che è quello che l'API passava.
    const i = api.indexOf("supabase.rpc('stock_pf_scarto'")
    expect(i).toBeGreaterThan(-1)
    const chiamata = api.slice(i, i + 300)
    expect(chiamata).toContain('p_sede:')
    expect(chiamata).not.toContain('p_sede_id')
  })

  it('controlla l errore restituito, perche supabase.rpc non lancia', () => {
    // Il vecchio codice si affidava a un try/catch che non scattava mai: rpc
    // ritorna { error }, non lancia. Quindi nemmeno il console.warn partiva.
    expect(api).toMatch(/const \{ error: errScarto \} = await supabase\.rpc\('stock_pf_scarto'/)
    expect(api).toMatch(/if \(errScarto\)/)
    expect(api).toMatch(/scaricoStock/)
  })

  it('dice al client se la vetrina non e stata scaricata', () => {
    expect(api).toMatch(/scaricoStock \}, 200, req\)/)
    const pagina = readFileSync(join(RADICE, 'src', 'components', 'SpreciOmaggi.jsx'), 'utf8')
    expect(pagina).toMatch(/resp\.scaricoStock/)
    expect(pagina).toMatch(/non ho potuto scaricarla dalla vetrina/)
  })
})
