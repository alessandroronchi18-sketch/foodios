// ── Il nome di un gusto nel foglio e la sua ricetta ────────────────────────
//
// 03/10/2026, audit dello Storico. Nel foglio dell'inventario di Mara dei
// Boschi i gusti si chiamano come li scrive chi compila: MISTIC (la ricetta è
// MYSTIC), YOGURT (YOGURT GRECO), LIQUIRIZIA +BASILICO (LIQUIRIZIA E
// BASILICO), CAFFÈ FLORA (CAFFÈ), AMOR FOU («AMOUR FOU, MYSTIC, LIMONE»), e
// SANTA PAZIENZA accanto a SANTAPAZIENZA. Il programma cercava la ricetta con
// lo stesso nome e, non trovandola, valutava quel gelato zero euro: nella
// finestra di apertura 12 gusti su 28, 1.181 kg venduti, circa 34.800 € di
// ricavo che non entravano da nessuna parte. L'avviso diceva «sistema le
// ricette», senza un modo per farlo dalla pagina.
//
// Prima di scrivere questo file si è cercato un meccanismo già esistente: i
// nomi alternativi ci sono solo sui formati di vendita (`alias` di
// FormatiVendita). Per i gusti niente.
//
// ── Perché una chiave a parte e non un campo nella ricetta ────────────────
// L'editor delle ricette (NuovaRicettaView.doSaveRicetta) ricostruisce la
// ricetta dal modulo a ogni salvataggio: un campo in più sparirebbe alla
// prima modifica, e il collegamento con lui. Quindi i collegamenti stanno in
// `pasticceria-nomi-gusti-v1` (una per azienda, come il ricettario):
//
//   { versione: 1,
//     nomi: { 'MISTIC': { ricetta: 'MYSTIC', il: '2026-10-03T…', utente } } }
//
// La chiave del nome è `normGusto` (maiuscolo, senza spazi ai lati), la stessa
// con cui l'inventario indicizza le righe.
import { normGusto } from './normGusto'

/** La mappa com'è salvata, ripulita: un valore storto vale «vuota». */
export function leggiNomiGusti(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  const nomi = {}
  const sorgente = o.nomi && typeof o.nomi === 'object' && !Array.isArray(o.nomi) ? o.nomi : {}
  for (const [k, val] of Object.entries(sorgente)) {
    const nome = normGusto(k)
    const ricetta = typeof val === 'string' ? val : val?.ricetta
    if (!nome || !ricetta || typeof ricetta !== 'string') continue
    nomi[nome] = typeof val === 'string' ? { ricetta } : { ...val, ricetta }
  }
  return { versione: 1, nomi }
}

/**
 * La mappa con un collegamento in più (o in meno, con `ricetta` null).
 * Non tocca quella che riceve.
 */
export function collegaNome(mappa, nome, ricetta, { utente = null, adesso = new Date().toISOString() } = {}) {
  const m = leggiNomiGusti(mappa)
  const k = normGusto(nome)
  if (!k) return m
  if (!ricetta) { delete m.nomi[k]; return m }
  m.nomi[k] = { ricetta: String(ricetta), il: adesso, utente }
  return m
}

/** La ricetta (chiave del ricettario) collegata a un nome, o null. */
export function ricettaCollegata(mappa, nome) {
  const m = leggiNomiGusti(mappa)
  return m.nomi[normGusto(nome)]?.ricetta || null
}

// ── Quale ricetta proporre per un nome ─────────────────────────────────────
// Solo un aiuto: si propongono le più simili, decide il titolare. Il nome si
// confronta senza accenti, punteggiatura e congiunzioni («E», «+»), perché
// «LIQUIRIZIA +BASILICO» e «LIQUIRIZIA E BASILICO» sono lo stesso gusto.
const PAROLE_VUOTE = new Set(['E', 'ED', 'CON', 'AL', 'ALLA', 'DI', 'DEL', 'DELLA'])
function pulito(s) {
  return normGusto(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/).filter(p => p && !PAROLE_VUOTE.has(p))
}
function distanza(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prec = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prec = cur
  }
  return prec[n]
}
function somiglianza(nome, ricetta) {
  const pa = pulito(nome), pb = pulito(ricetta)
  if (!pa.length || !pb.length) return 0
  const a = pa.join(''), b = pb.join('')
  if (a === b) return 1
  // Parole in comune, anche scritte quasi uguali (MISTIC / MYSTIC).
  let comuni = 0
  for (const x of pa) {
    if (pb.some(y => y === x || (Math.min(x.length, y.length) >= 4 && distanza(x, y) <= 1))) comuni++
  }
  const parole = comuni / pa.length
  const lettere = 1 - distanza(a, b) / Math.max(a.length, b.length)
  // Il nome del foglio è l'inizio della ricetta (YOGURT → YOGURT GRECO).
  const inizio = b.startsWith(a) || a.startsWith(b) ? 0.85 : 0
  // A parità, vince la ricetta scritta più simile lettera per lettera:
  // MISTIC è MYSTIC prima di «AMOUR FOU, MYSTIC, LIMONE», YOGURT è YOGURT
  // GRECO prima di «YOGURT GRECO, MIELE E SESAMO».
  return Math.max(parole * 0.9, lettere, inizio) * 0.95 + Math.max(0, lettere) * 0.05
}

/**
 * Le ricette più simili a un nome, dalla più simile: [{ chiave, nome, punti }].
 * Solo i gusti (niente semilavorati né basi), e solo sopra una soglia.
 */
export function ricetteSimili(nome, ricettario, { quante = 3, soglia = 0.6 } = {}) {
  const out = []
  for (const [chiave, r] of Object.entries(ricettario?.ricette || {})) {
    const tipo = String(r?.tipo || '').toLowerCase()
    if (tipo === 'semilavorato' || tipo === 'interno') continue
    const punti = somiglianza(nome, r?.nome || chiave)
    if (punti >= soglia) out.push({ chiave, nome: r?.nome || chiave, punti })
  }
  return out.sort((x, y) => y.punti - x.punti || x.nome.localeCompare(y.nome)).slice(0, quante)
}
