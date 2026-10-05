// La lettura e i conti del Confronto sedi, fuori dal componente.
//
// 05/10/2026: erano dentro `ConfrontoSedi.jsx` e valevano solo per «settimana»
// e «mese» correnti. Ora il periodo è quello della barra comune (da, a) e il
// confronto è un altro periodo scelto (il periodo prima, o l'anno prima).
//
// Gli incassi di ogni sede sono quelli del Mese (`incassiSedePeriodo`): cassa
// nei giorni con la chiusura, stima dall'inventario negli altri, i giorni
// senza dati dichiarati. Le spese comuni (fatture di due sedi insieme) si
// dividono sui chili del mese della fattura.

import { sload } from './storage'
import { caricaChiusure } from './chiusure'
import { fetchAllInventarioProduzione, GIORNI_RIPORTO_MAX, COLONNE_VENDUTO } from './inventarioProduzione'
import { SK_FORMATI } from './storageKeys'
import { venditeB2BPeriodo } from './venditeB2B'
import { caricaCostiAziendali, totaleMensile } from './costiAziendali'
import { produzionePerSedeMese } from './contoEconomicoArchivio'
import { quoteDiRipartizione } from './costiCondivisi'
import { aggiungiGiorni, differenzaGiorni, soloData } from './dateLocal'
import {
  foodCostPesato, fattureDaPagarePerSede, incassiSedePeriodo, andamentoSettimane,
} from './confrontoSediCalc'

const kgProdotti = (righe, da, a) => {
  let g = 0
  for (const r of righe || []) {
    const d = soloData(r?.data)
    if (d && d >= da && d <= a) g += Number(r?.produzione_g) || 0
  }
  return g / 1000
}

/**
 * Legge tutto e calcola i numeri di ogni sede.
 *
 * @param {object} o
 * @param {object} o.supabase
 * @param {string} o.orgId
 * @param {{id:string, nome:string}[]} o.sedi  le sedi attive
 * @param {string} o.da  primo giorno del periodo
 * @param {string} o.a  ultimo giorno del periodo
 * @param {{from:string,to:string}|null} [o.confronto]  il periodo con cui confrontare
 * @param {string} o.oggi
 */
