// ── La stessa fattura entra una volta sola ──────────────────────────────
//
// Il titolare, 23/09/2026: «controlla che se carico delle fatture uguali
// nella pagina fornitori/scadenzario non rimangono due uguali ma ne rimane
// solo una».
//
// Fino a oggi la difesa era tutta nel browser: `chiaviFattureEsistenti` legge
// cosa c'è già e `dedupFatture` lo scarta. Due import dello stesso file nello
// stesso momento (due persone, due schede, telefono e computer) leggevano
// entrambi l'elenco prima che l'altro scrivesse, e passavano entrambi.
//
// Dal 23/09 il database ha l'indice unico `fatture_una_sola_volta` (migration
// 20260923c), provato in produzione: una copia con minuscole e spazi diversi
// viene rifiutata con codice 23505. Quel rifiuto però fa cadere l'intero
// blocco da cento righe per colpa di una sola: `insertFattureResilient` deve
// allora riprovare riga per riga, far entrare le buone e contare le doppie.
//
// Il finto database qui sotto applica la stessa chiave dell'indice vero.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { insertFattureResilient, eDoppione, fatturaKey, dedupFatture } from '../../src/lib/fattureImport.js'

const ORG = 'org-1'

// La chiave dell'indice: org + numero + fornitore + data, senza spazi ai
// bordi e senza differenza fra maiuscole e minuscole.
const chiaveDb = r => [
  r.organization_id,
  String(r.numero_rif ?? '').trim().toUpperCase(),
  String(r.fornitore ?? '').trim().toUpperCase(),
  r.data_fattura ?? '1900-01-01',
].join('|')

// Il messaggio che Postgres manda davvero (copiato dalla prova in prod).
const ERRORE_DOPPIO = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "fatture_una_sola_volta"',
}

function fintoDb({ colonneMancanti = [], altroErrore = null } = {}) {
  const righe = []
  const chiamate = []
  const supabase = {
    from: () => ({
      insert: async (batch) => {
        chiamate.push(batch.length)
        if (altroErrore) return { error: altroErrore }
        for (const r of batch) {
          const manca = colonneMancanti.find(c => c in r)
          if (manca) return { error: { code: 'PGRST204', message: `Could not find the '${manca}' column` } }
        }
        // Come Postgres: il blocco è tutto o niente.
        const viste = new Set(righe.map(chiaveDb))
        for (const r of batch) {
          const k = chiaveDb(r)
          if (viste.has(k)) return { error: ERRORE_DOPPIO }
          viste.add(k)
        }
        righe.push(...batch)
        return { error: null }
      },
    }),
  }
  return { supabase, righe, chiamate }
}

const fattura = (n, extra = {}) => ({
  organization_id: ORG, sede_id: 's1',
  numero_rif: String(n), fornitore: 'Vecchio Enrico', data_fattura: '2026-09-01',
  totale: 100, ...extra,
})

