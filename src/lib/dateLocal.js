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

// Il giorno LOCALE di un istante salvato dal database.
//
// `created_at` arriva come '2026-09-15T23:30:00+00:00'. Tagliarlo con
// `.slice(0, 10)` dà il giorno UTC: quell'istante, a Torino, sono le 01:30 del
// 16 — la pasticceria sta ancora chiudendo la cassa della sera. Il Registro
// attività lo metteva sotto l'intestazione del 15 (trovato il 16/09/2026).
//
// Diverso da `soloData`, che il taglio lo fa apposta: lì il valore è già un
// GIORNO ('2026-09-16'), qui è un ISTANTE, e il giorno va ricavato.
export function giornoDiTimestamp(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  if (isNaN(d.getTime())) return ''
  return formatLocalDate(d)
}

// L'istante in cui comincia un giorno locale, nella forma che capisce il
// database ('2026-09-16T00:00:00.000Z' per il 16 settembre italiano).
//
// Serve per i filtri su colonne `timestamptz`. Scrivere
// `.gte('created_at', '2026-09-16T00:00:00')` — senza fuso — lascia decidere a
// Postgres, che legge UTC: la finestra del «16 settembre» diventava dalle
// 02:00 del 16 alle 01:59 del 17, ora italiana. Le due ore di chi chiude dopo
// mezzanotte finivano nel giorno sbagliato.
export function inizioGiornoLocale(giorno) {
  const g = soloData(giorno)
  if (!g) return ''
  const [y, m, d] = g.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
}

// L'istante in cui comincia il giorno DOPO: l'estremo alto della finestra, da
// usare con `.lt()` e non con `.lte()`.
//
// `'<giorno>T23:59:59'` perde l'ultimo secondo, e su una colonna con i
// millisecondi ne perde 999. Un confine esclusivo non perde niente.
export function fineGiornoLocale(giorno) {
  const g = soloData(giorno)
  if (!g) return ''
  const [y, m, d] = g.split('-').map(Number)
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString()
}

// ── Il giorno della pasticceria, visto da un server ────────────────────
//
// Nel browser «locale» vuol dire già italiano: chi usa Foodos sta a Torino.
// Nei cron no. Le funzioni Vercel girano in UTC, quindi lì `new Date()` e
// `formatLocalDate()` danno il giorno UTC, non quello di Mara.
//
// Oggi il conto torna lo stesso, ma solo per un motivo che non è scritto da
// nessuna parte: i cron partono alle 07:00 e alle 20:00 UTC (`vercel.json`),
// e a quell'ora il giorno UTC e il giorno italiano coincidono. Basta spostare
// uno schedule alle 23:00 — o aggiungerne uno per il mattino presto — perché
// il brief del giorno, la previsione e il messaggio WhatsApp comincino a
// parlare di ieri, senza che nessuna riga di codice sia cambiata.
//
// `giornoItaliano` toglie di mezzo la dipendenza: chiede a Intl il giorno a
// Roma, e viene uguale dovunque giri.
const _FMT_ROMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric', month: '2-digit', day: '2-digit',
})

export function giornoItaliano(quando = new Date()) {
  const d = quando instanceof Date ? quando : new Date(quando)
  if (isNaN(d.getTime())) return ''
  // 'en-CA' formatta AAAA-MM-GG. Le parti si rimontano a mano perché qualche
  // runtime ci infila i separatori invisibili di direzione del testo.
  const p = {}
  for (const { type, value } of _FMT_ROMA.formatToParts(d)) p[type] = value
  return `${p.year}-${p.month}-${p.day}`
}

