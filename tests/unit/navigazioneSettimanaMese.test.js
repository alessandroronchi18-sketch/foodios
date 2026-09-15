// I bottoni "settimana precedente" e "mese precedente" non andavano indietro.
//
// Segnalato in produzione il 15/09/2026. Si premeva, e la pagina restava dov'era.
//
// La causa: c'era un `useEffect` che guardava sia il giorno scelto nella vista
// "Oggi" sia il lunedì della settimana caricata, e se il giorno usciva dalla
// settimana riportava la settimana su quel giorno. Serviva per le frecce del
// giorno, ma scattava anche quando si navigava la settimana: si premeva
// "indietro", `lunediIso` tornava di sette giorni, l'effetto vedeva che oggi
// era fuori e riportava tutto al punto di partenza. Dalla settimana corrente
// non si usciva, e lo stesso valeva per i mesi, che scrivono la stessa
// variabile.
//
// È il difetto classico dell'effetto che "corregge" uno stato guardandone un
// altro: due comandi che scrivono la stessa variabile si combattono, e vince
// quello che parte per ultimo.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { lunediDellaSettimana } from '../../src/lib/inventarioProduzione.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const V = readFileSync(join(RADICE, 'src', 'views', 'InventarioSettimanaleView.jsx'), 'utf8')

// Le stesse due funzioni della pagina, per provarne il comportamento.
const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const formatLocalDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('l\'effetto che si combatteva con i bottoni non c\'è più', () => {
  it('nessun effetto riscrive la settimana guardando il giorno', () => {
    expect(V).not.toMatch(/useEffect\(\(\) => \{\s*\n\s*const fine = addDays\(lunediIso, 6\)/)
    expect(V).not.toMatch(/\}, \[giornoOggi, lunediIso\]\)/)
  })

  it('chi cambia giorno sposta anche la settimana, in un gesto solo', () => {
    expect(V).toMatch(/const cambiaGiorno = useCallback/)
    expect(V).toMatch(/onCambiaGiorno=\{cambiaGiorno\}/)
  })

  it('e usa la forma funzionale, per non leggere un valore vecchio', () => {
    // `setLunediIso(prec => ...)`: con `setLunediIso(lunediIso)` due cambi
    // ravvicinati leggerebbero lo stesso valore di partenza.
    expect(V).toMatch(/setLunediIso\(prec => \{/)
  })
})

describe('andare indietro di una settimana, davvero', () => {
  // Riproduzione del comportamento: prima il risultato veniva annullato.
  const settimanaPrec = (lunedi) => addDays(lunedi, -7)
  const settimanaSucc = (lunedi) => addDays(lunedi, 7)

  it('sette giorni indietro, e ci resta', () => {
    expect(settimanaPrec('2026-09-14')).toBe('2026-09-07')
    expect(settimanaPrec('2026-09-07')).toBe('2026-08-31')
  })

  it('funziona anche a cavallo di un anno', () => {
    expect(settimanaPrec('2027-01-04')).toBe('2026-12-28')
    expect(settimanaSucc('2026-12-28')).toBe('2027-01-04')
  })

  it('e resta sempre un lunedì', () => {
    let l = '2026-09-14'
    for (let i = 0; i < 30; i++) {
      expect(new Date(l + 'T12:00').getDay(), `${l} non è un lunedì`).toBe(1)
      l = settimanaPrec(l)
    }
  })
})

describe('andare indietro di un mese', () => {
  // La regola scelta: si punta al lunedì della settimana che contiene il 15.
  // Il 15 è sempre dentro il mese, e quel lunedì cade fra il 9 e il 15 —
  // quindi è sempre nello stesso mese, e l'etichetta in cima resta giusta.
  const vaiAlMese = (anno, mese) =>
    lunediDellaSettimana(formatLocalDate(new Date(anno, mese, 15, 12, 0, 0)))
  const meseDi = (iso) => new Date(iso + 'T12:00').getMonth()
  const annoDi = (iso) => new Date(iso + 'T12:00').getFullYear()

  it('il cursore resta un lunedì, non il primo del mese', () => {
    // Prima si metteva sul PRIMO del mese, che è lunedì una volta su sette:
    // tornando alla scheda Settimana la tabella partiva da un mercoledì.
    for (let m = 0; m < 12; m++) {
      const iso = vaiAlMese(2026, m)
      expect(new Date(iso + 'T12:00').getDay(), `${iso} non è un lunedì`).toBe(1)
    }
  })

  it('e cade sempre nel mese giusto, così l\'etichetta non mente', () => {
    for (let anno = 2024; anno <= 2028; anno++) {
      for (let m = 0; m < 12; m++) {
        expect(meseDi(vaiAlMese(anno, m)), `${anno}-${m + 1}`).toBe(m)
        expect(annoDi(vaiAlMese(anno, m))).toBe(anno)
      }
    }
  })

  it('gennaio indietro va a dicembre dell\'anno prima', () => {
    const gennaio = vaiAlMese(2026, 0)
    const d = new Date(gennaio + 'T12:00')
    const prec = vaiAlMese(d.getFullYear(), d.getMonth() - 1)
    expect(meseDi(prec)).toBe(11)
    expect(annoDi(prec)).toBe(2025)
  })

  it('dicembre avanti va a gennaio dell\'anno dopo', () => {
    const dicembre = vaiAlMese(2026, 11)
    const d = new Date(dicembre + 'T12:00')
    const succ = vaiAlMese(d.getFullYear(), d.getMonth() + 1)
    expect(meseDi(succ)).toBe(0)
    expect(annoDi(succ)).toBe(2027)
  })

  it('avanti e indietro riportano allo stesso punto', () => {
    let iso = vaiAlMese(2026, 5)
    const partenza = iso
    for (let i = 0; i < 14; i++) {
      const d = new Date(iso + 'T12:00'); iso = vaiAlMese(d.getFullYear(), d.getMonth() - 1)
    }
    for (let i = 0; i < 14; i++) {
      const d = new Date(iso + 'T12:00'); iso = vaiAlMese(d.getFullYear(), d.getMonth() + 1)
    }
    expect(iso).toBe(partenza)
  })
})

describe('le date si leggono a mezzogiorno, non a mezzanotte', () => {
  it('così il fuso orario non sposta il giorno', () => {
    // `new Date('2026-01-01')` è mezzanotte UTC: in un fuso indietro diventa
    // il 31 dicembre, e il mese risulta sbagliato.
    expect(V).toMatch(/new Date\(lunediIso \+ 'T12:00'\)/)
    expect(V).toMatch(/new Date\(anno, mese, 15, 12, 0, 0\)/)
    // E nessuna lettura del cursore a mezzanotte.
    expect(V).not.toMatch(/const d = new Date\(lunediIso\)\n/)
  })
})
