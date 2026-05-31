// RegistroAttivita - audit log dell'organizzazione, ristrutturato 2026-05-30.
// Layout "data analyst": header + KPI strip + filtri pill + timeline raggruppata
// per giorno, color coding per operazione, CSV export. Solo titolare (RLS).
//
// Vs. versione precedente:
// - Vista timeline (raggruppata per data) invece di tabella piatta
// - 4 KPI in cima (azioni oggi/totali, utente top, tipo più frequente)
// - Chip operazione coloriati (create=verde, update=ambra, delete=rosso)
// - Mapping tabella → label user-friendly (es. user_data → "Dati operativi")
// - Quick filters per periodo (oggi/7gg/30gg/personalizzato)
// - Mobile ottimizzato (lista verticale invece di tabella overflow)

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M, tnum } from '../lib/theme'
import { todayLocal } from '../lib/dateLocal'

const PAGE = 50

const C = {
  bg: T.bg, bgCard: T.bgCard, bgSubtle: T.bgSubtle,
  red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight,
  amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.bgCard,
  border: T.border, borderStr: T.borderStr, borderSoft: T.borderSoft,
}

// Mapping operation → palette semantica
const OP_META = {
  INSERT: { label: 'CREATO',     fg: C.green,  bg: C.greenLight,  icon: '+' },
  UPDATE: { label: 'MODIFICATO', fg: '#1E40AF',bg: '#DBEAFE',     icon: '~' },
  DELETE: { label: 'ELIMINATO',  fg: C.red,    bg: C.redLight,    icon: '×' },
  TRUNCATE: { label: 'AZZERATO', fg: C.red,    bg: C.redLight,    icon: '⨉' },
}
const opPalette = (op) => OP_META[op] || { label: op || 'AZIONE', fg: C.textMid, bg: C.bgSubtle, icon: '·' }

// Mapping table → label user-friendly + icona
const TABLE_META = {
  user_data:     { label: 'Dati operativi',  icon: '📊' },
  profiles:      { label: 'Profili utente',  icon: '👤' },
  sedi:          { label: 'Sedi',            icon: '🏢' },
  organizations: { label: 'Azienda',         icon: '🏛️' },
  dipendenti:    { label: 'Dipendenti',      icon: '👥' },
  turni:         { label: 'Turni',           icon: '📅' },
  fatture_passive:{ label: 'Fatture',        icon: '🧾' },
  fornitori:     { label: 'Fornitori',       icon: '🚚' },
}
const tableMeta = (t) => TABLE_META[t] || { label: t || 'Altro', icon: '·' }

