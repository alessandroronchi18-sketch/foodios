// Gating pagine/feature in base al piano di abbonamento.
//
// ───────────────────────────────────────────────────────────────────────────
// COME MODIFICARLO (unico punto da toccare):
//   • Per rendere una pagina "Chain-only": aggiungi la sua view-id a
//     VIEW_MIN_PLAN con valore 'enterprise'.
//   • Per cambiare il livello di un piano: edita PLAN_RANK.
//   • Le view NON elencate in VIEW_MIN_PLAN sono accessibili a tutti i piani.
// ───────────────────────────────────────────────────────────────────────────
//
// Naming: il piano marketing "Chain" corrisponde internamente a 'enterprise'
// (vincolo DB: piano ∈ trial|base|pro|enterprise).
//
// Scelta prodotto 2026-06-13:
//  - Base/trial = livello 1: vedi solo le funzioni core (no Pro+, no Chain).
//    Le altre appaiono col badge ⬩ e cliccandole esce il modal upgrade.
//  - Pro        = livello 2: tutte le Pro accessibili, le Chain lucchettate.
//  - Chain (enterprise) = livello 3: tutto disponibile, NIENTE badge.

// Audit 2026-06-21: rinominato marketing in Bottega/Maestro/Insegna. La colonna
// DB "piano" mantiene CHECK in ('trial','base','pro','enterprise') — il rename
// e` solo a livello UI/label per non rompere historical data.
//
// Trial e` livello Maestro (rank 2): il cliente assaggia tutto il valore AI
// nei 30gg, poi sceglie Bottega/Maestro/Insegna in base alle sue dimensioni.
export const PLAN_RANK = {
  trial:      2,  // Maestro durante prova
  base:       1,  // Bottega
  pro:        2,  // Maestro
  enterprise: 3,  // Insegna
  chain:      3,  // alias storico
}

// view-id → piano minimo richiesto per accedervi.
// Audit 2026-06-21 — riorganizzato in 3 tier (Bottega/Maestro/Insegna):
//  - Bottega (base): ricettario, food cost, magazzino, scadenzario, chiusure,
//    sprechi, P&L base, export PDF, OCR fatture con quota, AI Assistant base.
//    Niente forecast/menu eng/AI evoluta/multi-sede.
//  - Maestro (pro): le 23 feature AI evolute. Multi-sede 2, multi-utente 3.
//  - Insegna (enterprise): integrazioni real-time casse, multi-sede unlimited,
//    WhatsApp Bot, Marketplace, white-label, API.
export const VIEW_MIN_PLAN = {
  // Maestro tier (AI evoluta)
  'forecast':           'pro',
  'menu-engineering':   'pro',
  'cashflow':           'pro',
  'reformulation':      'pro',
  'competitor-pricing': 'pro',
  'ordini-ai':          'pro',
  'ai-brain':           'pro',
  'ricette-ai':         'pro',
  'recensioni':         'pro',
  // Insegna (enterprise) tier — multi-sede + integrazioni real-time + brand
  'confronto-sedi': 'enterprise',
  'trasferimenti':  'enterprise',
  'integrazioni':   'enterprise',
  'whatsapp':       'enterprise',
  'marketplace':    'enterprise',
  'documentary':    'enterprise',
}

// Etichetta leggibile del piano (per i messaggi di upgrade).
// Audit 2026-06-21: rinominati a Bottega/Maestro/Insegna.
// Audit 2026-06-24: questi sono SOLO FALLBACK. La sorgente di verità è
// `plan_pricing.nome_display` modificabile dall'admin. Per leggere il nome
// dinamico usa `getPlanLabel(plan)` da `./usePlanPricing.js` (sync, cache)
// oppure `usePlanPricing().nome.{base,pro,chain}` (hook React).
export const PLAN_LABEL = {
  trial:      'Prova',
  base:       'Bottega',
  pro:        'Maestro',
  enterprise: 'Insegna',
  chain:      'Insegna',  // alias storico
}

