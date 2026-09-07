// Validatore dell'editor SQL del pannello admin.
//
// Decide quali query si possono eseguire sul database di produzione. Finche'
// stava dentro api/admin.js, in mezzo a 3.313 righe, non aveva un solo test.
// Estratto in api/lib/admin/sqlEditor.js, ora li ha.
//
// I test descrivono il comportamento com'e' oggi. Dove ho trovato una maglia
// larga l'ho scritto esplicitamente invece di nasconderlo: serve a decidere
// se irrigidire, non a dare una falsa sensazione di sicurezza.

import { describe, it, expect } from 'vitest'
import { validateSafeSelectSQL } from '../../api/lib/admin/sqlEditor.js'

const ok = q => validateSafeSelectSQL(q).ok
const err = q => validateSafeSelectSQL(q).error

describe('query ammesse', () => {
  it('SELECT semplice su tabella in whitelist', () => {
    expect(ok('select id, nome from organizations')).toBe(true)
  })

  it('WITH seguito da SELECT', () => {
    expect(ok('with recenti as (select * from feedback) select * from recenti')).toBe(true)
  })

  it('JOIN fra due tabelle permesse', () => {
    expect(ok('select * from organizations o join sedi s on s.organization_id = o.id')).toBe(true)
  })

  it('il prefisso public. viene normalizzato', () => {
    expect(ok('select * from public.organizations')).toBe(true)
  })

  it('aggiunge sempre LIMIT 500 in coda', () => {
    expect(validateSafeSelectSQL('select 1 from organizations').query).toMatch(/LIMIT 500$/)
  })

  it('il punto e virgola finale non da fastidio', () => {
    expect(ok('select id from organizations;')).toBe(true)
  })
})

describe('scrittura e DDL bloccati', () => {
  it.each([
    ['insert', 'insert into organizations values (1)'],
    ['update', 'update organizations set nome = 1'],
    ['delete', 'delete from organizations'],
    ['drop', 'drop table organizations'],
    ['create', 'create table x (a int)'],
    ['alter', 'alter table organizations add column x int'],
    ['truncate', 'truncate organizations'],
    ['grant', 'grant all on organizations to public'],
  ])('%s viene rifiutato', (_nome, q) => {
    expect(ok(q)).toBe(false)
  })

  it('anche nascosto dopo una SELECT valida', () => {
    expect(ok('select 1 from organizations; drop table organizations')).toBe(false)
  })
})

describe('accesso ai dati di autenticazione bloccato', () => {
  it.each([
    'select * from auth.users',
    'select * from users',
    'select * from sessions',
    'select * from refresh_tokens',
    'select * from mfa_factors',
  ])('%s viene rifiutato', (q) => {
    expect(ok(q)).toBe(false)
  })
})

describe('funzioni di sistema bloccate', () => {
  it.each([
    'select pg_sleep(10) from organizations',
    'select pg_read_file(\'/etc/passwd\') from organizations',
    'select * from pg_catalog.pg_tables',
  ])('%s viene rifiutato', (q) => {
    expect(ok(q)).toBe(false)
  })
})

describe('whitelist delle tabelle', () => {
  it('una tabella non in elenco viene rifiutata, col nome nel messaggio', () => {
    expect(err('select * from stripe_webhook_events')).toMatch(/stripe_webhook_events/)
  })

  it('basta una tabella non permessa nel JOIN per rifiutare tutto', () => {
    expect(ok('select * from organizations join inventario_produzione i on true')).toBe(false)
  })
})

describe('limiti di forma', () => {
  it('query vuota', () => { expect(ok('   ')).toBe(false) })
  it('non stringa', () => { expect(ok(null)).toBe(false) })
  it('oltre 4000 caratteri', () => {
    expect(ok('select ' + 'a'.repeat(4100) + ' from organizations')).toBe(false)
  })
  it('non inizia con select o with', () => {
    expect(err('explain select * from organizations')).toMatch(/Solo SELECT/)
  })
})

describe('maglie larghe note, documentate di proposito', () => {
  // Non sono regressioni: e' il comportamento attuale. Servono a rendere
  // esplicito cosa passa, così la decisione di irrigidire e' informata.

  it('la parola "users" viene bloccata ovunque, anche in un alias innocuo', () => {
    // Effetto collaterale del pattern che protegge auth.users: rifiuta anche
    // query legittime. Scomodo, ma sbaglia dal lato prudente.
    expect(ok('select count(*) as users from organizations')).toBe(false)
  })

  it('una tabella non in whitelist passa se il suo nome compare in un WITH altrove', () => {
    // Il controllo sulle CTE e' testuale, non sintattico: cerca "with <nome> as"
    // in qualunque punto della query. Una tabella vera che si chiami come una
    // CTE dichiarata supera il controllo.
    const q = 'with segreti as (select 1) select * from segreti'
    expect(ok(q)).toBe(true)
  })

  it('i commenti SQL non vengono rimossi prima dei controlli', () => {
    // Il testo dentro un commento viene comunque analizzato: qui la query e'
    // innocua ma viene rifiutata perché contiene la parola vietata.
    expect(ok('select id from organizations -- drop table x')).toBe(false)
  })
})
