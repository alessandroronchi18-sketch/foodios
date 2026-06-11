// Inventario produzione (metodo differenziale per gelaterie/business gusti).
//
// Modello:
//   per ogni (sede, gusto, giorno) il dipendente registra
//     - produzione_g  : quanti grammi di gelato/impasto sono stati prodotti
//     - rimanenza_g   : quanti grammi sono rimasti a fine giornata
//     - scarto_g      : (opzionale) scarto esplicito
//   venduto(N) = riman(N-1) + prod(N) - riman(N) - scarto(N)
//
// La cassa diventa SOLO un check incrociato (kg venduti × €/kg medio dei
// formati = ricavo atteso). Vedi supabase/migrations/20260626_inventario_produzione.sql.

import { supabase } from './supabase'

// Normalizzazione del nome gusto: lo riportiamo SEMPRE in UPPER+trim come in
// stock_prodotti_finiti, cosi indipendente da come l'utente l'ha digitato in
// ricettario. Single source of truth.
export function normGusto(s) {
  return (s || '').toString().toUpperCase().trim()
}

// Estrae l'elenco dei gusti dal ricettario filtrando per flag `is_gusto`. Se
// l'org non ha ancora marcato nessuna ricetta, fallback alla categoria del
// tipo_attivita (gelateria → tutti i gelati; altre categorie → vuoto: serve
// che il titolare marchi esplicitamente).
export function elencoGusti(ricettario, tipoAttivita) {
  const ricette = ricettario?.ricette || {}
  const conFlag = Object.values(ricette).filter(r => r.is_gusto === true)
  if (conFlag.length > 0) {
    return conFlag.map(r => ({ nome: r.nome, ricetta: r }))
  }
  // Fallback per la prima esperienza utente: se nessun gusto e' marcato,
  // mostriamo zero (così l'utente deve passare dal ricettario per marcarli).
  return []
}

// ── CRUD inventario_produzione ────────────────────────────────────────────

export async function caricaSettimana(orgId, sedeId, lunediIso) {
  if (!orgId || !sedeId || !lunediIso) return []
  const da = new Date(lunediIso); da.setHours(0, 0, 0, 0)
  const a = new Date(da); a.setDate(a.getDate() + 7)
  // Includiamo anche il giorno prima del lunedi: serve come "riman(N-1)" per
  // calcolare il venduto del lunedi stesso.
  const inizio = new Date(da); inizio.setDate(inizio.getDate() - 1)
  const inizioIso = inizio.toISOString().slice(0, 10)
  const fineIso = a.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('inventario_produzione')
    .select('id, gusto_nome, data, produzione_g, rimanenza_g, scarto_g, note, updated_at')
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .gte('data', inizioIso)
    .lt('data', fineIso)
    .order('data')
  if (error) { console.error('caricaSettimana:', error); return [] }
  return data || []
}

// Upsert di una singola cella (gusto × giorno). idempotente sulla unique
// (org, sede, gusto, data). Ritorna la riga finale o lancia.
export async function salvaCella(orgId, sedeId, gustoNome, dataIso, patch) {
  const row = {
    organization_id: orgId,
    sede_id: sedeId,
    gusto_nome: normGusto(gustoNome),
    data: dataIso,
    produzione_g: Math.max(0, Math.round(Number(patch.produzione_g) || 0)),
    rimanenza_g: Math.max(0, Math.round(Number(patch.rimanenza_g) || 0)),
    scarto_g: Math.max(0, Math.round(Number(patch.scarto_g) || 0)),
    note: patch.note || null,
  }
  const { data, error } = await supabase
    .from('inventario_produzione')
    .upsert(row, { onConflict: 'organization_id,sede_id,gusto_nome,data' })
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

// Cancella una cella (utile per "ho sbagliato giorno"). Soft? No: cancella
// fisica, e l'audit_log + updated_by tracciano l'azione.
export async function rimuoviCella(orgId, sedeId, gustoNome, dataIso) {
  const { error } = await supabase
    .from('inventario_produzione')
    .delete()
    .eq('organization_id', orgId)
    .eq('sede_id', sedeId)
    .eq('gusto_nome', normGusto(gustoNome))
    .eq('data', dataIso)
  if (error) throw error
}

// ── Calcolo venduto per ogni (gusto × giorno) di una settimana ────────────
// Lavora interamente in-memory dai dati gia caricati: niente round-trip extra.
//
// righe = output di caricaSettimana(...), che include il giorno PRIMA del
// lunedi target.
//
// Ritorna { [gusto_nome]: { [dataIso]: { prod, riman, scarto, venduto } } }.
export function calcolaVendutoSettimana(righe, lunediIso) {
  if (!Array.isArray(righe)) return {}
  // Indicizziamo per gusto+data per O(1) lookup del giorno precedente.
  const byKey = {}
  for (const r of righe) {
    const k = `${r.gusto_nome}|${r.data}`
    byKey[k] = r
  }
  const gusti = [...new Set(righe.map(r => r.gusto_nome))]
  const out = {}
  for (const g of gusti) {
    out[g] = {}
    // I 7 giorni della settimana target (lunedi inclus, domenica inclus).
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunediIso)
      d.setDate(d.getDate() + i)
      const dIso = d.toISOString().slice(0, 10)
      const corrente = byKey[`${g}|${dIso}`]
      if (!corrente) {
        out[g][dIso] = { prod: 0, riman: 0, scarto: 0, venduto: null }
        continue
      }
      const dPrev = new Date(d); dPrev.setDate(dPrev.getDate() - 1)
      const prev = byKey[`${g}|${dPrev.toISOString().slice(0, 10)}`]
      const rimanPrev = prev ? (prev.rimanenza_g || 0) : 0
      const prod = corrente.produzione_g || 0
      const riman = corrente.rimanenza_g || 0
      const scarto = corrente.scarto_g || 0
      // Il venduto puo' essere "null" il primo giorno in cui c'e' produzione
      // ma manca la rimanenza precedente (caso bootstrap): mostriamo "—" lato UI.
      out[g][dIso] = {
        prod, riman, scarto,
        venduto: Math.max(0, rimanPrev + prod - riman - scarto),
      }
    }
  }
  return out
}

