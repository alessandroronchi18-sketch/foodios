// ── Una spesa di due negozi insieme ────────────────────────────────────
//
// Mara dei Boschi ha due account su Webdesk: uno con le fatture della
// Carlina, l'altro con quelle di Berthollet e De Gasperi **insieme**.
//
// Verificato il 17/09/2026 sui 142 documenti veri del secondo account: non
// c'è niente che distingua i due negozi — zero note, zero allegati, zero date
// di riferimento, 142 numeri tutti diversi. Due negozi dentro un account
// solo, e chi emette la fattura non lo sa.
//
// Erano **189.458 €** che non comparivano in nessuna pagina, perché ogni
// schermata ragiona per sede e quelle fatture una sede non ce l'hanno.
//
// Attribuirle a una delle due sarebbe stato inventare. La scelta del
// titolare: costo condiviso, diviso su quanto ogni negozio ha prodotto —
// la merce è stata consumata in proporzione al lavoro fatto.
//
// Questi test difendono le tre cose che tengono onesto quel conto: che le
// quote sommino sempre a uno, che «non lo so» resti dichiarato invece di
// diventare una metà finta, e che il ripartito non si confonda mai col
// fatturato.
import { describe, it, expect } from 'vitest'
import { quoteDiRipartizione, quotaDellaSede, totaliPerSede } from '../../src/lib/costiCondivisi.js'

// I numeri veri, misurati sul periodo di quelle fatture (12/05 → 10/09/2026).
const BERTHOLLET = 'af9f2192-6f7e-43c0-8980-a030dd0075ba'
const DE_GASPERI = 'bbb7554e-c65d-4653-b336-be29169598e5'
const CARLINA    = 'e0d3370b-f2d4-47c6-8395-e7ec617fd39a'
const PRODUZIONE = { [BERTHOLLET]: 6618.6, [DE_GASPERI]: 7304.5, [CARLINA]: 9667.9 }

