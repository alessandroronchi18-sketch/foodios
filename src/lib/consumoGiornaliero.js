// Quanto se ne consuma al giorno, di ogni materia prima.
//
// È il numero che decide **quanto ordinare**: sbagliarlo vuol dire o restare
// senza, o riempire la cantina di merce che scade.
//
// Si ricava dalle chiusure di cassa (cosa è stato venduto) passate per il
// ricettario (cosa c'è dentro ogni prodotto), su una finestra di trenta
// giorni. Non dai movimenti di magazzino: quelli dicono cosa è uscito dallo
// scaffale, non cosa serve per stare dietro alle vendite.
//
// ── Perché sta qui e non dentro una pagina ───────────────────────────────
//
// Il 22/09/2026, misurato: in Foodos c'erano **due formule diverse** per
// «quanto riordino», scritte dentro due componenti, e per la stessa farina
// una diceva 18 kg e l'altra 28. Sono state unificate in `riordino.js`. Il
// consumo giornaliero era rimasto l'ultimo pezzo di quel conto ancora dentro
// una vista: portarlo qui evita che la terza pagina che ne ha bisogno se ne
// scriva una copia sua.
import { normIng } from './foodcost'
import { todayLocal, giorniFaLocal } from './dateLocal'

export const GIORNI_FINESTRA = 30

/** Il giorno di una chiusura, in forma «AAAA-MM-GG». */
function soloData(v) {
  const s = String(v ?? '')
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/**
 * I grammi consumati in media al giorno, per materia prima.
 *
 * @param {Array}  chiusure    le chiusure di cassa
 * @param {object} ricettario  con `ricette`
 * @param {object} [opzioni]
 * @param {number} [opzioni.giorni]  la finestra, in giorni (30 di riferimento)
 * @returns {object} `{ <chiave materia prima>: grammi al giorno }`
 */
export function consumoGiornaliero(chiusure, ricettario, { giorni = GIORNI_FINESTRA } = {}) {
  const consumo = {}
  const ricette = ricettario?.ricette || {}
  const finestra = Number(giorni) > 0 ? Number(giorni) : GIORNI_FINESTRA

  // Giorni contro giorni. Prima qui c'era `new Date(c.data)`, cioè mezzanotte
  // UTC confrontata con l'istante di adesso: la chiusura di oggi non entrava
  // nel consumo medio prima delle 02:00.
  const oggi = todayLocal()
  const start = giorniFaLocal(finestra - 1)

  for (const c of (Array.isArray(chiusure) ? chiusure : [])) {
    const d = soloData(c?.data)
    if (!d || d < start || d > oggi) continue
    // Le chiusure tengono le righe in `venduto` (i nomi dei prodotti) o in
    // `confronto`; quelle vecchie in `prodotti`/`righe`.
    const items = [c.venduto, c.confronto, c.prodotti, c.righe].find(Array.isArray) || []
    for (const r of items) {
      const nome = String(r?.nome || r?.prodotto || '').toUpperCase().trim()
      const qta = Number(r?.unitaV ?? r?.venduto ?? r?.qta ?? r?.pezzi ?? 0)
      if (!nome || !(qta > 0)) continue
      const ric = ricette[nome]
        || Object.values(ricette).find(x => String(x?.nome || '').toUpperCase().trim() === nome)
      if (!ric) continue
      for (const ing of (ric.ingredienti || ric.composizione || [])) {
        const ingNome = normIng(ing?.nome || ing?.ingrediente || '')
        if (!ingNome) continue
        // `qty1stampo` è il campo vero del ricettario: grammi per stampo.
        const grammi = Number(ing?.qty1stampo ?? ing?.qta_g ?? ing?.quantita ?? 0) * qta
        if (!Number.isFinite(grammi) || grammi <= 0) continue
        consumo[ingNome] = (consumo[ingNome] || 0) + grammi
      }
    }
  }

  for (const k of Object.keys(consumo)) consumo[k] = consumo[k] / finestra
  return consumo
}

/**
 * Su quante giornate di vendita è costruito il conto.
 *
 * Serve a dirlo a schermo: «media su 12 giornate registrate» è
 * un'informazione, «2,3 kg al giorno» da solo è un numero che non si sa se
 * credere. Regola del progetto: un numero senza il suo riferimento non è
 * un'informazione.
 */
export function giornateContate(chiusure, { giorni = GIORNI_FINESTRA } = {}) {
  const oggi = todayLocal()
  const start = giorniFaLocal((Number(giorni) > 0 ? Number(giorni) : GIORNI_FINESTRA) - 1)
  const viste = new Set()
  for (const c of (Array.isArray(chiusure) ? chiusure : [])) {
    const d = soloData(c?.data)
    if (d && d >= start && d <= oggi) viste.add(d)
  }
  return viste.size
}
