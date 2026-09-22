// ── Quanto devo riordinare: UNA formula sola ────────────────────────────────
//
// Fino al 22/09/2026 in FoodOS c'erano DUE formule che rispondevano alla
// stessa domanda, e davano due numeri diversi per lo stesso ingrediente:
//
//   1. `MagazzinoView.jsx` (dentro un `.map`, non esportata, non provata):
//      copri 14 giorni fissi di consumo, o una volta e mezza la soglia, e
//      sottrai quello che hai già.
//   2. `OrdiniAiView.jsx`: copri la cadenza vera del fornitore più tre giorni
//      (o il tempo di consegna più una settimana), col 40% di margine, e non
//      guardare quello che hai già.
//
// Sulla farina di Mara — consumo 2 kg al giorno, soglia 10 kg, 10 kg in
// magazzino, fornitore che passa ogni 7 giorni — la prima diceva 18 kg e la
// seconda 28 kg. Due pagine dello stesso programma, lo stesso ingrediente,
// dieci chili di differenza: una delle due fa ordinare merce che resta ferma.
//
// Decisione del titolare (22/09/2026): se ne tiene UNA, quella basata su ogni
// quanto quel fornitore consegna DAVVERO, perché è misurata e non inventata.
// Questo file è quella formula, e la stessa serve tutte le pagine.
//
// Cosa si è tenuto di ciascuna:
//
//   • dalla 2 → i giorni da coprire vengono dalla cadenza vera del fornitore
//     (mediana degli intervalli fra le sue fatture), il margine del 40% e il
//     pavimento a due volte la soglia;
//   • dalla 1 → si SOTTRAE quello che c'è già in magazzino. Ordinare 28 kg
//     quando ne hai 10 sullo scaffale e il fornitore ripassa fra una
//     settimana vuol dire pagare 19 giorni di scorta a chi passa ogni 7.
//
// E due cose che nessuna delle due faceva:
//
//   • la giacenza NEGATIVA (errore di registrazione) non gonfia l'ordine. La
//     formula 1 faceva `target − (−500)` e ordinava mezzo chilo in più per un
//     errore di battitura;
//   • «non so quanto se ne consuma» e «se ne consuma zero» non sono la stessa
//     cosa. Se il consumo non si sa, `quantitaG` è `null` e la pagina lo deve
//     dire, invece di stampare un numero che nessuno ha calcolato.
//
// Tutto qui dentro è puro: niente React, niente rete, niente date di sistema.

/** Gli stati della scorta, gli stessi che la pagina Magazzino mostra da sempre. */
export const STATO = {
  NEGATIVO: 'negativo',
  MAI_CONTATO: 'mai_contato',
  ESAURITO: 'esaurito',
  CRITICO: 'critico',
  ATTENZIONE: 'attenzione',
  OK: 'ok',
}

/** Margine sopra il consumo previsto: il 40%. Viene dalla formula 2. */
export const MARGINE_SICUREZZA = 1.4
/** Giorni di margine sopra la cadenza del fornitore. */
export const GIORNI_MARGINE_CADENZA = 3
/** Sotto una settimana non si scende, anche se il fornitore passa ogni giorno. */
export const GIORNI_MINIMI_CON_CADENZA = 7
/** Giorni di margine sopra il tempo di consegna dichiarato. */
export const GIORNI_MARGINE_LEAD_TIME = 7
/** Quando non si sa niente del fornitore: due settimane. */
export const GIORNI_MINIMI_SENZA_CADENZA = 14
/** Tempo di consegna di riferimento quando il fornitore non l'ha dichiarato. */
export const LEAD_TIME_PREDEFINITO = 3
/** La scorta non scende sotto il doppio della soglia di riordino. */
export const FATTORE_SOGLIA = 2

/** Ordine di urgenza fra gli stati. Numero più basso = si guarda prima. */
export const PRIORITA_STATO = {
  [STATO.ESAURITO]: 0,     // a zero non si produce
  [STATO.NEGATIVO]: 1,     // di fatto non c'è niente, e la registrazione è sbagliata
  [STATO.CRITICO]: 2,
  [STATO.ATTENZIONE]: 3,
  [STATO.MAI_CONTATO]: 4,  // non si sa: va contato, non ordinato a occhio
  [STATO.OK]: 5,
}

