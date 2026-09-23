// La scheda del fornitore, compilata dalla sua bolla.
//
// ── Perché ───────────────────────────────────────────────────────────────
//
// Ogni bolla porta in testata tutto quello che serve per l'anagrafica, e
// finora lo buttavamo via. Sulle 32 bolle vere del design partner
// (22/09/2026) la testata contiene, a seconda del fornitore:
//
//   Vecchio Enrico   nome, via, CAP, città, provincia, telefono, P.IVA,
//                    codice fiscale, REA, email, IBAN, banca, «BONIFICO
//                    BANCARIO»
//   ConoArtic        nome, via, CAP, città, sito, email, **telefono e
//                    WhatsApp**, P.IVA, REA, «BONIFICO BANC.RICEVIM.FATTURA»
//   Galatea          nome, due sedi, P.IVA, REA, telefono, email, IBAN,
//                    SWIFT, «BONIFICO BANCARIO 30 GG.»
//   DESA             nome, via, CAP, città, telefono, fax, email, P.IVA,
//                    «PAGAMENTO ALLA CONSEGNA»
//   La Foglia        nome, due sedi, telefono, fax, cellulare, email, PEC,
//                    C.F. e P.IVA, IBAN
//
// Cioè: **tutti** i campi dell'anagrafica fornitori, tranne il minimo
// d'ordine e il lead time, che sulla bolla non ci sono.
//
// ── La regola di questo file ─────────────────────────────────────────────
//
// Un dato sbagliato in anagrafica è peggio di un dato mancante: una P.IVA
// storta fa rimbalzare la fattura elettronica, un IBAN storto manda un
// bonifico nel posto sbagliato. Quindi qui **ogni campo che ha un modo di
// essere verificato viene verificato**, e se non passa il controllo non
// esce: esce `null`, che vuol dire «non lo so».
//
//   • P.IVA — undici cifre con la cifra di controllo (algoritmo di Luhn
//     all'italiana). «04210170041» passa, «04210170042» no.
//   • IBAN — ventisette caratteri e il resto 97 (ISO 13616). Quello di
//     Vecchio Enrico, IT70U0306922540100000008183, passa.
//   • Codice fiscale — sedici caratteri nella forma giusta.
//   • Email — una forma, non una fantasia.
//
// Quello che non si può verificare (il nome, la via) esce così com'è letto,
// e chi guarda la schermata lo conferma prima che venga salvato: la scheda
// si **propone**, non si scrive da sola.

/** Solo le cifre. */
const cifre = (v) => String(v ?? '').replace(/\D+/g, '')

/**
 * La partita IVA italiana è valida?
 *
 * Undici cifre, l'ultima è di controllo: si sommano le cifre di posto
 * dispari così come sono, quelle di posto pari raddoppiate (e se vengono
 * più di nove si tolgono nove), e il totale deve chiudere alla decina.
 */
export function partitaIvaValida(v) {
  const n = cifre(v)
  if (n.length !== 11) return false
  // Undici zeri passerebbero il conto ma non sono una partita IVA.
  if (/^0{11}$/.test(n)) return false
  let somma = 0
  for (let i = 0; i < 11; i++) {
    let c = Number(n[i])
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9 }
    somma += c
  }
  return somma % 10 === 0
}

/**
 * L'IBAN è valido?
 *
 * Si sposta la testa in coda, si traducono le lettere in numeri (A=10 … Z=35)
 * e il numerone che ne esce deve dare resto 1 diviso 97. Un IBAN sbagliato
 * non è un bonifico che torna indietro: spesso è un bonifico che arriva a
 * qualcun altro.
 */
