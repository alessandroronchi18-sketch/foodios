// Il menu di Foodos, scritto una volta sola.
//
// ═══ Perché esiste questo file ═══════════════════════════════════════════
//
// Le voci del menu comparivano in otto elenchi diversi, tutti scritti a
// mano, tutti dentro Dashboard.jsx: la barra in alto del computer, la barra
// laterale, la barra in basso del telefono, l'elenco delle pagine del
// dipendente, la mappa «in che sezione sta questa pagina», la mappa «come si
// chiama questa pagina», la palette dei comandi e la schermata iniziale del
// dipendente.
//
// Otto elenchi che descrivono la stessa cosa divergono, e infatti l'audit
// del 15/09/2026 ha trovato che erano già divergenti:
//
//   • **La stessa etichetta apriva due pagine diverse.** «Produzione» in
//     alto guardava solo il metodo dell'organizzazione; di lato guardava
//     anche se la sede è di produzione. Nella stessa schermata, lo stesso
//     nome portava in due posti.
//   • «Trasferimenti tra sedi» compariva in alto con due sedi qualsiasi e di
//     lato solo con due sedi **attive**: con una sede archiviata la voce
//     c'era in un posto e non nell'altro.
//   • Due voci avevano icone diverse nelle due barre (Costi aziendali,
//     Forecast).
//   • Le mappe delle sezioni erano ferme ai gruppi aboliti il 30/07/2026:
//     citavano «Magazzino & Fornitori», «Azienda & Team» e «strumenti», che
//     non esistono più. La riga in cima alla pagina diceva quindi il nome di
//     una sezione sbagliata, e il gruppo della barra laterale non si apriva
//     da solo sulla pagina attiva.
//
// Qui l'elenco è **uno**. Le tre barre lo leggono, e le mappe si ricavano da
// lui: se una voce cambia nome, posto o condizione, cambia dappertutto
// insieme, perché c'è un posto solo dove cambiarla.
//
// Questo file contiene **solo dati**: nessun componente, nessuno stile. Chi
// disegna decide come. Così si può anche verificare con dei test, che è la
// cosa che mancava.

/**
 * Le condizioni che decidono cosa si vede.
 *
 * @typedef {Object} ContestoMenu
 * @property {boolean} metodoInventario  l'organizzazione lavora a inventario (gelateria)
 * @property {boolean} sedeDiProduzione  la sede aperta adesso è un laboratorio
 * @property {boolean} piuSedi           ha più di una sede **attiva**
 * @property {boolean} isDipendente      chi guarda è un dipendente
 * @property {string}  [vistaCorrente]   la pagina aperta, per non farla sparire da sotto i piedi
 * @property {Object}  [lex]             il vocabolario del tipo di attività (Ricettario → Menù…)
 * @property {Object}  [segnali]         pallini e numeri: { prodOggiMancante, cassaMancante, scorteCritiche, azioniAperte }
 */

/**
 * Le pagine che un dipendente può vedere. È un elenco chiuso: tutto quello
 * che non è qui dentro gli è precluso, sia nel menu sia nella navigazione.
 */
export const VISTE_DIPENDENTE = new Set([
  'home-dipendente', // Modalità Dipendente XL: landing 6 pulsantoni mobile-first.
  'giornaliero',     // Produzione - "caricare i prodotti" (solo oggi)
  'inventario-gusti',// Inventario differenziale per gelaterie/yogurt (alternativa a giornaliero)
  'chiusura',        // Cassa (solo oggi)
  'magazzino',       // Stock e rifornimenti
  'sprechi-omaggi',  // Operativo: sia titolare sia dipendente registrano
  // Decisione del titolare, 15/09/2026: è il dipendente che scarica il furgone
  // alla sede, quindi deve poter confermare cosa è arrivato. Ma **solo
  // ricevere**: non crea, non invia, non annulla — quello lo impediscono le
  // funzioni sul database (20260915f), non solo questa lista. E vede i
  // trasferimenti della SUA sede, non quelli delle altre.
  'trasferimenti',
  'calendario',      // solo oggi/futuro
  // `haccp` stava qui, ed era una voce morta: la pagina è in PAGINE_NASCOSTE
  // dal 09/09/2026 e non si apre per nessuno. Un dipendente la vedeva
  // elencata fra i suoi permessi e non ci sarebbe mai potuto entrare.
  'changelog',
  'impostazioni',    // solo il proprio account (nome, cambio password, 2FA) - vista role-aware
])

