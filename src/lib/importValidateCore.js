import { formatLocalDate } from './dateLocal'
import { eRigaDiTotale, avvisoRigheDiTotale } from './righeDiTotale'
// Core validation per import bulk. Modulo puro (no I/O, no auth):
// usato sia da /api/import-validate.js (Edge endpoint) sia da
// scripts/import-any.mjs (CLI Node).

// ── Coercion per tipo ──────────────────────────────────────────────────

export function coerceString(v) {
  if (v == null) return ''
  return String(v).trim()
}

export function coerceNumber(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // Solo testo: un oggetto o un elenco non sono un numero. `String([])` è la
  // stringa vuota, e `Number('')` è **zero**: una cella con dentro un elenco
  // vuoto diventava 0 ed entrava nel conto come un dato vero, non come un
  // dato mancante. Stessa cosa per una cella di soli spazi.
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (s === '') return null
  // Accetta "1.234,56" (formato IT) o "1234.56" o "12,50 €"
  s = s.replace(/€|EUR|eur/g, '').trim()
  if (s === '') return null
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // "1.234,56" -> "1234.56". Punti come separatore migliaia.
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    s = s.replace(',', '.')
  } else if (hasDot) {
    // Audit 2026-09-09: "1.500" senza virgola era letto come 1,5, cioè mille
    // volte meno. In italiano il punto raggruppa le migliaia a gruppi di tre
    // esatti: "1.500" e "1.234.567" sono migliaia, "1.5" e "12.75" sono
    // decimali. Distinguiamo sulla forma, che e' l'unico segnale disponibile.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function coerceBoolean(v) {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (['true', 'vero', 'si', 'sì', 'yes', 'y', '1', 'attivo', 'in servizio'].includes(s)) return true
  if (['false', 'falso', 'no', 'n', '0', 'inattivo', 'cessato'].includes(s)) return false
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(s) { return EMAIL_RE.test(s) }

// Telefono IT: accetta cifre, spazi, + iniziale, / -. Almeno 6 cifre.
export function isValidPhone(s) {
  const digits = String(s).replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 16
}

// ── Una data che sul calendario non esiste ─────────────────────────────
//
// «31/02/2026» passava di qui e usciva "2026-02-31": febbraio non ha 31
// giorni. Il controllo era solo sulla FORMA (due cifre, barra, quattro cifre),
// mai sul calendario. Così la riga risultava buona nell'anteprima, l'utente
// dava l'ok, e il database la rifiutava a meta' caricamento — con meta' file
// già dentro e nessun modo di sapere quale riga fosse. Stessa cosa per
// «45/13/2026» e per un "2026-02-31" già scritto in ISO.
//
// Il 29 febbraio va distinto bene: 2024 esiste, 2026 no. Per questo si
// costruisce la data e si controlla che torni indietro uguale, invece di
// contare i giorni del mese a mano.
function giornoCheEsiste(anno, mese, giorno) {
  const a = Number(anno), m = Number(mese), g = Number(giorno)
  if (!Number.isInteger(a) || !Number.isInteger(m) || !Number.isInteger(g)) return false
  if (m < 1 || m > 12 || g < 1 || g > 31) return false
  // A mezzogiorno UTC: nessun fuso orario puo' farla scivolare di un giorno.
  const d = new Date(Date.UTC(a, m - 1, g, 12))
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g
}

// Date ISO YYYY-MM-DD (Excel spesso arriva già così). Accetta anche
// "DD/MM/YYYY" e converte.
export function coerceDate(v) {
  if (v == null || v === '') return null
  // Audit 2026-09-09: qui c'era `toISOString().slice(0,10)`. xlsx costruisce le
  // Date nel fuso LOCALE, e toISOString le converte in UTC: in Italia (UTC+1/+2)
  // il 1 maggio a mezzanotte diventava "2026-04-30". Tutte le date dell'import
  // slittavano di un giorno, e con esse la produzione di ogni giornata.
  // formatLocalDate legge giorno, mese e anno locali senza passare per UTC.
  if (v instanceof Date && !isNaN(v)) return formatLocalDate(v)
  // Numero seriale Excel. Audit 2026-09-09: una colonna formattata come data in
  // Excel arriva come numero (46143) se il file non e' stato letto con
  // cellDates. Prima cadeva nel `return null` finale, quindi TUTTE le righe
  // risultavano invalide, la schermata diceva "Pronte da caricare 0" e il
  // consiglio era "serve GG/MM/AAAA" mentre nel foglio l'utente VEDE
  // 01/05/2026: un vicolo cieco senza via d'uscita.
  // L'epoca e' 1899-12-30 perché Excel considera il 1900 bisestile (non lo e'):
  // partendo da quella data i seriali >= 61 tornano giusti senza correzioni.
  // Limiti: 1 = 1899-12-31, 200000 ~ anno 2447. Fuori da li' non e' una data.
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v < 200000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000
    const d = new Date(ms)
    if (!isNaN(d)) return d.toISOString().slice(0, 10) // costruita in UTC: qui e' corretto
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return giornoCheEsiste(iso[1], iso[2], iso[3]) ? s : null
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (m) {
    const [, dd, mm, yyyy] = m
    if (!giornoCheEsiste(yyyy, mm, dd)) return null
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  // "1/5/26" a due cifre: comune nei fogli scritti a mano.
  const m2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (m2) {
    const [, dd, mm, yy] = m2
    const anno = Number(yy) >= 70 ? `19${yy}` : `20${yy}`
    if (!giornoCheEsiste(anno, mm, dd)) return null
    return `${anno}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return null
}

// ── Validation riga singola ───────────────────────────────────────────

/**
 * Valida una singola riga dopo aver applicato il mapping.
 * @param {Object} row - Riga input (chiavi = nomi colonne file)
 * @param {Record<string,string>} mapping - {field_target -> nome_colonna_input}
 * @param {Object} schema - EntitySchema
 * @param {Object} [opts]
 * @param {Record<string, Map<string, *>>} [opts.lookups]  - Per field type='lookup':
 *   mappa da valore-cliente (lowercase trim) → chiave DB.
 * @param {Set<string>} [opts.activeConversions] - unitConversions attivate
 * @returns {{ ok: boolean, data: Object, errors?: string[], vuoti: string[] }}
 *   `vuoti` = i field che avevano la colonna mappata ma la cella vuota, e che
 *   hanno preso il valore predefinito dello schema.
 */
export function validateRow(row, mapping, schema, opts = {}) {
  const errors = []
  const data = {}
  // 19/09/2026 — i campi che hanno preso il predefinito da una cella VUOTA di
  // una colonna che era mappata. Non è la stessa cosa dei campi non mappati
  // (quelli il wizard li dichiarava già): qui la colonna nel file c'è, e la
  // casella era vuota per quella riga soltanto. Per `costo_orario` il
  // predefinito è 0, e uno zero nel costo del lavoro vuol dire «lavora
  // gratis»: dopo il caricamento non si distingue più da uno zero scritto
  // davvero. Il dato non lo cambiamo — quella è una decisione di prodotto —
  // ma da qui in poi si sa quante sono, e si può dire prima di scrivere.
  const vuoti = []
  const lookups = opts.lookups || {}
  for (const field of schema.fields) {
    const inputCol = mapping[field.name]
    const raw = inputCol ? row[inputCol] : undefined
    // Una cella di soli spazi è una cella vuota. Prima no: `raw === ''` non
    // prendeva «   », che quindi saltava il predefinito e lasciava il campo
    // assente. Stessa cosa battuta dall'utente, due esiti diversi.
    const vuota = raw == null || String(raw).trim() === ''

    if (vuota && field.default !== undefined) {
      data[field.name] = field.default
      if (inputCol) vuoti.push(field.name)
      continue
    }
    if (field.required && vuota) {
      errors.push(`campo obbligatorio "${field.name}" vuoto`)
      continue
    }
    if (vuota) continue

    switch (field.type) {
      case 'lookup': {
        const key = String(raw).trim().toLowerCase()
        const lookupMap = lookups[field.name]
        if (!lookupMap) {
          errors.push(`"${field.name}" non risolvibile: manca la tabella di lookup`)
          break
        }
        const resolved = lookupMap.get(key)
        if (!resolved) {
          errors.push(`"${field.name}" = "${raw}" non trovato tra le ${lookupMap.size} opzioni disponibili`)
          break
        }
        data[field.name] = resolved
        break
      }
      case 'string': {
        const s = coerceString(raw)
        if (!s) { if (field.required) errors.push(`"${field.name}" vuoto dopo trim`); continue }
        data[field.name] = s
        break
      }
      case 'email': {
        const s = coerceString(raw)
        if (!isValidEmail(s)) errors.push(`"${field.name}" non e' un'email valida: "${s}"`)
        else data[field.name] = s.toLowerCase()
        break
      }
      case 'phone': {
        const s = coerceString(raw)
        if (!isValidPhone(s)) errors.push(`"${field.name}" non e' un telefono valido: "${s}"`)
        else data[field.name] = s
        break
      }
      case 'number': {
        const n = coerceNumber(raw)
        if (n == null) { errors.push(`"${field.name}" non e' un numero valido: "${raw}"`); break }
        if (field.minValue != null && n < field.minValue) {
          errors.push(`"${field.name}" = ${n} sotto minimo ${field.minValue}`); break
        }
        if (field.maxValue != null && n > field.maxValue) {
          errors.push(`"${field.name}" = ${n} sopra massimo ${field.maxValue}`); break
        }
        data[field.name] = n
        break
      }
      case 'boolean': {
        const b = coerceBoolean(raw)
        if (b == null) errors.push(`"${field.name}" non e' un booleano valido: "${raw}"`)
        else data[field.name] = b
        break
      }
      case 'date': {
        const d = coerceDate(raw)
        if (!d) errors.push(`"${field.name}" non e' una data valida: "${raw}"`)
        else data[field.name] = d
        break
      }
      default:
        errors.push(`Tipo schema sconosciuto: ${field.type}`)
    }
  }

  // unitConversions attive: applica dopo il parsing dei numeri.
  const activeConv = opts.activeConversions
  if (activeConv && activeConv.size > 0 && Array.isArray(schema.unitConversions)) {
    for (const conv of schema.unitConversions) {
      if (!activeConv.has(conv.label)) continue
      for (const f of (conv.fields || [])) {
        if (data[f] != null && typeof data[f] === 'number') {
          data[f] = Math.round(data[f] * (conv.factor || 1))
        }
      }
    }
  }

  // Audit 2026-09-09: i campi in grammi finiscono in colonne INTEGER, e prima
  // l'arrotondamento arrivava da importUnpivot, che lo faceva sul valore in kg
  // (2,5 kg -> 3 -> 3.000 g). Ora si arrotonda qui, alla fine: quando i numeri
  // sono già in grammi non c'e' conversione da applicare, ma una cella con i
  // decimali va comunque portata all'intero prima dell'insert.
  for (const f of (schema.fields || [])) {
    if (f.type !== 'number') continue
    if (!/_g$/.test(f.name)) continue
    if (data[f.name] != null && typeof data[f.name] === 'number') {
      data[f.name] = Math.round(data[f.name])
    }
  }

  return errors.length === 0 ? { ok: true, data, vuoti } : { ok: false, errors, data, vuoti }
}

