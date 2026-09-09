export const ALLERGENI = [
  { id: 'glutine',     label: 'Glutine' },
  { id: 'crostacei',  label: 'Crostacei' },
  { id: 'uova',       label: 'Uova' },
  { id: 'pesce',      label: 'Pesce' },
  { id: 'arachidi',   label: 'Arachidi' },
  { id: 'soia',       label: 'Soia' },
  { id: 'latte',      label: 'Latte' },
  { id: 'fruttasc',   label: 'Frutta a guscio' },
  { id: 'sedano',     label: 'Sedano' },
  { id: 'senape',     label: 'Senape' },
  { id: 'sesamo',     label: 'Sesamo' },
  { id: 'solfiti',    label: 'Solfiti' },
  { id: 'lupini',     label: 'Lupini' },
  { id: 'molluschi',  label: 'Molluschi' },
]

export const ALLERGENE_COLORS = {
  glutine:   '#D97706',
  crostacei: '#DC2626',
  uova:      '#CA8A04',
  pesce:     '#2563EB',
  arachidi:  '#92400E',
  soia:      '#16A34A',
  latte:     '#6366F1',
  fruttasc:  '#B45309',
  sedano:    '#15803D',
  senape:    '#A16207',
  sesamo:    '#7C3AED',
  solfiti:   '#9F1239',
  lupini:    '#0369A1',
  molluschi: '#0E7490',
}

