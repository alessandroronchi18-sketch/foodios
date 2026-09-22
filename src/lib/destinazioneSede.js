// In quale sede va la merce di questa bolla.
//
// ── Il difetto vero ──────────────────────────────────────────────────────
//
// Mara ha tre negozi — Carlina, Berthollet, De Gasperi — e una bolla sola
// per volta. Finora la merce entrava nella sede che per caso era attiva
// quando qualcuno premeva «Carica»: `ANALISI_PRODOTTO.md` racconta di fatture
// «finite tutte su Carlina perché era la sede attiva quando qualcuno ha
// premuto il tasto». Il danno non è la riga sbagliata: è che la giacenza di
// due negozi su tre smette di voler dire qualcosa, e il food cost con lei.
//
// Eppure la destinazione **è scritta sul documento**. Sulle 32 bolle vere
// lette il 22/09/2026 c'è un blocco «Destinazione merce» / «Destinazione» /
// «DESTINAZIONE DIVERSA», e dentro, testualmente:
//
//   CARLINA21 - MARA DEI BOSCHI, PIAZZA CARLO EMANUELE II, 21, 10123 TORINO
//   MARA DEI BOSCHI CIOCCOLATERIA, PZA CARLO EMANUELE II N.21, 10100 TORINO
//   CARLINA 21 SRL, VIA PALMIERI 29, 10138 TORINO   (e sotto: P.ZZA CARLINA)
//   MARAMA SRL, C: VIA BERTHOLLET, 30 H CAP. 10125 (TO)
//   MARAMA SRL, C: C.SO DE GASPERI, 20 (TO)
//   CARLINA 21 S.r.l., Corso Re Umberto, 2, 10121 TORINO
//   MARAMA S.R.L., CORSO DUCA DEGLI ABRUZZI, 6, 10128 TORINO
//
// Le ultime due sono **sedi legali**, non negozi: lì non scarica nessuno.
//
// ── Le regole, dette dal titolare il 22/09/2026 ──────────────────────────
//
//   «Carlina21 vuol dire nella sede Carlina»
//   «Marama vuol dire o Berthollet o De Gasperi»
//   «la cioccolateria è sempre Carlina ma è un altro business»
//
// La seconda è il motivo per cui questo file ha la forma che ha: quando sul
// documento c'è solo «MARAMA S.R.L.» e l'indirizzo è quello della sede
// legale, **la risposta giusta è non saperlo**. Due sedi su due sono
// possibili, e sceglierne una vuol dire sbagliare metà delle volte senza che
// nessuno se ne accorga mai. Qui si restituiscono le alternative e chi chiama
// chiede; la risposta si impara, così la si chiede una volta sola.
//
// ── Cosa non fa ──────────────────────────────────────────────────────────
//
// Non sceglie mai a caso, non ordina le sedi per «probabilità» e non usa
// `is_default` come ripiego: una sede di ripiego è esattamente il difetto da
// cui siamo partiti, solo scritto meglio.
//
// ── La forma delle sedi, verificata ──────────────────────────────────────
//
// `src/auth/useAuth.js` le legge con `supabase.from('sedi').select('*')`,
// quindi sono le colonne della tabella
// (`supabase/migrations/20260909_baseline_tabelle_core.sql`):
//
//     id, organization_id, nome (not null), indirizzo (NULLABLE),
//     citta (default 'Torino'), is_default, attiva, …
//
// **`indirizzo` può essere vuoto**, e nei dati veri spesso lo è: per questo
// l'aggancio per indirizzo qui non è l'unico, ma il primo di tre.

// ── Le abbreviazioni con cui si scrivono gli indirizzi ───────────────────
//
// Sono quelle lette sulle bolle vere, non un elenco generale: `c.so`, `p.zza`,
// `pza`, `v.le`. Il punto è che `PZA CARLO EMANUELE II N.21` e `Piazza Carlo
// Emanuele II, 21` sono lo stesso posto, e senza questa tabella sono due
// stringhe che non si somigliano per niente.
const ABBREVIAZIONI = [
  [/\bc\.?\s?so\b/g, 'corso'],
  [/\bp\.?\s?zz?a\b/g, 'piazza'],
  [/\bp\.?\s?za\b/g, 'piazza'],
  [/\bv\.?\s?le\b/g, 'viale'],
  [/\bl\.?\s?go\b/g, 'largo'],
  [/\bstr\.\s?/g, 'strada '],
  [/\bloc\.\s?/g, 'localita '],
]

