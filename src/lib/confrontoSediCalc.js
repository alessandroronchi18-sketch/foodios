// Conti del Confronto sedi, tirati fuori dal componente per poterli provare.
//
// Erano scritti dentro ConfrontoSedi.jsx e nessun test li vedeva. Due
// sbagliavano:
//
//   1. il food cost in percentuale era la MEDIA delle percentuali giornaliere.
//      Una giornata da 50 € di incasso al 50% pesava come una da 3.000 € al
//      25%, e la percentuale che ne usciva non era quella di nessuno. Su quel
//      numero la pagina alzava un allarme rosso a 38%;
//   2. il food cost del gruppo era la media fra le sedi: una sede da 500 €
//      pesava come una da 5.000 €.

import { residuoFattura, scadenzaFattura } from './fatture'
import { quoteDiRipartizione } from './costiCondivisi'
import { incassiSedeDelMese } from './ilMeseArchivio'
import { incassiDaSedi } from './ilMese'
import { aggiungiGiorni, lunediDellaSettimana } from './dateLocal'
import { totaliPerGusto, ricettaDelGusto } from './inventarioProduzione'
import { buildIngCosti } from './foodcost'
import { valutaGusti } from './produzioneAnalisi'

// Food cost del periodo, pesato: euro di food cost su euro di ricavo.
// `pct` è null quando non c'è ricavo: senza un ricavo sotto, una percentuale
// di food cost non vuol dire niente.
export function foodCostPesato(sessioni) {
  let fcEuro = 0, ricavi = 0, giornate = 0
  for (const s of (Array.isArray(sessioni) ? sessioni : [])) {
    fcEuro += Number(s?.fcTot) || 0
    ricavi += Number(s?.ricavoTot) || 0
    giornate++
  }
  return {
    fcEuro,
    ricavi,
    giornate,
    pct: ricavi > 0 ? (fcEuro / ricavi) * 100 : null,
  }
}

// Consolidato del gruppo dalle KPI per sede.
// Una sede senza incasso nel periodo (`ricaviCur === null`) NON entra nei
// conti: zero chiusure di cassa non è zero incasso, è un dato che manca.
export function vocePerGruppo(kpiSedi) {
  let ricCur = 0, ricPrev = 0, margNetto = 0, margLordo = 0, costiPeriodo = 0
  let fcEuroPesato = 0, ricaviPesati = 0, sediConData = 0
  for (const k of (Array.isArray(kpiSedi) ? kpiSedi : [])) {
    if (!k) continue
    if (k.ricaviCur != null) {
      sediConData++
      ricCur += k.ricaviCur
    }
    if (k.ricaviPrev != null) ricPrev += k.ricaviPrev
    if (k.margineLordoCur != null) margLordo += k.margineLordoCur
    if (k.margineNettoCur != null) margNetto += k.margineNettoCur
    if (k.costiPeriodo != null) costiPeriodo += k.costiPeriodo
    if (k.foodCostPct != null && k.ricaviCur > 0) {
      fcEuroPesato += (k.foodCostPct / 100) * k.ricaviCur
      ricaviPesati += k.ricaviCur
    }
  }
  return {
    ricCur, ricPrev, margNetto, margLordo, costiPeriodo, sediConData,
    deltaRicPct: ricPrev > 0 ? ((ricCur - ricPrev) / ricPrev) * 100 : null,
    foodCostMedio: ricaviPesati > 0 ? (fcEuroPesato / ricaviPesati) * 100 : null,
    margineNettoPct: ricCur > 0 ? (margNetto / ricCur) * 100 : null,
  }
}

