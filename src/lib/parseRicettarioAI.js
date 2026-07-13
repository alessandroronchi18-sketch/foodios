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

Ricevi il contenuto grezzo di un foglio Excel come testo CSV (multi-sheet, separati da "=== SHEET: nome ==="). Il tuo compito e' identificare TUTTE le ricette elencate e restituire un JSON strutturato.

Ogni ricetta deve avere:
- nome: string (obbligatorio, in MAIUSCOLO)
- ingredienti: array di { nome: string (lowercase), qty1stampo: number in GRAMMI, costoPerG?: number in EUR/grammo }
- note?: string
- tipo?: 'fetta' | 'pezzo' | 'semilavorato'  (default 'fetta')

Regole:
1. Se le quantita' sono in kg/l/ml/cucchiai, convertile SEMPRE in grammi (1 kg = 1000 g, 1 ml acqua/latte/panna = 1 g, 1 ml olio = 0.92 g, 1 cucchiaio = 15 g).
2. Se vedi righe come "totale", "note", "procedimento" saltale (non sono ingredienti).
3. Se il foglio ha una tabella prezzi ingredienti separata (nome + €/kg), estraila in "ingredienti_costi" con chiavi lowercase (es. "burro": { "costoKg": 8.5, "costoG": 0.0085 }).
4. Se non capisci una ricetta ambigua, SALTALA piuttosto che indovinare.
5. Nomi ingredienti: usa singolare, lowercase, nome comune italiano ("tuorlo" non "tuorli" non "Tuorlo d'uovo").
6. Ignora righe vuote, header di sheet, colonne extra non riconosciute.

Restituisci ESCLUSIVAMENTE JSON valido nel formato:
{
  "ricette": [
    {"nome": "TORTA AL CIOCCOLATO", "ingredienti": [{"nome":"burro","qty1stampo":200},{"nome":"zucchero","qty1stampo":180}], "note":"cottura 180°C per 40 min"},
    ...
  ],
  "ingredienti_costi": {
    "burro": {"costoKg": 8.5, "costoG": 0.0085},
    ...
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

  const { json } = await callAi({
    feature: 'parse-ricettario-ai',
    model: 'claude-sonnet-4-6',
    system: SYSTEM_PROMPT,
    prompt: `Ecco il contenuto del file Excel. Estrai tutte le ricette e restituisci JSON.\n\n${promptText}`,
    maxTokens: 8000,
    parseJson: true,
    timeoutMs: 90_000,
  })

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
