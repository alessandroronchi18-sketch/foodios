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
// Scelta di prodotto: il TRIAL ha livello Pro (vede le funzioni Pro, ma le
// funzioni Chain sono lucchettate → upsell visibile durante la prova). Per dare
// al trial accesso pieno, basta portare trial a 3 in PLAN_RANK.

export const PLAN_RANK = {
  trial:      2,
  base:       2,
  pro:        2,
  enterprise: 3,
  chain:      3, // alias di sicurezza se in futuro si usasse 'chain' come valore
}

// view-id → piano minimo richiesto per accedervi.
export const VIEW_MIN_PLAN = {
  'confronto-sedi': 'enterprise',
  'trasferimenti':  'enterprise',
  'integrazioni':   'enterprise',
}

// Etichetta leggibile del piano (per i messaggi di upgrade).
export const PLAN_LABEL = {
  trial: 'Prova', base: 'Pro', pro: 'Pro', enterprise: 'Chain', chain: 'Chain',
}

export function planRank(piano) {
  return PLAN_RANK[String(piano || '').toLowerCase().trim()] ?? 2
}

// true se il piano dato può accedere alla view.
export function canAccessView(view, piano) {
  const need = VIEW_MIN_PLAN[view]
  if (!need) return true
  return planRank(piano) >= planRank(need)
}

// Piano (etichetta) richiesto da una view gated, o null se libera.
export function requiredPlanLabel(view) {
  const need = VIEW_MIN_PLAN[view]
  return need ? (PLAN_LABEL[need] || need) : null
}
