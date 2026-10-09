// La fonte di ogni incasso e il controllo fra registro e scontrino (09/10/2026).
//
// Il difetto: per la stessa sede e lo stesso giorno, chi caricava per ultimo
// sovrascriveva i soldi dell'altro in silenzio, e nella chiusura non restava
// scritto da dove veniva la cifra. Con le 324 foto degli scontrini in arrivo
// sopra il registro di settembre, un registro caricato DOPO le foto avrebbe
// cancellato lo scontrino fiscale (che per il titolare è la cifra che vale).
// Regola del titolare: vince lo scontrino, il registro è il controllo,
// differenza oltre 1 € = «da guardare», ogni fonte lascia la sua cifra.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a) => fromMock(...a), rpc: vi.fn() },
}))

import { confrontaFonti, fondiFonti, controlloGiornata, giorniDaGuardare, fonteDellaChiusura } from '../../src/lib/confrontoFonti'
import { importaChiusureIncassi } from '../../src/lib/chiusure'

describe('confrontaFonti (tolleranza 1 €)', () => {
  it('giorno uguale: torna', () => {
    expect(confrontaFonti({ totale: 1411.3 }, { totale: 1411.3 })).toEqual({ stato: 'torna', differenza: 0 })
  })
  it('differenza di centesimi: torna', () => {
    expect(confrontaFonti({ totale: 1411.3 }, { totale: 1411.05 }).stato).toBe('torna')
  })
  it('esattamente 1 € torna, 1,01 € no', () => {
    expect(confrontaFonti({ totale: 100 }, { totale: 101 }).stato).toBe('torna')
    expect(confrontaFonti({ totale: 100 }, { totale: 101.01 }).stato).toBe('da-guardare')
  })
  it('differenza grande: da guardare, col segno (prima meno seconda)', () => {
    expect(confrontaFonti({ totale: 3641.3 }, { totale: 1411.3 })).toEqual({ stato: 'da-guardare', differenza: 2230 })
  })
  it('una fonte sola: niente da confrontare, mai «da guardare»', () => {
    expect(confrontaFonti({ totale: 500 }, null).stato).toBe('una-fonte')
    expect(confrontaFonti({ totale: 500 }, { totale: null }).stato).toBe('una-fonte')
  })
})

describe('fondiFonti: chi vince', () => {
  const foto = { totale: 1000, pos: 700, contanti: 300, delivery: 50, extra: { fonteTotale: 'foto' } }
  const registro = { totale: 1000, pos: 700, contanti: 300, delivery: null, extra: { fonte_incassi: 'registro', fonteTotale: 'registro' } }

  it('registro dopo la foto: il totale resta quello della foto e il registro va nel confronto', () => {
    const r = fondiFonti(foto, { totale: 1010 }, 'registro')
    expect(r.vince).toBe('vecchia')
    expect(r.fonteTotale).toBe('foto')
    expect(r.confrontoFonti.map(x => [x.fonte, x.totale]).sort()).toEqual([['foto', 1000], ['registro', 1010]])
  })
  it('foto dopo il registro: la foto prende il totale e la cifra del registro resta', () => {
    const r = fondiFonti(registro, { totale: 990 }, 'foto')
    expect(r.vince).toBe('nuova')
    expect(r.fonteTotale).toBe('foto')
    expect(r.confrontoFonti.find(x => x.fonte === 'registro').totale).toBe(1000)
  })
  it('stessa fonte ricaricata: aggiorna la sua cifra, non crea un secondo confronto', () => {
    const r = fondiFonti(registro, { totale: 1005 }, 'registro')
    expect(r.vince).toBe('nuova')
    expect(r.confrontoFonti).toHaveLength(1)
    expect(r.confrontoFonti[0].totale).toBe(1005)
  })
  it('giornata di prima senza fonte scritta: la sua cifra non si perde', () => {
    const r = fondiFonti({ totale: 800, extra: {} }, { totale: 900 }, 'registro')
    expect(r.confrontoFonti.map(x => x.fonte).sort()).toEqual(['manuale', 'registro'])
  })
  it('«cassa» (la prima trascrizione delle foto) vale come foto', () => {
    expect(fonteDellaChiusura({ fonteTotale: 'cassa' })).toBe('foto')
    expect(fonteDellaChiusura({ cassaImport: [{ fonte: 'foto-chiusura' }] })).toBe('foto')
  })
  it("l'ordine non cambia il risultato", () => {
    const a = fondiFonti(fondiFonti(null, { totale: 1000 }, 'registro') && { totale: 1000, extra: { fonteTotale: 'registro', confrontoFonti: [{ fonte: 'registro', totale: 1000 }] } }, { totale: 1002 }, 'foto')
    const b = fondiFonti({ totale: 1002, extra: { fonteTotale: 'foto', confrontoFonti: [{ fonte: 'foto', totale: 1002 }] } }, { totale: 1000 }, 'registro')
    expect(a.fonteTotale).toBe('foto')
    expect(b.fonteTotale).toBe('foto')
  })
})

