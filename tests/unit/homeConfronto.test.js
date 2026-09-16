// La Home dice «rispetto a quando».
//
// Dall'audit dell'analytics di Shopify, primo punto di «cosa manca davvero»:
// le tessere della Home erano fotografie di oggi. «Ricavi 1.477 €» senza un
// riferimento non è un'informazione, è un numero — non si sa se è una buona
// giornata o una brutta, e la Home è la prima cosa che si apre la mattina.
//
// Il riferimento giusto per un negozio NON è ieri: è **lo stesso giorno della
// settimana scorsa**. Un martedì contro un martedì. Confrontare un lunedì col
// sabato precedente dice solo che il sabato si lavora di più, cosa che si
// sapeva già.
//
// E se quel giorno non c'è si ripiega su ieri, dicendolo; se non c'è nemmeno
// quello non si scrive niente. Un confronto inventato è peggio di nessun
// confronto.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { formatLocalDate } from '../../src/lib/dateLocal'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'views', 'DashboardHomeView.jsx'), 'utf8')

// Il conto del confronto, come lo fa la pagina.
function confronta(oggi, righe, totaleDi) {
  const [y, m, d] = String(oggi).split('-').map(Number)
  const settimanaScorsa = formatLocalDate(new Date(y, m - 1, d - 7))
  const ieri = formatLocalDate(new Date(y, m - 1, d - 1))
  for (const [giorno, etichetta] of [[settimanaScorsa, 'la settimana scorsa'], [ieri, 'ieri']]) {
    const tot = totaleDi(righe, giorno)
    if (tot != null && tot > 0) return { tot, etichetta }
  }
  return null
}
const sommaGiorno = (righe, giorno) => {
  const r = righe.filter(x => x.data === giorno)
  return r.length === 0 ? null : r.reduce((s, x) => s + x.tot, 0)
}

describe('con cosa si confronta la giornata', () => {
  it('con lo stesso giorno della settimana scorsa', () => {
    // Mercoledì 16 settembre 2026: la settimana prima è mercoledì 9.
    const c = confronta('2026-09-16', [{ data: '2026-09-09', tot: 900 }, { data: '2026-09-15', tot: 1200 }], sommaGiorno)
    expect(c.etichetta).toBe('la settimana scorsa')
    expect(c.tot).toBe(900)
  })

  it('e non con ieri, quando la settimana scorsa c\'è', () => {
    // Ieri era martedì: confrontare mercoledì con martedì dice poco.
    const c = confronta('2026-09-16', [{ data: '2026-09-09', tot: 900 }, { data: '2026-09-15', tot: 5000 }], sommaGiorno)
    expect(c.tot).toBe(900)
  })

  it('ripiega su ieri se quel giorno non c\'è, e lo dice', () => {
    const c = confronta('2026-09-16', [{ data: '2026-09-15', tot: 1200 }], sommaGiorno)
    expect(c.etichetta).toBe('ieri')
    expect(c.tot).toBe(1200)
  })

  it('e senza niente da confrontare non inventa un riferimento', () => {
    expect(confronta('2026-09-16', [], sommaGiorno)).toBe(null)
    // Nemmeno una giornata a zero vale come riferimento: dire «+1.477 € vs la
    // settimana scorsa» quando la settimana scorsa era chiuso è una bugia.
    expect(confronta('2026-09-16', [{ data: '2026-09-09', tot: 0 }], sommaGiorno)).toBe(null)
  })

  it('funziona a cavallo di un mese', () => {
    const c = confronta('2026-10-03', [{ data: '2026-09-26', tot: 700 }], sommaGiorno)
    expect(c.tot).toBe(700)
  })

  it('e con più sedi somma le chiusure dello stesso giorno', () => {
    const c = confronta('2026-09-16', [
      { data: '2026-09-09', tot: 500 }, { data: '2026-09-09', tot: 400 },
    ], sommaGiorno)
    expect(c.tot).toBe(900)
  })
})

describe('e nella pagina c\'è davvero', () => {
  it('i ricavi dicono di quanto sono cambiati e rispetto a cosa', () => {
    expect(SRC).toMatch(/const confrontoRicavi = useMemo/)
    expect(SRC).toMatch(/rispetto a \$\{confrontoRicavi\.etichetta\}/)
  })

  it('anche la produzione', () => {
    expect(SRC).toMatch(/const confrontoProduzione = useMemo/)
    expect(SRC).toMatch(/pz rispetto a \$\{confrontoProduzione\.etichetta\}/)
  })

  it('il giorno di riferimento è quello della settimana prima', () => {
    expect(SRC).toMatch(/const settimanaScorsa = useMemo/)
    expect(SRC).toMatch(/\{ giorno: settimanaScorsa, etichetta: 'la settimana scorsa' \}/)
    // E il calcolo è sui giorni locali, non via UTC.
    expect(SRC).toMatch(/formatLocalDate\(new Date\(y, m - 1, d - 7\)\)/)
  })

  it('senza confronto la tessera torna a dire quello che diceva prima', () => {
    // Non si lascia un buco: si torna al sottotitolo di sempre.
    expect(SRC).toMatch(/: \(b2bMese > 0/)
    expect(SRC).toMatch(/'non ancora registrati'/)
  })
})
