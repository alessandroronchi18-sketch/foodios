// Helper condiviso per riconoscere e formattare errori Supabase noti in
// messaggi italiani user-friendly. Le RPC/trigger lanciano stringhe che
// altrimenti l'utente vedrebbe grezze nel toast (es. "Nessuna sessione
// operativa attiva per il dipendente selezionato ...").

// Vero se l'errore è quello del trigger verify_dipendente_operativo_session
// (migration 20260730 + defense-in-depth 20260731). Il messaggio contiene
// la frase "sessione operativa"; usiamo un match soft per resistere a
// eventuali tweaks minori del testo lato DB.
export function isSessionOperativaError(err) {
  if (!err) return false
  const msg = String(err.message || err || '').toLowerCase()
  return msg.includes('sessione operativa')
}

// Rimappa gli errori Supabase noti in italiano user-friendly.
// Fallback: ritorna err.message se non riconosciuto.
export function friendlyErrorMessage(err) {
  if (!err) return 'Errore sconosciuto'
  if (isSessionOperativaError(err)) {
    return 'Sessione operativa scaduta. Torna alla schermata "Chi sei?" e reinserisci il codice.'
  }
  return err.message || String(err) || 'Errore'
}

// Helper: se l'errore Supabase è di sessione operativa, rilancia un Error
// con messaggio user-friendly (il catch a monte notify col message pulito).
// Se è un altro errore, rilancia l'originale (comportamento standard).
// Se nessun errore, no-op. Uso pattern: `throwIfError(error)` invece di
// `if (error) throw error` nelle chiamate RPC critiche.
export function throwIfError(error) {
  if (!error) return
  if (isSessionOperativaError(error)) {
    const e = new Error(friendlyErrorMessage(error))
    e.original = error
    throw e
  }
  throw error
}