/**
 * Costruisce le sezioni del menu.
 *
 * @param {ContestoMenu} ctx
 * @returns {Array<{id:string,label:string,icona:string,headerView?:string,badge?:number,voci:Array}>}
 */
export function costruisciMenu(ctx = {}) {
  const {
    metodoInventario = false,
    sedeDiProduzione = false,
    piuSedi = false,
    isDipendente = false,
    vistaCorrente = null,
    lex = {},
    segnali = {},
  } = ctx
  const { prodOggiMancante = false, cassaMancante = false, scorteCritiche = 0, azioniAperte = 0 } = segnali

  // La pagina di produzione: a inventario (gelateria, in laboratorio) è la
  // registrazione per gusto, altrimenti è quella a stampi. La condizione sta
  // scritta QUI, una volta: è esattamente il punto in cui le due barre si
  // erano allontanate.
  const produzioneAInventario = (metodoInventario && sedeDiProduzione) || vistaCorrente === 'inventario-gusti'
  const vistaProduzione = produzioneAInventario ? 'inventario-gusti' : 'giornaliero'
  // Stessa cosa per la quadratura: esiste solo nel mondo a inventario.
  const mostraQuadratura = (metodoInventario && sedeDiProduzione) || vistaCorrente === 'quadratura-inventario'

  const sezioni = [
    // ─── 1. OGGI ────────────────────────────────────────────────────────
    // Quello che si fa ogni mattina. È il 92% delle aperture di Mara, e qui
    // **non cambia niente**: stessi nomi, stesso posto.
    { id: 'oggi', label: 'Oggi', icona: 'today', voci: [
      { id: vistaProduzione, label: 'Produzione', icona: 'cal', allarme: prodOggiMancante },
      { id: 'chiusura',   label: 'Cassa',      icona: 'creditCard', allarme: cassaMancante },
      { id: 'magazzino',  label: 'Magazzino',  icona: 'pkg', badge: scorteCritiche, allarme: scorteCritiche > 0 },
      { id: 'calendario', label: 'Calendario e ordinazioni', icona: 'cal', labelBreve: 'Calendario',
        sinonimi: ['eventi', 'ordinazioni', 'torte su ordinazione', 'prenotazioni'],
        schede: [
          { id: 'calendario', label: 'Calendario' },
          { id: 'eventi',     label: 'Ordinazioni e eventi' },
        ] },
    ] },

    // ─── 2. RICETTE E PREZZI ────────────────────────────────────────────
    // Quello che decidi una volta e poi usi tutti i giorni.
    { id: 'ricette', label: 'Ricette e prezzi', icona: 'chefHat', voci: [
      { id: 'ricettario', label: lex.Ricettario || 'Ricettario', icona: 'book',
        sinonimi: ['semilavorati', 'basi', 'nuova ricetta', 'nuovo gusto', 'ricette'],
        schede: [
          { id: 'ricettario',   label: lex.Prodotti || 'Prodotti' },
          { id: 'semilavorati', label: 'Semilavorati' },
        ] },
      { id: 'formati-vendita', label: 'Pezzature e prezzi', icona: 'coins',
        // «Formati di vendita» è una parola da gestionale: al banco si dice
        // vaschetta, coppetta, teglia.
        sinonimi: ['formati di vendita', 'formati', 'vaschette', 'listino'] },
      { id: 'simulatore', label: 'Costo dei prodotti', icona: 'barChart', labelBreve: 'Costo prodotti',
        sinonimi: ['food cost', 'foodcost', 'menu engineering', 'marginalità', 'quanto rende'],
        schede: [
          { id: 'simulatore',       label: 'Quanto costa' },
          { id: 'menu-engineering', label: 'Quali rendono' },
        ] },
    ] },

    // ─── 3. FORNITORI E SPESE ───────────────────────────────────────────
    // I soldi che escono. Quattro voci di menu stavano sopra le stesse
    // fatture: da pagare, chi te le manda, cosa ordinare.
    { id: 'acquisti', label: 'Fornitori e spese', icona: 'shopping', voci: [
      { id: 'scadenzario', label: 'Fatture e fornitori', icona: 'fileText', labelBreve: 'Fatture',
        sinonimi: ['scadenzario', 'fatture', 'fornitori', 'ordini', 'da pagare', 'scadenze'],
        schede: [
          { id: 'scadenzario', label: 'Da pagare' },
          { id: 'fornitori',   label: 'Fornitori' },
          { id: 'ordini-ai',   label: 'Cosa ordinare' },
        ] },
      { id: 'sprechi-omaggi', label: 'Sprechi e regali', icona: 'sparkles', labelBreve: 'Sprechi',
        // «Cessione» non si dice al banco.
        sinonimi: ['perdite', 'cessioni', 'omaggi', 'buttato', 'scarti'] },
    ] },

    // ─── 4. I CONTI ─────────────────────────────────────────────────────
    // Come sta andando.
    { id: 'numeri', label: 'I conti', icona: 'coins', voci: [
      { id: 'pl', label: 'Conto del mese', icona: 'trendUp', labelBreve: 'Il conto',
        // Accorpare P&L e Costi aziendali non è solo ordine: i costi fissi
        // stanno in una pagina che nessuno collega al conto, e per il primo
        // cliente quella tabella è **vuota** — il conto economico è per forza
        // sbagliato e non se ne accorge nessuno.
        sinonimi: ['p&l', 'pl', 'profitti', 'conto economico', 'costi aziendali', 'affitto', 'utenze'],
        schede: [
          { id: 'pl',              label: 'Il conto' },
          { id: 'costi-aziendali', label: 'Spese fisse' },
        ] },
      { id: 'storico', label: 'Storico', icona: 'activity',
        sinonimi: ['quadratura', 'inventario', 'torna il conto', 'storico produzione'],
        schede: [
          { id: 'storico', label: 'Produzione' },
          ...(mostraQuadratura ? [{ id: 'quadratura-inventario', label: 'Torna il conto?' }] : []),
        ] },
      { id: 'previsione', label: 'Quanto venderò', icona: 'forecast',
        sinonimi: ['previsione domanda', 'forecast', 'previsioni', 'quanto produco'] },
      { id: 'vendite-b2b', label: 'Vendite all\'ingrosso', icona: 'building', labelBreve: 'Vendite ingrosso',
        sinonimi: ['b2b', 'vendite b2b', 'clienti b2b', 'bar', 'ristoranti'] },
    ] },

    // ─── 5. IL NEGOZIO ──────────────────────────────────────────────────
    // Le persone e i muri.
    { id: 'team', label: 'Il negozio', icona: 'briefcase', voci: [
      { id: 'personale', label: 'Personale e stipendi', icona: 'users', labelBreve: 'Personale',
        sinonimi: ['dipendenti', 'turni', 'stipendi', 'paghe', 'orari'] },
      { id: 'registro-attivita', label: 'Chi ha fatto cosa', icona: 'fileText', labelBreve: 'Chi ha fatto',
        sinonimi: ['registro attività', 'log', 'modifiche', 'chi ha cambiato'] },
      ...(piuSedi ? [
        { id: 'confronto-sedi', label: 'Confronto tra negozi', icona: 'building', labelBreve: 'Confronto',
          sinonimi: ['confronto sedi', 'sedi', 'negozi'] },
        { id: 'trasferimenti',  label: 'Merce spostata tra negozi', icona: 'truck', labelBreve: 'Merce spostata',
          sinonimi: ['trasferimenti', 'trasferimenti tra sedi', 'spostamenti', 'furgone'] },
      ] : []),
      { id: 'recensioni', label: 'Rispondi alle recensioni', icona: 'sparkles', labelBreve: 'Recensioni',
        sinonimi: ['recensioni', 'google', 'tripadvisor'] },
    ] },
  ]

  // Il dipendente vede solo le sue pagine, e le sezioni che restano vuote
  // spariscono del tutto.
  return sezioni
    .map(s => ({ ...s, voci: s.voci.filter(v => !isDipendente || VISTE_DIPENDENTE.has(v.id)) }))
    .filter(s => s.voci.length > 0)
}

