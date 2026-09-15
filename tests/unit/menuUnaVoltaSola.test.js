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
  it('ha sette sezioni, ognuna con un nome e almeno una voce', () => {
    const s = pieno()
    expect(s.map(x => x.id)).toEqual(['oggi', 'ricette', 'acquisti', 'numeri', 'clienti', 'team', 'ai'])
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
    const ha = (ctx) => vociMenu(costruisciMenu(ctx)).some(v => v.id === 'quadratura-inventario')
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
    const tutte = new Set(vociMenu(pieno()).map(v => v.id))
    for (const v of ['pl', 'personale', 'fornitori', 'ai-brain']) expect(tutte.has(v), v).toBe(true)
  })
})

describe('le mappe si ricavano dal menu, non si riscrivono', () => {
  it('ogni voce sa in che sezione sta e come si chiama', () => {
    const s = pieno()
    const perSez = sezionePerVista(s), perGruppo = gruppoPerVista(s), perEtichetta = etichettaPerVista(s)
    for (const v of vociMenu(s)) {
      expect(perSez[v.id], v.id).toBeTruthy()
      expect(perGruppo[v.id], v.id).toBeTruthy()
      expect(perEtichetta[v.id], v.id).toBe(v.label)
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
    // Prima erano due elenchi indipendenti: «AI Assistant» contro «Azioni
    // consigliate», «Forecast AI» contro «Forecast vendite 7gg».
    const s = pieno()
    for (const v of vociMenu(s)) {
      const breve = etichettaBreve(v.id, s).toLowerCase().replace(/\.$/, '')
      const lungo = v.label.toLowerCase()
      expect(lungo.includes(breve.split(' ')[0]), `"${breve}" non c'entra con "${v.label}"`).toBe(true)
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

  it('le tre barre leggono le stesse sezioni', () => {
    expect(DASH_VIVO).toMatch(/const SEZIONI = useMemo\(\(\) => costruisciMenu\(/)
    expect(DASH_VIVO).toMatch(/const NAV = SEZIONI\.map/)          // barra in alto
    expect(DASH_VIVO).toMatch(/\{SEZIONI\.map\(sec =>/)            // barra laterale
    expect(DASH_VIVO).toMatch(/const BOTTOM_NAV = menuTelefono\(SEZIONI\)/)  // telefono
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
