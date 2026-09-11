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
// `opts.asOf` (ISO) = mese di riferimento: serve al conto economico di un
// periodo passato, per contare chi c'era ALLORA e non chi c'è adesso.
export function costoPersonaleMensile(dipendenti, opts = {}) {
  const { sedeId = null, mensilita = 13, asOf = null } = opts
  const mese = (d) => String(d).slice(0, 7)
  let totale = 0, contati = 0, senzaDato = 0
  for (const d of (Array.isArray(dipendenti) ? dipendenti : [])) {
    if (!d || d.attivo === false) continue
    if (sedeId && d.sede_id && d.sede_id !== sedeId) continue
    // Chi è stato assunto DOPO il mese guardato non pesa su quel mese, e chi
    // se n'è andato PRIMA nemmeno.
    //
    // Prima l'unico modo di togliere qualcuno era metterlo non attivo, che lo
    // fa sparire anche dai mesi in cui lavorava davvero: quei mesi
    // risultavano più redditizi di quanto siano stati.
    if (asOf) {
      if (d.data_assunzione && mese(d.data_assunzione) > mese(asOf)) continue
      if (d.data_fine && mese(d.data_fine) < mese(asOf)) continue
    }
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

// ── Costo del lavoro dai TURNI davvero lavorati ───────────────────────────
//
// Il conto economico usa lo stipendio mensile: è giusto per un contratto
// fisso, ma non dice se un mese di straordinari si è mangiato il margine, né
// quanto è costata davvero una settimana di ferragosto.
//
// I turni ci sono già (pagina Personale), con le ore pianificate e quelle
// effettive. Finora non alimentavano niente: si registravano e restavano lì.
//
// `turni`       = righe della tabella turni del periodo (con `ore` e `costo`)
// `dipendenti`  = per risalire al costo orario quando il turno non ce l'ha
export function costoLavoroDaTurni(turni, dipendenti, { da = null, a = null, mensilita = 13 } = {}) {
  const perId = new Map((Array.isArray(dipendenti) ? dipendenti : []).map(d => [d.id, d]))
  let costo = 0, ore = 0, turniContati = 0, turniSenzaCosto = 0, turniStimati = 0
  // I giorni DIVERSI con almeno un turno. Serve a chi legge per sapere se sta
  // guardando il costo di un mese o il costo di quattro giorni: su Mara ci
  // sono 4 turni registrati in un mese, e presentarli come "il costo del
  // personale del mese" sarebbe un numero falso di quindici volte.
  const giorni = new Set()
  for (const t of (Array.isArray(turni) ? turni : [])) {
    const d = String(t?.data || '').slice(0, 10)
    if (da && d < da) continue
    if (a && d > a) continue
    const oreTurno = Number(t?.ore) || 0
    if (oreTurno <= 0) continue
    ore += oreTurno
    giorni.add(d)
    // Il costo scritto sul turno vince; se manca si ricava dal costo orario
    // del dipendente. Se non c'è nemmeno quello il turno si conta a parte:
    // "non lo so" e "costa zero" sono due cose diverse, e un turno senza
    // costo abbassa il totale facendo sembrare il lavoro più economico.
    const costoTurno = Number(t?.costo) || 0
    if (costoTurno > 0) {
      costo += costoTurno
      turniContati++
      continue
    }
    const dip = perId.get(t?.dipendente_id)
    const oraria = Number(dip?.costo_orario) || 0
    if (oraria > 0) {
      costo += oraria * oreTurno
      turniContati++
      continue
    }
    // Terza strada: il costo orario ricavato dallo stipendio mensile.
    //
    // Serve davvero. Sui dati di Mara tutti e tre i dipendenti hanno lo
    // stipendio scritto (2.000, 4.000 e 2.038,82 € lordi) ma il costo orario
    // fermo a 0: senza questo passaggio i quattro turni registrati finivano
    // tutti fra quelli "senza costo" e la pagina non mostrava niente.
    //
    // È una stima, non una misura: il conto è costo azienda del mese diviso
    // le ore del mese da contratto (ore_settimana per 4,333 settimane). Chi
    // legge deve saperlo, perciò si contano a parte in `turniStimati`.
    const orariaStimata = costoOrarioDaStipendio(dip, mensilita)
    if (orariaStimata > 0) {
      costo += orariaStimata * oreTurno
      turniContati++
      turniStimati++
    } else {
      turniSenzaCosto++
    }
  }
  return {
    costo: Math.round(costo * 100) / 100,
    ore: Math.round(ore * 10) / 10,
    turniContati,
    turniSenzaCosto,
    turniStimati,
    giorni: giorni.size,
    costoOrarioMedio: ore > 0 && costo > 0 ? Math.round((costo / ore) * 100) / 100 : null,
  }
}

// Costo orario ricavato dallo stipendio mensile: costo azienda del mese
// (lordo + contributi + TFR) diviso le ore mensili da contratto.
// Torna 0 quando manca lo stipendio o le ore settimanali.
export function costoOrarioDaStipendio(d, mensilita = 13) {
  const lordo = Number(d?.stipendio_lordo_mensile) || 0
  const oreSett = Number(d?.ore_settimana) || 0
  if (lordo <= 0 || oreSett <= 0) return 0
  const oreMese = oreSett * (52 / 12)
  return Math.round((costoAziendaMensile(lordo, { mensilita }) / oreMese) * 100) / 100
}
