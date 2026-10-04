// ── La pagina Produzione: i conti che mancavano ───────────────────────────
//
// 03/10/2026, rifondazione dell'Analisi (ANALISI_DESIGN.md). L'audit dello
// Storico elencava le cose che servono al titolare e che la pagina non
// aveva: la riga della vetrina (in vetrina all'inizio + prodotto − venduto −
// scarto = in vetrina alla fine, la vera risposta a «torna il conto?»), le
// sedi affiancate, il giorno della settimana, e per ogni gusto quanto di
// quello che si fa si vende e per quanti giorni resta in vetrina.
//
// Qui solo i conti, senza schermo. Il venduto non si ricalcola: è quello del
// motore (`serieVendutoGusto`, sede per sede), con le sue regole — una
// rimanenza non scritta non è zero, un giorno non registrato non è un giorno
// di vendite a zero.
import {
  serieVendutoGusto, rimanenzaDiPartenza, CAUSA_RIMANENZA_A_ZERO, cellaDaControllare, ricaviDaInventario,
} from './inventarioProduzione'
import { giorniRegistrati } from './produzioneAnalisi'

const perSede = (righe) => {
  const m = new Map()
  for (const r of righe || []) {
    const k = r?.sede_id || '_'
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r)
  }
  return m
}
const dentro = (d, da, a) => (!da || d >= da) && (!a || d <= a)

/**
 * La riga della vetrina di un periodo, in grammi.
 *
 *   in vetrina all'inizio + prodotto + arrivato − spedito − scarto − venduto
 *   = in vetrina alla fine
 *
 * «All'inizio» è la rimanenza dell'ultimo giorno registrato prima del
 * periodo (fino a 7 giorni), «alla fine» l'ultima rimanenza scritta nel
 * periodo, gusto per gusto e sede per sede. Il conto torna al grammo quando
 * tutte le caselle sono calcolabili: dove una rimanenza manca, il venduto di
 * quel giorno non si sa e la riga lo dice (`differenzaG`, `celleNonCalcolabili`)
 * invece di far quadrare per forza.
 */
export function bilancioVetrina(righe, { da = null, a = null } = {}) {
  const t = {
    inizioG: 0, prodottoG: 0, ricevutoG: 0, speditoG: 0, scartoG: 0, vendutoG: 0, fineG: 0,
    gustiSenzaInizio: 0, celleNonCalcolabili: 0, scartoRegistrato: false,
  }
  for (const righeSede of perSede(righe).values()) {
    const partenza = da ? rimanenzaDiPartenza(righeSede, da) : {}
    for (const [gusto, celle] of Object.entries(serieVendutoGusto(righeSede))) {
      const nel = celle.filter(c => dentro(c.data, da, a))
      if (nel.length === 0) continue
      const ini = partenza[gusto]?.grammi
      if (ini == null) t.gustiSenzaInizio++
      else t.inizioG += ini
      let fine = null
      for (const c of nel) {
        t.prodottoG += Number(c.prod) || 0
        t.ricevutoG += Number(c.ricevuto) || 0
        t.speditoG += Number(c.spedito) || 0
        t.scartoG += Number(c.scarto) || 0
        if ((Number(c.scarto) || 0) > 0) t.scartoRegistrato = true
        if (c.venduto != null) t.vendutoG += Number(c.venduto) || 0
        else t.celleNonCalcolabili++
        if (c.riman != null) fine = Number(c.riman) || 0
      }
      if (fine != null) t.fineG += fine
    }
  }
  t.differenzaG = t.inizioG + t.prodottoG + t.ricevutoG - t.speditoG - t.scartoG - t.vendutoG - t.fineG
  // Mezzo chilo su tutto il periodo è arrotondamento delle pesate.
  t.torna = Math.abs(t.differenzaG) < 500
  return t
}

const NOMI_GIORNO = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
// Il giorno della settimana di una data ISO, 1 = lunedì. A mezzogiorno UTC:
// nessun fuso del mondo cambia la data.
const giornoSettimana = (iso) => {
  const g = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return g === 0 ? 7 : g
}

/**
 * Il venduto per giorno: { [data]: grammi } sommando le sedi (ognuna col suo
 * conto), solo i giorni in cui almeno una casella si sa.
 */
