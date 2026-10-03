// ── Una colonna che manca non butta via tutte le altre ──────────────────
//
// Trovato il 03/10/2026, aggiungendo la colonna `fatture.cessionario_piva`
// (di quale società è la fattura). Il codice doveva funzionare anche PRIMA
// che la migration fosse applicata, e guardando come lo faceva è venuto
// fuori il difetto.
//
// `insertFattureResilient`, al primo errore «colonna mancante», riscriveva
// l'INSERT con le sole 7 colonne «core» (numero, data, fornitore, imponibile,
// imposta, totale, stato). Buttava via, in silenzio:
//   • `righe` — il dettaglio prodotti, il motivo per cui si carica lo ZIP;
//   • `piva`, `iban`, `data_scadenza`, `tipo` — la scadenza vera, il
//     bonifico, la nota di credito che diventava una fattura da pagare;
//   • `sedi_condivise` — e questo è il peggiore: una spesa di due negozi
//     entrava con la sede vuota e SENZA le sedi, cioè in nessuna pagina. È
//     esattamente il danno del 17/09/2026 (142 fatture, 189.458 € spariti
//     da ogni schermata).
//
// Oggi in produzione non scattava perché tutte quelle colonne ci sono. Ma
// bastava una colonna nuova non ancora migrata — come quella aggiunta qui —
// per farlo scattare a OGNI caricamento.
//
// La correzione: l'errore dice il nome della colonna che manca. Si toglie
// quella e si riprova, tenendo tutte le altre. Il ripiego sulle core resta
// come ultima spiaggia, e anche lì una spesa condivisa si porta dietro le sue
// sedi: meglio un errore a schermo che una fattura che non vede nessuno.
//
// Stessa famiglia, stessa correzione, sulle altre due scritture
// dell'import XML: il completamento delle fatture esistenti
// (`applicaCompletamenti`) e la lettura per l'abbinamento
// (`fattureEsistentiPerAbbinare`).
import { describe, it, expect } from 'vitest'
import { insertFattureResilient, colonnaMancante, pickFattura, FATTURA_COLS_SICURE } from '../../src/lib/fattureImport.js'
import { applicaCompletamenti, fattureEsistentiPerAbbinare, patchDaXml } from '../../src/lib/completaFatture.js'

/** Un database che non ha alcune colonne, e risponde come PostgREST. */
function dbSenza(colonneMancanti = [], { forma = 'postgrest' } = {}) {
  const righe = []
  const tentativi = []
  const errore = (c) => forma === 'postgrest'
    ? { code: 'PGRST204', message: `Could not find the '${c}' column of 'fatture' in the schema cache` }
    : { code: '42703', message: `column "${c}" of relation "fatture" does not exist` }
  const supabase = {
    from: () => ({
      insert: async (batch) => {
        tentativi.push(batch.map(r => Object.keys(r).sort()))
        for (const r of batch) {
          const manca = colonneMancanti.find(c => c in r)
          if (manca) return { error: errore(manca) }
        }
        righe.push(...batch)
        return { error: null }
      },
    }),
  }
  return { supabase, righe, tentativi }
}

const condivisa = (n) => ({
  ...pickFattura({
    numero_rif: String(n), fornitore: 'Latteria', data_fattura: '2026-09-01', totale: 122,
    imponibile: 100, imposta: 22, tipo: 'fattura', piva: '99999999999', iban: 'IT60X0542811101000000123456',
    data_scadenza: '2026-10-31', righe: [{ descrizione: 'Panna', quantita: 10 }],
    cessionario_piva: '22222222222',
  }, 'org', null),
  sedi_condivise: ['s-degasperi', 's-berthollet'],
})

