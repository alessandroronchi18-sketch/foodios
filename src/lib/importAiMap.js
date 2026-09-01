// Import AI Map — client wrapper per POST /api/import-map.
//
// Chiama l'endpoint server-side che a sua volta chiama Claude per suggerire
// il mapping colonne file → field schema. Nel body vanno SOLO:
//   - entity
//   - headers (nomi colonne)
//   - sampleRows (max 5 righe di preview)
//
// Il file COMPLETO (potenzialmente sensibile: stipendi, ricette) NON va mai
// al server: resta client-side per il resto del flusso (validate + insert diretti
// su Supabase con JWT + RLS).

import { supabase } from './supabase'

const ENDPOINT = '/api/import-map'
const ENDPOINT_SAVE = '/api/import-mapping-save'
const ENDPOINT_DETECT = '/api/import-detect-format'
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_SAMPLES = 5

/**
 * Chiede al server di suggerire il mapping colonne per la data entity.
 *
 * @param {Object} args
 * @param {string} args.entity                Es. 'fornitori', 'dipendenti'
 * @param {string[]} args.headers             Nomi delle colonne del file cliente
 * @param {Object[]} [args.sampleRows]        Prime N righe (max 5) come oggetti {header: value}
 * @param {number} [args.timeoutMs]           Timeout fetch (default 30s)
 * @returns {Promise<{
 *   mapping: Record<string,string>,
 *   confidence: Record<string, number>,
 *   unmapped_columns: string[],
 *   missing_required: string[],
 *   notes: string,
 *   model: string,
 *   duration_ms: number
 * }>}
 */
export async function callImportMap({ entity, headers, sampleRows = [], timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!entity) throw new Error('entity richiesta')
  if (!Array.isArray(headers) || headers.length === 0) throw new Error('headers richieste')

  const session = await supabase.auth.getSession()
  const token = session?.data?.session?.access_token
  if (!token) throw new Error('Sessione non valida — rifai login')

  const body = {
    entity,
    headers,
    sampleRows: Array.isArray(sampleRows) ? sampleRows.slice(0, MAX_SAMPLES) : [],
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let msg = `Errore server (${res.status})`
      try {
        const errBody = await res.json()
        if (errBody?.error) msg = errBody.error
      } catch { /* ignore */ }
      const err = new Error(msg)
      err.status = res.status
      throw err
    }
    const data = await res.json()
    if (!data || typeof data !== 'object') throw new Error('Risposta non valida dal server')
    return {
      mapping: data.mapping || {},
      confidence: data.confidence || {},
      unmapped_columns: Array.isArray(data.unmapped_columns) ? data.unmapped_columns : [],
      missing_required: Array.isArray(data.missing_required) ? data.missing_required : [],
      notes: typeof data.notes === 'string' ? data.notes : '',
      source: data.source || 'ai',
      model: data.model || null,
      library_id: data.library_id || null,
      duration_ms: Number(data.duration_ms) || 0,
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Timeout: la mappatura ha impiegato troppo. Riprova.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Chiede al server di riconoscere il formato (LONG vs WIDE) del file e
 * proporre una config di unpivot. Solo i primi 20 righe per sheet vanno
 * al server; il resto del file resta nel browser.
 *
 * @param {Object} args
 * @param {string} args.entity
 * @param {Record<string, Array<Array<any>>>} args.sheets - Map: sheet name → 2D array (prime N righe)
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{ format: string, unpivot_config: Object|null, notes: string, source: string }>}
 */
export async function callImportDetectFormat({ entity, sheets, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const session = await supabase.auth.getSession()
  const token = session?.data?.session?.access_token
  if (!token) throw new Error('Sessione non valida — rifai login')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(ENDPOINT_DETECT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entity, sheets }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let msg = `Errore server (${res.status})`
      try { const b = await res.json(); if (b?.error) msg = b.error } catch { /* */ }
      throw new Error(msg)
    }
    const data = await res.json()
    return {
      format: data.format || 'unknown',
      unpivot_config: data.unpivot_config || null,
      notes: typeof data.notes === 'string' ? data.notes : '',
      source: data.source || 'ai',
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Timeout riconoscimento formato.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Salva un mapping confermato dal cliente nella library cross-cliente.
 * Chiamata fire-and-forget dopo un insert riuscito. Silenzia errori: se la
 * library non risponde, l'utente non vede errori perché i dati sono
 * comunque stati importati con successo.
 *
 * @param {Object} args
 * @param {string} args.entity
 * @param {string[]} args.headers
 * @param {Record<string,string>} args.mapping
 */
export async function saveImportMapping({ entity, headers, mapping }) {
  try {
    const session = await supabase.auth.getSession()
    const token = session?.data?.session?.access_token
    if (!token) return
    await fetch(ENDPOINT_SAVE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entity, headers, mapping }),
      // Fire-and-forget: se la rete e' lenta, non blocchiamo il flusso.
      keepalive: true,
    })
  } catch {
    // Silenzia: non e' un errore utente-facing.
  }
}
