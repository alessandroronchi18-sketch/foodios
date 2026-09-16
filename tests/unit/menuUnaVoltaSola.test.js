// Il menu scritto una volta sola.
//
// Fino al 15/09/2026 le voci del menu comparivano in otto elenchi diversi,
// tutti a mano, tutti dentro Dashboard.jsx. Otto elenchi che descrivono la
// stessa cosa divergono, e infatti erano già divergenti:
//
//   • «Produzione» in alto guardava solo il metodo dell'organizzazione, di
//     lato guardava anche se la sede è di produzione: nella stessa schermata
//     lo stesso nome apriva due pagine diverse;
//   • «Trasferimenti tra sedi» compariva in alto con due sedi qualsiasi e di
//     lato solo con due sedi attive;
//   • due voci avevano icone diverse fra le due barre;
//   • le mappe delle sezioni erano ferme ai gruppi aboliti il 30/07/2026 e
//     citavano «Magazzino & Fornitori» e «Azienda & Team», che non esistono;
//   • la barra del telefono diceva «AI Assistant» dove il menu diceva
//     «Azioni consigliate».
//
// Adesso l'elenco è uno. Questi test lo tengono così.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  costruisciMenu, vociMenu, sezionePerVista, gruppoPerVista, etichettaPerVista,
  descriviVista, menuTelefono, etichettaBreve, VISTE_DIPENDENTE, VISTE_FUORI_MENU,
  vociInFondo, schedeDiVista, cercaVoci, avvisoSpostamento, SPOSTAMENTI, nomeCompletoVista,
} from '../../src/lib/menuFoodos'

const RADICE = join(import.meta.dirname, '../..')
const DASH = readFileSync(join(RADICE, 'src/Dashboard.jsx'), 'utf8')
const vive = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')
const DASH_VIVO = vive(DASH)

const pieno = () => costruisciMenu({
  metodoInventario: true, sedeDiProduzione: true, piuSedi: true,
})

describe('la forma del menu', () => {
  it('ha cinque sezioni, ognuna con un nome e almeno una voce', () => {
    // Riorganizzazione del 15/09/2026, decisa dal titolare sui dati d'uso:
    // da sette sezioni a cinque, per momento della giornata invece che per
    // come è fatto il software. La sezione "AI" da sola aveva tredici voci e
    // trentacinque aperture in tre mesi su tutti i clienti.
    const s = pieno()
    expect(s.map(x => x.id)).toEqual(['oggi', 'ricette', 'acquisti', 'numeri', 'team'])
    for (const sec of s) {
      expect(typeof sec.label, sec.id).toBe('string')
      expect(sec.label.length, sec.id).toBeGreaterThanOrEqual(2)
      expect(typeof sec.icona, sec.id).toBe('string')
      expect(sec.voci.length, sec.id).toBeGreaterThan(0)
    }
  })

  it('ogni voce ha un id, un nome e un\'icona', () => {
    for (const v of vociMenu(pieno())) {
      expect(v.id).toMatch(/^[a-z0-9-]+$/)
      expect(typeof v.label, v.id).toBe('string')
      expect(v.label.length, v.id).toBeGreaterThan(1)
      expect(typeof v.icona, v.id).toBe('string')
    }
  })

  it('nessuna pagina compare due volte nel menu', () => {
    // Una pagina in due sezioni vuol dire che la mappa «in che sezione sta»
    // ne perde una: la seconda chiave sovrascrive la prima, ed era già
    // successo con «Recensioni», che finiva in due gruppi.
    const ids = vociMenu(pieno()).map(v => v.id)
    const doppi = ids.filter((x, i) => ids.indexOf(x) !== i)
    expect(doppi, `pagine in più sezioni: ${doppi.join(', ')}`).toEqual([])
  })

  it('nessun nome di voce è ripetuto (due voci uguali non si distinguono)', () => {
    const nomi = vociMenu(pieno()).map(v => v.label)
    const doppi = nomi.filter((x, i) => nomi.indexOf(x) !== i)
    expect(doppi, `nomi ripetuti: ${doppi.join(', ')}`).toEqual([])
  })

  it('niente emoji: le icone sono nomi del componente Icon', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    for (const sec of pieno()) {
      expect(sec.label, sec.id).not.toMatch(emoji)
      expect(sec.icona, sec.id).toMatch(/^[a-zA-Z]+$/)
      for (const v of sec.voci) {
        expect(v.label, v.id).not.toMatch(emoji)
        expect(v.icona, v.id).toMatch(/^[a-zA-Z]+$/)
      }
    }
  })
})

