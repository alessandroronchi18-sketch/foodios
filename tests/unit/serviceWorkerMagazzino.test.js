// Il service worker non deve ributtare via tutto a ogni rilascio.
//
// Il nome della cache conteneva la versione del rilascio, e `activate`
// cancellava tutto quello che non cominciava con la versione nuova: **a ogni
// aggiornamento il telefono buttava via 1,5 MB e li riscaricava**, compresi i
// 635 kB del modulo PDF e i 453 kB dei grafici che non erano cambiati.
// In negozio, con la rete del telefono, è la differenza fra aprire l'app e
// aspettare.
//
// Vite mette il contenuto nel nome del file (`index-DNeLJPZJ.js`): un file
// con lo stesso nome è identico per definizione, quindi tenerlo non può mai
// servire una versione vecchia.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import { join } from 'node:path'

const SW = readFileSync(join(import.meta.dirname, '../../public/sw.js'), 'utf8')
const vive = SW.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')

// La stessa regola che usa il service worker, estratta dal file vero: se
// qualcuno la cambia, questi test seguono invece di restare indietro.
function regolaImpronta() {
  const m = vive.match(/function haImpronta\(pathname\) \{\s*return ([^;]+);/)
  expect(m, 'la regola che riconosce i file con l\'impronta non si trova').toBeTruthy()
  // eslint-disable-next-line no-new-func
  return new Function('pathname', `return ${m[1]}`)
}

describe('quali file finiscono nel magazzino permanente', () => {
  const dentro = regolaImpronta()

  it('i file con l\'impronta nel nome sì', () => {
    for (const f of [
      '/assets/index-DNeLJPZJ.js',
      '/assets/pdf-D97ZYJWw.js',
      '/assets/charts-DiCU6mvn.js',
      // L'impronta di Vite può contenere un trattino: una regola scritta
      // sulla forma del nome ci era già inciampata.
      '/assets/AdminPage-Ds8yKJ-s.js',
      '/assets/index-CLpOQnnv.css',
      '/assets/inter-latin-X1y2Z3a4.woff2',
    ]) {
      expect(dentro(f), `"${f}" dovrebbe stare nel magazzino`).toBe(true)
    }
  })

  it('i file che possono cambiare restando con lo stesso nome no', () => {
    // Questi vanno serviti come prima, altrimenti un logo cambiato non
    // arriverebbe mai. Stanno alla radice, non in /assets/.
    for (const f of ['/logo.svg', '/favicon.svg', '/manifest.json', '/', '/index.html', '/sw.js']) {
      expect(dentro(f), `"${f}" NON deve stare nel magazzino permanente`).toBe(false)
    }
  })

  it('la compilazione mette in /assets/ solo file con l\'impronta', () => {
    // È il presupposto su cui poggia la regola. Se un giorno la
    // compilazione ci mettesse un file dal nome stabile, questo test lo
    // dice invece di lasciare un file vecchio in cache per sempre.
    const { readdirSync, existsSync } = require('node:fs')
    const dir = join(import.meta.dirname, '../../dist/assets')
    if (!existsSync(dir)) return   // niente build: si salta, non si finge
    const senzaImpronta = readdirSync(dir).filter(f => !/-[A-Za-z0-9_-]{8}\./.test(f))
    expect(senzaImpronta, `file senza impronta in /assets/: ${senzaImpronta.join(', ')}`).toEqual([])
  })
})

describe('il magazzino sopravvive ai rilasci', () => {
  it('ha un nome che non contiene la versione del rilascio', () => {
    const m = vive.match(/const ASSET_CACHE = '([^']+)'/)
    expect(m, 'ASSET_CACHE non si trova').toBeTruthy()
    expect(m[1], 'il nome del magazzino contiene la data del rilascio').not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(m[1]).not.toContain('${')
  })

  it('e la pulizia all\'avvio lo risparmia', () => {
    expect(vive).toMatch(/\.filter\(\(k\) => k !== ASSET_CACHE && !k\.startsWith\(CACHE_VERSION\)\)/)
  })

  it('mentre le cache vecchie del vecchio schema si cancellano ancora', () => {
    // Chi aveva già l'app installata ha ancora le cache col nome versionato:
    // quelle vanno via, o restano lì per sempre a occupare spazio.
    expect(vive).toMatch(/!k\.startsWith\(CACHE_VERSION\)/)
    expect(vive).toMatch(/caches\.delete\(k\)/)
  })
})

describe('il magazzino non cresce all\'infinito', () => {
  it('ha un tetto dichiarato', () => {
    const m = vive.match(/const MAX_ASSET_ENTRIES = (\d+)/)
    expect(m, 'nessun tetto: dopo venti rilasci il telefono è pieno').toBeTruthy()
    const n = Number(m[1])
    // Abbastanza da tenere due o tre rilasci interi (una sessantina di file
    // l'uno), non così tanto da non servire a niente.
    expect(n).toBeGreaterThanOrEqual(60)
    expect(n).toBeLessThanOrEqual(500)
  })

  it('butta le più vecchie, non a caso', () => {
    expect(vive).toMatch(/chiavi\.slice\(0, chiavi\.length - MAX_ASSET_ENTRIES\)/)
  })

  it('se lo sfoltimento fallisce, il magazzino continua a funzionare', () => {
    expect(vive).toMatch(/async function sfoltisci[\s\S]*?catch \(e\)/)
  })
})

describe('quello che non si cacha mai, non si cacha ancora', () => {
  it('i dati, l\'autenticazione e i pagamenti restano fuori', () => {
    for (const h of ['supabase.co', 'api.anthropic.com', 'api.stripe.com']) {
      expect(vive).toContain(h)
    }
    expect(vive).toMatch(/if \(NEVER_CACHE_HOSTS\.some/)
  })

  it('le chiamate al nostro server restano sempre dalla rete', () => {
    expect(vive).toMatch(/url\.pathname\.startsWith\('\/api\/'\)/)
  })

  it('solo le richieste GET: mai le scritture', () => {
    expect(vive).toMatch(/request\.method !== 'GET'/)
  })

  it('le pagine HTML restano «prima la rete», così un aggiornamento arriva subito', () => {
    expect(vive).toMatch(/request\.mode === 'navigate'/)
    expect(vive).toMatch(/networkFirstHTML\(request\)/)
  })
})

describe('senza rete', () => {
  it('un file del magazzino che non c\'è lascia fallire, non restituisce una pagina', () => {
    // Restituire una pagina di errore dove il browser si aspetta uno script
    // rompe l'applicazione in un modo molto più confuso di un file mancante.
    const inizio = vive.indexOf('async function dalMagazzino')
    const f = vive.slice(inizio, vive.indexOf('\n}', inizio))
    expect(f).toMatch(/throw e/)
    expect(f).not.toMatch(/new Response\(/)
  })

  it('una pagina HTML senza rete ricade sulla copia, e poi su un messaggio', () => {
    const i = vive.indexOf('async function networkFirstHTML')
    const f = vive.slice(i, vive.indexOf('\n}', i))
    expect(f).toMatch(/caches\.match\(request\)/)
    expect(f).toMatch(/caches\.match\('\/'\)/)
    expect(f).toMatch(/Offline e cache vuota/)
  })
})
