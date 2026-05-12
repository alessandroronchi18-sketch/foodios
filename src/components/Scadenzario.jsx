import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const C = {
  red: '#C0392B', redLight: '#FEF2F2',
  green: '#16A34A', greenLight: '#F0FDF4',
  amber: '#D97706', amberLight: '#FFFBEB',
  text: '#0F172A', textMid: '#475569', textSoft: '#94A3B8',
  border: '#E2E8F0', bg: '#F8FAFC', white: '#FFFFFF',
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

async function parseFattureExcel(file) {
  const XLSX = await loadXLSX()
  const ab = await file.arrayBuffer()
  const wb = XLSX.read(ab, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (rows[i].some(c => String(c).trim() === 'Fornitore')) { headerIdx = i; break }
  }
  if (headerIdx === -1) throw new Error('Intestazione "Fornitore" non trovata nel file')

  const headers = rows[headerIdx].map(h => String(h).trim())
  const idx = {}
  headers.forEach((h, i) => { idx[h] = i })

  const fatture = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const fornitore = String(row[idx['Fornitore']] ?? '').trim()
    if (!fornitore) continue

    const numRif  = String(row[idx['Numero Rif.']] ?? row[idx['Numero Rif']] ?? '').trim()
    const numBase = String(row[idx['Numero']] ?? '').trim()
    const suf     = String(row[idx['Suffisso']] ?? '').trim()
    const numero_rif = numRif || (numBase ? `${numBase}${suf ? '/'+suf : ''}` : '')

    const totale     = parseFloat(String(row[idx['Totale']]     ?? '0').replace(',', '.')) || 0
    const imponibile = parseFloat(String(row[idx['Imponibile']] ?? '0').replace(',', '.')) || 0
    const imposta    = parseFloat(String(row[idx['Imposta']]    ?? '0').replace(',', '.')) || 0

    if (totale === 0 && !fornitore) continue

    fatture.push({
      numero_rif,
      data_fattura: parseExcelDate(row[idx['Data']], XLSX),
      data_rif:     parseExcelDate(row[idx['Data Rif.']] ?? row[idx['Data Rif']], XLSX),
      fornitore,
      imponibile,
      imposta,
      totale,
      stato: normalizeStato(row[idx['Stato']]),
    })
  }
  return fatture
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

const DEMO_FATTURE = [
  { numero_rif: '160',                    data_fattura: '2026-04-09', fornitore: "MELLY'S KOMBUCHA SRL",                          totale: 149.33, imponibile: 122.40, imposta: 26.93,  stato: 'da_pagare' },
  { numero_rif: '349/001',                data_fattura: '2026-04-09', fornitore: 'MARCO RIVELLA',                                  totale: 42.70,  imponibile: 35.00,  imposta: 7.70,   stato: 'da_pagare' },
  { numero_rif: 'INVIT/rst/26/0266800',   data_fattura: '2026-04-09', fornitore: 'Deliveroo Italy S.R.L.',                         totale: 90.91,  imponibile: 74.52,  imposta: 16.39,  stato: 'da_pagare' },
  { numero_rif: '10',                     data_fattura: '2026-04-08', fornitore: 'ERBORISTERIA PURANATURA DI FRANCESCO REGALZI',   totale: 118.20, imponibile: 96.89,  imposta: 21.31,  stato: 'da_pagare' },
  { numero_rif: '1/973',                  data_fattura: '2026-04-08', fornitore: 'CONO ARTIC COMMERCIALE SRL',                     totale: 780.78, imponibile: 640.00, imposta: 140.78, stato: 'da_pagare' },
  { numero_rif: 'FT/2026/0042',           data_fattura: '2026-04-07', fornitore: 'CAFFÈ BORBONE SRL',                             totale: 234.50, imponibile: 192.21, imposta: 42.29,  stato: 'pagata', data_pagamento: '2026-04-15' },
  { numero_rif: 'FT-2026-00789',          data_fattura: '2026-04-07', fornitore: 'MULINO BIANCO INGREDIENTS',                     totale: 567.30, imponibile: 465.00, imposta: 102.30, stato: 'da_pagare' },
  { numero_rif: '2026/88',                data_fattura: '2026-04-06', fornitore: 'LATTERIA MONTELLO S.P.A.',                       totale: 312.00, imponibile: 256.00, imposta: 56.00,  stato: 'da_pagare' },
  { numero_rif: 'IV/2026/001234',         data_fattura: '2026-04-05', fornitore: 'ENEL ENERGIA S.P.A.',                           totale: 892.44, imponibile: 731.51, imposta: 160.93, stato: 'pagata', data_pagamento: '2026-04-12' },
  { numero_rif: '0541',                   data_fattura: '2026-04-04', fornitore: 'DOLCIUMI FUMAGALLI SNC',                         totale: 445.60, imponibile: 365.25, imposta: 80.35,  stato: 'da_pagare' },
  { numero_rif: 'F/2026/0099',            data_fattura: '2026-04-03', fornitore: "MELLY'S KOMBUCHA SRL",                          totale: 213.47, imponibile: 175.00, imposta: 38.47,  stato: 'da_pagare' },
  { numero_rif: '7741/B',                 data_fattura: '2026-04-02', fornitore: 'FORNITORE GENERALE ALIMENTARI',                  totale: 1240.00,imponibile: 1016.39,imposta: 223.61, stato: 'da_pagare' },
  { numero_rif: '2026-0178',              data_fattura: '2026-04-01', fornitore: 'PACKAGING EXPRESS SRL',                          totale: 189.00, imponibile: 154.92, imposta: 34.08,  stato: 'pagata', data_pagamento: '2026-04-10' },
  { numero_rif: 'RCPT/0056',              data_fattura: '2026-03-31', fornitore: 'CONO ARTIC COMMERCIALE SRL',                     totale: 550.00, imponibile: 450.82, imposta: 99.18,  stato: 'da_pagare' },
  { numero_rif: 'FT2026-22',              data_fattura: '2026-03-28', fornitore: 'MARCO RIVELLA',                                  totale: 67.30,  imponibile: 55.00,  imposta: 12.30,  stato: 'pagata', data_pagamento: '2026-04-05' },
  { numero_rif: '2026/104',               data_fattura: '2026-03-25', fornitore: 'DOLCIUMI FUMAGALLI SNC',                         totale: 398.40, imponibile: 326.56, imposta: 71.84,  stato: 'da_pagare' },
  { numero_rif: 'INV-0033',               data_fattura: '2026-03-20', fornitore: 'ERBORISTERIA PURANATURA DI FRANCESCO REGALZI',   totale: 88.50,  imponibile: 72.54,  imposta: 15.96,  stato: 'pagata', data_pagamento: '2026-04-01' },
  { numero_rif: '26/00312',               data_fattura: '2026-03-15', fornitore: 'LATTERIA MONTELLO S.P.A.',                       totale: 289.00, imponibile: 236.89, imposta: 52.11,  stato: 'da_pagare' },
  { numero_rif: 'DV/2026/0091',           data_fattura: '2026-03-10', fornitore: 'Deliveroo Italy S.R.L.',                         totale: 125.43, imponibile: 102.81, imposta: 22.62,  stato: 'pagata', data_pagamento: '2026-03-25' },
  { numero_rif: '2026-567',               data_fattura: '2026-03-05', fornitore: 'CAFFÈ BORBONE SRL',                             totale: 178.90, imponibile: 146.64, imposta: 32.26,  stato: 'da_pagare' },
]

export default function Scadenzario({ orgId, sedeId }) {
  const [fatture, setFatture]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  const [filtro, setFiltro]             = useState('tutti')
  const [filtroMese, setFiltroMese]     = useState('')
  const [vista, setVista]               = useState('lista')
  const [toast, setToast]               = useState(null)
  const [pagandoId, setPagandoId]       = useState(null)
  const [dataPag, setDataPag]           = useState(new Date().toISOString().slice(0, 10))

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
        notify('Errore import ' + file.name + ': ' + e.message, false)
      }
    }
    if (imported > 0) {
      notify(`✓ ${imported} fatture importate`)
      await loadFatture()
    }
    setImportLoading(false)
  }

  async function importaFattureDemo() {
    if (!orgId) return
    setImportLoading(true)
    try {
      const toInsert = DEMO_FATTURE.map(r => ({ ...r, organization_id: orgId, sede_id: sedeId || null }))
      const { error } = await supabase.from('fatture').insert(toInsert)
      if (error) throw error
      notify(`✓ ${toInsert.length} fatture demo caricate`)
      await loadFatture()
    } catch (e) {
      notify('Errore demo: ' + e.message, false)
    } finally {
      setImportLoading(false)
    }
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
      notify('Errore: ' + e.message, false)
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
  const card = { background: C.white, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }
  const pill = (active) => ({
    padding: '6px 13px', borderRadius: 20, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
    background: active ? C.text : '#EEE',
    color: active ? C.white : C.textMid,
    transition: 'background 0.12s',
  })
  const primaryBtn = { padding: '8px 14px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
  const ghostBtn = { padding: '7px 13px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.textMid }

  if (!orgId) return (
    <div style={{ padding: 48, textAlign: 'center', color: C.textSoft }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.textMid, marginBottom: 6 }}>Organizzazione non trovata</div>
      <div style={{ fontSize: 12 }}>Ricarica la pagina o effettua di nuovo il login.</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999, background: toast.ok ? C.green : C.red, color: C.white, padding: '10px 20px', borderRadius: 9, fontSize: 12, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Scadenzario Fatture</div>
          <div style={{ fontSize: 13, color: C.textSoft, marginTop: 3 }}>
            {fatture.length} fatture · {fmtEuro(fatture.reduce((s,f) => s+(f.totale||0), 0))} totale
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {fatture.length > 0 && (
            <button onClick={exportExcel} style={ghostBtn}>↓ Esporta Excel</button>
          )}
          {fatture.length === 0 && (
            <button onClick={importaFattureDemo} disabled={importLoading}
              style={{ ...ghostBtn, color: '#6B4C44', borderColor: '#CCC' }}>
              {importLoading ? '…' : '🔧 Carica dati demo'}
            </button>
          )}
          <label style={primaryBtn}>
            {importLoading ? '⏳ Importazione…' : '📂 Importa fatture .xlsx'}
            <input type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
              onChange={e => e.target.files.length && handleImportExcel(e.target.files)} />
          </label>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
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
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: k.small ? 15 : 22, fontWeight: 900, color: k.color, lineHeight: 1.1, marginBottom: 4, wordBreak: 'break-word' }}>{k.val}</div>
            <div style={{ fontSize: 11, color: C.textSoft }}>{k.sub}</div>
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
          style={{ padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textMid, background: C.white, cursor: 'pointer' }}>
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
        <div style={{ ...card, textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📄</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.text, marginBottom: 8 }}>Nessuna fattura</div>
          <div style={{ fontSize: 13, color: C.textSoft, marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>
            Importa un file Excel nel formato Fattura SMART oppure carica i dati demo per esplorare la funzione.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={importaFattureDemo} disabled={importLoading}
              style={{ ...primaryBtn, background: '#6B4C44' }}>
              {importLoading ? '…' : '🔧 Carica 20 fatture demo'}
            </button>
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
                    return (
                      <tr key={f.id} style={{ borderBottom: i < fattureFiltrate.length-1 ? `1px solid ${C.border}` : 'none', background: i%2===0 ? C.white : '#FAFAFA' }}>
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
                        <td style={{ padding: '11px 14px', minWidth: 160 }}>
                          {f.statoEff !== 'pagata' && !isPag && (
                            <button onClick={() => { setPagandoId(f.id); setDataPag(new Date().toISOString().slice(0,10)) }}
                              style={{ padding: '5px 10px', background: '#F0FDF4', color: C.green, border: `1px solid ${C.green}`, borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              ✓ Segna pagata
                            </button>
                          )}
                          {isPag && (
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
                          )}
                          {f.statoEff === 'pagata' && (
                            <span style={{ fontSize: 11, color: C.green }}>✓ {fmtDate(f.data_pagamento)}</span>
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
                    return (
                      <tr key={f.id} style={{ borderBottom: i < grp.fatture.length-1 ? `1px solid ${C.border}` : 'none' }}>
                        <td style={{ padding: '9px 18px', color: C.textMid, whiteSpace: 'nowrap' }}>{fmtDate(f.data_fattura)}</td>
                        <td style={{ padding: '9px 14px', color: C.textMid, fontFamily: 'monospace', fontSize: 11 }}>{f.numero_rif || '—'}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 700, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEuro(f.totale)}</td>
                        <td style={{ padding: '9px 18px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 9px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{sc.label}</span>
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
