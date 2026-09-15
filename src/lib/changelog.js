export const CHANGELOG = [
  {
    versione: '2.0.0',
    data: '2026-09-15',
    titolo: 'Il menu è stato riordinato',
    // Non è una riga di changelog come le altre: è l'elenco di dove sono
    // finite le cose. Mara ci lavora tutti i giorni, e una pagina che non si
    // trova più costa dieci minuti ogni volta.
    spostamenti: [
      ['Nuovo gusto / Nuova ricetta', 'è il bottone in cima al Ricettario'],
      ['Semilavorati', 'è una scheda del Ricettario'],
      ['Eventi', 'è una scheda di «Calendario e ordinazioni»'],
      ['Costi aziendali', 'è la scheda «Spese fisse» dentro «Conto del mese»'],
      ['Profitti (P&L)', 'si chiama «Conto del mese», e contiene le spese fisse'],
      ['Fornitori', 'è una scheda di «Fatture e fornitori»'],
      ['Scadenzario fatture', 'si chiama «Fatture e fornitori»'],
      ['Ordini AI consigliati', 'è la scheda «Cosa ordinare» delle fatture'],
      ['Food Cost simulatore', 'si chiama «Costo dei prodotti»'],
      ['Menu engineering', 'è la scheda «Quali rendono» dei costi'],
      ['Formati di vendita', 'si chiama «Pezzature e prezzi»'],
      ['Quadratura inventario', 'è la scheda «Torna il conto?» dello Storico'],
      ['Perdite & cessioni', 'si chiama «Sprechi e regali»'],
      ['Vendite B2B', 'si chiama «Vendite all\'ingrosso»'],
      ['Previsione domanda', 'si chiama «Quanto venderò»'],
      ['Registro attività', 'si chiama «Chi ha fatto cosa»'],
      ['Trasferimenti tra sedi', 'si chiama «Merce spostata tra negozi»'],
      ['Confronto sedi', 'si chiama «Confronto tra negozi»'],
      ['Importa dati', 'si trova dentro Impostazioni'],
      ['Foodos Brain e Azioni consigliate', 'sono le due schede di «Chiedi a Foodos»'],
    ],
    novita: [
      'Le sezioni del menu passano da sette a cinque, ordinate per momento della giornata invece che per come è fatto il programma.',
      'Undici pagine che rispondevano alla stessa domanda sono diventate schede di una pagina sola. La più importante: le spese fisse (affitto, utenze) ora stanno dentro il conto del mese — prima erano in una pagina a parte che nessuno collegava, e il conto veniva sbagliato senza accorgersene.',
      'La ricerca nel menu trova anche i NOMI VECCHI: si può continuare a cercare «scadenzario», «p&l» o «food cost».',
      'Per due mesi, chi apre una pagina che si è spostata legge una riga che dice dov\'è finita.',
      'Nella sezione «Oggi» non è cambiato niente: produzione, cassa, magazzino e calendario sono dove erano, con lo stesso nome.',
    ],
    fix: [
      'Cinque voci portavano a pagine che non potevano funzionare (previsione a 7 giorni, WhatsApp, fotografia del mese, panoramica assistente, marketplace): sono uscite dal menu. Le pagine restano, ma non si offrono più finché non funzionano.',
    ],
  },
  {
    versione: '1.2.0',
    data: '2026-05-12',
    novita: [
      'Aggiunto Scadenzario fatture con import Excel',
      'Calendario operativo per tracking giornaliero',
      'Export PDF per ricette e P&L',
    ],
    fix: [
      'Risolto crash sezione Magazzino',
      'Fix pulsante logout su mobile',
    ],
  },
  {
    versione: '1.1.0',
    data: '2026-05-10',
    novita: [
      'Interfaccia completamente ridisegnata',
      'Supporto multi-sede',
      'Integrazione AI Assistant',
    ],
    fix: [],
  },
  {
    versione: '1.0.0',
    data: '2026-05-11',
    novita: ['Prima versione pubblica di Foodos'],
    fix: [],
  },
]
