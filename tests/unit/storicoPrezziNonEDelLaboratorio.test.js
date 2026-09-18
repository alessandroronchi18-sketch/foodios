// ── L'elenco delle chiavi riservate non si riscrive a memoria ─────────────
//
// 18/09/2026. Questo file nasce da un errore mio, e il racconto vale più del
// codice che protegge.
//
// Un audit aveva segnalato che `pasticceria-log-prezzi-v1` — lo storico dei
// cambi di prezzo, con dentro chi li ha fatti — non fosse fra le chiavi
// riservate al titolare. Ho scritto la correzione copiando l'elenco dalla
// migrazione che definiva la funzione **la prima volta** (`20260607`) invece
// che dall'ultima che l'aveva riscritta (`20260914e`).
//
// Due errori in uno:
//   1. la segnalazione era infondata — quella chiave era riservata dal 14/09;
//   2. riscrivendo la funzione con l'elenco vecchio ho TOLTO tre chiavi
//      aggiunte nel frattempo (ricettario, giornaliero, semilavorati), cioè
//      ho aperto al laboratorio il ricettario e la produzione. In produzione.
//
// La lezione: `create or replace` su una funzione che elenca delle cose non
// aggiunge, **sostituisce**. E un audit che dice «manca X» va verificato
// prima di agire.
//
// Il danno l'ha visto `dipendenteNonCancellaStorico.test.js`, che confronta
// gli elenchi delle due funzioni: si è messo in rosso da solo. Questo file
// aggiunge la rete che mancava — che l'elenco non si accorci mai.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { globSync } from 'glob'

/** Le chiavi elencate dall'ULTIMA migrazione che riscrive la funzione. */
function chiaviRiservate() {
  const file = globSync('supabase/migrations/*.sql')
    .filter(f => /create or replace function public\.is_chiave_sensibile/.test(fs.readFileSync(f, 'utf8')))
    .sort()
    .pop()
  const sql = fs.readFileSync(file, 'utf8')
  const blocco = sql.slice(sql.lastIndexOf('create or replace function public.is_chiave_sensibile'))
  return { file, chiavi: new Set([...blocco.matchAll(/'([a-z0-9-]+-v1)'/g)].map(m => m[1])) }
}

describe('L’elenco delle chiavi riservate non si accorcia', () => {
  const { file, chiavi } = chiaviRiservate()

  it('ci sono tutte quelle che ci devono essere', () => {
    // Ognuna di queste è stata aggiunta per un motivo, e riscrivere la
    // funzione senza copiarle tutte le toglie in silenzio: è successo.
    for (const k of [
      'pasticceria-ai-v1',
      'pasticceria-actions-v1',
      'pasticceria-eventi-v1',
      'azienda-pagamenti-v1',
      'pasticceria-organigramma-v1',
      'pasticceria-consuntivo-turni-v1',
      'pl-costi-fissi-v1',
      'pasticceria-ricettario-v1',
      'pasticceria-giornaliero-v1',
      'pasticceria-semilavorati-v1',
      'pasticceria-log-prezzi-v1',
    ]) {
      expect(chiavi.has(k), `${k} non è più riservata (ultima migrazione: ${file})`).toBe(true)
    }
  })

  it('e non ne sono mai meno di undici', () => {
    // Il conto nudo: se qualcuno riscrive la funzione copiando una versione
    // vecchia, questo scatta anche per una chiave che oggi non esiste ancora.
    expect(chiavi.size, `ultima migrazione: ${file}`).toBeGreaterThanOrEqual(11)
  })

  it('il magazzino resta leggibile: al dipendente serve per lavorare', () => {
    // Le chiavi operative NON vanno riservate: chiuderle vorrebbe dire un
    // dipendente che non può fare il suo lavoro.
    expect(chiavi.has('pasticceria-magazzino-v1')).toBe(false)
  })
})

describe('Il programma non chiede quello che non gli spetta', () => {
  const DASH = fs.readFileSync('src/Dashboard.jsx', 'utf8')

  it('il dipendente non chiede lo storico dei prezzi', () => {
    // La protezione vera è quella sul database; questo evita solo una
    // chiamata destinata a tornare vuota a ogni apertura.
    expect(DASH).toMatch(/isDip \? Promise\.resolve\(\[\]\) : sload\(SK_LOG_PRZ\)/)
  })

  it('al titolare non si toglie niente', () => {
    expect(DASH).toContain('sload(SK_LOG_PRZ)')
  })
})
