// 05/10/2026 — «mi manca una pagina in Fornitori dove vedo tutte le fatture
// insieme, tutte, pagate e non pagate». Lo Scadenzario non carica le pagate:
// l'Archivio sì. Qui si prova la lettura a pagine, i filtri, i totali, le 50
// righe per volta, il CSV, la porta nel menu e che il dipendente non entri.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  leggiArchivioFatture, filtraFatture, ordinaPerData, totaliFatture, paginaFatture, csvFatture,
  conLaVoce, ePagata, SENZA_SEDE, SENZA_VOCE, PAGINA_LETTURA,
} from '../../src/lib/archivioFatture'
import { ID_CATEGORIE } from '../../src/lib/contoEconomico'
import { chiaveFornitore } from '../../src/lib/contoEconomico'
import { costruisciMenu, vociMenu, VISTE_DISEGNATE, VISTE_DIPENDENTE } from '../../src/lib/menuFoodos'

const BER = 'af9f2192-0000', DEG = 'bbb7554e-0000', CAR = 'e0d3370b-0000'
const sedi = [{ id: CAR, nome: 'Carlina' }, { id: BER, nome: 'Berthollet' }, { id: DEG, nome: 'De Gasperi' }]
let n = 0
const F = (o) => ({ id: `f${++n}`, fornitore: 'Latteria Rossi', numero_rif: '1', data_fattura: '2026-09-10',
  totale: 100, imponibile: 82, imposta: 18, stato: 'pagata', tipo: 'fattura', sede_id: CAR, sedi_condivise: null, ...o })

describe('lettura a pagine', () => {
  const finto = (righe, { senzaColonna } = {}) => {
    const chiamate = []
    const client = { from: () => {
      let sel = ''
      const b = {
        select(s) { sel = s; return b }, eq() { return b }, gte() { return b }, lte() { return b }, order() { return b },
        range(da, a) {
          chiamate.push({ sel, da, a })
          if (senzaColonna && sel.includes(senzaColonna)) {
            return Promise.resolve({ data: null, error: { message: `Could not find the '${senzaColonna}' column of 'fatture' in the schema cache` } })
          }
          return Promise.resolve({ data: righe.slice(da, a + 1), error: null })
        },
      }
      return b
    } }
    return { client, chiamate }
  }
  it('legge mille righe alla volta e le prende tutte (2.418 = 3 pagine)', async () => {
    const tutte = Array.from({ length: 2418 }, (_, i) => F({ id: String(i) }))
    const { client, chiamate } = finto(tutte)
    const { fatture } = await leggiArchivioFatture(client, 'org')
    expect(fatture).toHaveLength(2418)
    expect(chiamate.map(c => c.da)).toEqual([0, 1000, 2000])
    expect(PAGINA_LETTURA).toBe(1000)
  })
  it('se la colonna note non c\'è ancora, si rilegge senza e non si ferma', async () => {
    const { client } = finto([F({})], { senzaColonna: 'note' })
    const r = await leggiArchivioFatture(client, 'org')
    expect(r.fatture).toHaveLength(1)
    expect(r.conNote).toBe(false)
  })
  it('un periodo scritto male o senza azienda lancia, non legge tutto', async () => {
    await expect(leggiArchivioFatture({}, '')).rejects.toThrow()
    await expect(leggiArchivioFatture({}, 'o', { dal: '1/9/2026' })).rejects.toThrow(/periodo/)
  })
})

describe('filtri', () => {
  const mappa = { [chiaveFornitore('Latteria Rossi')]: ID_CATEGORIE.MATERIE_PRIME }
  const fatture = conLaVoce([
    F({ id: 'a', fornitore: 'Latteria Rossi', numero_rif: 'FT-001', stato: 'pagata' }),
    F({ id: 'b', fornitore: 'Caffè Ünico', numero_rif: '77', stato: 'da_pagare', sede_id: BER }),
    F({ id: 'c', fornitore: 'Enel', stato: 'da_pagare', sede_id: null, sedi_condivise: [BER, DEG] }),
    F({ id: 'd', fornitore: 'Sconosciuto', sede_id: null }),
  ], mappa)
  const ids = (x) => x.map(f => f.id).sort()
  it('stato: tutte, pagate, da pagare', () => {
    expect(ids(filtraFatture(fatture, {}))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filtraFatture(fatture, { stato: 'pagate' }))).toEqual(['a', 'd'])
    expect(ids(filtraFatture(fatture, { stato: 'da-pagare' }))).toEqual(['b', 'c'])
    expect(ePagata({ stato: 'scaduta' })).toBe(false)
  })
  it('ricerca per fornitore (senza accenti né maiuscole) o per numero', () => {
    expect(ids(filtraFatture(fatture, { cerca: 'unico' }))).toEqual(['b'])
    expect(ids(filtraFatture(fatture, { cerca: 'ft-00' }))).toEqual(['a'])
    expect(ids(filtraFatture(fatture, { cerca: '77' }))).toEqual(['b'])
  })
  it('sede: la fattura condivisa compare in tutte le sue sedi; «senza sede» solo se non ne ha', () => {
    expect(ids(filtraFatture(fatture, { sede: BER }))).toEqual(['b', 'c'])
    expect(ids(filtraFatture(fatture, { sede: DEG }))).toEqual(['c'])
    expect(ids(filtraFatture(fatture, { sede: SENZA_SEDE }))).toEqual(['d'])
  })
  it('voce: quella del fornitore, e «da classificare» per chi non ne ha', () => {
    expect(ids(filtraFatture(fatture, { voce: ID_CATEGORIE.MATERIE_PRIME }))).toEqual(['a'])
    expect(ids(filtraFatture(fatture, { voce: SENZA_VOCE }))).toEqual(['b', 'c', 'd'])
  })
  it('i filtri si sommano', () => {
    expect(ids(filtraFatture(fatture, { stato: 'da-pagare', sede: BER, cerca: 'enel' }))).toEqual(['c'])
  })
})

