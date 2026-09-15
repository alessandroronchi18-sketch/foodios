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
    { id: 'oggi', label: 'Oggi', icona: 'today', voci: [
      { id: vistaProduzione, label: 'Produzione', icona: 'cal', allarme: prodOggiMancante },
      { id: 'chiusura',   label: 'Cassa',      icona: 'creditCard', allarme: cassaMancante },
      { id: 'magazzino',  label: 'Magazzino',  icona: 'pkg', badge: scorteCritiche, allarme: scorteCritiche > 0 },
      { id: 'calendario', label: 'Calendario', icona: 'cal' },
    ] },
    { id: 'ricette', label: 'Ricette & Menù', icona: 'chefHat', voci: [
      { id: 'ricettario',       label: lex.Ricettario || 'Ricettario', icona: 'book' },
      { id: 'semilavorati',     label: 'Semilavorati',        icona: 'layers' },
      { id: 'nuova-ricetta',    label: lex.nuovaRicetta || 'Nuova ricetta', icona: 'pencil' },
      { id: 'formati-vendita',  label: 'Formati di vendita',  icona: 'coins' },
    ] },
    { id: 'acquisti', label: 'Acquisti & Fornitori', icona: 'shopping', voci: [
      { id: 'sprechi-omaggi', label: 'Perdite & cessioni',   icona: 'sparkles', labelBreve: 'Perdite' },
      { id: 'scadenzario',    label: 'Scadenzario fatture',  icona: 'fileText', labelBreve: 'Scadenzario' },
      { id: 'fornitori',      label: 'Fornitori',            icona: 'truck' },
      { id: 'importa-dati',   label: 'Importa dati',         icona: 'download' },
    ] },
    { id: 'numeri', label: 'Analisi & Numeri', icona: 'coins', voci: [
      { id: 'pl',              label: 'Profitti (P&L)',        icona: 'trendUp', labelBreve: 'Profitti' },
      { id: 'costi-aziendali', label: 'Costi aziendali',       icona: 'coins' },
      { id: 'storico',         label: 'Storico produzione',    icona: 'activity', labelBreve: 'Storico' },
      ...(mostraQuadratura ? [{ id: 'quadratura-inventario', label: 'Quadratura inventario', icona: 'check', labelBreve: 'Quadratura' }] : []),
      { id: 'simulatore',      label: 'Food Cost simulatore',  icona: 'barChart', labelBreve: 'Food Cost' },
      { id: 'previsione',      label: 'Previsione domanda',    icona: 'forecast', labelBreve: 'Previsione' },
    ] },
    { id: 'clienti', label: 'Vendite & Clienti', icona: 'users', voci: [
      { id: 'vendite-b2b', label: 'Vendite B2B', icona: 'building' },
      { id: 'eventi',      label: 'Eventi',      icona: 'cal' },
      { id: 'recensioni',  label: 'Recensioni',  icona: 'sparkles' },
    ] },
    { id: 'team', label: 'Sedi & Team', icona: 'briefcase', voci: [
      ...(piuSedi ? [
        { id: 'confronto-sedi', label: 'Confronto sedi',        icona: 'building' },
        { id: 'trasferimenti',  label: 'Trasferimenti tra sedi', icona: 'truck', labelBreve: 'Trasferimenti' },
      ] : []),
      { id: 'personale',         label: 'Personale & stipendi', icona: 'users', labelBreve: 'Personale' },
      { id: 'registro-attivita', label: 'Registro attività',    icona: 'fileText', labelBreve: 'Registro' },
    ] },
    { id: 'ai', label: 'AI', icona: 'sparkles', headerView: 'ai-hub', badge: azioniAperte, voci: [
      { id: 'ai-hub',           label: 'Panoramica AI',        icona: 'sparkles' },
      { id: 'ai-brain',         label: 'Foodos Brain (chat)',  icona: 'sparkles', badgeCatena: true, labelBreve: 'Foodos Brain' },
      { id: 'forecast',         label: 'Forecast vendite 7gg', icona: 'forecast', labelBreve: 'Forecast' },
      { id: 'cashflow',         label: 'Cashflow predittivo',  icona: 'trendUp', labelBreve: 'Cashflow' },
      { id: 'menu-engineering', label: 'Menu engineering',     icona: 'barChart', labelBreve: 'Menu eng.' },
      { id: 'ordini-ai',        label: 'Ordini AI consigliati', icona: 'truck', labelBreve: 'Ordini AI' },
      { id: 'whatsapp',         label: 'WhatsApp Bot',         icona: 'bell', badgeCatena: true },
      { id: 'documentary',      label: 'Documentary AI',       icona: 'barChart', badgeCatena: true },
      { id: 'azioni',           label: 'Azioni consigliate',   icona: 'sparkles', badge: azioniAperte, labelBreve: 'Azioni' },
    ] },
  ]

  // Il dipendente vede solo le sue pagine, e le sezioni che restano vuote
  // spariscono del tutto.
  return sezioni
    .map(s => ({ ...s, voci: s.voci.filter(v => !isDipendente || VISTE_DIPENDENTE.has(v.id)) }))
    .filter(s => s.voci.length > 0)
}

