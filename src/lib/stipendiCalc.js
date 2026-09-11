// Calcolo lordo ↔ netto semplificato (Italia, scaglioni IRPEF 2024-2026).
//
// **NB IMPORTANTE**: calcolo APPROSSIMATIVO per il P&L. Tiene conto di:
//   - INPS dipendente 9,19% (commercio/servizi) — il commento diceva 9,49%
//     mentre il codice usa 9,19%: era il commento a sbagliare.
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

// ── Costo del personale di un'azienda, dal personale VERO ──────────────────
//
// Nasce da un difetto grosso. Il conto economico prendeva il costo del lavoro
// da un campo scritto a mano ("Personale" fra i costi fissi), separato dai
// dipendenti inseriti nella pagina Personale. Sul design partner quel campo
// era vuoto: il conto economico contava zero costo del lavoro con TRE
// dipendenti a libro paga (8.039 € lordi al mese in tutto), e l'utile
// risultava più alto di circa 11.700 € al mese. Nessun avviso: solo un utile
// bello e falso.
//
// `dipendenti` = righe della tabella dipendenti (serve stipendio_lordo_mensile,
// oppure costo_orario + ore_settimana per i contratti a ore).
// `opts.sedeId` = se passato, tiene i dipendenti di quella sede più quelli
// senza sede (che valgono per tutta l'azienda).
export function costoPersonaleMensile(dipendenti, opts = {}) {
  const { sedeId = null, mensilita = 13 } = opts
  let totale = 0, contati = 0, senzaDato = 0
  for (const d of (Array.isArray(dipendenti) ? dipendenti : [])) {
    if (!d || d.attivo === false) continue
    if (sedeId && d.sede_id && d.sede_id !== sedeId) continue
    const lordo = Number(d.stipendio_lordo_mensile) || 0
    if (lordo > 0) {
      totale += costoAziendaMensile(lordo, { mensilita })
      contati++
      continue
    }
    // Contratto a ore: il costo orario che il titolare scrive è già lordo,
    // e le ore settimanali diventano mensili con 4,333 settimane (52/12).
    const oraria = Number(d.costo_orario) || 0
    const ore = Number(d.ore_settimana) || 0
    if (oraria > 0 && ore > 0) {
      totale += costoAziendaMensile(oraria * ore * (52 / 12), { mensilita })
      contati++
      continue
    }
    // Un dipendente senza né stipendio né costo orario non si può contare, e
    // va DETTO: è la differenza fra "costa zero" e "non lo sappiamo".
    senzaDato++
  }
  return {
    totale: Math.round(totale * 100) / 100,
    contati,
    senzaDato,
  }
}
