// Import dei prezzi delle materie prime in blocco, e il modello Excel da
// scaricare per compilarlo.
//
// ═══ Perché esiste questo file ══════════════════════════════════════════
//
// Richiesta del titolare, 18/09/2026: «un pulsante import prezzi in cui uno
// può importare i prezzi in bulk delle materie prime, e un pulsante che se uno
// clicca scarica un esempio del doc excel con già le etichette colonne che
// devono essere: nome materia prima / prezzo al kg / fornitore. per fornitore
// scrivere che il nome deve essere esattamente quello riportato su fattura».
//
// Il conto che rende urgente questa cosa: sui dati veri di Mara dei Boschi 94
// materie prime su 99 non hanno prezzo, e il food cost medio esce al 4,8%
// invece del 25-35% vero. Novantaquattro prezzi battuti a mano, uno alla
// volta, nessuno li batte. Il listino del fornitore invece è già un file.
//
// ═══ Le tre regole di questo lettore ════════════════════════════════════
//
// 1. **Indulgente sulle intestazioni, severo sui dati.** Il file arriva dal
//    fornitore o dal commercialista, e la colonna si chiama «Prezzo €/Kg» o
//    «Costo al chilo» o «PREZZO». Quelle si riconoscono. Il contenuto no: se
//    nella cella del prezzo c'è scritto qualcosa che non è un numero, la riga
//    si scarta e si dice quale e perché.
//
//    Il difetto vero che ha dettato questa regola, trovato la mattina del
//    18/09/2026: si leggeva col `parseFloat`, che legge quanto può e butta via
//    il resto. **«12,5o»** — la o al posto dello zero, l'errore di battitura
//    più comune sulla tastiera del telefono — diventava `12.5` senza un fiato.
//    Su «abc» l'errore si vedeva, su «12,5o» no, ed è quello che capita
//    davvero. Qui il prezzo lo legge `leggiPrezzoKg` (`lib/formatIt.js`), che
//    pretende che la stringa sia un prezzo per intero e non che «cominci» per
//    prezzo.
//
// 2. **Prima si guarda, poi si scrive.** `analizzaImportMateriePrime` non
//    tocca niente: dice quante righe sono nuove, quante cambierebbero un
//    prezzo (con il valore vecchio e quello nuovo), quante sono state scartate
//    e per quale motivo, e quali nomi assomigliano a materie prime che ci sono
//    già ma non combaciano — il caso «aceto balsamicp», che non dà nessun
//    errore e crea una materia prima gemella senza prezzo. Solo dopo, e solo
//    se l'utente conferma, `applicaImportMateriePrime` costruisce la mappa
//    nuova.
//
// 3. **Il prezzo vuoto vale `null`, mai `0`.** Una cella vuota vuol dire «non
//    lo so» ed è legittima: la materia prima entra in elenco senza prezzo e la
//    pagina lo dichiara. Uno zero invece nel food cost vuol dire «gratis» e
//    sparisce senza lasciare traccia (`buildIngCosti` in `foodcost.js` accetta
//    `costoG: 0` come prezzo valido). Perciò una cella con scritto `0` non
//    viene tradotta in `null` di nascosto: la riga si scarta e si spiega che
//    per «non lo so» la cella va lasciata vuota. Indovinare cosa intendeva chi
//    ha scritto zero sarebbe inventarsi un dato di bilancio.
//
// ═══ Come si aggancia ═══════════════════════════════════════════════════
//
//   import { loadXLSX } from '../lib/xlsx'
//   import { fileToArrayBuffer } from '../lib/importParse'
//   import { normIng } from '../lib/foodcost'
//
//   const XLSX = await loadXLSX()
//   const letto = leggiFileMateriePrime(await fileToArrayBuffer(file), XLSX)
//   const resoconto = analizzaImportMateriePrime(letto.righe, ricettario.ingredienti_costi, { normalizzaNome: normIng })
//   // ...mostra il resoconto, e solo se l'utente conferma:
//   const nuovi = applicaImportMateriePrime(ricettario.ingredienti_costi, resoconto, { normalizzaNome: normIng })
//   await ssave(SK_RIC, { ...ricettario, ingredienti_costi: nuovi }, orgId, null)
//
// Il modulo XLSX si passa da fuori, come fa `importParse.js`: nel browser
// arriva dal CDN (`loadXLSX`), nei test dal pacchetto npm. Nessuna dipendenza
// nuova.

