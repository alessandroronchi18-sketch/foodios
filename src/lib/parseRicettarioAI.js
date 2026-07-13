// Parser ricettario AI-driven: fallback quando il parser rigido
// (parseRicettario.js) non trova ricette perche' il file non segue lo schema
// standard. Passa il contenuto del foglio a Claude che lo interpreta come
// linguaggio naturale e restituisce JSON strutturato pronto per Foodos.
//
// Uso: preferire `parseRicettarioSmart(file)` che tenta prima il parser
// rigido (istantaneo, gratis) e fa fallback su AI solo se necessario.

import { loadXLSX } from './xlsx'
import { normIng } from './foodcost'
import { callAi } from './aiClient'
import { parseRicettario } from './parseRicettario'

const SYSTEM_PROMPT = `Sei un esperto parser di ricettari di pasticceria, gelateria e panetteria italiana.

Ricevi il contenuto grezzo di un foglio Excel come testo CSV (multi-sheet, separati da "=== SHEET: nome ==="). Il tuo compito e' identificare TUTTE le ricette elencate e restituire un JSON strutturato, indipendentemente dal layout usato.

**REGOLA D'ORO**: se il file dichiara 40 ricette nell'header, devi restituirne 40. Non pigrizia: elabora ogni singola ricetta anche se il file e' grande. Meglio un JSON lungo che ricette mancanti.

## Layout comuni che DEVI riconoscere

**Layout A - una ricetta per sheet**: ogni sheet e' una ricetta, con nome in cima e righe ingrediente+quantita' sotto.

**Layout B - tabella classica per riga**: un solo sheet, 3+ colonne (ricetta / ingrediente / quantita'), una riga per (ricetta, ingrediente).

**Layout C - PIVOT / MATRICE (frequente in gelaterie)**: uno sheet dove le RICETTE stanno nelle COLONNE (nomi nella prima riga) e gli INGREDIENTI stanno nelle RIGHE (nomi nella prima colonna). Ogni cella interna e' la quantita' di quell'ingrediente per quella ricetta; celle vuote = ingrediente non usato. Le colonne di intestazione a volte si ripetono a meta' foglio (es. la colonna "quantitativo materia prima per gusto" compare 2 volte come separatore visivo): la matrice CONTINUA sulla destra con ALTRE ricette diverse.

### Esempio Layout C (pivot gelateria)

Input CSV:
\`\`\`
quantitativo materia prima per gusto,Arancia,Banana,Base Bianca,Bunet,quantitativo materia prima per gusto,Mango,Nocciola,Pistacchio
Acqua,0.355,0.355,,,Acqua,,,
Amaretti,,,,0.1,Amaretti,,,
Base bianca,,,0.1,0.75,Base bianca,0.375,1,1
Cacao,,,,0.06,Cacao,,,
Pasta nocciola,,,,,Pasta nocciola,,0.25,
Pasta pistacchio,,,,,Pasta pistacchio,,,0.25
\`\`\`

Contiene 7 ricette DISTINTE: Arancia, Banana, Base Bianca, Bunet, Mango, Nocciola, Pistacchio (le colonne "quantitativo materia prima per gusto" sono separatori). Devi produrre 7 oggetti in "ricette", ognuno con gli ingredienti che nella sua colonna hanno valore > 0. Le quantita' sono in kg -> converti in grammi (0.355 kg -> 355 g).

Output atteso (frammento):
\`\`\`json
{"ricette": [
  {"nome":"ARANCIA","ingredienti":[{"nome":"acqua","qty1stampo":355}]},
  {"nome":"BANANA","ingredienti":[{"nome":"acqua","qty1stampo":355}]},
  {"nome":"BASE BIANCA","ingredienti":[{"nome":"base bianca","qty1stampo":100}]},
  {"nome":"BUNET","ingredienti":[{"nome":"amaretti","qty1stampo":100},{"nome":"base bianca","qty1stampo":750},{"nome":"cacao","qty1stampo":60}]},
  {"nome":"MANGO","ingredienti":[{"nome":"base bianca","qty1stampo":375}]},
  {"nome":"NOCCIOLA","ingredienti":[{"nome":"base bianca","qty1stampo":1000},{"nome":"pasta nocciola","qty1stampo":250}]},
  {"nome":"PISTACCHIO","ingredienti":[{"nome":"base bianca","qty1stampo":1000},{"nome":"pasta pistacchio","qty1stampo":250}]}
]}
\`\`\`

**Listino prezzi**: uno sheet chiamato "listino", "prezzi", "materie prime" o simile, colonne tipo (nome | unita | costo confezione | €/kg o €/unita). Estrai in "ingredienti_costi".

## Output atteso

Ogni ricetta:
- nome: string in MAIUSCOLO (es. "NOCCIOLA", "TORTA MELE", "CREMA PASTICCERA")
- ingredienti: array di { nome: string lowercase (singolare, italiano), qty1stampo: number in GRAMMI, costoPerG?: number in EUR/grammo }
- note?: string
- tipo?: 'fetta' | 'pezzo' | 'semilavorato'  (default 'fetta'; usa 'semilavorato' per basi/impasti riutilizzati come "base bianca", "pasta sfoglia", "crema pasticcera intermedia")

## Regole obbligatorie

1. **Unita' di misura**: se le quantita' sono in kg/l/ml/cucchiai, convertile SEMPRE in grammi. 1 kg = 1000 g; 1 l acqua/latte/panna = 1000 g; 1 ml olio = 0.92 g; 1 cucchiaio = 15 g. Numeri decimali come 0.355 o 0.45 in un foglio gelateria sono quasi sempre KILOGRAMMI → moltiplica per 1000 (0.355 kg → 355 g).
2. **Salta ricette vuote**: se una ricetta non ha ingredienti con quantita' > 0, SALTALA.
3. **Salta righe non ingredienti**: "totale", "somma", "note", "procedimento", header ripetuti nella tabella.
4. **Listino prezzi**: se trovi un foglio prezzi separato, estrai in "ingredienti_costi" con chiavi lowercase e struttura { "burro": { "costoKg": 8.5, "costoG": 0.0085 } }. Se il costo e' formattato "8.24 €" o "1.66 €" estrai solo il numero.
5. **Ambiguita'**: se una ricetta ha layout confuso o solo qty=0, SALTALA piuttosto che indovinare.
6. **Nomi**: usa singolare lowercase italiano ("tuorlo" non "tuorli"; "cioccolato fondente" non "Cioccolato Nedo Fondente").
7. **Colonne ripetute**: se vedi lo stesso header ("quantitativo materia prima per gusto", "Prodotto", ecc.) ripetuto a meta' foglio, e' un separatore visivo: le ricette continuano nella seconda meta' con le stesse regole. Elabora TUTTE le colonne di ricette, non solo le prime.

Restituisci ESCLUSIVAMENTE JSON valido nel formato:
{
  "ricette": [
    {"nome": "NOCCIOLA", "ingredienti": [{"nome":"pasta nocciola","qty1stampo":250},{"nome":"base bianca","qty1stampo":1000}]},
    ...
  ],
  "ingredienti_costi": {
    "burro": {"costoKg": 8.5, "costoG": 0.0085},
    "zucchero": {"costoKg": 1.66, "costoG": 0.00166}
  }
}

Nessun testo prima o dopo il JSON.`

