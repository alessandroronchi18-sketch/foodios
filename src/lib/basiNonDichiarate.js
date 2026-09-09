// Ricette che l'azienda usa come ingrediente, ma che non ha dichiarato "basi".
//
// Perché esiste (09/09/2026). Nel ricettario di Mara dei Boschi, BASE BIANCA è
// una ricetta con 5 ingredienti e 1 kg di batch, usata come ingrediente in 15
// altre ricette: è la base della gelateria. Ma non ha `tipo: 'semilavorato'`
// salvato, e calcolaFC controlla proprio quel campo (foodcost.js:957) per
// decidere se scendere nella ricetta o cercare il nome nel listino ingredienti.
// Non trovando il tipo, il costo viene preso dal listino: "base bianca" a
// 2,310 €/kg, mentre la sua ricetta ricalcolata vale 1,622 €/kg.
//
// Sono 0,688 €/kg di differenza su 375-1.000 g per ricetta: dichiarandola base,
// 15 food cost si spostano da -5,6% a -39,8%. E la pagina Semilavorati non solo
// non lo diceva: non offriva nessun modo per accorgersene, perché elenca solo
// chi ha già il tipo giusto.
//
// PRUDENZA. Non ogni coincidenza di nome è una base. Nello stesso ricettario il
// gusto ARANCIA usa l'ingrediente "arancia" (il frutto) e il gusto BANANA usa
// "banana": promuoverli sarebbe un errore, perché il gusto non è ingrediente di
// se stesso. Il segnale che distingue i due casi è quante ricette DIVERSE usano
// quel nome: BASE BIANCA 15, ARANCIA e BANANA una sola.

import { calcolaFC, normIng, getR } from './foodcost'

// Quante ricette diverse devono usare un nome perché valga la pena proporlo.
// Con una sola è quasi sempre un gusto che si chiama come la sua materia prima.
const MIN_USI = 2
// Una base ha una sua composizione: con un solo ingrediente è un altro nome
// della stessa materia prima, non una lavorazione.
const MIN_INGREDIENTI = 2

/**
 * Trova le ricette usate come ingrediente da altre ricette, senza avere il tipo
 * 'semilavorato'.
 *
 * @param {Object} ricettario  { ricette: {...}, ingredienti_costi: {...} }
 * @param {Object} ingCosti    mappa da buildIngCosti (per i confronti di costo)
 * @returns {Array} candidati, dal più usato:
 *   {
 *     nome, nUsi, usataIn[], nIngredienti,
 *     costoKgDaRicetta,        quanto costa calcolandola dai suoi ingredienti
 *     costoKgDaListino,        quanto la stanno pagando adesso (null se assente)
 *     differenzaKg,            listino - ricetta (positivo = la stanno pagando di più)
 *     autoCiclo,               true se contiene se stessa come ingrediente
 *     costoIncompleto,         true se dentro di lei manca qualche prezzo
 *   }
 */
export function trovaBasiNonDichiarate(ricettario, ingCosti) {
  const ricette = ricettario?.ricette || {}
  const nomi = Object.keys(ricette)
  if (nomi.length === 0) return []

  // Chi usa cosa: mappa da nome normalizzato → ricette che lo elencano fra gli
  // ingredienti. Escludiamo l'auto-riferimento dal conteggio degli usi, ma lo
  // segnaliamo a parte: è un dato che l'utente deve conoscere.
  const usiPerNome = new Map()
  for (const nomeRicetta of nomi) {
    const r = ricette[nomeRicetta]
    for (const ing of (r?.ingredienti || [])) {
      const k = normIng(ing?.nome)
      if (!k) continue
      if (!usiPerNome.has(k)) usiPerNome.set(k, new Set())
      usiPerNome.get(k).add(nomeRicetta)
    }
  }

  const out = []
  for (const nome of nomi) {
    const r = ricette[nome]
    if (!r) continue
    const tipo = getR(nome, r).tipo
    if (tipo === 'semilavorato' || tipo === 'interno') continue

    const k = normIng(nome)
    const usanti = usiPerNome.get(k)
    if (!usanti) continue
    const autoCiclo = usanti.has(nome)
    const altri = [...usanti].filter(x => x !== nome)
    if (altri.length < MIN_USI) continue

    const ingredienti = r.ingredienti || []
    if (ingredienti.length < MIN_INGREDIENTI) continue

    const peso = ingredienti.reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
    if (peso <= 0) continue

    // Il costo che avrebbe se fosse una base: la sua ricetta, ricorsione compresa.
    const { tot, mancanti } = calcolaFC(r, ingCosti, ricettario)
    const costoKgDaRicetta = +((tot / peso) * 1000).toFixed(3)

    // Il costo che le stanno attribuendo adesso: la riga di listino omonima.
    const voce = ingCosti?.[k]
    const costoKgDaListino = voce ? +(Number(voce.costoKg ?? (voce.costoG * 1000)) || 0).toFixed(3) : null

    out.push({
      nome,
      nUsi: altri.length,
      usataIn: altri.sort((a, b) => a.localeCompare(b, 'it')),
      nIngredienti: ingredienti.length,
      costoKgDaRicetta,
      costoKgDaListino,
      differenzaKg: costoKgDaListino == null ? null : +(costoKgDaListino - costoKgDaRicetta).toFixed(3),
      autoCiclo,
      costoIncompleto: mancanti.length > 0,
      mancanti,
    })
  }

  out.sort((a, b) => b.nUsi - a.nUsi || a.nome.localeCompare(b.nome, 'it'))
  return out
}
