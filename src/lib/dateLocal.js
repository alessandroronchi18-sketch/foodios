// Date utilities sensibili al timezone locale del browser.
//
// new Date().toISOString().slice(0, 10) restituisce la data UTC del momento
// corrente: per un utente in UTC+1 (Italia inverno) tra le 00:00 e 00:59
// locali, la data UTC corrisponde al giorno PRECEDENTE. Risultato: form di
// default che mostrano la data di "ieri" e fatture/turni salvati col giorno
// sbagliato.
//
// Usa todayLocal() ovunque ci sia un default di "oggi" che l'utente vedrà
// (date picker, default form). Per i nomi file di export va bene anche UTC.

export function todayLocal() {
  const d = new Date()
  return formatLocalDate(d)
}

export function formatLocalDate(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Lunedi della settimana corrente (ISO 8601: settimana inizia lunedi).
export function startOfWeekLocal() {
  const d = new Date()
  const day = d.getDay() // 0=domenica
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return formatLocalDate(d)
}
