// ── Un trasferimento non diceva chi ────────────────────────────────────
//
// Richiesta del titolare, 17/09/2026: «nei trasferimenti dammi la possibilità
// anche di segnare chi trasferisce cosa».
//
// È lo stesso difetto corretto lo stesso giorno sui movimenti di magazzino, e
// qui è più grave: un trasferimento ha DUE momenti e DUE persone — chi carica
// il furgone e chi firma l'arrivo. Le funzioni scrivevano `data_invio` e
// `data_ricezione`, cioè QUANDO, e non scrivevano da nessuna parte CHI.
//
// ── La correzione dentro la correzione ─────────────────────────────────
//
// La prima passata ha aggiornato la funzione sbagliata. Le funzioni esistono
// in due versioni — `(p_id)` e `(p_id, p_dipendente_op)` — e il prodotto
// chiama la seconda (`src/lib/trasferimenti.js:94` e `:103`). Una migrazione
// applicata e inutile: il difetto sarebbe rimasto intero, con la soddisfazione
// di averlo corretto.
//
// Questo test esiste soprattutto per quello: pretende che TUTTE le versioni
// registrino il chi, non una qualsiasi.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations',
  '20260917d_chi_manda_e_chi_riceve.sql'), 'utf8')
const WRAPPER = readFileSync(join(__dirname, '..', '..', 'src', 'lib', 'trasferimenti.js'), 'utf8')

describe('le colonne per i due momenti', () => {
  it('chi manda e chi riceve sono due colonne, non una', () => {
    // `dipendente_operativo_id` è una sola: col `coalesce` chi manda resta e
    // chi riceve si perde. È il motivo per cui ne servono altre.
    expect(SQL).toMatch(/add column if not exists inviato_da uuid/)
    expect(SQL).toMatch(/add column if not exists ricevuto_da uuid/)
  })

  it('e si distingue il tablet dalla persona', () => {
    // Sul tablet condiviso `auth.uid()` dice quale tablet, `p_dipendente_op`
    // dice chi. Per capire chi ha contato otto vaschette invece di dieci
    // serve il nome, non il tablet.
    expect(SQL).toMatch(/add column if not exists inviato_da_dip uuid/)
    expect(SQL).toMatch(/add column if not exists ricevuto_da_dip uuid/)
  })

  it('chi crea il trasferimento si riempie da sé', () => {
    expect(SQL).toMatch(/alter column created_by set default auth\.uid\(\)/)
  })
})

describe('la versione che il prodotto chiama davvero', () => {
  it('il prodotto passa sempre p_dipendente_op', () => {
    // È il fatto che rende sbagliata la prima passata della migrazione.
    expect(WRAPPER).toMatch(/trasferimento_invia[\s\S]{0,120}p_dipendente_op/)
    expect(WRAPPER).toMatch(/trasferimento_ricevi[\s\S]{0,200}p_dipendente_op/)
  })

  it('quindi la migrazione aggiorna ANCHE quella versione', () => {
    // Due `create or replace` per funzione: la versione corta e quella con
    // l'operatore. Se qualcuno ne togliesse una, qui si vede.
    const invii = (SQL.match(/FUNCTION public\.trasferimento_invia/g) || []).length
    const ricezioni = (SQL.match(/FUNCTION public\.trasferimento_ricevi/g) || []).length
    expect(invii, 'entrambe le versioni di invia').toBeGreaterThanOrEqual(2)
    expect(ricezioni, 'entrambe le versioni di ricevi').toBeGreaterThanOrEqual(2)
  })

  it('e scrive il chi in tutte e due', () => {
    expect((SQL.match(/inviato_da = coalesce\(inviato_da, auth\.uid\(\)\)/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((SQL.match(/ricevuto_da = coalesce\(ricevuto_da, auth\.uid\(\)\)/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('il primo nome non si sovrascrive', () => {
  it('si usa coalesce, non un’assegnazione secca', () => {
    // Se un giorno si potrà correggere un trasferimento già inviato, chi
    // l'ha mandato per primo non deve sparire perché qualcuno lo ritocca.
    expect(SQL).not.toMatch(/inviato_da = auth\.uid\(\)[^)]/)
    expect(SQL).toMatch(/inviato_da_dip = coalesce\(inviato_da_dip, p_dipendente_op\)/)
  })

  it('e NULL vuol dire «l’ha fatto il programma», scritto nel commento', () => {
    expect(SQL).toContain("l''ha fatto il programma")
  })
})
