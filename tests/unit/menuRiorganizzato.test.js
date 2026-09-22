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
                      'menu-engineering', 'quadratura-inventario', 'azioni']) {
      expect(p.has(id), `"${id}" non si raggiunge più`).toBe(true)
    }
  })

  it('«Riordino» non è più una scheda, ma la sua pagina esiste ancora', () => {
    // 22/09/2026: la scheda «Riordino» (`ordini-ai`) è stata assorbita dalla
    // pagina «Ordini». Il titolare: «pagina nuova» — perché ordinare è un
    // gesto quotidiano, non una scheda dentro un'anagrafica, e perché due
    // posti che rispondono «cosa manca» sono due posti dove i numeri
    // litigano (ne dicevano 18 kg e 28 kg per la stessa farina).
    //
    // Quindi qui NON deve più essere una scheda — se ci tornasse, tornerebbe
    // anche il doppione — ma deve restare **raggiungibile**: chi ha un
    // segnalibro sulla vecchia pagina non deve trovare uno schermo bianco.
    const p = tuttePagine()
    expect(p.has('ordini'), 'la pagina «Ordini» non si raggiunge').toBe(true)
    expect(VISTE_FUORI_MENU['ordini-ai'], '«Riordino» non è più raggiungibile da nessuna parte').toBeTruthy()
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
    ['scadenzario',        'Fornitori'],
    ['fatture',            'Fornitori'],
    ['p&l',                'P&L'],
    ['profitti',           'P&L'],
    ['conto del mese',     'P&L'],
    ['costi aziendali',    'P&L'],
    ['affitto',            'P&L'],
    ['food cost',          'Food cost'],
    ['menu engineering',   'Food cost'],
    ['formati di vendita', 'Listino'],
    ['pezzature',          'Listino'],
    ['cessioni',           'Sprechi'],
    ['perdite',            'Sprechi'],
    ['vendite b2b',        'Vendite B2B'],
    ['ingrosso',           'Vendite B2B'],
    ['previsione domanda', 'Previsioni'],
    ['registro attività',  'Registro attività'],
    ['trasferimenti',      'Trasferimenti'],
    ['confronto sedi',     'Confronto sedi'],
    ['semilavorati',       'Ricettario'],
    ['nuovo gusto',        'Ricettario'],
    ['eventi',             'Calendario'],
    ['ordinazioni',        'Calendario'],
    ['foodos brain',       'Assistente AI'],
    ['azioni consigliate', 'Assistente AI'],
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
    const r = cercaVoci('costi fissi', menu())
    expect(r[0].id).toBe('costi-aziendali')
    expect(r[0].dentro).toBe('P&L')
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
        // La misura era «più di tre lettere», che è un modo storto di dire
        // «non è l'identificativo». Da quando le sigle del mestiere sono
        // ammesse quella misura boccia «P&L», che di lettere ne ha tre ed è
        // il nome che il titolare usa. Quello che conta è che l'etichetta
        // non sia l'identificativo scritto tale e quale.
        expect(t.label.length, `${v.id}.${t.id}`).toBeGreaterThan(1)
        expect(t.label, `${v.id}.${t.id}`).not.toBe(t.id)
        expect(t.label, `${v.id}.${t.id}`).not.toMatch(/^[a-z][a-z-]*$/)
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

  // Regola cambiata dal titolare il 16/09/2026, testuale: «non mi piacciono
  // i nuovi nomi delle sezioni, troppo informali. voglio siano una massimo
  // due parole ma esplicative. es. non vendite all'ingrosso ma vendite b2b,
  // non conto del mese ma P&L».
  //
  // Il 15/09 la regola era l'opposta — niente sigle, italiano parlato — e
  // questo test la teneva ferma. Chi decide come si chiamano le pagine è chi
  // le usa tutti i giorni: le sigle del mestiere (P&L, B2B, HACCP) gli dicono
  // subito cosa c'è dentro, «Conto del mese» lo costringe ad aprirlo per
  // ricordarselo. Restano fuori le sigle NOSTRE, quelle del software: un
  // cliente non sa cosa sia OCR o KPI.
  it('i nomi sono corti: al massimo due parole', () => {
    for (const v of vociMenu(menu(), true)) {
      const parole = v.label.split(/\s+/).filter(Boolean)
      expect(parole.length, `${v.id} → "${v.label}"`).toBeLessThanOrEqual(2)
    }
  })

  it('le sigle ammesse sono quelle del mestiere, non quelle del software', () => {
    const delMestiere = /^(P&L|B2B|HACCP|AI)$/
    for (const v of vociMenu(menu(), true)) {
      for (const parola of v.label.split(/\s+/)) {
        if (!/^[A-Z&]{2,}$/.test(parola)) continue   // non è una sigla
        expect(parola, v.id).toMatch(delMestiere)
      }
      expect(v.label, v.id).not.toMatch(/\b(KPI|OCR|FC|CRUD|API)\b/)
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
    // «Fornitori» e «Vendite B2B» sono usciti dall'elenco il 16/09/2026: non
    // si sono spostati, sono TORNATI al nome di prima (il titolare ha chiesto
    // i termini del mestiere). Una riga che dice «Fornitori adesso si chiama
    // Fornitori» non aiuta nessuno.
    for (const nome of ['Costi aziendali', 'Semilavorati', 'Eventi',
                        'Formati di vendita', 'Importa dati']) {
      expect(c, `il racconto non dice dov'è finito "${nome}"`).toContain(nome)
    }
  })
})
