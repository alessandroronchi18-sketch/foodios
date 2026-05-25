import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { parseFatturaXML, parseFatturaSMART } from '../lib/parseFatturaXML'
import { exportScadenzario } from '../lib/exportPDF'
import { getExportCtx, gateExport } from '../lib/exportGuard'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Termine di pagamento standard usato per derivare la data di scadenza
// quando in DB non e' specificata: 30 giorni dalla data fattura.
const PAYMENT_TERMS_DAYS = 30

async function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve(window.XLSX)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// ─── Date / numero helpers ────────────────────────────────────────────────────
function dueDateObj(f) {
  if (!f?.data_fattura) return null
  const d = new Date(f.data_fattura + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  d.setDate(d.getDate() + PAYMENT_TERMS_DAYS)
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

const fmtEuro = v =>
  `€ ${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
  const [fatture, setFatture]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  const [filtro, setFiltro]               = useState('tutte')
  // 'attiva' = solo fatture della sede attiva + condivise; 'tutte' = tutte le sedi
  const [scopeSede, setScopeSede]         = useState('attiva')
  const [toast, setToast]                 = useState(null)
  const [pagandoId, setPagandoId]         = useState(null)
  const [dataPag, setDataPag]             = useState(new Date().toISOString().slice(0, 10))
  const [eliminandoId, setEliminandoId]   = useState(null)

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    loadFatture()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sedeId, scopeSede])

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
    let imported = 0
    for (const file of Array.from(files || [])) {
      try {
        const records = await parseFatturaSMART(file)
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
        notify('Errore import XML ' + file.name + ': ' + (e?.message || 'sconosciuto'), false)
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
        notify('Errore import FatturaSMART ' + file.name + ': ' + (e?.message || 'sconosciuto'), false)
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

  // ── Computed ────────────────────────────────────────────────────────────────
  const fattureExt = useMemo(() => {
    const now = new Date()
    return fatture.map(f => {
      const dd = dueDateObj(f)
      return {
        ...f,
        urgenza: computeUrgenza(f, now),
        dueIso: dueDateISO(f),
        dueDays: dd ? diffDays(dd, now) : null,
      }
    })
  }, [fatture])

  // Gruppi: date ASC poi totale DESC (le piu' vecchie e grosse in testa al gruppo)
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
    const sum = arr => arr.reduce((s, f) => s + (f.totale || 0), 0)
    return {
      daPagare:     sum([...gruppi.scaduta, ...gruppi.settimana, ...gruppi.mese, ...gruppi.futura]),
      scaduto:      sum(gruppi.scaduta),
      settimanaTot: sum(gruppi.settimana),
      nDaPagare:    gruppi.scaduta.length + gruppi.settimana.length + gruppi.mese.length + gruppi.futura.length,
      nScadute:     gruppi.scaduta.length,
      nSettimana:   gruppi.settimana.length,
    }
  }, [gruppi])

  const gruppiVisibili = useMemo(() => {
    return (FILTRI.find(x => x.id === filtro) || FILTRI[0]).gruppi
  }, [filtro])

  const totaliFiltrati = useMemo(() => {
    const items = gruppiVisibili.flatMap(k => gruppi[k] || [])
    return { n: items.length, tot: items.reduce((s, f) => s + (f.totale || 0), 0) }
  }, [gruppi, gruppiVisibili])

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
    <div style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>Caricamento in corso...</div>
  )

  // ─── Azioni inline (pagata / elimina) ────────────────────────────────────────
  function ActionsCell({ f, compact = false }) {
    const isPag = pagandoId === f.id
    const isDel = eliminandoId === f.id

    if (isDel) {
      return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.brand, fontWeight: 700 }}>Sicuro?</span>
          <button onClick={() => eliminaFattura(f.id)}
            style={{ padding: '4px 10px', background: T.brand, color: T.white, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            Sì, elimina
          </button>
          <button onClick={() => setEliminandoId(null)}
            style={{ padding: '4px 9px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Annulla
          </button>
        </div>
      )
    }

    if (isPag) {
      return (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)}
            style={{ padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, color: T.text }} />
          <button onClick={() => segnaComePagata(f.id)}
            style={{ padding: '4px 9px', background: T.green, color: T.white, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>OK</button>
          <button onClick={() => setPagandoId(null)}
            style={{ padding: '4px 7px', background: 'transparent', color: T.textSoft, border: 'none', fontSize: 12, cursor: 'pointer' }}>✕</button>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {f.stato === 'pagata' ? (
          <span style={{ fontSize: 11, color: T.green, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {f.data_pagamento ? fmtDate(f.data_pagamento) : 'Pagata'}
          </span>
        ) : (
          <button onClick={() => { setPagandoId(f.id); setEliminandoId(null); setDataPag(new Date().toISOString().slice(0,10)) }}
            style={{ padding: compact ? '4px 9px' : '5px 10px', background: '#F0FDF4', color: T.green, border: `1px solid ${T.green}`, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ✓ Segna pagata
          </button>
        )}
        <button onClick={() => chiediElimina(f.id)}
          aria-label="Elimina fattura" title="Elimina"
          style={{ padding: '5px 7px', background: 'transparent', color: T.textSoft, border: 'none', cursor: 'pointer', borderRadius: 8, display: 'inline-flex', alignItems: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = T.brand }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textSoft }}>
          <svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    const isScaduta = f.urgenza === 'scaduta'
    const baseBg = isDel ? '#FEF2F2' : (i % 2 === 0 ? T.bgCard : '#FAFAFA')

    return (
      <tr style={{
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
        background: baseBg,
        boxShadow: isScaduta ? `inset 3px 0 0 0 ${T.brand}` : 'none',
      }}>
        <td style={{ padding: '9px 12px', fontWeight: 600, color: T.text, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span title={f.fornitore}>{f.fornitore}</span>
        </td>
        <td style={{ padding: '9px 12px', color: T.textMid, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
          {f.numero_rif || '—'}
        </td>
        <td style={{ padding: '9px 12px', color: T.textMid, whiteSpace: 'nowrap' }}>
          {fmtDate(f.data_fattura)}
        </td>
        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
          {f.stato === 'pagata' ? (
            <span style={{ color: T.textSoft }}>—</span>
          ) : f.dueIso ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ color: T.text, fontWeight: 500 }}>{fmtDate(f.dueIso)}</span>
              <span style={{ fontSize: 10, color: isScaduta ? T.brand : T.textSoft, fontWeight: isScaduta ? 600 : 500 }}>
                {relDayLabel(f.dueDays)}
              </span>
            </div>
          ) : (
            <span style={{ color: T.textSoft }}>—</span>
          )}
        </td>
        <td style={{
          padding: '9px 12px', textAlign: 'right',
          fontWeight: isScaduta ? 800 : 700,
          color: isScaduta ? T.brand : T.text,
          letterSpacing: '-0.015em', whiteSpace: 'nowrap',
        }}>
          {fmtEuro(f.totale)}
        </td>
        <td style={{ padding: '9px 12px' }}>
          <span style={{
            background: cfg.pillBg, color: cfg.pillFg,
            padding: '3px 9px', borderRadius: 8, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>{cfg.label}</span>
        </td>
        <td style={{ padding: '9px 12px' }}>
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
        borderRadius: 10,
        padding: '11px 13px',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.text, flex: 1, minWidth: 0, wordBreak: 'break-word', letterSpacing: '-0.005em' }}>
            {f.fornitore}
          </div>
          <span style={{
            background: cfg.pillBg, color: cfg.pillFg,
            padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}>{cfg.label}</span>
        </div>
        <div style={{ fontSize: 11, color: T.textSoft, marginBottom: 8, ...tnum }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 17, fontWeight: isScaduta ? 800 : 700,
            color: isScaduta ? T.brand : T.text,
            letterSpacing: '-0.02em', ...tnum,
          }}>
            {fmtEuro(f.totale)}
          </div>
          {!isDel && !isPag && <ActionsCell f={f} />}
        </div>
        {isPag && (
          <div style={{ marginTop: 10 }}>
            <ActionsCell f={f} />
          </div>
        )}
        {isDel && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: T.brand, fontWeight: 600, marginBottom: 8 }}>
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
          padding: isMobile ? '12px 14px' : '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          borderBottom: `1px solid ${T.border}`,
          background: isUrgent ? '#FEF2F2' : T.bgCard,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 8, background: cfg.pillBg, color: cfg.pillFg,
              fontSize: 11, fontWeight: 700,
            }}>{items.length}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
                {cfg.header}
              </div>
              <div style={{ fontSize: 11, color: T.textSoft, letterSpacing: '-0.005em' }}>
                {cfg.sub}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: isUrgent ? T.brand : T.text,
            letterSpacing: '-0.015em', ...tnum, whiteSpace: 'nowrap',
          }}>
            {fmtEuro(totaleGruppo)}
          </div>
        </div>

        {/* Body */}
        {isMobile ? (
          <div style={{ padding: 8 }}>
            {items.map(f => <CardMobile key={f.id} f={f} cfg={cfg} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, ...tnum }}>
              <thead>
                <tr style={{ background: '#FAFAF8' }}>
                  {[
                    'Fornitore', 'Numero', 'Data fatt.', 'Scadenza', 'Totale', 'Stato', 'Azioni',
                  ].map((l, idx) => (
                    <th key={l} style={{
                      padding: '8px 12px',
                      textAlign: idx === 4 ? 'right' : 'left',
                      fontSize: 10, fontWeight: 600,
                      color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                    }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((f, i) => (
                  <RigaTabella key={f.id} f={f} cfg={cfg} i={i} last={i === items.length - 1} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 1180, padding: isMobile ? 12 : 0, paddingBottom: isMobile ? 80 : 0 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999, background: toast.ok ? T.green : T.brand, color: T.white, padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 700, color: T.text, letterSpacing: '-0.025em', lineHeight: 1.15 }}>Scadenzario</h1>
          <div style={{ fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', ...tnum }}>
            {fatture.length} {fatture.length === 1 ? 'fattura' : 'fatture'} totali · {fmtEuro(fatture.reduce((s,f) => s+(f.totale||0), 0))} fatturato registrato
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          {fatture.length > 0 && (
            <>
              <button onClick={exportExcel} style={{ ...ghostBtn, flex: isMobile ? '1 1 45%' : '0 0 auto' }}>↓ Esporta Excel</button>
              <button onClick={async () => {
                const list = gruppiVisibili.flatMap(k => gruppi[k] || []);
                if (!(await gateExport('scadenzario', { n_items: list.length }, window.__foodos_notify))) return;
                const c = getExportCtx();
                exportScadenzario(list, c.nomeAttivita, c.email);
              }} style={{ ...ghostBtn, flex: isMobile ? '1 1 45%' : '0 0 auto' }}>📄 Esporta PDF</button>
            </>
          )}
          <label style={{ ...ghostBtn, cursor: 'pointer' }}>
            📄 XML SDI
            <input type="file" accept=".xml,.p7m" multiple style={{ display: 'none' }}
              onChange={e => e.target.files.length && handleImportXML(e.target.files)} />
          </label>
          <label style={{ ...ghostBtn, cursor: 'pointer' }}>
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

      {/* Summary bar — 3 KPI azionabili */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: isMobile ? 10 : 14,
        marginBottom: isMobile ? 16 : 22,
      }}>
        {[
          {
            label: 'Totale da pagare',
            val: fmtEuro(summary.daPagare),
            sub: `${summary.nDaPagare} ${summary.nDaPagare === 1 ? 'fattura aperta' : 'fatture aperte'}`,
            color: summary.daPagare > 0 ? T.text : T.textSoft,
            accent: T.text,
            onClick: () => setFiltro('tutte'),
          },
          {
            label: 'Scaduto',
            val: fmtEuro(summary.scaduto),
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
            val: fmtEuro(summary.settimanaTot),
            sub: summary.nSettimana > 0
              ? `${summary.nSettimana} ${summary.nSettimana === 1 ? 'fattura' : 'fatture'} questa settimana`
              : 'nulla in scadenza',
            color: summary.settimanaTot > 0 ? '#9A3412' : T.textSoft,
            accent: summary.settimanaTot > 0 ? '#F97316' : T.border,
            onClick: () => setFiltro('in_scadenza'),
          },
        ].map(k => (
          <button key={k.label} type="button" onClick={k.onClick}
            style={{
              ...card,
              padding: isMobile ? '14px 16px 14px 18px' : '16px 20px 16px 22px',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              position: 'relative',
              borderLeft: `4px solid ${k.accent}`,
              boxShadow: k.urgent ? '0 1px 2px rgba(110,14,26,0.08), 0 1px 3px rgba(15,23,42,0.04)' : S.sm,
              transition: `box-shadow ${M.durBase} ${M.ease}, transform ${M.durBase} ${M.ease}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = S.md; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = k.urgent ? '0 1px 2px rgba(110,14,26,0.08), 0 1px 3px rgba(15,23,42,0.04)' : S.sm; e.currentTarget.style.transform = 'translateY(0)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {k.label}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: k.color, lineHeight: 1.05,
              marginBottom: 6, letterSpacing: '-0.025em', ...tnum,
            }}>{k.val}</div>
            <div style={{ fontSize: 12, color: T.textSoft, letterSpacing: '-0.005em' }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Filtri rapidi */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTRI.map(f => {
            const active = filtro === f.id
            const count = f.gruppi.reduce((s, k) => s + (gruppi[k]?.length || 0), 0)
            return (
              <button key={f.id} onClick={() => setFiltro(f.id)} style={pill(active)}>
                {f.label}
                {fatture.length > 0 && (
                  <span style={{
                    marginLeft: 7, fontSize: 11, fontWeight: 600,
                    color: active ? 'rgba(255,255,255,0.7)' : T.textSoft,
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
        {haPiuSedi && (
          <select value={scopeSede} onChange={e => setScopeSede(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
              fontSize: 12, color: T.textMid, background: T.bgCard, cursor: 'pointer' }}
            title="Quali fatture mostrare">
            <option value="attiva">📍 Solo sede attiva</option>
            <option value="tutte">🏢 Tutte le sedi</option>
          </select>
        )}
        <div style={{ flex: 1 }} />
        {totaliFiltrati.n > 0 && (
          <div style={{ fontSize: 12, color: T.textSoft, letterSpacing: '-0.005em', ...tnum }}>
            <strong style={{ color: T.text }}>{totaliFiltrati.n}</strong> {totaliFiltrati.n === 1 ? 'fattura' : 'fatture'} · <strong style={{ color: T.text }}>{fmtEuro(totaliFiltrati.tot)}</strong>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>Caricamento…</div>
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
      ) : totaliFiltrati.n === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          {filtro === 'scadute'     ? '🎉 Nessuna fattura scaduta. Tutto in regola.' :
           filtro === 'in_scadenza' ? 'Nessuna fattura in scadenza nei prossimi 30 giorni.' :
           filtro === 'pagate'      ? 'Nessuna fattura ancora segnata come pagata.' :
                                       'Nessuna fattura per questo filtro.'}
        </div>
      ) : (
        <div>
          {gruppiVisibili.map(k => (
            <Gruppo key={k} keyU={k} items={gruppi[k]} />
          ))}
        </div>
      )}
    </div>
  )
}
