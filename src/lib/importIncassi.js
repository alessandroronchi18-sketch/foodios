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

import { eRigaDiTotale } from './righeDiTotale'
import { fmt } from './formatIt'

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

/**
 * Righe di totale ("TOTALE MESE", "TOT") da non importare mai come giornata.
 *
 * Il riconoscimento vive in `righeDiTotale.js`, uno per tutto il prodotto:
 * qui era più stretto — `tot` all'inizio oppure «totale mese» — e lasciava
 * passare «Subtotale», «Somma», «Riepilogo», «A riportare». Una di quelle
 * righe importata come giornata vale un mese di incasso.
 */
export function isRigaTotale(valore) {
  return eRigaDiTotale(valore)
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
function spesaDaCellaGrezza(importoColonna, testo) {
  const desc = String(testo ?? '').trim()
  const tot = Number(importoColonna) || 0
  if (!desc && tot <= 0) return []

  const pezzi = desc.split(';').map(p => p.trim()).filter(Boolean)
  if (pezzi.length <= 1) {
    if (tot <= 0) return []
    // «F)» da sola: la parentesi aperta è sparita, ma la lettera dice com'è
    // la spesa. Il 09/10/2026, De Gasperi 8/9: 27,37 € con scritto solo «F)».
    const troncata = notazioneTroncata(desc)
    if (troncata) {
      return [{ importo: tot, descrizione: 'spesa non descritta', documento: troncata, notazioneTroncata: true }]
    }
    return [{
      importo: tot,
      descrizione: descrizionePulita(desc) || 'spesa non descritta',
      documento: documentoDaTesto(desc),
    }]
  }

  // Importo in CODA al nome: "MACCH.NER.20,4;MINIMARKET238(F)" (Berthollet,
  // 15/09/2026, 258,40 € in colonna). Senza questo caso i due pezzi non hanno
  // importo e la colonna si divideva a metà: 129,20 € a testa invece di
  // 20,40 e 238. Si accetta solo se la somma dei pezzi è esattamente il totale
  // della colonna: è la prova che i numeri in coda sono importi.
  const inCoda = pezzi.map(p => {
    const m = descrizionePulita(p).match(/^(.*?[A-Za-zÀ-ù.])\s*(\d+(?:[.,]\d+)?)$/)
    return m ? { nome: m[1], importo: Number(m[2].replace(',', '.')), p } : null
  })
  if (tot > 0 && inCoda.every(Boolean)
    && !pezzi.some(p => /^\s*\d+(?:[.,]\d+)?\s+\S/.test(p))
    && Math.abs(inCoda.reduce((s, x) => s + x.importo, 0) - tot) <= 0.02) {
    return inCoda.map(x => ({
      importo: x.importo,
      descrizione: descrizionePulita(x.nome).replace(/[.\s]+$/, '') || 'spesa',
      documento: documentoDaTesto(x.p),
      _esplicito: notazioneEsplicita(x.p),
    }))
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
        conImporto.push({ importo: v, descrizione: descrizionePulita(m[2]) || 'spesa', documento: documentoDaTesto(p), _esplicito: notazioneEsplicita(p) })
        continue
      }
    }
    conImporto.push({ importo: null, descrizione: descrizionePulita(p) || 'spesa', documento: documentoDaTesto(p), _esplicito: notazioneEsplicita(p) })
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

/** La notazione scritta nel pezzo, o null se non ce n'è nessuna. */
function notazioneEsplicita(testo) {
  const t = String(testo ?? '')
  return /\(\s*(no\s*f|f|\?)\s*\)|\bno\s*f\b(?!\w)/i.test(t) ? documentoDaTesto(t) : null
}

/** «F)» o «(F» da soli: notazione con una parentesi mancante. Restituisce il documento o null. */
function notazioneTroncata(testo) {
  const m = String(testo ?? '').trim().toLowerCase().match(/^\(?\s*(no\s*f|f)\s*\)?$/)
  if (!m || !/[()]/.test(String(testo))) return null
  return m[1] === 'f' ? 'fattura' : 'senza'
}

/**
 * Una notazione scritta una volta sola in una cella con più spese vale per
 * tutte: «MACCH.NER.20,4;MINIMARKET238(F)» ha una sola «(F)», in fondo. Chi
 * non ha notazione la prende dalle altre, se le altre sono tutte uguali; la
 * voce resta segnata `documentoDedotto` perché è una lettura, non un dato.
 */
function ereditaDocumento(voci) {
  const espliciti = new Set(voci.map(v => v._esplicito).filter(Boolean))
  return voci.map(({ _esplicito, ...v }) => (
    !_esplicito && espliciti.size === 1
      ? { ...v, documento: [...espliciti][0], documentoDedotto: true }
      : v
  ))
}

export function spesaDaCella(importoColonna, testo) {
  return ereditaDocumento(spesaDaCellaGrezza(importoColonna, testo))
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
  // Il giorno deve esistere nel mese: «31 settembre» non c'è, e senza questo
  // controllo ogni foglio con la riga 31 riempita di formule (totali a 0,00)
  // portava una giornata fantasma per sede (09/10/2026: 62 chiusure invece di 60).
  if (!annoMese || !Number.isInteger(g) || g < 1 || g > giorniNelMese(annoMese)) return null
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
      const pos = inc.colPos != null ? num(riga[inc.colPos]) : null
      const con = inc.colContanti != null ? num(riga[inc.colContanti]) : null
      const tot = inc.colTotale != null ? num(riga[inc.colTotale]) : null
      if (!data) {
        // Un giorno che nel mese non esiste (il 31 di un mese da 30): se porta
        // dei soldi non si butta in silenzio, si dice.
        if (Number.isInteger(Number(g)) && Number(g) > giorniNelMese(annoMese) && Number(g) <= 31
          && ((pos || 0) + (con || 0) + (tot || 0)) > 0) {
          avvisi.push({
            tipo: 'giorno_fuori_mese', sede: inc.sede,
            messaggio: `${inc.sede}: il giorno ${g} ha degli importi, ma ${etichettaAnnoMese(annoMese)} ha ${giorniNelMese(annoMese)} giorni. Quella riga non è stata letta: controlla il mese scelto.`,
          })
        }
        continue
      }
      if (pos == null && con == null && tot == null) continue
      // Riga con le sole formule dei totali, a zero e senza nessun importo
      // scritto: giornata non ancora compilata, non una chiusura a zero.
      if (pos == null && con == null && !(tot > 0)) continue

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
        const dove = `${sp.sede || 'spese'} ${Number(g)}/${annoMese.slice(5)}`
        if (s.notazioneTroncata) {
          avvisi.push({ tipo: 'spesa_da_controllare', data, sede: sp.sede, messaggio: `${dove}: ${eur(s.importo)} con scritto solo «${String(txt).trim()}». L'ho letta come spesa con fattura, senza descrizione.` })
        } else if (s.importoResiduo || s.importoStimato) {
          avvisi.push({ tipo: 'spesa_da_controllare', data, sede: sp.sede, messaggio: `${dove}: ${s.descrizione} ${eur(s.importo)} è una quota calcolata, non scritta nel foglio.` })
        } else if (s.documentoDedotto) {
          avvisi.push({ tipo: 'spesa_da_controllare', data, sede: sp.sede, messaggio: `${dove}: «${s.descrizione}» non ha (F) o (no F) scritto: ho preso quello delle altre voci della cella (${s.documento === 'fattura' ? 'con fattura' : 'senza fattura'}).` })
        }
      }
    }
  }

  // Delivery senza la riga di incasso della stessa sede e giorno: la chiusura
  // nasce col solo delivery, e il suo `totale` sarebbe il delivery stesso.
  for (const c of chiusure.values()) {
    if (c.pos == null && c.contanti == null && c.delivery != null) {
      avvisi.push({
        tipo: 'solo_delivery', data: c.data, sede: c.sede,
        messaggio: `${c.sede} ${c.data}: c'è il delivery (${eur(c.delivery)}) ma nessun incasso del negozio.`,
      })
    }
  }

  controlliSulFoglio(righe, piano, annoMese, chiusure, movimenti, avvisi)

  return { chiusure: [...chiusure.values()], movimenti, avvisi, piano }
}

