// Lessico adattato al tipo di attività.
//
// PRINCIPIO: il modello dati resta GENERICO ("prodotto", "ricetta"). Qui cambiano
// SOLO le parole mostrate all'utente. Una gelateria vede "gusti", una pizzeria
// "pizze", un ristorante "piatti" — ma sotto è sempre lo stesso concetto e lo
// stesso codice. Questo evita di forkare la logica per categoria e funziona
// anche per gli ibridi (es. gelateria+pasticceria): basta scegliere la categoria
// principale, le parole non sbagliate restano comprensibili.
//
// Chiave = tipo_attivita normalizzato come lo salva AuthPage:
//   reg.tipo_attivita.toLowerCase().replace(' / ', '_').replace('/', '_')
// es. 'Bar / Caffè' -> 'bar_caffè', 'Pasticceria' -> 'pasticceria'.
//
// Solo poche categorie hanno davvero un vocabolario diverso; tutte le altre
// usano GENERICO (sotto). Aggiungere/togliere categorie = editare questa mappa,
// nessuna modifica al resto del codice.

// Vocabolario di default (pasticceria, panificio, cioccolateria, bar, generico…).
const GENERICO = {
  // singolare / plurale, minuscolo e con iniziale maiuscola
  prodotto: 'prodotto',
  prodotti: 'prodotti',
  Prodotto: 'Prodotto',
  Prodotti: 'Prodotti',
  // ricettario / ricetta
  ricetta: 'ricetta',
  ricette: 'ricette',
  Ricetta: 'Ricetta',
  Ricette: 'Ricette',
  Ricettario: 'Ricettario',
  // unità di vendita
  porzione: 'porzione',
  porzioni: 'porzioni',
  // azione di produrre
  Produzione: 'Produzione',
  nuovaRicetta: 'Nuova ricetta',
  // frase completa per gli empty-state (gestisce genere/accordo per categoria)
  nessunaRicetta: 'Nessuna ricetta caricata',
}

// Override per categoria: solo le parole che cambiano davvero.
const PER_CATEGORIA = {
  gelateria: {
    prodotto: 'gusto', prodotti: 'gusti', Prodotto: 'Gusto', Prodotti: 'Gusti',
    Ricettario: 'Ricettario gusti', nuovaRicetta: 'Nuovo gusto',
    porzione: 'coppetta', porzioni: 'coppette',
    nessunaRicetta: 'Nessun gusto caricato',
  },
  pizzeria: {
    prodotto: 'pizza', prodotti: 'pizze', Prodotto: 'Pizza', Prodotti: 'Pizze',
    ricetta: 'pizza', ricette: 'pizze', Ricetta: 'Pizza', Ricette: 'Pizze',
    Ricettario: 'Menù pizze', nuovaRicetta: 'Nuova pizza',
    porzione: 'pizza', porzioni: 'pizze',
    nessunaRicetta: 'Nessuna pizza caricata',
  },
  ristorante: {
    prodotto: 'piatto', prodotti: 'piatti', Prodotto: 'Piatto', Prodotti: 'Piatti',
    ricetta: 'piatto', ricette: 'piatti', Ricetta: 'Piatto', Ricette: 'Piatti',
    Ricettario: 'Menù', nuovaRicetta: 'Nuovo piatto',
    porzione: 'coperto', porzioni: 'coperti',
    nessunaRicetta: 'Nessun piatto caricato',
  },
  pasta_fresca: {
    prodotto: 'formato', prodotti: 'formati', Prodotto: 'Formato', Prodotti: 'Formati',
    Ricettario: 'Ricettario formati', nuovaRicetta: 'Nuovo formato',
    nessunaRicetta: 'Nessun formato caricato',
  },
}

/**
 * Restituisce il vocabolario per un tipo di attività, con fallback generico.
 * @param {string} tipoAttivita es. 'gelateria', 'bar_caffè', 'pasticceria'
 * @returns {object} dizionario di termini (sempre completo grazie al merge)
 */
export function lessico(tipoAttivita) {
  const key = String(tipoAttivita || '').toLowerCase().trim()
  return { ...GENERICO, ...(PER_CATEGORIA[key] || {}) }
}

// Comodo per la UI: true se la categoria ha un vocabolario dedicato.
export function haLessicoDedicato(tipoAttivita) {
  return !!PER_CATEGORIA[String(tipoAttivita || '').toLowerCase().trim()]
}