export async function caricaConfrontoSedi({ supabase, orgId, sedi = [], da, a, confronto = null, oggi }) {
  const inizioAndamento = aggiungiGiorni(a, -(7 * 8 - 1) - 7)
  const inizioLettura = [da, confronto?.from, inizioAndamento].filter(Boolean).sort()[0]
  const fineLettura = [a, confronto?.to].filter(Boolean).sort().slice(-1)[0]

  const errori = []
  const prova = async (nome, fn, ripiego) => {
    try { return await fn() } catch (e) { errori.push({ nome, messaggio: e?.message || String(e) }); return ripiego }
  }

  const [stockAll, trasfPending, fattureAll, costiOrg, chiusureTutte, formati] = await Promise.all([
    supabase.from('stock_prodotti_finiti').select('sede_id, quantita, prodotto_nome').eq('organization_id', orgId),
    supabase.from('trasferimenti').select('sede_a, sede_da, stato').eq('organization_id', orgId).eq('stato', 'inviato'),
    // `sedi_condivise` serve alla divisione delle spese comuni: senza, le
    // fatture di Berthollet e De Gasperi insieme (niente `sede_id`)
    // finivano sotto una chiave che nessuna colonna mostrava.
    supabase.from('fatture')
      .select('id, sede_id, sedi_condivise, stato, totale, importo_pagato, data_fattura, data_scadenza, tipo')
      .eq('organization_id', orgId),
    caricaCostiAziendali(orgId, null).catch(() => []),
    prova('cassa', () => caricaChiusure(orgId, null, { from: inizioLettura, to: fineLettura, tutteLeSedi: true }), null),
    prova('formati', () => sload(SK_FORMATI, orgId, null), null),
  ])

  // I chili di ogni sede nei mesi delle fatture, per dividere le spese comuni.
  const fattureRighe = fattureAll?.data || []
  const primaFattura = fattureRighe.filter(f => f?.stato !== 'pagata' && f?.data_fattura).map(f => String(f.data_fattura).slice(0, 10)).sort()[0]
  const chiliPerMese = primaFattura
    ? await prova('produzione delle sedi', () => produzionePerSedeMese(supabase, orgId, { dal: primaFattura, al: oggi }), null)
    : null
  const chiliDellaFattura = (f) => {
    const m = chiliPerMese?.[String(f?.data_fattura || '').slice(0, 7)]
    return m && Object.values(m).some(v => v > 0) ? m : null
  }
  const perSedeFatture = fattureDaPagarePerSede(fattureRighe, oggi, chiliDellaFattura)

  const stockBySede = {}, stockProdsBySede = {}
  for (const r of (stockAll?.data || [])) {
    stockBySede[r.sede_id] = (stockBySede[r.sede_id] || 0) + Number(r.quantita || 0)
    stockProdsBySede[r.sede_id] = (stockProdsBySede[r.sede_id] || new Set()).add(r.prodotto_nome)
  }
  const pendingBySede = {}
  for (const t of (trasfPending?.data || [])) pendingBySede[t.sede_a] = (pendingBySede[t.sede_a] || 0) + 1

  const giorniPeriodo = Math.max(1, differenzaGiorni(da, a) + 1)
  const risultati = {}
  const datiSede = []   // per l'andamento

  await Promise.all(sedi.map(async (sede) => {
    try {
      const [giornaliero, righeInv, venditeB2B] = await Promise.all([
        sload('pasticceria-giornaliero-v1', orgId, sede.id),
        fetchAllInventarioProduzione(orgId, {
          sedeIds: sede.id,
          dataFrom: aggiungiGiorni(inizioLettura, -GIORNI_RIPORTO_MAX),
          dataTo: fineLettura,
          columns: `${COLONNE_VENDUTO}, scostamento_accettato, sede_id`,
        }).catch(() => null),
        // `includiSenzaSede: false`: le vendite senza sede toglierebbero gli
        // stessi chili a tutti i negozi.
        venditeB2BPeriodo(orgId, { sedeId: sede.id, da: inizioLettura, a: fineLettura, includiSenzaSede: false }).catch(() => null),
      ])
      const chiusure = (chiusureTutte || []).filter(c => c.sede_id === sede.id)
      const base = { chiusure, righe: righeInv, formati, venditeB2B, nome: sede.nome }
      datiSede.push(base)

      const cur = incassiSedePeriodo({ ...base, da, a })
      const prev = confronto ? incassiSedePeriodo({ ...base, da: confronto.from, a: confronto.to }) : null

      const giorArr = Array.isArray(giornaliero) ? giornaliero : []
      const sessioni = giorArr.filter(s => { const g = soloData(s.data); return g && g >= da && g <= a })
      const fc = foodCostPesato(sessioni)

      const ricaviCur = cur.valore
      // Il food cost in euro è noto solo se nel periodo ci sono giornate
      // registrate: senza, «food cost zero» farebbe un margine del 100 %.
      // E con incassi a metà (giorni senza dati) il margine non si calcola:
      // i ricavi sono un minimo, i costi no.
      const margineLordoCur = ricaviCur != null && fc.giornate > 0 && !cur.parziale ? ricaviCur - fc.fcEuro : null
      const confrontabile = !!(prev && cur.valore != null && prev.valore != null && !cur.parziale && !prev.parziale)

      risultati[sede.id] = {
        incasso: cur,
        incassoPrima: prev,
        ricaviCur,
        ricaviPrev: confrontabile ? prev.valore : null,
        confrontabile,
        ricaviStimati: cur.giorniStimati > 0,
        nChiusureCur: cur.giorni,
        kgProdotti: righeInv ? kgProdotti(righeInv, da, a) : null,
        giornateConDato: fc.giornate,
        foodCostPct: fc.pct,
        fcEuroCur: fc.fcEuro,
        margineLordoCur,
        prodOggi: giorArr
          .filter(s => (s.data || '').startsWith(oggi))
          .reduce((t, s) => t + (s.prodotti || []).reduce((ps, p) => ps + (p.stampi || 0), 0), 0),
        fattureDaPagare: (perSedeFatture[sede.id]?.aperte || 0) + (perSedeFatture[sede.id]?.nRipartite || 0),
        fattureScadute: perSedeFatture[sede.id]?.scadute || 0,
        fattureScadStimate: perSedeFatture[sede.id]?.stimate || 0,
        fattureImporto: (perSedeFatture[sede.id]?.importo || 0) + (perSedeFatture[sede.id]?.ripartito || 0),
        fattureComuni: perSedeFatture[sede.id]?.ripartito || 0,
        fattureComuniStimate: !!perSedeFatture[sede.id]?.ripartizioneStimata,
        stockPF: stockBySede[sede.id] || 0,
        stockProdsCount: stockProdsBySede[sede.id]?.size || 0,
        trasfInArrivo: pendingBySede[sede.id] || 0,
      }
    } catch (e) {
      console.error(`[ConfrontoSedi] sede ${sede.nome || sede.id}:`, e)
      risultati[sede.id] = { errore: (e?.message || 'errore di lettura').slice(0, 120), ricaviCur: null, ricaviPrev: null, nChiusureCur: 0, giornateConDato: 0 }
    }
  }))

  // Costi aziendali: quelli della sede per intero, i comuni sui chili
  // prodotti nel periodo (parti uguali, dichiarato, se nessuno ha prodotto).
  const globaliMensili = totaleMensile((costiOrg || []).filter(c => !c.sede_id))
  const kg = Object.fromEntries(sedi.map(s => [s.id, risultati[s.id]?.kgProdotti || 0]))
  const { quote: quoteComuni, certa: quoteCerte } = quoteDiRipartizione(sedi.map(s => s.id), kg)
  for (const s of sedi) {
    const k = risultati[s.id]
    if (!k || k.errore) continue
    const proprio = totaleMensile((costiOrg || []).filter(c => c.sede_id === s.id))
    k.costiPeriodo = (proprio + globaliMensili * (quoteComuni[s.id] || 0)) * (giorniPeriodo / 30)
    k.costiComuniStimati = globaliMensili > 0 && !quoteCerte
    k.margineNettoCur = k.margineLordoCur != null ? k.margineLordoCur - k.costiPeriodo : null
  }

  const andamento = andamentoSettimane(datiSede, a, 8)
  return { kpiMap: risultati, andamento, errori }
}
