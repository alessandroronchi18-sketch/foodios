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
