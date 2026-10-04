// ── «Quanto hai guadagnato questo mese, e perché»: il conto ─────────────
//
// 03/10/2026. L'audit del vecchio P&L sui dati veri di Mara: utile all'82%
// dei ricavi (luglio, Carlina: 50.976 € su 61.600 €, in verde). Tre cause:
//
//   1. le fatture fornitori non entravano mai nel conto (giugno–agosto:
//      288.686 € IVA compresa, fuori);
//   2. il personale contava zero: Greg attivo con stipendio 0, Marco, Coco
//      e Alessandro con 8.039 € lordi al mese segnati non attivi — la query
//      li scartava e la tessera «Costo lavoro 0,0%» era verde;
//   3. gli incassi erano stimati dall'inventario senza dirlo, e con l'IVA
//      dentro, mentre i costi sono senza IVA.
//
// Questi test fissano le regole del conto nuovo: l'utile si dà solo se si
// sanno incassi, spese e personale; la stima si chiama stima; l'IVA esce
// dagli incassi; chi è segnato inattivo con lo stipendio si vede.
import { describe, it, expect } from 'vitest'
import {
  incassiDelMese, personaleDelMese, contoDelMese, causeDelCambio, fraseCausa,
  titoloCascata, motivoSenzaUtile, confrontoUtile, ALIQUOTA_IVA_INCASSI,
} from '../../src/lib/ilMese.js'

// I dipendenti come sono nel database di Mara il 03/10/2026.
const DIPENDENTI_MARA = [
  { id: 'g', nome: 'Greg', attivo: true, stipendio_lordo_mensile: 0, costo_orario: 0 },
  { id: 'm', nome: 'Marco', attivo: false, stipendio_lordo_mensile: 2000, costo_orario: 0 },
  { id: 'c', nome: 'Coco', attivo: false, stipendio_lordo_mensile: 4000, costo_orario: 0 },
  { id: 'a', nome: 'Alessandro', attivo: false, stipendio_lordo_mensile: 2038.82, costo_orario: 0 },
]

// Il risultato del motore dei costi (contoEconomico.js), nella forma concordata.
const costi = (o = {}) => ({
  mese: '2026-07',
  perCategoria: [
    { id: 'materie-prime', nome: 'Materie prime', tipo: 'costo', importo: 18000, nFatture: 40, fornitori: [{ nome: 'DESA SRL', importo: 9000 }, { nome: 'Vecchio Enrico', importo: 6000 }] },
    { id: 'confezionamento', nome: 'Confezioni', tipo: 'costo', importo: 4000, nFatture: 5, fornitori: [{ nome: 'CONO ARTIC', importo: 4000 }] },
    { id: 'utenze', nome: 'Utenze', tipo: 'costo', importo: 2000, nFatture: 2, fornitori: [{ nome: 'Enel Energia', importo: 2000 }] },
    { id: 'commissioni', nome: 'Commissioni', tipo: 'costo', importo: 1000, nFatture: 6, fornitori: [{ nome: 'Deliveroo', importo: 1000 }] },
  ],
  totaleCosti: 25000,
  investimenti: { importo: 86651, fatture: [{ fornitore: 'GECKO', importo: 86651 }] },
  daClassificare: { importo: 500, nFornitori: 3, nFatture: 4 },
  copertura: { nFatture: 57, nSenzaImponibile: 0 },
  ...o,
})

