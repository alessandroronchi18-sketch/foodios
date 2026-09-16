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

// La sola data (YYYY-MM-DD) di un valore che può essere una stringa o una Date.
//
// Serve per CONFRONTARE due giorni. Confrontare oggetti `Date` costruiti da
// `new Date('2026-09-16')` è una trappola: quella forma si legge come
// mezzanotte UTC, cioè le 02:00 italiane. Fra mezzanotte e le due, un
// trasferimento di oggi risultava «nel futuro» rispetto a `new Date()` e
// spariva dai flussi del mese e dal conto dell'accuratezza (trovato il
// 16/09/2026 in `TrasferimentiView`).
//
// Confrontando le stringhe il fuso non c'entra più: '2026-09-16' viene dopo
// '2026-09-01' e basta. È lo stesso motivo per cui esiste `todayLocal()`.
export function soloData(v) {
  if (!v) return ''
  if (typeof v === 'string') {
    // Già nella forma giusta (o ISO con l'ora attaccata): si taglia e basta,
    // senza passare da `Date` — che la sposterebbe.
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  return formatLocalDate(v)
}

// Il primo giorno del mese corrente, come stringa confrontabile.
export function primoDelMeseLocal(oggi = new Date()) {
  return `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-01`
}

// Il giorno di N giorni fa, come stringa confrontabile.
//
// `new Date(Date.now() - n*86400000).toISOString().slice(0,10)` dà la data
// UTC: a Torino alle 00:30 del 16/09 «ultimi 30 giorni» partiva dal 16/08
// invece che dal 17/08, e ne contava 31 (trovato in `Fornitori`).
export function giorniFaLocal(n, oggi = new Date()) {
  const d = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  d.setDate(d.getDate() - Number(n || 0))
  return formatLocalDate(d)
}
