// FotoOCR - Componente analisi foto via Claude Vision API.
// Modi: 'ricetta' | 'produzione' | 'magazzino' | 'prezzi'
//
// Estratto da Dashboard.jsx. Usato da MagazzinoView, ProduzioneGiornaliera, NuovaRicetta.
// `_ocrPending` è module-state: persiste il risultato AI quando il componente
// viene smontato (es. utente naviga via durante l'analisi) e lo restituisce al remount.

import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { backgroundManager } from '../lib/backgroundManager'
import { compressImage } from '../lib/imageUtils'
import { callAi, parseAiJson } from '../lib/aiClient'
import { color as T, font } from '../lib/theme'

// Palette compatibile con il vecchio Dashboard.jsx (C.*)
const C = {
  white: T.bgCard, bgCard: T.bgCard, text: T.text, textMid: T.textMid, textSoft: T.textSoft,
  border: T.border, borderStr: T.borderStr,
  red: T.brand, redLight: T.brandLight,
  green: T.green, amber: T.amber, amberLight: T.amberLight,
  // Una chiave che manca qui non rompe niente e non si vede: `C.bgSubtle`
  // torna `undefined`, React non scrive lo sfondo, e il riquadro resta
  // trasparente senza che nessun controllo se ne accorga. È già successo
  // con `amberDark` il 19/09/2026.
  bgSubtle: T.bgSubtle,
}

// Module-level store: persists AI results across FotoOCR unmount/remount
const _ocrPending = {} // { [mode]: { parsed, loading, error } }