import { leggiPrezzoKg } from './formatIt'
import { loadXLSX } from './xlsx'
import { todayLocal } from './dateLocal'
import {
  chiaveMateriaPrima, normalizzaNomeFornitore, prezzoKgDiVoce, stessoFornitore,
  trovaChiaveMateriaPrima,
} from './materiePrimeFornitore'

// ─── Il modello da scaricare ────────────────────────────────────────────────

/** Le intestazioni, nell'ordine chiesto dal titolare. */
export const INTESTAZIONI_MODELLO = ['Nome materia prima', 'Prezzo al kg', 'Fornitore']

/** Un prezzo al chilo scritto all'italiana, col simbolo DOPO la cifra. */
const euroKg = (v) => `${Number(v).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`

/** La riga che spiega la regola del nome del fornitore. */
export const NOTA_FORNITORE =
  'Il nome del fornitore dev’essere esattamente quello riportato in fattura: se lo scrivi in un altro modo il collegamento non si fa.'

/** La riga che spiega perché una cella vuota vale più di uno zero. */
export const NOTA_PREZZO =
  'Il prezzo è quello al chilo, IVA esclusa, con la virgola per i decimali (12,50). Se non lo sai, lascia la cella vuota: zero vorrebbe dire «gratis» e il food cost non se ne accorgerebbe.'

/** La riga che ricorda di togliere gli esempi. */
export const NOTA_ESEMPI =
  'Le due righe qui accanto sono un esempio: cancellale prima di caricare il file.'

// ─── Riconoscere le colonne ─────────────────────────────────────────────────

// Quello che scrivono davvero in cima alla colonna. Confrontati sulla forma
// normalizzata (minuscolo, senza parentesi e senza punteggiatura).
const ALIAS_NOME = [
  'nome materia prima', 'materia prima', 'materie prime', 'nome ingrediente',
  'ingrediente', 'ingredienti', 'nome', 'prodotto', 'articolo', 'descrizione',
]
const ALIAS_PREZZO = [
  'prezzo al kg', 'prezzo al chilo', 'prezzo kg', 'prezzo/kg', '€/kg', 'eur/kg',
  'costo al kg', 'costo al chilo', 'costo kg', 'prezzo unitario', 'prezzo',
  'costo', 'importo',
]
const ALIAS_FORNITORE = [
  'nome fornitore', 'fornitore', 'fornitori', 'ragione sociale', 'venditore',
]

/**
 * L'intestazione ridotta all'osso per il confronto: minuscolo, via quello fra
 * parentesi («Prezzo al kg (IVA esclusa)»), via la punteggiatura, spazi
 * collassati. `kg.` e `KG` e `Kg` sono la stessa cosa.
 */
