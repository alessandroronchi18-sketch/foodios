// RegistroAttivita - visualizza l'audit log dell'organizzazione.
// Solo titolare (la RLS lo impone lato DB; il nav qui lo nasconde al dipendente).
// Mostra chi/quando/cosa/sede/ruolo, con filtri ed export CSV.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}
const PAGE = 50

const inputS = {
  padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.borderStr}`,
  fontSize: 12, color: C.text, background: C.white, fontFamily: 'inherit',
}
const labelS = {
  fontSize: 10, fontWeight: 700, color: C.textSoft,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
}

function fmtTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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
      if (Array.isArray(v) && v.length === 2) out.push(`${k}: ${v[0]} -> ${v[1]}`)
    }
  }
  return out.join(' - ')
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function RegistroAttivita({ orgId, sedi = [], notify }) {
  const sediMap = useMemo(
    () => Object.fromEntries((sedi || []).map(s => [s.id, s])),
    [sedi]
  )

  // Filtri
  const today = new Date().toISOString().slice(0, 10)
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const [utente, setUtente]     = useState('')
  const [tabella, setTabella]   = useState('')   // user_data | profiles | sedi | organizations
  const [sedeId, setSedeId]     = useState('')
  const [dataDa, setDataDa]     = useState(sevenAgo)
  const [dataA, setDataA]       = useState(today)
  const [q, setQ]               = useState('')

  // Dati
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [hasMore, setHasMore]   = useState(false)
  const [page, setPage]         = useState(0)
  const [utenti, setUtenti]     = useState([])

  // Carica elenco utenti (per dropdown filtro)
  useEffect(() => {
    if (!orgId) return
    supabase.from('profiles')
      .select('id,email,nome_completo,ruolo')
      .eq('organization_id', orgId)
      .order('email')
      .then(({ data }) => setUtenti(data || []))
  }, [orgId])

  // Carica le righe (con filtri + paginazione)
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

    qb.then(({ data, error, count }) => {
      if (!alive) return
      if (error) {
        notify?.(`Errore lettura registro: ${error.message}`, false)
        setRows([]); setHasMore(false)
      } else {
        let list = data || []
        if (sedeId) {
          list = list.filter(r => r.new_data?.sede_id === sedeId)
        }
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
  }, [orgId, utente, tabella, dataDa, dataA, sedeId, q, page, notify])

  // Reset paginazione al cambio filtro
  useEffect(() => { setPage(0) }, [utente, tabella, dataDa, dataA, sedeId, q])

  const ruoloBadge = (ruolo) => {
    const isDip = ruolo === 'dipendente'
    return (
      <span style={{
        display: 'inline-block', padding: '2px 7px', borderRadius: 10,
        background: isDip ? C.amberLight : C.greenLight,
        color: isDip ? C.amber : C.green,
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{ruolo || 'titolare'}</span>
    )
  }

  const exportCsv = () => {
    const header = ['quando','chi','ruolo','tabella','azione','sede','dettagli']
    const lines = [header.join(',')]
    for (const r of rows) {
      const nd = r.new_data || {}
      const sede = nd.sede_id ? (sediMap[nd.sede_id]?.nome || nd.sede_id) : ''
      lines.push([
        fmtTs(r.created_at),
        r.user_email || '',
        nd.ruolo || '',
        r.table_name || '',
        labelFromRow(r),
        sede,
        dettagliFromRow(r),
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

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div>
          <label style={labelS}>Da</label>
          <input style={inputS} type="date" value={dataDa} onChange={e => setDataDa(e.target.value)}/>
        </div>
        <div>
          <label style={labelS}>A</label>
          <input style={inputS} type="date" value={dataA} onChange={e => setDataA(e.target.value)}/>
        </div>
        <div>
          <label style={labelS}>Utente</label>
          <select style={inputS} value={utente} onChange={e => setUtente(e.target.value)}>
            <option value="">Tutti</option>
            {utenti.map(u => (
              <option key={u.id} value={u.id}>
                {u.email} {u.ruolo === 'dipendente' ? ' (dip.)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelS}>Tipo</label>
          <select style={inputS} value={tabella} onChange={e => setTabella(e.target.value)}>
            <option value="">Tutti</option>
            <option value="user_data">Dati operativi</option>
            <option value="profiles">Profili</option>
            <option value="sedi">Sedi</option>
            <option value="organizations">Azienda</option>
          </select>
        </div>
        {(sedi || []).length > 1 && (
          <div>
            <label style={labelS}>Sede</label>
            <select style={inputS} value={sedeId} onChange={e => setSedeId(e.target.value)}>
              <option value="">Tutte</option>
              {sedi.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelS}>Cerca (azione, utente)</label>
            <input style={inputS} value={q} onChange={e => setQ(e.target.value)} placeholder="es. chiusura, magazzino, mario@..."/>
          </div>
          <button onClick={exportCsv} disabled={rows.length === 0}
            style={{ padding: '8px 16px', background: rows.length === 0 ? '#ccc' : C.text, color: C.white, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: rows.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            ⬇ Esporta CSV
          </button>
        </div>
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                {['Quando', 'Chi', 'Ruolo', 'Azione', 'Sede', 'Dettagli'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.textSoft }}>Caricamento…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: C.textSoft }}>Nessuna attività trovata con questi filtri.</td></tr>
              ) : rows.map((r, i) => {
                const nd = r.new_data || {}
                const sedeNome = nd.sede_id ? (sediMap[nd.sede_id]?.nome || '—') : '—'
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                    <td style={{ padding: '10px 14px', color: C.textMid, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtTs(r.created_at)}</td>
                    <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600 }}>{r.user_email || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{ruoloBadge(nd.ruolo)}</td>
                    <td style={{ padding: '10px 14px', color: C.text }}>{labelFromRow(r)}</td>
                    <td style={{ padding: '10px 14px', color: C.textMid }}>{sedeNome}</td>
                    <td style={{ padding: '10px 14px', color: C.textSoft, fontSize: 11 }}>{dettagliFromRow(r)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div style={{ padding: 14, textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => setPage(p => p + 1)} disabled={loading}
              style={{ padding: '8px 18px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {loading ? 'Caricamento…' : 'Carica altre 50'}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: C.textSoft, lineHeight: 1.6 }}>
        Il registro traccia automaticamente ogni scrittura nei dati dell'attività (produzione, cassa, magazzino, ricettario, sedi, profili, abbonamento). I dipendenti non possono vederlo: solo il titolare.
      </div>
    </div>
  )
}
