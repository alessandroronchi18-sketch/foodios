// I piani si chiamano Standard, Plus e Ultra, e per ora se ne vende uno solo.
//
// Decisione del titolare, 15/09/2026. Questi controlli tengono ferme due cose:
// che i nomi siano scritti in UN posto solo (la volta scorsa erano sparsi in
// otto file e sono rimasti sbagliati per tre mesi), e che quello che si mostra
// in vetrina e nel contratto sia quello che si può davvero comprare.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PLAN_LABEL, PLAN_PRICE_EUR, PIANI_IN_VENDITA, pianoInVendita, SBLOCCO_TUTTE_LE_PAGINE } from '../../src/lib/planAccess.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('i nomi', () => {
  it('sono Standard, Plus e Ultra', () => {
    expect(PLAN_LABEL.base).toBe('Standard')
    expect(PLAN_LABEL.pro).toBe('Plus')
    expect(PLAN_LABEL.enterprise).toBe('Ultra')
    expect(PLAN_LABEL.chain).toBe('Ultra')
  })

  it('i vecchi non compaiono più da nessuna parte a schermo', () => {
    // Bottega/Maestro/Insegna erano i nomi del 21/06. Prima ancora erano
    // Pro/Chain, e quelli sono rimasti offerti al cliente per tre mesi dopo
    // essere stati sostituiti — compresi i Termini di servizio.
    const file = ['src/pages/LandingPage.jsx', 'src/pages/TerminiServizio.jsx',
      'src/components/AbbonamentoPanel.jsx', 'src/components/UpgradeModal.jsx',
      'src/components/WhiteLabel.jsx', 'src/components/ReferralPanel.jsx',
      'src/views/AiHubView.jsx', 'src/views/WhatsAppView.jsx', 'src/admin/AdminPage.jsx']
    for (const f of file) {
      const s = leggi(...f.split('/'))
      // Si guardano solo le righe che non sono commenti.
      const vive = s.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
      for (const vecchio of ['Bottega', 'Maestro', 'Insegna', "piano Chain", "piano Pro"]) {
        expect(vive, `${f} nomina ancora "${vecchio}"`).not.toContain(vecchio)
      }
    }
  })

  it('anche i valori di riserva, quelli usati se il database non risponde', () => {
    // Sono la rete: se restano indietro, basta un momento di Supabase giù per
    // far comparire i nomi vecchi sulla pagina pubblica.
    for (const f of ['api/pricing.js', 'src/lib/usePlanPricing.js']) {
      const s = leggi(...f.split('/'))
      expect(s).toContain("'Plus'")
      expect(s).not.toContain("'Maestro'")
      expect(s).not.toContain("'Insegna'")
      expect(s).not.toContain("'Bottega'")
    }
  })
})

describe('in vendita ce n\'è uno solo', () => {
  it('è il Plus', () => {
    expect(PIANI_IN_VENDITA).toEqual(['pro'])
    expect(pianoInVendita('pro')).toBe(true)
    expect(pianoInVendita('base')).toBe(false)
    expect(pianoInVendita('enterprise')).toBe(false)
    expect(pianoInVendita('chain')).toBe(false)  // l'alias segue l'originale
  })

  it('la vetrina mostra solo le tessere in vendita', () => {
    const L = leggi('src', 'pages', 'LandingPage.jsx')
    expect(L).toMatch(/const mostraPiano = \(chiave\) => \{/)
    expect(L).toMatch(/if \(!pianoInVendita\(chiave\)\) return false/)
    for (const k of ['base', 'pro', 'chain']) {
      expect(L, `la tessera ${k} non è dietro il controllo`).toContain(`{mostraPiano('${k}') && (`)
    }
  })

  it('e la griglia si stringe invece di lasciare due buchi', () => {
    const L = leggi('src', 'pages', 'LandingPage.jsx')
    expect(L).toMatch(/repeat\(\$\{nPianiMostrati\}, minmax\(0, 1fr\)\)/)
  })

  it('anche il database dice quale è acceso', () => {
    const DIR = join(RADICE, 'supabase', 'migrations')
    const M = readFileSync(join(DIR, readdirSync(DIR).find(f => f.includes('piani_standard_plus_ultra'))), 'utf8')
    expect(M).toMatch(/'pro', 14900[^)]*'Plus'[^)]*true/)
    expect(M).toMatch(/'base', 6900[^)]*'Standard'[^)]*false/)
    expect(M).toMatch(/'chain', 39900[^)]*'Ultra'[^)]*false/)
  })

  it('il flag "attivo" arriva fino alla pagina, invece di perdersi per strada', () => {
    // Si perdeva in buildMeta: la riga del database ce l'aveva e l'oggetto
    // costruito no, quindi la vetrina non poteva sapere cosa mostrare.
    expect(leggi('api', 'pricing.js')).toMatch(/descrizione, attivo'/)
    expect(leggi('src', 'lib', 'usePlanPricing.js')).toMatch(/attivo:\s+row\.attivo !== false/)
  })
})

describe('con un piano solo, è tutto sbloccato', () => {
  it('nessuna pagina è dietro un piano superiore', () => {
    expect(SBLOCCO_TUTTE_LE_PAGINE).toBe(true)
  })

  it('ma la divisione delle funzioni resta scritta, per quando si riaprono', () => {
    // Cancellarla vorrebbe dire rifarla da zero il giorno che si torna a tre
    // piani. Resta lì, spenta.
    const s = leggi('src', 'lib', 'planAccess.js')
    expect(s).toMatch(/VIEW_MIN_PLAN = \{/)
    expect(s).toMatch(/'confronto-sedi': 'enterprise'/)
  })
})

describe('i prezzi che il cliente legge sono quelli del listino', () => {
  it('il listino dichiara 69 / 149 / 399', () => {
    expect(PLAN_PRICE_EUR.base).toBe(69)
    expect(PLAN_PRICE_EUR.pro).toBe(149)
    expect(PLAN_PRICE_EUR.enterprise).toBe(399)
  })

  it('e la migrazione mette sul database gli stessi numeri', () => {
    // Il difetto: `plan_pricing` era ferma al 27/05 con pro=8900 e chain=14900,
    // e la riga del database vince su quella scritta nel codice. Risultato: la
    // pagina pubblica mostrava 89 € e 149 € dal 21/06. Per tre mesi.
    const DIR = join(RADICE, 'supabase', 'migrations')
    const M = readFileSync(join(DIR, readdirSync(DIR).find(f => f.includes('piani_standard_plus_ultra'))), 'utf8')
    for (const [chiave, euro] of [['base', 69], ['pro', 149], ['chain', 399]]) {
      expect(M, `${chiave} non è a ${euro} €`).toContain(`${euro * 100},`)
    }
  })
})
