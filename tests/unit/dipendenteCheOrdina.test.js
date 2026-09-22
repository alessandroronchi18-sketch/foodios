// ── «Alcuni dipendenti possono ordinare» ─────────────────────────────────
//
// Richiesta del titolare, 22/09/2026: «bisogna istituire la possibilità ad
// alcuni dipendenti di poter ordinare».
//
// ── Il punto di partenza ─────────────────────────────────────────────────
//
// Fino a oggi NESSUN dipendente poteva leggere né scrivere
// `ordini_fornitori`/`righe_ordine`: 20260607_dipendente_no_lettura_sensibili.sql
// aveva messo `fatture, fornitori, ordini_fornitori, vendite_b2b, clienti_b2b,
// audit_log` nello stesso sacco, tutte con `not is_dipendente()`. Va bene per
// fatture e conti, ma un dipendente di laboratorio che deve rifare la scorta
// di farina doveva fermarsi e chiamare il titolare per ogni sacco.
//
// La correzione (20260922b_alcuni_dipendenti_possono_ordinare.sql) apre UNA
// porta sola — un flag `profiles.puo_ordinare`, acceso a mano dal titolare —
// e la apre SOLO per `ordini_fornitori`/`righe_ordine`. Le altre cinque
// tabelle di quel sacco restano come prima.
//
// Il punto delicato non è la porta in più: è che non si apra da sola. Un
// dipendente che potesse accendere il proprio `puo_ordinare` renderebbe
// inutile la migration del 07/06 — vedi il blocco "Il flag non si dà da
// solo" più sotto, che è la parte che conta di più in questo file.
//
// ── Cosa prova questo file ────────────────────────────────────────────────
//
// Che la regola resti **scritta nella migrazione** (un database si ricrea da
// zero, e se la migrazione sparisce il buco torna), sul modello di
// `mailGiaInUsoSiDeveSapere.test.js`.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RADICE, 'supabase', 'migrations')
const FILE = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const TUTTE = FILE.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n')

