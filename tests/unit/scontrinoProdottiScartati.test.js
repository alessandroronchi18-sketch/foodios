// I prodotti che lo scontrino conteneva e che non entrano nel conto si vedono.
//
// Trovato il 16/09/2026 scrivendo i test della pagina Cassa. `analyzeReceipt`
// separa i prodotti letti dall'AI che non passano le verifiche — prezzo
// mancante, quantità mancante, prezzo unitario non calcolabile — e per ognuno
// scrive il motivo. Il commento nel codice diceva «su una lista separata
// visibile in UI».
//
// In UI non c'era: la lista veniva costruita, restituita dalla funzione, e
// buttata. Uno scontrino con «BIGNÈ 4 pz, prezzo illeggibile» veniva letto, il
// bignè spariva dalla cassa, e a schermo non compariva niente. **L'incasso
// della giornata usciva più basso del vero e non c'era modo di accorgersene**
// — e quell'incasso è la base di ogni margine del mese.
//
// Questo file tiene ferme tre cose: che la lista continui a essere costruita
// col motivo, che finisca in uno stato della pagina invece che nel nulla, e
// che venga disegnata con accanto la frase che spiega la conseguenza.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'views', 'ChiusuraView.jsx'), 'utf8')

describe('la lettura dello scontrino', () => {
  it('separa i prodotti che non entrano, col motivo', () => {
    const fn = SRC.slice(SRC.indexOf('const incerti ='), SRC.indexOf('return { data: obj.data'))
    expect(fn).toMatch(/motivo: 'quantita mancante o non valida'/)
    expect(fn).toMatch(/motivo: 'prezzo totale mancante/)
    expect(fn).toMatch(/motivo: 'prezzo unitario non calcolabile'/)
  })

  it('e la funzione li restituisce', () => {
    expect(SRC).toMatch(/return \{ data: obj\.data \|\| null, prodotti: prodottiOk, incerti \}/)
  })
})

describe('e la pagina li fa vedere', () => {
  it('finiscono in uno stato, non nel nulla', () => {
    expect(SRC).toMatch(/const \[incerti, setIncerti\] = useState\(\[\]\)/)
    expect(SRC).toMatch(/setIncerti\(obj\.incerti \|\| \[\]\)/)
  })

  it('c\'è un blocco che li disegna', () => {
    expect(SRC).toMatch(/\{incerti\.length > 0 && \(/)
    expect(SRC).toMatch(/incerti\.map\(\(p, i\) =>/)
  })

  it('e dice la conseguenza, non solo il fatto', () => {
    // «Tre prodotti non sono entrati» non basta: chi legge deve capire che
    // l'incasso che sta per salvare è più basso di quello vero.
    expect(SRC).toMatch(/L'incasso di oggi è più basso di quanto hai incassato davvero/)
  })

  it('si svuotano quando si cambia giornata o si toglie la foto', () => {
    // Altrimenti l'avviso di ieri resta appiccicato alla giornata di oggi.
    const puliscono = [...SRC.matchAll(/setVenduto\(null\)/g)].map(m => m.index)
    for (const i of puliscono) {
      const intorno = SRC.slice(Math.max(0, i - 200), i + 200)
      expect(intorno, `setVenduto(null) a ${i} senza svuotare gli incerti`).toMatch(/setIncerti\(\[\]\)/)
    }
  })
})

describe('la lettura in blocco dice quali foto non sono entrate', () => {
  it('l\'esito foto per foto viene disegnato, non solo raccolto', () => {
    // `batchResults` veniva riempito e non lo leggeva nessuno: dopo dieci
    // scontrini l'utente riceveva solo «7 chiusure salvate · 3 saltate», e
    // non sapeva QUALI tre, né perché, né quali rifotografare.
    expect(SRC).toMatch(/\{batchResults\.length > 0 && !loading && \(/)
    expect(SRC).toMatch(/batchResults\.map\(\(r, i\) =>/)
    expect(SRC).toMatch(/Scontrino per scontrino/)
  })

  it('e dice cosa fare di quelle che non sono entrate', () => {
    expect(SRC).toMatch(/rifotografale da vicino/)
  })
})

describe('lo scontrino di un\'altra sede non finisce su questa', () => {
  it('il risultato in sospeso è marchiato con la sede e l\'attività', () => {
    // Il risultato dell'analisi sta fuori da React apposta, per sopravvivere
    // se si cambia pagina mentre l'AI legge. Ma senza il marchio se lo
    // prendeva il primo montaggio successivo, anche dopo un cambio di sede —
    // e con esso la data estratta dallo scontrino: si riapriva la Cassa di
    // un'altra sede e ci si ritrovava lo scontrino di prima, su una data
    // spostata.
    expect(SRC).toMatch(/perSede: sedeId, perOrg: orgId/)
  })

  it('e se non è di questa sede si butta, invece di applicarlo', () => {
    expect(SRC).toMatch(/if \(\(p\.perSede != null && p\.perSede !== sedeId\) \|\| \(p\.perOrg != null && p\.perOrg !== orgId\)\)/)
    expect(SRC).toMatch(/_receiptPending\.current = null\n {6}return/)
  })
})
