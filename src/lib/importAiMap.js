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
      model: data.model || 'unknown',
      duration_ms: Number(data.duration_ms) || 0,
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Timeout: la mappatura ha impiegato troppo. Riprova.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
