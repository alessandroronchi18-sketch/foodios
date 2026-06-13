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

export const PLAN_RANK = {
  trial:      1,  // trial = Base (14gg per Base, prima era 2 = Pro)
  base:       1,
  pro:        2,
  enterprise: 3,
  chain:      3,  // alias
}

// view-id → piano minimo richiesto per accedervi.
// Tier mapping (post implementazione 23 AI features, 2026-06-12):
//  - Pro+ minimo: forecast, menu-engineering, cashflow, reformulation,
//    competitor-pricing, ordini-ai, recensioni  (per ora 'pro' rank == 'trial'
//    rank, quindi tutti li vedono in prova; quando alziamo trial→1 i Base
//    li vedranno gated)
//  - Chain (enterprise) only: ai-brain, whatsapp, ricette-ai, marketplace,
//    documentary, confronto-sedi, trasferimenti, integrazioni
export const VIEW_MIN_PLAN = {
  // Pro+ tier
  'forecast':           'pro',
  'menu-engineering':   'pro',
  'cashflow':           'pro',
  'reformulation':      'pro',
  'competitor-pricing': 'pro',
  'ordini-ai':          'pro',
  // Chain (enterprise) tier
  'confronto-sedi': 'enterprise',
  'trasferimenti':  'enterprise',
  'integrazioni':   'enterprise',
  'ai-brain':       'enterprise',
  'whatsapp':       'enterprise',
  'ricette-ai':     'enterprise',
  'marketplace':    'enterprise',
  'documentary':    'enterprise',
}

// Etichetta leggibile del piano (per i messaggi di upgrade).
export const PLAN_LABEL = {
  trial: 'Prova', base: 'Pro', pro: 'Pro', enterprise: 'Chain', chain: 'Chain',
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
export function requiredPlanLabel(view) {
  const need = VIEW_MIN_PLAN[view]
  return need ? (PLAN_LABEL[need] || need) : null
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
