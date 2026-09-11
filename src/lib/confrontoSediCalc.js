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
