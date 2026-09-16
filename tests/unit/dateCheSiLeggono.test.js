// ── Le date che l'utente legge sono in italiano ────────────────────────
//
// Difetto vero, 16/09/2026, visto misurando i riquadri dentro l'account del
// titolare. Nel Registro attività, sotto il numero delle azioni, c'era
// scritto:
//
//     dal 2026-09-09 al 2026-09-16
//
// È il formato con cui la data viaggia nel programma e nel database, non
// quello con cui si legge. `dataDa` e `dataA` arrivano da due campi
// `<input type="date">`, che danno sempre `AAAA-MM-GG`, e finivano a schermo
// così com'erano.
//
// Stona anche solo a vederlo: due righe sopra, la stessa pagina scrive
// «Mercoledì 16 Settembre». E il resto del prodotto ha una regola dichiarata
// sui numeri all'italiana — il punto delle migliaia, l'euro dopo la cifra —
// che qui veniva smentita dalle date.
//
// La funzione giusta c'era già: `nomePeriodo` in `src/lib/periodoAnalisi.js`,
// scritta per la barra dei periodi. Serviva solo usarla.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nomePeriodo } from '../../src/lib/periodoAnalisi.js'

const RADICE = join(__dirname, '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('il Registro attività non scrive più la data del database', () => {
  const REG = leggi('src', 'components', 'RegistroAttivita.jsx')

  it('la riga con le due date non stampa più le variabili grezze', () => {
    expect(REG).not.toContain('`dal ${dataDa} al ${dataA}`')
  })

  it('usa la funzione che le scrive in italiano', () => {
    expect(REG).toContain('nomePeriodo(dataDa, dataA)')
    expect(REG).toContain("from '../lib/periodoAnalisi'")
  })
})

describe('nomePeriodo scrive date da leggere, non da elaborare', () => {
  it('un intervallo dentro lo stesso mese si accorcia', () => {
    expect(nomePeriodo('2026-09-09', '2026-09-16')).toBe('9–16 settembre 2026')
  })

  it('un solo giorno non si ripete due volte', () => {
    expect(nomePeriodo('2026-09-16', '2026-09-16')).toBe('16 settembre 2026')
  })

  it('a cavallo di due mesi si scrivono tutti e due', () => {
    expect(nomePeriodo('2026-08-28', '2026-09-03')).toBe('28 agosto – 3 settembre 2026')
  })

  it('a cavallo di due anni si scrivono anche gli anni', () => {
    expect(nomePeriodo('2025-12-30', '2026-01-02')).toBe('30 dicembre 2025 – 2 gennaio 2026')
  })

  it('senza date non inventa niente', () => {
    expect(nomePeriodo('', '2026-09-16')).toBe('')
    expect(nomePeriodo(null, null)).toBe('')
  })

  it('non esce mai niente che somigli a una data del database', () => {
    const casi = [['2026-09-09', '2026-09-16'], ['2026-01-01', '2026-12-31'], ['2026-03-05', '2026-03-05']]
    for (const [a, b] of casi) {
      expect(nomePeriodo(a, b), `${a} → ${b}`).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })
})

describe('e non ricompare altrove', () => {
  it('nessun componente stampa «dal ${…} al ${…}» con date grezze', () => {
    // Il modo in cui era scritto il difetto. Se qualcuno lo riscrive, qui si vede.
    for (const f of ['components/RegistroAttivita.jsx', 'views/PLView.jsx', 'views/StoricoView.jsx']) {
      let testo
      try { testo = leggi('src', ...f.split('/')) } catch { continue }
      expect(testo, f).not.toMatch(/`dal \$\{data[A-Za-z]*\} al \$\{data[A-Za-z]*\}`/)
    }
  })
})
