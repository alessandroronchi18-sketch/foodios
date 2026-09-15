// Italian electronic invoice (FatturaPA SDI) parser + TeamSystem FatturaSMART parser
// Loader XLSX unico e robusto (multi-CDN, no SRI) - vedi src/lib/xlsx.js.
import { loadXLSX } from './xlsx'

// Parse a cell into ISO date string (YYYY-MM-DD). Uses LOCAL date components
// so a date authored in Italy doesn't shift backwards via UTC conversion.
function parseExcelDate(val, XLSX) {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    try {
      const d = XLSX?.SSF?.parse_date_code(val)
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } catch { /* fall through */ }
    return null
  }
  const s = String(val).trim()
  if (!s) return null
  const it = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

// Italian number parser: handles "1.234,56" → 1234.56, "1234.56" → 1234.56,
// numbers, empties, and bad input. Always returns a finite number (0 if invalid).
function parseItalianNumber(val) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val * 100) / 100 : 0
  const s = String(val).trim()
  if (!s) return 0
  // If the string has both "." and "," assume dots are thousands separators.
  // If only ",", treat it as decimal separator.
  let cleaned
  if (s.includes(',') && s.includes('.')) cleaned = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) cleaned = s.replace(',', '.')
  else cleaned = s
  cleaned = cleaned.replace(/[^\d.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function normalizeStato(v) {
  const s = String(v ?? '').toLowerCase().trim()
  if ((s.includes('pagat') || s.includes('saldat')) && !s.includes('da')) return 'pagata'
  return 'da_pagare'
}

// Tira fuori l'XML da una fattura firmata (.p7m).
//
// Una fattura "firmata digitalmente" è l'XML chiuso dentro una busta
// crittografica (CAdES/PKCS#7). La busta è binaria, l'XML dentro è in chiaro:
// non serve verificare la firma per leggere il contenuto, e non è compito
// nostro farlo — quello lo ha già fatto lo SDI prima di consegnarla.
//
// Prima il `.p7m` era nell'elenco dei file accettati (Scadenzario e
// Integrazioni) ma veniva letto con `file.text()` e passato al parser XML:
// dentro una busta binaria `<FatturaElettronica` non si trova mai in quel
// modo, quindi **falliva sempre**. Promesso e mai mantenuto.
//
// Due forme in giro: busta binaria (DER) con l'XML dentro in chiaro, e busta
// codificata in Base64. Qui si coprono entrambe.
export function estraiXmlDaP7m(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // `latin1` conserva il valore di ogni byte: serve per cercare il testo
  // dentro dei dati binari senza che la decodifica lo rovini.
  const grezzo = new TextDecoder('latin1').decode(b)

  const ritaglia = (testo) => {
    const inizio = testo.search(/<\?xml|<[A-Za-z0-9_]*:?FatturaElettronica[\s>]/)
    if (inizio < 0) return null
    const chiusura = testo.lastIndexOf('FatturaElettronica>')
    if (chiusura < 0) return null
    return testo.slice(inizio, chiusura + 'FatturaElettronica>'.length)
  }

  const diretto = ritaglia(grezzo)
  if (diretto) {
    // Ritagliato dai byte grezzi: va riletto come UTF-8, altrimenti gli
    // accenti dei nomi dei fornitori escono sbagliati.
    const da = grezzo.indexOf(diretto)
    return new TextDecoder('utf-8').decode(b.subarray(da, da + diretto.length))
  }

  // Busta in Base64: si ripulisce e si decodifica.
  const soloBase64 = grezzo.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  if (/^[A-Za-z0-9+/=]{100,}$/.test(soloBase64)) {
    try {
      const bin = atob(soloBase64)
      const dec = Uint8Array.from(bin, c => c.charCodeAt(0))
      const dentro = ritaglia(new TextDecoder('latin1').decode(dec))
      if (dentro) {
        const da = new TextDecoder('latin1').decode(dec).indexOf(dentro)
        return new TextDecoder('utf-8').decode(dec.subarray(da, da + dentro.length))
      }
    } catch { /* non era Base64 */ }
  }
  return null
}

// Parse FatturaPA XML (SDI) - returns array of invoices compatible with Foodos fatture table
export function parseFatturaXML(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('XML non valido: ' + parseError.textContent.slice(0, 120))

  // Le fatture che escono dallo SDI hanno quasi sempre la radice con il
  // prefisso: `<p:FatturaElettronica versione="FPR12" xmlns:p="...">`. Un
  // browser, con un selettore senza prefisso, guarda il nome locale e la
  // trova lo stesso — ma è una gentilezza su cui non vale la pena appoggiare
  // il controllo che decide se un file intero entra o viene respinto. Qui si
  // guarda il nome locale in modo esplicito.
  const radice = doc.documentElement
  const nomeRadice = radice?.localName || radice?.nodeName?.split(':').pop() || ''
  if (nomeRadice !== 'FatturaElettronica' && !doc.querySelector('FatturaElettronica')) {
    throw new Error('Questo file non sembra una fattura elettronica italiana: non ci trovo il blocco <FatturaElettronica>.')
  }

  // Header: cedente/prestatore
  const cedente = doc.querySelector('CedentePrestatore')
  const denominazione = cedente?.querySelector('Denominazione')?.textContent?.trim() || ''
  const nome = cedente?.querySelector('Nome')?.textContent?.trim() || ''
  const cognome = cedente?.querySelector('Cognome')?.textContent?.trim() || ''
  const fornitore = denominazione || [nome, cognome].filter(Boolean).join(' ') || 'Fornitore sconosciuto'
  const piva = cedente?.querySelector('IdFiscaleIVA IdCodice')?.textContent?.trim() || ''
  const cf = cedente?.querySelector('CodiceFiscale')?.textContent?.trim() || ''

  const bodies = doc.querySelectorAll('FatturaElettronicaBody')
  if (!bodies.length) throw new Error('Nessun corpo fattura (FatturaElettronicaBody) trovato nel file XML')

  const fatture = []

  for (const body of bodies) {
    const dgd = body.querySelector('DatiGeneraliDocumento')
    const numero = dgd?.querySelector('Numero')?.textContent?.trim() || ''
    const data = dgd?.querySelector('Data')?.textContent?.trim() || null
    const totaleRaw = dgd?.querySelector('ImportoTotaleDocumento')?.textContent?.trim() || '0'
    const totale = Math.round((parseFloat(totaleRaw) || 0) * 100) / 100

    // Tipo documento: TD04/TD08 = nota di credito (compensa il dovuto).
    const tipoDoc = (dgd?.querySelector('TipoDocumento')?.textContent?.trim() || '').toUpperCase()
    const tipo = (tipoDoc === 'TD04' || tipoDoc === 'TD08') ? 'nota_credito' : 'fattura'

    // DatiPagamento → scadenza REALE + IBAN (per il bonifico). Possono esserci
    // più rate (DettaglioPagamento): prendiamo la scadenza più lontana e il
    // primo IBAN valorizzato.
    let data_scadenza = null
    let iban = ''
    body.querySelectorAll('DettaglioPagamento').forEach(dp => {
      const scad = dp.querySelector('DataScadenzaPagamento')?.textContent?.trim()
      if (scad && /^\d{4}-\d{2}-\d{2}/.test(scad)) {
        const iso = scad.slice(0, 10)
        if (!data_scadenza || iso > data_scadenza) data_scadenza = iso
      }
      if (!iban) {
        const ib = dp.querySelector('IBAN')?.textContent?.trim()
        if (ib) iban = ib.replace(/\s+/g, '').toUpperCase()
      }
    })

    // Prefer DatiRiepilogo for imponibile/imposta
    let imponibile = 0
    let imposta = 0
    const riepilogos = body.querySelectorAll('DatiRiepilogo')
    if (riepilogos.length) {
      riepilogos.forEach(r => {
        imponibile += parseFloat(r.querySelector('ImponibileImporto')?.textContent?.trim() || '0') || 0
        imposta += parseFloat(r.querySelector('Imposta')?.textContent?.trim() || '0') || 0
      })
    } else {
      // Fallback: sum from DettaglioLinee
      body.querySelectorAll('DettaglioLinee').forEach(l => {
        const pt = parseFloat(l.querySelector('PrezzoTotale')?.textContent?.trim() || '0') || 0
        const iva = parseFloat(l.querySelector('AliquotaIVA')?.textContent?.trim() || '0') || 0
        imponibile += pt
        imposta += pt * (iva / 100)
      })
    }

    // Il dettaglio riga: prodotto, quantità, prezzo unitario, aliquota.
    //
    // Prima di qui si scorreva già questo blocco, ma si tenevano SOLO le prime
    // tre descrizioni, incollate nel campo `note`. Quantità, prezzi e codici
    // articolo — cioè il dato con cui si calcola quanto costa davvero un
    // ingrediente e come cambia nel tempo — venivano scartati. Su 3.520
    // fatture già importate, il dettaglio è passato dal browser ed è finito
    // nel cestino.
    const descrizioni = []
    const righe = []
    body.querySelectorAll('DettaglioLinee').forEach(l => {
      const testo = (sel) => l.querySelector(sel)?.textContent?.trim() || null
      const numero = (sel) => {
        const v = testo(sel)
        if (v == null || v === '') return null
        const n = Number(String(v).replace(',', '.'))
        return Number.isFinite(n) ? n : null
      }
      const desc = testo('Descrizione')
      if (desc) descrizioni.push(desc)
      // Il codice articolo del fornitore sta annidato: <CodiceArticolo>
      // contiene <CodiceTipo> e <CodiceValore>, e possono essercene più di uno.
      const codice = l.querySelector('CodiceArticolo CodiceValore')?.textContent?.trim() || null
      const q = numero('Quantita')
      const pu = numero('PrezzoUnitario')
      const tot = numero('PrezzoTotale')
      righe.push({
        n: numero('NumeroLinea'),
        codice,
        descrizione: desc,
        quantita: q,
        unita: testo('UnitaMisura'),
        prezzo_unitario: pu,
        // Se il totale riga manca lo si ricava, che è quello che farebbe
        // chiunque guardando la carta.
        totale: tot != null ? tot : (q != null && pu != null ? Math.round(q * pu * 100) / 100 : null),
        iva_pct: numero('AliquotaIVA'),
      })
    })

    fatture.push({
      numero_rif: numero,
      data_fattura: data,
      data_scadenza,
      tipo,
      fornitore,
      piva,
      cf,
      iban,
      imponibile: Math.round(imponibile * 100) / 100,
      imposta: Math.round(imposta * 100) / 100,
      totale,
      stato: 'da_pagare',
      note: descrizioni.slice(0, 3).join('; ') + (descrizioni.length > 3 ? '…' : ''),
      righe,
    })
  }

  return fatture
}

// Parse TeamSystem FatturaSMART Excel export - fixed positional column layout.
// File structure (per FatturaSMART export):
//   Rows 0-2 : 3 rows of titles / metadata ("Elenco documenti…")
//   Row  3   : header row (column titles)
//   Rows 4+  : invoice data
//
// Column indices (0-based):
//    0 Numero       1 Suffisso     2 Anno         3 Data (date)
//    4 Numero Rif.  5 Data Rif.    6 Tipo Doc.    7 Fornitore
//    8 CF           9 P.IVA       10 Imponibile  11 Tipo cassa prev.
//   12 Cassa prev. 13 Imposta     14 Art. 15      15 Bollo
//   16 Totale      17 Ritenuta    18 Netto       19 Note     20 Stato
const DATA_START_ROW = 4
const COL = {
  data:        3,
  numero_rif:  4,
  data_rif:    5,
  fornitore:   7,
  imponibile: 10,
  imposta:    13,
  totale:     16,
  stato:      20,
}

export async function parseFatturaSMART(file) {
  let XLSX
  try { XLSX = await loadXLSX() }
  catch { throw new Error('Impossibile caricare il parser Excel (rete bloccata?). Riprova.') }

  let ab
  try { ab = await file.arrayBuffer() }
  catch { throw new Error('File illeggibile: ' + (file?.name || 'sconosciuto')) }

  let wb
  try { wb = XLSX.read(ab, { type: 'array', cellDates: true }) }
  catch (e) { throw new Error('Formato Excel non valido: ' + (e?.message || 'parsing fallito')) }

  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('Il file non contiene fogli leggibili.')

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false })

  if (rows.length <= DATA_START_ROW) {
    // File has no data rows - empty export
    return []
  }

  const fatture = []
  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !Array.isArray(row)) continue

    // Skip rows without a supplier (col 7) - these are blank/footer rows
    const rawFornitore = row[COL.fornitore]
    if (rawFornitore === null || rawFornitore === undefined) continue
    const fornitore = String(rawFornitore).trim()
    if (!fornitore) continue

    const numero_rif = row[COL.numero_rif] !== null && row[COL.numero_rif] !== undefined
      ? String(row[COL.numero_rif]).trim()
      : ''

    fatture.push({
      numero_rif,
      data_fattura: parseExcelDate(row[COL.data], XLSX),
      data_rif:     parseExcelDate(row[COL.data_rif], XLSX),
      fornitore,
      imponibile:   parseItalianNumber(row[COL.imponibile]),
      imposta:      parseItalianNumber(row[COL.imposta]),
      totale:       parseItalianNumber(row[COL.totale]),
      stato:        normalizeStato(row[COL.stato]),
    })
  }
  return fatture
}
