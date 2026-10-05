// Le fatture EMESSE (quelle che il laboratorio fa ai bar e ai ristoranti),
// dall'elenco «Fattura SMART» → vendite all'ingrosso.  06/10/2026.
//
// Perché esiste: la tabella `vendite_b2b` di Mara aveva zero righe, ma sul
// computer del titolare c'è l'elenco di 187 fatture emesse (2023-2026).
// `parseFatturaSMART` (parseFatturaXML.js) legge l'altro elenco, quello delle
// RICEVUTE: la colonna 7 è «Fornitore». Qui «Cliente» è alla colonna 5, e le
// colonne si cercano per nome, non per posizione.
//
// Le fatture hanno solo importi: niente chili, niente gusti. Ogni fattura
// diventa UNA vendita con una riga «pz» (i pezzi non entrano nei chili) e
// marcata `fonte: 'fattura_smart'`: va nel registro dell'ingrosso, non scarica
// il magazzino e NON entra nel ricavo stimato dai chili (`eSoloRegistro`,
// usata da `scorporaB2B`): lo stesso gelato sarebbe contato due volte, una al
// prezzo del banco dai chili usciti e una dalla fattura.
import { parseExcelDate, parseItalianNumber } from './parseFatturaXML'

export const FONTE_FATTURA = 'fattura_smart'

/** Vendita nata da una fattura importata: solo registro, fuori dai conti dei chili. */
export const eSoloRegistro = (v) => {
  const righe = Array.isArray(v?.righe) ? v.righe : []
  return righe.length > 0 && righe.every(r => r?.fonte === FONTE_FATTURA)
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const TESTI = (v) => (v == null ? '' : String(v).trim())
const arrotonda = (n) => Math.round(n * 100) / 100

/** Il nome del cliente senza forma societaria e punteggiatura, per riconoscere lo stesso cliente. */
export function chiaveCliente(nome) {
  return norm(nome)
    .replace(/\b(s r l s?|srls?|s n c|snc|s a s|sas|spa|s p a|societa a responsabilita limitata( semplificata)?|societa benefit|societa)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

/** Vero se la tabella ha l'intestazione delle fatture emesse (Cliente, non Fornitore). */
export function eElencoEmesse(rows) {
  return trovaIntestazione(rows) != null
}

function trovaIntestazione(rows) {
  for (let i = 0; i < Math.min((rows || []).length, 30); i++) {
    const r = rows[i]
    if (!Array.isArray(r)) continue
    const n = r.map(norm)
    if (n.includes('numero') && n.includes('cliente') && n.includes('imponibile') && !n.includes('fornitore')) {
      const col = {}
      n.forEach((h, k) => { if (h && col[h] == null) col[h] = k })
      return { riga: i, col }
    }
  }
  return null
}

/**
 * Le righe del foglio → fatture emesse. `rows` è `sheet_to_json(ws, { header: 1 })`.
 * Ritorna `null` se non è questo formato.
 */
export function leggiRigheEmesse(rows, XLSX = null) {
  const h = trovaIntestazione(rows)
  if (!h) return null
  const c = h.col
  const val = (r, nome) => (c[nome] == null ? null : r[c[nome]])
  const fatture = []
  let senzaCliente = 0
  for (let i = h.riga + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!Array.isArray(r)) continue
    const numero = TESTI(val(r, 'numero'))
    const cliente = TESTI(val(r, 'cliente'))
    if (!numero && !cliente) continue
    if (!cliente) { senzaCliente++; continue }
    const data = parseExcelDate(val(r, 'data'), XLSX)
    const tipo = TESTI(val(r, 'tipo documento'))
    const notaCredito = /nota\s+di\s+credito|nota\s+credito|\bNC\b/i.test(tipo)
    const segno = notaCredito ? -1 : 1
    const imponibile = arrotonda(segno * Math.abs(parseItalianNumber(val(r, 'imponibile'))))
    const imposta = arrotonda(segno * Math.abs(parseItalianNumber(val(r, 'imposta'))))
    const totaleLetto = parseItalianNumber(val(r, 'totale'))
    const totale = totaleLetto ? arrotonda(segno * Math.abs(totaleLetto)) : arrotonda(imponibile + imposta)
    const anno = Number(val(r, 'anno')) || (data ? Number(data.slice(0, 4)) : null)
    const suffisso = TESTI(val(r, 'suffisso'))
    const stato = TESTI(val(r, 'stato'))
    const esito = TESTI(val(r, 'esito'))
    fatture.push({
      numero, suffisso, anno,
      chiave: `${numero}${suffisso ? '-' + suffisso : ''}/${anno ?? '?'}`,
      data, tipo, notaCredito,
      cliente,
      partitaIva: TESTI(val(r, 'partita iva')) || null,
      codiceFiscale: TESTI(val(r, 'codice fiscale')) || null,
      imponibile, imposta, totale,
      stato, esito,
      pagata: /^pagat/i.test(stato),
      nonRecapitabile: /non recapitabile/i.test(esito),
      note: TESTI(val(r, 'note piede')),
    })
  }
  return { fatture, senzaCliente }
}

/** Legge il file Excel (nel browser). Ritorna `null` se non è un elenco di fatture emesse. */
export async function leggiFileEmesse(file) {
  const { loadXLSX } = await import('./xlsx')
  let XLSX
  try { XLSX = await loadXLSX() } catch { throw new Error('Impossibile caricare il lettore Excel (rete bloccata?). Riprova.') }
  let wb
  try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }) }
  catch (e) { throw new Error('Il file non è un Excel leggibile: ' + (e?.message || 'errore')) }
  for (const nome of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, blankrows: false })
    const r = leggiRigheEmesse(rows, XLSX)
    if (r) return r
  }
  return null
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
export const nomeMese = (ym) => `${MESI[Number(ym.slice(5, 7)) - 1] || '?'} ${ym.slice(0, 4)}`

