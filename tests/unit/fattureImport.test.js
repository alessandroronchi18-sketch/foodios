// Gli helper condivisi dell'import fatture, estratti da Scadenzario.jsx il
// 10/09/2026 perché la pagina Integrazioni faceva la stessa cosa a mano e
// senza nessuno dei tre controlli: caricando dodici XML dallo SDI, se il
// quinto non si leggeva le prime quattro restavano dentro, il messaggio di
// successo non compariva, e chi ricaricava tutto si trovava i doppioni.
import { describe, it, expect } from 'vitest'
import {
  pickFattura, fatturaKey, dedupFatture, FATTURA_COLS_SICURE,
} from '../../src/lib/fattureImport'

describe('pickFattura', () => {
  it('tiene solo le colonne che la tabella ha, e mette org e sede', () => {
    const out = pickFattura({
      numero_rif: '1/973', fornitore: 'CONO ARTIC', totale: 780.78,
      // campi che i parser producono ma la tabella non ha
      campo_inventato: 'x', righe_dettaglio: [1, 2, 3],
    }, 'org-1', 'sede-1')
    expect(out.organization_id).toBe('org-1')
    expect(out.sede_id).toBe('sede-1')
    expect(out.numero_rif).toBe('1/973')
    expect(out.campo_inventato).toBeUndefined()
    expect(out.righe_dettaglio).toBeUndefined()
  })

  it('senza sede mette null, non undefined: le fatture importate avevano sede_id vuoto e sparivano dal Confronto sedi', () => {
    expect(pickFattura({ fornitore: 'X' }, 'org-1', null).sede_id).toBeNull()
    expect(pickFattura({ fornitore: 'X' }, 'org-1', undefined).sede_id).toBeNull()
  })

  it('non inventa valori: i campi assenti restano fuori', () => {
    const out = pickFattura({ fornitore: 'X' }, 'org-1', 'sede-1')
    for (const k of FATTURA_COLS_SICURE) {
      if (k !== 'fornitore') expect(out[k]).toBeUndefined()
    }
  })
})

describe('fatturaKey', () => {
  it('stessa fattura scritta in modo diverso = stessa chiave', () => {
    const a = { numero_rif: ' 1/973 ', fornitore: 'cono artic', data_fattura: '2026-04-08' }
    const b = { numero_rif: '1/973', fornitore: 'CONO ARTIC', data_fattura: '2026-04-08' }
    expect(fatturaKey(a)).toBe(fatturaKey(b))
  })
  it('stesso numero ma fornitore diverso = chiavi diverse (i numeri si ripetono fra fornitori)', () => {
    expect(fatturaKey({ numero_rif: '10', fornitore: 'A', data_fattura: '2026-04-08' }))
      .not.toBe(fatturaKey({ numero_rif: '10', fornitore: 'B', data_fattura: '2026-04-08' }))
  })
  it('stesso numero e fornitore ma mese diverso = chiavi diverse (le ricorrenti mensili)', () => {
    expect(fatturaKey({ numero_rif: '1', fornitore: 'ENEL', data_fattura: '2026-04-08' }))
      .not.toBe(fatturaKey({ numero_rif: '1', fornitore: 'ENEL', data_fattura: '2026-05-08' }))
  })
})

describe('dedupFatture', () => {
  it('scarta quelle già presenti e i doppioni interni allo stesso file', () => {
    const seen = new Set([fatturaKey({ numero_rif: '1', fornitore: 'A', data_fattura: '2026-01-01' })])
    const { nuovi, scartati } = dedupFatture([
      { numero_rif: '1', fornitore: 'A', data_fattura: '2026-01-01' },  // già in DB
      { numero_rif: '2', fornitore: 'A', data_fattura: '2026-01-02' },  // nuova
      { numero_rif: '2', fornitore: 'A', data_fattura: '2026-01-02' },  // doppione nel file
    ], seen)
    expect(nuovi).toHaveLength(1)
    expect(nuovi[0].numero_rif).toBe('2')
    expect(scartati).toBe(2)
  })

  it('muta il set, così due file caricati insieme non si duplicano fra loro', () => {
    const seen = new Set()
    dedupFatture([{ numero_rif: '5', fornitore: 'B', data_fattura: '2026-02-01' }], seen)
    const secondo = dedupFatture([{ numero_rif: '5', fornitore: 'B', data_fattura: '2026-02-01' }], seen)
    expect(secondo.nuovi).toHaveLength(0)
    expect(secondo.scartati).toBe(1)
  })
})