// Totali settimana per gusto: somma del venduto sui 7 giorni.
export function totaliVenduti(matrice) {
  const out = {}
  for (const [gusto, byData] of Object.entries(matrice || {})) {
    let tot = 0
    for (const cell of Object.values(byData)) {
      tot += Number(cell.venduto || 0)
    }
    out[gusto] = tot
  }
  return out
}

// ── Integrazione magazzino MP ─────────────────────────────────────────────
// Quando un dipendente registra "PROD = X grammi" per un gusto, scaliamo dal
// magazzino la quota proporzionale di ingredienti. Il fattore di scalo e':
//   fattore = delta_g / peso_impasto_per_stampo
// dove peso_impasto_per_stampo = sum(ingredienti.qty1stampo) della ricetta
// del gusto. delta puo' essere negativo (correzione al ribasso): in quel
// caso il magazzino sale (l'utente sta dicendo "ho usato meno di quanto
// avevo scritto").
//
// La funzione e' PURA: prende il magazzino in input e ritorna il magazzino
// nuovo. Il caller decide se ssave-arlo. Niente side-effect qui.
//
// Ritorna { nuovoMagazzino, ingredientiScalati: [{nome, deltaG}] } per UI.
import { normIng } from './foodcost'

export function scaloMagazzinoPerGusto(magazzino, ricetta, deltaProdG) {
  if (!ricetta || !Number.isFinite(deltaProdG) || deltaProdG === 0) {
    return { nuovoMagazzino: magazzino, ingredientiScalati: [] }
  }
  const ingredienti = ricetta.ingredienti || []
  const pesoImpasto = ingredienti.reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
  if (pesoImpasto <= 0) {
    return { nuovoMagazzino: magazzino, ingredientiScalati: [] }
  }
  const fattore = deltaProdG / pesoImpasto
  const nm = { ...(magazzino || {}) }
  const log = []
  for (const ing of ingredienti) {
    const qty = Number(ing.qty1stampo) || 0
    if (qty <= 0 || !ing.nome) continue
    const deltaIng = qty * fattore
    const k = normIng(ing.nome)
    const corrente = nm[k] || { nome: ing.nome.trim(), giacenza_g: 0, soglia_g: 0, ultimoRifornimento: null }
    nm[k] = {
      ...corrente,
      // Sottraiamo deltaIng: se PROD aumenta, fattore>0 -> giacenza scende.
      // Se PROD scende (correzione), fattore<0 -> giacenza risale.
      giacenza_g: Math.max(0, Math.round((corrente.giacenza_g || 0) - deltaIng)),
    }
    log.push({ nome: ing.nome, deltaG: Math.round(deltaIng) })
  }
  return { nuovoMagazzino: nm, ingredientiScalati: log }
}

// Trova la ricetta corrispondente a un gusto (per nome normalizzato).
export function ricettaDelGusto(ricettario, gustoNomeUpper) {
  if (!ricettario?.ricette) return null
  const target = normGusto(gustoNomeUpper)
  // Match esatto su chiave UPPER prima, poi su .nome (per compat legacy).
  return ricettario.ricette[target]
    || Object.values(ricettario.ricette).find(r => normGusto(r.nome) === target)
    || null
}

// ── Helper date: lunedi della settimana che contiene `dateIso` ────────────
export function lunediDellaSettimana(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date()
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=dom, 1=lun, ... 6=sab. Vogliamo arretrare al lunedi.
  const dow = d.getDay()
  const arretra = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - arretra)
  return d.toISOString().slice(0, 10)
}