// ─── Le pagine in fondo, senza sezione ──────────────────────────────────────
//
// Non sono una sezione: stanno sotto una riga, come "Impostazioni" in ogni
// programma. Le si tiene qui perché anche loro hanno schede e sinonimi.
export function vociInFondo() {
  return [
    { id: 'ai-brain', label: 'Chiedi a Foodos', icona: 'sparkles', labelBreve: 'Chiedi',
      // Erano due chat separate, «Foodos Brain» e «Azioni consigliate», con
      // 5 e 3 aperture in tre mesi su tutti i clienti. Sono la stessa cosa
      // vista da due lati: una domanda e una lista di cose da fare.
      sinonimi: ['foodos brain', 'brain', 'assistente', 'ai', 'azioni consigliate', 'chat'],
      schede: [
        { id: 'ai-brain', label: 'Chiedi' },
        { id: 'azioni',   label: 'Cose da fare' },
      ] },
    { id: 'impostazioni', label: 'Impostazioni', icona: 'settings',
      sinonimi: ['importa dati', 'importa', 'carica excel', 'sedi', 'sicurezza', 'abbonamento', 'integrazioni'] },
    { id: 'changelog', label: 'Novità', icona: 'bell', sinonimi: ['novità', 'cosa è cambiato', 'aggiornamenti'] },
  ]
}

