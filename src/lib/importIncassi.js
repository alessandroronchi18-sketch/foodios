// Lettura dei registri incassi tenuti a mano su foglio di calcolo.
//
// Nasce dal file reale di Mara ("INCASSI MARAMA LUGLIO 2026.xlsx"), ma è
// scritto per riconoscere il PATTERN, non quel file: registri fatti così se ne
// trovano in mezza Italia, perché nascono dal quaderno di cassa.
//
// La forma è questa: un foglio solo, con più tabelle AFFIANCATE separate da
// colonne vuote, tutte indicizzate per giorno del mese.
//
//   GIORNO │ X POS │ X Contanti │ Tot X │ Y POS │ … ││ GIORNO │ deliv X │ … ││ GIORNO │ spesa │ descrizione
//      1   │ 788,10│   288,30   │1076,40│1202,55│ … ││   1    │   70,00 │ … ││   1    │   ·   │      ·
//
// Tre difficoltà, tutte affrontate qui:
//
// 1. LE TABELLE VANNO SEPARATE. Non è una griglia sola: sono blocchi
//    indipendenti che condividono solo la colonna del giorno. Si individuano
//    dalle colonne vuote che fanno da separatore.
//
// 2. LE INTESTAZIONI SONO SCRITTE A MANO, quindi irregolari: "Berthollet POS",
//    "Berthollet- Contanti", "De Gasperi Contanti", "Totale De Gasperi " con
//    lo spazio in fondo. Il riconoscimento è tollerante.
//
// 3. LE SPESE STANNO IN TESTO LIBERO, con la notazione contabile dentro:
//    "limoni (No F)" senza fattura, "carrefour(f)" con fattura, "frutta(?)"
//    dubbia. E più spese possono stare nella stessa cella separate da ";",
//    a volte con l'importo ripetuto dentro il testo.

// ── Riconoscimento delle intestazioni ───────────────────────────────────────

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[^a-zà-ù0-9]+/g, ' ')
  .trim()

const isGiorno   = (h) => /^(giorno|data|gg)$/.test(norm(h))
const isPos      = (h) => /\bpos\b|bancomat|carte?\b|elettronic/.test(norm(h))
const isContanti = (h) => /contant|cassa|liquid/.test(norm(h))
const isTotale   = (h) => /^tot/.test(norm(h)) || /\btotale\b/.test(norm(h))
const isDelivery = (h) => /deliver|glovo|deliveroo|just ?eat|asporto domicilio/.test(norm(h))
const isSpesa    = (h) => /^spes[ae]?$|acquist|uscit/.test(norm(h))

/**
 * Chiave di confronto fra nomi di sede.
 *
 * Nel foglio la stessa sede è scritta in modi diversi a seconda della colonna:
 * "Berthollet" negli incassi, "delivery berthollet" nel blocco consegne. Senza
 * normalizzare, il delivery finiva su una sede fantasma in minuscolo invece di
 * agganciarsi alla giornata giusta.
 */
export function chiaveSede(nome) {
  return String(nome ?? '').toLowerCase().replace(/[^a-zà-ù0-9]+/g, '').trim()
}

/** Righe di totale ("TOTALE MESE", "TOT") da non importare mai come giornata. */
export function isRigaTotale(valore) {
  const n = norm(valore)
  return n.startsWith('tot') || n.includes('totale mese')
}

/**
 * Nome della sede a partire da un'intestazione tipo "Berthollet- Contanti".
 * Si toglie la parola tecnica e resta il nome del punto vendita.
 */
