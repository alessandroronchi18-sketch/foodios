// Chiavi storage di Foodos - costanti centralizzate per evitare typo.
// Sono passate a sload/ssave (vedi lib/storage.js) per salvare su user_data
// con la giusta granularità (per-sede vs shared, vedi isSharedKey in storage.js).

export const SK_RIC      = 'pasticceria-ricettario-v1'   // shared
export const SK_PROD     = 'pasticceria-produzione-v1'   // per-sede
export const SK_ACT      = 'pasticceria-actions-v1'      // shared
export const SK_AI       = 'pasticceria-ai-v1'           // shared
export const SK_MAG      = 'pasticceria-magazzino-v1'    // per-sede
export const SK_GIOR     = 'pasticceria-giornaliero-v1'  // per-sede
export const SK_CHIUS    = 'pasticceria-chiusure-v1'     // per-sede
export const SK_EXCL     = 'pasticceria-esclusi-v1'      // shared
export const SK_RESE     = 'pasticceria-rese-v1'         // shared (localStorage)
export const SK_LOG_PRZ  = 'pasticceria-log-prezzi-v1'   // shared (in SHARED_KEYS): audit prezzi unico per azienda
export const SK_LOGRIF   = 'pasticceria-logrif-v1'       // per-sede (il magazzino è per-sede)
export const SK_FORMATI  = 'pasticceria-formati-vendita-v1' // shared (formati di vendita generici)
// I materiali di confezionamento — cono, coppetta, cucchiaino, fazzoletto —
// con quanto costa ognuno. Si scrivono una volta sola e poi si SCELGONO nei
// formati, invece di riscriverli a mano ogni volta.
//
// 18/09/2026, il titolare: «c'è margine di errore se l'utente scrive coppettp
// o fazzolettp. e poi i costi per singola coppetta o singolo fazzoletto sono
// molto bassi». Aveva ragione due volte: un nome battuto storto crea un
// materiale nuovo che nessuno nota, e riscrivere «0,032» a ogni formato è il
// modo più facile per sbagliare uno zero.
export const SK_MATERIALI = 'pasticceria-materiali-confezionamento-v1' // shared
// Le categorie merceologiche dei fornitori: se le definisce il titolare una
// volta, e poi il campo Categoria dell'anagrafica propone quelle e non accetta
// altro.
//
// 19/09/2026, il titolare: «fai in modo che io possa sceglierle prima, e che
// poi compaiano come elenco fisso li' quando scrivo». Prima il campo era
// libero con dei suggerimenti: bastava battere «latticni» una volta per
// spaccare in due la barra della spesa per categoria, senza nessun errore.
// In quale negozio va la merce di una bolla, quando il documento non basta
// a dirlo. Due negozi della stessa societa' hanno lo stesso nome e la stessa
// partita IVA: si distinguono dal CODICE CLIENTE che il fornitore stampa su
// ogni documento (DESA, 19/09/2026: Berthollet 0001098521, De Gasperi
// 0001098522). Qui si tiene la risposta data una volta, per non richiederla.
export const SK_SEDI_BOLLE = 'pasticceria-sedi-da-bolla-v1' // shared

export const SK_CAT_FORN = 'pasticceria-categorie-fornitori-v1' // shared

export const SK_MOV      = 'pasticceria-movimenti-speciali-v1' // per-sede (sprechi e omaggi)