/** Il corpo dell'ultima definizione di una funzione, fra tutte le migrazioni. */
function corpoUltimo(nome) {
  let ultimo = null
  for (const f of FILE) {
    const sql = readFileSync(join(DIR, f), 'utf8')
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nome}\\s*\\(`, 'gi')
    let m
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index)
      const tag = resto.match(/\bas\s+(\$[a-z_]*\$)/i)
      if (!tag) continue
      const apre = resto.indexOf(tag[1]) + tag[1].length
      const chiude = resto.indexOf(tag[1], apre)
      ultimo = resto.slice(apre, chiude === -1 ? undefined : chiude).replace(/--[^\n]*/g, '')
    }
  }
  return ultimo
}

/**
 * Tutti i blocchi "create policy ... on public.<tabella> ... ;" di TUTTE le
 * migrazioni, concatenati. Le policy di questo progetto sono espressioni
 * booleane senza mai un punto e virgola dentro: il primo ";" dopo
 * "create policy" chiude sempre lo statement, anche quando la policy sta
 * dentro una stringa passata a `execute` (come in 20260514_rls_completo.sql
 * per `fatture`). Le policy costruite con `execute format(...)` e il nome
 * tabella come parametro dinamico (il loop di 20260607) non hanno il nome
 * della tabella scritto qui in chiaro: per quelle il test si accontenta
 * dell'assenza di `puo_ordinare`, che è comunque garantita.
 */
function policyBlocchi(tabella) {
  const re = new RegExp(`create policy[^;]*on public\\.${tabella}\\b[^;]*;`, 'gis')
  return (TUTTE.match(re) || []).join('\n')
}

describe('Il flag puo_ordinare esiste ed è spento di default', () => {
  it('la colonna c\'è, non nulla, di default false', () => {
    expect(TUTTE, 'la colonna non c\'è: un database ricreato da zero non avrebbe il permesso').toMatch(
      /add column if not exists puo_ordinare boolean not null default false/i
    )
  })

  it('la funzione public.puo_ordinare() esiste nelle migrazioni', () => {
    const corpo = corpoUltimo('puo_ordinare')
    expect(corpo, 'la funzione non c\'è: nessuna policy potrebbe usarla').toBeTruthy()
  })

  it('legge la colonna e non risponde NULL quando il profilo non si trova', () => {
    // Un NULL dentro un "or" di policy (`not is_dipendente() or puo_ordinare()`)
    // si comporta in modo ambiguo: la funzione deve rispondere "no", non "boh".
    const corpo = corpoUltimo('puo_ordinare')
    expect(corpo).toMatch(/puo_ordinare/)
    expect(corpo).toMatch(/coalesce/i)
    expect(corpo).toMatch(/false/i)
  })
})

describe('Il permesso è SOLO per gli ordini, non un varco generale', () => {
  it('ordini_fornitori nomina puo_ordinare nella sua policy', () => {
    const blocco = policyBlocchi('ordini_fornitori')
    expect(blocco, 'nessuna policy con puo_ordinare trovata per ordini_fornitori').toMatch(/puo_ordinare/)
  })

  it('righe_ordine nomina puo_ordinare nella sua policy — non basta l\'effetto transitivo', () => {
    // righe_ordine non ha organization_id: la sua regola passa da una subquery
    // su ordini_fornitori. Aprire SOLO ordini_fornitori funzionerebbe anche a
    // catena, ma la regola deve stare scritta qui, non solo dedotta.
    const blocco = policyBlocchi('righe_ordine')
    expect(blocco, 'nessuna policy con puo_ordinare trovata per righe_ordine').toMatch(/puo_ordinare/)
  })

  it.each([
    ['fatture', 'lo scadenzario fornitori resta riservato al titolare'],
    ['fornitori', 'l\'anagrafica (condizioni, margini) resta riservata al titolare'],
    ['clienti_b2b', 'i clienti B2B non c\'entrano con gli ordini ai fornitori'],
    ['vendite_b2b', 'le vendite B2B non c\'entrano con gli ordini ai fornitori'],
    ['audit_log', 'il registro attività resta riservato al titolare'],
  ])('%s NON nomina puo_ordinare: %s', (tabella) => {
    const blocco = policyBlocchi(tabella)
    expect(blocco).not.toMatch(/puo_ordinare/)
  })
})

describe('Il flag non si dà da solo (il punto di sicurezza del lavoro)', () => {
  it('il titolare può scriverlo: il grant di colonna esiste', () => {
    // Senza questo grant, 20260914g_profiles_colonne_protette.sql (che limita
    // l'update diretto a "nome_completo") impedirebbe la scrittura a
    // CHIUNQUE, titolare compreso: l'interruttore in Personale.jsx fallirebbe
    // sempre, in silenzio o con un errore di permesso.
    expect(TUTTE).toMatch(/grant update\s*\(\s*puo_ordinare\s*\)\s*on public\.profiles to authenticated/i)
  })

  it('un dipendente non può cambiarlo — né su di sé né su un collega', () => {
    // guard_profile_escalation blocca ruolo/approvato per un DIPENDENTE
    // attore (non guarda di chi è la riga, guarda CHI SCRIVE): deve bloccare
    // anche puo_ordinare, con la stessa logica.
    const corpo = corpoUltimo('guard_profile_escalation')
    expect(corpo, 'la guardia non c\'è più: un database ricreato da zero non la avrebbe').toBeTruthy()
    expect(corpo).toMatch(/is_dipendente\(\)/)
    expect(corpo).toMatch(/puo_ordinare/)
  })
})

describe('Il righello di questo file', () => {
  it('saprebbe accorgersi se la funzione sparisse', () => {
    // Taratura: la stessa ricerca su un nome inventato non trova niente.
    // Senza questa prova, un errore di battitura nel nome renderebbe verdi
    // tutte le prove qui sopra per sempre.
    expect(corpoUltimo('funzione_che_non_esiste_mai')).toBe(null)
  })

  it('saprebbe accorgersi se una policy inventata "esistesse"', () => {
    expect(policyBlocchi('tabella_che_non_esiste_mai')).toBe('')
  })

  it('e legge davvero le migrazioni, non una cartella vuota', () => {
    expect(FILE.length).toBeGreaterThan(20)
  })
})
