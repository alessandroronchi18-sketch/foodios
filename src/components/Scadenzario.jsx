import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { parseFatturaXML, parseFatturaSMART } from '../lib/parseFatturaXML'
import { loadXLSX } from '../lib/xlsx'
import { exportScadenzario } from '../lib/exportPDF'
import { getExportCtx, gateExport } from '../lib/exportGuard'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload, ssave } from '../lib/storage'
import { generateSepaXml, ibanIsValid, normalizeIban, causaleFattura, bonificoText } from '../lib/sepa'
import Icon from './Icon'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

// Chiave storage per i dati di pagamento dell'azienda (intestatario + IBAN da
// cui partono i bonifici). Shared a livello org (sede null).
const SK_AZIENDA_PAG = 'azienda-pagamenti-v1'

// Normalizza il nome fornitore per il match con l'anagrafica.
const normNome = s => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Colonne sicure della tabella `fatture` (quelle effettivamente lette/usate dal
// componente → esistono di certo nel DB). I parser possono produrre campi extra
// (piva, cf, note) che, se la tabella non li ha, fanno fallire l'INSERT con un
// errore PostgREST. Inseriamo SOLO le colonne sicure per non rompere l'import.
const FATTURA_COLS_SICURE = ['numero_rif', 'data_fattura', 'data_scadenza', 'tipo', 'fornitore', 'piva', 'cf', 'iban', 'imponibile', 'imposta', 'totale', 'stato', 'importo_pagato', 'note']
function pickFattura(r, orgId, sedeId) {
  const out = { organization_id: orgId, sede_id: sedeId || null }
  for (const k of FATTURA_COLS_SICURE) if (r[k] !== undefined && r[k] !== null) out[k] = r[k]
  return out
}

// Colonne "core" sempre presenti (anche prima della migration scadenzario).
const FATTURA_COLS_CORE = ['numero_rif', 'data_fattura', 'fornitore', 'imponibile', 'imposta', 'totale', 'stato']

// INSERT resiliente: prova con tutte le colonne sicure (scadenza/iban/tipo/…);
// se la migration delle nuove colonne NON è ancora applicata, PostgREST risponde
// "column does not exist" / PGRST204 → ripieghiamo sulle sole colonne core, così
// l'import funziona comunque (degradando i campi nuovi) invece di rompersi.
async function insertFattureResilient(supabase, rows) {
  if (!rows.length) return
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    let { error } = await supabase.from('fatture').insert(chunk)
    if (error && /does not exist|schema cache|PGRST204|could not find/i.test(error.message || '')) {
      const core = chunk.map(r => {
        const o = { organization_id: r.organization_id, sede_id: r.sede_id }
        for (const k of FATTURA_COLS_CORE) if (r[k] !== undefined && r[k] !== null) o[k] = r[k]
        return o
      })
      error = (await supabase.from('fatture').insert(core)).error
    }
    if (error) throw error
  }
}

// Chiave di deduplica fattura: numero + fornitore + data, normalizzati.
// Serve a NON reinserire righe già presenti se l'utente reimporta un file che
// contiene fatture già caricate (es. export sovrapposti tra mesi). Le fatture
// nuove di un mese diverso hanno chiave diversa → vengono comunque aggiunte.
function fatturaKey(r) {
  const norm = v => String(v ?? '').trim().toUpperCase()
  return `${norm(r.numero_rif)}|${norm(r.fornitore)}|${norm(r.data_fattura)}`
}

// Filtra i record da inserire scartando quelli già presenti (set `seen`) e i
// duplicati interni allo stesso import. Muta `seen` aggiungendo le chiavi nuove.
// Ritorna { nuovi, scartati }.
function dedupFatture(records, seen) {
  const nuovi = []
  let scartati = 0
  for (const r of records) {
    const k = fatturaKey(r)
    if (seen.has(k)) { scartati++; continue }
    seen.add(k)
    nuovi.push(r)
  }
  return { nuovi, scartati }
}

// Termine di pagamento standard usato per derivare la data di scadenza
// quando in DB non e' specificata: 30 giorni dalla data fattura.
const PAYMENT_TERMS_DAYS = 30

// loadXLSX importato da ../lib/xlsx (loader unico multi-CDN, no SRI)