// Estrae il contenuto dell'Excel come testo CSV multi-sheet.
async function excelToText(file) {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const chunks = []
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    // sheet_to_csv e' compatto e mantiene la struttura tabulare, meglio di JSON
    // per il context window (meno token per riga).
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
    if (csv.trim()) chunks.push(`=== SHEET: ${sheetName} ===\n${csv}`)
  }
  return chunks.join('\n\n')
}

// Normalizza il JSON di Claude al formato interno Foodos (stesso shape del
// parser rigido).
function normalizeAiOutput(json) {
  const ricette = {}
  for (const r of (json?.ricette || [])) {
    const nome = String(r?.nome || '').trim().toUpperCase()
    if (!nome) continue
    const ingredienti = (r.ingredienti || [])
      .map(i => ({
        nome: String(i?.nome || '').trim().toLowerCase(),
        qty1stampo: Number(i?.qty1stampo) || Number(i?.grammi) || Number(i?.qty) || 0,
        costoPerG: Number(i?.costoPerG) || 0,
        costo1stampo: 0,
      }))
      .filter(i => i.nome && i.qty1stampo > 0)
    if (ingredienti.length === 0) continue
    const tipoRaw = String(r?.tipo || '').toLowerCase()
    const tipo = ['fetta', 'pezzo', 'semilavorato', 'interno'].includes(tipoRaw) ? tipoRaw : 'fetta'
    ricette[nome] = {
      nome,
      sheetName: 'ai',
      numStampi: 1,
      totImpasto1: 0,
      foodCost1: 0,
      ingredienti,
      note: String(r?.note || ''),
      tipo,
    }
  }

  const ingredienti_costi = {}
  for (const [k, v] of Object.entries(json?.ingredienti_costi || {})) {
    const key = normIng(String(k || ''))
    if (!key) continue
    const costoKg = Number(v?.costoKg) || 0
    const costoG = Number(v?.costoG) || (costoKg > 0 ? parseFloat((costoKg / 1000).toFixed(6)) : 0)
    if (costoKg <= 0 && costoG <= 0) continue
    ingredienti_costi[key] = { costoKg, costoG }
  }

  return { ricette, ingredienti_costi }
}

