// ── Un campo che non si può scrivere è un campo che non esiste ──────────
//
// ── Il difetto di famiglia del 22-23/09/2026 ────────────────────────────
//
// Tre volte in due giorni, sempre nella stessa forma: una metà costruita bene
// e l'altra mai collegata.
//
//   • `profiles.puo_ordinare` — colonna, funzione, policy, guardia, registro:
//     tutto sul database, e **nessuno lo leggeva nel frontend**. Il titolare
//     accendeva l'interruttore, il database lo rispettava, e il dipendente
//     non riusciva comunque ad aprire la pagina.
//   • `classificaRiga` diceva `segno: -1` per un reso e **nessuno lo
//     leggeva**: un reso caricava la merce invece di scaricarla.
//   • `destinazioneSede.js`, 82 prove e **zero collegamenti**.
//
// Le colonne nuove di oggi sono della stessa famiglia: se il titolare non le
// può scrivere da nessuna schermata, il conto che le usa non partirà mai — e
// dal database sembrerà tutto a posto.
//
// Questo file guarda **il percorso intero**: la colonna c'è, il modulo la
// scrive, e la schermata ha il campo per metterla.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
const MIGRAZIONI = readdirSync(join(RADICE, 'supabase', 'migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => readFileSync(join(RADICE, 'supabase', 'migrations', f), 'utf8'))
  .join('\n')

// tabella → [colonna, file della schermata che la scrive]
const CAMPI = [
  ['dipendenti', 'patente', 'src/components/Personale.jsx'],
  ['dipendenti', 'mezzi', 'src/components/Personale.jsx'],
  ['fornitori', 'vicino_a_sede', 'src/components/Fornitori.jsx'],
  ['fornitori', 'si_ritira', 'src/components/Fornitori.jsx'],
  ['fornitori', 'whatsapp', 'src/components/SchedaFornitoreProposta.jsx'],
  ['fornitori', 'pec', 'src/components/SchedaFornitoreProposta.jsx'],
  ['profiles', 'puo_ordinare', 'src/components/Personale.jsx'],
]

describe('Ogni colonna nuova si può scrivere da qualche parte', () => {
  it.each(CAMPI)('%s.%s si scrive da %s', (tabella, colonna, schermata) => {
    expect(MIGRAZIONI, `la colonna ${colonna} non è in nessuna migration`)
      .toMatch(new RegExp(`add column if not exists\\s+${colonna}\\b`, 'i'))
    expect(leggi(schermata), `${schermata} non scrive mai ${colonna}`)
      .toMatch(new RegExp(`\\b${colonna}\\b`))
  })
})

describe('E i campi del giro arrivano fino al conto', () => {
  it('la banda del giro legge i fornitori con «si passa di lì» e «si ritira»', () => {
    const G = leggi('src/components/GiroTrasferimenti.jsx')
    expect(G).toMatch(/vicino_a_sede/)
    expect(G).toMatch(/si_ritira/)
    expect(G).toMatch(/ritiriSullaStrada/)
  })

  it('e la scheda del dipendente offre davvero i mezzi, non solo il campo', () => {
    const P = leggi('src/components/Personale.jsx')
    expect(P).toMatch(/import \{ MEZZI \}/)
    expect(P).toMatch(/Ha la patente\?/)
  })

  it('la patente vuota resta «non lo so», non diventa «no»', () => {
    // Metterla a `false` di partenza direbbe di ogni dipendente già in
    // archivio che non ce l'ha, e i giri finirebbero sempre alle stesse due
    // persone senza che nessuno se ne accorga.
    expect(leggi('src/components/Personale.jsx'))
      .toMatch(/patente: form\.patente === "" \? null : form\.patente === "si"/)
  })

  it('e «si ritira» vuoto pure', () => {
    expect(leggi('src/components/Fornitori.jsx'))
      .toMatch(/si_ritira: form\.si_ritira === "" \? null : form\.si_ritira === "si"/)
  })
})

describe('Il righello di questo file', () => {
  it('legge davvero le migration e le schermate', () => {
    expect(MIGRAZIONI.length).toBeGreaterThan(50000)
    expect(leggi('src/components/Personale.jsx').length).toBeGreaterThan(10000)
  })

  it('e una colonna inventata non si trova', () => {
    expect(MIGRAZIONI).not.toMatch(/add column if not exists\s+colonna_che_non_esiste\b/i)
  })
})