export function normalizzaIntestazione(testo) {
  return String(testo ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,:;"'*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function indiceDaAlias(intestazioni, alias, giaPrese) {
  // Prima la corrispondenza esatta: «nome fornitore» non deve finire nella
  // colonna del nome solo perché contiene la parola «nome».
  for (const a of alias) {
    for (let i = 0; i < intestazioni.length; i++) {
      if (giaPrese.has(i)) continue
      if (intestazioni[i] === a) return i
    }
  }
  // Poi il contenimento, che pesca «prezzo al kg 2026» o «fornitore abituale».
  for (const a of alias) {
    for (let i = 0; i < intestazioni.length; i++) {
      if (giaPrese.has(i)) continue
      if (intestazioni[i].includes(a)) return i
    }
  }
  return -1
}

/**
 * Quali colonne sono il nome, il prezzo e il fornitore.
 * Ritorna gli INDICI, o `-1` se quella colonna nel file non c'è.
 *
 * L'ordine in cui si cercano conta: prima il fornitore, poi il prezzo, poi il
 * nome. Al contrario un file con le colonne «Nome fornitore | Prezzo | Nome
 * materia prima» si prenderebbe il fornitore come nome della merce, e
 * l'import creerebbe una materia prima che si chiama «Molino Rossi».
 */
export function riconosciColonne(intestazioni) {
  const norm = (intestazioni || []).map(normalizzaIntestazione)
  const prese = new Set()
  const fornitore = indiceDaAlias(norm, ALIAS_FORNITORE, prese)
  if (fornitore >= 0) prese.add(fornitore)
  const prezzo = indiceDaAlias(norm, ALIAS_PREZZO, prese)
  if (prezzo >= 0) prese.add(prezzo)
  const nome = indiceDaAlias(norm, ALIAS_NOME, prese)
  return { nome, prezzo, fornitore }
}

// ─── Leggere il file ────────────────────────────────────────────────────────

const RIGHE_DA_SCANDAGLIARE = 15

function cellaVuota(v) {
  return v == null || String(v).trim() === ''
}

function rigaVuota(riga) {
  return !(riga || []).some(c => !cellaVuota(c))
}

/**
 * Le righe di un foglio, con le righe VUOTE al loro posto.
 *
 * Difetto trovato dai test il 18/09/2026: qui si usava `parseWorkbook`
 * (`lib/importParse.js`), che legge il foglio con `blankrows: false` e quindi
 * **butta via le righe vuote**. Va benissimo per contare le righe, non per
 * dire a quale riga sta un problema: in un listino con una riga bianca fra una
 * famiglia di prodotti e l'altra, ogni numero del resoconto risultava più
 * basso del vero, e chi apriva il file andava a guardare la riga sbagliata. In
 * un listino di trecento righe con otto stacchi, l'ultimo errore veniva
 * indicato otto righe più su.
 *
 * `blankrows: true` le tiene. E si somma l'origine del foglio (`!ref`), perché
 * un foglio che comincia dalla riga 3 fa partire la lettura da lì.
 */
function righeDelFoglio(ws, XLSX) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true })
  let origine = 0
  try {
    const ref = ws?.['!ref']
    if (ref && XLSX.utils.decode_range) origine = XLSX.utils.decode_range(ref).s.r || 0
  } catch { origine = 0 }
  return { raw, origine }
}

/**
 * Legge un file Excel o CSV e ne tira fuori le righe già interpretate.
 *
 * @param {ArrayBuffer|Uint8Array} arrayBuffer contenuto del file
 * @param {*} XLSX il modulo SheetJS (`loadXLSX()` nel browser, `import * as XLSX from 'xlsx'` nei test)
 * @param {{ foglio?: string }} opzioni nome del foglio, se il file ne ha più di uno
 * @returns {{ foglio: string, fogli: string[], rigaIntestazioni: number,
 *             intestazioni: string[], colonne: {nome:number,prezzo:number,fornitore:number},
 *             righe: Array<{riga:number, nome:string, prezzo:*, fornitore:string}> }}
 *
 * `riga` è il numero di riga come lo vede l'utente aprendo il file (la prima
 * riga è la 1): un resoconto che dice «riga 7» e nel file la riga 7 è
 * un'altra, manda a cercare il problema nel posto sbagliato.
 *
 * Le intestazioni non devono per forza stare sulla prima riga: i listini dei
 * fornitori cominciano quasi sempre con il titolo e la data. Si cercano nelle
 * prime 15 righe, e si prende la prima che contiene almeno la colonna del
 * nome. Se non si trova, si solleva un errore che dice cosa c'era scritto:
 * «non riesco a leggere il file» senza dire cosa ha letto non aiuta nessuno.
 */
