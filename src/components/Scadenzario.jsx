import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { parseFatturaXML, parseFatturaSMART } from '../lib/parseFatturaXML'
import { exportScadenzario } from '../lib/exportPDF'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

const C = {
  red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight,
  amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft,
  border: T.border, bg: T.bg, white: T.white,
}

async function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function parseExcelDate(val, XLSX) {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val)
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    } catch { return null }
  }
  const s = String(val).trim()
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function normalizeStato(v) {
  const s = String(v || '').toLowerCase().trim()
  if ((s.includes('pagat') || s.includes('saldat')) && !s.includes('da')) return 'pagata'
  return 'da_pagare'
}

// parseFattureExcel delegates to parseFatturaSMART from lib (TeamSystem format)
async function parseFattureExcel(file) {
  return parseFatturaSMART(file)
}

function computeStato(f) {
  if (f.stato === 'pagata') return 'pagata'
  if (!f.data_fattura) return 'da_pagare'
  const days = Math.floor((new Date() - new Date(f.data_fattura + 'T12:00:00')) / 86400000)
  if (days >= 0 && days <= 7) return 'in_scadenza'
  return 'da_pagare'
}

const STATI_CFG = {
  da_pagare:   { label: 'Da pagare',   bg: '#FEF2F2', color: '#C0392B' },
  in_scadenza: { label: 'In scadenza', bg: '#FFFBEB', color: '#D97706' },
  pagata:      { label: 'Pagata',      bg: '#F0FDF4', color: '#16A34A' },
}

