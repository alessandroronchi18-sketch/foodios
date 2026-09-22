// ── Il permesso di ordinare deve arrivare fino allo schermo ─────────────
//
// Richiesta del titolare, 22/09/2026: «bisogna istituire la possibilità ad
// alcuni dipendenti di poter ordinare».
//
// ── Il difetto, trovato dall'audit ──────────────────────────────────────
//
// Il permesso è stato costruito bene sul database: colonna `puo_ordinare`,
// funzione, policy su `ordini_fornitori` e `righe_ordine`, guardia contro
// chi se lo dà da solo, registro delle modifiche. Tutto verificato.
//
// E **il frontend non lo leggeva da nessuna parte**. `ordini` non era fra le
// pagine di un dipendente, quindi:
//   • la voce non compariva nel menu;
//   • `setView` la rifiutava;
//   • e anche forzando la vista a mano, il Dashboard rimandava alla pagina
//     di casa.
//
// Cioè: il titolare accendeva l'interruttore, il database lo rispettava, e
// **nessun dipendente riusciva comunque ad aprire la pagina**. La funzione
// chiesta era completamente inattiva, e guardando il database sembrava fatta.
//
// È il difetto di famiglia di questa giornata: due metà giuste
// separatamente, e nessuno che le mettesse insieme.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { vistePerDipendente, VISTE_DIPENDENTE, costruisciMenu, vociMenu } from '../../src/lib/menuFoodos.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')

describe('Le pagine di un dipendente dipendono dal suo permesso', () => {
  it('senza permesso, «Ordini» non c\'è', () => {
    expect(vistePerDipendente({ puoOrdinare: false }).has('ordini')).toBe(false)
    expect(vistePerDipendente({}).has('ordini')).toBe(false)
    expect(vistePerDipendente().has('ordini')).toBe(false)
  })

  it('col permesso, c\'è', () => {
    expect(vistePerDipendente({ puoOrdinare: true }).has('ordini')).toBe(true)
  })

  it('e non si apre nient\'altro: una porta sola', () => {
    // Il permesso è per ordinare, non un varco generale sui dati sensibili.
    const con = vistePerDipendente({ puoOrdinare: true })
    const senza = vistePerDipendente({ puoOrdinare: false })
    const inPiu = [...con].filter(v => !senza.has(v))
    expect(inPiu).toEqual(['ordini'])
    for (const vietata of ['scadenzario', 'fornitori', 'pl', 'cashflow', 'personale', 'ordini-ai']) {
      expect(con.has(vietata), `«${vietata}» non deve aprirsi`).toBe(false)
    }
  })

  it('l\'insieme di partenza non viene modificato', () => {
    // `VISTE_DIPENDENTE` è un Set condiviso ed esportato: aggiungerci dentro
    // vorrebbe dire dare il permesso a tutti per sempre, al primo dipendente
    // abilitato che apre l'app.
    const prima = VISTE_DIPENDENTE.size
    vistePerDipendente({ puoOrdinare: true })
    expect(VISTE_DIPENDENTE.size).toBe(prima)
    expect(VISTE_DIPENDENTE.has('ordini')).toBe(false)
  })
})

describe('La voce nel menu', () => {
  const menu = (opts) => vociMenu(costruisciMenu({ metodoInventario: true, piuSedi: true, ...opts })).map(v => v.id)

  it('un dipendente senza permesso non vede «Ordini»', () => {
    expect(menu({ isDipendente: true, puoOrdinare: false })).not.toContain('ordini')
  })

  it('un dipendente col permesso la vede', () => {
    expect(menu({ isDipendente: true, puoOrdinare: true })).toContain('ordini')
  })

  it('e il titolare la vede sempre', () => {
    expect(menu({ isDipendente: false })).toContain('ordini')
    expect(menu({ isDipendente: false, puoOrdinare: false })).toContain('ordini')
  })

  it('un dipendente col permesso NON vede le pagine dei soldi', () => {
    const v = menu({ isDipendente: true, puoOrdinare: true })
    for (const vietata of ['scadenzario', 'fornitori', 'pl', 'cashflow', 'personale']) {
      expect(v, `«${vietata}» non deve comparire`).not.toContain(vietata)
    }
  })
})