/** La chiave di una fattura già caricata: la scrive `venditeDaEmesse` nella nota. */
export const chiaveDaNota = (nota) => String(nota || '').match(/^Fattura (\S+) · Fattura SMART/)?.[1] || null

/**
 * Cosa succederebbe se si caricasse: nessuna scrittura, solo conti.
 *
 * @param {object[]} fatture   da `leggiRigheEmesse`
 * @param {object} o
 * @param {object[]} [o.esistenti]  le vendite B2B già in archivio (per i doppioni)
 * @param {string|null} [o.dal]     «AAAA-MM-GG»: le fatture prima non si caricano
 * @param {string|null} [o.incassateFinoAl]  le fatture fino a questa data si considerano incassate
 */
export function anteprimaEmesse(fatture, { esistenti = [], dal = null, incassateFinoAl = null, clientiEsclusi = [] } = {}) {
  const esclusi = new Set(clientiEsclusi || [])
  const chiaveDi = (f) => chiaveCliente(f.cliente) || norm(f.cliente)
  const gia = new Set((esistenti || []).map(v => chiaveDaNota(v?.note)).filter(Boolean))
  const viste = new Set()
  const doppioniNelFile = []
  const giaPresenti = []
  const fuoriPeriodo = []
  const senzaData = []
  const candidate = []
  for (const f of fatture || []) {
    if (viste.has(f.chiave)) { doppioniNelFile.push(f); continue }
    viste.add(f.chiave)
    if (gia.has(f.chiave)) { giaPresenti.push(f); continue }
    if (!f.data) { senzaData.push(f); continue }
    if (dal && f.data < dal) { fuoriPeriodo.push(f); continue }
    candidate.push(f)
  }
  const daCaricare = candidate.filter(f => !esclusi.has(chiaveDi(f)))
  const nEsclusi = candidate.length - daCaricare.length
  const somma = (a, k = 'imponibile') => arrotonda(a.reduce((s, f) => s + f[k], 0))
  const raggruppa = (chiaveDi) => {
    const m = new Map()
    for (const f of daCaricare) {
      const k = chiaveDi(f)
      const g = m.get(k) || { n: 0, imponibile: 0, totale: 0 }
      g.n++; g.imponibile += f.imponibile; g.totale += f.totale
      m.set(k, g)
    }
    return m
  }
  const tonda = (g) => ({ ...g, imponibile: arrotonda(g.imponibile), totale: arrotonda(g.totale) })
  const perAnno = [...raggruppa(f => f.data.slice(0, 4))].map(([anno, g]) => ({ anno, ...tonda(g) })).sort((a, b) => a.anno.localeCompare(b.anno))
  const perMese = [...raggruppa(f => f.data.slice(0, 7))].map(([mese, g]) => ({ mese, ...tonda(g) })).sort((a, b) => a.mese.localeCompare(b.mese))
  // L'elenco dei clienti comprende anche quelli tolti (con `escluso`), se no
  // la casella sparirebbe e non si potrebbe rimetterli.
  const tuttiClienti = new Map()
  for (const f of candidate) {
    const k = chiaveDi(f)
    const g = tuttiClienti.get(k) || { chiave: k, nome: f.cliente, n: 0, imponibile: 0, totale: 0, escluso: esclusi.has(k) }
    g.n++; g.imponibile += f.imponibile; g.totale += f.totale
    tuttiClienti.set(k, g)
  }
  const perCliente = [...tuttiClienti.values()].map(tonda).sort((a, b) => b.imponibile - a.imponibile)
  const note = daCaricare.filter(f => f.notaCredito)
  const nonRec = daCaricare.filter(f => f.nonRecapitabile)
  const incassata = (f) => f.pagata || (incassateFinoAl != null && f.data <= incassateFinoAl)
  const aperte = daCaricare.filter(f => !incassata(f) && !f.notaCredito)
  const date = daCaricare.map(f => f.data).sort()
  return {
    nLette: (fatture || []).length,
    nDaCaricare: daCaricare.length,
    daCaricare,
    doppioniNelFile, giaPresenti, fuoriPeriodo, senzaData,
    perAnno, perMese, perCliente,
    nClienti: perCliente.filter(c => !c.escluso).length,
    nEsclusi,
    noteCredito: { n: note.length, imponibile: somma(note) },
    nonRecapitabili: { n: nonRec.length, imponibile: somma(nonRec) },
    imponibile: somma(daCaricare), iva: somma(daCaricare, 'imposta'), totale: somma(daCaricare, 'totale'),
    daIncassare: { n: aperte.length, imponibile: somma(aperte) },
    primaData: date[0] || null, ultimaData: date[date.length - 1] || null,
    pagateSuFatturaSmart: daCaricare.filter(f => f.pagata).length,
  }
}