// Mapping ingrediente → allergeni UE. Le chiavi sono pattern case-insensitive
// che vengono cercati come sottostringa nel nome ingrediente normalizzato.
// Coprono italiano + inglese + plurali + alternative comuni in pasticceria/HoReCa.
export const ALLERGENI_MAPPING = {
  // ───── Glutine (cereali contenenti glutine) ─────
  'farina':           ['glutine'],
  'farina 00':        ['glutine'],
  'farina 0':         ['glutine'],
  'farina manitoba':  ['glutine'],
  'farina di grano':  ['glutine'],
  'farina integrale': ['glutine'],
  'farina di farro':  ['glutine'],
  'farina di segale': ['glutine'],
  'farina di orzo':   ['glutine'],
  'farina di avena':  ['glutine'],
  'farina di kamut':  ['glutine'],
  'farina di spelta': ['glutine'],
  'grano':            ['glutine'],
  'grano duro':       ['glutine'],
  'grano tenero':     ['glutine'],
  'frumento':         ['glutine'],
  'semola':           ['glutine'],
  'semolino':         ['glutine'],
  'farro':            ['glutine'],
  'segale':           ['glutine'],
  'orzo':             ['glutine'],
  'avena':            ['glutine'],
  'kamut':            ['glutine'],
  'spelta':           ['glutine'],
  'pane':             ['glutine'],
  'pangrattato':      ['glutine'],
  'pan grattato':     ['glutine'],
  'panettone':        ['glutine','uova','latte'],
  'pandoro':          ['glutine','uova','latte'],
  'pasta':            ['glutine'],
  'pasta sfoglia':    ['glutine','latte'],
  'pasta frolla':     ['glutine','uova','latte'],
  'pasta brisée':     ['glutine','latte'],
  'biscotti':         ['glutine'],
  'savoiardi':        ['glutine','uova'],
  'amaretti':         ['glutine','uova','fruttasc'],
  'wafer':            ['glutine'],
  'crackers':         ['glutine'],
  'grissini':         ['glutine'],
  'lievito madre':    ['glutine'],
  'malto':            ['glutine'],
  'sciroppo di malto':['glutine'],
  'estratto di malto':['glutine'],
  'cous cous':        ['glutine'],
  'couscous':         ['glutine'],
  'bulgur':           ['glutine'],
  'seitan':           ['glutine'],
  'birra':            ['glutine'],
  'flour':            ['glutine'],
  'wheat':            ['glutine'],
  'bread':            ['glutine'],

  // ───── Farine naturalmente SENZA glutine ─────
  // Mappate a [] di proposito: essendo più lunghe della chiave generica "farina",
  // vengono matchate per prime e "consumano" il range, impedendo il falso glutine.
  // (Es. "farina di riso" NON deve dichiarare glutine in una scheda allergeni.)
  'farina di riso':           [],
  'farina di mais':           [],
  'farina di cocco':          [],
  'farina di ceci':           [],
  'farina di grano saraceno': [],
  'grano saraceno':           [],
  'farina di quinoa':         [],
  'farina di tapioca':        [],

  // ───── Latte e derivati ─────
  'latte':            ['latte'],
  'latte intero':     ['latte'],
  'latte parzialmente scremato': ['latte'],
  'latte scremato':   ['latte'],
  'latte in polvere': ['latte'],
  'latte condensato': ['latte'],
  'latte di capra':   ['latte'],
  'latte di pecora':  ['latte'],
  'panna':            ['latte'],
  'panna fresca':     ['latte'],
  'panna da montare': ['latte'],
  'panna acida':      ['latte'],
  'panna liquida':    ['latte'],
  'crème fraîche':    ['latte'],
  'creme fraiche':    ['latte'],
  'burro':            ['latte'],
  'burro chiarificato':['latte'],
  'ghee':             ['latte'],
  'yogurt':           ['latte'],
  'yoghurt':          ['latte'],
  'yogurt greco':     ['latte'],
  'kefir':            ['latte'],
  'formaggio':        ['latte'],
  'formaggi':         ['latte'],
  'parmigiano':       ['latte'],
  'grana':            ['latte'],
  'pecorino':         ['latte'],
  'gorgonzola':       ['latte'],
  'mozzarella':       ['latte'],
  'ricotta':          ['latte'],
  'mascarpone':       ['latte'],
  'philadelphia':     ['latte'],
  'cream cheese':     ['latte'],
  'crema di formaggio':['latte'],
  'stracchino':       ['latte'],
  'taleggio':         ['latte'],
  'fontina':          ['latte'],
  'asiago':           ['latte'],
  'caciotta':         ['latte'],
  'caciocavallo':     ['latte'],
  'provola':          ['latte'],
  'scamorza':         ['latte'],
  'emmental':         ['latte'],
  'cheddar':          ['latte'],
  'brie':             ['latte'],
  'camembert':        ['latte'],
  'feta':             ['latte'],
  'caseina':          ['latte'],
  'caseinato':        ['latte'],
  'siero di latte':   ['latte'],
  'lattosio':         ['latte'],
  'whey':             ['latte'],
  'milk':             ['latte'],
  'butter':           ['latte'],
  'cream':            ['latte'],
  'cheese':           ['latte'],

  // ───── Uova ─────
  'uovo':             ['uova'],
  'uova':             ['uova'],
  'tuorlo':           ['uova'],
  'tuorli':           ['uova'],
  'albume':           ['uova'],
  'albumi':           ['uova'],
  'chiara':           ['uova'],
  'chiare':           ['uova'],
  'maionese':         ['uova'],
  'meringa':          ['uova'],
  'meringhe':         ['uova'],
  'pavesini':         ['uova','glutine','latte'],
  'egg':              ['uova'],
  'eggs':             ['uova'],
  'yolk':             ['uova'],
  'egg white':        ['uova'],

  // ───── Frutta a guscio ─────
  'mandorla':         ['fruttasc'],
  'mandorle':         ['fruttasc'],
  'farina di mandorle':['fruttasc'],
  'pasta di mandorle': ['fruttasc'],
  'nocciola':         ['fruttasc'],
  'nocciole':         ['fruttasc'],
  'farina di nocciole':['fruttasc'],
  'pasta di nocciole': ['fruttasc'],
  // Audit 2026-09-09: la chiave generica 'pasta' → glutine (riga 69) matcha
  // anche "pasta nocciola", "pasta pistacchio", "pasta mandorla": nel database
  // reale sono SEI ingredienti su sette che contengono la parola "pasta", e su
  // tutti usciva un glutine che non c'e'. Non si può togliere 'pasta', perché
  // "pasta fresca" e "pasta sfoglia" il glutine ce l'hanno: servono le chiavi
  // specifiche, che essendo più lunghe vincono il match e coprono il range.
  // Un falso positivo su un allergene non e' innocuo: il gelataio lo dichiara
  // per prudenza e perde i clienti celiaci su un gusto che potrebbero mangiare.
  'pasta nocciola':    ['fruttasc'],
  'pasta nocciole':    ['fruttasc'],
  'pasta mandorla':    ['fruttasc'],
  'pasta mandorle':    ['fruttasc'],
  'pasta pistacchio':  ['fruttasc'],
  // 'pasta di pistacchio' e' gia' piu' sotto nella mappa: non la ripetiamo.
  'pasta anacardi':    ['fruttasc'],
  'pasta di anacardi': ['fruttasc'],
  'pasta arachidi':    ['arachidi'],
  'pasta di arachidi': ['arachidi'],
  // Il gianduiotto e' nocciole e cacao per definizione; latte e soia sono
  // quasi sempre presenti ma non certi, quindi stanno fra i probabili.
  'pasta gianduiotto': ['fruttasc'],
  'pasta gianduia':    ['fruttasc'],
  // Lista VUOTA, e non è una dimenticanza: serve a coprire il match della
  // chiave generica 'pasta' senza dichiarare niente. detectAllergeni registra
  // il range coperto prima di leggere gli allergeni (righe 400-403), quindi una
  // chiave più specifica con lista vuota impedisce a 'pasta' di aggiungere il
  // glutine. Nel caramello non c'è glutine; il latte è probabile e sta nella
  // mappa dei probabili, dove va chiesto invece che dichiarato.
  'pasta caramello':   [],
  'gianduia':         ['fruttasc','latte'],
  'gianduja':         ['fruttasc','latte'],
  'noce':             ['fruttasc'],
  'noci':             ['fruttasc'],
  'noce pecan':       ['fruttasc'],
  'pecan':            ['fruttasc'],
  'noce di macadamia':['fruttasc'],
  'macadamia':        ['fruttasc'],
  'pistacchio':       ['fruttasc'],
  'pistacchi':        ['fruttasc'],
  'pasta di pistacchio':['fruttasc'],
  'anacardo':         ['fruttasc'],
  'anacardi':         ['fruttasc'],
  'cashew':           ['fruttasc'],
  'castagna':         ['fruttasc'],
  'castagne':         ['fruttasc'],
  'farina di castagne':['fruttasc'],
  // Marrone e castagna sono la stessa cosa: prima "castagne" dava frutta a
  // guscio e "marroni" non dava niente, quindi la stessa ricetta rispondeva in
  // due modi diversi a seconda della parola scritta. Allineati.
  //
  // NOTA APERTA per il titolare: l'allegato II del Reg. UE 1169/2011 elenca
  // come frutta a guscio solo mandorle, nocciole, noci, anacardi, pecan, noci
  // del Brasile, pistacchi e macadamia — la castagna NON c'è. Segnalarla è
  // quindi un falso positivo sul piano legale. Si è scelto di NON toglierla
  // perché ridurre un allergene dichiarato va nella direzione pericolosa e la
  // decisione non spetta al programma. Da confermare o rimuovere.
  'marrone':          ['fruttasc'],
  'marroni':          ['fruttasc'],
  'crema di marroni': ['fruttasc'],
  'pinolo':           ['fruttasc'],
  'pinoli':           ['fruttasc'],
  'noce del brasile': ['fruttasc'],
  'almond':           ['fruttasc'],
  'hazelnut':         ['fruttasc'],
  'walnut':           ['fruttasc'],
  'pistachio':        ['fruttasc'],

  // ───── Arachidi ─────
  'arachide':         ['arachidi'],
  'arachidi':         ['arachidi'],
  'burro di arachidi':['arachidi'],
  'olio di arachidi': ['arachidi'],
  'peanut':           ['arachidi'],

  // ───── Soia ─────
  'soia':             ['soia'],
  'salsa di soia':    ['soia','glutine'],
  'tofu':             ['soia'],
  'tempeh':           ['soia','glutine'],
  'edamame':          ['soia'],
  'lecitina di soia': ['soia'],
  'latte di soia':    ['soia'],
  'olio di soia':     ['soia'],
  'soy':              ['soia'],
  'soybean':          ['soia'],

  // ───── Sesamo ─────
  'sesamo':           ['sesamo'],
  'semi di sesamo':   ['sesamo'],
  'tahini':           ['sesamo'],
  'tahin':            ['sesamo'],
  'olio di sesamo':   ['sesamo'],
  'gomasio':          ['sesamo'],
  'sesame':           ['sesamo'],

  // ───── Senape ─────
  'senape':           ['senape'],
  'mostarda':         ['senape'],
  'semi di senape':   ['senape'],
  'mustard':          ['senape'],

  // ───── Sedano ─────
  'sedano':           ['sedano'],
  'sedano rapa':      ['sedano'],
  'celery':           ['sedano'],

  // ───── Solfiti ─────
  'vino':             ['solfiti'],
  'vino bianco':      ['solfiti'],
  'vino rosso':       ['solfiti'],
  'vino marsala':     ['solfiti'],
  'marsala':          ['solfiti'],
  'aceto':            ['solfiti'],
  'aceto balsamico':  ['solfiti'],
  'aceto di vino':    ['solfiti'],
  'frutta secca':     ['solfiti'],
  'uvetta':           ['solfiti'],
  'uva sultanina':    ['solfiti'],
  'uva passa':        ['solfiti'],
  'albicocche secche':['solfiti'],
  'fichi secchi':     ['solfiti'],
  'datteri':          ['solfiti'],
  'wine':             ['solfiti'],
  'vinegar':          ['solfiti'],

  // ───── Pesce ─────
  'pesce':            ['pesce'],
  'tonno':            ['pesce'],
  'salmone':          ['pesce'],
  'merluzzo':         ['pesce'],
  'baccalà':          ['pesce'],
  'baccala':          ['pesce'],
  'stoccafisso':      ['pesce'],
  'acciughe':         ['pesce'],
  'acciuga':          ['pesce'],
  'alici':            ['pesce'],
  'sarde':            ['pesce'],
  'sardine':          ['pesce'],
  'orata':            ['pesce'],
  'branzino':         ['pesce'],
  'spigola':          ['pesce'],
  'colatura':         ['pesce'],
  'colatura di alici':['pesce'],
  'fish':             ['pesce'],
  'salmon':           ['pesce'],
  'tuna':             ['pesce'],
  'anchovy':          ['pesce'],

  // ───── Crostacei ─────
  'gambero':          ['crostacei'],
  'gamberi':          ['crostacei'],
  'gambero rosso':    ['crostacei'],
  'gamberetto':       ['crostacei'],
  'gamberetti':       ['crostacei'],
  'scampo':           ['crostacei'],
  'scampi':           ['crostacei'],
  'aragosta':         ['crostacei'],
  'astice':           ['crostacei'],
  'granchio':         ['crostacei'],
  'mazzancolla':      ['crostacei'],
  'mazzancolle':      ['crostacei'],
  'cicala di mare':   ['crostacei'],
  'shrimp':           ['crostacei'],
  'lobster':          ['crostacei'],
  'crab':             ['crostacei'],

  // ───── Molluschi ─────
  'cozza':            ['molluschi'],
  'cozze':            ['molluschi'],
  'vongola':          ['molluschi'],
  'vongole':          ['molluschi'],
  'ostrica':          ['molluschi'],
  'ostriche':         ['molluschi'],
  'calamaro':         ['molluschi'],
  'calamari':         ['molluschi'],
  'totano':           ['molluschi'],
  'totani':           ['molluschi'],
  'seppia':           ['molluschi'],
  'seppie':           ['molluschi'],
  'polpo':            ['molluschi'],
  'moscardini':       ['molluschi'],
  'tellina':          ['molluschi'],
  'telline':          ['molluschi'],
  'fasolari':         ['molluschi'],
  'cannolicchi':      ['molluschi'],
  'lumaca':           ['molluschi'],
  'lumache':          ['molluschi'],
  'mussel':           ['molluschi'],
  'clam':             ['molluschi'],
  'oyster':           ['molluschi'],
  'squid':            ['molluschi'],
  'octopus':          ['molluschi'],

  // ───── Lupini ─────
  'lupino':           ['lupini'],
  'lupini':           ['lupini'],
  'farina di lupini': ['lupini'],
  'lupin':            ['lupini'],
}