describe('Il Dashboard usa il permesso, non l\'insieme fisso', () => {
  const DASH = leggi('src/Dashboard.jsx')

  it('calcola le pagine permesse a QUESTO dipendente', () => {
    expect(DASH).toMatch(/vistePerDipendente\(\{\s*puoOrdinare:/)
  })

  it('e i quattro punti che bloccano una vista usano quelle, non l\'insieme di base', () => {
    // Se anche uno solo tornasse a `DIPENDENTE_VIEWS`, quel punto
    // rimanderebbe il dipendente abilitato alla pagina di casa, e il permesso
    // sarebbe inattivo di nuovo — ma solo da lì, che è il modo peggiore.
    // Un punto può usare l'insieme di base solo se la vista che controlla è
    // una **costante** che in quell'insieme non c'è per definizione (oggi:
    // `VISTE_DIPENDENTE.has("home")`). Su una variabile, mai.
    const suVariabile = [...DASH.matchAll(/DIPENDENTE_VIEWS\.has\(([^)]*)\)/g)]
      .map(m => m[1].trim())
      .filter(a => !/^["']/.test(a))
    expect(suVariabile, 'questi punti bloccano una vista variabile con l\'insieme fisso').toEqual([])
    expect((DASH.match(/VISTE_DIP\.has\(|permesseIniziali\.has\(/g) || []).length).toBeGreaterThanOrEqual(5)
  })

  it('e il menu riceve il permesso', () => {
    expect(DASH).toMatch(/puoOrdinare: auth\?\.puoOrdinare === true/)
  })
})

describe('Il permesso arriva dall\'autenticazione', () => {
  it('`useAuth` lo espone, letto dal profilo', () => {
    const A = leggi('src/auth/useAuth.js')
    expect(A).toMatch(/puoOrdinare: profile\?\.puo_ordinare === true/)
  })
})

describe('Il dipendente che ordina vede i fornitori, ma solo per ordinare', () => {
  const SQL = leggi('supabase/migrations/20260922c_il_dipendente_che_ordina_vede_solo_quello_che_serve.sql')

  it('c\'è una funzione che elenca i fornitori a cui ordinare', () => {
    expect(SQL).toMatch(/create function public\.fos_fornitori_per_ordine\(\)/)
  })

  it('e dà solo i campi che servono per mandare un ordine', () => {
    for (const c of ['id', 'nome', 'email', 'whatsapp', 'telefono', 'lead_time_giorni', 'minimo_ordine']) {
      expect(SQL, `manca ${c}`).toMatch(new RegExp(`\\b${c}\\b`))
    }
  })

  it('e NON dà l\'IBAN, le condizioni di pagamento, la partita IVA', () => {
    // È il punto: un permesso di ordinare non è un varco sulla contabilità.
    const corpo = SQL.slice(SQL.indexOf('fos_fornitori_per_ordine'), SQL.indexOf('fos_consegne_fornitori'))
    for (const vietato of ['iban', 'termini_pagamento', 'termini_tipo', 'partita_iva', 'codice_fiscale']) {
      expect(corpo, `«${vietato}» non deve uscire`).not.toMatch(new RegExp(`f\\.${vietato}`))
    }
  })

  it('delle fatture dà solo le date, mai gli importi', () => {
    const corpo = SQL.slice(SQL.indexOf('fos_consegne_fornitori'))
    expect(corpo).toMatch(/select f\.fornitore, f\.data_fattura/)
    for (const vietato of ['totale', 'imponibile', 'imposta', 'iban']) {
      expect(corpo, `«${vietato}» non deve uscire`).not.toMatch(new RegExp(`f\\.${vietato}`))
    }
  })

  it('tutt\'e due rispettano il permesso, non solo il ruolo', () => {
    const quante = (SQL.match(/not public\.is_dipendente\(\) or public\.puo_ordinare\(\)/g) || []).length
    expect(quante, 'una delle due funzioni non controlla il permesso').toBe(2)
  })

  it('e non sono aperte a chi passa di lì', () => {
    expect(SQL).toMatch(/revoke all on function public\.fos_fornitori_per_ordine\(\) from public, anon/)
    expect(SQL).toMatch(/revoke all on function public\.fos_consegne_fornitori\(integer\) from public, anon/)
  })

  it('e la pagina le usa davvero, invece di leggere le tabelle', () => {
    const V = leggi('src/views/OrdiniView.jsx')
    expect(V).toMatch(/supabase\.rpc\('fos_fornitori_per_ordine'\)/)
    expect(V).toMatch(/supabase\.rpc\('fos_consegne_fornitori'/)
    expect(V, 'legge ancora le tabelle: per un dipendente tornerebbero vuote')
      .not.toMatch(/from\('fornitori'\)|from\('fatture'\)/)
  })
})

describe('Il righello di questo file', () => {
  it('legge davvero i file, non stringhe vuote', () => {
    expect(leggi('src/Dashboard.jsx').length).toBeGreaterThan(50000)
    expect(leggi('supabase/migrations/20260922c_il_dipendente_che_ordina_vede_solo_quello_che_serve.sql').length).toBeGreaterThan(1000)
  })

  it('e una frase inventata non si trova', () => {
    expect(leggi('src/Dashboard.jsx')).not.toMatch(/questa riga non esiste nel Dashboard/)
  })
})
