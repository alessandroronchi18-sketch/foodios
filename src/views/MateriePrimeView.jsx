// Materie prime — l'elenco degli ingredienti e quanto costano al chilo.
//
// ═══ Perché esiste questa pagina ════════════════════════════════════════
//
// Richiesta del titolare, 18/09/2026: «voglio creare una pagina solo per le
// materie prime per rendere il tutto più chiaro e semplice». Prima l'elenco
// con i prezzi era la quarta scheda del Magazzino, dietro giacenze, carico
// merce e prodotti finiti: un dato che decide il food cost di TUTTE le
// ricette stava in fondo alla pagina che si apre per contare i sacchi.
//
// E c'è una seconda ragione, più importante. Fino a oggi una materia prima
// non si poteva creare: nasceva di straforo, scrivendo un nome dentro una
// ricetta. Chi batte «aceto balsamicp» si ritrova un ingrediente nuovo,
// senza prezzo, che manda a rotoli il food cost in silenzio. Sui dati veri
// di Mara dei Boschi erano 94 materie prime su 99 senza prezzo, e il food
// cost medio usciva al 4,8% invece del 25-35% vero.
//
// Qui la materia prima si crea di proposito, con il nome normalizzato come
// il resto del prodotto (`normIng`) e il rifiuto dei doppioni: se «PANNA»
// c'è già, «panna » con lo spazio non ne crea una seconda.
//
// ═══ I difetti che questa pagina si porta dietro corretti ═══════════════
//
// L'elenco, la ricerca e la modifica del prezzo arrivano da
// `PrezziIngredientiTab` (era in `MagazzinoView.jsx`). Sono stati trasferiti
// con tutte le correzioni che avevano dentro — sono scritte qui sotto, riga
// per riga, perché sono costate care e non vanno perse in un copia-incolla.
//
// Quattro difetti sono stati trovati trasferendo, e corretti qui:
//
//   1. **Il badge «stima di mercato» non compariva mai.** L'elenco leggeva
//      `ricettario.ingredienti_costi` grezzo, dove `isStima` non c'è mai:
//      quel marcatore nasce in `buildIngCosti`, che unisce i prezzi tuoi al
//      listino medio HoReCa. Risultato: un ingrediente il cui food cost
//      gira su un prezzo medio di mercato veniva mostrato come «Prezzo da
//      impostare», cioè come se non avesse prezzo. Qui gli stati sono tre e
//      sono quelli veri: prezzo tuo, stima di mercato, nessun prezzo.
//   2. **I semilavorati finivano fra le materie prime.** Una crema usata
//      dentro una torta compariva nell'elenco con «Prezzo da impostare»,
//      ma un prezzo non lo deve avere: il suo costo esce dalla sua ricetta.
//      Gonfiavano il conto dei «senza prezzo», che è il numero su cui si
//      decide se fidarsi del food cost.
//   3. **Sul telefono il prezzo non si poteva cambiare.** Nella scheda il
//      pulsante «Modifica» c'era, ma il campo per scrivere il prezzo veniva
//      disegnato solo nella tabella del computer: si toccava e non
//      succedeva niente.
//   4. **Zero non è «gratis».** Creare una materia prima senza prezzo NON
//      scrive `costoKg: 0`: uno zero in archivio il food cost lo legge come
//      «questo ingrediente non costa niente» (`foodcost.js`,
//      `costoRigaIngrediente`). Si scrive `null`, che vuol dire «non lo so»
//      e fa dichiarare la riga come mancante.
//
// ═══ La seconda passata, 18/09/2026 pomeriggio ══════════════════════════
//
// Sette osservazioni del titolare sulla pagina vista sui dati veri (117
// materie prime, 75 senza prezzo). Quelle che hanno cambiato qualcosa di
// sostanziale, non solo di aspetto:
//
//   • **Le tessere «stima di mercato» e «prezzo tuo» sono sparite.** «Prezzo
//     tuo» era un'addizione al contrario: il totale meno le altre due, cioè
//     nessuna informazione nuova. «Stima di mercato» era peggio: dal 18/09
//     `STIMA_DI_MERCATO_FA_IL_CONTO` è `false`, quindi una materia prima
//     «stimata» nel food cost conta **zero come quelle senza prezzo**.
//     Mostrarla in una tessera ambra accanto a quella rossa diceva
//     l'opposto — che quelle erano a posto. Restano due tessere, e il conto
//     «senza prezzo» adesso comprende anche le stimate, perché è il numero
//     vero di quelle che il food cost non sa contare.
//   • **Le stimate non mostrano più il prezzo di mercato come se fosse il
//     tuo.** Nella colonna del prezzo compare `—` come per le altre senza
//     prezzo, e il numero di mercato resta sotto, in grigio, come quello che
//     è: un riferimento per scriverne uno tuo.
//   • **Il nome si può cambiare** (`onRinominaMateriaPrima`). È l'operazione
//     più delicata della pagina: il racconto di cosa comporta sta sul
//     gestore, in `Dashboard.jsx`.
//   • **La materia prima si può eliminare** (`onEliminaMateriaPrima`), con un
//     controllo doppio e informato: se qualche ricetta la usa, prima si
//     vedono quante sono e quali, e cosa succede al loro costo.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, typo, font } from '../lib/theme'
import Icon from '../components/Icon'
import { normIng, buildIngCosti } from '../lib/foodcost'
import { todayLocal } from '../lib/dateLocal'
import {
  C, TNUM, KPI, PageHeader, useSortable, SortTH, fmtp, TabellaOSchede,
} from './_shared'
import { fmtp0, leggiPrezzoKg, letturaPrezzoKg } from '../lib/formatIt'
import { formatNome } from './_shared'
import { loadXLSX } from '../lib/xlsx'
import {
  leggiFileMateriePrime, analizzaImportMateriePrime, applicaImportMateriePrime,
  scaricaModelloMateriePrime,
} from '../lib/materiePrimeImport'

// Scorciatoia alle misure del testo dai token (font.size).
const FS = font.size

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// I due comandi che stanno accanto a «Nuova materia prima»: stessa altezza,
// peso minore. Il rosso pieno resta a uno solo — quello che si usa ogni
// giorno — perché tre pulsanti pieni affiancati non dicono più quale contava.
/** Un prezzo al chilo come si scrive in Italia. */
function fmtEuroKg(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `${Number(v).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`
}

/** Un elenco di righe del resoconto, con il conto di quelle non mostrate.
 *  Mostrarle tutte farebbe scorrere una finestra per mille righe; nasconderle
 *  senza dire quante sono farebbe credere che siano quelle e basta. */
function Elenco({ titolo, voci, resto, colore }) {
  if (!voci?.length) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: font.size.sm, fontWeight: 800, color: colore, marginBottom: 5 }}>{titolo}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {voci.map((t, i) => (
          <li key={i} style={{ fontSize: font.size.sm, color: T.textMid, lineHeight: 1.5 }}>{t}</li>
        ))}
      </ul>
      {resto > 0 && (
        <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 4, paddingLeft: 18 }}>
          …e altre {resto.toLocaleString('it-IT', { useGrouping: 'always' })}.
        </div>
      )}
    </div>
  )
}