// Un numero, o zero. Giacenza e soglia mancanti valevano 0 in tutte e due le
// formule vecchie: qui si conserva, per non cambiare il comportamento dei
// casi limite che già gestivano.
function numeroOZero(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Il consumo invece NO: qui «non lo so» deve restare «non lo so».
// Ritorna il numero (anche 0, che vuol dire «misurato, ed è zero») oppure
// `null` quando il dato manca. Un consumo negativo non esiste: è un dato
// sbagliato, e vale come mancante.
function consumoNoto(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

// Accetta sia il numero di giorni sia l'oggetto che ritorna `cadenzaConsegne`
// ({ giorni, campione, min, max }). Ritorna null se non è un numero di giorni.
function leggiGiorni(v) {
  const n = Number(v && typeof v === 'object' ? v.giorni : v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Arrotonda una quantità ai passi con cui si ordina davvero:
 * sotto il chilo a 100 g, sopra il chilo a mezzo chilo. Sempre per eccesso —
 * ordinare 1,2 kg di burro non si può, 1,5 sì.
 *
 * La regola non è nuova: è quella di `fmtRiordino` in `MagazzinoView.jsx`,
 * portata qui perché la usino tutte le pagine e il testo dell'ordine.
 */
export function arrotondaPassoPratico(grammi) {
  const g = Number(grammi)
  if (!Number.isFinite(g) || g <= 0) return 0
  if (g < 1000) return Math.ceil(g / 100) * 100
  return Math.ceil((g / 1000) * 2) / 2 * 1000
}

/**
 * Una quantità come si scrive in italiano: da un chilo in su in kg con un
 * decimale, sotto in grammi. Col punto delle migliaia, sempre dichiarato
 * (senza `useGrouping` esplicito alcuni runtime scrivono «1234 g»).
 * Non arrotonda ai passi pratici: serve a raccontare un numero, non a ordinarlo.
 */
export function scriviQuantita(grammi) {
  const g = numeroOZero(grammi)
  if (Math.abs(g) >= 1000) {
    return `${(g / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
  }
  return `${Math.round(g).toLocaleString('it-IT', { useGrouping: 'always' })} g`
}

/**
 * La quantità da ordinare, scritta come si ordina: arrotondata al passo
 * pratico e poi in kg o in g.
 * Ritorna `null` quando non c'è niente da ordinare (o non si sa quanto):
 * la colonna resta vuota invece di scrivere «0 g», che sembra una misura.
 */
export function fmtQuantita(grammi) {
  const g = Number(grammi)
  if (!Number.isFinite(g) || g <= 0) return null
  return scriviQuantita(arrotondaPassoPratico(g))
}

/**
 * Com'è messa la scorta di un ingrediente.
 *
 * @param {object} p
 * @param {number} p.giacenza            grammi in magazzino (può essere negativa)
 * @param {number} p.soglia              soglia di riordino in grammi (0 = non impostata)
 * @param {number|null} p.consumoGiornaliero grammi al giorno, `null` se non si sa
 * @param {boolean} p.inMagazzino        se l'ingrediente è mai stato inventariato
 * @returns {{stato: string, giorniScorta: number|null}}
 *
 * `giorniScorta` è `null` quando il consumo non si sa: «non lo so» e
 * «finisce oggi» sono due cose diverse, e scrivere 0 per la prima manda a
 * ordinare merce che non serve.
 *
 * `inMagazzino` vale `true` se non lo si passa: chi cicla sul magazzino ha
 * per forza la voce davanti. Solo la pagina Magazzino, che unisce ricettario
 * e magazzino, sa distinguere e passa `false`.
 */
export function statoScorta({ giacenza, soglia, consumoGiornaliero, inMagazzino = true } = {}) {
  const g = numeroOZero(giacenza)
  const s = numeroOZero(soglia)
  const cons = consumoNoto(consumoGiornaliero)
  const giorniScorta = cons !== null && cons > 0 ? g / cons : null

  // L'ordine dei rami è quello della pagina Magazzino, e ognuno è lì per un
  // difetto vero trovato sui dati di Mara:
  //   • la giacenza negativa non è uno stato di scorta, è un errore di
  //     registrazione: prima cadeva fino a 'ok', verde, e non la contava
  //     nessuno;
  //   • «mai contato» prima di «esaurito»: 40 ingredienti su 48 avevano
  //     giacenza 0 perché nessuno li aveva mai pesati, e la pagina li
  //     dichiarava ESAURITI in rosso. Un allarme sempre acceso non vuol dire
  //     niente e copre i tre che sono davvero finiti.
  const stato =
    g < 0 ? STATO.NEGATIVO :
    !inMagazzino ? STATO.MAI_CONTATO :
    g === 0 ? STATO.ESAURITO :
    s > 0 && g <= s ? STATO.CRITICO :
    giorniScorta !== null && giorniScorta < 3 ? STATO.CRITICO :
    giorniScorta !== null && giorniScorta < 7 ? STATO.ATTENZIONE :
    STATO.OK

  return { stato, giorniScorta }
}

/**
 * Quanti giorni deve coprire l'ordine, e perché quanti.
 * La cadenza vince sempre: è misurata sulle fatture di quel fornitore, il
 * tempo di consegna è dichiarato da lui e i 14 giorni sono un ripiego.
 */
function giorniDaCoprirePer(cadenzaGiorni, leadTimeGiorni) {
  const cadenza = leggiGiorni(cadenzaGiorni)
  const leadDichiarato = leggiGiorni(leadTimeGiorni)
  const lead = leadDichiarato ?? LEAD_TIME_PREDEFINITO
  if (cadenza) {
    return {
      giorni: Math.max(GIORNI_MINIMI_CON_CADENZA, cadenza + GIORNI_MARGINE_CADENZA),
      cadenza,
      leadDichiarato,
      lead,
    }
  }
  return {
    giorni: Math.max(GIORNI_MINIMI_SENZA_CADENZA, lead + GIORNI_MARGINE_LEAD_TIME),
    cadenza: null,
    leadDichiarato,
    lead,
  }
}

/**
 * Quanto ordinare di un ingrediente.
 *
 * @param {object} p
 * @param {number} p.giacenza            grammi in magazzino
 * @param {number} p.soglia              soglia di riordino in grammi
 * @param {number|null} p.consumoGiornaliero grammi al giorno, `null` se non si sa
 * @param {number|object|null} p.cadenzaGiorni ogni quanti giorni passa il fornitore
 *        (o l'oggetto di `cadenzaConsegne`)
 * @param {number|null} p.leadTimeGiorni tempo di consegna dichiarato dal fornitore
 * @returns {{quantitaG: number|null, giorniDaCoprire: number, perche: string}}
 *
 * `perche` è la frase che spiega il numero a chi lo legge: senza, un
 * suggerimento di 28 kg è solo un numero che l'utente non può controllare.
 */
export function quantoRiordinare({ giacenza, soglia, consumoGiornaliero, cadenzaGiorni, leadTimeGiorni } = {}) {
  const g = numeroOZero(giacenza)
  const s = Math.max(0, numeroOZero(soglia))
  const cons = consumoNoto(consumoGiornaliero)
  const { giorni: giorniDaCoprire, cadenza, leadDichiarato, lead } = giorniDaCoprirePer(cadenzaGiorni, leadTimeGiorni)

  if (cons === null) {
    // Nessun numero inventato. La pagina scriverà questa frase al posto della
    // quantità, e chi legge sa cosa deve fare per averla.
    return {
      quantitaG: null,
      giorniDaCoprire,
      perche: 'non so quanto se ne consuma: registra qualche giorno di produzione e te lo dico',
    }
  }

  const daConsumo = cons * giorniDaCoprire * MARGINE_SICUREZZA
  const daSoglia = s * FATTORE_SOGLIA
  const target = Math.max(daConsumo, daSoglia)
  // La giacenza negativa NON gonfia l'ordine: meno di zero non ce n'è, e un
  // errore di registrazione non è un motivo per comprare di più.
  const giacenzaUtile = Math.max(0, g)
  const quantitaG = Math.max(0, Math.round(target - giacenzaUtile))

  if (quantitaG === 0) {
    return { quantitaG, giorniDaCoprire, perche: `ne hai già abbastanza per ${giorniDaCoprire} giorni` }
  }

  const frase = daSoglia > daConsumo
    ? `la soglia di riordino è ${scriviQuantita(s)}: tengo la scorta al doppio`
    : cadenza
      ? `il fornitore passa ogni ${cadenza} giorni: copro ${giorniDaCoprire} giorni`
      : leadDichiarato
        ? `il fornitore consegna in ${lead} giorni: copro ${giorniDaCoprire} giorni`
        : `non so ogni quanto passa questo fornitore: copro ${giorniDaCoprire} giorni per prudenza`

  const perche = giacenzaUtile > 0
    ? `${frase}, meno ${scriviQuantita(giacenzaUtile)} che hai già`
    : frase

  return { quantitaG, giorniDaCoprire, perche }
}

/**
 * Le righe da riordinare, in ordine di urgenza vera.
 *
 * @param {Array<object>} righe ogni riga: { nome, giacenza, soglia,
 *        consumoGiornaliero, inMagazzino?, cadenzaGiorni?, leadTimeGiorni?,
 *        fornitore?, codice?, costoKg?, prezzoStimato?, minimoOrdine? }
 * @param {object} [opzioni]
 * @param {boolean} [opzioni.soloDaOrdinare=true] tiene solo quelle da ordinare adesso
 * @returns {Array<object>} le righe con dentro tutto il necessario per mostrarle
 *
 * L'ordine: prima quello che va ordinato oggi, poi lo stato (esaurito,
 * negativo, critico, attenzione, mai contato, ok), poi i giorni di scorta dal
 * più corto al più lungo — con chi non si sa IN FONDO, non in cima: «non lo
 * so» non è un'emergenza — poi il nome, così l'elenco è sempre lo stesso a
 * parità di tutto il resto.
 */
export function righeDaRiordinare(righe, opzioni = {}) {
  const { soloDaOrdinare = true } = opzioni
  const elenco = Array.isArray(righe) ? righe : []
  const out = []

  for (const riga of elenco) {
    if (!riga) continue
    const { stato, giorniScorta } = statoScorta(riga)
    const { quantitaG, giorniDaCoprire, perche } = quantoRiordinare(riga)

    const soglia = Math.max(0, numeroOZero(riga.soglia))
    const giacenza = numeroOZero(riga.giacenza)
    const sottoSoglia = soglia > 0 && giacenza <= soglia
    // La finestra oltre la quale non si arriva alla prossima consegna. Prima
    // qui c'era solo il tempo di consegna (3 giorni di riferimento): per un
    // fornitore che passa ogni 7 giorni voleva dire accorgersene quattro
    // giorni troppo tardi.
    const finestra = leggiGiorni(riga.cadenzaGiorni) ?? leggiGiorni(riga.leadTimeGiorni) ?? LEAD_TIME_PREDEFINITO
    const daOrdinare =
      // Mai contato non si ordina: non si sa se in cantina ce ne sono venti
      // chili. Si conta prima. (Resta nell'elenco con `soloDaOrdinare: false`.)
      stato === STATO.MAI_CONTATO ? false
        : stato === STATO.ESAURITO || stato === STATO.NEGATIVO || sottoSoglia
          || (giorniScorta !== null && giorniScorta <= finestra)

    // Il semaforo dello stato ragiona a 3 e 7 giorni: sono soglie tarate su un
    // fornitore che passa ogni settimana. Una riga può essere verde e andare
    // comunque ordinata oggi, se quel fornitore ripassa fra un mese — per
    // questo `daOrdinare` alza l'urgenza anche quando lo stato dice 'ok'.
    const urgenza =
      stato === STATO.ESAURITO || stato === STATO.NEGATIVO || stato === STATO.CRITICO ? 'alta' :
      stato === STATO.ATTENZIONE ? 'media' :
      daOrdinare ? 'media' : 'bassa'

    // Il costo è `null` quando il prezzo non si sa: zero vorrebbe dire
    // «gratis», e una stima d'ordine che somma degli zeri è una bugia.
    const costoKg = Number(riga.costoKg)
    const costoStimato = Number.isFinite(costoKg) && costoKg > 0 && quantitaG !== null
      ? (quantitaG / 1000) * costoKg
      : null

    if (soloDaOrdinare && !daOrdinare) continue

    out.push({
      ...riga,
      nome: riga.nome ?? '',
      stato,
      giorniScorta,
      daOrdinare,
      urgenza,
      quantitaG,
      quantitaTesto: fmtQuantita(quantitaG),
      giorniDaCoprire,
      perche,
      costoStimato,
    })
  }

  return out.sort((a, b) => {
    // Prima quello che va ordinato oggi. Un ingrediente può essere verde nel
    // semaforo (più di sette giorni di scorta) e servire comunque adesso,
    // perché quel fornitore ripassa fra trenta giorni: se finisce sotto le
    // righe già a posto, il motivo per cui la pagina esiste sparisce.
    if (a.daOrdinare !== b.daOrdinare) return a.daOrdinare ? -1 : 1
    const pa = PRIORITA_STATO[a.stato] ?? 9
    const pb = PRIORITA_STATO[b.stato] ?? 9
    if (pa !== pb) return pa - pb
    // Chi non si sa va in fondo: Infinity, non 0.
    const ga = a.giorniScorta === null ? Infinity : a.giorniScorta
    const gb = b.giorniScorta === null ? Infinity : b.giorniScorta
    if (ga !== gb) return ga - gb
    return String(a.nome).localeCompare(String(b.nome), 'it-IT')
  })
}