export function leggiFileMateriePrime(arrayBuffer, XLSX, opzioni = {}) {
  if (!XLSX) throw new Error('leggiFileMateriePrime: serve il modulo XLSX (loadXLSX() nel browser, `import * as XLSX from "xlsx"` nei test).')
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
  // `cellDates` come in `importParse.js`: senza, le colonne data tornano come
  // numeri seriali e una cella data finita per sbaglio nella colonna del
  // prezzo diventerebbe un prezzo di 46.143 €/kg.
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  const fogli = wb.SheetNames || []
  if (fogli.length === 0) throw new Error('Il file non contiene nessun foglio.')

  const candidati = opzioni.foglio ? [opzioni.foglio] : fogli
  let scelto = null
  for (const nomeFoglio of candidati) {
    const ws = wb.Sheets?.[nomeFoglio]
    if (!ws) continue
    const { raw, origine } = righeDelFoglio(ws, XLSX)
    const limite = Math.min(raw.length, RIGHE_DA_SCANDAGLIARE)
    for (let i = 0; i < limite; i++) {
      const colonne = riconosciColonne(raw[i] || [])
      if (colonne.nome >= 0) {
        scelto = { foglio: nomeFoglio, raw, origine, indiceIntestazioni: i, colonne }
        break
      }
    }
    if (scelto) break
  }

  if (!scelto) {
    const primo = opzioni.foglio || fogli[0]
    const ws = wb.Sheets?.[primo]
    const prima = ws ? (righeDelFoglio(ws, XLSX).raw.find(r => !rigaVuota(r)) || []) : []
    const trovate = prima.filter(c => !cellaVuota(c)).map(c => String(c).trim())
    throw new Error(
      'Nel file non trovo la colonna con il nome della materia prima. ' +
      (trovate.length ? `In cima al foglio c'è scritto: ${trovate.join(' | ')}. ` : 'Il foglio sembra vuoto. ') +
      'Scarica il modello e ricopiaci dentro i dati: le colonne devono chiamarsi ' +
      `${INTESTAZIONI_MODELLO.join(' / ')}.`
    )
  }

  const { foglio, raw, origine, indiceIntestazioni, colonne } = scelto
  const intestazioni = (raw[indiceIntestazioni] || []).map(c => (c == null ? '' : String(c).trim()))

  const righe = []
  for (let i = indiceIntestazioni + 1; i < raw.length; i++) {
    const r = raw[i] || []
    if (rigaVuota(r)) continue
    const nome = cellaVuota(r[colonne.nome]) ? '' : String(r[colonne.nome]).trim().replace(/\s+/g, ' ')
    const prezzo = colonne.prezzo >= 0 ? (r[colonne.prezzo] ?? null) : null
    const fornitore = colonne.fornitore >= 0 ? normalizzaNomeFornitore(r[colonne.fornitore]) : ''
    // Una riga in cui le tre colonne che ci interessano sono tutte vuote non e'
    // una riga di dati, anche se in fondo c'e' scritto qualcosa: e' la nota in
    // coda al foglio, o la colonna «osservazioni» del listino del fornitore.
    // Senza questo controllo il modello scaricato da Foodos, ricaricato com'e',
    // si scartava da solo una riga per «nome mancante».
    if (!nome && cellaVuota(prezzo) && !fornitore) continue
    righe.push({ riga: origine + i + 1, nome, prezzo, fornitore })
  }

  return { foglio, fogli, rigaIntestazioni: origine + indiceIntestazioni + 1, intestazioni, colonne, righe }
}

// ─── Leggere un prezzo ──────────────────────────────────────────────────────

/** I motivi per cui una riga non entra. Sono stringhe stabili: la UI può filtrarci sopra. */
export const MOTIVI_SCARTO = {
  NOME_MANCANTE: 'nome_mancante',
  PREZZO_NON_VALIDO: 'prezzo_non_valido',
  PREZZO_ZERO: 'prezzo_zero',
  PREZZO_NEGATIVO: 'prezzo_negativo',
  DUPLICATO_NEL_FILE: 'duplicato_nel_file',
}

// Un punto con esattamente tre cifre dopo, e nessuna virgola: «1.250».
// In italiano è milleduecentocinquanta, in un listino esportato da un
// gestionale inglese è uno virgola due cinque. Vedi `prezzoAmbiguo`.
// 18/09/2026 — il gruppo di testa non può cominciare per zero.
//
// `0.950` con la regola larga risultava ambiguo, e la lettura «migliaia»
// avrebbe dato 950 €/kg. Ma «0.950» come migliaia in italiano non si scrive:
// nessuno scrive novecentocinquanta con lo zero davanti. È la farina a
// **novantacinque centesimi**, ed è esattamente il caso che questo file cita
// come quello da non sbagliare.
const RE_MIGLIAIA_NUDE = /^[1-9]\d{0,2}\.\d{3}$/

