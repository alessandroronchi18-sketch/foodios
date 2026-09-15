// I lavori notturni lasciano una traccia.
//
// `cron_runs` esisteva, ma serviva a una cosa sola: non mandare due volte la
// stessa email di avviso nello stesso giorno. Il nome del lavoro conteneva la
// data (`cron-giornaliero-alert-2026-09-15`), quindi ogni esecuzione creava
// una riga con un nome diverso: non si poteva raggruppare, né chiedere «da
// quando non gira».
//
// Dei sette lavori che girano ogni notte non restava traccia di nessuno, e il
// pannello capiva se uno funzionava guardando se la sua tabella avesse righe
// nuove. È il motivo per cui «la previsione non ha dati» e «la previsione non
// gira» si leggevano identici: `forecast_giornaliero` è vuota da sempre, e
// solo dieci minuti di database hanno potuto dire quale delle due fosse.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
const vive = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')

const CRON = vive(leggi('api/cron-giornaliero.js'))
const ADMIN = vive(leggi('api/admin.js'))
const UI = vive(leggi('src/admin/AdminPage.jsx'))

describe('ogni passo scrive il suo esito', () => {
  it('c\'è una funzione che registra, e runStep la chiama sempre', () => {
    expect(CRON).toMatch(/async function segnaEsito\(name, esito\)/)
    expect(CRON).toMatch(/await segnaEsito\(name, esito\)\s*\n\s*return esito/)
  })

  it('scrive su cron_runs con il nome del passo, senza la data dentro', () => {
    const f = CRON.slice(CRON.indexOf('async function segnaEsito'), CRON.indexOf('async function runStep'))
    expect(f).toMatch(/\.from\('cron_runs'\)/)
    expect(f).toMatch(/job_name: name/)
    // Se la data tornasse dentro il nome, il registro tornerebbe illeggibile.
    expect(f).not.toMatch(/job_name: `\$\{name\}-/)
    expect(f).toMatch(/run_date: new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
  })

  it('un giro al giorno per lavoro: il secondo aggiorna, non duplica', () => {
    const f = CRON.slice(CRON.indexOf('async function segnaEsito'), CRON.indexOf('async function runStep'))
    expect(f).toMatch(/onConflict: 'job_name,run_date'/)
  })

  it('registra sia il successo sia il fallimento, col motivo', () => {
    const f = CRON.slice(CRON.indexOf('async function segnaEsito'), CRON.indexOf('async function runStep'))
    expect(f).toMatch(/status: esito\.ok \? 'ok' : 'error'/)
    expect(f).toMatch(/error_message: esito\.ok \? null :/)
  })

  it('il registro che non scrive non fa fallire il lavoro, ma si vede', () => {
    const f = CRON.slice(CRON.indexOf('async function segnaEsito'), CRON.indexOf('async function runStep'))
    expect(f).toMatch(/console\.error\('\[cron\] registro non scritto/)
    expect(f).toMatch(/catch \(e\)/)
    // Nessun `throw`: un registro rotto non deve fermare il riepilogo del
    // mattino di trecento clienti.
    expect(f).not.toMatch(/throw /)
  })

  it('il tempo impiegato finisce nella riga', () => {
    const f = CRON.slice(CRON.indexOf('async function segnaEsito'), CRON.indexOf('async function runStep'))
    expect(f).toMatch(/started_at: new Date\(Date\.now\(\) - \(esito\.ms \|\| 0\)\)/)
    expect(f).toMatch(/completed_at: new Date\(\)\.toISOString\(\)/)
  })
})

describe('il pannello distingue «non gira» da «non ha dati»', () => {
  it('lo stato viene dal registro, non dalla tabella di destinazione', () => {
    const f = ADMIN.slice(ADMIN.indexOf('async function getCronStatus'), ADMIN.indexOf('export async function getHealthSnapshot'))
    expect(f).toMatch(/\.from\('cron_runs'\)/)
    expect(f).toMatch(/const status = r == null \? 'mai_registrato'/)
  })

  it('e la tabella di destinazione resta come conferma, non come prova', () => {
    const f = ADMIN.slice(ADMIN.indexOf('async function getCronStatus'), ADMIN.indexOf('export async function getHealthSnapshot'))
    expect(f).toMatch(/ultima_scrittura/)
  })

  it('un lavoro che gira e non scrive niente lo dice a parole', () => {
    const f = ADMIN.slice(ADMIN.indexOf('async function getCronStatus'), ADMIN.indexOf('export async function getHealthSnapshot'))
    expect(f).toMatch(/Gira regolarmente ma non ha mai scritto niente/)
  })

  it('e un lavoro fermo da giorni pure', () => {
    const f = ADMIN.slice(ADMIN.indexOf('async function getCronStatus'), ADMIN.indexOf('export async function getHealthSnapshot'))
    expect(f).toMatch(/Ha girato l'ultima volta \$\{Math\.round\(oreDaGiro \/ 24\)\} giorni fa/)
  })

  it('legge il registro con una query sola, non una per lavoro', () => {
    const f = ADMIN.slice(ADMIN.indexOf('async function getCronStatus'), ADMIN.indexOf('export async function getHealthSnapshot'))
    expect((f.match(/\.from\('cron_runs'\)/g) || []).length).toBe(1)
  })
})

describe('tutti i lavori notturni sono elencati', () => {
  it('gli otto passi che gira il lavoro notturno stanno nel pannello', () => {
    // Prima ce n'erano quattro: i quattro con una tabella loro. Gli altri
    // (avvisi, anomalie, le due pulizie) non risultavano da nessuna parte.
    const elenco = ADMIN.slice(ADMIN.indexOf('const CRON_SIGNATURES'), ADMIN.indexOf('async function getCronStatus'))
    for (const id of ['cron-notifiche', 'cron-daily-brief', 'cron-ai-suggestions',
                      'cron-forecast', 'cron-documentary', 'anomaly-detect',
                      'cleanup-audit-log', 'cleanup-error-log']) {
      expect(elenco, `"${id}" non è nel pannello`).toContain(`'${id}'`)
    }
  })

  it('e i nomi dei passi coincidono con quelli che il lavoro esegue', () => {
    // Se uno dei due elenchi cambia senza l'altro, il pannello mostra un
    // lavoro che non esiste o ne nasconde uno che c'è.
    const elencoPannello = new Set(
      [...ADMIN.slice(ADMIN.indexOf('const CRON_SIGNATURES'), ADMIN.indexOf('async function getCronStatus'))
        .matchAll(/id: '([a-z-]+)'/g)].map(m => m[1])
    )
    const eseguiti = new Set([
      ...[...CRON.matchAll(/\['([a-z-]+)',\s*\(\) =>/g)].map(m => m[1]),
      ...[...CRON.matchAll(/runStep\('([a-z-]+)'/g)].map(m => m[1]),
    ])
    for (const id of elencoPannello) {
      // `cron-report-mensile` gira solo il primo del mese: se un giorno
      // venisse elencato, sarebbe sempre "in ritardo" per ventinove giorni.
      expect(eseguiti.has(id), `il pannello elenca "${id}", che il lavoro notturno non esegue`).toBe(true)
    }
  })

  it('ogni lavoro ha un nome in italiano, non l\'identificativo tecnico', () => {
    const elenco = ADMIN.slice(ADMIN.indexOf('const CRON_SIGNATURES'), ADMIN.indexOf('async function getCronStatus'))
    const etichette = [...elenco.matchAll(/etichetta: '([^']+)'/g)].map(m => m[1])
    expect(etichette.length).toBeGreaterThanOrEqual(8)
    for (const e of etichette) {
      expect(e, e).not.toMatch(/^cron-|_/)
      expect(e.length, e).toBeGreaterThan(5)
    }
  })

  it('il pannello mostra l\'etichetta, non l\'identificativo', () => {
    expect(UI).toMatch(/\{c\.etichetta \|\| c\.id\}/)
    expect(UI).toMatch(/Lavori notturni/)
    expect(UI).not.toMatch(/>Cron status</)
  })
})