const fmtEuro = v =>
  `€ ${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = d =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const mKey = d => d ? String(d).slice(0, 7) : ''

export default function Scadenzario({ orgId, sedeId }) {
  const isMobile = useIsMobile()
  const [fatture, setFatture]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  const [filtro, setFiltro]             = useState('tutti')
  const [filtroMese, setFiltroMese]     = useState('')
  const [vista, setVista]               = useState('lista')
  const [toast, setToast]               = useState(null)
  const [pagandoId, setPagandoId]       = useState(null)
  const [dataPag, setDataPag]           = useState(new Date().toISOString().slice(0, 10))
  const [eliminandoId, setEliminandoId] = useState(null)

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    loadFatture()
  }, [orgId])

  async function loadFatture() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('fatture')
        .select('*')
        .eq('organization_id', orgId)
        .order('data_fattura', { ascending: false })
      if (error) throw error
      setFatture(data || [])
    } catch (e) {
      notify('Errore caricamento: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleImportExcel(files) {
    if (!orgId) return
    setImportLoading(true)
    let imported = 0
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFattureExcel(file)
        if (!records.length) { notify('Nessuna fattura trovata nel file', false); continue }
        const toInsert = records.map(r => ({ ...r, organization_id: orgId, sede_id: sedeId || null }))
        for (let i = 0; i < toInsert.length; i += 100) {
          const { error } = await supabase.from('fatture').insert(toInsert.slice(i, i + 100))
          if (error) throw error
        }
        imported += records.length
      } catch (e) {
        const msg = e?.message || (typeof e === 'string' ? e : '') || 'errore sconosciuto'
        notify('Errore import ' + file.name + ': ' + msg, false)
      }
    }
    if (imported > 0) {
      notify(`✓ ${imported} fatture importate`)
      await loadFatture()
    }
    setImportLoading(false)
  }

  async function handleImportXML(files) {
    if (!orgId) return
    setImportLoading(true)
    let imported = 0
    for (const file of Array.from(files || [])) {
      try {
        const text = await file.text()
        const records = parseFatturaXML(text)
        if (!records.length) { notify('Nessuna fattura trovata nel file XML', false); continue }
        const toInsert = records.map(r => ({ ...r, organization_id: orgId, sede_id: sedeId || null }))
        for (let i = 0; i < toInsert.length; i += 100) {
          const { error } = await supabase.from('fatture').insert(toInsert.slice(i, i + 100))
          if (error) throw error
        }
        imported += records.length
      } catch (e) {
        notify('Errore import XML ' + file.name + ': ' + e.message, false)
      }
    }
    if (imported > 0) {
      notify(`✓ ${imported} fatture XML importate`)
      await loadFatture()
    }
    setImportLoading(false)
  }

  async function handleImportSMART(files) {
    if (!orgId) return
    setImportLoading(true)
    let imported = 0
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFatturaSMART(file)
        if (!records.length) { notify('Nessuna fattura trovata nel file FatturaSMART', false); continue }
        const toInsert = records.map(r => ({ ...r, organization_id: orgId, sede_id: sedeId || null }))
        for (let i = 0; i < toInsert.length; i += 100) {
          const { error } = await supabase.from('fatture').insert(toInsert.slice(i, i + 100))
          if (error) throw error
        }
        imported += records.length
      } catch (e) {
        notify('Errore import FatturaSMART ' + file.name + ': ' + e.message, false)
      }
    }
    if (imported > 0) {
      notify(`✓ ${imported} fatture FatturaSMART importate`)
      await loadFatture()
    }
    setImportLoading(false)
  }

  async function segnaComePagata(id) {
    try {
      const { error } = await supabase
        .from('fatture')
        .update({ stato: 'pagata', data_pagamento: dataPag })
        .eq('id', id)
      if (error) throw error
      setFatture(prev => prev.map(f => f.id === id ? { ...f, stato: 'pagata', data_pagamento: dataPag } : f))
      setPagandoId(null)
      notify('✓ Fattura segnata come pagata')
    } catch (e) {
      notify('Errore: ' + (e?.message || 'aggiornamento fallito'), false)
    }
  }

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
      notify('✓ Fattura eliminata')
    } catch (e) {
      notify('Errore: ' + (e?.message || 'eliminazione fallita'), false)
    }
  }

  async function exportExcel() {
    try {
      const XLSX = await loadXLSX()
      const rows = [
        ['Data', 'Fornitore', 'Numero Rif.', 'Imponibile €', 'Imposta €', 'Totale €', 'Stato', 'Data Pagamento'],
        ...fattureFiltrate.map(f => [
          f.data_fattura || '', f.fornitore, f.numero_rif || '',
          f.imponibile || 0, f.imposta || 0, f.totale || 0,
          STATI_CFG[f.statoEff]?.label || f.stato,
          f.data_pagamento || '',
        ])
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch:12 },{ wch:36 },{ wch:24 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:14 },{ wch:16 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Fatture')
      XLSX.writeFile(wb, `fatture_${new Date().toISOString().slice(0,10)}.xlsx`)
    } catch (e) {
      notify('Errore export: ' + e.message, false)
    }
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const fattureExt = useMemo(() =>
    fatture.map(f => ({ ...f, statoEff: computeStato(f) })),
    [fatture]
  )

  const mesiDisp = useMemo(() => {
    const s = new Set(fatture.map(f => mKey(f.data_fattura)).filter(Boolean))
    return [...s].sort().reverse()
  }, [fatture])

  const fattureFiltrate = useMemo(() =>
    fattureExt.filter(f => {
      if (filtro !== 'tutti' && f.statoEff !== filtro) return false
      if (filtroMese && mKey(f.data_fattura) !== filtroMese) return false
      return true
    }),
    [fattureExt, filtro, filtroMese]
  )

  const kpi = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7)
    const nonPagate = fattureExt.filter(f => f.statoEff !== 'pagata')
    const daPagare  = nonPagate.reduce((s, f) => s + (f.totale || 0), 0)
    const inScad    = fattureExt.filter(f => f.statoEff === 'in_scadenza').reduce((s,f) => s+(f.totale||0), 0)
    const pagMese   = fattureExt.filter(f => f.statoEff === 'pagata' && mKey(f.data_fattura) === thisMonth).reduce((s,f) => s+(f.totale||0), 0)
    const byF = {}
    nonPagate.forEach(f => { byF[f.fornitore] = (byF[f.fornitore] || 0) + (f.totale || 0) })
    const top = Object.entries(byF).sort((a,b) => b[1]-a[1])[0] || null
    return { daPagare, inScad, pagMese, top, nAperte: nonPagate.length, nScad: fattureExt.filter(f=>f.statoEff==='in_scadenza').length, nPagMese: fattureExt.filter(f=>f.statoEff==='pagata'&&mKey(f.data_fattura)===thisMonth).length }
  }, [fattureExt])

  const byFornitore = useMemo(() => {
    const g = {}
    fattureFiltrate.forEach(f => {
      if (!g[f.fornitore]) g[f.fornitore] = { fatture: [], totale: 0, daPagare: 0 }
      g[f.fornitore].fatture.push(f)
      g[f.fornitore].totale   += f.totale || 0
      if (f.statoEff !== 'pagata') g[f.fornitore].daPagare += f.totale || 0
    })
    return Object.entries(g).sort((a,b) => b[1].totale - a[1].totale)
  }, [fattureFiltrate])

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const card = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, boxShadow: S.sm }
  const pill = (active) => ({
    padding: '7px 14px', borderRadius: 9999, border: `1px solid ${active ? T.text : T.border}`, cursor: 'pointer',
    fontSize: 12, fontWeight: active ? 600 : 500, letterSpacing: '-0.005em',
    background: active ? T.text : T.bgCard,
    color: active ? T.textOnDark : T.textMid,
    transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
  })
  const primaryBtn = { padding: '10px 16px', background: T.brandGradient, color: T.textOnDark, border: 'none', borderRadius: R.md, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '-0.005em', boxShadow: S.brandSoft }
  const ghostBtn = { padding: '9px 14px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: T.textMid, letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.xs }

  if (!orgId) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>
      Caricamento in corso...
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, padding: isMobile ? 12 : 0, paddingBottom: isMobile ? 80 : 0 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999, background: toast.ok ? C.green : C.red, color: C.white, padding: '10px 20px', borderRadius: 9, fontSize: 12, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 700, color: T.text, letterSpacing: '-0.025em', lineHeight: 1.15 }}>Scadenzario</h1>
          <div style={{ fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }}>
            {fatture.length} fatture · {fmtEuro(fatture.reduce((s,f) => s+(f.totale||0), 0))} totale
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          {fatture.length > 0 && (
            <>
              <button onClick={exportExcel} style={{ ...ghostBtn, flex: isMobile ? '1 1 45%' : '0 0 auto' }}>↓ Esporta Excel</button>
              <button onClick={()=>exportScadenzario(fattureFiltrate)} style={{ ...ghostBtn, flex: isMobile ? '1 1 45%' : '0 0 auto' }}>📄 Esporta PDF</button>
            </>
          )}
          <label style={{ ...ghostBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            📄 XML SDI
            <input type="file" accept=".xml,.p7m" multiple style={{ display: 'none' }}
              onChange={e => e.target.files.length && handleImportXML(e.target.files)} />
          </label>
          <label style={{ ...ghostBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            📊 FatturaSMART
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => e.target.files.length && handleImportSMART(e.target.files)} />
          </label>
          <label style={primaryBtn}>
            {importLoading ? '⏳ Importazione…' : '📂 Importa .xlsx'}
            <input type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
              onChange={e => e.target.files.length && handleImportExcel(e.target.files)} />
          </label>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 14, marginBottom: isMobile ? 16 : 24 }}>
        {[
          {
            label: 'Totale da pagare',
            val: fmtEuro(kpi.daPagare),
            color: kpi.daPagare > 0 ? C.red : C.green,
            sub: `${kpi.nAperte} fatture aperte`,
          },
          {
            label: 'In scadenza (7 giorni)',
            val: fmtEuro(kpi.inScad),
            color: kpi.inScad > 0 ? C.amber : C.green,
            sub: `${kpi.nScad} fatture recenti`,
          },
          {
            label: 'Pagate questo mese',
            val: fmtEuro(kpi.pagMese),
            color: C.green,
            sub: `${kpi.nPagMese} fatture`,
          },
          {
            label: 'Fornitore principale',
            val: kpi.top ? kpi.top[0].split(' ').slice(0, 2).join(' ') : '—',
            color: C.text,
            sub: kpi.top ? `${fmtEuro(kpi.top[1])} da pagare` : 'nessuna aperta',
            small: true,
          },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: k.small ? 15 : 22, fontWeight: 700, color: k.color, lineHeight: 1.1, marginBottom: 6, wordBreak: 'break-word', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }}>{k.val}</div>
            <div style={{ fontSize: 12, color: T.textSoft, letterSpacing: '-0.005em' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[['tutti','Tutti'], ['da_pagare','Da pagare'], ['in_scadenza','In scadenza'], ['pagata','Pagate']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFiltro(id)} style={pill(filtro === id)}>{lbl}</button>
          ))}
        </div>
        <select value={filtroMese} onChange={e => setFiltroMese(e.target.value)}
          style={{ padding: isMobile ? '8px 12px' : '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: isMobile ? 16 : 12, color: C.textMid, background: C.white, cursor: 'pointer' }}>
          <option value="">Tutti i mesi</option>
          {mesiDisp.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['lista','≡ Lista'], ['fornitore','⊞ Per fornitore']].map(([id, lbl]) => (
            <button key={id} onClick={() => setVista(id)}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: vista === id ? C.text : C.white, color: vista === id ? C.white : C.textMid }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Caricamento…</div>
      ) : fatture.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: isMobile ? '40px 20px' : '60px 40px' }}>
          <div style={{ width: 64, height: 64, borderRadius: R.lg, background: T.bgSubtle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.textSoft, marginBottom: 16 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div style={{ fontWeight: 600, fontSize: 18, color: T.text, marginBottom: 8, letterSpacing: '-0.015em' }}>Nessuna fattura</div>
          <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.5 }}>
            Importa l'export Excel di FatturaSMART (o un file XML SDI) per iniziare a tenere traccia delle scadenze.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <label style={primaryBtn}>
              📂 Importa .xlsx
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => e.target.files.length && handleImportExcel(e.target.files)} />
            </label>
          </div>
        </div>
      ) : vista === 'lista' ? (
        // ── Lista view ──────────────────────────────────────────────────────────
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.textSoft }}>
            <strong style={{ color: C.text }}>{fattureFiltrate.length}</strong> fatture · <strong style={{ color: C.text }}>{fmtEuro(fattureFiltrate.reduce((s,f) => s+(f.totale||0), 0))}</strong> totale filtrato
          </div>
          {fattureFiltrate.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Nessuna fattura per i filtri selezionati.</div>
          ) : isMobile ? (
            <div style={{ padding: 8 }}>
              {fattureFiltrate.map(f => {
                const sc = STATI_CFG[f.statoEff] || STATI_CFG.da_pagare
                const isPag = pagandoId === f.id
                const isDel = eliminandoId === f.id
                return (
                  <div key={f.id} style={{ background: C.white, border: `1px solid ${isDel ? '#FCA5A5' : C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.text, flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{f.fornitore}</div>
                      <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{sc.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8 }}>
                      {f.numero_rif || '—'} · {fmtDate(f.data_fattura)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{fmtEuro(f.totale)}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {f.statoEff === 'pagata' && !isDel && (
                          <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓ {fmtDate(f.data_pagamento)}</span>
                        )}
                        {f.statoEff !== 'pagata' && !isPag && !isDel && (
                          <button onClick={() => { setPagandoId(f.id); setEliminandoId(null); setDataPag(new Date().toISOString().slice(0,10)) }}
                            style={{ padding: '8px 14px', background: C.green, color: C.white, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            ✓ Pagata
                          </button>
                        )}
                        {!isPag && !isDel && (
                          <button onClick={() => chiediElimina(f.id)}
                            aria-label="Elimina fattura"
                            title="Elimina"
                            style={{ padding: '7px 9px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {isPag && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                        <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)}
                          style={{ padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 16, color: C.text, flex: 1, minWidth: 0 }} />
                        <button onClick={() => segnaComePagata(f.id)}
                          style={{ padding: '8px 14px', background: C.green, color: C.white, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                        <button onClick={() => setPagandoId(null)}
                          style={{ padding: '8px 10px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>✕</button>
                      </div>
                    )}
                    {isDel && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: C.red, flex: 1, minWidth: 120, fontWeight: 600, letterSpacing: '-0.005em' }}>
                          Sei sicuro? L'azione non è reversibile.
                        </span>
                        <button onClick={() => eliminaFattura(f.id)}
                          style={{ padding: '8px 14px', background: C.red, color: C.white, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Sì, elimina
                        </button>
                        <button onClick={() => setEliminandoId(null)}
                          style={{ padding: '8px 12px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Annulla
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#FAF8F7' }}>
                    {['Data', 'Fornitore', 'Num. Rif.', 'Imponibile', 'Totale', 'Stato', 'Azioni'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fattureFiltrate.map((f, i) => {
                    const sc = STATI_CFG[f.statoEff] || STATI_CFG.da_pagare
                    const isPag = pagandoId === f.id
                    const isDel = eliminandoId === f.id
                    return (
                      <tr key={f.id} style={{ borderBottom: i < fattureFiltrate.length-1 ? `1px solid ${C.border}` : 'none', background: isDel ? '#FEF2F2' : (i%2===0 ? C.white : '#FAFAFA') }}>
                        <td style={{ padding: '11px 14px', color: C.textMid, whiteSpace: 'nowrap' }}>{fmtDate(f.data_fattura)}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span title={f.fornitore}>{f.fornitore}</span>
                        </td>
                        <td style={{ padding: '11px 14px', color: C.textMid, fontFamily: 'monospace', fontSize: 11 }}>{f.numero_rif || '—'}</td>
                        <td style={{ padding: '11px 14px', color: C.textMid, textAlign: 'right', whiteSpace: 'nowrap' }}>{f.imponibile ? fmtEuro(f.imponibile) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEuro(f.totale)}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', minWidth: 200 }}>
                          {isDel ? (
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: C.red, fontWeight: 700, marginRight: 4 }}>Sei sicuro?</span>
                              <button onClick={() => eliminaFattura(f.id)}
                                style={{ padding: '4px 10px', background: C.red, color: C.white, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Sì, elimina
                              </button>
                              <button onClick={() => setEliminandoId(null)}
                                style={{ padding: '4px 9px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                Annulla
                              </button>
                            </div>
                          ) : isPag ? (
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)}
                                style={{ padding: '4px 7px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.text }} />
                              <button onClick={() => segnaComePagata(f.id)}
                                style={{ padding: '4px 9px', background: C.green, color: C.white, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                OK
                              </button>
                              <button onClick={() => setPagandoId(null)}
                                style={{ padding: '4px 7px', background: 'transparent', color: C.textSoft, border: 'none', fontSize: 12, cursor: 'pointer' }}>
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {f.statoEff !== 'pagata' && (
                                <button onClick={() => { setPagandoId(f.id); setEliminandoId(null); setDataPag(new Date().toISOString().slice(0,10)) }}
                                  style={{ padding: '5px 10px', background: '#F0FDF4', color: C.green, border: `1px solid ${C.green}`, borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                  ✓ Segna pagata
                                </button>
                              )}
                              {f.statoEff === 'pagata' && (
                                <span style={{ fontSize: 11, color: C.green }}>✓ {fmtDate(f.data_pagamento)}</span>
                              )}
                              <button onClick={() => chiediElimina(f.id)}
                                aria-label="Elimina fattura"
                                title="Elimina"
                                style={{ padding: '5px 7px', background: 'transparent', color: C.textSoft, border: 'none', cursor: 'pointer', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = C.red; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textSoft; }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                  <path d="M10 11v6M14 11v6"/>
                                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        // ── Per fornitore view ──────────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {byFornitore.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Nessun fornitore per i filtri selezionati.</div>
          ) : byFornitore.map(([fornitore, grp]) => (
            <div key={fornitore} style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', background: '#FAF8F7', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fornitore}>{fornitore}</div>
                  <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
                    {grp.fatture.length} fatture · {fmtEuro(grp.totale)} totale
                  </div>
                </div>
                {grp.daPagare > 0 && (
                  <span style={{ background: C.redLight, color: C.red, padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmtEuro(grp.daPagare)} da pagare
                  </span>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {grp.fatture.map((f, i) => {
                    const sc = STATI_CFG[f.statoEff] || STATI_CFG.da_pagare
                    const isDel = eliminandoId === f.id
                    return (
                      <tr key={f.id} style={{ borderBottom: i < grp.fatture.length-1 ? `1px solid ${C.border}` : 'none', background: isDel ? '#FEF2F2' : 'transparent' }}>
                        <td style={{ padding: '9px 18px', color: C.textMid, whiteSpace: 'nowrap' }}>{fmtDate(f.data_fattura)}</td>
                        <td style={{ padding: '9px 14px', color: C.textMid, fontFamily: 'monospace', fontSize: 11 }}>{f.numero_rif || '—'}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 700, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEuro(f.totale)}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 9px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{sc.label}</span>
                        </td>
                        <td style={{ padding: '9px 18px 9px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {isDel ? (
                            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: C.red, fontWeight: 700, marginRight: 2 }}>Sicuro?</span>
                              <button onClick={() => eliminaFattura(f.id)}
                                style={{ padding: '4px 10px', background: C.red, color: C.white, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Sì
                              </button>
                              <button onClick={() => setEliminandoId(null)}
                                style={{ padding: '4px 8px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                                Annulla
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => chiediElimina(f.id)}
                              aria-label="Elimina fattura"
                              title="Elimina"
                              style={{ padding: '5px 7px', background: 'transparent', color: C.textSoft, border: 'none', cursor: 'pointer', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = C.red; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textSoft; }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                <path d="M10 11v6M14 11v6"/>
                                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