export default function FotoOCR({ mode, onResult, onBatchSave, notify, ricettario }) {
  const [imgs, setImgs] = useState([])
  const [img, setImg] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [confermando, setConfermando] = useState(false)
  const [error, setError] = useState(null)
  const [multiResults, setMultiResults] = useState([])
  const [mediaType, setMediaType] = useState('image/jpeg')
  const inputRef = useRef(null)

  // Restore pending result when component remounts after navigation
  useEffect(() => {
    const p = _ocrPending[mode]
    if (!p) return
    if (p.parsed) { setParsed(p.parsed); setLoading(false); delete _ocrPending[mode] }
    else if (p.error) { setError(p.error); setLoading(false); delete _ocrPending[mode] }
    else if (p.loading) { setLoading(true) }
  }, [mode])

  const PROMPTS = {
    ricetta: `You are an expert OCR and recipe parser for Italian and international artisan pastry recipes.
The image may be: handwritten notes, a cookbook page, a printed recipe sheet - in ITALIAN or ENGLISH.
Instructions:
- Read ALL ingredients carefully even if handwriting is unclear - infer from context
- Extract the recipe name. If in English translate to Italian: "carrot cake"→"TORTA DI CAROTE", "banana bread"→"BANANA BREAD", "apple cake"→"TORTA DI MELE", "cookies"→"COOKIES", "poppy seed cake"→"POPPY SEEDS", "lemon coconut"→"LIMONE E COCCO"
- Extract each ingredient name IN ITALIAN LOWERCASE. Translate from English if needed: "butter"→"burro", "eggs"→"uovo", "flour"→"farina 00", "sugar"→"zucchero", "milk"→"latte intero", "cream"→"panna fresca", "baking powder"→"lievito chimico", "baking soda"→"bicarbonato", "vanilla"→"estratto di vaniglia", "cocoa powder"→"cacao amaro in polvere", "chocolate chips"→"gocce di cioccolato", "carrots"→"carota", "bananas"→"banana", "poppy seeds"→"seme di papavero", "cinnamon"→"cannella in polvere", "nutmeg"→"noce moscata", "walnuts"→"noce", "almonds"→"mandorla", "honey"→"miele", "oil"→"olio di semi", "lemon zest"→"scorza di limone", "cornstarch"→"amido di mais"
- Extract quantity AND unit EXACTLY as written (do NOT pre-convert to grams). Use the unit from the recipe: "g","kg","ml","l","dl","cl","cucchiaio","cucchiaini","tazza","bicchiere","noce","pizzico","qb"
- "q.b." or "to taste" → quantita:0, unita:"qb"
- Extract any cooking notes (temperature °C, minutes) as a string
- "for X servings/slices/pieces" → use X as porzioni
- CRITICAL: Return ONLY valid JSON, no text before or after, no markdown backticks
{"nome":"RECIPE NAME IN UPPERCASE ITALIAN","porzioni":8,"ingredienti":[{"nome":"ingredient name in italian lowercase","quantita":250,"unita":"g"}],"note":"cooking notes or empty string"}`,

    produzione: `You are an OCR specialist for Italian artisan pastry daily production notes.
The image is a handwritten note (paper, notebook) with today's production - e.g. "2 carote", "1 banana", "3 cookies", OR in English: "2 carrot cake", "1 banana bread".
Instructions:
- Read each line even if cursive, abbreviated, or in English
- "stampi" = number of trays/batches produced (NOT number of slices)
- Match English names to Italian: "carrot cake"/"carrot"→"TORTA DI CAROTE", "banana bread"/"banana"→"BANANA BREAD", "apple cake"→"TORTA DI MELE", "cookies"→"COOKIES", "poppy"/"poppy seeds"→"POPPY SEEDS", "domori"/"chocolate"→"DOMORI", "lemon coconut"→"LIMONE E COCCO"
- If abbreviated (e.g. "ban."=banana bread, "car."=carote, "cook."=cookies) infer from context
- Names ALWAYS UPPERCASE in JSON
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"prodotti":[{"nome":"PRODUCT NAME UPPERCASE","stampi":integer_number}]}`,

    prezzi: `You are an OCR specialist for Italian artisan pastry wholesale price lists and invoices.
The image may be a: handwritten price list, printed wholesale catalogue, delivery receipt/invoice, supermarket receipt, or supplier price sheet - in Italian or English.
Instructions:
- Extract EVERY ingredient/product that has a visible price
- Ingredient names in ITALIAN lowercase: translate from English if needed ("butter"→"burro", "flour"→"farina 00", "eggs"→"uova", "sugar"→"zucchero", "cream"→"panna fresca", "milk"→"latte intero", "chocolate"→"cioccolato fondente")
- Extract the price PER KG (€/kg). Convert if needed: price per 100g × 10 = €/kg, price per 500g × 2 = €/kg, price per unit (e.g. 250g butter at €2.50) = €10/kg
- If you see a total invoice amount without per-unit price, skip that line
- Be conservative: if price is ambiguous, skip rather than guess
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"ingredienti":[{"nome":"ingredient name italian lowercase","prezzo_kg":price_per_kg_as_number}]}`,

    bolla: `You are an OCR specialist for Italian supplier delivery notes (DDT / bolla) and purchase invoices (fattura) for a pastry shop or gelateria.
Read the WHOLE document: the header (supplier, document number, date, delivery address) and every line of goods.
CRITICAL RULE - do NOT do arithmetic. Report EXACTLY what is printed, in the units printed. Converting to euro-per-kilo is done downstream by code that shows its work to the user; a conversion done here is invisible and cannot be checked.
Instructions:
- Header:
  - "fornitore" = the SUPPLIER company name, i.e. whose letterhead is at the top. NOT the addressee ("Spett.le", "Destinatario"), which is the shop receiving the goods
  - "numero" = document number as printed; "data" = document date in YYYY-MM-DD. A two-digit year means 20xx ("19/09/26" is 2026-09-19)
  - "tipoDocumento" = what the document calls itself, as printed: "D.D.T.", "Documento di Trasporto", "Fattura", "Fattura Accompagnatoria"
  - "destinazione" = the DELIVERY address block, labelled "Destinazione merce", "Destinazione" or "DESTINAZIONE DIVERSA". Report the whole block as one string. This is where the goods physically go and it is often a DIFFERENT shop from the addressee. If there is no such block, omit the field
  - "testataFornitore" = the supplier's whole letterhead block verbatim, newlines kept: name, address, phone, fax, email, website, VAT number, fiscal code, IBAN, payment terms. Do not clean it up, do not reorder it
  - "riferimentoDdt" = if a line or the header says this invoice refers to a delivery note ("Ddt nr. 20/26 del 05-06-2026", "rif. DDT 1685"), report that text verbatim. This means the goods were already delivered on that note
  - "totaleScrittoAMano" = a handwritten amount on the document ("Ammonta EUR 2.651,00"), as printed. Handwriting only - never a printed total
  - "senzaPrezzi" = true if the document has NO unit-price and NO line-amount column at all (a pure delivery note). Do not confuse this with a price column that exists but is empty on some rows
  - "piuDocumenti" = true if the photo clearly shows more than one document (a second sheet behind, a card receipt stapled on top)
- For EVERY line of goods extract:
  - "codice": the supplier article code, as printed ("51139", "DOT.001", "A065/C", "B085/B-16"). It may sit in its own column, or on the line BELOW the description ("Cod. 1007"). It is the only stable identifier: descriptions get truncated by the column width
  - "nome": the product name in ITALIAN lowercase, cleaned of pack wording. "FARINA TIPO 00 SACCO 25KG" -> "farina 00". Translate from English if needed. If the printed description is cut off mid-word ("LATTE UHT INTERO FRASCHERI B"), report it as it is - do not invent the ending
  - "quantita": the number in the quantity column, as printed. IF THE QUANTITY IS SPLIT INTO THREE COLUMNS (lorda / tara / netta, i.e. gross / tare / net), REPORT THE NET ONE - that is the quantity the price applies to and the quantity that actually arrived
  - "quantitaLorda" and "tara": also report them, as printed, when those columns exist
  - "unita": the unit of measure EXACTLY as printed ("KG","PZ","N.","NR","CF","LT","CT","SC","PA","SACCHI")
  - "pesoConfezioneG": ONLY if the line states the WEIGHT of one pack/sack/piece, converted to grams ("SACCO 25KG" -> 25000, "conf. 500 g" -> 500). If not stated, omit. NEVER guess it
  - "pezziPerConfezione": ONLY if the line states HOW MANY PIECES are in one pack, as a number ("COPPETTA BIO 16/B MARA N.250" -> 250, "TOVAGLIOLO MARA N. 12.000" -> 12000, "ESTORIL GLUT.FREE BOX 288 PZ." -> 288, "CANN.21/6 COMPOST-BIA pz500" -> 500, "PALETTINA BIO/TRASP 645 pz." -> 645). If not stated, omit. NEVER guess it
  - "prezzoUnitario": the unit price column, as printed
  - "imponibile": the line total NET of VAT, as printed
  - "totaleConIva": the line total INCLUDING VAT, only if that is what is printed
  - "aliquotaIva": the VAT percentage for that line as a number (4, 10, 22) if printed
  - "scontoPct": the line discount percentage if printed as a number
  - "scontoTesto": the discount cell when it contains a WORD instead of a number ("Omaggio", "100%")
  - "tipoRiga": the single letter of the line-type column when the document has one, as printed. Italian delivery notes print a legend at the foot: (V)=Vendita (M)=Sconto in merce (O)=Omaggio (I)=Omaggio Riv. Iva (R)=Reso (N)=Reso Inv. This letter decides whether goods came in or went back
- COLUMN ALIGNMENT: some dot-matrix documents print the description column shifted by one row against the code and quantity columns, because the first description line is a note (e.g. "ORDINE CLIENTE 65139 DEL 14/09/26"). Anchor each line on the CODE and the QUANTITY, which are always aligned with each other, and match the description that belongs to that code. A description with no quantity beside it is a note, not a product
- Numbers: keep the Italian format exactly as printed ("1.250,50" stays "1.250,50"). Do NOT reformat
- Omit any field you cannot read. An omitted field means "unknown" and is handled; a guessed field is a wrong price nobody will notice
- Do NOT extract lot numbers.
- SKIP lines that are not goods, and do not report them at all:
  - transport, packaging charges, stamp duty, collection fees, CONAI contribution
  - totals, VAT recaps, "TOT. DA PAGARE", "TOTALE DOCUMENTO"
  - legal boilerplate printed inside the description column ("Assolve gli obblighi di cui all'art.62", "NON SI ACCETTANO RECLAMI", "CATEGORIA: OVE NON INDICATO", "IN OTTEMPERANZA AL REG. CE 178/2002")
  - bank details and IBANs, delivery instructions ("ORARIO DI SCARICO dalle 9 alle 12", "CONSEGNA SOLO DI MATTINA")
  - ADVERTISING blocks, even when they contain an article code and a price per kilo. Example, printed large in the middle of the page: "OFFERTA FINO AD ESAURIMENTO PROSC.CRUDO ANTICA PIEVE(7208) A 8,98 EURO AL KG". A promotion is not a delivery: if a line has no quantity in the quantity column, it is not goods
  - the "ORDINE CLIENTE nnnnn DEL gg/mm/aa" reference line
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"fornitore":"supplier name","numero":"doc number","data":"YYYY-MM-DD","tipoDocumento":"D.D.T.","destinazione":"delivery address block","testataFornitore":"supplier letterhead verbatim","senzaPrezzi":false,"righe":[{"codice":"1007","nome":"italian lowercase","quantita":5,"unita":"SACCHI","pesoConfezioneG":25000,"pezziPerConfezione":null,"prezzoUnitario":"18,50","imponibile":"92,50","aliquotaIva":4,"tipoRiga":"V"}]}`,

    magazzino: `You are an OCR specialist for Italian pastry ingredient/supply lists.
The image is a handwritten list (sheet, notebook, delivery receipt) of ingredients received with quantities - may be in Italian or English.
Instructions:
- Read each line even if cursive or abbreviated
- Convert ALL to grams: 1kg=1000g, 500g=500g, 1L milk≈1030g, 1L cream≈1000g, 1L oil≈920g, 1 block butter 250g=250g, 1lb=454g, 1oz=28g
- If quantity unreadable set quantita_g:0
- Ingredient names in ITALIAN lowercase: "butter"→"burro", "flour"→"farina 00", "sugar"→"zucchero", "eggs"→"uova", "milk"→"latte intero", "cream"→"panna fresca"
- Common abbreviations: "burr."=burro, "far."=farina, "zucc."=zucchero, "uov."=uova
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"ingredienti":[{"nome":"ingredient name italian lowercase","quantita_g":grams_number}]}`,
  }

  const readFileAsBase64 = (f) => new Promise(res => {
    const r = new FileReader()
    r.onload = ev => res({ data: ev.target.result.split(',')[1], preview: ev.target.result, mediaType: f.type?.startsWith('image/') ? f.type : 'image/jpeg' })
    r.readAsDataURL(f)
  })

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setParsed(null); setError(null); setMultiResults([])
    const compressed = await Promise.all(files.map(f => compressImage(f)))
    if (compressed.length === 1) {
      const read = await readFileAsBase64(compressed[0])
      setImg(read.data); setPreview(read.preview); setMediaType(read.mediaType)
      setImgs([read])
    } else {
      const reads = await Promise.all(compressed.map(readFileAsBase64))
      setImgs(reads)
      setImg(reads[0].data); setPreview(reads[0].preview); setMediaType(reads[0].mediaType)
    }
  }

  const analyzeOneImage = async (imgData, imgMediaType) => {
    const { text, json: viaParser } = await callAi({
      feature: `foto-ocr-${mode}`,
      model: 'claude-sonnet-5',
      maxTokens: 1500,
      timeoutMs: 60_000,
      messages: [{
        role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: imgData } },
          { type: 'text', text: PROMPTS[mode] },
        ],
      }],
      parseJson: true,
    })
    // parseJson sa già pulire markdown + estrarre primo {…}. Fallback strict.
    const out = viaParser ?? parseAiJson(text)
    if (!out) throw Object.assign(new Error('Risposta AI con JSON non valido'), { friendly: 'L\'AI non ha restituito dati validi. Riprova con una foto più nitida o riprova fra 30s.' })
    return out
  }

  const handleAnalizza = () => {
    if (!img) return
    const toProcess = imgs.length > 1 ? imgs : [{ data: img, mediaType }]
    setLoading(true); setError(null); setParsed(null); setMultiResults([])

    // Batch save mode (multiple ricette, one per photo): synchronous to accumulate
    if (mode === 'ricetta' && onBatchSave && toProcess.length > 1) {
      ;(async () => {
        try {
          let saved = 0, skipped = 0, ricettarioAccumulato = null
          for (let i = 0; i < toProcess.length; i++) {
            notify(`Analizzando ricetta ${i + 1} di ${toProcess.length}…`)
            try {
              const obj = await analyzeOneImage(toProcess[i].data, toProcess[i].mediaType)
              const ok = await onBatchSave(obj, i, ricettarioAccumulato, (r) => { ricettarioAccumulato = r })
              if (ok) saved++; else skipped++
            } catch (e) { notify(`Foto ${i + 1}: ${e.message}`, false); skipped++ }
          }
          notify(`✓ ${saved} ricette salvate${skipped > 0 ? ` · ${skipped} saltate` : ''}`)
          reset()
        } catch (e) { setError(e.message) }
        setLoading(false)
      })()
      return
    }

    // Single image or multi-merge: use backgroundManager so analysis survives navigation
    const label = toProcess.length > 1 ? `Analisi ${toProcess.length} foto (${mode})` : `Analisi foto (${mode})`
    const id = `ocr-${mode}-${Date.now()}`
    _ocrPending[mode] = { loading: true, parsed: null, error: null }

    backgroundManager.add(id, {
      tipo: 'ai_analisi', nome: label,
      fn: async (onProgress) => {
        if (toProcess.length === 1) {
          onProgress(20)
          const obj = await analyzeOneImage(toProcess[0].data, toProcess[0].mediaType)
          onProgress(100)
          return obj
        }
        const results = []
        for (let i = 0; i < toProcess.length; i++) {
          const obj = await analyzeOneImage(toProcess[i].data, toProcess[i].mediaType)
          results.push(obj)
          onProgress(Math.round(((i + 1) / toProcess.length) * 100))
        }
        setMultiResults(results)
        if (mode === 'produzione') {
          const byNome = {}
          for (const r of results) for (const p of (r.prodotti || [])) byNome[p.nome] = (byNome[p.nome] || 0) + (p.stampi || 0)
          return { prodotti: Object.entries(byNome).map(([nome, stampi]) => ({ nome, stampi })) }
        } else if (mode === 'bolla') {
          // Una bolla su due pagine si fotografa due volte: l'intestazione sta
          // sulla prima, le righe su tutte. Le righe si mettono in fila senza
          // sommarle — due righe della stessa merce su una bolla vera sono due
          // consegne o due lotti, e sommarle nasconderebbe un prezzo diverso.
          const testa = results.find(r => r?.fornitore || r?.numero || r?.data) || {}
          const righe = []
          for (const r of results) for (const x of (r.righe || [])) righe.push(x)
          return { fornitore: testa.fornitore || '', numero: testa.numero || '', data: testa.data || '', righe }
        } else if (mode === 'prezzi') {
          const byNome = {}
          for (const r of results) for (const i of (r.ingredienti || [])) if (i.prezzo_kg > 0) byNome[i.nome] = i.prezzo_kg
          return { ingredienti: Object.entries(byNome).map(([nome, prezzo_kg]) => ({ nome, prezzo_kg })) }
        } else {
          const byNome = {}
          for (const r of results) for (const i of (r.ingredienti || [])) byNome[i.nome] = (byNome[i.nome] || 0) + (i.quantita_g || 0)
          return { ingredienti: Object.entries(byNome).map(([nome, quantita_g]) => ({ nome, quantita_g })) }
        }
      },
      onComplete: (obj) => {
        _ocrPending[mode] = { loading: false, parsed: obj, error: null }
        setParsed(obj)
        setLoading(false)
      },
      onError: (err) => {
        _ocrPending[mode] = { loading: false, parsed: null, error: err.message }
        setError(err.message)
        setLoading(false)
      },
    })
  }

  // Audit 2026-09-14: i dati letti dalla foto venivano buttati SUBITO, prima di
  // sapere se il salvataggio era andato a buon fine. Se falliva, il messaggio
  // diceva "Riprova" ma non c'era più niente da riprovare: la foto e l'elenco
  // riconosciuto erano spariti, e bisognava rifare la foto della bolla.
  //
  // Contratto con chi ci passa `onResult`: se lancia, o se restituisce `false`,
  // vuol dire che NON ha salvato, e qui non si cancella niente.
  const handleConferma = async () => {
    if (!parsed || confermando) return
    setConfermando(true)
    try {
      const esito = await onResult(parsed)
      if (esito === false) return
      setImg(null); setPreview(null); setParsed(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      notify?.(e.friendly || e.message || 'Non ho potuto salvare quello che ho letto dalla foto: i dati sono ancora qui, riprova', false)
    } finally {
      setConfermando(false)
    }
  }

  const reset = () => {
    setPreview(null); setImg(null); setImgs([]); setParsed(null); setError(null); setMultiResults([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const ML = {
    ricetta:    { title: 'Foto della ricetta',          sub: 'Foglio scritto a mano o pagina di libro - Claude legge anche grafia difficile' },
    produzione: { title: "Foto dell'appunto di oggi",   sub: 'Foglietto o quaderno con le torte prodotte - anche corsivo abbreviato' },
    magazzino:  { title: 'Foto della lista ingredienti', sub: 'Foglio scritto con gli ingredienti arrivati e le quantità' },
    prezzi:     { title: 'Foto del listino / fattura',   sub: 'Listino prezzi, fattura fornitore, scontrino - Claude estrae €/kg automaticamente' },
    bolla:      { title: 'Foto della bolla',            sub: 'La bolla o la fattura arrivata con la merce: carica le giacenze e aggiorna i prezzi in una volta sola' },
    // Un modo senza etichetta faceva esplodere la pagina intera con
    // «Cannot read properties of undefined»: la mappa dei modi stava qui e i
    // prompt duecento righe sopra, e il 19/09/2026 ne ho aggiunto uno di là
    // dimenticando di qua. Adesso al massimo il riquadro resta anonimo.
  }[mode] || { title: 'Foto', sub: '' }

  return (
    <div style={{ background: '#F8F4F2', border: `2px dashed ${C.borderStr}`, borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="camera" size={14} /> {ML.title}</div>
        <div style={{ fontSize: 12, color: C.textSoft, marginTop: 2 }}>{ML.sub}</div>
      </div>
      {!preview && !parsed && !loading && !error ? (
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px', background: C.white, border: `1px dashed ${C.borderStr}`, borderRadius: 10, cursor: 'pointer' }}>
          <span style={{ display: 'inline-flex' }}><Icon name="camera" size={28} color={C.textMid} /></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid }}>Tocca per scattare o scegli foto</span>
          <span style={{ fontSize: 12, color: C.textSoft }}>JPG · PNG · HEIC · <strong>più foto insieme</strong></span>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile}/>
        </label>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: preview ? '180px 1fr' : '1fr', gap: 20, alignItems: 'flex-start' }}>
          {preview && (
            <div style={{ position: 'relative' }}>
              <img src={preview} alt="preview" style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}`, display: 'block' }}/>
              <button aria-label="Rimuovi foto" onClick={reset} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>✕</button>
              {imgs.length > 1 && <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#FFF', fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="camera" size={10} color="#FFF" /> {imgs.length} foto</div>}
              <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile}/>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!parsed && !loading && !error && (
              <button onClick={handleAnalizza} style={{ padding: '12px', background: C.red, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 10px rgba(110,14,26,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Icon name="search" size={15} color={C.white} /> Analizza con AI
              </button>
            )}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', background: C.white, borderRadius: 9, border: `1px solid ${C.border}` }}>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ width: 16, height: 16, border: `2px solid ${C.redLight}`, borderTopColor: C.red, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }}/>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Claude sta leggendo la foto…</div>
              </div>
            )}
            {error && (
              <div style={{ padding: '12px', background: C.redLight, borderRadius: 9 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="warning" size={12} /> {error}</div>
                <button onClick={handleAnalizza} style={{ padding: '6px 14px', background: C.red, color: C.white, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Riprova</button>
              </div>
            )}
            {parsed && !loading && (
              <div style={{ background: C.white, border: `1px solid ${C.green}30`, borderRadius: 10, padding: '14px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 8 }}>✓ Dati estratti</div>
                {mode === 'ricetta' && (
                  <div>
                    {parsed.nome && <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 8 }}>{parsed.nome}</div>}
                    {(parsed.ingredienti || []).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                        {parsed.ingredienti.map((ing, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 8px', background: '#F8F4F2', borderRadius: 4 }}>
                            <span style={{ color: C.text, fontWeight: 600 }}>{ing.nome}</span>
                            <span style={{ color: C.red, fontWeight: 700 }}>
                              {ing.quantita != null ? `${ing.quantita > 0 ? ing.quantita : 'q.b.'} ${ing.quantita > 0 ? (ing.unita || 'g') : ''}`.trim() : `${ing.qty || 0}g`}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '8px 10px', background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 6, fontSize: 12, color: C.amber, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="warning" size={12} /> Nessun ingrediente estratto - prova con una foto più nitida
                      </div>
                    )}
                    {parsed.note && <div style={{ fontSize: 12, color: C.textSoft, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="edit" size={11} /> {parsed.note}</div>}
                  </div>
                )}
                {mode === 'produzione' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                    {(parsed.prodotti || []).map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 8px', background: '#F8F4F2', borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600 }}>{p.nome}</span>
                        <span style={{ color: C.red, fontWeight: 700 }}>{p.stampi} stamp{p.stampi === 1 ? 'o' : 'i'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mode === 'magazzino' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {(parsed.ingredienti || []).map((ing, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 8px', background: '#F8F4F2', borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600, textTransform: 'capitalize' }}>{ing.nome}</span>
                        <span style={{ color: C.green, fontWeight: 700 }}>{ing.quantita_g >= 1000 ? `${(ing.quantita_g / 1000).toFixed(1)}kg` : `${ing.quantita_g}g`}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mode === 'bolla' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto', marginBottom: 6 }}>
                    <div style={{ fontSize: font.size.sm, color: C.textMid, fontWeight: 700, padding: '2px 0' }}>
                      {[parsed.fornitore, parsed.numero && `n. ${parsed.numero}`, parsed.data]
                        .filter(Boolean).join(' · ') || 'Intestazione non leggibile'}
                    </div>
                    {(parsed.righe || []).map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.size.sm, padding: '3px 8px', background: C.bgSubtle, borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600, textTransform: 'capitalize' }}>{r.nome}</span>
                        <span style={{ color: C.textMid, whiteSpace: 'nowrap' }}>
                          {r.quantita} {r.unita}{r.imponibile ? ` · ${r.imponibile} €` : ''}
                        </span>
                      </div>
                    ))}
                    {(parsed.righe || []).length === 0 && (
                      <div style={{ fontSize: font.size.sm, color: C.textSoft, padding: '6px 0' }}>Nessuna riga di merce riconosciuta</div>
                    )}
                  </div>
                )}
                {mode === 'prezzi' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {(parsed.ingredienti || []).filter(i => i.prezzo_kg > 0).map((ing, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 8px', background: '#FEF9EC', borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600, textTransform: 'capitalize' }}>{ing.nome}</span>
                        <span style={{ color: C.amber, fontWeight: 700 }}>€ {Number(ing.prezzo_kg).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</span>
                      </div>
                    ))}
                    {(parsed.ingredienti || []).filter(i => i.prezzo_kg > 0).length === 0 && (
                      <div style={{ fontSize: 12, color: C.textSoft, padding: '6px 0' }}>Nessun prezzo estratto</div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleConferma} disabled={confermando} style={{ flex: 1, padding: '9px', background: confermando ? C.textSoft : C.green, color: C.white, border: 'none', borderRadius: 7, fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="checkCircle" size={13} color={C.white} /> Usa questi dati</button>
                  <button onClick={() => setParsed(null)} style={{ padding: '9px 14px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Rianalizza</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