describe('giorni da guardare', () => {
  const g = (data, fonti, extra = {}) => ({ data, fonteTotale: 'foto', confrontoFonti: fonti, ...extra })
  it('elenca solo i giorni con due cifre lontane, dal più pesante', () => {
    const els = giorniDaGuardare([
      g('2026-09-01', [{ fonte: 'foto', totale: 1000 }, { fonte: 'registro', totale: 1000.4 }]),
      g('2026-09-02', [{ fonte: 'foto', totale: 1000 }, { fonte: 'registro', totale: 1030 }]),
      g('2026-09-03', [{ fonte: 'foto', totale: 1000 }, { fonte: 'registro', totale: 1200 }]),
      g('2026-09-04', [{ fonte: 'foto', totale: 1000 }]),
      { data: '2026-09-05', fonteTotale: 'registro' },
    ])
    expect(els.map(x => x.data)).toEqual(['2026-09-03', '2026-09-02'])
    expect(els[0].differenza).toBe(-200)
  })
  it("la nota di annullo viaggia con la giornata", () => {
    const r = controlloGiornata(g('2026-09-03', [
      { fonte: 'foto', totale: 3641.3 },
      { fonte: 'registro', totale: 1411.3, nota: 'scontrino annullato da 2230,00 €' },
    ]))
    expect(r.stato).toBe('da-guardare')
    expect(r.nota).toMatch(/annullato/)
    expect(r.differenza).toBe(2230)
  })
})

function chain(rows) {
  const c = {
    select: vi.fn(() => c), eq: vi.fn(() => c), is: vi.fn(() => c), gte: vi.fn(() => c),
    lte: vi.fn(() => c), not: vi.fn(() => c),
    order: vi.fn(async () => ({ data: rows, error: null })),
    upsert: vi.fn(async () => ({ error: null })),
  }
  fromMock.mockReturnValue(c)
  return c
}
const RIGA = (extra, tot = 1000) => ({
  id: 'u1', data: '2026-09-10', tot_venduto: tot, tot_foodcost: 0, tot_margine: tot, tot_scarti: 0,
  margine_pct: 0, scontrino_medio: null, venduto: [], formati: [], extra, is_demo: false, legacy_id: null,
  incasso_pos: 700, incasso_contanti: 300, incasso_delivery: null,
})

describe('importaChiusureIncassi scrive la fonte', () => {
  beforeEach(() => fromMock.mockReset())

  it('giornata nuova dal registro: fonteTotale registro e la sua cifra nel confronto', async () => {
    const c = chain([])
    await importaChiusureIncassi('o', 's', [{ data: '2026-09-10', totale: 1000, pos: 700, contanti: 300 }])
    const riga = c.upsert.mock.calls[0][0][0]
    expect(riga.extra.fonteTotale).toBe('registro')
    expect(riga.extra.confrontoFonti).toEqual([expect.objectContaining({ fonte: 'registro', totale: 1000 })])
  })

  it('registro su una giornata con lo scontrino: NON sovrascrive i soldi (il difetto)', async () => {
    const c = chain([RIGA({ fonteTotale: 'cassa', solo_totale: true, foodcost_noto: false })])
    await importaChiusureIncassi('o', 's', [{ data: '2026-09-10', totale: 1050, pos: 750, contanti: 300 }])
    const riga = c.upsert.mock.calls[0][0][0]
    expect(riga.tot_venduto).toBe(1000)
    expect(riga.incasso_pos).toBe(700)
    expect(riga.extra.fonteTotale).toBe('foto')
    expect(riga.extra.confrontoFonti.map(x => x.fonte).sort()).toEqual(['foto', 'registro'])
    expect(riga.extra.confrontoFonti.find(x => x.fonte === 'registro').totale).toBe(1050)
    // le trascrizioni delle foto restano intere
    expect(riga.extra.solo_totale).toBe(true)
  })

  it('scontrino su una giornata del registro: prende il totale, il registro resta come controllo', async () => {
    const c = chain([RIGA({ fonte_incassi: 'registro', fonteTotale: 'registro' })])
    await importaChiusureIncassi('o', 's', [{ data: '2026-09-10', totale: 1020, pos: 720, contanti: 300 }], { fonte: 'foto' })
    const riga = c.upsert.mock.calls[0][0][0]
    expect(riga.tot_venduto).toBe(1020)
    expect(riga.extra.fonteTotale).toBe('foto')
    expect(riga.extra.confrontoFonti.find(x => x.fonte === 'registro').totale).toBe(1000)
  })
})
