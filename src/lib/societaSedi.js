// ── Di quale società è la fattura, e quindi di quale sede ───────────────
//
// Un'azienda può essere fatta di più società. Il design partner, 03/10/2026:
// due SRL, tre negozi. Le fatture di una società vanno a un negozio; quelle
// dell'altra sono spese di due negozi insieme, da dividere sui chili prodotti
// (`sedi_condivise`, vedi `costiCondivisi.js`).
//
// Fino a oggi ogni caricamento di fatture chiedeva la sede a mano, e TUTTE le
// fatture di quel caricamento finivano lì. Ma nello ZIP dell'Agenzia la
// risposta c'è già: ogni XML dice a chi è intestato (la P.IVA del
// `CessionarioCommittente`). Il parser la leggeva e nessuno la usava.
//
// Qui la regola, pura e provata:
//   • una P.IVA già vista → le sue sedi, senza chiedere;
//   • una P.IVA mai vista → si chiede UNA volta, e la risposta si ricorda;
//   • un'azienda con una sede sola → nessuna domanda: è tutto suo;
//   • una fattura senza P.IVA di chi la riceve → il comportamento di prima
//     (la sede scelta a mano, o quella attiva).
//
// La mappa è per azienda: `{ [piva]: { nome, sedi: [id…] } }`. Una sede =
// fattura sua; due o più = spesa condivisa. Niente P.IVA o nomi scritti nel
// codice: il prodotto è di tanti clienti.

const NF = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' })
const n0 = (v) => NF.format(Math.round(Number(v) || 0))

/**
 * La P.IVA in una forma sola: senza spazi, punti e trattini, e senza il
 * prefisso del paese quando qualcuno l'ha scritto dentro il codice
 * («IT01234567890»).
 */
export function normPiva(v) {
  const s = String(v ?? '').toUpperCase().replace(/[\s.-]/g, '')
  const m = s.match(/^IT(\d{11})$/)
  return m ? m[1] : s
}

const unici = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter(x => typeof x === 'string' && x))]

/**
 * La mappa salvata, ripulita: chiavi normalizzate, sedi come elenco di id
 * senza doppioni. Un valore rovinato non fa saltare niente: si ignora.
 */
export function leggiMappa(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    const piva = normPiva(k)
    if (!piva || !v || typeof v !== 'object') continue
    out[piva] = { nome: String(v.nome ?? '').trim(), sedi: unici(v.sedi) }
  }
  return out
}

/** Aggiunge (o sostituisce) delle voci, senza toccare le altre. */
export function unisciMappa(attuale, voci) {
  const out = { ...leggiMappa(attuale) }
  for (const [k, v] of Object.entries(leggiMappa(voci))) {
    out[k] = { nome: v.nome || out[k]?.nome || '', sedi: v.sedi }
  }
  return out
}

/** Dove va una fattura nuova, dato l'elenco di sedi a cui appartiene. */
export function destinazioneDaSedi(sedi) {
  const s = unici(sedi)
  if (s.length === 1) return { sedeId: s[0], sediCondivise: null }
  // Due o più: è una spesa condivisa, e `sede_id` resta vuoto apposta — la
  // divisione la fa la ripartizione sui chili prodotti.
  if (s.length > 1) return { sedeId: null, sediCondivise: s }
  return { sedeId: null, sediCondivise: null }
}

/** Le sedi di una voce della mappa che esistono ancora nell'azienda. */
function sediValide(voce, idsAzienda) {
  return unici(voce?.sedi).filter(id => idsAzienda.has(id))
}

/**
 * Raggruppa le fatture NUOVE per società destinataria e decide le sedi di
 * ogni gruppo. Le fatture già in archivio non passano di qui: non si
 * spostano da sole (vedi `propostaSpostamenti`).
 *
 * @param {object[]} records  fatture nuove, con `cessionario_piva` e
 *   `cessionario_nome` (parseFatturaXML)
 * @param {{ mappa?: object, sedi?: {id: string, nome?: string}[],
 *   ripiego?: string[]|null }} opz
 *   `sedi`: le sedi attive dell'azienda · `ripiego`: dove vanno le fatture
 *   senza P.IVA di chi le riceve; `null` = va chiesto.
 * @returns {{ gruppi: Gruppo[], daChiedere: Gruppo[] }} dove Gruppo è
 *   `{ piva: string|null, nome, records, sedi: string[]|null,
 *      come: 'mappa'|'unica'|'ripiego'|'chiedere' }`
 */