export function ibanValido(v) {
  const s = String(v ?? '').toUpperCase().replace(/[\s.-]/g, '')
  if (!/^IT\d{2}[A-Z]\d{10}[0-9A-Z]{12}$/.test(s)) return false
  const girato = s.slice(4) + s.slice(0, 4)
  let resto = 0
  for (const ch of girato) {
    const v2 = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of v2) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

/** L'IBAN come lo vuole il SEPA: maiuscolo, senza spazi. */
export function normalizzaIban(v) {
  const s = String(v ?? '').toUpperCase().replace(/[\s.-]/g, '')
  return ibanValido(s) ? s : null
}

const CF = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/

/** Il codice fiscale di una persona fisica ha una forma sola. */
export function codiceFiscaleValido(v) {
  return CF.test(String(v ?? '').toUpperCase().replace(/\s+/g, ''))
}

const EMAIL = /\b[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\b/i

/**
 * Il numero di telefono, in forma leggibile.
 *
 * Non lo si porta in E.164 di nascosto: un prefisso indovinato è un numero
 * che non risponde. Si toglie solo la punteggiatura, e il prefisso
 * internazionale si mette **solo** se c'era.
 */
export function telefonoPulito(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const inter = /^\+/.test(s) || /^00\d/.test(s)
  const n = cifre(s)
  if (n.length < 6 || n.length > 15) return null
  if (inter) return `+${n.replace(/^00/, '')}`
  return n
}

// ── Le condizioni di pagamento, come le scrivono i fornitori ─────────────
//
// Cinque modi diversi di dire tre cose, letti dalle bolle vere.
const CONDIZIONI = [
  { re: /pagamento\s+alla\s+cons/i, giorni: 0, tipo: 'netti', detto: 'alla consegna' },
  { re: /rimessa\s+diretta|contrassegno|contanti\s+alla\s+consegna/i, giorni: 0, tipo: 'netti', detto: 'alla consegna' },
  { re: /(\d{1,3})\s*gg?\.?\s*f\.?m\.?|(\d{1,3})\s*giorni\s+fine\s+mese|fine\s+mese\s+(\d{1,3})/i, tipo: 'fine_mese' },
  { re: /(\d{1,3})\s*(?:gg|giorni)\b/i, tipo: 'netti' },
  // «BONIFICO BANC.RICEVIM.FATTURA»: si paga quando arriva la fattura, che
  // non è un numero di giorni. Non si inventa: si dice che non si sa.
  { re: /ricevim\.?\s*fattura|ricevimento\s+fattura|vista\s+fattura/i, giorni: null, tipo: 'netti', detto: 'al ricevimento della fattura' },
]

/**
 * Da «BONIFICO BANCARIO 30 GG.» a `{giorni: 30, tipo: 'netti'}`.
 *
 * `giorni: null` vuol dire «non lo so», e va tenuto: l'anagrafica ha 30 come
 * valore di partenza, ma 30 dedotto e 30 letto sono due cose diverse.
 */
export function condizioniPagamento(testo) {
  const t = String(testo ?? '')
  if (!t.trim()) return null
  for (const c of CONDIZIONI) {
    const m = t.match(c.re)
    if (!m) continue
    if (c.giorni !== undefined) return { giorni: c.giorni, tipo: c.tipo, detto: c.detto, testo: m[0].trim() }
    const n = Number(m[1] || m[2] || m[3])
    if (!Number.isFinite(n) || n < 0 || n > 365) continue
    return { giorni: n, tipo: c.tipo, detto: null, testo: m[0].trim() }
  }
  return null
}

const PROVINCE = 'AG|AL|AN|AO|AP|AQ|AR|AT|AV|BA|BG|BI|BL|BN|BO|BR|BS|BT|BZ|CA|CB|CE|CH|CL|CN|CO|CR|CS|CT|CZ|EN|FC|FE|FG|FI|FM|FR|GE|GO|GR|IM|IS|KR|LC|LE|LI|LO|LT|LU|MB|MC|ME|MI|MN|MO|MS|MT|NA|NO|NU|OR|PA|PC|PD|PE|PG|PI|PN|PO|PR|PT|PU|PV|PZ|RA|RC|RE|RG|RI|RM|RN|RO|SA|SI|SO|SP|SR|SS|SV|TA|TE|TN|TO|TP|TR|TS|TV|UD|VA|VB|VC|VE|VI|VR|VT|VV'

/**
 * Tutto quello che si può sapere del fornitore, letto dal testo della bolla.
 *
 * @param {string} testo  la testata del documento, come esce dal riconoscimento
 * @param {object} [gia]  quello che il riconoscimento ha già messo nei suoi campi
 * @returns {{campi: object, dubbi: string[], quanti: number}}
 *   `campi` ha le stesse chiavi della tabella `fornitori`; un campo che non
 *   si sa non c'è. `dubbi` sono le cose lette ma non verificabili.
 */
export function datiFornitoreDaBolla(testo, gia = {}) {
  const t = String(testo ?? '')
  const campi = {}
  const dubbi = []

  const nome = String(gia?.fornitore || gia?.nome || '').trim()
  if (nome) campi.nome = nome

  // ── P.IVA e codice fiscale ────────────────────────────────────────────
  //
  // Sulla bolla ci sono **due** partite IVA: la sua e la tua. Si prendono
  // solo quelle scritte accanto a una parola che le annuncia, e si scartano
  // quelle che stanno nel riquadro del destinatario («Spett.le»).
  const piva = new Set()
  for (const m of t.matchAll(/\b(?:p\.?\s*iva|partita\s+iva|vat|p\.\s*i\.)[^0-9]{0,20}(IT)?\s*(\d{11})\b/gi)) {
    if (partitaIvaValida(m[2])) piva.add(m[2])
  }
  const cf = new Set()
  for (const m of t.matchAll(/\bc\.?\s*f\.?\b[^A-Z0-9]{0,20}([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/gi)) {
    if (codiceFiscaleValido(m[1])) cf.add(m[1].toUpperCase())
  }
  const tue = new Set([...String(gia?.pivaCliente || '').split(/\D+/).filter(Boolean)])
  const suePiva = [...piva].filter(p => !tue.has(p))
  if (suePiva.length === 1) campi.partita_iva = suePiva[0]
  else if (suePiva.length > 1) dubbi.push(`sul documento ci sono ${suePiva.length} partite IVA (${suePiva.join(', ')}): scegli tu quale è la sua`)
  if (cf.size === 1) campi.codice_fiscale = [...cf][0]

  // ── IBAN ──────────────────────────────────────────────────────────────
  const iban = new Set()
  for (const m of t.matchAll(/\bIT\d{2}\s?[A-Z]\s?(?:\d[\s]?){10}(?:[0-9A-Z][\s]?){12}/gi)) {
    const v = normalizzaIban(m[0])
    if (v) iban.add(v)
  }
  if (iban.size === 1) campi.iban = [...iban][0]
  else if (iban.size > 1) dubbi.push(`ho trovato ${iban.size} IBAN: controlla quale è quello su cui paghi`)

  // ── Email ─────────────────────────────────────────────────────────────
  //
  // La PEC non è l'indirizzo a cui si scrive per ordinare: se ci sono
  // tutt'e due, l'ordinaria vince e la PEC finisce nelle note.
  const mail = [...new Set([...t.matchAll(new RegExp(EMAIL, 'gi'))].map(m => m[0].toLowerCase()))]
  const pec = mail.filter(m => /@pec\.|@.*\.pec\.|pec@/.test(m))
  const normali = mail.filter(m => !pec.includes(m))
  if (normali.length >= 1) campi.email = normali[0]
  if (normali.length > 1) dubbi.push(`ci sono ${normali.length} indirizzi email (${normali.join(', ')}): ho preso il primo`)
  if (pec.length) campi.pec = pec[0]

  // ── Telefono, e il WhatsApp quando lo dichiara ────────────────────────
  //
  // ConoArtic scrive «Tel e Whatsapp - 0116964241»: è l'unico posto in tutto
  // il prodotto dove un numero WhatsApp di un fornitore è dichiarato da lui.
  const wa = t.match(/whats\s?app[^0-9+]{0,20}((?:\+?\d[\s./-]?){6,20})/i)
  if (wa) {
    const n = telefonoPulito(wa[1])
    if (n) { campi.whatsapp = n; if (!campi.telefono) campi.telefono = n }
  }
  const tel = t.match(/\b(?:tel|telefono|cell|cellulare|t\.)\b[^0-9+]{0,15}((?:\+?\d[\s./-]?){6,20})/i)
  if (tel && !campi.telefono) {
    const n = telefonoPulito(tel[1])
    if (n) campi.telefono = n
  }

  // ── Indirizzo ─────────────────────────────────────────────────────────
  //
  // Il CAP italiano è cinque cifre, e accanto c'è il comune. È l'aggancio
  // più solido: la via, invece, si scrive in venti modi.
  const luogo = t.match(new RegExp(`\\b(\\d{5})\\s+([A-Za-zÀ-ÿ'’.\\- ]{2,40}?)\\s*(?:\\(?\\b(${PROVINCE})\\b\\)?)?(?=[\\n,;]|$)`, 'm'))
  if (luogo) {
    campi.cap = luogo[1]
    // «10127 - Torino» e «33170 – Pordenone»: il trattino separa il CAP dal
    // comune, non fa parte del nome. Via anche la virgola e i due punti.
    campi.citta = luogo[2].replace(/^[\s\-–—,:.]+/, '').replace(/[\s,;.]+$/, '').replace(/\s{2,}/g, ' ')
    if (luogo[3]) campi.provincia = luogo[3].toUpperCase()
  }
  const via = t.match(/\b((?:via|v\.le|viale|corso|c\.so|piazza|p\.zza|strada|str\.|località|loc\.|borgo|vicolo|largo)\s+[A-Za-zÀ-ÿ'’.\- ]{2,40}[, ]+\d{1,4}\s?\/?\s?[A-Za-z]?)\b/i)
  if (via) campi.indirizzo = via[1].replace(/\s{2,}/g, ' ').trim()

  // ── Condizioni di pagamento ───────────────────────────────────────────
  const cond = condizioniPagamento(t)
  if (cond) {
    campi.termini_tipo = cond.tipo
    if (cond.giorni != null) campi.termini_pagamento = cond.giorni
    else dubbi.push(`le condizioni dicono «${cond.detto || cond.testo}»: non è un numero di giorni, i termini restano quelli che hai messo tu`)
  }

  // ── Sito ──────────────────────────────────────────────────────────────
  const sito = t.match(/\b(?:www\.[a-z0-9-]+\.[a-z]{2,}|https?:\/\/[^\s]+)/i)
  if (sito) campi.sito = sito[0].replace(/[.,;]$/, '')

  return { campi, dubbi, quanti: Object.keys(campi).length }
}

/**
 * Cosa cambierebbe davvero, se si salvasse.
 *
 * Non si sovrascrive mai niente di scritto a mano: un campo che c'è già
 * resta com'è, e la differenza si mostra perché la decida una persona. È la
 * stessa regola dell'import dei prezzi, scelta dal titolare il 22/09/2026:
 * «comanda il prezzo caricato con la bolla di magazzino, se no il prezzo che
 * ho inserito io a mano» — qui l'anagrafica è la parte scritta a mano.
 */
export function differenzeScheda(esistente = {}, campi = {}) {
  const vuoti = []
  const diversi = []
  for (const [k, v] of Object.entries(campi)) {
    if (v == null || v === '') continue
    const attuale = esistente?.[k]
    if (attuale == null || String(attuale).trim() === '') { vuoti.push({ campo: k, nuovo: v }); continue }
    if (String(attuale).trim().toLowerCase() !== String(v).trim().toLowerCase()) {
      diversi.push({ campo: k, attuale: String(attuale), nuovo: v })
    }
  }
  return { vuoti, diversi }
}
