// Quanto gelato si venderà domani, gusto per gusto, e quando finisce quello
// che c'è in vetrina.
//
// ── Perché esiste (audit del 03/10/2026, voto della pagina 15/100) ─────────
//
// La pagina Previsioni prevedeva gli impasti PRODOTTI, mese per mese, con un
// metodo di Holt su quattro punti, e ne ricavava il numero del giorno. Rifatta
// giorno per giorno sui dati veri di Mara dei Boschi sbagliava del 51-110% per
// gusto e giorno, la banda «70-90%» conteneva il reale una volta su cinque, e
// una media delle ultime settimane faceva meglio della metà. Prevedere la
// produzione passata insegna a rifare gli errori di ieri: se oggi si produce
// troppo, il modello insegna a produrre troppo.
//
// Qui si prevede il VENDUTO, in kg, per gusto e per sede, con il metodo più
// semplice che regge alla prova. Ogni numero che esce da questo file porta con
// sé l'errore che lo stesso metodo ha fatto davvero nelle ultime quattro
// settimane, e la banda «fra X e Y» si ricava da quegli errori, non dalla
// dispersione della serie.
//
// ── Il difetto dei dati che decide il metodo ───────────────────────────────
//
// Nel giorno in cui si produce, la rimanenza del gusto viene spesso scritta 0:
// la casella non è stata compilata, non è la vetrina vuota (audit del
// 16/09/2026: 658 rimanenze a zero su 660 hanno produzione lo stesso giorno).
// Il venduto di quel giorno esce gonfiato e quello del giorno dopo negativo:
// FONDENTE a De Gasperi l'11/08 fa 13,3 kg e il 12/08 -7,8 kg. Sull'intera
// sede, il 23/07 De Gasperi «vende» -73 kg. Sui due giorni insieme il conto
// torna (5,5 kg): l'errore si annulla perché ogni rimanenza esce da un giorno
// ed entra nel successivo.
//
// Quindi il ritmo di vendita si misura FRA DUE CONTE AFFIDABILI della vetrina,
// non sommando i venduti giorno per giorno: quello che c'è in mezzo può essere
// sbagliato quanto vuole, i chili venduti fra le due conte restano giusti. E
// come «venduto vero di un giorno», per misurare gli errori, si usano solo le
// giornate che partono e finiscono con una conta affidabile.
//
// ── Il metodo (provato sul backtest di luglio e agosto, vedi in fondo) ─────
//
//   previsto(gusto, giorno) = ritmo degli ultimi 7 giorni
//                             × fattore del giorno della settimana
//                             × correzione delle ultime 2 settimane
//
// - ritmo: kg venduti fra due conte affidabili lontane circa una settimana,
//   divisi per i giorni in cui il gusto era in vetrina;
// - fattore del giorno: per tutta la sede, quanto il sabato (o il lunedì) vende
//   più o meno del ritmo, misurato sulle ultime 8 settimane;
// - correzione: se nelle ultime due settimane la sede ha venduto in generale
//   più (o meno) del previsto, se ne tiene conto (mediana, fra 0,7 e 1,4).
//
// La banda dichiara «8 volte su 10» e si controlla da sola: se nelle due
// settimane prima il reale ci è caduto dentro meno spesso, si allarga.
//
// Provati e scartati perché non miglioravano l'errore: media e mediana dello
// stesso giorno della settimana nelle ultime 4-8 settimane, ritmo su 5, 10 o
// 14 giorni, correzione per il meteo (su luglio e agosto a Torino 30-38 gradi
// quasi ogni giorno: ±1 punto, a caso), festività (un solo festivo nelle
// finestre, e due sedi su tre chiuse: non misurabile). I numeri sono nel
// rapporto del 03/10/2026 (`scratchpad/prev/btlib.mjs` li rifà).

import { serieVendutoGusto } from './inventarioProduzione'