/** Le voci del menu in fila, senza le sezioni (comprese quelle in fondo). */
export function vociMenu(sezioni, conFondo = false) {
  const v = sezioni.flatMap(s => s.voci)
  return conFondo ? [...v, ...vociInFondo()] : v
}

// Tutte le pagine che una voce apre: se stessa, e le sue schede.
function pagineDi(voce) {
  const ids = new Set([voce.id])
  for (const t of voce.schede || []) ids.add(t.id)
  return [...ids]
}

/**
 * Mappa `pagina → id della sezione`, per aprire il gruppo giusto.
 * Le schede contano come la voce che le contiene: stando su «Spese fisse»,
 * la sezione aperta dev'essere quella di «Conto del mese».
 */
export function sezionePerVista(sezioni) {
  const m = {}
  for (const s of sezioni) for (const v of s.voci) for (const id of pagineDi(v)) m[id] = s.id
  return m
}

/** Mappa `pagina → nome della sezione`, per la riga sopra il titolo. */
export function gruppoPerVista(sezioni) {
  const m = {}
  for (const s of sezioni) for (const v of s.voci) for (const id of pagineDi(v)) m[id] = s.label
  return m
}

/**
 * Mappa `pagina → etichetta`. Per una scheda il nome è quello della scheda:
 * stando su «Spese fisse» il titolo dice «Spese fisse», non «Conto del mese».
 */
export function etichettaPerVista(sezioni) {
  const m = {}
  for (const s of [...sezioni, { label: '', voci: vociInFondo() }]) {
    for (const v of s.voci) {
      m[v.id] = v.label
      for (const t of v.schede || []) m[t.id] = t.label
    }
  }
  return m
}

/**
 * La voce di menu che contiene questa pagina, con le sue schede. Serve al
 * Dashboard per disegnare la striscia delle schede sopra la pagina.
 *
 * @returns {{voce: object, schede: Array, attiva: string}|null}
 */
export function schedeDiVista(vista, sezioni) {
  for (const s of [...sezioni, { voci: vociInFondo() }]) {
    for (const v of s.voci) {
      if (!v.schede || v.schede.length < 2) continue
      if (v.schede.some(t => t.id === vista)) {
        return { voce: v, schede: v.schede, attiva: vista }
      }
    }
  }
  return null
}