function normalizeIngName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove accenti
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Rileva gli allergeni UE da una lista di ingredienti.
 * Match case-insensitive e parziale: una chiave matcha se è contenuta
 * nel nome ingrediente (normalizzato senza accenti/punteggiatura).
 * Si preferiscono match più lunghi: "farina di mandorle" → fruttasc, non glutine.
 *
 * @param {Array<{nome:string}|string>} ingredienti
 * @returns {string[]} array di id allergeni univoci (subset di ALLERGENI.id)
 */
export function detectAllergeniFromIngredienti(ingredienti) {
  if (!Array.isArray(ingredienti)) return []
  const found = new Set()
  // Ordina le chiavi del mapping per lunghezza decrescente: i match più specifici vincono.
  const keys = Object.keys(ALLERGENI_MAPPING).sort((a, b) => b.length - a.length)

  for (const ing of ingredienti) {
    const rawNome = typeof ing === 'string' ? ing : ing?.nome
    const nome = normalizeIngName(rawNome)
    if (!nome) continue

    // Raccoglie i match per questo ingrediente, evitando che chiavi più generiche
    // ("farina") aggiungano allergeni quando una chiave più specifica
    // ("farina di mandorle") ha già coperto la stessa porzione di stringa.
    let matchedRanges = []
    for (const key of keys) {
      const idx = nome.indexOf(key)
      if (idx === -1) continue
      const end = idx + key.length
      // Salta se questo range è interamente contenuto in un range già matchato.
      const overlaps = matchedRanges.some(r => idx >= r.start && end <= r.end)
      if (overlaps) continue
      matchedRanges.push({ start: idx, end })
      for (const aid of ALLERGENI_MAPPING[key]) found.add(aid)
    }
  }
  return [...found]
}

