// Estrazione menu prodotti da input freetext o immagini (Claude Vision).
// Usato dalla Demo personalizzata in admin: il founder pre-carica i prodotti
// reali del prospect prima del pitch, poi il seed genera 90gg di chiusure/
// produzione/B2B usando quei prodotti.
//
// API: chiama /api/ai (auth admin) con prompt strutturato. Output JSON validato
// e normalizzato in formato ricettario FoodOS (`ricette` + `ingredienti_costi`).

import { supabase } from './supabase'

// ─── Prompt sistema (Claude Sonnet 4.6) ───────────────────────────────────
const SYSTEM_PROMPT = `Sei un assistente esperto di pasticcerie, gelaterie, bar e ristoranti italiani.

Riceverai del testo libero e/o foto del listino prezzi di un'attività italiana e devi estrarre i PRODOTTI strutturati.

Output: SOLO JSON valido in questo formato esatto (niente markdown, niente commenti):
{
  "nome_attivita": "...",
  "citta": "...",
  "tipo_attivita": "pasticceria|gelateria|bar|panetteria|ristorante|pizzeria",
  "prodotti": [
    {
      "nome": "TIRAMISÙ AL CAFFÈ",
      "categoria": "Dolci al cucchiaio",
      "tipo": "pezzo",
      "unita": 1,
      "prezzo": 4.50,
      "ingredienti": [
        { "nome": "mascarpone", "qty_g": 200 },
        { "nome": "savoiardi", "qty_g": 100 },
        { "nome": "uova", "qty_g": 100 },
        { "nome": "caffe_espresso", "qty_g": 50 },
        { "nome": "zucchero", "qty_g": 60 }
      ]
    }
  ]
}

REGOLE STRETTE:
- nome: UPPERCASE, max 45 caratteri, niente accenti gravi su lettere isolate
- categoria: "Torte" | "Crostate" | "Biscotti" | "Lievitati" | "Dolci al cucchiaio" | "Gelati" | "Salato" | "Bevande" | "Plumcake" | "Muffin" | "Cioccolateria" | "Confetteria" | "Altro"
- tipo: "pezzo" (singolo, monoporzione), "fetta" (torta intera divisa in fette), oppure "kg" (vendita a peso, gelato)
- unita: se tipo="fetta" → numero fette per stampo (6, 8, 10, 12); se tipo="pezzo" o "kg" → 1
- prezzo: numero decimale tra 0.50 e 80 EUR (per unità di vendita)
- ingredienti: 3-6 voci principali con quantità in grammi per UN intero stampo (es. torta da 8 fette → quantità per la torta intera, non per fetta)
- ingredienti.nome: lowercase, snake_case, italiano (mascarpone, savoiardi, pistacchio, farina_00, zucchero, burro, uova, latte, panna, cacao, vaniglia, lievito_di_birra, ecc.)
- ingredienti.qty_g: tra 5 e 3000 grammi

ALTRE REGOLE:
- Se mancano prezzi nel testo → stima realistica IT 2024-2026
- Se l'input è scarno (<5 prodotti) → estendi con prodotti plausibili per il tipo+città fino a 10-12 totali
- Riconosci specialità regionali (cuneese al rhum, krapfen, gianduiotto, bonèt, panettoncino, ravioles, ecc.)
- Mai inventare prodotti che non esistono in Italia
- Mai mettere bollini, codici di prodotto, prezzi in centesimi (€0.04)
- Riconosci variazioni (BRIOCHE VUOTA, BRIOCHE CIOCCOLATO sono prodotti distinti)

Restituisci SOLO il JSON. Niente testo prima/dopo.`

// ─── Helper: compressione + base64 di un File (browser) ───────────────────
export async function compressImageToBase64(file, maxSide = 1500, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lettura file fallita'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Decodifica immagine fallita'))
      img.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        // Output JPEG per dimensione minore
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        // Estrai solo la parte base64 (drop "data:image/jpeg;base64,")
        const base64 = dataUrl.split(',')[1] || ''
        resolve({ base64, media_type: 'image/jpeg', size_kb: Math.round(base64.length / 1024) })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ─── Validation + normalize del JSON estratto ─────────────────────────────
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }
function sanitizeNome(s) {
  return String(s || '').toUpperCase()
    .replace(/[^A-ZÀÈÉÌÒÙ0-9 '·-]/g, '')
    .trim()
    .slice(0, 45)
}
function sanitizeIngrediente(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40)
}
const CATEGORIE_VALIDE = new Set([
  'Torte', 'Crostate', 'Biscotti', 'Lievitati', 'Dolci al cucchiaio',
  'Gelati', 'Salato', 'Bevande', 'Plumcake', 'Muffin', 'Cioccolateria',
  'Confetteria', 'Altro',
])

export function normalizeMenu(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('AI ha restituito un formato non valido')
  }
  const prodottiRaw = Array.isArray(rawJson.prodotti) ? rawJson.prodotti : []
  if (prodottiRaw.length === 0) {
    throw new Error('Nessun prodotto estratto dal listino. Riprova con una foto più chiara o aggiungi del testo.')
  }
  const prodotti = []
  const seen = new Set()
  for (const p of prodottiRaw) {
    const nome = sanitizeNome(p?.nome)
    if (!nome || nome.length < 2) continue
    if (seen.has(nome)) continue
    seen.add(nome)
    const tipoRaw = String(p?.tipo || 'pezzo').toLowerCase()
    const tipo = ['pezzo', 'fetta', 'kg'].includes(tipoRaw) ? tipoRaw : 'pezzo'
    const unita = tipo === 'fetta'
      ? clamp(Math.round(Number(p?.unita) || 8), 4, 16)
      : 1
    const prezzo = clamp(Number(p?.prezzo) || 0, 0.50, 80)
    if (prezzo <= 0) continue
    const categoria = CATEGORIE_VALIDE.has(p?.categoria) ? p.categoria : 'Altro'
    // Ingredienti: max 8, qty 5-3000g
    const ingrediRaw = Array.isArray(p?.ingredienti) ? p.ingredienti.slice(0, 8) : []
    const ingredienti = []
    for (const ing of ingrediRaw) {
      const ingNome = sanitizeIngrediente(ing?.nome)
      const qty = clamp(Number(ing?.qty_g) || 0, 5, 3000)
      if (!ingNome || qty <= 0) continue
      ingredienti.push({ nome: ingNome, qty1stampo: qty })
    }
    if (ingredienti.length === 0) continue // skip prodotti senza ingredienti
    prodotti.push({ nome, categoria, tipo, unita, prezzo: Math.round(prezzo * 100) / 100, ingredienti })
  }
  if (prodotti.length === 0) {
    throw new Error('Tutti i prodotti estratti erano malformati. Verifica nomi e prezzi.')
  }
  return {
    nome_attivita: String(rawJson?.nome_attivita || '').slice(0, 100),
    citta: String(rawJson?.citta || '').slice(0, 60),
    tipo_attivita: String(rawJson?.tipo_attivita || '').slice(0, 30),
    prodotti,
  }
}

