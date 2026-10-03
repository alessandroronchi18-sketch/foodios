// Inserimento di fatture da file, condiviso fra le pagine che lo fanno.
//
// PERCHE' ESISTE: questi tre helper vivevano dentro Scadenzario.jsx, e la
// pagina Integrazioni faceva la stessa cosa a mano, senza nessuno dei tre.
// Risultato, verificato il 10/09/2026: caricando dodici XML dallo SDI, se il
// quinto non si leggeva l'import si fermava con un errore tecnico, le quattro
// fatture già inserite restavano in database, e il messaggio di successo non
// compariva. Chi ricaricava tutti i dodici file si trovava le prime quattro
// duplicate: nello Scadenzario comparivano otto scadenze invece di quattro e
// il totale da pagare a quel fornitore raddoppiava. In public.fatture non c'è
// nessun vincolo che lo impedisca (solo la chiave primaria su id), e due
// gruppi duplicati ci sono già.

// Colonne sicure della tabella `fatture`: quelle che esistono di certo. I
// parser possono produrre campi extra che, se la tabella non li ha, fanno
// fallire l'INSERT con un errore PostgREST.
export const FATTURA_COLS_SICURE = [
  'numero_rif', 'data_fattura', 'data_scadenza', 'tipo', 'fornitore', 'piva', 'cf',
  'iban', 'imponibile', 'imposta', 'totale', 'stato', 'importo_pagato', 'note',
  // Il dettaglio riga (quantità, prezzi unitari, aliquote). Senza questa voce
  // il parser lo legge e `pickFattura` lo butta via in silenzio: è il passo
  // che si dimentica sempre quando si aggiunge una colonna.
  'righe',
  // Di quale società è la fattura (P.IVA di chi la riceve): decide la sede
  // quando un'azienda è fatta di più società. Colonna del 03/10/2026: finché
  // la migration non è applicata, `insertFattureResilient` la toglie e tiene
  // tutto il resto.
  'cessionario_piva',
]

// Colonne "core", presenti anche prima della migrazione dello scadenzario.
export const FATTURA_COLS_CORE = ['numero_rif', 'data_fattura', 'fornitore', 'imponibile', 'imposta', 'totale', 'stato']

/** Tiene solo le colonne che la tabella ha, e mette org e sede. */
export function pickFattura(r, orgId, sedeId) {
  const out = { organization_id: orgId, sede_id: sedeId || null }
  for (const k of FATTURA_COLS_SICURE) if (r[k] !== undefined && r[k] !== null) out[k] = r[k]
  return out
}

/**
 * Chiave di deduplica: numero + fornitore + data, normalizzati.
 * Le fatture di un mese diverso hanno chiave diversa e vengono aggiunte.
 */
export function fatturaKey(r) {
  const norm = v => String(v ?? '').trim().toUpperCase()
  return `${norm(r.numero_rif)}|${norm(r.fornitore)}|${norm(r.data_fattura)}`
}

/**
 * Scarta i record già presenti (set `seen`) e i duplicati interni allo stesso
 * import. Muta `seen`. Ritorna { nuovi, scartati }.
 */
export function dedupFatture(records, seen) {
  const nuovi = []
  let scartati = 0
  for (const r of records) {
    const k = fatturaKey(r)
    if (seen.has(k)) { scartati++; continue }
    seen.add(k)
    nuovi.push(r)
  }
  return { nuovi, scartati }
}

/** Il database ha rifiutato la riga perché quella fattura c'è già. */
export function eDoppione(error) {
  if (!error) return false
  return String(error.code || '') === '23505'
    || /duplicate key value|già presente|fatture_una_sola_volta/i.test(error.message || '')
}

/**
 * Il nome della colonna che il database dice di non avere, o `null`.
 * Tre forme: PostgREST (`Could not find the 'x' column of 'fatture'…`),
 * Postgres in scrittura (`column "x" of relation "fatture" does not exist`)
 * e in lettura (`column fatture.x does not exist`).
 */