/**
 * Combina allergeni rilevati automaticamente con quelli aggiunti manualmente.
 * @param {string[]} detected - dal detect automatico
 * @param {string[]} manualExtra - aggiunti a mano dall'utente
 * @returns {string[]} unione univoca
 */
export function mergeAllergeni(detected, manualExtra) {
  return [...new Set([...(detected || []), ...(manualExtra || [])])]
}

// ─────────────────────────────────────────────────────────────────────────────
// TERZO STATO: "non lo so"
//
// Il difetto che questa parte esiste per correggere, misurato sui dati veri il
// 09/09/2026. `detectAllergeniFromIngredienti` restituisce un elenco piatto, e
// un elenco vuoto vuol dire due cose opposte:
//   - "ho riconosciuto tutti gli ingredienti e nessuno porta allergeni"
//   - "non ho riconosciuto niente"
// La scheda mostrava una casella vuota identica nei due casi. Su un documento
// previsto dal Regolamento UE 1169/2011, che si stampa e si consegna al
// cliente, "non l'ho riconosciuto" non può somigliare a "e' privo".
//
// Quanto pesa, sui 123 nomi di ingrediente realmente presenti nel database di
// produzione: 81 non producevano nessun allergene. E cinque prodotti da
// gelateria costruiti con quei nomi — "base bianca + cioccolato fondente",
// "cioccolato callebaut + acqua + zucchero + neutro", "copertura fondente +
// massa 58" — davano una riga di allergeni COMPLETAMENTE VUOTA. La base bianca
// contiene latte; nel cioccolato la lecitina di soia è la norma.
//
// Il buco a monte: nella mappa dei 275 pattern la parola "cioccolato" non
// c'era. Nemmeno "cacao", "fondente", "copertura", "massa".

