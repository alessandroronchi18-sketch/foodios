// Chi fornisce cosa, e a che prezzo.
//
// IL PROBLEMA che risolve questo file: in tutto lo schema non esisteva
// nessuna colonna che legasse un ingrediente a un fornitore. Le conseguenze,
// verificate il 10/09/2026:
//   - la "Lista di riordino consigliata" del Magazzino diceva quanto
//     ordinare e non da chi (zero occorrenze di "fornitor" in quel file);
//   - "Copia per il fornitore" generava UN testo con tutti gli ingredienti
//     insieme: lo stesso messaggio sarebbe andato al molino e al
//     cioccolataio;
//   - registrare un ordine col burro a 9,20 EUR/kg non toccava il food cost
//     di nessuna ricetta: 78 righe di ricetta su 118 di Mara restavano senza
//     prezzo mentre il prezzo vero era già stato scritto in un ordine.
//
// LA SCELTA: il legame vive dentro `ingredienti_costi` del ricettario, che è
// già la casa del prezzo di un ingrediente. Nessuna tabella nuova, nessuna
// migration: si aggiungono due campi accanto a `costoG`/`costoKg`.
//
//   ingredienti_costi['burro'] = {
//     costoG: 0.0092, costoKg: 9.2,
//     fornitore: 'Latteria Rossi',        // chi lo vende
//     prezzoDa: 'ordine-2026-09-10',      // da dove viene il prezzo
//     prezzoAggiornatoAl: '2026-09-10',   // quando
//   }
//
// `fornitore` è il NOME, non un id: i nomi sono quello che il titolare legge
// e scrive, e un fornitore cancellato non deve lasciare un riferimento rotto
// dentro il ricettario.

import { normIng } from './foodcost'

/** Giorni di consegna da usare quando il fornitore non li ha dichiarati. */
export const LEAD_TIME_RIFERIMENTO = 3

/**
 * Fornitore di un ingrediente, se lo sappiamo.
 * Ritorna { nome, prezzoAggiornatoAl } oppure null: null vuol dire
 * "non lo sappiamo", e chi mostra il dato deve dirlo.
 */
export function fornitoreDiIngrediente(ingredientiCosti, nomeIngrediente) {
  const k = normIng(nomeIngrediente)
  const voce = (ingredientiCosti || {})[k]
  if (!voce?.fornitore) return null
  return {
    nome: String(voce.fornitore),
    prezzoAggiornatoAl: voce.prezzoAggiornatoAl || null,
    prezzoDa: voce.prezzoDa || null,
  }
}

/**
 * Costo per grammo da una riga d'ordine.
 *
 * Le unità che il form dell'ordine accetta sono kg, g, l, ml, pz. Per i pezzi
 * non esiste un costo per grammo: ritorna null invece di inventare una
 * conversione (un uovo non pesa un grammo).
 */
export function costoGDaRigaOrdine(riga) {
  const prezzo = Number(riga?.prezzo_unitario)
  if (!Number.isFinite(prezzo) || prezzo <= 0) return null
  const u = String(riga?.unita || '').toLowerCase().trim()
  if (u === 'kg' || u === 'l') return prezzo / 1000
  if (u === 'g' || u === 'ml') return prezzo
  return null   // pz, cartoni, casse: nessuna conversione sensata
}

/**
 * Aggiornamento di `ingredienti_costi` con i prezzi di un ordine ricevuto.
 *
 * PURA: prende la mappa e ne ritorna una nuova, più l'elenco di cosa
 * cambierebbe. Il chiamante decide se salvare, e può mostrare l'elenco prima.
 *
 * Ritorna { nuovi, cambi: [{ nome, da, a, primaVolta }], nonConvertibili: [] }
 */
export function costiDaOrdine(ingredientiCosti, ordine) {
  const nuovi = { ...(ingredientiCosti || {}) }
  const cambi = []
  const nonConvertibili = []
  const fornitore = ordine?.fornitore_nome || ordine?.fornitori?.nome || null
  const dataOrdine = ordine?.data_ordine || null
  for (const riga of (ordine?.righe_ordine || ordine?.righe || [])) {
    const nome = String(riga?.prodotto || '').trim()
    if (!nome) continue
    const costoG = costoGDaRigaOrdine(riga)
    if (costoG == null) {
      if (Number(riga?.prezzo_unitario) > 0) nonConvertibili.push({ nome, unita: riga?.unita })
      continue
    }
    const k = normIng(nome)
    const prec = nuovi[k]
    const costoGPrec = Number(prec?.costoG)
    // Niente scritture inutili: se il prezzo è lo stesso (a meno di mezzo
    // centesimo al kg) si lascia stare.
    if (Number.isFinite(costoGPrec) && Math.abs(costoGPrec - costoG) * 1000 < 0.005) continue
    nuovi[k] = {
      ...(prec || {}),
      nome: prec?.nome || nome,
      costoG,
      costoKg: Math.round(costoG * 1000 * 10000) / 10000,
      fornitore: fornitore || prec?.fornitore || null,
      prezzoDa: ordine?.id ? `ordine-${ordine.id}` : 'ordine',
      prezzoAggiornatoAl: dataOrdine,
    }
    cambi.push({
      nome,
      da: Number.isFinite(costoGPrec) ? costoGPrec * 1000 : null,
      a: costoG * 1000,
      primaVolta: !Number.isFinite(costoGPrec) || costoGPrec === 0,
    })
  }
  return { nuovi, cambi, nonConvertibili }
}

/**
 * Raggruppa per fornitore le righe di una lista di riordino, così ogni
 * messaggio va a chi vende quella merce. Chi non ha fornitore finisce in un
 * gruppo dichiarato, non nascosto.
 */
export function raggruppaPerFornitore(righe, ingredientiCosti) {
  const gruppi = new Map()
  for (const r of (righe || [])) {
    const f = fornitoreDiIngrediente(ingredientiCosti, r.nome)
    const chiave = f?.nome || null
    if (!gruppi.has(chiave)) gruppi.set(chiave, { fornitore: chiave, righe: [] })
    gruppi.get(chiave).righe.push(r)
  }
  // I gruppi con un fornitore vengono prima, quelli senza in fondo.
  return [...gruppi.values()].sort((a, b) => {
    if ((a.fornitore == null) !== (b.fornitore == null)) return a.fornitore == null ? 1 : -1
    return String(a.fornitore || '').localeCompare(String(b.fornitore || ''))
  })
}
