// NuovaRicettaView - Editor ricetta (crea/modifica). Estratta da Dashboard.jsx.
//
// REBUILD: form guidato a sezioni (POV proprietario che aggiunge un prodotto) con
// pannello LIVE "Anteprima redditività" sempre visibile: food cost €/% calcolato
// in tempo reale (calcolaFC), margine €/%, semaforo verde/ambra/rosso e PREZZO
// CONSIGLIATO per un food cost target (default 30%, modificabile).
//
// CONTRATTO INVARIATO: stessa firma export, stesso onSave(nuovoRic, nuoveRegole, noRedirect)
// e stesso formato dati salvato nel ricettario (nome, sheetName:"manuale", numStampi,
// totImpasto1, foodCost1, ingredienti, note, unita, prezzo, tipo, congelabile, allergeni).
import React, { useState, useMemo, useEffect, useRef } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, motion as M, typo, font } from '../lib/theme'
import { buildIngCosti, calcolaFC, costoRigaIngrediente, getR, isRicettaValida, mergeIngredientiPerNorm, normIng, PREZZI_HORECA, resaGrammi, translateIngredienteEN, translateProdottoEN } from '../lib/foodcost'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti, analizzaAllergeni, mergeAllergeni } from '../lib/allergeni'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import AIFotoAnalisi from '../components/AIFotoAnalisi'
import Icon from '../components/Icon'
import { C, fmt, fmtp, TNUM, CampoConElenco, SortTH, useSortable, Tip, formatNome } from './_shared'
import { leggiPrezzoKg } from '../lib/formatIt'
import { isSemiOInterno } from '../lib/tipoRicetta'
import { useUnsavedGuard } from '../lib/useUnsavedGuard'

// Ombra premium coerente con la Dashboard home.
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Categorie suggerite (chip rapide). L'utente può anche digitare liberamente.
// Sono scelte in base al tipo attivita': una gelateria non vuole vedere "Torte"
// come primo suggerimento, così come una pasticceria non vuole "Frutta".
// Il fondo caldo dei riquadri «non lo so ancora»: semaforo spento, nessun
// allergene rilevato. Non è un token di theme.js — l'app ha due famiglie di
// grigi, uno freddo (bgSubtle) e uno panna — ma qui sta scritto una volta sola.
const BG_NEUTRO = '#FAF8F7';
const CATEGORIE_DEFAULT = ['Torte', 'Biscotti', 'Lievitati', 'Monoporzioni', 'Crostate', 'Salato', 'Bevande', 'Altro']
const CATEGORIE_PER_TIPO = {
  gelateria: ['Gusto', 'Crema', 'Frutta', 'Cioccolato', 'Sorbetto', 'Yogurt', 'Vegan', 'Altro'],
  pizzeria:  ['Classiche', 'Bianche', 'Speciali', 'Focacce', 'Calzoni', 'Altro'],
  pasta_fresca: ['Ripiene', 'Lunga', 'Corta', 'All\'uovo', 'Sughi', 'Altro'],
  ristorante: ['Antipasti', 'Primi', 'Secondi', 'Contorni', 'Dolci', 'Bevande', 'Altro'],
}
function categorieFor(tipoAttivita) {
  return CATEGORIE_PER_TIPO[String(tipoAttivita || '').toLowerCase().trim()] || CATEGORIE_DEFAULT
}
function placeholderNomeFor(tipoAttivita) {
  const t = String(tipoAttivita || '').toLowerCase().trim()
  if (t === 'gelateria') return 'es. CIOCCOLATO'
  if (t === 'pizzeria') return 'es. MARGHERITA'
  if (t === 'pasta_fresca') return 'es. TAGLIATELLE ALL\'UOVO'
  if (t === 'ristorante') return 'es. LASAGNE AL FORNO'
  return 'es. TORTA AL CIOCCOLATO'
}