/**
 * Ingredienti che di solito PORTANO un allergene, ma non con certezza:
 * dipende dalla ricetta del fornitore. Non si dichiarano come certi — si
 * segnalano da verificare sull'etichetta, che è l'unica risposta onesta.
 *
 * Il criterio per stare qui: il costo di segnalare un dubbio che non c'è è
 * far leggere un'etichetta; il costo di tacere un allergene e' un cliente in
 * ospedale. A parita' di incertezza si segnala.
 */
export const ALLERGENI_PROBABILI = {
  // Cioccolato e derivati del cacao: la lecitina di soia è l'emulsionante
  // standard, e quasi tutti gli stabilimenti lavorano anche latte e frutta a
  // guscio sulle stesse linee.
  // Audit 2026-09-09: "pasta caramello" e "pasta gianduiotto" prendevano il
  // glutine dalla chiave generica 'pasta' e nessun accenno al latte, che in
  // questi due c'e' quasi sempre. Il glutine ora non c'e' più (chiavi
  // specifiche nella mappa dei certi) e il latte sta qui, fra i probabili:
  // dipende dalla ricetta del produttore, e va chiesto con l'etichetta in mano.
  'caramello':           ['latte'],
  'pasta caramello':     ['latte'],
  'gianduiotto':         ['latte', 'soia'],
  'cioccolato':          ['soia', 'latte'],
  'cioccolata':          ['soia', 'latte'],
  'chocolate':           ['soia', 'latte'],
  'fondente':            ['soia'],
  'copertura':           ['soia'],
  'cacao':               ['soia'],
  'massa di cacao':      ['soia'],
  'burro di cacao':      ['soia'],
  'cioccolato bianco':   ['soia', 'latte'],
  'cioccolato al latte': ['soia', 'latte'],
  'gianduia':            ['soia', 'latte', 'fruttasc'],
  'praline':             ['fruttasc'],
  'pralinato':           ['fruttasc'],

  // Basi e semilavorati da gelateria: quasi sempre latte in polvere, spesso
  // derivati della soia come stabilizzanti.
  'base bianca':         ['latte'],
  'base gelato':         ['latte'],
  'base latte':          ['latte'],
  'base panna':          ['latte'],
  'neutro':              ['latte', 'soia'],
  'stabilizzante':       ['soia'],
  'emulsionante':        ['soia'],
  'lecitina':            ['soia'],

  // Lieviti chimici e per dolci: in Italia contengono spesso amido di frumento
  // come agente antiagglomerante.
  'lievito chimico':     ['glutine'],
  'lievito per dolci':   ['glutine'],
  'lievito vanigliato':  ['glutine'],
  'cremor tartaro':      ['glutine'],
  'baking powder':       ['glutine'],

  // Liquori e paste aromatiche da pasticceria.
  'amaretto':            ['fruttasc'],
  'marzapane':           ['fruttasc'],
  'marzipan':            ['fruttasc'],
  'torrone':             ['fruttasc'],
  'nougat':              ['fruttasc'],
  'croccante':           ['fruttasc'],

  // Preparati industriali generici: non si può sapere cosa c'è dentro.
  'preparato':           ['glutine', 'latte', 'soia'],
  'mix per':             ['glutine', 'latte', 'soia'],
  'aroma':               [],
  'colorante':           [],
}

