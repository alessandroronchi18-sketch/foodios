// La riorganizzazione del menu, decisa dal titolare il 15/09/2026.
//
// Sette sezioni diventano cinque, undici pagine diventano schede di altre, e
// dodici cambiano nome. La cosa che poteva andare peggio non è il codice: è
// che Mara dei Boschi, che ci lavora tutti i giorni, la mattina dopo non
// trovi più quello che cerca. Questi test difendono le tre promesse fatte:
//
//   1. nella sezione «Oggi» non cambia niente;
//   2. nessuna pagina diventa irraggiungibile;
//   3. i nomi vecchi restano cercabili, e chi apre una pagina spostata legge
//      dov'è finita.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  costruisciMenu, vociMenu, vociInFondo, schedeDiVista, cercaVoci,
  avvisoSpostamento, SPOSTAMENTI, VISTE_FUORI_MENU,
  GIORNI_AVVISO_SPOSTAMENTO, DATA_RIORGANIZZAZIONE,
} from '../../src/lib/menuFoodos'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
const menu = () => costruisciMenu({ metodoInventario: true, sedeDiProduzione: true, piuSedi: true })

const tuttePagine = (m = menu()) => new Set(
  vociMenu(m, true).flatMap(v => [v.id, ...(v.schede || []).map(t => t.id)])
)

describe('promessa 1 — in «Oggi» non cambia niente', () => {
  it('le quattro voci sono quelle di prima, con gli stessi nomi', () => {
    const oggi = menu().find(s => s.id === 'oggi')
    expect(oggi.label).toBe('Oggi')
    expect(oggi.voci.map(v => v.labelBreve || v.label))
      .toEqual(['Produzione', 'Cassa', 'Magazzino', 'Calendario'])
  })

  it('e aprono le stesse pagine', () => {
    const oggi = costruisciMenu({ metodoInventario: false }).find(s => s.id === 'oggi')
    expect(oggi.voci.map(v => v.id)).toEqual(['giornaliero', 'chiusura', 'magazzino', 'calendario'])
  })

  it('«Oggi» è la prima sezione, come prima', () => {
    expect(menu()[0].id).toBe('oggi')
  })

  it('la barra del telefono non cambia', () => {
    const oggi = menu().find(s => s.id === 'oggi')
    expect(oggi.voci.slice(0, 4).map(v => v.labelBreve || v.label))
      .toEqual(['Produzione', 'Cassa', 'Magazzino', 'Calendario'])
  })
})

