// ── Una casella vuota non è uno zero ────────────────────────────────────
//
// Nel file del personale una persona ha la casella del costo orario vuota.
// Fino al 22/09/2026 l'import ci metteva **zero**, e zero nel costo del
// lavoro vuol dire «questa persona non costa niente»: il costo sparisce dal
// P&L e nessuno se ne accorge, perché dopo il caricamento uno zero messo dal
// programma non si distingue da uno zero scritto a mano.
//
// Misurato su un'azienda vera: tre dipendenti, **8.038,82 € di stipendi al
// mese**, e il riquadro del costo del lavoro diceva **0 €**.
//
// Decisione del titolare, 22/09/2026: «vuoto = non lo so, e il programma lo
// dice».
//
// Attenzione a non rimettere il predefinito «per far quadrare il tipo»: il
// database accetta il nullo, e tutto il prodotto distingue già un costo che
// non c'è da un costo a zero.
import { describe, it, expect } from 'vitest'
import { validateRow, validateRows } from '../../src/lib/importValidateCore'
import { IMPORT_SCHEMAS as SCHEMAS } from '../../src/lib/importSchemas'

const schemaPersonale = SCHEMAS.dipendenti || SCHEMAS.personale
const campo = (nome) => (schemaPersonale?.fields || []).find(f => f.name === nome)

describe('Il campo del costo orario', () => {
  it('esiste, e non ha più un predefinito', () => {
    const f = campo('costo_orario')
    expect(f, 'il campo costo_orario non c\'è più nello schema').toBeTruthy()
    expect(f.default, 'è tornato il predefinito: una casella vuota diventa di nuovo zero').toBeUndefined()
  })

  it('e dichiara cosa vuol dire una casella vuota', () => {
    const f = campo('costo_orario')
    expect(f.vuotoSignifica).toBe('non lo so')
    expect(f.avvisoVuoto, 'manca la frase da mostrare a chi importa').toBeTruthy()
    expect(f.avvisoVuoto).toMatch(/non lo inventa|resterà da scrivere/i)
  })
})

describe('Cosa fa l\'import con la casella vuota', () => {
  const mapping = { nome: 'Nome', costo_orario: 'Costo' }

  it('non scrive zero: il campo resta assente', () => {
    const r = validateRow({ Nome: 'Anna', Costo: '' }, mapping, schemaPersonale)
    expect(r.ok).toBe(true)
    expect('costo_orario' in r.data, 'ha scritto un valore dove non c\'era').toBe(false)
  })

  it('anche con una casella di soli spazi', () => {
    const r = validateRow({ Nome: 'Anna', Costo: '   ' }, mapping, schemaPersonale)
    expect('costo_orario' in r.data).toBe(false)
  })

  it('ma un costo scritto davvero entra', () => {
    const r = validateRow({ Nome: 'Anna', Costo: '14,50' }, mapping, schemaPersonale)
    expect(r.data.costo_orario).toBeCloseTo(14.5, 2)
  })

  it('e uno zero scritto davvero resta zero', () => {
    // È l'altra metà della regola: zero scritto a mano è una scelta di chi
    // compila — un tirocinante non pagato — e va rispettata.
    const r = validateRow({ Nome: 'Anna', Costo: '0' }, mapping, schemaPersonale)
    expect(r.data.costo_orario).toBe(0)
  })

  it('la riga resta valida: manca un dato, non è un errore', () => {
    // Scartare la riga perderebbe anche il nome e il contratto. Il costo si
    // scrive dopo, dalla pagina del personale.
    const res = validateRows([{ Nome: 'Anna', Costo: '' }], mapping, schemaPersonale)
    expect(res.valid_rows).toHaveLength(1)
    expect(res.invalid_rows).toHaveLength(0)
  })
})

describe('E il programma lo dice', () => {
  const mapping = { nome: 'Nome', costo_orario: 'Costo' }

  it('conta le caselle vuote, così il riepilogo può dirlo', () => {
    const res = validateRows([
      { Nome: 'Anna', Costo: '' },
      { Nome: 'Bruno', Costo: '12' },
      { Nome: 'Carla', Costo: '  ' },
    ], mapping, schemaPersonale)
    expect(res.stats.celle_vuote_col_predefinito.costo_orario).toBe(2)
  })

  it('e se sono tutte piene non dice niente', () => {
    const res = validateRows([{ Nome: 'Anna', Costo: '12' }], mapping, schemaPersonale)
    expect(res.stats.celle_vuote_col_predefinito.costo_orario).toBeUndefined()
  })
})

describe('I campi dove invece zero è giusto', () => {
  it('quanto ho prodotto e quanto ho buttato restano a zero', () => {
    // Qui una casella vuota vuol dire davvero «non ho prodotto» e «non ho
    // buttato niente»: sono due cose diverse dal costo orario, e il
    // predefinito a zero è la risposta giusta.
    const inv = SCHEMAS.inventario_produzione || SCHEMAS.produzione
    if (!inv) return
    for (const nome of ['produzione_g', 'scarto_g']) {
      const f = (inv.fields || []).find(x => x.name === nome)
      if (!f) continue
      expect(f.default, `${nome}: il predefinito a zero serve, non va tolto`).toBe(0)
    }
  })
})

describe('Il righello di questo file', () => {
  it('lo schema del personale esiste e ha i campi che si guardano', () => {
    expect(schemaPersonale, 'schema del personale non trovato: le prove sopra non guardano niente').toBeTruthy()
    expect(campo('nome')).toBeTruthy()
  })
})