function fmtTs(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function fmtDayHeader(iso) {
  const d = new Date(iso)
  const oggi = new Date()
  const ieri = new Date(Date.now() - 86400000)
  const sameDay = (a, b) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
  if (sameDay(d, oggi)) return 'Oggi'
  if (sameDay(d, ieri)) return 'Ieri'
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function labelFromRow(r) {
  return r?.new_data?.label || r?.operation || '—'
}

function dettagliFromRow(r) {
  const nd = r?.new_data || {}
  const out = []
  if (nd.n_voci != null)       out.push(`${nd.n_voci} voci`)
  if (nd.n_sessioni != null)   out.push(`${nd.n_sessioni} sessioni`)
  if (nd.n_chiusure != null)   out.push(`${nd.n_chiusure} chiusure`)
  if (nd.n_ricette != null)    out.push(`${nd.n_ricette} ricette`)
  if (nd.n_formati != null)    out.push(`${nd.n_formati} formati`)
  if (nd.n_movimenti != null)  out.push(`${nd.n_movimenti} movimenti`)
  if (nd.n_regole != null)     out.push(`${nd.n_regole} regole`)
  if (nd.target_email)         out.push(`target: ${nd.target_email}`)
  if (nd.nome && r.table_name === 'sedi') out.push(`sede: ${nd.nome}`)
  if (nd.changes) {
    const ch = nd.changes
    for (const k of Object.keys(ch)) {
      const v = ch[k]
      if (Array.isArray(v) && v.length === 2) out.push(`${k}: ${v[0]} → ${v[1]}`)
    }
  }
  return out
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Avatar generato da email (iniziale + colore stabile da hash)
function userColor(email) {
  if (!email) return '#94A3B8'
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h << 5) - h + email.charCodeAt(i) | 0
  const palette = ['#6E0E1A', '#E84B3A', '#B45309', '#5B8FCE', '#7C3AED', '#1B7A3E', '#0EA5E9']
  return palette[Math.abs(h) % palette.length]
}
function userInitial(email) {
  return (email || '?').slice(0, 1).toUpperCase()
}

// Quick filter pill (oggi / 7gg / 30gg / personalizzato)
const PRESET_PERIODS = [
  { id: 'oggi',  label: 'Oggi',         giorni: 0  },
  { id: '7gg',   label: 'Ultimi 7 giorni',  giorni: 7  },
  { id: '30gg',  label: 'Ultimi 30 giorni', giorni: 30 },
  { id: 'all',   label: 'Tutto',        giorni: 365 },
]

export default function RegistroAttivita({ orgId, sedi = [], notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const sediMap = useMemo(
    () => Object.fromEntries((sedi || []).map(s => [s.id, s])),
    [sedi]
  )

  const today    = todayLocal()
  const sevenAgo = (() => {
    const d = new Date(Date.now() - 7 * 86400000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const [periodo, setPeriodo] = useState('7gg')
  const [utente,  setUtente]  = useState('')
  const [tabella, setTabella] = useState('')
  const [sedeId,  setSedeId]  = useState('')
  const [dataDa,  setDataDa]  = useState(sevenAgo)
  const [dataA,   setDataA]   = useState(today)
  const [q,       setQ]       = useState('')

  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage]       = useState(0)
  const [utenti, setUtenti]   = useState([])
  const [stats,  setStats]    = useState({ total: 0, oggi: 0, topUser: null, topTable: null })

  // `notify` arriva dal parent ricreato ad ogni render del Dashboard:
  // non possiamo metterlo nelle deps degli effect (riaccende la query in loop
  // e fa "tiltare" l'app). Lo conserviamo in un ref aggiornato per riferirci
  // sempre alla versione corrente senza scatenare re-run.
  const notifyRef = useRef(notify)
  useEffect(() => { notifyRef.current = notify }, [notify])

  // Cambio preset periodo → aggiorna le date
  function applicaPeriodo(id) {
    setPeriodo(id)
    if (id === 'custom') return
    const preset = PRESET_PERIODS.find(p => p.id === id)
    if (!preset) return
    const da = new Date(Date.now() - preset.giorni * 86400000).toISOString().slice(0, 10)
    setDataDa(da)
    setDataA(today)
  }

  // Carica elenco utenti
  useEffect(() => {
    if (!orgId) return
    supabase.from('profiles')
      .select('id,email,nome_completo,ruolo')
      .eq('organization_id', orgId)
      .order('email')
      .then(({ data }) => setUtenti(data || []))
  }, [orgId])

  // Carica righe + stats
  useEffect(() => {
    if (!orgId) return
    let alive = true
    setLoading(true)
    const from = page * PAGE
    const to   = from + PAGE - 1
    let qb = supabase.from('audit_log')
      .select('id,created_at,user_id,user_email,table_name,operation,new_data,row_id', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (utente)  qb = qb.eq('user_id', utente)
    if (tabella) qb = qb.eq('table_name', tabella)
    if (dataDa)  qb = qb.gte('created_at', `${dataDa}T00:00:00`)
    if (dataA)   qb = qb.lte('created_at', `${dataA}T23:59:59`)

    qb.then(({ data, error }) => {
      if (!alive) return
      if (error) {
        notifyRef.current?.(`Errore lettura registro: ${error.message}`, false)
        setRows([]); setHasMore(false)
      } else {
        let list = data || []
        if (sedeId) list = list.filter(r => r.new_data?.sede_id === sedeId)
        if (q.trim()) {
          const needle = q.trim().toLowerCase()
          list = list.filter(r =>
            labelFromRow(r).toLowerCase().includes(needle)
            || (r.user_email || '').toLowerCase().includes(needle)
            || (r.operation || '').toLowerCase().includes(needle)
          )
        }
        setRows(prev => page === 0 ? list : [...prev, ...list])
        setHasMore((data || []).length === PAGE)
      }
      setLoading(false)
    })
    return () => { alive = false }
    // notify NON va nelle deps (vedi notifyRef sopra). today è ricalcolato
    // come stringa primitiva uguale, quindi Object.is gestisce — ma per
    // sicurezza lo escludiamo pure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, utente, tabella, dataDa, dataA, sedeId, q, page])

  // Reset pagination al cambio filtro
  useEffect(() => { setPage(0) }, [utente, tabella, dataDa, dataA, sedeId, q])

  // Calcola stats sui rows attualmente caricati
  useEffect(() => {
    const oggiIso = today
    const userCount = {}, tableCount = {}
    let oggiCount = 0
    for (const r of rows) {
      const giorno = (r.created_at || '').slice(0, 10)
      if (giorno === oggiIso) oggiCount++
      const u = r.user_email || '—'
      userCount[u]  = (userCount[u]  || 0) + 1
      const t = r.table_name || '—'
      tableCount[t] = (tableCount[t] || 0) + 1
    }
    const topUser  = Object.entries(userCount).sort((a, b) => b[1] - a[1])[0]
    const topTable = Object.entries(tableCount).sort((a, b) => b[1] - a[1])[0]
    setStats({
      total: rows.length,
      oggi: oggiCount,
      topUser:  topUser  ? { email: topUser[0],  count: topUser[1] }  : null,
      topTable: topTable ? { name: topTable[0],  count: topTable[1] } : null,
    })
  }, [rows, today])

  // Raggruppa rows per giorno (timeline view)
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const day = (r.created_at || '').slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day).push(r)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const exportCsv = () => {
    const header = ['quando', 'chi', 'ruolo', 'tabella', 'operazione', 'azione', 'sede', 'dettagli']
    const lines = [header.join(',')]
    for (const r of rows) {
      const nd = r.new_data || {}
      const sede = nd.sede_id ? (sediMap[nd.sede_id]?.nome || nd.sede_id) : ''
      const det = dettagliFromRow(r).join(' · ')
      lines.push([
        fmtTs(r.created_at),
        r.user_email || '',
        nd.ruolo || '',
        tableMeta(r.table_name).label,
        r.operation || '',
        labelFromRow(r),
        sede,
        det,
      ].map(csvEscape).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registro-attivita-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasActiveFilters = utente || tabella || sedeId || q.trim()
  const resetFiltri = () => {
    setUtente(''); setTabella(''); setSedeId(''); setQ('')
    applicaPeriodo('7gg')
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      {/* HEADER SEZIONE */}
      <div style={{ marginBottom: isMobile ? 20 : 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 700, color: T.text, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Registro attività
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, maxWidth: 600 }}>
              Tutte le modifiche tracciate automaticamente: chi, quando, cosa. Solo titolare.
            </p>
          </div>
          <button onClick={exportCsv} disabled={rows.length === 0}
            style={{
              padding: '10px 16px', borderRadius: R.md,
              border: `1px solid ${T.border}`, background: T.bgCard,
              fontSize: 13, fontWeight: 500, color: rows.length ? T.textMid : T.textSoft,
              cursor: rows.length ? 'pointer' : 'not-allowed',
              letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: S.sm, opacity: rows.length ? 1 : 0.5,
            }}>
            ⬇ Esporta CSV
          </button>
        </div>

        {/* KPI STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
          {[
            { lbl: 'Azioni nel periodo', val: stats.total, sub: `${dataDa} → ${dataA}`, color: T.text, hi: true },
            { lbl: 'Azioni oggi',        val: stats.oggi,  sub: stats.oggi === 0 ? 'Nessuna attività' : 'modifiche registrate', color: T.text },
            { lbl: 'Utente più attivo',  val: stats.topUser?.email?.split('@')[0] || '—', sub: stats.topUser ? `${stats.topUser.count} azioni` : 'Nessun dato', color: T.brand },
            { lbl: 'Tipo più frequente', val: tableMeta(stats.topTable?.name).label,      sub: stats.topTable ? `${stats.topTable.count} azioni` : 'Nessun dato', color: T.amber },
          ].map((k, i) => (
            <div key={i} style={{
              background: k.hi ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
              border: `1px solid ${k.hi ? '#4A0612' : T.border}`,
              borderRadius: R.xl, padding: isMobile ? '12px 14px' : '16px 20px',
              boxShadow: k.hi ? '0 8px 22px rgba(110,14,26,0.32)' : S.sm,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: k.hi ? 'rgba(255,255,255,0.72)' : T.textSoft, marginBottom: 7 }}>{k.lbl}</div>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em',
                color: k.hi ? T.textOnDark : k.color, lineHeight: 1.1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                ...tnum }}>{k.val}</div>
              <div style={{ fontSize: 10.5, color: k.hi ? 'rgba(255,255,255,0.6)' : T.textSoft, marginTop: 5, fontWeight: 500 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* QUICK FILTERS — pill periodo + search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: T.bgSubtle, borderRadius: R.lg, border: `1px solid ${T.borderSoft}` }}>
          {PRESET_PERIODS.map(p => {
            const active = periodo === p.id
            return (
              <button key={p.id} onClick={() => applicaPeriodo(p.id)}
                style={{ padding: '6px 12px', border: 'none', cursor: 'pointer',
                  background: active ? T.bgCard : 'transparent',
                  color: active ? T.text : T.textSoft,
                  fontSize: 12, fontWeight: active ? 600 : 500,
                  borderRadius: R.md, letterSpacing: '-0.005em',
                  boxShadow: active ? S.sm : 'none',
                  transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}` }}>
                {p.label}
              </button>
            )
          })}
          <button onClick={() => setPeriodo('custom')}
            style={{ padding: '6px 12px', border: 'none', cursor: 'pointer',
              background: periodo === 'custom' ? T.bgCard : 'transparent',
              color: periodo === 'custom' ? T.text : T.textSoft,
              fontSize: 12, fontWeight: periodo === 'custom' ? 600 : 500,
              borderRadius: R.md, letterSpacing: '-0.005em',
              boxShadow: periodo === 'custom' ? S.sm : 'none' }}>
            Personalizzato
          </button>
        </div>
        {hasActiveFilters && (
          <button onClick={resetFiltri}
            style={{ padding: '6px 12px', borderRadius: R.md, border: `1px solid ${T.border}`,
              background: T.bgCard, fontSize: 12, fontWeight: 500, color: T.brand,
              cursor: 'pointer', letterSpacing: '-0.005em' }}>
            ✕ Pulisci filtri
          </button>
        )}
      </div>

      {/* FILTRI DETTAGLIATI */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
        padding: isMobile ? '14px 16px' : '16px 20px', marginBottom: 18,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(auto-fit, minmax(170px, 1fr))`,
        gap: 12, boxShadow: S.sm,
      }}>
        <div>
          <label style={{ fontSize: 9.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Cerca</label>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="es. mario, chiusura…"
            style={{ width: '100%', padding: '8px 11px', borderRadius: R.md, border: `1px solid ${T.border}`,
              fontSize: 12.5, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', letterSpacing: '-0.005em' }}/>
        </div>
        {periodo === 'custom' && (
          <>
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Da</label>
              <input type="date" value={dataDa} onChange={e => setDataDa(e.target.value)}
                style={{ width: '100%', padding: '8px 11px', borderRadius: R.md, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
            </div>
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>A</label>
              <input type="date" value={dataA} onChange={e => setDataA(e.target.value)}
                style={{ width: '100%', padding: '8px 11px', borderRadius: R.md, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
            </div>
          </>
        )}
        <div>
          <label style={{ fontSize: 9.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Utente</label>
          <select value={utente} onChange={e => setUtente(e.target.value)}
            style={{ width: '100%', padding: '8px 11px', borderRadius: R.md, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="">Tutti gli utenti</option>
            {utenti.map(u => (
              <option key={u.id} value={u.id}>
                {u.email}{u.ruolo === 'dipendente' ? ' (dip.)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 9.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Tipo dati</label>
          <select value={tabella} onChange={e => setTabella(e.target.value)}
            style={{ width: '100%', padding: '8px 11px', borderRadius: R.md, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="">Tutti i tipi</option>
            {Object.entries(TABLE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>
        {(sedi || []).length > 1 && (
          <div>
            <label style={{ fontSize: 9.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }}>Sede</label>
            <select value={sedeId} onChange={e => setSedeId(e.target.value)}
              style={{ width: '100%', padding: '8px 11px', borderRadius: R.md, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.text, background: T.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="">Tutte le sedi</option>
              {sedi.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* TIMELINE */}
      {loading && rows.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          <div style={{ marginBottom: 8, fontSize: 18 }}>⏳</div>
          Caricamento attività…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textSoft,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, boxShadow: S.sm }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6, letterSpacing: '-0.01em' }}>
            Nessuna attività trovata
          </div>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5, maxWidth: 380, margin: '0 auto' }}>
            {hasActiveFilters
              ? 'Nessun risultato con i filtri attuali. Prova a allargare il periodo o rimuovere i filtri.'
              : 'Il registro inizia a popolarsi appena qualcuno modifica i dati (produzione, cassa, magazzino, ricettario, ecc).'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(([day, events]) => (
            <div key={day}>
              {/* Header giorno */}
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10,
                padding: '6px 4px', borderBottom: `1px solid ${T.borderSoft}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '-0.005em' }}>
                  {fmtDayHeader(day)}
                </div>
                <div style={{ fontSize: 10.5, color: T.textSoft, fontWeight: 500 }}>
                  {events.length} {events.length === 1 ? 'azione' : 'azioni'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {events.map(r => {
                  const op = opPalette(r.operation)
                  const tm = tableMeta(r.table_name)
                  const nd = r.new_data || {}
                  const sedeNome = nd.sede_id ? (sediMap[nd.sede_id]?.nome || null) : null
                  const det = dettagliFromRow(r)
                  const initial = userInitial(r.user_email)
                  const ucolor  = userColor(r.user_email)
                  const isDip   = nd.ruolo === 'dipendente'

                  return (
                    <div key={r.id} style={{
                      background: T.bgCard, border: `1px solid ${T.border}`,
                      borderRadius: R.lg, padding: isMobile ? '12px 14px' : '14px 18px',
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    }}>
                      {/* Avatar utente */}
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: ucolor, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, letterSpacing: 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                      }}>{initial}</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Riga 1: utente · ora · chip operazione · chip tipo */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, letterSpacing: '-0.005em' }}>
                            {r.user_email || 'Sistema'}
                          </span>
                          {isDip && (
                            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4,
                              background: C.amberLight, color: C.amber, fontWeight: 700, letterSpacing: '0.05em' }}>
                              DIPENDENTE
                            </span>
                          )}
                          <span style={{ fontSize: 10.5, color: T.textSoft, fontVariantNumeric: 'tabular-nums' }}>
                            {fmtTime(r.created_at)}
                          </span>
                        </div>

                        {/* Riga 2: chip operazione + label azione */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: det.length > 0 ? 6 : 0 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 9px', borderRadius: 5,
                            background: op.bg, color: op.fg,
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                          }}>
                            <span style={{ fontWeight: 900 }}>{op.icon}</span> {op.label}
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 9px', borderRadius: 5,
                            background: T.bgSubtle, color: T.textMid, border: `1px solid ${T.borderSoft}`,
                            fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                          }}>
                            <span>{tm.icon}</span>{tm.label}
                          </span>
                          {sedeNome && (
                            <span style={{
                              padding: '3px 9px', borderRadius: 5,
                              background: '#EFF6FF', color: '#1E40AF',
                              fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
                            }}>
                              🏢 {sedeNome}
                            </span>
                          )}
                          <span style={{ fontSize: 12.5, color: T.text, letterSpacing: '-0.005em', fontWeight: 500 }}>
                            {labelFromRow(r)}
                          </span>
                        </div>

                        {/* Riga 3: dettagli come chip secondari */}
                        {det.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {det.map((d, i) => (
                              <span key={i} style={{
                                fontSize: 10.5, color: T.textSoft, padding: '2px 7px',
                                background: T.bgSubtle, borderRadius: 4, fontWeight: 500,
                                letterSpacing: '-0.005em',
                              }}>{d}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LOAD MORE */}
      {hasMore && (
        <div style={{ padding: 16, textAlign: 'center', marginTop: 18 }}>
          <button onClick={() => setPage(p => p + 1)} disabled={loading}
            style={{
              padding: '10px 22px', background: T.bgCard, color: T.textMid,
              border: `1px solid ${T.border}`, borderRadius: R.md,
              fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              letterSpacing: '-0.005em', boxShadow: S.sm,
            }}>
            {loading ? 'Caricamento…' : `Carica altre ${PAGE}`}
          </button>
        </div>
      )}

      {/* INFO FOOTER */}
      <div style={{ marginTop: 28, fontSize: 11.5, color: T.textSoft, lineHeight: 1.55, padding: '14px 18px',
        background: T.bgSubtle, borderRadius: R.lg, border: `1px solid ${T.borderSoft}` }}>
        🔒 Il registro traccia automaticamente ogni scrittura nei dati dell'attività (produzione, cassa, magazzino, ricettario, sedi, profili, abbonamento). I dipendenti non possono vederlo: solo il titolare.
      </div>
    </div>
  )
}