describe('promessa 2 — nessuna pagina diventa irraggiungibile', () => {
  // L'elenco di tutte le pagine che il Dashboard sa disegnare.
  const vistePresenti = () => {
    const d = leggi('src/Dashboard.jsx')
    return new Set([...d.matchAll(/vista===["']([a-z0-9-]+)["']/g)].map(m => m[1]))
  }

  it('ogni pagina del menu esiste nel Dashboard', () => {
    const presenti = vistePresenti()
    for (const id of tuttePagine()) {
      // `home-dipendente` e le pagine speciali si montano in altro modo.
      if (['impostazioni', 'changelog'].includes(id)) continue
      expect(presenti.has(id), `il menu apre "${id}", che il Dashboard non disegna`).toBe(true)
    }
  })

  it('le pagine accorpate sono tutte raggiungibili come schede', () => {
    const p = tuttePagine()
    for (const id of ['semilavorati', 'eventi', 'costi-aziendali', 'fornitori',
                      'ordini-ai', 'menu-engineering', 'quadratura-inventario', 'azioni']) {
      expect(p.has(id), `"${id}" non si raggiunge più`).toBe(true)
    }
  })

  it('«Nuova ricetta» esce dal menu ma resta a un clic, dal Ricettario', () => {
    // Era l'ottava pagina più aperta (63 volte in tre mesi): se sparisse dal
    // menu senza un bottone al suo posto, diventerebbe irraggiungibile.
    expect(tuttePagine().has('nuova-ricetta')).toBe(false)
    expect(VISTE_FUORI_MENU['nuova-ricetta']).toBeTruthy()
    const ricettario = leggi('src/views/RicettarioView.jsx')
    expect(ricettario, 'manca il bottone nel Ricettario').toMatch(/onNuovaRicetta/)
    expect(ricettario).toMatch(/const nuovaBtn = onNuovaRicetta &&/)
    const dash = leggi('src/Dashboard.jsx')
    expect(dash, 'il Dashboard non passa il bottone').toMatch(/onNuovaRicetta=\{\(\)=>\{setEditingRicetta\(null\);setView\("nuova-ricetta"\);\}\}/)
  })

  it('le pagine ritirate restano nel codice, solo non si offrono più', () => {
    const presenti = vistePresenti()
    for (const id of ['forecast', 'whatsapp', 'documentary', 'ai-hub']) {
      expect(tuttePagine().has(id), `"${id}" è tornata nel menu`).toBe(false)
      expect(presenti.has(id), `"${id}" non si può più aprire in nessun modo`).toBe(true)
      expect(VISTE_FUORI_MENU[id]?.ritirata, `"${id}" non è dichiarata ritirata`).toBe(true)
    }
  })

  it('ogni pagina ritirata dice come si chiama, per la riga sopra il titolo', () => {
    for (const [id, d] of Object.entries(VISTE_FUORI_MENU)) {
      if (!d.ritirata) continue
      expect(typeof d.label, id).toBe('string')
      expect(d.label.length, id).toBeGreaterThan(3)
    }
  })
})

describe('promessa 3 — i nomi vecchi restano cercabili', () => {
  const casi = [
    ['scadenzario',        'Fatture e fornitori'],
    ['fornitori',          'Fatture e fornitori'],
    ['p&l',                'Conto del mese'],
    ['profitti',           'Conto del mese'],
    ['costi aziendali',    'Conto del mese'],
    ['affitto',            'Conto del mese'],
    ['food cost',          'Costo dei prodotti'],
    ['menu engineering',   'Costo dei prodotti'],
    ['formati di vendita', 'Pezzature e prezzi'],
    ['cessioni',           'Sprechi e regali'],
    ['perdite',            'Sprechi e regali'],
    ['vendite b2b',        'Vendite all\'ingrosso'],
    ['previsione domanda', 'Quanto venderò'],
    ['registro attività',  'Chi ha fatto cosa'],
    ['trasferimenti',      'Merce spostata tra negozi'],
    ['confronto sedi',     'Confronto tra negozi'],
    ['semilavorati',       'Ricettario'],
    ['nuovo gusto',        'Ricettario'],
    ['eventi',             'Calendario e ordinazioni'],
    ['foodos brain',       'Chiedi a Foodos'],
    ['azioni consigliate', 'Chiedi a Foodos'],
    ['importa dati',       'Impostazioni'],
  ]

  it.each(casi)('cercando «%s» si trova «%s»', (vecchio, atteso) => {
    const trovati = cercaVoci(vecchio, menu()).map(v => v.dentro || v.label)
    expect(trovati, `"${vecchio}" non porta da nessuna parte`).toContain(atteso)
  })

  it('una parola che non c\'entra non trova niente', () => {
    expect(cercaVoci('bicicletta', menu())).toEqual([])
    expect(cercaVoci('', menu())).toEqual([])
    expect(cercaVoci(null, menu())).toEqual([])
  })

  it('cercando il nome di una scheda si arriva alla scheda, non alla pagina', () => {
    const r = cercaVoci('spese fisse', menu())
    expect(r[0].id).toBe('costi-aziendali')
    expect(r[0].dentro).toBe('Conto del mese')
  })
})

describe('l\'avviso «questa pagina si è spostata»', () => {
  it('c\'è per tutte le pagine che si sono mosse', () => {
    for (const id of ['costi-aziendali', 'fornitori', 'semilavorati', 'eventi',
                      'menu-engineering', 'quadratura-inventario', 'azioni',
                      'nuova-ricetta', 'importa-dati']) {
      expect(avvisoSpostamento(id), `manca l'avviso per "${id}"`).toBeTruthy()
    }
  })

  it('e non c\'è per quelle che non si sono mosse', () => {
    for (const id of ['magazzino', 'chiusura', 'calendario', 'home', 'impostazioni']) {
      expect(avvisoSpostamento(id), `avviso di troppo su "${id}"`).toBe(null)
    }
  })

  it('«Produzione» non ha avviso: è la pagina più aperta e non è cambiata', () => {
    expect(avvisoSpostamento('giornaliero')).toBe(null)
    expect(avvisoSpostamento('inventario-gusti')).toBe(null)
  })

  it('scade dopo sessanta giorni, e poi non compare più per nessuno', () => {
    const dopo = new Date(DATA_RIORGANIZZAZIONE)
    dopo.setDate(dopo.getDate() + GIORNI_AVVISO_SPOSTAMENTO + 1)
    for (const id of Object.keys(SPOSTAMENTI)) {
      expect(avvisoSpostamento(id, dopo), id).toBe(null)
    }
  })

  it('il giorno prima della scadenza c\'è ancora', () => {
    const quasi = new Date(DATA_RIORGANIZZAZIONE)
    quasi.setDate(quasi.getDate() + GIORNI_AVVISO_SPOSTAMENTO - 1)
    expect(avvisoSpostamento('costi-aziendali', quasi)).toBeTruthy()
  })

  it('ogni avviso dice dove si trova adesso, in italiano, senza gergo', () => {
    for (const [id, testo] of Object.entries(SPOSTAMENTI)) {
      expect(testo, id).toMatch(/^Adesso /)
      expect(testo.length, id).toBeGreaterThan(20)
      expect(testo, id).not.toMatch(/view|id|tab|route/i)
    }
  })

  it('si mostra una volta sola: chi l\'ha letto non lo rivede', () => {
    const d = leggi('src/Dashboard.jsx')
    expect(d).toMatch(/foodos-spostamento-/)
    expect(d).toMatch(/function AvvisoSpostamento/)
  })
})

describe('le schede sopra le pagine accorpate', () => {
  it('ogni gruppo ha almeno due schede (una sola non è un gruppo)', () => {
    for (const v of vociMenu(menu(), true)) {
      if (!v.schede) continue
      expect(v.schede.length, v.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('stando su una scheda si vedono tutte le sorelle', () => {
    const g = schedeDiVista('costi-aziendali', menu())
    expect(g.schede.map(t => t.id)).toEqual(['pl', 'costi-aziendali'])
    expect(g.attiva).toBe('costi-aziendali')
  })

  it('una pagina senza schede non ne mostra', () => {
    expect(schedeDiVista('magazzino', menu())).toBe(null)
    expect(schedeDiVista('pagina-inventata', menu())).toBe(null)
  })

  it('le schede hanno nomi che dicono cosa ci trovi', () => {
    for (const v of vociMenu(menu(), true)) {
      for (const t of v.schede || []) {
        expect(t.label.length, `${v.id}.${t.id}`).toBeGreaterThan(3)
        expect(t.label, `${v.id}.${t.id}`).not.toMatch(/^[a-z-]+$/)  // non l'identificativo
      }
    }
  })

  it('la striscia delle schede è disegnata dal Dashboard', () => {
    const d = leggi('src/Dashboard.jsx')
    expect(d).toMatch(/const g = schedeDiVista\(vista, SEZIONI\)/)
    expect(d).toMatch(/aria-current=\{att \? "page" : undefined\}/)
  })

  it('con una sede sola la Quadratura non compare fra le schede', () => {
    const senza = costruisciMenu({ metodoInventario: false })
    expect(schedeDiVista('quadratura-inventario', senza)).toBe(null)
  })
})

describe('le cinque sezioni nuove', () => {
  it('hanno nomi in italiano di tutti i giorni, senza & e senza sigle', () => {
    for (const s of menu()) {
      expect(s.label, s.id).not.toMatch(/&/)
      expect(s.label, s.id).not.toMatch(/\b(AI|B2B|P&L|KPI)\b/)
    }
  })

  it('nessuna voce di menu ha una sigla nel nome', () => {
    const consentite = [/\(P&L\)/]  // nessuna, per ora
    for (const v of vociMenu(menu(), true)) {
      if (consentite.some(r => r.test(v.label))) continue
      expect(v.label, v.id).not.toMatch(/\b(AI|B2B|KPI|OCR|FC)\b/)
    }
  })

  it('la sezione «AI» non esiste più: era organizzata per tecnologia', () => {
    // Tredici voci, trentacinque aperture in tre mesi su tutti i clienti.
    expect(menu().some(s => s.id === 'ai' || s.label === 'AI')).toBe(false)
  })

  it('l\'assistente è in fondo, come le impostazioni', () => {
    const fondo = vociInFondo().map(v => v.id)
    expect(fondo).toEqual(['ai-brain', 'impostazioni', 'changelog'])
  })
})

describe('il racconto di cosa è cambiato', () => {
  it('sta in cima alle Novità, con l\'elenco prima → adesso', () => {
    const c = leggi('src/lib/changelog.js')
    expect(c).toMatch(/spostamenti: \[/)
    expect(c).toMatch(/Il menu è stato riordinato/)
  })

  it('e la pagina Novità lo sa disegnare', () => {
    expect(leggi('src/components/Changelog.jsx')).toMatch(/entry\.spostamenti/)
  })

  it('nomina tutte le pagine che si sono spostate', () => {
    const c = leggi('src/lib/changelog.js')
    for (const nome of ['Costi aziendali', 'Fornitori', 'Semilavorati', 'Eventi',
                        'Formati di vendita', 'Vendite B2B', 'Importa dati']) {
      expect(c, `il racconto non dice dov'è finito "${nome}"`).toContain(nome)
    }
  })
})
