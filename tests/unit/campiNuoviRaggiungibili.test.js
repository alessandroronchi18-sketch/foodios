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

// ── E nessuna funzione costruita e mai chiamata ─────────────────────────
//
// Il cricchetto qui sopra guarda le colonne. Il 23/09/2026 il difetto si è
// ripetuto **una quarta volta**, e in una forma che quel controllo non
// vedeva: `dividiProduzione` era esportata, provata con sei casi, e non la
// chiamava nessuno. Cioè il pezzo che serviva al caso più importante — «un
// gusto lo si fa solo in un posto tipo Carlina e poi lo si smista» — non era
// raggiungibile da nessuna schermata, e dai test sembrava fatto.
//
// Una funzione che nessuno chiama non è codice pronto: è codice che non c'è.
describe('Ogni conto nuovo viene chiamato da qualche parte', () => {
  const LIBRERIE = [
    'righeBolla', 'datiFornitoreDaBolla', 'destinazioneSede', 'pezziPerConfezione',
    'riordino', 'testoOrdine', 'consumoGiornaliero', 'smistaMerce',
    'giriTrasferimenti', 'mezziTrasporto',
  ]

  /** Tutto il codice del prodotto. */
  const TUTTO = (() => {
    const fuori = []
    const gira = (dir) => {
      for (const v of readdirSync(join(RADICE, dir), { withFileTypes: true })) {
        const p = `${dir}/${v.name}`
        if (v.isDirectory()) gira(p)
        else if (/\.(js|jsx)$/.test(v.name)) fuori.push([p, readFileSync(join(RADICE, p), 'utf8')])
      }
    }
    gira('src')
    gira('api')
    return fuori
  })()

  it.each(LIBRERIE)('src/lib/%s.js: tutto quello che esporta serve a qualcosa', (nome) => {
    const file = `src/lib/${nome}.js`
    const src = leggi(file)
    const esportate = [...src.matchAll(/^export (?:async )?function (\w+)/gm)].map(m => m[1])
    expect(esportate.length, `${file} non esporta nessuna funzione`).toBeGreaterThan(0)

    // Una funzione serve a qualcosa se la chiama **qualcuno**: un'altra
    // pagina, oppure il suo stesso file. Esportare un aiutante per poterlo
    // provare da solo è una buona abitudine, e non va confusa con una
    // funzione che non chiama nessuno — che è il difetto vero.
    const orfane = esportate.filter(f => {
      const usata = new RegExp(`\\b${f}\\s*\\(`)
      const dentro = usata.test(src.replace(new RegExp(`export (?:async )?function ${f}\\s*\\(`, 'g'), ''))
      if (dentro) return false
      return !TUTTO.some(([p, t]) => p !== file && usata.test(t))
    })
    expect(orfane, `${file}: costruite e mai chiamate da nessuno — ${orfane.join(', ')}`).toEqual([])
  })
})