describe('ordine e totali', () => {
  it('dalla più recente, a parità di data per fornitore', () => {
    const o = ordinaPerData([F({ id: '1', data_fattura: '2026-01-05' }), F({ id: '2', data_fattura: '2026-09-01', fornitore: 'Zeta' }),
      F({ id: '3', data_fattura: '2026-09-01', fornitore: 'Alfa' })])
    expect(o.map(f => f.id)).toEqual(['3', '2', '1'])
  })
  it('conta quante, quanto, da pagare, e quante senza imponibile (IVA compresa)', () => {
    const t = totaliFatture([
      F({ totale: 122, imponibile: 100 }),
      F({ totale: 50, imponibile: 0, stato: 'da_pagare' }),
      F({ totale: 30, imponibile: null, stato: 'da_pagare' }),
      F({ totale: 20, imponibile: 10, tipo: 'nota_credito' }),
    ])
    expect(t).toMatchObject({ quante: 4, totale: 182, daPagare: 80, pagato: 102, nPagate: 2, nDaPagare: 2, senzaImponibile: 2 })
  })
  it('un elenco vuoto non è un errore', () => {
    expect(totaliFatture([])).toMatchObject({ quante: 0, totale: 0, senzaImponibile: 0 })
  })
})

describe('50 righe per volta', () => {
  const tante = Array.from({ length: 120 }, () => F({}))
  it('prima 50, poi 100, poi tutte; «altre» scende', () => {
    expect(paginaFatture(tante, 1)).toMatchObject({ altre: 70 })
    expect(paginaFatture(tante, 1).righe).toHaveLength(50)
    expect(paginaFatture(tante, 2).righe).toHaveLength(100)
    expect(paginaFatture(tante, 3)).toMatchObject({ altre: 0 })
    expect(paginaFatture(tante, 3).righe).toHaveLength(120)
  })
})

describe('CSV di quello che si vede', () => {
  it('BOM, punto e virgola, virgola decimale, virgolette doppie, nota', () => {
    const csv = csvFatture([F({ fornitore: 'Rossi; "F.lli"', totale: 1234.5, note: 'Segnata pagata in blocco', sedi_condivise: [BER, DEG], sede_id: null })], sedi)
    expect(csv.startsWith('﻿Data;Fornitore')).toBe(true)
    const riga = csv.split('\r\n')[1]
    expect(riga).toContain('"Rossi; ""F.lli"""')
    expect(riga).toContain('Berthollet + De Gasperi')
    expect(riga).toContain('1234,50')
    expect(riga).toContain('Segnata pagata in blocco')
  })
})

describe('porta nel menu e permessi', () => {
  const menu = costruisciMenu({ metodoInventario: true, sedeDiProduzione: true, piuSedi: true })
  it('Fornitori ha la terza scheda «Archivio»', () => {
    const voce = vociMenu(menu).find(v => v.id === 'scadenzario')
    expect(voce.schede.map(s => s.label)).toEqual(['Fornitori', 'Anagrafica', 'Archivio'])
    expect(voce.schede[2].id).toBe('archivio-fatture')
  })
  it('è una pagina disegnata e il dipendente non la ha', () => {
    expect(VISTE_DISEGNATE.has('archivio-fatture')).toBe(true)
    expect(VISTE_DIPENDENTE.has('archivio-fatture')).toBe(false)
  })
  it('Dashboard la apre solo al titolare, in modo pigro', () => {
    const d = readFileSync(join(import.meta.dirname, '../../src/Dashboard.jsx'), 'utf8')
    expect(d).toMatch(/lazyWithReload\(\(\) => import\('\.\/views\/ArchivioFattureView'\)\)/)
    expect(d).toMatch(/vista==="archivio-fatture"&&!isDip&&<ArchivioFattureView/)
  })
})
