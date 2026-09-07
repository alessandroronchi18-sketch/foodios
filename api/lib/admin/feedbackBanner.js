// Inbox feedback e banner globali del pannello admin.
//
// Estratti da api/admin.js. Sono due aree piccole e senza intrecci con il
// resto: buone candidate per iniziare a spezzare quel file.

import { sanitize } from '../validate.js'

// ─── Feedback inbox ──────────────────────────────────────────────────────
export async function getFeedback(supabase, soloDaGestire) {
  let q = supabase
    .from('feedback')
    .select('id, organization_id, user_email, ruolo, view_corrente, messaggio, sentiment, url, gestito, gestito_at, gestito_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (soloDaGestire) q = q.eq('gestito', false)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  // Arricchisci con nome attivita' (lookup organizations).
  const orgIds = Array.from(new Set((data || []).map(f => f.organization_id).filter(Boolean)))
  let orgMap = {}
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, nome')
      .in('id', orgIds)
    for (const o of orgs || []) orgMap[o.id] = o.nome
  }
  return (data || []).map(f => ({ ...f, nome_attivita: orgMap[f.organization_id] || null }))
}

export async function azFeedbackMarcaGestito(supabase, id, adminEmail, gestito) {
  const { error } = await supabase
    .from('feedback')
    .update({
      gestito: !!gestito,
      gestito_at: gestito ? new Date().toISOString() : null,
      gestito_by: gestito ? adminEmail : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Banner globali ──────────────────────────────────────────────────────
export async function getBanners(supabase) {
  const { data, error } = await supabase
    .from('app_banners')
    .select('id, messaggio, tipo, attivo, scade_il, creato_da, creato_il')
    .order('creato_il', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data || []
}

export async function azBannerCrea(supabase, body, adminEmail) {
  const messaggio = sanitize(body.messaggio || '', 500)
  if (!messaggio) throw new Error('Messaggio obbligatorio')
  // Il campo `tipo` nel body e' già usato per dispatchare l'action,
  // quindi qui leggiamo `severity` (info/warn/critical/success).
  const severity = ['info', 'warn', 'critical', 'success'].includes(body.severity) ? body.severity : 'info'
  let scadeIl = null
  if (body.scade_il) {
    const d = new Date(body.scade_il)
    if (!isNaN(d.getTime()) && d > new Date()) scadeIl = d.toISOString()
  }
  const { data, error } = await supabase
    .from('app_banners')
    .insert({ messaggio, tipo: severity, scade_il: scadeIl, creato_da: adminEmail, attivo: true })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function azBannerDisattiva(supabase, id) {
  const { error } = await supabase
    .from('app_banners')
    .update({ attivo: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function azBannerElimina(supabase, id) {
  const { error } = await supabase
    .from('app_banners')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}
