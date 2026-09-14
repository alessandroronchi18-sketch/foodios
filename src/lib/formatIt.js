// Numeri come si scrivono in italiano, in un posto solo.
//
// Perché esiste questo file: gli helper stavano in `views/_shared.jsx`, che è
// un modulo React. Le funzioni serverless in `api/` e la generazione dei PDF
// non possono importarlo, quindi si erano riscritte i formattatori a mano —
// con `toFixed(1)`, che usa SEMPRE il punto. Il risultato era che nella stessa
// schermata si leggeva "418,30 €" di incasso e "71.0%" di margine, e nella
// stessa email "1.477 €" di ricavi e "34.2%" di food cost.
//
// Qui non c'è JSX, quindi lo importano sia il client sia `api/`.
//
// CRITICAL FIX 2026-06-25 (da non perdere): in alcuni runtime (Node senza ICU
// completo, Safari iOS in navigazione privata) `toLocaleString('it-IT')` senza
// opzioni esplicite ritorna "9628" senza separatore migliaia. Per questo ogni
// formattatore dichiara `useGrouping` e i decimali, invece di affidarsi ai
// valori di default.

const NF_IT_2DEC = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const NF_IT_0DEC = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' })
const NF_IT_PCT = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const NF_IT_PCT0 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' })

// Guard su NaN/undefined: chiusure da import possono avere kpi parziali
// (es. kpi:{} senza totV) e senza guard si leggeva "€ NaN".
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// Importo con 2 decimali: 1.234,56 €. Il simbolo va DOPO la cifra.
export const fmt = v => `${NF_IT_2DEC.format(num(v))} €`

// Importo arrotondato all'unità: 1.234 €. Per i box e i KPI grandi.
export const fmt0 = v => `${NF_IT_0DEC.format(Math.round(num(v)))} €`

// Percentuale con un decimale e la virgola: 34,2%.
export const fmtp = v => `${NF_IT_PCT.format(num(v))}%`

// Percentuale senza decimali: 34%. Per le etichette strette e i grafici.
export const fmtp0 = v => `${NF_IT_PCT0.format(Math.round(num(v)))}%`

// Percentuale col segno davanti, per i confronti: +12,3% / -4,0%.
export const fmtpSegno = v => `${num(v) >= 0 ? '+' : ''}${fmtp(v)}`

// Percentuale col segno e senza decimali: +12% / -4%.
export const fmtp0Segno = v => `${num(v) >= 0 ? '+' : ''}${fmtp0(v)}`
