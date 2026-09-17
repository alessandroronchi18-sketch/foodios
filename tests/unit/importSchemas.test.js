// Gli schemi dell'import: cosa il sistema si aspetta per ogni cosa importabile.
//
// Li leggono in tre: il suggerimento automatico delle colonne (api/import-map.js),
// la validazione (api/import-validate.js) e l'inserimento (api/import-execute.js).
// Uno schema incoerente non rompe subito: rompe al terzo passo, sul file vero
// del cliente, dopo che ha già caricato tutto.

import { describe, it, expect } from 'vitest'
import { IMPORT_SCHEMAS, getEntitySchema, listEntities } from '../../src/lib/importSchemas'

const TUTTI = Object.entries(IMPORT_SCHEMAS)

describe('importSchemas — accesso', () => {
  it('elenca le entità e le ritrova per nome', () => {
    const e = listEntities()
    expect(e).toEqual(expect.arrayContaining(['fornitori', 'dipendenti', 'produzione_inventario']))
    for (const nome of e) expect(getEntitySchema(nome)).toBe(IMPORT_SCHEMAS[nome])
  })

  it('un\'entità sconosciuta dà null, non esplode', () => {
    expect(getEntitySchema('inesistente')).toBe(null)
    expect(getEntitySchema('')).toBe(null)
    expect(getEntitySchema(null)).toBe(null)
    expect(getEntitySchema(undefined)).toBe(null)
  })

  it('non si può passare da getEntitySchema a un prototipo', () => {
    // `IMPORT_SCHEMAS[entity]` con entity = 'constructor' restituirebbe una
    // funzione se non ci fosse il controllo di verità: qui l'entity arriva
    // dall'URL del wizard.
    for (const brutto of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const r = getEntitySchema(brutto)
      expect(typeof r === 'function', brutto).toBe(false)
    }
  })
})

describe('importSchemas — coerenza di ogni schema', () => {
  it.each(TUTTI)('%s: ha tabella, etichetta, descrizione e campi', (nome, s) => {
    expect(typeof s.table, nome).toBe('string')
    expect(s.table.length).toBeGreaterThan(0)
    expect(typeof s.label).toBe('string')
    expect(typeof s.description).toBe('string')
    expect(Array.isArray(s.fields)).toBe(true)
    expect(s.fields.length).toBeGreaterThan(0)
  })

  it.each(TUTTI)('%s: ogni campo ha nome, tipo, required e un aiuto', (nome, s) => {
    const tipiAmmessi = ['string', 'number', 'boolean', 'date', 'email', 'phone', 'lookup']
    for (const f of s.fields) {
      const dove = `${nome}.${f.name}`
      expect(typeof f.name, dove).toBe('string')
      expect(tipiAmmessi, dove).toContain(f.type)
      expect(typeof f.required, dove).toBe('boolean')
      expect(typeof f.hint, dove).toBe('string')
      expect(f.hint.length, dove).toBeGreaterThan(10)
    }
  })

  it.each(TUTTI)('%s: nessun nome di campo duplicato', (nome, s) => {
    const nomi = s.fields.map(f => f.name)
    expect(new Set(nomi).size, nome).toBe(nomi.length)
  })

  it.each(TUTTI)('%s: le colonne di uniqueOn esistono fra i campi', (nome, s) => {
    // Se uniqueOn cita una colonna che non c'è, l'upsert fallisce sul file
    // vero del cliente, non qui.
    const nomi = new Set(s.fields.map(f => f.name))
    for (const u of s.uniqueOn || []) expect(nomi.has(u), `${nome}.uniqueOn: ${u}`).toBe(true)
  })

  it.each(TUTTI)('%s: le colonne di uniqueOn sono obbligatorie o hanno un valore di scorta', (nome, s) => {
    for (const u of s.uniqueOn || []) {
      const f = s.fields.find(x => x.name === u)
      const ok = f.required || f.default !== undefined
      expect(ok, `${nome}: ${u} è chiave ma può restare vuota`).toBe(true)
    }
  })

  it.each(TUTTI)('%s: i lookup dicono dove cercare', (nome, s) => {
    for (const f of s.fields.filter(f => f.type === 'lookup')) {
      const dove = `${nome}.${f.name}`
      expect(f.resolver, dove).toBeTruthy()
      expect(typeof f.resolver.table, dove).toBe('string')
      expect(typeof f.resolver.match_col, dove).toBe('string')
      expect(typeof f.resolver.target_col, dove).toBe('string')
      expect(['org', 'global'], dove).toContain(f.resolver.scope)
    }
  })

  it.each(TUTTI)('%s: i minimi non superano i massimi', (nome, s) => {
    for (const f of s.fields) {
      if (f.minValue !== undefined && f.maxValue !== undefined) {
        expect(f.minValue, `${nome}.${f.name}`).toBeLessThanOrEqual(f.maxValue)
      }
    }
  })

  it.each(TUTTI)('%s: i valori di scorta rispettano il tipo e i limiti', (nome, s) => {
    for (const f of s.fields) {
      if (f.default === undefined) continue
      const dove = `${nome}.${f.name}`
      // `default: null` è ammesso e vuol dire una cosa precisa: «se la casella
      // è vuota scrivi NULL», cioè «non lo sappiamo». Non è la stessa cosa di
      // non avere un default: con `upsertOn: true` un campo assente lascia in
      // piedi il valore già presente sulla riga, mentre null lo sovrascrive.
      // Serve a chi corregge il file e svuota una cella che aveva sbagliato.
      // Ammesso il 16/09/2026 per `produzione_inventario.rimanenza_g`
      // (il racconto sta in rimanenzaNonRilevata.test.js).
      if (f.default === null) {
        expect(f.required, `${dove}: un campo obbligatorio non può valere "non lo so"`).toBe(false)
        continue
      }
      if (f.type === 'number') {
        expect(typeof f.default, dove).toBe('number')
        if (f.minValue !== undefined) expect(f.default, dove).toBeGreaterThanOrEqual(f.minValue)
        if (f.maxValue !== undefined) expect(f.default, dove).toBeLessThanOrEqual(f.maxValue)
      }
      if (f.type === 'boolean') expect(typeof f.default, dove).toBe('boolean')
    }
  })

  it.each(TUTTI)('%s: nessun alias ripetuto (renderebbe ambiguo il suggerimento)', (nome, s) => {
    const visti = new Map()
    for (const f of s.fields) {
      for (const a of f.aliases || []) {
        const k = a.toLowerCase().trim()
        expect(visti.has(k), `${nome}: "${a}" è alias sia di ${visti.get(k)} sia di ${f.name}`).toBe(false)
        visti.set(k, f.name)
      }
    }
  })

  it.each(TUTTI)('%s: nessun alias coincide col nome di un altro campo', (nome, s) => {
    const nomi = new Set(s.fields.map(f => f.name))
    for (const f of s.fields) {
      for (const a of f.aliases || []) {
        if (a === f.name) continue
        expect(nomi.has(a), `${nome}: alias "${a}" di ${f.name} è il nome di un altro campo`).toBe(false)
      }
    }
  })

  it.each(TUTTI)('%s: le conversioni di unità citano campi che esistono e sono numeri', (nome, s) => {
    const perNome = new Map(s.fields.map(f => [f.name, f]))
    for (const c of s.unitConversions || []) {
      expect(typeof c.label, nome).toBe('string')
      expect(typeof c.factor, nome).toBe('number')
      expect(c.factor, nome).toBeGreaterThan(0)
      for (const campo of c.fields) {
        const f = perNome.get(campo)
        expect(f, `${nome}: conversione su campo inesistente ${campo}`).toBeTruthy()
        expect(f.type, `${nome}.${campo}`).toBe('number')
      }
    }
  })
})

