// @vitest-environment happy-dom
//
// ── La copertura chiusa dice che cosa, non solo quanti ──────────────────
//
// Dopo l'unione dei pezzi comuni (04/10) la copertura dei dati è un pulsante
// solo che riassume lo stato. Il suo riassunto nomina le voci che hanno un
// nome breve («Incassi stimati», «Inventario fermo al 31/08») e conta le
// altre. Le pagine non davano i nomi brevi: il Mese diceva «1 numero
// stimato · 3 dati da sistemare», e chi lo legge non sa quale numero è
// stimato (è l'incasso, il numero più importante della pagina). Le
// Previsioni con l'inventario vecchio dicevano «1 dato da sistemare» invece
// di «Inventario fermo al 31/08».
//
// Ora ogni voce della copertura ha il suo `breve`, e la riga chiusa nomina
// quello che serve.
import { describe, it, expect } from 'vitest'
import { riassuntoCopertura } from '../../src/components/analisi/CoperturaDati.jsx'
import { vociCopertura as vociMese } from '../../src/views/IlMeseView.jsx'
import { vociCopertura as vociPrevisioni } from '../../src/views/PrevisioniView.jsx'
import { vociCoperturaSpese } from '../../src/components/analisi/ClassificaSpese.jsx'
import { incassiDelMese, personaleDelMese } from '../../src/lib/ilMese.js'

const datiAgosto = () => ({
  mese: '2026-08',
  attuale: {
    incassi: incassiDelMese({ stima: { ricavi: 137000 } }),
    costi: {
      copertura: { nFatture: 76, nSenzaImponibile: 76, importoIvaCompresa: 50497, ultimaFattura: '2026-08-31' },
      daClassificare: { importo: 27190, nFornitori: 27 },
    },
    personale: personaleDelMese([{ attivo: true, stipendio_lordo_mensile: 0 }], { mese: '2026-08' }),
  },
})

describe('Il Mese (e il Conto, che usa le stesse voci)', () => {
  it('nomina gli incassi stimati, e conta i problemi quando sono più di due', () => {
    const voci = vociMese(datiAgosto(), { onNavigate: () => {}, onClassifica: () => {} })
    expect(voci.every(v => v.breve)).toBe(true)
    expect(riassuntoCopertura(voci)).toBe('Incassi stimati · 3 dati da sistemare')
  })

  it('con due problemi soli li nomina', () => {
    const d = datiAgosto()
    d.attuale.costi.daClassificare = { importo: 0 }
    const voci = vociMese(d, {})
    expect(riassuntoCopertura(voci)).toBe('Incassi stimati · Spese IVA compresa · Personale mancante')
  })
})

describe('Le Previsioni', () => {
  it('con l\'inventario vecchio lo dice: «Inventario fermo al 31/08»', () => {
    const voci = vociPrevisioni({ stato: 'vecchi', ultimoDato: '2026-08-31', giorniVecchi: 33 }, '2026-10-03', 'Carlina', () => {})
    expect(riassuntoCopertura(voci)).toBe('Inventario fermo al 31/08')
  })

  it('con i dati di ieri: la previsione è una stima, e si dice', () => {
    const voci = vociPrevisioni({ stato: 'ok', ultimoDato: '2026-10-02', giorniVecchi: 1, conte: { totale: 549, inaffidabili: 52 } }, '2026-10-03', 'Carlina', () => {})
    expect(riassuntoCopertura(voci)).toBe('Previsione stimata · Rimanenze a zero')
  })
})

describe('Le spese', () => {
  it('nomina le proposte da confermare e le fatture col solo totale', () => {
    const voci = vociCoperturaSpese({ nProposte: 35, senzaImponibile: 836, nFatture12: 861 })
    expect(riassuntoCopertura(voci)).toBe('35 voci proposte · Fatture col solo totale')
  })
})
