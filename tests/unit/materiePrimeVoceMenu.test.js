// «Materie prime» deve stare dov'è stata chiesta, e non deve vederla un dipendente.
//
// Richiesta del titolare, 18/09/2026, testuale: «voglio creare una pagina solo
// per le materie prime per rendere il tutto più chiaro e semplice, mettila
// nella sezione ricette sotto tra listino e ricettario gusti e chiamala
// "Materie prime". trasferisci tutto lì».
//
// Perché serve un test e non basta guardarla: il posto di una voce nel menu è
// un dato scritto in un file (`menuFoodos.js`) e letto da tre barre diverse.
// Basta che qualcuno riordini l'array — capita riordinando per «importanza» —
// e la voce scivola, senza che nessun errore lo dica. È già successo: l'audit
// del 15/09/2026 ha trovato la stessa etichetta che apriva due pagine diverse
// nelle due barre.
//
// E la seconda metà conta quanto la prima: **i prezzi d'acquisto non si
// mostrano ai dipendenti**. Era la regola della vecchia scheda del Magazzino
// (`!isDipendente`), e trasferendo la pagina si poteva perdere per strada.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  costruisciMenu, vociMenu, cercaVoci, risolviVista,
  VISTE_DISEGNATE, VISTE_DIPENDENTE, descriviVista,
} from '../../src/lib/menuFoodos'
import { ICONS } from '../../src/lib/icons.jsx'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DASH = readFileSync(join(RADICE, 'src', 'Dashboard.jsx'), 'utf8')
const MAGAZZINO = readFileSync(join(RADICE, 'src', 'views', 'MagazzinoView.jsx'), 'utf8')

const menuTitolare = () => costruisciMenu({ metodoInventario: false, sedeDiProduzione: false, piuSedi: true })

describe('«Materie prime» sta dove è stata chiesta', () => {
  it('è nella sezione Ricette', () => {
    const ricette = menuTitolare().find(s => s.id === 'ricette')
    expect(ricette, 'la sezione Ricette').toBeTruthy()
    expect(ricette.voci.map(v => v.id)).toContain('materie-prime')
  })

  it('sta fra il Ricettario e il Listino, in quest\'ordine', () => {
    const voci = menuTitolare().find(s => s.id === 'ricette').voci.map(v => v.id)
    const iRicettario = voci.indexOf('ricettario')
    const iMaterie = voci.indexOf('materie-prime')
    const iListino = voci.indexOf('formati-vendita')
    expect(iRicettario).toBeGreaterThanOrEqual(0)
    expect(iMaterie).toBe(iRicettario + 1)
    expect(iListino).toBe(iMaterie + 1)
  })

  it('si chiama «Materie prime», non «Prezzi ingredienti»', () => {
    const voce = vociMenu(menuTitolare()).find(v => v.id === 'materie-prime')
    expect(voce.label).toBe('Materie prime')
    expect(descriviVista('materie-prime', menuTitolare())).toEqual({ label: 'Materie prime', gruppo: 'Ricette' })
  })

  it('l\'icona esiste davvero, non è un pallino di ripiego', () => {
    // Icon, quando non trova il nome, disegna un pallino grigio senza dire
    // niente: un nome inventato resta lì per mesi (è successo con chevUp).
    const voce = vociMenu(menuTitolare()).find(v => v.id === 'materie-prime')
    expect(ICONS[voce.icona], `icona "${voce.icona}"`).toBeTruthy()
  })
})

describe('«Materie prime» si trova cercandola come la chiama un pasticcere', () => {
  const parole = ['materie prime', 'ingredienti', 'prezzi ingredienti', 'listino ingredienti', 'costo ingredienti']
  for (const parola of parole) {
    it(`cercando «${parola}»`, () => {
      const esiti = cercaVoci(parola, menuTitolare()).map(v => v.id)
      expect(esiti).toContain('materie-prime')
    })
  }

  it('e i nomi vecchi portano alla pagina, non allo schermo bianco', () => {
    expect(risolviVista('materie-prime')).toBe('materie-prime')
    expect(risolviVista('ingredienti')).toBe('materie-prime')
    expect(risolviVista('prezzi-ingredienti')).toBe('materie-prime')
  })
})

describe('un dipendente non vede i prezzi d\'acquisto', () => {
  it('la voce non compare nel suo menu', () => {
    const suo = costruisciMenu({ isDipendente: true, piuSedi: true })
    expect(vociMenu(suo).map(v => v.id)).not.toContain('materie-prime')
  })

  it('e non è fra le pagine che gli sono permesse', () => {
    // Questo è il gancio vero: `Dashboard.jsx` dirotta su «home-dipendente»
    // tutto quello che non sta in questo elenco, comunque ci si provi ad
    // arrivare (vecchio link, ricerca, assistente).
    expect(VISTE_DIPENDENTE.has('materie-prime')).toBe(false)
  })

  it('e il ramo che la disegna lo ridice per conto suo', () => {
    // Tre reti invece di una: il menu, il dirottamento, e questa condizione.
    // Costa una riga e toglie una categoria intera di incidenti.
    expect(DASH).toMatch(/vista==="materie-prime"&&!isDip/)
  })
})

describe('la pagina è dichiarata, quindi non lascia lo schermo bianco', () => {
  it('sta nell\'elenco delle pagine che il programma sa disegnare', () => {
    expect(VISTE_DISEGNATE.has('materie-prime')).toBe(true)
  })
})

describe('il Magazzino non tiene il doppione', () => {
  it('la scheda «Prezzi ingredienti» non c\'è più', () => {
    expect(MAGAZZINO).not.toContain("'Prezzi ingredienti'")
    expect(MAGAZZINO).not.toContain('<PrezziIngredientiTab')
  })

  it('ma la pagina dice dove sono finiti i prezzi', () => {
    // Chi apre il Magazzino cercando il prezzo del burro non deve trovare il
    // vuoto. Non è l'avviso di spostamento in cima alla pagina: quello il
    // titolare l'ha fatto togliere il 17/09/2026 da tutte le sezioni.
    expect(MAGAZZINO).toMatch(/Quanto costa al chilo si decide in Ricette/)
    expect(MAGAZZINO).toContain("onNavigate('materie-prime')")
  })

  it('e chi aveva quella scheda aperta non trova il vuoto al ritorno', () => {
    // La scheda aperta si ricorda in sessionStorage: «prezzi» era un valore
    // legittimo fino a ieri, e oggi non disegna niente.
    expect(MAGAZZINO).toMatch(/SCHEDE\.includes\(ricordata\)/)
  })
})
