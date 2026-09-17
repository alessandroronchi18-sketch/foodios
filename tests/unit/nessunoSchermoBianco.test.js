// Nessun comando di navigazione lascia lo schermo bianco.
//
// Trovato il 16/09/2026 durante l'audit profondo: il terzo passo della lista
// «Primi passi» — quella che accompagna un cliente nuovo nel primo giorno —
// diceva `view: 'produzione'`. Quella pagina **non esiste**: quella vera si
// chiama `giornaliero`, o `inventario-gusti` in gelateria.
//
// Il comando passava tutti i controlli (non è una pagina nascosta, non è
// vietata al dipendente), nessun ramo del disegno la riconosceva, e il cliente
// nuovo al terzo passo del primo giorno si trovava davanti il nulla. Era
// l'unico link rotto del prodotto su 54 destinazioni di navigazione — ma era
// in uno dei posti peggiori.
//
// Due correzioni: il nome giusto dove era sbagliato, e una rete sotto — un
// nome che il programma non sa disegnare riporta a casa invece di lasciare lo
// schermo bianco. Vale per tutte le strade insieme: un vecchio link, la
// ricerca rapida, l'assistente che inventa un nome di pagina.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { VISTE_DISEGNATE, risolviVista } from '../../src/lib/menuFoodos'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DASH = readFileSync(join(RADICE, 'src', 'Dashboard.jsx'), 'utf8')

describe('l\'elenco delle pagine è onesto', () => {
  it('contiene esattamente quelle che il Dashboard sa disegnare', () => {
    // Se qualcuno aggiunge una pagina e non la dichiara qui, la rete di
    // sicurezza la riporterebbe a casa: peggio che non averla. Questo test
    // impedisce che succeda.
    const disegnate = new Set([...DASH.matchAll(/vista==="([a-z0-9-]+)"/g)].map(m => m[1]))
    const mancanti = [...disegnate].filter(v => !VISTE_DISEGNATE.has(v))
    expect(mancanti, 'pagine disegnate ma non dichiarate').toEqual([])
    const inventate = [...VISTE_DISEGNATE].filter(v => !disegnate.has(v))
    expect(inventate, 'pagine dichiarate ma che nessuno disegna').toEqual([])
  })
})

describe('un nome sbagliato non lascia lo schermo bianco', () => {
  it('«produzione» arriva alla pagina di produzione giusta', () => {
    expect(risolviVista('produzione', { metodoInventario: false })).toBe('giornaliero')
    expect(risolviVista('produzione', { metodoInventario: true, sedeDiProduzione: true })).toBe('inventario-gusti')
  })

  it('e in una gelateria su una sede che NON produce resta quella a stampi', () => {
    // La sede che non produce non ha l'inventario dei gusti: mandarcela
    // sarebbe un altro schermo vuoto.
    expect(risolviVista('produzione', { metodoInventario: true, sedeDiProduzione: false })).toBe('giornaliero')
  })

  it('i nomi del menu arrivano alle pagine vere', () => {
    expect(risolviVista('cassa')).toBe('chiusura')
    expect(risolviVista('fatture')).toBe('scadenzario')
    expect(risolviVista('listino')).toBe('formati-vendita')
    expect(risolviVista('sprechi')).toBe('sprechi-omaggi')
    expect(risolviVista('previsioni')).toBe('previsione')
  })

  it('una pagina vera resta se stessa', () => {
    for (const v of ['home', 'pl', 'magazzino', 'scadenzario', 'inventario-gusti']) {
      expect(risolviVista(v)).toBe(v)
    }
  })

  it('un nome inventato torna null, e il Dashboard riporta a casa', () => {
    expect(risolviVista('pagina-che-non-esiste')).toBe(null)
    expect(risolviVista('')).toBe(null)
    expect(risolviVista(null)).toBe(null)
    expect(risolviVista(42)).toBe(null)
    expect(DASH).toMatch(/if \(!risolta\) \{/)
    expect(DASH).toMatch(/pagina sconosciuta/)
  })
})

describe('e nessun bottone del prodotto punta a una pagina che non c\'è', () => {
  function file(dir, out = []) {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { if (n !== 'node_modules') file(p, out) }
      else if (/\.jsx?$/.test(n)) out.push(p)
    }
    return out
  }

  // ── Prova di controllo sul righello (audit 16/09/2026) ────────────────
  // Se il cammino sbaglia, l'elenco di partenza è vuoto e il censimento qui
  // sotto resta verde senza aver guardato niente.
  it('il setaccio guarda davvero dentro il progetto', () => {
    expect(file(join(RADICE, 'src')).length).toBeGreaterThan(150)
  })

  it('ogni `view:` di una lista di passi porta a una pagina vera', () => {
    // È esattamente il caso di «Primi passi»: una destinazione scritta a mano
    // dentro una struttura dati, che nessun controllo guardava.
    const colpevoli = []
    for (const p of file(join(RADICE, 'src'))) {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/\bview:\s*'([a-z0-9-]+)'/g)) {
        if (risolviVista(m[1])) continue
        const riga = src.slice(0, m.index).split('\n').length
        colpevoli.push(`${relative(RADICE, p)}:${riga} → "${m[1]}"`)
      }
    }
    expect(colpevoli).toEqual([])
  })
})
