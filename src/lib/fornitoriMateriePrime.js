// Una materia prima, più fornitori. E un fornitore, più materie prime.
//
// ═══ Perché esiste questo file ══════════════════════════════════════════
//
// Richiesta del titolare, 19/09/2026: «crea una nuova pagina molto semplice,
// intuitiva, intelligente e migliore di sempre, con i nomi dei fornitori e le
// materie prime a loro collegate. Uno può modificare quando vuole i
// collegamenti tra materie prime e fornitori o viceversa. Una materia prima
// può avere più fornitori e un fornitore può dare più materie prime».
//
// Il dato che c'era non bastava. Dal 18/09/2026 ogni materia prima ha UN
// fornitore, scritto come nome dentro la sua voce di `ingredienti_costi`:
//
//     ingredienti_costi['burro'] = { costoKg: 9.2, fornitore: 'Latteria Rossi' }
//
// Un fornitore solo è falso quasi sempre: la panna si prende dal caseificio e,
// quando finisce di venerdì, dal cash and carry. Chi aveva due fornitori ne
// scriveva uno e si teneva l'altro in testa.
//
// ═══ La forma scelta ════════════════════════════════════════════════════
//
//     ingredienti_costi['burro'] = {
//       costoKg: 9.2, costoG: 0.0092,
//       fornitore:  'Latteria Rossi',                        // il PRINCIPALE
//       fornitori: ['Latteria Rossi', 'Cash & Carry Zeta'],  // tutti
//     }
//
// Tre invarianti, e questo file è l'unico posto che le tiene:
//
//  1. **`fornitore` è sempre `fornitori[0]`.** Non è una ripetizione inutile:
//     è il ponte con tutto il resto del prodotto. `fornitoreDiIngrediente`,
//     `raggruppaPerFornitore`, `elencoFornitori`, `materiePrimePerFornitore`,
//     `costiDaOrdine` e la colonna «Fornitore» della pagina Materie prime
//     leggono tutti `voce.fornitore`. Tenendolo allineato al primo della
//     lista, chi conosce solo il vecchio campo continua a vedere una risposta
//     vera — la principale — invece di vedere il vuoto.
//
//  2. **La lettura è l'unione di `fornitore` e `fornitori`**, senza doppioni.
//     Serve per il verso opposto: `costiDaOrdine` scrive ancora `fornitore` da
//     solo quando arriva un ordine, e quella scrittura non deve cancellare i
//     collegamenti fatti qui. Chi scrive il vecchio campo diventa il
//     principale, gli altri restano.
//
//  3. **Con un fornitore solo, `fornitori` non si scrive.** Il dato torna
//     esattamente alla forma di prima: in archivio non resta un campo in più
//     per il caso normale.
//
// **Non c'è nessuna migrazione da lanciare.** Una voce che ha solo
// `fornitore` viene letta come una lista di uno: la migrazione è la funzione
// di lettura, quindi non esiste un momento in cui i dati sono a metà.
//
// ═══ Cosa NON si rifà qui ═══════════════════════════════════════════════
//
// I nomi li tratta `materiePrimeFornitore.js` e si usa quello: il nome del
// fornitore è quello che compare in fattura (`normalizzaNomeFornitore` toglie
// solo gli spazi in eccesso), mentre il confronto è tollerante
// (`chiaveFornitore`/`stessoFornitore`: maiuscole e spazi non contano). Anche
// `elencoFornitori` e `materiePrimePerFornitore` si riusano invece di
// riscriverli — il primo per scegliere la grafia buona fra le varianti, il
// secondo per costruire ogni gruppo, e gli si passa una sotto-mappa con le
// sole materie prime di quel fornitore.

import {
  normalizzaNomeFornitore,
  chiaveFornitore,
  stessoFornitore,
  elencoFornitori,
  materiePrimePerFornitore,
  trovaChiaveMateriaPrima,
  chiaveMateriaPrima,
  prezzoKgDiVoce,
} from './materiePrimeFornitore'