/**
 * Valida un batch di rows applicando il mapping.
 * @param {Object[]} rows
 * @param {Record<string,string>} mapping
 * @param {Object} schema
 * @param {Object} [opts] - Vedi validateRow: {lookups, activeConversions}
 * @returns {{ valid_rows, invalid_rows, stats }}
 */
export function validateRows(rows, mapping, schema, opts = {}) {
  const valid_rows = []
  const invalid_rows = []
  // ── Le righe di totale non sono dati ─────────────────────────────────
  //
  // «TOTALE 4.850 €» in fondo al foglio, i «Subtotale» in mezzo uno per
  // famiglia. Lette come righe normali nasce una materia prima che si chiama
  // TOTALE e costa 4.850 € al chilo, e da lì entra nel food cost di chiunque
  // la usi. Finivano fra le righe scartate con l'errore generico «campo
  // obbligatorio mancante», in mezzo agli errori veri.
  //
  // Decisione del titolare, 22/09/2026: si saltano, **e si dice**.
  const righe_totale = []
  const celle_vuote_col_predefinito = {}
  // La riga come si legge nel foglio dell'utente. `_riga_foglio` ce l'ha messa
  // `normalizeSheet`; quando manca — righe costruite a mano dal CLI o dai
  // test — si ripiega sulla posizione, che li' è tutto quello che c'è.
  const rigaDelFoglio = (row, i) => (row?._riga_foglio != null ? row._riga_foglio : i + 2)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || typeof row !== 'object') {
      invalid_rows.push({
        row_index: i, riga_foglio: rigaDelFoglio(row, i),
        errors: ['riga non e un oggetto'], row_data: row,
      })
      continue
    }
    // La prima cella scritta della riga: nei fogli veri il totale sta lì, e
    // il resto sono numeri.
    const primaScritta = Object.values(row).find(v => String(v ?? '').trim() !== '')
    if (eRigaDiTotale(primaScritta)) {
      righe_totale.push({ riga_foglio: rigaDelFoglio(row, i), testo: String(primaScritta ?? '').trim() })
      continue
    }
    const res = validateRow(row, mapping, schema, opts)
    for (const f of (res.vuoti || [])) {
      celle_vuote_col_predefinito[f] = (celle_vuote_col_predefinito[f] || 0) + 1
    }
    // `_row_index` = riga del foglio da cui viene il dato. Serve a dire
    // all'utente la riga VERA quando un blocco di insert fallisce: prima si
    // stampava l'indice dentro le righe valide, che con 400 righe scartate e'
    // una riga completamente diversa. Chi inserisce lo togliera' dal payload.
    // 18/09/2026 — `i` è la posizione fra le righe già ripulite, non la riga
    // del foglio: le righe bianche erano state buttate via prima. Ora il
    // numero vero viaggia con la riga (`_riga_foglio`, messo da
    // `normalizeSheet`), e si usa quello quando c'è. Il `i` resta come
    // ripiego per chi passa righe costruite a mano.
    if (res.ok) valid_rows.push({ ...res.data, _row_index: row._riga_foglio != null ? row._riga_foglio - 2 : i })
    // 19/09/2026 — `row_index` è la posizione dentro l'array già ripulito
    // dalle righe bianche, e il wizard ci stampava sopra «Riga N». Con tre
    // righe bianche in mezzo — il modo normale di separare le famiglie in un
    // listino — diceva «Riga 3» per un errore che stava alla riga 6.
    // Era la seconda metà del difetto corretto il 18/09 sulle righe valide:
    // si era sistemato il lato che quasi nessuno guarda e lasciato quello che
    // si guarda sempre, cioè l'elenco delle righe da rivedere.
    // `row_index` resta dov'era per chi lo usava; il numero da mostrare è
    // `riga_foglio`.
    else invalid_rows.push({ row_index: i, riga_foglio: rigaDelFoglio(row, i), errors: res.errors, row_data: row })
  }
  return {
    valid_rows,
    invalid_rows,
    righe_totale,
    // L'avviso già scritto in italiano, coi nomi: chi lo mostra non deve
    // reinventare la frase, e la frase è la stessa in tutti gli import.
    avviso_totali: avvisoRigheDiTotale(righe_totale),
    stats: {
      total: rows.length,
      valid: valid_rows.length,
      invalid: invalid_rows.length,
      totali_saltate: righe_totale.length,
      celle_vuote_col_predefinito,
    },
  }
}