describe('importSchemas — le regole del gusto, che sono costate 156 kg invisibili', () => {
  const inv = IMPORT_SCHEMAS.produzione_inventario

  it('il nome del gusto si normalizza in maiuscolo', () => {
    // È una CHIAVE: tutta l'app cerca il gusto in maiuscolo senza spazi. Una
    // riga importata come "Caffè Flora" non la trova più nessuna pagina.
    const f = inv.fields.find(f => f.name === 'gusto_nome')
    expect(f.normalize).toBe('upper_trim')
  })

  it('la chiave è sede + gusto + data', () => {
    expect(inv.uniqueOn).toEqual(['sede_id', 'gusto_nome', 'data'])
    expect(inv.upsertOn).toBe(true)
  })

  it('i grammi non possono essere negativi', () => {
    for (const n of ['produzione_g', 'rimanenza_g', 'scarto_g']) {
      expect(inv.fields.find(f => f.name === n).minValue, n).toBe(0)
    }
  })

  it('c\'è la conversione da chili a grammi, ed è facoltativa', () => {
    const c = inv.unitConversions.find(c => c.factor === 1000)
    expect(c).toBeTruthy()
    expect(c.optional).toBe(true)
    expect(c.fields).toEqual(['produzione_g', 'rimanenza_g', 'scarto_g'])
  })
})

describe('importSchemas — come sono scritti i testi', () => {
  it('etichette e aiuti non contengono nomi di colonne del database', () => {
    for (const [nome, s] of TUTTI) {
      for (const f of s.fields) {
        expect(f.label || f.name, `${nome}.${f.name}`).not.toMatch(/_id$|_g$/)
      }
    }
  })

  it('niente emoji nei testi mostrati all\'utente', () => {
    // La freccia «→» e la spunta «✓» non sono emoji: sono caratteri
    // tipografici. Questo rilevatore comprendeva il blocco delle frecce
    // (U+2190–21FF) e i dingbat (U+2600–27BF), e le bocciava tutte e due.
    // Adesso usa `\p{Extended_Pictographic}`, la proprietà Unicode delle emoji
    // vere, che è quella già usata dagli altri test di casa.
    // Tarato il 17/09/2026, audit RIGHELLO.
    const emoji = /\p{Extended_Pictographic}/u
    for (const [nome, s] of TUTTI) {
      expect(s.label, nome).not.toMatch(emoji)
      expect(s.description, nome).not.toMatch(emoji)
      for (const f of s.fields) {
        expect(f.hint, `${nome}.${f.name}`).not.toMatch(emoji)
        if (f.label) expect(f.label, `${nome}.${f.name}`).not.toMatch(emoji)
      }
    }
  })
})
