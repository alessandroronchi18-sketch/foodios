// Costo del personale per il conto economico, calcolato dai dipendenti VERI.
//
// Il difetto che ha fatto nascere questa funzione è il più costoso trovato nel
// giro del 10-11/09/2026. Il conto economico prendeva il costo del lavoro da un
// campo scritto a mano ("Personale", fra i costi fissi), separato dai
// dipendenti inseriti nella pagina Personale. Sul design partner quel campo
// era VUOTO — non esisteva nemmeno la riga nel database — mentre in azienda ci
// sono tre dipendenti a libro paga per 8.038,82 € lordi al mese.
//
// Risultato: il conto economico contava zero costo del lavoro, e l'utile
// usciva più alto di circa 11.700 € al mese. Senza un avviso, senza un punto
// di domanda: solo un utile bello e falso. È il difetto ricorrente numero tre
// (dato mancante → zero → verdetto positivo), sui soldi.

import { describe, it, expect } from 'vitest'
import { costoPersonaleMensile, costoAziendaMensile } from '../../src/lib/stipendiCalc'

describe('costoPersonaleMensile', () => {
  it('somma il costo azienda dei dipendenti con stipendio lordo', () => {
    // I tre dipendenti veri del design partner.
    const dip = [
      { nome: 'Marco', attivo: true, stipendio_lordo_mensile: 2000 },
      { nome: 'Coco', attivo: true, stipendio_lordo_mensile: 4000 },
      { nome: 'Alessandro', attivo: true, stipendio_lordo_mensile: 2038.82 },
    ]
    const r = costoPersonaleMensile(dip)
    const atteso = costoAziendaMensile(2000) + costoAziendaMensile(4000) + costoAziendaMensile(2038.82)
    expect(r.totale).toBeCloseTo(atteso, 2)
    expect(r.contati).toBe(3)
    expect(r.senzaDato).toBe(0)
    // Il costo per l'azienda è molto più alto del lordo: contributi e TFR.
    expect(r.totale).toBeGreaterThan(8038.82)
  })

  it('gestisce i contratti a ore', () => {
    // 10 €/h × 20 h a settimana = 4,333 settimane al mese → 866,67 € lordi.
    const r = costoPersonaleMensile([
      { attivo: true, costo_orario: 10, ore_settimana: 20 },
    ])
    expect(r.contati).toBe(1)
    expect(r.totale).toBeCloseTo(costoAziendaMensile(10 * 20 * (52 / 12)), 2)
  })

  it('lo stipendio mensile vince sul costo orario quando ci sono entrambi', () => {
    const r = costoPersonaleMensile([
      { attivo: true, stipendio_lordo_mensile: 1500, costo_orario: 99, ore_settimana: 40 },
    ])
    expect(r.totale).toBeCloseTo(costoAziendaMensile(1500), 2)
  })

  it('conta a parte i dipendenti senza nessun dato, invece di dargli costo zero', () => {
    // "Non lo sappiamo" e "costa zero" sono due cose diverse, e la pagina deve
    // poter dire quale delle due.
    const r = costoPersonaleMensile([
      { nome: 'Anna', attivo: true, stipendio_lordo_mensile: 1800 },
      { nome: 'Bruno', attivo: true },
      { nome: 'Carla', attivo: true, costo_orario: 12 },   // senza le ore non basta
    ])
    expect(r.contati).toBe(1)
    expect(r.senzaDato).toBe(2)
    expect(r.totale).toBeCloseTo(costoAziendaMensile(1800), 2)
  })

  it('salta i non attivi', () => {
    const r = costoPersonaleMensile([
      { attivo: true, stipendio_lordo_mensile: 1000 },
      { attivo: false, stipendio_lordo_mensile: 9000 },
    ])
    expect(r.contati).toBe(1)
    expect(r.totale).toBeCloseTo(costoAziendaMensile(1000), 2)
  })

  it('con una sede scelta tiene quella e i dipendenti di tutta l azienda', () => {
    const dip = [
      { nome: 'Solo A', attivo: true, sede_id: 'A', stipendio_lordo_mensile: 1000 },
      { nome: 'Solo B', attivo: true, sede_id: 'B', stipendio_lordo_mensile: 2000 },
      { nome: 'Azienda', attivo: true, sede_id: null, stipendio_lordo_mensile: 3000 },
    ]
    const r = costoPersonaleMensile(dip, { sedeId: 'A' })
    expect(r.contati).toBe(2)   // Solo A + Azienda
    expect(r.totale).toBeCloseTo(costoAziendaMensile(1000) + costoAziendaMensile(3000), 2)
  })

  it('senza dipendenti torna zero, dichiarando che non ha contato nessuno', () => {
    expect(costoPersonaleMensile([])).toEqual({ totale: 0, contati: 0, senzaDato: 0 })
    expect(costoPersonaleMensile(null)).toEqual({ totale: 0, contati: 0, senzaDato: 0 })
  })
})

// ── Chi c'era in quel mese ────────────────────────────────────────────────
//
// Stesso problema dei costi aziendali: chi se n'è andato continuava a pesare
// sul costo del lavoro, e l'unico modo di toglierlo era metterlo NON ATTIVO —
// che però lo fa sparire anche dai mesi in cui lavorava davvero, facendoli
// sembrare più redditizi di quanto sono stati.
describe('costoPersonaleMensile — date di assunzione e di fine', () => {
  const gente = [
    { nome: 'Storico', attivo: true, stipendio_lordo_mensile: 2000, data_assunzione: '2024-01-01' },
    { nome: 'Andato via', attivo: true, stipendio_lordo_mensile: 1500, data_assunzione: '2024-01-01', data_fine: '2026-04-30' },
    { nome: 'Arrivato dopo', attivo: true, stipendio_lordo_mensile: 1800, data_assunzione: '2026-07-01' },
  ]

  it('a marzo c erano i primi due', () => {
    const r = costoPersonaleMensile(gente, { asOf: '2026-03-31' })
    expect(r.contati).toBe(2)
    expect(r.totale).toBeCloseTo(costoAziendaMensile(2000) + costoAziendaMensile(1500), 2)
  })

  it('a giugno ne resta uno: uno è andato via e l altro non è ancora arrivato', () => {
    const r = costoPersonaleMensile(gente, { asOf: '2026-06-30' })
    expect(r.contati).toBe(1)
    expect(r.totale).toBeCloseTo(costoAziendaMensile(2000), 2)
  })

  it('ad agosto sono due: lo storico e il nuovo', () => {
    const r = costoPersonaleMensile(gente, { asOf: '2026-08-31' })
    expect(r.contati).toBe(2)
    expect(r.totale).toBeCloseTo(costoAziendaMensile(2000) + costoAziendaMensile(1800), 2)
  })

  it('senza mese di riferimento si contano tutti, come prima', () => {
    // Le pagine che mostrano "quanto costa il personale adesso" non passano
    // una data: il comportamento non cambia.
    expect(costoPersonaleMensile(gente).contati).toBe(3)
  })
})