/** Le righe di `vendite_b2b` da scrivere (con `cliente_nome` da sostituire con `cliente_id`). */
export function venditeDaEmesse(daCaricare, { incassateFinoAl = null, sedeId = null } = {}) {
  return (daCaricare || []).map(f => {
    const incassata = f.pagata || (incassateFinoAl != null && f.data <= incassateFinoAl)
    return {
      cliente_nome: f.cliente, partita_iva: f.partitaIva,
      sede_id: sedeId || null,
      data: f.data,
      righe: [{ prodotto: `FATTURA ${f.chiave}`, qta: 1, unita: 'pz', prezzo: f.imponibile, totale: f.imponibile, fonte: FONTE_FATTURA, iva: f.imposta }],
      totale: f.imponibile,
      stato: 'fatturata',
      stock_scaricato: false,
      pagata: incassata,
      data_pagamento: null,
      note: `Fattura ${f.chiave} · Fattura SMART${f.nonRecapitabile ? ' · non recapitabile al cliente' : ''}${f.notaCredito ? ' · nota di credito' : ''}`,
    }
  })
}

/**
 * La sede che il nome del file dice (es. «Fatture x carlina (1).xlsx» → Carlina).
 * Ritorna l'id, o `null` se nessuna sede o più di una compaiono nel nome.
 */
export function sedeDalNomeFile(nomeFile, sedi = []) {
  const parole = new Set(norm(nomeFile).split(' '))
  const vere = (sedi || []).filter(s => s?.id && !s._all && norm(s.nome))
  // Una parola del nome conta solo se è di UNA sede (non «boschi», che hanno tutte).
  const conteggio = new Map()
  for (const s of vere) for (const w of new Set(norm(s.nome).split(' '))) conteggio.set(w, (conteggio.get(w) || 0) + 1)
  const trovate = vere.filter(s => norm(s.nome).split(' ').some(w => w.length >= 4 && conteggio.get(w) === 1 && parole.has(w)))
  return trovate.length === 1 ? trovate[0].id : null
}
