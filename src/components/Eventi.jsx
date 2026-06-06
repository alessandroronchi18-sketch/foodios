import React, { useEffect, useMemo, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R } from '../lib/theme'
import { todayLocal } from '../lib/dateLocal'
import { onEnterAutoComplete } from '../lib/autocomplete'

export const SK_EVENTI = 'pasticceria-eventi-v1'

const card = { background: T.bgCard, borderRadius: R.xl, padding: '18px 20px', border: `1px solid ${T.border}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 16 }
const lbl  = { fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }
const inp  = { width: '100%', height: 40, padding: '0 12px', border: `1px solid ${T.borderStr}`, borderRadius: R.md, fontSize: 13, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const btn = (bg, fg) => ({ height: 36, padding: '0 14px', background: bg, color: fg, border: 'none', borderRadius: R.md, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '-0.005em', whiteSpace: 'nowrap', transition: 'background 120ms ease, opacity 120ms ease', fontFamily: 'inherit' })

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }
function fmtEur(n) { return `€ ${Number(n || 0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}` }
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

export default function EventiView({ orgId, sedeId, ricettario, notify, nomeAttivita }) {
  const isMobile = useIsMobile()
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
      notify?.('⚠ Errore salvataggio eventi: ' + (e.message || 'rete'), false)
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
    notify?.('✓ Evento salvato')
  }

  async function archivia(id) {
    const next = eventi.map(e => e.id === id ? { ...e, archiviato: true, archiviato_at: new Date().toISOString() } : e)
    await salvaTutti(next)
    setArchiviaId(null)
    notify?.('✓ Evento archiviato')
  }

  async function ripristina(id) {
    const next = eventi.map(e => e.id === id ? { ...e, archiviato: false, archiviato_at: undefined } : e)
    await salvaTutti(next)
    // Chiudi eventuali box di conferma aperti su questo evento (elimina/archivia).
    if (eliminaId === id) { setEliminaId(null); setEliminaPin('') }
    if (archiviaId === id) setArchiviaId(null)
    notify?.('✓ Evento ripristinato')
  }

  async function confermaEliminazione() {
    if (!eliminaId) return
    if (eliminaPin !== 'ELIMINA') {
      notify?.('⚠ Scrivi ELIMINA in maiuscolo per confermare', false)
      return
    }
    await salvaTutti(eventi.filter(e => e.id !== eliminaId))
    setEliminaId(null); setEliminaPin('')
    notify?.('✓ Evento eliminato definitivamente')
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

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento…</div>

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
    <div style={{ maxWidth: 1200, padding: isMobile ? 8 : 0 }}>
      {/* Tab attivi / archivio */}
      {editing == null && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #E2E8F0' }}>
          {[['attivi', `Attivi · ${eventiAttivi.length}`], ['archivio', `Archivio · ${eventiPassati.length}`]].map(([id, lblTab]) => (
            <button key={id} onClick={() => { setTab(id); setFilterMese('') }}
              style={{
                padding: '10px 16px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13,
                fontWeight: tab === id ? 700 : 500,
                color: tab === id ? '#0F172A' : '#64748B',
                borderBottom: tab === id ? '2px solid #6E0E1A' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {lblTab}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          {tab === 'archivio'
            ? `Eventi passati — ${eventiArchivioFiltrati.length} evento/i${filterMese ? ` · ${fmtMese(filterMese)}` : ''}`
            : `Preventivi e prenotazioni in arrivo — ${eventiAttivi.length} evento/i`}
        </div>
        {editing == null && tab === 'attivi' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {eventiAttivi.length > 0 && (
              <button onClick={() => exportSettimanaPDF(eventiAttivi, ricetteMap, nomeAttivita)}
                title="Scarica la scheda di produzione dei prossimi 7 giorni (stampabile)"
                style={{ ...btn('#EFF6FF', '#1E40AF'), border: '1px solid #BFDBFE' }}>📄 PDF settimana</button>
            )}
            <button onClick={nuovo} style={btn('#6E0E1A', '#FFF')}>+ Nuovo evento</button>
          </div>
        )}
        {editing == null && tab === 'archivio' && mesiDisponibili.length > 0 && (
          <select value={filterMese} onChange={e => setFilterMese(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, background: '#FFF', color: '#0F172A', cursor: 'pointer' }}>
            <option value="">Tutti i mesi</option>
            {mesiDisponibili.map(m => <option key={m} value={m}>{fmtMese(m)}</option>)}
          </select>
        )}
      </div>

      {/* KPI archivio */}
      {editing == null && tab === 'archivio' && eventiArchivioFiltrati.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ ...card, marginBottom: 0, padding: '14px 16px' }}>
            <div style={lbl}>Eventi</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{kpiArchivio.eventi}</div>
          </div>
          <div style={{ ...card, marginBottom: 0, padding: '14px 16px' }}>
            <div style={lbl}>Ricavi</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{fmtEur(kpiArchivio.ricavi)}</div>
          </div>
          <div style={{ ...card, marginBottom: 0, padding: '14px 16px' }}>
            <div style={lbl}>Food cost</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#92400E' }}>{fmtEur(kpiArchivio.fc)}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginTop: 2 }}>{kpiArchivio.fcPct.toFixed(1)}%</div>
          </div>
          <div style={{ ...card, marginBottom: 0, padding: '14px 16px' }}>
            <div style={lbl}>Margine</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: kpiArchivio.margPct >= 50 ? '#10B981' : kpiArchivio.margPct >= 30 ? '#F59E0B' : '#6E0E1A' }}>{fmtEur(kpiArchivio.margine)}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginTop: 2 }}>{kpiArchivio.margPct.toFixed(1)}%</div>
          </div>
        </div>
      )}

      {editing != null && draft && (
        <div style={{ ...card, border: '2px solid #6E0E1A', background: '#FEF7F5' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 14 }}>
            {draft._new ? 'Nuovo evento' : 'Modifica evento'}
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

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ ...lbl, marginBottom: 0 }}>Prodotti dell'evento</div>
            <button onClick={aggiungiRiga} style={btn('#0F172A', '#FFF')}>+ Aggiungi riga</button>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.45 }}>
            Per ogni prodotto specifica <b>quanti pezzi produrre</b> e <b>a che prezzo li vendi</b> al cliente.
            Il margine si calcola automaticamente in base al food cost della ricetta.
          </div>

          {/* Intestazioni colonna — solo desktop */}
          {!isMobile && (draft.righe || []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.9fr 1.1fr 0.6fr', gap: 8, marginBottom: 4, padding: '0 4px' }}>
              {[
                ['Prodotto', 'Scegli dal ricettario'],
                ['Quantità da produrre', 'N° di pezzi/porzioni'],
                ['Prezzo di vendita unitario', 'Prezzo a cui vendi al cliente'],
                ['Food cost', 'Costo ingredienti'],
              ].map(([h, tip]) => (
                <div key={h} title={tip} style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{h}</div>
              ))}
            </div>
          )}

          {(draft.righe || []).length === 0 && (
            <div style={{ fontSize: 12, color: '#94A3B8', padding: '12px 0', fontStyle: 'italic' }}>
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
                      <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>N° pezzi/porzioni</div>
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
                      <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>Prezzo al cliente per pezzo</div>
                    </label>
                  )}
                  <input type="number" min="0" step="0.01" value={r.prezzo}
                    onChange={e => aggiornaRiga(r.id, { prezzo: e.target.value })}
                    title="Prezzo a cui venderai ogni pezzo al cliente (€)"
                    placeholder="Es. 4.50" style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isMobile && <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>FC tot</span>}
                  <div style={{ fontSize: 11, color: '#64748B', flex: 1 }} title="Costo ingredienti totale (quantità × food cost ricetta)">{fmtEur(fcStampo * Number(r.qty || 0))}</div>
                  <button onClick={() => rimuoviRiga(r.id)} aria-label="Rimuovi riga"
                    style={{ padding: '6px 10px', background: '#FFF5F5', color: '#6E0E1A', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
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
              <div style={{ marginTop: 18, padding: 14, background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 10, display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
                <div><div style={lbl}>Totale</div><div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{fmtEur(t.totRicavo)}</div></div>
                <div><div style={lbl}>Food cost</div><div style={{ fontSize: 18, fontWeight: 800, color: '#92400E' }}>{fmtEur(t.totFC)}</div></div>
                <div><div style={lbl}>Margine</div><div style={{ fontSize: 18, fontWeight: 800, color: t.margPct >= 50 ? '#10B981' : t.margPct >= 30 ? '#F59E0B' : '#6E0E1A' }}>{fmtEur(t.margine)} ({t.margPct.toFixed(0)}%)</div></div>
                <div><div style={lbl}>Saldo</div><div style={{ fontSize: 18, fontWeight: 800, color: '#6E0E1A' }}>{fmtEur(saldo)}</div></div>
              </div>
            )
          })()}

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button onClick={salva} style={btn('#6E0E1A', '#FFF')}>Salva evento</button>
            <button onClick={() => { setEditing(null); setDraft(null) }}
              style={{ ...btn('transparent', '#64748B'), border: '1px solid #E2E8F0' }}>Annulla</button>
          </div>
        </div>
      )}

      {editing == null && eventiCorrentiTab.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
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
        return (
          <div key={ev.id} style={{ ...card, opacity: isArch ? 0.75 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{ev.cliente || 'Cliente —'}</span>
                  {!isArch && ft && (
                    <span title={`Evento ${fmtDate(ev.data)} — pianifica la produzione di conseguenza`}
                      style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: ft.bg, color: ft.fg, letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {ft.urgente ? '⏰ ' : ''}{ft.label}
                    </span>
                  )}
                  {isArch && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{ev.archiviato ? 'ARCHIVIATO' : 'PASSATO'}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  📅 {fmtDate(ev.data)} · {(ev.righe || []).length} prodotti
                </div>
                {ev.note && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' }}>{ev.note}</div>}
              </div>
              <div style={{ textAlign: 'right', minWidth: 130, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A' }}>{fmtEur(t.totRicavo)}</div>
                <div style={{ fontSize: 11, color: t.margPct >= 50 ? '#10B981' : t.margPct >= 30 ? '#F59E0B' : '#6E0E1A', fontWeight: 700 }}>
                  margine {t.margPct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  Saldo {fmtEur(saldo)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => modifica(ev)}
                style={{ padding: '6px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#64748B', cursor: 'pointer' }}>
                Modifica
              </button>
              <button onClick={() => exportPreventivoPDF(ev, ricetteMap, null, nomeAttivita)}
                style={{ padding: '6px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#1E40AF', cursor: 'pointer' }}>
                📄 Esporta PDF
              </button>
              {!inArchivioTab && (
                <button onClick={() => { setArchiviaId(ev.id); setEliminaId(null) }}
                  title="Sposta in archivio (riportabile in qualsiasi momento)"
                  style={{ padding: '6px 12px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#92400E', cursor: 'pointer' }}>
                  📦 Archivia
                </button>
              )}
              {inArchivioTab && ev.archiviato && (
                <button onClick={() => ripristina(ev.id)}
                  title="Riporta l'evento tra gli attivi"
                  style={{ padding: '6px 12px', background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#065F46', cursor: 'pointer' }}>
                  ↩ Ripristina
                </button>
              )}
              {inArchivioTab && (
                <button onClick={() => { setEliminaId(ev.id); setEliminaPin('') }}
                  style={{ padding: '6px 12px', background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#6E0E1A', cursor: 'pointer' }}>
                  🗑 Elimina definitivamente
                </button>
              )}
            </div>

            {isInArchiveConfirm && (
              <div style={{ marginTop: 12, padding: '14px 16px', background: '#FFFBEB', border: '2px solid #F59E0B', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>
                  📦 Archiviare "{ev.cliente || 'evento'}"?
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
                  L'evento sparirà dagli attivi e finirà in archivio. Nessun dato viene perso: potrai ripristinarlo in qualsiasi momento dalla scheda Archivio.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => archivia(ev.id)}
                    style={{ padding: '8px 16px', background: '#F59E0B', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    Sì, archivia
                  </button>
                  <button onClick={() => setArchiviaId(null)}
                    style={{ padding: '8px 12px', background: '#FFF', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {isInDeleteConfirm && (
              <div style={{ marginTop: 12, padding: '14px 16px', background: '#FFF5F5', border: '2px solid #FCA5A5', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#6E0E1A', marginBottom: 6 }}>
                  ⚠️ Eliminazione definitiva di "{ev.cliente || 'evento'}"
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, lineHeight: 1.5 }}>
                  Questa azione è irreversibile: i dati dell'evento e il preventivo verranno rimossi per sempre.
                  Per confermare scrivi <b style={{ color: '#6E0E1A', letterSpacing: '0.06em' }}>ELIMINA</b> qui sotto.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={eliminaPin}
                    onChange={e => setEliminaPin(e.target.value)}
                    placeholder="ELIMINA"
                    style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${eliminaPin === 'ELIMINA' ? '#6E0E1A' : '#FCA5A5'}`, fontSize: 13, fontWeight: 700, color: '#6E0E1A', letterSpacing: '0.08em', background: '#FFF' }} />
                  <button onClick={confermaEliminazione} disabled={eliminaPin !== 'ELIMINA'}
                    style={{ padding: '8px 16px', background: eliminaPin === 'ELIMINA' ? '#6E0E1A' : '#E5E7EB', color: eliminaPin === 'ELIMINA' ? '#FFF' : '#9CA3AF', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: eliminaPin === 'ELIMINA' ? 'pointer' : 'not-allowed' }}>
                    Elimina
                  </button>
                  <button onClick={() => { setEliminaId(null); setEliminaPin('') }}
                    style={{ padding: '8px 12px', background: '#FFF', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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