// Il giorno della settimana a Roma: 0 domenica … 6 sabato, come `getDay()`.
//
// `new Date().getUTCDay()` su un server UTC dice «lunedì» solo finché il cron
// non gira prima delle 23:00 italiane della domenica.
export function giornoSettimanaItaliano(quando = new Date()) {
  const g = giornoItaliano(quando)
  if (!g) return NaN
  const [y, m, d] = g.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// ── Aritmetica sui GIORNI, non sui millisecondi ────────────────────────
//
// Questo è l'attrezzo che mancava, ed è il motivo per cui lo stesso difetto
// è uscito cinque volte. Il modo che sembra ovvio —
//
//     const d = new Date(giorno); d.setDate(d.getDate() + 7)
//     return d.toISOString().slice(0, 10)
//
// — sbaglia due volte nello stesso respiro: `new Date('2026-10-24')` è
// mezzanotte a Greenwich (le 02:00 italiane), e `toISOString()` riporta il
// risultato a Greenwich. Finché si resta dentro la stessa settimana il conto
// torna per caso; la notte fra il 25 e il 26 ottobre 2026, quando l'Italia
// passa da +2 a +1, non torna più: il turno del lunedì slitta alla domenica.
//
// Qui il conto si fa tutto in UTC, dove i giorni durano 24 ore per
// definizione. Il fuso dell'utente non entra mai: un giorno di calendario più
// sette è un giorno di calendario, a Torino come ad Auckland.
function _daStringa(giorno) {
  const g = soloData(giorno)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return null
  const [y, m, d] = g.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return isNaN(t.getTime()) ? null : t
}

function _aStringa(t) {
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** Il giorno che viene N giorni dopo (N negativo = prima). '' se non è un giorno. */
export function aggiungiGiorni(giorno, n) {
  const t = _daStringa(giorno)
  if (!t) return ''
  t.setUTCDate(t.getUTCDate() + Number(n || 0))
  return _aStringa(t)
}

/** Quanti giorni di calendario separano due giorni. Negativo se `a` viene prima. */
export function differenzaGiorni(da, a) {
  const x = _daStringa(da), y = _daStringa(a)
  if (!x || !y) return NaN
  return Math.round((y.getTime() - x.getTime()) / 86400000)
}

/** Il lunedì della settimana che contiene quel giorno (ISO 8601). */
export function lunediDellaSettimana(giorno) {
  const t = _daStringa(giorno)
  if (!t) return ''
  // getUTCDay(): 0 domenica … 6 sabato. Il lunedì è il giorno 1.
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return _aStringa(t)
}

/**
 * Che giorno della settimana è un GIORNO di calendario: 0 domenica … 6 sabato,
 * la stessa numerazione di `getDay()`.
 *
 * Diverso da `giornoSettimanaItaliano`, che parte da un ISTANTE. Qui l'ingresso
 * è già un giorno ('2026-09-17') e il fuso non deve entrarci: `new Date(giorno)`
 * seguito da `.getDay()` è mezzanotte a Greenwich riletta con l'orologio della
 * macchina, e a ovest di Greenwich risponde col giorno prima — la previsione
 * vendite del lunedì costruita sulla media delle domeniche.
 *
 * NaN se non è un giorno.
 */
export function giornoDellaSettimana(giorno) {
  const t = _daStringa(giorno)
  return t ? t.getUTCDay() : NaN
}

/** Il primo giorno del mese che contiene quel giorno. */
export function primoGiornoDelMese(giorno) {
  const g = soloData(giorno)
  return /^\d{4}-\d{2}-\d{2}$/.test(g) ? `${g.slice(0, 7)}-01` : ''
}

/** L'ultimo giorno del mese che contiene quel giorno (28, 29, 30 o 31). */
export function ultimoGiornoDelMese(giorno) {
  const t = _daStringa(giorno)
  if (!t) return ''
  // Il giorno 0 del mese dopo è l'ultimo di questo: vale anche a dicembre e
  // per il 29 febbraio degli anni bisestili.
  return _aStringa(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)))
}

/** Tutti i giorni da `da` ad `a`, estremi compresi. Array vuoto se l'ordine è rovesciato. */
export function giorniTra(da, a) {
  const n = differenzaGiorni(da, a)
  if (!Number.isFinite(n) || n < 0) return []
  const out = []
  for (let i = 0; i <= n; i++) out.push(aggiungiGiorni(da, i))
  return out
}

