export const ALLERGENI = [
  { id: 'glutine',     label: 'Glutine',          emoji: '🌾' },
  { id: 'crostacei',  label: 'Crostacei',         emoji: '🦞' },
  { id: 'uova',       label: 'Uova',              emoji: '🥚' },
  { id: 'pesce',      label: 'Pesce',             emoji: '🐟' },
  { id: 'arachidi',   label: 'Arachidi',          emoji: '🥜' },
  { id: 'soia',       label: 'Soia',              emoji: '🫘' },
  { id: 'latte',      label: 'Latte',             emoji: '🥛' },
  { id: 'fruttasc',   label: 'Frutta a guscio',   emoji: '🌰' },
  { id: 'sedano',     label: 'Sedano',            emoji: '🥬' },
  { id: 'senape',     label: 'Senape',            emoji: '🌿' },
  { id: 'sesamo',     label: 'Sesamo',            emoji: '🌱' },
  { id: 'solfiti',    label: 'Solfiti',           emoji: '🍷' },
  { id: 'lupini',     label: 'Lupini',            emoji: '🫛' },
  { id: 'molluschi',  label: 'Molluschi',         emoji: '🦪' },
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
