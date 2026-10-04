// ── Produzione: quanto vale quello che si è prodotto e venduto ─────────────
//
// Il conto per gusto dello Storico produzione (metodo a inventario), tolto
// dalla pagina e messo qui, senza schermo e senza database, perché si possa
// provare con i numeri veri.
//
// ── Perché esiste (03/10/2026) ────────────────────────────────────────────
//
// La pagina faceva questo conto per conto suo, due volte (periodo e periodo
// di confronto), e tutte e due le copie chiamavano
// `calcolaFC(ricetta, ricettario)`: la firma vera è
// `calcolaFC(ricetta, ingCosti, ricettario)`. Al posto dei prezzi degli
// ingredienti arrivava il ricettario, quindi nessun ingrediente aveva prezzo.
// In più leggevano `.foodCost`, un campo che `calcolaFC` non restituisce
// (restituisce `tot`). Il food cost di ogni gusto era zero e il margine il
// 100% del ricavo. Sui dati di Mara dei Boschi, 03/08-03/10, tutte le sedi:
// «Margine 88.970 € (100,0%)», contro 75.087 € (84,4%) veri.
//
// Lo stesso difetto era già stato corretto nel conto economico (PLView), ma
// questa copia non era mai stata allineata. E anche quella correzione aveva un
// secondo errore: `calcolaFC` dà il costo dell'impasto INTERO, non di un chilo.
// BOCUSE costa 8,31 € per 1.192 g di impasto: 6,97 €/kg, non 8,31. Su Mara 11
// ricette su 15 hanno una resa diversa da 1.000 g, e il food cost usciva più
// alto del 10%. Qui si divide per la resa, come fa già il listino del conto
// economico (`resaGrammi`).
import { calcolaFC, isRicettaValida, resaGrammi } from './foodcost'

/**
 * Il costo delle materie prime di UN CHILO di gusto finito.
 *
 * Ritorna { fcKg, mancanti, completo }:
 *   - fcKg: €/kg, o null se la ricetta non ha un peso (né resa né ingredienti);
 *   - mancanti: gli ingredienti senza prezzo (dentro le basi compresi);
 *   - completo: c'è un costo e nessun ingrediente manca. Un costo a metà
 *     non è un costo: il margine che ne esce è più alto del vero.
 */
export function costoAlKgGusto(ric, ingCosti, ricettario) {
  if (!ric) return { fcKg: null, mancanti: [], completo: false }
  const { tot, mancanti } = calcolaFC(ric, ingCosti || {}, ricettario)
  const resaG = resaGrammi(ric)
  if (!(resaG > 0)) return { fcKg: null, mancanti: mancanti || [], completo: false }
  const fcKg = (Number(tot) || 0) / (resaG / 1000)
  return {
    fcKg,
    mancanti: mancanti || [],
    completo: fcKg > 0 && (mancanti || []).length === 0,
  }
}

/**
 * Il valore di ogni gusto in un periodo.
 *
 * `totali` è l'uscita di `totaliPerGusto` (grammi). Le dipendenze arrivano da
 * fuori perché la pagina le ha già (e i test le possono fingere):
 *   - ricettaDi(gusto)  → la ricetta del gusto, o null;
 *   - ricavoKgDi(ric)   → €/kg di vendita (dai formati), o null;
 *   - ingCosti, ricettario → per il food cost.
 *
 * La regola del margine: si calcola SOLO sui gusti che hanno sia il ricavo
 * sia il costo completo. Un gusto con il ricavo e senza costo farebbe un
 * margine del 100%, cioè lo stesso difetto di prima in un'altra forma. Quei
 * gusti restano nei chili e nel ricavo, e il totale dice su quanti gusti il
 * margine è calcolato.
 */