describe('«Produzione» apre una pagina sola', () => {
  // Il difetto che ha fatto nascere questo file.
  const produzione = (ctx) => vociMenu(costruisciMenu(ctx)).find(v => v.label === 'Produzione')?.id

  it('a inventario, in laboratorio, è la registrazione per gusto', () => {
    expect(produzione({ metodoInventario: true, sedeDiProduzione: true })).toBe('inventario-gusti')
  })

  it('a stampi è quella a stampi', () => {
    expect(produzione({ metodoInventario: false, sedeDiProduzione: true })).toBe('giornaliero')
  })

  it('in un punto vendita che non produce è quella a stampi, anche a inventario', () => {
    expect(produzione({ metodoInventario: true, sedeDiProduzione: false })).toBe('giornaliero')
  })

  it('ma se ci sei già dentro non ti sparisce da sotto i piedi', () => {
    expect(produzione({ metodoInventario: false, sedeDiProduzione: false, vistaCorrente: 'inventario-gusti' }))
      .toBe('inventario-gusti')
  })

  it('e c\'è sempre esattamente una voce che si chiama Produzione', () => {
    for (const inv of [true, false]) for (const lab of [true, false]) {
      const n = vociMenu(costruisciMenu({ metodoInventario: inv, sedeDiProduzione: lab }))
        .filter(v => v.label === 'Produzione').length
      expect(n, `inventario=${inv} laboratorio=${lab}`).toBe(1)
    }
  })
})

describe('le voci che compaiono solo a certe condizioni', () => {
  it('Quadratura inventario c\'è solo nel mondo a inventario', () => {
    // Ora è una scheda dello Storico, non una voce a sé.
    const ha = (ctx) => vociMenu(costruisciMenu(ctx))
      .some(v => (v.schede || []).some(t => t.id === 'quadratura-inventario'))
    expect(ha({ metodoInventario: true, sedeDiProduzione: true })).toBe(true)
    expect(ha({ metodoInventario: false, sedeDiProduzione: true })).toBe(false)
    expect(ha({ metodoInventario: true, sedeDiProduzione: false })).toBe(false)
    // Ma se ci sei dentro resta.
    expect(ha({ metodoInventario: false, vistaCorrente: 'quadratura-inventario' })).toBe(true)
  })

  it('Confronto sedi e Trasferimenti compaiono solo con più sedi', () => {
    const conDue = vociMenu(costruisciMenu({ piuSedi: true })).map(v => v.id)
    const conUna = vociMenu(costruisciMenu({ piuSedi: false })).map(v => v.id)
    expect(conDue).toEqual(expect.arrayContaining(['confronto-sedi', 'trasferimenti']))
    expect(conUna).not.toContain('confronto-sedi')
    expect(conUna).not.toContain('trasferimenti')
  })
})

