// Quali materie prime esce dal magazzino quando si produce.
//
// Perché esiste (09/09/2026). Il calcolo dello scarico prendeva gli ingredienti
// della ricetta così come sono scritti. Ma una ricetta può contenere un
// SEMILAVORATO ("pasta frolla" dentro "crostata mele"), e in quel caso:
//   - calcolaFC scende nella ricetta del semilavorato e conta farina e burro,
//   - il magazzino cercava una voce "pasta frolla" e, non trovandola, non
//     scaricava NIENTE.
// Nel database del 09/09/2026 nessuno dei 7 semilavorati è tenuto in magazzino:
// quindi ogni crostata prodotta lasciava il magazzino pieno mentre il food cost
// contava la frolla. Le due cose non tornavano più, e nessuno lo diceva.
//
// La regola, e la differenza tra i due tipi conta:
//
//   in magazzino          → si scarica quella voce. È il caso del laboratorio
//                           che produce la base in anticipo e la tiene lì.
//   semilavorato, fuori   → si scende nella sua ricetta e si scaricano gli
//                           ingredienti veri. Le sue quantità sono affidabili:
//                           è esattamente ciò che quel tipo dichiara.
//   base ('interno'), fuori → NON si scende. Le dosi di una base non sono un
//                           dato affidabile: il modello è che il gelataio
//                           elenchi gli ingredienti (per gli allergeni) e
//                           scriva a mano il costo al kg, tenendo per sé le
//                           quantità. Scaricare su numeri che l'utente non ha
//                           inteso come dosi produrrebbe un magazzino sbagliato
//                           al posto di uno incompleto. Si dichiara e si ferma.

import { normIng, getR } from './foodcost'

const PROFONDITA_MAX = 3

/**
 * Espande gli ingredienti da scaricare per una quantità prodotta.
 *
 * @param {Object} ricetta        la ricetta prodotta
 * @param {number} quantita       quante volte è stata prodotta (stampi / batch)
 * @param {Object} ricettario     { ricette: {...} }
 * @param {Set<string>} inMagazzino chiavi normalizzate presenti in magazzino
 * @returns {{ ings: Object, nonEspandibili: Array }}
 *   ings: { [chiaveNormalizzata]: grammi }
 *   nonEspandibili: [{ nome, motivo }] — le righe su cui il magazzino non si
 *   può muovere, da mostrare all'utente invece di ignorarle.
 */
export function ingredientiDaScaricare(ricetta, quantita, ricettario, inMagazzino, _profondita = 0, _percorso = []) {
  const ings = {}
  const nonEspandibili = []
  const q = Number(quantita) || 0
  if (!q) return { ings, nonEspandibili }

  const aggiungi = (chiave, grammi) => { ings[chiave] = (ings[chiave] || 0) + grammi }

  for (const ing of (ricetta?.ingredienti || [])) {
    const chiave = normIng(ing?.nome)
    if (!chiave) continue
    const grammi = (Number(ing.qty1stampo) || 0) * q
    if (!grammi) continue

    // Se il magazzino ha quella voce, si scarica quella: è quello che l'utente
    // tiene fisicamente sullo scaffale.
    if (inMagazzino && inMagazzino.has(chiave)) {
      aggiungi(chiave, grammi)
      continue
    }

    // Non è in magazzino: è una ricetta interna?
    const nomeRic = Object.keys(ricettario?.ricette || {}).find(k => {
      const r = ricettario.ricette[k]
      if (!r) return false
      return normIng(k) === chiave || normIng(r.nome || '') === chiave
    })
    const sub = nomeRic ? ricettario.ricette[nomeRic] : null
    const tipoSub = sub ? getR(nomeRic, sub).tipo : null

    if (sub && tipoSub === 'semilavorato') {
      if (_percorso.includes(nomeRic)) {
        nonEspandibili.push({ nome: ing.nome, motivo: 'si richiama da sola: controlla i suoi ingredienti' })
        continue
      }
      if (_profondita >= PROFONDITA_MAX) {
        nonEspandibili.push({ nome: ing.nome, motivo: `annidata oltre ${PROFONDITA_MAX} livelli` })
        continue
      }
      const pesoSub = (sub.ingredienti || []).reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
      if (pesoSub <= 0) {
        nonEspandibili.push({ nome: ing.nome, motivo: 'non ha ingredienti con una quantità' })
        continue
      }
      // Quante "volte" del semilavorato servono per i grammi richiesti.
      const volte = grammi / pesoSub
      const dentro = ingredientiDaScaricare(sub, volte, ricettario, inMagazzino, _profondita + 1, [..._percorso, nomeRic])
      for (const [k, g] of Object.entries(dentro.ings)) aggiungi(k, g)
      nonEspandibili.push(...dentro.nonEspandibili)
      continue
    }

    if (sub && tipoSub === 'interno') {
      // Una base: le dosi non sono un dato su cui muovere il magazzino.
      nonEspandibili.push({
        nome: ing.nome,
        motivo: 'è una base: aggiungila al magazzino per scaricarla, oppure scarica a mano i suoi ingredienti',
      })
      continue
    }

    // Materia prima non ancora in magazzino: si scarica comunque, così la voce
    // nasce (a giacenza negativa) e si vede che va inventariata. E' il
    // comportamento che il magazzino ha sempre avuto per gli ingredienti nuovi.
    aggiungi(chiave, grammi)
  }

  return { ings, nonEspandibili }
}
