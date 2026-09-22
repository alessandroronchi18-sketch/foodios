// Il menu e la pagina devono dire lo stesso nome.
//
// Segnalato dal titolare il 19/09/2026, aprendo la pagina vera: «nel menu la
// voce si chiama Fornitori, ma aprendola il titolo della pagina dice
// Scadenzario. Due nomi per la stessa cosa».
//
// Non era una svista di scrittura, era un meccanismo: il titolo in cima alla
// pagina lo costruisce `etichettaPerVista`, che per una pagina che è anche una
// SCHEDA usa il nome della scheda e non quello della voce. La voce si chiamava
// «Fornitori» e la sua prima scheda «Scadenzario», quindi il menu diceva una
// parola e la pagina un'altra.
//
// Qui si prova il comportamento e non il testo del sorgente: si chiede alle
// funzioni del menu come si chiama quella pagina, da tutte le strade da cui il
// nome viene fuori (titolo, striscia delle schede, barra del telefono,
// ricerca, riga «questa pagina si è spostata»).

import { describe, it, expect } from 'vitest'
import {
  costruisciMenu, descriviVista, etichettaPerVista, schedeDiVista, cercaVoci,
  nomeCompletoVista, etichettaBreve, avvisoSpostamento, SPOSTAMENTI,
  VISTE_DISEGNATE, VISTE_FUORI_MENU,
} from '../../src/lib/menuFoodos'

const SEZIONI = costruisciMenu({ piuSedi: true })
const voceFornitori = SEZIONI.flatMap(s => s.voci).find(v => v.id === 'scadenzario')

describe('la pagina delle fatture si chiama Fornitori dappertutto', () => {
  it('il titolo in cima alla pagina dice quello che dice il menu', () => {
    expect(voceFornitori, 'la voce di menu non esiste più').toBeTruthy()
    expect(voceFornitori.label).toBe('Fornitori')
    // È questa la riga che diventa rossa col codice di prima: `descriviVista`
    // tornava «Scadenzario» mentre il menu diceva «Fornitori».
    expect(descriviVista('scadenzario', SEZIONI).label).toBe(voceFornitori.label)
    expect(etichettaPerVista(SEZIONI).scadenzario).toBe('Fornitori')
  })

  it('e lo dicono anche la striscia delle schede e la barra del telefono', () => {
    const g = schedeDiVista('scadenzario', SEZIONI)
    expect(g, 'la pagina non ha più le sue schede').toBeTruthy()
    expect(g.schede[0].label).toBe('Fornitori')
    expect(etichettaBreve('scadenzario', SEZIONI)).toBe('Fornitori')
    expect(nomeCompletoVista('scadenzario', SEZIONI)).toBe('Fornitori')
  })

  it('la riga sopra il titolo resta quella della sezione Acquisti', () => {
    expect(descriviVista('scadenzario', SEZIONI).gruppo).toBe('Acquisti')
  })

  // ── Quello che c'è intorno: cambiare un nome rompe la ricerca ───────────
  it('chi cerca «scadenzario» trova ancora la pagina', () => {
    const esiti = cercaVoci('scadenzario', SEZIONI)
    expect(esiti.length, 'cercando il nome vecchio non si trova più niente').toBeGreaterThan(0)
    expect(esiti[0].id).toBe('scadenzario')
  })

  it('e chi cerca «fatture», «da pagare», «iban» o «scadenze» pure', () => {
    for (const q of ['fatture', 'da pagare', 'iban', 'scadenze']) {
      const esiti = cercaVoci(q, SEZIONI)
      expect(esiti.some(e => e.id === 'scadenzario' || e.id === 'fornitori'),
        `cercando «${q}» non si arriva alla pagina dei fornitori`).toBe(true)
    }
  })

  it('le altre due schede restano raggiungibili e con nomi diversi fra loro', () => {
    // 22/09/2026: la terza scheda era «Riordino» (`ordini-ai`) ed è diventata
    // «Ordini» (`ordini`), che ha assorbito anche il vecchio elenco degli
    // ordini. Decisione del titolare: «pagina nuova». Le altre due non si
    // toccano, e i tre nomi restano diversi fra loro — due schede che si
    // chiamano uguale non si distinguono.
    const g = schedeDiVista('scadenzario', SEZIONI)
    expect(g.schede.map(t => t.id)).toEqual(['scadenzario', 'fornitori', 'ordini'])
    expect(new Set(g.schede.map(t => t.label)).size, 'due schede con lo stesso nome').toBe(3)
    expect(etichettaPerVista(SEZIONI).fornitori).toBe('Anagrafica')
    expect(etichettaPerVista(SEZIONI).ordini).toBe('Ordini')
  })

  it('la riga «questa pagina si è spostata» non manda a cercare una scheda che non esiste', () => {
    const riga = avvisoSpostamento('scadenzario', new Date('2026-09-19'))
    expect(riga, 'la riga è sparita del tutto').toBeTruthy()
    // Diceva: «Adesso è la scheda «Scadenzario» dentro Fornitori». Una scheda
    // con quel nome non c'è più: chi la cercasse non la troverebbe.
    expect(riga).not.toMatch(/scheda «Scadenzario»/)
    expect(riga).toMatch(/Fornitori/)
    expect(SPOSTAMENTI.fornitori).toMatch(/Anagrafica/)
  })
})

describe('le cinque schermate che si aprono da Fornitori esistono davvero', () => {
  const NUOVE = [
    'fatture-da-pagare', 'fatture-scadute', 'fatture-in-scadenza',
    'fatture-senza-sede', 'fornitori-senza-iban',
  ]

  it('il programma sa disegnarle', () => {
    for (const v of NUOVE) {
      expect(VISTE_DISEGNATE.has(v), `«${v}» non è fra le pagine disegnate`).toBe(true)
    }
  })

  it('e ognuna ha un nome suo e una sezione, o la riga in cima resta vuota', () => {
    const nomi = new Set()
    for (const v of NUOVE) {
      const fuori = VISTE_FUORI_MENU[v]
      expect(fuori, `«${v}» non è dichiarata fra le pagine fuori menu`).toBeTruthy()
      expect(String(fuori.label || '').length, `«${v}» non ha un nome`).toBeGreaterThan(2)
      expect(fuori.gruppo, `«${v}» non dice in che sezione sta`).toBe('Acquisti')
      expect(fuori.ritirata, `«${v}» è dichiarata ritirata`).toBeFalsy()
      nomi.add(fuori.label)
      expect(descriviVista(v, SEZIONI).label).toBe(fuori.label)
    }
    expect(nomi.size, 'due schermate diverse con lo stesso nome').toBe(NUOVE.length)
  })

  it('e non finiscono nel menu: sono pagine di dettaglio, non voci', () => {
    const idsMenu = new Set(SEZIONI.flatMap(s => s.voci).flatMap(v => [v.id, ...(v.schede || []).map(t => t.id)]))
    for (const v of NUOVE) expect(idsMenu.has(v), `«${v}» è finita nel menu`).toBe(false)
  })
})
