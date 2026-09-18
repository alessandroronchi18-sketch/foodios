// Il fornitore di una materia prima: scriverlo, toglierlo, e leggerlo al
// contrario (un fornitore → tutto quello che ci compriamo).
//
// ═══ Perché esiste questo file ══════════════════════════════════════════
//
// Richiesta del titolare, 18/09/2026: «molto importante: ogni materia prima
// deve avere anche il nome del fornitore associato così riusciamo a collegare
// tutto meglio, e così nella pagina fornitori poi inseriremo una pagina con
// tutti i fornitori e direttamente si possono vedere le materie prime
// collegate».
//
// Il posto dove il fornitore vive era già stato deciso il 10/09/2026 da
// `lib/fornitoreIngrediente.js`: dentro la voce di `ricettario.ingredienti_costi`,
// accanto a `costoKg`/`costoG`, come NOME e non come id.
//
//   ingredienti_costi['burro'] = {
//     costoKg: 9.2, costoG: 0.0092,
//     fornitore: 'Latteria Rossi',
//   }
//
// Quello che mancava è **la penna**: `fornitore` si sapeva leggere
// (`fornitoreDiIngrediente`) e si sapeva scrivere solo di rimbalzo, quando
// arrivava un ordine (`costiDaOrdine`). Da nessuna schermata si poteva dire
// «il burro lo compro da Rossi». Su una gelateria che ordina da otto
// fornitori diversi, l'unico modo di saperlo era ricordarselo.
//
// E mancava la lettura al contrario. `raggruppaPerFornitore` raggruppa le
// righe di una lista di riordino, che è un'altra cosa: parte da cosa manca
// oggi in magazzino, non da cosa compriamo da chi. La pagina Fornitori
// chiede la seconda.
//
// ═══ La regola sul nome ═════════════════════════════════════════════════
//
// Il nome del fornitore dev'essere **quello che compare in fattura**: è la
// stringa con cui il titolare lo riconosce, ed è quella che permetterà di
// agganciare le fatture passive. Quindi qui non si forza il maiuscolo, non si
// toglie la «S.r.l.», non si accorcia: si tolgono solo gli spazi in eccesso.
//
// Il confronto invece è tollerante, altrimenti «Molino Rossi» e
// «molino  rossi» diventano due fornitori nell'elenco e la pagina Fornitori
// mostra due schede per la stessa persona. Due funzioni separate, come fa
// `normIng` in `foodcost.js` per gli ingredienti: una per come si scrive, una
// per come si confronta. Questo file NON importa `foodcost.js` — la mappa
// singolare/plurale di quel file è giusta per «uova → uovo» e sbagliata per
// una ragione sociale, dove «Latterie Riunite» non è il plurale di niente.

/** Spazi in eccesso via, niente altro. Vale per i nomi in generale. */
function pulisciSpazi(testo) {
  return String(testo ?? '').trim().replace(/\s+/g, ' ')
}

/** Spazi in eccesso via, tutto il resto com'era: è il nome della fattura. */
export function normalizzaNomeFornitore(nome) {
  return pulisciSpazi(nome)
}

/**
 * La chiave con cui si decide se due nomi sono lo stesso fornitore.
 * Stessa idea di `normIng`: minuscolo, spazi collassati. Niente altro — una
 * ragione sociale non si mette al singolare.
 */
export function chiaveFornitore(nome) {
  return normalizzaNomeFornitore(nome).toLowerCase()
}

/** Due nomi sono lo stesso fornitore? Maiuscole e spazi non contano. */
export function stessoFornitore(a, b) {
  const ka = chiaveFornitore(a)
  return ka !== '' && ka === chiaveFornitore(b)
}

/**
 * La chiave con cui una materia prima sta dentro `ingredienti_costi` quando
 * non ce n'è già una.
 *
 * ATTENZIONE, ed è il motivo per cui quasi tutte le funzioni qui accettano
 * `opzioni.normalizzaNome`: le chiavi vere del ricettario le scrive `normIng`,
 * che oltre a minuscolo e spazi porta al singolare una lista di plurali
 * («uova» → «uovo»). Questo file non può importarla. Chi chiama da dentro
 * l'applicazione deve passare `normIng`, altrimenti «uova» creerebbe una
 * seconda voce accanto a «uovo» già esistente.
 *
 *     import { normIng } from '../lib/foodcost'
 *     assegnaFornitore(costi, 'uova', 'Az. Agricola Bianchi', { normalizzaNome: normIng })
 *
 * Senza l'opzione il danno resta contenuto — `trovaChiaveMateriaPrima` cerca
 * comunque fra le chiavi esistenti senza distinzione di maiuscole — ma il
 * caso plurale sfugge, e quel caso c'è per davvero.
 */
