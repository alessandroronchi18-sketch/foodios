// L'estensione `.js` è obbligatoria: questo file lo importa anche
// `api/stripe-checkout.js`, che gira su Node, dove un percorso senza
// estensione non si risolve. Vite lo accetta in entrambi i modi.
import { costruisciMenu, nomeCompletoVista } from './menuFoodos.js'
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
// DB "piano" mantiene CHECK in ('trial','base','pro','enterprise') - il rename
// e` solo a livello UI/label per non rompere historical data.
//
// Trial e` livello Maestro (rank 2): il cliente assaggia tutto il valore AI
// nei 30gg, poi sceglie Bottega/Maestro/Insegna in base alle sue dimensioni.
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  SBLOCCO TEMPORANEO — TUTTE LE PAGINE VISIBILI A QUALSIASI PIANO      ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// Acceso l'11/09/2026 su richiesta del titolare, per vedere tutte le pagine
// mentre si lavora alla ripulitura, senza dover cambiare piano.
//
// Cosa fa, esattamente: `canAccessView` risponde sempre sì. Quindi
//   - nessuna pagina è lucchettata nel menù (spariscono anche i badge ⬩);
//   - cliccando una pagina non esce più il modal "passa a Maestro/Insegna";
//   - le pagine gated si aprono davvero, non mostrano il muro dell'upgrade.
//
// Cosa NON fa: la tabella VIEW_MIN_PLAN resta intatta, quindi PER TORNARE
// COME PRIMA basta rimettere `false` qui sotto. Nient'altro da toccare.
//
// 15/09/2026: resta true per scelta. Si vende un piano solo, il Plus, e chi lo
// prende ha tutto. Il giorno che si riaprono Standard e Ultra questa riga
// torna a false e `VIEW_MIN_PLAN` qui sotto riprende a decidere chi vede cosa:
// la divisione delle funzioni fra i tre livelli è già scritta, e va solo
// rivista.
export const SBLOCCO_TUTTE_LE_PAGINE = true

export const PLAN_RANK = {
  trial:      2,  // Maestro durante prova
  base:       1,  // Bottega
  pro:        2,  // Maestro
  enterprise: 3,  // Insegna
  chain:      3,  // alias storico
}

// view-id → piano minimo richiesto per accedervi.
// Audit 2026-06-21 - riorganizzato in 3 tier (Bottega/Maestro/Insegna):
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
  // Ordinare e' un gesto quotidiano: sta con il riordino che ha assorbito.
  ordini:               'pro',
  'ai-brain':           'pro',
  'ricette-ai':         'pro',
  'recensioni':         'pro',
  // Insegna (enterprise) tier - multi-sede + integrazioni real-time + brand
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
// 15/09/2026, decisione del titolare: i piani si chiamano Standard, Plus e
// Ultra, e per ora se ne offre **uno solo**, il Plus, con tutto sbloccato.
// Gli altri due restano definiti qui perché il giorno che si riaprono non si
// riparte da zero — e perché un'organizzazione che avesse già `base` o
// `enterprise` sul database deve comunque leggere un nome sensato.
//
// La gerarchia non cambia: Standard < Plus < Ultra, come prima
// Bottega < Maestro < Insegna. Cambiano le parole, non i livelli.
export const PLAN_LABEL = {
  trial:      'Prova',
  base:       'Standard',
  pro:        'Plus',
  enterprise: 'Ultra',
  chain:      'Ultra',  // alias storico della chiave
}

// Quali piani si possono comprare quando il database non risponde.
//
// A decidere è il titolare, dal pannello admin: la colonna `attivo` sulla
// riga di `plan_pricing`. Questo elenco è la scorta, per il caso in cui la
// riga non ci sia o la lettura fallisca — non la regola. Prima era il
// contrario, e l'interruttore sul database non serviva a niente: per aprire
// un piano bisognava mettere le mani nel codice e rifare un rilascio.
export const PIANI_IN_VENDITA = ['pro']

export function pianoInVendita(plan) {
  const k = String(plan || '').toLowerCase().trim()
  return PIANI_IN_VENDITA.includes(k === 'chain' ? 'enterprise' : k)
}

/**
 * Se un piano è acquistabile. **Comanda il database**; l'elenco qui sopra
 * interviene solo se la riga manca o non dice niente.
 *
 * @param {string} plan          'base' | 'pro' | 'chain' (o 'enterprise')
 * @param {{attivo?: boolean}} [riga]  la riga di plan_pricing, se disponibile
 */
export function inVendita(plan, riga) {
  if (riga && typeof riga.attivo === 'boolean') return riga.attivo
  return pianoInVendita(plan)
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
// La REGOLA dei piani, senza sconti: serve a sapere cosa sarebbe incluso in un
// piano, indipendentemente dallo sblocco temporaneo qui sopra. La usano i test
// (che devono continuare a proteggere i tier anche mentre lo sblocco è acceso)
// e chiunque debba mostrare "questa funzione è del piano X".
export function vistaInclusaNelPiano(view, piano) {
  const need = VIEW_MIN_PLAN[view]
  if (!need) return true
  return planRank(piano) >= planRank(need)
}

// true se l'utente può APRIRE la view adesso.
export function canAccessView(view, piano, userEmail) {
  // Sblocco temporaneo: vedi il blocco in testa al file.
  if (SBLOCCO_TUTTE_LE_PAGINE) return true
  if (isPlanBypassEmail(userEmail)) return true
  return vistaInclusaNelPiano(view, piano)
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

// Come si chiama una pagina nei messaggi «questa funzione è nel piano
// superiore».
//
// Qui c'era una copia a mano dei nomi — la **nona** dello stesso elenco in
// questo progetto — e dopo la riorganizzazione del 15/09/2026 era rimasta
// indietro: un cliente che toccava una funzione bloccata leggeva «Foodos
// Brain (chat AI)», «Cashflow predittivo», «Pricing vs competitor», nomi che
// nel prodotto non esistono più. Adesso viene dal menu, come tutto il resto.
export function viewDisplayLabel(view) {
  const sezioni = costruisciMenu({ metodoInventario: true, sedeDiProduzione: true, piuSedi: true })
  // Il nome intero, non quello della scheda: in un messaggio di sblocco
  // «Conto del mese» si capisce, «Il conto» no.
  return nomeCompletoVista(view, sezioni) || view
}
