// «Deve vedere solo le pagine per dipendente, assolutamente ed è un must.»
//
// Il filtro c'era, ma era una porta di legno. Il controllo girava in un
// `useEffect`, cioè DOPO che React aveva già disegnato la pagina vietata: per
// un fotogramma il P&L compariva e le sue richieste al database partivano. E
// la ricerca rapida offriva la scorciatoia — si scriveva "stipendi" e usciva
// "Personale".
//
// La parete vera però è il database, e lì c'era un buco provato su dati veri:
// un dipendente leggeva 8 righe di `costi_aziendali`, cioè affitti e utenze.
// Il pattern: la porta principale chiusa (`fatture`) e la finestra di lato
// aperta (`extracted_invoices`, che sono le stesse fatture lette dall'OCR).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

const DASH = leggi('src', 'Dashboard.jsx')
const PALETTE = leggi('src', 'components', 'CommandPalette.jsx')

const DIR = join(RADICE, 'supabase', 'migrations')
const MIGR = readFileSync(
  join(DIR, readdirSync(DIR).find(f => f.includes('dipendente_solo_le_sue_pagine'))), 'utf8')

// L'elenco vero, letto dal codice: se qualcuno ci aggiunge una pagina, i
// controlli qui sotto lo seguono invece di restare fermi su una copia.
//
// Dal 15/09/2026 l'elenco sta in src/lib/menuFoodos.js, insieme al menu che
// lo usa: era una delle otto copie a mano della stessa informazione dentro
// Dashboard.jsx, e quelle copie erano già divergenti fra loro.
const MENU = leggi('src', 'lib', 'menuFoodos.js')

function elencoPermesse() {
  const blocco = MENU.split('export const VISTE_DIPENDENTE = new Set([')[1].split('])')[0]
  // Via i commenti, o si finisce per contare le pagine citate nelle
  // spiegazioni invece di quelle davvero permesse.
  const vive = blocco.split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n')
  return [...vive.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1])
}

describe('la pagina vietata non viene nemmeno disegnata', () => {
  it('esiste una pagina "effettiva", calcolata durante il render', () => {
    // Non in un useEffect: quello gira dopo il disegno.
    expect(DASH).toMatch(/const vista = \(isDip && !DIPENDENTE_VIEWS\.has\(view\)\) \? 'home-dipendente' : view/)
  })

  it('il blocco che monta le pagine usa quella, non la pagina richiesta', () => {
    const inizio = DASH.indexOf('vista==="home"&&<DashboardHomeView')
    const fine = DASH.indexOf('<CommandPalette open={cmdkOpen}')
    expect(inizio).toBeGreaterThan(-1)
    const render = DASH.slice(inizio, fine)
    expect(render).not.toMatch(/view===/)
    expect((render.match(/vista===/g) || []).length).toBeGreaterThan(40)
  })

  it('e nessuna strada di navigazione porta fuori dall\'elenco', () => {
    expect(DASH).toMatch(/auth\?\.ruolo === 'dipendente' && !DIPENDENTE_VIEWS\.has\(v\)/)
  })

  it('nemmeno ricaricando la pagina', () => {
    expect(DASH).toMatch(/!isDipIniziale \|\| DIPENDENTE_VIEWS\.has\(stored\)/)
  })
})

