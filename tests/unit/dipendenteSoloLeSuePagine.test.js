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
function elencoPermesse() {
  const blocco = DASH.split('const DIPENDENTE_VIEWS = new Set([')[1].split('])')[0]
  return [...blocco.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1])
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
    ['trasferimenti', 'la pagina Trasferimenti non è sua'],
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

  it('la migrazione dice a chi legge dove tornare se le regole cambiano', () => {
    expect(MIGR).toMatch(/Trasferimenti si aprirà al[\s\S]{0,200}questa è la riga/)
  })
})

describe('le pagine del dipendente sono quelle e basta', () => {
  it('l\'elenco non è cresciuto di nascosto', () => {
    const permesse = elencoPermesse()
    expect(permesse.sort()).toEqual([
      'calendario', 'changelog', 'chiusura', 'giornaliero', 'haccp',
      'home-dipendente', 'impostazioni', 'inventario-gusti', 'magazzino',
      'sprechi-omaggi',
    ])
  })

  it('nessuna pagina di soldi o di persone è fra quelle', () => {
    const permesse = new Set(elencoPermesse())
    for (const v of ['pl', 'personale', 'scadenzario', 'fornitori', 'costi-aziendali',
                     'storico', 'confronto-sedi', 'vendite-b2b', 'ricettario',
                     'trasferimenti', 'simulatore', 'previsione']) {
      expect(permesse.has(v), `${v} non deve essere una pagina del dipendente`).toBe(false)
    }
  })
})