describe('il dipendente vede solo le sue pagine', () => {
  it('nessuna voce fuori dal suo elenco', () => {
    for (const v of vociMenu(costruisciMenu({ isDipendente: true, piuSedi: true, metodoInventario: true, sedeDiProduzione: true }))) {
      expect(VISTE_DIPENDENTE.has(v.id), `"${v.id}" non è una sua pagina`).toBe(true)
    }
  })

  it('le sezioni che gli restano vuote spariscono del tutto', () => {
    for (const sec of costruisciMenu({ isDipendente: true })) {
      expect(sec.voci.length, sec.id).toBeGreaterThan(0)
    }
  })

  it('nessuna pagina di soldi o di persone gli arriva nel menu', () => {
    const suoi = new Set(vociMenu(costruisciMenu({ isDipendente: true, piuSedi: true })).map(v => v.id))
    for (const vietata of ['pl', 'costi-aziendali', 'personale', 'fornitori', 'scadenzario',
                           'vendite-b2b', 'simulatore', 'confronto-sedi', 'registro-attivita',
                           'ai-brain', 'cashflow', 'importa-dati']) {
      expect(suoi.has(vietata), `il dipendente vede "${vietata}"`).toBe(false)
    }
  })

  it('il titolare invece le vede tutte', () => {
    const s = pieno()
    const tutte = new Set(vociMenu(s, true).flatMap(v => [v.id, ...(v.schede || []).map(t => t.id)]))
    for (const v of ['pl', 'costi-aziendali', 'personale', 'fornitori', 'scadenzario', 'ai-brain', 'azioni'])
      expect(tutte.has(v), v).toBe(true)
  })
})

describe('le mappe si ricavano dal menu, non si riscrivono', () => {
  it('ogni voce sa in che sezione sta e come si chiama', () => {
    const s = pieno()
    const perSez = sezionePerVista(s), perGruppo = gruppoPerVista(s), perEtichetta = etichettaPerVista(s)
    for (const v of vociMenu(s)) {
      expect(perSez[v.id], v.id).toBeTruthy()
      expect(perGruppo[v.id], v.id).toBeTruthy()
      // Quando la voce e la sua prima scheda hanno lo stesso identificativo,
      // il nome è quello della scheda: stando su «Calendario» il titolo dice
      // «Calendario», non «Calendario e ordinazioni».
      const schedaOmonima = (v.schede || []).find(t => t.id === v.id)
      expect(perEtichetta[v.id], v.id).toBe(schedaOmonima ? schedaOmonima.label : v.label)
      // Anche le schede: stando su «Spese fisse», la sezione aperta dev'essere
      // quella di «P&L».
      for (const t of v.schede || []) {
        expect(perSez[t.id], t.id).toBe(perSez[v.id])
        expect(perGruppo[t.id], t.id).toBe(perGruppo[v.id])
        expect(perEtichetta[t.id], t.id).toBe(t.label)
      }
    }
  })

  it('le sezioni nominate esistono davvero', () => {
    // Le mappe vecchie citavano «Magazzino & Fornitori», «Azienda & Team» e
    // «strumenti», aboliti il 30/07/2026: la riga sopra il titolo diceva il
    // nome di una sezione che non c'era più.
    const s = pieno()
    const nomiVeri = new Set(s.map(x => x.label))
    for (const g of Object.values(gruppoPerVista(s))) expect(nomiVeri.has(g), g).toBe(true)
    const idVeri = new Set(s.map(x => x.id))
    for (const id of Object.values(sezionePerVista(s))) expect(idVeri.has(id), id).toBe(true)
  })

  it('anche le pagine fuori dal menu hanno un nome e una sezione vera', () => {
    const s = pieno()
    // Una pagina fuori dal menu può stare "dentro" un'altra pagina fuori dal
    // menu: Integrazioni si apre da Impostazioni, e la riga sopra il titolo
    // deve poterlo dire.
    const nomiVeri = new Set([
      ...s.map(x => x.label),
      ...Object.values(VISTE_FUORI_MENU).map(d => d.label),
      ...vociInFondo().map(v => v.label),
      '',
    ])
    for (const [vista, d] of Object.entries(VISTE_FUORI_MENU)) {
      expect(typeof d.label, vista).toBe('string')
      expect(nomiVeri.has(d.gruppo), `${vista}: sezione "${d.gruppo}" inesistente`).toBe(true)
    }
  })

  it('una pagina sconosciuta non fa esplodere niente', () => {
    expect(descriviVista('pagina-che-non-esiste', pieno())).toEqual({ label: 'pagina-che-non-esiste', gruppo: '' })
    expect(descriviVista(null, pieno())).toEqual({ label: '', gruppo: '' })
  })
})