/**
 * Ingredienti che si dichiarano PRIVI di allergeni con sicurezza.
 * Serve a non trasformare in "da verificare" l'acqua e lo zucchero: se ogni
 * ingrediente banale finisse fra i dubbi, l'avviso perderebbe ogni valore e si
 * imparerebbe a ignorarlo.
 */
const SENZA_ALLERGENI = new Set([
  'acqua', 'zucchero', 'zucchero di canna', 'zucchero canna', 'zucchero a velo',
  'sale', 'sale fino', 'sale grosso', 'bicarbonato', 'destrosio', 'glucosio',
  'sciroppo di glucosio', 'fruttosio', 'maltodestrine', 'inulina',
  'amido di mais', 'amido di riso', 'maizena', 'fecola di patate', 'fecola',
  'acido citrico', 'acido ascorbico', 'gelatina', 'agar', 'pectina',
  'olio di semi', 'olio di girasole', 'olio di oliva', 'olio evo',
  // Frutta e verdura fresca: non sono fra i 14 allergeni UE.
  'limone', 'limoni', 'arancia', 'arance', 'arancio', 'mandarino', 'pompelmo',
  'mela', 'mele', 'pera', 'pere', 'banana', 'banane', 'fragola', 'fragole',
  'mirtillo', 'mirtilli', 'lampone', 'lamponi', 'ciliegia', 'ciliegie',
  'albicocca', 'albicocche', 'pesca', 'pesche', 'ananas', 'kiwi', 'uva',
  'fico', 'fichi', 'melone', 'anguria', 'yuzu', 'lime', 'ribes', 'mora', 'more',
  'carota', 'carote', 'zucca', 'patata', 'patate', 'zucchina', 'zucchine',
  'menta', 'basilico', 'rosmarino', 'salvia', 'timo', 'zafferano', 'cannella',
  'vaniglia', 'baccello di vaniglia', 'cardamomo', 'chiodi di garofano',
  'noce moscata', 'zenzero', 'curcuma', 'pepe', 'caffe', 'te', 'the',
  'lievito di birra', 'lievito fresco', 'lievito madre',
  'cocco', 'cocco rape', 'farina di cocco',   // il cocco NON è fra i 14 UE
  'semi di papavero', 'semi papavero', 'papavero',
])