/** Le voci del menu in fila, senza le sezioni. */
export function vociMenu(sezioni) {
  return sezioni.flatMap(s => s.voci)
}

/** Mappa `pagina → id della sezione`, per aprire il gruppo giusto. */
export function sezionePerVista(sezioni) {
  const m = {}
  for (const s of sezioni) for (const v of s.voci) m[v.id] = s.id
  return m
}

/** Mappa `pagina → nome della sezione`, per la riga sopra il titolo. */
export function gruppoPerVista(sezioni) {
  const m = {}
  for (const s of sezioni) for (const v of s.voci) m[v.id] = s.label
  return m
}

/** Mappa `pagina → etichetta della voce`, come si chiama nel menu. */
export function etichettaPerVista(sezioni) {
  const m = {}
  for (const s of sezioni) for (const v of s.voci) m[v.id] = v.label
  return m
}

// Le pagine che esistono ma non stanno nel menu: ci si arriva da un bottone,
// da una notifica o dal profilo. Vanno dichiarate lo stesso, o la riga sopra
// il titolo resta vuota e la ricerca non le trova.
export const VISTE_FUORI_MENU = {
  home: { label: 'Dashboard', gruppo: '', labelBreve: 'Oggi' },
  'home-dipendente': { label: 'La tua giornata', gruppo: '' },
  impostazioni: { label: 'Impostazioni', gruppo: '' },
  changelog: { label: 'Novità', gruppo: '' },
  integrazioni: { label: 'Integrazioni', gruppo: 'Impostazioni' },
  'scheda-allergeni': { label: 'Scheda allergeni', gruppo: 'Ricette & Menù', labelBreve: 'Allergeni' },
  menu: { label: 'Menù', gruppo: 'Ricette & Menù' },
  haccp: { label: 'HACCP', gruppo: 'Sedi & Team' },
  'inventario-gusti': { label: 'Produzione', gruppo: 'Oggi' },
  giornaliero: { label: 'Produzione', gruppo: 'Oggi' },
  'quadratura-inventario': { label: 'Quadratura inventario', gruppo: 'Analisi & Numeri', labelBreve: 'Quadratura' },
  trasferimenti: { label: 'Trasferimenti tra sedi', gruppo: 'Sedi & Team' },
  'confronto-sedi': { label: 'Confronto sedi', gruppo: 'Sedi & Team' },
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
  for (const s of sezioni) {
    for (const v of s.voci) if (v.id === vista) return v.labelBreve || v.label
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
  const voci = (oggi?.voci || []).slice(0, 4)
  return [...voci, { id: '__altro', label: 'Altro', icona: 'menu' }]
}
