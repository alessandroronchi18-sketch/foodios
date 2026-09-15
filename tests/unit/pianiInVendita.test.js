// Quali piani si possono comprare.
//
// Il titolare ha deciso il 15/09/2026 di vendere per ora solo Plus. Il
// comando è uno — la colonna `attivo` sulla riga di `plan_pricing`, che
// cambia dal pannello admin — e deve valere in quattro posti: la vetrina
// pubblica, il pannello abbonamento dentro l'app, l'invito a passare a Ultra
// nella personalizzazione, e il server che apre il pagamento.
//
// Prima valeva solo nella vetrina. Dentro l'app il pannello mostrava tutti e
// tre i piani con il bottone "Abbonati": quello di Standard rispondeva
// «Piano non valido: base», quello di Ultra avrebbe aperto un pagamento vero
// da 399 € al mese per un piano non in vendita.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inVendita, pianoInVendita, PIANI_IN_VENDITA } from '../../src/lib/planAccess'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
const vive = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')

describe('inVendita — comanda il database', () => {
  it('la riga del database vince sull\'elenco nel codice, in entrambi i versi', () => {
    // Aperto dal pannello un piano che il codice considera chiuso:
    expect(inVendita('chain', { attivo: true })).toBe(true)
    expect(inVendita('base', { attivo: true })).toBe(true)
    // Chiuso dal pannello un piano che il codice considera aperto:
    expect(inVendita('pro', { attivo: false })).toBe(false)
  })

  it('senza riga decide l\'elenco nel codice', () => {
    expect(inVendita('pro', null)).toBe(true)
    expect(inVendita('pro', undefined)).toBe(true)
    expect(inVendita('base')).toBe(false)
    expect(inVendita('chain')).toBe(false)
  })

  it('una riga senza il campo attivo non conta come chiusura', () => {
    // Una select vecchia che non seleziona la colonna non deve spegnere
    // il piano che si vende.
    expect(inVendita('pro', {})).toBe(true)
    expect(inVendita('pro', { prezzo_mese_cents: 14900 })).toBe(true)
    expect(inVendita('pro', { attivo: null })).toBe(true)
    expect(inVendita('pro', { attivo: 'si' })).toBe(true)
  })

  it('oggi si vende solo Plus', () => {
    expect(PIANI_IN_VENDITA).toEqual(['pro'])
    expect(pianoInVendita('pro')).toBe(true)
    for (const p of ['base', 'chain', 'enterprise', 'trial', '', null, 'inesistente']) {
      expect(pianoInVendita(p), String(p)).toBe(false)
    }
  })

  it('chain ed enterprise sono lo stesso piano', () => {
    expect(pianoInVendita('chain')).toBe(pianoInVendita('enterprise'))
    expect(pianoInVendita('  CHAIN ')).toBe(pianoInVendita('chain'))
  })
})

describe('il controllo è in tutti e quattro i posti', () => {
  const posti = [
    ['la vetrina pubblica', 'src/pages/LandingPage.jsx'],
    ['il pannello abbonamento', 'src/components/AbbonamentoPanel.jsx'],
    ['l\'invito a Ultra nella personalizzazione', 'src/components/WhiteLabel.jsx'],
    ['il server che apre il pagamento', 'api/stripe-checkout.js'],
  ]

  it.each(posti)('%s controlla se il piano è in vendita', (_nome, file) => {
    expect(vive(leggi(file))).toMatch(/\binVendita\s*\(/)
  })

  it('il pannello abbonamento non mostra tessere di piani chiusi', () => {
    const t = vive(leggi('src/components/AbbonamentoPanel.jsx'))
    // Le tessere si costruiscono da PIANI_DEFAULT: dev'esserci un filtro.
    expect(t).toMatch(/PIANI_DEFAULT\s*\.filter\(/)
  })

  it('il server rifiuta prima di chiamare Stripe', () => {
    const t = vive(leggi('api/stripe-checkout.js'))
    const posInVendita = t.indexOf('inVendita(')
    const posStripe = t.indexOf("await import('stripe')")
    expect(posInVendita).toBeGreaterThan(-1)
    // Il controllo dev'essere prima di creare la sessione di pagamento.
    expect(posInVendita).toBeLessThan(t.indexOf('checkout.sessions.create'))
    expect(posStripe).toBeGreaterThan(-1)
  })

  it('il pannello admin può accendere e spegnere l\'interruttore', () => {
    // «Devo poter decidere tutto»: senza questo, per aprire un piano bisogna
    // cambiare il codice e rifare un rilascio.
    const ui = vive(leggi('src/admin/AdminPage.jsx'))
    expect(ui).toMatch(/attivo:\s*!!priceDraft\.attivo/)
    expect(ui).toMatch(/In vendita/)
    const api = vive(leggi('api/admin.js'))
    expect(api).toMatch(/body\.attivo !== undefined/)
    expect(api).toMatch(/select\('plan, prezzo_mese_cents, valuta, stripe_price_id, label, nome_display, descrizione, attivo/)
  })
})

describe('il pannello admin e il database chiamano i piani allo stesso modo', () => {
  it('il pannello scrive su chain, non su enterprise', () => {
    // Il vincolo su plan_pricing accetta solo base|pro|chain: una modifica
    // salvata come `enterprise` creava una riga che nessuno legge, e sul
    // sito il prezzo di Ultra restava quello di prima.
    const ui = vive(leggi('src/admin/AdminPage.jsx'))
    expect(ui).toMatch(/\['base', 'pro', 'chain'\]/)
    expect(ui).not.toMatch(/\['base', 'pro', 'enterprise'\]/)
  })

  it('il server accetta enterprise ma lo scrive su chain', () => {
    const api = vive(leggi('api/admin.js'))
    expect(api).toMatch(/ALIAS = \{ enterprise: 'chain' \}/)
  })

  it('salvare senza toccare il nome non riporta i nomi vecchi', () => {
    // Prima ricadeva su Bottega / Maestro / Insegna: salvare solo il prezzo
    // faceva tornare "Plus" a chiamarsi "Maestro" sul sito e nelle email.
    const api = vive(leggi('api/admin.js'))
    expect(api).not.toMatch(/'Bottega'|'Maestro'|'Insegna'/)
    expect(api).toMatch(/label: nomeDisplay \|\| prev\?\.label/)
  })
})

describe('i prezzi mostrati sono quelli veri', () => {
  it('il pannello admin non ha più un listino scritto a mano', () => {
    const ui = vive(leggi('src/admin/AdminPage.jsx'))
    expect(ui).not.toMatch(/PIANO_PREZZO/)
    expect(ui).not.toMatch(/base:\s*39\b/)
  })

  it('il ricavo mensile non usa più 39 / 89 / 199', () => {
    // Erano prezzi di tre listini fa, e il valore di scorta 39 contava anche
    // i clienti in prova: il pannello mostrava 78 € di ricavo mensile.
    const api = vive(leggi('api/admin.js'))
    expect(api).not.toMatch(/PREZZO_PIANO/)
    expect(api).not.toMatch(/base:\s*39,\s*pro:\s*89/)
    expect(api).toMatch(/listinoPiani/)
  })

  it('un piano sconosciuto vale zero, non il prezzo di scorta', () => {
    const api = vive(leggi('api/admin.js'))
    expect(api).toMatch(/Number\.isFinite\(v\) \? v : 0/)
  })
})
