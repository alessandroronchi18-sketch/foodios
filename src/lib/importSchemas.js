// Schemi target per import bulk cross-cliente.
//
// Scopo: descrivere in modo dichiarativo COSA il sistema si aspetta per ogni
// entita' che accetta bulk import. L'AI mapping (api/import-map.js) legge
// questi schemi per suggerire il mapping colonna-input -> field-target,
// la validation (api/import-validate.js) li usa per verificare tipi e vincoli,
// l'execute (api/import-execute.js) li usa per costruire l'INSERT.
//
// Riuso: stesso schema serve UI wizard cliente e CLI founder-assist. Un solo
// posto per estendere quando aggiungi entita' o cambi requisiti.
//
// Roadmap:
//   - v1 (ora): fornitori, dipendenti (tabelle SQL dirette, low-risk).
//   - v2: magazzino, ricettario, chiusure (JSON blob in user_data, richiedono
//     helper per costruire il payload prima dell'ssave).

/**
 * @typedef {Object} FieldSpec
 * @property {string} name        - Nome del field target (deve matchare colonna SQL o chiave JSON blob)
 * @property {'string'|'number'|'boolean'|'date'|'email'|'phone'} type
 * @property {boolean} required   - Se true, riga senza questo field va scartata
 * @property {string} hint        - Descrizione umana per l'AI mapping (Claude legge questo per capire cosa mappare)
 * @property {string[]} [aliases] - Nomi comuni che il cliente potrebbe usare per questa colonna (es. "Ragione Sociale" per nome fornitore). Aiuta il mapping deterministico prima di ricorrere all'AI.
 * @property {*} [default]        - Valore default se assente
 * @property {number} [minValue]  - Per type='number'
 * @property {number} [maxValue]  - Per type='number'
 */

/**
 * @typedef {Object} EntitySchema
 * @property {string} table        - Nome tabella Supabase (public schema)
 * @property {string} label        - Etichetta umana per UI/CLI
 * @property {string} description  - Descrizione + esempio (mostrato a Claude nel prompt)
 * @property {FieldSpec[]} fields  - Field target
 * @property {string[]} uniqueOn   - Nomi field che identificano un duplicato (per dedup / upsert)
 */

/** @type {Record<string, EntitySchema>} */
export const IMPORT_SCHEMAS = {
  fornitori: {
    table: 'fornitori',
    label: 'Fornitori',
    description: 'Anagrafica dei fornitori dell attivita (chi vende ingredienti/materie prime). Una riga per fornitore, non per fattura.',
    fields: [
      {
        name: 'nome',
        type: 'string',
        required: true,
        hint: 'Ragione sociale o nome del fornitore, es. "Molino Rossi SRL"',
        aliases: ['ragione sociale', 'fornitore', 'nome fornitore', 'denominazione', 'azienda', 'ditta', 'supplier'],
      },
      {
        name: 'contatto',
        type: 'string',
        required: false,
        hint: 'Nome della persona referente, es. "Mario Rossi"',
        aliases: ['referente', 'persona di contatto', 'referente commerciale', 'contact', 'agente'],
      },
      {
        name: 'email',
        type: 'email',
        required: false,
        hint: 'Email del fornitore, es. "info@molinorossi.it"',
        aliases: ['mail', 'e-mail', 'posta elettronica'],
      },
      {
        name: 'telefono',
        type: 'phone',
        required: false,
        hint: 'Numero di telefono, mobile o fisso',
        aliases: ['tel', 'cellulare', 'phone', 'numero', 'recapito telefonico'],
      },
      {
        name: 'note',
        type: 'string',
        required: false,
        hint: 'Note libere sul fornitore (categoria merceologica, condizioni pagamento, ecc.)',
        aliases: ['descrizione', 'annotazioni', 'commento'],
      },
    ],
    uniqueOn: ['nome'],
  },

  dipendenti: {
    table: 'dipendenti',
    label: 'Personale (dipendenti)',
    description: 'Anagrafica del personale con costo del lavoro. Una riga per persona attualmente in organico (o storicamente rilevante per costo del lavoro).',
    fields: [
      {
        name: 'nome',
        type: 'string',
        required: true,
        hint: 'Nome e cognome del dipendente, es. "Mario Rossi"',
        aliases: ['dipendente', 'nome completo', 'nominativo', 'persona', 'lavoratore', 'employee', 'nome e cognome'],
      },
      {
        name: 'ruolo',
        type: 'string',
        required: false,
        hint: 'Mansione, es. "Pasticcere", "Commesso banco", "Responsabile laboratorio"',
        aliases: ['mansione', 'qualifica', 'inquadramento', 'position', 'job title'],
      },
      {
        name: 'tipo_contratto',
        type: 'string',
        required: false,
        default: 'Full-time',
        hint: 'Tipologia contratto, tipicamente uno di: "Full-time", "Part-time", "Apprendistato", "Stagionale"',
        aliases: ['contratto', 'tipologia', 'tipo'],
      },
      {
        name: 'costo_orario',
        type: 'number',
        required: false,
        default: 0,
        minValue: 0,
        maxValue: 200,
        hint: 'Costo aziendale per ora lavorata in EUR (include contributi, tredicesima, TFR). Tipicamente 12-25 EUR/h.',
        aliases: ['costo ora', 'euro/ora', 'eur/h', 'tariffa oraria', 'paga oraria', 'costo azienda ora', 'ral oraria'],
      },
      {
        name: 'ore_settimana',
        type: 'number',
        required: false,
        default: 40,
        minValue: 0,
        maxValue: 60,
        hint: 'Ore settimanali contrattuali, tipicamente 40 per full-time, 20-30 per part-time',
        aliases: ['ore settimanali', 'ore contrattuali', 'ore/settimana', 'monte ore'],
      },
      {
        name: 'note',
        type: 'string',
        required: false,
        hint: 'Note libere (data assunzione, orari, aspettative, ecc.)',
        aliases: ['annotazioni', 'commento', 'descrizione'],
      },
      {
        name: 'attivo',
        type: 'boolean',
        required: false,
        default: true,
        hint: 'true = attualmente in servizio, false = cessato. Se non specificato assume true.',
        aliases: ['in servizio', 'attualmente', 'status', 'stato'],
      },
    ],
    uniqueOn: ['nome'],
  },
}

/**
 * Restituisce lo schema di un entity o null se non riconosciuto.
 * @param {string} entity
 * @returns {EntitySchema | null}
 */
export function getEntitySchema(entity) {
  return IMPORT_SCHEMAS[entity] || null
}

/**
 * Lista degli entity id supportati.
 * @returns {string[]}
 */
export function listEntities() {
  return Object.keys(IMPORT_SCHEMAS)
}