describe('le quote, sui numeri veri di Mara', () => {
  it('De Gasperi ha prodotto di più, e prende la quota più grande', () => {
    const { quote, certa } = quoteDiRipartizione([BERTHOLLET, DE_GASPERI], PRODUZIONE)
    expect(quote[DE_GASPERI]).toBeCloseTo(0.525, 2)
    expect(quote[BERTHOLLET]).toBeCloseTo(0.475, 2)
    expect(certa).toBe(true)
  })

  it('sommano sempre a uno: non si perde né si inventa un euro', () => {
    const { quote } = quoteDiRipartizione([BERTHOLLET, DE_GASPERI], PRODUZIONE)
    expect(Object.values(quote).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('i 189.458 € si dividono in due cifre che tornano', () => {
    const tot = 189458.40
    const a = quotaDellaSede(tot, BERTHOLLET, [BERTHOLLET, DE_GASPERI], PRODUZIONE)
    const b = quotaDellaSede(tot, DE_GASPERI, [BERTHOLLET, DE_GASPERI], PRODUZIONE)
    expect(a.importo + b.importo).toBeCloseTo(tot, 6)
    // Le cifre attese si calcolano dal rapporto vero, non si scrivono a
    // memoria: un arrotondamento fatto a mente dentro un test e' un secondo
    // conto che puo' sbagliare per conto suo.
    const totKg = PRODUZIONE[BERTHOLLET] + PRODUZIONE[DE_GASPERI]
    expect(a.importo).toBeCloseTo(tot * PRODUZIONE[BERTHOLLET] / totKg, 6)
    expect(b.importo).toBeCloseTo(tot * PRODUZIONE[DE_GASPERI] / totKg, 6)
    // e in euro tondi, per chi legge: circa 90.063 e 99.395
    expect(Math.round(a.importo)).toBe(90063)
    expect(Math.round(b.importo)).toBe(99396)
  })
})

describe('quando non si sa, si dichiara invece di fingere', () => {
  it('senza produzione registrata si divide a metà, ma «certa» è falso', () => {
    const r = quoteDiRipartizione([BERTHOLLET, DE_GASPERI], {})
    expect(r.quote[BERTHOLLET]).toBeCloseTo(0.5, 10)
    expect(r.certa, 'metà e metà è una stima, non una misura').toBe(false)
    expect(r.criterio).toContain('nessuna produzione registrata')
  })

  it('e il criterio si legge, perché chi guarda il numero deve saperlo', () => {
    expect(quoteDiRipartizione([BERTHOLLET, DE_GASPERI], PRODUZIONE).criterio)
      .toBe('in proporzione ai chili prodotti')
  })

  it('una sede che non condivide riceve null, non zero', () => {
    // Zero vorrebbe dire «non le tocca niente». Null vuol dire «questa spesa
    // non la riguarda»: sono due cose diverse a schermo.
    expect(quotaDellaSede(1000, CARLINA, [BERTHOLLET, DE_GASPERI], PRODUZIONE)).toBeNull()
  })
})

describe('il ripartito non si confonde mai col fatturato', () => {
  const DOCUMENTI = [
    { totale: 1000, sede_id: CARLINA },
    { totale: 500, sede_id: CARLINA },
    { totale: 2000, sedi_condivise: [BERTHOLLET, DE_GASPERI] },
  ]

  it('due colonne separate: quello che è suo e quello che gli è stato diviso', () => {
    const t = totaliPerSede(DOCUMENTI, PRODUZIONE)
    expect(t[CARLINA].diretto).toBe(1500)
    expect(t[CARLINA].ripartito).toBe(0)
    expect(t[BERTHOLLET].diretto).toBe(0)
    const totKg = PRODUZIONE[BERTHOLLET] + PRODUZIONE[DE_GASPERI]
    expect(t[BERTHOLLET].ripartito).toBeCloseTo(2000 * PRODUZIONE[BERTHOLLET] / totKg, 6)
  })

  it('e si contano i documenti, non solo gli euro', () => {
    const t = totaliPerSede(DOCUMENTI, PRODUZIONE)
    expect(t[CARLINA].nDiretti).toBe(2)
    expect(t[DE_GASPERI].nRipartiti).toBe(1)
  })

  it('il totale ripartito su tutte le sedi fa esattamente l’importo', () => {
    const t = totaliPerSede(DOCUMENTI, PRODUZIONE)
    expect(t[BERTHOLLET].ripartito + t[DE_GASPERI].ripartito).toBeCloseTo(2000, 6)
  })

  it('se la ripartizione è a metà per mancanza di dati, la sede lo porta scritto', () => {
    const t = totaliPerSede([{ totale: 100, sedi_condivise: [BERTHOLLET, DE_GASPERI] }], {})
    expect(t[BERTHOLLET].stimato).toBe(true)
  })
})

describe('i casi storti non fanno danni', () => {
  it('un elenco vuoto non rompe niente', () => {
    expect(totaliPerSede([], PRODUZIONE)).toEqual({})
    expect(quoteDiRipartizione([], PRODUZIONE).quote).toEqual({})
  })

  it('una sola sede condivisa prende tutto, e non è una stima', () => {
    const r = quoteDiRipartizione([BERTHOLLET], PRODUZIONE)
    expect(r.quote[BERTHOLLET]).toBe(1)
    expect(r.certa).toBe(true)
  })

  it('un documento senza sede e senza condivisione resta fuori, non finisce a caso', () => {
    const t = totaliPerSede([{ totale: 999 }], PRODUZIONE)
    expect(Object.keys(t)).toHaveLength(0)
  })

  it('una produzione negativa o storta non produce quote assurde', () => {
    const r = quoteDiRipartizione([BERTHOLLET, DE_GASPERI], { [BERTHOLLET]: -5, [DE_GASPERI]: 5 })
    const somma = Object.values(r.quote).reduce((a, b) => a + b, 0)
    expect(somma).toBeCloseTo(1, 10)
  })
})
