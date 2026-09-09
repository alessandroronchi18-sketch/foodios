// Il seme demo e la pagina devono parlare la stessa lingua.
//
// Difetto trovato il 09/09/2026 sui dati veri di produzione. Il seme demo
// salvava i formati di vendita con i campi `tipo`, `prezzo` e `peso_g`, mentre
// `FormatiVendita.jsx` legge `categoria`, `prezzoDefault` e `baseQtaG`.
// Nomi diversi per le stesse cose: nella demo tutti e sei i formati mostravano
// categoria vuota, base 0 g e prezzo 0 €.
//
// Non era un difetto interno: la demo è quello che si mostra ai clienti
// potenziali (vedi NEXT_STEPS.md, "Pitch ai prospect con demo personalizzata").
// La funzione sembrava rotta proprio dove deve convincere.
//
// Questo test legge il SEME VERO dal codice, non una copia: così non possono
// divergere di nuovo senza che qualcuno se ne accorga.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Estrae e valuta buildFormati() dal sorgente, senza importare il modulo
 *  (che tira dentro supabase e le env Vite). */
function formatiDemo() {
  const src = readFileSync(join(RADICE, 'src', 'lib', 'demoSeedFull.js'), 'utf8')
  const i = src.indexOf('function buildFormati()')
  expect(i).toBeGreaterThan(-1)
  // Taglio bilanciato sulle graffe della funzione.
  let d = 0, fine = i
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') { d--; if (d === 0) { fine = j + 1; break } }
  }
  const fn = new Function(src.slice(i, fine) + '\nreturn buildFormati()')
  return fn()
}

/** Gli stessi campi che legge FormatiVendita.jsx (righe 121-126, 148-149). */
const comeLeggeLaPagina = (f) => ({
  categoria: f.categoria || '',
  baseG: Number(f.baseQtaG) || 0,
  prezzo: Number(f.prezzoDefault) || 0,
  componenti: Array.isArray(f.componenti) ? f.componenti : [],
})

describe('formati di vendita nel seme demo', () => {
  const formati = formatiDemo()

  it('ce ne sono, e hanno un id e un nome', () => {
    expect(formati.length).toBeGreaterThanOrEqual(4)
    for (const f of formati) {
      expect(f.id).toBeTruthy()
      expect(f.nome).toBeTruthy()
    }
  })

  it('ogni formato ha i campi che la pagina legge davvero', () => {
    // È il difetto: prima erano tipo/prezzo/peso_g e la pagina non li vedeva.
    for (const f of formati) {
      const v = comeLeggeLaPagina(f)
      expect(v.categoria, `${f.nome}: categoria mancante`).not.toBe('')
      expect(v.baseG, `${f.nome}: base in grammi a zero`).toBeGreaterThan(0)
      expect(v.prezzo, `${f.nome}: prezzo a zero`).toBeGreaterThan(0)
    }
  })

  it('non usa piu\' i vecchi nomi dei campi', () => {
    for (const f of formati) {
      expect(f.peso_g, `${f.nome}: ancora peso_g`).toBeUndefined()
      expect(f.prezzo, `${f.nome}: ancora prezzo`).toBeUndefined()
    }
  })

  it('le categorie esistono davvero fra le ricette demo', () => {
    // Un formato collegato a una categoria inesistente non trova nulla su cui
    // stimare il food cost, e resta a zero comunque.
    const src = readFileSync(join(RADICE, 'src', 'lib', 'demoSeedFull.js'), 'utf8')
    const categorieRicette = new Set(
      [...src.matchAll(/categoria: '([^']+)'/g)].map(m => m[1])
    )
    for (const f of formati) {
      expect(categorieRicette.has(f.categoria), `${f.nome}: categoria "${f.categoria}" non esiste fra le ricette`).toBe(true)
    }
  })

  it('ha i costi di confezionamento, altrimenti la funzione non si vede', () => {
    // Prima erano assenti su tutti: la colonna del costo confezionamento
    // mostrava zero, cioè il pezzo di valore della pagina non si vedeva
    // proprio nella demo che serve a venderlo.
    for (const f of formati) {
      const comp = comeLeggeLaPagina(f).componenti
      expect(comp.length, `${f.nome}: nessun componente`).toBeGreaterThan(0)
      for (const c of comp) {
        expect(c.nome).toBeTruthy()
        expect(Number(c.qta)).toBeGreaterThan(0)
        expect(Number(c.costo)).toBeGreaterThan(0)
      }
    }
  })

  it('i costi di confezionamento sono realistici, non simbolici', () => {
    // Un valore fuori scala in demo fa più danno di uno assente: chi guarda
    // pensa che il conto sia sbagliato.
    for (const f of formati) {
      for (const c of comeLeggeLaPagina(f).componenti) {
        expect(Number(c.costo), `${f.nome}/${c.nome}`).toBeLessThan(3)
      }
    }
  })
})