describe('la barra in basso del telefono', () => {
  it('ha cinque voci: quattro cose da fare più «Altro»', () => {
    const b = menuTelefono(pieno())
    expect(b).toHaveLength(5)
    expect(b[4].id).toBe('__altro')
    expect(b.map(v => v.label)).toEqual(['Produzione', 'Cassa', 'Magazzino', 'Calendario', 'Altro'])
  })

  it('le sue voci sono le stesse della sezione «Oggi», non una copia', () => {
    const s = pieno()
    const oggi = s.find(x => x.id === 'oggi').voci.map(v => v.id)
    expect(menuTelefono(s).slice(0, 4).map(v => v.id)).toEqual(oggi.slice(0, 4))
  })

  it('segue «Produzione» quando cambia pagina', () => {
    expect(menuTelefono(costruisciMenu({ metodoInventario: true, sedeDiProduzione: true }))[0].id).toBe('inventario-gusti')
    expect(menuTelefono(costruisciMenu({ metodoInventario: false }))[0].id).toBe('giornaliero')
  })
})

describe('i nomi corti del telefono', () => {
  it('ogni nome corto è più corto o uguale a quello lungo', () => {
    const s = pieno()
    for (const v of vociMenu(s)) {
      const breve = etichettaBreve(v.id, s)
      expect(breve.length, `${v.id}: "${breve}" non è più corto di "${v.label}"`).toBeLessThanOrEqual(v.label.length)
    }
  })

  it('nessun nome corto supera i 18 caratteri (la barra è stretta)', () => {
    const s = pieno()
    for (const v of vociMenu(s)) {
      expect(etichettaBreve(v.id, s).length, v.id).toBeLessThanOrEqual(18)
    }
  })

  it('il nome corto è riconducibile a quello lungo', () => {
    // Prima erano due elenchi indipendenti, e i nomi si erano allontanati:
    // «AI Assistant» contro «Azioni consigliate», «Forecast AI» contro
    // «Forecast vendite 7gg». Qui basta che almeno una parola del nome corto
    // compaia in quello lungo: «Registro» per «Registro attività» va bene,
    // «Preferiti» per «Registro attività» no.
    const parole = (t) => t.toLowerCase().replace(/[^a-zàèéìòù ]/g, '').split(/\s+/).filter(x => x.length > 2)
    const s = pieno()
    for (const v of vociMenu(s, true)) {
      const breve = etichettaBreve(v.id, s)
      // Da quando i nomi sono di una o due parole, quasi tutti non hanno più
      // un nome corto diverso: se sono lo stesso nome la domanda non si pone.
      if (breve === v.label) continue
      const comuni = parole(breve).filter(p => parole(v.label).includes(p))
      expect(comuni.length, `"${breve}" non c'entra con "${v.label}"`).toBeGreaterThan(0)
    }
  })
})

