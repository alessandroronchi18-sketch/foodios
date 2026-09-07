// Istruzioni per la lettura automatica dello scontrino di chiusura.
//
// Prima stavano scritte dentro ChiusuraView.jsx, in mezzo al componente React.
// Due problemi.
//
// 1. Per correggere una parola bisognava ricompilare il front-end.
//
// 2. Soprattutto: erano tarate su UN solo scontrino. Dicevano di estrarre
//    "SOLO i prodotti della categoria PASTICCERIA (la sezione che inizia con
//    '> N PASTICCERIA' e finisce alla prossima sezione '> N ALTRO')" e di
//    ignorare esplicitamente GELATO e BIBITE. Conseguenze: su una cassa che
//    stampa un formato diverso non estraeva niente, e per una GELATERIA non
//    estraeva niente per definizione, perché il gelato era escluso a priori.
//    Il design partner è una gelateria.
//
// Ora le categorie da leggere dipendono dal tipo di attività, e non si presume
// più un layout di scontrino particolare: si spiega cosa cercare, non dove
// trovarlo.

// Cosa vende chi, per dire all'AI su cosa concentrarsi. La chiave arriva da
// organizations.tipo (pasticceria, gelateria, bar, panificio...).
const CATEGORIE_PER_ATTIVITA = {
  gelateria:   'gelato, semifreddi, coni, coppette, vaschette, granite, torte gelato',
  pasticceria: 'pasticceria, torte, monoporzioni, biscotteria, lievitati',
  panificio:   'pane, focacce, pizza al taglio, lievitati, biscotteria',
  bar:         'caffetteria, pasticceria da colazione, tramezzini, bibite',
}
const CATEGORIE_DEFAULT = 'tutti i prodotti alimentari venduti'

/**
 * Istruzioni per l'estrazione, adattate all'attività.
 * @param {string} tipoAttivita  valore di organizations.tipo
 */
export function promptScontrino(tipoAttivita) {
  const tipo = String(tipoAttivita || '').toLowerCase().trim()
  const categorie = CATEGORIE_PER_ATTIVITA[tipo] || CATEGORIE_DEFAULT
  const chiSono = tipo ? `una ${tipo} italiana` : 'un locale alimentare italiano'

  return `Sei un lettore di scontrini di chiusura di ${chiSono}.

Estrai queste informazioni dallo scontrino fotografato.

1. DATA
   Cercala in qualsiasi formato (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "12 marzo 2026").
   Convertila sempre in formato ISO YYYY-MM-DD. Se non la trovi, metti null.

2. PRODOTTI VENDUTI
   Ti interessano i prodotti che questa attività produce e vende: ${categorie}.
   Includili tutti, indipendentemente da come lo scontrino li raggruppa: le casse
   italiane usano intestazioni di reparto molto diverse fra loro e non devi
   assumere un layout particolare.

   Per ogni riga prodotto estrai:
   - nome: esattamente come scritto sullo scontrino
   - qta: la quantità venduta (di solito il numero prima del nome)
   - totale: l'importo in euro della riga (di solito il numero a destra)
   - prezzoUnitario: totale diviso qta, con due decimali

   NON includere: righe di sconto, totali di reparto, totale generale, resto,
   contante, elettronico, intestazioni, numero scontrino, dati fiscali.

3. REGOLE CHE VERRANNO VERIFICATE
   - qta deve essere un numero maggiore di zero
   - totale deve essere un numero maggiore di zero, in euro con due decimali
   - prezzoUnitario = totale / qta
   - Se un prezzo NON è leggibile (sbiadito, tagliato, dubbio) NON inventarlo:
     metti quel prodotto in "incerti" con nome e qta, non in "prodotti".
     È molto meglio un prodotto dichiarato incerto che un numero sbagliato:
     questi dati finiscono nel conto economico di chi ci lavora.

Rispondi SOLO con JSON valido, senza markdown e senza testo aggiuntivo:
{"data":"YYYY-MM-DD o null","prodotti":[{"nome":"NOME","qta":numero,"totale":euro_numero,"prezzoUnitario":euro_numero}],"incerti":[{"nome":"NOME","qta":numero,"motivo":"prezzo non leggibile"}]}`
}

/** Categorie che verranno cercate, per spiegarlo all'utente prima della foto. */
export function categorieLette(tipoAttivita) {
  const tipo = String(tipoAttivita || '').toLowerCase().trim()
  return CATEGORIE_PER_ATTIVITA[tipo] || CATEGORIE_DEFAULT
}