const eur = fmt

/**
 * Quello che il foglio dice FUORI dalle tabelle, e il confronto con i totali
 * che il foglio stesso scrive. Aggiunge `avvisi`, non cambia i dati.
 *
 *  - una spesa nell'INTESTAZIONE della colonna (a Mara capita: un copia-incolla
 *    della spesa del 15 finito sopra la colonna);
 *  - una nota di scontrino annullato / stornato, con la data e l'importo;
 *  - la riga «TOTALE MESE» del foglio contro la somma di quello che abbiamo
 *    letto: se non torna, si è perso o raddoppiato qualcosa.
 */
function controlliSulFoglio(righe, piano, annoMese, chiusure, movimenti, avvisi) {
  const intest = righe[piano.rigaIntestazione] || []
  const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')))
  const lista = [...chiusure.values()]

  // 1. Spesa nell'intestazione.
  for (const sp of piano.spese) {
    const h = String(intest[sp.colDescrizione] ?? '').trim()
    if (!/\d/.test(h) || isSpesa(h)) continue
    const numeri = (h.match(/\d+(?:,\d+)?/g) || []).map(x => Number(x.replace(',', '.'))).filter(n => n > 0)
    const somma = numeri.reduce((a, b) => a + b, 0)
    const uguale = movimenti.find(m => chiaveSede(m.sede) === chiaveSede(sp.sede)
      && (numeri.some(n => Math.abs(m.importo - n) < 0.01) || Math.abs(m.importo - somma) < 0.01))
    avvisi.push({
      tipo: 'intestazione_con_spesa', sede: sp.sede,
      messaggio: `${sp.sede || 'Spese'}: sopra la colonna delle spese c'è scritto «${h}». Non l'ho contata come spesa`
        + (uguale ? `: è uguale a quella del giorno ${Number(uguale.data.slice(8))} che ho già letto.` : `: se è una spesa vera aggiungila a mano.`),
    })
  }

  // 2. Note di scontrino annullato / storno.
  for (let r = 0; r < righe.length; r++) {
    for (const cella of righe[r] || []) {
      if (typeof cella !== 'string' || !/annull|storn/i.test(cella)) continue
      const m = cella.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)/i)
      const importo = m ? num(m[1].includes(',') || /\.\d{3}(?!\d)/.test(m[1]) ? m[1] : m[1].replace('.', ',')) : null
      const d = cella.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/)
      const sede = (piano.incassi.map(i => i.sede).find(s => chiaveSede(cella).includes(chiaveSede(s)))) || null
      // La data si scrive in due modi: «3-9-26» e «in data 20 luglio».
      const scritta = cella.match(/(?<!\d)(\d{1,2})\s+(?:di\s+)?([a-zà-ù]{3,})/i)
      const giorno = d ? Number(d[1]) : (scritta && meseDaParola(scritta[2]) >= 0 ? Number(scritta[1]) : null)
      const ch = sede && giorno ? lista.find(c => chiaveSede(c.sede) === chiaveSede(sede) && Number(c.data.slice(8)) === giorno) : null
      let esito = ''
      if (importo && ch) {
        esito = ch.totale >= importo
          ? ` Il totale di quel giorno è ${eur(ch.totale)}: potrebbe contenerlo ancora, controlla.`
          : ` Il totale di quel giorno è ${eur(ch.totale)}, più piccolo: lo scontrino annullato non è dentro.`
      }
      avvisi.push({
        tipo: 'scontrino_annullato', sede, data: ch?.data || null, importo,
        messaggio: `Nota nel foglio: «${cella.trim()}».${esito}`,
      })
    }
  }

  // 3. Totali scritti nel foglio contro la somma letta.
  const rTot = righe.findIndex((riga, r) => r > piano.rigaIntestazione && riga && Object.values(riga).some(v => typeof v === 'string' && isRigaTotale(v)) && piano.incassi.some(i => isRigaTotale(riga[i.colGiorno])))
  if (rTot >= 0) {
    const rigaTot = righe[rTot]
    const confronta = (etichetta, scritto, calcolato) => {
      if (typeof scritto !== 'number') return
      if (Math.abs(scritto - calcolato) > 0.05) {
        avvisi.push({
          tipo: 'totale_mese_non_quadra',
          messaggio: `${etichetta}: il foglio scrive ${eur(scritto)} nella riga dei totali, io leggendo i giorni ottengo ${eur(Math.round(calcolato * 100) / 100)}.`,
        })
      }
    }
    for (const inc of piano.incassi) {
      const sue = lista.filter(c => chiaveSede(c.sede) === chiaveSede(inc.sede))
      if (inc.colPos != null) confronta(`${inc.sede}, POS`, rigaTot[inc.colPos], sue.reduce((s, c) => s + (c.pos || 0), 0))
      if (inc.colContanti != null) confronta(`${inc.sede}, contanti`, rigaTot[inc.colContanti], sue.reduce((s, c) => s + (c.contanti || 0), 0))
      if (inc.colTotale != null) confronta(`${inc.sede}, totale`, rigaTot[inc.colTotale], sue.reduce((s, c) => s + (c.totale || 0) - (c.pos == null && c.contanti == null ? (c.delivery || 0) : 0), 0))
    }
    for (const dl of piano.delivery) {
      const sue = lista.filter(c => chiaveSede(c.sede) === chiaveSede(dl.sede))
      confronta(`${dl.sede}, delivery`, rigaTot[dl.col], sue.reduce((s, c) => s + (c.delivery || 0), 0))
    }
    for (const sp of piano.spese) {
      confronta(`${sp.sede || 'Spese'}, uscite di cassa`, rigaTot[sp.colImporto],
        movimenti.filter(m => chiaveSede(m.sede) === chiaveSede(sp.sede)).reduce((s, m) => s + m.importo, 0))
    }
  }
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
  const { mese, anno } = periodoDaTesto(t)
  if (mese != null && anno) return `${anno}-${String(mese + 1).padStart(2, '0')}`
  return null
}