/**
 * Il prezzo al chilo scritto in una cella.
 * Ritorna `{ prezzoKg, motivo, spiegazione }`:
 *  - cella vuota  → `{ prezzoKg: null }`, ed è un caso LECITO;
 *  - prezzo buono → `{ prezzoKg: 12.5 }`;
 *  - altrimenti   → `prezzoKg: null` più il motivo, e la riga va scartata.
 *
 * Quello che si toglie prima di leggere è solo il simbolo della valuta e
 * l'unità attaccati in testa o in coda («€ 12,50», «12,50 €/kg»): sono
 * decorazione, non cifre. Dentro al numero non si tocca niente, altrimenti si
 * torna a indovinare.
 */
export function leggiPrezzoCella(valore) {
  if (valore == null || String(valore).trim() === '') {
    return { prezzoKg: null, motivo: null, spiegazione: null }
  }

  const testo = String(valore).trim()
  let pulito = testo
    .replace(/^(?:€|euro|eur)\s*/i, '')
    .replace(/\s*(?:€|euro|eur)?\s*(?:\/|al\s+)?\s*(?:kg|chilo|kilo)?\s*$/i, '')
    .trim()
  // Il punto di separazione delle migliaia scritto senza virgola decimale
  // («1.250» = milleduecentocinquanta) lo gestisce già `leggiPrezzoKg`.
  if (pulito === '') pulito = testo

  const v = typeof valore === 'number' && Number.isFinite(valore) ? valore : leggiPrezzoKg(pulito)

  if (v == null || !Number.isFinite(v)) {
    return {
      prezzoKg: null,
      motivo: MOTIVI_SCARTO.PREZZO_NON_VALIDO,
      spiegazione: `«${testo}» non è un prezzo. Scrivi solo il numero, con la virgola per i decimali (per esempio 12,50), oppure lascia la cella vuota se il prezzo non lo sai.`,
    }
  }
  if (v < 0) {
    return {
      prezzoKg: null,
      motivo: MOTIVI_SCARTO.PREZZO_NEGATIVO,
      spiegazione: `Il prezzo scritto è ${testo}: un prezzo al chilo sotto zero non esiste.`,
    }
  }
  if (v === 0) {
    return {
      prezzoKg: null,
      motivo: MOTIVI_SCARTO.PREZZO_ZERO,
      spiegazione: 'Il prezzo è 0, e zero vuol dire «gratis»: nel food cost quella materia prima smette di pesare senza che nessuno se ne accorga. Se il prezzo non lo sai, lascia la cella vuota.',
    }
  }
  return { prezzoKg: v, motivo: null, spiegazione: null }
}

/**
 * Il prezzo scritto è ambiguo? Vero per «1.250» e basta: un punto con
 * esattamente tre cifre dopo, nessuna virgola, e il gruppo di testa che non
 * comincia per zero.
 *
 * In Italia quel punto separa le migliaia e si legge 1250; in un listino
 * esportato da un gestionale in inglese è il separatore decimale e si legge
 * 1,25. Sono mille volte uno dall'altro, e dal file non si capisce quale sia.
 *
 * **La regola l'ha data il titolare il 18/09/2026: «di base il punto sono le
 * migliaia, la virgola i decimali».** Quindi si legge all'italiana — 1.250
 * fa milleduecentocinquanta — e la lettura all'inglese resta come alternativa
 * da proporre.
 *
 * Fino a quel giorno qui c'era la scelta opposta, motivata così: «nei listini
 * veri i tre decimali ci sono davvero, mentre una materia prima da 1.250 €/kg
 * in pasticceria non esiste». Il primo pezzo del ragionamento era giusto e si
 * è trasformato nella regola sullo zero iniziale (`0.950` è la farina a
 * novantacinque centesimi, non 950 €/kg). Il secondo era sbagliato sui dati
 * veri: nel listino di Mara la bacca di vaniglia sta a **380 €/kg** e lo
 * zafferano di più — le quattro cifre esistono.
 *
 * La scelta comunque non si nasconde: la riga finisce in `resoconto.ambigue`
 * con tutt'e due le letture, e l'utente la vede prima di confermare.
 */
export function prezzoAmbiguo(valore) {
  if (typeof valore === 'number') return false
  return RE_MIGLIAIA_NUDE.test(String(valore ?? '').trim())
}

// ─── Nomi che si assomigliano ───────────────────────────────────────────────