// Prezzo €/mese per piano (sorgente di verita` per la UI).
export const PLAN_PRICE_EUR = {
  trial:      0,
  base:       69,
  pro:        149,
  enterprise: 399,
  chain:      399,
}

// Caps per piano (audit 2026-06-21): n_sedi, n_utenti, ai_foto_mese.
export const PLAN_LIMITS = {
  trial:      { sedi: 2,        utenti: 3,        ai_foto_mese: 100 },
  base:       { sedi: 1,        utenti: 1,        ai_foto_mese: 20 },
  pro:        { sedi: 2,        utenti: 3,        ai_foto_mese: 100 },
  enterprise: { sedi: Infinity, utenti: Infinity, ai_foto_mese: 500 },
  chain:      { sedi: Infinity, utenti: Infinity, ai_foto_mese: 500 },
}

export function planRank(piano) {
  return PLAN_RANK[String(piano || '').toLowerCase().trim()] ?? 2
}

// Email che bypassano i gate di piano (demo / showcase / partner).
// Le aggiungiamo qui invece che spargere check ovunque.
const EMAIL_BYPASS = new Set([
  'demo@maradeiboschi.com',
])

export function isPlanBypassEmail(email) {
  if (!email) return false
  return EMAIL_BYPASS.has(String(email).toLowerCase().trim())
}

// Piano "effettivo" per l'utente. Email bypass → mostra Chain (massimo livello).
// Usato per il DISPLAY del piano nel topbar/upgrade gate.
export function effectivePlan(piano, email) {
  if (isPlanBypassEmail(email)) return 'enterprise'
  return piano || 'trial'
}

// true se il piano dato può accedere alla view.
// `userEmail` opzionale: alcune email (demo) bypassano il gate.
export function canAccessView(view, piano, userEmail) {
  if (isPlanBypassEmail(userEmail)) return true
  const need = VIEW_MIN_PLAN[view]
  if (!need) return true
  return planRank(piano) >= planRank(need)
}

// Piano (etichetta) richiesto da una view gated, o null se libera.
// Audit 2026-06-24: usa il nome dinamico via cache singleton se disponibile,
// altrimenti fallback statico (es. prima del primo fetch /api/pricing).
// La cache si popola al primo render della LandingPage / AbbonamentoPanel.
export function requiredPlanLabel(view) {
  const need = VIEW_MIN_PLAN[view]
  if (!need) return null
  // Leggi dal singleton globale window.__foodos_plan_cache (popolato da
  // usePlanPricing al primo fetch). Evita import cycle.
  try {
    const cache = (typeof window !== 'undefined') ? window.__foodos_plan_cache : null
    if (cache) {
      const key = need === 'enterprise' ? 'chain' : need
      if (cache[key]?.nome_display) return cache[key].nome_display
    }
  } catch {}
  return PLAN_LABEL[need] || need
}

// Label leggibile della view per i prompt di upgrade. Solo le view-id
// utilizzate effettivamente in NAV; fallback al view-id grezzo.
const VIEW_DISPLAY_LABELS = {
  'confronto-sedi':     'Confronto sedi',
  'trasferimenti':      'Trasferimenti tra sedi',
  'integrazioni':       'Integrazioni',
  'ai-brain':           'FoodOS Brain (chat AI)',
  'whatsapp':           'WhatsApp Bot',
  'ricette-ai':         'Inventa ricetta AI',
  'marketplace':        'Marketplace fornitori',
  'documentary':        'Documentary AI',
  'forecast':           'Forecast AI 7 giorni',
  'menu-engineering':   'Menu engineering',
  'cashflow':           'Cashflow predittivo',
  'reformulation':      'Ottimizza ricetta AI',
  'competitor-pricing': 'Pricing vs competitor',
  'ordini-ai':          'Ordini AI fornitori',
}
export function viewDisplayLabel(view) {
  return VIEW_DISPLAY_LABELS[view] || view
}
