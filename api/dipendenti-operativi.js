// POST /api/dipendenti-operativi
// -----------------------------------------------------------------------------
// CRUD sulla rubrica dei dipendenti operativi (nome+cognome+codice 4 cifre).
// Riservato al titolare. Azioni supportate:
//
//   { azione: 'lista' }
//     → { ok, dipendenti: [{ id, nome, cognome, ruolo, attivo, codice_operativo,
//                            codice_attivo, codice_set_at, codice_last_used_at }] }
//     Il titolare vede l'elenco completo con i codici (needed to communicate
//     to voice).
//
//   { azione: 'crea', nome, cognome, codice }
//     → crea riga in `dipendenti` + `dipendenti_codici`. Valida formato codice
//     (4 cifre) e unicita' nell'org.
//     → { ok, id }
//
//   { azione: 'aggiorna', id, nome?, cognome?, ruolo?, attivo? }
//     → update anagrafica. Non tocca il codice.
//
//   { azione: 'set_codice', id, codice }
//     → cambia il codice operativo (upsert su dipendenti_codici, riattiva se
//     era disattivo).
//
//   { azione: 'toggle_codice', id, attivo }
//     → attiva/disattiva codice esistente (senza cambiarlo).
//
//   { azione: 'elimina', id }
//     → soft-delete: setta dipendenti.attivo=false, disattiva codice.
//     Non fa DELETE per non rompere storico audit_log.
//
// Le operazioni scrivono su `dipendenti` e `dipendenti_codici`. La tabella
// codici ha RLS titolare-only, ma qui usiamo la service key comunque.
// -----------------------------------------------------------------------------

export const config = { runtime: 'edge' }

import { verificaToken } from './lib/auth.js'
import { handleOptions, json } from './lib/cors.js'
import { checkRateLimit } from './lib/rateLimit.js'

const CODICE_RE = /^\d{4}$/
const CODICI_BANNATI = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '3210'])
const RUOLI_AMMESSI = new Set(['dipendente', 'capo-turno', 'responsabile', 'altro'])