describe('insertFattureResilient: una colonna che manca', () => {
  it('il difetto com\'era: manca `tipo`, e prima se ne andavano anche righe e sedi condivise', async () => {
    const db = dbSenza(['tipo'])
    await insertFattureResilient(db.supabase, [condivisa(1)])
    expect(db.righe).toHaveLength(1)
    expect(db.righe[0]).not.toHaveProperty('tipo')
    expect(db.righe[0].sedi_condivise).toEqual(['s-degasperi', 's-berthollet'])
    expect(db.righe[0].righe).toHaveLength(1)
    expect(db.righe[0].iban).toBe('IT60X0542811101000000123456')
  })

  it('toglie solo quella: righe, IBAN, scadenza e sedi condivise entrano lo stesso', async () => {
    const db = dbSenza(['cessionario_piva'])
    const esito = await insertFattureResilient(db.supabase, [condivisa(1), condivisa(2)])
    expect(esito).toEqual({ inserite: 2, gia: 0 })
    for (const r of db.righe) {
      expect(r).not.toHaveProperty('cessionario_piva')
      expect(r.sedi_condivise).toEqual(['s-degasperi', 's-berthollet'])
      expect(r.righe).toHaveLength(1)
      expect(r).toMatchObject({ piva: '99999999999', iban: 'IT60X0542811101000000123456', data_scadenza: '2026-10-31', tipo: 'fattura' })
    }
  })

  it('vale anche col messaggio di Postgres, non solo con quello di PostgREST', async () => {
    const db = dbSenza(['cessionario_piva'], { forma: 'postgres' })
    await insertFattureResilient(db.supabase, [condivisa(1)])
    expect(db.righe[0].righe).toHaveLength(1)
    expect(db.righe[0].sedi_condivise).toHaveLength(2)
  })

  it('due colonne che mancano: le toglie tutte e due, una alla volta', async () => {
    const db = dbSenza(['cessionario_piva', 'iban'])
    await insertFattureResilient(db.supabase, [condivisa(1)])
    expect(db.righe).toHaveLength(1)
    expect(db.righe[0]).not.toHaveProperty('iban')
    expect(db.righe[0].righe).toHaveLength(1)
  })

  it('la colonna scoperta mancante non si riprova blocco dopo blocco', async () => {
    const db = dbSenza(['cessionario_piva'])
    await insertFattureResilient(db.supabase, Array.from({ length: 250 }, (_, i) => condivisa(i)))
    expect(db.righe).toHaveLength(250)
    // Primo blocco: un tentativo fallito e uno buono. Gli altri due: uno solo.
    expect(db.tentativi).toHaveLength(4)
  })

  it('una colonna che manca senza nome riconoscibile: ripiego sulle core, ma le sedi condivise restano', async () => {
    const supabase = {
      from: () => ({
        insert: async (batch) => {
          if (batch.some(r => 'righe' in r)) return { error: { message: 'schema cache out of date' } }
          db.righe.push(...batch)
          return { error: null }
        },
      }),
    }
    const db = { righe: [] }
    await insertFattureResilient(supabase, [condivisa(1)])
    expect(db.righe[0].sedi_condivise).toEqual(['s-degasperi', 's-berthollet'])
    expect(db.righe[0].sede_id).toBeNull()
  })

  it('un errore vero (permessi) non diventa un ripiego silenzioso', async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { code: '42501', message: 'permission denied for table fatture' } }) }) }
    await expect(insertFattureResilient(supabase, [condivisa(1)])).rejects.toMatchObject({ code: '42501' })
  })
})

describe('colonnaMancante: il nome della colonna dall\'errore', () => {
  it('le tre forme in cui arriva', () => {
    expect(colonnaMancante({ message: "Could not find the 'cessionario_piva' column of 'fatture' in the schema cache" })).toBe('cessionario_piva')
    expect(colonnaMancante({ message: 'column "cessionario_piva" of relation "fatture" does not exist' })).toBe('cessionario_piva')
    expect(colonnaMancante({ message: 'column fatture.cessionario_piva does not exist' })).toBe('cessionario_piva')
  })
  it('un altro errore non ha una colonna', () => {
    expect(colonnaMancante({ message: 'duplicate key value violates unique constraint' })).toBeNull()
    expect(colonnaMancante(null)).toBeNull()
  })
})

describe('la colonna nuova è nelle colonne sicure', () => {
  // Il passo che si dimentica sempre: il parser la legge, ma se non è
  // nell'elenco `pickFattura` la butta via senza un fiato.
  it('cessionario_piva passa da pickFattura', () => {
    expect(FATTURA_COLS_SICURE).toContain('cessionario_piva')
    expect(pickFattura({ cessionario_piva: '22222222222' }, 'org', null).cessionario_piva).toBe('22222222222')
  })
})