// Distanza di Levenshtein, iterativa su due righe: le materie prime sono
// centinaia, non serve altro.
function distanza(a, b) {
  if (a === b) return 0
  const n = a.length
  const m = b.length
  if (n === 0) return m
  if (m === 0) return n
  let prec = new Array(m + 1)
  let cur = new Array(m + 1)
  for (let j = 0; j <= m; j++) prec[j] = j
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prec[j] + 1, prec[j - 1] + costo)
    }
    const tmp = prec; prec = cur; cur = tmp
  }
  return prec[m]
}

/** Quanti errori di battitura si perdonano prima di dire «sono due cose diverse». */
function sogliaSomiglianza(chiave) {
  if (chiave.length >= 8) return 2
  if (chiave.length >= 4) return 1
  return 0
}

/**
 * La materia prima già in archivio che assomiglia di più a questo nome, se ce
 * n'è una abbastanza vicina. `null` altrimenti.
 *
 * Serve per il caso «aceto balsamicp»: non è un errore — il nome è valido, il
 * prezzo è valido, l'import va a buon fine — ed è proprio per questo che fa
 * danno. Nasce una materia prima gemella, l'aceto vero resta senza il prezzo
 * nuovo, e nel food cost non si vede niente di strano.
 */
export function materiaPrimaSimile(chiave, chiaviEsistenti) {
  const max = sogliaSomiglianza(chiave)
  if (!max) return null
  let migliore = null
  for (const esistente of chiaviEsistenti) {
    if (esistente === chiave) return null
    if (Math.abs(esistente.length - chiave.length) > max) continue
    const d = distanza(chiave, esistente)
    if (d === 0 || d > max) continue
    if (!migliore || d < migliore.distanza || (d === migliore.distanza && esistente < migliore.nome)) {
      migliore = { nome: esistente, distanza: d }
    }
  }
  return migliore
}

// ─── Il resoconto ───────────────────────────────────────────────────────────

/**
 * Cosa succederebbe se si importasse questo file. Non scrive niente.
 *
 * @param {Array<{riga:number,nome:string,prezzo:*,fornitore:string}>} righe da `leggiFileMateriePrime`
 * @param {Object} ingredientiCosti la mappa `ricettario.ingredienti_costi` di adesso
 * @param {{ normalizzaNome?: Function }} opzioni passare `normIng` da `foodcost.js`
 * @returns {{
 *   nuove: Array, aggiornate: Array, invariate: Array, scartate: Array,
 *   somiglianze: Array, ambigue: Array, totali: Object
 * }}
 *
 * Le quattro liste sono disgiunte e la loro somma fa il numero di righe lette:
 * un resoconto in cui i conti non tornano è peggio di nessun resoconto.
 *
 * Una cella del prezzo VUOTA su una materia prima che un prezzo ce l'ha già
 * NON lo cancella. Vuoto vuol dire «in questo file non c'è», non «da oggi non
 * lo so più»: un listino parziale del fornitore avrebbe azzerato mezzo
 * archivio.
 */