// ── Il giorno italiano, spostato ───────────────────────────────────────
//
// Da usare nei cron e nei webhook, dove `new Date()` è un istante UTC e
// `formatLocalDate()` darebbe il giorno di Greenwich. `ieriItaliano()` è
// quello che serve alla sync notturna del delivery: il cron gira alle 02:00
// UTC, cioè alle 03:00 o 04:00 italiane, e «ieri» deve essere ieri per Mara.
export function giorniFaItaliano(n, quando = new Date()) {
  return aggiungiGiorni(giornoItaliano(quando), -Number(n || 0))
}

export function ieriItaliano(quando = new Date()) {
  return giorniFaItaliano(1, quando)
}

// ── La finestra di un giorno ITALIANO, per chi gira su un server ───────
//
// `inizioGiornoLocale` guarda il fuso della macchina: nel browser è quello di
// Mara, su Vercel è UTC. Per i webhook e i cron serve la versione che dice
// Roma comunque, senza portarsi dietro una libreria dei fusi.
//
// Lo scarto si chiede a Intl: si formatta l'istante a Roma, lo si rilegge come
// se fosse UTC, e la differenza è l'offset di quel momento (+2 d'estate, +1
// d'inverno). Serve una seconda passata perché nei due giorni del cambio ora
// l'offset di partenza non è quello di arrivo.
const _FMT_ROMA_ISTANTE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function _scartoRoma(istante) {
  const p = {}
  for (const { type, value } of _FMT_ROMA_ISTANTE.formatToParts(istante)) p[type] = value
  // Qualche runtime scrive '24' invece di '00' per la mezzanotte.
  const h = Number(p.hour) % 24
  const comeSeUTC = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second)
  return comeSeUTC - istante.getTime()
}

/** L'istante ISO in cui comincia quel giorno a Roma. */
export function inizioGiornoItaliano(giorno) {
  const mezzanotteUTC = _daStringa(giorno)
  if (!mezzanotteUTC) return ''
  const primoTiro = new Date(mezzanotteUTC.getTime() - _scartoRoma(mezzanotteUTC))
  return new Date(mezzanotteUTC.getTime() - _scartoRoma(primoTiro)).toISOString()
}

/** L'istante ISO in cui comincia il giorno DOPO a Roma: confine alto, da usare con `<`. */
export function fineGiornoItaliano(giorno) {
  return inizioGiornoItaliano(aggiungiGiorni(giorno, 1))
}

// Il giorno italiano di un valore che arriva da un fornitore esterno.
//
// Le integrazioni (SumUp, Cassa in Cloud, Zucchetti) mandano a volte un
// GIORNO già fatto ('2026-10-16'), a volte un ISTANTE ('2026-10-15T22:30:00Z').
// Sono due cose diverse e vanno trattate diversamente: il primo si prende
// così com'è, il secondo va portato a Roma. Tagliare i primi dieci caratteri
// a entrambi — che è quello che facevamo — funziona solo sul primo: un
// incasso delle 00:30 di Torino risultava della sera prima.
export function giornoItalianoDi(v) {
  if (!v) return ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim()
  return giornoItaliano(v)
}

/**
 * Il giorno che viene N mesi dopo, col giorno del mese tenuto dentro il mese
 * di arrivo: 31 gennaio più un mese è il 28 (o il 29) febbraio, non il 3 marzo.
 *
 * `d.setMonth(d.getMonth() + 1)` su un 31 gennaio scavalca in marzo, e nel
 * planning dei turni «mese successivo» saltava febbraio.
 */
export function aggiungiMesi(giorno, n) {
  const g = soloData(giorno)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return ''
  const [y, m, d] = g.split('-').map(Number)
  const totale = (y * 12) + (m - 1) + Number(n || 0)
  const ay = Math.floor(totale / 12)
  const am = (totale % 12 + 12) % 12
  const ultimo = new Date(Date.UTC(ay, am + 1, 0)).getUTCDate()
  return `${ay}-${String(am + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

/** Il mese corrente come 'AAAA-MM', nel fuso di chi guarda. */
export function meseLocale(oggi = new Date()) {
  return formatLocalDate(oggi).slice(0, 7)
}
