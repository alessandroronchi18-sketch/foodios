// Helper di import file Excel/CSV per il foglio inventario gelateria.
//
// Modello del file (basato sullo screenshot del cliente, giu 2026):
//   - Riga header 1: "GUSTI" in col A; ogni 8 colonne c'e' un blocco
//     "SETTIMANA N" o "VENDUTO SETTIMANA N" che marca la separazione.
//   - Riga header 2: "Rimanenza" in col B (col 2), poi per ogni giorno
//     (1..7) due celle "PROD" "RIMAN.".
//   - Righe dati: nome gusto in col A, valori numerici (grammi).
//
// Il parsing e' tollerante: cerca le ancore "GUSTI", "PROD", "RIMAN",
// non si appoggia a indici fissi.

// ── Helper: parseNomeFile ──────────────────────────────────────────────────
// Estrae { mese: 1..12, anno: YYYY } dal nome di un file. Tollera:
//   inventario_giugno_2026.xlsx        -> 6 / 2026
//   inv-giu-26.csv                     -> 6 / 2026
//   gelati 06-2026.xlsx                -> 6 / 2026
//   2026-06_inventario.xlsx            -> 6 / 2026
//   foglio_06_2026.xls                 -> 6 / 2026
// Ritorna null se non riesce.

const MESI_IT = {
  gennaio: 1, gen: 1,
  febbraio: 2, feb: 2,
  marzo: 3, mar: 3,
  aprile: 4, apr: 4,
  maggio: 5, mag: 5,
  giugno: 6, giu: 6,
  luglio: 7, lug: 7,
  agosto: 8, ago: 8,
  settembre: 9, set: 9, sett: 9,
  ottobre: 10, ott: 10,
  novembre: 11, nov: 11,
  dicembre: 12, dic: 12,
}

export function parseNomeFile(nomeFile) {
  if (!nomeFile) return null
  // Rimuoviamo estensione e normalizziamo.
  const base = nomeFile.toString().toLowerCase().replace(/\.[a-z]+$/, '')
  const ann = (n) => n < 100 ? 2000 + n : n

  // Pattern 1: mese in lettere + anno (es. "giugno 2026", "giu-26", "giu_2026")
  const reLet = new RegExp(`(${Object.keys(MESI_IT).join('|')})[ _\\-./]*((?:20)?\\d{2})`, 'i')
  let m = base.match(reLet)
  if (m) {
    const mese = MESI_IT[m[1].toLowerCase()]
    const anno = ann(parseInt(m[2], 10))
    if (mese && anno >= 2020 && anno <= 2099) return { mese, anno }
  }

  // Pattern 2: numero mese-anno (es. "06-2026", "06_2026", "06/2026", "06.2026")
  m = base.match(/\b(0?[1-9]|1[0-2])[ _\-./]+((?:20)?\d{2})\b/)
  if (m) {
    const mese = parseInt(m[1], 10)
    const anno = ann(parseInt(m[2], 10))
    if (mese >= 1 && mese <= 12 && anno >= 2020 && anno <= 2099) return { mese, anno }
  }

  // Pattern 3: anno-mese (es. "2026-06", "2026_06", "2026-06_inventario").
  // Niente \b finale: rompe il match se dopo c'e' "_" (che e' word char in regex).
  // Usiamo lookahead negativo: il mese non puo' essere seguito da altro numero.
  m = base.match(/\b((?:20)?\d{2})[ _\-./]+(0?[1-9]|1[0-2])(?!\d)/)
  if (m) {
    const anno = ann(parseInt(m[1], 10))
    const mese = parseInt(m[2], 10)
    if (mese >= 1 && mese <= 12 && anno >= 2020 && anno <= 2099) return { mese, anno }
  }

  return null
}