// «S.R.L.» senza questa riga diventa tre parole da una lettera («s r l») che
// sporcano ogni chiave. Solo le forme **puntate**: quelle già compatte non
// hanno bisogno di niente, e una regola che le tocca lo stesso finisce per
// riscrivere parole normali che cominciano per esse.
const FORME = [
  [/\bs\.\s?r\.\s?l\.?(\s?s\.?)?/g, 'srl'],
  [/\bs\.\s?p\.\s?a\./g, 'spa'],
  [/\bs\.\s?n\.\s?c\./g, 'snc'],
  [/\bs\.\s?a\.\s?s\./g, 'sas'],
]

/** Le stesse parole, per toglierle dalla coda di una ragione sociale. */
const CODA_FORMA = /\s+(srl|spa|snc|sas|scarl|sc|ss|soc\s+coop|societa\s+cooperativa)$/

/**
 * Un indirizzo ridotto alla sua forma confrontabile.
 *
 * Minuscole, senza accenti, abbreviazioni sciolte, via il CAP (cinque cifre:
 * un numero civico non ne ha mai cinque), via il «N.» del civico, via la
 * punteggiatura, spazi collassati. Quello che resta è una fila di parole
 * separate da uno spazio: la forma su cui si può fare un confronto onesto.
 *
 * `30/H`, `30 H` e `30H` diventano tutti `30 h`. Sembra un dettaglio ed è la
 * differenza fra agganciare Berthollet e non agganciarlo: il civico con la
 * lettera lo scrivono in tre modi, e il campo `sedi.indirizzo` lo scrive nel
 * suo, che non è quello del fornitore.
 *
 * @param {string} testo
 * @returns {string} la chiave, o stringa vuota se non c'era niente da leggere
 */