export function colonnaMancante(error) {
  const m = String(error?.message || '')
  const r = m.match(/Could not find the '([A-Za-z0-9_]+)' column/i)
    || m.match(/column "([A-Za-z0-9_]+)"(?: of relation "[^"]+")? does not exist/i)
    || m.match(/column [A-Za-z0-9_]+\.([A-Za-z0-9_]+) does not exist/i)
  return r ? r[1] : null
}

/** È un errore di schema (una colonna o la cache di PostgREST)? */
const erroreDiSchema = (error) => /does not exist|schema cache|PGRST204|could not find/i.test(error?.message || '')
  || String(error?.code || '') === 'PGRST204' || String(error?.code || '') === '42703'

/**
 * Riscrive le righe con le sole colonne che c'erano prima dello scadenzario.
 * Ultima spiaggia, quando l'errore non dice quale colonna manca.
 *
 * Le sedi condivise restano: una spesa di due negozi scritta con la sede
 * vuota e SENZA le sue sedi non compare in nessuna pagina (è il danno del
 * 17/09/2026). Se la colonna non c'è, meglio che l'INSERT fallisca a schermo.
 */
function soloColonneCore(chunk) {
  return chunk.map(r => {
    const o = { organization_id: r.organization_id, sede_id: r.sede_id }
    for (const k of FATTURA_COLS_CORE) if (r[k] !== undefined && r[k] !== null) o[k] = r[k]
    if (Array.isArray(r.sedi_condivise) && r.sedi_condivise.length) o.sedi_condivise = r.sedi_condivise
    return o
  })
}

const senzaColonne = (righe, tolte) => tolte.size
  ? righe.map(r => { const o = { ...r }; for (const c of tolte) delete o[c]; return o })
  : righe

/**
 * INSERT resiliente: prova con tutte le colonne sicure; se una colonna nuova
 * non esiste ancora nel database, toglie QUELLA e riprova con tutte le altre.
 *
 * Fino al 03/10/2026 ripiegava subito sulle sette colonne core, e così una
 * colonna mancante qualsiasi si portava via righe, P.IVA, IBAN, scadenza,
 * tipo e le sedi di una spesa condivisa. Le core restano solo come ultima
 * spiaggia, quando l'errore non dice il nome della colonna.
 *
 * Dal 23/09/2026 il database ha un vincolo che impedisce la stessa fattura
 * due volte (`fatture_una_sola_volta`). Serve perché la difesa di prima era
 * tutta nel browser: due persone che importano lo stesso file nello stesso
 * momento leggono **tutte e due** l'elenco «già presenti» prima che l'altra
 * scriva, e passano tutte e due. Il vincolo però fa fallire l'intero blocco
 * da cento righe per colpa di una sola: qui, quando succede, si riprova riga
 * per riga e le doppie si contano invece di buttare via le buone.
 *
 * @returns {Promise<{inserite: number, gia: number}>}
 */
export async function insertFattureResilient(supabase, rows) {
  if (!rows.length) return { inserite: 0, gia: 0 }
  let inserite = 0
  let gia = 0

  // Le colonne che il database ha detto di non avere: si tolgono da tutti i
  // blocchi successivi, senza riscoprirlo ogni volta.
  const tolte = new Set()
  const prova = async (righe) => {
    for (let giro = 0; giro <= FATTURA_COLS_SICURE.length; giro++) {
      const { error } = await supabase.from('fatture').insert(senzaColonne(righe, tolte))
      if (!error || !erroreDiSchema(error)) return error
      const col = colonnaMancante(error)
      if (col && !tolte.has(col) && righe.some(r => col in r)) { tolte.add(col); continue }
      return (await supabase.from('fatture').insert(soloColonneCore(righe))).error
    }
    return (await supabase.from('fatture').insert(soloColonneCore(righe))).error
  }

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const error = await prova(chunk)
    if (!error) { inserite += chunk.length; continue }
    if (!eDoppione(error)) throw error
    // Una riga sola ha fatto saltare il blocco: si ricomincia una per una,
    // così le altre novantanove entrano lo stesso.
    for (const r of chunk) {
      const e = await prova([r])
      if (!e) inserite++
      else if (eDoppione(e)) gia++
      else throw e
    }
  }
  return { inserite, gia }
}

/**
 * Chiavi delle fatture già in database per un'organizzazione, per la
 * deduplica. Legge a pagine per non fermarsi al limite di PostgREST.
 */
export async function chiaviFattureEsistenti(supabase, orgId) {
  const seen = new Set()
  if (!orgId) return seen
  const PAGINA = 1000
  for (let offset = 0; offset < 100000; offset += PAGINA) {
    const { data, error } = await supabase.from('fatture')
      .select('numero_rif, fornitore, data_fattura')
      .eq('organization_id', orgId)
      .range(offset, offset + PAGINA - 1)
    if (error) throw new Error(error.message)
    for (const r of (data || [])) seen.add(fatturaKey(r))
    if (!data || data.length < PAGINA) break
  }
  return seen
}