export function valutaGusti(totali, { ricettaDi, ricavoKgDi, ingCosti, ricettario } = {}) {
  const righe = []
  for (const [gusto, t] of Object.entries(totali || {})) {
    const ric = ricettaDi ? ricettaDi(gusto) : null
    const ricavoKg = ric ? (Number(ricavoKgDi ? ricavoKgDi(ric) : 0) || 0) : 0
    const costo = ric && isRicettaValida(ric.nome) ? costoAlKgGusto(ric, ingCosti, ricettario) : null
    const fcKg = Number(costo?.fcKg) || 0
    const prodKg = (Number(t?.prodTot) || 0) / 1000
    const vendKg = (Number(t?.vendTot) || 0) / 1000
    const scartoKg = (Number(t?.scartoTot) || 0) / 1000
    const ricavo = vendKg * ricavoKg
    // Il costo è quello di ciò che si è PRODOTTO: il gelato rimasto in vetrina
    // è già stato pagato, anche se non è ancora stato venduto.
    const fc = prodKg * fcKg
    const haRicavo = ricavoKg > 0
    const haFc = fcKg > 0
    const fcCompleto = !!costo?.completo
    const margine = haRicavo && fcCompleto ? ricavo - fc : null
    const margPct = margine != null && ricavo > 0 ? (margine / ricavo) * 100 : null
    righe.push({
      gusto,
      ricetta: ric?.nome || null,
      prodKg, vendKg, scartoKg,
      ricavoKg, fcKg, ricavo, fc, margine, margPct,
      haRicetta: !!ric, haRicavo, haFc, fcCompleto,
      mancanti: costo?.mancanti || [],
      celleNonQuadrate: Number(t?.celleNonQuadrate) || 0,
      celleNonCalcolabili: Number(t?.celleNonCalcolabili) || 0,
    })
  }
  return { righe, totali: sommaGusti(righe) }
}

/** I totali di un elenco di gusti valutati, con la stessa regola del margine. */
export function sommaGusti(righe) {
  let prod = 0, vend = 0, scarto = 0, ricavo = 0, fc = 0
  let margine = 0, ricavoConMargine = 0, nConMargine = 0, vendConMargine = 0
  let nConVendita = 0
  for (const r of righe || []) {
    prod += r.prodKg; vend += r.vendKg; scarto += r.scartoKg
    ricavo += r.ricavo; fc += r.fc
    // Un gusto senza movimenti nel periodo (una riga lasciata a zero) non
    // conta né fra quelli venduti né fra quelli col margine: «su 16 gusti su
    // 25» deve contare gusti veri.
    const attivo = r.vendKg !== 0 || r.prodKg !== 0
    if (attivo) nConVendita++
    if (r.margine != null) {
      margine += r.margine
      ricavoConMargine += r.ricavo
      vendConMargine += r.vendKg
      if (attivo) nConMargine++
    }
  }
  return {
    prod, vend, scarto, ricavo, fc,
    // null, non zero: se nessun gusto ha ricavo e costo, il margine non si sa.
    margine: nConMargine > 0 ? margine : null,
    margPct: nConMargine > 0 && ricavoConMargine > 0 ? (margine / ricavoConMargine) * 100 : null,
    ricavoConMargine, vendConMargine, nConMargine, nConVendita,
  }
}

// ── I giorni registrati, e quando due periodi si possono confrontare ───────
//
// 03/10/2026, audit dello Storico. All'apertura la pagina guardava gli ultimi
// due mesi (03/08-03/10) e li confrontava con i due mesi prima. Ma da
// settembre Mara non ha registrato niente: si confrontavano 29 giorni scritti
// con 62, e a schermo uscivano «Prodotto -71,6%, Venduto -70,8%, Ricavo
// -70,5%». Un dato che manca diventava un crollo delle vendite, e la pagina
// non diceva mai «l'ultimo giorno registrato è il 31/08».
//
// La regola (ANALISI_DESIGN.md, punto 2): mai confrontare 29 giorni
// registrati con 62. Si confronta il tratto in cui ci sono i dati con un
// tratto della stessa lunghezza, e solo se anche quello ha (quasi) gli stessi
// giorni registrati. Se no, il confronto non si fa e si dice perché.

/**
 * Una riga dice qualcosa? Conta come giornata registrata quella in cui il
 * foglio è stato compilato: un prodotto, una rimanenza, uno scarto.
 *
 * Una riga tutta a zero è una casella lasciata aperta. E una spedizione da
 * sola non basta: a Mara le uniche due righe di settembre sono ABIS il 07/09
 * (tutto zero) e ABIS il 15/09 con **1 grammo spedito** e nient'altro — una
 * prova del pulsante, non una giornata di gelateria. Contandole, settembre
 * sembrerebbe registrato fino al 15 e il confronto ripartirebbe da lì.
 */
export function rigaHaDati(r) {
  if (!r) return false
  return (Number(r.produzione_g) || 0) > 0
    || (r.rimanenza_g != null && Number(r.rimanenza_g) > 0)
    || (Number(r.scarto_g) || 0) > 0
}

