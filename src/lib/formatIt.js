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

// ─── Leggere un prezzo, non solo scriverlo ──────────────────────────────────
//
// Nato in `views/MateriePrimeView.jsx` il 18/09/2026, spostato qui lo stesso
// giorno: le due porte da cui entra il prezzo di una materia prima — la
// pagina Materie prime e la finestra del prezzo in Nuovo gusto — lo leggevano
// in due modi diversi. Una lo rifiutava, l'altra lo accettava storto. Due
// regole per lo stesso dato vuol dire che prima o poi divergono, ed era già
// successo.

/**
 * Legge un prezzo al chilo scritto a mano. Ritorna il numero, o `null` se non
 * è un prezzo.
 *
 * Difetto trovato dai test il 18/09/2026: si usava `parseFloat`, che legge
 * quanto può e butta via il resto. Scrivendo **«12,5o»** — la o al posto dello
 * zero, l'errore di battitura più comune sulla tastiera del telefono —
 * `parseFloat('12.5o')` risponde `12.5` senza un fiato: il prezzo veniva
 * salvato a 12,50 €/kg come se fosse stato scritto bene. Su «abc» l'errore si
 * vedeva, su «12,5o» no, ed è il caso che capita davvero.
 *
 * Qui la stringa deve essere un prezzo per intero, non «cominciare» per
 * prezzo. I punti prima della virgola sono le migliaia, come si scrive in
 * Italia: «1.234,50» sono milleduecentotrentaquattro euro e cinquanta.
 *
 * ── Il punto senza virgola: regola del titolare, 18/09/2026 ───────────────
 *
 * «Di base comunque il punto sono le migliaia, la virgola i decimali.» È la
 * convenzione italiana, e da oggi vale anche quando la virgola non c'è.
 * Prima il punto era sempre e solo un decimale, quindi **«1.250» rispondeva
 * 1,25**: mille volte meno di quello che chi lo scrive intende quasi sempre.
 * Nel listino vero di Mara la bacca di vaniglia sta a 380 €/kg e lo zafferano
 * a migliaia: i prezzi a quattro cifre non sono un caso di scuola.
 *
 * Due forme restano decimali, e non per indulgenza ma perché come migliaia
 * non esistono:
 *
 *   - **il punto seguito da un numero di cifre diverso da tre** — «1.25»,
 *     «12.5», «0.8825». Le migliaia italiane vogliono gruppi da tre esatte;
 *     qui il punto è un decimale battuto all'inglese, da chi copia da un
 *     gestionale, e di letture sensate ce n'è una sola. In archivio i prezzi
 *     hanno quattro decimali, quindi «0.8825» deve restare 0,8825;
 *   - **il gruppo di testa che comincia per zero** — «0.950». In italiano non
 *     si scrive «zeromila novecentocinquanta»: quello è il prezzo della farina
 *     al chilo, novantacinque centesimi, e leggerlo 950 €/kg sarebbe l'errore
 *     più caro di tutti.
 *
 * Resta incerto un caso solo — punto solo, niente virgola, tre cifre dopo,
 * niente zero di testa: «1.250», «12.500». Lì questa funzione applica la
 * regola italiana e risponde 1250, mentre `letturaPrezzoKg` (sotto) dice anche
 * che il dubbio c'è, così la schermata può chiedere invece di indovinare.
 */
export function leggiPrezzoKg(testo) {
  const g = String(testo ?? '').trim()
  if (!g) return null
  // Con la virgola non c'è niente da interpretare: la virgola sono i
  // decimali, e i punti che la precedono sono le migliaia.
  if (g.includes(',')) {
    const c = g.replace(/\./g, '').replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(c)) return null
    const v = Number(c)
    return Number.isFinite(v) ? v : null
  }
  // Solo cifre.
  if (/^\d+$/.test(g)) return Number(g)
  // Migliaia all'italiana: gruppi da tre, e il primo non comincia per zero.
  if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(g)) return Number(g.replace(/\./g, ''))
  // Un punto solo, con un gruppo che migliaia non può essere: è un decimale.
  if (/^\d+\.\d+$/.test(g)) {
    const v = Number(g)
    return Number.isFinite(v) ? v : null
  }
  return null
}

/**
 * Legge un prezzo al chilo e dice anche **quando non è sicura di averlo
 * capito**, invece di decidere da sola.
 *
 * Il caso, deciso col titolare il 18/09/2026: «1.250». La regola italiana vale
 * e vince — sono milleduecentocinquanta, ed è quello che risponde `valore` —
 * ma il punto è anche il decimale di chi copia e incolla da un gestionale in
 * inglese. Fra 1,25 €/kg e 1.250 €/kg ci sono tre ordini di grandezza, e il
 * numero finisce nel food cost di tutte le ricette che usano quella materia
 * prima: sbagliarlo di mille volte non si nota guardando la riga, si nota a
 * fine mese nel margine.
 *
 * Quindi qui non si indovina di nascosto: si applica la regola italiana e si
 * dice che l'altra lettura esiste, così la schermata può proporla a parole.
 *
 * **L'incertezza è una sola, ed è stretta apposta:** un punto solo, nessuna
 * virgola, esattamente tre cifre dopo, e il gruppo di testa che non comincia
 * per zero. Tutto il resto si legge senza doverlo chiedere:
 *
 *   - `1.25`, `12.5`, `1.2500` → un numero di cifre diverso da tre dopo il
 *                         punto: come migliaia non esiste, è un decimale;
 *   - `0.950`           → «zeromila novecentocinquanta» non si scrive: è la
 *                         farina a novantacinque centesimi;
 *   - `1.250.000`       → più punti: sono migliaia, e si legge 1250000;
 *   - `1,250`, `1.250,50` → c'è la virgola, e la virgola decide;
 *   - `380`             → niente punti, niente da chiedere.
 *
 * Gli spazi intorno e il simbolo dell'euro si tolgono prima di leggere: «12,50 €»
 * è il modo in cui il prezzo è scritto su ogni schermata di questo prodotto, e
 * rileggerlo copiandolo da lì deve funzionare. È l'unico punto in cui questa
 * funzione è più tollerante di `leggiPrezzoKg`, che su «12,50 €» risponde
 * `null`.
 *
 * @param {string} testo  il prezzo come l'ha scritto una persona
 * @returns {{valore: number|null, ambiguo: boolean, comeDecimale: number|null, comeMigliaia: number|null}}
 *   `valore` il numero letto con la regola italiana (o `null` se non è un
 *   prezzo); `ambiguo` vero solo nel caso incerto; `comeDecimale` e
 *   `comeMigliaia` le due letture possibili, valorizzate **solo** quando
 *   `ambiguo` è vero. Quando lo è, `valore` è uguale a `comeMigliaia`.
 */
export function letturaPrezzoKg(testo) {
  const pulito = String(testo ?? '').replace(/€/g, '').trim()
  const valore = leggiPrezzoKg(pulito)
  const incerto = /^[1-9]\d{0,2}\.\d{3}$/.test(pulito)
  if (!incerto || valore === null) {
    return { valore, ambiguo: false, comeDecimale: null, comeMigliaia: null }
  }
  return {
    valore,
    ambiguo: true,
    comeDecimale: Number(pulito),
    comeMigliaia: valore,
  }
}
