import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const GIORNI  = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']
const MESI    = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function buildGrid(anno, mese) {
  const first   = new Date(anno, mese, 1)
  const daysInM = new Date(anno, mese+1, 0).getDate()
  const startDow = (first.getDay() + 6) % 7   // Mon=0 … Sun=6
  const cells = []
  for (let i = startDow-1; i >= 0; i--)
    cells.push({ date: new Date(anno, mese, -i), cur: false })
  for (let d = 1; d <= daysInM; d++)
    cells.push({ date: new Date(anno, mese, d), cur: true })
  while (cells.length % 7 !== 0) {
    const n = cells.length - startDow - daysInM + 1
    cells.push({ date: new Date(anno, mese+1, n), cur: false })
  }
  return cells
}

export default function CalendarioOperativo({ giornaliero, chiusure, orgId, sedeId, setView, notify, isMobile }) {
  const oggi      = useMemo(() => new Date(), [])
  const oggiStr   = useMemo(() => toISO(oggi), [oggi])
  const [anno, setAnno]   = useState(oggi.getFullYear())
  const [mese, setMese]   = useState(oggi.getMonth())
  const [sel, setSel]     = useState(null)      // selected date string
  const [note, setNote]   = useState({})        // { "YYYY-MM-DD": "testo" }
  const [notaEdit, setNotaEdit] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [noteErr, setNoteErr] = useState(false) // table might not exist yet

  // ── lookup maps ──────────────────────────────────────────────────────────────
  const prodMap = useMemo(() => {
    const m = {}
    for (const g of (giornaliero || [])) if (g.data) m[g.data] = g
    return m
  }, [giornaliero])

  const cassaMap = useMemo(() => {
    const m = {}
    for (const c of (chiusure || [])) if (c.data) m[c.data] = c
    return m
  }, [chiusure])

  // ── load notes for current month ────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    const from = `${anno}-${String(mese+1).padStart(2,'0')}-01`
    const to   = `${anno}-${String(mese+1).padStart(2,'0')}-${new Date(anno,mese+1,0).getDate()}`
    supabase.from('note_giornaliere')
      .select('data, nota')
      .eq('organization_id', orgId)
      .gte('data', from).lte('data', to)
      .then(({ data, error }) => {
        if (error) { setNoteErr(true); return }
        if (data) {
          const map = {}
          data.forEach(n => { map[n.data] = n.nota || '' })
          setNote(map)
        }
      })
  }, [orgId, sedeId, anno, mese])

  // ── calendar grid ─────────────────────────────────────────────────────────
  const grid = useMemo(() => buildGrid(anno, mese), [anno, mese])

  // ── stats for header ──────────────────────────────────────────────────────
  const { completati, totPassati, streak } = useMemo(() => {
    const daysInM = new Date(anno, mese+1, 0).getDate()
    let comp = 0, tot = 0
    for (let d = 1; d <= daysInM; d++) {
      const k = `${anno}-${String(mese+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      if (k > oggiStr) break
      tot++
      if (prodMap[k] && cassaMap[k]) comp++
    }
    // streak: consecutive complete days ending at / before today
    let s = 0
    const day = new Date(oggi)
    for (let i = 0; i < 366; i++) {
      const k = toISO(day)
      if (k > oggiStr) { day.setDate(day.getDate()-1); continue }
      if (prodMap[k] && cassaMap[k]) { s++; day.setDate(day.getDate()-1) }
      else if (k === oggiStr) { day.setDate(day.getDate()-1) } // today may still be in progress
      else break
    }
    return { completati: comp, totPassati: tot, streak: s }
  }, [prodMap, cassaMap, anno, mese, oggiStr, oggi])

  const pct = totPassati > 0 ? Math.round(completati/totPassati*100) : 0

  // ── navigation ───────────────────────────────────────────────────────────
  const prev = () => { setSel(null); if (mese===0){setMese(11);setAnno(a=>a-1)} else setMese(m=>m-1) }
  const next = () => { setSel(null); if (mese===11){setMese(0);setAnno(a=>a+1)} else setMese(m=>m+1) }

  const handleDay = useCallback((dateStr) => {
    setSel(dateStr)
    setNotaEdit(note[dateStr] || '')
  }, [note])

  // ── save note ─────────────────────────────────────────────────────────────
  const handleSalvaNota = async () => {
    if (!orgId || !sel) return
    setSavingNota(true)
    try {
      // SELECT first to handle NULL sede_id properly with upsert
      const q = supabase.from('note_giornaliere')
        .select('id').eq('organization_id', orgId).eq('data', sel)
      if (sedeId) q.eq('sede_id', sedeId); else q.is('sede_id', null)
      const { data: ex } = await q.maybeSingle()
      const payload = { organization_id: orgId, sede_id: sedeId || null, data: sel, nota: notaEdit.trim() || null }
      if (ex) {
        await supabase.from('note_giornaliere').update({ nota: payload.nota }).eq('id', ex.id)
      } else {
        await supabase.from('note_giornaliere').insert(payload)
      }
      setNote(prev => ({ ...prev, [sel]: notaEdit.trim() }))
      notify?.('✓ Nota salvata')
    } catch (e) {
      notify?.('⚠ ' + e.message, false)
    } finally { setSavingNota(false) }
  }

  // ── status ────────────────────────────────────────────────────────────────
  const STATUS = { completo:'#22C55E', parziale:'#F59E0B', vuoto:'#EF4444' }
  function getStatus(k, cur) {
    if (!cur) return null
    if (k > oggiStr) return 'futuro'
    const hp = !!prodMap[k], hc = !!cassaMap[k]
    if (hp && hc) return 'completo'
    if (hp || hc) return 'parziale'
    return 'vuoto'
  }

  // ── selected day detail ───────────────────────────────────────────────────
  const selDetail = sel ? {
    haProd:    !!prodMap[sel],
    haCassa:   !!cassaMap[sel],
    prodD:     prodMap[sel],
    cassaD:    cassaMap[sel],
    isFuture:  sel > oggiStr,
    isToday:   sel === oggiStr,
  } : null

  // ── mobile list of last 30 days ──────────────────────────────────────────
  const mobileList = useMemo(() => {
    const days = []
    const d = new Date(oggi)
    for (let i = 0; i < 30; i++) {
      days.push(toISO(d))
      d.setDate(d.getDate()-1)
    }
    return days
  }, [oggi])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: isMobile ? 'block' : 'flex', gap:24, alignItems:'flex-start', maxWidth:1100 }}>

      {/* ── MAIN CALENDAR ─────────────────────────────────────────────── */}
      <div style={{ flex:1, minWidth:0 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'#C0392B', marginBottom:6 }}>Operativo</div>
            <h1 style={{ margin:'0 0 6px', fontSize:28, fontWeight:900, color:'#1A0A08', letterSpacing:'-0.03em' }}>📅 Calendario</h1>
            <div style={{ display:'flex', gap:16, fontSize:12, color:'#9C7B76', flexWrap:'wrap' }}>
              <span>
                {completati}/{totPassati} giorni completi —{' '}
                <strong style={{ color: pct>=80?'#22C55E':pct>=50?'#F59E0B':'#EF4444' }}>{pct}%</strong>
              </span>
              {streak > 1 && <span>🔥 {streak} giorni di fila</span>}
              {streak === 1 && <span>🔥 1 giorno di fila</span>}
            </div>
          </div>
          {/* Month nav */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={prev} style={NAV_BTN}>‹</button>
            <div style={{ textAlign:'center', minWidth:120 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#1A0A08' }}>{MESI[mese]}</div>
              <div style={{ fontSize:11, color:'#9C7B76' }}>{anno}</div>
            </div>
            <button onClick={next} style={NAV_BTN}>›</button>
          </div>
        </div>

        {isMobile ? (
          /* ── Mobile list view: last 30 days ── */
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
            {mobileList.map(k => {
              const status  = getStatus(k, true)
              const isOggi  = k === oggiStr
              const isSel   = k === sel
              const prod    = prodMap[k]
              const cassa   = cassaMap[k]
              const totale  = cassa?.kpi?.totV
              const hasNota = !!note[k]
              const dotColor = STATUS[status]
              const d = new Date(k+'T12:00')
              return (
                <div key={k} onClick={() => handleDay(k)}
                  style={{
                    display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                    borderRadius:10,
                    background: isSel ? '#FEF0EE' : '#FFF',
                    border: isOggi ? '2px solid #C0392B' : isSel ? '2px solid #E07040' : '1px solid #E8DDD8',
                    cursor:'pointer', boxSizing:'border-box',
                  }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: dotColor||'#E2E8F0', flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight: isOggi?800:500, color: isOggi?'#C0392B':'#1A0A08' }}>
                      {d.toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'})}
                      {isOggi && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:'#C0392B', background:'#FEF0EE', borderRadius:4, padding:'1px 5px' }}>OGGI</span>}
                    </div>
                    <div style={{ display:'flex', gap:5, marginTop:3 }}>
                      {prod   && <Pill bg="#EAF5EE" color="#1B7A3E">🏭 Prod.</Pill>}
                      {cassa  && <Pill bg="#EFF6FF" color="#1D4ED8">💳 Cassa</Pill>}
                      {hasNota && <Pill bg="#FEF9C3" color="#92400E">📝</Pill>}
                    </div>
                  </div>
                  {totale != null && (
                    <div style={{ fontSize:12, color:'#6B4C44', fontWeight:600, flexShrink:0 }}>€{Math.round(totale)}</div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <>
          {/* Day-of-week header */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:3 }}>
            {GIORNI.map(g => (
              <div key={g} style={{ textAlign:'center', fontSize:10, fontWeight:700, padding:'4px 0',
                textTransform:'uppercase', letterSpacing:'0.05em',
                color: (g==='Sab'||g==='Dom') ? '#C0392B' : '#9C7B76' }}>
                {g}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
            {grid.map(({ date, cur }, idx) => {
              const k = toISO(date)
              const status   = getStatus(k, cur)
              const isOggi   = k === oggiStr
              const isWeek   = date.getDay()===0 || date.getDay()===6
              const isSel    = k === sel
              const prod     = prodMap[k]
              const cassa    = cassaMap[k]
              const totale   = cassa?.kpi?.totV
              const hasNota  = !!note[k]

              return (
                <div key={idx} onClick={() => cur && handleDay(k)}
                  style={{
                    borderRadius:10, padding:'7px 6px', minHeight:68,
                    background: isSel ? '#FEF0EE' : isWeek && cur ? '#FAF5F3' : cur ? '#FFF' : '#F5F5F5',
                    border: isOggi ? '2px solid #C0392B' : isSel ? '2px solid #E07040' : '1px solid #E8DDD8',
                    cursor: cur ? 'pointer' : 'default',
                    opacity: cur ? 1 : 0.28,
                    transition:'background 0.13s',
                    position:'relative', boxSizing:'border-box',
                  }}>
                  <div style={{ fontSize:13, fontWeight: isOggi?800:500, color: isOggi?'#C0392B': cur?'#1A0A08':'#BBB', marginBottom:3 }}>
                    {date.getDate()}
                  </div>
                  {status && status !== 'futuro' && (
                    <div style={{
                      position:'absolute', top:6, right:6,
                      width:8, height:8, borderRadius:'50%',
                      background: STATUS[status],
                      boxShadow: status==='completo' ? '0 0 5px rgba(34,197,94,0.55)' : 'none',
                    }} />
                  )}
                  {cur && status !== 'futuro' && (
                    <div style={{ display:'flex', gap:2, flexWrap:'wrap', marginBottom:2 }}>
                      {prod  && <Pill bg="#EAF5EE" color="#1B7A3E">🏭</Pill>}
                      {cassa && <Pill bg="#EFF6FF" color="#1D4ED8">💳</Pill>}
                      {hasNota && <Pill bg="#FEF9C3" color="#92400E">📝</Pill>}
                    </div>
                  )}
                  {totale != null && (
                    <div style={{ fontSize:9, color:'#6B4C44', fontWeight:600 }}>
                      €{Math.round(totale)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </>
        )}

        {/* Legend */}
        <div style={{ display:'flex', gap:16, marginTop:14, paddingTop:12, borderTop:'1px solid #E8DDD8', flexWrap:'wrap' }}>
          {[['#22C55E','Tutto compilato'],['#F59E0B','Parziale'],['#EF4444','Non compilato']].map(([c,l])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B4C44' }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:c }} />{l}
            </div>
          ))}
          <div style={{ fontSize:11, color:'#9C7B76' }}>🏭 Produzione · 💳 Cassa · 📝 Nota</div>
        </div>

      </div>

      {/* ── DETAIL PANEL ──────────────────────────────────────────────── */}
      {sel && selDetail && (
        <div style={{
          width: isMobile ? '100%' : 272, flexShrink:0,
          background:'#FFF', borderRadius:16, border:'1px solid #E8DDD8',
          boxShadow:'0 4px 24px rgba(0,0,0,0.08)',
          padding:20, position: isMobile ? 'static' : 'sticky', top:24,
          marginTop: isMobile ? 16 : 0,
          animation:'slideIn 0.15s ease',
        }}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1A0A08', lineHeight:1.3 }}>
                {new Date(sel+'T12:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})}
              </div>
              {selDetail.isToday && <div style={{ fontSize:10, color:'#C0392B', fontWeight:700, marginTop:2 }}>OGGI</div>}
            </div>
            <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9C7B76', fontSize:16, padding:2, lineHeight:1 }}>✕</button>
          </div>

          {/* Sections */}
          <div style={{ marginBottom:16 }}>
            {[
              { icon:'🏭', label:'Produzione', has:selDetail.haProd, view:'giornaliero',
                sub: selDetail.prodD ? `${selDetail.prodD.prodotti?.length||0} prodotti · €${Math.round(selDetail.prodD.ricavoTot||0)} stim.` : null },
              { icon:'💳', label:'Cassa', has:selDetail.haCassa, view:'chiusura',
                sub: selDetail.cassaD?.kpi ? `€${(selDetail.cassaD.kpi.totV||0).toFixed(2)} incasso` : null },
            ].map(({ icon, label, has, sub, view:v }) => (
              <div key={label} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                borderRadius:10, marginBottom:7,
                background: has ? '#F0FDF4' : selDetail.isFuture ? '#F8FAFC' : '#FEF2F2',
                border:`1px solid ${has ? '#BBF7D0' : selDetail.isFuture ? '#E2E8F0' : '#FECACA'}`,
              }}>
                <span style={{ fontSize:20, lineHeight:1 }}>{icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600,
                    color: has ? '#166534' : selDetail.isFuture ? '#64748B' : '#C0392B' }}>
                    {has ? '✅' : selDetail.isFuture ? '—' : '❌'} {label}
                  </div>
                  {sub && <div style={{ fontSize:10, color:'#6B4C44', marginTop:1 }}>{sub}</div>}
                </div>
                {!has && !selDetail.isFuture && (
                  <button onClick={()=>setView(v)} style={{
                    fontSize:10, fontWeight:700, color:'#C0392B', background:'none',
                    border:'1px solid #C0392B', borderRadius:6, padding:'3px 8px', cursor:'pointer',
                  }}>Vai →</button>
                )}
              </div>
            ))}
          </div>

          {/* Note */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6B4C44', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>
              📝 Nota del giorno
            </div>
            {noteErr ? (
              <div style={{ fontSize:11, color:'#9C7B76', background:'#F8FAFC', borderRadius:8, padding:'8px 10px' }}>
                Esegui il SQL per le note_giornaliere su Supabase per abilitare questa funzione.
              </div>
            ) : (
              <>
                <textarea
                  value={notaEdit}
                  onChange={e => setNotaEdit(e.target.value)}
                  placeholder="Aggiungi una nota…"
                  rows={3}
                  style={{
                    width:'100%', padding:'8px 10px', border:'1px solid #E8DDD8',
                    borderRadius:8, fontSize:12, resize:'vertical', fontFamily:'inherit',
                    color:'#1A0A08', background:'#FAFAFA', boxSizing:'border-box', outline:'none',
                  }}
                />
                <button
                  onClick={handleSalvaNota}
                  disabled={savingNota || notaEdit === (note[sel]||'')}
                  style={{
                    marginTop:7, width:'100%', padding:'8px 0',
                    background:'#C0392B', color:'#FFF', border:'none', borderRadius:8,
                    fontSize:12, fontWeight:700, cursor:'pointer',
                    opacity:(savingNota || notaEdit===(note[sel]||''))?0.45:1,
                    transition:'opacity 0.15s',
                  }}>
                  {savingNota ? 'Salvo…' : 'Salva nota'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation */}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

function Pill({ bg, color, children }) {
  return (
    <span style={{ fontSize:9, padding:'1px 4px', background:bg, color, borderRadius:4, fontWeight:700, lineHeight:1.4 }}>
      {children}
    </span>
  )
}

const NAV_BTN = {
  width:32, height:32, borderRadius:8, border:'1px solid #E8DDD8',
  background:'#FFF', cursor:'pointer', fontSize:16,
  display:'flex', alignItems:'center', justifyContent:'center',
  color:'#6B4C44',
}
