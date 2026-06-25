import React, { useEffect, useMemo, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R } from '../lib/theme'
import { todayLocal } from '../lib/dateLocal'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import Icon from './Icon'
import { KPI, PageHeader } from '../views/_shared'

export const SK_EVENTI = 'pasticceria-eventi-v1'

// Ombra premium coerente con la Dashboard home.
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

const card = { background: T.bgCard, borderRadius: 16, padding: '18px 20px', border: `1px solid ${T.border}`, boxShadow: SHADOW_PREMIUM, marginBottom: 16 }
const lbl  = { fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }
const inp  = { width: '100%', minHeight: 44, padding: '0 12px', border: `1px solid ${T.borderStr}`, borderRadius: R.md, fontSize: 16, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', minWidth: 0 }
const btn = (bg, fg) => ({ height: 36, padding: '0 14px', background: bg, color: fg, border: 'none', borderRadius: R.md, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '-0.005em', whiteSpace: 'nowrap', transition: 'background 120ms ease, opacity 120ms ease', fontFamily: 'inherit' })

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }
function fmtEur(n) { return `${Number(n || 0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})} €` }
// € arrotondato all'unità per box KPI piccoli (più leggibile a colpo d'occhio)
function fmtEur0(n) { return `${Math.round(Number(n || 0)).toLocaleString('it-IT')} €` }
function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) }
  catch { return d }
}

// Giorni mancanti all'evento + come visualizzarlo. Serve alla produzione per
// sapere "cosa devo fare ed entro quando": più è vicino, più è urgente.
function frameTemporale(dataISO) {
  if (!dataISO) return null
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  const dev = new Date(dataISO + 'T00:00:00')
  if (isNaN(dev)) return null
  const giorni = Math.round((dev - oggi) / 86400000)
  if (giorni < 0)  return { giorni, label: `In ritardo di ${-giorni}g`, bg: '#FEE2E2', fg: '#991B1B', urgente: true }
  if (giorni === 0) return { giorni, label: 'OGGI', bg: '#6E0E1A', fg: '#FFFFFF', urgente: true }
  if (giorni === 1) return { giorni, label: 'DOMANI', bg: '#DC2626', fg: '#FFFFFF', urgente: true }
  if (giorni <= 3)  return { giorni, label: `Tra ${giorni} giorni`, bg: '#FEF3C7', fg: '#92400E', urgente: true }
  if (giorni <= 7)  return { giorni, label: `Tra ${giorni} giorni`, bg: '#FFEDD5', fg: '#9A3412', urgente: false }
  return { giorni, label: `Tra ${giorni} giorni`, bg: '#F1F5F9', fg: '#475569', urgente: false }
}