// ─── Date / numero helpers ────────────────────────────────────────────────────
function dueDateObj(f) {
  // 1) Scadenza REALE dall'XML (DatiPagamento) se presente.
  if (f?.data_scadenza && /^\d{4}-\d{2}-\d{2}/.test(f.data_scadenza)) {
    const d = new Date(f.data_scadenza.slice(0, 10) + 'T12:00:00')
    if (!isNaN(d.getTime())) return d
  }
  // 2) Altrimenti deriva da data_fattura + termini (per-fornitore se noti, else 30gg).
  if (!f?.data_fattura) return null
  const d = new Date(f.data_fattura + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  const termini = Number.isFinite(f?._termini) ? f._termini : PAYMENT_TERMS_DAYS
  d.setDate(d.getDate() + termini)
  return d
}
function dueDateISO(f) {
  const d = dueDateObj(f)
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function diffDays(dateObj, now = new Date()) {
  if (!dateObj) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  return Math.floor((due - today) / 86400000)
}

// Classifica ogni fattura in una "band" di urgenza
function computeUrgenza(f, now = new Date()) {
  if (f.stato === 'pagata') return 'pagata'
  const dd = dueDateObj(f)
  if (!dd) return 'futura'
  const days = diffDays(dd, now)
  if (days < 0)   return 'scaduta'
  if (days <= 7)  return 'settimana'
  if (days <= 30) return 'mese'
  return 'futura'
}

const URGENZA_CFG = {
  scaduta:   { label: 'SCADUTA',          pillBg: '#FEE2E2',   pillFg: '#991B1B', accent: T.brand,    order: 0, header: 'Scadute',          sub: 'da pagare con urgenza' },
  settimana: { label: 'QUESTA SETTIMANA', pillBg: '#FFEDD5',   pillFg: '#9A3412', accent: '#F97316',  order: 1, header: 'Questa settimana', sub: 'entro 7 giorni' },
  mese:      { label: 'QUESTO MESE',      pillBg: '#FEF3C7',   pillFg: '#92400E', accent: T.amber,    order: 2, header: 'Questo mese',      sub: 'entro 30 giorni' },
  futura:    { label: 'FUTURA',           pillBg: T.bgSubtle,  pillFg: T.textMid, accent: T.textSoft, order: 3, header: 'Future',           sub: 'oltre 30 giorni' },
  pagata:    { label: 'PAGATA',           pillBg: '#DCFCE7',   pillFg: '#166534', accent: T.green,    order: 4, header: 'Pagate',           sub: 'già saldate' },
}

// useGrouping:'always' obbligatorio: senza, alcuni runtime (Safari iOS private,
// Node senza ICU full) ritornano "4715" invece di "4.715". Vedi _shared.jsx.
const _NF2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const _NF0 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' })
const fmtEuro = v => `${_NF2.format(Number(v || 0))} €`
const fmtEuro0 = v => `${_NF0.format(Math.round(Number(v || 0)))} €`
const fmtDate = d =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function relDayLabel(days) {
  if (days === null || days === undefined) return ''
  if (days < 0)   return Math.abs(days) === 1 ? '1 giorno fa' : `${Math.abs(days)} giorni fa`
  if (days === 0) return 'oggi'
  if (days === 1) return 'domani'
  return `tra ${days} giorni`
}

const FILTRI = [
  { id: 'tutte',       label: 'Tutte',       gruppi: ['scaduta', 'settimana', 'mese', 'futura'] },
  { id: 'scadute',     label: 'Scadute',     gruppi: ['scaduta'] },
  { id: 'in_scadenza', label: 'In scadenza', gruppi: ['settimana', 'mese'] },
  { id: 'pagate',      label: 'Pagate',      gruppi: ['pagata'] },
]

// ═══════════════════════════════════════════════════════════════════════════════
export default function Scadenzario({ orgId, sedeId, sedi = [] }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [fatture, setFatture]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  const [filtro, setFiltro]               = useState('tutte')
  // Lo scope sede è comandato dal SELETTORE GLOBALE in topbar (un solo controllo):
  // sede specifica → solo quella + condivise; "Tutte le sedi" (sedeId assente) → tutte.
  const scopeSede = sedeId ? 'attiva' : 'tutte'
  const [toast, setToast]                 = useState(null)
  const [pagandoId, setPagandoId]         = useState(null)
  // Data locale del browser (not UTC): toISOString() darebbe il giorno
  // precedente per chiunque sia a UTC+ tra le 00:00 e le 00:59 locali.
  const [dataPag, setDataPag]             = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [eliminandoId, setEliminandoId]   = useState(null)
  // Vista: 'scadenza' (timeline urgenza) | 'fornitore' (rollup) | 'cassa' (forward)
  const [vista, setVista]                 = useState('scadenza')
  const [search, setSearch]               = useState('')
  // Anagrafica fornitori (enrichment: iban di default, termini) keyed per nome_norm
  const [fornitori, setFornitori]         = useState([])
  // Dati pagamento azienda (debtor del bonifico SEPA)
  const [azienda, setAzienda]             = useState({ nome: '', iban: '', bic: '' })
  const [editAzienda, setEditAzienda]     = useState(false)
  // Selezione fatture per il bonifico massivo
  const [selez, setSelez]                 = useState(() => new Set())
  // Pagamento: stato esteso (acconto + metodo) per il popup "segna pagata"
  const [pagImporto, setPagImporto]       = useState('')
  const [pagMetodo, setPagMetodo]         = useState('bonifico')
  // Editing anagrafica fornitore (IBAN/termini) dal rollup
  const [editForn, setEditForn]           = useState(null) // nome_norm in edit
  const [editFornData, setEditFornData]   = useState({ iban: '', termini: 30, categoria: '' })
  // Set di fornitori (nome_norm) con dropdown fatture espanso.
  const [expandedForn, setExpandedForn]   = useState(() => new Set())
  const toggleExpandForn = (nomeNorm) => setExpandedForn(prev => {
    const next = new Set(prev)
    if (next.has(nomeNorm)) next.delete(nomeNorm); else next.add(nomeNorm)
    return next
  })
  // Eliminazione bulk con doppia conferma (modale + frase da digitare)
  const [bulkOpen, setBulkOpen]           = useState(false)
  const [bulkConfirm, setBulkConfirm]     = useState('')
  const [bulkDeleting, setBulkDeleting]   = useState(false)

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    loadFatture()
    loadFornitori()
    loadAzienda()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sedeId])

  async function loadFornitori() {
    try {
      const { data, error } = await supabase.from('fornitori').select('*').eq('organization_id', orgId)
      if (error) {
        // tabella non ancora creata (migration non applicata) → enrichment vuoto
        if (/does not exist|schema cache|could not find/i.test(error.message || '')) { setFornitori([]); return }
        throw error
      }
      setFornitori(data || [])
    } catch { setFornitori([]) }
  }

  async function loadAzienda() {
    try {
      const a = await sload(SK_AZIENDA_PAG, orgId, null)
      if (a && typeof a === 'object') setAzienda({ nome: a.nome || '', iban: a.iban || '', bic: a.bic || '' })
    } catch { /* nessun dato salvato */ }
  }

  async function salvaAzienda(next) {
    try {
      await ssave(SK_AZIENDA_PAG, next, orgId, null)
      setAzienda(next)
      setEditAzienda(false)
      notify('Dati di pagamento azienda salvati')
    } catch (e) {
      notify('Errore salvataggio: ' + (e?.message || 'rete'), false)
    }
  }

  // Mappa nome normalizzato → fornitore (anagrafica esistente). Il match è sul
  // nome (la tabella `fornitori` non ha nome_norm): normalizziamo lato JS.
  const fornitoriMap = useMemo(() => {
    const m = {}
    for (const f of fornitori) m[normNome(f.nome)] = f
    return m
  }, [fornitori])

  // Salva IBAN/termini/categoria sull'anagrafica fornitori ESISTENTE.
  // Find-or-insert per nome normalizzato (niente onConflict: la tabella legacy
  // non ha un vincolo unico su nome).
  async function salvaFornitore(nome, patch) {
    const key = normNome(nome)
    try {
      const esistente = fornitori.find(f => normNome(f.nome) === key)
      const fields = {
        iban: patch.iban !== undefined ? (normalizeIban(patch.iban) || null) : (esistente?.iban || null),
        termini_pagamento: patch.termini_pagamento !== undefined ? patch.termini_pagamento : (esistente?.termini_pagamento ?? 30),
        categoria: patch.categoria !== undefined ? (patch.categoria || null) : (esistente?.categoria || null),
      }
      let error
      if (esistente) {
        ({ error } = await supabase.from('fornitori').update(fields).eq('id', esistente.id))
      } else {
        ({ error } = await supabase.from('fornitori').insert({ organization_id: orgId, nome, ...fields }))
      }
      if (error) throw error
      setEditForn(null)
      await loadFornitori()
      notify('Anagrafica fornitore aggiornata')
    } catch (e) {
      notify('Errore: ' + (e?.message || 'salvataggio fallito') + ' — verifica la migration scadenzario', false)
    }
  }

  async function loadFatture() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    try {
      let q = supabase
        .from('fatture')
        .select('*')
        .eq('organization_id', orgId)
        .order('data_fattura', { ascending: false })
      if (scopeSede === 'attiva' && sedeId) {
        q = q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
      }
      const { data, error } = await q
      if (error) throw error
      setFatture(data || [])
    } catch (e) {
      notify('Errore caricamento: ' + (e?.message || 'sconosciuto'), false)
    } finally {
      setLoading(false)
    }
  }

  async function handleImportExcel(files) {
    if (!orgId) return
    setImportLoading(true)
    let imported = 0, scartati = 0
    const seen = new Set(fatture.map(fatturaKey))
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFatturaSMART(file)
        if (!records.length) { notify('Nessuna fattura trovata nel file', false); continue }
        const { nuovi, scartati: sc } = dedupFatture(records, seen)
        scartati += sc
        const toInsert = nuovi.map(r => pickFattura(r, orgId, sedeId))
        await insertFattureResilient(supabase, toInsert)
        imported += nuovi.length
      } catch (e) {
        const msg = e?.message || (typeof e === 'string' ? e : '') || 'errore sconosciuto'
        notify('Errore import ' + file.name + ': ' + msg, false)
      }
    }
    if (imported > 0) {
      notify(`${imported} fatture importate${scartati > 0 ? ` · ${scartati} già presenti, saltate` : ''}`)
      try { await loadFatture() } catch { /* il toast di esito è già stato mostrato */ }
    } else if (scartati > 0) {
      notify(`${scartati} fatture erano già presenti — nessun duplicato aggiunto`, false)
    }
    setImportLoading(false)
  }

  async function handleImportXML(files) {
    if (!orgId) return
    setImportLoading(true)
    let imported = 0, scartati = 0
    const seen = new Set(fatture.map(fatturaKey))
    for (const file of Array.from(files || [])) {
      try {
        const text = await file.text()
        const records = parseFatturaXML(text)
        if (!records.length) { notify('Nessuna fattura trovata nel file XML', false); continue }
        const { nuovi, scartati: sc } = dedupFatture(records, seen)
        scartati += sc
        const toInsert = nuovi.map(r => pickFattura(r, orgId, sedeId))
        await insertFattureResilient(supabase, toInsert)
        imported += nuovi.length
      } catch (e) {
        notify('Errore import XML ' + file.name + ': ' + (e?.message || 'sconosciuto'), false)
      }
    }
    if (imported > 0) {
      notify(`${imported} fatture XML importate${scartati > 0 ? ` · ${scartati} già presenti, saltate` : ''}`)
      try { await loadFatture() } catch { /* il toast di esito è già stato mostrato */ }
    } else if (scartati > 0) {
      notify(`${scartati} fatture erano già presenti — nessun duplicato aggiunto`, false)
    }
    setImportLoading(false)
  }

  async function handleImportSMART(files) {
    if (!orgId) return
    setImportLoading(true)
    let imported = 0, scartati = 0
    const seen = new Set(fatture.map(fatturaKey))
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFatturaSMART(file)
        if (!records.length) { notify('Nessuna fattura trovata nel file FatturaSMART', false); continue }
        const { nuovi, scartati: sc } = dedupFatture(records, seen)
        scartati += sc
        const toInsert = nuovi.map(r => pickFattura(r, orgId, sedeId))
        await insertFattureResilient(supabase, toInsert)
        imported += nuovi.length
      } catch (e) {
        notify('Errore import FatturaSMART ' + file.name + ': ' + (e?.message || 'sconosciuto'), false)
      }
    }
    if (imported > 0) {
      notify(`${imported} fatture FatturaSMART importate${scartati > 0 ? ` · ${scartati} già presenti, saltate` : ''}`)
      try { await loadFatture() } catch { /* il toast di esito è già stato mostrato */ }
    } else if (scartati > 0) {
      notify(`${scartati} fatture erano già presenti — nessun duplicato aggiunto`, false)
    }
    setImportLoading(false)
  }

  // Segna pagata o registra un ACCONTO. Se l'importo inserito copre il residuo
  // → saldata; altrimenti aggiorna solo importo_pagato (pagamento parziale).
  // Salva anche il metodo. Resiliente: se le colonne nuove non esistono, ripiega
  // sul semplice stato=pagata.
  async function segnaComePagata(id) {
    const f = fatture.find(x => x.id === id)
    const totale = Math.abs(Number(f?.totale) || 0)
    const giaPagato = Number(f?.importo_pagato) || 0
    const importoInput = pagImporto !== ''
      ? Math.max(0, Number(String(pagImporto).replace(',', '.')) || 0)
      : Math.max(0, totale - giaPagato)
    const nuovoPagato = Math.round((giaPagato + importoInput) * 100) / 100
    const saldata = nuovoPagato >= totale - 0.01
    const patch = saldata
      ? { stato: 'pagata', data_pagamento: dataPag, importo_pagato: totale, metodo_pagamento: pagMetodo }
      : { importo_pagato: nuovoPagato, metodo_pagamento: pagMetodo }
    try {
      let applied = patch
      let { error } = await supabase.from('fatture').update(patch).eq('id', id)
      if (error && /does not exist|schema cache|could not find|PGRST204/i.test(error.message || '')) {
        applied = { stato: 'pagata', data_pagamento: dataPag } // fallback pre-migration
        error = (await supabase.from('fatture').update(applied).eq('id', id)).error
      }
      if (error) throw error
      setFatture(prev => prev.map(x => x.id === id ? { ...x, ...applied } : x))
      setPagandoId(null); setPagImporto('')
      notify(saldata || applied.stato === 'pagata'
        ? 'Fattura saldata'
        : `Acconto registrato (${fmtEuro(importoInput)}) · residuo ${fmtEuro(totale - nuovoPagato)}`)
    } catch (e) {
      notify('Errore: ' + (e?.message || 'aggiornamento fallito'), false)
    }
  }

  // ── Bonifico ────────────────────────────────────────────────────────────────
  // Genera e scarica il file SEPA pain.001 con le fatture selezionate.
  function generaBonificoSEPA(items) {
    if (!ibanIsValid(azienda.iban)) {
      setEditAzienda(true)
      notify('Inserisci prima l’IBAN dell’azienda (in alto) per generare il bonifico.', false)
      return
    }
    const payments = items.map(f => ({
      id: f.id,
      beneficiario: f.fornitore,
      iban: f.iban,
      importo: Math.abs(f.residuo || f.totale || 0),
      causale: causaleFattura(f),
    }))
    try {
      const today = new Date()
      const exec = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const { xml, included, skipped, totale } = generateSepaXml({ debtor: azienda, payments, executionDate: exec })
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bonifico_sepa_${exec}.xml`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      notify(`Bonifico SEPA pronto: ${included.length} pagamenti · ${fmtEuro(totale)}${skipped.length ? ` · ${skipped.length} saltati (IBAN mancante)` : ''} — caricalo nell'home banking`)
    } catch (e) {
      notify('Bonifico non generato: ' + (e?.message || 'errore') + (e?.skipped?.length ? ` (${e.skipped.length} senza IBAN)` : ''), false)
    }
  }

  // Copia i dati del bonifico della singola fattura negli appunti.
  async function copiaBonifico(f) {
    const txt = bonificoText({ beneficiario: f.fornitore, iban: f.iban, importo: Math.abs(f.residuo || f.totale || 0), causale: causaleFattura(f) })
    try {
      await navigator.clipboard.writeText(txt)
      notify('Dati bonifico copiati')
    } catch {
      notify('Copia non riuscita — IBAN: ' + (normalizeIban(f.iban) || 'n/d'), false)
    }
  }

  const toggleSelez = (id) => setSelez(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  function chiediElimina(id) {
    setEliminandoId(id)
    setPagandoId(null)
  }

  async function eliminaFattura(id) {
    try {
      const { error } = await supabase.from('fatture').delete().eq('id', id)
      if (error) throw error
      setFatture(prev => prev.filter(f => f.id !== id))
      setEliminandoId(null)
      notify('Fattura eliminata')
    } catch (e) {
      notify('Errore: ' + (e?.message || 'eliminazione fallita'), false)
    }
  }

  // Elimina in blocco TUTTE le fatture attualmente caricate (rispetta lo scope
  // sede corrente). Protetta da doppia conferma: modale + frase "ELIMINA".
  async function eliminaTutte() {
    if (bulkConfirm.trim().toUpperCase() !== 'ELIMINA') return
    setBulkDeleting(true)
    try {
      const ids = fatture.map(f => f.id).filter(Boolean)
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('fatture').delete().in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
      const n = ids.length
      setFatture([])
      setBulkOpen(false)
      setBulkConfirm('')
      notify(`Eliminate ${n} ${n === 1 ? 'fattura' : 'fatture'}`)
    } catch (e) {
      notify('Errore eliminazione: ' + (e?.message || 'riprova'), false)
    } finally {
      setBulkDeleting(false)
    }
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const fattureExt = useMemo(() => {
    const now = new Date()
    return fatture.map(f => {
      // Arricchimento da anagrafica fornitore: termini di pagamento (per la
      // scadenza derivata) e IBAN di default (per il bonifico).
      const anag = fornitoriMap[normNome(f.fornitore)]
      const fEnriched = {
        ...f,
        _termini: Number.isFinite(anag?.termini_pagamento) ? anag.termini_pagamento : undefined,
        iban: f.iban || anag?.iban || '',
      }
      const dd = dueDateObj(fEnriched)
      const segno = f.tipo === 'nota_credito' ? -1 : 1
      const importoNetto = segno * (Number(f.totale) || 0)       // NC = negativo
      const pagato = Number(f.importo_pagato) || 0
      // Residuo da pagare: per le NC è un credito (negativo); per le fatture è
      // totale - quanto già pagato (acconti). Le pagate hanno residuo 0.
      const residuo = f.stato === 'pagata' ? 0 : importoNetto - segno * pagato
      return {
        ...fEnriched,
        urgenza: computeUrgenza(fEnriched, now),
        dueIso: dueDateISO(fEnriched),
        dueDays: dd ? diffDays(dd, now) : null,
        segno,
        isNC: segno < 0,
        importoNetto,
        pagato,
        residuo,
        ibanValido: ibanIsValid(f.iban || anag?.iban || ''),
      }
    })
  }, [fatture, fornitoriMap])

  // Gruppi: date ASC poi totale DESC (le più vecchie e grosse in testa al gruppo)
  const gruppi = useMemo(() => {
    const out = { scaduta: [], settimana: [], mese: [], futura: [], pagata: [] }
    for (const f of fattureExt) {
      if (out[f.urgenza]) out[f.urgenza].push(f)
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => {
        const da = a.dueIso || '0000-00-00'
        const db = b.dueIso || '0000-00-00'
        if (da !== db) return da.localeCompare(db)
        return (b.totale || 0) - (a.totale || 0)
      })
    }
    return out
  }, [fattureExt])

  // Riepilogo finanziario (sempre globale, non filtrato)
  const summary = useMemo(() => {
    // Netto (NC comprese): usa il residuo firmato di ogni fattura.
    const sum = arr => arr.reduce((s, f) => s + (f.residuo || 0), 0)
    const aperte = [...gruppi.scaduta, ...gruppi.settimana, ...gruppi.mese, ...gruppi.futura]
    const creditiNC = aperte.filter(f => f.isNC).reduce((s, f) => s + Math.abs(f.residuo || 0), 0)
    return {
      daPagare:     sum(aperte),               // netto NC
      scaduto:      sum(gruppi.scaduta),
      settimanaTot: sum(gruppi.settimana),
      creditiNC,                               // crediti da note di credito ancora aperte
      nDaPagare:    aperte.filter(f => !f.isNC).length,
      nScadute:     gruppi.scaduta.filter(f => !f.isNC).length,
      nSettimana:   gruppi.settimana.filter(f => !f.isNC).length,
      nNC:          aperte.filter(f => f.isNC).length,
    }
  }, [gruppi])

  const gruppiVisibili = useMemo(() => {
    return (FILTRI.find(x => x.id === filtro) || FILTRI[0]).gruppi
  }, [filtro])

  const totaliFiltrati = useMemo(() => {
    const items = gruppiVisibili.flatMap(k => gruppi[k] || [])
    return { n: items.length, tot: items.reduce((s, f) => s + (f.totale || 0), 0) }
  }, [gruppi, gruppiVisibili])

  // Match ricerca (fornitore o numero documento)
  const matchSearch = (f) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (f.fornitore || '').toLowerCase().includes(q) || (f.numero_rif || '').toLowerCase().includes(q)
  }

  // ── Rollup per fornitore (solo aperte, netto NC) ─────────────────────────────
  const rollupFornitori = useMemo(() => {
    const map = {}
    for (const f of fattureExt) {
      if (f.stato === 'pagata') continue
      if (!matchSearch(f)) continue
      const key = normNome(f.fornitore)
      if (!map[key]) {
        const anag = fornitoriMap[key]
        map[key] = {
          nome: f.fornitore, nome_norm: key, n: 0, nFatt: 0, nNC: 0,
          totale: 0, scaduto: 0, iban: f.iban || anag?.iban || '',
          termini: anag?.termini_pagamento ?? null, categoria: anag?.categoria || '',
          anyScaduta: false, items: [],
        }
      }
      const g = map[key]
      g.n++
      if (f.isNC) g.nNC++; else g.nFatt++
      g.totale += f.residuo
      if (f.urgenza === 'scaduta') { g.scaduto += f.residuo; g.anyScaduta = true }
      if (!g.iban && f.iban) g.iban = f.iban
      g.items.push(f)
    }
    return Object.values(map).sort((a, b) => b.totale - a.totale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fattureExt, fornitoriMap, search])

  // Mappa di TUTTE le fatture per fornitore (incluse le pagate). Usato per
  // il dropdown espandibile: il rollup principale mostra solo gli aperti,
  // qui consentiamo anche di vedere lo storico pagamenti.
  const tutteFatturePerFornitore = useMemo(() => {
    const map = {}
    for (const f of fattureExt) {
      const key = normNome(f.fornitore)
      if (!map[key]) map[key] = []
      map[key].push(f)
    }
    // Ordina dal più recente (data_fattura desc) al più vecchio.
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => (b.data_fattura || '').localeCompare(a.data_fattura || ''))
    }
    return map
  }, [fattureExt])

  // ── Cassa in uscita: bucket per settimana (forward) ──────────────────────────
  const cashflow = useMemo(() => {
    const scaduto = { label: 'Scaduto', tot: 0, n: 0, scaduto: true }
    const buckets = []
    for (let w = 0; w < 8; w++) buckets.push({ label: w === 0 ? 'Questa sett.' : `+${w} sett.`, tot: 0, n: 0 })
    const oltre = { label: 'Oltre', tot: 0, n: 0 }
    for (const f of fattureExt) {
      if (f.stato === 'pagata') continue
      const amt = f.residuo
      if (f.dueDays == null) { oltre.tot += amt; oltre.n++; continue }
      if (f.dueDays < 0) { scaduto.tot += amt; scaduto.n++; continue }
      const w = Math.floor(f.dueDays / 7)
      if (w < 8) { buckets[w].tot += amt; buckets[w].n++ } else { oltre.tot += amt; oltre.n++ }
    }
    const all = [scaduto, ...buckets, oltre]
    const max = Math.max(1, ...all.map(b => Math.abs(b.tot)))
    let cum = 0
    return all.map(b => { cum += b.tot; return { ...b, cum, max } })
  }, [fattureExt])

  async function exportExcel() {
    try {
      const XLSX = await loadXLSX()
      const items = gruppiVisibili.flatMap(k => gruppi[k] || [])
      const rows = [
        ['Data fattura', 'Data scadenza', 'Fornitore', 'Numero Rif.', 'Imponibile €', 'Imposta €', 'Totale €', 'Stato', 'Data Pagamento'],
        ...items.map(f => [
          f.data_fattura || '',
          f.dueIso || '',
          f.fornitore,
          f.numero_rif || '',
          f.imponibile || 0,
          f.imposta || 0,
          f.totale || 0,
          URGENZA_CFG[f.urgenza]?.label || '—',
          f.data_pagamento || '',
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch:12 },{ wch:12 },{ wch:36 },{ wch:24 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:16 },{ wch:14 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Fatture')
      XLSX.writeFile(wb, `fatture_${new Date().toISOString().slice(0,10)}.xlsx`)
    } catch (e) {
      notify('Errore export: ' + (e?.message || 'sconosciuto'), false)
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  const card = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }
  // Touch target: 40 desktop, 44 tablet/mobile (pattern FoodOS)
  const minTouch = isMobile ? 44 : (isTablet ? 44 : 40)
  const pill = (active) => ({
    padding: isMobile ? '9px 16px' : '7px 14px',
    minHeight: minTouch,
    borderRadius: 9999, border: `1px solid ${active ? T.text : T.border}`, cursor: 'pointer',
    fontSize: isMobile ? 13 : 12, fontWeight: active ? 600 : 500, letterSpacing: '-0.005em',
    background: active ? T.text : T.bgCard,
    color: active ? T.textOnDark : T.textMid,
    display: 'inline-flex', alignItems: 'center',
    transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
  })
  const primaryBtn = { padding: isMobile ? '11px 18px' : '10px 16px', minHeight: minTouch, background: T.brandGradient, color: T.textOnDark, border: 'none', borderRadius: R.md, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, letterSpacing: '-0.005em', boxShadow: S.brandSoft, boxSizing: 'border-box' }
  const ghostBtn = { padding: isMobile ? '10px 16px' : '8px 16px', minHeight: minTouch, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: T.textMid, letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: S.xs, boxSizing: 'border-box' }

  if (!orgId) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>Caricamento in corso...</div>
  )

  // ─── Azioni inline (pagata / elimina) ────────────────────────────────────────
  function ActionsCell({ f, compact = false }) {
    const isPag = pagandoId === f.id
    const isDel = eliminandoId === f.id

    const tinyBtnH = isMobile ? minTouch : (compact ? 30 : 34)
    const fieldFs = isMobile ? 16 : 12
    const fieldPad = isMobile ? '10px 12px' : '7px 10px'

    if (isDel) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}>Sicuro?</span>
          <button onClick={() => eliminaFattura(f.id)}
            style={{ padding: isMobile ? '10px 14px' : '6px 12px', minHeight: tinyBtnH, background: T.brand, color: T.white, border: 'none', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer' }}>
            Sì, elimina
          </button>
          <button onClick={() => setEliminandoId(null)}
            style={{ padding: isMobile ? '10px 14px' : '6px 11px', minHeight: tinyBtnH, background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 600, cursor: 'pointer' }}>
            Annulla
          </button>
        </div>
      )
    }

    if (isPag) {
      const totale = Math.abs(Number(f.totale) || 0)
      const residuoTot = Math.max(0, totale - (Number(f.importo_pagato) || 0))
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'auto auto auto', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Data
              <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} aria-label="Data pagamento"
                style={{ padding: fieldPad, minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: fieldFs, color: T.text, boxSizing: 'border-box', width: '100%' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Importo
              <input type="number" inputMode="decimal" value={pagImporto} onChange={e => setPagImporto(e.target.value)}
                placeholder={`${Number(residuoTot || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                title="Vuoto = salda l'intero residuo. Importo minore = acconto."
                aria-label="Importo pagato"
                style={{ padding: fieldPad, minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: fieldFs, color: T.text, boxSizing: 'border-box', width: '100%' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', gridColumn: isMobile ? '1 / -1' : 'auto' }}>
              Metodo
              <select value={pagMetodo} onChange={e => setPagMetodo(e.target.value)}
                aria-label="Metodo di pagamento"
                style={{ padding: fieldPad, minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: fieldFs, color: T.text, background: T.bgCard, boxSizing: 'border-box', width: '100%' }}>
                <option value="bonifico">Bonifico</option>
                <option value="contanti">Contanti</option>
                <option value="riba">RiBa</option>
                <option value="rid">RID/SDD</option>
                <option value="carta">Carta</option>
                <option value="altro">Altro</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button aria-label="Annulla pagamento" onClick={() => { setPagandoId(null); setPagImporto('') }}
              style={{ padding: '8px 14px', minHeight: minTouch, background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: isMobile ? 1 : '0 0 auto' }}>
              Annulla
            </button>
            <button onClick={() => segnaComePagata(f.id)} aria-label="Conferma pagamento"
              style={{ padding: '8px 16px', minHeight: minTouch, background: T.green, color: T.white, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: isMobile ? 1 : '0 0 auto' }}>
              <Icon name="check" size={13} /> Conferma
            </button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {f.stato === 'pagata' ? (
          <span style={{ fontSize: 11, color: T.green, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {f.data_pagamento ? fmtDate(f.data_pagamento) : 'Pagata'}
          </span>
        ) : (
          <button onClick={() => { setPagandoId(f.id); setEliminandoId(null); setPagImporto(''); setPagMetodo('bonifico'); setDataPag(new Date().toISOString().slice(0,10)) }}
            aria-label={f.pagato > 0 ? 'Salda o registra acconto' : 'Segna come pagata'}
            style={{ padding: isMobile ? '9px 14px' : (compact ? '6px 11px' : '7px 12px'), minHeight: tinyBtnH, background: '#F0FDF4', color: T.green, border: `1px solid ${T.green}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="check" size={12} /> {f.pagato > 0 ? 'Salda/acconto' : 'Segna pagata'}
          </button>
        )}
        {f.stato !== 'pagata' && f.ibanValido && (
          <button onClick={() => copiaBonifico(f)} title="Copia dati bonifico (IBAN, importo, causale)"
            aria-label="Copia dati bonifico"
            style={{ padding: isMobile ? '9px 14px' : '7px 11px', minHeight: tinyBtnH, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name="copy" size={12} /> Bonifico
          </button>
        )}
        <button onClick={() => chiediElimina(f.id)}
          aria-label="Elimina fattura" title="Elimina fattura"
          style={{ padding: isMobile ? '9px 12px' : '7px 9px', minHeight: tinyBtnH, minWidth: minTouch, background: 'transparent', color: T.textSoft, border: 'none', cursor: 'pointer', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = T.brand }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textSoft }}>
          <svg width={isMobile ? 16 : 14} height={isMobile ? 16 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    )
  }

  // ─── Tabella desktop row ─────────────────────────────────────────────────────
  function RigaTabella({ f, cfg, i, last }) {
    const isDel = eliminandoId === f.id
    const isPag = pagandoId === f.id
    const isScaduta = f.urgenza === 'scaduta'
    const baseBg = isDel ? '#FEF2F2' : (isPag ? '#F0FDF4' : (i % 2 === 0 ? T.bgCard : '#FAFAFA'))

    // Inline edit (pagamento) → rendiamo una riga "full-width" con span colonne,
    // così il form pulito non resta compresso nella cella azioni.
    if (isPag) {
      return (
        <>
          <tr style={{ borderBottom: `none`, background: baseBg, boxShadow: isScaduta ? `inset 3px 0 0 0 ${T.brand}` : 'none' }}>
            <td style={{ padding: '8px 12px 6px', fontWeight: 600, color: T.text, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: baseBg, zIndex: 1 }}>
              <span title={f.fornitore}>{f.fornitore}</span>
            </td>
            <td colSpan={5} style={{ padding: '8px 12px 6px', color: T.textSoft, fontSize: 11.5 }}>
              {f.numero_rif || '—'} · {fmtDate(f.data_fattura)} · scade {fmtDate(f.dueIso)} · totale <span style={{ color: T.text, fontWeight: 700, ...tnum }}>{fmtEuro(f.totale)}</span>
            </td>
            <td style={{ padding: '8px 12px 6px' }} />
          </tr>
          <tr style={{ borderBottom: last ? 'none' : `1px solid ${T.border}`, background: baseBg }}>
            <td colSpan={7} style={{ padding: '6px 14px 14px' }}>
              <ActionsCell f={f} compact />
            </td>
          </tr>
        </>
      )
    }

    return (
      <tr style={{
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
        background: baseBg,
        boxShadow: isScaduta ? `inset 3px 0 0 0 ${T.brand}` : 'none',
      }}>
        <td style={{ padding: '10px 12px', fontWeight: 600, color: T.text, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: baseBg, zIndex: 1 }}>
          <span title={f.fornitore}>{f.fornitore}</span>
        </td>
        <td style={{ padding: '10px 12px', color: T.textMid, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
          <span title={f.numero_rif || ''}>{f.numero_rif || '—'}</span>
        </td>
        <td style={{ padding: '10px 12px', color: T.textMid, whiteSpace: 'nowrap', ...tnum }}>
          {fmtDate(f.data_fattura)}
        </td>
        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
          {f.stato === 'pagata' ? (
            <span style={{ color: T.textSoft }}>—</span>
          ) : f.dueIso ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ color: T.text, fontWeight: 500, ...tnum }}>{fmtDate(f.dueIso)}</span>
              <span style={{ fontSize: 10, color: isScaduta ? T.brand : T.textSoft, fontWeight: isScaduta ? 600 : 500 }}>
                {relDayLabel(f.dueDays)}
              </span>
            </div>
          ) : (
            <span style={{ color: T.textSoft }}>—</span>
          )}
        </td>
        <td style={{
          padding: '10px 12px', textAlign: 'right',
          fontWeight: isScaduta ? 800 : 700,
          color: isScaduta ? T.brand : T.text,
          letterSpacing: '-0.015em', whiteSpace: 'nowrap', ...tnum,
        }}>
          {fmtEuro(f.totale)}
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{
            background: cfg.pillBg, color: cfg.pillFg,
            padding: '4px 10px', borderRadius: 9, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>{cfg.label}</span>
        </td>
        <td style={{ padding: '8px 12px' }}>
          <ActionsCell f={f} compact />
        </td>
      </tr>
    )
  }

  // ─── Card mobile ─────────────────────────────────────────────────────────────
  function CardMobile({ f, cfg }) {
    const isDel = eliminandoId === f.id
    const isPag = pagandoId === f.id
    const isScaduta = f.urgenza === 'scaduta'

    return (
      <div style={{
        background: T.bgCard,
        border: `1px solid ${isDel ? '#FCA5A5' : (isScaduta ? '#FCA5A5' : T.border)}`,
        borderLeft: `4px solid ${cfg.accent}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 10,
        boxShadow: isScaduta ? '0 1px 2px rgba(110,14,26,0.06)' : '0 1px 2px rgba(15,23,42,0.03)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div title={f.fornitore} style={{ fontWeight: 700, fontSize: 14, color: T.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.005em' }}>
            {f.fornitore}
          </div>
          <span style={{
            background: cfg.pillBg, color: cfg.pillFg,
            padding: '3px 9px', borderRadius: 9, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{cfg.label}</span>
        </div>
        <div title={`${f.numero_rif || ''} · ${fmtDate(f.data_fattura)}`} style={{ fontSize: 11.5, color: T.textSoft, marginBottom: 10, ...tnum, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.numero_rif || '—'} · fattura {fmtDate(f.data_fattura)}
          {f.stato !== 'pagata' && f.dueIso && (
            <>
              {' · '}
              <span style={{ color: isScaduta ? T.brand : T.textMid, fontWeight: isScaduta ? 600 : 500 }}>
                scadenza {fmtDate(f.dueIso)} ({relDayLabel(f.dueDays)})
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 18, fontWeight: isScaduta ? 800 : 700,
            color: isScaduta ? T.brand : T.text,
            letterSpacing: '-0.02em', ...tnum,
          }}>
            {fmtEuro(f.totale)}
          </div>
          {!isDel && !isPag && <ActionsCell f={f} />}
        </div>
        {isPag && (
          <div style={{ marginTop: 12, padding: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10 }}>
            <ActionsCell f={f} />
          </div>
        )}
        {isDel && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
            <div style={{ fontSize: 12.5, color: T.brand, fontWeight: 600, marginBottom: 10 }}>
              Sei sicuro? L'azione non è reversibile.
            </div>
            <ActionsCell f={f} />
          </div>
        )}
      </div>
    )
  }

  // ─── Sezione gruppo ──────────────────────────────────────────────────────────
  function Gruppo({ keyU, items }) {
    // Audit 2026-06-22 CRITICAL: hook DEVE essere chiamato prima dell'early
    // return — altrimenti hook order corrupts se items.length cambia.
    const [shownAll, setShownAll] = useState(false)
    if (!items.length) return null
    const cfg = URGENZA_CFG[keyU]
    const totaleGruppo = items.reduce((s, f) => s + (f.totale || 0), 0)
    const isUrgent = keyU === 'scaduta'

    return (
      <section style={{
        ...card,
        overflow: 'hidden',
        marginBottom: 14,
        borderLeft: `4px solid ${cfg.accent}`,
      }}>
        {/* Header gruppo */}
        <div style={{
          padding: isMobile ? '14px 14px' : '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          borderBottom: `1px solid ${T.border}`,
          background: isUrgent ? '#FEF2F2' : T.bgCard,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <span aria-label={`${items.length} fatture`} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 28, height: 28, padding: '0 8px', borderRadius: 9, background: cfg.pillBg, color: cfg.pillFg,
              fontSize: 12, fontWeight: 800, ...tnum,
            }}>{items.length.toLocaleString('it-IT')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
                {cfg.header}
              </div>
              <div style={{ fontSize: 11.5, color: T.textSoft, letterSpacing: '-0.005em', marginTop: 1 }}>
                {cfg.sub}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: isMobile ? 15 : 16, fontWeight: 800,
            color: isUrgent ? T.brand : T.text,
            letterSpacing: '-0.015em', ...tnum, whiteSpace: 'nowrap',
          }}>
            {fmtEuro(totaleGruppo)}
          </div>
        </div>

        {/* Body — Audit 2026-07-01 batch 10 Performance: paginazione UI a 60
            elementi per evitare lag su scadenzari grandi (1000+ fatture). */}
        {(() => {
          const PAGE_SIZE = 60
          const isPaginated = items.length > PAGE_SIZE && !shownAll
          const view = isPaginated ? items.slice(0, PAGE_SIZE) : items
          return (
            <>
              {isMobile ? (
                <div style={{ padding: 8 }}>
                  {view.map(f => <CardMobile key={f.id} f={f} cfg={cfg} />)}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 12.5, ...tnum }}>
                    <thead>
                      <tr style={{ background: '#FAFAF8' }}>
                        {[
                          'Fornitore', 'Numero', 'Data fatt.', 'Scadenza', 'Totale', 'Stato', 'Azioni',
                        ].map((l, idx) => (
                          <th key={l} style={{
                            padding: '10px 12px',
                            textAlign: idx === 4 ? 'right' : 'left',
                            fontSize: 10, fontWeight: 700,
                            color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em',
                            borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                            position: idx === 0 ? 'sticky' : 'static',
                            left: idx === 0 ? 0 : 'auto',
                            background: '#FAFAF8',
                            zIndex: idx === 0 ? 2 : 1,
                          }}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {view.map((f, i) => (
                        <RigaTabella key={f.id} f={f} cfg={cfg} i={i} last={i === view.length - 1} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isPaginated && (
                <div style={{
                  padding: '14px 16px', textAlign: 'center',
                  borderTop: `1px solid ${T.border}`, background: '#FAFAF6',
                }}>
                  <div style={{ fontSize: 12.5, color: T.textSoft, marginBottom: 10, ...tnum }}>
                    Mostrate <strong>{view.length.toLocaleString('it-IT')}</strong> di <strong>{items.length.toLocaleString('it-IT')}</strong> fatture.
                  </div>
                  <button onClick={() => setShownAll(true)}
                    aria-label={`Mostra tutte le ${items.length} fatture`}
                    style={{
                      padding: '10px 22px', minHeight: minTouch, borderRadius: 9,
                      border: `1px solid ${T.border}`, background: T.bgCard,
                      fontSize: 13, fontWeight: 700, color: T.text, cursor: 'pointer',
                    }}>
                    Mostra tutte ({items.length.toLocaleString('it-IT')})
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </section>
    )
  }

  // ─── Vista: rollup per fornitore ─────────────────────────────────────────────
  function RollupView() {
    if (!rollupFornitori.length) {
      return <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
        Nessuna fattura aperta{search ? ' per la ricerca' : ''}.
      </div>
    }
    const totGlob = rollupFornitori.reduce((s, g) => s + g.totale, 0)
    return (
      <div style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: isMobile ? '14px 16px' : '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Dovuto per fornitore</div>
            <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 2 }}>{rollupFornitori.length.toLocaleString('it-IT')} fornitori · netto note di credito · spunta per il bonifico</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, ...tnum, whiteSpace: 'nowrap' }}>{fmtEuro(totGlob)}</div>
        </div>
        {rollupFornitori.map(g => {
          const isEdit = editForn === g.nome_norm
          const selectable = g.items.some(f => f.ibanValido && f.residuo > 0)
          const sel = selez.has(g.nome_norm)
          const ibanN = normalizeIban(g.iban)
          const isExpanded = expandedForn.has(g.nome_norm)
          const tutteFatture = tutteFatturePerFornitore[g.nome_norm] || []
          return (
            <div key={g.nome_norm} style={{ borderBottom: `1px solid ${T.border}`, padding: isMobile ? '12px 14px' : '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, flexWrap: 'wrap' }}>
                <input type="checkbox" checked={sel} disabled={!selectable} onChange={() => toggleSelez(g.nome_norm)}
                  title={selectable ? 'Includi nel bonifico SEPA' : 'IBAN mancante: impostalo col tasto impostazioni per poter pagare'}
                  aria-label={`Seleziona ${g.nome} per bonifico SEPA`}
                  style={{ width: 18, height: 18, cursor: selectable ? 'pointer' : 'not-allowed', accentColor: T.brand, flexShrink: 0 }}
                  onClick={e => e.stopPropagation()} />
                <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                  onClick={() => toggleExpandForn(g.nome_norm)}
                  title="Mostra tutte le fatture di questo fornitore">
                  <div style={{ fontWeight: 700, fontSize: isMobile ? 14 : 13.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ fontSize: 10, color: T.textSoft, transition: 'transform .15s ease', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nome}</span>
                  </div>
                  <div title={ibanN ? `IBAN ${ibanN}` : 'IBAN mancante'} style={{ fontSize: 11.5, color: T.textSoft, ...tnum, marginLeft: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.nFatt} fatt.{g.nNC > 0 ? ` · ${g.nNC} NC` : ''}{g.termini != null ? ` · ${g.termini}gg` : ''}
                    {' · '}{ibanN ? `${ibanN.slice(0, 2)}…${ibanN.slice(-4)}` : <span style={{ color: T.brand, fontWeight: 600 }}>no IBAN</span>}
                    {tutteFatture.length > g.n && <span style={{ marginLeft: 6, color: T.textSoft }}>· +{tutteFatture.length - g.n} pagate</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: isMobile ? 28 : 0 }}>
                  {g.scaduto > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '4px 9px', borderRadius: 9, whiteSpace: 'nowrap', ...tnum }}>scaduto {fmtEuro0(g.scaduto)}</span>}
                  <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: g.totale < 0 ? T.green : T.text, ...tnum, minWidth: 96, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEuro(g.totale)}</div>
                  <button onClick={(e) => { e.stopPropagation(); if (isEdit) { setEditForn(null) } else { setEditForn(g.nome_norm); setEditFornData({ iban: g.iban || '', termini: g.termini ?? 30, categoria: g.categoria || '' }) } }}
                    aria-label="Modifica anagrafica fornitore"
                    title="Anagrafica fornitore (IBAN, termini)" style={{ ...ghostBtn, padding: isMobile ? '8px 10px' : '6px 11px', minHeight: minTouch, minWidth: minTouch }}><Icon name="gear" size={14} /></button>
                </div>
              </div>

              {/* Dropdown fatture (pagate + non pagate) */}
              {isExpanded && tutteFatture.length > 0 && (
                <div style={{ marginTop: 10, marginLeft: isMobile ? 0 : 30, padding: 0, background: T.bgSubtle, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${T.border}`, background: '#FAFBFC' }}>
                    {tutteFatture.length} fatture totali · {tutteFatture.filter(f => f.stato === 'pagata').length} pagate · {tutteFatture.filter(f => f.stato !== 'pagata').length} aperte
                  </div>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 520 : 'auto' }}>
                    <thead>
                      <tr style={{ background: '#FFFFFF' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Numero</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</th>
                        {!isMobile && <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scadenza</th>}
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Importo</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tutteFatture.map(f => {
                        const isPagata = f.stato === 'pagata'
                        const isNC = f.isNC
                        return (
                          <tr key={f.id} style={{
                            borderTop: `1px solid ${T.borderSoft}`,
                            background: isPagata ? '#F0FDF4' : '#FFFFFF',
                          }}>
                            <td style={{ padding: '7px 10px', fontSize: 12, color: T.text, fontWeight: 600, ...tnum, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.numero_rif || '—'}
                              {isNC && <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', background: '#DBEAFE', color: '#1E40AF', borderRadius: 3, fontWeight: 700 }}>NC</span>}
                            </td>
                            <td style={{ padding: '7px 10px', fontSize: 11.5, color: T.textMid, ...tnum }}>
                              {f.data_fattura ? new Date(f.data_fattura).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                            </td>
                            {!isMobile && (
                              <td style={{ padding: '7px 10px', fontSize: 11.5, color: f.urgenza === 'scaduta' && !isPagata ? T.brand : T.textSoft, ...tnum, fontWeight: f.urgenza === 'scaduta' && !isPagata ? 700 : 400 }}>
                                {f.dueIso ? new Date(f.dueIso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                              </td>
                            )}
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: isNC ? T.green : T.text, ...tnum }}>
                              {fmtEuro(f.importoNetto)}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                              {isPagata ? (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: '#DCFCE7', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Pagata
                                </span>
                              ) : f.urgenza === 'scaduta' ? (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Scaduta
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: '#FEF9C3', color: '#854D0E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Aperta
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              {isEdit && (
                <div style={{ marginTop: 12, padding: 14, background: T.bgSubtle, borderRadius: 12, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center' }}>
                  <input placeholder="IBAN fornitore" value={editFornData.iban} onChange={e => setEditFornData(d => ({ ...d, iban: e.target.value }))}
                    aria-label="IBAN fornitore"
                    style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${editFornData.iban && !ibanIsValid(editFornData.iban) ? T.brand : T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 13, flex: isMobile ? '1 1 100%' : '1 1 240px', minWidth: 0, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box', ...tnum }} />
                  <input type="number" inputMode="numeric" placeholder="Termini (gg)" value={editFornData.termini} onChange={e => setEditFornData(d => ({ ...d, termini: e.target.value }))}
                    title="Giorni di pagamento (per derivare la scadenza quando non è nell'XML)"
                    aria-label="Termini di pagamento in giorni"
                    style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 13, width: isMobile ? '100%' : 120, boxSizing: 'border-box' }} />
                  <input placeholder="Categoria (opz.)" value={editFornData.categoria} onChange={e => setEditFornData(d => ({ ...d, categoria: e.target.value }))}
                    aria-label="Categoria fornitore"
                    style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 13, flex: isMobile ? '1 1 100%' : '1 1 160px', minWidth: 0, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                    <button onClick={() => salvaFornitore(g.nome, { iban: editFornData.iban, termini_pagamento: Number(editFornData.termini) || 30, categoria: editFornData.categoria })}
                      style={{ ...primaryBtn, flex: isMobile ? 1 : '0 0 auto' }}>Salva</button>
                    <button onClick={() => setEditForn(null)} style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Annulla</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Vista: cassa in uscita (forward) ────────────────────────────────────────
  function CassaView() {
    return (
      <div style={{ ...card, padding: isMobile ? 16 : 22, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Cassa in uscita — prossime settimane</div>
          {!isMobile && <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Settimana · Importo · Cumulato</div>}
        </div>
        <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 18 }}>Quanto esce e quando (netto note di credito). A destra il saldo cumulato.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cashflow.map((b, i) => {
            const pct = Math.min(100, (Math.abs(b.tot) / b.max) * 100)
            const col = b.scaduto ? T.brand : (b.tot < 0 ? T.green : '#F97316')
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14 }}>
                <div style={{ width: isMobile ? 78 : 96, fontSize: 12, color: b.scaduto ? T.brand : T.textMid, fontWeight: b.scaduto ? 700 : 500, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</div>
                <div style={{ flex: 1, height: 24, background: T.bgSubtle, borderRadius: 7, position: 'relative', overflow: 'hidden' }}>
                  {b.tot !== 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: col, borderRadius: 7, minWidth: b.n ? 6 : 0, transition: 'width 0.3s' }} />}
                </div>
                <div style={{ width: isMobile ? 84 : 104, textAlign: 'right', fontSize: 13, fontWeight: 700, color: b.tot < 0 ? T.green : T.text, ...tnum, flexShrink: 0, whiteSpace: 'nowrap' }}>{b.n ? fmtEuro0(b.tot) : '—'}</div>
                {!isMobile && <div style={{ width: 96, textAlign: 'right', fontSize: 11.5, color: T.textSoft, ...tnum, flexShrink: 0, whiteSpace: 'nowrap' }} title="Saldo cumulato">{fmtEuro0(b.cum)}</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Lascia spazio in fondo per la SEPA bar quando ci sono selezioni
  const padBottom = selez.size > 0 ? (isMobile ? 200 : 96) : (isMobile ? 80 : 0)

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 1180, padding: isMobile ? 12 : 0, paddingBottom: padBottom }}>
      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', top: 16, right: 16, left: isMobile ? 16 : 'auto', maxWidth: isMobile ? 'auto' : 420, zIndex: 999, background: toast.ok ? T.green : T.brand, color: T.white, padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, lineHeight: 1.35 }}>
          <Icon name={toast.ok ? 'check' : 'warning'} size={16} />
          <span style={{ flex: 1, minWidth: 0 }}>{toast.msg}</span>
        </div>
      )}

      {/* Modale eliminazione bulk — doppia conferma (frase da digitare) */}
      {bulkOpen && (
        <div onClick={() => !bulkDeleting && (setBulkOpen(false), setBulkConfirm(''))}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.bgCard, borderRadius: 16, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', color: T.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
              </span>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>Eliminare tutte le fatture?</div>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.6, marginBottom: 16 }}>
                Stai per eliminare <b style={{ color: T.brand }}>{fatture.length} {fatture.length === 1 ? 'fattura' : 'fatture'}</b>{haPiuSedi ? (scopeSede === 'attiva' ? ' della sede attiva (e condivise)' : ' di tutte le sedi') : ''}. <b>L'azione è irreversibile</b>: una volta eliminate non si possono recuperare.
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 7 }}>
                Per confermare scrivi <b style={{ color: T.brand, letterSpacing: '0.08em' }}>ELIMINA</b>
              </div>
              <input value={bulkConfirm} onChange={e => setBulkConfirm(e.target.value)} placeholder="ELIMINA" autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && bulkConfirm.trim().toUpperCase() === 'ELIMINA') eliminaTutte() }}
                style={{ width: '100%', padding: '11px 12px', minHeight: isMobile ? 44 : 'auto', border: `1px solid ${bulkConfirm && bulkConfirm.trim().toUpperCase() !== 'ELIMINA' ? '#F3C7C2' : T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 14, boxSizing: 'border-box', letterSpacing: '0.06em', textTransform: 'uppercase', outline: 'none' }} />
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <button onClick={() => { setBulkOpen(false); setBulkConfirm('') }} disabled={bulkDeleting} style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Annulla</button>
              <button onClick={eliminaTutte}
                disabled={bulkConfirm.trim().toUpperCase() !== 'ELIMINA' || bulkDeleting}
                aria-label={`Elimina ${fatture.length} fatture`}
                style={{ padding: '11px 18px', minHeight: minTouch, borderRadius: R.md, border: 'none', background: T.brand, color: '#fff', fontSize: 13, fontWeight: 700, flex: isMobile ? 1 : '0 0 auto',
                  cursor: (bulkConfirm.trim().toUpperCase() === 'ELIMINA' && !bulkDeleting) ? 'pointer' : 'not-allowed',
                  opacity: (bulkConfirm.trim().toUpperCase() === 'ELIMINA' && !bulkDeleting) ? 1 : 0.5 }}>
                {bulkDeleting ? 'Eliminazione…' : `Elimina ${fatture.length.toLocaleString('it-IT')} ${fatture.length === 1 ? 'fattura' : 'fatture'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', marginBottom: 20, gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 14 : 13, color: T.textSoft, letterSpacing: '-0.005em', ...tnum }}>
            {fatture.length.toLocaleString('it-IT')} {fatture.length === 1 ? 'fattura' : 'fatture'} totali · {fmtEuro(fatture.reduce((s,f) => s+(f.totale||0), 0))} fatturato registrato
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          {fatture.length > 0 && (
            <>
              <button onClick={exportExcel} aria-label="Esporta in Excel" style={{ ...ghostBtn, flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto' }}>
                <Icon name="download" size={13} /> Esporta Excel
              </button>
              <button onClick={async () => {
                const list = gruppiVisibili.flatMap(k => gruppi[k] || []);
                if (!(await gateExport('scadenzario', { n_items: list.length }, window.__foodos_notify))) return;
                const c = getExportCtx();
                exportScadenzario(list, c.nomeAttivita, c.email);
              }} aria-label="Esporta in PDF" style={{ ...ghostBtn, flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto' }}><Icon name="fileText" size={13} /> Esporta PDF</button>
              <button onClick={() => { setBulkConfirm(''); setBulkOpen(true) }}
                title="Elimina tutte le fatture caricate"
                aria-label="Elimina tutte le fatture"
                style={{ ...ghostBtn, flex: isMobile ? '1 1 100%' : '0 0 auto', color: T.brand, borderColor: '#F3C7C2' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2' }}
                onMouseLeave={e => { e.currentTarget.style.background = T.bgCard }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Elimina tutte
              </button>
            </>
          )}
          <label style={{ ...ghostBtn, cursor: 'pointer', flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto' }}>
            <Icon name="fileText" size={14} /> XML SDI
            <input type="file" accept=".xml,.p7m" multiple style={{ display: 'none' }}
              onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) handleImportXML(files) }} />
          </label>
          <label style={{ ...ghostBtn, cursor: 'pointer', flex: isMobile ? '1 1 calc(50% - 4px)' : '0 0 auto' }}>
            <Icon name="barChart" size={14} /> FatturaSMART
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) handleImportSMART(files) }} />
          </label>
          <label style={{ ...primaryBtn, cursor: 'pointer', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            {importLoading ? <><Icon name="hourglass" size={14} /> Importazione…</> : <><Icon name="folder" size={14} /> Importa .xlsx</>}
            <input type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
              onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) handleImportExcel(files) }} />
          </label>
        </div>
      </div>

      {/* Summary bar — 3 KPI azionabili */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
        gap: isMobile ? 10 : 14,
        marginBottom: isMobile ? 16 : 22,
      }}>
        {[
          {
            label: 'Totale da pagare',
            val: fmtEuro0(summary.daPagare),
            exact: fmtEuro(summary.daPagare),
            sub: `${summary.nDaPagare} ${summary.nDaPagare === 1 ? 'fattura aperta' : 'fatture aperte'}`,
            color: summary.daPagare > 0 ? T.text : T.textSoft,
            accent: T.text,
            onClick: () => setFiltro('tutte'),
          },
          {
            label: 'Scaduto',
            val: fmtEuro0(summary.scaduto),
            exact: fmtEuro(summary.scaduto),
            sub: summary.nScadute > 0
              ? `${summary.nScadute} ${summary.nScadute === 1 ? 'fattura' : 'fatture'} da regolare subito`
              : 'nessuna fattura scaduta',
            color: summary.scaduto > 0 ? T.brand : T.green,
            accent: summary.scaduto > 0 ? T.brand : T.green,
            onClick: () => setFiltro('scadute'),
            urgent: summary.scaduto > 0,
          },
          {
            label: 'In scadenza (7 giorni)',
            val: fmtEuro0(summary.settimanaTot),
            exact: fmtEuro(summary.settimanaTot),
            sub: summary.nSettimana > 0
              ? `${summary.nSettimana} ${summary.nSettimana === 1 ? 'fattura' : 'fatture'} questa settimana`
              : 'nulla in scadenza',
            color: summary.settimanaTot > 0 ? '#9A3412' : T.textSoft,
            accent: summary.settimanaTot > 0 ? '#F97316' : T.border,
            onClick: () => setFiltro('in_scadenza'),
          },
        ].map(k => (
          <button key={k.label} type="button" onClick={k.onClick}
            aria-label={`${k.label}: ${k.exact}. ${k.sub}`}
            style={{
              ...card,
              padding: isMobile ? '16px 18px 16px 20px' : isTablet ? '16px 20px 16px 22px' : '18px 22px 18px 24px',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              position: 'relative',
              minHeight: isMobile ? 124 : isTablet ? 130 : 138,
              display: 'flex', flexDirection: 'column',
              borderLeft: `4px solid ${k.accent}`,
              boxShadow: k.urgent ? '0 1px 2px rgba(110,14,26,0.08), 0 10px 28px rgba(110,14,26,0.10)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
              transition: `box-shadow ${M.durBase} ${M.ease}, transform ${M.durBase} ${M.ease}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.08), 0 16px 36px rgba(15,23,42,0.08)'; e.currentTarget.style.transform = 'translateY(-3px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = k.urgent ? '0 1px 2px rgba(110,14,26,0.08), 0 10px 28px rgba(110,14,26,0.10)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}>
            <div style={{ fontSize: isMobile ? 11 : 10, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', minHeight: 28, display: 'flex', alignItems: 'flex-start', lineHeight: 1.3 }}>
              {k.label}
            </div>
            <div title={k.exact} style={{
              fontSize: isMobile ? 26 : isTablet ? 28 : 30, fontWeight: 700, color: k.color, lineHeight: 1.05,
              letterSpacing: '-0.025em', ...tnum,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              minHeight: isMobile ? 32 : 36, display: 'flex', alignItems: 'center',
            }}>{k.val}</div>
            <div style={{ fontSize: isMobile ? 12.5 : 12, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.35, minHeight: 34, marginTop: 6, display: 'flex', alignItems: 'flex-end' }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Conto pagamenti azienda (debtor del bonifico SEPA) */}
      <div style={{ ...card, padding: isMobile ? '12px 14px' : '12px 18px', marginBottom: 14, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.textMid, fontWeight: 600, flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: ibanIsValid(azienda.iban) ? '#EFF6FF' : T.bgSubtle, color: ibanIsValid(azienda.iban) ? '#1D4ED8' : T.textSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </span>
          Conto pagamenti
        </span>
        {!editAzienda ? (
          <>
            <span title={ibanIsValid(azienda.iban) ? `${azienda.nome ? azienda.nome + ' · ' : ''}${normalizeIban(azienda.iban)}` : ''} style={{ fontSize: 12.5, color: ibanIsValid(azienda.iban) ? T.text : T.textSoft, ...tnum, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ibanIsValid(azienda.iban) ? `${azienda.nome ? azienda.nome + ' · ' : ''}${normalizeIban(azienda.iban)}` : 'IBAN azienda non impostato — serve per generare i bonifici SEPA'}
            </span>
            <button onClick={() => setEditAzienda(true)} aria-label={ibanIsValid(azienda.iban) ? 'Modifica conto pagamenti' : 'Imposta IBAN'} style={{ ...ghostBtn, padding: isMobile ? '10px 16px' : '7px 14px', flexShrink: 0 }}>
              {ibanIsValid(azienda.iban) ? 'Modifica' : 'Imposta IBAN'}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center', flex: 1, width: '100%' }}>
            <input placeholder="Intestatario conto (azienda)" value={azienda.nome} onChange={e => setAzienda(a => ({ ...a, nome: e.target.value }))}
              style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 13, minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 200px', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }} />
            <input placeholder="IBAN azienda" value={azienda.iban} onChange={e => setAzienda(a => ({ ...a, iban: e.target.value }))}
              style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${azienda.iban && !ibanIsValid(azienda.iban) ? T.brand : T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 13, minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 240px', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box', ...tnum }} />
            <input placeholder="BIC (opz.)" value={azienda.bic} onChange={e => setAzienda(a => ({ ...a, bic: e.target.value }))}
              style={{ padding: '10px 12px', minHeight: minTouch, border: `1px solid ${T.border}`, borderRadius: 9, fontSize: isMobile ? 16 : 13, width: isMobile ? '100%' : 130, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
              <button onClick={() => salvaAzienda(azienda)} disabled={!ibanIsValid(azienda.iban)} style={{ ...primaryBtn, flex: isMobile ? 1 : '0 0 auto', opacity: !ibanIsValid(azienda.iban) ? 0.5 : 1 }}>Salva</button>
              <button onClick={() => { setEditAzienda(false); loadAzienda() }} style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Annulla</button>
            </div>
          </div>
        )}
      </div>

      {/* Toggle vista + ricerca */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 10, padding: 3, gap: 2, width: isMobile ? '100%' : 'auto' }}>
          {[
            { id: 'scadenza', label: 'Per scadenza', icon: 'calendar' },
            { id: 'fornitore', label: 'Per fornitore', icon: 'factory' },
            { id: 'cassa', label: 'Cassa in uscita', icon: 'money' },
          ].map(v => {
            const active = vista === v.id
            return (
              <button key={v.id} onClick={() => setVista(v.id)}
                aria-pressed={active}
                aria-label={`Vista ${v.label}`}
                style={{ padding: isMobile ? '9px 8px' : '8px 14px', minHeight: minTouch, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: isMobile ? 12 : 12, fontWeight: active ? 700 : 500, letterSpacing: '-0.005em',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  flex: isMobile ? 1 : '0 0 auto',
                  background: active ? T.bgCard : 'transparent', color: active ? T.text : T.textMid,
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.10)' : 'none', transition: 'all 0.14s' }}>
                <Icon name={v.icon} size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
              </button>
            )
          })}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: isMobile ? '100%' : 320, width: isMobile ? '100%' : 'auto' }}>
          <label htmlFor="scad-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textSoft, display: 'flex', pointerEvents: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </label>
          <input id="scad-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca fornitore o numero…"
            aria-label="Cerca fornitore o numero"
            style={{ width: '100%', padding: isMobile ? '11px 12px 11px 36px' : '10px 14px 10px 36px', minHeight: minTouch, borderRadius: 9, border: `1px solid ${T.border}`, fontSize: isMobile ? 16 : 13, color: T.text, boxSizing: 'border-box', outline: 'none' }} />
        </div>
      </div>

      {/* Vista PER FORNITORE — chiamata come funzione (non <RollupView/>): così
          NON viene rimontata a ogni render e gli input non perdono il focus. */}
      {vista === 'fornitore' && !loading && fatture.length > 0 && RollupView()}

      {/* Vista CASSA IN USCITA */}
      {vista === 'cassa' && !loading && fatture.length > 0 && CassaView()}

      {/* Filtri rapidi — solo nella vista per scadenza */}
      {vista === 'scadenza' && (<>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Filtra fatture" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTRI.map(f => {
            const active = filtro === f.id
            const count = f.gruppi.reduce((s, k) => s + (gruppi[k]?.length || 0), 0)
            return (
              <button key={f.id} role="tab" aria-selected={active} onClick={() => setFiltro(f.id)} style={pill(active)}>
                {f.label}
                {fatture.length > 0 && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, fontWeight: 700,
                    color: active ? 'rgba(255,255,255,0.7)' : T.textSoft,
                    ...tnum,
                  }}>{count.toLocaleString('it-IT')}</span>
                )}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        {totaliFiltrati.n > 0 && (
          <div style={{ fontSize: 12.5, color: T.textSoft, letterSpacing: '-0.005em', ...tnum, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            <strong style={{ color: T.text }}>{totaliFiltrati.n.toLocaleString('it-IT')}</strong> {totaliFiltrati.n === 1 ? 'fattura' : 'fatture'} · <strong style={{ color: T.text }}>{fmtEuro(totaliFiltrati.tot)}</strong>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>Caricamento…</div>
      ) : fatture.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '40px 20px' : '60px 40px' }}>
          <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: R.lg, background: T.bgSubtle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.textSoft, marginBottom: 18 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: 19, color: T.text, marginBottom: 8, letterSpacing: '-0.015em' }}>Nessuna fattura</div>
          <div style={{ fontSize: 13.5, color: T.textSoft, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.55 }}>
            Importa l'export Excel di FatturaSMART o un file XML SDI per iniziare a tenere traccia delle scadenze.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...primaryBtn, cursor: 'pointer' }}>
              <Icon name="folder" size={14} /> Importa .xlsx
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) handleImportExcel(files) }} />
            </label>
            <label style={{ ...ghostBtn, cursor: 'pointer' }}>
              <Icon name="fileText" size={14} /> XML SDI
              <input type="file" accept=".xml,.p7m" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) handleImportXML(files) }} />
            </label>
          </div>
        </div>
      ) : totaliFiltrati.n === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          {filtro === 'scadute'     ? 'Nessuna fattura scaduta. Tutto in regola.' :
           filtro === 'in_scadenza' ? 'Nessuna fattura in scadenza nei prossimi 30 giorni.' :
           filtro === 'pagate'      ? 'Nessuna fattura ancora segnata come pagata.' :
                                       'Nessuna fattura per questo filtro.'}
        </div>
      ) : (
        <div>
          {gruppiVisibili.map(k => {
            const items = (gruppi[k] || []).filter(matchSearch)
            return items.length ? <Gruppo key={k} keyU={k} items={items} /> : null
          })}
        </div>
      )}
      </>)}

      {/* Barra azione bonifico SEPA (fornitori selezionati dal rollup) */}
      {selez.size > 0 && (() => {
        const selItems = fattureExt.filter(f => f.stato !== 'pagata' && f.ibanValido && f.residuo > 0 && selez.has(normNome(f.fornitore)))
        const tot = selItems.reduce((s, f) => s + Math.abs(f.residuo), 0)
        return (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: isMobile ? 64 : 0, zIndex: 900, background: T.bgCard, borderTop: `1px solid ${T.border}`, boxShadow: '0 -6px 24px rgba(15,23,42,0.14)', padding: isMobile ? '12px 14px' : '14px 28px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14 }}>
            <div style={{ fontSize: isMobile ? 13 : 13, color: T.text, fontWeight: 600, ...tnum, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selez.size} fornitor{selez.size === 1 ? 'e' : 'i'} · {selItems.length} fatture pagabili · <span style={{ color: T.brand, fontWeight: 800 }}>{fmtEuro(tot)}</span>
            </div>
            {!isMobile && <div style={{ flex: 1 }} />}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, width: isMobile ? '100%' : 'auto' }}>
              <button onClick={() => setSelez(new Set())} aria-label="Deseleziona tutti" style={{ ...ghostBtn, flex: isMobile ? 1 : '0 0 auto' }}>Deseleziona</button>
              <button onClick={() => generaBonificoSEPA(selItems)} disabled={!selItems.length}
                aria-label="Genera bonifico SEPA"
                style={{ ...primaryBtn, flex: isMobile ? 1 : '0 0 auto', opacity: selItems.length ? 1 : 0.5 }}>
                <Icon name="download" size={14} /> Genera bonifico SEPA
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