// ─── Converte il menu normalizzato in formato ricettario FoodOS ───────────
export function menuToRicettario(menu) {
  const ricette = {}
  const ingredientiCosti = {}
  // Dizionario fallback prezzi €/g (usato se l'ingrediente non è in PREZZI_HORECA
  // di foodcost.js). Comunque calcolaFC userà il fallback HORECA via normIng.
  const STIMA_COSTI = {
    mascarpone: 0.0089, savoiardi: 0.0058, pan_di_spagna: 0.0050,
    caffe_espresso: 0.0150, caffe: 0.0150, gelatina: 0.0420,
    pistacchio_bronte: 0.0680, ricotta: 0.0042, philadelphia: 0.0095,
    fragole: 0.0095, lamponi: 0.0150, frutti_di_bosco: 0.0125,
    crema_pasticcera: 0.0045, ganache: 0.0095, glassa_neutra: 0.0035,
    base_gelato_bianca: 0.0042, base_gelato_gialla: 0.0050,
    pasta_pistacchio: 0.0480, pasta_nocciola: 0.0320, pasta_caffe: 0.0250,
  }
  for (const p of menu.prodotti) {
    ricette[p.nome] = {
      nome: p.nome,
      categoria: p.categoria,
      sheetName: 'demo',
      numStampi: 1, totImpasto1: 0, foodCost1: 0,
      tipo: p.tipo,
      unita: p.unita,
      prezzo: p.prezzo,
      ingredienti: p.ingredienti,
    }
    for (const ing of p.ingredienti) {
      if (ingredientiCosti[ing.nome]) continue
      // Se l'ingrediente è in STIMA_COSTI → usa quello; altrimenti lascia
      // che calcolaFC trovi il fallback HORECA via normIng().
      if (STIMA_COSTI[ing.nome]) {
        ingredientiCosti[ing.nome] = { costoG: STIMA_COSTI[ing.nome], isStima: true }
      }
    }
  }
  return { ricette, ingredienti_costi: ingredientiCosti }
}

// ─── Call /api/ai per estrarre menu ───────────────────────────────────────
// Accetta { text?, images? } dove images è array { base64, media_type }.
// Ritorna oggetto normalizzato + ricettario pronto per il seed.
export async function extractMenuFromInput({ text = '', images = [] } = {}) {
  if (!text && (!images || images.length === 0)) {
    throw new Error('Fornisci almeno una foto o del testo da analizzare')
  }
  if (images.length > 8) throw new Error('Massimo 8 foto')
  // Build content array: foto + testo
  const content = []
  for (const img of images) {
    if (!img?.base64 || !img?.media_type) continue
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.base64 },
    })
  }
  const promptText = text
    ? `Ecco il listino del cliente (testo + ${images.length > 0 ? 'foto allegate' : 'no foto'}):\n\n${text.slice(0, 8000)}\n\nEstrai i prodotti seguendo le regole del sistema.`
    : `Ecco le foto del listino del cliente. Estrai i prodotti seguendo le regole del sistema.`
  content.push({ type: 'text', text: promptText })

  // Autenticazione: lo stesso pattern di FotoOCR.jsx
  const session = (await supabase.auth.getSession()).data.session
  if (!session?.access_token) throw new Error('Sessione scaduta — rilogga')

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  })
  if (res.status === 401) throw new Error('Sessione scaduta — rilogga')
  if (res.status === 429) throw new Error('Troppe richieste AI in poco tempo. Riprova fra un minuto.')
  if (!res.ok) throw new Error(`Errore servizio AI (${res.status}). Riprova fra qualche istante.`)
  const data = await res.json()
  const rawText = data.content?.find(b => b.type === 'text')?.text || ''
  if (!rawText) throw new Error('AI non ha prodotto output testuale')

  // Parse JSON robusto (estrae il primo blocco { ... })
  const stripped = rawText.replace(/```json\n?|```/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI non ha restituito JSON. Riprova con foto più chiara o testo più dettagliato.')
  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    throw new Error('AI ha restituito JSON malformato. Riprova.')
  }

  const normalized = normalizeMenu(parsed)
  const ricettario = menuToRicettario(normalized)
  return {
    menu: normalized,
    ricettario,
  }
}