describe('insertFattureResilient: la stessa fattura non resta due volte', () => {
  it('un file senza doppioni entra tutto, in blocchi da cento', async () => {
    const db = fintoDb()
    const esito = await insertFattureResilient(db.supabase, Array.from({ length: 150 }, (_, i) => fattura(i)))
    expect(esito).toEqual({ inserite: 150, gia: 0 })
    expect(db.chiamate).toEqual([100, 50])
  })

  it('lo stesso file caricato due volte: la seconda non aggiunge niente e lo dice', async () => {
    const db = fintoDb()
    const file = Array.from({ length: 12 }, (_, i) => fattura(i))
    await insertFattureResilient(db.supabase, file)
    // La seconda volta salta apposta la difesa del browser: è il caso delle
    // due schede aperte, dove l'elenco «già presenti» era vuoto per tutte e due.
    const esito = await insertFattureResilient(db.supabase, file)
    expect(esito).toEqual({ inserite: 0, gia: 12 })
    expect(db.righe).toHaveLength(12)
  })

  it('una sola doppia in un blocco non butta via le altre novantanove', async () => {
    const db = fintoDb()
    await insertFattureResilient(db.supabase, [fattura(42)])
    const esito = await insertFattureResilient(db.supabase, Array.from({ length: 100 }, (_, i) => fattura(i)))
    expect(esito).toEqual({ inserite: 99, gia: 1 })
    expect(db.righe).toHaveLength(100)
    expect(db.righe.filter(r => r.numero_rif === '42')).toHaveLength(1)
  })

  it('maiuscole e spazi diversi sono la stessa fattura', async () => {
    const db = fintoDb()
    await insertFattureResilient(db.supabase, [fattura('FT/160')])
    const esito = await insertFattureResilient(db.supabase, [
      fattura(' ft/160 ', { fornitore: 'VECCHIO ENRICO ' }),
    ])
    expect(esito).toEqual({ inserite: 0, gia: 1 })
  })

  it('stesso numero ma fornitore o data diversi: sono due fatture vere, entrano', async () => {
    const db = fintoDb()
    const esito = await insertFattureResilient(db.supabase, [
      fattura('7'),
      fattura('7', { fornitore: 'ConoArtic' }),
      fattura('7', { data_fattura: '2026-09-02' }),
    ])
    expect(esito).toEqual({ inserite: 3, gia: 0 })
  })

  it('il ripiego sulle colonne di base conta le doppie lo stesso', async () => {
    const db = fintoDb({ colonneMancanti: ['iban'] })
    await insertFattureResilient(db.supabase, [fattura(1, { iban: 'IT00' })])
    const esito = await insertFattureResilient(db.supabase, [fattura(1, { iban: 'IT00' }), fattura(2, { iban: 'IT00' })])
    expect(esito).toEqual({ inserite: 1, gia: 1 })
    expect(db.righe).toHaveLength(2)
  })

  it('un errore che non è un doppione non viene nascosto', async () => {
    const db = fintoDb({ altroErrore: { code: '42501', message: 'permission denied for table fatture' } })
    await expect(insertFattureResilient(db.supabase, [fattura(1)])).rejects.toMatchObject({ code: '42501' })
  })

  it('niente da inserire: nessuna chiamata, risultato a zero', async () => {
    const db = fintoDb()
    expect(await insertFattureResilient(db.supabase, [])).toEqual({ inserite: 0, gia: 0 })
    expect(db.chiamate).toEqual([])
  })
})

describe('eDoppione riconosce il rifiuto vero', () => {
  it('dal codice o dal messaggio, e solo quello', () => {
    expect(eDoppione(ERRORE_DOPPIO)).toBe(true)
    expect(eDoppione({ message: 'duplicate key value violates unique constraint "x"' })).toBe(true)
    expect(eDoppione({ code: '23503', message: 'foreign key violation' })).toBe(false)
    expect(eDoppione(null)).toBe(false)
  })
})

describe('browser e database usano la stessa chiave', () => {
  // Sono due metà della stessa regola: se una cambia e l'altra no, il browser
  // lascia passare cose che il database rifiuta (o il contrario) e il conto
  // «importate / già presenti» smette di tornare.
  it('fatturaKey ignora spazi e maiuscole come l\'indice', () => {
    expect(fatturaKey(fattura(' ft/160 ', { fornitore: 'vecchio enrico' })))
      .toBe(fatturaKey(fattura('FT/160', { fornitore: 'VECCHIO ENRICO' })))
  })

  it('la migration usa numero + fornitore + data, normalizzati', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/20260923c_una_fattura_non_entra_due_volte.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/upper\(btrim\(coalesce\(numero_rif, ''\)\)\)/)
    expect(sql).toMatch(/upper\(btrim\(coalesce\(fornitore, ''\)\)\)/)
    expect(sql).toMatch(/coalesce\(data_fattura/)
  })

  it('due righe uguali nello stesso file ne lasciano una', () => {
    const { nuovi, scartati } = dedupFatture([fattura(1), fattura(' 1 ')], new Set())
    expect(nuovi).toHaveLength(1)
    expect(scartati).toBe(1)
  })
})
