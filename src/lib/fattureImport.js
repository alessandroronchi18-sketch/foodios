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

/**
 * INSERT resiliente: prova con tutte le colonne sicure; se una colonna nuova
 * non esiste ancora nel database, ripiega sulle sole colonne core invece di
 * rompersi.
 */
export async function insertFattureResilient(supabase, rows) {
  if (!rows.length) return 0
  let inserite = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    let { error } = await supabase.from('fatture').insert(chunk)
    if (error && /does not exist|schema cache|PGRST204|could not find/i.test(error.message || '')) {
      const core = chunk.map(r => {
        const o = { organization_id: r.organization_id, sede_id: r.sede_id }
        for (const k of FATTURA_COLS_CORE) if (r[k] !== undefined && r[k] !== null) o[k] = r[k]
        return o
      })
      error = (await supabase.from('fatture').insert(core)).error
    }
    if (error) throw error
    inserite += chunk.length
  }
  return inserite
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