describe('Gli incassi del mese', () => {
  it('dalla cassa, senza IVA al 10%', () => {
    const i = incassiDelMese({ cassa: { totV: 55000, giorni: 31 }, giorniDelMese: 31 })
    expect(ALIQUOTA_IVA_INCASSI).toBe(10)
    expect(i).toMatchObject({ fonte: 'cassa', valore: 50000, lordo: 55000, parziale: false })
  })
  it('senza cassa, stimati dall\'inventario — e lo dicono', () => {
    const i = incassiDelMese({ cassa: { totV: 0, giorni: 0 }, stima: { ricavi: 66000, ultimoGiorno: '2026-08-31' } })
    expect(i.fonte).toBe('stima')
    expect(i.valore).toBe(60000)
    expect(i.testo).toMatch(/stimati dall'inventario.*fino al 31\/08/)
  })
  it('una cassa di pochi giorni la usa, ma dice che è parziale', () => {
    expect(incassiDelMese({ cassa: { totV: 1100, giorni: 2 }, giorniDelMese: 30 }).testo).toMatch(/2 giorni su 30/)
  })
  it('senza niente: null, non zero, e il motivo', () => {
    const i = incassiDelMese({ cassa: null, stima: { ricavi: null, motivo: 'nessun dato di inventario nel periodo' } })
    expect(i.valore).toBeNull()
    expect(i.testo).toMatch(/nessuna chiusura di cassa e nessun dato di inventario/)
  })
})

describe('Il personale, com\'è davvero', () => {
  it('Mara: nessuno con lo stipendio fra gli attivi, e tre con lo stipendio segnati non attivi', () => {
    const p = personaleDelMese(DIPENDENTI_MARA, { mese: '2026-07' })
    expect(p.valore).toBeNull()
    expect(p.stato).toBe('manca')
    expect(p.testo).toMatch(/1 persona attiva senza stipendio/)
    expect(p.testo).toMatch(/3 persone con stipendio sono segnate non attive \(8\.039 € lordi al mese\)/)
  })
  it('con gli stipendi giusti il costo azienda c\'è', () => {
    const attivi = DIPENDENTI_MARA.map(d => ({ ...d, attivo: d.id !== 'g' }))
    const p = personaleDelMese(attivi, { mese: '2026-07' })
    expect(p.valore).toBeGreaterThan(8000) // costo azienda > lordo
    expect(p.stato).toBe('ok')
  })
  it('chi se n\'è andato con la data di fine non è «inattivo con stipendio»', () => {
    const p = personaleDelMese([{ attivo: false, stipendio_lordo_mensile: 2000, data_fine: '2026-03-31' }], { mese: '2026-07' })
    expect(p.inattivi).toBe(0)
  })
})

describe('Il conto del mese', () => {
  const incassi = { valore: 60000, fonte: 'stima' }
  const personale = { valore: 12000, stato: 'ok' }

  it('incassi − spese in fattura − personale = utile; investimenti fuori', () => {
    const c = contoDelMese({ incassi, costi: costi(), personale })
    expect(c.speseFatture).toBe(25500) // 25.000 per categoria + 500 da classificare
    expect(c.utile).toBe(22500)
    expect(c.investimenti).toBe(86651)
    expect(c.stimato).toBe(true)
  })

  it('le quote: materie prime, personale, prime cost', () => {
    const c = contoDelMese({ incassi, costi: costi(), personale })
    expect(c.quote.materiePrime).toBeCloseTo(30, 5)
    expect(c.quote.personale).toBeCloseTo(20, 5)
    expect(c.quote.primeCost).toBeCloseTo(50, 5)
  })

  it('senza personale l\'utile non si dà: sarebbe falso', () => {
    const c = contoDelMese({ incassi, costi: costi(), personale: { valore: null, stato: 'manca' } })
    expect(c.utile).toBeNull()
    // ma quanto resta prima del personale sì, col suo nome
    expect(c.primaDelPersonale).toBe(34500)
    expect(c.quote.personale).toBeNull()
    expect(motivoSenzaUtile(c, { personale: { valore: null }, costi: costi() })).toBe('manca il personale')
    expect(c.passi.find(p => p.chiave === 'personale').valore).toBeNull()
  })

  it('senza fatture lette non si inventano spese a zero', () => {
    const c = contoDelMese({ incassi, costi: null, personale })
    expect(c.utile).toBeNull()
    expect(c.speseFatture).toBeNull()
    expect(c.passi.find(p => p.chiave === 'materiePrime').valore).toBeNull()
  })

  it('le spese senza categoria si contano, a parte', () => {
    const c = contoDelMese({ incassi, costi: costi(), personale })
    expect(c.passi.find(p => p.chiave === 'daClassificare')).toMatchObject({ valore: 500, etichetta: 'Da classificare' })
  })

  it('una categoria che la pagina non conosce va in «Altre spese», non sparisce', () => {
    const k = costi()
    k.perCategoria.push({ id: 'formazione', nome: 'Formazione', tipo: 'costo', importo: 300 })
    const c = contoDelMese({ incassi, costi: k, personale })
    expect(c.gruppi.find(g => g.chiave === 'altre').importo).toBe(300)
    expect(c.utile).toBe(22200)
  })

  it('la cascata parte dagli incassi «stimati» e finisce sull\'utile', () => {
    const c = contoDelMese({ incassi, costi: costi(), personale })
    expect(c.passi[0]).toMatchObject({ etichetta: 'Incassi stimati', tipo: 'inizio', valore: 60000 })
    expect(c.passi.at(-1)).toMatchObject({ etichetta: 'Utile', tipo: 'fine', valore: 22500 })
    expect(titoloCascata(c)).toBe('Su 100 € incassati te ne restano 38')
  })

  it('in perdita il titolo lo dice', () => {
    const c = contoDelMese({ incassi: { valore: 20000 }, costi: costi(), personale })
    expect(titoloCascata(c)).toMatch(/il mese è in perdita/)
  })
})

describe('Perché è cambiato', () => {
  const incassi = (v) => ({ valore: v, fonte: 'cassa' })
  const personale = { valore: 12000, stato: 'ok' }
  it('le voci che spostano l\'utile, dalla più pesante, con i fornitori dentro', () => {
    const ora = contoDelMese({ incassi: incassi(62000), costi: costi(), personale })
    const prima = contoDelMese({
      incassi: incassi(60000), personale,
      costi: costi({ perCategoria: [
        { id: 'materie-prime', importo: 15660, fornitori: [{ nome: 'DESA SRL', importo: 7900 }, { nome: 'Vecchio Enrico', importo: 5900 }] },
        { id: 'confezionamento', importo: 4000, fornitori: [{ nome: 'CONO ARTIC', importo: 4000 }] },
        { id: 'utenze', importo: 2000, fornitori: [] },
        { id: 'commissioni', importo: 1000, fornitori: [] },
      ] }),
    })
    const cause = causeDelCambio(ora, prima)
    expect(cause.map(c => c.chiave)).toEqual(['materiePrime', 'incassi'])
    expect(cause[0].effetto).toBe(-2340)
    expect(fraseCausa(cause[0], '2025-07')).toBe('Materie prime: +2.340 € di spesa rispetto a luglio 2025, soprattutto DESA SRL (+1.100 €) e Vecchio Enrico (+100 €).')
    expect(fraseCausa(cause[1], '2025-07')).toBe('Hai incassato 2.000 € in più rispetto a luglio 2025.')
  })
  it('se un mese non ha il dato, quella voce non entra', () => {
    const ora = contoDelMese({ incassi: incassi(62000), costi: costi(), personale })
    const prima = contoDelMese({ incassi: { valore: null }, costi: null, personale: { valore: null } })
    expect(causeDelCambio(ora, prima)).toEqual([])
  })
  it('l\'utile si confronta solo se c\'è in tutti e due i mesi', () => {
    const a = contoDelMese({ incassi: incassi(62000), costi: costi(), personale })
    const b = contoDelMese({ incassi: incassi(60000), costi: costi(), personale })
    expect(confrontoUtile(a, b)).toMatchObject({ verso: 'meglio' })
    expect(confrontoUtile(a, { utile: null })).toBeNull()
  })
})
