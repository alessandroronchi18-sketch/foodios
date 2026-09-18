// ── Il selettore delle sedi nel Ricettario ────────────────────────────────
//
// Domanda del titolare, 17/09/2026: «il ricettario contiene tutte le ricette
// indipendentemente dalle sedi, ha senso tenere il selettore lì? fai audit
// profondo». Poi: «se non serve nascondilo, non toglierlo, così se a una
// certa mi rendo conto che serve lo rimetto online facilmente».
//
// **L'audit, sui dati veri di produzione.** La regola di prima era: mostralo
// se l'organizzazione ha almeno due sedi, perché i prezzi possono essere
// diversi da una sede all'altra. Quei prezzi esistono davvero — si chiamano
// `pasticceria-listino-sede-v1` — ma contati sul database di produzione il
// 17/09/2026:
//
//     righe di prezzi per sede in tutto il prodotto ......... 0
//     Mara dei Boschi, che di sedi ne ha tre ................ 0
//
// Quindi nel Ricettario cambiare sede non cambiava un numero: il menu si
// apriva, si sceglieva un'altra sede, la pagina restava identica. Un comando
// che non fa niente è peggio di un comando che manca.
//
// Questi test tengono le due cose che contano: che adesso sia nascosto, e che
// per rimetterlo online basti una parola sola — perché il titolare ha chiesto
// esplicitamente di poterlo rifare senza lavoro.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const SORGENTE = fs.readFileSync('src/Dashboard.jsx', 'utf8')

const treSedi = [
  { id: 'a', nome: 'Carlina', attiva: true },
  { id: 'b', nome: 'Berthollet', attiva: true },
  { id: 'c', nome: 'De Gasperi', attiva: true },
]

async function caricaRegola() {
  const mod = await import('../../src/Dashboard.jsx')
  return mod.mostraSelettoreSede
}

describe('Nel Ricettario il selettore è nascosto', () => {
  it('non compare, nemmeno con tre sedi attive', async () => {
    const mostra = await caricaRegola()
    expect(mostra('ricettario', treSedi)).toBe(false)
  })

  it('nelle pagine dove la sede conta davvero continua a comparire', async () => {
    const mostra = await caricaRegola()
    // Magazzino, produzione e chiusura sono per-sede: lì cambiare sede cambia
    // i numeri sul serio, ed è l'unico motivo per cui un selettore esiste.
    expect(mostra('magazzino', treSedi)).toBe(true)
    expect(mostra('giornaliero', treSedi)).toBe(true)
    expect(mostra('chiusura', treSedi)).toBe(true)
  })

  it('resta fuori dalle pagine che la sede la gestiscono da sole', async () => {
    const mostra = await caricaRegola()
    expect(mostra('trasferimenti', treSedi)).toBe(false)
    expect(mostra('confronto-sedi', treSedi)).toBe(false)
    expect(mostra('nuova-ricetta', treSedi)).toBe(false)
  })
})

describe('Nascosto, non tolto: si rimette con una parola', () => {
  it('l’interruttore esiste ed è a `false`', () => {
    expect(SORGENTE).toMatch(/const SELETTORE_SEDI_NEL_RICETTARIO = false/)
  })

  it('il codice che lo disegnava è ancora tutto lì', () => {
    // Se qualcuno «facesse pulizia» cancellando SedeSelector o la regola
    // delle ≥2 sedi, rimettere l'interruttore a true non basterebbe più —
    // ed è esattamente la promessa fatta al titolare.
    expect(SORGENTE).toMatch(/SEDE_SELECTOR_MULTI_ONLY = new Set\(\['ricettario'\]\)/)
    expect(SORGENTE).toMatch(/<SedeSelector /)
  })

  it('la condizione sta in un posto solo, non copiata in due', () => {
    // Prima era scritta per esteso sia nella barra laterale sia in quella in
    // alto: bastava correggerne una per farle divergere in silenzio.
    const copie = (SORGENTE.match(/SEDE_SELECTOR_MULTI_ONLY\.has\(view\)/g) || []).length
    expect(copie).toBe(1)
  })
})
