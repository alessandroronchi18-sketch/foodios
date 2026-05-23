import { checkExportPermesso } from './auditClient'

// Contesto export: nomeAttivita ed email dell'utente per applicare watermark al PDF.
// Settato una volta da Dashboard quando auth è disponibile.
let _ctx = { email: null, nomeAttivita: null }

export function setExportCtx(ctx) {
  _ctx = { ..._ctx, ...ctx }
}

export function getExportCtx() {
  return _ctx
}

// Verifica server-side rate limit + audit log. Ritorna true se OK.
export async function gateExport(tipo, scope, notify) {
  const r = await checkExportPermesso(tipo, scope || {})
  if (!r.ok) {
    if (notify) notify(r.message || 'Export bloccato per limite di sicurezza', false)
    return false
  }
  return true
}
