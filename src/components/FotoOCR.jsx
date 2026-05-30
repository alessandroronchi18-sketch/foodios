// FotoOCR — Componente analisi foto via Claude Vision API.
// Modi: 'ricetta' | 'produzione' | 'magazzino' | 'prezzi'
//
// Estratto da Dashboard.jsx. Usato da MagazzinoView, ProduzioneGiornaliera, NuovaRicetta.
// `_ocrPending` è module-state: persiste il risultato AI quando il componente
// viene smontato (es. utente naviga via durante l'analisi) e lo restituisce al remount.

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { backgroundManager } from '../lib/backgroundManager'
import { compressImage } from '../lib/imageUtils'
import { color as T } from '../lib/theme'

// Palette compatibile con il vecchio Dashboard.jsx (C.*)
const C = {
  white: T.bgCard, bgCard: T.bgCard, text: T.text, textMid: T.textMid, textSoft: T.textSoft,
  border: T.border, borderStr: T.borderStr,
  red: T.brand, redLight: T.brandLight,
  green: T.green, amber: T.amber, amberLight: T.amberLight,
}

// Module-level store: persists AI results across FotoOCR unmount/remount
const _ocrPending = {} // { [mode]: { parsed, loading, error } }

export default function FotoOCR({ mode, onResult, onBatchSave, notify, ricettario }) {
  const [imgs, setImgs] = useState([])
  const [img, setImg] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState(null)
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
The image may be: handwritten notes, a cookbook page, a printed recipe sheet — in ITALIAN or ENGLISH.
Instructions:
- Read ALL ingredients carefully even if handwriting is unclear — infer from context
- Extract the recipe name. If in English translate to Italian: "carrot cake"→"TORTA DI CAROTE", "banana bread"→"BANANA BREAD", "apple cake"→"TORTA DI MELE", "cookies"→"COOKIES", "poppy seed cake"→"POPPY SEEDS", "lemon coconut"→"LIMONE E COCCO"
- Extract each ingredient name IN ITALIAN LOWERCASE. Translate from English if needed: "butter"→"burro", "eggs"→"uovo", "flour"→"farina 00", "sugar"→"zucchero", "milk"→"latte intero", "cream"→"panna fresca", "baking powder"→"lievito chimico", "baking soda"→"bicarbonato", "vanilla"→"estratto di vaniglia", "cocoa powder"→"cacao amaro in polvere", "chocolate chips"→"gocce di cioccolato", "carrots"→"carota", "bananas"→"banana", "poppy seeds"→"seme di papavero", "cinnamon"→"cannella in polvere", "nutmeg"→"noce moscata", "walnuts"→"noce", "almonds"→"mandorla", "honey"→"miele", "oil"→"olio di semi", "lemon zest"→"scorza di limone", "cornstarch"→"amido di mais"
- Extract quantity AND unit EXACTLY as written (do NOT pre-convert to grams). Use the unit from the recipe: "g","kg","ml","l","dl","cl","cucchiaio","cucchiaini","tazza","bicchiere","noce","pizzico","qb"
- "q.b." or "to taste" → quantita:0, unita:"qb"
- Extract any cooking notes (temperature °C, minutes) as a string
- "for X servings/slices/pieces" → use X as porzioni
- CRITICAL: Return ONLY valid JSON, no text before or after, no markdown backticks
{"nome":"RECIPE NAME IN UPPERCASE ITALIAN","porzioni":8,"ingredienti":[{"nome":"ingredient name in italian lowercase","quantita":250,"unita":"g"}],"note":"cooking notes or empty string"}`,

    produzione: `You are an OCR specialist for Italian artisan pastry daily production notes.
The image is a handwritten note (paper, notebook) with today's production — e.g. "2 carote", "1 banana", "3 cookies", OR in English: "2 carrot cake", "1 banana bread".
Instructions:
- Read each line even if cursive, abbreviated, or in English
- "stampi" = number of trays/batches produced (NOT number of slices)
- Match English names to Italian: "carrot cake"/"carrot"→"TORTA DI CAROTE", "banana bread"/"banana"→"BANANA BREAD", "apple cake"→"TORTA DI MELE", "cookies"→"COOKIES", "poppy"/"poppy seeds"→"POPPY SEEDS", "domori"/"chocolate"→"DOMORI", "lemon coconut"→"LIMONE E COCCO"
- If abbreviated (e.g. "ban."=banana bread, "car."=carote, "cook."=cookies) infer from context
- Names ALWAYS UPPERCASE in JSON
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"prodotti":[{"nome":"PRODUCT NAME UPPERCASE","stampi":integer_number}]}`,

    prezzi: `You are an OCR specialist for Italian artisan pastry wholesale price lists and invoices.
