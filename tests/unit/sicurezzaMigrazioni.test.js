// Le correzioni di sicurezza del 14/09/2026 devono restare nel codice.
//
// Le verifiche sul database vero le fa `scripts/audit-sicurezza.mjs` (nove
// controlli) e le prove d'attacco `tests/12-sicurezza-chiave-pubblica.spec.js`.
// Questo test guarda una cosa diversa e complementare: che le migration che
// chiudono i buchi siano ancora nel repository e dicano quello che devono dire.
// Serve perché un database si può ricreare da zero (ambiente nuovo, ripristino,
// un altro cliente): se la migration sparisce, il buco torna.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RADICE, 'supabase', 'migrations')
const tutte = readdirSync(DIR).filter(f => f.endsWith('.sql'))
const testo = (nome) => readFileSync(join(DIR, tutte.find(f => f.includes(nome))), 'utf8')

describe('le funzioni interne non sono chiamabili con la chiave pubblica', () => {
  const sql = () => testo('chiudi_funzioni_pubbliche')

  it('il permesso è tolto a PUBLIC, non solo ad anon', () => {
    // È il punto che era costato un giro a vuoto: in Postgres una funzione
    // nasce con EXECUTE concesso a PUBLIC, e `anon` lo eredita da lì. Togliere
    // il permesso ad `anon` senza toglierlo a PUBLIC non cambia niente.
    const s = sql()
    for (const f of ['fos_user_data_set_batch', 'applica_delta_stock_pf', 'cleanup_audit_log', 'rate_limit_increment', 'increment_discount_redemption']) {
      const righe = s.split('\n').filter(r => r.includes(f) && r.trim().startsWith('revoke'))
      expect(righe.length, `manca la revoca per ${f}`).toBeGreaterThan(0)
      expect(righe.some(r => /from\s+public/.test(r)), `${f}: revocato ad anon ma non a PUBLIC`).toBe(true)
    }
  })

  it('la scrittura dei dati di lavoro resta all\'utente loggato', () => {
    // Dentro la funzione, per un utente loggato l'organizzazione si deduce da
    // lui e non dal parametro: quel percorso è sicuro e deve continuare a
    // funzionare, altrimenti l'app non salva più niente.
    expect(sql()).toMatch(/grant execute on function public\.fos_user_data_set_batch\(jsonb, uuid\) to authenticated, service_role/)
  })
})

describe('i trasferimenti controllano chi chiama', () => {
  it('tutte le versioni alzano un\'eccezione se non c\'è un\'organizzazione', () => {
    const s = testo('trasferimenti_guardia_org')
    // Sei versioni fra invia, ricevi e annulla.
    const guardie = (s.match(/get_user_org_id\(\) is null then raise exception/g) || []).length
    expect(guardie).toBe(6)
  })

  it('la guardia sta in cima, prima di cercare la riga', () => {
    // Così un estraneo non può nemmeno usare le risposte per capire se un id
    // esiste ("non trovato" vs "non tuo").
    const s = testo('trasferimenti_guardia_org')
    for (const blocco of s.split('CREATE OR REPLACE FUNCTION').slice(1)) {
      const guardia = blocco.indexOf('get_user_org_id() is null then raise')
      const cerca = blocco.indexOf('select * into v_t')
      if (cerca > -1) expect(guardia, 'la guardia viene dopo la ricerca').toBeLessThan(cerca)
    }
  })
})

describe('lo stato commerciale non lo scrive il cliente', () => {
  it('su organizations il permesso è per colonna, e le colonne dell\'abbonamento restano fuori', () => {
    const s = testo('organizations_colonne_protette')
    expect(s).toMatch(/revoke update on public\.organizations from authenticated/)
    const concesse = s.slice(s.indexOf('grant update ('), s.indexOf(') on public.organizations'))
    for (const vietata of ['approvato', 'trial_ends_at', 'piano', 'mesi_bonus', 'attivo', 'stripe_', 'note_admin', 'deleted_at']) {
      expect(concesse.includes(vietata), `${vietata} non deve essere scrivibile dal cliente`).toBe(false)
    }
    // E quelle che servono davvero ci sono.
    for (const ok of ['nome', 'metodo_produzione', 'telefono_whatsapp', 'partita_iva']) {
      expect(concesse).toContain(ok)
    }
  })

  it('sul profilo si cambia solo il nome', () => {
    const s = testo('profiles_colonne_protette')
    expect(s).toMatch(/revoke update on public\.profiles from authenticated/)
    expect(s).toMatch(/grant update \(nome_completo\) on public\.profiles to authenticated/)
  })
})

describe('le altre chiusure', () => {
  it('il bucket delle foto è privato e la lettura è legata alla cartella dell\'utente', () => {
    const s = testo('bucket_foto_privato')
    expect(s).toMatch(/update storage\.buckets set public = false/)
    expect(s).toMatch(/auth\.uid\(\)\)::text = \(storage\.foldername\(name\)\)\[1\]/)
  })

  it('lo storico dei prezzi d\'acquisto è fra le chiavi che il dipendente non legge', () => {
    const s = testo('log_prezzi_sensibile')
    expect(s).toContain("'pasticceria-log-prezzi-v1'")
    // E quelle che c'erano prima non si perdono per strada.
    for (const k of ['pasticceria-ricettario-v1', 'pasticceria-giornaliero-v1', 'pasticceria-semilavorati-v1', 'azienda-pagamenti-v1']) {
      expect(s, `chiave persa: ${k}`).toContain(k)
    }
  })

  it('TRUNCATE non è concesso ai ruoli pubblici, nemmeno sulle tabelle future', () => {
    const s = testo('revoca_truncate')
    expect(s).toMatch(/revoke truncate[^;]*from anon, authenticated/)
    expect(s).toMatch(/alter default privileges[^;]*revoke truncate[^;]*from anon, authenticated/)
  })
})