// Le pagine che esistono ma non stanno nel menu: ci si arriva da un bottone,
// da una notifica o dal profilo. Vanno dichiarate lo stesso, o la riga sopra
// il titolo resta vuota e la ricerca non le trova.
export const VISTE_FUORI_MENU = {
  home: { label: 'Dashboard', gruppo: '', labelBreve: 'Oggi' },
  'home-dipendente': { label: 'La tua giornata', gruppo: '' },
  // «Nuova ricetta» non è più una voce di menu: è il bottone grande in cima
  // al Ricettario. Era l'ottava pagina più aperta (63 volte), quindi il
  // bottone dev'essere il primo che si vede, non nascosto in un sottomenu.
  'nuova-ricetta': { label: 'Nuova ricetta', gruppo: 'Ricette e prezzi' },
  // «Importa dati» è entrata in Impostazioni (11 aperture), e resta
  // raggiungibile anche dal Magazzino e dai Primi passi.
  'importa-dati': { label: 'Porta dentro i dati', gruppo: 'Impostazioni' },
  integrazioni: { label: 'Collegamenti', gruppo: 'Impostazioni' },
  'scheda-allergeni': { label: 'Scheda allergeni', gruppo: 'Ricette e prezzi', labelBreve: 'Allergeni' },
  menu: { label: 'Menù', gruppo: 'Ricette e prezzi' },
  haccp: { label: 'HACCP', gruppo: 'Il negozio' },
  'inventario-gusti': { label: 'Produzione', gruppo: 'Oggi' },
  giornaliero: { label: 'Produzione', gruppo: 'Oggi' },
  'quadratura-inventario': { label: 'Torna il conto?', gruppo: 'I conti', labelBreve: 'Quadratura' },
  // ── Pagine tolte dal menu il 15/09/2026 ──────────────────────────────────
  //
  // Restano nel codice e raggiungibili, ma non si offrono più: sono pagine
  // che non possono funzionare, e una voce di menu che porta a una pagina
  // vuota è peggio di una voce che non c'è.
  //
  //   • Previsione 7 giorni  — `forecast_giornaliero` ha ZERO righe su tutto
  //     il database: si costruisce dal venduto per prodotto delle chiusure, e
  //     nessun cliente ha quel dettaglio. 2 aperture in tre mesi.
  //   • WhatsApp Bot         — il collegamento non è acceso. 1 apertura.
  //   • Documentary AI       — nessun dato per nessuno. 1 apertura.
  //   • Panoramica AI        — era l'indice di una sezione che non c'è più.
  //   • Marketplace          — non raggiungibile nemmeno prima.
  forecast: { label: 'Previsione 7 giorni', gruppo: 'I conti', ritirata: true },
  whatsapp: { label: 'WhatsApp', gruppo: '', ritirata: true },
  documentary: { label: 'Fotografia del mese', gruppo: '', ritirata: true },
  'ai-hub': { label: 'Panoramica assistente', gruppo: '', ritirata: true },
  marketplace: { label: 'Marketplace', gruppo: '', ritirata: true },
  reformulation: { label: 'Ottimizza ricette', gruppo: 'Ricette e prezzi', ritirata: true },
  'competitor-pricing': { label: 'Prezzi dei concorrenti', gruppo: 'I conti', ritirata: true },
  'ricette-ai': { label: 'Inventa ricette', gruppo: 'Ricette e prezzi', ritirata: true },
  cashflow: { label: 'Soldi in cassa nei prossimi giorni', gruppo: 'I conti', ritirata: true },
}

// ─── Dove si trova adesso una pagina che si è spostata ─────────────────────
//
// Per sessanta giorni dalla riorganizzazione, chi apre una pagina accorpata
// legge una riga che dice dov'è finita. Una volta per pagina, poi sparisce.
//
// Mara dei Boschi ci lavora tutti i giorni: cambiarle il menu senza dirglielo
// è il modo per farle perdere dieci minuti a cercare una cosa che sa fare a
// occhi chiusi.
export const DATA_RIORGANIZZAZIONE = '2026-09-15'
export const GIORNI_AVVISO_SPOSTAMENTO = 60

export const SPOSTAMENTI = {
  'nuova-ricetta':   'Adesso è il bottone «Nuova ricetta» in cima al Ricettario.',
  semilavorati:      'Adesso è una scheda del Ricettario.',
  eventi:            'Adesso è una scheda di «Calendario e ordinazioni».',
  'costi-aziendali': 'Adesso è la scheda «Spese fisse» dentro «Conto del mese».',
  pl:                'Adesso si chiama «Conto del mese», e contiene anche le spese fisse.',
  fornitori:         'Adesso è una scheda di «Fatture e fornitori».',
  scadenzario:       'Adesso si chiama «Fatture e fornitori» e contiene anche i fornitori.',
  'menu-engineering':'Adesso è la scheda «Quali rendono» dentro «Costo dei prodotti».',
  simulatore:        'Adesso si chiama «Costo dei prodotti».',
  'formati-vendita': 'Adesso si chiama «Pezzature e prezzi».',
  'quadratura-inventario': 'Adesso è una scheda dello Storico.',
  'sprechi-omaggi':  'Adesso si chiama «Sprechi e regali».',
  'vendite-b2b':     'Adesso si chiama «Vendite all\'ingrosso».',
  'registro-attivita': 'Adesso si chiama «Chi ha fatto cosa».',
  trasferimenti:     'Adesso si chiama «Merce spostata tra negozi».',
  'confronto-sedi':  'Adesso si chiama «Confronto tra negozi».',
  'importa-dati':    'Adesso si trova dentro Impostazioni.',
  'ordini-ai':       'Adesso è la scheda «Cosa ordinare» dentro «Fatture e fornitori».',
  azioni:            'Adesso è la scheda «Cose da fare» dentro «Chiedi a Foodos».',
  'ai-brain':        'Adesso si chiama «Chiedi a Foodos» e contiene anche le cose da fare.',
  previsione:        'Adesso si chiama «Quanto venderò».',
}

