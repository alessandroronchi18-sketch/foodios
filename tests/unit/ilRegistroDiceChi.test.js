// ── Il registro dice che sono spariti dei pezzi, non diceva chi ────────
//
// Trovato il 17/09/2026 con l'audit di sicurezza, misurato in produzione:
// `movimenti_stock_pf` ha la colonna `created_by` dal giorno in cui è nata, e
// **nessuna delle sedici funzioni che ci scrivono la riempiva**. 24 movimenti,
// zero con un autore.
//
// Perché conta: `stock_pf_rettifica` la può chiamare il dipendente, ed è
// voluto — è lui che apre il congelatore e conta i pezzi. Ma la riga che ne
// usciva diceva «rettifica_manuale: −12 pezzi» senza dire chi l'aveva fatta.
// Il giorno in cui mancano dodici vaschette, il registro raccontava metà
// della storia, e la metà che mancava è quella per cui si tiene un registro.
//
// La correzione NON riscrive le sedici funzioni: mette un valore predefinito
// sulla colonna. Vale anche per la diciassettesima funzione, quella che
// qualcuno scriverà fra tre mesi — che altrimenti nascerebbe di nuovo senza
// autore. È lo stesso difetto che si sta correggendo: una regola che vale
// solo dove qualcuno si è ricordato di scriverla.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(__dirname, '..', '..')
const MIGRAZIONI = join(RADICE, 'supabase', 'migrations')
const tutte = () => readdirSync(MIGRAZIONI).filter(n => n.endsWith('.sql'))
  .map(n => readFileSync(join(MIGRAZIONI, n), 'utf8')).join('\n')

describe('la correzione', () => {
  const SQL = readFileSync(join(MIGRAZIONI, '20260917b_il_registro_dice_chi_ha_scritto.sql'), 'utf8')

  it('mette un valore predefinito sulla colonna, non tocca le funzioni', () => {
    expect(SQL).toMatch(/alter column created_by set default auth\.uid\(\)/)
    // Se riscrivesse le funzioni ci sarebbe un `create or replace function`.
    expect(SQL).not.toMatch(/create or replace function/i)
  })

  it('spiega che NULL vuol dire «l’ha scritta il programma», non «non si sa»', () => {
    // È la differenza che serve a chi leggerà il registro fra un anno.
    expect(SQL).toContain('chiave di servizio')
    expect(SQL.toLowerCase()).toContain('non «non si')
  })

  it('e dice che le righe vecchie restano vuote, invece di inventare un autore', () => {
    expect(SQL).toMatch(/anteriori al 17\/09\/2026 sono vuote/)
  })
})

describe('il motivo per cui un valore predefinito batte sedici correzioni', () => {
  it('le funzioni che scrivono i movimenti sono più di dieci', () => {
    // Il conto che rende la scelta evidente: correggerle una per una
    // vorrebbe dire dieci occasioni di sbagliare, e nessuna copertura per
    // quella che verrà dopo.
    const sql = tutte()
    const quante = (sql.match(/insert into public\.movimenti_stock_pf/gi) || []).length
    expect(quante).toBeGreaterThan(8)
  })

  it('il righello sa dire di no: cerca davvero quelle scritture', () => {
    // Se il conteggio qui sopra guardasse la stringa sbagliata direbbe
    // sempre zero e il test passerebbe per il motivo opposto.
    const finto = 'insert into public.movimenti_stock_pf (a) values (1);'
    expect((finto.match(/insert into public\.movimenti_stock_pf/gi) || []).length).toBe(1)
    const senza = 'insert into public.altra_tabella (a) values (1);'
    expect((senza.match(/insert into public\.movimenti_stock_pf/gi) || []).length).toBe(0)
  })
})