export function decidiSediImport(records, { mappa = {}, sedi = [], ripiego = null } = {}) {
  const m = leggiMappa(mappa)
  const ids = (sedi || []).map(s => s?.id).filter(Boolean)
  const idsAzienda = new Set(ids)

  // L'ordine dei gruppi è quello in cui compaiono nei file: la domanda segue
  // l'ordine dello ZIP, non un ordine inventato.
  const perPiva = new Map()
  for (const r of records || []) {
    const piva = normPiva(r?.cessionario_piva) || null
    const k = piva || ''
    if (!perPiva.has(k)) perPiva.set(k, { piva, nome: '', records: [] })
    const g = perPiva.get(k)
    g.records.push(r)
    if (!g.nome && r?.cessionario_nome) g.nome = String(r.cessionario_nome).trim()
  }

  const gruppi = []
  for (const g of perPiva.values()) {
    if (ids.length <= 1) {
      // Una sede sola (o nessuna): non c'è niente da decidere.
      gruppi.push({ ...g, sedi: ids.slice(0, 1), come: 'unica' })
      continue
    }
    if (g.piva) {
      const note = sediValide(m[g.piva], idsAzienda)
      if (note.length) gruppi.push({ ...g, nome: g.nome || m[g.piva].nome, sedi: note, come: 'mappa' })
      // Mai vista, o le sue sedi non ci sono più: si chiede.
      else gruppi.push({ ...g, nome: g.nome || m[g.piva]?.nome || '', sedi: null, come: 'chiedere' })
      continue
    }
    if (Array.isArray(ripiego)) gruppi.push({ ...g, sedi: unici(ripiego).filter(id => idsAzienda.has(id)), come: 'ripiego' })
    else gruppi.push({ ...g, sedi: null, come: 'chiedere' })
  }
  return { gruppi, daChiedere: gruppi.filter(g => g.come === 'chiedere') }
}

/** La chiave della risposta per un gruppo: la P.IVA, o '' per chi non ce l'ha. */
export const chiaveGruppo = (g) => g?.piva || ''

/**
 * Le domande da fare, senza i documenti dentro: chi, quante fatture e di che
 * periodo. Il periodo aiuta a riconoscere una società dal nome storto.
 *
 * @returns {{ chiave: string, piva: string|null, nome: string, n: number,
 *   dal: string|null, al: string|null }[]}
 */
export function domandeDaGruppi(daChiedere) {
  return (daChiedere || []).map(g => {
    const date = g.records.map(r => r?.data_fattura).filter(d => typeof d === 'string' && d).sort()
    return { chiave: chiaveGruppo(g), piva: g.piva, nome: g.nome || '', n: g.records.length, dal: date[0] || null, al: date[date.length - 1] || null }
  })
}

/**
 * Applica le risposte alla decisione. `risposte`: `{ [piva | '']: [id…] }`.
 * Un gruppo con una P.IVA deve avere almeno una sede (altrimenti non c'è
 * niente da ricordare); quello senza P.IVA può restare senza, com'era prima.
 *
 * @returns {{ gruppi: Gruppo[], ricordare: object, mancano: Gruppo[] }}
 *   `ricordare`: le voci nuove per la mappa · `mancano`: i gruppi ancora
 *   senza risposta valida (se non è vuoto, non si scrive niente).
 */
export function applicaRisposte(decisione, risposte, sedi = []) {
  const idsAzienda = new Set((sedi || []).map(s => s?.id).filter(Boolean))
  const ricordare = {}
  const mancano = []
  const gruppi = decisione.gruppi.map(g => {
    if (g.come !== 'chiedere') return g
    const scelte = unici(risposte?.[chiaveGruppo(g)]).filter(id => idsAzienda.has(id))
    if (g.piva) {
      if (!scelte.length) { mancano.push(g); return g }
      ricordare[g.piva] = { nome: g.nome, sedi: scelte }
      return { ...g, sedi: scelte, come: 'scelta' }
    }
    if (!Array.isArray(risposte?.[''])) { mancano.push(g); return g }
    return { ...g, sedi: scelte, come: 'scelta' }
  })
  return { gruppi, ricordare, mancano }
}

/** Le sedi a parole: «Carlina», «De Gasperi e Berthollet», «senza sede». */
export function nomiSedi(ids, sedi = []) {
  const nomi = unici(ids).map(id => (sedi || []).find(s => s?.id === id)?.nome || 'una sede che non c\'è più')
  if (!nomi.length) return 'senza sede'
  if (nomi.length === 1) return nomi[0]
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
}

/** Dove vanno, a parole: «a Carlina», «condivise fra De Gasperi e Berthollet». */
export function versoSedi(ids, sedi = []) {
  const s = unici(ids)
  if (!s.length) return 'senza sede'
  if (s.length === 1) return `a ${nomiSedi(s, sedi)}`
  return `condivise fra ${nomiSedi(s, sedi)}`
}

/** «MARAMA SRL (P.IVA 01234567890)», o la sola P.IVA se il nome non c'è. */
export function nomeSocieta(g) {
  if (!g?.piva) return 'senza la P.IVA di chi le riceve'
  return g.nome ? `${g.nome} (P.IVA ${g.piva})` : `P.IVA ${g.piva}`
}

// ── Le fatture già in archivio ──────────────────────────────────────────

const stessoInsieme = (a, b) => {
  const x = unici(a); const y = unici(b)
  return x.length === y.length && x.every(v => y.includes(v))
}