describe('applicaCompletamenti: una colonna che manca', () => {
  function dbUpdate(colonneMancanti) {
    const scritti = []
    const tabella = () => {
      const q = { _f: {} }
      q.update = (patch) => { q._patch = patch; return q }
      q.eq = (k, v) => { q._f[k] = v; return q }
      q.then = (ok, ko) => {
        const manca = colonneMancanti.find(c => c in q._patch)
        const res = manca ? { error: { code: 'PGRST204', message: `Could not find the '${manca}' column of 'fatture' in the schema cache` } }
          : (scritti.push({ id: q._f.id, patch: q._patch }), { error: null })
        return Promise.resolve(res).then(ok, ko)
      }
      return q
    }
    return { supabase: { from: tabella }, scritti }
  }

  it('il completamento entra lo stesso, senza la colonna che non c\'è', async () => {
    const db = dbUpdate(['cessionario_piva'])
    const completa = ['a', 'b'].map(id => ({ id, patch: { righe: [{ n: 1 }], cessionario_piva: '2' }, record: { numero_rif: id } }))
    const r = await applicaCompletamenti(db.supabase, 'org', completa, { parallele: 1 })
    expect(r).toEqual({ fatte: 2, errori: [] })
    expect(db.scritti.map(s => s.patch)).toEqual([{ righe: [{ n: 1 }] }, { righe: [{ n: 1 }] }])
  })

  it('se restava solo quella colonna, non si scrive niente e non è un errore', async () => {
    const db = dbUpdate(['cessionario_piva'])
    const r = await applicaCompletamenti(db.supabase, 'org', [{ id: 'a', patch: { cessionario_piva: '2' }, record: {} }])
    expect(r).toEqual({ fatte: 0, errori: [] })
    expect(db.scritti).toEqual([])
  })
})

describe('fattureEsistentiPerAbbinare: prima della migration', () => {
  function dbLettura({ conColonna }) {
    const selezioni = []
    const fatture = [{ id: '1', numero_rif: '1', prima_riga: null, ...(conColonna ? { cessionario_piva: null } : {}) }]
    const tabella = () => {
      const q = {}
      q.select = (cols) => { q._cols = cols; selezioni.push(cols); return q }
      q.eq = () => q
      q.order = () => q
      q.range = () => q
      q.then = (ok, ko) => {
        const res = !conColonna && q._cols.includes('cessionario_piva')
          ? { data: null, error: { code: '42703', message: 'column fatture.cessionario_piva does not exist' } }
          : { data: fatture, error: null }
        return Promise.resolve(res).then(ok, ko)
      }
      return q
    }
    return { supabase: { from: tabella }, selezioni }
  }

  it('senza la colonna rilegge senza, e la riga non la porta: nessun completamento inventato', async () => {
    const db = dbLettura({ conColonna: false })
    const out = await fattureEsistentiPerAbbinare(db.supabase, 'org')
    expect(out).toHaveLength(1)
    expect(out[0]).not.toHaveProperty('cessionario_piva')
    // È questo che tiene ferma la ricarica dello stesso ZIP: senza colonna,
    // niente patch da proporre, e la fattura resta «già completa».
    expect(patchDaXml({ ...out[0], ha_righe: true }, { cessionario_piva: '2' })).toEqual({})
  })

  it('con la colonna la legge, e una P.IVA vuota si completa', async () => {
    const db = dbLettura({ conColonna: true })
    const out = await fattureEsistentiPerAbbinare(db.supabase, 'org')
    expect(db.selezioni[0]).toMatch(/cessionario_piva/)
    expect(patchDaXml({ ...out[0], ha_righe: true }, { cessionario_piva: '2' })).toEqual({ cessionario_piva: '2' })
  })

  it('una P.IVA già scritta non si sovrascrive', () => {
    expect(patchDaXml({ ha_righe: true, cessionario_piva: '1' }, { cessionario_piva: '2' })).toEqual({})
  })
})
