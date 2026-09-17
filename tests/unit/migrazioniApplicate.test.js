// ── Le migrazioni scritte sono davvero nel database? ───────────────────
//
// Difetto vero, 16/09/2026, trovato entrando in produzione con l'account del
// titolare: la prima schermata era la procedura di benvenuto — quella del
// primo accesso — a un'attività che usa Foodos da mesi, con 3.104 fatture
// caricate.
//
// La catena:
//   1. `src/App.jsx` decide se mostrarla leggendo
//      `organizations.onboarding_completato_at`.
//   2. Quella colonna nel database non esisteva.
//   3. La migrazione che la crea (`20260709_onboarding_completed.sql`) era
//      nel repo dal 09/07/2026 — due mesi — mai applicata.
//   4. La scrittura del flag stava in un `try/catch` silenzioso: falliva
//      ogni volta senza dire niente.
//   5. L'unica cosa che nascondeva la procedura era il localStorage: cambio
//      dispositivo o finestra privata, e ricompariva.
//
// Il bello è che il commento di quella migrazione descrive esattamente questo
// problema e dice di volerlo risolvere. Non l'ha risolto perché nessuno
// l'ha applicata.
//
// Nessuno se n'era accorto perché `migration-check.yml` scattava solo
// `on: pull_request`, e qui si pubblica spingendo dritto su main: non è mai
// partito. E non esiste `supabase_migrations.schema_migrations`, quindi non
// c'è traccia di cosa sia stato applicato.
//
// Correzione: colonna applicata, più `scripts/check-migrazioni-applicate.mjs`
// nel cancello pre-push. Qui si protegge la parte che può sbagliare in
// silenzio — la lettura delle migrazioni — e i collegamenti che la fanno
// girare davvero.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { oggettiPromessi } from '../../scripts/check-migrazioni-applicate.mjs'

const RADICE = join(__dirname, '..', '..')
const MIGRAZIONI = join(RADICE, 'supabase', 'migrations')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('il difetto: la colonna del benvenuto', () => {
  it('la migrazione del 09/07 promette organizations.onboarding_completato_at', () => {
    const sql = leggi('supabase', 'migrations', '20260709_onboarding_completed.sql')
    expect(oggettiPromessi(sql).colonne).toContain('organizations.onboarding_completato_at')
  })

  it('e il programma la legge davvero: se manca, la procedura ricompare', () => {
    const app = leggi('src', 'App.jsx')
    expect(app).toContain('onboarding_completato_at')
  })

  it('quindi il controllo la classificherebbe come rossa, non come innocua', () => {
    // È la regola del controllo: manca nel database E il codice la nomina.
    const nome = 'onboarding_completato_at'
    const codice = leggi('src', 'App.jsx')
    expect(codice.includes(nome)).toBe(true)
  })
})

describe('la lettura delle migrazioni riconosce le forme usate nel repo', () => {
  it('colonna aggiunta, con e senza «if not exists»', () => {
    const o = oggettiPromessi(`
      alter table public.organizations add column if not exists tizio text;
      alter table caio add column sempronio integer;
    `)
    expect(o.colonne).toEqual(['organizations.tizio', 'caio.sempronio'])
  })

  it('tabella e funzione, anche con «or replace»', () => {
    const o = oggettiPromessi(`
      create table if not exists public.prova (id uuid);
      create or replace function public.fa_qualcosa(p_id uuid) returns void as $$ begin end $$;
    `)
    expect(o.tabelle).toContain('prova')
    expect(o.funzioni).toContain('fa_qualcosa')
  })

  it('quello che è commentato NON conta', () => {
    // Se contasse, il controllo segnalerebbe per sempre oggetti mai voluti,
    // diventerebbe rumore e finirebbe ignorato — la fine che ha fatto il
    // cricchetto della copertura.
    const o = oggettiPromessi(`
      -- alter table public.organizations add column if not exists mai_voluta text;
      /* create table public.nemmeno_questa (id uuid); */
      alter table public.organizations add column if not exists questa_si text;
    `)
    expect(o.colonne).toEqual(['organizations.questa_si'])
    expect(o.tabelle).toEqual([])
  })

  it('i nomi fra virgolette e il prefisso public. si normalizzano', () => {
    const o = oggettiPromessi('alter table public."organizations" add column if not exists "strana" text;')
    expect(o.colonne).toEqual(['organizations.strana'])
  })

  it('tutte le migrazioni del repo si leggono senza esplodere', () => {
    const file = readdirSync(MIGRAZIONI).filter(n => n.endsWith('.sql'))
    expect(file.length).toBeGreaterThan(100)
    for (const f of file) {
      expect(() => oggettiPromessi(readFileSync(join(MIGRAZIONI, f), 'utf8')), f).not.toThrow()
    }
  })
})

describe('il controllo è agganciato dove si pubblica davvero', () => {
  it('sta nel cancello pre-push, che è la porta che si usa', () => {
    const hook = leggi('scripts', 'install-hooks.sh')
    expect(hook).toContain('check-migrazioni-applicate.mjs')
  })

  it('e il workflow non guarda più solo le pull request', () => {
    // La causa per cui il difetto è passato: qui si spinge dritto su main.
    const wf = leggi('.github', 'workflows', 'migration-check.yml')
    expect(wf).toMatch(/push:\s*\n\s*branches:\s*\[main\]/)
  })
})

// ── 16/09/2026, audit del righello: il controllo si spegneva da solo ──────
//
// `scripts/check-migrazioni-applicate.mjs` gira dentro il cancello pre-push.
// Aveva `try { ...interroga il database... } catch { return 0 }`, e il
// messaggio del `catch` era lo stesso del caso «non ho le credenziali»:
// «controllo saltato». Due situazioni molto diverse raccontate uguale.
//
// Riproduzione: `SUPABASE_DB_URL` puntato su una porta chiusa →
// «• migrazioni: controllo saltato (database non raggiungibile da qui).»,
// uscita **0**. Cioè: una password scaduta nel file delle credenziali
// spegneva questo passo del cancello per sempre, in silenzio — e proprio
// questo controllo esiste perché una migrazione saltata non lascia traccia
// da nessuna parte.
//
// È lo stesso schema del 14/09: l'esito mangiato per strada, il cancello che
// dice di sì.
describe('un database che non risponde non è un via libera', () => {
  const S = leggi('scripts', 'check-migrazioni-applicate.mjs')

  it('senza credenziali salta, e va bene: in CI e su una macchina nuova non ci sono', () => {
    expect(S).toContain('nessuna credenziale database disponibile qui')
    expect(S).toMatch(/if \(!url\) \{[\s\S]{0,200}return 0/)
  })

  it('ma con le credenziali e il database muto, fallisce forte', () => {
    // Il difetto era esattamente `catch { ... return 0 }` su questo blocco.
    expect(S).not.toMatch(/\} catch \{\s*\n\s*console\.log\('• migrazioni: controllo saltato \(database non raggiungibile/)
    expect(S).toContain('le credenziali del database ci sono, ma non risponde')
    expect(S).toContain('Il controllo NON è stato fatto: non è un via libera')
  })

  it('e non scrive la password nel terminale mentre lo dice', () => {
    // La riga di `execFileSync` contiene l'URL intero: stamparla la
    // copierebbe nel registro del terminale e nei log della CI.
    expect(S).toMatch(/replace\(\/\(postgres/)
    expect(S).toContain('••••@')
  })
})