export function vendutoPerGiorno(righe, { da = null, a = null } = {}) {
  const out = {}
  for (const righeSede of perSede(righe).values()) {
    for (const celle of Object.values(serieVendutoGusto(righeSede))) {
      for (const c of celle) {
        if (!dentro(c.data, da, a) || c.venduto == null) continue
        out[c.data] = (out[c.data] || 0) + (Number(c.venduto) || 0)
      }
    }
  }
  return out
}

/**
 * Il venduto medio di ogni giorno della settimana, sui soli giorni
 * registrati. Ritorna 7 voci { giorno, nome, mediaG, nGiorni }; `mediaG` è
 * null per un giorno mai registrato (una chiusura, di solito).
 */
export function perGiornoDellaSettimana(righe, { da = null, a = null } = {}) {
  const giorni = vendutoPerGiorno(righe, { da, a })
  const acc = NOMI_GIORNO.map((nome, i) => ({ giorno: i + 1, nome, totG: 0, nGiorni: 0 }))
  for (const [d, g] of Object.entries(giorni)) {
    const v = acc[giornoSettimana(d) - 1]
    v.totG += g
    v.nGiorni++
  }
  return acc.map(v => ({ giorno: v.giorno, nome: v.nome, nGiorni: v.nGiorni, mediaG: v.nGiorni > 0 ? v.totG / v.nGiorni : null }))
}

// ── Il giorno della settimana falsato dalla rimanenza lasciata a zero ────
//
// Trovato il 04/10/2026 verificando la pagina sui dati veri di Mara
// (01/07-31/08): il titolo diceva «Il martedì vendi di più (272 kg al
// giorno), il giovedì di meno (96,9 kg)». Ma 141 delle caselle con la
// rimanenza lasciata a 0 nel giorno della produzione cadono di martedì e 150
// di mercoledì: il gelato rimasto in vetrina la sera viene contato come
// venduto quel giorno, e il giorno dopo il venduto esce negativo. Almeno
// 574 kg contati il martedì invece del mercoledì, 593 il mercoledì invece
// del giovedì. Il totale del periodo è giusto; il giorno della settimana no.
//
// Il dato non si corregge (quanto c'era davvero in vetrina non lo sappiamo):
// si misura quanto pesa. Per ogni giorno della settimana, i chili spostati
// sono quelli della casella negativa (il minimo certo: il venduto vero del
// giorno dopo non è sotto zero), contati sia sul giorno che li ha presi sia
// su quello che li ha persi. Sopra il 10% del venduto di quel giorno, il
// giorno è falsato e non si confronta.
export const SOGLIA_GIORNO_FALSATO = 0.1

/**
 * @param {Array} settimana  da `perGiornoDellaSettimana`
 * @param {Array} caselle  da `caselleDaSistemare` sullo stesso periodo
 * @returns la stessa settimana, con { presiKg, persiKg, spostatiKg, falsato } per ogni giorno
 */
export function giorniFalsati(settimana = [], caselle = [], { soglia = SOGLIA_GIORNO_FALSATO } = {}) {
  const presi = [0, 0, 0, 0, 0, 0, 0]
  const persi = [0, 0, 0, 0, 0, 0, 0]
  for (const c of caselle || []) {
    if (c?.causa !== CAUSA_RIMANENZA_A_ZERO || !c.data) continue
    const kg = Math.abs(Number(c.kg) || 0)
    // Il giorno che ha perso i chili è sempre nel periodo; quello che li ha
    // presi solo se il periodo non comincia proprio il giorno dopo.
    persi[giornoSettimana(c.data) - 1] += kg
    if (c.compensata && c.giornoDaSistemare) presi[giornoSettimana(c.giornoDaSistemare) - 1] += kg
  }
  return settimana.map(g => {
    const totKg = g.mediaG != null ? (g.mediaG * g.nGiorni) / 1000 : 0
    const i = g.giorno - 1
    // Per dire se il giorno è falsato contano tutti e due i versi; per dire
    // quanti chili sono nel giorno sbagliato, ogni casella una volta sola
    // (`persiKg`, sul giorno della casella negativa).
    const sp = (presi[i] || 0) + (persi[i] || 0)
    return { ...g, presiKg: presi[i] || 0, persiKg: persi[i] || 0, spostatiKg: sp, falsato: totKg > 0 ? sp / totKg > soglia : sp > 0 }
  })
}