export function analizzaImportMateriePrime(righe, ingredientiCosti, opzioni = {}) {
  const costi = ingredientiCosti || {}
  const norm = opzioni.normalizzaNome || chiaveMateriaPrima
  const chiaviEsistenti = Object.keys(costi).filter(k => String(k || '').trim() !== '')
  const chiaviConfronto = chiaviEsistenti.map(k => chiaveMateriaPrima(k))

  const nuove = []
  const aggiornate = []
  const invariate = []
  const scartate = []
  const somiglianze = []
  const ambigue = []
  const vistiNelFile = new Map()

  for (const r of (righe || [])) {
    const riga = r?.riga ?? null
    const nome = String(r?.nome ?? '').trim().replace(/\s+/g, ' ')
    if (!nome) {
      scartate.push({
        riga, nome: '', valore: r?.prezzo ?? null,
        motivo: MOTIVI_SCARTO.NOME_MANCANTE,
        spiegazione: 'Manca il nome della materia prima: senza quello non so a che cosa attaccare il prezzo.',
      })
      continue
    }

    const chiave = trovaChiaveMateriaPrima(costi, nome, opzioni) || norm(nome)
    if (vistiNelFile.has(chiave)) {
      scartate.push({
        riga, nome, valore: r?.prezzo ?? null,
        motivo: MOTIVI_SCARTO.DUPLICATO_NEL_FILE,
        spiegazione: `«${nome}» compare già alla riga ${vistiNelFile.get(chiave)} del file: tengo quella e salto questa.`,
      })
      continue
    }

    const letto = leggiPrezzoCella(r?.prezzo)
    if (letto.motivo) {
      scartate.push({ riga, nome, valore: r?.prezzo ?? null, motivo: letto.motivo, spiegazione: letto.spiegazione })
      continue
    }

    vistiNelFile.set(chiave, riga)
    if (prezzoAmbiguo(r?.prezzo)) {
      const testo = String(r.prezzo).trim()
      // 18/09/2026, regola data dal titolare: «di base il punto sono le
      // migliaia, la virgola i decimali». `leggiPrezzoKg` adesso legge
      // all'italiana, quindi `letto.prezzoKg` è già 1250: l'**alternativa**
      // da proporre è l'altra, la lettura all'inglese. Prima era il contrario
      // e il messaggio diceva all'utente una cosa per l'altra.
      const alternativa = Number(testo)
      ambigue.push({
        riga, nome, testo,
        letto: letto.prezzoKg,
        alternativa,
        spiegazione: `«${testo}» si può leggere in due modi. Lo prendo come ${euroKg(letto.prezzoKg)}; se intendevi ${euroKg(alternativa)} scrivilo con la virgola.`,
      })
    }
    const fornitore = normalizzaNomeFornitore(r?.fornitore)
    const voce = costi[chiave]

    if (!voce) {
      nuove.push({ riga, nome, chiave, prezzoKg: letto.prezzoKg, fornitore: fornitore || null })
      const simile = materiaPrimaSimile(chiaveMateriaPrima(chiave), chiaviConfronto)
      if (simile) {
        const originale = chiaviEsistenti.find(k => chiaveMateriaPrima(k) === simile.nome) || simile.nome
        somiglianze.push({ riga, nome, chiave, simileA: originale, distanza: simile.distanza })
      }
      continue
    }

    const prezzoPrecedente = prezzoKgDiVoce(voce)
    const fornitorePrecedente = normalizzaNomeFornitore(voce.fornitore) || null
    const cambiaPrezzo = letto.prezzoKg != null && letto.prezzoKg !== prezzoPrecedente
    // Il confronto fra i due nomi NON distingue maiuscole e spazi doppi,
    // altrimenti «LATTERIA ROSSI» scritto nel listino del fornitore
    // risulterebbe un cambio rispetto a «Latteria Rossi» che c'è in archivio:
    // ogni import segnalerebbe modifiche che non esistono e riscriverebbe la
    // grafia avanti e indietro a ogni giro. Quando è lo stesso fornitore si
    // tiene la grafia già in archivio.
    const cambiaFornitore = !!fornitore && !stessoFornitore(fornitore, fornitorePrecedente || '')

    if (!cambiaPrezzo && !cambiaFornitore) {
      invariate.push({ riga, nome, chiave, prezzoKg: prezzoPrecedente, fornitore: fornitorePrecedente })
      continue
    }

    aggiornate.push({
      riga, nome, chiave,
      prezzoKg: cambiaPrezzo ? letto.prezzoKg : prezzoPrecedente,
      prezzoPrecedente,
      fornitore: cambiaFornitore ? fornitore : fornitorePrecedente,
      fornitorePrecedente,
      cambiaPrezzo,
      cambiaFornitore,
    })
  }

  return {
    nuove, aggiornate, invariate, scartate, somiglianze, ambigue,
    totali: {
      lette: (righe || []).length,
      nuove: nuove.length,
      aggiornate: aggiornate.length,
      invariate: invariate.length,
      scartate: scartate.length,
      prezziAggiornati: aggiornate.filter(a => a.cambiaPrezzo).length,
      prezziNuovi: nuove.filter(n => n.prezzoKg != null).length,
      senzaPrezzo: nuove.filter(n => n.prezzoKg == null).length,
      somiglianze: somiglianze.length,
      ambigue: ambigue.length,
    },
  }
}

/**
 * La mappa `ingredienti_costi` nuova, con dentro quello che il resoconto ha
 * annunciato. PURA: quella di partenza non si tocca.
 *
 * Il prezzo si scrive in tutti e due i campi, `costoKg` e `costoG`, con gli
 * stessi arrotondamenti che usa la creazione a mano in `Dashboard.jsx`. Non è
 * ridondanza: il calcolo del food cost guarda `costoG`, le schermate guardano
 * `costoKg`, e una voce con solo uno dei due si comporta in modo diverso a
 * seconda di chi la legge.
 */