function validaCodice(c) {
  if (!c || !CODICE_RE.test(c)) return 'Il codice deve essere di 4 cifre'
  if (CODICI_BANNATI.has(c)) return 'Codice troppo semplice (evita sequenze e ripetizioni)'
  return null
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req)

  const { user, profile, supabase, error } = await verificaToken(req)
  if (error || !user) return json({ error: error || 'Non autorizzato' }, 401, req)
  if (profile.ruolo === 'dipendente') {
    return json({ error: 'Operazione riservata al titolare' }, 403, req)
  }

  try {
    const rl = await checkRateLimit(supabase, `dip-op:${user.id}`, 60, 15 * 60)
    if (!rl.allowed) return json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' }, 429, req)
  } catch { /* fail-open */ }

  let body
  try { body = await req.json() } catch { return json({ error: 'Body non valido' }, 400, req) }
  const azione = (body?.azione || '').toString()
  const orgId = profile.organization_id

  if (azione === 'lista') {
    const { data: dips, error: dErr } = await supabase
      .from('dipendenti')
      .select('id, nome, cognome, ruolo, attivo, created_at')
      .eq('organization_id', orgId)
      .order('cognome', { ascending: true, nullsFirst: false })
      .order('nome', { ascending: true })
    if (dErr) return json({ error: dErr.message }, 500, req)

    const { data: codici, error: cErr } = await supabase
      .from('dipendenti_codici')
      .select('dipendente_id, codice_operativo, attivo, set_at, last_used_at')
      .eq('organization_id', orgId)
    if (cErr) return json({ error: cErr.message }, 500, req)

    const codByDip = new Map(codici.map(c => [c.dipendente_id, c]))
    const out = (dips || []).map(d => {
      const c = codByDip.get(d.id)
      return {
        id: d.id,
        nome: d.nome || '',
        cognome: d.cognome || '',
        ruolo: d.ruolo || null,
        attivo: d.attivo !== false,
        created_at: d.created_at,
        codice_operativo: c?.codice_operativo || null,
        codice_attivo: c ? c.attivo : false,
        codice_set_at: c?.set_at || null,
        codice_last_used_at: c?.last_used_at || null,
      }
    })
    return json({ ok: true, dipendenti: out }, 200, req)
  }

  if (azione === 'crea') {
    const nome = (body?.nome || '').toString().trim().slice(0, 60)
    const cognome = (body?.cognome || '').toString().trim().slice(0, 60)
    const ruolo = body?.ruolo != null ? (body.ruolo || '').toString().trim().slice(0, 40) : null
    const codice = body?.codice != null ? (body.codice || '').toString().trim() : ''
    if (nome.length < 2) return json({ error: 'Nome mancante (minimo 2 caratteri)' }, 400, req)
    if (cognome.length < 2) return json({ error: 'Cognome mancante (minimo 2 caratteri)' }, 400, req)
    if (ruolo && !RUOLI_AMMESSI.has(ruolo)) return json({ error: 'Ruolo non valido' }, 400, req)
    const codErr = validaCodice(codice)
    if (codErr) return json({ error: codErr }, 400, req)

    // Verifica unicita' codice (anche se lo verifica il DB via unique index, meglio errore chiaro)
    const { data: dupCod } = await supabase
      .from('dipendenti_codici')
      .select('dipendente_id')
      .eq('organization_id', orgId)
      .eq('codice_operativo', codice)
      .eq('attivo', true)
      .maybeSingle()
    if (dupCod) return json({ error: 'Codice già assegnato a un altro dipendente' }, 409, req)

    // Insert dipendente
    const { data: newDip, error: iErr } = await supabase
      .from('dipendenti')
      .insert({ organization_id: orgId, nome, cognome, ruolo, attivo: true })
      .select('id')
      .single()
    if (iErr) return json({ error: 'Creazione fallita: ' + iErr.message }, 500, req)

    // Insert codice
    const { error: cInsErr } = await supabase
      .from('dipendenti_codici')
      .insert({
        dipendente_id: newDip.id,
        organization_id: orgId,
        codice_operativo: codice,
        attivo: true,
      })
    if (cInsErr) {
      // Rollback dipendente
      try { await supabase.from('dipendenti').delete().eq('id', newDip.id) } catch { /* noop */ }
      return json({ error: 'Assegnazione codice fallita: ' + cInsErr.message }, 500, req)
    }
    return json({ ok: true, id: newDip.id }, 200, req)
  }

  if (azione === 'aggiorna') {
    const id = (body?.id || '').toString()
    if (!id) return json({ error: 'id mancante' }, 400, req)
    const upd = {}
    if (body?.nome != null) upd.nome = String(body.nome).trim().slice(0, 60)
    if (body?.cognome != null) upd.cognome = String(body.cognome).trim().slice(0, 60)
    if (body?.ruolo != null) {
      const r = String(body.ruolo).trim().slice(0, 40)
      if (r && !RUOLI_AMMESSI.has(r)) return json({ error: 'Ruolo non valido' }, 400, req)
      upd.ruolo = r || null
    }
    if (body?.attivo != null) upd.attivo = body.attivo === true
    if (Object.keys(upd).length === 0) return json({ error: 'Nessun campo da aggiornare' }, 400, req)

    const { error: uErr } = await supabase
      .from('dipendenti').update(upd).eq('id', id).eq('organization_id', orgId)
    if (uErr) return json({ error: uErr.message }, 500, req)
    return json({ ok: true }, 200, req)
  }

  if (azione === 'set_codice') {
    const id = (body?.id || '').toString()
    const codice = (body?.codice || '').toString().trim()
    if (!id) return json({ error: 'id mancante' }, 400, req)
    const codErr = validaCodice(codice)
    if (codErr) return json({ error: codErr }, 400, req)

    // Verifica dipendente esista in org
    const { data: dip } = await supabase
      .from('dipendenti').select('id').eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (!dip) return json({ error: 'Dipendente non trovato' }, 404, req)

    // Verifica unicita' del nuovo codice (escludendo il dipendente stesso)
    const { data: dupCod } = await supabase
      .from('dipendenti_codici')
      .select('dipendente_id')
      .eq('organization_id', orgId)
      .eq('codice_operativo', codice)
      .eq('attivo', true)
      .neq('dipendente_id', id)
      .maybeSingle()
    if (dupCod) return json({ error: 'Codice già assegnato a un altro dipendente' }, 409, req)

    const { error: upErr } = await supabase
      .from('dipendenti_codici')
      .upsert({
        dipendente_id: id,
        organization_id: orgId,
        codice_operativo: codice,
        attivo: true,
        set_at: new Date().toISOString(),
      }, { onConflict: 'dipendente_id' })
    if (upErr) return json({ error: 'Impostazione codice fallita: ' + upErr.message }, 500, req)
    return json({ ok: true }, 200, req)
  }

  if (azione === 'toggle_codice') {
    const id = (body?.id || '').toString()
    const attivo = body?.attivo === true
    if (!id) return json({ error: 'id mancante' }, 400, req)
    const { error: uErr } = await supabase
      .from('dipendenti_codici').update({ attivo }).eq('dipendente_id', id).eq('organization_id', orgId)
    if (uErr) return json({ error: uErr.message }, 500, req)
    return json({ ok: true }, 200, req)
  }

  if (azione === 'elimina') {
    const id = (body?.id || '').toString()
    if (!id) return json({ error: 'id mancante' }, 400, req)
    // Soft-delete: disattiva anagrafica + disattiva codice. Non facciamo DELETE
    // per preservare il tracciamento in audit_log (FK on delete set null).
    const { error: dErr } = await supabase
      .from('dipendenti').update({ attivo: false }).eq('id', id).eq('organization_id', orgId)
    if (dErr) return json({ error: dErr.message }, 500, req)
    await supabase.from('dipendenti_codici').update({ attivo: false }).eq('dipendente_id', id).eq('organization_id', orgId)
    return json({ ok: true }, 200, req)
  }

  return json({ error: 'Azione non riconosciuta' }, 400, req)
}