const pulsanteSecondario = {
  padding: '0 14px', minHeight: 44, background: 'transparent', color: T.textMid,
  border: `1px solid ${T.borderStr}`, borderRadius: R.md, fontSize: font.size.base,
  fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

// Nomi che nei ricettari importati arrivano dalle intestazioni del file, non
// dalla dispensa. Sono gli stessi che `calcolaFCDettaglio` salta nel calcolo:
// se li saltasse solo il calcolo e non l'elenco, qui comparirebbero materie
// prime che si chiamano «n/d» e nessuno saprebbe che prezzo dargli.
const NOMI_NON_INGREDIENTI = new Set([
  'ingrediente', 'ingredient', 'ingredienti', 'n/d', 'nan', 'undefined',
  'nome ingrediente in minuscolo', '',
])

// Come si legge un prezzo scritto a mano sta in `lib/formatIt.js`, insieme a
// come si scrive. Stava qui, ed era l'unico posto del prodotto che rifiutava
// «12,5o»: la finestra del prezzo in Nuovo gusto — l'altra porta da cui entra
// lo stesso dato — usava `parseFloat` e lo accettava come 12,50. Due regole
// per lo stesso numero divergono sempre; questa è rimasta esportata da qui
// perché è il nome con cui la conoscono i test che la difendono.
export { leggiPrezzoKg }

/** Un prezzo al chilo scritto all'italiana, col simbolo dopo la cifra. */
const euroKg = (v) => `${Number(v).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`

/**
 * Il prezzo al chilo dichiarato in una voce di `ingredienti_costi`, o `null`
 * se non ce n'è uno.
 *
 * Due trappole, tutte e due incontrate scrivendo questa pagina il
 * 18/09/2026:
 *
 *  - **`Number(null)` fa `0`, e `Number.isFinite(0)` è vero.** Scritto come
 *    `Number.isFinite(Number(voce.costoKg))`, il controllo prendeva una
 *    materia prima appena creata — che in archivio ha `costoKg: null`
 *    apposta, perché «non lo so» — e la dichiarava a prezzo zero, cioè
 *    gratis. Esattamente il difetto che questa pagina esiste per evitare,
 *    dentro la pagina stessa. `Number.isFinite` va chiesto al valore com'è,
 *    non alla sua conversione.
 *  - **Certe voci hanno solo `costoG`** (i dati di prova, e i ricettari
 *    importati da file vecchi). `buildIngCosti` guarda proprio `costoG`: se
 *    qui si guardasse solo `costoKg`, la pagina direbbe «prezzo mancante»
 *    per una materia prima che nel food cost un prezzo ce l'ha.
 */
function prezzoDichiaratoKg(voce) {
  if (!voce) return null
  if (Number.isFinite(voce.costoKg)) return voce.costoKg
  if (Number.isFinite(voce.costoG)) return voce.costoG * 1000
  return null
}

/**
 * L'elenco delle materie prime, con lo stato del prezzo e dove sono usate.
 *
 * È una funzione pura apposta: il conto delle materie prime senza prezzo è
 * il numero che dice se il food cost è attendibile, e un numero del genere
 * si deve poter provare senza disegnare niente.
 *
 * Ogni riga: { key, nome, prezzoKg, statoPrezzo, ricette[] }
 *   - statoPrezzo `tuo`      — il prezzo l'hai scritto tu (anche 0: esiste
 *                              la materia prima regalata dal fornitore, o
 *                              dell'orto, ed è un dato, non un buco)
 *   - statoPrezzo `stima`    — prezzo medio di mercato del listino HoReCa
 *   - statoPrezzo `mancante` — nessun prezzo: il food cost non la conta
 */
export function materiePrimeDaRicettario(ricettario) {
  const ricette = ricettario?.ricette || {}
  const miei = ricettario?.ingredienti_costi || {}
  // I prezzi come li vede il food cost: i tuoi sopra il listino di mercato.
  const uniti = buildIngCosti(miei)

  // I semilavorati non sono materie prime: il loro costo esce dalla loro
  // ricetta. Si riconoscono sia dalla chiave sia dal nome, perché nei
  // ricettari importati le due cose non sempre coincidono.
  const semilavorati = new Set()
  for (const [chiave, r] of Object.entries(ricette)) {
    if (r?.tipo !== 'semilavorato') continue
    const a = normIng(chiave); if (a) semilavorati.add(a)
    const b = normIng(r?.nome || ''); if (b) semilavorati.add(b)
  }

  // ── Le basi con un prezzo scritto a mano restano in elenco ─────────────
  //
  // 18/09/2026, audit sui dati veri di Mara dei Boschi. Escludere i
  // semilavorati è giusto in linea di principio: il loro costo esce dalla
  // loro ricetta, e chiedere anche un prezzo sarebbe chiedere due volte la
  // stessa cosa. Ma c'è un caso in cui non è vero, ed è proprio il suo.
  //
  // Quando una base ha ANCHE un prezzo al chilo scritto a mano nel listino,
  // quel prezzo **vince** sul calcolo — decisione del 16/09, perché un prezzo
  // scritto da chi produce è una misura, mentre un calcolo su ingredienti
  // metà dei quali non hanno prezzo è una stima al ribasso.
  //
  // Sui dati veri: «base bianca» ha un prezzo scritto a mano di 2,31 €/kg, ed
  // è quello che il programma addebita a **29 ricette su 68**. Escludendola
  // da questo elenco, quel numero non si poteva più né vedere né cambiare da
  // nessuna parte del prodotto: il campo «Costo al kg della base» in Nuovo
  // gusto compare solo per il tipo `interno`, e questa è `semilavorato`.
  // Un numero che muove i conti di 29 ricette e che nessuno può toccare è
  // peggio di un numero sbagliato.
  const conPrezzoScrittoAMano = new Set()
  for (const k of semilavorati) {
    const v = miei[k]
    // Lo zero non vale come prezzo di una base, e qui va detto perché.
    //
    // Per una materia prima zero è un prezzo legittimo — l'omaggio del
    // fornitore, la roba dell'orto — e infatti l'elenco lo segna «gratis».
    // Per una BASE no: il motore del food cost (`foodcost.js`) fa vincere il
    // prezzo scritto a mano solo se è maggiore di zero, altrimenti torna a
    // calcolare dalla ricetta. Se qui accettassimo lo zero, questa pagina
    // direbbe «è questo che il programma addebita» e sarebbe falso.
    //
    // C'è anche una ragione più concreta: nel database esistono voci a zero
    // nate dal difetto che abbiamo passato la giornata a correggere — lo zero
    // scritto dove si voleva dire «non lo so». Farlo vincere le
    // trasformerebbe tutte in «questa base è gratis».
    const kg = prezzoDichiaratoKg(v)
    if (v && v.isStima !== true && kg !== null && kg > 0) conPrezzoScrittoAMano.add(k)
  }
  const daNascondere = (k) => semilavorati.has(k) && !conPrezzoScrittoAMano.has(k)

  const map = new Map()
  const riga = (k, nomeVisibile) => {
    if (!map.has(k)) {
      const mio = miei[k]
      const unito = uniti[k]
      const prezzoMio = prezzoDichiaratoKg(mio)
      const dichiarato = prezzoMio !== null && mio?.isStima !== true
      const prezzoStima = prezzoDichiaratoKg(unito)
      const stima = !dichiarato && unito?.isStima === true && prezzoStima !== null && prezzoStima > 0
      map.set(k, {
        key: k,
        nome: nomeVisibile || k,
        // Una base che compare qui perché ha un prezzo scritto a mano: va
        // detto, altrimenti sembra una materia prima come le altre e nessuno
        // capisce perché il Ricettario ne calcola anche la ricetta.
        eBase: semilavorati.has(k),
        prezzoKg: dichiarato ? prezzoMio : stima ? prezzoStima : 0,
        statoPrezzo: dichiarato ? 'tuo' : stima ? 'stima' : 'mancante',
        fornitore: mio?.fornitore || null,
        ricette: [],
      })
    }
    return map.get(k)
  }

  for (const [chiaveRicetta, ric] of Object.entries(ricette)) {
    const nomeRicetta = ric?.nome || chiaveRicetta
    for (const ing of (ric?.ingredienti || [])) {
      const k = normIng(ing?.nome || '')
      if (!k || NOMI_NON_INGREDIENTI.has(k) || daNascondere(k)) continue
      const r = riga(k, ing?.nome || k)
      if (!r.ricette.includes(nomeRicetta)) r.ricette.push(nomeRicetta)
    }
  }
  // Le materie prime con un prezzo ma non usate (ancora) da nessuna ricetta:
  // ci sono, e sparire dall'elenco sarebbe il modo per non trovarle più.
  for (const k of Object.keys(miei)) {
    if (!k || NOMI_NON_INGREDIENTI.has(k) || daNascondere(k)) continue
    riga(k, k)
  }

  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

/**
 * Quante sono, e in che stato sta il loro prezzo.
 *
 * `senzaPrezzoVero` è il numero che va a schermo, e non coincide con
 * `senzaPrezzo`. Dal 18/09/2026 `STIMA_DI_MERCATO_FA_IL_CONTO` è `false`
 * (`foodcost.js`): un prezzo preso dal listino medio HoReCa **non entra nel
 * food cost**. Quindi una materia prima «stimata», per il conto, vale
 * esattamente come una senza prezzo — e tenerle in due conti separati faceva
 * credere che le stimate fossero a posto.
 *
 * `senzaPrezzo` resta il conto delle sole «mancante»: serve a distinguere chi
 * non ha nemmeno un riferimento da chi ne ha uno di mercato.
 */
export function contaMateriePrime(righe) {
  const tot = righe.length
  const senzaPrezzo = righe.filter(r => r.statoPrezzo === 'mancante').length
  const stimate = righe.filter(r => r.statoPrezzo === 'stima').length
  return {
    tot, senzaPrezzo, stimate,
    senzaPrezzoVero: senzaPrezzo + stimate,
    conPrezzoTuo: tot - senzaPrezzo - stimate,
  }
}

/**
 * Tutti i nomi già presi: le materie prime, i semilavorati e le ricette.
 *
 * Serve al rifiuto dei doppioni. Ci stanno dentro anche i semilavorati
 * apposta: se esiste il semilavorato «crema pasticcera», una materia prima
 * con lo stesso nome renderebbe ambiguo ogni calcolo che la incontra.
 */
export function chiaviGiaUsate(ricettario) {
  const usate = new Set()
  for (const k of Object.keys(ricettario?.ingredienti_costi || {})) {
    const n = normIng(k); if (n) usate.add(n)
  }
  for (const [chiave, ric] of Object.entries(ricettario?.ricette || {})) {
    const a = normIng(chiave); if (a) usate.add(a)
    const b = normIng(ric?.nome || ''); if (b) usate.add(b)
    for (const ing of (ric?.ingredienti || [])) {
      const n = normIng(ing?.nome || ''); if (n) usate.add(n)
    }
  }
  return usate
}

/**
 * Controlla il nome e il prezzo di una materia prima nuova.
 *
 * @returns {{ok:true, chiave:string, nome:string, prezzoKg:number|null}
 *          |{ok:false, errore:string, campo:'nome'|'prezzo'}}
 */
export function verificaNuovaMateriaPrima(nome, prezzo, chiaviEsistenti = new Set()) {
  // Gli spazi doppi in mezzo al nome sono la causa numero uno dei doppioni
  // che sembrano uguali: «farina  00» e «farina 00» sono la stessa cosa.
  const pulito = String(nome ?? '').trim().replace(/\s+/g, ' ')
  if (!pulito) return { ok: false, campo: 'nome', errore: 'Scrivi come si chiama la materia prima.' }
  if (pulito.length < 2) return { ok: false, campo: 'nome', errore: 'Il nome è troppo corto: scrivilo per intero, per esempio «panna fresca».' }
  const chiave = normIng(pulito)
  if (!chiave || NOMI_NON_INGREDIENTI.has(chiave)) {
    return { ok: false, campo: 'nome', errore: 'Questo nome non si può usare: è una parola che il programma usa per le intestazioni dei file.' }
  }
  if (chiaviEsistenti.has(chiave)) {
    return { ok: false, campo: 'nome', errore: `«${pulito}» c'è già. Cercala nell'elenco qui sotto e cambiale il prezzo, invece di crearne una seconda.` }
  }

  const grezzo = String(prezzo ?? '').trim()
  // Il prezzo si può non sapere ancora, e va bene: si crea lo stesso e
  // resta nell'elenco dei «senza prezzo» finché non lo scrivi. Quello che
  // non va bene è inventarlo.
  if (!grezzo) return { ok: true, chiave, nome: pulito, prezzoKg: null }
  // `letturaPrezzoKg` invece di `leggiPrezzoKg`: applica la stessa regola
  // italiana, ma toglie anche il simbolo dell'euro. «12,50 €» è come il prezzo
  // è scritto su ogni schermata di questo prodotto, e ricopiarlo da lì deve
  // funzionare.
  const v = letturaPrezzoKg(grezzo).valore
  if (v === null) {
    return { ok: false, campo: 'prezzo', errore: 'Scrivi un prezzo in euro per chilo, per esempio 12,50. Se non lo sai ancora, lascia il campo vuoto.' }
  }
  if (v === 0) {
    return { ok: false, campo: 'prezzo', errore: 'Zero vuol dire «gratis», non «non lo so». Se il prezzo non lo sai ancora, lascia il campo vuoto.' }
  }
  if (v > 1000) {
    return { ok: false, campo: 'prezzo', errore: 'Più di 1.000 € al chilo: controlla, di solito è il prezzo della confezione e non quello del chilo.' }
  }
  return { ok: true, chiave, nome: pulito, prezzoKg: v }
}

/**
 * Controlla il nome nuovo di una materia prima che si sta rinominando.
 *
 * Il nome è la chiave con cui il food cost trova il prezzo, quindi qui si
 * decide se un cambio è sicuro. Due cose che sembrano dettagli e non lo sono:
 *
 *  - **`chiaviEsistenti` contiene anche la chiave di chi stiamo rinominando**
 *    (`chiaviGiaUsate` guarda tutto il ricettario, compreso lui). Senza
 *    escluderla, correggere «PANNA» in «Panna» verrebbe rifiutato come
 *    doppione di sé stesso.
 *  - **Cambiare solo maiuscole o spazi è un cambio legittimo** e non tocca
 *    nessuna chiave: `normIng` dà lo stesso risultato. Si lascia passare
 *    (`soloForma: true`), perché a schermo il nome cambia davvero.
 *
 * @returns {{ok:true, chiave:string, nome:string, soloForma:boolean}
 *          |{ok:false, errore:string}}
 */
export function verificaRinominaMateriaPrima(nomeNuovo, riga, chiaviEsistenti = new Set()) {
  const pulito = String(nomeNuovo ?? '').trim().replace(/\s+/g, ' ')
  if (!pulito) return { ok: false, errore: 'Scrivi il nome nuovo.' }
  if (pulito.length < 2) return { ok: false, errore: 'Il nome è troppo corto: scrivilo per intero, per esempio «panna fresca».' }
  const chiave = normIng(pulito)
  if (!chiave || NOMI_NON_INGREDIENTI.has(chiave)) {
    return { ok: false, errore: 'Questo nome non si può usare: è una parola che il programma usa per le intestazioni dei file.' }
  }
  if (pulito === String(riga?.nome ?? '')) {
    return { ok: false, errore: 'Il nome è già questo: non c’è niente da cambiare.' }
  }
  const soloForma = chiave === riga?.key
  if (!soloForma && chiaviEsistenti.has(chiave)) {
    return { ok: false, errore: `«${pulito}» c’è già. Non unisco due materie prime da sola: dovrei decidere io quale dei due prezzi tenere e cosa fare dei due storici. Scegli un altro nome, oppure sistema prima l’altra voce.` }
  }
  return { ok: true, chiave, nome: pulito, soloForma }
}

/**
 * Riscrive il nome di una materia prima in TUTTI gli archivi in cui è scritto.
 *
 * È una funzione pura, e lo è di proposito: non salva, non tocca lo state, non
 * conosce il database. Riceve gli archivi e ne restituisce le copie nuove.
 * Chi la chiama (`Dashboard.handleRinominaMateriaPrima`) li scrive tutti con
 * una chiamata sola.
 *
 * ═══ Perché questa è l'operazione più pericolosa della pagina ═════════════
 *
 * Il nome è la **chiave** con cui il food cost trova il prezzo: sotto non c'è
 * nessun codice. `calcolaFC` prende il nome scritto dentro la ricetta, lo
 * normalizza con `normIng` e lo cerca in `ingredienti_costi`. Se il listino
 * dice «panna fresca» e la ricetta dice ancora «panna frescs», la ricetta non
 * trova niente: **non dà errore**, conta quell'ingrediente zero, e il food
 * cost esce più basso del vero. In silenzio.
 *
 * Quindi lo stesso nome va riscritto in quattro posti, e o si riscrivono
 * tutti o non se ne riscrive nessuno:
 *
 *   1. la voce del listino        `ricettario.ingredienti_costi[chiave]`
 *   2. ogni ricetta che la usa    `ricette[*].ingredienti[*].nome`
 *   3. lo storico dei prezzi      `logPrezzi[*].ingrediente`
 *      (`getPrezzoStoricoKg` filtra proprio su quel campo: senza, il food
 *      cost di ogni produzione già chiusa perde il prezzo di allora)
 *   4. la resa                    `rese[chiave]`
 *      (una resa dell'85% che torna al 100% cambia il costo di ogni ricetta
 *      che usa quell'ingrediente, e nessuno l'ha chiesto)
 *
 * Il doppione si **rifiuta**, non si unisce: unire vuol dire decidere quale
 * dei due prezzi sopravvive e cosa fare dei due storici, ed è una scelta che
 * deve fare una persona.
 *
 * @returns {{ok:true, ricettario:object, logPrezzi:Array, rese:object|null,
 *            ricetteAggiornate:number, nome:string}
 *          |{ok:false, errore:string}}
 */
export function applicaRinominaMateriaPrima(archivi, nomeVecchio, nomeNuovo) {
  const base = archivi?.ricettario
  if (!base) return { ok: false, errore: 'Il ricettario non è ancora caricato: riprova fra un momento.' }
  const logPrezzi = archivi?.logPrezzi || []
  const rese = archivi?.rese || {}

  const vecchiaChiave = normIng(String(nomeVecchio ?? '').trim())
  // Gli spazi doppi in mezzo sono la causa numero uno dei doppioni che
  // sembrano uguali: «farina  00» e «farina 00» sono la stessa cosa.
  const pulito = String(nomeNuovo ?? '').trim().replace(/\s+/g, ' ')
  const nuovaChiave = normIng(pulito)
  if (!vecchiaChiave) return { ok: false, errore: 'Non riesco a leggere il nome di prima.' }
  if (!pulito) return { ok: false, errore: 'Scrivi il nome nuovo.' }
  if (!nuovaChiave || NOMI_NON_INGREDIENTI.has(nuovaChiave)) {
    return { ok: false, errore: 'Questo nome non si può usare: è una parola che il programma usa per le intestazioni dei file.' }
  }
  if (pulito === String(nomeVecchio ?? '')) return { ok: false, errore: 'Il nome è già questo: non c’è niente da cambiare.' }

  // Il doppione si ricontrolla QUI e non solo nella finestra: fra il momento
  // in cui si apre e quello in cui si salva, il ricettario può essere
  // cambiato da un'altra scheda del browser o da un'altra persona.
  //
  // `nuovaChiave === vecchiaChiave` NON è un doppione: è chi corregge solo le
  // maiuscole o uno spazio di troppo. Lì non si scontra con niente.
  if (nuovaChiave !== vecchiaChiave) {
    if (Object.prototype.hasOwnProperty.call(base.ingredienti_costi || {}, nuovaChiave)) {
      return { ok: false, errore: `«${pulito}» c’è già fra le materie prime. Non le unisco da sola: deciderei io quale dei due prezzi tenere. Cambia prima l’altra, oppure scegli un nome diverso.` }
    }
    for (const [chiaveRic, r] of Object.entries(base.ricette || {})) {
      if (normIng(chiaveRic) === nuovaChiave || normIng(r?.nome || '') === nuovaChiave) {
        return { ok: false, errore: `«${pulito}» è già il nome di una ricetta o di un semilavorato: scegline un altro.` }
      }
      for (const ing of (r?.ingredienti || [])) {
        if (normIng(ing?.nome || '') === nuovaChiave) {
          return { ok: false, errore: `«${pulito}» c’è già: la usa la ricetta «${r?.nome || chiaveRic}». Non le unisco da sola.` }
        }
      }
    }
  }

  // 1. Il listino. Se la voce non c'è — materia prima nata solo dentro una
  //    ricetta, senza prezzo — non se ne inventa una vuota.
  const costi = { ...(base.ingredienti_costi || {}) }
  if (Object.prototype.hasOwnProperty.call(costi, vecchiaChiave)) {
    const voce = costi[vecchiaChiave]
    delete costi[vecchiaChiave]
    costi[nuovaChiave] = voce
  }

  // 2. Le ricette. Si conta quante ne vengono toccate: è il numero che si dice
  //    all'utente, ed è l'unico modo che ha di capire quanto pesava quel nome.
  let ricetteAggiornate = 0
  const ricette = {}
  for (const [chiaveRic, r] of Object.entries(base.ricette || {})) {
    const ings = r?.ingredienti
    if (!Array.isArray(ings)) { ricette[chiaveRic] = r; continue }
    let toccata = false
    const nuoviIng = ings.map(ing => {
      if (normIng(ing?.nome || '') !== vecchiaChiave) return ing
      toccata = true
      return { ...ing, nome: pulito }
    })
    if (toccata) { ricetteAggiornate++; ricette[chiaveRic] = { ...r, ingredienti: nuoviIng } }
    else ricette[chiaveRic] = r
  }

  // 3. Lo storico dei prezzi.
  const logNuovo = logPrezzi.map(e => (
    normIng(String(e?.ingrediente || '').trim()) === vecchiaChiave ? { ...e, ingrediente: pulito } : e
  ))

  // 4. La resa. Solo se la chiave cambia davvero e se una resa c'è: scriverne
  //    una uguale al default riempirebbe l'archivio di righe che non dicono
  //    niente.
  let reseNuove = null
  if (nuovaChiave !== vecchiaChiave && rese[vecchiaChiave] !== undefined) {
    reseNuove = { ...rese }
    reseNuove[nuovaChiave] = reseNuove[vecchiaChiave]
    delete reseNuove[vecchiaChiave]
  }

  return {
    ok: true,
    ricettario: { ...base, ricette, ingredienti_costi: costi },
    logPrezzi: logNuovo,
    rese: reseNuove,
    ricetteAggiornate,
    nome: pulito,
  }
}

/**
 * Toglie una materia prima dal listino.
 *
 * Funzione pura come la sorella qui sopra. Due cose che NON fa, e sono le due
 * che contano:
 *
 *  - **non tocca le ricette.** Cancellare una voce di listino non toglie
 *    l'ingrediente dalle ricette che lo scrivono: quelle restano com'erano,
 *    con un ingrediente che adesso non ha più prezzo. È la ragione per cui la
 *    pagina, prima di chiedere conferma, dice quante ricette sono e quali:
 *    il loro costo scenderà, e il margine sembrerà migliore del vero.
 *  - **non tocca lo storico dei prezzi.** Quello è il registro di cosa è
 *    successo, e serve al food cost delle produzioni già chiuse. Una cosa
 *    successa non smette di essere successa perché si cancella una riga del
 *    listino.
 *
 * @returns {{ok:true, ricettario:object}|{ok:false, errore:string}}
 */
export function applicaEliminaMateriaPrima(ricettario, nome) {
  if (!ricettario) return { ok: false, errore: 'Il ricettario non è ancora caricato: riprova fra un momento.' }
  const chiave = normIng(String(nome ?? '').trim())
  if (!chiave) return { ok: false, errore: 'Non riesco a leggere il nome.' }
  const costi = { ...(ricettario.ingredienti_costi || {}) }
  if (!Object.prototype.hasOwnProperty.call(costi, chiave)) {
    // Una materia prima che vive solo dentro le ricette non ha una voce da
    // cancellare: farla sparire vuol dire toglierla da quelle ricette, che è
    // un'altra operazione e si fa dal Ricettario.
    return { ok: false, errore: `«${nome}» non ha una voce nel listino: esiste solo perché la scrivono delle ricette. Per farla sparire, toglila da quelle ricette nel Ricettario.` }
  }
  delete costi[chiave]
  return { ok: true, ricettario: { ...ricettario, ricette: ricettario.ricette || {}, ingredienti_costi: costi } }
}

// ─── La pagina ──────────────────────────────────────────────────────────────
export default function MateriePrimeView({
  ricettario, logPrezzi, onUpdatePrezzo, onCreaMateriaPrima,
  onRinominaMateriaPrima, onEliminaMateriaPrima, onImportPrezzi,
  onAssegnaFornitore, onApriFornitore, onNavigate, notify,
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // 18/09/2026 — «isMobile ? grande : piccolo» lascia fuori il tablet, che si
  // tocca col dito come un telefono. Su questa pagina toccava proprio il campo
  // del prezzo, cioè l'azione per cui la pagina esiste.
  const dito = isMobile || isTablet
  // 18/09/2026, il titolare: «le barre nella pagina materie prime sono molto
  // più spesse di prima, falle tornare alla grandezza di prima riordinando
  // bene le cose che ci sono dentro».
  //
  // Erano cresciute per due motivi sommati. Il primo: nella riga è entrata
  // roba nuova — il fornitore, il pulsante che apre le ricette, i due comandi
  // per rinominare ed eliminare. Il secondo, che pesava di più: tutti quei
  // comandi erano stati messi a 44px **anche col mouse**. Quarantaquattro è
  // la misura di un polpastrello, non di un puntatore: col mouse ne bastano
  // 32, e quattro comandi da 44 in fila fanno una riga alta come tre.
  //
  // Col dito resta tutto a 44, che è l'unico posto dove serve davvero.
  const padCella = dito ? '10px 14px' : '5px 14px'
  const [search, setSearch] = useState('')
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
  // Il fornitore si modifica insieme al prezzo, ma si salva per conto suo:
  // cambiare chi te la vende non cambia nessun costo passato, quindi non
  // deve passare dalla finestra di conferma che esiste per i prezzi.
  const [editForn, setEditForn] = useState('')
  // Il doppio controllo della rinomina: si riazzera a ogni apertura, così
  // non resta spuntato da una volta all'altra.
  const [rinominaConfermato, setRinominaConfermato] = useState(false)
  const [errEdit, setErrEdit] = useState(null)
  const [confirmKey, setConfirmKey] = useState(null)
  const [confirmVal, setConfirmVal] = useState(null)
  const [confirmDecorre, setConfirmDecorre] = useState(() => todayLocal())
  const [salvandoPrezzo, setSalvandoPrezzo] = useState(false)
  // Chiavistello sincrono contro il doppio invio.
  //
  // I pulsanti sono già `disabled` durante l'attesa, ma la finestra e i campi
  // rispondono anche a Invio, e il tasto non guarda il pulsante. Lo `state`
  // da solo NON basta e lo si è verificato il 18/09/2026: fra la pressione e
  // il ridisegno di React passa un istante, e due Invio rapidi ci stanno
  // dentro tutti e due. Risultato: due righe nello storico per una modifica
  // sola — e uno storico dei prezzi che non torna è un P&L che non torna.
  // Un `ref` cambia subito, senza aspettare il ridisegno.
  const inCorso = useRef(false)
  const [showLog, setShowLog] = useState(false)
  // La creazione di una materia prima nuova.
  const [showNuova, setShowNuova] = useState(false)
  // L'import in blocco: il resoconto si guarda PRIMA di scrivere.
  const [imp, setImp] = useState(null)   // { nomeFile, resoconto } | { errore }
  const [importando, setImportando] = useState(false)

  // ── Portare dentro i prezzi tutti insieme ──────────────────────────────
  //
  // Il resoconto non è una cortesia: è la differenza fra un import e un
  // disastro. Su 117 materie prime, un file sbagliato di una colonna
  // riscriverebbe centodiciassette prezzi senza che nessuno se ne accorga —
  // e i prezzi sono la base di tutto il food cost. Quindi si legge, si
  // conta, si mostra, e solo dopo si scrive.
  const apriImport = async (file) => {
    setImportando(true)
    try {
      const XLSX = await loadXLSX()
      const buf = await file.arrayBuffer()
      const letto = leggiFileMateriePrime(buf, XLSX)
      const resoconto = analizzaImportMateriePrime(letto.righe, ricettario?.ingredienti_costi || {}, { normalizzaNome: normIng })
      setImp({ nomeFile: file.name, foglio: letto.foglio, resoconto })
    } catch (e) {
      setImp({ nomeFile: file.name, errore: e?.message || 'Non sono riuscito a leggere il file.' })
    } finally {
      setImportando(false)
    }
  }

  const confermaImport = async () => {
    if (!imp?.resoconto) return
    setImportando(true)
    try {
      const nuovi = applicaImportMateriePrime(ricettario?.ingredienti_costi || {}, imp.resoconto, { data: todayLocal(), origine: imp.nomeFile })
      // Prima si salva, poi si chiude: se il salvataggio fallisce il
      // resoconto resta aperto e nessuno crede di aver importato.
      await onImportPrezzi?.(nuovi, imp.resoconto)
      setImp(null)
    } catch (e) {
      notify?.(`Import non riuscito: ${e?.message || 'errore di rete'}. Non ho scritto niente.`, false)
    } finally {
      setImportando(false)
    }
  }

  const scaricaModello = async () => {
    try {
      const XLSX = await loadXLSX()
      await scaricaModelloMateriePrime({ XLSX, nomeAttivita: 'materie-prime', notify })
    } catch (e) {
      notify?.('Non sono riuscito a preparare il file di esempio. Riprova fra poco.', false)
    }
  }
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoPrezzo, setNuovoPrezzo] = useState('')
  const [errNuova, setErrNuova] = useState(null)
  const [creando, setCreando] = useState(false)
  // Le ricette che usano una materia prima, aperte una alla volta o più
  // insieme: si confrontano due materie prime senza dover richiudere.
  const [ricetteAperte, setRicetteAperte] = useState(() => new Set())
  // Il cambio di nome.
  const [rinominaKey, setRinominaKey] = useState(null)
  const [rinominaNome, setRinominaNome] = useState('')
  const [errRinomina, setErrRinomina] = useState(null)
  const [rinominando, setRinominando] = useState(false)
  // L'eliminazione, e la casella che fa da secondo controllo.
  const [eliminaKey, setEliminaKey] = useState(null)
  const [eliminaCapito, setEliminaCapito] = useState(false)
  const [errElimina, setErrElimina] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const righe = useMemo(() => materiePrimeDaRicettario(ricettario), [ricettario])
  const conti = useMemo(() => contaMateriePrime(righe), [righe])
  const giaUsate = useMemo(() => chiaviGiaUsate(ricettario), [ricettario])

  const { sortKey, sortDir, toggleSort, sort } = useSortable('nome', 'asc')
  const filtrate = useMemo(() => {
    const q = search.toLowerCase().trim()
    const base = q ? righe.filter(r => (r.nome || '').toLowerCase().includes(q)) : righe
    return sort(base, (r, k) => {
      if (k === 'nome') return r.nome || ''
      if (k === 'usata') return r.ricette.length
      // Le «senza prezzo» non valgono zero: mescolarle con quelle a prezzo
      // zero dichiarato (l'omaggio del fornitore, la roba dell'orto) le
      // renderebbe indistinguibili proprio nell'ordinamento che si usa per
      // trovarle. Con un valore sotto lo zero si raccolgono tutte insieme a
      // un capo dell'elenco, e il verso decide a quale.
      if (k === 'prezzo') return r.statoPrezzo === 'mancante' ? -1 : r.prezzoKg
      return 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [righe, search, sortKey, sortDir])

  // Paginazione: un ricettario completo arriva a 400-500 materie prime, e
  // disegnarle tutte mentre si scrive nella ricerca è proprio il momento in
  // cui la pagina deve restare reattiva. Il limite vale anche durante la
  // ricerca: cercando «a» su 500 righe i risultati non sono pochi.
  const [maxVisible, setMaxVisible] = useState(80)
  useEffect(() => { setMaxVisible(80) }, [search])
  const paginata = filtrate.length > maxVisible
  const visibili = paginata ? filtrate.slice(0, maxVisible) : filtrate

  const startEdit = (row) => {
    setEditKey(row.key)
    // Si precompila solo il prezzo TUO: la stima di mercato non è un tuo
    // dato, e ritrovarsela già scritta la trasformerebbe nel tuo prezzo al
    // primo Salva.
    setEditVal(row.statoPrezzo === 'tuo' && row.prezzoKg > 0 ? row.prezzoKg.toFixed(2) : '')
    setEditForn(row.fornitore || '')
    setErrEdit(null)
  }
  const cancelEdit = () => { setEditKey(null); setEditVal(''); setEditForn(''); setErrEdit(null) }

  const tentaSalva = (row) => {
    // Prima il `return` muto: scrivendo «12,5o» per errore, il pulsante Salva
    // non faceva niente e non diceva niente. Non si capiva se il salvataggio
    // era andato, se il prezzo era stato rifiutato, o se il pulsante era rotto.
    // E poi era peggio: con `parseFloat` «12,5o» diventava 12,50 e si salvava
    // in silenzio. Adesso o è un prezzo per intero, o lo dice.
    // Il fornitore si salva subito e da solo: non tocca nessun costo del
    // passato, quindi la finestra di conferma — che esiste per non cambiare
    // in silenzio il food cost già registrato — qui non serve.
    const fornPrima = (row.fornitore || '').trim()
    const fornOra = editForn.trim()
    if (fornOra !== fornPrima) onAssegnaFornitore?.(row.key, fornOra)

    const v = letturaPrezzoKg(editVal).valore
    if (v === null) {
      // Il campo del prezzo vuoto, con il solo fornitore cambiato, è un caso
      // legittimo: si è chiuso quello che si voleva fare.
      if (editVal.trim() === '' && fornOra !== fornPrima) { cancelEdit(); return }
      setErrEdit('Scrivi un prezzo in euro per chilo, per esempio 12,50'); return
    }
    setErrEdit(null)
    // Audit 2026-09-09: il confronto era esatto, ma il campo si precompila con
    // due decimali mentre in archivio i prezzi ne hanno quattro. Aprendo la
    // riga di un ingrediente a 0,8825 €/kg e premendo Salva senza toccare
    // niente, il prezzo cambiava a 0,88 da solo. Si confronta quello che si
    // VEDE: se la cifra a schermo non è cambiata, non si salva.
    const visto = Math.round((Number(row.prezzoKg) || 0) * 100) / 100
    if (row.statoPrezzo === 'tuo' && Math.abs(v - visto) < 0.005) { cancelEdit(); return }
    setConfirmKey(row.key)
    setConfirmVal(v)
    setConfirmDecorre(todayLocal())
  }

  const confermaSalva = async () => {
    // Blocco sul doppio clic. Senza, due clic rapidi scrivevano due volte lo
    // stesso cambio di prezzo: due righe nello storico per una modifica sola,
    // e uno storico dei prezzi che non torna è un P&L che non torna.
    if (inCorso.current) return
    const row = righe.find(r => r.key === confirmKey)
    if (!row) { setConfirmKey(null); return }
    // Il giorno scelto si manda COM'È, senza passare da `Date`.
    //
    // 18/09/2026. Qui c'era
    // `new Date(confirmDecorre + 'T00:00:00').toISOString()`: mezzanotte
    // LOCALE riscritta a Greenwich. Scegliendo il 01/01/2027 usciva
    // `2026-12-31T23:00:00.000Z`, e dall'altra parte il Dashboard rilegge il
    // giorno con `soloData`, che taglia i primi dieci caratteri — quindi
    // «31/12». Il giorno arrivava indietro di uno **tutto l'anno**, per il
    // solo fatto che l'Italia sta a est di Greenwich.
    //
    // Non è un difetto di etichetta: `decorre_da` è il campo su cui
    // `getPrezzoStoricoKg` (`lib/foodcost.js`) ricostruisce il food cost delle
    // produzioni già chiuse. Un prezzo messo «dal 01/01» entrava in vigore il
    // 31/12, che è l'ultimo giorno dell'esercizio: il P&L dell'anno vecchio si
    // portava dentro i prezzi dell'anno nuovo. E la finestra, due righe sotto
    // il campo, promette esattamente il contrario.
    //
    // Fra due GIORNI il fuso non c'entra: si passa la stringa AAAA-MM-GG, che
    // è già quello che il Dashboard va a cercare.
    const decorreISO = confirmDecorre || todayLocal()
    inCorso.current = true
    setSalvandoPrezzo(true)
    try {
      await onUpdatePrezzo?.(row.nome, confirmVal, decorreISO)
      setConfirmKey(null); setConfirmVal(null)
      cancelEdit()
    } finally {
      inCorso.current = false
      setSalvandoPrezzo(false)
    }
  }

  const creaMateriaPrima = async () => {
    if (inCorso.current) return
    const esito = verificaNuovaMateriaPrima(nuovoNome, nuovoPrezzo, giaUsate)
    if (!esito.ok) { setErrNuova(esito.errore); return }
    setErrNuova(null)
    inCorso.current = true
    setCreando(true)
    try {
      const risposta = await onCreaMateriaPrima?.(esito.nome, esito.prezzoKg)
      // Chi scrive sul database ricontrolla il doppione: fra il momento in cui
      // si apre il modulo e quello in cui si salva, il ricettario può essere
      // cambiato da un'altra scheda del browser o da un'altra persona.
      if (risposta && risposta.ok === false) { setErrNuova(risposta.errore || 'Non sono riuscito a salvare.'); return }
      setNuovoNome(''); setNuovoPrezzo(''); setShowNuova(false)
    } finally {
      inCorso.current = false
      setCreando(false)
    }
  }

  const apriRinomina = (row) => {
    setRinominaKey(row.key)
    setRinominaNome(row.nome)
    setRinominaConfermato(false)
    setErrRinomina(null)
  }

  const confermaRinomina = async () => {
    if (inCorso.current) return
    const row = righe.find(r => r.key === rinominaKey)
    if (!row) { setRinominaKey(null); return }
    const esito = verificaRinominaMateriaPrima(rinominaNome, row, giaUsate)
    if (!esito.ok) { setErrRinomina(esito.errore); return }
    setErrRinomina(null)
    inCorso.current = true
    setRinominando(true)
    try {
      // Chi scrive sul database ricontrolla tutto: fra il momento in cui si
      // apre la finestra e quello in cui si salva, il ricettario può essere
      // cambiato da un'altra scheda del browser o da un'altra persona.
      const risposta = await onRinominaMateriaPrima?.(row.nome, esito.nome)
      if (risposta && risposta.ok === false) { setErrRinomina(risposta.errore || 'Non sono riuscito a salvare.'); return }
      setRinominaKey(null); setRinominaNome('')
    } finally {
      inCorso.current = false
      setRinominando(false)
    }
  }

  const apriElimina = (row) => {
    setEliminaKey(row.key)
    // La casella riparte sempre da vuota: se restasse spuntata dalla volta
    // prima, il secondo controllo sarebbe già superato prima di leggere.
    setEliminaCapito(false)
    setErrElimina(null)
  }

  const confermaElimina = async () => {
    if (inCorso.current) return
    const row = righe.find(r => r.key === eliminaKey)
    if (!row) { setEliminaKey(null); return }
    // Il secondo controllo vale solo dove c'è un rischio da capire. Chiedere
    // la stessa cerimonia per una materia prima che non usa nessuno insegna
    // soltanto a spuntare le caselle senza leggerle.
    if (row.ricette.length > 0 && !eliminaCapito) {
      setErrElimina('Spunta la casella qui sopra: dice cosa succede alle ricette che la usano.')
      return
    }
    setErrElimina(null)
    inCorso.current = true
    setEliminando(true)
    try {
      const risposta = await onEliminaMateriaPrima?.(row.nome)
      if (risposta && risposta.ok === false) { setErrElimina(risposta.errore || 'Non sono riuscito a eliminarla.'); return }
      setEliminaKey(null); setEliminaCapito(false)
    } finally {
      inCorso.current = false
      setEliminando(false)
    }
  }

  const toggleRicette = (key) => setRicetteAperte(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  // ── Lo storico, una riga per volta ──────────────────────────────────────
  // Le stesse celle servono due volte: nella tabella del computer e nelle
  // schede del telefono. Scritte una volta sola, o le due versioni divergono
  // — è successo con le voci del menu, ed è il motivo per cui `menuFoodos.js`
  // esiste.
  const righeLog = (logPrezzi || []).slice(0, 50)

  const quandoLog = (l) => new Date(l.data).toLocaleString('it-IT', { useGrouping: 'always', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  // Da quando vale questo prezzo. Un prezzo con decorrenza futura prima non si
  // vedeva da nessuna parte: si poteva impostare e dimenticare, e il food cost
  // cambiava da solo il giorno stabilito.
  const valeDaLog = (l) => {
    const da = l.decorre_da || l.data
    if (!da) return '—'
    const d = new Date(da)
    if (isNaN(d.getTime())) return '—'
    const futuro = d.getTime() > Date.now()
    return (
      <span style={{ color: futuro ? T.amberDark : C.textMid, fontWeight: futuro ? 700 : 400 }}>
        {d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        {futuro && ' (futuro)'}
      </span>
    )
  }

  // `delta` può mancare nelle righe di storico vecchie, e
  // `undefined.toLocaleString()` fa esplodere l'intera pagina: una riga
  // malformata portava via tutto, non solo la sua cella.
  const differenzaLog = (l) => (
    <span style={{ color: (l.delta || 0) > 0 ? C.alert : (l.delta || 0) < 0 ? C.green : C.textSoft, fontWeight: 700 }}>
      {(l.delta || 0) > 0 ? '+' : ''}{(l.delta || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
      {Number.isFinite(Number(l.deltaPct)) && <span style={{ fontSize: FS.sm, marginLeft: 4, opacity: 0.7 }}>({Number(l.deltaPct) > 0 ? '+' : ''}{fmtp(Number(l.deltaPct))})</span>}
    </span>
  )

  const etichettaStato = (row) => {
    if (row.statoPrezzo === 'mancante') {
      return <span style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.alertLight, color: C.alertDark, fontWeight: 700, whiteSpace: 'nowrap' }}>Prezzo da impostare</span>
    }
    if (row.statoPrezzo === 'stima') {
      // Il testo del suggerimento diceva «scrivilo qui per avere un food cost
      // tuo», come se intanto un food cost ci fosse. Dal 18/09 non c'è: il
      // listino medio non fa più il conto, e questa riga vale zero come
      // quelle senza prezzo.
      return <span title="Il food cost NON la conta: il listino medio di mercato è solo un riferimento per scrivere il tuo prezzo." style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.amberLight, color: T.amberDark, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}>stima di mercato</span>
    }
    if (row.prezzoKg === 0) {
      return <span title="Prezzo zero scritto da te: omaggio del fornitore, materia prima dell'orto, scarto recuperato. Se invece il prezzo non lo sai, cancellalo." style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.bgSubtle, color: C.textMid, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}>gratis</span>
    }
    return null
  }

  // Il prezzo a schermo. Un prezzo che non c'è NON si scrive «0,00 €»: zero
  // vuol dire «gratis» e non «non lo so», e su un dato che muove il food cost
  // di tutte le ricette la differenza è tutta.
  //
  // E dal 18/09 nemmeno la stima di mercato si scrive al posto del prezzo.
  // Prima lì compariva «8,40 €/kg» come per un prezzo qualsiasi, mentre il
  // food cost quella riga la conta zero (`STIMA_DI_MERCATO_FA_IL_CONTO`
  // è `false`): la colonna diceva che un prezzo c'era, e non c'era. Adesso
  // dice «—» come le altre senza prezzo, e il numero di mercato resta sotto,
  // in grigio, per quello che serve davvero — avere un'idea mentre scrivi il
  // tuo.
  const prezzoTesto = (row) => {
    if (row.statoPrezzo === 'mancante') return '—'
    // 19/09/2026, il titolare: «togli questa scritta mercato, non serve, molti
    // utenti hanno accordi loro con i fornitori».
    //
    // Sotto il trattino compariva «mercato 1,80 €/kg», cioè il prezzo medio di
    // un listino scritto a mano dentro il codice. Dal 18/09 quel numero non fa
    // più il conto del food cost, quindi mostrarlo non serviva a niente — e
    // faceva peggio che niente: chi ha un accordo col fornitore lo legge come
    // un'indicazione del prezzo che dovrebbe pagare, e quel prezzo con la sua
    // azienda non c'entra. Resta il trattino, che dice la cosa vera: il prezzo
    // non lo sappiamo.
    if (row.statoPrezzo === 'stima') return '—'
    return euroKg(row.prezzoKg)
  }

  // ── «1.250»: il punto sono le migliaia, ma lo diciamo ───────────────────
  //
  // Regola del titolare, 18/09/2026: «di base il punto sono le migliaia, la
  // virgola i decimali». Vale e vince — «1.250» fa milleduecentocinquanta.
  //
  // Ma c'è un caso, uno solo, in cui l'altra lettura è altrettanto probabile:
  // punto solo, niente virgola, esattamente tre cifre dopo. È la forma in cui
  // arriva un prezzo copiato da un gestionale scritto all'inglese, dove il
  // punto è il decimale. Fra 1,25 €/kg e 1.250 €/kg ci sono tre ordini di
  // grandezza, e quel numero entra nel food cost di ogni ricetta che usa
  // quella materia prima: sbagliarlo di mille volte non si vede guardando la
  // riga, si vede a fine mese nel margine — quando è tardi.
  //
  // Quindi non si indovina di nascosto e non si blocca: si legge
  // all'italiana, si dice come si è letto, e si offre l'altra lettura.
  // Il conto lo fa `letturaPrezzoKg` in `lib/formatIt.js`, che è lo stesso
  // per tutto il prodotto.
  const notaLettura = (testo) => {
    const l = letturaPrezzoKg(testo)
    if (!l.ambiguo) return null
    return (
      <div style={{ marginTop: 6, background: C.amberLight, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: '8px 10px', fontSize: FS.sm, color: T.amberDark, lineHeight: 1.45, textAlign: 'left', maxWidth: 260 }}>
        Leggo <b>{euroKg(l.comeMigliaia)}</b>: in Italia il punto sono le migliaia.
        Se intendevi <b>{euroKg(l.comeDecimale)}</b>, scrivilo con la virgola.
      </div>
    )
  }

  // Il segnaposto «12,50» che stava in questo campo era scritto come un
  // valore, non come un esempio: nel campo vuoto di una materia prima senza
  // prezzo sembrava una cifra già suggerita dal programma. Su un dato che
  // muove il food cost di tutte le ricette, un suggerimento inventato è la
  // cosa più pericolosa che si possa mostrare — e chi arriva qui sa cosa
  // deve scrivere, perché la colonna si chiama «Prezzo al chilo».
  const campoFornitore = (row) => (
    <input
      value={editForn}
      onChange={(e) => setEditForn(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') tentaSalva(row); if (e.key === 'Escape') cancelEdit() }}
      placeholder="come in fattura"
      aria-label={`Fornitore di ${row.nome}`}
      list="fornitori-noti"
      style={{ width: dito ? 150 : 130, padding: dito ? '9px 10px' : '6px 8px', minHeight: dito ? 44 : 32, borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: FS.base, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
  )

  const campoPrezzo = (row) => (
    <>
      <input type="text" inputMode="decimal" value={editVal}
        onChange={e => setEditVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') tentaSalva(row)
          if (e.key === 'Escape') cancelEdit()
        }}
        autoFocus
        aria-label={`Prezzo per chilo di ${row.nome}`}
        style={{ width: dito ? 116 : 96, padding: dito ? '9px 10px' : '6px 8px', minHeight: dito ? 44 : 32, borderRadius: 6, border: `1px solid ${C.red}`, fontSize: FS.base, fontWeight: 700, color: C.text, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}/>
      {errEdit && (
        <div style={{ fontSize: font.size.sm, color: C.alertDark, marginTop: 4, textAlign: 'right', maxWidth: 220, lineHeight: 1.4 }}>{errEdit}</div>
      )}
      {notaLettura(editVal)}
    </>
  )

  // Aperta la riga, compaiono anche le due cose rare e pericolose: cambiare
  // il nome ed eliminare. Stanno qui e non sulla riga ferma perché si fanno
  // di rado, non si disfano, e chi è arrivato ad aprire la riga sta già
  // guardando quella materia prima.
  const bottoniEdit = (row) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button onClick={() => tentaSalva(row)}
        style={{ padding: '8px 14px', minHeight: 44, borderRadius: 6, border: 'none', background: C.red, color: C.white, fontSize: font.size.sm, fontWeight: 800, cursor: 'pointer', marginRight: 4, fontFamily: 'inherit' }}>Salva</button>
      <button onClick={cancelEdit}
        style={{ padding: '8px 12px', minHeight: dito ? 44 : 32, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: font.size.sm, fontWeight: 700, color: C.textMid, cursor: 'pointer', fontFamily: 'inherit' }}>Annulla</button>
      {onRinominaMateriaPrima && bottoneIcona('pencil', `Cambia il nome di ${row.nome}`, () => apriRinomina(row), false)}
      {onEliminaMateriaPrima && bottoneIcona('trash', `Elimina ${row.nome}`, () => apriElimina(row), true)}
    </span>
  )

  // I tre comandi di riga. «Modifica» (il prezzo) resta scritto per esteso
  // perché è l'azione per cui esiste la pagina; cambiare nome ed eliminare
  // sono rari e pericolosi, e stanno come icone con il loro nome nel
  // suggerimento e nell'etichetta per chi legge con la voce.
  const bottoneIcona = (nome, etichetta, onClick, pericolo) => (
    <button onClick={onClick} title={etichetta} aria-label={etichetta}
      style={{ width: dito ? 44 : 32, height: dito ? 44 : 32, minHeight: dito ? 44 : 32, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', color: pericolo ? C.alert : C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>
      <Icon name={nome} size={15} />
    </button>
  )

  // 19/09/2026, il titolare: «in azioni ci sono due pulsanti modifica,
  // tienine solo uno e raggruppa tutto lì dentro».
  //
  // Aveva ragione: «Modifica» (che cambia il prezzo) e la matita («Cambia il
  // nome») sono due cose diverse che a colpo d'occhio sono la stessa, e a
  // fianco c'era anche il cestino. Tre comandi su ogni riga, per cento e
  // diciassette righe, quando quello che si usa ogni giorno è uno solo.
  //
  // Adesso la riga ferma ha **un** pulsante. Cambiare nome ed eliminare — che
  // si fanno di rado e non si disfano — compaiono dentro, quando la riga è
  // aperta: è lì che uno sta già guardando quella materia prima, e sono
  // esattamente le due cose per cui vale la pena fermarsi a leggere.
  const bottoneModifica = (row) => (
    <button onClick={() => startEdit(row)}
      style={{ padding: dito ? '8px 14px' : '5px 12px', minHeight: dito ? 44 : 32, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: font.size.sm, fontWeight: 700, color: C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
      <Icon name="edit" size={13} />Modifica
    </button>
  )

  // In quante ricette entra, e QUALI.
  //
  // Era un numero con il suggerimento al passaggio del mouse: mostrava le
  // prime otto e poi tre puntini, non si poteva leggere col dito (sul
  // telefono e sul tablet il suggerimento non esiste) e non si poteva
  // copiare. Il numero da solo dice quanto pesa quella materia prima; quali
  // ricette siano è la domanda che viene subito dopo, e adesso ha una
  // risposta: il numero è un pulsante e l'elenco si apre incolonnato qui
  // sotto.
  const pulsanteRicette = (row) => {
    if (row.ricette.length === 0) return <span style={{ color: C.textSoft }}>in nessuna</span>
    const aperta = ricetteAperte.has(row.key)
    return (
      <button onClick={() => toggleRicette(row.key)}
        aria-expanded={aperta}
        aria-label={`${row.ricette.length} ricette usano ${row.nome}: ${aperta ? 'chiudi' : 'apri'} l'elenco`}
        style={{ minHeight: dito ? 44 : 32, minWidth: 56, padding: dito ? '8px 10px' : '4px 10px', borderRadius: 6, border: `1px solid ${aperta ? C.red : C.borderStr}`, background: aperta ? C.redLight : 'transparent', color: aperta ? C.red : C.text, fontSize: FS.base, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontFamily: 'inherit', ...TNUM }}>
        {row.ricette.length.toLocaleString('it-IT', { useGrouping: 'always' })}
        <Icon name={aperta ? 'chevUp' : 'chevDown'} size={12} />
      </button>
    )
  }

  // L'elenco, una ricetta per riga. In colonna e non separate da virgole:
  // con ventotto ricette una riga sola è un muro, e il conto non si può fare
  // a occhio.
  // ── Le ricette che usano una materia prima ─────────────────────────────
  //
  // 18/09/2026, il titolare: «ok che si aprono sotto, ma migliora un po' il
  // design della tabella che si apre, anche in termini di colori, e i gusti
  // devono comparire in ordine alfabetico».
  //
  // Erano nomi buttati uno sotto l'altro nell'ordine in cui capitavano — cioè
  // l'ordine delle ricette nell'archivio, che per chi legge non è un ordine.
  // Con ventinove nomi (BASE BIANCA è usata in ventinove) trovare quello che
  // si cerca voleva dire leggerli tutti.
  //
  // Adesso: in ordine alfabetico, su più colonne quando ce n'è tanti (così
  // ventinove nomi stanno in uno sguardo invece che in una colonna lunga come
  // la pagina), con un filo del colore del marchio a sinistra che li lega
  // visivamente alla riga da cui escono, e un'intestazione che dice quanti
  // sono. Il fondo è quello tenue delle sezioni, non il bianco: si capisce a
  // colpo d'occhio che è un dettaglio di quella riga e non una tabella nuova.
  const elencoRicette = (row, dentroLaScheda) => {
    const nomi = [...row.ricette].sort((a, b) => String(a).localeCompare(String(b), 'it'))
    const colonne = dentroLaScheda || nomi.length <= 6 ? 1 : nomi.length <= 14 ? 2 : 3
    return (
      <div style={{
        background: C.bgSubtle, borderLeft: `3px solid ${T.brand}`, borderRadius: 6,
        padding: dito ? '10px 12px' : '8px 12px', maxHeight: 280, overflowY: 'auto', textAlign: 'left',
      }}>
        <div style={{ fontSize: font.size.sm, fontWeight: 800, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {nomi.length === 1 ? 'La ricetta che la usa' : `Le ${nomi.length.toLocaleString('it-IT', { useGrouping: 'always' })} ricette che la usano`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colonne}, minmax(0, 1fr))`, gap: dito ? '5px 16px' : '3px 20px' }}>
          {nomi.map(n => (
            <span key={n} style={{ fontSize: FS.sm, color: C.text, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
          ))}
        </div>
      </div>
    )
  }

  if (!ricettario) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px', textAlign: 'center', color: C.textSoft }}>
        Sto caricando il ricettario…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        subtitle="Gli ingredienti che compri e quanto costano al chilo. Da qui esce il food cost di tutte le ricette: una materia prima senza prezzo fa sembrare il costo più basso di quello vero." />

      {/* ═══ Le due tessere rimaste ═══════════════════════════════════════
          Erano quattro. «Prezzo tuo» era il totale meno le altre due: un
          conto che il lettore poteva fare da solo e che non aggiungeva
          niente. «Stima di mercato» era peggio che inutile — dal 18/09 il
          listino medio non fa più il conto del food cost
          (`STIMA_DI_MERCATO_FA_IL_CONTO` in `foodcost.js`), quindi una
          materia prima stimata vale zero come quelle senza prezzo, e una
          tessera ambra accanto a quella rossa diceva il contrario: che
          quelle erano sistemate.

          Restano le due che rispondono alla domanda per cui si apre questa
          pagina: quante ne ho, e di quante non so il prezzo. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(2, 1fr)', gap: isMobile ? 10 : 14, marginBottom: 20 }}>
        <KPI label="Materie prime" value={conti.tot.toLocaleString('it-IT', { useGrouping: 'always' })}
          sub="in tutto il ricettario" icon={<Icon name="layers" size={16} />} />
        <KPI label="Senza prezzo" value={conti.senzaPrezzoVero.toLocaleString('it-IT', { useGrouping: 'always' })}
          sub={conti.tot > 0 ? `${fmtp0(conti.senzaPrezzoVero / conti.tot * 100)} dell'elenco, il food cost non le conta` : 'niente da sistemare'}
          color={conti.senzaPrezzoVero > 0 ? C.alert : C.green} icon={<Icon name="alert" size={16} />} />
      </div>

      {/* Questa riga deve stare su UNA riga sola dal computer, e prima ne
          prendeva tre: erano trentasette parole per dire due cose. Le due
          cose sono quante sono e che il food cost esce più basso del vero —
          il resto («cerca il badge rosso qui sotto») lo si vede scorrendo
          l'elenco, e scritto qui rubava la riga al numero. Sul telefono e sul
          tablet può andare a capo: lì una riga sola si otterrebbe solo
          rimpicciolendo il testo. */}
      {conti.senzaPrezzoVero > 0 && (
        <div style={{ display: 'flex', alignItems: dito ? 'flex-start' : 'center', gap: 10, background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: 12, padding: isMobile ? 12 : '12px 16px', marginBottom: 18, fontSize: FS.base, color: C.alertDark, lineHeight: 1.55 }}>
          <span style={{ color: C.alert, flexShrink: 0, marginTop: dito ? 2 : 0, display: 'inline-flex' }}><Icon name="alert" size={15} /></span>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: dito ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <strong>
              {conti.senzaPrezzoVero === 1
                ? 'Una materia prima senza prezzo'
                : `${conti.senzaPrezzoVero.toLocaleString('it-IT', { useGrouping: 'always' })} materie prime senza prezzo`}
            </strong>: il food cost esce più basso del vero.
          </span>
        </div>
      )}

      {/* ═══ La barra dei comandi ═════════════════════════════════════════
          Il pulsante «Nuova materia prima» stava nell'intestazione, a fianco
          del paragrafo che spiega la pagina: a destra di tre righe di testo,
          lontano dall'elenco su cui agisce, e sul telefono finiva sotto il
          paragrafo dove nessuno lo cercava. Un comando che crea una riga
          dell'elenco sta sopra l'elenco, non sopra la spiegazione.

          Qui accanto vanno gli altri due comandi che riempiono l'elenco —
          «Importa in blocco» e «Scarica un esempio». Sono pulsanti
          secondari: bordo `C.borderStr`, sfondo trasparente, `minHeight: 44`,
          icone `upload` e `download`. Il posto è questo, subito dopo il
          pulsante qui sotto. */}
      <div data-barra="azioni-materie-prime" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={() => { setShowNuova(s => !s); setErrNuova(null) }}
          aria-expanded={showNuova}
          style={{ padding: '0 16px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: R.md, fontSize: FS.base, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(110,14,26,0.2)' }}>
          <Icon name={showNuova ? 'x' : 'plus'} size={13} />{showNuova ? 'Chiudi' : 'Nuova materia prima'}
        </button>

        {/* ── I prezzi si possono portare dentro tutti insieme ───────────
            18/09/2026, richiesta del titolare: «un pulsante import prezzi in
            cui uno può importare i prezzi in bulk delle materie prime, e un
            pulsante che scarica un esempio del doc excel con già le etichette
            colonne: nome materia prima / prezzo al kg / fornitore».
            Scriverne 117 a mano, uno per uno, non lo fa nessuno — ed è il
            motivo per cui 75 restano senza prezzo. Il modello da scaricare
            serve più dell'import: chi non sa che colonne mettere non prova
            nemmeno. */}
        <label style={pulsanteSecondario}>
          <Icon name="upload" size={13} />Importa prezzi
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) apriImport(f) }} />
        </label>
        <button type="button" onClick={scaricaModello} style={pulsanteSecondario}>
          <Icon name="download" size={13} />Scarica l&rsquo;esempio
        </button>
      </div>

      {/* ── Il resoconto dell'import: si guarda prima di scrivere ───────
          Non è una cortesia, è la differenza fra un import e un disastro. Su
          117 materie prime un file sbagliato di una colonna riscriverebbe
          centodiciassette prezzi in silenzio, e i prezzi sono la base di tutto
          il food cost. Qui si vede riga per riga cosa cambierà, cosa resterà
          com'è e cosa viene scartato — con il motivo. */}
      {imp && (
        <div role="dialog" aria-modal="true" aria-label="Cosa succede importando"
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !importando) setImp(null) }}>
          <div style={{ background: C.bgCard, borderRadius: R['2xl'], maxWidth: 620, width: '100%', maxHeight: '86vh', overflowY: 'auto', padding: isMobile ? 18 : 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, marginBottom: 4 }}>
              {imp.errore ? 'Non sono riuscito a leggere il file' : 'Cosa succede se importo'}
            </div>
            <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 16, lineHeight: 1.5 }}>
              {imp.nomeFile}{imp.foglio ? ` · foglio «${imp.foglio}»` : ''}
            </div>

            {imp.errore ? (
              <div style={{ fontSize: FS.base, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{imp.errore}</div>
            ) : (() => {
              const r = imp.resoconto
              const righe = [
                ['Materie prime nuove', r.nuove.length, C.text],
                ['Prezzi che cambiano', r.aggiornate.length, C.text],
                ['Righe che non cambiano niente', r.invariate.length, C.textSoft],
                ['Righe scartate', r.scartate.length, r.scartate.length ? C.alertDark : C.textSoft],
              ]
              return (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
                    {righe.map(([lbl, n, col]) => (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
                        <span style={{ fontSize: FS.sm, color: C.textSoft }}>{lbl}</span>
                        <span style={{ fontSize: FS.md, fontWeight: 800, color: col, ...TNUM }}>{n.toLocaleString('it-IT', { useGrouping: 'always' })}</span>
                      </div>
                    ))}
                  </div>

                  {r.scartate.length > 0 && (
                    <Elenco titolo="Queste righe le lascio fuori, e ti dico perché"
                      voci={r.scartate.slice(0, 12).map(x => `Riga ${x.riga}${x.nome ? ` · ${x.nome}` : ''}: ${x.spiegazione || x.motivo}`)}
                      resto={r.scartate.length - 12} colore={C.alertDark} />
                  )}
                  {(r.ambigue || []).length > 0 && (
                    <Elenco titolo="Questi prezzi si possono leggere in due modi"
                      voci={r.ambigue.slice(0, 8).map(x => `Riga ${x.riga} · ${x.nome}: «${x.testo}» lo prendo come ${fmtEuroKg(x.letto)}; se intendevi ${fmtEuroKg(x.alternativa)} scrivilo con la virgola`)}
                      resto={r.ambigue.length - 8} colore={T.amberDark} />
                  )}
                  {(r.somiglianze || []).length > 0 && (
                    <Elenco titolo="Questi nomi assomigliano a materie prime che hai già"
                      voci={r.somiglianze.slice(0, 8).map(x => `Riga ${x.riga}: «${x.nome}» assomiglia a «${x.simile}» — se è la stessa, correggi il file prima di importare`)}
                      resto={r.somiglianze.length - 8} colore={T.amberDark} />
                  )}
                  {r.aggiornate.filter(x => x.cambiaPrezzo).length > 0 && (
                    <Elenco titolo="Prezzi che cambiano"
                      voci={r.aggiornate.filter(x => x.cambiaPrezzo).slice(0, 10).map(x => `${x.nome}: ${x.prezzoPrecedente == null ? '—' : fmtEuroKg(x.prezzoPrecedente)} → ${fmtEuroKg(x.prezzoKg)}`)}
                      resto={r.aggiornate.filter(x => x.cambiaPrezzo).length - 10} colore={C.textMid} />
                  )}
                </>
              )
            })()}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setImp(null)} disabled={importando}
                style={{ ...pulsanteSecondario, opacity: importando ? 0.5 : 1 }}>Annulla</button>
              {!imp.errore && (
                <button onClick={confermaImport} disabled={importando}
                  style={{ padding: '0 18px', minHeight: 44, background: importando ? C.borderStr : C.red, color: C.white, border: 'none', borderRadius: R.md, fontSize: FS.base, fontWeight: 800, cursor: importando ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {importando ? 'Importo…' : 'Importa'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNuova && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R['2xl'], padding: isMobile ? 16 : '18px 20px', marginBottom: 18, boxShadow: SHADOW_PREMIUM }}>
          <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, marginBottom: 4 }}>Nuova materia prima</div>
          <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
            Il prezzo puoi anche non saperlo adesso: lascia il campo vuoto e la materia prima
            resta fra quelle da completare. Meglio un buco dichiarato di un prezzo inventato.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px auto', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="mp-nome" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Come si chiama</label>
              <input id="mp-nome" value={nuovoNome}
                onChange={e => { setNuovoNome(e.target.value); setErrNuova(null) }}
                onKeyDown={e => { if (e.key === 'Enter') creaMateriaPrima() }}
                placeholder="es. panna fresca"
                style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: FS.base, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit' }}/>
            </div>
            <div>
              <label htmlFor="mp-prezzo" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Prezzo al chilo</label>
              <input id="mp-prezzo" type="text" inputMode="decimal" value={nuovoPrezzo}
                onChange={e => { setNuovoPrezzo(e.target.value); setErrNuova(null) }}
                onKeyDown={e => { if (e.key === 'Enter') creaMateriaPrima() }}
                style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: FS.base, color: C.text, boxSizing: 'border-box', ...TNUM, fontFamily: 'inherit' }}/>
              {notaLettura(nuovoPrezzo)}
            </div>
            <button onClick={creaMateriaPrima} disabled={creando}
              style={{ padding: '0 20px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: 7, fontSize: FS.base, fontWeight: 800, cursor: creando ? 'not-allowed' : 'pointer', opacity: creando ? 0.6 : 1, fontFamily: 'inherit' }}>
              {creando ? 'Salvo…' : 'Aggiungi'}
            </button>
          </div>
          {errNuova && (
            <div role="alert" style={{ marginTop: 10, background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: 8, padding: '9px 12px', fontSize: FS.sm, color: C.alertDark, lineHeight: 1.5 }}>{errNuova}</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca una materia prima…"
            aria-label="Cerca una materia prima"
            style={{ width: '100%', padding: '11px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: FS.base, background: C.white, color: C.text, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
        </div>
        <button onClick={() => setShowLog(s => !s)}
          style={{ padding: '0 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: showLog ? C.redLight : 'transparent', fontSize: FS.sm, fontWeight: 700, color: showLog ? C.red : C.textMid, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          {/* «Log» è gergo da informatico: in italiano si chiama storico. */}
          {showLog
            ? <><Icon name="x" size={13} />Chiudi lo storico</>
            : <><Icon name="fileText" size={13} />{`Storico modifiche · ${(logPrezzi?.length || 0).toLocaleString('it-IT', { useGrouping: 'always' })}`}</>}
        </button>
      </div>

      <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
        Clicca sul prezzo per cambiarlo. Prima di salvare te lo faccio rivedere, e ogni
        modifica resta scritta con la data: serve quando il food cost di un mese non torna.
      </div>

      {showLog && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
          <div style={{ padding: '11px 14px', background: C.bgSubtle, fontSize: typo.small.fontSize, fontWeight: 700, color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
            Storico modifiche prezzi · ultime {Math.min(50, logPrezzi?.length || 0)} di {(logPrezzi?.length || 0).toLocaleString('it-IT', { useGrouping: 'always' })}
          </div>
          {righeLog.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: FS.sm, color: C.textSoft }}>Nessuna modifica registrata.</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? 10 : 0 }}>
              {/* Sei colonne su uno schermo da 390 non sono una tabella: sono
                  un cassetto. Sul telefono diventano una scheda per modifica,
                  con lo stesso contenuto e le stesse parole. */}
              <TabellaOSchede
                minWidth={560}
                righe={righeLog}
                chiave={(l) => l.id}
                vuoto="Nessuna modifica registrata."
                titolo={(l) => <span>{l.ingrediente}</span>}
                riassunto={(l) => (
                  <span style={{ ...typo.caption, color: C.textSoft, fontWeight: 400, textAlign: 'right', display: 'inline-block' }}>
                    {quandoLog(l)}
                    {/* Chi ha cambiato il prezzo: su un dato che sposta il food
                        cost di tutte le ricette, sapere chi l'ha toccato serve.
                        Era già nello storico e non si vedeva. */}
                    {l.utente && <div>{String(l.utente).split('@')[0]}</div>}
                  </span>
                )}
                colonne={[
                  { k: 'valeDa', label: 'Vale da', cella: valeDaLog },
                  { k: 'vecchio', label: 'Vecchio', cella: (l) => euroKg(l.prezzoVecchio || 0) },
                  { k: 'nuovo', label: 'Nuovo', forte: true, cella: (l) => euroKg(l.prezzoNuovo || 0) },
                  { k: 'diff', label: 'Differenza', cella: differenzaLog },
                ]}
                intestazione={<thead>
                  <tr>
                    {['Modificato il', 'Materia prima', 'Vale da', 'Vecchio', 'Nuovo', 'Differenza'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, background: C.bgSubtle }}>{h}</th>
                    ))}
                  </tr>
                </thead>}
                corpo={<tbody>
                  {righeLog.map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ textAlign: 'left', ...TNUM, padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>
                        {quandoLog(l)}
                        {l.utente && (
                          <div style={{ ...typo.caption, color: C.textSoft, fontWeight: 400 }}>{String(l.utente).split('@')[0]}</div>
                        )}
                      </td>
                      {/* `capitalize` rompe le maiuscole vere: «FARINA 00»
                          diventava «Farina 00». Il nome resta come scritto. */}
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text }}>{l.ingrediente}</td>
                      <td style={{ padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>{valeDaLog(l)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: C.textMid, ...TNUM }}>{euroKg(l.prezzoVecchio || 0)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>{euroKg(l.prezzoNuovo || 0)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', ...TNUM }}>{differenzaLog(l)}</td>
                    </tr>
                  ))}
                </tbody>}
              />
            </div>
          )}
        </div>
      )}

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R['2xl'], overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
        <TabellaOSchede
          minWidth={560}
          righe={visibili}
          chiave={(row) => row.key}
          vuoto={search.trim()
            ? `Nessuna materia prima che corrisponde a "${search}".`
            : 'Non c’è ancora nessuna materia prima: aggiungi la prima qui sopra.'}
          titolo={(row) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{row.nome}</span>
              {/* Una base non è una materia prima come le altre: ha anche una
                  ricetta sua. Compare qui perché le hai scritto un prezzo al
                  chilo a mano, e quel prezzo è quello che il programma usa —
                  vince sul calcolo dai suoi ingredienti. Senza dirlo,
                  sembrerebbe un ingrediente qualsiasi e non si capirebbe
                  perché nel Ricettario ha anche una composizione. */}
              {row.eBase && (
                <span title="È una tua base, con una ricetta sua. Compare qui perché le hai scritto un prezzo al chilo, e quel prezzo è quello che il programma addebita alle ricette che la usano."
                  style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: T.brandLight, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}>base</span>
              )}
              {etichettaStato(row)}
            </span>
          )}
          colonne={[
            { k: 'prezzo', label: 'Prezzo al chilo', forte: true,
              // Sul telefono il campo per scrivere il prezzo veniva disegnato
              // solo nella tabella del computer: si toccava «Modifica» e non
              // succedeva niente. Adesso la scheda ha lo stesso campo.
              cella: (row) => editKey === row.key ? campoPrezzo(row) : prezzoTesto(row) },
            // ── Il fornitore di ogni materia prima ────────────────────
            // 18/09/2026, il titolare: «molto importante: ogni materia prima
            // deve avere anche il nome del fornitore associato, così
            // riusciamo a collegare tutto meglio, e così nella pagina
            // fornitori poi si vedono direttamente le materie prime
            // collegate».
            // Il campo esisteva già nel dato — veniva letto — ma non si
            // poteva né vedere né scrivere da nessuna parte: era una casella
            // vuota che nessuno poteva riempire. Il nome dev'essere quello
            // che compare in fattura, altrimenti il collegamento non si fa:
            // per questo non si mette in maiuscolo e non si «aggiusta», si
            // tolgono solo gli spazi di troppo.
            { k: 'fornitore', label: 'Fornitore',
              cella: (row) => editKey === row.key ? campoFornitore(row) : (
                row.fornitore
                  ? <span style={{ color: C.textMid }}>{row.fornitore}</span>
                  : <span style={{ color: C.textSoft }}>—</span>
              ) },
            { k: 'usata', label: 'In quante ricette',
              // Sulla scheda del telefono l'elenco non può essere una riga
              // in più della tabella: si apre qui, sotto il numero, nella
              // stessa cella e incolonnato come sul computer.
              cella: (row) => (
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {pulsanteRicette(row)}
                  {ricetteAperte.has(row.key) && row.ricette.length > 0 && elencoRicette(row, true)}
                </span>
              ) },
            { k: 'az', label: '', cella: (row) => editKey === row.key ? bottoniEdit(row) : bottoneModifica(row) },
          ]}
          intestazione={<thead>
            <tr style={{ background: C.bgSubtle }}>
              <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Materia prima</SortTH>
              <SortTH k="prezzo" right active={sortKey === 'prezzo'} dir={sortDir} onToggle={toggleSort}
                tip="Le materie prime senza prezzo si raccolgono tutte a un capo dell'elenco: non valgono zero, semplicemente non si sanno.">Prezzo €/kg</SortTH>
              <SortTH k="fornitore" active={sortKey === 'fornitore'} dir={sortDir} onToggle={toggleSort}
                tip="Chi te la vende. Scrivi il nome esattamente come compare in fattura: è così che le fatture si collegano da sole alle materie prime.">Fornitore</SortTH>
              <SortTH k="usata" right active={sortKey === 'usata'} dir={sortDir} onToggle={toggleSort}
                tip="In quante ricette entra questa materia prima. Clicca il numero per vedere quali.">In quante ricette</SortTH>
              <th style={{ padding: '10px 14px', textAlign: 'right', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, width: 220 }}>Azioni</th>
            </tr>
          </thead>}
          corpo={<tbody>
            {filtrate.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', fontSize: font.size.base, color: C.textSoft }}>
                {search.trim()
                  ? `Nessuna materia prima che corrisponde a "${search}".`
                  : 'Non c’è ancora nessuna materia prima: aggiungi la prima qui sopra.'}
              </td></tr>
            )}
            {visibili.map((row, i) => {
              const editing = editKey === row.key
              const ricetteAperta = ricetteAperte.has(row.key) && row.ricette.length > 0
              return (
                <React.Fragment key={row.key}>
                <tr style={{ borderBottom: ricetteAperta ? 'none' : `1px solid ${C.border}`, background: editing ? C.redLight : i % 2 === 0 ? C.white : C.bgSubtle }}>
                  <td style={{ padding: padCella, fontWeight: 600, color: C.text }}>
                    {/* Nome e badge incolonnati: il nome in una colonna fissa,
                        il badge sempre alla stessa distanza dal bordo
                        indipendentemente da quanto è lungo il nome. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* 19/09/2026 — i nomi si leggono, non si urlano. Nel
                          database stanno in minuscolo perché è la chiave con
                          cui il food cost trova il prezzo, e quella non si
                          tocca: cambia solo come appare. Stessa regola già
                          applicata nel Ricettario e in Nuovo gusto. */}
                      <span style={{ minWidth: 180, display: 'inline-block' }}>{formatNome(row.nome)}</span>
                      {etichettaStato(row)}
                    </div>
                  </td>
                  <td style={{ padding: padCella, textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>
                    {editing ? campoPrezzo(row) : (
                      // Il prezzo cliccabile era alto 22px: su tablet è sotto
                      // la soglia di quello che si centra col dito, ed è la
                      // strada principale per cambiare un prezzo.
                      <span onClick={() => startEdit(row)} title="Clicca per modificare"
                        role="button" tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(row) } }}
                        style={{ cursor: 'pointer', padding: dito ? '10px' : '5px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: dito ? 44 : 32, minWidth: 88, color: row.statoPrezzo === 'mancante' ? C.textSoft : C.text }}>
                        {prezzoTesto(row)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: padCella, color: C.textMid }}>
                    {editing ? campoFornitore(row) : (
                      row.fornitore
                        ? <span
                            role="button" tabIndex={0}
                            onClick={() => onApriFornitore?.(row.fornitore)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApriFornitore?.(row.fornitore) } }}
                            title={`Apri ${row.fornitore} nella pagina Fornitori`}
                            style={{ cursor: 'pointer', color: T.brand, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, display: 'inline-flex', alignItems: 'center', minHeight: dito ? 44 : 28 }}>
                            {row.fornitore}
                          </span>
                        : <span style={{ color: C.textSoft }}>&mdash;</span>
                    )}
                  </td>
                  <td style={{ padding: padCella, textAlign: 'right', color: C.textMid, ...TNUM }}>{pulsanteRicette(row)}</td>
                  <td style={{ padding: padCella, textAlign: 'right' }}>
                    {editing ? bottoniEdit(row) : bottoneModifica(row)}
                  </td>
                </tr>
                {/* L'elenco delle ricette si apre SOTTO la riga, a tutta
                    larghezza: dentro la colonna del numero starebbe in una
                    striscia larga un centimetro, e i nomi delle torte
                    andrebbero a capo ognuno due volte. */}
                {ricetteAperta && (
                  <tr style={{ borderBottom: `1px solid ${C.border}`, background: editing ? C.redLight : i % 2 === 0 ? C.white : C.bgSubtle }}>
                    {/* 19/09/2026, due correzioni in una riga.
                        La prima: `colSpan` diceva 4 quando le colonne sono
                        cinque (nome, prezzo, fornitore, ricette, azioni), e il
                        riquadro grigio si fermava a metà tabella — il titolare
                        l'ha visto e l'ha chiamato «si ferma a metà».
                        La seconda: qui c'era «Le ricette che usano X» e dentro
                        il riquadro «Le 2 ricette che la usano». La stessa frase
                        due volte, una sopra l'altra. Resta quella dentro, che
                        dice anche quante sono. */}
                    <td colSpan={5} style={{ padding: '0 14px 12px 14px' }}>
                      {elencoRicette(row, false)}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              )
            })}
          </tbody>}
        />
        {paginata && (
          <div style={{ padding: '14px 18px', textAlign: 'center', borderTop: `1px solid ${C.border}`, background: C.bgSubtle }}>
            <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 8 }}>
              Mostrate <strong>{visibili.length.toLocaleString('it-IT', { useGrouping: 'always' })}</strong> di <strong>{filtrate.length.toLocaleString('it-IT', { useGrouping: 'always' })}</strong> materie prime.
            </div>
            <button onClick={() => setMaxVisible(m => m + 80)}
              style={{ padding: '0 20px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: C.white, fontSize: FS.sm, fontWeight: 700, color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>
              Mostra altre 80
            </button>
          </div>
        )}
      </div>

      {/* Dove sono finiti i semilavorati, detto prima che qualcuno li cerchi. */}
      <div style={{ marginTop: 14, fontSize: FS.sm, color: C.textSoft, lineHeight: 1.55 }}>
        I semilavorati non sono qui: il loro costo esce dalla loro ricetta, non da un prezzo
        d&rsquo;acquisto. Li trovi nel Ricettario, nella scheda Semilavorati.
        {onNavigate && (
          <button onClick={() => onNavigate('semilavorati')}
            style={{ marginLeft: 6, border: 'none', background: 'transparent', color: C.red, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: FS.sm, fontFamily: 'inherit', textDecoration: 'underline' }}>
            Apri i semilavorati
          </button>
        )}
      </div>

      {confirmKey && (() => {
        const row = righe.find(r => r.key === confirmKey)
        if (!row) return null
        // Il confronto ha senso solo contro un prezzo TUO: dire «+340%»
        // rispetto a una stima di mercato non significa niente.
        const haBase = row.statoPrezzo === 'tuo' && row.prezzoKg > 0
        const delta = confirmVal - row.prezzoKg
        const deltaPct = haBase ? (delta / row.prezzoKg * 100) : null
        // La finestra non rispondeva a Invio ed Esc (tutte le altre del
        // prodotto lo fanno) e si chiudeva toccando lo sfondo anche MENTRE il
        // salvataggio era in corso, lasciando l'operazione a metà senza dire
        // com'era finita.
        //
        // ── Il fuoco si mette UNA VOLTA SOLA, ed è tutta la differenza ────
        //
        // 18/09/2026, difetto segnalato dal titolare: «non riesco a scrivere
        // l'anno» nel campo della decorrenza. Qui c'era
        // `ref={el => { if (el) el.focus() }}`.
        //
        // Un `ref` scritto in linea cambia identità a ogni ridisegno, quindi
        // React lo stacca e lo riattacca ogni volta — non solo all'apertura —
        // e ogni riattacco rimette il fuoco sulla finestra. Il campo della
        // decorrenza è controllato: ogni cifra battuta cambia lo stato, React
        // ridisegna, e il fuoco torna indietro. Giorno e mese hanno due cifre
        // e il browser passa da solo al campo dopo, quindi non si nota;
        // **l'anno ne ha quattro**, e lì si rompe: si batte «2» e le altre tre
        // cifre non entrano più da nessuna parte.
        //
        // La guardia dice «prendi il fuoco solo se non ce l'ha già qualcuno qui
        // dentro»: al primo disegno il fuoco è sul corpo della pagina e la
        // finestra se lo prende, mentre a ogni ridisegno successivo sta su un
        // campo di questa finestra e non glielo si toglie. `MagazzinoView`
        // (riga 573) risolve lo stesso difetto marcando l'elemento con un
        // `dataset`; questa versione fa lo stesso senza sporcare il DOM e
        // regge anche se la finestra viene rimontata.
        return (
          <div role="dialog" aria-modal="true" aria-label="Conferma modifica prezzo"
            onKeyDown={e => {
              if (salvandoPrezzo) return
              if (e.key === 'Escape') { e.stopPropagation(); setConfirmKey(null) }
              if (e.key === 'Enter') { e.stopPropagation(); confermaSalva() }
            }}
            tabIndex={-1}
            ref={el => { if (el && !el.contains(document.activeElement)) el.focus() }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => { if (!salvandoPrezzo) setConfirmKey(null) }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: isMobile ? 20 : 28, maxWidth: 420, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
              <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, marginBottom: 8 }}>Conferma modifica prezzo</div>
              <div style={{ fontSize: FS.base, color: C.textMid, marginBottom: 16, lineHeight: 1.55 }}>
                Sei sicuro di voler aggiornare il prezzo di <b style={{ color: C.text }}>{row.nome}</b>?
              </div>
              <div style={{ background: C.bgSubtle, borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 600 }}>
                    {row.statoPrezzo === 'tuo' ? 'Prezzo attuale' : row.statoPrezzo === 'stima' ? 'Stima di mercato' : 'Prezzo di adesso'}
                  </span>
                  {/* Per una materia prima senza prezzo qui compariva
                      «0,00 €/kg», cioè un prezzo dichiarato. Zero e «non lo
                      so» sono due cose diverse, e su un dato che muove il food
                      cost di tutte le ricette la differenza conta. */}
                  <span style={{ fontSize: FS.md, color: row.statoPrezzo === 'mancante' ? C.textSoft : C.textMid, ...TNUM, fontWeight: 700 }}>
                    {row.statoPrezzo === 'mancante' ? 'mai impostato' : euroKg(row.prezzoKg)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 600 }}>Nuovo prezzo</span>
                  <span style={{ fontSize: FS.md, color: C.red, ...TNUM, fontWeight: 800 }}>{euroKg(confirmVal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 600 }}>{haBase ? 'Variazione' : 'Primo prezzo tuo'}</span>
                  {/* `delta > 0 ? rosso : verde` colorava di VERDE anche una
                      variazione di zero, come se non cambiare prezzo fosse un
                      risparmio. E il rosso era quello del marchio, che in
                      questa pagina vuol dire «azione», non «allarme»: per un
                      prezzo che sale serve il rosso di allarme. */}
                  <span style={{ fontSize: FS.base, color: haBase && delta > 0 ? C.alert : haBase && delta < 0 ? C.green : C.textSoft, ...TNUM, fontWeight: 800 }}>
                    {haBase && delta > 0 ? '+' : ''}{(haBase ? delta : confirmVal).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    {deltaPct != null && <span style={{ fontSize: FS.sm, marginLeft: 4, opacity: 0.85 }}>({deltaPct > 0 ? '+' : ''}{fmtp(deltaPct)})</span>}
                  </span>
                </div>
              </div>
              {/* «1.250»: si è letto all'italiana, e qui si dice. La regola del
                  titolare vale — il punto sono le migliaia — ma l'altra
                  lettura è a un clic, perché fra 1,25 e 1.250 €/kg ci sono
                  tre ordini di grandezza e il numero entra nel food cost di
                  tutte le ricette che usano questa materia prima. Chiederlo
                  qui costa un secondo; accorgersene a fine mese guardando il
                  margine costa un mese. */}
              {(() => {
                const l = letturaPrezzoKg(editVal)
                if (!l.ambiguo || confirmVal !== l.comeMigliaia) return null
                return (
                  <div style={{ background: C.amberLight, border: `1px solid ${C.amber}55`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: FS.sm, color: T.amberDark, lineHeight: 1.5 }}>
                    Hai scritto <b>{editVal.trim()}</b> e l&rsquo;ho letto <b>{euroKg(l.comeMigliaia)}</b>: in
                    Italia il punto sono le migliaia, la virgola i decimali.
                    <button onClick={() => setConfirmVal(l.comeDecimale)}
                      style={{ display: 'block', marginTop: 8, padding: '0 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${T.amberDark}`, background: C.white, fontSize: FS.sm, fontWeight: 700, color: T.amberDark, cursor: 'pointer', fontFamily: 'inherit' }}>
                      No, intendevo {euroKg(l.comeDecimale)}
                    </button>
                  </div>
                )
              })()}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <label htmlFor="mp-decorre" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Decorrenza nuovo prezzo
                </label>
                <input id="mp-decorre" type="date" value={confirmDecorre} onChange={e => setConfirmDecorre(e.target.value)}
                  style={{ padding: '10px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: FS.base, color: C.text, background: C.white, outline: 'none', fontFamily: 'inherit' }}/>
                <div style={{ fontSize: FS.sm, color: C.textSoft, marginTop: 6, lineHeight: 1.5 }}>
                  Il nuovo prezzo vale dalla data scelta in poi. Le produzioni di prima tengono il
                  <b> prezzo di allora</b>: cambiando il prezzo dal <b>01/01</b>, il 31/12 usa ancora il vecchio.
                </div>
              </div>
              {deltaPct != null && Math.abs(deltaPct) > 50 && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: typo.small.fontSize, color: T.amberDark, lineHeight: 1.5 }}>
                  <b style={{ display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle' }}><Icon name="warning" size={12} />Variazione importante</b> — una modifica del {fmtp0(Math.abs(deltaPct))} cambia il food cost di tutte le ricette che usano questa materia prima, dalla decorrenza scelta in poi.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button onClick={() => setConfirmKey(null)} disabled={salvandoPrezzo}
                  style={{ padding: '0 18px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: FS.sm, fontWeight: 700, color: C.textMid, cursor: salvandoPrezzo ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>Annulla</button>
                <button onClick={confermaSalva} disabled={salvandoPrezzo}
                  style={{ padding: '0 20px', minHeight: 44, borderRadius: 8, border: 'none', background: C.red, color: C.white, fontSize: FS.sm, fontWeight: 800, cursor: salvandoPrezzo ? 'not-allowed' : 'pointer', opacity: salvandoPrezzo ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Icon name="check" size={13} />{salvandoPrezzo ? 'Salvo…' : 'Conferma e salva'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Cambiare il nome ═════════════════════════════════════════════
          Il nome è la chiave con cui il food cost trova il prezzo: non c'è
          un codice sotto. Per questo la finestra dice, prima di toccare
          niente, quante ricette contengono quel nome — sono quelle che
          resterebbero scollegate se il cambio si fermasse a metà. */}
      {rinominaKey && (() => {
        const row = righe.find(r => r.key === rinominaKey)
        if (!row) return null
        return (
          <div role="dialog" aria-modal="true" aria-label="Cambia il nome della materia prima"
            onKeyDown={e => {
              if (rinominando) return
              if (e.key === 'Escape') { e.stopPropagation(); setRinominaKey(null) }
            }}
            tabIndex={-1}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => { if (!rinominando) setRinominaKey(null) }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: isMobile ? 20 : 28, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
              <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, marginBottom: 8 }}>Cambia il nome</div>
              <div style={{ fontSize: FS.base, color: C.textMid, marginBottom: 16, lineHeight: 1.55 }}>
                Adesso si chiama <b style={{ color: C.text }}>{row.nome}</b>.
              </div>
              <label htmlFor="mp-rinomina" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Come si deve chiamare</label>
              <input id="mp-rinomina" value={rinominaNome}
                onChange={e => { setRinominaNome(e.target.value); setErrRinomina(null) }}
                onKeyDown={e => { if (e.key === 'Enter' && !rinominando) { e.stopPropagation(); confermaRinomina() } }}
                autoFocus
                style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: FS.base, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit' }}/>
              <div style={{ background: C.bgSubtle, borderRadius: 10, padding: '12px 14px', margin: '14px 0', fontSize: FS.sm, color: C.textMid, lineHeight: 1.55 }}>
                {row.ricette.length === 0
                  ? 'Non la usa nessuna ricetta: cambio il nome nel listino e nello storico dei prezzi.'
                  : row.ricette.length === 1
                    ? <>Il nome nuovo lo scrivo anche dentro <b style={{ color: C.text }}>la ricetta che la usa</b>, nello storico dei prezzi e nella resa. Tutto insieme: il nome è quello con cui il food cost trova il prezzo, e se restasse indietro un pezzo quella ricetta perderebbe il costo senza dirlo.</>
                    : <>Il nome nuovo lo scrivo anche dentro le <b style={{ color: C.text }}>{row.ricette.length.toLocaleString('it-IT', { useGrouping: 'always' })} ricette</b> che la usano, nello storico dei prezzi e nella resa. Tutto insieme: il nome è quello con cui il food cost trova il prezzo, e se restasse indietro un pezzo quelle ricette perderebbero il costo senza dirlo.</>}
              </div>

              {/* 18/09/2026, il titolare: «la pagina materie prime è comune a
                  tutte le sedi… se cambio il nome lì si cambia a cascata su
                  tutto, anche sui magazzini di tutte le sedi». Questa riga
                  esiste perché il magazzino è l'unico archivio PER SEDE che
                  viene toccato: chi rinomina deve sapere che le giacenze lo
                  seguono in tutti i negozi, non solo in quello in cui si
                  trova adesso. */}
              <div style={{ background: C.bgSubtle, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: FS.sm, color: C.textMid, lineHeight: 1.55 }}>
                E le giacenze in magazzino si spostano sotto il nome nuovo <b style={{ color: C.text }}>in tutti i negozi</b>, non solo in quello dove sei adesso. Se in qualcuno di loro il nome nuovo esiste già, le due quantità si sommano: è la stessa merce chiamata in due modi.
              </div>

              {/* Il doppio controllo. Su un'operazione che tocca il listino,
                  tutte le ricette, lo storico, la resa e i magazzini di ogni
                  negozio, un pulsante solo è troppo poco: si preme per
                  sbaglio, e quello che succede dopo non si vede. */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 14, cursor: 'pointer', fontSize: FS.sm, color: C.text, lineHeight: 1.5 }}>
                <input type="checkbox" checked={rinominaConfermato}
                  onChange={e => setRinominaConfermato(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: C.red, cursor: 'pointer' }} />
                <span>Ho capito: il nome cambia dappertutto, in tutte le ricette e in tutti i magazzini.</span>
              </label>
              {errRinomina && (
                <div role="alert" style={{ marginBottom: 14, background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: 8, padding: '9px 12px', fontSize: FS.sm, color: C.alertDark, lineHeight: 1.5 }}>{errRinomina}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button onClick={() => setRinominaKey(null)} disabled={rinominando}
                  style={{ padding: '0 18px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: FS.sm, fontWeight: 700, color: C.textMid, cursor: rinominando ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>Annulla</button>
                <button onClick={confermaRinomina} disabled={rinominando || !rinominaConfermato}
                  style={{ padding: '0 20px', minHeight: 44, borderRadius: 8, border: 'none', background: (rinominando || !rinominaConfermato) ? C.borderStr : C.red, color: C.white, fontSize: FS.sm, fontWeight: 800, cursor: (rinominando || !rinominaConfermato) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Icon name="check" size={13} />{rinominando ? 'Salvo…' : 'Cambia il nome'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Eliminare ════════════════════════════════════════════════════
          Il controllo è doppio, ma soprattutto è INFORMATO. Cancellare la
          voce non toglie l'ingrediente dalle ricette: le lascia con un
          ingrediente senza prezzo, e il loro costo scende da solo. Quindi
          prima si vede quante sono e quali, poi si spunta una casella che
          dice esattamente quello, e solo allora il pulsante rosso funziona.
          Dove non c'è rischio — nessuna ricetta la usa — la casella non
          compare: una cerimonia uguale per tutti insegna solo a cliccare
          senza leggere. */}
      {eliminaKey && (() => {
        const row = righe.find(r => r.key === eliminaKey)
        if (!row) return null
        const usata = row.ricette.length
        return (
          <div role="dialog" aria-modal="true" aria-label="Elimina la materia prima"
            onKeyDown={e => {
              if (eliminando) return
              if (e.key === 'Escape') { e.stopPropagation(); setEliminaKey(null) }
            }}
            tabIndex={-1}
            ref={el => { if (el && !el.contains(document.activeElement)) el.focus() }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => { if (!eliminando) setEliminaKey(null) }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: isMobile ? 20 : 28, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
              <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text, marginBottom: 8 }}>Elimina {row.nome}</div>
              {usata === 0 ? (
                <div style={{ fontSize: FS.base, color: C.textMid, marginBottom: 18, lineHeight: 1.55 }}>
                  Non la usa nessuna ricetta: toglierla dal listino non cambia nessun food cost.
                  Se domani ti serve, la ricrei.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: FS.base, color: C.textMid, marginBottom: 12, lineHeight: 1.55 }}>
                    La usano <b style={{ color: C.text }}>{usata.toLocaleString('it-IT', { useGrouping: 'always' })} {usata === 1 ? 'ricetta' : 'ricette'}</b>.
                    Eliminandola <b style={{ color: C.text }}>non</b> la tolgo da quelle ricette: restano con
                    un ingrediente senza prezzo, quindi il loro costo scende da solo e il margine
                    sembra migliore di quello vero.
                  </div>
                  <div style={{ background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.alertDark, marginBottom: 6 }}>
                      {usata === 1 ? 'La ricetta che la usa' : 'Le ricette che la usano'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
                      {row.ricette.map(n => (
                        <span key={n} style={{ fontSize: FS.sm, color: C.alertDark, lineHeight: 1.45 }}>{n}</span>
                      ))}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, padding: '10px 12px', border: `1px solid ${eliminaCapito ? C.red : C.borderStr}`, borderRadius: 10, marginBottom: 14, cursor: 'pointer', background: eliminaCapito ? C.redLight : 'transparent' }}>
                    <input type="checkbox" checked={eliminaCapito}
                      onChange={e => { setEliminaCapito(e.target.checked); setErrElimina(null) }}
                      style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: C.red, cursor: 'pointer' }}/>
                    <span style={{ fontSize: FS.sm, color: C.text, lineHeight: 1.5, fontWeight: 600 }}>
                      Ho capito: {usata === 1 ? 'quella ricetta resterà' : `quelle ${usata.toLocaleString('it-IT', { useGrouping: 'always' })} ricette resteranno`} con un ingrediente senza prezzo, e il food cost scenderà.
                    </span>
                  </label>
                </>
              )}
              {errElimina && (
                <div role="alert" style={{ marginBottom: 14, background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: 8, padding: '9px 12px', fontSize: FS.sm, color: C.alertDark, lineHeight: 1.5 }}>{errElimina}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button onClick={() => setEliminaKey(null)} disabled={eliminando}
                  style={{ padding: '0 18px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: FS.sm, fontWeight: 700, color: C.textMid, cursor: eliminando ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>Annulla</button>
                <button onClick={confermaElimina} disabled={eliminando || (usata > 0 && !eliminaCapito)}
                  style={{ padding: '0 20px', minHeight: 44, borderRadius: 8, border: 'none', background: C.alert, color: C.white, fontSize: FS.sm, fontWeight: 800, cursor: (eliminando || (usata > 0 && !eliminaCapito)) ? 'not-allowed' : 'pointer', opacity: (eliminando || (usata > 0 && !eliminaCapito)) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Icon name="trash" size={13} />{eliminando ? 'Elimino…' : 'Elimina'}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
