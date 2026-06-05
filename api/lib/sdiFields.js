// Estrazione dati SDI dai custom_fields della Checkout Session Stripe.
//
// Stripe Checkout raccoglie nativamente solo P.IVA (tax_id) e indirizzo; il
// codice destinatario SDI e la PEC li chiediamo come custom_fields (vedi
// api/stripe-checkout.js) e qui li normalizziamo per salvarli su
// organizations.{codice_destinatario, pec}.
//
// Funzione PURA (nessuna dipendenza esterna) così è unit-testabile senza Stripe.

// Codice destinatario SDI: esattamente 7 caratteri alfanumerici maiuscoli.
// Stesso vincolo del DB (organizations_codice_destinatario_check).
export function validateCodiceSdi(raw) {
  if (!raw) return null
  const up = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{7}$/.test(up) ? up : null
}

/**
 * Estrae { codice_destinatario, pec } dai custom_fields di una Checkout Session.
 * Ritorna solo le chiavi valorizzate (codice scartato se non valido).
 * @param {Array} customFields  session.custom_fields (può essere undefined)
 * @returns {{ codice_destinatario?: string, pec?: string }}
 */
export function parseSdiCustomFields(customFields) {
  const cf = Array.isArray(customFields) ? customFields : []
  const getCF = (key) => cf.find(f => f?.key === key)?.text?.value || null

  const out = {}
  const codice = validateCodiceSdi(getCF('codice_sdi'))
  if (codice) out.codice_destinatario = codice

  const pec = getCF('pec')
  if (pec && String(pec).trim()) out.pec = String(pec).trim()

  return out
}