// ── Fatture da pagare per sede, e quante sono davvero in ritardo ──────────
//
// Difetto trovato il 16/09/2026 dall'agente SOLDI: «Fatture scadute» in
// questa pagina diceva SEMPRE zero, in tutte le sedi. Il controllo era
// `f.data_scadenza < oggi`, ma in produzione `data_scadenza` è vuota su
// 3.520 fatture su 3.520 — gli XML di questi fornitori non portano il blocco
// DatiPagamento e nessun'altra strada di importazione la compila. Una
// condizione su un campo sempre nullo è sempre falsa: il contatore restava a
// zero e l'allarme rosso non si accendeva mai.
//
// Nel frattempo lo Scadenzario, che la scadenza la DERIVA da
// `data_fattura + termini`, ne contava 409 in ritardo per 150.178,66 € fra le
// due organizzazioni con fatture aperte. Due pagine, stessi dati, una diceva
// «tutto a posto».
//
// `stimate` esce da qui insieme al conteggio: quelle scadenze sono date
// convenzionali (trenta giorni), non accordi scritti sul documento, e chi
// guarda un allarme ha diritto di sapere su cosa si regge.
//
// L'importo era la QUARTA copia di «quanto resta da pagare»
// (`totale - importo_pagato`). Ora passa da `residuoFattura`, che sa che una
// nota di credito vale col segno meno e che una fattura segnata pagata a mano
// è pagata.
// 17/09/2026 — `produzionePerSede` è il terzo argomento, e serve alle spese
// che appartengono a DUE negozi insieme.
//
// Mara ha due account su Webdesk: uno con le fatture della Carlina, l'altro
// con quelle di Berthollet e De Gasperi mescolate, e dentro i documenti non
// c'è niente che le distingua (verificato: 0 note, 0 allegati, 0 date di
// riferimento su 142). Prima quelle finivano tutte sotto la chiave
// `undefined` — cioè in un limbo che nessuna schermata mostrava: 189.458 €
// invisibili.
//
// Ora si dividono sui chili prodotti, e il ripartito resta in una voce sua:
// «hai 12.000 € da pagare» e «hai 8.000 € da pagare più 4.000 € di spese
// comuni divise a stima» non sono la stessa frase.
export function fattureDaPagarePerSede(fatture, oggiIso, produzionePerSede = null) {
  const out = {}
  const tocca = (k) => {
    if (!out[k]) out[k] = { aperte: 0, importo: 0, scadute: 0, stimate: 0, ripartito: 0, nRipartite: 0, ripartizioneStimata: false }
    return out[k]
  }
  for (const f of (Array.isArray(fatture) ? fatture : [])) {
    if (!f || f.stato === 'pagata') continue
    const residuo = residuoFattura(f)
    const { iso, stimata } = scadenzaFattura(f)
    // Il giorno della scadenza non è ancora un ritardo: si è in ritardo dal
    // giorno dopo.
    const inRitardo = !!(iso && oggiIso && iso < oggiIso)

    const condivise = Array.isArray(f.sedi_condivise) ? f.sedi_condivise.filter(Boolean) : []
    if (condivise.length > 1) {
      // `produzionePerSede` può essere la mappa {sede: grammi} oppure una
      // funzione che, data la fattura, dà la mappa del suo mese: le spese si
      // dividono sui chili del mese a cui appartengono, come nel Conto
      // economico, non su quelli di un altro periodo.
      const prod = typeof produzionePerSede === 'function' ? produzionePerSede(f) : produzionePerSede
      const { quote, certa } = quoteDiRipartizione(condivise, prod || {})
      for (const id of condivise) {
        const v = tocca(id)
        v.ripartito += residuo * (quote[id] || 0)
        v.nRipartite += 1
        if (!certa) v.ripartizioneStimata = true
        // Una scadenza vale per tutti i negozi che si dividono la spesa: il
        // fornitore la reclama a Mara, non a un negozio.
        if (inRitardo) { v.scadute += 1; if (stimata) v.stimate += 1 }
      }
      continue
    }

    const v = tocca(condivise[0] || f.sede_id)
    v.aperte += 1
    v.importo += residuo
    if (inRitardo) { v.scadute += 1; if (stimata) v.stimate += 1 }
  }
  return out
}

// ── Gli incassi di una sede in un periodo, e quelli di prima ────────────────
//
// 05/10/2026. La pagina prendeva l'incasso dalla stima dell'inventario SOLO
// se la sede non aveva nessuna chiusura nel periodo (`nChiusureCur === 0`), e
// il periodo prima e l'andamento delle 8 settimane solo dalle chiusure. Sui
// dati veri Carlina ha 40 chiusure (agosto-settembre, non tutti i giorni): con
// una sola chiusura nel mese la pagina contava quella e basta, e gli altri 29
// giorni valevano zero. Ora si usa la stessa funzione del Mese
// (`incassiSedeDelMese` + `incassiDaSedi`): cassa nei giorni che hanno la
// chiusura, stima dall'inventario negli altri, giorni senza dati dichiarati.
// Il numero è quello del Mese (IVA esclusa), perché sono la stessa domanda.

