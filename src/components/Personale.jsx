import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { sload, ssave, sloadAllSedi } from '../lib/storage'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M, tnum, typo } from '../lib/theme'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}

function fmt(n) { return n==null?"—":`€${Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}` }
function fmt0(n) { return `€${Math.round(Number(n)||0).toLocaleString('it-IT')}` }
function fmtH(h) { return `${h.toFixed(1)}h` }
// Nome completo (nome + cognome) per disambiguare gli omonimi senza ambiguità.
function etichettaNome(nome) {
  const n = String(nome || '').trim()
  return n || '—'
}

// ─── Copertura turni: sovrapposizioni + n° persone presenti per fascia oraria ──
const _toMin = s => { const [h,m] = String(s||'').split(':').map(Number); return (h||0)*60 + (m||0) }
const _hm = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
function analizzaCopertura(turniGiorno) {
  const shifts = (turniGiorno||[])
    .map(t => ({ id:t.id, nome:t.dipendenti?.nome||'—', ini:_toMin(t.ora_inizio), fin:_toMin(t.ora_fine) }))
    .filter(s => s.fin > s.ini)
    .sort((a,b)=>a.ini-b.ini)
  if (!shifts.length) return { shifts:[], overlaps:new Set(), segments:[], open:0, close:0, min:0, max:0 }
  const overlaps = new Set()
  for (let i=0;i<shifts.length;i++) for (let j=i+1;j<shifts.length;j++)
    if (shifts[i].ini < shifts[j].fin && shifts[j].ini < shifts[i].fin) { overlaps.add(shifts[i].id); overlaps.add(shifts[j].id) }
  const open = Math.min(...shifts.map(s=>s.ini)), close = Math.max(...shifts.map(s=>s.fin))
  const pts = [...new Set(shifts.flatMap(s=>[s.ini,s.fin]))].sort((a,b)=>a-b)
  const segments = []
  for (let k=0;k<pts.length-1;k++) {
    const a=pts[k], b=pts[k+1]
    segments.push({ a, b, count: shifts.filter(s=>s.ini<=a && s.fin>=b).length })
  }
  const counts = segments.map(s=>s.count)
  return { shifts, overlaps, segments, open, close, min:Math.min(...counts), max:Math.max(...counts) }
}
const _covColor = c => c===0 ? '#FCA5A5' : c===1 ? '#9AD0B4' : c===2 ? '#16A34A' : '#0B6E3D'
// Colori per dipendente (timeline turni) + packing in corsie: i turni che si
// sovrappongono finiscono in corsie diverse → si VEDE la compresenza.
const DIP_COLORS = ['#6E0E1A', '#2980B9', '#16A34A', '#C77D11', '#8E44AD', '#0E7490', '#B83280', '#475569']
function packLanes(shifts) {
  const laneEnds = []
  const placed = shifts.slice().sort((a, b) => a.ini - b.ini || a.fin - b.fin).map(s => {
    let lane = laneEnds.findIndex(end => end <= s.ini)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.fin) } else laneEnds[lane] = s.fin
    return { ...s, lane }
  })
  return { placed, nLanes: Math.max(1, laneEnds.length) }
}

function CoperturaBar({ cov, compact }) {
  if (!cov || !cov.shifts.length) return null
  return (
    <div style={{ marginTop: compact?6:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:9, color:'#8B95A7', marginBottom:3, gap:6 }}>
        <span>{_hm(cov.open)}</span>
        <span style={{ fontWeight:700, color: cov.overlaps.size ? '#D97706' : '#8B95A7', whiteSpace:'nowrap' }}>
          {cov.overlaps.size ? '⚠ sovrapposti' : `${cov.min===cov.max?cov.min:`${cov.min}–${cov.max}`} in turno`}
        </span>
        <span>{_hm(cov.close)}</span>
      </div>
      <div style={{ display:'flex', height: compact?7:10, borderRadius:5, overflow:'hidden', background:'#EEE' }}>
        {cov.segments.map((s,i)=>(
          <div key={i} title={`${_hm(s.a)}–${_hm(s.b)} · ${s.count} ${s.count===1?'persona':'persone'}`}
            style={{ flex:s.b-s.a, background:_covColor(s.count) }}/>
        ))}
      </div>
    </div>
  )
}

const TIPI_CONTRATTO = ["Full-time","Part-time","Stagionale","Collaboratore","Apprendista"]

