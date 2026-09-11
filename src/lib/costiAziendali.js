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
        data_fine: voce.data_fine || null,
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
      data_fine: voce.data_fine || null,
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
// una_tantum: spalmato sui 12 mesi DALLA data_inizio (audit 2026-06-17 MEDIUM:
// prima la quota continuava a contribuire al P&L all'infinito anche per costi
// del 2024 valutati nel 2030). Se data_inizio mancante, cap conservativo 12
// mesi dalla creazione voce; se nessun riferimento, comportamento legacy v/12.
export function importoMensile(voce, asOfDate) {
  const v = Number(voce?.importo) || 0
  // Una voce non pesa sui mesi PRIMA della sua data di inizio.
  //
  // Prima valeva solo per le una_tantum: un affitto inserito a settembre
  // 2026, con data di inizio settembre 2026, entrava anche nel conto
  // economico di gennaio 2026 come se il locale lo avessimo sempre avuto.
  // Guardando indietro i mesi passati risultavano più costosi del vero, e i
  // margini più bassi.
  const mese = (d) => String(d).slice(0, 7)
  const inizio = voce?.data_inizio
  if (inizio && asOfDate) {
    // Confronto per mese: una voce che parte il 20 del mese vale per quel
    // mese intero (il conto economico e' mensile, non giornaliero).
    if (mese(inizio) > mese(asOfDate)) return 0
  }
  // E una voce FINITA non pesa sui mesi successivi.
  //
  // Prima l'unico modo di togliere un costo era metterlo non attivo, che però
  // lo fa sparire anche dai mesi passati — quando c'era davvero. Così lo
  // storico si falsava nella direzione opposta: un affitto disdetto a giugno
  // spariva anche da gennaio, e i mesi vecchi sembravano più redditizi.
  const fine = voce?.data_fine
  if (fine && asOfDate) {
    if (mese(fine) < mese(asOfDate)) return 0
  }
  switch (voce?.periodicita) {
    case 'annuale': return v / 12
    case 'una_tantum': {
      const start = voce?.data_inizio || voce?.created_at || voce?.data
      if (!start) return v / 12
      const startD = new Date(start)
      if (!Number.isFinite(startD.getTime())) return v / 12
      // Audit 2026-07-01 LOW: prima usavamo 30.44 (giorni medi astronomici).
      // Mesi calendariali sono più onesti per "spalmato 12 mesi".
      const refD = asOfDate ? new Date(asOfDate) : new Date()
      const monthsElapsed =
        (refD.getFullYear() - startD.getFullYear()) * 12 +
        (refD.getMonth() - startD.getMonth())
      return monthsElapsed >= 0 && monthsElapsed < 12 ? v / 12 : 0
    }
    case 'mensile':
    default: return v
  }
}

// Stato di una voce in un dato mese, per poterlo SCRIVERE invece di mostrare
// uno zero muto.
//
// Serve perché una spesa una tantum, passati i 12 mesi di spalmatura, valeva
// "0,00 €/mese" in elenco senza una riga di spiegazione: accanto all'importo
// pieno (es. 3.000,00 €) sembrava un errore del programma, e il totale in alto
// non tornava con la somma di quello che si vedeva.
//
// Ritorna { mensile, stato, mesiRimasti } con stato:
//   'attiva'       → pesa sul mese chiesto
//   'non_iniziata' → inizia dopo quel mese
//   'esaurita'     → una tantum già spalmata per intero
export function statoVoce(voce, asOfDate) {
  const mensile = importoMensile(voce, asOfDate)
  const mese = (d) => String(d).slice(0, 7)
  const rif = asOfDate ? mese(asOfDate) : mese(new Date().toISOString())
  const inizio = voce?.data_inizio
  if (inizio && mese(inizio) > rif) {
    return { mensile: 0, stato: 'non_iniziata', mesiRimasti: null }
  }
  const fine = voce?.data_fine
  if (fine && mese(fine) < rif) {
    return { mensile: 0, stato: 'finita', mesiRimasti: 0 }
  }
  if (voce?.periodicita === 'una_tantum' && mensile === 0) {
    return { mensile: 0, stato: 'esaurita', mesiRimasti: 0 }
  }
  if (voce?.periodicita === 'una_tantum') {
    const start = voce?.data_inizio || voce?.created_at || voce?.data
    let mesiRimasti = null
    if (start) {
      const s = new Date(start)
      const r = asOfDate ? new Date(asOfDate) : new Date()
      if (Number.isFinite(s.getTime())) {
        const passati = (r.getFullYear() - s.getFullYear()) * 12 + (r.getMonth() - s.getMonth())
        mesiRimasti = Math.max(0, 12 - passati - 1)
      }
    }
    return { mensile, stato: 'attiva', mesiRimasti }
  }
  return { mensile, stato: 'attiva', mesiRimasti: null }
}

// Totale costi aziendali mensili (somma tutte le voci attive).
// `asOfDate` = mese di riferimento: serve al conto economico di un periodo
// passato, per non caricargli sopra voci nate dopo.
export function totaleMensile(voci, asOfDate) {
  if (!Array.isArray(voci)) return 0
  return voci.reduce((s, v) => s + importoMensile(v, asOfDate), 0)
}

// Raggruppa per categoria, ognuna col proprio totale mensile.
export function aggregaPerCategoria(voci, asOfDate) {
  const map = {}
  for (const v of (voci || [])) {
    const cat = v.categoria || 'altro'
    if (!map[cat]) map[cat] = { categoria: cat, totaleMensile: 0, voci: [] }
    map[cat].totaleMensile += importoMensile(v, asOfDate)
    map[cat].voci.push(v)
  }
  return Object.values(map).sort((a, b) => b.totaleMensile - a.totaleMensile)
}