export function chiaveMateriaPrima(nome) {
  return String(nome ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * La chiave ESISTENTE di una materia prima, se c'è già. `null` se è nuova.
 * Prima prova la corrispondenza esatta, poi confronta senza maiuscole e senza
 * spazi doppi: «PANNA» e «panna » non devono diventare due materie prime.
 */
export function trovaChiaveMateriaPrima(ingredientiCosti, nome, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const norm = opzioni.normalizzaNome || chiaveMateriaPrima
  const k = norm(nome)
  if (!k) return null
  if (Object.prototype.hasOwnProperty.call(costi, k)) return k
  const confronto = chiaveMateriaPrima(k)
  for (const esistente of Object.keys(costi)) {
    if (chiaveMateriaPrima(esistente) === confronto) return esistente
  }
  return null
}

/**
 * Il prezzo al chilo dichiarato in una voce, oppure `null` se non c'è.
 *
 * Due trappole, tutte e due già costate un difetto il 18/09/2026 nella pagina
 * Materie prime:
 *
 *  - **`Number(null)` fa `0`, e `Number.isFinite(0)` è vero.** Una materia
 *    prima appena creata ha `costoKg: null` apposta, perché vuol dire «non lo
 *    so»: chiedere `Number.isFinite(Number(voce.costoKg))` la dichiarava
 *    gratis. `Number.isFinite` va chiesto al valore com'è.
 *  - **Certe voci hanno solo `costoG`** (dati di prova, ricettari importati da
 *    file vecchi). È anche l'unico campo che `buildIngCosti` guarda: se qui si
 *    guardasse solo `costoKg`, si direbbe «senza prezzo» una materia prima che
 *    nel food cost un prezzo ce l'ha.
 */
export function prezzoKgDiVoce(voce) {
  if (!voce) return null
  if (Number.isFinite(voce.costoKg)) return voce.costoKg
  if (Number.isFinite(voce.costoG)) return voce.costoG * 1000
  return null
}

/** Il nome da mostrare per una materia prima: quello scritto, o la chiave. */
function nomeDiVoce(chiave, voce) {
  return pulisciSpazi(voce?.nome) || chiave
}

/**
 * Assegna il fornitore a una materia prima.
 *
 * PURA: ritorna una mappa `ingredienti_costi` nuova, senza toccare quella di
 * partenza — né la mappa né la voce dentro (che viene copiata, non modificata:
 * `nuovi[k].fornitore = x` avrebbe scritto anche nello state di React, e il
 * confronto per il salvataggio non sarebbe mai scattato).
 *
 * Il chiamante salva così:
 *     await ssave(SK_RIC, { ...ricettario, ingredienti_costi: nuovi }, orgId, null)
 *
 * - fornitore vuoto (o solo spazi) = toglierlo, come `rimuoviFornitore`.
 * - materia prima che non esiste ancora: la crea, **senza prezzo**
 *   (`costoKg: null`, `costoG: null`, mai `0`: zero vorrebbe dire gratis e nel
 *   food cost sparirebbe senza lasciare traccia).
 * - nome della materia prima vuoto: mappa invariata, niente eccezioni.
 */
export function assegnaFornitore(ingredientiCosti, nomeMateriaPrima, nomeFornitore, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const norm = opzioni.normalizzaNome || chiaveMateriaPrima
  const nomePulito = pulisciSpazi(nomeMateriaPrima)
  if (!nomePulito) return { ...costi }

  const fornitore = normalizzaNomeFornitore(nomeFornitore)
  const chiave = trovaChiaveMateriaPrima(costi, nomePulito, opzioni) || norm(nomePulito)
  if (!chiave) return { ...costi }

  const voce = costi[chiave]
  const base = voce
    ? { ...voce }
    : { nome: nomePulito, costoKg: null, costoG: null }

  if (fornitore) base.fornitore = fornitore
  else delete base.fornitore

  return { ...costi, [chiave]: base }
}

/**
 * Toglie il fornitore a una materia prima, lasciando intatto tutto il resto.
 *
 * `prezzoDa` e `prezzoAggiornatoAl` NON si cancellano: dicono da dove viene il
 * prezzo e quando è stato aggiornato, e restano veri anche se il legame col
 * fornitore viene tolto. Cancellare il prezzo insieme al fornitore avrebbe
 * riportato la materia prima a «non lo so» per un'operazione che non c'entra.
 */
export function rimuoviFornitore(ingredientiCosti, nomeMateriaPrima, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const chiave = trovaChiaveMateriaPrima(costi, nomeMateriaPrima, opzioni)
  if (!chiave || !costi[chiave]) return { ...costi }
  const base = { ...costi[chiave] }
  delete base.fornitore
  return { ...costi, [chiave]: base }
}

/** Come sopra, ma prende e ritorna il ricettario intero: si passa a `ssave`. */
export function assegnaFornitoreNelRicettario(ricettario, nomeMateriaPrima, nomeFornitore, opzioni = {}) {
  const base = ricettario || {}
  return {
    ...base,
    ricette: base.ricette || {},
    ingredienti_costi: assegnaFornitore(base.ingredienti_costi, nomeMateriaPrima, nomeFornitore, opzioni),
  }
}

/** Come `rimuoviFornitore`, ma sul ricettario intero. */
export function rimuoviFornitoreNelRicettario(ricettario, nomeMateriaPrima, opzioni = {}) {
  const base = ricettario || {}
  return {
    ...base,
    ricette: base.ricette || {},
    ingredienti_costi: rimuoviFornitore(base.ingredienti_costi, nomeMateriaPrima, opzioni),
  }
}

/**
 * I fornitori già scritti almeno una volta, per suggerirli invece di far
 * ribattere il nome ogni volta (è così che nascono «Molino Rossi» e «molino
 * rossi» nello stesso archivio).
 *
 * Ritorna `[{ nome, quante, varianti }]` in ordine alfabetico italiano:
 *  - `nome`     — la grafia da proporre: quella usata più spesso. A parità di
 *                 usi vince la prima in ordine alfabetico, così l'elenco non
 *                 cambia da un caricamento all'altro.
 *  - `quante`   — su quante materie prime compare.
 *  - `varianti` — tutte le grafie trovate, in ordine alfabetico. Quando sono
 *                 più di una vanno dette invece che nascoste: se in archivio
 *                 ce ne sono due, una delle due non combacia con la fattura.
 */
export function elencoFornitori(ingredientiCosti) {
  const perChiave = new Map()
  for (const voce of Object.values(ingredientiCosti || {})) {
    const nome = normalizzaNomeFornitore(voce?.fornitore)
    if (!nome) continue
    const k = chiaveFornitore(nome)
    if (!perChiave.has(k)) perChiave.set(k, { quante: 0, grafie: new Map() })
    const g = perChiave.get(k)
    g.quante += 1
    g.grafie.set(nome, (g.grafie.get(nome) || 0) + 1)
  }
  const out = []
  for (const { quante, grafie } of perChiave.values()) {
    const varianti = [...grafie.keys()].sort((a, b) => a.localeCompare(b, 'it'))
    const nome = varianti.slice().sort((a, b) => (grafie.get(b) - grafie.get(a)) || a.localeCompare(b, 'it'))[0]
    out.push({ nome, quante, varianti })
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

/**
 * La lettura al contrario: un fornitore, e tutto quello che gli compriamo.
 * È quello che serve alla pagina Fornitori.
 *
 * Ritorna un elenco di gruppi:
 *   { fornitore, chiave, materiePrime: [{ nome, chiave, prezzoKg, senzaPrezzo }],
 *     quante, senzaPrezzo }
 *
 * Il gruppo delle materie prime **senza fornitore** c'è sempre, con
 * `fornitore: null`, e sta in fondo. Non si nasconde: sono quelle per cui, il
 * giorno che il prezzo cambia, nessuno sa chi chiamare.
 *
 * `senzaPrezzo` conta le materie prime di quel fornitore per cui il prezzo non
 * lo sappiamo: è il numero che dice quanto vale il food cost calcolato con
 * quella merce dentro.
 */
export function materiePrimePerFornitore(ingredientiCosti) {
  const gruppi = new Map()
  for (const [chiave, voce] of Object.entries(ingredientiCosti || {})) {
    if (!String(chiave || '').trim()) continue
    const fornitore = normalizzaNomeFornitore(voce?.fornitore)
    const k = chiaveFornitore(fornitore)
    if (!gruppi.has(k)) {
      gruppi.set(k, { fornitore: fornitore || null, chiave: k || null, materiePrime: [], quante: 0, senzaPrezzo: 0 })
    }
    const g = gruppi.get(k)
    const prezzoKg = prezzoKgDiVoce(voce)
    g.materiePrime.push({ nome: nomeDiVoce(chiave, voce), chiave, prezzoKg, senzaPrezzo: prezzoKg == null })
    g.quante += 1
    if (prezzoKg == null) g.senzaPrezzo += 1
  }
  const out = [...gruppi.values()]
  for (const g of out) g.materiePrime.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  return out.sort((a, b) => {
    if ((a.fornitore == null) !== (b.fornitore == null)) return a.fornitore == null ? 1 : -1
    return String(a.fornitore || '').localeCompare(String(b.fornitore || ''), 'it')
  })
}