/**
 * I giorni registrati in un periodo (`da`/`a` compresi, ISO).
 * Ritorna { giorni, n, primo, ultimo, perSede, sedeGiorni }: `sedeGiorni`
 * conta le giornate di negozio (una per sede e giorno), ed è quella che
 * decide se due periodi si confrontano: con tre sedi, un periodo in cui una
 * sede non ha scritto niente non vale l'altro anche se i giorni sono gli
 * stessi.
 */
export function giorniRegistrati(righe, { da = null, a = null } = {}) {
  const tutti = new Set()
  const perSedeSet = {}
  for (const r of righe || []) {
    if (!r?.data || !rigaHaDati(r)) continue
    if (da && r.data < da) continue
    if (a && r.data > a) continue
    tutti.add(r.data)
    const s = r.sede_id || '_'
    if (!perSedeSet[s]) perSedeSet[s] = new Set()
    perSedeSet[s].add(r.data)
  }
  const giorni = [...tutti].sort()
  const perSede = {}
  let sedeGiorni = 0
  for (const [s, set] of Object.entries(perSedeSet)) {
    const g = [...set].sort()
    perSede[s] = { n: g.length, primo: g[0], ultimo: g[g.length - 1] }
    sedeGiorni += g.length
  }
  return {
    giorni, n: giorni.length,
    primo: giorni[0] || null, ultimo: giorni[giorni.length - 1] || null,
    perSede, sedeGiorni,
  }
}

/** Quante giornate di differenza si accettano fra due periodi: il 10%. */
export const TOLLERANZA_GIORNI = 0.1

/**
 * Due periodi si possono confrontare? `cur` e `prev` sono uscite di
 * `giorniRegistrati`. Ritorna { ok, motivo } — il motivo è scritto per chi
 * legge la pagina.
 */
export function confrontoPossibile(cur, prev, { tolleranza = TOLLERANZA_GIORNI } = {}) {
  const c = Number(cur?.sedeGiorni) || 0
  const p = Number(prev?.sedeGiorni) || 0
  if (c === 0) return { ok: false, motivo: 'in questo periodo non c\'è nessun giorno registrato' }
  if (p === 0) return { ok: false, motivo: 'nel periodo di confronto non c\'è nessun giorno registrato' }
  const scarto = Math.abs(c - p) / Math.max(c, p)
  if (scarto > tolleranza) {
    return {
      ok: false,
      motivo: `il periodo di confronto ha ${p.toLocaleString('it-IT')} giornate registrate, questo ${c.toLocaleString('it-IT')}: messi a confronto farebbero sembrare ${p > c ? 'un calo' : 'una crescita'} che non c'è`,
    }
  }
  return { ok: true, motivo: null }
}

/**
 * Variazione percentuale col segno giusto anche quando il valore di prima è
 * negativo: da -100 a -50 è un miglioramento (+50%), non un -50%.
 * null quando prima era zero o non si sa.
 */
export function variazionePct(cur, prev) {
  if (cur == null || prev == null) return null
  const p = Number(prev)
  if (!Number.isFinite(p) || p === 0) return null
  return ((Number(cur) - p) / Math.abs(p)) * 100
}

/** '2026-08-31' → '31/08'. Una data che manca resta vuota, mai «undefined». */
export function dataBreve(iso) {
  const s = String(iso || '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return ''
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`
}

/** '2026-08-31' → '31/08/2026'. */
export function dataLunga(iso) {
  const s = String(iso || '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return ''
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
}

// Le preposizioni davanti a una data si leggono come si dice il numero:
// «l'11/08», «dall'8/09», «dell'1/07» — non «il 11/08». Uno, otto e undici
// cominciano per vocale.
const ELISE = { il: 'l\'', del: 'dell\'', dal: 'dall\'', al: 'all\'' }
/** conGiorno('dal', '2026-08-11') → «dall'11/08»; conGiorno('il', '2026-08-12') → «il 12/08». */
export function conGiorno(prep, iso, { lunga = false } = {}) {
  const testo = lunga ? dataLunga(iso) : dataBreve(iso)
  if (!testo) return ''
  const g = Number(String(iso).slice(8, 10))
  const elisa = g === 1 || g === 8 || g === 11
  return elisa && ELISE[prep] ? `${ELISE[prep]}${testo}` : `${prep} ${testo}`
}