function DipendentiTab({ orgId, sedeId, sedi = [], notify, isMobile }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome:"", ruolo:"", tipo_contratto:"Full-time", costo_orario:"", ore_settimana:40, note:"", sede_id: "" })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [scopeSede, setScopeSede] = useState('attiva')
  const [vista, setVista] = useState('attivi') // 'attivi' | 'archivio'
  const [archCount, setArchCount] = useState(0)
  const [search, setSearch] = useState('')

  // Cognome = ultima parola del nome completo (per ordinamento alfabetico).
  const cognomeKey = (n) => (n || '').trim().split(/\s+/).slice(-1)[0]?.toLowerCase() || ''
  const listaView = lista
    .filter(d => { const q = search.trim().toLowerCase(); return !q || (d.nome || '').toLowerCase().includes(q) })
    .slice()
    .sort((a, b) => cognomeKey(a.nome).localeCompare(cognomeKey(b.nome), 'it') || (a.nome || '').localeCompare(b.nome || '', 'it'))

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1
  const sediMap = Object.fromEntries((sedi || []).map(s => [s.id, s]))
  const inArchivio = vista === 'archivio'

  useEffect(() => { carica() }, [orgId, sedeId, scopeSede, vista])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    let q = supabase.from("dipendenti").select("*").eq("organization_id", orgId).eq("attivo", !inArchivio).order("nome")
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (scopeSede === 'attiva' && sedeId && UUID_RE.test(sedeId)) {
      q = q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
    }
    const { data, error } = await q
    if (error) notify?.("⚠ Errore caricamento dipendenti: " + error.message, false)
    setLista(data || [])
    // Conteggio archiviati per il badge del toggle
    const { count } = await supabase.from("dipendenti").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("attivo", false)
    setArchCount(count || 0)
    setLoading(false)
  }

  async function salva() {
    if (!form.nome.trim()) { notify("⚠ Inserisci il nome del dipendente", false); return }
    if (!orgId) { notify("⚠ Profilo non pronto, riprova", false); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      ruolo: form.ruolo.trim(),
      tipo_contratto: form.tipo_contratto,
      costo_orario: parseFloat(form.costo_orario)||0,
      ore_settimana: parseFloat(form.ore_settimana)||0,
      note: form.note,
      sede_id: form.sede_id || null,
      organization_id: orgId,
      attivo: true,
    }
    let err
    if (editId) {
      ({ error: err } = await supabase.from("dipendenti").update(payload).eq("id", editId))
    } else {
      ({ error: err } = await supabase.from("dipendenti").insert(payload))
    }
    if (err) { notify("⚠ Errore: " + err.message, false) }
    else { notify(editId ? "✓ Dipendente aggiornato" : "✓ Dipendente aggiunto"); reset() }
    setSaving(false)
    carica()
  }

  async function disattiva(id) {
    if (!orgId) return
    if (!confirm("Archiviare questo dipendente? Potrai riattivarlo dall'archivio quando vuoi.")) return
    const { error } = await supabase.from("dipendenti").update({ attivo: false }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("⚠ Errore archiviazione: " + error.message, false); return }
    notify("✓ Dipendente archiviato")
    carica()
  }

  async function riattiva(id) {
    if (!orgId) return
    const { error } = await supabase.from("dipendenti").update({ attivo: true }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("⚠ Errore riattivazione: " + error.message, false); return }
    notify("✓ Dipendente riattivato")
    carica()
  }

  function reset() { setForm({ nome:"", ruolo:"", tipo_contratto:"Full-time", costo_orario:"", ore_settimana:40, note:"", sede_id: sedeId || "" }); setEditId(null); setShowForm(false) }
  function initEdit(d) { setForm({ nome:d.nome, ruolo:d.ruolo||"", tipo_contratto:d.tipo_contratto||"Full-time", costo_orario:d.costo_orario||"", ore_settimana:d.ore_settimana||40, note:d.note||"", sede_id: d.sede_id || "" }); setEditId(d.id); if (isMobile) setShowForm(true) }

  const costoMeseTot = lista.reduce((s,d)=>s+(d.costo_orario||0)*(d.ore_settimana||0)*4.33, 0)
  const inputSt = { width:"100%", height: 40, padding: "0 12px", borderRadius: R.md, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color:C.text, background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const formVisible = !isMobile || showForm

  return (
    <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "340px 1fr", gap:24, alignItems:"start", paddingBottom: isMobile ? 80 : 0 }}>
      {/* Form */}
      {formVisible && (
      <div style={{
        background:C.bgCard,
        borderRadius: isMobile ? 0 : 12,
        padding: isMobile ? "20px 16px 100px" : "20px 24px",
        border: isMobile ? "none" : `1px solid ${C.border}`,
        boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
        position: isMobile ? "fixed" : "sticky",
        top: isMobile ? 0 : 20,
        left: isMobile ? 0 : "auto",
        right: isMobile ? 0 : "auto",
        bottom: isMobile ? 0 : "auto",
        zIndex: isMobile ? 1000 : "auto",
        overflowY: isMobile ? "auto" : "visible",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.text }}>
            {editId ? "✏️ Modifica dipendente" : "➕ Nuovo dipendente"}
          </div>
          {isMobile && (
            <button onClick={reset} aria-label="Chiudi form" style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
          )}
        </div>
        {[["Nome *","nome","text"],["Ruolo","ruolo","text"]].map(([lbl,key,type])=>(
          <div key={key} style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{lbl}</div>
            <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inputSt}/>
          </div>
        ))}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Tipo contratto</div>
          <select value={form.tipo_contratto} onChange={e=>setForm(f=>({...f,tipo_contratto:e.target.value}))} style={inputSt}>
            {TIPI_CONTRATTO.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>€/ora</div>
            <input type="number" min="0" step="0.5" value={form.costo_orario} onChange={e=>setForm(f=>({...f,costo_orario:e.target.value}))} style={inputSt}/>
          </div>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Ore/settimana</div>
            <input type="number" min="0" max="60" value={form.ore_settimana} onChange={e=>setForm(f=>({...f,ore_settimana:e.target.value}))} style={inputSt}/>
          </div>
        </div>
        {form.costo_orario && form.ore_settimana && (
          <div style={{ marginBottom:12, padding:"8px 12px", background:C.amberLight, borderRadius:8, fontSize:11, color:C.amber, fontWeight:700 }}>
            Costo mese stimato: {fmt((parseFloat(form.costo_orario)||0)*(parseFloat(form.ore_settimana)||0)*4.33)}
          </div>
        )}
        {haPiuSedi && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Sede primaria</div>
            <select value={form.sede_id} onChange={e=>setForm(f=>({...f,sede_id:e.target.value}))} style={inputSt}>
              <option value="">🏢 Tutte le sedi (azienda)</option>
              {sedi.filter(s => s.attiva !== false).map(s => (
                <option key={s.id} value={s.id}>📍 {s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Note</div>
          <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2} style={{ ...inputSt, resize:"vertical" }}/>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={salva} disabled={saving}
            style={{ flex:1, padding: isMobile ? "14px" : "10px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer" }}>
            {saving ? "…" : editId ? "Salva" : "Aggiungi"}
          </button>
          {editId && <button onClick={reset} aria-label="Annulla modifica" style={{ padding: isMobile ? "14px" : "10px 14px", background:C.white, border:`1px solid ${C.borderStr}`, borderRadius:8, fontSize: isMobile ? 14 : 12, color:C.textMid, cursor:"pointer" }}>✕</button>}
        </div>
      </div>
      )}

      {/* Lista */}
      <div>
        {/* Toggle Attivi / Archivio */}
        <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
          {[['attivi', '👥 Attivi'], ['archivio', `📦 Archivio${archCount > 0 ? ` (${archCount})` : ''}`]].map(([id, lbl]) => (
            <button key={id} onClick={() => setVista(id)}
              style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${vista === id ? C.red : C.border}`,
                background: vista === id ? C.redLight : C.white, color: vista === id ? C.red : C.textMid,
                fontSize: 11, fontWeight: vista === id ? 800 : 600, cursor: 'pointer' }}>{lbl}</button>
          ))}
        </div>
        {haPiuSedi && (
          <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
            {[['attiva','📍 Solo sede attiva'], ['tutte','🏢 Tutte le sedi']].map(([id,lbl]) => (
              <button key={id} onClick={()=>setScopeSede(id)}
                style={{ padding:'4px 10px', borderRadius: 999, border: `1px solid ${C.border}`,
                  background: scopeSede===id ? C.text : C.white, color: scopeSede===id ? C.white : C.textMid,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{lbl}</button>
            ))}
          </div>
        )}
        {/* Barra di ricerca per nome/cognome */}
        {lista.length > 0 && (
          <div style={{ position:"relative", marginBottom:10 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:13, color:C.textSoft, pointerEvents:"none" }}>🔍</span>
            <input
              type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Cerca dipendente per nome o cognome…" aria-label="Cerca dipendente"
              style={{ ...inputSt, paddingLeft:34, paddingRight: search ? 34 : 12 }}
            />
            {search && <button onClick={()=>setSearch('')} aria-label="Pulisci ricerca" style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", fontSize:14, color:C.textSoft, cursor:"pointer", padding:4 }}>✕</button>}
          </div>
        )}
        {/* KPI strip rimossa: ora i totali stanno nell'header globale di Personale. */}
        {loading ? <div style={{ color:C.textSoft, fontSize:13 }}>Caricamento…</div> : lista.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>{inArchivio ? "Nessun dipendente archiviato." : "Nessun dipendente ancora."}</div>
        ) : listaView.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun dipendente trovato per "{search}".</div>
        ) : isMobile ? listaView.map(d=>(
          <div key={d.id} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding:"12px 14px", marginBottom:8, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:14, color:C.text }}>{d.nome}</div>
                <div style={{ fontSize:12, color:C.textMid, marginTop:2 }}>{d.ruolo || "—"} · {fmt(d.costo_orario)}/h</div>
                <div style={{ fontSize:11, color:C.textSoft, marginTop:2 }}>
                  {d.ore_settimana}h/sett · <strong style={{ color:C.red }}>{fmt((d.costo_orario||0)*(d.ore_settimana||0)*4.33)}/mese</strong>
                </div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:12, background:C.amberLight, color:C.amber, whiteSpace:"nowrap" }}>{d.tipo_contratto}</span>
            </div>
            {d.note && <div style={{ fontSize:11, color:C.textSoft, marginTop:6, fontStyle:"italic" }}>{d.note}</div>}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={()=>initEdit(d)} style={{ flex:1, padding:"10px", background:C.bg, border:`1px solid ${C.borderStr}`, borderRadius:8, fontSize:12, color:C.textMid, cursor:"pointer", fontWeight:600 }}>Modifica</button>
              {inArchivio
                ? <button onClick={()=>riattiva(d.id)} style={{ flex:1, padding:"10px", background:"#ECFDF5", border:"1px solid #10B981", borderRadius:8, fontSize:12, color:"#065F46", cursor:"pointer", fontWeight:700 }}>↩ Riattiva</button>
                : <button onClick={()=>disattiva(d.id)} style={{ flex:1, padding:"10px", background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:8, fontSize:12, color:C.red, cursor:"pointer", fontWeight:600 }}>Archivia</button>}
            </div>
          </div>
        )) : listaView.map(d=>(
          <div key={d.id} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding:"14px 18px", marginBottom:10, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight:800, fontSize:13, color:C.text }}>{d.nome}</span>
                  <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:20, background:C.amberLight, color:C.amber }}>{d.tipo_contratto}</span>
                  {haPiuSedi && (
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 999,
                      background: d.sede_id ? C.amberLight : '#F1F5F9',
                      color: d.sede_id ? '#92400E' : C.textSoft, fontWeight: 700 }}>
                      {d.sede_id ? `📍 ${sediMap[d.sede_id]?.nome || 'Sede'}` : '🏢 Azienda'}
                    </span>
                  )}
                </div>
                {d.ruolo && <div style={{ fontSize:11, color:C.textMid, marginBottom:2 }}>💼 {d.ruolo}</div>}
                <div style={{ fontSize:11, color:C.textSoft }}>
                  {fmt(d.costo_orario)}/h · {d.ore_settimana}h/sett · <strong style={{ color:C.red }}>{fmt((d.costo_orario||0)*(d.ore_settimana||0)*4.33)}/mese</strong>
                </div>
                {d.note && <div style={{ fontSize:10, color:C.textSoft, marginTop:3, fontStyle:"italic" }}>{d.note}</div>}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={()=>initEdit(d)} style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize:10, color:C.textMid, cursor:"pointer" }}>✏️</button>
                {inArchivio
                  ? <button onClick={()=>riattiva(d.id)} title="Riattiva" style={{ padding:"5px 10px", borderRadius:8, border:"1px solid #10B981", background:"#ECFDF5", fontSize:10, color:"#065F46", cursor:"pointer", fontWeight:700 }}>↩ Riattiva</button>
                  : <button onClick={()=>disattiva(d.id)} title="Archivia" style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.red}40`, background:C.redLight, fontSize:10, color:C.red, cursor:"pointer" }}>📦</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isMobile && !showForm && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px", background:C.white, borderTop:`1px solid ${C.border}`, zIndex:100 }}>
          <button onClick={()=>{ reset(); setShowForm(true) }} style={{ width:"100%", padding:"14px", background:C.red, color:C.white, border:"none", borderRadius:10, fontSize:15, fontWeight:800, cursor:"pointer" }}>
            + Aggiungi dipendente
          </button>
        </div>
      )}
    </div>
  )
}

// Palette reparti: poche tinte nette e leggibili (più pulito di un colore per persona).
const REPARTO_COLORS = ['#6E0E1A', '#2563EB', '#16A34A', '#C2410C', '#7C3AED', '#0E7490']
const SENZA_REPARTO = { nome: 'Senza reparto', color: '#94A3B8' }

function TurniTab({ orgId, notify, isMobile }) {
  const [turni, setTurni] = useState([])
  const [dipendenti, setDipendenti] = useState([])
  const [organigramma, setOrganigramma] = useState({ reparti: [] })
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('settimana') // 'giorno' | 'settimana' | 'mese'
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0,10)) // giorno di riferimento
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ dipendente_id:"", data:"", ora_inizio:"08:00", ora_fine:"16:00", note:"" })
  const [editId, setEditId] = useState(null) // id turno in modifica (null = nuovo)
  const [saving, setSaving] = useState(false)

  // Lunedì della settimana che contiene `iso`.
  const isoMonday = iso => { const d = new Date(iso); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d.toISOString().slice(0,10) }
  const week = isoMonday(anchor) // compat: usato come default data nel form
  // Intervallo [from,to] in base al periodo selezionato.
  const rng = useMemo(() => {
    if (periodo === 'giorno') return { from: anchor, to: anchor }
    if (periodo === 'mese') {
      const d = new Date(anchor)
      const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0))
      return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }
    }
    const m = isoMonday(anchor); const e = new Date(m); e.setDate(e.getDate()+6)
    return { from: m, to: e.toISOString().slice(0,10) }
  }, [periodo, anchor])
  // Giorni da renderizzare nell'intervallo.
  const days = useMemo(() => {
    const out = []; const d0 = new Date(rng.from), d1 = new Date(rng.to)
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10))
    return out
  }, [rng.from, rng.to])

  useEffect(() => { carica() }, [orgId, rng.from, rng.to])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const [{ data:t, error:et }, { data:d, error:ed }, org] = await Promise.all([
      supabase.from("turni").select("*, dipendenti(nome,costo_orario)").eq("organization_id", orgId)
        .gte("data", rng.from).lte("data", rng.to).order("data").order("ora_inizio"),
      supabase.from("dipendenti").select("id,nome").eq("organization_id", orgId).eq("attivo", true).order("nome"),
      sload(SK_ORG, orgId, null).catch(() => null),
    ])
    if (et || ed) notify?.("⚠ Errore caricamento turni: " + (et?.message || ed?.message), false)
    setTurni(t || [])
    setDipendenti(d || [])
    setOrganigramma(org && Array.isArray(org.reparti) ? org : { reparti: [] })
    setLoading(false)
  }

  // Mappa dipendente → reparto (nome + colore) dall'organigramma.
  const repartoByDip = useMemo(() => {
    const m = {}
    ;(organigramma.reparti || []).forEach((r, i) => {
      const color = REPARTO_COLORS[i % REPARTO_COLORS.length]
      for (const dipId of (r.membri || [])) m[dipId] = { nome: r.nome, color }
    })
    return m
  }, [organigramma])
  const repartoDi = dipId => repartoByDip[dipId] || SENZA_REPARTO
  // Reparti effettivamente presenti (per legenda e copertura), nell'ordine dell'organigramma.
  const repartiAttivi = useMemo(() => {
    const out = (organigramma.reparti || []).map((r, i) => ({ nome: r.nome, color: REPARTO_COLORS[i % REPARTO_COLORS.length] }))
    return out
  }, [organigramma])

  function resetForm() {
    setForm({ dipendente_id:"", data:week, ora_inizio:"08:00", ora_fine:"16:00", note:"" })
    setEditId(null); setShowForm(false)
  }

  async function salvaTurno() {
    if (!form.dipendente_id || !form.data) { notify("⚠ Seleziona dipendente e data", false); return }
    if (!orgId) { notify("⚠ Profilo non pronto, riprova", false); return }
    const ore = calcOre(form.ora_inizio, form.ora_fine)
    const dip = dipendenti.find(d=>d.id===form.dipendente_id)
    const costo = ore * (dip?.costo_orario||0)
    const payload = {
      organization_id: orgId,
      dipendente_id: form.dipendente_id,
      data: form.data,
      ora_inizio: form.ora_inizio,
      ora_fine: form.ora_fine,
      ore: parseFloat(ore.toFixed(2)),
      costo: parseFloat(costo.toFixed(2)),
      note: form.note,
    }
    setSaving(true)
    const { error } = editId
      ? await supabase.from("turni").update(payload).eq("id", editId).eq("organization_id", orgId)
      : await supabase.from("turni").insert(payload)
    if (error) { notify("⚠ Errore: " + error.message, false) }
    else { notify(editId ? "✓ Turno aggiornato" : "✓ Turno aggiunto"); resetForm() }
    setSaving(false)
    carica()
  }

  async function eliminaTurno(id) {
    if (!orgId || !id) return
    const { error } = await supabase.from("turni").delete().eq("id", id).eq("organization_id", orgId)
    if (error) { notify("⚠ Errore eliminazione turno: " + error.message, false); return }
    notify("✓ Turno eliminato")
    resetForm()
    carica()
  }

  // Apre il box sopra la tabella precompilato con un turno esistente (modifica/elimina).
  function apriModificaTurno(s) {
    setForm({ dipendente_id: s.dipId || "", data: s.data, ora_inizio: _hm(s.ini), ora_fine: _hm(s.fin), note: s.note || "" })
    setEditId(s.id); setShowForm(true)
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function calcOre(ini, fin) {
    const [h1,m1]=ini.split(":").map(Number); const [h2,m2]=fin.split(":").map(Number)
    return Math.max(0, (h2*60+m2 - h1*60-m1)/60)
  }

  const totOre = turni.reduce((s,t)=>s+(t.ore||0), 0)
  const totCosto = turni.reduce((s,t)=>s+(t.costo||0), 0)

  const GIORNI = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"]
  const weekDays = days
  // Copertura/sovrapposizioni per ogni giorno renderizzato (calcolata una volta).
  const covByDay = Object.fromEntries(days.map(d => [d, analizzaCopertura(turni.filter(t => t.data === d))]))

  // Navigazione: sposta di 1 giorno / 1 settimana / 1 mese in base al periodo.
  function shiftPeriodo(dir) {
    const d = new Date(anchor)
    if (periodo === 'giorno') d.setDate(d.getDate() + dir)
    else if (periodo === 'mese') d.setMonth(d.getMonth() + dir)
    else d.setDate(d.getDate() + 7 * dir)
    setAnchor(d.toISOString().slice(0,10))
  }
  const prevWeek = () => shiftPeriodo(-1)
  const nextWeek = () => shiftPeriodo(1)
  // Etichetta dell'intervallo corrente.
  const labelPeriodo = periodo === 'giorno'
    ? new Date(anchor).toLocaleDateString("it-IT", { weekday: isMobile ? undefined : "long", day:"2-digit", month: isMobile ? "short" : "long", year:"numeric" })
    : periodo === 'mese'
    ? new Date(anchor).toLocaleDateString("it-IT", { month:"long", year:"numeric" })
    : `${new Date(rng.from).toLocaleDateString("it-IT",{day:"2-digit",month: isMobile ? "short" : "long"})} – ${new Date(rng.to).toLocaleDateString("it-IT",{day:"2-digit",month: isMobile ? "short" : "long",year:"numeric"})}`

  const inputSt = { padding: isMobile ? "12px 14px" : "8px 10px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text }

  function apriNuovoTurno(dataIso) {
    setForm({ dipendente_id:"", data: dataIso || week, ora_inizio:"08:00", ora_fine:"16:00", note:"" })
    setEditId(null); setShowForm(true)
  }

  return (
    <div style={{ paddingBottom: isMobile ? 80 : 0 }}>
      {/* Switch periodo: Giorno / Settimana / Mese */}
      <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
        <div style={{ display:"flex", background:"#F0EAE6", borderRadius:9, padding:3, gap:2 }}>
          {[["giorno","Giorno"],["settimana","Settimana"],["mese","Mese"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setPeriodo(id)}
              style={{ padding:"6px 18px", borderRadius:7, border:"none", cursor:"pointer", fontWeight:600, fontSize:11, background:periodo===id?"rgba(110,14,26,0.18)":"transparent", color:periodo===id?C.red:C.textMid, transition:"all 0.15s" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {/* Nav periodo */}
      <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 8 : 12, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={prevWeek} aria-label="Periodo precedente" style={{ padding: isMobile ? "10px 16px" : "7px 14px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize: isMobile ? 14 : 12, cursor:"pointer" }}>←{isMobile ? "" : " Prec"}</button>
        <div style={{ fontWeight:800, fontSize: isMobile ? 13 : 14, color:C.text, flex: isMobile ? 1 : "0 0 auto", textAlign: isMobile ? "center" : "left", textTransform:"capitalize" }}>
          {labelPeriodo}
        </div>
        <button onClick={nextWeek} aria-label="Periodo successivo" style={{ padding: isMobile ? "10px 16px" : "7px 14px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize: isMobile ? 14 : 12, cursor:"pointer" }}>{isMobile ? "" : "Succ "}→</button>
        {!isMobile && (
          <>
            <div style={{ marginLeft:"auto", display:"flex", gap:20 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>Ore {periodo}</div>
                <div style={{ fontSize:18, fontWeight:900, color:C.text }}>{fmtH(totOre)}</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>Costo lavoro</div>
                <div style={{ fontSize:18, fontWeight:900, color:C.red, ...tnum }}>{fmt(totCosto)}</div>
              </div>
            </div>
            <button onClick={()=> showForm ? resetForm() : apriNuovoTurno(week)}
              style={{ padding:"8px 16px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:11, cursor:"pointer" }}>
              {showForm ? "✕" : "➕ Turno"}
            </button>
          </>
        )}
      </div>

      {isMobile && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          <div style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>Ore</div>
            <div style={{ fontSize:18, fontWeight:900, color:C.text }}>{fmtH(totOre)}</div>
          </div>
          <div style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>Costo</div>
            <div style={{ fontSize:18, fontWeight:900, color:C.red, ...tnum }}>{fmt(totCosto)}</div>
          </div>
        </div>
      )}

      {showForm && (
        <div style={{
          background:"#FFF0F0",
          border: isMobile ? "none" : `1px solid ${C.red}30`,
          borderRadius: isMobile ? 0 : 10,
          padding: isMobile ? "20px 16px 100px" : "16px 20px",
          marginBottom:16,
          position: isMobile ? "fixed" : "relative",
          top: isMobile ? 0 : "auto",
          left: isMobile ? 0 : "auto",
          right: isMobile ? 0 : "auto",
          bottom: isMobile ? 0 : "auto",
          zIndex: isMobile ? 1000 : "auto",
          overflowY: isMobile ? "auto" : "visible",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: isMobile ? 16 : 10 }}>
            <div style={{ fontSize: isMobile ? 14 : 12, fontWeight:800, color:C.text }}>{editId ? "✏️ Modifica turno" : "➕ Nuovo turno"}</div>
            <button aria-label="Chiudi form turno" onClick={resetForm} style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 100px 100px 1fr auto", gap: isMobile ? 12 : 10, alignItems: isMobile ? "stretch" : "end" }}>
            {[
              { lbl:"Dipendente", el: <select value={form.dipendente_id} onChange={e=>setForm(f=>({...f,dipendente_id:e.target.value}))} style={{ ...inputSt, width:"100%" }}><option value="">Seleziona…</option>{dipendenti.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select> },
              { lbl:"Data", el: <input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Inizio", el: <input type="time" value={form.ora_inizio} onChange={e=>setForm(f=>({...f,ora_inizio:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Fine", el: <input type="time" value={form.ora_fine} onChange={e=>setForm(f=>({...f,ora_fine:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Note", el: <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:" ", el: (
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={salvaTurno} disabled={saving} style={{ flex:1, padding: isMobile ? "14px" : "9px 16px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer" }}>{saving?"…":(editId?"Aggiorna":"Salva")}</button>
                  {editId && <button onClick={()=>eliminaTurno(editId)} disabled={saving} title="Elimina turno" style={{ flexShrink:0, padding: isMobile ? "14px" : "9px 14px", background:C.white, color:C.red, border:`1px solid ${C.red}`, borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer" }}>🗑</button>}
                </div>
              ) },
            ].map(({lbl,el},i)=>(
              <div key={i}>
                <div style={{ fontSize: isMobile ? 10 : 8, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{lbl}</div>
                {el}
              </div>
            ))}
          </div>
          {form.ora_inizio && form.ora_fine && (
            <div style={{ marginTop:8, fontSize:11, color:C.amber, fontWeight:700 }}>
              Ore: {fmtH(calcOre(form.ora_inizio, form.ora_fine))}
              {form.dipendente_id && ` · Costo: ${fmt(calcOre(form.ora_inizio, form.ora_fine) * (dipendenti.find(d=>d.id===form.dipendente_id)?.costo_orario||0))}`}
            </div>
          )}
        </div>
      )}

      {/* Vista mese: calendario; Giorno/Settimana: timeline oraria */}
      {loading ? <div style={{ color:C.textSoft, fontSize:13 }}>Caricamento…</div> : periodo === 'mese' ? (() => {
        const colorById = {}; dipendenti.forEach((d) => { colorById[d.id] = repartoDi(d.id).color })
        const first = new Date(rng.from)
        const lead = (first.getDay() + 6) % 7
        const cells = [...Array(lead).fill(null), ...days]
        while (cells.length % 7 !== 0) cells.push(null)
        const todayIso = new Date().toISOString().slice(0, 10)
        return (
          <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`1px solid ${C.border}` }}>
              {GIORNI.map(g => <div key={g} style={{ padding:"8px 4px", textAlign:"center", fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>{g}</div>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
              {cells.map((dIso, idx) => {
                if (!dIso) return <div key={`e${idx}`} style={{ background:"#FAF7F5", borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minHeight: isMobile ? 64 : 88 }}/>
                const cov = covByDay[dIso]
                const ds = turni.filter(t => t.data === dIso)
                const ore = ds.reduce((s, t) => s + (t.ore || 0), 0)
                const oggi = dIso === todayIso
                const dd = new Date(dIso + "T12:00:00")
                return (
                  <div key={dIso} onClick={() => { setAnchor(dIso); setPeriodo('giorno') }} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAnchor(dIso); setPeriodo('giorno') } }}
                    title={ds.length ? `${ds.length} turni · ${fmtH(ore)} — clicca per il dettaglio` : "Nessun turno — clicca per aggiungere"}
                    style={{ borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minHeight: isMobile ? 64 : 88, padding:"6px 7px", cursor:"pointer", background: oggi ? "#FFFCF7" : "transparent" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, fontWeight:800, color: oggi ? C.red : C.text }}>{dd.getDate()}</span>
                      {ds.length > 0 && <span style={{ fontSize:9, fontWeight:700, color:C.textSoft }}>{fmtH(ore)}</span>}
                    </div>
                    {cov?.overlaps?.size > 0 && <div style={{ fontSize:8, fontWeight:700, color:C.amber, marginTop:2 }}>⚠ sovrap.</div>}
                    <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:3 }}>
                      {ds.slice(0, isMobile ? 2 : 3).map(t => (
                        <span key={t.id} style={{ fontSize:9, fontWeight:600, color:"#fff", background:colorById[t.dipendente_id] || C.red, border:"1px solid #000", borderRadius:4, padding:"1px 4px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{etichettaNome(t.dipendenti?.nome)} {_hm(_toMin(t.ora_inizio))}</span>
                      ))}
                      {ds.length > (isMobile ? 2 : 3) && <span style={{ fontSize:8, color:C.textSoft, fontWeight:700 }}>+{ds.length - (isMobile ? 2 : 3)} altri</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })() : (() => {
        const colorById = {}; dipendenti.forEach((d) => { colorById[d.id] = repartoDi(d.id).color })
        const tutte = weekDays.flatMap(d => covByDay[d].shifts)
        let aMin = 6 * 60, aMax = 20 * 60
        if (tutte.length) { aMin = Math.floor(Math.min(...tutte.map(s => s.ini)) / 60) * 60; aMax = Math.ceil(Math.max(...tutte.map(s => s.fin)) / 60) * 60 }
        const span = Math.max(120, aMax - aMin)
        const ticks = []; for (let m = aMin; m <= aMax; m += (span > 11 * 60 ? 180 : 120)) ticks.push(m)
        const labelW = isMobile ? 76 : 150
        const pos = m => `${((m - aMin) / span) * 100}%`
        const usati = dipendenti.filter(d => turni.some(t => t.dipendente_id === d.id))
        // Legenda per REPARTO (più pulita di un colore per persona): mostra solo
        // i reparti effettivamente in turno nel periodo + eventuale "Senza reparto".
        const repartiInTurno = []
        const seen = new Set()
        for (const d of usati) { const r = repartoDi(d.id); if (!seen.has(r.nome)) { seen.add(r.nome); repartiInTurno.push(r) } }
        return (
          <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            {repartiInTurno.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:isMobile?10:16, padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
                {repartiInTurno.map(r => (
                  <span key={r.nome} style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, color:C.textMid, fontWeight:700 }}>
                    <span style={{ width:11, height:11, borderRadius:3, background:r.color, flexShrink:0, border:"1px solid rgba(0,0,0,0.15)" }}/>{r.nome}
                  </span>
                ))}
              </div>
            )}
            {/* Asse orario */}
            <div style={{ display:"grid", gridTemplateColumns:`${labelW}px 1fr` }}>
              <div/>
              <div style={{ position:"relative", height:22, borderBottom:`1px solid ${C.border}` }}>
                {ticks.map(m => <span key={m} style={{ position:"absolute", left:pos(m), transform:"translateX(-50%)", top:5, fontSize:9, color:C.textSoft, fontVariantNumeric:"tabular-nums" }}>{_hm(m)}</span>)}
              </div>
            </div>
            {/* Una riga per giorno: turni come barre sull'orario, in corsie quando si sovrappongono */}
            {weekDays.map((dIso, i) => {
              const cov = covByDay[dIso]
              const dayShifts = turni.filter(t => t.data === dIso).map(t => ({ id:t.id, dipId:t.dipendente_id, nome:(t.dipendenti?.nome || "—"), data:t.data, note:t.note, ini:_toMin(t.ora_inizio), fin:_toMin(t.ora_fine), ore:t.ore })).filter(s => s.fin > s.ini)
              const { placed, nLanes } = packLanes(dayShifts)
              const rowH = nLanes * 30 + 8
              const dd = new Date(dIso + "T12:00:00")
              const oggi = dIso === new Date().toISOString().slice(0, 10)
              return (
                <div key={dIso} style={{ display:"grid", gridTemplateColumns:`${labelW}px 1fr`, borderTop:`2px solid ${C.borderStr}`, background: oggi ? "#FFFCF7" : "transparent" }}>
                  <div style={{ padding:"8px 10px", borderRight:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:12, fontWeight:800, color: oggi ? C.red : C.text }}>{GIORNI[(dd.getDay()+6)%7]} {dd.getDate()}</div>
                    <div style={{ fontSize:9, color: cov.overlaps.size ? C.amber : C.textSoft, marginTop:1, fontWeight: cov.overlaps.size ? 700 : 400 }}>
                      {dayShifts.length ? `${cov.min === cov.max ? cov.max : `${cov.min}–${cov.max}`} in turno${cov.overlaps.size ? " · ⚠ sovrap." : ""}` : "riposo"}
                    </div>
                    {/* Copertura per reparto: evidenzia i buchi (es. 0 in produzione) */}
                    {!isMobile && repartiAttivi.length > 0 && dayShifts.length > 0 && (() => {
                      const presPerRep = {}
                      for (const s of dayShifts) { const r = repartoDi(s.dipId); (presPerRep[r.nome] = presPerRep[r.nome] || new Set()).add(s.dipId) }
                      return (
                        <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:5 }}>
                          {repartiAttivi.map(r => {
                            const n = presPerRep[r.nome]?.size || 0
                            return (
                              <span key={r.nome} style={{ display:"flex", alignItems:"center", gap:5, fontSize:9, fontWeight:700, color: n === 0 ? C.amber : C.textMid }}>
                                <span style={{ width:7, height:7, borderRadius:2, background: n===0 ? "transparent" : r.color, border: n===0 ? `1px solid ${C.amber}` : "none", flexShrink:0 }}/>
                                {r.nome}: {n === 0 ? "0 ⚠" : n}
                              </span>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {!isMobile && <button onClick={() => apriNuovoTurno(dIso)} style={{ marginTop:6, fontSize:10, fontWeight:700, color:C.red, background:"transparent", border:`1px dashed ${C.red}40`, borderRadius:6, padding:"3px 8px", cursor:"pointer" }}>+ turno</button>}
                  </div>
                  <div style={{ position:"relative", height:rowH }}>
                    {ticks.map(m => <div key={m} style={{ position:"absolute", left:pos(m), top:0, bottom:0, width:1, background:"#F2ECE8" }}/>)}
                    {dayShifts.length === 0 && <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:10, color:"#CBD5E1" }}>—</div>}
                    {placed.map(s => {
                      const over = cov.overlaps.has(s.id); const col = colorById[s.dipId] || C.red
                      const selez = editId === s.id
                      return (
                        <div key={s.id} onClick={() => apriModificaTurno(s)} role="button" tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apriModificaTurno(s) } }}
                          title={`${s.nome}: ${_hm(s.ini)}–${_hm(s.fin)} (${fmtH(s.ore || 0)})${over ? " · sovrapposto" : ""} — clicca per modificare`}
                          style={{ position:"absolute", left:pos(s.ini), width:`calc(${((s.fin - s.ini) / span) * 100}% - 4px)`, top: s.lane * 30 + 5, height:26, background:col, border: selez ? "2px solid #6E0E1A" : "1.5px solid #000", borderRadius:6, color:"#fff", display:"flex", alignItems:"center", gap:4, padding:"0 6px", overflow:"hidden", cursor:"pointer", boxShadow: over ? `0 0 0 2px ${C.amber}` : "none" }}>
                          <span style={{ fontSize:10, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", flex:1 }}>{over ? "⚠ " : ""}{etichettaNome(s.nome)} · {_hm(s.ini)}–{_hm(s.fin)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {isMobile && !showForm && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px", background:C.white, borderTop:`1px solid ${C.border}`, zIndex:100 }}>
          <button onClick={()=>apriNuovoTurno(week)} style={{ width:"100%", padding:"14px", background:C.red, color:C.white, border:"none", borderRadius:10, fontSize:15, fontWeight:800, cursor:"pointer" }}>
            + Aggiungi turno
          </button>
        </div>
      )}
    </div>
  )
}

function AnalisiCostoTab({ orgId, isMobile }) {
  const [mese, setMese] = useState(() => new Date().toISOString().slice(0,7))
  const [dati, setDati] = useState({ turni:[], dipendenti:[], ricavi:0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { carica() }, [orgId, mese])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const from = mese + "-01"
    const last = new Date(mese.split("-")[0], mese.split("-")[1], 0).getDate()
    const to = `${mese}-${last}`
    const [{ data:t, error:et },{ data:d, error:ed }, chiusurePerSede] = await Promise.all([
      supabase.from("turni").select("*, dipendenti(nome,ruolo)").eq("organization_id", orgId).gte("data", from).lte("data", to),
      supabase.from("dipendenti").select("*").eq("organization_id", orgId).eq("attivo", true),
      sloadAllSedi('pasticceria-chiusure-v1', orgId).catch(() => ({})),
    ])
    if (et || ed) console.warn("analisi costo load:", et?.message || ed?.message)
    // Fatturato del mese = somma kpi.totV delle chiusure (tutte le sedi) in range.
    const ricavi = Object.values(chiusurePerSede || {}).flat()
      .filter(c => c && typeof c.data === 'string' && c.data >= from && c.data <= to)
      .reduce((s, c) => s + (c.kpi?.totV || 0), 0)
    setDati({ turni:t||[], dipendenti:d||[], ricavi })
    setLoading(false)
  }

  const { turni, dipendenti, ricavi } = dati
  const totOre = turni.reduce((s,t)=>s+(t.ore||0), 0)
  const totCosto = turni.reduce((s,t)=>s+(t.costo||0), 0)
  const costoFissoMese = dipendenti.reduce((s,d)=>s+(d.costo_orario||0)*(d.ore_settimana||0)*4.33, 0)
  const giorniLavorati = new Set(turni.map(t=>t.data)).size
  const costoMedioOra = totOre>0 ? totCosto/totOre : 0
  const costoGiorno = giorniLavorati>0 ? totCosto/giorniLavorati : 0
  // Incidenza del costo del lavoro sul fatturato: la metrica chiave nella
  // ristorazione (sano 25–35%; oltre il 40% margine a rischio).
  const incidenza = ricavi>0 ? (totCosto/ricavi*100) : null
  const incColor = incidenza==null ? C.textSoft : incidenza<=30 ? C.green : incidenza<=40 ? C.amber : C.red
  const incVerdetto = incidenza==null ? "Registra le chiusure di cassa per vedere quanto pesa il personale sugli incassi."
    : incidenza<=30 ? "Ottimo: il costo del personale è sotto controllo rispetto agli incassi."
    : incidenza<=40 ? "Sotto controllo, ma tieni d'occhio: ogni punto sopra il 30% erode il margine."
    : "Attenzione: il costo del personale è alto rispetto agli incassi. Rivedi turni o ricavi."
  // Scostamento costo effettivo (turni) vs teorico da contratto.
  const scost = totCosto - costoFissoMese
  const scostPct = costoFissoMese>0 ? (scost/costoFissoMese*100) : 0

  const byDip = turni.reduce((acc,t)=>{
    const n = t.dipendenti?.nome||"?"
    if (!acc[n]) acc[n]={ore:0,costo:0}
    acc[n].ore += t.ore||0; acc[n].costo += t.costo||0
    return acc
  }, {})
  const dipRows = Object.entries(byDip).sort(([,a],[,b])=>b.costo-a.costo)
  const maxCostoDip = Math.max(1, ...dipRows.map(([,d])=>d.costo))
  const meseLbl = new Date(mese+"-01T12:00").toLocaleDateString('it-IT',{month:'long',year:'numeric'})

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <input type="month" value={mese} onChange={e=>setMese(e.target.value)}
          style={{ padding: isMobile ? "10px 14px" : "8px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text, width: isMobile ? "100%" : "auto" }}/>
        <span style={{ fontSize:12, color:C.textSoft, textTransform:"capitalize" }}>{meseLbl}</span>
      </div>

      {loading ? <div style={{ color:C.textSoft }}>Caricamento…</div> : turni.length===0 ? (
        <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun turno registrato per {meseLbl}.</div>
      ) : (
        <>
          {/* INSIGHT CHIAVE: incidenza del costo lavoro sul fatturato */}
          <div style={{ background:"linear-gradient(135deg,#1C0A0A,#3D1515)", borderRadius:14, padding: isMobile?"18px 18px":"22px 26px", marginBottom:16, boxShadow:"0 8px 22px rgba(110,14,26,0.28)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", marginBottom:6 }}>Incidenza costo lavoro</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                  <span style={{ fontSize: isMobile?34:44, fontWeight:900, color: incidenza==null?"rgba(255,255,255,0.5)":(incidenza<=30?"#7BE0A6":incidenza<=40?"#FCD34D":"#FCA5A5"), lineHeight:1, ...tnum }}>{incidenza==null?"—":`${incidenza.toFixed(1)}%`}</span>
                  {incidenza!=null && <span style={{ fontSize:12, color:"rgba(255,255,255,0.7)" }}>del fatturato ({fmt0(ricavi)})</span>}
                </div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.82)", marginTop:10, lineHeight:1.5, maxWidth:560 }}>{incVerdetto}</div>
              </div>
              {incidenza!=null && (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <div style={{ width:64, height:64, borderRadius:"50%", background:`conic-gradient(${incidenza<=30?"#7BE0A6":incidenza<=40?"#FCD34D":"#FCA5A5"} ${Math.min(100,incidenza)*3.6}deg, rgba(255,255,255,0.12) 0)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ width:46, height:46, borderRadius:"50%", background:"#2A0E0E", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#fff" }}>{incidenza.toFixed(0)}%</div>
                  </div>
                  <span style={{ fontSize:8, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>target ≤30%</span>
                </div>
              )}
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill,minmax(160px,1fr))", gap: isMobile ? 8 : 12, marginBottom: 16 }}>
            {[
              { lbl:"Costo effettivo", val:fmt(totCosto), c:C.red, sub:`${fmtH(totOre)} lavorate` },
              { lbl:"Costo medio orario", val:fmt(costoMedioOra), c:C.text, sub:"per ora lavorata" },
              { lbl:"Costo medio / giorno", val:fmt(costoGiorno), c:C.text, sub:`${giorniLavorati} gg con turni` },
              { lbl:"Effettivo vs contratto", val:`${scost>=0?"+":""}${fmt(scost)}`, c: Math.abs(scostPct)<8?C.green:scost>0?C.red:C.amber, sub: scost>0?`+${scostPct.toFixed(0)}% (straordinari?)`:`${scostPct.toFixed(0)}% sotto teorico` },
              { lbl:"Proiezione annua", val:fmt0(costoFissoMese*12), c:C.amber, sub:"costo fisso × 12" },
            ].map(({lbl,val,c,sub})=>(
              <div key={lbl} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding: isMobile ? "12px 14px" : "14px 18px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>{lbl}</div>
                <div style={{ fontSize: isMobile ? 16 : 20, fontWeight:900, color:c, ...tnum }}>{val}</div>
                {sub && <div style={{ fontSize:9, color:C.textSoft, marginTop:3 }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Per dipendente: barra costo + €/h effettivo + % sul totale */}
          {dipRows.length > 0 && (
            <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px 20px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:14 }}>Ripartizione per dipendente</div>
              {dipRows.map(([nome,d])=>{
                const oraEff = d.ore>0 ? d.costo/d.ore : 0
                const quota = totCosto>0 ? d.costo/totCosto*100 : 0
                return (
                  <div key={nome} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10, marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{nome}</span>
                      <span style={{ display:"flex", gap:14, alignItems:"baseline" }}>
                        <span style={{ fontSize:10, color:C.textSoft }}>{fmtH(d.ore)} · {fmt(oraEff)}/h</span>
                        <span style={{ fontSize:12, fontWeight:800, color:C.red, ...tnum, minWidth:64, textAlign:"right" }}>{fmt(d.costo)}</span>
                        <span style={{ fontSize:10, color:C.textSoft, minWidth:34, textAlign:"right" }}>{quota.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div style={{ height:7, background:"#F0EAE6", borderRadius:5, overflow:"hidden" }}>
                      <div style={{ width:`${d.costo/maxCostoDip*100}%`, height:"100%", background:C.red, borderRadius:5 }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Header sezione + KPI strip globale.
// Carichiamo qui il count dipendenti attivi + costo lavoro stimato per dare
// al titolare un'idea immediata della scala (sopra le tab) senza dover entrare
// in un singolo sotto-tab.
function HeaderPersonale({ orgId, isMobile }) {
  const [dipAttivi, setDipAttivi] = useState(0)
  const [costoLavoro, setCostoLavoro] = useState(0)
  const [oreSetTot, setOreSetTot] = useState(0)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('dipendenti')
        .select('costo_orario, ore_settimana')
        .eq('organization_id', orgId).eq('attivo', true)
      if (cancelled) return
      const lista = data || []
      setDipAttivi(lista.length)
      setCostoLavoro(lista.reduce((s, d) => s + (d.costo_orario || 0) * (d.ore_settimana || 0) * 4.33, 0))
      setOreSetTot(lista.reduce((s, d) => s + (d.ore_settimana || 0), 0))
    })()
    return () => { cancelled = true }
  }, [orgId])

  const kpis = [
    { lbl: 'Dipendenti attivi', val: dipAttivi, color: T.text },
    { lbl: 'Ore settimana tot.', val: fmtH(oreSetTot), color: T.text },
    { lbl: 'Costo lavoro / mese', val: fmt(costoLavoro), color: T.brand, hi: true },
  ]

  return (
    <div style={{ marginBottom: isMobile ? 20 : 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Titolo "Personale" già mostrato dalla topbar: qui solo il sottotitolo. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, maxWidth: 560 }}>
            Dipendenti, turni settimanali, costo del lavoro. Sotto controllo in tempo reale.
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(3,minmax(200px,1fr))', gap: 10 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{
            background: k.hi ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
            border: `1px solid ${k.hi ? '#4A0612' : T.border}`,
            borderRadius: R.xl, padding: isMobile ? '14px 14px' : '18px 22px',
            boxShadow: k.hi ? '0 8px 22px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : S.sm,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: k.hi ? 'rgba(255,255,255,0.72)' : T.textSoft, marginBottom: 8 }}>{k.lbl}</div>
            <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, letterSpacing: '-0.02em',
              color: k.hi ? T.textOnDark : k.color, lineHeight: 1.1, ...tnum }}>{k.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ORGANIGRAMMA: reparti + assegnazione dipendenti, editabile dal titolare ──
const SK_ORG = 'pasticceria-organigramma-v1'
function OrganigrammaTab({ orgId, notify, isMobile }) {
  const [dip, setDip] = useState([])
  const [org, setOrg] = useState({ reparti: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('dipendenti').select('id,nome,ruolo').eq('organization_id', orgId).eq('attivo', true).order('nome')
      const saved = await sload(SK_ORG, orgId, null)
      if (cancelled) return
      setDip(data || [])
      setOrg(saved && Array.isArray(saved.reparti) ? saved : { reparti: [] })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [orgId])

  const nomeById = id => dip.find(d => d.id === id)?.nome || '—'
  const assegnati = new Set(org.reparti.flatMap(r => [r.capoId, ...(r.membri || [])]).filter(Boolean))
  const nonAssegnati = dip.filter(d => !assegnati.has(d.id))

  async function persist(next) {
    try { await ssave(SK_ORG, next, orgId, null) } catch { notify?.('⚠ Errore salvataggio organigramma', false); return }
    setOrg(next)
  }
  const update = fn => persist({ ...org, reparti: fn(org.reparti.map(r => ({ ...r, membri: [...(r.membri || [])] }))) })

  function addReparto() { const nome = (prompt('Nome del reparto (es. Laboratorio, Banco vendita, Amministrazione)') || '').trim(); if (!nome) return; update(rs => [...rs, { id: 'rep-' + Math.random().toString(36).slice(2, 8), nome, capoId: null, membri: [] }]) }
  function renameReparto(id) { const r = org.reparti.find(x => x.id === id); const nome = (prompt('Nuovo nome reparto', r?.nome) || '').trim(); if (!nome) return; update(rs => rs.map(x => x.id === id ? { ...x, nome } : x)) }
  function delReparto(id) { if (!confirm('Eliminare il reparto? I dipendenti tornano tra i non assegnati.')) return; update(rs => rs.filter(x => x.id !== id)) }
  function addMembro(repId, dipId) { if (!dipId) return; update(rs => rs.map(r => r.id === repId ? { ...r, membri: [...new Set([...(r.membri || []), dipId])] } : r)) }
  function removeMembro(repId, dipId) { update(rs => rs.map(r => r.id === repId ? { ...r, membri: (r.membri || []).filter(m => m !== dipId), capoId: r.capoId === dipId ? null : r.capoId } : r)) }
  function setCapo(repId, dipId) { update(rs => rs.map(r => r.id === repId ? { ...r, capoId: r.capoId === dipId ? null : dipId, membri: [...new Set([...(r.membri || []), dipId])] } : r)) }

  if (loading) return <div style={{ color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  const chip = (dipId, repId, isCapo) => (
    <span key={dipId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: isCapo ? C.red : '#F8F4F2', color: isCapo ? C.white : C.text, border: `1px solid ${isCapo ? C.red : C.border}`, borderRadius: 999, padding: '4px 6px 4px 11px', fontSize: 11, fontWeight: 700 }}>
      {isCapo && <span style={{ fontSize: 9 }}>★</span>}{nomeById(dipId)}
      <button onClick={() => setCapo(repId, dipId)} title={isCapo ? 'Rimuovi da responsabile' : 'Imposta come responsabile'} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: isCapo ? 'rgba(255,255,255,0.85)' : C.amber, padding: 0 }}>★</button>
      <button onClick={() => removeMembro(repId, dipId)} aria-label="Rimuovi dal reparto" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: isCapo ? 'rgba(255,255,255,0.85)' : C.textSoft, padding: 0, lineHeight: 1 }}>×</button>
    </span>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5 }}>
          Organizza il team per reparto. Il <b style={{ color: C.red }}>★</b> indica il responsabile. {nonAssegnati.length > 0 ? `${nonAssegnati.length} non ancora assegnati.` : 'Tutti assegnati.'}
        </div>
        <button onClick={addReparto} style={{ padding: '8px 16px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>+ Reparto</button>
      </div>

      {org.reparti.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textSoft, background: C.bgCard, border: `1px dashed ${C.borderStr}`, borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🗂️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Nessun reparto</div>
          <div style={{ fontSize: 12 }}>Crea il primo reparto e assegna i dipendenti per costruire l'organigramma.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {org.reparti.map(r => {
            const membriOrdinati = [...(r.membri || [])].sort((a, b) => (b === r.capoId ? 1 : 0) - (a === r.capoId ? 1 : 0) || nomeById(a).localeCompare(nomeById(b), 'it'))
            return (
              <div key={r.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'linear-gradient(135deg,#1C0A0A,#3D1515)' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.white }}>{r.nome}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => renameReparto(r.id)} title="Rinomina" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: C.white, fontSize: 11, cursor: 'pointer', padding: '3px 8px' }}>✏️</button>
                    <button onClick={() => delReparto(r.id)} title="Elimina reparto" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: C.white, fontSize: 11, cursor: 'pointer', padding: '3px 8px' }}>🗑</button>
                  </span>
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{(r.membri || []).length} {(r.membri || []).length === 1 ? 'persona' : 'persone'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                    {membriOrdinati.length === 0 && <span style={{ fontSize: 11, color: C.textSoft, fontStyle: 'italic' }}>Nessuno assegnato</span>}
                    {membriOrdinati.map(m => chip(m, r.id, m === r.capoId))}
                  </div>
                  {nonAssegnati.length > 0 && (
                    <select value="" onChange={e => addMembro(r.id, e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.textMid, background: C.white, cursor: 'pointer' }}>
                      <option value="">+ Aggiungi dipendente…</option>
                      {nonAssegnati.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {nonAssegnati.length > 0 && (
        <div style={{ marginTop: 18, padding: '14px 16px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400E', marginBottom: 8 }}>Non assegnati ({nonAssegnati.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {nonAssegnati.map(d => <span key={d.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 11px', fontSize: 11, fontWeight: 700, color: C.text }}>{d.nome}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Personale({ orgId, sedeId, sedi = [], notify }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState("dipendenti")
  const TABS = [
    ["dipendenti", "Dipendenti", "👥"],
    ["turni",      "Turni",      "📅"],
    ["organigramma", "Organigramma", "🗂️"],
    ["analisi",    "Analisi costo", "📊"],
  ]

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? 12 : 0 }}>
      <HeaderPersonale orgId={orgId} isMobile={isMobile}/>

      {/* Tab pill moderni — sostituiscono il vecchio underline tab */}
      <div style={{ display: 'flex', gap: 4, marginBottom: isMobile ? 18 : 26,
        padding: 4, background: T.bgSubtle, borderRadius: R.lg,
        border: `1px solid ${T.borderSoft}`, width: 'fit-content',
        overflowX: isMobile ? 'auto' : 'visible', maxWidth: '100%' }}>
        {TABS.map(([id, lbl, icon]) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: '8px 16px', border: 'none', cursor: 'pointer',
                background: active ? T.bgCard : 'transparent',
                color: active ? T.text : T.textSoft,
                fontSize: 13, fontWeight: active ? 600 : 500,
                borderRadius: R.md, letterSpacing: '-0.005em',
                boxShadow: active ? S.sm : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}` }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.textMid }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.textSoft }}>
              <span style={{ fontSize: 13, opacity: active ? 1 : 0.7 }}>{icon}</span>
              {lbl}
            </button>
          )
        })}
      </div>

      {tab === "dipendenti" && <DipendentiTab orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile}/>}
      {tab === "turni"      && <TurniTab      orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile}/>}
      {tab === "organigramma" && <OrganigrammaTab orgId={orgId} notify={notify} isMobile={isMobile}/>}
      {tab === "analisi"    && <AnalisiCostoTab orgId={orgId} isMobile={isMobile}/>}
    </div>
  )
}
