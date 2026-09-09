// Pagine nascoste: allergeni e HACCP non devono essere raggiungibili.
//
// Scelta del titolare del 09/09/2026, per responsabilita' e non per un difetto
// tecnico. La scheda allergeni e' un documento previsto dal Reg. UE 1169/2011:
// si stampa e si consegna al cliente. Se una casella risulta bianca dove doveva
// esserci un allergene, il locale e' fuori legge e il danno puo' essere una
// persona in ospedale.
//
// Il 09/09 il riconoscimento non copriva 81 dei 123 ingredienti realmente
// presenti nel database, e nella mappa dei 275 pattern la parola "cioccolato"
// non c'era: cinque prodotti da gelateria davano una riga completamente vuota.
//
// Questo test esiste perche' una voce di menu si riaggiunge in un attimo, per
// distrazione, e nessuno si accorgerebbe che una pagina con valore legale e'
// tornata visibile.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dash = readFileSync(join(RADICE, 'src', 'Dashboard.jsx'), 'utf8')

const NASCOSTE = ['scheda-allergeni', 'haccp']

describe('pagine nascoste', () => {
  it('sono dichiarate in un solo posto, con la spiegazione', () => {
    expect(dash).toContain('const PAGINE_NASCOSTE = new Set(')
    for (const id of NASCOSTE) {
      expect(dash).toMatch(new RegExp(`PAGINE_NASCOSTE = new Set\\(\\[[^\\]]*'${id}'`))
    }
    // La spiegazione deve restare accanto alla decisione: fra sei mesi
    // nessuno ricorda perche' due pagine funzionanti sono spente.
    expect(dash).toContain('1169/2011')
  })

  it('non hanno voci nel mega-menu', () => {
    for (const id of NASCOSTE) {
      expect(dash).not.toMatch(new RegExp(`\\{id:"${id}",label:`))
    }
  })

  it('non hanno voci nella barra laterale', () => {
    for (const id of NASCOSTE) {
      expect(dash).not.toMatch(new RegExp(`navItem\\("${id}"`))
    }
  })

  it('il render e\' protetto, non solo il menu', () => {
    // Un indirizzo vecchio, un link condiviso o una sessione salvata non
    // devono poter aprire comunque la pagina.
    for (const id of NASCOSTE) {
      expect(dash).toMatch(new RegExp(`view==="${id}"&&!PAGINE_NASCOSTE\\.has\\("${id}"\\)`))
    }
  })

  it('una pagina nascosta salvata in sessione non riapre uno schermo bianco', () => {
    expect(dash).toContain("if (stored && !PAGINE_NASCOSTE.has(stored)) return stored")
  })

  it('il codice delle pagine NON e\' stato cancellato', () => {
    // Sono spente, non buttate: il lavoro sul riconoscimento a tre stati resta,
    // e riaccenderle deve costare una riga.
    expect(() => readFileSync(join(RADICE, 'src', 'views', 'SchedaAllergeniView.jsx'), 'utf8')).not.toThrow()
    expect(dash).toContain('SchedaAllergeniView')
    expect(dash).toContain('HaccpView')
  })
})