export const GIORNI_RITMO = 7
export const SETTIMANE_FATTORI = 8
export const GIORNI_BACKTEST = 28
export const GIORNI_DATI_VECCHI = 7
export const LIVELLO_BANDA = 0.8
export const LIVELLO_BANDA_MAX = 0.96
export const GIORNI_CORREZIONE = 14
export const GIORNI_CONTROLLO_BANDA = 14
const CORREZIONE_MIN = 0.7
const CORREZIONE_MAX = 1.4
// Sotto questi numeri un fattore o una banda per gusto si legge nel rumore.
const MIN_CELLE_FATTORE = 12
const MIN_ERRORI_GUSTO = 12
const MIN_CONTROLLI_BANDA = 30
// Dove si cerca la conta di partenza del ritmo: fino a una settimana oltre i
// GIORNI_RITMO, e non meno di 3 giorni prima della conta di arrivo.
const MIN_GIORNI_RITMO = 3
const ORIZZONTE_FINE = 14

// ── Date senza fuso orario ────────────────────────────────────────────────
function utc(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export function piuGiorni(iso, n) {
  const dt = new Date(utc(iso) + n * 86400000)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
export function giorniFra(da, a) {
  return Math.round((utc(a) - utc(da)) / 86400000)
}
/** 0 = domenica … 6 = sabato. */
export function giornoSettimana(iso) {
  return new Date(utc(iso)).getUTCDay()
}

function quantile(valori, q) {
  if (!valori.length) return null
  const s = [...valori].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
function mediana(valori) { return quantile(valori, 0.5) }

// ── 1. Le celle, con la conta della vetrina giudicata ─────────────────────

/**
 * La conta della vetrina di questo giorno è affidabile?
 *
 * Non lo è se non è stata scritta (null) o se vale zero in un giorno in cui il
 * gusto è stato prodotto: è la firma della casella lasciata vuota.
 */
export function contaAffidabile(cella) {
  if (!cella || cella.riman == null) return false
  return !(Number(cella.riman) === 0 && Number(cella.prod) > 0)
}

/**
 * Celle del venduto per gusto, in kg, a partire dalle righe dell'inventario di
 * UNA sede. Il venduto lo calcola il motore dell'inventario
 * (`serieVendutoGusto` → `cellaVenduto`): qui non c'è una quinta copia della
 * formula, solo il giudizio su quali giornate sono misurate bene.
 *
 * Ritorna { [gusto]: { date: [iso ordinate], celle: { [iso]: cella } } } con
 *   cella = { prod, riman, mov, conta, venduto, pulito }
 *   - mov:     kg entrati meno usciti senza vendita (prodotto + ricevuto
 *              - scarto - spedito)
 *   - conta:   la rimanenza di fine giornata è affidabile
 *   - venduto: il venduto del giorno come lo calcola l'inventario (kg, può
 *              essere null o negativo)
 *   - pulito:  il venduto di questo giorno è misurato bene: parte da una conta
 *              affidabile del giorno prima e finisce con una conta affidabile
 */
export function preparaGusti(righe) {
  const out = {}
  if (!Array.isArray(righe) || righe.length === 0) return out
  for (const [gusto, celle] of Object.entries(serieVendutoGusto(righe))) {
    const perData = {}
    const date = []
    let prec = null
    for (const c of celle) {
      const kg = x => (Number(x) || 0) / 1000
      const cella = {
        prod: kg(c.prod),
        riman: c.riman == null ? null : kg(c.riman),
        mov: kg(c.prod) + kg(c.ricevuto) - kg(c.scarto) - kg(c.spedito),
        venduto: c.venduto == null ? null : c.venduto / 1000,
      }
      cella.conta = contaAffidabile(cella)
      // La giornata è misurata bene solo se copre UN giorno (il giorno prima è
      // registrato) e le due conte agli estremi sono affidabili.
      const giornoPrima = prec && giorniFra(prec.data, c.data) === 1
      cella.pulito = cella.venduto != null && cella.venduto >= 0
        && cella.conta && !!giornoPrima && prec.cella.conta
      perData[c.data] = cella
      date.push(c.data)
      prec = { data: c.data, cella }
    }
    out[gusto] = { date, celle: perData }
  }
  return out
}

/**
 * Kg venduti fra la conta di fine giornata `da` e quella di fine giornata `a`.
 * È la stessa regola del venduto giornaliero sommata sui giorni in mezzo: le
 * rimanenze intermedie si annullano, e con loro gli errori di compilazione.
 * null se una delle due conte non è affidabile.
 */
export function vendutoFraConte(G, da, a) {
  const cDa = G?.celle?.[da], cA = G?.celle?.[a]
  if (!contaAffidabile(cDa) || !contaAffidabile(cA) || da >= a) return null
  let mov = 0
  for (let d = piuGiorni(da, 1); d <= a; d = piuGiorni(d, 1)) mov += G.celle[d]?.mov || 0
  return cDa.riman + mov - cA.riman
}

/** Ultima data con una conta affidabile prima di `giorno` (entro `entro` giorni). */
export function ultimaConta(G, giorno, entro = GIORNI_DATI_VECCHI) {
  for (let k = 1; k <= entro; k++) {
    const d = piuGiorni(giorno, -k)
    if (contaAffidabile(G?.celle?.[d])) return d
  }
  return null
}

// ── 2. Il ritmo ───────────────────────────────────────────────────────────

/**
 * Kg al giorno venduti negli ultimi ~7 giorni, con i soli dati PRIMA di
 * `giorno`. Il divisore sono i giorni in cui il gusto era in vetrina (aveva
 * una riga): un gusto tolto per tre giorni non vende di meno quando c'è.
 *
 * Ritorna { kgGiorno, da, a, kg, giorni } o null se mancano le conte.
 */
export function ritmoGusto(G, giorno, { giorni = GIORNI_RITMO } = {}) {
  const fine = ultimaConta(G, giorno, GIORNI_DATI_VECCHI)
  if (!fine) return null
  let inizio = null
  for (let k = giorni; k <= giorni + 7 && !inizio; k++) {
    const d = piuGiorni(fine, -k)
    if (contaAffidabile(G.celle[d])) inizio = d
  }
  for (let k = giorni - 1; k >= MIN_GIORNI_RITMO && !inizio; k--) {
    const d = piuGiorni(fine, -k)
    if (contaAffidabile(G.celle[d])) inizio = d
  }
  if (!inizio) return null
  const kg = vendutoFraConte(G, inizio, fine)
  if (kg == null) return null
  let inVetrina = 0
  for (let d = piuGiorni(inizio, 1); d <= fine; d = piuGiorni(d, 1)) if (G.celle[d]) inVetrina++
  if (!inVetrina) return null
  return { kgGiorno: Math.max(0, kg) / inVetrina, da: inizio, a: fine, kg, giorni: inVetrina }
}

// ── 3. Il contesto di una sede: ritmi, fattori, previsioni, backtest ──────

/**
 * Tutto quello che serve per prevedere una sede, con i conti ricordati: il
 * backtest di un gusto chiede il ritmo di 28 giorni passati, e i fattori del
 * giorno lo chiedono per 56 giorni di tutti i gusti.
 *
 * Ogni funzione con una `base` guarda SOLO i giorni prima della base: per
 * questo un contesto costruito su tutti i dati si può interrogare su un giorno
 * passato senza che il futuro entri nel conto (il backtest lo fa così).
 *
 * Le opzioni servono al backtest che confronta le varianti; la pagina usa i
 * default: `giorniRitmo` (7), `fattoreGiorno` (sì), `correzioneRecente` (sì),
 * `bandaAdattiva` (sì).
 */
export function creaContesto(righe, opzioni = {}) {
  const giorniRitmo = opzioni.giorniRitmo || GIORNI_RITMO
  const usaFattore = opzioni.fattoreGiorno !== false
  const usaCorrezione = opzioni.correzioneRecente !== false
  const usaAdattiva = opzioni.bandaAdattiva !== false
  const gusti = preparaGusti(righe)
  const memoRitmo = new Map()
  const memoFattori = new Map()
  const memoErrori = new Map()
  const memoCorrezione = new Map()
  const memoRapportiSede = new Map()
  const memoLivello = new Map()

  const ritmo = (gusto, giorno) => {
    const k = `${gusto}|${giorno}`
    if (!memoRitmo.has(k)) memoRitmo.set(k, gusti[gusto] ? ritmoGusto(gusti[gusto], giorno, { giorni: giorniRitmo }) : null)
    return memoRitmo.get(k)
  }

  // Quanto ogni giorno della settimana vende rispetto al ritmo, per la sede
  // intera: Σ venduto delle giornate pulite ÷ Σ ritmo atteso in quelle
  // giornate. Un fattore misurato su poche giornate resta 1 (non lo so).
  const fattori = giorno => {
    if (!usaFattore) return Array(7).fill(1)
    if (memoFattori.has(giorno)) return memoFattori.get(giorno)
    const num = Array(7).fill(0), den = Array(7).fill(0), n = Array(7).fill(0)
    for (const [gusto, G] of Object.entries(gusti)) {
      for (let k = 1; k <= 7 * SETTIMANE_FATTORI; k++) {
        const d = piuGiorni(giorno, -k)
        const c = G.celle[d]
        if (!c || !c.pulito) continue
        const r = ritmo(gusto, d)
        if (!r || !(r.kgGiorno > 0)) continue
        const w = giornoSettimana(d)
        num[w] += c.venduto; den[w] += r.kgGiorno; n[w]++
      }
    }
    const f = num.map((x, w) => (n[w] >= MIN_CELLE_FATTORE && den[w] > 0) ? x / den[w] : 1)
    memoFattori.set(giorno, f)
    return f
  }

  // Ritmo × fattore del giorno, senza la correzione recente.
  const prevedi0 = (gusto, base, giorno) => {
    const r = ritmo(gusto, base)
    if (!r) return null
    return r.kgGiorno * fattori(base)[giornoSettimana(giorno)]
  }

  // ── La correzione recente ──────────────────────────────────────────────
  // Se nelle ultime due settimane la sede ha venduto, gusto per gusto, il 12%
  // più di quanto il ritmo diceva (il ritorno dalle ferie a fine agosto), la
  // previsione si alza del 12%. È la mediana dei rapporti reale/previsto di
  // tutti i gusti, quindi un gusto impazzito non la sposta; e resta fra 0,7 e
  // 1,4 perché una correzione più grande vorrebbe dire che c'è qualcosa di
  // rotto nei dati, non nel mondo. Sul backtest: -1/-2 punti di errore su
  // cinque finestre su sei, nessun peggioramento.
  const correzione = base => {
    if (!usaCorrezione) return 1
    if (memoCorrezione.has(base)) return memoCorrezione.get(base)
    const r = []
    for (const [gusto, G] of Object.entries(gusti)) {
      for (let k = 1; k <= GIORNI_CORREZIONE; k++) {
        const d = piuGiorni(base, -k)
        const c = G.celle[d]
        if (!c || !c.pulito) continue
        const p = prevedi0(gusto, d, d)
        if (p > 0) r.push(c.venduto / p)
      }
    }
    const k = r.length >= MIN_CELLE_FATTORE
      ? Math.min(CORREZIONE_MAX, Math.max(CORREZIONE_MIN, mediana(r)))
      : 1
    memoCorrezione.set(base, k)
    return k
  }

  /** Kg previsti per `giorno` con i dati fino al giorno prima di `base`. */
  const prevedi = (gusto, base, giorno = base) => {
    const p = prevedi0(gusto, base, giorno)
    return p == null ? null : p * correzione(base)
  }

  // Il backtest automatico: per ogni giornata pulita delle ultime 4 settimane,
  // cosa avrebbe detto il metodo con i soli dati fino al giorno prima.
  const errori = (gusto, base) => {
    const k = `${gusto}|${base}`
    if (memoErrori.has(k)) return memoErrori.get(k)
    const out = []
    const G = gusti[gusto]
    if (G) {
      for (let i = GIORNI_BACKTEST; i >= 1; i--) {
        const d = piuGiorni(base, -i)
        const c = G.celle[d]
        if (!c || !c.pulito) continue
        const p = prevedi(gusto, d, d)
        if (p == null) continue
        out.push({ data: d, previsto: p, reale: c.venduto })
      }
    }
    memoErrori.set(k, out)
    return out
  }

  // Gli scarti di tutta la sede: servono alla banda dei gusti con poca storia.
  const rapportiSede = base => {
    if (memoRapportiSede.has(base)) return memoRapportiSede.get(base)
    const r = rapporti(Object.keys(gusti).flatMap(g => errori(g, base)))
    memoRapportiSede.set(base, r)
    return r
  }

  const bandaNominale = (gusto, base, previsto, livello = LIVELLO_BANDA) =>
    bandaDaErrori(previsto, rapporti(errori(gusto, base)), rapportiSede(base), livello)

  // ── La banda che si controlla da sola ──────────────────────────────────
  // La banda dichiara «8 volte su 10». Si va a vedere, sulle due settimane
  // prima, quante volte il reale ci è caduto dentro davvero; se meno di 8 su
  // 10, la si allarga quanto serve (fino a 96 su 100), mai la si stringe. Senza
  // questo controllo, ad agosto a De Gasperi la banda «8 su 10» conteneva il
  // reale una volta su due: le settimane di prima, calme, la facevano stretta,
  // e il ritorno dalle ferie la sfondava.
  const livelloBanda = base => {
    if (!usaAdattiva) return LIVELLO_BANDA
    if (memoLivello.has(base)) return memoLivello.get(base)
    let dentro = 0, tot = 0
    for (let k = 1; k <= GIORNI_CONTROLLO_BANDA; k++) {
      const d = piuGiorni(base, -k)
      for (const [gusto, G] of Object.entries(gusti)) {
        const c = G.celle[d]
        if (!c || !c.pulito) continue
        const b = bandaNominale(gusto, d, prevedi(gusto, d, d))
        if (!b) continue
        tot++
        if (c.venduto >= b.basso && c.venduto <= b.alto) dentro++
      }
    }
    const liv = tot >= MIN_CONTROLLI_BANDA
      ? Math.min(LIVELLO_BANDA_MAX, Math.max(LIVELLO_BANDA, LIVELLO_BANDA + (LIVELLO_BANDA - dentro / tot)))
      : LIVELLO_BANDA
    memoLivello.set(base, liv)
    return liv
  }

  /** La banda «fra X e Y» di una previsione fatta il giorno `base`. */
  const banda = (gusto, base, previsto) => bandaNominale(gusto, base, previsto, livelloBanda(base))

  return { gusti, ritmo, fattori, correzione, prevedi, errori, rapportiSede, livelloBanda, banda }
}

// ── 4. Banda ed errore passato, dagli errori veri ─────────────────────────

/**
 * Rapporti reale/previsto di una lista di errori (solo dove il previsto è
 * positivo: un rapporto su zero non dice niente).
 */
export function rapporti(errori) {
  return (errori || []).filter(e => e.previsto > 0).map(e => e.reale / e.previsto)
}

/**
 * La banda «fra X e Y» di una previsione: i quantili 10% e 90% di quanto il
 * reale si è discostato dal previsto nelle settimane passate. Con pochi errori
 * del gusto si usano quelli di tutta la sede (`rapportiSede`).
 */
export function bandaDaErrori(previsto, rapportiGusto, rapportiSede = [], livello = LIVELLO_BANDA) {
  if (previsto == null) return null
  const fonte = (rapportiGusto || []).length >= MIN_ERRORI_GUSTO ? rapportiGusto : rapportiSede
  if (!fonte || fonte.length < MIN_ERRORI_GUSTO) return null
  const coda = (1 - livello) / 2
  return {
    basso: Math.max(0, previsto * quantile(fonte, coda)),
    alto: Math.max(0, previsto * quantile(fonte, 1 - coda)),
    daSede: fonte !== rapportiGusto,
  }
}

/**
 * «Di solito sbaglio di ±X%»: errore assoluto totale ÷ venduto totale delle
 * giornate provate. Ritorna { pct, kgGiorno, giorni } o null.
 */
export function errorePassato(errori) {
  const e = errori || []
  if (!e.length) return null
  const reale = e.reduce((s, x) => s + x.reale, 0)
  const abs = e.reduce((s, x) => s + Math.abs(x.reale - x.previsto), 0)
  return {
    pct: reale > 0 ? abs / reale : null,
    kgGiorno: abs / e.length,
    giorni: e.length,
  }
}

// ── 5. Scorta, lotti, quando finisce ──────────────────────────────────────

/**
 * Quanto ne resta in vetrina alla fine dell'ultimo giorno registrato.
 * Se quell'ultima conta non è affidabile (la casella a zero nel giorno di
 * produzione) la si stima dall'ultima conta buona, più quello che è entrato,
 * meno il previsto: e lo si dice.
 */
export function scortaGusto(ctx, gusto, ultimoGiorno) {
  const G = ctx.gusti[gusto]
  const c = G?.celle?.[ultimoGiorno]
  if (!c) return null
  if (c.conta) return { kg: c.riman, data: ultimoGiorno, stimata: false }
  const buona = ultimaConta(G, ultimoGiorno, GIORNI_DATI_VECCHI)
  if (!buona) return null
  let kg = G.celle[buona].riman
  for (let d = piuGiorni(buona, 1); d <= ultimoGiorno; d = piuGiorni(d, 1)) {
    const p = ctx.prevedi(gusto, piuGiorni(buona, 1), d)
    if (p == null) return null
    kg += (G.celle[d]?.mov || 0) - (G.celle[d] ? p : 0)
  }
  return { kg: Math.max(0, kg), data: ultimoGiorno, stimata: true, daConta: buona }
}

/** Quanto se ne fa di solito in una volta: mediana delle produzioni recenti. */
export function lottoTipico(G, giorno, giorni = GIORNI_BACKTEST) {
  const prod = []
  for (let k = 1; k <= giorni; k++) {
    const c = G?.celle?.[piuGiorni(giorno, -k)]
    if (c && c.prod > 0) prod.push(c.prod)
  }
  return prod.length ? { kg: mediana(prod), volte: prod.length } : null
}

/**
 * Il primo giorno in cui il previsto cumulato supera la scorta. I giorni di
 * chiusura non consumano niente. null se la scorta basta oltre l'orizzonte.
 */
export function quandoFinisce(scortaKg, previstoDelGiorno, primoGiorno, { chiuso = () => false, orizzonte = ORIZZONTE_FINE } = {}) {
  if (scortaKg == null) return null
  let resta = scortaKg
  for (let i = 0; i < orizzonte; i++) {
    const d = piuGiorni(primoGiorno, i)
    if (chiuso(d)) continue
    const p = previstoDelGiorno(d)
    if (p == null) return null
    resta -= p
    if (resta <= 0) return d
  }
  return null
}

// ── 6. La previsione di una sede, pronta per la pagina ────────────────────

/**
 * L'ultimo giorno davvero registrato: almeno una riga con produzione o
 * rimanenza maggiore di zero. Una riga tutta a zero è una casella lasciata
 * aperta nel foglio (a Carlina due righe «ABIS» del 07/09 e del 15/09, senza
 * un grammo, facevano sembrare i dati aggiornati a settembre).
 */
export function ultimoGiornoRegistrato(righe) {
  let max = null
  for (const r of righe || []) {
    if (!r?.data) continue
    if (!((Number(r.produzione_g) || 0) > 0 || (Number(r.rimanenza_g) || 0) > 0)) continue
    if (!max || r.data > max) max = r.data
  }
  return max
}

/**
 * Cosa preparare, per una sede.
 *
 * righe:  inventario della sede (servono ~12 settimane prima dell'ultimo dato)
 * oggi:   data ISO di oggi
 * giorni: quanti giorni aperti prevedere da oggi (o da domani, se i dati di
 *         oggi sono già scritti); default 3
 * chiuso: (iso) => bool, i giorni in cui la sede è chiusa
 * base:   per guardare la previsione come sarebbe stata in un giorno passato:
 *         si usano solo le righe prima di `base` (la pagina lo usa per far
 *         vedere com'era l'ultima previsione possibile quando i dati sono
 *         vecchi, dichiarandolo)
 *
 * Ritorna {
 *   stato: 'vuoto' | 'vecchi' | 'ok',
 *   ultimoDato, giorniVecchi, base, giorniPrevisti: [iso], simulata,
 *   gusti: [{ gusto, previsti: [{data, kg, basso, alto, bandaDaSede}], ritmo,
 *             errore, scorta, finisce, lotto }]  ordinati per urgenza,
 *   erroreSede: { pct, kgGiorno, giorni }, livelloBanda, correzione
 * }
 *
 * Con dati più vecchi di GIORNI_DATI_VECCHI lo stato è 'vecchi' e i gusti
 * sono vuoti: la vetrina di oggi non si conosce e un numero sarebbe inventato.
 * La scorta e il giorno in cui finisce si danno solo se l'ultima conta è di
 * ieri o di oggi: con due giorni in mezzo non si sa cosa è stato prodotto.
 */
export function previsioneSede(righe, { oggi, giorni = 3, chiuso = () => false, base: baseForzata = null, opzioni = {} } = {}) {
  const usate = baseForzata ? (righe || []).filter(r => r?.data && r.data < baseForzata) : (righe || [])
  const vuoto = { giorniPrevisti: [], gusti: [], erroreSede: null, livelloBanda: null, correzione: null, simulata: !!baseForzata }
  const ultimoDato = ultimoGiornoRegistrato(usate)
  if (!ultimoDato) return { ...vuoto, stato: 'vuoto', ultimoDato: null, giorniVecchi: null, base: null }
  const riferimento = baseForzata ? piuGiorni(baseForzata, -1) : oggi
  const giorniVecchi = riferimento ? Math.max(0, giorniFra(ultimoDato, riferimento)) : 0
  const base = piuGiorni(ultimoDato, 1)
  if (giorniVecchi > GIORNI_DATI_VECCHI) {
    return { ...vuoto, stato: 'vecchi', ultimoDato, giorniVecchi, base }
  }
  const ctx = creaContesto(usate, opzioni)
  // Si prevede da oggi in avanti (o da domani, se oggi è già registrato).
  const primo = riferimento && riferimento > base ? riferimento : base
  const giorniPrevisti = []
  for (let d = primo; giorniPrevisti.length < giorni && giorniFra(primo, d) <= 14; d = piuGiorni(d, 1)) {
    if (!chiuso(d)) giorniPrevisti.push(d)
  }
  const scortaUtile = giorniVecchi <= 1

  // Un gusto si prevede se è stato in vetrina nell'ultima settimana.
  const attivi = Object.keys(ctx.gusti).filter(g => {
    for (let k = 1; k <= 7; k++) if (ctx.gusti[g].celle[piuGiorni(base, -k)]) return true
    return false
  })
  const erroriSede = []
  const gusti = []
  for (const gusto of attivi) {
    const r = ctx.ritmo(gusto, base)
    if (!r) continue
    const err = ctx.errori(gusto, base)
    erroriSede.push(...err)
    const previsti = giorniPrevisti.map(d => {
      const kg = ctx.prevedi(gusto, base, d)
      const b = ctx.banda(gusto, base, kg)
      return { data: d, kg, basso: b?.basso ?? null, alto: b?.alto ?? null, bandaDaSede: !!b?.daSede }
    })
    const scorta = scortaUtile ? scortaGusto(ctx, gusto, ultimoDato) : null
    const finisce = scorta
      ? quandoFinisce(scorta.kg, d => ctx.prevedi(gusto, base, d), base, { chiuso })
      : null
    gusti.push({
      gusto,
      previsti,
      ritmo: r,
      errore: errorePassato(err),
      scorta,
      finisce,
      lotto: lottoTipico(ctx.gusti[gusto], base),
    })
  }

  // Per urgenza: prima chi finisce prima; chi non si sa quando finisce dopo,
  // per chili previsti.
  gusti.sort((a, b) => {
    if (a.finisce && b.finisce && a.finisce !== b.finisce) return a.finisce < b.finisce ? -1 : 1
    if (a.finisce && !b.finisce) return -1
    if (!a.finisce && b.finisce) return 1
    return (b.previsti[0]?.kg || 0) - (a.previsti[0]?.kg || 0)
  })

  return {
    ...vuoto,
    stato: 'ok', ultimoDato, giorniVecchi, base, giorniPrevisti, gusti,
    erroreSede: errorePassato(erroriSede),
    livelloBanda: ctx.livelloBanda(base),
    correzione: ctx.correzione(base),
  }
}