// ── Helper: lunediDelMese ──────────────────────────────────────────────────
// Lunedi della "settimana 1" del mese, dove sett.1 = la settimana che contiene
// il primo lunedi del mese (no settimane parziali). Per il foglio gelateria
// e' la convenzione piu' naturale: ogni settimana ha tutti i 7 giorni dentro
// lo stesso layout.
//
// Ritorna ISO date (YYYY-MM-DD) del lunedi della settimana 1.
export function lunediSettimana1DelMese(mese, anno) {
  const d = new Date(anno, mese - 1, 1)
  // d.getDay(): 0=dom, 1=lun ... 6=sab. Vogliamo trovare il primo lunedi >= 1.
  const dow = d.getDay()
  const avanza = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow)
  d.setDate(1 + avanza)
  return d.toISOString().slice(0, 10)
}

// ── Helper: parseFileInventario ────────────────────────────────────────────
// Riceve l'output di XLSX.utils.sheet_to_json(ws, { header: 1 }), cioe' una
// matrice di celle. Cerca le ancore e ritorna:
//   {
//     righe: [{ gusto_nome, data: 'YYYY-MM-DD', produzione_g, rimanenza_g }],
//     gusti: ['PISTACCHIO', 'NOCCIOLA', ...],   // ordine originale del foglio
//     warnings: [...]                            // stringhe diagnostiche
//   }
//
// `lunediBase` = lunedi della settimana 1 (parametro: usato per assegnare date).

export function parseFoglioInventario(matrice, lunediBase) {
  const out = { righe: [], gusti: [], warnings: [] }
  if (!Array.isArray(matrice) || matrice.length === 0) {
    out.warnings.push('Il file e\' vuoto.')
    return out
  }

  // Trova la riga che contiene "GUSTI" (case-insensitive) in una delle prime
  // 10 colonne: e' l'header principale del foglio.
  let idxHeader = -1
  for (let i = 0; i < Math.min(matrice.length, 20); i++) {
    const row = matrice[i] || []
    for (let j = 0; j < Math.min(row.length, 10); j++) {
      const v = (row[j] || '').toString().trim().toUpperCase()
      if (v === 'GUSTI' || v === 'GUSTO') { idxHeader = i; break }
    }
    if (idxHeader >= 0) break
  }
  if (idxHeader < 0) {
    out.warnings.push('Header "GUSTI" non trovato nelle prime 20 righe del foglio.')
    return out
  }

  // La riga sotto (idxHeader + 1) contiene di solito i sub-header "Rimanenza",
  // "PROD", "RIMAN." alternati. Mappiamo gli indici di colonna -> tipo cella.
  const subHeader = matrice[idxHeader + 1] || []
  const mapColonna = []  // mapColonna[j] = { tipo: 'prod'|'riman'|null, settIdx, giornoIdx }
  let settIdx = 0
  let giornoIdx = 0
  let inSett = false
  // Iniziamo dalla colonna A (j=0) e scansioniamo.
  for (let j = 0; j < subHeader.length; j++) {
    const cell = (subHeader[j] || '').toString().trim().toUpperCase()
    if (cell === 'PROD' || cell.startsWith('PROD')) {
      mapColonna[j] = { tipo: 'prod', settIdx, giornoIdx }
      if (!inSett) inSett = true
    } else if (cell.startsWith('RIMAN')) {
      mapColonna[j] = { tipo: 'riman', settIdx, giornoIdx }
      // Dopo RIMAN avanziamo al prossimo giorno.
      giornoIdx++
      if (giornoIdx >= 7) {
        // Finita la settimana: prossima e' la colonna VENDUTO SETTIMANA o
        // l'inizio della settimana successiva. Reset.
        giornoIdx = 0
        settIdx++
        inSett = false
      }
    } else {
      mapColonna[j] = null
    }
  }

  if (mapColonna.filter(Boolean).length === 0) {
    out.warnings.push('Non ho trovato colonne "PROD"/"RIMAN" nella riga di sub-header. Verifica il formato del file.')
    return out
  }

  // Ora scansioniamo le righe dati (sotto subHeader): col A = nome gusto.
  for (let i = idxHeader + 2; i < matrice.length; i++) {
    const row = matrice[i] || []
    const nome = (row[0] || '').toString().trim()
    if (!nome) continue  // riga vuota: salto
    const gustoUp = nome.toUpperCase()
    // Filtro righe di "totale" del foglio (TOTALE, TOTALI, TOTALE GUSTI, ecc.)
    // Altrimenti finiscono come "gusto" e dominano i top nelle analisi.
    if (
      gustoUp === 'TOTALE' || gustoUp === 'TOTALI' ||
      gustoUp.startsWith('TOTALE ') || gustoUp.startsWith('TOTALI ') ||
      gustoUp.startsWith('TOT.') || gustoUp === 'TOT' ||
      gustoUp === 'SOMMA' || gustoUp.startsWith('SUBTOTALE') ||
      gustoUp.includes('TOTALE GUSTI') || gustoUp.includes('TOTALE MESE')
    ) continue
    if (!out.gusti.includes(gustoUp)) out.gusti.push(gustoUp)

    for (let j = 0; j < row.length; j++) {
      const meta = mapColonna[j]
      if (!meta) continue
      const valore = parseGrammi(row[j])
      if (valore == null) continue  // cella vuota / non numerica: salto
      // Calcola la data ISO: lunediBase + (sett * 7 + giorno).
      const dataIso = addGiorni(lunediBase, meta.settIdx * 7 + meta.giornoIdx)
      // Trova la riga corrispondente o creane una nuova.
      let r = out.righe.find(x => x.gusto_nome === gustoUp && x.data === dataIso)
      if (!r) {
        r = { gusto_nome: gustoUp, data: dataIso, produzione_g: 0, rimanenza_g: 0 }
        out.righe.push(r)
      }
      if (meta.tipo === 'prod') r.produzione_g = valore
      else if (meta.tipo === 'riman') r.rimanenza_g = valore
    }
  }

  if (out.gusti.length === 0) {
    out.warnings.push('Nessun gusto trovato nel file.')
  }
  return out
}