/**
 * La riga da mostrare in cima a una pagina che si è spostata, o null.
 * Passata la finestra dei sessanta giorni non compare più per nessuno.
 */
export function avvisoSpostamento(vista, oggi = new Date()) {
  const testo = SPOSTAMENTI[vista]
  if (!testo) return null
  const fine = new Date(DATA_RIORGANIZZAZIONE)
  fine.setDate(fine.getDate() + GIORNI_AVVISO_SPOSTAMENTO)
  if (oggi > fine) return null
  return testo
}

/**
 * Come si chiama una pagina e in che sezione sta, comunque ci si sia
 * arrivati. Prima queste due informazioni stavano in due mappe scritte a
 * mano che si erano scordate la riorganizzazione del 30/07/2026.
 */
export function descriviVista(vista, sezioni) {
  const etichette = etichettaPerVista(sezioni)
  const gruppi = gruppoPerVista(sezioni)
  const fuori = VISTE_FUORI_MENU[vista]
  return {
    label: etichette[vista] || fuori?.label || (typeof vista === 'string' ? vista : ''),
    gruppo: gruppi[vista] ?? fuori?.gruppo ?? '',
  }
}

/**
 * Il nome corto, per la barra stretta del telefono. Se non ce n'è uno
 * apposta si usa quello normale.
 *
 * Prima il telefono aveva una **sesta** copia dell'elenco, con nomi propri
 * che si erano allontanati da quelli del menu: la barra diceva «AI
 * Assistant» dove il menu diceva «Azioni consigliate», e «Forecast AI» dove
 * il menu diceva «Forecast vendite 7gg».
 */
export function etichettaBreve(vista, sezioni) {
  // Anche le voci in fondo (l'assistente, le impostazioni, le novità) e le
  // schede: la barra stretta del telefono le apre come tutte le altre.
  for (const s of [...sezioni, { voci: vociInFondo() }]) {
    for (const v of s.voci) {
      if (v.id === vista) return v.labelBreve || v.label
      for (const t of v.schede || []) if (t.id === vista) return t.label
    }
  }
  const fuori = VISTE_FUORI_MENU[vista]
  return fuori?.labelBreve || fuori?.label || null
}

/**
 * Le cinque voci della barra in basso del telefono. Le prime quattro sono le
 * cose che si *fanno* ogni giorno; la quinta apre tutto il resto.
 */
export function menuTelefono(sezioni) {
  const oggi = sezioni.find(s => s.id === 'oggi')
  // La barra in basso è larga un quinto di schermo per voce: si usa il nome
  // corto. «Calendario e ordinazioni» non ci sta, «Calendario» sì.
  const voci = (oggi?.voci || []).slice(0, 4).map(v => ({ ...v, label: v.labelBreve || v.label }))
  return [...voci, { id: '__altro', label: 'Altro', icona: 'menu' }]
}

/**
 * Cerca una pagina per nome, per nome vecchio o per una parola che ci
 * assomiglia.
 *
 * La ricerca guardava solo l'etichetta e l'identificativo. Dopo una
 * riorganizzazione che cambia dodici nomi, chi cerca «scadenzario» o «p&l» —
 * cioè come si chiamavano fino a ieri — non trovava più niente. I `sinonimi`
 * di ogni voce contengono apposta i nomi vecchi.
 *
 * @returns {Array} le voci che corrispondono, con `scheda` valorizzata
 *                  quando la corrispondenza è su una scheda interna.
 */
export function cercaVoci(query, sezioni, { conFondo = true } = {}) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return []
  const esiti = []
  const visti = new Set()
  for (const v of vociMenu(sezioni, conFondo)) {
    const campi = [v.label, v.id, v.labelBreve, ...(v.sinonimi || [])]
    if (campi.some(c => String(c || '').toLowerCase().includes(q))) {
      if (!visti.has(v.id)) { visti.add(v.id); esiti.push(v) }
      continue
    }
    // Una scheda che corrisponde apre direttamente quella scheda.
    for (const t of v.schede || []) {
      if (![t.label, t.id].some(c => String(c || '').toLowerCase().includes(q))) continue
      if (visti.has(t.id)) continue
      visti.add(t.id)
      esiti.push({ ...v, id: t.id, label: t.label, dentro: v.label })
      break
    }
  }
  return esiti
}
