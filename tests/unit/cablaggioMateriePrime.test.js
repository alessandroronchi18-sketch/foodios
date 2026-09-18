// ── I fili fra il Dashboard e la pagina Materie prime ─────────────────────
//
// Il buco, trovato il 18/09/2026 da un audit dei test.
//
// Cambiando i nomi delle prop nel punto in cui il Dashboard disegna la pagina
// — `onUpdatePrezzoIng` al posto di `onUpdatePrezzo`, `onCreaMateria` al posto
// di `onCreaMateriaPrima` — la pagina **smette di salvare i prezzi e di creare
// materie prime**, e restavano verdi 241 test su 241. In React passare una
// prop con il nome sbagliato non è un errore: arriva `undefined`, il pulsante
// c'è, si preme, e non succede niente.
//
// È un rischio nuovo, perché quei nomi sono nati oggi. Ed è il tipo di guasto
// peggiore: silenzioso, e in una pagina dove si scrivono i prezzi che reggono
// tutto il food cost.
//
// Questo file confronta le due estremità del filo. Non prova un
// comportamento, ma tiene insieme due file che devono per forza concordare, e
// che nessun altro controllo mette a confronto.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const DASH = fs.readFileSync('src/Dashboard.jsx', 'utf8')
const VIEW = fs.readFileSync('src/views/MateriePrimeView.jsx', 'utf8')

/** I nomi delle prop che la pagina dichiara di accettare. */
function propAccettate() {
  const m = VIEW.match(/export default function MateriePrimeView\(\{([\s\S]*?)\}\)/)
  if (!m) return null
  return m[1].split(',').map(x => x.trim().split(/[:=]/)[0].trim()).filter(Boolean)
}

/** I nomi delle prop che il Dashboard passa davvero. */
function propPassate() {
  const m = DASH.match(/<MateriePrimeView([^/>]*)\/>/)
  if (!m) return null
  return [...m[1].matchAll(/(\w+)=\{/g)].map(x => x[1])
}

describe('Le due estremità del filo combaciano', () => {
  it('la pagina dichiara le prop che ci si aspetta', () => {
    const accettate = propAccettate()
    expect(accettate, 'la firma di MateriePrimeView non si legge più: aggiorna il test').toBeTruthy()
    for (const nome of ['ricettario', 'onUpdatePrezzo', 'onCreaMateriaPrima']) {
      expect(accettate, `la pagina non accetta più «${nome}»`).toContain(nome)
    }
  })

  it('il Dashboard le passa tutte, con quei nomi', () => {
    const passate = propPassate()
    expect(passate, 'il Dashboard non disegna più MateriePrimeView: aggiorna il test').toBeTruthy()
    for (const nome of ['ricettario', 'onUpdatePrezzo', 'onCreaMateriaPrima']) {
      expect(passate, `il Dashboard non passa più «${nome}»`).toContain(nome)
    }
  })

  it('nessuna prop passata a vuoto: se il Dashboard la manda, la pagina la usa', () => {
    const accettate = propAccettate()
    const passate = propPassate()
    const orfane = passate.filter(p => !accettate.includes(p))
    expect(orfane, 'il Dashboard passa prop che la pagina non riceve').toEqual([])
  })

  it('le due funzioni che il Dashboard passa esistono davvero', () => {
    expect(DASH).toMatch(/const handleUpdatePrezzoIng\b/)
    expect(DASH).toMatch(/const handleCreaMateriaPrima\b/)
  })

  it('la pagina resta chiusa ai dipendenti', () => {
    // Tre reti: non nel menu, non fra le viste del dipendente, e il ramo che
    // la disegna ha il suo controllo. Qui si tiene la terza, che è l'unica
    // che regge se uno arriva da un link.
    expect(DASH).toMatch(/vista\s*===\s*"materie-prime"\s*&&\s*!isDip/)
  })
})