// Titolo di card con chip icona (gerarchia premium come la Dashboard home).
// L'intestazione di una sezione del modulo.
//
// Era un riquadro colorato da 30px con dentro un'icona, più il titolo: quattro
// icone colorate in una scheda sola, che è quello che faceva sembrare questa
// pagina più affollata di «Nuovo semilavorato» pur avendo gli stessi campi.
// Il titolare, il 16/09/2026: «il layout e il design di nuovo gusto e nuovo
// semilavorato sono diversi, come mai? mi piace molto di più quello di nuovo
// semilavorato, prendi quello come esempio».
//
// Adesso è la stessa etichetta dei semilavorati: maiuscoletto piccolo, grigio,
// nessuna icona e nessun colore. Il colore in questa pagina resta per le cose
// che vogliono dire qualcosa — un allergene, un costo fuori posto — invece di
// essere la decorazione di ogni titolo.
function PanelHead({ icon, title, color = C.red, badge, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        {badge}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}

// Etichetta campo (uppercase tracking premium).
const fieldLabel = { fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
// Il campo, misurato una volta sola.
// Questa è la pagina che serve a scrivere: sette campi, e ognuno era alto 40px
// — quattro meno di un polpastrello. In una pagina di moduli il bersaglio più
// importante è il campo, non il bottone.
const inputBase = { width: '100%', padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, background: C.white, boxSizing: 'border-box' }

export default function NuovaRicettaView({ ricettario, onSave, notify, editingRicetta, onEditConsumed, LEX = lessico(), tipoAttivita }) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Le tre barre di «Informazioni prodotto». Su telefono una sotto l'altra,
  // su tablet due colonne (col nome che si prende la riga), su computer tre.
  // Le tre barre di «Informazioni prodotto»: telefono una sotto l'altra,
  // tablet due colonne (il nome si prende la riga), computer tre.
  // Scritto senza condizioni annidate di proposito: il cricchetto dei token le
  // vieta, e ha ragione — è la forma in cui il 15/09 il tablet aveva preso i
  // valori del computer su 95 campi.
  const COLONNE_INFO = { telefono: "1fr", tablet: "1fr 1fr", computer: "2fr 1.3fr 1.3fr" };
  let dispositivo = "computer";
  if (isMobile) dispositivo = "telefono";
  else if (isTablet) dispositivo = "tablet";
  const colonneInfo = COLONNE_INFO[dispositivo];
  // isGelateria: definisce le OPZIONI mostrate (dropdown Tipo, categorie, placeholder).
  // isGusto: segue form.tipo — definisce il LAYOUT effettivo. Serve distinguere:
  //   - gelateria con nuovo record → default tipo='gusto' → isGusto=true → UI gusto
  //   - gelateria che apre ricetta storica con tipo='fetta' → isGusto=false → UI stampi
  // Non allineare le due porta a UI vs dati inconsistenti (audit 2026-07-23).
  const isGelateria = String(tipoAttivita || '').toLowerCase().trim() === 'gelateria'
  const CATEGORIE = useMemo(() => categorieFor(tipoAttivita), [tipoAttivita])
  const placeholderNome = useMemo(() => placeholderNomeFor(tipoAttivita), [tipoAttivita])
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario]);
  const tuttiIng = useMemo(() => {
    const s = new Set();
    for (const ric of Object.values(ricettario?.ricette || {}))
      for (const ing of (ric.ingredienti || [])) s.add(normIng(ing.nome));
    for (const ric of Object.values(ricettario?.ricette || {}))
      if (getR(ric.nome, ric).tipo === "semilavorato") s.add(normIng(ric.nome || "").toLowerCase().trim());
    // 18/09/2026 — le materie prime del listino mancavano da questo elenco.
    //
    // Qui dentro finivano solo gli ingredienti già usati in qualche ricetta,
    // i semilavorati e il listino medio di mercato. Le materie prime che il
    // titolare ha caricato lui, con il suo prezzo, NO: finché una non era
    // stata usata almeno una volta non compariva fra i suggerimenti.
    // Era sopportabile quando si poteva scrivere qualunque cosa a mano.
    // Da oggi non si può più — l'elenco è chiuso, per non far entrare
    // «aceto balsamicp» — e senza questa riga creare una materia prima nuova
    // sarebbe stato un vicolo cieco: salvata nel listino, e introvabile nel
    // campo che avrebbe dovuto offrirla.
    for (const k of Object.keys(ricettario?.ingredienti_costi || {})) s.add(normIng(k));
    for (const k of Object.keys(PREZZI_HORECA)) s.add(k);
    return [...s].filter(k => k && k.length > 1).sort();
  }, [ricettario]);

  // L'elenco degli ingredienti come si legge: «Burro», non «burro», e
  // «Farina 00», non «farina_00».
  //
  // 18/09/2026, il titolare: i nomi degli ingredienti con la prima maiuscola e
  // il resto minuscolo «anche mentre si aggiungono». Nella tabella ci pensava
  // già `formatNome`; l'elenco che si apre sotto la barra, invece, mostrava le
  // chiavi del ricettario così come stanno — e sono tutte minuscole, perché
  // `normIng` le abbassa per poterle confrontare.
  //
  // Cambia SOLO quello che si legge. `nomeIngredienteDaSalvare` qui sotto
  // rimette il nome esatto del ricettario prima che finisca nella ricetta:
  // è quella la chiave con cui il food cost va a cercare il prezzo, e
  // riscriverla sarebbe il modo più silenzioso di far sparire un costo.
  const etichetteIngredienti = useMemo(() => {
    const perEtichetta = new Map();
    for (const v of tuttiIng) {
      const etichetta = formatNome(v);
      if (!etichetta) continue;
      const gia = perEtichetta.get(etichetta);
      if (gia === undefined) { perEtichetta.set(etichetta, v); continue; }
      // Due scritture della stessa cosa («farina 00» e «farina_00») si leggono
      // uguali: vince quella che nel listino ha un prezzo suo. Scegliere
      // l'altra trasformerebbe un costo vero in una stima di mercato senza
      // dirlo a nessuno, ed è il modo peggiore di sbagliare un food cost.
      const giaHaPrezzo = ingCosti[normIng(gia)]?.isStima === false;
      const oraHaPrezzo = ingCosti[normIng(v)]?.isStima === false;
      if (!giaHaPrezzo && oraHaPrezzo) perEtichetta.set(etichetta, v);
    }
    return perEtichetta;
  }, [tuttiIng, ingCosti]);

  const vociIngredienti = useMemo(
    () => [...etichetteIngredienti.keys()].sort((a, b) => a.localeCompare(b, 'it')),
    [etichetteIngredienti]);

  // ── Lo stesso elenco, indicizzato con la CHIAVE vera del prodotto ───────
  //
  // 18/09/2026. `formatNome` e `normIng` non sono lo stesso setaccio, e
  // fidarsi del primo per decidere se una materia prima esiste è costato caro:
  //
  //   · `formatNome` abbassa le maiuscole e cambia i trattini bassi in spazi;
  //   · `normIng` fa tutto quello, collassa gli spazi doppi **e manda il
  //     plurale sul singolare** (SING_PLUR: 70 coppie).
  //
  // Su 29 di quelle coppie i due non coincidono. Con «bacca di vaniglia» a
  // 380,00 €/kg in listino, chi scriveva «Bacche di vaniglia» — cioè come si
  // scrive in una ricetta — se la sentiva dichiarare nuova; e siccome la
  // creazione passa da `normIng`, «Il prezzo lo metto dopo» andava a scrivere
  // `null` proprio sopra i 380,00 €/kg. Il prezzo sparito, in silenzio,
  // insieme al food cost di tutte le ricette che usavano la vaniglia.
  //
  // Gli altri nomi che facevano lo stesso: Scorze di limone, Croissant
  // (→ cornetto), Bignè, Meringhe, Biscotti, Patate, Cipolle, Olive,
  // Pomodori. E il doppio spazio battuto in fretta: «farina  00».
  const chiaviIngredienti = useMemo(() => {
    const perChiave = new Map();
    for (const v of tuttiIng) {
      const chiave = normIng(v);
      if (!chiave) continue;
      const gia = perChiave.get(chiave);
      // Fra due scritture della stessa cosa vince quella già in forma
      // canonica: è quella con cui il food cost va a cercare il prezzo.
      if (gia === undefined || (gia !== chiave && v === chiave)) perChiave.set(chiave, v);
    }
    return perChiave;
  }, [tuttiIng]);

  // Dall'etichetta che si legge al nome esatto scritto nel ricettario. Se
  // quello che c'è nel campo non corrisponde a nessuna voce (un ingrediente
  // nuovo), si salva come l'ha scritto lui.
  const nomeIngredienteDaSalvare = (visibile) => {
    const scritto = String(visibile || '').trim();
    if (!scritto) return '';
    return etichetteIngredienti.get(formatNome(scritto))
      || chiaviIngredienti.get(normIng(scritto))
      || scritto;
  };

  // Gli ingredienti «senza prezzo» che arrivano da calcolaFC a volte portano
  // dietro la catena del semilavorato («pasta frolla › burro»): si formatta
  // pezzo per pezzo, se no la maiuscola tocca solo al primo nome.
  const leggiMancante = (m) => String(m || '').split(' › ').map(formatNome).join(' › ');

  // Per gelateria: categoria default "Gusto", unità di riferimento = 1 (gli ingredienti
  // sono per 1 kg di gusto finito), prezzo 0 (vive su Formati vendita), tipo "gusto" —
  // così `elencoGusti` continua a includerla (esclude solo semilavorato/interno).
  const empty = isGelateria
    ? { nome: "", categoria: "Gusto", unita: 1, prezzo: 0, tipo: "gusto", note: "", ingredienti: [], congelabile: false, allergeniManual: [], resa_g: null }
    : { nome: "", categoria: "", unita: 8, prezzo: 4, tipo: "fetta", note: "", ingredienti: [], congelabile: false, allergeniManual: [], resa_g: null };
  const [form, setForm] = useState(empty);
  // isGusto è dinamico sul form corrente (loadForEdit può caricare tipo != 'gusto').
  const isGusto = form.tipo === 'gusto'
  // Snapshot del form all'ultimo save/load: serve al dirty-guard (useUnsavedGuard)
  // per capire se ci sono modifiche non salvate rispetto allo stato "pulito".
  const initialFormRef = useRef(empty);
  const [targetPct, setTargetPct] = useState(30); // food cost obiettivo (%) - modificabile

  // Allergeni dagli ingredienti (Reg. UE 1169/2011), in TRE stati.
  //
  // Prima qui c'era solo `detectAllergeniFromIngredienti`, che restituisce un
  // elenco piatto e non sa dire "questo ingrediente non lo conosco". Sui 123
  // nomi di ingrediente veri del database, 81 non producevano nessun allergene:
  // una ricetta con del cioccolato si salvava con "nessun allergene", e quel
  // dato restava nel database.
  //
  // Questo è il momento giusto per chiederlo: chi scrive la ricetta ha in mano
  // la confezione del fornitore. Chiederlo dopo, sulla scheda allergeni,
  // significa chiederlo a chi non ha più l'etichetta davanti.
  //
  // I dubbi NON entrano fra gli allergeni salvati: dichiararli certi sarebbe
  // inventare, e la scheda allergeni tratta un elenco salvato a mano come
  // verificato dal titolare. Restano dubbi finché non li si conferma.
  const analisiAllergeni = useMemo(() => analizzaAllergeni(form.ingredienti), [form.ingredienti]);
  const autoAllergeni = analisiAllergeni.certi;
  // Solo i dubbi non ancora confermati a mano.
  const allergeniDubbi = useMemo(
    () => analisiAllergeni.daVerificare.filter(a => !(form.allergeniManual || []).includes(a)),
    [analisiAllergeni, form.allergeniManual]);
  const effectiveAllergeni = useMemo(() => mergeAllergeni(autoAllergeni, form.allergeniManual), [autoAllergeni, form.allergeniManual]);

  const [newIngNome, setNewIngNome] = useState("");
  const [newIngQty, setNewIngQty] = useState("");
  const [editMode, setEditMode] = useState(null);          // nome ricetta esistente in edit
  const [deleteConf, setDeleteConf] = useState(null);      // nome ricetta da cancellare (step 1)
  const [deletePin, setDeletePin] = useState("");          // PIN conferma cancellazione
  const [overwriteConf, setOverwriteConf] = useState(null);// nome ricetta da sovrascrivere
  const [forceOverwrite, setForceOverwrite] = useState(false); // per batch foto
  const [datiEstratti, setDatiEstratti] = useState(null);  // dati AI in attesa di conferma
  const [saving, setSaving] = useState(false);             // bottone salva in corso
  // Note di cottura e congelabilità: aperte o chiuse, e basta.
  //
  // 18/09/2026, il titolare: «ottimo che clicco e si apre ma poi devo poter
  // ricliccare e si deve chiudere». Prima `showMore` non era il padrone della
  // sezione: il render la teneva aperta con `showMore || form.note ||
  // form.congelabile`, quindi bastava una parola nelle note perché non si
  // richiudesse più — e il pulsante per riprovarci spariva del tutto.
  // Adesso comanda solo `showMore`, e chi carica una ricetta lo imposta in
  // base a quello che quella ricetta ha davvero dentro.
  const [showMore, setShowMore] = useState(false);         // note + congelabile: sezione aperta?
  // C'è qualcosa dentro? Serve a dirlo quando la sezione è chiusa: chiudere
  // nasconde, non cancella, e chi ha appena scritto una nota deve vederlo.
  const noteScritte = String(form.note || '').trim();
  const haNoteOCongelabile = Boolean(noteScritte || form.congelabile);
  const riassuntoNote = [
    noteScritte.length > 46 ? `${noteScritte.slice(0, 46)}…` : noteScritte,
    form.congelabile ? 'si può congelare' : '',
  ].filter(Boolean).join(' · ');
  // Modal "imposta prezzo" per ingrediente con prezzo mancante:
  // { nome, costoKg: string, saving } | null
  const [priceModal, setPriceModal] = useState(null);
  // Chiavistello contro il doppio invio della finestra del prezzo.
  //
  // Il pulsante è `disabled` mentre si salva, ma la finestra risponde anche a
  // Invio, e il tasto non guarda il pulsante. Lo `state` `saving` da solo non
  // basta: fra la pressione e il ridisegno passa un istante, e due Invio
  // rapidi ci stanno dentro tutti e due. Il risultato erano due salvataggi e
  // **due righe identiche** dentro la ricetta, cioè il doppio del costo di
  // quell'ingrediente. Un `ref` cambia subito, senza aspettare il ridisegno.
  const salvandoPrezzo = useRef(false);
  // Toolbar azioni secondarie in cima: quale pannello è aperto (null | 'foto' | 'modifica' | 'elimina')
  const [openAction, setOpenAction] = useState(null);
  // Allergeni manuali: elenco checkbox nascosto di default per non intasare
  // la card. Si apre col bottone "Modifica manualmente" o automaticamente se
  // l'utente ha già selezionato override manuali (es. edit di ricetta esistente).
  const [showManualAllergeni, setShowManualAllergeni] = useState(false);
  const formRef = useRef(null);
  // Audit 2026-07-01 HIGH: tracking scroll timer per cleanup unmount.
  const scrollTimerRef = useRef(null);
  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  }, []);
  function scrollToFormDeferred(delay = 100) {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      try { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) } catch {}
      scrollTimerRef.current = null;
    }, delay);
  }

  const ricetteEsistenti = Object.keys(ricettario?.ricette || {}).filter(isRicettaValida);

  const isSemiOrInterno = form.tipo === "semilavorato" || form.tipo === "interno";

  // Costo al kg di una base (tipo 'interno'). Vive nel listino ingredienti,
  // perché è da lì che calcolaFC lo legge quando la base viene usata come
  // ingrediente di un'altra ricetta.
  const [costoBaseKg, setCostoBaseKg] = useState('');

  // ── L'ordine degli ingredienti ────────────────────────────────────────
  //
  // Richiesta del titolare, 17/09/2026: vederli «in ordine di qty», con
  // l'ordine che si aggiorna mentre si scrive, e le colonne ordinabili
  // toccando le etichette.
  //
  // Prima era alfabetico (richiesta del 13/07/2026). Per quantità è più utile
  // quando si lavora sul food cost: quello che pesa sta in cima, e sotto ci
  // sono i grammi che non spostano niente.
  //
  // Il punto delicato è il «mentre si scrive». Se la riga si sposta MENTRE il
  // dito è dentro il campo, si finisce a scrivere nella riga sbagliata — su un
  // telefono è quasi garantito. Quindi l'ordine si CONGELA quando un campo
  // prende il fuoco e si scioglie quando lo perde: si riordina nel momento in
  // cui si passa alla riga dopo, che è quando serve vederlo.
  const { sortKey, sortDir, toggleSort, sort } = useSortable('qty1stampo', 'desc');
  const [ordineCongelato, setOrdineCongelato] = useState(null);

  // Le righe come si vedono a schermo. `originalIndex` resta l'indice dentro
  // `form.ingredienti`: è quello che usano modifica e rimozione, e non deve
  // seguire l'ordine visivo.
  const righeVisibili = useMemo(() => {
    const righe = (form.ingredienti || []).map((ing, originalIndex) => ({ ing, originalIndex }));
    if (ordineCongelato) {
      const posizione = new Map(ordineCongelato.map((idx, n) => [idx, n]));
      return [...righe].sort((a, b) =>
        (posizione.has(a.originalIndex) ? posizione.get(a.originalIndex) : 1e9)
        - (posizione.has(b.originalIndex) ? posizione.get(b.originalIndex) : 1e9));
    }
    return sort(righe, (r, k) => {
      if (k === 'nome') return String(r.ing.nome || '');
      if (k === 'costo') return costoRigaIngrediente(r.ing, ingCosti, ricettario).costo || 0;
      return Number(r.ing.qty1stampo) || 0;
    });
    // `sort` si ricrea a ogni render: le dipendenze vere sono la chiave e il
    // verso, che sono già qui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ingredienti, ordineCongelato, sortKey, sortDir, ingCosti, ricettario]);
  const costoBaseEsistente = useMemo(() => {
    if (form.tipo !== 'interno' || !form.nome.trim()) return null;
    const voce = ingCosti[normIng(form.nome)];
    if (!voce || voce.isStima) return null;   // una stima di mercato non è un suo prezzo
    return Number(voce.costoKg) || null;
  }, [form.tipo, form.nome, ingCosti]);

  /** Se quel nome non è fra le materie prime che esistono davvero.
   *
   *  18/09/2026, segnalazione del titolare: «magari scrive aceto balsamicp
   *  con la p finale e lo inserisce e si scasinano tutti i calcoli».
   *  Ha ragione, ed è peggio di come suona: un nome battuto storto non dà
   *  errore, non si vede a occhio, e nel food cost vale **zero**, perché nel
   *  listino quel nome non c'è. La ricetta risulta più economica del vero e
   *  nessuno lo dice. */
  const ingredienteSconosciuto = (visibile) => {
    const scritto = String(visibile || '').trim();
    if (!scritto) return false;
    if (etichetteIngredienti.has(formatNome(scritto))) return false;
    // Si chiede anche alla chiave vera: il plurale, il doppio spazio e il
    // trattino basso sono la stessa materia prima, non una nuova. Vedi il
    // commento su `chiaviIngredienti`.
    return !chiaviIngredienti.has(normIng(scritto));
  };

  /** Crea la materia prima che manca, invece di lasciare l'utente fermo.
   *  Chiuso non vuol dire sbarrato: la finestra del prezzo è già il gesto con
   *  cui una materia prima nasce, e ora si apre con il nome già scritto e con
   *  i grammi messi da parte, così dopo il salvataggio la riga si aggiunge da
   *  sola e non bisogna ribattere niente. */
  const creaMateriaPrima = (visibile) => {
    const nome = String(visibile || '').trim();
    if (!nome) return;
    setPriceModal({ nome, costoKg: '', saving: false, daAggiungere: newIngQty || null });
  };

  const addIng = () => {
    if (!newIngNome.trim() || !newIngQty) return;
    // Il campo lo dice già a schermo, ma l'avviso da solo non basta: si può
    // sempre premere Invio o il pulsante. Qui si ferma davvero, e si offre la
    // strada per uscirne.
    if (ingredienteSconosciuto(newIngNome)) { creaMateriaPrima(newIngNome); return; }
    setForm(f => ({ ...f, ingredienti: [...f.ingredienti, { nome: nomeIngredienteDaSalvare(newIngNome), qty1stampo: parseFloat(newIngQty) || 0, costoPerG: 0, costo1stampo: 0 }] }));
    setNewIngNome(""); setNewIngQty("");
  };
  const removeIng = i => setForm(f => ({ ...f, ingredienti: f.ingredienti.filter((_, j) => j !== i) }));

  // Salva il prezzo di un ingrediente al kg nel ricettario e chiude il modal.
  // Al successo il form si aggiorna via prop `ricettario` (buildIngCosti rilegge)
  // e il badge "prezzo mancante" scompare da solo per quell'ingrediente.
  /** Crea la materia prima **senza** il prezzo, quando il prezzo non si sa.
   *
   *  Serve perché il blocco appena introdotto, da solo, poteva diventare peggio
   *  del difetto: se per scrivere una ricetta bisogna conoscere il costo al
   *  chilo di ogni ingrediente, chi non ce l'ha sotto mano si ferma lì.
   *
   *  Il prezzo si salva `null`, non `0`. È la regola di tutto il prodotto e
   *  qui è più importante che altrove: `buildIngCosti` scarta i valori non
   *  finiti, quindi `null` diventa «prezzo mancante» e la ricetta lo dice a
   *  chiare lettere; uno zero scritto, invece, vorrebbe dire «questo
   *  ingrediente è gratis» e sparirebbe dentro il food cost senza un fiato. */
  const creaSenzaPrezzo = async () => {
    // Il pulsante è già `disabled` durante l'attesa, ma la finestra risponde
    // anche a Invio: senza questa riga due pressioni rapide facevano due
    // salvataggi e due righe identiche dentro la ricetta.
    if (!priceModal || salvandoPrezzo.current) return;
    salvandoPrezzo.current = true;
    setPriceModal(m => m ? { ...m, saving: true } : m);
    try {
      const key = normIng(priceModal.nome);
      // Seconda rete: un prezzo che c'è non si azzera mai. `normIng` manda il
      // plurale sul singolare, quindi la chiave che stiamo per scrivere può
      // essere quella di una materia prima che il prezzo ce l'ha già — e
      // scriverci sopra `null` vorrebbe dire cancellarglielo. La prima rete è
      // `ingredienteSconosciuto`, che oggi non lascia più arrivare fin qui.
      const gia = (ricettario?.ingredienti_costi || {})[key];
      const haGiaUnPrezzo = !!gia && (Number.isFinite(gia.costoKg) || Number.isFinite(gia.costoG));
      const nuovoRic = {
        ...(ricettario || {}),
        ingredienti_costi: haGiaUnPrezzo
          ? { ...(ricettario?.ingredienti_costi || {}) }
          : { ...(ricettario?.ingredienti_costi || {}), [key]: { costoKg: null, costoG: null } },
      };
      await onSave(nuovoRic, {}, true);
      if (priceModal.daAggiungere) {
        const grammi = parseFloat(String(priceModal.daAggiungere).replace(',', '.')) || 0;
        setForm(f => ({ ...f, ingredienti: [...f.ingredienti, { nome: key, qty1stampo: grammi, costoPerG: 0, costo1stampo: 0 }] }));
        setNewIngNome(""); setNewIngQty("");
      }
      setPriceModal(null);
      notify(`"${formatNome(priceModal.nome)}" aggiunta alle materie prime, senza prezzo: il food cost delle ricette che la usano resterà incompleto finché non lo scrivi.`);
    } catch (e) {
      setPriceModal(m => m ? { ...m, saving: false } : m);
      notify("Errore nel salvataggio, riprova", false);
    } finally {
      salvandoPrezzo.current = false;
    }
  };

  const handleSavePrezzoIng = async () => {
    // Il pulsante «Salva prezzo» è `disabled` durante l'attesa, il tasto
    // Invio no: due pressioni rapide salvavano due volte e mettevano
    // l'ingrediente DUE volte nella ricetta, cioè il doppio del costo.
    if (!priceModal || salvandoPrezzo.current) return;
    // `leggiPrezzoKg` invece di `parseFloat`: quest'ultimo legge quanto può e
    // butta via il resto, quindi «12,5o» — la o al posto dello zero, l'errore
    // di battitura più comune sul telefono — diventava 12,50 €/kg e si salvava
    // in silenzio. La pagina Materie prime lo rifiutava già; qui, che è
    // l'altra porta sullo stesso dato, no.
    const val = leggiPrezzoKg(priceModal.costoKg);
    if (val === null) {
      notify("Scrivi un prezzo in euro al chilo, per esempio 8,50. Se non lo sai ancora, usa «Il prezzo lo metto dopo».", false);
      return;
    }
    if (val === 0) {
      // Zero è un prezzo dichiarato — vuol dire «gratis» — e nel food cost
      // sparisce senza lasciare traccia. Chi non sa il prezzo ha il pulsante
      // accanto, che scrive `null` e lascia la riga dichiarata come mancante.
      notify("Zero vuol dire «gratis», non «non lo so». Se il prezzo non lo sai ancora, usa «Il prezzo lo metto dopo».", false);
      return;
    }
    salvandoPrezzo.current = true;
    setPriceModal(m => m ? { ...m, saving: true } : m);
    try {
      const key = normIng(priceModal.nome);
      const costoG = parseFloat((val / 1000).toFixed(6));
      const nuovoRic = {
        ...(ricettario || {}),
        ingredienti_costi: {
          ...(ricettario?.ingredienti_costi || {}),
          [key]: { costoKg: val, costoG }
        }
      };
      await onSave(nuovoRic, {}, true); // noRedirect: resta sul form
      // Se la finestra si era aperta perché l'ingrediente non esisteva, ora
      // esiste: la riga si aggiunge da sé, con i grammi già battuti. Senza
      // questo l'utente dovrebbe riscrivere nome e quantità da capo, e la
      // protezione sembrerebbe un ostacolo invece di un aiuto.
      if (priceModal.daAggiungere) {
        const grammi = parseFloat(String(priceModal.daAggiungere).replace(',', '.')) || 0;
        setForm(f => ({ ...f, ingredienti: [...f.ingredienti, { nome: key, qty1stampo: grammi, costoPerG: costoG, costo1stampo: grammi * costoG }] }));
        setNewIngNome(""); setNewIngQty("");
      }
      setPriceModal(null);
      notify(`Prezzo di "${priceModal.nome}" salvato: ${val.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`);
    } catch (e) {
      setPriceModal(m => m ? { ...m, saving: false } : m);
      notify("Errore salvataggio prezzo, riprova", false);
    } finally {
      salvandoPrezzo.current = false;
    }
  };

  // «Parti da una che hai già»: copia ingredienti, categoria e tipo di una
  // ricetta esistente in un modulo NUOVO, lasciando il nome da scrivere.
  //
  // In «Nuovo semilavorato» ci sono tre template rapidi (crema pasticcera,
  // pasta frolla, frutta per crostate): sono ricette standard del mestiere,
  // uguali per tutti. Per un gusto di gelato non è così — le quantità di una
  // base sono il segreto del laboratorio, e inventarle qui vorrebbe dire
  // scrivere nel ricettario del cliente una ricetta che non è sua. Quindi i
  // punti di partenza sono i SUOI: un gusto nuovo, in gelateria, nasce quasi
  // sempre da uno che c'è già.
  const partiDa = nome => {
    const r = ricettario?.ricette?.[nome];
    if (!r) return;
    const reg = getR(nome, r);
    const ings = (r.ingredienti || []).map(i => ({ ...i }));
    const copia = {
      ...empty,
      nome: "",
      categoria: r.categoria || empty.categoria,
      tipo: reg.tipoPresunto ? empty.tipo : reg.tipo,
      unita: reg.tipoPresunto ? empty.unita : reg.unita,
      prezzo: reg.prezzo,
      ingredienti: ings,
      resa_g: (typeof r.resa_g === 'number' && r.resa_g > 0) ? r.resa_g : null,
    };
    setForm(copia);
    setEditMode(null);
    // La sezione note segue il modulo che si carica, non quello di prima.
    setShowMore(false);
    initialFormRef.current = copia;
    notify(`Partito da ${nome}: ${ings.length} ${ings.length === 1 ? 'ingrediente' : 'ingredienti'}. Dai un nome e cambia quello che serve.`);
    scrollToFormDeferred(100);
  };

  // Le tre da cui si parte più volentieri: quelle con più ingredienti, che
  // sono quelle in cui c'è più lavoro da riusare. Escluse le basi e i
  // semilavorati: quelli hanno la loro pagina.
  const ricettePerPartire = useMemo(() => {
    const tutte = Object.values(ricettario?.ricette || {});
    return tutte
      .filter(r => r?.nome && Array.isArray(r.ingredienti) && r.ingredienti.length > 0)
      .filter(r => !isSemiOInterno(getR(r.nome, r).tipo))
      .sort((a, b) => b.ingredienti.length - a.ingredienti.length)
      .slice(0, 3)
      .map(r => r.nome);
  }, [ricettario]);

  const loadForEdit = nome => {
    const r = ricettario?.ricette?.[nome];
    if (!r) return;
    const reg = getR(nome, ricettario?.ricette?.[nome]);
    const ings = r.ingredienti.map(i => ({ ...i }));
    const auto = detectAllergeniFromIngredienti(ings);
    const manual = (r.allergeni || []).filter(a => !auto.includes(a));
    // Il tipo: quello che la ricetta DICHIARA, non quello che il programma
    // tira a indovinare.
    //
    // `getR` quando non sa niente risponde «fetta», perché una scheda deve
    // pur disegnare qualcosa. Ma qui quel ripiego finiva dentro il modulo, e
    // al primo salvataggio diventava il dato: aprendo un gusto per cambiare
    // la quantità di un ingrediente, si usciva con una torta da otto fette, e
    // da lì in poi ricavo, margine, cassa e produzione contavano un'altra
    // cosa. Nel ricettario vero venti ricette su trenta erano in questo stato.
    // Adesso `getR` marca il ripiego con `tipoPresunto`, e in quel caso si
    // parte dal tipo di default del mestiere (per una gelateria «gusto»)
    // invece che da «fetta».
    const tipoIniziale = reg.tipoPresunto ? empty.tipo : reg.tipo;
    const loaded = { nome: r.nome, categoria: r.categoria || "", unita: reg.tipoPresunto ? empty.unita : reg.unita, prezzo: reg.prezzo, tipo: tipoIniziale, note: r.note || "", ingredienti: ings, congelabile: r.congelabile || false, allergeniManual: manual, resa_g: (typeof r.resa_g === 'number' && r.resa_g > 0) ? r.resa_g : null };
    setForm(loaded);
    // Se la ricetta ha già delle note o il congelabile acceso, la sezione si
    // apre: prima lo deduceva il render, ed era proprio quel `||` a rendere il
    // pulsante incapace di richiudere.
    setShowMore(Boolean(loaded.note || loaded.congelabile));
    // Se è una base, porta nel campo il costo al kg che ha nel listino: senza
    // questo, riaprendo la scheda il campo appare vuoto e sembra da compilare.
    if (loaded.tipo === 'interno') {
      const voce = ingCosti[normIng(loaded.nome)];
      setCostoBaseKg(voce && !voce.isStima && Number(voce.costoKg) ? String(voce.costoKg).replace('.', ',') : '');
    } else {
      setCostoBaseKg('');
    }
    initialFormRef.current = loaded; // reset dirty
    setEditMode(nome);
    scrollToFormDeferred(100);
  };

  // Pre-carica una ricetta in modifica quando arriva dal click su card
  useEffect(() => {
    if (editingRicetta && ricettario?.ricette?.[editingRicetta]) {
      loadForEdit(editingRicetta);
      onEditConsumed && onEditConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRicetta, ricettario]);

  const handleDeleteRicetta = async nome => {
    if (deletePin !== "ELIMINA") { notify("Scrivi ELIMINA in maiuscolo per confermare", false); return; }
    const nuovoRic = { ...ricettario, ricette: Object.fromEntries(Object.entries(ricettario.ricette || {}).filter(([k]) => k !== nome)) };
    // Audit 2026-09-09 CRITICO: prima era fire-and-forget. Se il DB rifiutava,
    // la pagina diceva "eliminata" ma la ricetta c'era ancora e ricompariva al
    // ricaricamento. Ora attendiamo l'esito prima di dirlo all'utente.
    try {
      await onSave(nuovoRic, {}, true); // noRedirect=true - rimane sulla pagina
    } catch (e) {
      if (!e?.giaNotificato) notify(`Non ho potuto eliminare "${nome}": ${e?.message || 'errore di rete'}. La ricetta è ancora al suo posto.`, false);
      else notify(`"${nome}" NON è stata eliminata: è ancora al suo posto.`, false);
      return;
    }
    setDeleteConf(null); setDeletePin(""); setEditMode(null); setForm(empty); setShowMore(false);
    // La guardia delle modifiche non salvate confronta il modulo con questo
    // riferimento. Svuotare il modulo senza azzerarlo anche qui lasciava i due
    // valori diversi, e la guardia leggeva «ci sono modifiche»: dopo aver
    // cancellato una ricetta, cambiando pagina compariva il popup «hai
    // modifiche non salvate» per un modulo vuoto e una ricetta che non esiste
    // più. Segnalato dal titolare il 16/09/2026: «ho cancellato la ricetta
    // semplicemente».
    initialFormRef.current = empty;
    notify(`Ricetta "${nome}" eliminata`);
  };

  const doSaveRicetta = async () => {
    setSaving(true);
    try {
      const nuovaRic = {
        nome: form.nome.trim().toUpperCase(),
        sheetName: "manuale",
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        ingredienti: form.ingredienti,
        note: form.note,
        unita: form.unita,
        prezzo: form.prezzo,
        tipo: form.tipo,
        congelabile: form.congelabile || false,
        allergeni: effectiveAllergeni,
        // I dubbi rimasti aperti si salvano SEPARATI dagli allergeni. Non sono
        // una dichiarazione — sono la memoria di cosa resta da controllare
        // sull'etichetta del fornitore, e serve alla scheda allergeni per non
        // mostrare una casella vuota dove non sa.
        allergeniDaVerificare: allergeniDubbi.length ? allergeniDubbi : undefined,
        ingredientiNonRiconosciuti: analisiAllergeni.nonRiconosciuti.length ? analisiAllergeni.nonRiconosciuti : undefined,
        categoria: (form.categoria || "").trim() || undefined,
        // resa_g: null → fallback su somma ingredienti (comportamento legacy).
        // Se l'utente dichiara resa esplicita, la salviamo per l'uso nei calc
        // fc/kg (gusti) e come "peso stampo dichiarato" (stampi/pezzi).
        resa_g: (typeof form.resa_g === 'number' && Number.isFinite(form.resa_g) && form.resa_g > 0) ? form.resa_g : null,
      };
      // Se è una base con il costo al kg scritto nel form, quel prezzo entra nel
      // listino ingredienti: è da lì che calcolaFC lo legge quando la base
      // viene usata dentro un'altra ricetta (per le basi il motore NON apre la
      // ricetta, cerca il nome nel listino - vedi tipoRicetta.js).
      const costiAggiornati = { ...(ricettario?.ingredienti_costi || {}) };
      if (form.tipo === 'interno') {
        const grezzo = String(costoBaseKg || '').replace(',', '.').trim();
        if (grezzo !== '') {
          const perKg = parseFloat(grezzo);
          if (Number.isFinite(perKg) && perKg >= 0) {
            costiAggiornati[normIng(nuovaRic.nome)] = {
              costoKg: perKg,
              costoG: parseFloat((perKg / 1000).toFixed(6)),
            };
          }
        }
      }
      // ── Cambiare il nome a una ricetta ────────────────────────────────
      //
      // Nel ricettario la CHIAVE è il nome. Qui si spargevano le ricette di
      // prima e si aggiungeva quella nuova: se il nome era cambiato, la
      // vecchia restava al suo posto e nel ricettario ne comparivano **due,
      // con gli stessi ingredienti**. Segnalato dal titolare il 16/09/2026
      // mentre caricava il ricettario vero: «se modifico il nome di una
      // ricetta me ne trovo due duplicate».
      //
      // Cambiare nome vuol dire tre cose, non una:
      //  1. la ricetta col nome vecchio sparisce;
      //  2. chi la usava come semilavorato la cerca PER NOME: se non si
      //     aggiorna, quelle ricette perdono il costo di quell'ingrediente
      //     senza dire niente (il food cost cala e sembra un miglioramento);
      //  3. se è una base, il suo costo al chilo sta nel listino sotto il
      //     nome vecchio, e resta lì a sporcare l'elenco degli ingredienti.
      const ricetteAggiornate = { ...(ricettario?.ricette || {}) };
      const nomePrec = editMode && editMode !== nuovaRic.nome ? editMode : null;
      if (nomePrec) {
        delete ricetteAggiornate[nomePrec];
        const chiavePrec = normIng(nomePrec);
        for (const [k, r] of Object.entries(ricetteAggiornate)) {
          if (!Array.isArray(r?.ingredienti)) continue;
          if (!r.ingredienti.some(i => normIng(i?.nome) === chiavePrec)) continue;
          ricetteAggiornate[k] = {
            ...r,
            ingredienti: r.ingredienti.map(i =>
              normIng(i?.nome) === chiavePrec ? { ...i, nome: nuovaRic.nome } : i),
          };
        }
        delete costiAggiornati[chiavePrec];
      }
      ricetteAggiornate[nuovaRic.nome] = nuovaRic;

      const nuovoRic = {
        ...(ricettario || {}),
        ingredienti_costi: costiAggiornati,
        ricette: ricetteAggiornate,
      };
      // IMPORTANTE (audit 2026-07-28): azzeriamo il ref del dirty-guard PRIMA
      // dell'await. handleSalvaRicetta di Dashboard fa setView('ricettario')
      // dentro l'await → il wrapper setView legge isDirty(), confronta form
      // (ancora "sporco") vs initialFormRef (empty) → apre il popup "Hai
      // modifiche non salvate" anche se il save sta già andando a buon fine.
      // Snapshottando qui il form corrente, isDirty ritorna false subito.
      initialFormRef.current = { ...form };
      try {
        await onSave(nuovoRic, { [nuovaRic.nome]: { unita: form.unita, prezzo: form.prezzo, tipo: form.tipo } });
      } catch (e) {
        // Audit 2026-09-09 CRITICO: se il salvataggio non è andato a buon fine
        // il form NON va svuotato (l'utente ha appena scritto la ricetta a mano)
        // e non va detto "salvata". Il Dashboard ha già mostrato il perché.
        // Rimettiamo il dirty-guard così l'utente viene avvisato se cambia pagina.
        initialFormRef.current = empty;
        return;
      }
      setForm(empty); setEditMode(null); setOverwriteConf(null); setCostoBaseKg(''); setShowMore(false);
      initialFormRef.current = empty;
      notify(`Ricetta "${nuovaRic.nome}" salvata`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!form.nome.trim()) { notify("Inserisci il nome della ricetta", false); return; }
    if (form.ingredienti.length === 0) { notify("Nessun ingrediente - aggiungine almeno uno prima di salvare", false); return; }
    const nomeUp = form.nome.trim().toUpperCase();
    const esiste = ricettario?.ricette?.[nomeUp];
    const isEditing = editMode === nomeUp;
    if (esiste && !isEditing) { setOverwriteConf(nomeUp); } else { doSaveRicetta(); }
  };

  // Save invocato dal dirty-guard prima di navigare via: se il salvataggio
  // non è possibile (nome vuoto / no ingredienti / overwrite richiesto) rifiuta
  // la promise così il Dashboard mantiene l'utente sulla view.
  const handleSaveFromGuard = async () => {
    if (!form.nome.trim()) { notify("Serve il nome della ricetta prima di salvare", false); throw new Error('name empty'); }
    if (form.ingredienti.length === 0) { notify("Aggiungi almeno un ingrediente prima di salvare", false); throw new Error('no ingredients'); }
    const nomeUp = form.nome.trim().toUpperCase();
    const esiste = ricettario?.ricette?.[nomeUp];
    const isEditing = editMode === nomeUp;
    if (esiste && !isEditing) {
      notify("Esiste già una ricetta con questo nome: cambia nome o conferma la sovrascrittura prima di uscire.", false);
      throw new Error('overwrite required');
    }
    await doSaveRicetta();
  };

  // Dirty-guard: registra al Dashboard che la view ha modifiche non salvate.
  // Il Dashboard intercetta setView e mostra un modal "Salva / Esci senza salvare".
  useUnsavedGuard({
    isDirty: () => {
      try { return JSON.stringify(form) !== JSON.stringify(initialFormRef.current) }
      catch { return false }
    },
    save: handleSaveFromGuard,
    discard: () => {
      setForm(empty);
      setEditMode(null);
      setShowMore(false);
      initialFormRef.current = empty;
    },
  });

  // ─── Calcolo redditività LIVE ──────────────────────────────────────────────
  // Usa calcolaFC (motore ufficiale: gestisce semilavorati + rese) così l'anteprima
  // coincide col food cost mostrato nelle altre pagine.
  const live = useMemo(() => {
    const ricettaTmp = { ingredienti: form.ingredienti, tipo: form.tipo, unita: form.unita, prezzo: form.prezzo, resa_g: form.resa_g };
    const { tot: fc, mancanti } = calcolaFC(ricettaTmp, ingCosti, ricettario);
    // Audit 2026-09-09 ALTA: `fc` è il costo degli ingredienti COSI' COME SONO
    // SCRITTI. Per un gusto scritto sul batch da 500 g non è il costo di 1 kg:
    // questa pagina mostrava `fc` sotto l'etichetta "Food cost al kg", cioè la
    // META' del valore vero, e Ricettario/P&L (che dividono per la resa) ne
    // mostravano un altro. Entrambi i gusti presenti nel database sono scritti
    // su un peso diverso da 1 kg, quindi il numero era sbagliato sempre.
    // resaGrammi è la stessa funzione usata da Ricettario: un solo numero.
    const resaG = resaGrammi(ricettaTmp);
    const fcPerKg = resaG > 0 ? +((fc / resaG) * 1000).toFixed(2) : 0;
    const ricavo = +((form.unita || 0) * (form.prezzo || 0)).toFixed(2);
    const margine = +(ricavo - fc).toFixed(2);
    const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0;
    const fcPct = ricavo > 0 ? (fc / ricavo * 100) : 0;
    const fcUnit = form.unita > 0 ? fc / form.unita : 0;
    const target = targetPct / 100;
    // Prezzo per pezzo/fetta che porta il food cost ESATTAMENTE al target.
    const prezzoConsigliato = target > 0 ? +(fcUnit / target).toFixed(2) : 0;
    const deltaPrezzo = +(prezzoConsigliato - (form.prezzo || 0)).toFixed(2);
    // Audit 2026-09-09 ALTA: un solo posto decide se i numeri sono affidabili.
    // Prima ogni box decideva da se', e il risultato era che una ricetta con
    // TUTTI gli ingredienti senza prezzo dava fc = 0 e quindi: semaforo verde
    // "Sano", "Food cost 0,0%", "Margine 100,0%" e il messaggio verde "stai
    // guadagnando più del target". Cioe' il tool dava il verdetto migliore
    // possibile proprio quando non sapeva niente. L'unico avviso era un box
    // ambra da 10,5px in fondo.
    const conIngredienti = (form.ingredienti || []).length > 0;
    const affidabile = conIngredienti && mancanti.length === 0 && fc > 0;
    // Il prezzo per fetta non esiste finché non si sa quante fette vengono.
    const unitaMancante = conIngredienti && !(form.unita > 0);
    return { fc, fcPerKg, resaG, mancanti, ricavo, margine, margPct, fcPct, fcUnit, prezzoConsigliato, deltaPrezzo, conIngredienti, affidabile, unitaMancante };
  }, [form.ingredienti, form.unita, form.prezzo, form.tipo, form.resa_g, ingCosti, ricettario, targetPct]);

  // Semaforo basato sul food cost % rispetto al target.
  //   verde   = food cost ≤ target            (sano)
  //   ambra   = target < fc ≤ target + 10      (da tenere d'occhio)
  //   rosso   = fc > target + 10               (critico)
  const sem = useMemo(() => {
    if (live.ricavo <= 0) return { color: C.textSoft, bg: BG_NEUTRO, border: C.border, label: 'Imposta unità e prezzo', icon: 'dot' };
    // Audit del 16/09/2026, agente PAGINE: la ricetta appena aperta non ha
    // ancora nessun ingrediente, e qui usciva «Manca il costo di qualche
    // ingrediente» con sotto «0 ingredienti sono senza prezzo». Un avviso su
    // zero cose. Non è un costo che manca: è la ricetta che non è ancora
    // scritta, e va detto con le sue parole.
    if (!live.conIngredienti) return { color: C.textSoft, bg: BG_NEUTRO, border: C.border, label: 'Ancora nessun ingrediente', icon: 'dot' };
    // Nessun verdetto quando il food cost è incompleto: senza i prezzi il
    // margine risulta più alto del vero, e un verde qui è peggio di niente.
    if (!live.affidabile) return { color: C.amber, bg: C.amberLight, border: `${C.amber}55`, label: 'Manca il costo di qualche ingrediente', icon: 'warning' };
    if (live.fcPct <= targetPct) return { color: C.green, bg: C.greenLight, border: `${C.green}40`, label: 'Sano', icon: 'checkCircle' };
    if (live.fcPct <= targetPct + 10) return { color: C.amber, bg: C.amberLight, border: `${C.amber}55`, label: 'Da tenere d’occhio', icon: 'warning' };
    return { color: C.red, bg: C.redLight, border: `${C.red}40`, label: 'Critico', icon: 'alert' };
  }, [live, targetPct]);

  const handleConfermaRicetta = async (datiConfermati) => {
    const UNIT_G = { g: 1, gr: 1, grammi: 1, grammo: 1, kg: 1000, ml: 1, l: 1000, cl: 10, dl: 100,
      cucchiaio: 15, cucchiai: 15, tbsp: 15, cucchiaino: 5, cucchiaini: 5, tsp: 5,
      tazza: 240, cup: 240, tazze: 240, bicchiere: 200, noce: 15, pizzico: 2, qb: 0, pz: 1 };
    const ings = (datiConfermati.ingredienti || [])
      .filter(i => i.nome.trim())
      .map(i => ({
        nome: translateIngredienteEN(i.nome.toLowerCase().trim()),
        qty1stampo: Math.round((parseFloat(i.quantita) || 0) * (UNIT_G[(i.unita || 'g').toLowerCase()] ?? 1)),
        costoPerG: 0, costo1stampo: 0
      }));
    const nomeUp = (datiConfermati.nome || '').trim().toUpperCase();
    if (!nomeUp || !ings.length) { notify('Dati incompleti - inserisci nome e almeno un ingrediente', false); return; }
    const nuovaRic = {
      nome: nomeUp, sheetName: 'manuale', numStampi: 1, totImpasto1: 0, foodCost1: 0,
      ingredienti: ings, note: datiConfermati.procedimento || '',
      unita: datiConfermati.porzioni || 8, prezzo: 4, tipo: 'fetta',
      congelabile: false,
      // I certi restano quello che erano (analizzaAllergeni().certi coincide con
      // il vecchio rilevamento: c'è un test che lo difende). I dubbi si
      // registrano a parte, così non vanno perduti solo perché questa strada
      // rapida non li ha mostrati a nessuno.
      ...(() => {
        const a = analizzaAllergeni(ings)
        return {
          allergeni: a.certi,
          ...(a.daVerificare.length ? { allergeniDaVerificare: a.daVerificare } : {}),
          ...(a.nonRiconosciuti.length ? { ingredientiNonRiconosciuti: a.nonRiconosciuti } : {}),
        }
      })(),
    };
    const nuovoRic = {
      ingredienti_costi: ricettario?.ingredienti_costi || {},
      ...(ricettario || {}),
      ricette: { ...(ricettario?.ricette || {}), [nomeUp]: nuovaRic }
    };
    // Audit 2026-09-09 CRITICO: prima era fire-and-forget seguito da
    // setDatiEstratti(null). Se il salvataggio falliva, il risultato della foto
    // veniva buttato e bisognava rifare la scansione da zero. Ora i dati
    // estratti restano a schermo finché il salvataggio non riesce davvero.
    try {
      await onSave(nuovoRic, { [nomeUp]: { unita: nuovaRic.unita, prezzo: nuovaRic.prezzo, tipo: nuovaRic.tipo } });
    } catch (e) {
      // Il Dashboard ha già detto dove sta la copia locale: aggiungiamo solo la
      // cosa che lui non può sapere, cioè che i dati della foto sono salvi.
      if (e?.giaNotificato) notify(`"${nomeUp}" non è stata salvata. I dati della foto sono ancora qui: riprova.`, false);
      else notify(`Non ho potuto salvare "${nomeUp}": ${e?.message || 'errore di rete'}. I dati della foto sono ancora qui, riprova.`, false);
      return;
    }
    setDatiEstratti(null);
  };

  const cardStyle = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '16px' : '20px', boxShadow: SHADOW_PREMIUM };
  // Le sezioni del modulo stanno dentro UN riquadro solo, come in «Nuovo
  // semilavorato»: si separano con un filo, non con sei cornici. Prima ogni
  // sezione era un riquadro con bordo e ombra, e una scheda con gli stessi
  // campi dell'altra sembrava il doppio del lavoro.
  const sezione = { paddingTop: isMobile ? 16 : 20, marginTop: isMobile ? 16 : 20, borderTop: `1px solid ${C.borderSoft}` };

  return (
    <>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Hero + titolo: da' peso all'inserimento manuale che è il flusso primario. */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, borderRadius: R.lg, background: `linear-gradient(135deg, ${T.brand}, #4A0612)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", flexShrink: 0, boxShadow: `0 8px 24px ${T.brand}33` }}>
          <Icon name={editMode ? "edit" : "plus"} size={isMobile ? 20 : 24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {editMode ? <>Modifica <span style={{ color: T.brand }}>{editMode}</span></> : "Nuova ricetta"}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.textSoft, lineHeight: 1.45 }}>
            {editMode
              ? "In fondo alla pagina c'è il conto: ti dice subito se la ricetta regge."
              : "Scrivi nome e ingredienti: il food cost e il margine si calcolano da sé, in fondo alla pagina."}
          </p>
        </div>
      </div>

      {/* Banner "stai modificando" - resta in evidenza per non perdere il contesto. */}
      {editMode && (
        <div style={{ marginBottom: 14, fontSize: 13, color: T.amber, display: "flex", alignItems: "center", justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Icon name="warning" size={12} /> Stai modificando <b style={{ fontWeight: 700, marginLeft: 4 }}>{editMode}</b> - il salvataggio sovrascrive.
          </div>
          <button type="button" onClick={() => { setEditMode(null); setForm(empty); setShowMore(false); initialFormRef.current = empty; }}
            style={{
              padding: '7px 14px', minHeight: isMobile ? 36 : 'auto',
              background: '#FFF', color: T.brand,
              border: `1px solid ${T.brand}40`, borderRadius: 7,
              fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            <Icon name="plus" size={12} /> Ricetta nuova
          </button>
        </div>
      )}

      {/* Command bar unica: la vecchia toolbar-3-chip espandeva pannelli in verticale
          creando spazio vuoto (audit UX 07/2026). Ora: search inline per ricette
          esistenti + icon-buttons compatti (foto/elimina) + toggle sovrascrivi.
          I pannelli attivi scorrono inline sotto in max 220px. */}
      <CommandBar
        isMobile={isMobile}
        ricetteEsistenti={ricetteEsistenti}
        activeNome={editMode}
        onPickExisting={(nome) => { loadForEdit(nome); setOpenAction(null) }}
        activeAction={openAction}
        onToggleAction={(a) => setOpenAction(prev => prev === a ? null : a)}
        forceOverwrite={forceOverwrite}
        setForceOverwrite={setForceOverwrite}
        LEX={LEX}
      />

      {/* Pannello contestuale: elimina — appare sotto la command bar */}
      {openAction === 'elimina' && ricetteEsistenti.length > 0 && (
        <div style={{ marginBottom: 16, padding: isMobile ? '12px 14px' : '14px 18px', background: '#FFF', border: '1px solid #991B1B22', borderRadius: 12, boxShadow: SHADOW_PREMIUM }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>Elimina una ricetta esistente</div>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10, lineHeight: 1.5 }}>
            Cancellazione definitiva. Conferma scrivendo <b>ELIMINA</b>.
          </div>
          <RicettaPickerDelete
            ricette={ricetteEsistenti}
            deleteConf={deleteConf}
            setDeleteConf={setDeleteConf}
            deletePin={deletePin}
            setDeletePin={setDeletePin}
            onConfirm={async (nome) => { await handleDeleteRicetta(nome); setOpenAction(null); }}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Pannello contestuale: "Parti da una foto" — compatto, il toggle sovrascrivi
          è già nella command bar sopra (rimosso banner arancione redundant). */}
      {openAction === 'foto' && (
        <div style={{ marginBottom: 16, padding: isMobile ? '12px 14px' : '14px 18px', background: '#FFF', border: `1px solid ${T.brand}22`, borderRadius: 12, boxShadow: SHADOW_PREMIUM }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.brand, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Estrai una ricetta da una foto</div>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10, lineHeight: 1.5 }}>
            Carica una foto della ricetta: leggo nome, ingredienti e quantità, poi confermi.
          </div>
      <FotoOCR mode="ricetta" notify={notify} ricettario={ricettario}
        onResult={res => {
          const ingsRaw = (res.ingredienti || []).map(i => ({
            nome: translateIngredienteEN(i.nome || ''),
            quantita: parseFloat(i.quantita) || parseFloat(i.qty) || 0,
            unita: i.unita || 'g'
          }));
          // Accorpa doppi singolare/plurale (tuorlo+tuorli → un solo tuorlo con quantita' sommata).
          const ingredienti = mergeIngredientiPerNorm(ingsRaw, { qtyField: 'quantita' });
          setDatiEstratti({
            nome: translateProdottoEN(res.nome || ''),
            categoria: 'Altro',
            porzioni: res.porzioni || res.unita || 8,
            ingredienti,
            procedimento: res.note || ''
          });
          setOpenAction(null); // chiudi pannello foto: sotto compare AIFotoAnalisi
          scrollToFormDeferred(150);
        }}
        onBatchSave={async (res, idx, ricAcc, setRicAcc) => {
          const UNIT_G = { g: 1, gr: 1, grammi: 1, grammo: 1, kg: 1000, chilo: 1000, chilogrammo: 1000, ml: 1, millilitri: 1, l: 1000, litro: 1000, litri: 1000, cl: 10, centilitri: 10, dl: 100, decilitri: 100, cucchiaio: 15, cucchiai: 15, tbsp: 15, cucchiaino: 5, cucchiaini: 5, tsp: 5, tazza: 240, cup: 240, tazze: 240, bicchiere: 200, bicchieri: 200, noce: 15, pizzico: 2, pizzichi: 2, qb: 0 };
          const SKIP_ING_OCR = ["ingrediente", "ingredient", "ingredienti", "nome ingrediente in minuscolo", "n/d", "nan", "undefined", ""];
          const toGrams = (i) => { if (i.qty != null) return parseFloat(i.qty) || 0; const q = parseFloat(i.quantita) || 0; const u = (i.unita || "g").toLowerCase().trim(); return Math.round(q * (UNIT_G[u] ?? 1)); };
          const ingsRaw = (res.ingredienti || [])
            .map(i => ({ nome: translateIngredienteEN(i.nome || ""), qty1stampo: toGrams(i), costoPerG: 0, costo1stampo: 0 }))
            .filter(i => !SKIP_ING_OCR.includes(i.nome.toLowerCase().trim()) && i.qty1stampo >= 0);
          // Accorpa doppi singolare/plurale (es. tuorlo+tuorli → tuorlo con qty sommata).
          const ings = mergeIngredientiPerNorm(ingsRaw, { qtyField: 'qty1stampo' });
          const nomeIT = (translateProdottoEN(res.nome || "") || "").trim().toUpperCase();
          if (!nomeIT || ings.length === 0 || !isRicettaValida(nomeIT.toLowerCase())) return false;
          if ((ricAcc || ricettario)?.ricette?.[nomeIT] && !forceOverwrite) {
            // Il messaggio mandava a cercare un comando che non esiste:
            // il pulsante in cima si chiama «Sovrascrivi da foto», non
            // «Sovrascrivi esistenti». E «saltata» non dice cosa è successo
            // alla ricetta che c'era già (niente: è rimasta al suo posto).
            notify(`"${nomeIT}" ce l'hai già: l'ho lasciata com'è. Per rifarla con quella della foto accendi «Sovrascrivi da foto» in cima e riprova.`, false);
            return false;
          }
          const nuovaRic = {
            nome: nomeIT, sheetName: "manuale", numStampi: 1, totImpasto1: 0, foodCost1: 0,
            ingredienti: ings, note: res.note || "",
            unita: res.porzioni || res.unita || 8, prezzo: res.prezzo || 4, tipo: res.tipo || "fetta",
            congelabile: false,
            ...(() => {
              const a = analizzaAllergeni(ings)
              return {
                allergeni: a.certi,
                ...(a.daVerificare.length ? { allergeniDaVerificare: a.daVerificare } : {}),
                ...(a.nonRiconosciuti.length ? { ingredientiNonRiconosciuti: a.nonRiconosciuti } : {}),
              }
            })(),
          };
          const base = ricAcc || ricettario || {};
          const nuovoRic = {
            ingredienti_costi: base.ingredienti_costi || {},
            ...base,
            ricette: { ...(base.ricette || {}), [nomeIT]: nuovaRic }
          };
          const nuoveRegole = { [nomeIT]: { unita: nuovaRic.unita, prezzo: nuovaRic.prezzo, tipo: nuovaRic.tipo } };
          await onSave(nuovoRic, nuoveRegole, true);
          setRicAcc(nuovoRic);
          return true;
        }}
      />
        </div>
      )}

      {datiEstratti && (
        <AIFotoAnalisi
          dati={datiEstratti}
          onConferma={handleConfermaRicetta}
          onRianalizza={() => setDatiEstratti(null)}
          onAnnulla={() => setDatiEstratti(null)}
        />
      )}

      {/* Una colonna sola, come in «Nuovo semilavorato».
          Prima il modulo stava a sinistra e il conto del costo in un pannello
          appiccicato a destra da 340px: due colonne che si leggono in tempi
          diversi (si compila a sinistra, il numero cambia a destra) e che sul
          telefono si impilavano comunque. Adesso si scende: nome, ingredienti,
          allergeni, e in fondo quanto costa — che è l'ordine in cui si fa il
          lavoro. */}
      <div ref={formRef} style={{ display: "flex", flexDirection: "column", gap: isTablet ? 18 : 20 }}>
        {/* Il modulo: un riquadro solo, con le sezioni separate da un filo. */}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>

          {/* Punti di partenza rapidi, come i «Template rapidi» dei
              semilavorati — solo che qui non sono ricette inventate da noi:
              sono le sue. Compaiono solo con il modulo vuoto, e spariscono
              appena si comincia a scrivere. */}
          {/* 17/09/2026 — tolto «Parti da una che hai già» su richiesta del
              titolare. Erano scorciatoie buone in teoria, ma stavano sopra il
              campo del nome: la prima cosa che si vede aprendo «Nuovo gusto»
              non deve essere un elenco di gusti vecchi. Chi vuole copiarne una
              la apre e la duplica dal Ricettario, che è il posto dove sta
              già guardando. */}

          {/* 1. Informazioni prodotto */}
          <div>
            <PanelHead icon={<Icon name="clipboard" size={18} />} title={`Informazioni ${LEX.prodotto}`} color={C.text} />
            {/* 17/09/2026, richiesta del titolare: «le sezioni nome gusto,
                categoria e tipo le barre sono lunghe ma senza motivo, puoi
                riorganizzare e metterle di fianco per ottimizzare lo spazio».
                Erano tre righe a tutta larghezza per tre campi corti: il nome
                di un gusto sono due parole, la categoria una, il tipo una
                scelta da un elenco. Su una riga sola si vedono tutti e tre
                insieme, e il resto della pagina sale di tre righe.
                Sul telefono restano incolonnati: affiancarli lì vorrebbe
                dire tre campi da 100px. */}
            <div style={{ display: "grid", gridTemplateColumns: colonneInfo, gap: 14 }}>
              {/* Su tablet le colonne sono due e il nome si prende la riga
                  intera: con tre colonne a 768px ogni campo starebbe in 250px,
                  e il nome di un gusto non ci sta. */}
              <div style={isTablet ? { gridColumn: "1 / -1" } : undefined}>
                <div style={fieldLabel}>Nome {LEX.ricetta}</div>
                <input value={form.nome} aria-label={`Nome ${LEX.ricetta}`} onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
                  placeholder={placeholderNome}
                  style={{ ...inputBase, fontWeight: 700 }} />
              </div>

              {/* Categoria: un campo solo, con l'elenco che si apre toccandolo.
                  Prima erano tre comandi per la stessa cosa — il campo, il
                  suo `<datalist>` e una fila di pulsantini sotto — e il
                  `<datalist>` mostrava solo le voci che contengono quello che
                  c'è già scritto: nella scheda di un gusto la categoria parte
                  compilata con «Gusto», quindi si vedeva quella sola e
                  sembrava che le altre non esistessero. */}
              <div>
                <div style={fieldLabel}>Categoria</div>
                <CampoConElenco
                  id="categoria-ricetta"
                  valore={form.categoria}
                  onCambia={(v) => setForm(f => ({ ...f, categoria: v }))}
                  voci={CATEGORIE}
                  ariaLabel="Categoria"
                  placeholder={`es. ${CATEGORIE[0]}`}
                  stile={inputBase}
                />
              </div>

              {/* Tipo unità — set opzioni deriva da tipoAttivita (isGelateria),
                  layout dei campi sotto deriva da form.tipo (isGusto). */}
              <div>
                <div style={fieldLabel}>Tipo</div>
                <select value={form.tipo} aria-label="Tipo unità"
                  onChange={e => {
                    const v = e.target.value
                    setForm(f => {
                      // Reset unita/prezzo a valori sensati quando si cambia tipo:
                      //   gusto      → unita=1 (per 1 kg), prezzo=0 (su Formati vendita)
                      //   semi/int   → unita=0, prezzo=0
                      //   fetta/pezzo → mantiene se erano positivi, altrimenti default
                      const u = v === 'gusto' ? 1
                              : (v === 'semilavorato' || v === 'interno') ? 0
                              : (f.unita > 0 ? f.unita : 8)
                      const p = v === 'gusto' ? 0
                              : (v === 'semilavorato' || v === 'interno') ? 0
                              : (f.prezzo > 0 ? f.prezzo : 4)
                      return { ...f, tipo: v, unita: u, prezzo: p }
                    })
                  }}
                  style={{ ...inputBase, fontSize: isMobile ? 16 : 14 }}>
                  {/* Audit 2026-09-09: "Uso interno" e "Base / semilavorato" erano due
                      etichette che non dicevano la differenza, e la differenza è tutta
                      nel food cost:
                        interno      → il costo lo scrivi TU nel listino, la ricetta non
                                       viene aperta. È il modello delle basi da gelateria:
                                       gli ingredienti si elencano (servono per gli
                                       allergeni) ma le quantita' restano tue, e il costo
                                       al kg lo calcoli a mano e lo inserisci.
                        semilavorato → il costo lo calcola il sistema dalle quantita' che
                                       hai scritto.
                      Un gelataio non carica le quantita' delle sue basi: sono il segreto
                      del laboratorio. Le etichette ora lo dicono. */}
                  {isGelateria ? (
                    <>
                      <option value="gusto">Gusto (kg)</option>
                      <option value="fetta">Fetta (torta/monoporzione)</option>
                      <option value="pezzo">Pezzo</option>
                      <option value="interno">Base — costo al kg che scrivi tu</option>
                      <option value="semilavorato">Semilavorato — costo calcolato dalle quantità</option>
                    </>
                  ) : (
                    <>
                      <option value="fetta">Fetta</option>
                      <option value="pezzo">Pezzo</option>
                      {/* Se una ricetta importata ha tipo=gusto in un contesto non-gelateria,
                          il valore va comunque mostrato — altrimenti il select cade sul primo
                          option e il form salva un tipo diverso da quello caricato. */}
                      {form.tipo === 'gusto' && <option value="gusto">Gusto (kg)</option>}
                      <option value="interno">Base — costo al kg che scrivi tu</option>
                      <option value="semilavorato">Semilavorato — costo calcolato dalle quantità</option>
                    </>
                  )}
                </select>
                {form.tipo === "semilavorato" && <div style={{ marginTop: 6, padding: "6px 10px", background: "#F9F2FD", border: "1px solid #D4B0E8", borderRadius: 6, fontSize: 12, color: "#8E44AD", display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon name="bulb" size={13} /> <span>Per i semilavorati usa la sezione dedicata <strong>"Semilavorati"</strong> in sidebar - ha template rapidi e import da foto.</span>
                </div>}
              </div>

              {/* Fette/pezzi + prezzo: solo in modalità stampi (pasticceria/panificio/...).
                  Per gelateria (gusto) questi campi non hanno senso: gli ingredienti
                  sono per 1 kg e il prezzo vive su Formati vendita per formato. */}
              {!isGusto && (
                <>
                  <div>
                    <div style={fieldLabel}>{form.tipo === "pezzo" ? "Pezzi per stampo" : "Fette / porzioni per stampo"}</div>
                    <input type="number" min="0" value={form.unita} disabled={isSemiOrInterno}
                      aria-label={form.tipo === "pezzo" ? "Pezzi per stampo" : "Fette o porzioni per stampo"}
                      onChange={e => setForm(f => ({ ...f, unita: parseFloat(e.target.value) || 0 }))}
                      style={{ ...inputBase, opacity: isSemiOrInterno ? 0.5 : 1 }} />
                  </div>
                  <div>
                    <div style={fieldLabel}>Prezzo vendita / unità (€)</div>
                    <input type="number" min="0" step="0.5" value={form.prezzo} disabled={isSemiOrInterno}
                      aria-label="Prezzo vendita per unità in euro"
                      onChange={e => setForm(f => ({ ...f, prezzo: parseFloat(e.target.value) || 0 }))}
                      style={{ ...inputBase, opacity: isSemiOrInterno ? 0.5 : 1 }} />
                  </div>
                </>
              )}

              {/* Costo al kg di una BASE.
                  Audit 2026-09-09: il modello delle basi da gelateria è che il
                  costo lo scrive l'utente — le quantita' degli ingredienti sono
                  il segreto del laboratorio e non si caricano. Ma quel prezzo
                  andava messo in un'altra pagina (il listino in Magazzino), e
                  senza di esso ogni ricetta che usa la base la conta ZERO: il
                  food cost di tutti i gusti che la contengono risulta più basso
                  del vero e nessuno lo dice. Ora si scrive qui, dove si crea la
                  base, e finisce nello stesso listino. */}
              {form.tipo === 'interno' && (
                <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                  <div style={fieldLabel}>Costo al kg della base (€)</div>
                  <input type="text" inputMode="decimal" value={costoBaseKg}
                    aria-label="Costo al kg della base in euro"
                    onChange={e => setCostoBaseKg(e.target.value)}
                    placeholder={costoBaseEsistente != null ? String(costoBaseEsistente).replace('.', ',') : 'es. 2,10'}
                    style={{ ...inputBase, fontSize: 14 }} />
                  <div style={{ fontSize: typo.small.fontSize, color: C.textSoft, marginTop: 5, lineHeight: 1.5 }}>
                    Quanto ti costano gli ingredienti per fare un chilo di questa base.
                    Le quantità qui sopra non servono al calcolo: elencare gli ingredienti serve
                    solo per gli allergeni, le dosi restano tue.
                    {costoBaseEsistente != null && (
                      <> Ora nel listino c'è <b>{fmt(costoBaseEsistente)}/kg</b>: lascia vuoto per non cambiarlo.</>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* 17/09/2026, richiesta del titolare: «questa scritta mettila
                meglio, ora il box squilibra tutta la visual; piuttosto mettila
                in un'unica riga sotto le barre di nome gusto, categoria ecc».
                Aveva ragione e il motivo è strutturale: la nota stava DENTRO la
                colonna «Tipo», cioè in un terzo di riga. Un riquadro azzurro
                con due frasi dentro 250px diventa alto quattro righe, e le tre
                colonne — che erano state affiancate proprio per far salire la
                pagina — tornavano storte, con il campo del nome che finiva a
                mezz'aria.
                Ora è fuori dalla griglia e larga quanto la riga, quindi sta su
                una riga sola; e non è più un riquadro colorato ma una riga di
                testo con un filo davanti: è una precisazione, non un avviso. */}
            {isGusto && form.tipo === "gusto" && (
              <div style={{
                marginTop: 12, paddingLeft: 10, borderLeft: `2px solid ${C.border}`,
                fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.5,
              }}>
                Gli ingredienti sono per <b>1 kg</b> di gusto finito · il prezzo di cono, coppetta e vaschetta si imposta in <b>Formati vendita</b>
              </div>
            )}

            {/* Un interruttore vero, non una porta a senso unico.
                18/09/2026, il titolare: «ottimo che clicco e si apre ma poi
                devo poter ricliccare e si deve chiudere». Lo stesso pulsante
                apre e chiude, dice in che stato sta e `aria-expanded` lo segue,
                così lo sa anche chi naviga con la tastiera o il lettore di
                schermo.
                Chiudere nasconde e basta: quello che c'è scritto resta nel
                modulo e si salva con la ricetta. Per questo, a sezione chiusa
                con qualcosa dentro, il pulsante ne mostra l'inizio invece di
                tornare a dire «Aggiungi», che farebbe pensare di aver perso la
                nota appena scritta. */}
            <button type="button"
              onClick={() => setShowMore(v => !v)}
              aria-expanded={showMore}
              aria-controls="note-e-congelabilita"
              style={{
                marginTop: 12, padding: '10px 14px', minHeight: 44,
                background: 'transparent', border: `1px dashed ${C.border}`,
                borderRadius: 8, color: C.textMid, cursor: 'pointer',
                fontSize: typo.small.fontSize, fontWeight: 600, fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                textAlign: 'left', maxWidth: '100%',
                // Sul telefono prende tutta la riga: è il bersaglio del dito, e
                // serve anche a dare una larghezza certa al riassunto della
                // nota, che senza si allunga oltre lo schermo invece di
                // troncarsi con i puntini.
                width: isMobile ? '100%' : 'auto',
                justifyContent: 'flex-start',
              }}>
              <Icon name={showMore ? 'chevUp' : (haNoteOCongelabile ? 'chevDown' : 'plus')} size={12} />
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span>
                  {showMore
                    ? 'Nascondi note e congelabilità'
                    : haNoteOCongelabile
                      ? 'Mostra note e congelabilità'
                      : 'Aggiungi note di cottura o congelabilità'}
                </span>
                {!showMore && haNoteOCongelabile && (
                  <span style={{
                    fontSize: typo.small.fontSize, fontWeight: 500, color: C.textSoft,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {riassuntoNote} · si salva con la ricetta
                  </span>
                )}
              </span>
            </button>

            {showMore && (
              <div id="note-e-congelabilita" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={fieldLabel}>Note (cottura, temperatura…)</div>
                  <input value={form.note} aria-label="Note ricetta (cottura, temperatura)" onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="es. 180°C per 45 min"
                    style={{ ...inputBase, fontSize: 14 }} />
                </div>

                {/* 17/09/2026, il titolare: «controlla se il flusso del
                    congelabile funziona, tanto non serve per il gelato».
                    Aveva ragione due volte.
                    Per il GELATO la domanda non ha senso: è già congelato, e
                    chiederlo a chi carica un gusto è una casella che fa
                    perdere tempo e basta. Qui sotto non compare più.
                    Ma c'è dell'altro, ed è il motivo per cui questo commento
                    è lungo: il valore VIENE SALVATO — nella ricetta e in ogni
                    sessione di produzione (`ProduzioneGiornalieraView`
                    righe 547 e 634) — e **nessuno lo rilegge mai**. Cercato in
                    tutto `src/`: zero letture a valle. Oggi serve solo a
                    scrivere «· congelabile» in un messaggio dopo il
                    salvataggio.
                    Non l'ho tolto del tutto perché per una pasticceria la
                    domanda è vera (una torta si produce il giovedì e si vende
                    il sabato) e il dato raccolto finora resta buono. Ma o
                    qualcosa comincia a usarlo — la produzione anticipata, le
                    previsioni — o è una casella che chiede una cosa e non ne
                    fa niente. */}
                {!isGusto && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: form.congelabile ? "#EEF8FF" : "#F8F4F2", borderRadius: 8, border: `1px solid ${form.congelabile ? "#BDE" : "#E8E0DC"}`, cursor: "pointer" }}
                  onClick={() => setForm(f => ({ ...f, congelabile: !f.congelabile }))}>
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: form.congelabile ? "#2980B9" : "#C8B8B4", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 2, left: form.congelabile ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: "#FFF", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: form.congelabile ? "#2980B9" : C.textMid, display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon name="snow" size={13} /> {form.congelabile ? "Si può congelare" : "Si può congelare?"}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSoft, marginTop: 1 }}>
                      {form.congelabile ? "Lo produci in anticipo, lo tieni in freezer, lo vendi nei giorni successivi." : "Attiva se lo produci e lo vendi in giorni diversi."}
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Ingredienti */}
          <div style={sezione}>
            {/* 17/09/2026, il titolare ha messo in dubbio la frase qui sotto:
                «è corretta? perché magari il totale degli ingredienti non fa
                1 kg preciso». Aveva ragione: diceva «per 1 kg di gusto
                finito», e sembrava che la somma DOVESSE fare mille grammi.
                Non è così, ed è proprio il motivo per cui esiste il campo Resa
                più giù: si scrive la ricetta come la si fa davvero — una cotta
                da 4.300 g — e la resa dice quanto prodotto finito ne esce, che
                con l'evaporazione o l'aria montata non è mai la somma esatta
                degli ingredienti. */}
            <PanelHead icon={<Icon name="receipt" size={18} />} title="Ingredienti"
              sub={isGusto
                ? "Scrivi la ricetta come la fai davvero, in grammi: la somma non deve fare per forza 1 kg. Il costo al chilo lo calcola la Resa qui sotto. I prezzi arrivano dal tuo listino (o da una stima, se manca)."
                : "Aggiungi ogni ingrediente con la quantità in grammi per uno stampo. Il costo viene preso dal tuo listino prezzi (o dalla stima HoReCa)."} />
            {form.ingredienti.length > 0 && (
              <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 8, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: typo.small.fontSize, minWidth: 360 }}>
                  <thead>
                    {/* Le etichette si toccano per ordinare: SortTH è lo stesso
                        componente delle altre tabelle del prodotto, con il
                        fuoco da tastiera e Invio/Spazio già dentro. */}
                    <tr style={{ background: "#F8F4F2" }}>
                      <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}
                        tip="Tocca per ordinare per nome">Ingrediente</SortTH>
                      <SortTH k="qty1stampo" right active={sortKey === 'qty1stampo'} dir={sortDir} onToggle={toggleSort}
                        tip={isGusto ? "Grammi di ingrediente per 1 kg di gusto finito. Tocca per ordinare." : "Grammi di ingrediente per uno stampo. Tocca per ordinare."}>
                        {isGusto ? "g / kg gusto" : "g / stampo"}
                      </SortTH>
                      <SortTH k="costo" right active={sortKey === 'costo'} dir={sortDir} onToggle={toggleSort}
                        tip={isGusto ? "Costo dell'ingrediente per 1 kg. Tocca per ordinare." : "Costo dell'ingrediente per uno stampo. Tocca per ordinare."}>
                        Costo €
                      </SortTH>
                      <th style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}` }}/>
                    </tr>
                  </thead>
                  <tbody>
                    {/* `originalIndex` resta l'indice dentro form.ingredienti:
                        è quello che usano modifica e rimozione, e non deve
                        seguire l'ordine a schermo. */}
                    {righeVisibili
                      .map(({ ing, originalIndex: i }, rowIndex) => {
                      // Audit 2026-09-09: la riga si chiede a costoRigaIngrediente,
                      // la stessa funzione che alimenta il dettaglio food cost. Prima
                      // qui c'era un calcolo a parte che non conosceva i semilavorati
                      // ne' le rese, e le righe non sommavano al totale mostrato sopra.
                      const rg = costoRigaIngrediente(ing, ingCosti, ricettario);
                      const costo = rg.costo;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: rowIndex % 2 === 0 ? C.white : "#FDFAF7" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 600, fontSize: font.size.md, color: C.text, verticalAlign: "middle" }}>
                            {/* 17/09/2026: «i nomi degli ingredienti con la
                                prima maiuscola e il resto minuscolo, sia nel
                                Ricettario sia in Nuovo gusto». Qui uscivano
                                tutti in maiuscolo perché è così che stanno nel
                                database — convenzione del prodotto, e non si
                                tocca. Cambia solo come si leggono. Il `title`
                                tiene il nome esatto per chi deve ritrovarlo. */}
                            <span title={ing.nome} style={{ display: "inline-block", maxWidth: isMobile ? 130 : 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{formatNome(ing.nome)}</span>
                            {/* Audit 2026-09-09: un solo badge per riga, deciso dall'esito
                                di costoRigaIngrediente. Prima l'unico badge era "prezzo
                                mancante" e appariva anche sui semilavorati (che un prezzo
                                ce l'hanno, calcolato) mentre non appariva mai sui prezzi
                                stimati HoReCa (che un prezzo suo NON e'). Cliccabile solo
                                dove cliccare serve. Niente testo sotto i 12px. */}
                            {(() => {
                              const badgeStyle = (bg, col, dashed) => ({
                                fontSize: typo.small.fontSize, marginLeft: 6, background: bg, color: col,
                                padding: "2px 7px", borderRadius: 4, fontWeight: 700, whiteSpace: "nowrap",
                                verticalAlign: "middle",
                                ...(dashed ? { cursor: "pointer", border: `1px dashed ${col}66` } : { border: "none" }),
                              });
                              if (rg.mancante && rg.isSemilavorato) return (
                                <span title={rg.motivo} style={{ ...badgeStyle(C.amberLight, C.amber, false), cursor: 'help' }}>da completare</span>
                              );
                              if (rg.mancante) return (
                                <button type="button"
                                  onClick={() => setPriceModal({ nome: ing.nome, costoKg: '', saving: false })}
                                  aria-label={`Imposta il prezzo di ${formatNome(ing.nome)}`}
                                  title={`Clicca per impostare il prezzo di ${formatNome(ing.nome)} in euro al kg`}
                                  style={badgeStyle(C.amberLight, C.amber, true)}>
                                  prezzo mancante ›
                                </button>
                              );
                              if (rg.isStima) return (
                                <button type="button"
                                  onClick={() => setPriceModal({ nome: ing.nome, costoKg: '', saving: false })}
                                  aria-label={`Metti il tuo prezzo per ${formatNome(ing.nome)}`}
                                  title="Prezzo medio di mercato, non il tuo. Clicca per metterci il tuo."
                                  style={badgeStyle(C.bgSubtle, C.textMid, true)}>
                                  stima ›
                                </button>
                              );
                              if (rg.isSemilavorato && rg.motivo) return (
                                <span title={rg.motivo} style={{ ...badgeStyle(C.amberLight, C.amber, false), cursor: 'help' }}>costo incompleto</span>
                              );
                              if (rg.isSemilavorato) return (
                                <span title="Il costo arriva dalla scheda del semilavorato" style={{ ...badgeStyle(C.bgSubtle, C.textMid, false), cursor: 'help' }}>semilavorato</span>
                              );
                              if (!ing.qty1stampo) return (
                                <span title="A 0 g non entra nel food cost: mettici i grammi se deve contare" style={{ ...badgeStyle(C.bgSubtle, C.textSoft, false), cursor: 'help' }}>0 g</span>
                              );
                              return null;
                            })()}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>
                            {/* 17/09/2026, richiesta del titolare: «togli la
                                possibilità di aumentare o diminuire la qty di
                                grammi con le freccette, uno per sbaglio può
                                farlo».
                                Un campo numerico del browser non ha solo le
                                freccette: cambia valore anche con la ROTELLA
                                del mouse quando ha il fuoco, ed è il modo in
                                cui si sbaglia più spesso — si scorre la pagina
                                e una quantità cambia senza che nessuno l'abbia
                                toccata. `type="text"` toglie tutte e due;
                                `inputMode="decimal"` tiene la tastiera
                                numerica sul telefono. */}
                            <input type="text" inputMode="decimal" value={ing.qty1stampo}
                              aria-label={`Grammi per stampo di ${formatNome(ing.nome)}`}
                              // Entrando nel campo l'ordine si congela com'e'
                              // adesso: così la riga che si sta scrivendo non
                              // scappa sotto il dito. Uscendo si scioglie, e il
                              // riordino avviene nel momento in cui si passa
                              // alla riga dopo — che è quando serve vederlo.
                              onFocus={() => setOrdineCongelato(prev => prev || righeVisibili.map(r => r.originalIndex))}
                              onBlur={() => setOrdineCongelato(null)}
                              onChange={e => {
                                const n = [...form.ingredienti];
                                n[i] = { ...n[i], qty1stampo: parseFloat(e.target.value) || 0 };
                                setForm(f => ({ ...f, ingredienti: n }));
                              }}
                              // 17/09/2026, richiesta del titolare: «queste info
                              // sono visivamente tutte scoordinate, grandezze di
                              // caratteri diverse, posizioni non in linea».
                              // Il campo era 16px dentro una tabella scritta a
                              // 12, e la «g» accanto un'altra misura ancora:
                              // tre grandezze in una riga sola. Ora il campo e
                              // l'unità stanno sulla stessa misura della
                              // tabella, e il numero è incolonnato a destra con
                              // le cifre a larghezza fissa come le altre celle.
                              style={{ ...TNUM, width: 72, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: font.size.md, textAlign: "right", fontWeight: 700, color: C.text, background: C.white }} />
                            <span style={{ fontSize: font.size.sm, color: C.textSoft, marginLeft: 5 }}>g</span>
                          </td>
                          <td style={{ ...TNUM, padding: "6px 10px", textAlign: "right", color: costo > 0 ? C.red : C.textSoft, fontWeight: 700, fontSize: font.size.md, whiteSpace: 'nowrap' }}>{costo > 0 ? fmt(costo) : "—"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "middle" }}>
                            <button aria-label="Rimuovi ingrediente" onClick={() => removeIng(i)} style={{ padding: 0, width: 40, height: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.textSoft, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: 'center' }}><Icon name="trash" size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* 17/09/2026, richiesta del titolare: «ingredienti e ingrediente
                sono uno sotto l'altro, non bello visivamente».
                Il riquadro si chiama già «Ingredienti» e due righe sotto
                c'era scritto «Ingrediente», e accanto «Grammi». Tre etichette
                per dire una cosa sola. I segnaposto dentro i campi («es.
                burro», «es. 200») dicono già cosa scrivere, e restano visibili
                finché il campo e' vuoto — cioe' esattamente quando servono.
                Le etichette tolte, la riga si allinea in cima e il blocco
                perde due righe di altezza. */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 120px auto", gap: 8, alignItems: "start" }}>
              <div>
                {/* 17/09/2026, richiesta del titolare: «la barra ingrediente se
                    la clicco compaiono gli ingredienti ma di fianco, rifalla
                    molto bene e l'elenco compare sempre sotto la barra».
                    Era un `<datalist>`, cioè l'elenco che disegna il browser:
                    dove lo mette e come lo fa non lo decidiamo noi, e cambia
                    da browser a browser. In più filtra sulle voci che
                    CONTENGONO quello che c'è già scritto — lo stesso difetto
                    già corretto nel campo Categoria, dove si vedeva una voce
                    sola e sembrava che le altre non esistessero.
                    `CampoConElenco` è il componente nato per questo: l'elenco
                    sta sempre sotto la barra, mostra tutte le voci, si muove
                    con le frecce e ha le righe alte 44px per il dito. */}
                <CampoConElenco
                  id="ingrediente-nuovo"
                  valore={newIngNome}
                  onCambia={setNewIngNome}
                  voci={vociIngredienti}
                  placeholder="es. Burro"
                  ariaLabel="Nome ingrediente da aggiungere"
                  stile={{ ...inputBase }}
                  soloDallElenco
                  onCreaNuova={creaMateriaPrima}
                  etichettaCrea="Aggiungila alle materie prime"
                />
              </div>
              <div>
                <input type="text" inputMode="decimal" value={newIngQty} aria-label="Grammi di ingrediente da aggiungere" onChange={e => setNewIngQty(e.target.value.replace(',', '.'))} onKeyDown={e => e.key === "Enter" && addIng()}
                  placeholder="es. 200"
                  style={{ ...inputBase, ...TNUM, textAlign: "right" }} />
              </div>
              <button onClick={addIng} aria-label="Aggiungi ingrediente alla ricetta" style={{ padding: "0 18px", background: C.red, color: C.white, border: "none", borderRadius: 8, fontSize: font.size.base, fontWeight: 700, cursor: "pointer", height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, width: isMobile ? '100%' : 'auto' }}>
                <Icon name="plus" size={14} /> Aggiungi
              </button>
            </div>

            {/* Helper conversioni - grammi restano l'unita' unica, ma ricordiamo
                le equivalenze comuni per uova e liquidi. */}
            <details style={{ marginTop: 12, fontSize: typo.small.fontSize, color: C.textMid, background: '#FAF6F2', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: C.textMid, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="lightbulb" size={12} />
                Non hai la bilancia? Conversioni rapide
              </summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 6 : 14, lineHeight: 1.7 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Uova</div>
                  1 uovo medio ≈ 55 g<br />
                  1 tuorlo ≈ 18 g · 1 albume ≈ 33 g
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Liquidi (per ml)</div>
                  Acqua, latte, panna ≈ 1 g<br />
                  Olio ≈ 0,92 g · Miele ≈ 1,4 g
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Cucchiai</div>
                  1 cucchiaio ≈ 15 g<br />
                  1 cucchiaino ≈ 5 g
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Farina & zucchero</div>
                  1 bicchiere farina 00 ≈ 130 g<br />
                  1 bicchiere zucchero ≈ 200 g
                </div>
              </div>
            </details>
          </div>

          {/* Resa dichiarata — gestisce il caso reale in cui gli ingredienti
              pesati sommano diverso dal peso finito (evaporazione, overrun,
              perdita spillover). Per i GUSTI (gelateria) impatta il food
              cost/kg finito: la ricetta diventa quindi coerente sul lungo
              periodo (100 batch → dati esatti, non spanciamento cumulativo).
              Per stampi/pezzi è informativo (peso stampo/pezzo dichiarato). */}
          {form.tipo !== 'interno' && form.tipo !== 'semilavorato' && (() => {
            const sommaG = (form.ingredienti || []).reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
            // Audit 2026-09-09: qui il default per i gusti era 1000 g fisso, ma il
            // motore (resaGrammi) usa la somma degli ingredienti quando la resa
            // non è scritta. La card dichiarava "Default: 1.000 g" mentre il food
            // cost veniva calcolato su 500 g: due numeri diversi per la stessa
            // cosa. Ora la card mostra quello che il sistema usa davvero.
            const resaDefault = resaGrammi({ ingredienti: form.ingredienti, tipo: form.tipo })
            const resaEff = (typeof form.resa_g === 'number' && form.resa_g > 0) ? form.resa_g : (resaDefault || 0)
            const scartoAssoluto = Math.abs(sommaG - resaEff)
            const scartoPct = sommaG > 0 ? (scartoAssoluto / sommaG) * 100 : 0
            const scartoRilevante = sommaG > 0 && resaEff > 0 && scartoPct > 5
            const labelResa = isGusto ? 'Resa 1 kg finito (g)' : (form.tipo === 'fetta' ? 'Peso stampo/torta (g)' : 'Peso pezzo (g)')
            // 17/09/2026, richiesta del titolare: «anche questa sezione occupa
            // troppo, riassumila». Erano due righe di spiegazione sempre a
            // schermo per un campo che si compila una volta sola. La frase
            // lunga è passata dietro al «?», che da oggi si apre anche col
            // dito: chi la sa già non se la rilegge ogni volta, chi non la sa
            // la trova dov'è naturale cercarla.
            const sub = isGusto
              ? 'Quanti grammi di prodotto finito escono da questi ingredienti.'
              : 'Peso reale dello stampo o pezzo prodotto.'
            const spiegazione = isGusto
              ? 'Cambia se c\'è evaporazione (pastorizzazione) o overrun (aria montata): il food cost al chilo si adegua di conseguenza. Lasciandolo vuoto vale la somma degli ingredienti.'
              : 'Utile come riferimento, ma non cambia il food cost per stampo.'
            const normalizza = () => {
              if (!sommaG || !resaEff) return
              const ratio = resaEff / sommaG
              setForm(f => ({
                ...f,
                ingredienti: (f.ingredienti || []).map(ing => ({
                  ...ing,
                  qty1stampo: Number((Number(ing.qty1stampo || 0) * ratio).toFixed(2)),
                })),
              }))
            }
            return (
              <div style={sezione}>
                <PanelHead icon={<Icon name="package" size={18} />} title="Resa"
                  badge={<Tip text={spiegazione}><span style={{ width: 20, height: 20, borderRadius: '50%', background: C.bgSubtle, color: C.textSoft, fontSize: font.size.sm, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>?</span></Tip>}
                  sub={sub} />
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={fieldLabel}>{labelResa}</div>
                    <input type="number" inputMode="decimal" step="1" min="1"
                      aria-label={labelResa}
                      value={form.resa_g == null ? '' : form.resa_g}
                      onChange={e => {
                        const v = e.target.value === '' ? null : Number(e.target.value)
                        setForm(f => ({ ...f, resa_g: v }))
                      }}
                      placeholder={String(Math.round(resaDefault))}
                      style={{ ...inputBase, fontSize: 14 }} />
                    <div style={{ fontSize: 12, color: C.textSoft, marginTop: 4 }}>
                      Default: <b>{Math.round(resaDefault)} g</b>{form.resa_g == null ? ' (auto)' : ''}
                    </div>
                  </div>
                  {/* Due numeri di servizio, non il risultato della pagina.
                      18/09/2026, il titolare: «rivedi le dimensioni di questa
                      box e rendile perfette per la pagina, non invasive e
                      grandi». Era un riquadro pieno, con il suo fondo, il suo
                      bordo e due righe larghe quanto mezza pagina, per dire
                      una somma e una resa: pesava come il pannello del costo,
                      che è la cosa che invece conta davvero qui dentro.
                      Il carattere resta a 12px — sotto non si scende, è un
                      minimo che il progetto si è dato dopo un difetto vero —
                      e a rimpicciolire sono l'ingombro, i bordi e il
                      contrasto: niente fondo, niente cornice, un filo a
                      sinistra e una riga sola.
                      Quando c'è uno scarto degno di nota il riquadro torna:
                      lì non è un'informazione di servizio, è una cosa da
                      guardare. */}
                  {scartoRilevante ? (
                    <div style={{
                      padding: '10px 12px',
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 8,
                      fontSize: typo.small.fontSize, color: '#92400E', lineHeight: 1.5,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <span>Somma ingredienti</span>
                        <b style={{ ...TNUM }}>{sommaG.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 2 })} g</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <span>Resa dichiarata</span>
                        <b style={{ ...TNUM }}>{Math.round(resaEff).toLocaleString('it-IT', { useGrouping: 'always' })} g</b>
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>
                        Scarto {fmtp(scartoPct)} ({sommaG > resaEff ? '+' : '−'}{scartoAssoluto.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })} g).
                        {isGusto
                          ? " Verifica: perdita evaporazione? overrun d'aria? errore quantità?"
                          : ' Il peso stampo dichiarato differisce dalla somma ingredienti.'}
                      </div>
                      <button type="button" onClick={normalizza}
                        style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #F59E0B', background: '#FFF', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Normalizza ingredienti a {Math.round(resaEff)} g
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      alignSelf: isMobile ? 'flex-start' : 'center',
                      paddingLeft: 10, borderLeft: `2px solid ${C.border}`,
                      fontSize: typo.small.fontSize, color: C.textSoft, lineHeight: 1.5,
                      display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 2,
                    }}>
                      <span>
                        Somma ingredienti{' '}
                        <b style={{ ...TNUM, color: C.textMid, fontWeight: 600 }}>{sommaG.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 2 })} g</b>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Resa dichiarata{' '}
                        <b style={{ ...TNUM, color: C.textMid, fontWeight: 600 }}>{Math.round(resaEff).toLocaleString('it-IT', { useGrouping: 'always' })} g</b>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* 3. Allergeni - auto-rilevati */}
          <div style={sezione}>
            {/* Il programma propone, il cliente conferma.
                18/09/2026, decisione del titolare: «non dobbiamo avere nessuna
                ripercussione legale, dobbiamo lasciare al cliente l'ultima
                parola, noi al massimo diamo un consiglio».
                Prima qui c'era scritto «Calcolati automaticamente dagli
                ingredienti (Reg. UE 1169/2011)»: citare il regolamento
                accanto a un calcolo nostro faceva sembrare che l'elenco
                uscisse a norma da solo. Non è così e non può esserlo: noi
                leggiamo i nomi degli ingredienti scritti nella ricetta, non
                le etichette dei suoi fornitori, dove stanno le tracce e le
                contaminazioni. Il badge diceva «Auto» per lo stesso motivo
                sbagliato, e adesso dice quello che è: una proposta. */}
            <PanelHead icon={<Icon name="warning" size={18} />} title="Allergeni presenti" color={C.amber}
              badge={<span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: R.full, background: "#E0F2FE", color: "#0369A1", textTransform: "uppercase", letterSpacing: "0.05em" }}>Proposta</span>}
              sub="Questo elenco è un consiglio, ricavato dagli ingredienti che hai scritto. Quello che vale è l'elenco che confermi tu: le tracce e le contaminazioni stanno sulle etichette dei tuoi fornitori, che noi non vediamo." />

            {autoAllergeni.length === 0 ? (
              <div style={{ fontSize: 12, color: C.textSoft, padding: "10px 12px", background: BG_NEUTRO, border: `1px dashed ${C.border}`, borderRadius: 8, marginBottom: 14 }}>
                Dagli ingredienti che hai scritto non risulta nessun allergene. Controlla le etichette dei tuoi fornitori e aggiungi qui sotto quelli che mancano.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {autoAllergeni.map(aid => {
                  const a = ALLERGENI.find(x => x.id === aid);
                  if (!a) return null;
                  return (
                    <span key={aid} title="Proposto dagli ingredienti che hai scritto: confermalo tu"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: R.full, background: `${ALLERGENE_COLORS[aid]}15`, color: ALLERGENE_COLORS[aid], border: `1.5px solid ${ALLERGENE_COLORS[aid]}55`, fontSize: 12, fontWeight: 700 }}>
                      <Icon name="check" size={11} />{a.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* I DUBBI, nel momento in cui si può rispondere.
                Chi scrive la ricetta ha in mano la confezione del fornitore:
                è l'unico momento in cui la domanda "c'è la soia in questo
                cioccolato?" ha una risposta a portata di mano. Chiederlo dopo,
                sulla scheda allergeni, significa chiederlo a chi non ha più
                l'etichetta davanti. */}
            {allergeniDubbi.length > 0 && (
              <div style={{ background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ ...typo.small, fontWeight: 700, color: T.amber, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="warning" size={14} />
                  {allergeniDubbi.length === 1 ? "Un allergene da verificare" : `${allergeniDubbi.length} allergeni da verificare`}
                </div>
                <div style={{ ...typo.small, color: T.textMid, lineHeight: 1.55, marginBottom: 10 }}>
                  Questi ingredienti di solito lo contengono, ma dipende dal fornitore. Guarda l'etichetta: se c'è, toccalo qui e diventa certo.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allergeniDubbi.map(aid => {
                    const a = ALLERGENI.find(x => x.id === aid);
                    if (!a) return null;
                    return (
                      <button key={aid} type="button"
                        onClick={() => setForm(f => ({ ...f, allergeniManual: [...(f.allergeniManual || []), aid] }))}
                        title={`Confermo che contiene ${a.label}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", minHeight: isMobile ? 44 : 32, borderRadius: R.full, background: T.bgCard, border: `1.5px dashed ${T.amber}`, color: T.amber, ...typo.small, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        <Icon name="plus" size={12} />{a.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Gli ingredienti che non riconosciamo: dirli per nome, non
                lasciare una casella vuota che sembra "niente allergeni". */}
            {analisiAllergeni.nonRiconosciuti.length > 0 && (
              <div style={{ ...typo.small, color: T.textSoft, lineHeight: 1.55, marginBottom: 14 }}>
                Di {analisiAllergeni.nonRiconosciuti.length === 1 ? "questo ingrediente non sappiamo" : "questi ingredienti non sappiamo"} cosa contengono:{" "}
                <b style={{ color: T.textMid }}>{analisiAllergeni.nonRiconosciuti.slice(0, 8).map(formatNome).join(", ")}</b>
                {analisiAllergeni.nonRiconosciuti.length > 8 ? ` e altri ${analisiAllergeni.nonRiconosciuti.length - 8}` : ""}.
                {" "}Se portano un allergene, aggiungilo a mano qui sotto.
              </div>
            )}

            {(() => {
              const disponibili = ALLERGENI.filter(a => !autoAllergeni.includes(a.id));
              const manualSelezionati = (form.allergeniManual || []).filter(id => disponibili.some(a => a.id === id));
              const hasManual = manualSelezionati.length > 0;
              const isExpanded = showManualAllergeni || hasManual;
              if (disponibili.length === 0) {
                return (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 12, color: C.textSoft, fontStyle: "italic" }}>
                    Tutti gli allergeni UE sono già stati rilevati automaticamente.
                  </div>
                );
              }
              return (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  {/* Selezionati manualmente: sempre visibili come chip rimovibili */}
                  {hasManual && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {manualSelezionati.map(id => {
                        const a = ALLERGENI.find(x => x.id === id);
                        if (!a) return null;
                        return (
                          <button key={id} type="button" aria-label={`Rimuovi ${a.label} dagli allergeni manuali`}
                            onClick={() => setForm(f => ({ ...f, allergeniManual: (f.allergeniManual || []).filter(x => x !== id) }))}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: R.full, background: `${ALLERGENE_COLORS[id]}15`, color: ALLERGENE_COLORS[id], border: `1.5px solid ${ALLERGENE_COLORS[id]}55`, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            {a.label}
                            <Icon name="x" size={10} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Toggle "Modifica manualmente" */}
                  {!isExpanded && (
                    <button type="button" onClick={() => setShowManualAllergeni(true)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", minHeight: 44, background: "#FFF", color: C.textMid, border: `1px dashed ${C.border}`, borderRadius: 8, fontSize: typo.small.fontSize, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      <Icon name="plus" size={12} /> Modifica manualmente
                      <span style={{ fontSize: 12, color: C.textSoft, fontWeight: 500 }}>({disponibili.length} disponibili)</span>
                    </button>
                  )}

                  {/* Elenco checkbox: visibile solo se l'utente ha cliccato o ha selezioni esistenti */}
                  {isExpanded && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={fieldLabel}>{hasManual ? "Modifica selezione manuale" : "Seleziona allergeni aggiuntivi"}</div>
                        <button type="button" onClick={() => setShowManualAllergeni(false)}
                          style={{ background: "transparent", border: "none", color: C.textSoft, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit" }}>
                          Chiudi elenco
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 6 }}>
                        {disponibili.map(a => {
                          const sel = (form.allergeniManual || []).includes(a.id);
                          return (
                            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 7, cursor: "pointer", border: `1px solid ${sel ? ALLERGENE_COLORS[a.id] : "#E2D9D5"}`, background: sel ? `${ALLERGENE_COLORS[a.id]}10` : "#FDFAF8", transition: "all 0.15s" }}>
                              <input type="checkbox" checked={sel} style={{ display: "none" }}
                                onChange={() => setForm(f => ({ ...f, allergeniManual: sel ? (f.allergeniManual || []).filter(x => x !== a.id) : [...(f.allergeniManual || []), a.id] }))} />
                              <span style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? ALLERGENE_COLORS[a.id] : C.textMid }}>{a.label}</span>
                              {sel && <span style={{ marginLeft: "auto", color: ALLERGENE_COLORS[a.id], display: "inline-flex" }}><Icon name="check" size={12} /></span>}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Overwrite conferma + Salva */}
          {overwriteConf && (
            <div style={{ padding: "14px 16px", background: C.amberLight, border: `2px solid ${C.amber}`, borderRadius: 10, marginBottom: 4 }}>
              <div style={{ fontSize: typo.small.fontSize, fontWeight: 800, color: C.amber, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <Icon name="warning" size={14} /> "{overwriteConf}" esiste già - sovrascrivere?
              </div>
              <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>La ricetta esistente verrà sostituita con i nuovi ingredienti e dati.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={doSaveRicetta} disabled={saving} style={{ padding: isMobile ? "12px 18px" : "9px 18px", minHeight: isMobile ? 44 : 'auto', background: C.amber, color: C.white, border: "none", borderRadius: 8, fontWeight: 800, fontSize: isMobile ? 13 : 12, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6, flex: isMobile ? '1 1 auto' : 'unset', justifyContent: 'center' }}>
                  <Icon name="checkCircle" size={14} /> {saving ? "Salvataggio…" : "Sì, sovrascrivi"}
                </button>
                <button onClick={() => setOverwriteConf(null)} disabled={saving} style={{ padding: isMobile ? "12px 14px" : "9px 14px", minHeight: isMobile ? 44 : 'auto', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, color: C.textMid, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: 'center' }}>
                  <Icon name="x" size={13} /> Annulla
                </button>
              </div>
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{ marginTop: isMobile ? 16 : 20, padding: isMobile ? "16px" : "14px", minHeight: isMobile ? 52 : 'auto', background: C.red, color: C.white, border: "none", borderRadius: 10, fontWeight: 900, fontSize: isMobile ? 15 : 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1, boxShadow: "0 2px 10px rgba(110,14,26,0.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <Icon name="save" size={16} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{saving ? "Salvataggio…" : (editMode ? `Salva modifiche a ${editMode}` : `Salva ${LEX.nuovaRicetta.toLowerCase()}`)}</span>
          </button>
        </div>

        {/* ── Anteprima costo (destra) ──────────────────────────────────────
            Per stampi (pasticceria): pannello redditività completo (ricavo/food cost/margine).
            Per gusti (gelateria): solo food cost/kg — il prezzo di vendita vive su
            FormatiVendita, quindi ricavo e margine non hanno senso qui. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={cardStyle}>
            <PanelHead icon={<Icon name="barChart" size={18} />} title={isGusto ? "Costo del gusto" : "Anteprima redditività"} color={C.text} />

            {isGusto ? (
              form.ingredienti.length === 0 ? (
                <div style={{ color: C.textSoft, fontSize: 12, textAlign: "center", padding: "16px 0" }}>Aggiungi ingredienti per vedere il food cost</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ padding: '14px 16px', background: C.redLight, border: `1px solid ${C.red}20`, borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Food cost al kg</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: C.red, letterSpacing: '-0.02em', ...TNUM }}>{fmt(live.fcPerKg)}</div>
                    <div style={{ fontSize: 12, color: C.textSoft, marginTop: 4 }}>materie prime per 1 kg di gusto finito</div>
                    {/* Da dove viene il numero: senza questa riga un gusto scritto
                        sul batch da 5 kg sembra costare 5 volte tanto e non si
                        capisce perché. */}
                    {live.resaG > 0 && Math.abs(live.resaG - 1000) > 1 && (
                      <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.red}20` }}>
                        {fmt(live.fc)} di ingredienti per {Math.round(live.resaG).toLocaleString('it-IT', { useGrouping: 'always' })} g di gusto
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6, padding: '4px 4px 0' }}>
                    <Icon name="bulb" size={12} />
                    <span>Il ricarico dipende dal formato di vendita (cono, coppetta, vaschetta). Impostalo in <b>Formati vendita</b>.</span>
                  </div>
                  {live.mancanti.length > 0 && (
                    <div style={{ fontSize: 12, color: C.amber, background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="warning" size={12} /></span>
                      <span>Food cost sottostimato: manca il prezzo di {live.mancanti.map(leggiMancante).join(", ")}. Caricalo nel listino prezzi.</span>
                    </div>
                  )}
                </div>
              )
            ) : (
            <>
            {/* Semaforo (solo stampi) */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: sem.bg, border: `1px solid ${sem.border}`, marginBottom: 14 }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", background: live.ricavo > 0 ? sem.color : C.border, color: C.white, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={sem.icon} size={20} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: sem.color, letterSpacing: "-0.01em" }}>{sem.label}</div>
                <div style={{ fontSize: 12, color: C.textSoft, marginTop: 1 }}>
                  {live.ricavo <= 0
                    ? "Aggiungi ingredienti, unità e prezzo"
                    : !live.conIngredienti
                      ? "Scrivi gli ingredienti: finché non ci sono, il food cost non si può dire"
                      : !live.affidabile
                        ? <>{live.mancanti.length === 1 ? '1 ingrediente è senza prezzo' : `${live.mancanti.length} ingredienti sono senza prezzo`}: il margine che vedi è più alto del vero</>
                        : <>Food cost {fmtp(live.fcPct)} · obiettivo {targetPct}%</>}
                </div>
              </div>
            </div>

            {form.ingredienti.length === 0 ? (
              <div style={{ color: C.textSoft, fontSize: 12, textAlign: "center", padding: "12px 0 4px" }}>Aggiungi ingredienti per vedere il calcolo</div>
            ) : (
              // 4 righe perfettamente incolonnate: stessa altezza (44),
              // stessa fontSize per label (12) e value (15), grid 2col,
              // tutti tabular-nums. Niente prefissi +/-/= sulle label
              // (facevano shift di x), solo - sul VALORE di Food cost.
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Audit 2026-09-09: con degli ingredienti senza prezzo questi numeri
                    NON sono il margine, sono il massimo possibile: il food cost vero e'
                    più alto e il margine vero più basso. Prima uscivano nudi ("Margine
                    100,0%") come se fossero misurati. "parziale" e "max" lo dicono nello
                    spazio del box, senza spostare l'incolonnamento. */}
                {[
                  { lbl: 'Ricavo',         val: fmt(live.ricavo),     c: C.green, bg: C.greenLight, brd: `${C.green}25` },
                  { lbl: 'Food cost',      val: live.affidabile ? `−${fmt(live.fc)}` : `−${fmt(live.fc)} parziale`, c: C.red, bg: C.redLight, brd: `${C.red}20` },
                  { lbl: 'Margine lordo',  val: live.affidabile ? fmt(live.margine) : `max ${fmt(live.margine)}`,  c: sem.color, bg: sem.bg, brd: sem.border, prominent: true },
                  { lbl: 'Margine %',      val: live.affidabile ? fmtp(live.margPct) : `max ${fmtp(live.margPct)}`, c: sem.color, bg: sem.bg, brd: sem.border },
                ].map((r, i) => (
                  <div key={i} style={{
                    padding: '11px 14px', background: r.bg, border: `1px solid ${r.brd}`, borderRadius: 8,
                    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 44, columnGap: 12,
                  }}>
                    <span style={{ fontSize: typo.small.fontSize, color: r.c, fontWeight: r.prominent ? 800 : 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{r.lbl}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: r.c, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{r.val}</span>
                  </div>
                ))}
                {/* Per unità: nota piccola sotto */}
                <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 6, marginTop: 2, padding: '0 4px' }}>
                  <Icon name="bulb" size={12} /> Per unità: FC {fmt(live.fcUnit)} · Margine {fmt(form.unita > 0 ? live.margine / form.unita : 0)}
                </div>
                {live.mancanti.length > 0 && (
                  <div style={{ fontSize: 12, color: C.amber, background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="warning" size={12} /></span>
                    <span>Food cost sottostimato: manca il prezzo di {live.mancanti.map(leggiMancante).join(", ")}. Caricalo nel listino prezzi.</span>
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>

          {/* Prezzo minimo per centrare il food cost obiettivo.
              Rinominato 26/06: era "Prezzo consigliato" ma poteva suggerire
              di abbassare il prezzo (= ricavo minore). Ora è chiaro che è il
              prezzo MINIMO sotto cui il food cost % sfora il target; sopra
              quel prezzo si guadagna di più, mai consigliato abbassarlo.
              Per i gusti (gelateria) il prezzo vive su FormatiVendita, non
              sulla ricetta — questo pannello non ha significato e viene
              nascosto. */}
          {!isSemiOrInterno && !isGusto && (
            <div style={cardStyle}>
              <PanelHead icon={<Icon name="money" size={18} />} title="Prezzo minimo per il target" color={C.red} sub="prezzo minimo che mantiene il food cost dentro l'obiettivo. Sopra, guadagni di più." />

              {/* Target food cost selector */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...fieldLabel, marginBottom: 7 }}>Food cost obiettivo</div>
                <div style={{ display: "flex", gap: 3, padding: 3, background: C.bgSubtle, borderRadius: R.md }}>
                  {[25, 28, 30, 33, 35].map(t => (
                    <button key={t} onClick={() => setTargetPct(t)}
                      style={{ flex: 1, padding: isMobile ? "10px 4px" : "6px 4px", minHeight: isMobile ? 44 : 'auto', borderRadius: R.sm, border: "none", cursor: "pointer", fontSize: isMobile ? 13 : 12, fontWeight: targetPct === t ? 700 : 500, ...TNUM, background: targetPct === t ? C.bgCard : "transparent", color: targetPct === t ? C.red : C.textSoft, boxShadow: targetPct === t ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>{t}%</button>
                  ))}
                </div>
              </div>

              {/* Audit 2026-09-09 ALTA: la condizione era `live.ricavo > 0 || live.fc > 0`,
                  quindi bastava avere degli ingredienti perché il pannello si accendesse.
                  Svuotando il campo Fette (unita = 0) il prezzo minimo diventava 0,00 €
                  e il messaggio finale diceva "Sei sopra il minimo: stai guadagnando più
                  del target". Ora il numero appare solo quando ha un senso. */}
              {!live.conIngredienti ? (
                /* Audit del 16/09/2026, agente PAGINE. Bastava che ci fosse un
                   prezzo di vendita (`live.ricavo > 0`) perché il pannello si
                   accendesse: senza nemmeno un ingrediente il food cost vale
                   zero, e il «prezzo minimo per fetta» usciva **0,00 €**. Un
                   food cost che non si conosce non è gratis: è un food cost che
                   non si conosce, e va scritto così. */
                <div style={{ color: C.textSoft, fontSize: typo.small.fontSize, textAlign: "center", padding: "10px 0", lineHeight: 1.5 }}>
                  Il prezzo minimo si calcola dal food cost, e il food cost si calcola dagli ingredienti.
                  Scrivili qui sopra e questo numero compare da sé.
                </div>
              ) : live.unitaMancante ? (
                <div style={{ color: C.textSoft, fontSize: typo.small.fontSize, textAlign: "center", padding: "10px 0", lineHeight: 1.5 }}>
                  Indica quante {form.tipo === "pezzo" ? "pezzi ricavi" : "fette ricavi"} da uno stampo:
                  senza quel numero non si può dire quanto deve costare {form.tipo === "pezzo" ? "un pezzo" : "una fetta"}.
                </div>
              ) : live.ricavo > 0 || live.fc > 0 ? (
                <>
                  <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: C.text, letterSpacing: "-0.03em", ...TNUM }}>{fmt(live.prezzoConsigliato)}</div>
                    <div style={{ fontSize: 12, color: C.textSoft, marginTop: 2 }}>prezzo minimo per {form.tipo === "pezzo" ? "pezzo" : "fetta/porzione"} · food cost al {targetPct}%</div>
                  </div>
                  {/* Messaggio: alzare se sotto, OK se sopra/in linea. MAI suggerire di scendere. */}
                  {/* Con degli ingredienti senza prezzo il minimo è sottostimato:
                      dire "stai guadagnando" sarebbe una rassicurazione falsa proprio
                      sul numero da cui parte il prezzo di vendita. */}
                  {!live.affidabile ? (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.amberLight, border: `1px solid ${C.amber}40`, fontSize: typo.small.fontSize, color: C.amber, fontWeight: 600, display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.5 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="warning" size={13} /></span>
                      <span>Questo minimo è più basso del vero, perché {live.mancanti.length === 1 ? "manca il prezzo di un ingrediente" : `mancano i prezzi di ${live.mancanti.length} ingredienti`}. Caricali e il numero diventa affidabile.</span>
                    </div>
                  ) : live.deltaPrezzo > 0.01 ? (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.amberLight, border: `1px solid ${C.amber}40`, fontSize: 12, color: C.amber, fontWeight: 600, lineHeight: 1.5 }}>
                      Il prezzo attuale ({fmt(form.prezzo)}) è sotto il minimo: per centrare il food cost al {targetPct}% serve alzare di <b>{fmt(live.deltaPrezzo)}</b>.
                    </div>
                  ) : Math.abs(live.deltaPrezzo) < 0.01 ? (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.greenLight, border: `1px solid ${C.green}40`, fontSize: 12, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="checkCircle" size={14} /> Il prezzo attuale è in linea col target del {targetPct}%.
                    </div>
                  ) : (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.greenLight, border: `1px solid ${C.green}40`, fontSize: 12, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="checkCircle" size={14} /> Sei sopra il minimo: stai guadagnando più del target del {targetPct}%.
                    </div>
                  )}
                  {/* Bottone "Imposta come prezzo" mostrato SOLO se il prezzo attuale è
                      SOTTO il minimo (alzare). Se sei già sopra, niente bottone:
                      non vogliamo nemmeno offrire l'opzione di abbassare. */}
                  {live.deltaPrezzo > 0.01 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, prezzo: live.prezzoConsigliato }))}
                      style={{ marginTop: 10, width: "100%", padding: isMobile ? "13px" : "9px", minHeight: isMobile ? 44 : 'auto', background: C.white, color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Icon name="check" size={14} /> Alza al minimo target
                    </button>
                  )}
                </>
              ) : (
                <div style={{ color: C.textSoft, fontSize: 12, textAlign: "center", padding: "8px 0" }}>Aggiungi ingredienti con prezzo per il calcolo</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Modal "Imposta prezzo ingrediente" - aperto dai badge "prezzo mancante" */}
    {priceModal && (
      <div role="dialog" aria-modal="true" aria-labelledby="prezzo-ing-titolo"
        onClick={(e) => { if (e.target === e.currentTarget && !priceModal.saving) setPriceModal(null); }}
        style={{ position: "fixed", inset: 0, background: "rgba(28,10,10,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: C.bgCard, borderRadius: R['2xl'], boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxWidth: 420, width: "100%", padding: isMobile ? 20 : 24 }}>
          <div id="prezzo-ing-titolo" style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: "-0.01em" }}>
            {priceModal.daAggiungere ? 'Aggiungila alle tue materie prime' : 'Imposta prezzo di questo ingrediente'}
          </div>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{formatNome(priceModal.nome)}</strong>{priceModal.daAggiungere
              ? ' non è ancora fra le tue materie prime.'
              : ' non ha ancora un prezzo nel tuo listino.'}
            {' '}Scrivi il prezzo <strong>al chilo</strong> (€/kg) e verrà usato in tutte le ricette.
          </div>
          <div style={fieldLabel}>Prezzo € / kg</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
            <input type="text" inputMode="decimal" value={priceModal.costoKg} autoFocus
              onChange={(e) => setPriceModal(m => m ? { ...m, costoKg: e.target.value } : m)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSavePrezzoIng(); if (e.key === "Escape") setPriceModal(null); }}
              placeholder="es. 8,50"
              aria-label="Prezzo al chilo in euro"
              style={{ ...inputBase, flex: 1, fontSize: 16, padding: "11px 12px" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textMid, whiteSpace: "nowrap" }}>€ / kg</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column-reverse" : "row", justifyContent: "flex-end" }}>
            <button onClick={() => setPriceModal(null)} disabled={priceModal.saving}
              style={{ padding: "10px 16px", minHeight: 42, background: "transparent", color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: priceModal.saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              Annulla
            </button>
            {/* La via d'uscita per chi il prezzo non ce l'ha sotto mano. Senza
                questa, il controllo sui nomi diventerebbe un muro: nessuno
                conosce a memoria il costo al chilo di tutto quello che ha in
                laboratorio, e restare fermi a metà ricetta è peggio di un
                ingrediente scritto storto. */}
            <button onClick={creaSenzaPrezzo} disabled={priceModal.saving}
              style={{ padding: "10px 16px", minHeight: 42, background: "transparent", color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: font.size.base, fontWeight: 600, cursor: priceModal.saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              Il prezzo lo metto dopo
            </button>
            <button onClick={handleSavePrezzoIng} disabled={priceModal.saving || !String(priceModal.costoKg || "").trim()}
              style={{ padding: "10px 16px", minHeight: 42, background: priceModal.saving ? "#CBD5E1" : C.red, color: C.white, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: priceModal.saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {priceModal.saving ? "Salvo…" : "Salva prezzo"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── ActionChip: chip compatto per la toolbar azioni secondarie in cima ──
// Le azioni "shortcut" (foto/modifica/elimina) usano queste chip: quando
// attivo il chip prende il colore dell'azione e mostra un chevron in giu';
// altrimenti resta neutro con icona colorata. Toggle open/close.
// ─── CommandBar: strip unica in cima a Nuova ricetta ────────────────────────
// Rimpiazza la vecchia toolbar-3-chip che espandeva pannelli verticali con
// tanto spazio vuoto. Design a singola strip: search inline delle ricette
// esistenti (sostituisce "Modifica esistente") + icon-buttons compatti
// (📷 foto, 🗑 elimina) con badge count + toggle "sovrascrivi da foto".
function CommandBar({ isMobile, ricetteEsistenti, activeNome, onPickExisting, activeAction, onToggleAction, forceOverwrite, setForceOverwrite, LEX }) {
  const [q, setQ] = useState('')
  const [showList, setShowList] = useState(false)
  const wrapRef = useRef(null)
  const hasEsistenti = ricetteEsistenti.length > 0

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowList(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return ricetteEsistenti.slice(0, 8)
    return ricetteEsistenti.filter(n => n.toLowerCase().includes(s)).slice(0, 8)
  }, [q, ricetteEsistenti])

  const IconBtn = ({ name, label, active, onClick, color, badge }) => (
    <button type="button" onClick={onClick} aria-pressed={!!active} aria-label={label} title={label}
      style={{
        position: 'relative',
        width: isMobile ? 42 : 40, height: isMobile ? 42 : 40,
        borderRadius: 10,
        background: active ? color : `${color}0F`,
        color: active ? '#FFF' : color,
        border: `1px solid ${active ? color : `${color}30`}`,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.15s ease',
        boxShadow: active ? `0 6px 14px ${color}30` : 'none',
      }}>
      <Icon name={name} size={17} />
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: -5, right: -5,
          minWidth: 18, height: 18, padding: '0 5px',
          background: '#FFF', color, border: `1px solid ${color}`,
          borderRadius: 9, fontSize: 12, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      )}
    </button>
  )

  return (
    <div ref={wrapRef} style={{ marginBottom: activeAction ? 12 : 22 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10,
        padding: isMobile ? '8px 10px' : '8px 12px',
        background: '#FFF',
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        boxShadow: '0 2px 12px rgba(15,23,42,0.04)',
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        {/* Search inline ricette esistenti */}
        <div style={{ flex: '1 1 240px', minWidth: 0, position: 'relative' }}>
          {/* Audit del 16/09/2026, agente PAGINE. Il campo di ricerca era alto
              **22px**: la cornice grigia ne misurava 40, ma il pezzo che
              reagisce al dito è l'`input`, e il resto era imbottitura. Sul
              telefono, per scrivere qui, bisognava centrare una striscia alta
              come due righe di testo. Adesso la cornice è alta 44 e il campo
              la riempie tutta (`alignSelf: stretch`): si tocca dove si vede. */}
          <div style={{
            display: 'flex', alignItems: 'stretch', gap: 8,
            minHeight: 44,
            padding: '0 12px',
            background: '#F8F7F5',
            border: `1px solid ${showList ? C.text : 'transparent'}`,
            borderRadius: 10, transition: 'border 0.15s ease',
          }}>
            <Icon name="search" size={15} color={C.textSoft} style={{ alignSelf: 'center' }} />
            <input
              type="text"
              value={q}
              onChange={e => { setQ(e.target.value); setShowList(true) }}
              onFocus={() => setShowList(true)}
              placeholder={hasEsistenti ? `Cerca fra ${ricetteEsistenti.length} ${LEX?.ricette || 'ricette'} esistenti…` : `Nessuna ${LEX?.ricetta || 'ricetta'} ancora — compila sotto`}
              disabled={!hasEsistenti}
              style={{
                flex: 1, minWidth: 0, minHeight: 44,
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: 13, color: C.text, fontFamily: 'inherit',
              }}
            />
            {activeNome && (
              <span style={{ alignSelf: 'center', fontSize: 12, fontWeight: 800, color: T.brand, background: `${T.brand}12`, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                in modifica
              </span>
            )}
          </div>
          {showList && hasEsistenti && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 100,
              background: '#FFF', border: `1px solid ${C.border}`,
              borderRadius: 10, boxShadow: '0 12px 32px rgba(15,23,42,0.10)',
              overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 14, fontSize: typo.small.fontSize, color: C.textSoft, textAlign: 'center' }}>Nessun risultato per "{q}"</div>
              ) : filtered.map(nome => (
                <button key={nome} type="button"
                  onMouseDown={e => { e.preventDefault(); onPickExisting(nome); setQ(''); setShowList(false) }}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left',
                    padding: '10px 14px', gap: 10, alignItems: 'center',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    borderBottom: `1px solid ${C.borderSoft || C.border}`,
                    fontSize: 13, color: C.text, fontFamily: 'inherit', fontWeight: 500,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8F7F5'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Icon name="edit" size={13} color={C.textSoft} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Toggle sovrascrivi (pillola)

            18/09/2026, il titolare sul suggerimento di prima («Le ricette
            esistenti vengono saltate»): «non si capisce cosa vuol dire, cambia
            la frase in meglio». Aveva ragione: «saltate» è la parola del
            programma, non quella di chi lavora, e soprattutto non diceva la
            cosa che interessa — che fine fa la ricetta che ho già scritto.
            Adesso le due frasi dicono la stessa cosa nei due casi opposti, con
            le stesse parole: esiste già una ricetta con quel nome, e o resta
            com'è o ci va quella della foto. */}
        <button type="button" onClick={() => setForceOverwrite(v => !v)}
          aria-pressed={forceOverwrite}
          title={forceOverwrite
            ? 'Acceso: se hai già una ricetta con lo stesso nome, quella della foto prende il suo posto e la vecchia si perde.'
            : 'Spento: se hai già una ricetta con lo stesso nome, resta com\'è. Dalla foto entrano solo le ricette nuove.'}
          style={{
            padding: isMobile ? '8px 12px' : '7px 12px',
            minHeight: isMobile ? 44 : 'auto',
            background: forceOverwrite ? '#FEF3C7' : '#F8F7F5',
            border: `1px solid ${forceOverwrite ? '#F59E0B' : C.border}`,
            borderRadius: R.full,
            fontSize: 12, fontWeight: 700,
            color: forceOverwrite ? '#92400E' : C.textSoft,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'background 0.15s ease',
          }}>
          <span style={{
            width: 8, height: 8, borderRadius: R.full,
            background: forceOverwrite ? '#F59E0B' : '#CBD5E1',
          }} />
          Sovrascrivi da foto
        </button>

        {/* Icon buttons: foto + elimina */}
        <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
          <IconBtn name="camera" label="Parti da una foto" color={T.brand} active={activeAction === 'foto'} onClick={() => onToggleAction('foto')} />
          {hasEsistenti && (
            <IconBtn name="trash" label="Elimina ricetta" color="#991B1B" active={activeAction === 'elimina'} onClick={() => onToggleAction('elimina')} badge={ricetteEsistenti.length} />
          )}
        </div>
      </div>
    </div>
  )
}

// ActionChip viveva qui: definito e mai usato, residuo del refactor della
// barra azioni (ora c'è CommandBar qui sopra). Trentanove righe di stili
// morti che facevano cercare il componente sbagliato.

// ─── RicettaPicker: pulsante che apre dropdown con ricerca interna ──────
// Pattern futuristic-elegant: pulsante con icona + label + caret. Click apre
// un floating panel con barra di ricerca in cima + lista scrollabile delle
// ricette filtrate. Click outside o ESC chiude. Selezione → onSelect + close.
function RicettaPicker({ label, icon, variant = 'primary', ricette, activeNome, onSelect, isMobile }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim()
    if (!s) return ricette
    return ricette.filter(n => n.toLowerCase().includes(s))
  }, [q, ricette])

  const isDelete = variant === 'danger'
  const accent = isDelete ? C.red : T.brand
  const accentLight = isDelete ? C.redLight : T.brandLight

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} type="button"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: isMobile ? '11px 16px' : '9px 16px',
          minHeight: isMobile ? 42 : 'auto',
          background: open ? accentLight : (isDelete ? 'transparent' : accent),
          color: open ? accent : (isDelete ? accent : '#FFF'),
          border: `1px solid ${isDelete ? `${accent}40` : accent}`,
          borderRadius: 10,
          fontSize: isMobile ? 13 : 12, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.01em',
          boxShadow: open ? 'none' : (isDelete ? 'none' : `0 6px 16px ${accent}28`),
          transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}`,
          whiteSpace: 'nowrap',
        }}>
        {icon}
        <span>{label}</span>
        {activeNome && !open && (
          <span style={{ marginLeft: 4, padding: '2px 8px', background: isDelete ? 'transparent' : 'rgba(255,255,255,0.18)', color: isDelete ? accent : '#FFF', borderRadius: 6, fontSize: 12, fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeNome}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          width: isMobile ? 280 : 340,
          maxWidth: 'calc(100vw - 32px)',
          background: '#FFF',
          border: `1px solid ${accent}30`,
          borderRadius: 12,
          boxShadow: '0 18px 48px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.04) inset',
          overflow: 'hidden',
          zIndex: 1000,
          animation: '_fos_ricdrop_in 180ms cubic-bezier(.32,.72,0,1)',
        }}>
          <style>{`
            @keyframes _fos_ricdrop_in {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {/* Accent bar futuristic in cima */}
          <div aria-hidden="true" style={{
            height: 2,
            background: isDelete
              ? `linear-gradient(90deg, ${C.red} 0%, #FFB350 50%, ${C.red} 100%)`
              : 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)',
          }}/>
          {/* Search bar */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ position: 'relative' }}>
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                placeholder="Cerca ricetta…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, color: C.text,
                  background: '#FAFAFA', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}/>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
          {/* Lista risultati */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: typo.small.fontSize, color: C.textSoft }}>
                Nessuna ricetta trovata
              </div>
            ) : filtered.map(n => {
              const active = activeNome === n
              return (
                <button key={n} onClick={() => { onSelect(n); setOpen(false); setQ('') }} type="button"
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '11px 14px',
                    background: active ? accentLight : 'transparent',
                    color: active ? accent : C.text,
                    border: 'none', borderLeft: active ? `3px solid ${accent}` : '3px solid transparent',
                    fontSize: 13, fontWeight: active ? 800 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: `background ${M.durFast} ${M.ease}`,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.bgSubtle || '#F5F1EE' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RicettaPickerDelete: dropdown delete con doppio check ───────────────
// Step 1: scegli ricetta dalla lista filtrata. Step 2: scrivi "ELIMINA"
// nell'input per confermare. Step 3: bottone Conferma elimina diventa attivo
// solo con la parola esatta.
function RicettaPickerDelete({ ricette, deleteConf, setDeleteConf, deletePin, setDeletePin, onConfirm, isMobile }) {
  const handleSelect = (nome) => {
    setDeleteConf(nome)
    setDeletePin('')
  }
  return (
    <>
      <RicettaPicker
        label="Elimina ricetta"
        icon={<Icon name="trash" size={14} />}
        variant="danger"
        ricette={ricette}
        activeNome={deleteConf || null}
        onSelect={handleSelect}
        isMobile={isMobile}
      />
      {/* Modal-like confirmation panel: appare sotto i bottoni quando una
          ricetta è stata scelta. Scrivi ELIMINA per attivare la conferma. */}
      {deleteConf && (
        <div style={{
          flexBasis: '100%', width: '100%',
          marginTop: 4,
          background: 'linear-gradient(180deg, #FFF5F5 0%, #FFE9E9 100%)',
          border: `1px solid ${C.red}35`,
          borderRadius: 12,
          padding: '14px 16px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 12px rgba(204,0,0,0.06)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.red} 0%, #FFB350 50%, ${C.red} 100%)`, opacity: 0.7 }}/>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={14} /> Stai per eliminare <b style={{ fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{deleteConf}</b>
          </div>
          <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 10, lineHeight: 1.5 }}>
            L'operazione è permanente. Scrivi <b style={{ color: C.red, letterSpacing: '0.05em' }}>ELIMINA</b> in maiuscolo per attivare il pulsante di conferma.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
            <input value={deletePin} onChange={e => setDeletePin(e.target.value)} placeholder="ELIMINA"
              autoFocus
              style={{
                flex: 1, minWidth: 140,
                padding: '11px 14px',
                borderRadius: 8,
                border: `2px solid ${deletePin === 'ELIMINA' ? C.red : '#E5C7C7'}`,
                fontSize: 16, fontWeight: 800,
                color: C.red, letterSpacing: '0.1em',
                textAlign: 'center',
                outline: 'none', background: '#FFF',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => onConfirm(deleteConf)} disabled={deletePin !== 'ELIMINA'}
                style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '11px 22px', minHeight: 44,
                  background: deletePin === 'ELIMINA' ? `linear-gradient(135deg, ${C.red} 0%, #8B0000 100%)` : '#E8DEDE',
                  color: deletePin === 'ELIMINA' ? '#FFF' : C.textSoft,
                  border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 800, letterSpacing: '0.02em',
                  cursor: deletePin === 'ELIMINA' ? 'pointer' : 'not-allowed',
                  boxShadow: deletePin === 'ELIMINA' ? `0 6px 16px ${C.red}40` : 'none',
                  transition: `background ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}`,
                }}>
                Conferma elimina
              </button>
              <button type="button" onClick={() => { setDeleteConf(null); setDeletePin('') }}
                style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '11px 18px', minHeight: 44,
                  background: 'transparent', color: C.textMid,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