// PDF "scheda di produzione" della settimana: tutti gli eventi nei prossimi 7
// giorni con prodotti e quantità, ordinati per data, pronti da stampare.
async function exportSettimanaPDF(eventi, ricetteMap, nomeAttivita) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF()
  const RED = [110, 14, 26], DARK = [28, 10, 10], GRAY = [107, 76, 68]
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  const fine = new Date(oggi); fine.setDate(fine.getDate() + 6)
  const within = eventi
    .filter(e => { const d = new Date((e.data || '') + 'T00:00:00'); return !isNaN(d) && d >= oggi && d <= fine })
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''))

  doc.setFillColor(...DARK); doc.rect(0, 0, 210, 24, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text('SCHEDA PRODUZIONE — SETTIMANA', 14, 14)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(nomeAttivita || '', 14, 20)
  const periodo = `${oggi.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} – ${fine.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`
  doc.setFontSize(8); doc.text(periodo, 196, 14, { align: 'right' })

  let y = 34
  if (within.length === 0) {
    doc.setTextColor(...GRAY); doc.setFontSize(11)
    doc.text('Nessun evento in programma nei prossimi 7 giorni.', 14, y)
  }
  for (const ev of within) {
    const ft = frameTemporale(ev.data)
    doc.setTextColor(...DARK); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text(`${fmtDate(ev.data)} · ${ev.cliente || 'Cliente —'}`, 14, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...RED)
    doc.text(ft ? ft.label.toUpperCase() : '', 196, y, { align: 'right' })
    if (ev.note) { y += 5; doc.setTextColor(...GRAY); doc.setFontSize(9); doc.text(`Note: ${ev.note}`, 14, y) }
    const body = (ev.righe || []).map(r => [r.nome, `${Number(r.qty || 0)} pz`])
    autoTable(doc, {
      startY: y + 3, head: [['Prodotto da produrre', 'Quantità']], body: body.length ? body : [['—', '—']],
      headStyles: { fillColor: RED, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 10 }, columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 12
    if (y > 265) { doc.addPage(); y = 20 }
  }
  doc.save(`produzione_settimana_${nomeAttivita ? nomeAttivita.replace(/\s+/g, '_') + '_' : ''}${todayLocal()}.pdf`)
}

async function exportPreventivoPDF(evento, ricetteMap, ingCosti, nomeAttivita) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF()
  const RED = [192, 57, 43]
  const DARK = [28, 10, 10]
  const GRAY = [107, 76, 68]

  doc.setFillColor(...DARK); doc.rect(0, 0, 210, 24, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text('PREVENTIVO', 14, 14)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text(nomeAttivita || '', 14, 20)
  const now = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(8); doc.text(`Emesso il ${now}`, 196, 14, { align: 'right' })

  doc.setTextColor(...DARK); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text(`Cliente: ${evento.cliente || '—'}`, 14, 38)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
  doc.text(`Data evento: ${fmtDate(evento.data)}`, 14, 44)
  if (evento.note) {
    doc.text(`Note: ${evento.note}`, 14, 50)
  }

  // Tabella prodotti
  const head = [['Prodotto', 'Quantità', 'Prezzo unit.', 'Totale']]
  const body = (evento.righe || []).map(r => {
    const ric = ricetteMap[r.nome]
    const prezzo = Number(r.prezzo || ric?.reg?.prezzo || 0)
    const qty = Number(r.qty || 0)
    return [r.nome, String(qty), fmtEur(prezzo), fmtEur(qty * prezzo)]
  })
  autoTable(doc, {
    startY: 60, head, body,
    headStyles: { fillColor: RED, textColor: [255,255,255], fontStyle: 'bold' },
    bodyStyles: { fontSize: 10 },
    margin: { left: 14, right: 14 },
  })

  const totale = (evento.righe || []).reduce((s, r) => {
    const ric = ricetteMap[r.nome]
    const prezzo = Number(r.prezzo || ric?.reg?.prezzo || 0)
    return s + Number(r.qty || 0) * prezzo
  }, 0)
  const acconto = Number(evento.acconto || 0)
  const saldo = totale - acconto

  const yEnd = doc.lastAutoTable.finalY + 8
  doc.setTextColor(...DARK); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('TOTALE', 130, yEnd); doc.text(fmtEur(totale), 196, yEnd, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Acconto ricevuto', 130, yEnd + 7); doc.text(fmtEur(acconto), 196, yEnd + 7, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...RED)
  doc.text('Saldo da incassare', 130, yEnd + 15); doc.text(fmtEur(saldo), 196, yEnd + 15, { align: 'right' })

  doc.setTextColor(...GRAY); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('Preventivo valido 30 giorni dalla data di emissione. Pagamento secondo accordi.', 14, 280)

  const filename = `preventivo_${(evento.cliente || 'evento').replace(/\s+/g, '_')}_${evento.data || ''}.pdf`
  doc.save(filename)
}

export default function EventiView({ orgId, sedeId, ricettario, notify, nomeAttivita, tipoAttivita }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const [eventi, setEventi] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // id evento aperto in form
  const [draft, setDraft] = useState(null)
  const [tab, setTab] = useState('attivi') // 'attivi' | 'archivio'
  const [filterMese, setFilterMese] = useState('') // 'YYYY-MM' o ''
  const [eliminaId, setEliminaId] = useState(null) // evento in attesa di conferma elimina
  const [eliminaPin, setEliminaPin] = useState('') // testo digitato per conferma
  const [archiviaId, setArchiviaId] = useState(null) // evento in attesa di conferma archivia

  // Mappa ricette + costi per il calcolo FC
  const ricetteMap = useMemo(() => {
    const m = {}
    for (const r of Object.values(ricettario?.ricette || {})) {
      // FC totale per stampo dal campo `fc` o calcolato; per semplicità usa r.foodCost o r.fc_totale
      // Se non c'è, prova a stimare da ingredienti × prezzi.
      m[r.nome] = r
    }
    return m
  }, [ricettario])

  useEffect(() => {
    if (!orgId) return
    sload(SK_EVENTI, orgId, sedeId || null).then(v => {
      setEventi(Array.isArray(v) ? v : [])
      setLoading(false)
    })
  }, [orgId, sedeId])

  async function salvaTutti(next) {
    // SAVE FIRST: se ssave fallisce non aggiorniamo lo state, l'utente vede
    // il vecchio elenco e può riprovare senza credere che sia stato salvato.
    try {
      await ssave(SK_EVENTI, next, orgId, sedeId || null)
    } catch (e) {
      notify?.('Errore salvataggio eventi: ' + (e.message || 'rete'), false)
      return
    }
    setEventi(next)
  }

  function nuovo() {
    setDraft({
      id: uid(),
      cliente: '',
      data: todayLocal(),
      righe: [],
      acconto: 0,
      note: '',
      _new: true,
    })
    setEditing('new')
  }

  function modifica(ev) {
    setDraft({ ...ev, righe: [...(ev.righe || [])] })
    setEditing(ev.id)
  }

  function aggiungiRiga() {
    setDraft(d => ({ ...d, righe: [...(d.righe || []), { id: uid(), nome: '', qty: 1, prezzo: 0 }] }))
  }
  function aggiornaRiga(id, patch) {
    setDraft(d => ({ ...d, righe: d.righe.map(r => r.id === id ? { ...r, ...patch } : r) }))
  }
  function rimuoviRiga(id) {
    setDraft(d => ({ ...d, righe: d.righe.filter(r => r.id !== id) }))
  }

  async function salva() {
    if (!draft.cliente.trim()) return notify?.('Cliente obbligatorio', false)
    if (!draft.data) return notify?.('Data obbligatoria', false)
    const norm = {
      ...draft,
      _new: undefined,
      righe: (draft.righe || []).filter(r => r.nome && Number(r.qty) > 0)
        .map(r => ({ ...r, qty: Number(r.qty), prezzo: Number(r.prezzo) || 0 })),
      acconto: Number(draft.acconto) || 0,
      updated_at: new Date().toISOString(),
    }
    const next = draft._new
      ? [norm, ...eventi]
      : eventi.map(e => e.id === draft.id ? norm : e)
    await salvaTutti(next)
    setEditing(null); setDraft(null)
    notify?.('Evento salvato')
  }

  async function archivia(id) {
    const next = eventi.map(e => e.id === id ? { ...e, archiviato: true, archiviato_at: new Date().toISOString() } : e)
    await salvaTutti(next)
    setArchiviaId(null)
    notify?.('Evento archiviato')
  }

  async function ripristina(id) {
    const next = eventi.map(e => e.id === id ? { ...e, archiviato: false, archiviato_at: undefined } : e)
    await salvaTutti(next)
    // Chiudi eventuali box di conferma aperti su questo evento (elimina/archivia).
    if (eliminaId === id) { setEliminaId(null); setEliminaPin('') }
    if (archiviaId === id) setArchiviaId(null)
    notify?.('Evento ripristinato')
  }

  async function confermaEliminazione() {
    if (!eliminaId) return
    if (eliminaPin !== 'ELIMINA') {
      notify?.('Scrivi ELIMINA in maiuscolo per confermare', false)
      return
    }
    await salvaTutti(eventi.filter(e => e.id !== eliminaId))
    setEliminaId(null); setEliminaPin('')
    notify?.('Evento eliminato definitivamente')
  }

  function calcolaTotali(ev) {
    let totRicavo = 0, totFC = 0
    for (const r of (ev.righe || [])) {
      const ric = ricetteMap[r.nome]
      const prezzo = Number(r.prezzo || ric?.reg?.prezzo || 0)
      const qty = Number(r.qty || 0)
      const fcStampo = Number(ric?.foodCost || ric?.fc || 0)
      totRicavo += qty * prezzo
      totFC += qty * fcStampo
    }
    return { totRicavo, totFC, margine: totRicavo - totFC, margPct: totRicavo > 0 ? ((totRicavo - totFC) / totRicavo * 100) : 0 }
  }

  if (loading) return <div style={{ fontSize: 13, color: T.textSoft, padding: 24 }}>Caricamento…</div>

  const ricetteList = Object.values(ricettario?.ricette || {}).map(r => r.nome).sort()

  // Split attivi vs archivio: un evento è in archivio se è stato archiviato manualmente
  // OPPURE se ha data passata. In caso di archiviazione manuale, è in archivio anche se la
  // data è ancora futura (es. evento annullato).
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
  function isArchiviato(ev) {
    if (ev.archiviato) return true
    if (ev.data && new Date(ev.data + 'T23:59:59') < oggi) return true
    return false
  }
  const eventiAttivi = eventi.filter(ev => !isArchiviato(ev))
    .sort((a, b) => (a.data || '').localeCompare(b.data || '')) // più imminenti in alto
  const eventiPassati = eventi.filter(isArchiviato)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))

  // Mesi disponibili nell'archivio (per il filtro)
  const mesiDisponibili = [...new Set(eventiPassati.map(e => (e.data || '').slice(0, 7)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a))

  const eventiArchivioFiltrati = filterMese
    ? eventiPassati.filter(e => (e.data || '').startsWith(filterMese))
    : eventiPassati

  // KPI aggregati su quanto visualizzato in archivio
  const kpiArchivio = eventiArchivioFiltrati.reduce((acc, ev) => {
    const t = calcolaTotali(ev)
    acc.ricavi += t.totRicavo
    acc.fc    += t.totFC
    acc.margine += t.margine
    acc.eventi += 1
    return acc
  }, { ricavi: 0, fc: 0, margine: 0, eventi: 0 })
  kpiArchivio.fcPct = kpiArchivio.ricavi > 0 ? (kpiArchivio.fc / kpiArchivio.ricavi * 100) : 0
  kpiArchivio.margPct = kpiArchivio.ricavi > 0 ? (kpiArchivio.margine / kpiArchivio.ricavi * 100) : 0

  function fmtMese(yyyymm) {
    if (!yyyymm) return ''
    try {
      const d = new Date(yyyymm + '-01T12:00:00')
      return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    } catch { return yyyymm }
  }

  const eventiCorrentiTab = tab === 'archivio' ? eventiArchivioFiltrati : eventiAttivi

  return (
    <div style={{ maxWidth: 1200, padding: isMobile ? 8 : 0, paddingBottom: isMobile ? 96 : 24, boxSizing: 'border-box', width: '100%' }}>
      {/* Tab attivi / archivio */}
      {editing == null && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: `1px solid ${T.border}` }}>
          {[['attivi', `Attivi · ${eventiAttivi.length}`], ['archivio', `Archivio · ${eventiPassati.length}`]].map(([id, lblTab]) => (
            <button key={id} onClick={() => { setTab(id); setFilterMese('') }}
              style={{
                padding: '10px 16px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13,
                fontWeight: tab === id ? 600 : 500,
                color: tab === id ? T.text : T.textSoft,
                borderBottom: tab === id ? `2px solid ${T.brand}` : '2px solid transparent',
                marginBottom: -1,
              }}>
              {lblTab}
            </button>
          ))}
        </div>
      )}

      {editing == null && (
        <PageHeader
          subtitle={tab === 'archivio'
            ? `Eventi passati — ${eventiArchivioFiltrati.length} evento/i${filterMese ? ` · ${fmtMese(filterMese)}` : ''}`
            : `Preventivi e prenotazioni in arrivo — ${eventiAttivi.length} evento/i`}
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {tab === 'attivi' && (
                <>
                  {eventiAttivi.length > 0 && (
                    <button onClick={() => exportSettimanaPDF(eventiAttivi, ricetteMap, nomeAttivita)}
                      title="Scarica la scheda di produzione dei prossimi 7 giorni (stampabile)"
                      style={{ ...btn(T.blueLight, '#1E40AF'), border: `1px solid #BFDBFE` }}><Icon name="fileText" size={14} /> PDF settimana</button>
                  )}
                  <button onClick={nuovo} style={btn(T.brand, '#FFF')}>+ Nuovo evento</button>
                </>
              )}
              {tab === 'archivio' && mesiDisponibili.length > 0 && (
                <select value={filterMese} onChange={e => setFilterMese(e.target.value)}
                  style={{ height: 36, padding: '0 12px', border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 12, background: T.bgCard, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="">Tutti i mesi</option>
                  {mesiDisponibili.map(m => <option key={m} value={m}>{fmtMese(m)}</option>)}
                </select>
              )}
            </div>
          }
        />
      )}

      {/* KPI archivio */}
      {editing == null && tab === 'archivio' && eventiArchivioFiltrati.length > 0 && (() => {
        const margC = kpiArchivio.margPct >= 50 ? T.green : kpiArchivio.margPct >= 30 ? T.amber : T.brand
        return (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: 20 }}>
            <KPI label="Eventi" value={kpiArchivio.eventi} icon={<Icon name="calendar" size={18} />} color={T.text} />
            <KPI label="Ricavi" value={fmtEur(kpiArchivio.ricavi)} icon={<Icon name="euro" size={18} />} color={T.green} />
            <KPI label="Food cost" value={fmtEur(kpiArchivio.fc)} sub={`${kpiArchivio.fcPct.toFixed(1)}% sui ricavi`} icon={<Icon name="receipt" size={18} />} color={T.amber} />
            <KPI label="Margine" value={fmtEur(kpiArchivio.margine)} sub={`${kpiArchivio.margPct.toFixed(1)}% sui ricavi`} icon={<Icon name="trendUp" size={18} />} color={margC} />
          </div>
        )
      })()}

      {editing != null && draft && (
        <div style={{ ...card, border: `1px solid ${T.brand}`, background: '#FEF7F5', boxShadow: '0 1px 2px rgba(110,14,26,0.05), 0 10px 28px rgba(110,14,26,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(110,14,26,0.10)', color: T.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{draft._new ? <Icon name="plus" size={16} /> : <Icon name="edit" size={16} />}</span>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text, letterSpacing: '-0.01em' }}>
              {draft._new ? 'Nuovo evento' : 'Modifica evento'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Cliente *</label>
              <input value={draft.cliente} onChange={e => setDraft(d => ({ ...d, cliente: e.target.value }))}
                placeholder="Nome cliente o ragione sociale" style={inp} />
            </div>
            <div>
              <label style={lbl}>Data evento *</label>
              <input type="date" value={draft.data} onChange={e => setDraft(d => ({ ...d, data: e.target.value }))} style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Note</label>
            <input value={draft.note || ''} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              placeholder="Indicazioni, allergie, orari…" style={inp} />
          </div>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Prodotti dell'evento</div>
            <button onClick={aggiungiRiga} style={{ ...btn(T.text, '#FFF'), minHeight: 40, whiteSpace: 'nowrap' }}>+ Aggiungi riga</button>
          </div>
          <div style={{ fontSize: 12.5, color: T.textMid, marginBottom: 12, lineHeight: 1.55 }}>
            Per ogni prodotto specifica <b>quanti pezzi produrre</b> e <b>a che prezzo li vendi</b> al cliente.
            <br/>Il margine si calcola automaticamente in base al food cost della ricetta.
          </div>

          {/* Intestazioni colonna — solo desktop */}
          {!isMobile && (draft.righe || []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.9fr 1.1fr 0.6fr', gap: 8, marginBottom: 4, padding: '0 4px' }}>
              {[
                ['Prodotto', `Scegli dal ${LEX.Ricettario.toLowerCase()}`],
                ['Quantità da produrre', 'N° di pezzi/porzioni'],
                ['Prezzo di vendita unitario', 'Prezzo a cui vendi al cliente'],
                ['Food cost', 'Costo ingredienti'],
              ].map(([h, tip]) => (
                <div key={h} title={tip} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.textSoft, cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{h}</div>
              ))}
            </div>
          )}

          {(draft.righe || []).length === 0 && (
            <div style={{ fontSize: 12, color: T.textSoft, padding: '12px 0', fontStyle: 'italic' }}>
              Nessun prodotto. Aggiungi almeno una riga.
            </div>
          )}
          {(draft.righe || []).map(r => {
            const ric = ricetteMap[r.nome]
            const fcStampo = Number(ric?.foodCost || ric?.fc || 0)
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2.4fr 0.9fr 1.1fr 0.6fr', gap: 8, alignItems: isMobile ? 'stretch' : 'center', marginBottom: isMobile ? 16 : 8, padding: isMobile ? 12 : 0, background: isMobile ? '#F8FAFC' : 'transparent', borderRadius: isMobile ? 10 : 0 }}>
                <div>
                  {isMobile && <label style={{ ...lbl, marginBottom: 4 }}>Prodotto</label>}
                  <input list="ricette-list" value={r.nome}
                    onChange={e => {
                      const nome = e.target.value
                      const found = ricetteMap[nome]
                      aggiornaRiga(r.id, { nome, prezzo: r.prezzo || Number(found?.reg?.prezzo || 0) })
                    }}
                    onKeyDown={onEnterAutoComplete(
                      ricetteList,
                      r.nome,
                      (v) => {
                        const found = ricetteMap[v]
                        aggiornaRiga(r.id, { nome: v, prezzo: r.prezzo || Number(found?.reg?.prezzo || 0) })
                      }
                    )}
                    placeholder="Es. Torta della nonna" style={inp} />
                </div>
                <div>
                  {isMobile && (
                    <label style={{ ...lbl, marginBottom: 4 }}>
                      Quantità da produrre
                      <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>N° pezzi/porzioni</div>
                    </label>
                  )}
                  <input type="number" min="0" step="1" value={r.qty}
                    onChange={e => aggiornaRiga(r.id, { qty: e.target.value })}
                    title="Numero di pezzi/porzioni da preparare per l'evento"
                    placeholder="Es. 12" style={inp} />
                </div>
                <div>
                  {isMobile && (
                    <label style={{ ...lbl, marginBottom: 4 }}>
                      Prezzo di vendita unitario
                      <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>Prezzo al cliente per pezzo</div>
                    </label>
                  )}
                  <input type="number" min="0" step="0.01" value={r.prezzo}
                    onChange={e => aggiornaRiga(r.id, { prezzo: e.target.value })}
                    title="Prezzo a cui venderai ogni pezzo al cliente (€)"
                    placeholder="Es. 4.50" style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isMobile && <span style={{ fontSize: 11, color: T.textMid, fontWeight: 600 }}>FC tot</span>}
                  <div style={{ fontSize: 11, color: T.textMid, flex: 1, ...TNUM }} title="Costo ingredienti totale (quantità × food cost ricetta)">{fmtEur(fcStampo * Number(r.qty || 0))}</div>
                  <button onClick={() => rimuoviRiga(r.id)} aria-label="Rimuovi riga"
                    style={{ padding: '6px 10px', background: T.brandLight, color: T.brand, border: `1px solid ${T.brandSoft}`, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              </div>
            )
          })}
          <datalist id="ricette-list">
            {ricetteList.map(n => <option key={n} value={n} />)}
          </datalist>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div>
              <label style={lbl}>Acconto ricevuto €</label>
              <input type="number" min="0" step="0.01" value={draft.acconto}
                onChange={e => setDraft(d => ({ ...d, acconto: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* Anteprima totali */}
          {(draft.righe || []).length > 0 && (() => {
            const t = calcolaTotali(draft)
            const saldo = t.totRicavo - Number(draft.acconto || 0)
            return (
              <div style={{ marginTop: 18, padding: 16, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, boxShadow: T.bgSubtle ? 'inset 0 1px 2px rgba(15,23,42,0.03)' : undefined }}>
                <div><div style={lbl}>Totale</div><div style={{ fontSize: 18, fontWeight: 800, color: T.text, ...TNUM }}>{fmtEur(t.totRicavo)}</div></div>
                <div><div style={lbl}>Food cost</div><div style={{ fontSize: 18, fontWeight: 800, color: T.amber, ...TNUM }}>{fmtEur(t.totFC)}</div></div>
                <div><div style={lbl}>Margine</div><div style={{ fontSize: 18, fontWeight: 800, color: t.margPct >= 50 ? T.green : t.margPct >= 30 ? T.amber : T.brand, ...TNUM }}>{fmtEur(t.margine)} ({t.margPct.toFixed(0)}%)</div></div>
                <div><div style={lbl}>Saldo</div><div style={{ fontSize: 18, fontWeight: 800, color: T.brand, ...TNUM }}>{fmtEur(saldo)}</div></div>
              </div>
            )
          })()}

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button onClick={salva} style={btn(T.brand, '#FFF')}>Salva evento</button>
            <button onClick={() => { setEditing(null); setDraft(null) }}
              style={{ ...btn('transparent', T.textMid), border: `1px solid ${T.border}` }}>Annulla</button>
          </div>
        </div>
      )}

      {editing == null && eventiCorrentiTab.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textSoft }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Icon name="calendar" size={48} color={T.textSoft} /></div>
          <div style={{ fontSize: 14, marginBottom: 6, color: T.text, fontWeight: 600 }}>
            {tab === 'archivio' ? 'Nessun evento passato in archivio.' : 'Nessun evento in programma.'}
          </div>
          <div style={{ fontSize: 12 }}>
            {tab === 'archivio'
              ? 'Gli eventi con data passata appariranno qui.'
              : 'Crea il primo preventivo per un catering o una prenotazione.'}
          </div>
        </div>
      )}

      {editing == null && eventiCorrentiTab.map(ev => {
        const t = calcolaTotali(ev)
        const saldo = t.totRicavo - Number(ev.acconto || 0)
        const isArch = isArchiviato(ev)
        const ft = frameTemporale(ev.data)
        const inArchivioTab = tab === 'archivio'
        const isInDeleteConfirm = eliminaId === ev.id
        const isInArchiveConfirm = archiviaId === ev.id
        const padCard = isMobile ? 16 : isTablet ? 20 : 22
        // Colore margine: verde >=50, ambra 30-50, brand <30
        const margColore = t.margPct >= 50 ? T.green : t.margPct >= 30 ? T.amber : T.brand
        // Card evento riprogettata: header titolo + badge stato a destra,
        // riga calendario + count prodotti, note italic, 3 KPI compatti
        // (Ricavo/Margine/Saldo) con minHeight uniformi così label e value
        // restano incolonnati, infine bottoni in 2 righe: azioni primarie
        // affiancate, distruttive separate sotto.
        const kpiBox = {
          padding: '10px 12px',
          background: T.bgSubtle || '#F8FAFC',
          border: `1px solid ${T.borderSoft || T.border}`,
          borderRadius: 10,
          display: 'flex', flexDirection: 'column',
        }
        const kpiLabel = {
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: T.textSoft,
          minHeight: 14, lineHeight: 1.2,
        }
        const kpiValue = {
          fontSize: isMobile ? 16 : 17, fontWeight: 800, letterSpacing: '-0.015em',
          marginTop: 4, lineHeight: 1.1, minHeight: isMobile ? 19 : 20,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          ...TNUM,
        }
        const btnAction = (bgCol, fgCol, borderCol) => ({
          flex: 1, padding: '11px 14px', minHeight: 44,
          background: bgCol, color: fgCol,
          border: borderCol ? `1px solid ${borderCol}` : 'none',
          borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          boxSizing: 'border-box', whiteSpace: 'nowrap',
          fontFamily: 'inherit',
        })
        return (
          <div key={ev.id} className={isArch ? undefined : 'fos-tile'} style={{
            background: T.bgCard, borderRadius: 16,
            padding: padCard,
            border: `1px solid ${T.border}`, boxShadow: SHADOW_PREMIUM,
            marginBottom: 14, opacity: isArch ? 0.82 : 1, boxSizing: 'border-box',
          }}>
            {/* Header: titolo evento + badge stato a destra */}
            <div style={{
              display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', gap: 10, marginBottom: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: isMobile ? 17 : 18, fontWeight: 800, color: T.text,
                  letterSpacing: '-0.015em', lineHeight: 1.25,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={ev.cliente || 'Cliente'}>
                  {ev.cliente || 'Cliente —'}
                </div>
              </div>
              {!isArch && ft && (
                <span title={`Evento ${fmtDate(ev.data)} — pianifica la produzione di conseguenza`}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: '4px 10px',
                    borderRadius: 999, background: ft.bg, color: ft.fg,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                  {ft.urgente ? <Icon name="clock" size={11} /> : null}{ft.label}
                </span>
              )}
              {isArch && (
                <span style={{
                  fontSize: 10, background: T.bgSubtle, color: T.textSoft,
                  padding: '4px 10px', borderRadius: 999, fontWeight: 700,
                  letterSpacing: '0.06em', flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  {ev.archiviato ? 'ARCHIVIATO' : 'PASSATO'}
                </span>
              )}
            </div>

            {/* Riga data + count prodotti */}
            <div style={{
              fontSize: 12.5, color: T.textMid,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginBottom: ev.note ? 6 : 12,
            }}>
              <Icon name="calendar" size={13} color={T.textMid} />
              <span style={{ fontWeight: 600 }}>{fmtDate(ev.data)}</span>
              <span style={{ color: T.textSoft }}>·</span>
              <span>{(ev.righe || []).length} prodotti</span>
            </div>

            {/* Note evento */}
            {ev.note && (
              <div style={{
                fontSize: 12, color: T.textSoft, marginBottom: 12,
                fontStyle: 'italic', lineHeight: 1.5,
              }}>
                {ev.note}
              </div>
            )}

            {/* KPI compatti orizzontali: Ricavo / Margine / Saldo
                Grid 3 colonne uguali (1fr 1fr 1fr) con minHeight uniformi su
                label/value per allineamento verticale tra le 3 box. */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8, marginBottom: 14,
            }}>
              <div style={kpiBox}>
                <div style={kpiLabel}>Ricavo</div>
                <div style={{ ...kpiValue, color: T.text }} title={fmtEur(t.totRicavo)}>
                  {fmtEur0(t.totRicavo)}
                </div>
              </div>
              <div style={kpiBox}>
                <div style={kpiLabel}>Margine</div>
                <div style={{ ...kpiValue, color: margColore }} title={`${fmtEur(t.margine)} (${t.margPct.toFixed(1)}%)`}>
                  {t.margPct.toFixed(0)}%
                </div>
              </div>
              <div style={kpiBox}>
                <div style={kpiLabel}>Saldo</div>
                <div style={{ ...kpiValue, color: saldo > 0 ? T.brand : T.green }} title={fmtEur(saldo)}>
                  {fmtEur0(saldo)}
                </div>
              </div>
            </div>

            {/* Bottoni azione — riga 1: Modifica + Esporta PDF (flex 1) */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => modifica(ev)}
                style={btnAction(T.bgSubtle || '#F8FAFC', T.textMid, T.border)}>
                <Icon name="edit" size={14} color={T.textMid} />
                Modifica
              </button>
              <button onClick={() => exportPreventivoPDF(ev, ricetteMap, null, nomeAttivita)}
                style={btnAction('#EFF6FF', '#1E40AF', '#BFDBFE')}>
                <Icon name="fileText" size={14} color="#1E40AF" />
                Esporta PDF
              </button>
            </div>

            {/* Riga 2 azioni secondarie: Archivia (attivi) o Ripristina (archivio) */}
            {!inArchivioTab && (
              <button onClick={() => { setArchiviaId(ev.id); setEliminaId(null) }}
                title="Sposta in archivio (riportabile in qualsiasi momento)"
                style={{
                  ...btnAction('#FFFBEB', '#92400E', T.amber),
                  width: '100%', marginTop: 8,
                }}>
                <Icon name="package" size={14} color="#92400E" />
                Archivia
              </button>
            )}
            {inArchivioTab && ev.archiviato && (
              <button onClick={() => ripristina(ev.id)}
                title="Riporta l'evento tra gli attivi"
                style={{
                  ...btnAction(T.greenLight, '#065F46', T.green),
                  width: '100%', marginTop: 8,
                }}>
                <Icon name="refresh" size={14} color="#065F46" />
                Ripristina
              </button>
            )}

            {/* Riga 3 (solo archivio): Elimina definitivamente — full-width, rosso, distanziato */}
            {inArchivioTab && (
              <button onClick={() => { setEliminaId(ev.id); setEliminaPin('') }}
                style={{
                  ...btnAction(T.brandLight, T.brand, T.brandSoft),
                  width: '100%', marginTop: 8,
                }}>
                <Icon name="trash" size={14} color={T.brand} />
                Elimina definitivamente
              </button>
            )}

            {isInArchiveConfirm && (
              <div style={{ marginTop: 12, padding: '14px 16px', background: '#FFFBEB', border: `1px solid ${T.amber}`, borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="package" size={14} /> Archiviare "{ev.cliente || 'evento'}"?
                </div>
                <div style={{ fontSize: 11, color: T.textMid, marginBottom: 10, lineHeight: 1.5 }}>
                  L'evento sparirà dagli attivi e finirà in archivio. Nessun dato viene perso: potrai ripristinarlo in qualsiasi momento dalla scheda Archivio.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => archivia(ev.id)}
                    style={{ padding: '8px 16px', background: T.amber, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    Sì, archivia
                  </button>
                  <button onClick={() => setArchiviaId(null)}
                    style={{ padding: '8px 12px', background: T.bgCard, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {isInDeleteConfirm && (
              <div style={{ marginTop: 12, padding: '14px 16px', background: T.brandLight, border: `1px solid ${T.brandSoft}`, borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.brand, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="warning" size={14} /> Eliminazione definitiva di "{ev.cliente || 'evento'}"
                </div>
                <div style={{ fontSize: 11, color: T.textMid, marginBottom: 8, lineHeight: 1.5 }}>
                  Questa azione è irreversibile: i dati dell'evento e il preventivo verranno rimossi per sempre.
                  Per confermare scrivi <b style={{ color: T.brand, letterSpacing: '0.06em' }}>ELIMINA</b> qui sotto.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={eliminaPin}
                    onChange={e => setEliminaPin(e.target.value)}
                    placeholder="ELIMINA"
                    style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${eliminaPin === 'ELIMINA' ? T.brand : T.brandSoft}`, fontSize: 13, fontWeight: 700, color: T.brand, letterSpacing: '0.08em', background: T.bgCard }} />
                  <button onClick={confermaEliminazione} disabled={eliminaPin !== 'ELIMINA'}
                    style={{ padding: '8px 16px', background: eliminaPin === 'ELIMINA' ? T.brand : '#E5E7EB', color: eliminaPin === 'ELIMINA' ? '#FFF' : '#9CA3AF', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: eliminaPin === 'ELIMINA' ? 'pointer' : 'not-allowed' }}>
                    Elimina
                  </button>
                  <button onClick={() => { setEliminaId(null); setEliminaPin('') }}
                    style={{ padding: '8px 12px', background: T.bgCard, color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Annulla
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
