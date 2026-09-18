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

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, typo, font } from '../lib/theme'
import Icon from '../components/Icon'
import { normIng, buildIngCosti } from '../lib/foodcost'
import { todayLocal } from '../lib/dateLocal'
import {
  C, TNUM, KPI, PageHeader, useSortable, SortTH, fmtp, TabellaOSchede,
} from './_shared'
import { fmtp0, leggiPrezzoKg } from '../lib/formatIt'

// Scorciatoia alle misure del testo dai token (font.size).
const FS = font.size

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

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
    if (v && v.isStima !== true && prezzoDichiaratoKg(v) !== null) conPrezzoScrittoAMano.add(k)
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

/** Quante sono, e in che stato sta il loro prezzo. */
export function contaMateriePrime(righe) {
  const tot = righe.length
  const senzaPrezzo = righe.filter(r => r.statoPrezzo === 'mancante').length
  const stimate = righe.filter(r => r.statoPrezzo === 'stima').length
  return { tot, senzaPrezzo, stimate, conPrezzoTuo: tot - senzaPrezzo - stimate }
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
  const v = leggiPrezzoKg(grezzo)
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

// ─── La pagina ──────────────────────────────────────────────────────────────
export default function MateriePrimeView({
  ricettario, logPrezzi, onUpdatePrezzo, onCreaMateriaPrima, onNavigate,
}) {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
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
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoPrezzo, setNuovoPrezzo] = useState('')
  const [errNuova, setErrNuova] = useState(null)
  const [creando, setCreando] = useState(false)

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
    setErrEdit(null)
  }
  const cancelEdit = () => { setEditKey(null); setEditVal(''); setErrEdit(null) }

  const tentaSalva = (row) => {
    // Prima il `return` muto: scrivendo «12,5o» per errore, il pulsante Salva
    // non faceva niente e non diceva niente. Non si capiva se il salvataggio
    // era andato, se il prezzo era stato rifiutato, o se il pulsante era rotto.
    // E poi era peggio: con `parseFloat` «12,5o» diventava 12,50 e si salvava
    // in silenzio. Adesso o è un prezzo per intero, o lo dice.
    const v = leggiPrezzoKg(editVal)
    if (v === null) { setErrEdit('Scrivi un prezzo in euro per chilo, per esempio 12,50'); return }
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
    const decorreISO = confirmDecorre ? new Date(confirmDecorre + 'T00:00:00').toISOString() : new Date().toISOString()
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
      return <span title="Prezzo medio di mercato, non il tuo: scrivilo qui per avere un food cost tuo." style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.amberLight, color: T.amberDark, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}>stima di mercato</span>
    }
    if (row.prezzoKg === 0) {
      return <span title="Prezzo zero scritto da te: omaggio del fornitore, materia prima dell'orto, scarto recuperato. Se invece il prezzo non lo sai, cancellalo." style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.bgSubtle, color: C.textMid, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}>gratis</span>
    }
    return null
  }

  // Il prezzo a schermo. Un prezzo che non c'è NON si scrive «0,00 €»: zero
  // vuol dire «gratis» e non «non lo so», e su un dato che muove il food cost
  // di tutte le ricette la differenza è tutta.
  const prezzoTesto = (row) => row.statoPrezzo === 'mancante' ? '—' : euroKg(row.prezzoKg)

  const campoPrezzo = (row) => (
    <>
      <input type="text" inputMode="decimal" value={editVal}
        onChange={e => setEditVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') tentaSalva(row)
          if (e.key === 'Escape') cancelEdit()
        }}
        autoFocus
        placeholder="12,50"
        aria-label={`Prezzo per chilo di ${row.nome}`}
        style={{ width: isMobile ? 116 : 96, padding: isMobile ? '9px 10px' : '6px 8px', minHeight: isMobile ? 44 : 32, borderRadius: 6, border: `1px solid ${C.red}`, fontSize: FS.base, fontWeight: 700, color: C.text, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}/>
      {errEdit && (
        <div style={{ fontSize: font.size.sm, color: C.alertDark, marginTop: 4, textAlign: 'right', maxWidth: 220, lineHeight: 1.4 }}>{errEdit}</div>
      )}
    </>
  )

  const bottoniEdit = (row) => (
    <>
      <button onClick={() => tentaSalva(row)}
        style={{ padding: '8px 14px', minHeight: 44, borderRadius: 6, border: 'none', background: C.red, color: C.white, fontSize: font.size.sm, fontWeight: 800, cursor: 'pointer', marginRight: 4, fontFamily: 'inherit' }}>Salva</button>
      <button onClick={cancelEdit}
        style={{ padding: '8px 12px', minHeight: 44, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: font.size.sm, fontWeight: 700, color: C.textMid, cursor: 'pointer', fontFamily: 'inherit' }}>Annulla</button>
    </>
  )

  const bottoneModifica = (row) => (
    <button onClick={() => startEdit(row)}
      style={{ padding: '8px 14px', minHeight: 44, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: font.size.sm, fontWeight: 700, color: C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
      <Icon name="edit" size={13} />Modifica
    </button>
  )

  const usataIn = (row) => {
    if (row.ricette.length === 0) return <span style={{ color: C.textSoft }}>in nessuna</span>
    const elenco = row.ricette.slice(0, 8).join(', ') + (row.ricette.length > 8 ? '…' : '')
    return (
      <span title={elenco} style={{ cursor: 'help' }}>
        {row.ricette.length.toLocaleString('it-IT', { useGrouping: 'always' })}
      </span>
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
        subtitle="Gli ingredienti che compri e quanto costano al chilo. Da qui esce il food cost di tutte le ricette: una materia prima senza prezzo fa sembrare il costo più basso di quello vero."
        action={
          <button onClick={() => { setShowNuova(s => !s); setErrNuova(null) }}
            style={{ padding: '0 16px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: R.md, fontSize: FS.base, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(110,14,26,0.2)' }}>
            <Icon name={showNuova ? 'x' : 'plus'} size={13} />{showNuova ? 'Chiudi' : 'Nuova materia prima'}
          </button>
        } />

      {/* I quattro numeri che dicono se al food cost si può credere. Il primo
          da guardare è «senza prezzo»: sui dati veri erano 94 su 99. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, marginBottom: 20 }}>
        <KPI label="Materie prime" value={conti.tot.toLocaleString('it-IT', { useGrouping: 'always' })}
          sub="in tutto il ricettario" icon={<Icon name="layers" size={16} />} />
        <KPI label="Senza prezzo" value={conti.senzaPrezzo.toLocaleString('it-IT', { useGrouping: 'always' })}
          sub={conti.tot > 0 ? `${fmtp0(conti.senzaPrezzo / conti.tot * 100)} dell'elenco` : 'niente da sistemare'}
          color={conti.senzaPrezzo > 0 ? C.alert : C.green} icon={<Icon name="alert" size={16} />} />
        <KPI label="Stima di mercato" value={conti.stimate.toLocaleString('it-IT', { useGrouping: 'always' })}
          sub="prezzo medio, non il tuo" color={C.amber} icon={<Icon name="coins" size={16} />} />
        <KPI label="Prezzo tuo" value={conti.conPrezzoTuo.toLocaleString('it-IT', { useGrouping: 'always' })}
          sub="scritto da te" color={C.green} icon={<Icon name="check" size={16} />} />
      </div>

      {conti.senzaPrezzo > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: 12, padding: isMobile ? 12 : '12px 16px', marginBottom: 18, fontSize: FS.base, color: C.alertDark, lineHeight: 1.55 }}>
          <span style={{ color: C.alert, flexShrink: 0, marginTop: 2, display: 'inline-flex' }}><Icon name="alert" size={15} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>
              {conti.senzaPrezzo === 1
                ? 'Una materia prima non ha prezzo'
                : `${conti.senzaPrezzo.toLocaleString('it-IT', { useGrouping: 'always' })} materie prime non hanno prezzo`}
            </strong>{' '}
            e nel food cost contano zero: le ricette che le usano costano meno di quanto
            costano davvero. Cerca il badge rosso qui sotto e scrivi il prezzo al chilo.
          </span>
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
                placeholder="12,50"
                style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: FS.base, color: C.text, boxSizing: 'border-box', ...TNUM, fontFamily: 'inherit' }}/>
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
            { k: 'usata', label: 'In quante ricette', cella: (row) => usataIn(row) },
            { k: 'az', label: '', cella: (row) => editKey === row.key ? bottoniEdit(row) : bottoneModifica(row) },
          ]}
          intestazione={<thead>
            <tr style={{ background: C.bgSubtle }}>
              <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Materia prima</SortTH>
              <SortTH k="prezzo" right active={sortKey === 'prezzo'} dir={sortDir} onToggle={toggleSort}
                tip="Le materie prime senza prezzo si raccolgono tutte a un capo dell'elenco: non valgono zero, semplicemente non si sanno.">Prezzo €/kg</SortTH>
              <SortTH k="usata" right active={sortKey === 'usata'} dir={sortDir} onToggle={toggleSort}
                tip="In quante ricette entra questa materia prima.">In quante ricette</SortTH>
              <th style={{ padding: '10px 14px', textAlign: 'right', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, width: 150 }}>Azioni</th>
            </tr>
          </thead>}
          corpo={<tbody>
            {filtrate.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '40px 16px', textAlign: 'center', fontSize: font.size.base, color: C.textSoft }}>
                {search.trim()
                  ? `Nessuna materia prima che corrisponde a "${search}".`
                  : 'Non c’è ancora nessuna materia prima: aggiungi la prima qui sopra.'}
              </td></tr>
            )}
            {visibili.map((row, i) => {
              const editing = editKey === row.key
              return (
                <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}`, background: editing ? C.redLight : i % 2 === 0 ? C.white : C.bgSubtle }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>
                    {/* Nome e badge incolonnati: il nome in una colonna fissa,
                        il badge sempre alla stessa distanza dal bordo
                        indipendentemente da quanto è lungo il nome. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ minWidth: 180, display: 'inline-block' }}>{row.nome}</span>
                      {etichettaStato(row)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>
                    {editing ? campoPrezzo(row) : (
                      // Il prezzo cliccabile era alto 22px: su tablet è sotto
                      // la soglia di quello che si centra col dito, ed è la
                      // strada principale per cambiare un prezzo.
                      <span onClick={() => startEdit(row)} title="Clicca per modificare"
                        role="button" tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(row) } }}
                        style={{ cursor: 'pointer', padding: '10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 40, minWidth: 88, color: row.statoPrezzo === 'mancante' ? C.textSoft : C.text }}>
                        {prezzoTesto(row)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textMid, ...TNUM }}>{usataIn(row)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editing ? bottoniEdit(row) : bottoneModifica(row)}
                  </td>
                </tr>
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
        return (
          <div role="dialog" aria-modal="true" aria-label="Conferma modifica prezzo"
            onKeyDown={e => {
              if (salvandoPrezzo) return
              if (e.key === 'Escape') { e.stopPropagation(); setConfirmKey(null) }
              if (e.key === 'Enter') { e.stopPropagation(); confermaSalva() }
            }}
            tabIndex={-1}
            ref={el => { if (el) el.focus() }}
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
    </div>
  )
}