/**
 * @param {object} o
 * @param {object[]} o.chiusure  chiusure della sede
 * @param {object[]|null} o.righe  inventario della sede (con i giorni di riporto prima di `da`)
 * @param {object[]|null} o.formati
 * @param {object[]|null} [o.venditeB2B]
 * @param {string} o.da  primo giorno
 * @param {string} o.a  ultimo giorno
 * @param {string} [o.nome]
 */
export function incassiSedePeriodo({ chiusure = [], righe = null, formati = null, venditeB2B = null, da, a, nome = '' }) {
  if (!da || !a) return incassiDaSedi([])
  const parte = incassiSedeDelMese({ chiusure, righe, formati, venditeB2B, da, a, nome })
  return { ...incassiDaSedi([parte]), parte }
}

/**
 * L'andamento di N settimane (lunedì-domenica) che finiscono con quella di
 * `fine`: per ogni settimana i ricavi di tutte le sedi insieme, calcolati con
 * la stessa regola dell'incasso del periodo. Una settimana in cui nessuna sede
 * ha un dato vale `null`, non zero.
 *
 * @param {object[]} sedi  [{ nome, chiusure, righe, formati, venditeB2B }]
 * @param {string} fine  un giorno qualunque dell'ultima settimana
 * @param {number} [n]
 */
export function andamentoSettimane(sedi = [], fine, n = 8) {
  if (!fine) return []
  const ultimoLun = lunediDellaSettimana(fine)
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const lun = aggiungiGiorni(ultimoLun, -7 * i)
    const dom = aggiungiGiorni(lun, 6)
    const parti = sedi.map(s => incassiSedeDelMese({
      chiusure: s.chiusure, righe: s.righe, formati: s.formati, venditeB2B: s.venditeB2B, da: lun, a: dom, nome: s.nome,
    }))
    const r = incassiDaSedi(parti)
    out.push({ lunIso: lun, domIso: dom, ricavi: r.valore, scoperti: r.scoperti, fonte: r.fonte })
  }
  return out
}

// ── Food cost e margine di una sede, dall'inventario e dalle ricette ────────
//
// 05/10/2026. La pagina diceva «non lo so» al food cost e al margine di tutte
// le sedi, perché li leggeva solo dalla produzione giornaliera (che Mara non
// compila). La Produzione li calcola dall'inventario e dalle ricette: qui
// stesse funzioni (`valutaGusti`, `totaliPerGusto`), stesso numero della
// Produzione con quella sede scelta. Il margine è sui soli gusti con la
// ricetta e il costo completo; i chili degli altri restano fuori e si dicono.
//
/**
 * @param {object} o
 * @param {object[]} o.righe  inventario della sede
 * @param {string} o.da
 * @param {string} o.a
 * @param {object|null} o.ricettario
 * @param {object|null} [o.nomiGusti]
 * @param {number|null} o.euroKgNetto  prezzo medio al chilo senza IVA
 * @returns {null | { margine:number|null, margPct:number|null, fcEuro:number|null, fcPct:number|null,
 *   ricavoConMargine:number, kgVenduti:number, kgFuori:number, pctFuori:number|null, nConMargine:number }}
 */
export function foodCostSede({ righe, da, a, ricettario, nomiGusti = null, euroKgNetto }) {
  if (!Array.isArray(righe) || !ricettario || !(euroKgNetto > 0)) return null
  const v = valutaGusti(totaliPerGusto(righe, { da, a }), {
    ricettaDi: (g) => ricettaDelGusto(ricettario, g, nomiGusti),
    ricavoKgDi: () => euroKgNetto,
    ingCosti: buildIngCosti(ricettario?.ingredienti_costi || {}), ricettario,
  })
  const t = v.totali
  if (!(t.nConVendita > 0)) return null
  const kgFuori = Math.max(0, t.vend - t.vendConMargine)
  return {
    margine: t.margine, margPct: t.margPct,
    fcEuro: t.margine != null ? t.ricavoConMargine - t.margine : null,
    fcPct: t.margPct != null ? 100 - t.margPct : null,
    ricavoConMargine: t.ricavoConMargine, kgVenduti: t.vend, kgFuori,
    pctFuori: t.vend > 0 ? (kgFuori / t.vend) * 100 : null, nConMargine: t.nConMargine,
  }
}