/**
 * Raggruppa le righe che hanno lo stesso valore nella colonna chiave.
 *
 * 19/09/2026 — Il file che il titolare descrive («nome fornitore, prodotti,
 * prezzo per prodotto») ha lo stesso fornitore su più righe, una per
 * prodotto. Il controllo doppioni del wizard guardava solo i nomi già
 * presenti nel database e mai quelli ripetuti DENTRO il file: cinque righe
 * diventavano cinque anagrafiche per tre fornitori, e la schermata finale
 * diceva «Tutto caricato!». Su un listino di 300 righe da 12 fornitori sono
 * 300 anagrafiche da cancellare a mano.
 *
 * Si tiene la PRIMA riga di ogni gruppo: è quella che l'utente vede
 * nell'anteprima, e mostrarne una e caricarne un'altra sarebbe peggio del
 * doppione. Il confronto ignora maiuscole e spazi, come lo fa il controllo
 * contro il database.
 *
 * Le righe senza valore nella colonna chiave non sono doppioni fra loro e
 * restano tutte: decidere che due caselle vuote sono la stessa cosa sarebbe
 * inventarsi un dato.
 *
 * @param {Object[]} rows
 * @param {string} chiave - nome del campo su cui cercare i doppioni
 * @returns {{ tenute: Object[], scartate: number, ripetuti: Array<{valore: string, volte: number}> }}
 */