describe('Dashboard.jsx non ha più le copie a mano', () => {
  it('non c\'è più un secondo elenco del menu', () => {
    expect(DASH_VIVO).not.toMatch(/const NAV = \[\s*$/m)
    expect(DASH_VIVO).not.toMatch(/const VIEW_GROUPS = \{/)
    expect(DASH_VIVO).not.toMatch(/const VIEW_LABELS = \{/)
    expect(DASH_VIVO).not.toMatch(/const MOBILE_LABELS = \{/)
  })

  it('le due barre leggono le stesse sezioni', () => {
    // Erano tre: la barra in fondo al telefono è stata tolta il 16/09/2026
    // su decisione del titolare. `menuTelefono()` resta in menuFoodos.js coi
    // suoi test — dice quali sono le quattro cose che si fanno ogni giorno,
    // ed è la fonte da cui si ricostruirebbe la barra se servisse.
    expect(DASH_VIVO).toMatch(/const SEZIONI = useMemo\(\(\) => costruisciMenu\(/)
    expect(DASH_VIVO).toMatch(/const NAV = SEZIONI\.map/)          // barra in alto
    expect(DASH_VIVO).toMatch(/\{SEZIONI\.map\(sec =>/)            // cassetto
    expect(DASH_VIVO).not.toMatch(/const BOTTOM_NAV =/)
  })

  it('le mappe si ricavano, non si riscrivono', () => {
    expect(DASH_VIVO).toMatch(/const VIEW_TO_SEC = useMemo\(\(\) => sezionePerVista\(SEZIONI\)/)
    expect(DASH_VIVO).toMatch(/descriviVista\(view, SEZIONI\)/)
    expect(DASH_VIVO).toMatch(/etichettaBreve\(view, SEZIONI\)/)
  })

  it('la condizione delle sedi attive è scritta una volta sola', () => {
    expect((DASH_VIVO.match(/attiva!==false\)\.length>1/g) || []).length).toBe(1)
  })

  it('l\'elenco delle pagine del dipendente non è duplicato qui', () => {
    expect(DASH_VIVO).toMatch(/export const DIPENDENTE_VIEWS = VISTE_DIPENDENTE/)
    expect(DASH_VIVO).not.toMatch(/DIPENDENTE_VIEWS = new Set\(\[/)
  })
})


describe('il nome intero, per quando si nomina una pagina da fuori', () => {
  // `descriviVista` dà il nome della SCHEDA quando ci sei sopra, ed è giusto
  // per il titolo in cima alla pagina. Ma in un messaggio «questa funzione è
  // nel piano superiore» serve il nome per intero: «P&L» si
  // capisce, «Il conto» no.
  const s = pieno()

  it('una scheda risponde col nome della pagina che la contiene', () => {
    expect(nomeCompletoVista('pl', s)).toBe('P&L')
    expect(nomeCompletoVista('costi-aziendali', s)).toBe('P&L')
    expect(nomeCompletoVista('simulatore', s)).toBe('Food cost')
    expect(nomeCompletoVista('menu-engineering', s)).toBe('Food cost')
    expect(nomeCompletoVista('fornitori', s)).toBe('Fornitori')
  })

  it('anche le voci in fondo', () => {
    expect(nomeCompletoVista('ai-brain', s)).toBe('Assistente AI')
    expect(nomeCompletoVista('azioni', s)).toBe('Assistente AI')
  })

  it('e le pagine fuori dal menu hanno comunque un nome', () => {
    expect(nomeCompletoVista('forecast', s)).toBe('Previsione 7 giorni')
    expect(nomeCompletoVista('nuova-ricetta', s)).toBe('Nuova ricetta')
  })

  it('una pagina sconosciuta dà null, e chi chiama ricade sull\'identificativo', () => {
    expect(nomeCompletoVista('pagina-inventata', s)).toBe(null)
  })

  it('i messaggi di sblocco chiamano le pagine come le chiama il menu', async () => {
    // Qui c'era un elenco dei nomi VECCHI da non usare più. Un elenco del
    // genere invecchia insieme ai nomi: il 16/09/2026 il titolare ha chiesto
    // di tornare ai termini del mestiere («P&L», «Confronto sedi») e il test
    // ha bocciato i nomi giusti, perché erano nella sua lista nera.
    //
    // Quello che conta davvero non è quali nomi sono vietati, è che ce ne sia
    // UNO SOLO: il messaggio di sblocco deve chiamare la pagina esattamente
    // come la chiama il menu, qualunque nome sia oggi.
    const { viewDisplayLabel } = await import('../../src/lib/planAccess')
    const s = pieno()
    for (const v of ['ai-brain', 'cashflow', 'trasferimenti', 'confronto-sedi', 'pl']) {
      const nome = viewDisplayLabel(v)
      expect(nome, v).not.toBe(v)
      const dalMenu = nomeCompletoVista(v, s)
      if (dalMenu) expect(nome, v).toBe(dalMenu)
    }
  })

  it('e nessuno dei due elenchi a mano è tornato', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const r = (f) => readFileSync(join(import.meta.dirname, '../..', f), 'utf8')
    expect(r('src/lib/planAccess.js')).not.toMatch(/const VIEW_DISPLAY_LABELS = \{/)
    expect(r('src/components/UpgradeGate.jsx')).not.toMatch(/const VIEW_LABELS = \{/)
  })
})