export function applicaImportMateriePrime(ingredientiCosti, resoconto, opzioni = {}) {
  const nuovi = { ...(ingredientiCosti || {}) }
  const data = opzioni.data || todayLocal()
  const origine = opzioni.origine || 'import-prezzi'

  const scrivi = (voce, r, esisteva) => {
    const base = { ...(voce || {}) }
    if (!esisteva) {
      base.nome = base.nome || r.nome
      if (!Object.prototype.hasOwnProperty.call(base, 'costoKg')) base.costoKg = null
      if (!Object.prototype.hasOwnProperty.call(base, 'costoG')) base.costoG = null
    }
    if (r.prezzoKg != null && (!esisteva || r.cambiaPrezzo)) {
      base.costoKg = parseFloat(r.prezzoKg.toFixed(4))
      base.costoG = parseFloat((r.prezzoKg / 1000).toFixed(6))
      base.prezzoDa = origine
      base.prezzoAggiornatoAl = data
    }
    if (r.fornitore) base.fornitore = r.fornitore
    return base
  }

  for (const r of (resoconto?.nuove || [])) {
    nuovi[r.chiave] = scrivi(nuovi[r.chiave], r, false)
  }
  for (const r of (resoconto?.aggiornate || [])) {
    nuovi[r.chiave] = scrivi(nuovi[r.chiave], r, true)
  }
  return nuovi
}

// ─── Il modello Excel ───────────────────────────────────────────────────────

/**
 * Il contenuto del modello, riga per riga. Separato dalla scrittura del file
 * perché così si può provare senza aprire un foglio di calcolo.
 *
 * Le intestazioni stanno sulla PRIMA riga e sono esattamente le tre chieste:
 * il file scaricato dev'essere ricaricabile così com'è, dopo averlo compilato.
 * Le spiegazioni stanno in una quarta colonna, che l'import ignora: se
 * stessero sotto le righe dei dati, al ricaricamento diventerebbero una
 * materia prima che si chiama «Il nome del fornitore dev'essere...».
 */
export function righeModelloMateriePrime() {
  return [
    [...INTESTAZIONI_MODELLO, 'Come si compila'],
    ['Farina 00', 0.95, 'Molino Rossi', NOTA_FORNITORE],
    ['Burro di panna', 9.2, 'Latteria Bianchi Srl', NOTA_PREZZO],
    ['', '', '', NOTA_ESEMPI],
  ]
}

/** Il nome del file scaricato: parla italiano e ha la data dentro. */
export function nomeFileModello(nomeAttivita) {
  const slug = String(nomeAttivita || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `modello-prezzi-materie-prime${slug ? `-${slug}` : ''}-${todayLocal()}.xlsx`
}

/** Costruisce il workbook del modello. Il modulo XLSX si passa da fuori. */
export function costruisciModelloMateriePrime(XLSX) {
  const ws = XLSX.utils.aoa_to_sheet(righeModelloMateriePrime())
  ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 30 }, { wch: 80 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Materie prime')
  return wb
}

/**
 * Scarica il modello. Nel browser il parser arriva dal CDN come in tutto il
 * resto del prodotto; nei test si passa `XLSX` e non si tocca la rete.
 *
 * Non solleva eccezioni: un pulsante che scarica un file non deve poter far
 * saltare la pagina. Se qualcosa va storto lo dice con `notify`.
 */
export async function scaricaModelloMateriePrime({ XLSX, nomeAttivita, notify } = {}) {
  try {
    const mod = XLSX || await loadXLSX()
    const wb = costruisciModelloMateriePrime(mod)
    const nome = nomeFileModello(nomeAttivita)
    mod.writeFile(wb, nome)
    notify?.(`Modello scaricato: ${nome}`)
    return { ok: true, nomeFile: nome }
  } catch (e) {
    console.error('scaricaModelloMateriePrime:', e)
    notify?.('Non sono riuscito a preparare il modello Excel. Riprova fra un momento.', false)
    return { ok: false, errore: e?.message || 'errore sconosciuto' }
  }
}
