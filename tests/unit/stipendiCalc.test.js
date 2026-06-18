// stipendiCalc — lordo↔netto IRPEF/INPS/INAIL/TFR (Italia 2024+).
// Critico per P&L Personale + Costi azienda. Audit 2026-06-17 MEDIUM: TFR su
// mensilita reali (era hardcoded 13.5).

import { describe, it, expect } from 'vitest'
import {
  lordoToNetto, nettoToLordo, costoAziendaMensile, calcolaStipendio,
} from '../../src/lib/stipendiCalc'

describe('lordoToNetto — stima IRPEF a scaglioni', () => {
  it('lordo 1500/mese × 13 → netto ragionevole (fascia bassa con detrazione)', () => {
    const netto = lordoToNetto(1500)
    // lordoAnnuo 19.500 → fascia 23% + detrazione (detrazione lineare a 19.5k)
    expect(netto).toBeGreaterThan(1100)
    expect(netto).toBeLessThan(1500)
  })

  it('lordo 3500/mese (fascia 35%) → netto ~58-68% del lordo', () => {
    const netto = lordoToNetto(3500)
    expect(netto).toBeGreaterThan(2100)
    expect(netto).toBeLessThan(2700)
  })

  it('lordo 8000/mese (fascia 43%) → tassazione marginale alta', () => {
    const netto = lordoToNetto(8000)
    // Fascia alta: rapporto netto/lordo scende
    expect(netto / 8000).toBeLessThan(0.60)
  })

  it('mensilita 14 (CCNL specifici) → annuo piu alto, netto/mese stesso ordine', () => {
    const netto13 = lordoToNetto(2000, { mensilita: 13 })
    const netto14 = lordoToNetto(2000, { mensilita: 14 })
    // Con 14 mensilita, l'annuo e' piu alto -> piu IRPEF -> netto/mese leggermente piu basso
    expect(netto14).toBeLessThan(netto13 + 50)
    expect(netto14).toBeGreaterThan(netto13 - 200)
  })
})

describe('nettoToLordo — bisezione inversa', () => {
  it('inverso esatto entro 1cent: lordoToNetto(nettoToLordo(N)) ≈ N', () => {
    for (const targetNetto of [1000, 1500, 2000, 2500, 3500]) {
      const lordo = nettoToLordo(targetNetto)
      const netto = lordoToNetto(lordo)
      expect(Math.abs(netto - targetNetto)).toBeLessThan(2) // tolerance 2 EUR
    }
  })

  it('netto 0 o negativo → 0', () => {
    expect(nettoToLordo(0)).toBe(0)
    expect(nettoToLordo(-100)).toBe(0)
  })

  it('mensilita custom propagata', () => {
    const lordo13 = nettoToLordo(1500, { mensilita: 13 })
    const lordo14 = nettoToLordo(1500, { mensilita: 14 })
    // Con 14 mensilita per ottenere lo stesso netto/mese serve lordo/mese piu alto
    // (perche annuo cresce -> IRPEF marginale + alta)
    expect(lordo14).toBeGreaterThan(lordo13 - 100)
  })
})

describe('costoAziendaMensile — INPS+INAIL+TFR', () => {
  it('include contributi ~30% + 2% INAIL + TFR 1/13.5', () => {
    const lordo = 2000
    const costo = costoAziendaMensile(lordo)
    // Annuo 26.000. Contributi 32% = 8.320. TFR 26000/13.5 = 1.926.
    // Costo annuo = 26000 + 8320 + 1926 = 36.246. /12 = 3.020.5
    expect(costo).toBeGreaterThan(2900)
    expect(costo).toBeLessThan(3100)
  })

  it('costo sempre > lordo (audit: contributi datore sono costo aggiuntivo)', () => {
    for (const lordo of [1200, 2000, 3500, 5000]) {
      const costo = costoAziendaMensile(lordo)
      expect(costo).toBeGreaterThan(lordo * 1.3)
    }
  })

  it('mensilita 14 propaga il calcolo TFR su mensilita reali (audit fix)', () => {
    const costo13 = costoAziendaMensile(2000, { mensilita: 13 })
    const costo14 = costoAziendaMensile(2000, { mensilita: 14 })
    // 14 mensilita = +7.7% di annuo => costo mensile piu alto
    expect(costo14).toBeGreaterThan(costo13)
  })
})

describe('calcolaStipendio — wrapper completo', () => {
  it('input solo lordo → ritorna netto + costoAzienda', () => {
    const r = calcolaStipendio({ lordo: 2000 })
    expect(r.lordo).toBe(2000)
    expect(r.netto).toBeGreaterThan(1300)
    expect(r.netto).toBeLessThan(2000)
    expect(r.costoAzienda).toBeGreaterThan(2500)
    expect(r.mensilita).toBe(13)
  })

  it('input solo netto → ritorna lordo + costoAzienda (inverso)', () => {
    const r = calcolaStipendio({ netto: 1400 })
    expect(r.lordo).toBeGreaterThan(1400)
    expect(r.netto).toBe(1400)
    expect(r.costoAzienda).toBeGreaterThan(r.lordo)
  })

  it('input vuoto → tutto 0', () => {
    const r = calcolaStipendio({})
    expect(r.lordo).toBe(0)
    expect(r.netto).toBe(0)
    expect(r.costoAzienda).toBe(0)
  })

  it('input invalido (NaN, string) → 0 senza crash', () => {
    expect(calcolaStipendio({ lordo: 'abc' }).lordo).toBe(0)
    expect(calcolaStipendio({ lordo: null }).lordo).toBe(0)
  })

  it('mensilita propagata al risultato', () => {
    const r = calcolaStipendio({ lordo: 2000, mensilita: 14 })
    expect(r.mensilita).toBe(14)
  })
})