/** Spazi in eccesso via. Il nome della materia prima com'è scritto. */
function pulisciSpazi(testo) {
  return String(testo ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Tutti i fornitori di una voce, il principale per primo, senza doppioni.
 *
 * L'unione di `fornitore` e `fornitori` — non solo l'array — è quello che
 * rende la convivenza col vecchio campo sicura in tutti e due i versi.
 */
export function fornitoriDiVoce(voce) {
  const out = []
  const aggiungi = (n) => {
    const nome = normalizzaNomeFornitore(n)
    if (!nome) return
    if (out.some(p => stessoFornitore(p, nome))) return
    out.push(nome)
  }
  aggiungi(voce?.fornitore)
  if (Array.isArray(voce?.fornitori)) for (const n of voce.fornitori) aggiungi(n)
  return out
}

/**
 * Una voce nuova con quei fornitori, tenendo le tre invarianti.
 * PURA: la voce di partenza non viene toccata (scriverci dentro vorrebbe dire
 * scrivere nello state di React, e il confronto per il salvataggio non
 * scatterebbe mai).
 */
export function conFornitori(voce, nomi) {
  const base = { ...(voce || {}) }
  const puliti = []
  for (const n of nomi || []) {
    const nome = normalizzaNomeFornitore(n)
    if (!nome) continue
    if (puliti.some(p => stessoFornitore(p, nome))) continue
    puliti.push(nome)
  }
  if (puliti.length === 0) {
    delete base.fornitore
    delete base.fornitori
    return base
  }
  base.fornitore = puliti[0]
  if (puliti.length === 1) delete base.fornitori
  else base.fornitori = puliti
  return base
}

/** La voce di una materia prima, o `null` se non c'è. */
function vocePerNome(costi, nome, opzioni) {
  const chiave = trovaChiaveMateriaPrima(costi, nome, opzioni)
  return chiave ? { chiave, voce: costi[chiave] } : null
}

/** I fornitori di una materia prima, per nome. Lista vuota se non ne ha. */
export function fornitoriDiMateriaPrima(ingredientiCosti, nomeMateriaPrima, opzioni = {}) {
  const trovata = vocePerNome(ingredientiCosti || {}, nomeMateriaPrima, opzioni)
  return trovata ? fornitoriDiVoce(trovata.voce) : []
}

/**
 * Collega un fornitore a una materia prima. Ritorna una mappa
 * `ingredienti_costi` NUOVA (la vecchia non si tocca), pronta per:
 *
 *     await ssave(SK_RIC, { ...ricettario, ingredienti_costi: nuovi }, orgId, null)
 *
 * - fornitore già collegato (anche scritto con altre maiuscole): mappa
 *   invariata. Non si riscrive la grafia già in archivio — è quella che il
 *   titolare ha copiato dalla fattura.
 * - materia prima che non esiste ancora: la crea **senza prezzo**
 *   (`costoKg: null`, mai `0`: zero vuol dire gratis e nel food cost sparisce
 *   senza lasciare traccia).
 * - il primo fornitore collegato diventa il principale, cioè quello che si
 *   vede nella colonna «Fornitore» della pagina Materie prime.
 *
 * `opzioni.normalizzaNome` va passato (`normIng` da `foodcost.js`) quando si
 * chiama da dentro l'applicazione: senza, «uova» creerebbe una seconda voce
 * accanto a «uovo». È la stessa avvertenza di `assegnaFornitore`.
 */
export function collegaFornitore(ingredientiCosti, nomeMateriaPrima, nomeFornitore, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const fornitore = normalizzaNomeFornitore(nomeFornitore)
  const nomeMP = pulisciSpazi(nomeMateriaPrima)
  if (!fornitore || !nomeMP) return { ...costi }

  const norm = opzioni.normalizzaNome || chiaveMateriaPrima
  const chiave = trovaChiaveMateriaPrima(costi, nomeMP, opzioni) || norm(nomeMP)
  if (!chiave) return { ...costi }

  const voce = costi[chiave] || { nome: nomeMP, costoKg: null, costoG: null }
  const attuali = fornitoriDiVoce(voce)
  if (attuali.some(f => stessoFornitore(f, fornitore))) return { ...costi }
  return { ...costi, [chiave]: conFornitori(voce, [...attuali, fornitore]) }
}

/**
 * Scollega un fornitore da una materia prima.
 *
 * Tolto l'ultimo, spariscono tutti e due i campi e la materia prima torna
 * «senza fornitore» — resta in archivio col suo prezzo: il prezzo non
 * dipende da chi te la vende, e cancellarlo insieme al legame vorrebbe dire
 * buttare via un dato per un'operazione che non c'entra.
 */
export function scollegaFornitore(ingredientiCosti, nomeMateriaPrima, nomeFornitore, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const trovata = vocePerNome(costi, nomeMateriaPrima, opzioni)
  if (!trovata || !trovata.voce) return { ...costi }
  const restanti = fornitoriDiVoce(trovata.voce).filter(f => !stessoFornitore(f, nomeFornitore))
  return { ...costi, [trovata.chiave]: conFornitori(trovata.voce, restanti) }
}

/**
 * Mette un fornitore per primo, cioè lo rende il principale.
 *
 * Serve perché il principale è quello che si vede fuori di qui: nella colonna
 * «Fornitore» delle materie prime, nei messaggi di riordino, nella spesa per
 * fornitore. Chi ne ha due deve poter dire qual è quello di tutti i giorni.
 * Se non è collegato, non succede niente (non lo si aggiunge di straforo:
 * collegare è `collegaFornitore`, e le due cose si vedono diverse a schermo).
 */
export function rendiPrincipale(ingredientiCosti, nomeMateriaPrima, nomeFornitore, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const trovata = vocePerNome(costi, nomeMateriaPrima, opzioni)
  if (!trovata || !trovata.voce) return { ...costi }
  const attuali = fornitoriDiVoce(trovata.voce)
  const scelto = attuali.find(f => stessoFornitore(f, nomeFornitore))
  if (!scelto) return { ...costi }
  const riordinati = [scelto, ...attuali.filter(f => f !== scelto)]
  return { ...costi, [trovata.chiave]: conFornitori(trovata.voce, riordinati) }
}

/** Il nome da mostrare per una materia prima: quello scritto, o la chiave. */
function nomeDiVoce(chiave, voce) {
  return pulisciSpazi(voce?.nome) || chiave
}

/**
 * La stessa relazione guardata dai due lati, pronta da disegnare.
 *
 *   {
 *     fornitori: [{ nome, chiave, varianti, quante, senzaPrezzo, materiePrime }],
 *     senzaFornitore: { materiePrime, quante, senzaPrezzo },
 *     materiePrime:   [{ nome, chiave, prezzoKg, senzaPrezzo, fornitori: [...] }],
 *     totali: { fornitori, materiePrime, collegate, senzaFornitore, senzaPrezzo, legami },
 *   }
 *
 * `senzaPrezzo` per fornitore è il numero su cui si decide chi chiamare: sono
 * le materie prime che quel fornitore ci vende e di cui non sappiamo quanto
 * costano — cioè il buco che il food cost si porta dentro senza dirlo.
 *
 * `materiePrime` senza fornitore è l'altra metà: il lavoro da fare.
 *
 * Il conto non lo rifà questo file. Il nome buono fra due grafie diverse lo
 * sceglie `elencoFornitori`; ogni gruppo lo costruisce `materiePrimePerFornitore`,
 * a cui si passa la sotto-mappa delle sole materie prime di quel fornitore.
 */
export function indiceFornitoriMateriePrime(ingredientiCosti) {
  const costi = ingredientiCosti || {}

  // Le coppie (materia prima, fornitore). Una voce con due fornitori ne fa due.
  const legami = []
  const senzaNessuno = {}
  for (const [chiave, voce] of Object.entries(costi)) {
    if (!String(chiave || '').trim()) continue
    const suoi = fornitoriDiVoce(voce)
    if (suoi.length === 0) { senzaNessuno[chiave] = voce; continue }
    for (const nome of suoi) legami.push({ chiave, voce, nome })
  }

  // `elencoFornitori` legge `voce.fornitore`: gli si dà una coppia per riga e
  // ci mette del suo la grafia da proporre (la più usata), le varianti trovate
  // e su quante materie prime compare ognuno.
  const espansa = {}
  legami.forEach((l, i) => { espansa[`${l.chiave}#${i}`] = { fornitore: l.nome } })
  const elenco = elencoFornitori(espansa)

  const fornitori = elenco.map(f => {
    const k = chiaveFornitore(f.nome)
    // La sotto-mappa: solo le sue materie prime, col nome canonico scritto nel
    // campo che `materiePrimePerFornitore` guarda. Le chiavi restano quelle
    // vere del ricettario.
    const sotto = {}
    for (const l of legami) {
      if (chiaveFornitore(l.nome) !== k) continue
      sotto[l.chiave] = { ...l.voce, nome: nomeDiVoce(l.chiave, l.voce), fornitore: f.nome }
    }
    const gruppo = materiePrimePerFornitore(sotto)[0]
    return {
      nome: f.nome,
      chiave: k,
      varianti: f.varianti,
      quante: gruppo?.quante || 0,
      senzaPrezzo: gruppo?.senzaPrezzo || 0,
      materiePrime: gruppo?.materiePrime || [],
    }
  })

  const gruppoSenza = materiePrimePerFornitore(senzaNessuno)[0]
  const senzaFornitore = {
    materiePrime: gruppoSenza?.materiePrime || [],
    quante: gruppoSenza?.quante || 0,
    senzaPrezzo: gruppoSenza?.senzaPrezzo || 0,
  }

  // Il verso opposto: ogni materia prima con i suoi fornitori in fila.
  const materiePrime = Object.entries(costi)
    .filter(([chiave]) => String(chiave || '').trim())
    .map(([chiave, voce]) => {
      const prezzoKg = prezzoKgDiVoce(voce)
      return {
        nome: nomeDiVoce(chiave, voce),
        chiave,
        prezzoKg,
        senzaPrezzo: prezzoKg == null,
        fornitori: fornitoriDiVoce(voce),
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))

  return {
    fornitori,
    senzaFornitore,
    materiePrime,
    totali: {
      fornitori: fornitori.length,
      materiePrime: materiePrime.length,
      collegate: materiePrime.length - senzaFornitore.quante,
      senzaFornitore: senzaFornitore.quante,
      senzaPrezzo: materiePrime.filter(m => m.senzaPrezzo).length,
      legami: legami.length,
    },
  }
}