// Distanza di modifica fra due parole (per i refusi: «setembre», «ottobe»).
function distanza(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

/**
 * Il mese (0-11) a cui somiglia una parola, oppure -1.
 *
 * Nomi di file scritti a mano: «SETEMBRE» (una T sola, 09/10/2026, il file
 * vero di Mara), «sett», «ott», «Agost». Si accetta l'abbreviazione (almeno tre
 * lettere, che sia l'inizio del mese) e un refuso solo se la parola è lunga e
 * UN solo mese le somiglia. «MARAMA» (il nome dell'azienda) non è «marzo».
 */
export function meseDaParola(parola) {
  const p = String(parola ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (p.length < 3) return -1
  const esatto = MESI.indexOf(p)
  if (esatto >= 0) return esatto
  const abbreviati = MESI.map((m, i) => (m.startsWith(p) ? i : -1)).filter(i => i >= 0)
  if (abbreviati.length === 1) return abbreviati[0]
  if (p.length >= 5) {
    const soglia = p.length >= 8 ? 2 : 1
    const vicini = MESI.map((m, i) => ({ i, d: distanza(p, m) })).filter(x => x.d <= soglia)
    if (vicini.length === 1) return vicini[0].i
  }
  return -1
}

/** Mese e anno che si leggono in un testo qualsiasi: {mese: 0-11|null, anno: 2026|null}. */
function periodoDaTesto(testo) {
  const t = String(testo ?? '').toLowerCase()
  const anno = t.match(/(?<!\d)(20\d{2})(?!\d)/)
  let mese = null
  for (const w of t.match(/[a-zà-ù]+/g) || []) {
    const i = meseDaParola(w)
    if (i >= 0) { mese = i; break }
  }
  return { mese, anno: anno ? Number(anno[1]) : null }
}

/** Quanti giorni ha il mese 'YYYY-MM'. Se il periodo non è valido: 31. */
export function giorniNelMese(annoMese) {
  const m = String(annoMese ?? '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  return m ? new Date(Number(m[1]), Number(m[2]), 0).getDate() : 31
}

const aaaamm = (anno, mese0) => `${anno}-${String(mese0 + 1).padStart(2, '0')}`

/**
 * Il periodo del file, da TUTTE le fonti: nome del file, nome del foglio,
 * testo dentro il foglio (un titolo «Settembre 2026», una nota con una data
 * «3-9-26»).
 *
 * Restituisce {annoMese, fonte, dubbio}: `annoMese` è '' se non si sa, e
 * `dubbio` dice perché l'utente deve guardare (fonti che non concordano, mese
 * senza anno). Il periodo sbagliato sposta un mese intero di soldi, quindi nel
 * dubbio si chiede.
 */
export function rilevaPeriodo({ nomeFile, nomiFogli = [], righe = [] } = {}) {
  const fonti = []
  const aggiungi = (fonte, annoMese, mese, anno) => {
    if (annoMese || mese != null) fonti.push({ fonte, annoMese, mese, anno })
  }

  const pn = periodoDaTesto(nomeFile)
  aggiungi('dal nome del file', annoMeseDaNomeFile(nomeFile), pn.mese, pn.anno)
  for (const nf of nomiFogli) {
    const pf = periodoDaTesto(nf)
    aggiungi(`dal foglio «${nf}»`, annoMeseDaNomeFile(nf), pf.mese, pf.anno)
  }

  // Testo dentro il foglio: una data in una nota, o un titolo con il mese.
  let daTesto = null
  for (const riga of righe.slice(0, 80)) {
    for (const cella of riga || []) {
      if (typeof cella !== 'string' || cella.length < 3) continue
      const d = cella.match(/(?<!\d)(\d{1,2})[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})(?!\d)/)
      if (d) {
        const a = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])
        daTesto = { annoMese: aaaamm(a, Number(d[2]) - 1), mese: Number(d[2]) - 1, anno: a }
        break
      }
      const pt = periodoDaTesto(cella)
      if (pt.mese != null) {
        daTesto = { annoMese: pt.anno ? aaaamm(pt.anno, pt.mese) : null, mese: pt.mese, anno: pt.anno }
        break
      }
    }
    if (daTesto) break
  }
  if (daTesto) aggiungi('dal testo nel foglio', daTesto.annoMese, daTesto.mese, daTesto.anno)

  // Il primo con mese E anno vince; un mese letto senza anno prende l'anno da
  // un'altra fonte.
  let scelta = fonti.find(f => f.annoMese)
  let dubbio = null
  if (!scelta) {
    const soloMese = fonti.find(f => f.mese != null)
    const conAnno = fonti.find(f => f.anno)
    if (soloMese && conAnno) scelta = { fonte: soloMese.fonte, annoMese: aaaamm(conAnno.anno, soloMese.mese) }
    else if (soloMese) dubbio = `Il mese sembra ${MESI[soloMese.mese]} (${soloMese.fonte}), ma non si capisce l'anno.`
  }
  if (!scelta) return { annoMese: '', fonte: '', dubbio: dubbio || 'Dal nome del file e dal foglio non si capisce il mese.' }

  const discorde = fonti.find(f => f.annoMese && f.annoMese !== scelta.annoMese)
  if (discorde) {
    dubbio = `${scelta.fonte[0].toUpperCase()}${scelta.fonte.slice(1)} risulta ${etichettaAnnoMese(scelta.annoMese)}, ${discorde.fonte} ${etichettaAnnoMese(discorde.annoMese)}.`
  }
  return { annoMese: scelta.annoMese, fonte: scelta.fonte, dubbio }
}

/** Il periodo in italiano, per farlo confermare all'utente: "luglio 2026". */
export function etichettaAnnoMese(annoMese) {
  const m = String(annoMese ?? '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  if (!m) return ''
  return `${MESI[Number(m[2]) - 1]} ${m[1]}`
}