The image may be a: handwritten price list, printed wholesale catalogue, delivery receipt/invoice, supermarket receipt, or supplier price sheet — in Italian or English.
Instructions:
- Extract EVERY ingredient/product that has a visible price
- Ingredient names in ITALIAN lowercase: translate from English if needed ("butter"→"burro", "flour"→"farina 00", "eggs"→"uova", "sugar"→"zucchero", "cream"→"panna fresca", "milk"→"latte intero", "chocolate"→"cioccolato fondente")
- Extract the price PER KG (€/kg). Convert if needed: price per 100g × 10 = €/kg, price per 500g × 2 = €/kg, price per unit (e.g. 250g butter at €2.50) = €10/kg
- If you see a total invoice amount without per-unit price, skip that line
- Be conservative: if price is ambiguous, skip rather than guess
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"ingredienti":[{"nome":"ingredient name italian lowercase","prezzo_kg":price_per_kg_as_number}]}`,

    magazzino: `You are an OCR specialist for Italian pastry ingredient/supply lists.
The image is a handwritten list (sheet, notebook, delivery receipt) of ingredients received with quantities — may be in Italian or English.
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
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1500,
        messages: [{
          role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: imgData } },
            { type: 'text', text: PROMPTS[mode] },
          ],
        }],
      }),
    })
    if (r.status === 401) throw new Error('Sessione scaduta. Esci e rientra per riprovare.')
    if (r.status === 429) throw new Error('Troppe richieste AI in poco tempo. Riprova fra un minuto.')
    if (!r.ok) throw new Error(`Errore servizio AI (${r.status}). Riprova fra qualche istante.`)
    const d = await r.json()
    if (d.error) throw new Error(d.error)
    const raw = d.content?.find(b => b.type === 'text')?.text || ''
    if (!raw) throw new Error("Nessuna risposta dall'AI — riprova")
    const stripped = raw.replace(/```json\n?|```/g, '').trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Risposta AI non in formato JSON — riprova')
    return JSON.parse(match[0])
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
            notify(`📷 Analizzando ricetta ${i + 1} di ${toProcess.length}…`)
            try {
              const obj = await analyzeOneImage(toProcess[i].data, toProcess[i].mediaType)
              const ok = await onBatchSave(obj, i, ricettarioAccumulato, (r) => { ricettarioAccumulato = r })
              if (ok) saved++; else skipped++
            } catch (e) { notify(`⚠ Foto ${i + 1}: ${e.message}`, false); skipped++ }
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

  const handleConferma = () => {
    if (!parsed) return
    onResult(parsed)
    setImg(null); setPreview(null); setParsed(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const reset = () => {
    setPreview(null); setImg(null); setImgs([]); setParsed(null); setError(null); setMultiResults([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const ML = {
    ricetta:    { title: '📷 Foto della ricetta',          sub: 'Foglio scritto a mano o pagina di libro — Claude legge anche grafia difficile' },
    produzione: { title: "📷 Foto dell'appunto di oggi",   sub: 'Foglietto o quaderno con le torte prodotte — anche corsivo abbreviato' },
    magazzino:  { title: '📷 Foto della lista ingredienti', sub: 'Foglio scritto con gli ingredienti arrivati e le quantità' },
    prezzi:     { title: '📷 Foto del listino / fattura',   sub: 'Listino prezzi, fattura fornitore, scontrino — Claude estrae €/kg automaticamente' },
  }[mode]

  return (
    <div style={{ background: '#F8F4F2', border: `2px dashed ${C.borderStr}`, borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{ML.title}</div>
        <div style={{ fontSize: 10, color: C.textSoft, marginTop: 2 }}>{ML.sub}</div>
      </div>
      {!preview && !parsed && !loading && !error ? (
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px', background: C.white, border: `1px dashed ${C.borderStr}`, borderRadius: 10, cursor: 'pointer' }}>
          <span style={{ fontSize: 28 }}>📷</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMid }}>Tocca per scattare o scegli foto</span>
          <span style={{ fontSize: 10, color: C.textSoft }}>JPG · PNG · HEIC · <strong>più foto insieme</strong></span>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile}/>
        </label>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: preview ? '180px 1fr' : '1fr', gap: 20, alignItems: 'flex-start' }}>
          {preview && (
            <div style={{ position: 'relative' }}>
              <img src={preview} alt="preview" style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}`, display: 'block' }}/>
              <button onClick={reset} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>✕</button>
              {imgs.length > 1 && <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#FFF', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>📷 {imgs.length} foto</div>}
              <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile}/>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!parsed && !loading && !error && (
              <button onClick={handleAnalizza} style={{ padding: '12px', background: C.red, color: C.white, border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 10px rgba(110,14,26,0.25)' }}>
                🔍 Analizza con AI
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
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 6 }}>⚠ {error}</div>
                <button onClick={handleAnalizza} style={{ padding: '6px 14px', background: C.red, color: C.white, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Riprova</button>
              </div>
            )}
            {parsed && !loading && (
              <div style={{ background: C.white, border: `1px solid ${C.green}30`, borderRadius: 10, padding: '14px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 8 }}>✓ Dati estratti</div>
                {mode === 'ricetta' && (
                  <div>
                    {parsed.nome && <div style={{ fontSize: 13, fontWeight: 900, color: C.text, marginBottom: 8 }}>{parsed.nome}</div>}
                    {(parsed.ingredienti || []).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                        {parsed.ingredienti.map((ing, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 8px', background: '#F8F4F2', borderRadius: 4 }}>
                            <span style={{ color: C.text, fontWeight: 600 }}>{ing.nome}</span>
                            <span style={{ color: C.red, fontWeight: 700 }}>
                              {ing.quantita != null ? `${ing.quantita > 0 ? ing.quantita : 'q.b.'} ${ing.quantita > 0 ? (ing.unita || 'g') : ''}`.trim() : `${ing.qty || 0}g`}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '8px 10px', background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 6, fontSize: 11, color: C.amber, marginBottom: 6 }}>
                        ⚠ Nessun ingrediente estratto — prova con una foto più nitida
                      </div>
                    )}
                    {parsed.note && <div style={{ fontSize: 10, color: C.textSoft }}>📝 {parsed.note}</div>}
                  </div>
                )}
                {mode === 'produzione' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                    {(parsed.prodotti || []).map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 8px', background: '#F8F4F2', borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600 }}>{p.nome}</span>
                        <span style={{ color: C.red, fontWeight: 700 }}>{p.stampi} stamp{p.stampi === 1 ? 'o' : 'i'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mode === 'magazzino' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {(parsed.ingredienti || []).map((ing, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 8px', background: '#F8F4F2', borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600, textTransform: 'capitalize' }}>{ing.nome}</span>
                        <span style={{ color: C.green, fontWeight: 700 }}>{ing.quantita_g >= 1000 ? `${(ing.quantita_g / 1000).toFixed(1)}kg` : `${ing.quantita_g}g`}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mode === 'prezzi' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {(parsed.ingredienti || []).filter(i => i.prezzo_kg > 0).map((ing, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 8px', background: '#FEF9EC', borderRadius: 4 }}>
                        <span style={{ color: C.text, fontWeight: 600, textTransform: 'capitalize' }}>{ing.nome}</span>
                        <span style={{ color: C.amber, fontWeight: 700 }}>€{ing.prezzo_kg.toFixed(2)}/kg</span>
                      </div>
                    ))}
                    {(parsed.ingredienti || []).filter(i => i.prezzo_kg > 0).length === 0 && (
                      <div style={{ fontSize: 10, color: C.textSoft, padding: '6px 0' }}>Nessun prezzo estratto</div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleConferma} style={{ flex: 1, padding: '9px', background: C.green, color: C.white, border: 'none', borderRadius: 7, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>✅ Usa questi dati</button>
                  <button onClick={() => setParsed(null)} style={{ padding: '9px 14px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Rianalizza</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