/**
 * Le sedi affiancate: per ognuna giorni registrati, prodotto, venduto,
 * vetrina all'inizio e alla fine. `nome` lo mette chi disegna.
 */
export function sediAffiancate(righe, { da = null, a = null } = {}) {
  const out = []
  for (const [sedeId, righeSede] of perSede(righe).entries()) {
    const giorni = giorniRegistrati(righeSede, { da, a })
    const b = bilancioVetrina(righeSede, { da, a })
    out.push({
      sedeId: sedeId === '_' ? null : sedeId,
      giorni: giorni.n, primo: giorni.primo, ultimo: giorni.ultimo,
      prodottoG: b.prodottoG, vendutoG: b.vendutoG, inizioG: b.inizioG, fineG: b.fineG,
      scartoG: b.scartoG, scartoRegistrato: b.scartoRegistrato,
    })
  }
  return out.sort((x, y) => y.vendutoG - x.vendutoG)
}

// Settimana ISO di una data, «2026-W33». Stesso conto di StoricoProduzioneView.
const settimanaIso = (iso) => {
  const tmp = new Date(`${iso}T12:00:00Z`)
  const dow = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow)
  const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const n = Math.ceil((((tmp - ys) / 86400000) + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(n).padStart(2, '0')}`
}

/**
 * Per ogni gusto: venduto per settimana (per l'andamentino), venduto su
 * prodotto, e per quanti giorni di vendita basta quello che resta in vetrina
 * (rimanenza media / venduto medio di un giorno — la stessa misura dei
 * «gusti in sofferenza» della Quadratura).
 *
 * Ritorna { settimane: [chiavi ordinate], gusti: { [gusto]: { perSettimana:
 * (grammi|null)[], vendutoG, prodottoG, quotaVenduta, giorniVetrina } } }.
 */
export function andamentoGusti(righe, { da = null, a = null } = {}) {
  const settimane = new Set()
  const acc = {}
  for (const righeSede of perSede(righe).values()) {
    for (const [gusto, celle] of Object.entries(serieVendutoGusto(righeSede))) {
      const t = acc[gusto] || (acc[gusto] = { sett: {}, vendutoG: 0, prodottoG: 0, rimanTot: 0, giorniRiman: new Set(), giorniVenduto: new Set() })
      for (const c of celle) {
        if (!dentro(c.data, da, a)) continue
        const k = settimanaIso(c.data)
        settimane.add(k)
        t.prodottoG += Number(c.prod) || 0
        if (c.riman != null) { t.rimanTot += Number(c.riman) || 0; t.giorniRiman.add(c.data) }
        if (c.venduto != null) {
          t.vendutoG += Number(c.venduto) || 0
          t.sett[k] = (t.sett[k] || 0) + (Number(c.venduto) || 0)
          t.giorniVenduto.add(c.data)
        }
      }
    }
  }
  const chiavi = [...settimane].sort()
  const gusti = {}
  for (const [gusto, t] of Object.entries(acc)) {
    // Con più sedi si sommano: la vetrina di un giorno è quella di tutte le
    // sedi, il venduto di un giorno anche.
    const nGiorni = t.giorniVenduto.size
    const vendutoMedio = nGiorni > 0 ? t.vendutoG / nGiorni : 0
    const rimanMediaGiorno = t.giorniRiman.size > 0 ? t.rimanTot / t.giorniRiman.size : 0
    gusti[gusto] = {
      perSettimana: chiavi.map(k => (t.sett[k] == null ? null : t.sett[k])),
      vendutoG: t.vendutoG,
      prodottoG: t.prodottoG,
      quotaVenduta: t.prodottoG > 0 ? (t.vendutoG / t.prodottoG) * 100 : null,
      giorniVetrina: vendutoMedio > 0 && t.giorniRiman.size > 0 ? rimanMediaGiorno / vendutoMedio : null,
    }
  }
  return { settimane: chiavi, gusti }
}

/**
 * Il venduto per settimana (o per giorno, o per mese) per il grafico, con il
 * prodotto accanto e quante caselle da sistemare cadono in quel tratto.
 */
export function serieVenduto(righe, { da = null, a = null, passo = 'settimana' } = {}) {
  const chiaveDi = (d) => (passo === 'giorno' ? d : passo === 'mese' ? d.slice(0, 7) : settimanaIso(d))
  const acc = {}
  for (const righeSede of perSede(righe).values()) {
    for (const celle of Object.values(serieVendutoGusto(righeSede))) {
      for (const c of celle) {
        if (!dentro(c.data, da, a)) continue
        const k = chiaveDi(c.data)
        const t = acc[k] || (acc[k] = { chiave: k, primo: c.data, vendutoG: 0, prodottoG: 0, daSistemare: 0, giorni: new Set() })
        if (c.data < t.primo) t.primo = c.data
        t.prodottoG += Number(c.prod) || 0
        if (c.venduto != null) { t.vendutoG += Number(c.venduto) || 0; t.giorni.add(c.data) }
        if (cellaDaControllare(c) && c.causa === CAUSA_RIMANENZA_A_ZERO) t.daSistemare++
      }
    }
  }
  return Object.values(acc)
    .sort((x, y) => x.chiave.localeCompare(y.chiave))
    .map(t => ({ chiave: t.chiave, primo: t.primo, vendutoG: t.vendutoG, prodottoG: t.prodottoG, daSistemare: t.daSistemare, giorni: t.giorni.size }))
}

/**
 * I giorni senza niente registrato fra il primo e l'ultimo giorno con i dati
 * (le chiusure, o un buco nel foglio). Ritorna l'elenco delle date.
 */
export function buchiRegistrazione(giorni) {
  const lista = [...(giorni?.giorni || [])].sort()
  if (lista.length < 2) return []
  const presenti = new Set(lista)
  const out = []
  const t = new Date(`${lista[0]}T12:00:00Z`)
  const fine = new Date(`${lista[lista.length - 1]}T12:00:00Z`)
  while (t < fine) {
    t.setUTCDate(t.getUTCDate() + 1)
    const d = t.toISOString().slice(0, 10)
    if (!presenti.has(d)) out.push(d)
  }
  return out
}

// ── Il ricavo stimato: lo stesso numero in tutte le pagine ───────────────
//
// Decisione del titolare, 04/10/2026. La Produzione chiamava «ricavo
// stimato» i chili dei soli gusti con la ricetta per il prezzo della loro
// categoria (luglio-agosto, dati di Mara: 244.452 €), mentre «Il mese» e
// «Torna il conto?» stimano gli incassi con TUTTI i chili venduti per il
// prezzo medio dei formati (circa 347.600 €). Stessa parola, due numeri.
//
// Adesso la Produzione usa la stessa somma del Mese (ilMeseArchivio):
// `ricaviDaInventario` sede per sede, ogni sede con le sue vendite
// all'ingrosso, quelle senza sede alla prima sede. Il margine resta sui soli
// gusti con la ricetta (senza ricetta non si sa il costo).
//
// @param {Array} righe  righe d'inventario di una o più sedi (con i giorni prima)
// @param {Array} formati  i formati di vendita
// @param {{ da, a, venditeB2B?: Array|null }} o  `venditeB2B` null = non lette
// @returns {{ ricavi: number|null, kg: number, kgRetail: number, b2bKg: number,
//   ricaviB2b: number, euroKg: number|null, motivo: string|null }}
export function ricaviStimatiSedi(righe, formati, { da = null, a = null, venditeB2B = null } = {}) {
  const per = perSede(righe)
  const ids = [...per.keys()]
  const t = { ricavi: 0, kg: 0, kgRetail: 0, b2bKg: 0, ricaviB2b: 0, euroKg: null, motivo: null, conDati: 0 }
  for (const id of ids) {
    const vendite = Array.isArray(venditeB2B)
      ? venditeB2B.filter(v => (v?.sede_id ? v.sede_id === id : id === ids[0]))
      : null
    const r = ricaviDaInventario(per.get(id), formati, { da, a, venditeB2B: vendite })
    if (r.euroKg != null) t.euroKg = r.euroKg
    if (r.ricavi == null) { t.motivo = t.motivo || r.motivo; continue }
    t.conDati++
    t.ricavi += r.ricavi
    t.kg += r.kg
    t.kgRetail += r.kgRetail
    t.b2bKg += r.b2bKg
    t.ricaviB2b += r.ricaviB2b
  }
  return { ...t, ricavi: t.conDati ? t.ricavi : null }
}
