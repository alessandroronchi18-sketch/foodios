// Costi aziendali extra-food (P&L).
//
// Persistenza: tabella public.costi_aziendali (vedi migration 20260628).
// Modello:
//   - Ogni voce ha categoria + nome + importo + periodicita' (mensile,
//     annuale, una_tantum) + sede_id opzionale (NULL = applicato a tutta org)
//
// Per il P&L mensile normalizziamo:
//   - mensile   -> importo direttamente
//   - annuale   -> importo / 12
//   - una_tantum -> importo / 12 (spalmato su 12 mesi dall'inserimento)
//
// Le categorie standard sono suggerite ma l'utente puo' aggiungerne.

import { supabase } from './supabase'

export const CATEGORIE_DEFAULT = [
  { id: 'consumabili',   label: 'Consumabili vendita',   esempi: 'fazzoletti, coppette, palette, sacchetti, tovaglioli' },
  { id: 'manutenzione',  label: 'Manutenzione',          esempi: 'vetrina, condizionatori, banco frigo, impianti' },
  { id: 'ammortamenti',  label: 'Ammortamenti',          esempi: 'impianti, arredi, attrezzature acquistate' },
  { id: 'utenze',        label: 'Utenze',                esempi: 'energia, gas, acqua, internet, telefono' },
  { id: 'affitti',       label: 'Affitti',               esempi: 'locale, parcheggio, magazzino' },
  { id: 'assicurazioni', label: 'Assicurazioni',         esempi: 'RC, infortuni, alimenti, furto' },
  { id: 'servizi',       label: 'Servizi professionali', esempi: 'commercialista, consulente, software, audit' },
  { id: 'marketing',     label: 'Marketing',             esempi: 'social, ads, materiale stampa, eventi' },
  { id: 'altro',         label: 'Altro',                 esempi: '' },
]

export const PERIODICITA = [
  { id: 'mensile',     label: 'Mensile' },
  { id: 'annuale',     label: 'Annuale (diviso per 12)' },
  { id: 'una_tantum',  label: 'Una tantum (spalmato 12 mesi)' },
]

// Carica tutte le voci attive dell'organization (con filtro sede opzionale).
export async function caricaCostiAziendali(orgId, sedeId = null) {
  if (!orgId) return []
  let q = supabase.from('costi_aziendali')
    .select('*')
    .eq('organization_id', orgId)
    .eq('attivo', true)
    .order('categoria').order('voce')
  if (sedeId) {
    // Voci specifiche di sede + voci globali (sede_id null).
    q = q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
  }
  const { data, error } = await q
  if (error) { console.error('caricaCostiAziendali:', error); return [] }
  return data || []
}

// Crea o aggiorna una voce.
export async function salvaVoceCosto(voce) {
  if (voce.id) {
    const { data, error } = await supabase
      .from('costi_aziendali')
      .update({
        categoria: voce.categoria, voce: voce.voce,
        importo: Number(voce.importo) || 0,
        periodicita: voce.periodicita, note: voce.note,
        data_inizio: voce.data_inizio || null,
        sede_id: voce.sede_id || null,
        attivo: voce.attivo !== false,
        // updated_at gestito dall'app (no trigger DB per evitare problemi
        // col dollar-quote nell'editor SQL Supabase)
        updated_at: new Date().toISOString(),
      })
      .eq('id', voce.id)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('costi_aziendali')
    .insert({
      organization_id: voce.organization_id,
      sede_id: voce.sede_id || null,
      categoria: voce.categoria,
      voce: voce.voce,
      importo: Number(voce.importo) || 0,
      periodicita: voce.periodicita || 'mensile',
      note: voce.note,
      data_inizio: voce.data_inizio || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Elimina logicamente (attivo=false) o fisicamente.
export async function eliminaVoceCosto(id, soft = true) {
  if (soft) {
    const { error } = await supabase
      .from('costi_aziendali')
      .update({ attivo: false })
      .eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('costi_aziendali').delete().eq('id', id)
    if (error) throw error
  }
}

// Normalizza l'importo della voce in valore MENSILE.
export function importoMensile(voce) {
  const v = Number(voce?.importo) || 0
  switch (voce?.periodicita) {
    case 'annuale': return v / 12
    case 'una_tantum': return v / 12
    case 'mensile':
    default: return v
  }
}

// Totale costi aziendali mensili (somma tutte le voci attive).
export function totaleMensile(voci) {
  if (!Array.isArray(voci)) return 0
  return voci.reduce((s, v) => s + importoMensile(v), 0)
}

// Raggruppa per categoria, ognuna col proprio totale mensile.
export function aggregaPerCategoria(voci) {
  const map = {}
  for (const v of (voci || [])) {
    const cat = v.categoria || 'altro'
    if (!map[cat]) map[cat] = { categoria: cat, totaleMensile: 0, voci: [] }
    map[cat].totaleMensile += importoMensile(v)
    map[cat].voci.push(v)
  }
  return Object.values(map).sort((a, b) => b.totaleMensile - a.totaleMensile)
}