/**
 * Analisi completa degli allergeni di un elenco di ingredienti, nei TRE stati
 * che servono a una scheda che ha valore legale.
 *
 * @returns {{
 *   certi: string[],            allergeni presenti con certezza
 *   daVerificare: string[],     allergeni probabili, da controllare in etichetta
 *   nonRiconosciuti: string[],  nomi di ingrediente mai visti
 * }}
 */
export function analizzaAllergeni(ingredienti) {
  const certi = new Set()
  const daVerificare = new Set()
  const nonRiconosciuti = []
  if (!Array.isArray(ingredienti)) return { certi: [], daVerificare: [], nonRiconosciuti: [] }

  const chiaviCerte = Object.keys(ALLERGENI_MAPPING).sort((a, b) => b.length - a.length)
  const chiaviProbabili = Object.keys(ALLERGENI_PROBABILI).sort((a, b) => b.length - a.length)

  for (const ing of ingredienti) {
    const rawNome = typeof ing === 'string' ? ing : ing?.nome
    const nome = normalizeIngName(rawNome)
    if (!nome) continue

    let riconosciuto = false

    // 1. Allergeni certi. Stessa logica del rilevamento storico, compreso il
    //    controllo sulle sovrapposizioni che evita a "farina" di aggiungere il
    //    glutine quando "farina di mandorle" ha già coperto quel pezzo.
    const ranges = []
    for (const key of chiaviCerte) {
      const idx = nome.indexOf(key)
      if (idx === -1) continue
      const end = idx + key.length
      if (ranges.some(r => idx >= r.start && end <= r.end)) continue
      ranges.push({ start: idx, end })
      for (const aid of ALLERGENI_MAPPING[key]) certi.add(aid)
      riconosciuto = true
    }

    // 2. Allergeni probabili.
    for (const key of chiaviProbabili) {
      if (nome.indexOf(key) === -1) continue
      for (const aid of ALLERGENI_PROBABILI[key]) daVerificare.add(aid)
      riconosciuto = true
    }

    // 3. Dichiarato privo.
    if (!riconosciuto && SENZA_ALLERGENI.has(nome)) riconosciuto = true

    if (!riconosciuto) nonRiconosciuti.push(String(rawNome).trim())
  }

  // Un allergene certo non va anche fra i dubbi: la certezza vince.
  for (const a of certi) daVerificare.delete(a)

  return { certi: [...certi], daVerificare: [...daVerificare], nonRiconosciuti }
}