/** La fattura sta già dove la mappa dice? */
function giaAPosto(f, verso) {
  const condivise = unici(f?.sedi_condivise)
  if (verso.sediCondivise) return !f?.sede_id && stessoInsieme(condivise, verso.sediCondivise)
  return f?.sede_id === verso.sedeId && condivise.length === 0
}

/**
 * Cosa cambierebbe applicando la mappa alle fatture che ci sono già.
 * Non sposta niente: calcola la proposta da mostrare, coi numeri, prima che
 * qualcuno dica sì. Le fatture già al posto giusto non compaiono.
 *
 * @param {object[]} fatture `{ id, sede_id, sedi_condivise, cessionario_piva, totale }`
 * @returns {{ piva, nome, sedi: string[], verso: {sedeId, sediCondivise},
 *   da: { sedi: string[], condivisa: boolean, n: number, totale: number }[],
 *   ids: string[], n: number, totale: number }[]}
 */
export function propostaSpostamenti(fatture, mappa, sedi = []) {
  const m = leggiMappa(mappa)
  const idsAzienda = new Set((sedi || []).map(s => s?.id).filter(Boolean))
  // Con una sede sola non c'è niente da ripartire.
  if (idsAzienda.size <= 1) return []
  const perPiva = new Map()
  for (const f of fatture || []) {
    const piva = normPiva(f?.cessionario_piva)
    if (!piva || !m[piva]) continue
    const destinazione = sediValide(m[piva], idsAzienda)
    if (!destinazione.length) continue
    const verso = destinazioneDaSedi(destinazione)
    if (giaAPosto(f, verso)) continue
    if (!perPiva.has(piva)) perPiva.set(piva, { piva, nome: m[piva].nome, sedi: destinazione, verso, da: new Map(), ids: [], n: 0, totale: 0 })
    const g = perPiva.get(piva)
    const condivise = unici(f.sedi_condivise)
    const daSedi = condivise.length ? condivise : (f.sede_id ? [f.sede_id] : [])
    const kDa = (condivise.length ? 'c:' : 's:') + [...daSedi].sort().join(',')
    if (!g.da.has(kDa)) g.da.set(kDa, { sedi: daSedi, condivisa: condivise.length > 0, n: 0, totale: 0 })
    const d = g.da.get(kDa)
    const tot = Number(f.totale) || 0
    d.n++; d.totale += tot
    g.ids.push(f.id); g.n++; g.totale += tot
  }
  return [...perPiva.values()].map(g => ({
    ...g,
    da: [...g.da.values()].sort((a, b) => b.n - a.n),
    totale: Math.round(g.totale * 100) / 100,
  }))
}

/** Le colonne da scrivere per spostare un gruppo della proposta. */
export function patchSpostamento(gruppo) {
  const { sedeId, sediCondivise } = gruppo.verso
  return { sede_id: sedeId, sedi_condivise: sediCondivise }
}

/**
 * La proposta in una frase, com'è scritta a schermo:
 * «48 fatture di MARAMA SRL oggi su Carlina → condivise fra De Gasperi e
 * Berthollet · 12.345 €».
 */
export function fraseSpostamento(g, sedi = []) {
  const quante = `${n0(g.n)} ${g.n === 1 ? 'fattura' : 'fatture'}`
  const di = g.nome || `P.IVA ${g.piva}`
  const oggi = g.da.map(d => {
    const dove = d.sedi.length ? (d.condivisa ? `condivise fra ${nomiSedi(d.sedi, sedi)}` : `su ${nomiSedi(d.sedi, sedi)}`) : 'senza sede'
    return g.da.length > 1 ? `${n0(d.n)} ${dove}` : dove
  }).join(', ')
  return `${quante} di ${di} oggi ${g.da.length > 1 ? `(${oggi})` : oggi} → ${versoSedi(g.sedi, sedi)} · ${n0(g.totale)} €`
}

/**
 * Le nuove del caricamento, per destinazione, in una frase:
 * «Le nuove: 40 a Carlina, 12 condivise fra De Gasperi e Berthollet.»
 * Serve a vedere dove sono finite anche quelle che nessuno ha chiesto.
 * Vuota con una sede sola (non c'è niente da far notare) o se non è entrato
 * niente.
 */
export function fraseDestinazioni(perGruppo, sedi = []) {
  if ((sedi || []).length <= 1) return ''
  const pieni = (perGruppo || []).filter(g => g.inserite > 0)
  if (!pieni.length) return ''
  const verso = new Map()
  for (const g of pieni) {
    const k = unici(g.sedi).join(',')
    if (!verso.has(k)) verso.set(k, { sedi: unici(g.sedi), n: 0 })
    verso.get(k).n += g.inserite
  }
  const pezzo = ({ sedi: s, n }) => {
    if (!s.length) return `${n0(n)} senza sede`
    if (s.length === 1) return `${n0(n)} a ${nomiSedi(s, sedi)}`
    return `${n0(n)} ${n === 1 ? 'condivisa' : 'condivise'} fra ${nomiSedi(s, sedi)}`
  }
  return `Le nuove: ${[...verso.values()].map(pezzo).join(', ')}.`
}