// Parser AI-only: chiama Claude sempre.
// Se il testo estratto dal file e' vuoto ritorna un ricettario vuoto senza
// consumare quota AI.
export async function parseRicettarioAI(file) {
  const testo = await excelToText(file)
  if (!testo.trim()) return { ricette: {}, ingredienti_costi: {}, source: 'ai-empty' }

  // Guard grezzo sul context: 40k caratteri e' ~10k token, sotto il limite
  // Sonnet 4.6 (200k) ma sopra il costo che vogliamo per una singola chiamata.
  // Se supera, tronchiamo con warning. TODO: chunking per sheet.
  const MAX_CHARS = 60_000
  const truncated = testo.length > MAX_CHARS
  const promptText = truncated ? testo.slice(0, MAX_CHARS) + '\n\n[...file troncato per lunghezza...]' : testo

  const { json, text, raw } = await callAi({
    feature: 'parse-ricettario-ai',
    // Opus 4.7 e' piu' preciso per parsing strutturato di layout complessi
    // (pivot, matrici, righe con header ripetuti). Il costo aggiuntivo vs
    // Sonnet e' accettabile per un flusso raro come l'import ricettario.
    model: 'claude-opus-4-7',
    system: SYSTEM_PROMPT,
    prompt: `Ecco il contenuto del file Excel. Estrai TUTTE le ricette (non solo le prime) e restituisci JSON.\n\n${promptText}`,
    maxTokens: 16_000,
    parseJson: true,
    timeoutMs: 180_000,
  })

  // Debug: logga il conteggio in console cosi' l'utente puo' diagnosticare
  // se qualcosa non torna (es. Claude ha ritornato 2 ricette invece di 40).
  const n = Object.keys(json?.ricette || {}).length || (Array.isArray(json?.ricette) ? json.ricette.length : 0)
  console.log(`[parseRicettarioAI] ricette estratte dall'AI: ${n}`)
  if (n < 3 && text) {
    console.log('[parseRicettarioAI] raw response (troncato a 4k):', String(text).slice(0, 4000))
  }

  const out = normalizeAiOutput(json)
  return { ...out, source: 'ai', truncated }
}

// Parser ibrido: tenta prima il parser rigido (deterministico, gratis).
// Se non trova ricette valide, cade sul parser AI. Se anche l'AI fallisce
// (rete/budget/errore), ritorna il risultato rigido comunque (vuoto).
export async function parseRicettarioSmart(file) {
  let rigido
  try {
    rigido = await parseRicettario(file)
  } catch (e) {
    console.warn('parseRicettario (rigido) failed:', e?.message)
    rigido = { ricette: {}, ingredienti_costi: {} }
  }
  const nRicRigid = Object.keys(rigido?.ricette || {}).length
  if (nRicRigid > 0) {
    return { ...rigido, source: 'rigid' }
  }

  try {
    const ai = await parseRicettarioAI(file)
    // Se anche l'AI non ha trovato nulla, restituiamo il rigido (source='rigid')
    // cosi' il chiamante puo' distinguere fra "AI ha capito ma vuoto" e "nemmeno
    // provato" — utile per diagnostica.
    if (Object.keys(ai?.ricette || {}).length === 0) {
      return { ...rigido, source: 'rigid', aiTried: true }
    }
    return ai
  } catch (e) {
    console.warn('parseRicettarioAI failed:', e?.message)
    return { ...rigido, source: 'rigid', aiError: e?.friendly || e?.message || 'errore AI' }
  }
}