describe('la ricerca rapida non offre pagine che non sono sue', () => {
  it('i risultati sono filtrati per ruolo', () => {
    expect(PALETTE).toMatch(/function quickMatch\(q, permesse\)/)
    expect(PALETTE).toMatch(/if \(permesse && !permesse\.has\(item\.view\)\) continue/)
    expect(DASH).toMatch(/vistePermesse=\{isDip \? DIPENDENTE_VIEWS : null\}/)
  })

  it('l\'assistente conosce solo le pagine di chi sta chiedendo', () => {
    expect(PALETTE).toMatch(/View-id disponibili: \$\{elencoViste\}/)
    expect(PALETTE).toMatch(/QUICK_NAV\.filter\(i => vistePermesse\.has\(i\.view\)\)/)
  })

  it('e se sbaglia comunque, la scorciatoia non compare e il clic non passa', () => {
    expect(PALETTE).toMatch(/if \(vistePermesse && !vistePermesse\.has\(view\)\) \{\s*\n\s*setAiAnswer/)
    expect(PALETTE).toMatch(/function doNavigate\(view\) \{\s*\n\s*if \(vistePermesse && !vistePermesse\.has\(view\)\)/)
  })
})

describe('il database rispecchia l\'interfaccia', () => {
  // La regola: se una pagina non è nell'elenco del dipendente, i dati di
  // quella pagina non si leggono. Non basta nascondere il bottone.
  const CHIUSE = [
    ['costi_aziendali', 'affitti, utenze, costi fissi — 8 righe vere in produzione'],
    ['extracted_invoices', 'sono fatture: `fatture` era già chiusa, questa no'],
    ['competitor_prices', 'prezzi dei concorrenti'],
    ['benchmarks_anonimi', 'confronti di settore'],
  ]

  for (const [tabella, perche] of CHIUSE) {
    it(`${tabella} esclude il dipendente (${perche})`, () => {
      // Solo le vere definizioni di regola, non il commento in testa al file
      // che nomina le tabelle spiegando il difetto.
      const rx = new RegExp(`create policy\\s+\\w+\\s+on public\\.${tabella}\\b[\\s\\S]*?;`, 'g')
      const blocchi = MIGR.match(rx) || []
      expect(blocchi.length, `nessuna regola nuova per ${tabella}`).toBeGreaterThan(0)
      for (const b of blocchi) {
        expect(b, `${tabella}: una regola non esclude il dipendente`).toMatch(/not public\.is_dipendente\(\)/)
      }
    })
  }

  it('le pagine che SONO sue restano leggibili', () => {
    // Cassa, Produzione e Magazzino sono nell'elenco del dipendente: chiudere
    // chiusure_cassa o stock_prodotti_finiti spegnerebbe il suo lavoro.
    const permesse = elencoPermesse()
    expect(permesse).toContain('chiusura')
    expect(permesse).toContain('magazzino')
    expect(permesse).toContain('giornaliero')
    for (const t of ['chiusure_cassa', 'movimenti_cassa', 'stock_prodotti_finiti', 'inventario_produzione']) {
      expect(MIGR, `${t} non va toccata: serve a una pagina del dipendente`).not.toContain(`public.${t}`)
    }
  })

  it('sui trasferimenti la regola è cambiata lo stesso giorno, e si vede', () => {
    // La mattina del 15/09 erano stati chiusi al dipendente perché la pagina
    // non era nella sua lista. Il pomeriggio il titolare ha deciso che deve
    // poter ricevere: la regola nuova sta in 20260915f e sostituisce questa.
    expect(MIGR).toMatch(/Trasferimenti si aprirà al[\s\S]{0,200}questa è la riga/)
    const successiva = readFileSync(
      join(DIR, readdirSync(DIR).find(f => f.includes('trasferimenti_blocco_riga_e_ruoli'))), 'utf8')
    expect(successiva).toMatch(/drop policy if exists trasferimenti_own/)
    expect(successiva).toMatch(/create policy trasferimenti_lettura/)
  })
})

describe('le pagine del dipendente sono quelle e basta', () => {
  it('l\'elenco non è cresciuto di nascosto', () => {
    const permesse = elencoPermesse()
    // 'trasferimenti' aggiunto il 15/09/2026 su decisione del titolare: è il
    // dipendente che scarica il furgone alla sede. Ma **solo ricevere** — non
    // crea, non invia, non annulla: quello lo impediscono le funzioni sul
    // database (20260915f), non questa lista.
    //
    // 'haccp' tolto lo stesso giorno: era una voce morta. La pagina è in
    // PAGINE_NASCOSTE dal 09/09/2026 e non si apre per nessuno — il
    // dipendente se la vedeva elencata fra i suoi permessi e non ci sarebbe
    // mai potuto entrare.
    expect(permesse.sort()).toEqual([
      'calendario', 'changelog', 'chiusura', 'giornaliero',
      'home-dipendente', 'impostazioni', 'inventario-gusti', 'magazzino',
      'sprechi-omaggi', 'trasferimenti',
    ])
  })

  it('nessuna pagina di soldi o di persone è fra quelle', () => {
    const permesse = new Set(elencoPermesse())
    for (const v of ['pl', 'personale', 'scadenzario', 'fornitori', 'costi-aziendali',
                     'storico', 'confronto-sedi', 'vendite-b2b', 'ricettario',
                     'simulatore', 'previsione']) {
      expect(permesse.has(v), `${v} non deve essere una pagina del dipendente`).toBe(false)
    }
  })
})


describe('nessuna pagina permessa è una porta murata', () => {
  it('le pagine del dipendente si aprono davvero', () => {
    // Una pagina che è fra i suoi permessi ma sta in PAGINE_NASCOSTE non si
    // apre per nessuno: è una promessa che il programma non mantiene. È
    // successo con 'haccp', rimasto in elenco dopo che la pagina era stata
    // chiusa il 09/09/2026.
    const nascoste = DASH.split('const PAGINE_NASCOSTE = new Set([')[1].split('])')[0]
    const chiuse = new Set([...nascoste.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]))
    for (const v of elencoPermesse()) {
      expect(chiuse.has(v), `"${v}" è fra le pagine del dipendente ma è una pagina chiusa`).toBe(false)
    }
  })
})