export function chiaveIndirizzo(testo) {
  let t = String(testo ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [re, con] of FORME) t = t.replace(re, con)
  for (const [re, con] of ABBREVIAZIONI) t = t.replace(re, con)
  // Il CAP e la parola che lo annuncia: «CAP. 10125», «10123 TORINO».
  t = t.replace(/\bcap\.?\s*(?=\d{5}\b)/g, ' ').replace(/\b\d{5}\b/g, ' ')
  // Il civico annunciato: «N.21», «n. 21», «nr 3», «civico 6».
  t = t.replace(/\b(?:n|nr|no|num|numero|civico)\s*[.°:]?\s*(?=\d)/g, ' ')
  // Il civico con la lettera attaccata: «30/H», «30H», «16/B» → «30 h».
  t = t.replace(/(\d)\s*[/-]?\s*([a-z])(?![a-z])/g, '$1 $2')
  // Tutto il resto che non è lettera, cifra o spazio diventa spazio: la
  // punteggiatura degli indirizzi è ornamento, non informazione.
  t = t.replace(/[^a-z0-9]+/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

// Le parole con cui comincia un indirizzo italiano. Servono a ritagliare
// l'indirizzo dal resto del blocco «Destinazione», dove davanti c'è sempre la
// ragione sociale e dietro c'è quasi sempre la città.
const STRADE = 'via|viale|corso|piazza|piazzale|strada|largo|vicolo|borgo|localita|frazione'

// «corso duca degli abruzzi 6», «via berthollet 30 h»: dalla parola della
// strada fino al civico compreso, con l'eventuale lettera.
const RE_INDIRIZZO = new RegExp(`(?:^|\\s)((?:${STRADE})\\s+[a-z0-9 ]+?\\s+\\d{1,4}(?:\\s[a-z])?)(?=\\s|$)`)

/**
 * Solo la parte «strada + civico» di una chiave già normalizzata.
 *
 * Serve perché il blocco destinazione contiene anche la ragione sociale, il
 * CAP e la città, e perché il campo `sedi.indirizzo` a volte se li porta
 * dietro pure lui: confrontare i due testi interi non aggancerebbe mai
 * niente. Se non c'è nessuna strada riconoscibile torna `null` — non si
 * inventa un indirizzo da un testo che non ne ha uno.
 *
 * @param {string} chiave  una chiave già passata da `chiaveIndirizzo`
 * @returns {string|null}
 */
export function indirizzoDaChiave(chiave) {
  const m = String(chiave ?? '').match(RE_INDIRIZZO)
  return m ? m[1].trim() : null
}

/**
 * La ragione sociale scritta in testa al blocco destinazione.
 *
 * È la prima riga, tagliata al primo separatore (virgola o trattino
 * spaziato), senza la forma societaria in coda:
 *
 *   «CARLINA21 - MARA DEI BOSCHI, PIAZZA…»   → «carlina21»
 *   «MARAMA S.R.L., CORSO DUCA DEGLI…»       → «marama»
 *   «CARLINA 21 SRL, VIA PALMIERI 29»        → «carlina 21»
 *   «MARA DEI BOSCHI CIOCCOLATERIA, PZA…»    → «mara dei boschi cioccolateria»
 *
 * @param {string} testo
 * @returns {string|null}
 */
export function ragioneSocialeDa(testo) {
  const prima = String(testo ?? '').split(/[\n\r|]/)[0] || ''
  const tagliata = prima.split(/,| - | – | — /)[0] || ''
  const k = chiaveIndirizzo(tagliata).replace(CODA_FORMA, '').trim()
  return k.length >= 2 ? k : null
}

/**
 * La chiave con cui si ricorda una risposta già data: ragione sociale +
 * indirizzo normalizzato, come ha chiesto il titolare.
 *
 * Tiene insieme le due cose perché nessuna delle due basta da sola: la
 * ragione sociale «Marama» vale per due negozi, e l'indirizzo di una sede
 * legale non è un negozio.
 *
 * @param {string} testo
 * @returns {string} la chiave, o stringa vuota se non c'era niente da leggere
 */
export function chiaveRegola(testo) {
  const k = chiaveIndirizzo(testo)
  if (!k) return ''
  return `${ragioneSocialeDa(testo) || ''}|${indirizzoDaChiave(k) || k}`
}

/**
 * Una regola punta a una sede o a più d'una.
 *
 * Nasce da un difetto trovato dalle prove il 22/09/2026: le regole erano
 * «chiave → un id», e due sedi che dichiarano lo stesso indirizzo (o lo
 * stesso nome) si sovrascrivevano a vicenda. Vinceva l'ultima, in silenzio —
 * cioè esattamente la scelta a caso che questo file esiste per non fare. Una
 * regola che vale per due sedi adesso **resta** una regola per due sedi, e
 * chi chiama chiede.
 *
 * La forma con un id solo resta valida, così le regole scritte a mano nelle
 * impostazioni restano leggibili.
 */
const idsDi = (v) => (Array.isArray(v) ? v : [v]).filter(x => x != null && x !== '').map(String)

/**
 * Le regole di partenza, costruite **solo** con quello che le sedi dicono di
 * sé: il nome e, se c'è, l'indirizzo.
 *
 * Non ci sono ragioni sociali qui dentro, e non è una dimenticanza: quali
 * società consegnano in quali negozi è una cosa che sa il titolare, non la
 * tabella delle sedi. Restano vuote finché non è lui a dirlo — rispondendo a
 * una domanda (`imparaRegola`) o scrivendole nelle impostazioni.
 *
 * @param {Array<{id: string, nome: string, indirizzo?: string}>} sedi
 * @returns {{versione: number, alias: object, indirizzi: object,
 *            ragioniSociali: object, imparate: object}}
 *   un oggetto piatto, serializzabile in JSON, da salvare in `user_data`
 */
export function regoleDiPartenza(sedi = []) {
  const alias = {}
  const indirizzi = {}
  const aggiungi = (dove, chiave, id) => {
    if (!chiave) return
    dove[chiave] = dove[chiave] ? [...idsDi(dove[chiave]), id] : id
  }
  for (const s of Array.isArray(sedi) ? sedi : []) {
    if (!s || !s.id) continue
    const id = String(s.id)
    // Il nome della sede è il primo modo in cui compare sul documento:
    // «C.SO DE GASPERI» contiene «De Gasperi», «CARLINA21» contiene
    // «Carlina». Sotto i tre caratteri non si aggancia niente: un nome corto
    // si trova dentro troppe parole e aggancerebbe a caso.
    const nome = chiaveIndirizzo(s.nome)
    if (nome.length >= 3) aggiungi(alias, nome, id)
    // L'indirizzo, ridotto a «strada + civico», è l'aggancio che non mente:
    // due negozi non stanno allo stesso numero civico.
    aggiungi(indirizzi, indirizzoDaChiave(chiaveIndirizzo(s.indirizzo)), id)
  }
  return { versione: 1, alias, indirizzi, ragioniSociali: {}, imparate: {}, codici: {} }
}

/** La chiave `ago` compare nel testo come parola intera? */
function parolaDentro(testo, ago) {
  if (!ago) return false
  const esc = ago.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // «carlina» dentro «carlina21» vale (dopo viene una cifra, non una
  // lettera); dentro «scarlina» no.
  return new RegExp(`(^|[^a-z0-9])${esc}(?![a-z])`).test(testo)
}

/** La chiave `ago` compare nel testo come sequenza intera di parole? */
function fraseDentro(testo, ago) {
  if (!ago) return false
  return ` ${testo} `.includes(` ${ago} `)
}

const nomeDi = (sede) => String(sede?.nome ?? '').trim()

function esito(perId, ids, come, motivo) {
  const validi = [...new Set(ids.map(String))].filter(id => perId.has(id))
  if (validi.length === 1) {
    return { sedeId: validi[0], sedeNome: nomeDi(perId.get(validi[0])), come, sicura: true, alternative: [], motivo }
  }
  if (validi.length > 1) {
    return {
      sedeId: null, sedeNome: null, come, sicura: false,
      alternative: validi.map(id => ({ id, nome: nomeDi(perId.get(id)) })),
      motivo,
    }
  }
  return null
}

/**
 * In quale sede va questa merce.
 *
 * Prova tre agganci, dal più solido al più debole, e si ferma al primo che
 * risponde:
 *
 *   1. **l'indirizzo** — due negozi non stanno allo stesso civico;
 *   2. **il nome della sede** scritto nel testo («C.SO DE GASPERI»);
 *   3. **la ragione sociale** — l'unico che può restare ambiguo, perché
 *      «Marama» vuol dire due negozi.
 *
 * Prima di tutti e tre c'è la memoria: se a questa stessa destinazione il
 * titolare ha già risposto una volta, vale la sua risposta.
 *
 * @param {string} testoDestinazione  il blocco «Destinazione merce» della bolla
 * @param {Array<{id: string, nome: string, indirizzo?: string}>} sedi
 * @param {object} [regole]  le regole salvate; se mancano si usano quelle di partenza
 * @returns {{sedeId: string|null, sedeNome: string|null,
 *            come: 'indirizzo'|'ragione-sociale'|'alias'|null,
 *            sicura: boolean,
 *            alternative: Array<{id: string, nome: string}>,
 *            motivo: string}}
 *   `sicura: false` vuol dire **chiedi**: in `alternative` ci sono le sedi
 *   fra cui scegliere, e la risposta si passa a `imparaRegola`.
 */
export function sedeDaDestinazione(testoDestinazione, sedi = [], regole = null, extra = null) {
  const elenco = (Array.isArray(sedi) ? sedi : []).filter(s => s && s.id)
  const perId = new Map(elenco.map(s => [String(s.id), s]))
  const tutte = elenco.map(s => ({ id: String(s.id), nome: nomeDi(s) }))
  const daSedi = regoleDiPartenza(elenco)
  const r = regole && typeof regole === 'object' ? regole : daSedi
  const chiave = chiaveIndirizzo(testoDestinazione)

  const nonSo = (motivo) => ({ sedeId: null, sedeNome: null, come: null, sicura: false, alternative: tutte, motivo })
  // Una sede sola non è una scelta: è l'unica che c'è.
  const unicaSede = () => ({
    sedeId: String(elenco[0].id), sedeNome: nomeDi(elenco[0]), come: null,
    sicura: true, alternative: [], motivo: 'c’è una sede sola, la merce va lì',
  })

  if (!elenco.length) return nonSo('non ho l’elenco delle sedi, non posso dire dove va')

  // ── 0a. Il codice cliente del fornitore, se l'hai già assegnato ─────────
  //
  // Vale più di tutto il resto: due negozi della stessa società hanno lo
  // stesso nome e la stessa partita IVA — e sul nome non si distinguono —
  // ma il fornitore li tiene separati nel suo gestionale e stampa il codice
  // su ogni documento. DESA, 19/09/2026: Berthollet 0001098521, De Gasperi
  // 0001098522. Un numero non si scrive in venti modi e non si legge male.
  const cod = chiaveCodice(extra?.codiceCliente)
  const daCodice = cod ? r?.codici?.[cod] : null
  if (daCodice && perId.has(String(daCodice))) {
    return {
      sedeId: String(daCodice), sedeNome: nomeDi(perId.get(String(daCodice))), come: 'codice',
      sicura: true, alternative: [],
      motivo: `il codice cliente ${String(extra.codiceCliente).trim()} di questo fornitore è di questo negozio`,
    }
  }
  if (!chiave) {
    return elenco.length === 1 ? unicaSede() : nonSo('sul documento non c’è scritta nessuna destinazione')
  }

  // ── 0. La risposta già data ───────────────────────────────────────────
  //
  // Se il documento porta un codice cliente e quel codice non lo conosciamo,
  // la risposta imparata sul TESTO non vale: il codice è più preciso, e dice
  // che questo è un altro cliente. Fidarsi del testo qui vorrebbe dire
  // mandare la merce della Marama di De Gasperi a quella di Berthollet
  // perché il testo è identico.
  const ricordo = cod ? null : r?.imparate?.[chiaveRegola(testoDestinazione)]
  if (ricordo && perId.has(String(ricordo))) {
    return {
      sedeId: String(ricordo), sedeNome: nomeDi(perId.get(String(ricordo))), come: 'alias',
      sicura: true, alternative: [], motivo: 'questa destinazione l’hai già assegnata tu a questa sede',
    }
  }

  // ── 1. L'indirizzo ────────────────────────────────────────────────────
  //
  // Si guardano sia le regole salvate sia gli indirizzi scritti in anagrafica:
  // le regole possono essere vecchie, e una sede aggiunta ieri non ci sarebbe.
  const daIndirizzo = []
  for (const [ind, ids] of Object.entries({ ...daSedi.indirizzi, ...(r?.indirizzi || {}) })) {
    if (fraseDentro(chiave, ind)) daIndirizzo.push(...idsDi(ids))
  }
  const perIndirizzo = esito(perId, daIndirizzo, 'indirizzo', 'l’indirizzo scritto sulla bolla è quello di questa sede')
  if (perIndirizzo) {
    return perIndirizzo.sicura
      ? perIndirizzo
      : { ...perIndirizzo, motivo: 'l’indirizzo sulla bolla combacia con più di una sede: scegli tu' }
  }

  // ── 2. Il nome della sede dentro il testo ─────────────────────────────
  const daAlias = []
  for (const [a, ids] of Object.entries({ ...daSedi.alias, ...(r?.alias || {}) })) {
    if (parolaDentro(chiave, a)) daAlias.push(...idsDi(ids))
  }
  const perAlias = esito(perId, daAlias, 'alias', 'sulla bolla c’è scritto il nome di questa sede')
  if (perAlias) {
    return perAlias.sicura
      ? perAlias
      : { ...perAlias, motivo: 'sulla bolla compare il nome di più di una sede: scegli tu' }
  }

  // ── 3. La ragione sociale ─────────────────────────────────────────────
  //
  // È l'unico aggancio che può restare ambiguo, ed è il motivo del file:
  // «Marama vuol dire o Berthollet o De Gasperi» — quindi qui non si sceglie.
  const daRagione = []
  for (const [rs, ids] of Object.entries(r?.ragioniSociali || {})) {
    if (parolaDentro(chiave, rs)) daRagione.push(...idsDi(ids))
  }
  const perRagione = esito(perId, daRagione, 'ragione-sociale', 'la ragione sociale sulla bolla è di questa sede')
  if (perRagione) {
    if (perRagione.sicura) return perRagione
    const nomi = perRagione.alternative.map(a => a.nome).filter(Boolean).join(' o ')
    return {
      ...perRagione,
      motivo: `sulla bolla c’è solo la ragione sociale, e vale per ${perRagione.alternative.length} negozi${nomi ? ` (${nomi})` : ''}: dimmi tu quale`,
    }
  }

  if (elenco.length === 1) return unicaSede()
  return nonSo('la destinazione sulla bolla non corrisponde a nessuna sede: dimmi tu dove va')
}

/**
 * La risposta del titolare, messa via per la prossima volta.
 *
 * Si ricorda **la combinazione** ragione sociale + indirizzo, non la ragione
 * sociale da sola: «Marama in Corso Duca degli Abruzzi 6 è Berthollet» non
 * vuol dire che ogni Marama sia Berthollet, e generalizzare qui sarebbe
 * esattamente il modo di ricominciare a sbagliare in silenzio.
 *
 * Non tocca l'oggetto ricevuto: ne torna uno nuovo, pronto da salvare.
 *
 * @param {object} regole
 * @param {{testo: string, sedeId: string}} scelta
 * @returns {object} le regole nuove (le stesse, se non c'era niente da imparare)
 */
export function imparaRegola(regole, { testo, sedeId, codiceCliente } = {}) {
  const base = regole && typeof regole === 'object' ? regole : regoleDiPartenza([])
  const k = chiaveRegola(testo)
  const cod = chiaveCodice(codiceCliente)
  if (!sedeId || (!cod && (!k || k === '|'))) return base
  const fuori = {
    versione: base.versione || 1,
    alias: { ...(base.alias || {}) },
    indirizzi: { ...(base.indirizzi || {}) },
    ragioniSociali: { ...(base.ragioniSociali || {}) },
    imparate: { ...(base.imparate || {}) },
    codici: { ...(base.codici || {}) },
  }
  // Quando il documento porta il codice cliente, si impara **solo quello**.
  //
  // Sembra una rinuncia e invece è il punto di tutto: le due Marama hanno lo
  // stesso identico testo di destinazione, e imparare «questo testo = questo
  // negozio» vorrebbe dire scrivere una regola che il giorno dopo è falsa per
  // metà delle consegne. Il codice, invece, è diverso per i due negozi.
  if (!cod && k && k !== '|') fuori.imparate[k] = String(sedeId)
  // ── Il codice cliente del fornitore ─────────────────────────────────────
  //
  // È la cosa più preziosa che ci sia su questi documenti, e ce ne siamo
  // accorti solo guardandoli tutti insieme. Il 19/09/2026 DESA ha consegnato
  // tre bolle nello stesso quarto d'ora:
  //
  //     004615  09:29  MARAMA SRL   Via Berthollet 30 H   0001098521
  //     004616  09:31  MARAMA SRL   C.so De Gasperi       0001098522
  //     004617  09:32  CARLINA21    P.za Carlo Emanuele   0001093134
  //
  // Le due Marama hanno la **stessa ragione sociale e la stessa partita
  // IVA**: sul nome non si distinguono, ed è il problema che il titolare ha
  // posto il 22/09/2026 («marama è sia berthollet che de gasperi»). Ma il
  // fornitore le tiene separate nel suo gestionale, e stampa il codice su
  // ogni documento.
  //
  // Quindi il codice vale più del nome e più dell'indirizzo: non si scrive in
  // venti modi, non si legge male, e non cambia se il fattorino scrive la via
  // in un altro modo. Basta rispondere UNA volta per fornitore e negozio.
  if (cod) fuori.codici[cod] = String(sedeId)
  return fuori
}

/** Il codice cliente del fornitore, ridotto alla sua forma confrontabile. */
export function chiaveCodice(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s || !/\d/.test(s)) return ''
  // Gli zeri davanti sono riempimento del gestionale: «0001098521» e
  // «1098521» sono lo stesso cliente. Il resto si tiene com'è.
  return s.replace(/^0+(?=[0-9A-Z])/, '')
}
