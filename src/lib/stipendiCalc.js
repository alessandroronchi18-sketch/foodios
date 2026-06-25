// Calcolo lordo ↔ netto semplificato (Italia, scaglioni IRPEF 2024-2026).
//
// **NB IMPORTANTE**: calcolo APPROSSIMATIVO per il P&L. Tiene conto di:
//   - INPS dipendente ~9.49% (commercio/servizi)
//   - IRPEF a scaglioni 2024+:
//       0-28k    23%
//       28k-50k  35%
//       oltre    43%
//   - Detrazione lavoro dipendente (semplificata)
//   - Addizionali regionali/comunali (approssimate al 2%)
//
// NON sostituisce un commercialista. NON include detrazioni familiari,
// benefit, premi, bonus, fringe benefit. Per il P&L aziendale e' utile.

const ALIQUOTA_INPS_DIPENDENTE = 0.0919   // dipendente commercio
const ADDIZIONALI_APPROX = 0.02

const SCAGLIONI_IRPEF = [
  { fino: 28000, aliq: 0.23 },
  { fino: 50000, aliq: 0.35 },
  { fino: Infinity, aliq: 0.43 },
]

// Detrazione lavoro dipendente semplificata 2024+:
// 1955 € se reddito ≤ 15.000; calo lineare fino a 0 a 50.000.
function detrazioneDipendente(redditoAnnuo) {
  if (redditoAnnuo <= 15000) return 1955
  if (redditoAnnuo >= 50000) return 0
  return 1955 * (1 - (redditoAnnuo - 15000) / 35000)
}

// Calcola IRPEF lorda annuale a scaglioni.
function calcIrpef(redditoImponibile) {
  let irpef = 0
  let res = redditoImponibile
  let prev = 0
  for (const s of SCAGLIONI_IRPEF) {
    const fascia = Math.min(s.fino, redditoImponibile) - prev
    if (fascia <= 0) break
    irpef += fascia * s.aliq
    prev = s.fino
    if (redditoImponibile <= s.fino) break
  }
  return Math.max(0, irpef)
}

// Lordo MENSILE -> Netto MENSILE (stima).
// Considera 13a mensilita' opzionale: parametri lordoMese assume base × 13.
// Default 13 mensilita' (comune in CCNL pubblici esercizi/commercio).
export function lordoToNetto(lordoMese, opts = {}) {
  const mensilita = opts.mensilita || 13
  const lordoAnnuo = lordoMese * mensilita
  const inps = lordoAnnuo * ALIQUOTA_INPS_DIPENDENTE
  const redditoImponibile = lordoAnnuo - inps
  const irpefLorda = calcIrpef(redditoImponibile)
  const detr = detrazioneDipendente(redditoImponibile)
  const irpefNetta = Math.max(0, irpefLorda - detr)
  const addizionali = redditoImponibile * ADDIZIONALI_APPROX
  const nettoAnnuo = lordoAnnuo - inps - irpefNetta - addizionali
  return Math.round(nettoAnnuo / mensilita * 100) / 100
}

// Netto MENSILE -> Lordo MENSILE (stima inversa, bisezione).
// Iteriamo perché la mappatura netto<->lordo non e' chiusa in forma analitica.
export function nettoToLordo(nettoMese, opts = {}) {
  if (!(nettoMese > 0)) return 0
  let low = nettoMese  // lower bound: lordo >= netto
  let high = nettoMese * 2.2  // upper bound generoso (per fascia alta)
  // Bisezione 30 iter -> precisione < 0.01 €
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2
    const calcNetto = lordoToNetto(mid, opts)
    if (Math.abs(calcNetto - nettoMese) < 0.01) return Math.round(mid * 100) / 100
    if (calcNetto < nettoMese) low = mid; else high = mid
  }
  return Math.round((low + high) / 2 * 100) / 100
}

// Costo totale per l'azienda (lordo + contributi datore di lavoro INPS+INAIL).
// Approssimato: INPS datore ~30%, INAIL ~1-3% (ristorazione media ~2%).
const ALIQUOTA_INPS_DATORE = 0.30
const ALIQUOTA_INAIL = 0.02
export function costoAziendaMensile(lordoMese, opts = {}) {
  const mensilita = opts.mensilita || 13
  const lordoAnnuo = lordoMese * mensilita
  // Audit 2026-06-17 MEDIUM: TFR si accantona su tutte le mensilità reali.
  // Prima si divideva per 13.5 fisso + * 12, ignorando opts.mensilita: con 14
  // mensilità il TFR risultava sottostimato.
  const tfrAnnuo = lordoAnnuo / 13.5
  const contributi = lordoAnnuo * (ALIQUOTA_INPS_DATORE + ALIQUOTA_INAIL)
  return Math.round((lordoAnnuo + contributi + tfrAnnuo) / 12 * 100) / 100
}

// Wrapper informativo: ritorna { lordo, netto, costoAzienda } da uno qualunque.
export function calcolaStipendio({ lordo, netto, mensilita = 13 } = {}) {
  let lordoMese = Number(lordo) || 0
  let nettoMese = Number(netto) || 0
  if (lordoMese > 0 && nettoMese === 0) nettoMese = lordoToNetto(lordoMese, { mensilita })
  else if (nettoMese > 0 && lordoMese === 0) lordoMese = nettoToLordo(nettoMese, { mensilita })
  const costoAzienda = lordoMese > 0 ? costoAziendaMensile(lordoMese, { mensilita }) : 0
  return { lordo: lordoMese, netto: nettoMese, costoAzienda, mensilita }
}