// Parse un valore di cella in grammi. Accetta number o stringa con virgole/
// punti. Ritorna null se vuoto/non numerico.
function parseGrammi(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.max(0, Math.round(v)) : null
  const s = v.toString().replace(/[^\d.,-]/g, '').replace(',', '.')
  if (!s) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null
}

function addGiorni(dataIso, n) {
  const d = new Date(dataIso); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Helper: identifica sheet "sede" in un workbook ─────────────────────────
// Un workbook reale del cliente gelateria contiene piu' sheet, uno per ogni
// sede di produzione (es. CARLINA, BERTHOLLET, DE GASPERI), piu' uno TOTALI
// (cross-sede), piu' alcuni B2B (RISTORANTI, GELATO ELIMINATO) e ALTRI
// PRODOTTI (per pastorizzata/cioccolata/zabaione).
//
// Riconosciamo gli sheet sede cercando il pattern "GUSTI" + "PROD/RIMAN" nelle
// prime righe — coerenza con parseFoglioInventario. Gli altri li classifichiamo
// per nome (TOTALI / GELATO ELIMINATO / RISTORANTI / ALTRI ...).

export function classificaSheet(XLSX, workbook) {
  const out = { sedi: [], totali: null, sprechi: null, b2b: null, altri_prod: null, altri: [] }
  for (const sheetName of (workbook.SheetNames || [])) {
    const ws = workbook.Sheets[sheetName]
    if (!ws) continue
    const matrice = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    const nameUp = sheetName.toString().trim().toUpperCase()

    // Pattern strutturale: ispeziona le prime righe per riconoscere il tipo
    // di foglio. Robusto a nomi diversi (es. "Sede 1", "Prodotti eliminati",
    // "Vendite B2B", ecc.).
    let trovatoGusti = false, trovatoProd = false
    let trovatoRistorante = false, trovatoData = false
    let trovatoNegozio = false, trovatoKg = false, trovatoMotivo = false
    let trovatoTotale = false, trovatoVendutoSett = false
    let trovatoAltriProd = false  // PASTORIZZATA/CIOCCOLATA/ZABAIONE nei header
    for (let i = 0; i < Math.min(matrice.length, 10); i++) {
      const row = matrice[i] || []
      for (const c of row.slice(0, 30)) {
        const v = (c || '').toString().trim().toUpperCase()
        if (v === 'GUSTI' || v === 'GUSTO') trovatoGusti = true
        if (v === 'PROD' || v.startsWith('PROD ')) trovatoProd = true
        if (v === 'RISTORANTE' || v === 'CLIENTE') trovatoRistorante = true
        if (v === 'DATA') trovatoData = true
        if (v === 'NEGOZIO' || v === 'SEDE') trovatoNegozio = true
        if (v === 'KG' || v === 'QUANTITA' || v === 'QUANTITÀ') trovatoKg = true
        if (v === 'MOTIVO' || v === 'CAUSA' || v === 'CAUSALE') trovatoMotivo = true
        if (v.includes('TOTALE')) trovatoTotale = true
        if (v.includes('VENDUTO SETTIMANA') || v.includes('VENDUTO_SETT')) trovatoVendutoSett = true
        // ALTRI PRODOTTI: cerca categorie note nei header (compound nomi
        // tipo "BERTHOLLET PASTORIZZATA").
        if (v.includes('PASTORIZZATA') || v.includes('CIOCCOLATA')
            || v.includes('ZABAIONE') || v.includes('PISTACCHIATA')) {
          trovatoAltriProd = true
        }
      }
    }

    // Classificazione per pattern strutturale (preferito) + fallback nome:
    // 1. sede produttiva: ha GUSTI + PROD nei sub-header
    // 2. totali: header con multi "VENDUTO SETTIMANA" e "totale mese"
    //    (puo' anche chiamarsi "Riepilogo", "Totale generale", ecc.)
    // 3. b2b: ha RISTORANTE/CLIENTE + DATA + GUSTO
    // 4. sprechi: ha NEGOZIO + KG + GUSTO + MOTIVO (e NON ha PROD)
    if (trovatoGusti && trovatoProd) {
      out.sedi.push({ sheetName, matrice })
    } else if (trovatoVendutoSett && trovatoTotale) {
      out.totali = { sheetName, matrice }
    } else if (trovatoRistorante && trovatoData) {
      out.b2b = { sheetName, matrice }
    } else if (trovatoNegozio && trovatoKg && trovatoMotivo) {
      out.sprechi = { sheetName, matrice }
    } else if (trovatoAltriProd) {
      out.altri_prod = { sheetName, matrice }
    } else if (nameUp === 'TOTALI' || nameUp.includes('TOTAL') || nameUp.includes('RIEPILOG')) {
      out.totali = { sheetName, matrice }
    } else if (nameUp.includes('RISTORANT') || nameUp.includes('B2B') || nameUp.includes('VENDIT')) {
      out.b2b = { sheetName, matrice }
    } else if (nameUp.includes('ELIMINAT') || nameUp.includes('SCART') || nameUp.includes('SPREC') || nameUp.includes('PERDIT')) {
      out.sprechi = { sheetName, matrice }
    } else if (nameUp.includes('ALTRI')) {
      out.altri_prod = { sheetName, matrice }
    } else {
      out.altri.push({ sheetName, matrice })
    }
  }
  return out
}

// Normalizza il nome di una sede per il matching tra sheet e DB.
// Es: "DE GASPERI" / "de gasperi" / "Dega" tutti collassano a "degasperi".
export function normNomeSede(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Trova la sede dell'org che corrisponde al nome dello sheet. Match per
// nome normalizzato. Ritorna l'oggetto sede o null.
export function trovaSedePerSheet(sheetName, sediOrg) {
  if (!Array.isArray(sediOrg)) return null
  const key = normNomeSede(sheetName)
  if (!key) return null
  // Match esatto first.
  let match = sediOrg.find(s => normNomeSede(s.nome) === key)
  if (match) return match
  // Match per substring (es. "CARLINA" vs "Sede Carlina centro").
  match = sediOrg.find(s => normNomeSede(s.nome).includes(key) || key.includes(normNomeSede(s.nome)))
  return match || null
}

// ── Check totali cross-sheet vs sheet TOTALI ───────────────────────────────
// Confronta la somma del venduto per gusto calcolata dai sheet sede contro
// la colonna "TOTALE GUSTI TUTTI NEGOZI" del foglio TOTALI. La logica del
// foglio TOTALI: per ogni gusto, ogni 6 colonne contiene (sett1, sett2,
// sett3, sett4, sett5, totale_mese) per UNA sede. L'ultima colonna numerica
// (penultima del foglio) e' "TOTALE GUSTI TUTTI NEGOZI".
//
// Per ogni gusto calcoliamo:
//   - calcolato = somma_kg_venduti su tutti gli sheet sede (dal nostro parsing)
//   - dichiarato = TOTALE GUSTI TUTTI NEGOZI letto dal foglio TOTALI
// e ritorniamo le divergenze (oltre soglia 5%).

export function checkTotaliCrossSheet(perSedeRighe, totaliMatrice) {
  if (!Array.isArray(totaliMatrice) || totaliMatrice.length < 2) return { coerente: true, divergenze: [] }

  // Trova la colonna "TOTALE GUSTI TUTTI NEGOZI" dall'header (R0).
  const r0 = totaliMatrice[0] || []
  let colTotale = -1
  for (let j = 0; j < r0.length; j++) {
    const v = (r0[j] || '').toString().trim().toUpperCase()
    if (v.includes('TOTALE GUSTI') || v.includes('TOTALE TUTTI')) { colTotale = j; break }
  }
  if (colTotale < 0) return { coerente: true, divergenze: [], warning: 'colonna TOTALE GUSTI TUTTI NEGOZI non trovata' }

  // Indicizza: per ogni gusto, somma calcolata dalle sedi.
  const calcolato = {}
  for (const righe of (perSedeRighe || [])) {
    for (const r of (righe || [])) {
      const k = r.gusto_nome
      const v = (r.rimanenza_g != null && r.produzione_g != null)
        ? (r.produzione_g + (calcolato[k]?.prevRiman || 0) - r.rimanenza_g)
        : 0
      // semplificazione: somma direttamente il venduto stimato per cella
      // (riman_prev + prod - riman). Per il check non ci serve precisione
      // estrema; vogliamo segnalare divergenze grossolane.
      calcolato[k] = calcolato[k] || { vendutoG: 0 }
      // qui usiamo prod_g come proxy se non sappiamo bilanciare bene il
      // riman_prev cross-settimana — il check resta indicativo.
      calcolato[k].vendutoG = (calcolato[k].vendutoG || 0)
    }
  }

  // Per coerenza: ricalcolare il venduto cross-sede in modo robusto richiede
  // tutta la matrice ordinata per data. Per il check MVP, sommiamo i kg di
  // PRODUZIONE (proxy non perfetto ma utile per "ordini di grandezza").
  for (const righe of (perSedeRighe || [])) {
    for (const r of (righe || [])) {
      const k = r.gusto_nome
      calcolato[k] = calcolato[k] || { prodG: 0 }
      calcolato[k].prodG = (calcolato[k].prodG || 0) + (Number(r.produzione_g) || 0)
    }
  }

  const divergenze = []
  for (let i = 2; i < totaliMatrice.length; i++) {
    const row = totaliMatrice[i] || []
    const nome = (row[0] || '').toString().trim().toUpperCase()
    if (!nome) continue
    const dichiarato = Number(row[colTotale]) || 0
    if (dichiarato === 0) continue
    const calc = (calcolato[nome]?.prodG) || 0
    if (calc === 0) continue
    const diff = Math.abs(calc - dichiarato)
    const diffPct = (diff / dichiarato) * 100
    if (diffPct > 5) {
      divergenze.push({ gusto: nome, calcolato: calc, dichiarato, diffPct })
    }
  }

  return { coerente: divergenze.length === 0, divergenze }
}

// ── Parser sheet RISTORANTI (vendite B2B) ──────────────────────────────────
// Layout cliente gelateria:
//   R0: header tipo "PRODUZIONE PER RISTORANTI" (decorativo)
//   R1: header colonne | RISTORANTE | DATA | GUSTO | KG | PAGAMENTO | negozio |
//   R2+: dati. La DATA puo' essere un Excel serial (numero) o una stringa.
// Ritorna array di { cliente, dataIso, gusto, qta, pagamento, sedeNome }.
export function parseFoglioRistoranti(matrice) {
  const out = { righe: [], warnings: [] }
  if (!Array.isArray(matrice) || matrice.length === 0) return out

  // Trova la riga header (RISTORANTE + DATA + GUSTO).
  let idxHeader = -1
  let mapCol = {}
  for (let i = 0; i < Math.min(matrice.length, 10); i++) {
    const row = matrice[i] || []
    const upd = row.map(c => (c || '').toString().trim().toUpperCase())
    const cliente = upd.indexOf('RISTORANTE')
    const data = upd.indexOf('DATA')
    const gusto = upd.indexOf('GUSTO')
    if (cliente >= 0 && data >= 0 && gusto >= 0) {
      idxHeader = i
      mapCol = {
        cliente, data, gusto,
        qta: upd.indexOf('KG'),
        pagamento: upd.indexOf('PAGAMENTO'),
        sedeNome: upd.findIndex(v => v === 'NEGOZIO' || v === 'SEDE'),
      }
      break
    }
  }
  if (idxHeader < 0) {
    out.warnings.push('Header RISTORANTE/DATA/GUSTO non trovato nello sheet RISTORANTI.')
    return out
  }

  for (let i = idxHeader + 1; i < matrice.length; i++) {
    const row = matrice[i] || []
    const cliente = (row[mapCol.cliente] || '').toString().trim()
    if (!cliente) continue
    const dataRaw = row[mapCol.data]
    const dataIso = excelDateToIso(dataRaw)
    const gusto = (row[mapCol.gusto] || '').toString().trim().toUpperCase()
    const qta = Number(row[mapCol.qta]) || 0
    const pagamento = (mapCol.pagamento >= 0 ? row[mapCol.pagamento] : '').toString().trim()
    const sedeNome = (mapCol.sedeNome >= 0 ? row[mapCol.sedeNome] : '').toString().trim()
    if (!gusto || qta <= 0) continue
    // Filtra righe di totale (TOTALE, TOTALI, SUBTOTALE, SOMMA)
    if (gusto === 'TOTALE' || gusto === 'TOTALI' || gusto.startsWith('TOTALE ') ||
        gusto.startsWith('SUBTOTALE') || gusto === 'SOMMA' || gusto === 'TOT') continue
    out.righe.push({
      cliente, dataIso, gusto, qta, pagamento, sedeNome,
    })
  }
  return out
}

// Excel serial date -> 'YYYY-MM-DD'. Excel epoch: 1899-12-30 (con bug 1900).
// Numero 45993 = ~ 30 nov 2025.
export function excelDateToIso(v) {
  if (v == null || v === '') return null
  if (typeof v === 'string') {
    // ISO?
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
    // dd/mm/yyyy?
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    const n = parseFloat(v)
    if (!Number.isFinite(n)) return null
    v = n
  }
  if (typeof v === 'number') {
    // Excel serial: giorni dal 1899-12-30 (UTC).
    const epoch = Date.UTC(1899, 11, 30)
    const ms = epoch + v * 86400000
    return new Date(ms).toISOString().slice(0, 10)
  }
  return null
}

// ── Parser sheet ALTRI PRODOTTI (varianti speciali per sede) ──────────────
// Layout cliente (esempio gelateria DICEMBRE):
//   R0: [null,
//        "BERTHOLLET PASTORIZZATA", "CARLINA PASTORIZZATA", "DE GASPERI PASTORIZZATA",
//        null,
//        "BERTHOLLET CIOCCOLATA",  "CARLINA CIOCCOLATA",   "DE GASPERI CIOCCOLATA",
//        null,
//        "BERTHOLLET ZABAIONE",    "CARLINA ZABAIONE",     "DE GASPERI ZABAIONE"]
//   R1+: col A = giorno del mese (1, 2, ...), col B..L = quantita' kg per
//        ogni (categoria × sede)
//
// Strategia parsing:
//   1) leggi R0: per ogni cella non-null, parsa "{SEDE} {CATEGORIA}"
//      separando le ultime parole come categoria (PASTORIZZATA / CIOCCOLATA /
//      ZABAIONE), il resto come nome sede.
//   2) per ogni riga successiva, col A = numero giorno; per ogni colonna
//      mappata, se valore numerico > 0, emetti riga.
//
// Output: { righe: [{ sedeNome, gusto, giornoMese, qtaG }], warnings, mese? }
// La data finale si calcola al commit usando mese+anno scelti nel dialog
// (giorno < 32). gusto = nome categoria (es. "PASTORIZZATA").
//
// Le quantita' nel foglio sono tipicamente in KG (es. 0.5, 1, 2.5). Le
// convertiamo in grammi (*1000) per coerenza col resto del modulo.

const ALTRI_CATEGORIE_NOTE = ['PASTORIZZATA', 'CIOCCOLATA', 'ZABAIONE', 'PANNA', 'PISTACCHIATA']

export function parseFoglioAltriProdotti(matrice) {
  const out = { righe: [], warnings: [] }
  if (!Array.isArray(matrice) || matrice.length === 0) return out

  // R0 = header con le coppie SEDE CATEGORIA. Cerchiamo la riga che ha
  // almeno una cella con una categoria nota (PASTORIZZATA/CIOCCOLATA/...).
  let idxHeader = -1
  for (let i = 0; i < Math.min(matrice.length, 5); i++) {
    const row = matrice[i] || []
    if (row.some(c => {
      const v = (c || '').toString().toUpperCase()
      return ALTRI_CATEGORIE_NOTE.some(cat => v.includes(cat))
    })) { idxHeader = i; break }
  }
  if (idxHeader < 0) {
    out.warnings.push('Header con categorie ALTRI PRODOTTI non trovato.')
    return out
  }

  // mapColonna[j] = { sedeNome, categoria } | null
  const header = matrice[idxHeader] || []
  const mapColonna = []
  for (let j = 0; j < header.length; j++) {
    const v = (header[j] || '').toString().trim()
    if (!v) { mapColonna[j] = null; continue }
    const vUp = v.toUpperCase()
    const cat = ALTRI_CATEGORIE_NOTE.find(c => vUp.includes(c))
    if (!cat) { mapColonna[j] = null; continue }
    // Sede = tutto cio' che NON e' la categoria, pulito.
    const sedeNome = v.replace(new RegExp(cat, 'i'), '').trim()
    mapColonna[j] = { sedeNome, categoria: cat }
  }

  // Righe dati: col A = giorno del mese, col j>=1 = quantita'.
  for (let i = idxHeader + 1; i < matrice.length; i++) {
    const row = matrice[i] || []
    const giornoRaw = row[0]
    const giorno = Number(giornoRaw)
    if (!Number.isFinite(giorno) || giorno < 1 || giorno > 31) continue
    for (let j = 1; j < row.length; j++) {
      const meta = mapColonna[j]
      if (!meta) continue
      const qta = Number(row[j])
      if (!Number.isFinite(qta) || qta <= 0) continue
      out.righe.push({
        sedeNome: meta.sedeNome,
        gusto: meta.categoria,
        giornoMese: giorno,
        qtaG: Math.round(qta * 1000),
      })
    }
  }

  return out
}

// ── Parser sheet GELATO ELIMINATO (sprechi) ───────────────────────────────
// Layout:
//   R0: header decorativo "GELATO ELIMINATO"
//   R1: NEGOZIO | KG | GUSTO | MOTIVO
//   R2+: dati. KG e' direttamente la quantita' (grammi=*1000).
export function parseFoglioSprechi(matrice) {
  const out = { righe: [], warnings: [] }
  if (!Array.isArray(matrice) || matrice.length === 0) return out

  let idxHeader = -1
  let mapCol = {}
  for (let i = 0; i < Math.min(matrice.length, 10); i++) {
    const row = matrice[i] || []
    const upd = row.map(c => (c || '').toString().trim().toUpperCase())
    if (upd.includes('NEGOZIO') && upd.includes('KG') && upd.includes('GUSTO')) {
      idxHeader = i
      mapCol = {
        sedeNome: upd.indexOf('NEGOZIO'),
        kg: upd.indexOf('KG'),
        gusto: upd.indexOf('GUSTO'),
        motivo: upd.indexOf('MOTIVO'),
      }
      break
    }
  }
  if (idxHeader < 0) {
    out.warnings.push('Header NEGOZIO/KG/GUSTO non trovato nello sheet GELATO ELIMINATO.')
    return out
  }

  for (let i = idxHeader + 1; i < matrice.length; i++) {
    const row = matrice[i] || []
    const sedeNome = (row[mapCol.sedeNome] || '').toString().trim()
    if (!sedeNome) continue
    const qta = Number(row[mapCol.kg]) || 0
    const gusto = (row[mapCol.gusto] || '').toString().trim().toUpperCase()
    const motivo = mapCol.motivo >= 0 ? (row[mapCol.motivo] || '').toString().trim() : ''
    if (!gusto || qta <= 0) continue
    // Filtra righe di totale
    if (gusto === 'TOTALE' || gusto === 'TOTALI' || gusto.startsWith('TOTALE ') ||
        gusto.startsWith('SUBTOTALE') || gusto === 'SOMMA' || gusto === 'TOT') continue
    out.righe.push({ sedeNome, qta, gusto, motivo })
  }
  return out
}

// ── Helper: diff vs DB ─────────────────────────────────────────────────────
// Confronta le righe parsate dal file con quelle gia' in DB per la stessa
// (sede, gusto, data). Ritorna 4 categorie:
//   nuovi:        riga del file non presente in DB
//   identici:     riga del file uguale al DB
//   divergenti:   riga del file diversa dal DB sui campi prod_g / riman_g
//   solo_db:      riga presente in DB ma non nel file (informativo, non
//                 alteriamo MAI dati in DB che il file non tocca)
//
// Le date del file SONO l'autorita': il file dichiara una settimana, e
// noi confrontiamo solo i giorni che il file ha veramente esplicitato.

export function diffConDb(righeFile, righeDb) {
  const out = { nuovi: [], identici: [], divergenti: [], solo_db: [] }
  if (!Array.isArray(righeFile)) return out
  const keyDb = new Map(
    (righeDb || []).map(r => [`${r.gusto_nome}|${r.data}`, r])
  )
  const keyFile = new Set(righeFile.map(r => `${r.gusto_nome}|${r.data}`))

  for (const rf of righeFile) {
    const key = `${rf.gusto_nome}|${rf.data}`
    const db = keyDb.get(key)
    if (!db) {
      out.nuovi.push(rf)
      continue
    }
    const dbProd = Number(db.produzione_g) || 0
    const dbRim = Number(db.rimanenza_g) || 0
    const fProd = Number(rf.produzione_g) || 0
    const fRim = Number(rf.rimanenza_g) || 0
    if (dbProd === fProd && dbRim === fRim) {
      out.identici.push(rf)
    } else {
      out.divergenti.push({
        gusto_nome: rf.gusto_nome,
        data: rf.data,
        produzione: { vecchio: dbProd, nuovo: fProd },
        rimanenza: { vecchio: dbRim, nuovo: fRim },
      })
    }
  }
  for (const db of (righeDb || [])) {
    if (!keyFile.has(`${db.gusto_nome}|${db.data}`)) out.solo_db.push(db)
  }
  return out
}