export function doppioniNelFile(rows, chiave) {
  const tenute = []
  const ripetuti = []
  if (!Array.isArray(rows) || !chiave) return { tenute: rows || [], scartate: 0, ripetuti }
  const conteggio = new Map()   // chiave normalizzata -> { valore, volte }
  for (const row of rows) {
    const grezzo = row?.[chiave]
    const k = String(grezzo ?? '').trim().toLowerCase()
    if (!k) { tenute.push(row); continue }
    const visto = conteggio.get(k)
    if (visto) { visto.volte++; continue }
    conteggio.set(k, { valore: String(grezzo), volte: 1 })
    tenute.push(row)
  }
  for (const v of conteggio.values()) if (v.volte > 1) ripetuti.push(v)
  return { tenute, scartate: rows.length - tenute.length, ripetuti }
}

/**
 * Estrae i field type='lookup' da uno schema.
 * @returns {Array<{name: string, resolver: Object}>}
 */
export function getLookupFields(schema) {
  return (schema.fields || [])
    .filter(f => f.type === 'lookup' && f.resolver)
    .map(f => ({ name: f.name, resolver: f.resolver }))
}

/**
 * Verifica che il mapping copra tutti i field required dello schema.
 * @returns {string[]} lista dei field required senza mapping (vuoto se ok)
 */
export function findMissingRequired(mapping, schema) {
  return schema.fields
    .filter(f => f.required && !mapping[f.name])
    .map(f => f.name)
}