export function nomeSedeDaIntestazione(h) {
  return String(h ?? '')
    .replace(/\b(pos|contanti|totale|tot|delivery|spesa|spese)\b/gi, '')
    .replace(/[-–—_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Notazione contabile dentro il testo libero ──────────────────────────────

/**
 * Interpreta la notazione di Mara sul documento della spesa.
 *   (F) o (f)        → 'fattura'   spesa documentata
 *   (no F) (noF)     → 'senza'     spesa non documentata
 *   (?)              → 'incerto'   documento da verificare
 * Niente notazione   → 'incerto', perché non sappiamo: meglio dirlo che
 *                      dichiarare una fattura che nessuno ha visto.
 */
export function documentoDaTesto(testo) {
  const t = String(testo ?? '').toLowerCase()
  if (/\(\s*no\s*f\s*\)|\bno\s*f\b(?!\w)/.test(t)) return 'senza'
  if (/\(\s*\?\s*\)/.test(t)) return 'incerto'
  if (/\(\s*f\s*\)/.test(t)) return 'fattura'
  return 'incerto'
}

/** Toglie la notazione dal testo, per lasciare la descrizione leggibile. */
export function descrizionePulita(testo) {
  return String(testo ?? '')
    .replace(/\(\s*(no\s*f|f|\?)\s*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.-]+|[\s,;.-]+$/g, '')
    .trim()
}

/**
 * Una cella di spesa può contenere più acquisti separati da ";", e a volte
 * l'importo è ripetuto dentro il testo:
 *   "10,5 anguria(noF);23,7 carta(F)"
 *
 * Se i pezzi hanno un importo proprio si usano quelli; l'importo della colonna
 * resta come controllo. Se non ce l'hanno, l'importo della colonna va tutto
 * sulla voce unica: non lo dividiamo per il numero di pezzi, che sarebbe
 * inventarsi una ripartizione.
 */
export function spesaDaCella(importoColonna, testo) {
  const desc = String(testo ?? '').trim()
  const tot = Number(importoColonna) || 0
  if (!desc && tot <= 0) return []

  const pezzi = desc.split(';').map(p => p.trim()).filter(Boolean)
  if (pezzi.length <= 1) {
    if (tot <= 0) return []
    return [{
      importo: tot,
      descrizione: descrizionePulita(desc) || 'spesa non descritta',
      documento: documentoDaTesto(desc),
    }]
  }

  const conImporto = []
  let sommaPezzi = 0
  for (const p of pezzi) {
    // Importo iniziale del pezzo: "36,4 koko(F)" → 36.4
    const m = p.match(/^\s*(\d+(?:[.,]\d+)?)\s+(.*)$/)
    if (m) {
      const v = Number(m[1].replace(',', '.'))
      if (v > 0) {
        sommaPezzi += v
        conImporto.push({ importo: v, descrizione: descrizionePulita(m[2]) || 'spesa', documento: documentoDaTesto(p) })
        continue
      }
    }
    conImporto.push({ importo: null, descrizione: descrizionePulita(p) || 'spesa', documento: documentoDaTesto(p) })
  }

  const senzaImporto = conImporto.filter(x => x.importo == null)
  const residuo = Math.round((tot - sommaPezzi) * 100) / 100

  if (senzaImporto.length === 0) {
    // Tutti i pezzi hanno un importo, ma la loro somma può non arrivare al
    // totale della colonna: nel foglio di Mara capita quando una voce viene
    // annotata senza cifra. Il residuo NON va perso in silenzio — sono soldi
    // veri usciti dalla cassa — ma aggiunto come voce esplicita da verificare.
    if (residuo > 0.01) {
      return [...conImporto, {
        importo: residuo,
        descrizione: 'resto della giornata non dettagliato',
        documento: 'incerto',
        importoResiduo: true,
      }]
    }
    return conImporto
  }

  // Alcuni pezzi non hanno importo: il residuo va a loro, in parti uguali. È
  // l'unica ripartizione difendibile, e resta segnalata come stima.
  if (residuo <= 0) return conImporto.filter(x => x.importo != null)
  const quota = Math.round((residuo / senzaImporto.length) * 100) / 100
  return conImporto.map(x => x.importo != null ? x : { ...x, importo: quota, importoStimato: true })
}

/**
 * Quanto una colonna e' "numerica" o "testuale", guardando i dati e non
 * l'intestazione. Serve a distinguere la colonna degli importi da quella delle
 * descrizioni quando le etichette sono sfalsate, come capita nei fogli
 * compilati a mano.
 */
export function profiloColonna(righe, c, dopoRiga = 0) {
  let numeri = 0, testi = 0
  for (let r = dopoRiga + 1; r < righe.length; r++) {
    const v = (righe[r] || [])[c]
    if (v == null || String(v).trim() === '') continue
    if (isRigaTotale(v)) continue
    if (typeof v === 'number') { numeri++; continue }
    const t = String(v).trim().replace(/[€\s]/g, '').replace(',', '.')
    if (t !== '' && Number.isFinite(Number(t))) numeri++
    else testi++
  }
  return { numeri, testi }
}

// ── Riconoscimento dei blocchi ──────────────────────────────────────────────

/**
 * Individua i blocchi di tabella affiancati: gruppi di colonne contigue
 * separati da almeno una colonna interamente vuota.
 */
export function trovaBlocchi(righe) {
  const nCol = Math.max(0, ...righe.map(r => (r || []).length))
  const colonnaVuota = (c) => righe.every(r => {
    const v = (r || [])[c]
    return v == null || String(v).trim() === ''
  })

  const blocchi = []
  let inizio = null
  for (let c = 0; c < nCol; c++) {
    if (colonnaVuota(c)) {
      if (inizio != null) { blocchi.push({ da: inizio, a: c - 1 }); inizio = null }
    } else if (inizio == null) inizio = c
  }
  if (inizio != null) blocchi.push({ da: inizio, a: nCol - 1 })
  return blocchi
}

/** Indice della riga di intestazione: la prima che contiene "GIORNO". */
export function trovaRigaIntestazione(righe) {
  for (let r = 0; r < Math.min(righe.length, 10); r++) {
    if ((righe[r] || []).some(isGiorno)) return r
  }
  return 0
}

/**
 * La colonna del giorno, cercata prima per intestazione e poi per contenuto.
 *
 * Nel file di Mara il blocco delle spese non ha l'intestazione "GIORNO": la
 * colonna dei giorni c'e', ma senza etichetta. Cercarla solo per nome faceva
 * scartare l'intero blocco, e le spese sparivano.
 *
 * Per contenuto e' inconfondibile: numeri interi fra 1 e 31, crescenti.
 */
export function trovaColonnaGiorno(righe, blocco, intest, rIntest) {
  for (let c = blocco.da; c <= blocco.a; c++) {
    if (isGiorno(intest[c])) return c
  }
  let migliore = null
  for (let c = blocco.da; c <= blocco.a; c++) {
    let interi = 0, altro = 0, precedente = 0, crescente = true
    for (let r = rIntest + 1; r < righe.length; r++) {
      const v = (righe[r] || [])[c]
      if (v == null || String(v).trim() === '') continue
      if (isRigaTotale(v)) continue
      const n = typeof v === 'number' ? v : Number(String(v).trim())
      if (Number.isInteger(n) && n >= 1 && n <= 31) {
        interi++
        if (n < precedente) crescente = false
        precedente = n
      } else altro++
    }
    // Soglia bassa di proposito: un foglio puo' coprire pochi giorni, o essere
    // un ritaglio. Il vincolo forte non e' la quantita' ma la forma — SOLO
    // interi da 1 a 31, crescenti, senza nient'altro dentro — che nessuna
    // colonna di importi rispetta per caso.
    if (interi >= 3 && altro === 0 && crescente && (migliore == null || interi > migliore.interi)) {
      migliore = { c, interi }
    }
  }
  return migliore ? migliore.c : null
}

/**
 * Analizza il foglio e restituisce cosa ha capito, senza ancora convertire.
 * Serve a mostrare all'utente un'anteprima prima di importare qualsiasi cosa.
 *
 * @param {Array<Array>} righe  foglio grezzo (array di array)
 * @param {string} annoMese     'YYYY-MM' del periodo a cui si riferisce
 */
export function analizzaFoglioIncassi(righe, annoMese) {
  const rIntest = trovaRigaIntestazione(righe)
  const intest = righe[rIntest] || []
  const blocchi = trovaBlocchi(righe)

  const incassi = []   // { sede, colPos, colContanti, colTotale }
  const delivery = []  // { sede, col }
  const spese = []     // { sede, colImporto, colDescrizione }

  for (const b of blocchi) {
    const gCol = trovaColonnaGiorno(righe, b, intest, rIntest)
    if (gCol == null) continue

    // Le colonne del blocco, con la loro intestazione.
    const cols = []
    for (let c = b.da; c <= b.a; c++) {
      if (c === gCol) continue
      cols.push({ c, h: intest[c] })
    }

    // Delivery: una colonna per sede.
    for (const { c, h } of cols) {
      if (isDelivery(h)) delivery.push({ sede: nomeSedeDaIntestazione(h), col: c, colGiorno: gCol })
    }

    // Spese: riconosciute dal CONTENUTO, non dall'intestazione.
    //
    // In un foglio scritto a mano le etichette non sono allineate alle colonne:
    // nel file di Mara "Berthollet" sta sopra gli importi e "spesa" sopra le
    // descrizioni, sfalsate di una posizione. Fidarsi delle intestazioni faceva
    // saltare tutto il blocco.
    //
    // Il contenuto invece non mente: una colonna di spese e' una colonna quasi
    // tutta numerica seguita da una quasi tutta testuale.
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i], b2 = cols[i + 1]
      if (b2.c !== a.c + 1) continue
      const profA = profiloColonna(righe, a.c, rIntest)
      const profB = profiloColonna(righe, b2.c, rIntest)
      // Basta un dato per parte: una sede puo' avere UNA sola spesa nel mese, e
      // pretenderne di più la renderebbe invisibile. La garanzia non e' la
      // quantita' ma il confronto qui sotto — l'una prevalentemente numerica,
      // l'altra prevalentemente testuale — che due colonne di importi affiancate
      // non soddisfano mai.
      if (profA.numeri < 1 || profB.testi < 1) continue
      if (profA.numeri <= profA.testi) continue
      if (profB.testi <= profB.numeri) continue
      spese.push({
        sede: nomeSedeDaIntestazione(a.h) || nomeSedeDaIntestazione(intest[gCol]) || null,
        colImporto: a.c,
        colDescrizione: b2.c,
        colGiorno: gCol,
      })
      i++   // la colonna descrizione e' consumata
    }

    // Incassi: raggruppa POS/Contanti/Totale per nome sede.
    const perSede = new Map()
    for (const { c, h } of cols) {
      if (isDelivery(h) || isSpesa(h)) continue
      const tipo = isPos(h) ? 'pos' : isContanti(h) ? 'contanti' : isTotale(h) ? 'totale' : null
      if (!tipo) continue
      const sede = nomeSedeDaIntestazione(h)
      // "Totale Giornaliero" non è una sede: è la somma di tutte.
      if (tipo === 'totale' && /giornalier|generale|negozi/i.test(String(h))) continue
      if (!perSede.has(sede)) perSede.set(sede, { sede, colGiorno: gCol })
      perSede.get(sede)[`col${tipo[0].toUpperCase()}${tipo.slice(1)}`] = c
    }
    for (const v of perSede.values()) {
      if (v.colPos != null || v.colContanti != null || v.colTotale != null) incassi.push(v)
    }
  }

  return { rigaIntestazione: rIntest, blocchi, incassi, delivery, spese, annoMese }
}

/** Costruisce la data ISO dal numero di giorno e dal periodo. */
function dataDa(annoMese, giorno) {
  const g = Number(giorno)
  if (!annoMese || !Number.isInteger(g) || g < 1 || g > 31) return null
  return `${annoMese}-${String(g).padStart(2, '0')}`
}

/**
 * Converte il foglio nelle righe da salvare.
 * Restituisce chiusure (una per sede/giorno) e movimenti di cassa (le spese).
 */
export function estraiIncassi(righe, annoMese) {
  const piano = analizzaFoglioIncassi(righe, annoMese)
  const { rigaIntestazione } = piano
  const chiusure = new Map()   // chiave `${sede}|${data}`
  const movimenti = []
  const avvisi = []

  // Se la cella e' già un numero si usa com'e'. Trattarlo come testo italiano
  // e togliergli il punto trasformerebbe 788.1 in 7881: sbagliato di dieci volte
  // su ogni riga, e la somma del mese sarebbe fuori scala.
  const num = (v) => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    const t = String(v).trim().replace(/[€\s]/g, '')
    // Formato italiano solo se la virgola fa da separatore decimale.
    const n = /,\d{1,2}$/.test(t)
      ? Number(t.replace(/\./g, '').replace(',', '.'))
      : Number(t.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  for (let r = rigaIntestazione + 1; r < righe.length; r++) {
    const riga = righe[r] || []

    for (const inc of piano.incassi) {
      const g = riga[inc.colGiorno]
      if (isRigaTotale(g)) continue
      const data = dataDa(annoMese, g)
      if (!data) continue
      const pos = inc.colPos != null ? num(riga[inc.colPos]) : null
      const con = inc.colContanti != null ? num(riga[inc.colContanti]) : null
      const tot = inc.colTotale != null ? num(riga[inc.colTotale]) : null
      if (pos == null && con == null && tot == null) continue

      const totale = tot != null ? tot : (pos || 0) + (con || 0)
      // Il foglio è tenuto a mano: se la somma non torna lo diciamo invece di
      // scegliere in silenzio quale dei due numeri è quello giusto.
      if (tot != null && pos != null && con != null && Math.abs(tot - (pos + con)) > 0.02) {
        avvisi.push({
          tipo: 'totale_non_quadra', data, sede: inc.sede,
          messaggio: `${inc.sede} ${data}: POS ${pos} + contanti ${con} fa ${(pos + con).toFixed(2)}, ma il totale scritto è ${tot.toFixed(2)}.`,
        })
      }
      chiusure.set(`${chiaveSede(inc.sede)}|${data}`, {
        sede: inc.sede, data, totale,
        pos, contanti: con, delivery: null,
      })
    }

    for (const del of piano.delivery) {
      const g = riga[del.colGiorno]
      if (isRigaTotale(g)) continue
      const data = dataDa(annoMese, g)
      const v = num(riga[del.col])
      if (!data || v == null) continue
      // Si aggancia alla chiusura della stessa sede se c'è, altrimenti fa riga.
      const k = `${chiaveSede(del.sede)}|${data}`
      if (chiusure.has(k)) chiusure.get(k).delivery = v
      else chiusure.set(k, { sede: del.sede, data, totale: v, pos: null, contanti: null, delivery: v })
    }

    for (const sp of piano.spese) {
      const g = riga[sp.colGiorno]
      if (isRigaTotale(g)) continue
      const data = dataDa(annoMese, g)
      if (!data) continue
      const imp = num(riga[sp.colImporto])
      const txt = sp.colDescrizione != null ? riga[sp.colDescrizione] : null
      for (const s of spesaDaCella(imp, txt)) {
        if (!(s.importo > 0)) continue
        movimenti.push({ data, sede: sp.sede, ...s })
      }
    }
  }

  return { chiusure: [...chiusure.values()], movimenti, avvisi, piano }
}

// ── Il periodo del foglio ───────────────────────────────────────────────────

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

/**
 * Indovina il periodo dal nome del file: "INCASSI MARAMA LUGLIO 2026.xlsx".
 *
 * Serve perché il foglio contiene solo il giorno del mese — 1, 2, 3 — e il
 * mese sta nel nome del file o in testa alla pagina. Sbagliarlo non produce un
 * errore visibile: sposta un mese intero di incassi su un altro mese, e chi
 * guarda il P&L non ha modo di accorgersene. Meglio proporlo noi e farlo
 * confermare, che chiedere di digitarlo a mano ogni volta.
 *
 * Restituisce 'YYYY-MM', oppure null se dal nome non si capisce.
 */
export function annoMeseDaNomeFile(nome) {
  const t = String(nome ?? '').toLowerCase()

  // Forma già esplicita: 2026-07, 2026_07, 07-2026.
  const iso = t.match(/(20\d{2})[-_.](0[1-9]|1[0-2])(?!\d)/)
  if (iso) return `${iso[1]}-${iso[2]}`
  const inv = t.match(/(?:^|[^\d])(0[1-9]|1[0-2])[-_.](20\d{2})/)
  if (inv) return `${inv[2]}-${inv[1]}`

  // Forma scritta: "luglio 2026". L'anno può stare prima o dopo il mese.
  const anno = t.match(/(20\d{2})/)
  const iMese = MESI.findIndex(m => t.includes(m))
  if (iMese >= 0 && anno) return `${anno[1]}-${String(iMese + 1).padStart(2, '0')}`

  return null
}

/** Il periodo in italiano, per farlo confermare all'utente: "luglio 2026". */
export function etichettaAnnoMese(annoMese) {
  const m = String(annoMese ?? '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  if (!m) return ''
  return `${MESI[Number(m[2]) - 1]} ${m[1]}`
}
