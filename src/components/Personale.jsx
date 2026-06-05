import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M, tnum, typo } from '../lib/theme'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}

function fmt(n) { return n==null?"—":`€${Number(n).toFixed(2)}` }
function fmtH(h) { return `${h.toFixed(1)}h` }

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
        {/* KPI strip rimossa: ora i totali stanno nell'header globale di Personale. */}
        {loading ? <div style={{ color:C.textSoft, fontSize:13 }}>Caricamento…</div> : lista.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>{inArchivio ? "Nessun dipendente archiviato." : "Nessun dipendente ancora."}</div>
        ) : isMobile ? lista.map(d=>(
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
        )) : lista.map(d=>(
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

function TurniTab({ orgId, notify, isMobile }) {
  const [turni, setTurni] = useState([])
  const [dipendenti, setDipendenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [week, setWeek] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1)
    return d.toISOString().slice(0,10)
  })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ dipendente_id:"", data:"", ora_inizio:"08:00", ora_fine:"16:00", note:"" })
  const [saving, setSaving] = useState(false)

  useEffect(() => { carica() }, [orgId, week])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const from = week
    const to = new Date(week); to.setDate(to.getDate()+6)
    const toStr = to.toISOString().slice(0,10)
    const [{ data:t, error:et }, { data:d, error:ed }] = await Promise.all([
      supabase.from("turni").select("*, dipendenti(nome,costo_orario)").eq("organization_id", orgId)
        .gte("data", from).lte("data", toStr).order("data").order("ora_inizio"),
      supabase.from("dipendenti").select("id,nome").eq("organization_id", orgId).eq("attivo", true).order("nome"),
    ])
    if (et || ed) notify?.("⚠ Errore caricamento turni: " + (et?.message || ed?.message), false)
    setTurni(t || [])
    setDipendenti(d || [])
    setLoading(false)
  }

  async function salvaTurno() {
    if (!form.dipendente_id || !form.data) { notify("⚠ Seleziona dipendente e data", false); return }
    if (!orgId) { notify("⚠ Profilo non pronto, riprova", false); return }
    const ore = calcOre(form.ora_inizio, form.ora_fine)
    const dip = dipendenti.find(d=>d.id===form.dipendente_id)
    const costo = ore * (dip?.costo_orario||0)
    setSaving(true)
    const { error } = await supabase.from("turni").insert({
      organization_id: orgId,
      dipendente_id: form.dipendente_id,
      data: form.data,
      ora_inizio: form.ora_inizio,
      ora_fine: form.ora_fine,
      ore: parseFloat(ore.toFixed(2)),
      costo: parseFloat(costo.toFixed(2)),
      note: form.note,
    })
    if (error) { notify("⚠ Errore: " + error.message, false) }
    else { notify("✓ Turno aggiunto"); setShowForm(false); setForm({ dipendente_id:"", data:week, ora_inizio:"08:00", ora_fine:"16:00", note:"" }) }
    setSaving(false)
    carica()
  }

  async function eliminaTurno(id) {
    if (!orgId) return
    const { error } = await supabase.from("turni").delete().eq("id", id).eq("organization_id", orgId)
    if (error) { notify("⚠ Errore eliminazione turno: " + error.message, false); return }
    notify("✓ Turno eliminato")
    carica()
  }

  function calcOre(ini, fin) {
    const [h1,m1]=ini.split(":").map(Number); const [h2,m2]=fin.split(":").map(Number)
    return Math.max(0, (h2*60+m2 - h1*60-m1)/60)
  }

  const totOre = turni.reduce((s,t)=>s+(t.ore||0), 0)
  const totCosto = turni.reduce((s,t)=>s+(t.costo||0), 0)

  const GIORNI = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"]
  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(week); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10) })

  function prevWeek() { const d=new Date(week); d.setDate(d.getDate()-7); setWeek(d.toISOString().slice(0,10)) }
  function nextWeek() { const d=new Date(week); d.setDate(d.getDate()+7); setWeek(d.toISOString().slice(0,10)) }

  const inputSt = { padding: isMobile ? "12px 14px" : "8px 10px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text }

  function apriNuovoTurno(dataIso) {
    setForm({ dipendente_id:"", data: dataIso || week, ora_inizio:"08:00", ora_fine:"16:00", note:"" })
    setShowForm(true)
  }

  return (
    <div style={{ paddingBottom: isMobile ? 80 : 0 }}>
      {/* Week nav */}
      <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 8 : 12, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={prevWeek} aria-label="Settimana precedente" style={{ padding: isMobile ? "10px 16px" : "7px 14px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize: isMobile ? 14 : 12, cursor:"pointer" }}>←{isMobile ? "" : " Prec"}</button>
        <div style={{ fontWeight:800, fontSize: isMobile ? 13 : 14, color:C.text, flex: isMobile ? 1 : "0 0 auto", textAlign: isMobile ? "center" : "left" }}>
          {new Date(week).toLocaleDateString("it-IT",{day:"2-digit",month: isMobile ? "short" : "long"})} – {new Date(weekDays[6]).toLocaleDateString("it-IT",{day:"2-digit",month: isMobile ? "short" : "long",year:"numeric"})}
        </div>
        <button onClick={nextWeek} aria-label="Settimana successiva" style={{ padding: isMobile ? "10px 16px" : "7px 14px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize: isMobile ? 14 : 12, cursor:"pointer" }}>{isMobile ? "" : "Succ "}→</button>
        {!isMobile && (
          <>
            <div style={{ marginLeft:"auto", display:"flex", gap:20 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>Ore settimana</div>
                <div style={{ fontSize:18, fontWeight:900, color:C.text }}>{fmtH(totOre)}</div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase" }}>Costo lavoro</div>
                <div style={{ fontSize:18, fontWeight:900, color:C.red, ...tnum }}>{fmt(totCosto)}</div>
              </div>
            </div>
            <button onClick={()=>setShowForm(s=>!s)}
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
          {isMobile && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:C.text }}>Nuovo turno</div>
              <button aria-label="Chiudi form turno" onClick={()=>setShowForm(false)} style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 100px 100px 1fr auto", gap: isMobile ? 12 : 10, alignItems: isMobile ? "stretch" : "end" }}>
            {[
              { lbl:"Dipendente", el: <select value={form.dipendente_id} onChange={e=>setForm(f=>({...f,dipendente_id:e.target.value}))} style={{ ...inputSt, width:"100%" }}><option value="">Seleziona…</option>{dipendenti.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select> },
              { lbl:"Data", el: <input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Inizio", el: <input type="time" value={form.ora_inizio} onChange={e=>setForm(f=>({...f,ora_inizio:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Fine", el: <input type="time" value={form.ora_fine} onChange={e=>setForm(f=>({...f,ora_fine:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Note", el: <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:" ", el: <button onClick={salvaTurno} disabled={saving} style={{ padding: isMobile ? "14px" : "9px 16px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer", width:"100%" }}>{saving?"…":"Salva"}</button> },
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

      {/* Grid settimanale (desktop) / Lista giornaliera (mobile) */}
      {loading ? <div style={{ color:C.textSoft, fontSize:13 }}>Caricamento…</div> : isMobile ? (
        <div>
          {weekDays.map((dIso, i) => {
            const turniGiorno = turni.filter(t => t.data === dIso)
            const dayDate = new Date(dIso + "T12:00:00")
            const label = `${GIORNI[i]} ${dayDate.getDate()}/${String(dayDate.getMonth()+1).padStart(2,'0')}`
            return (
              <div key={dIso} style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.textSoft, textTransform:"uppercase", marginBottom:6 }}>{label}</div>
                {turniGiorno.length === 0 ? (
                  <div style={{ fontSize:12, color:"#CBD5E1", padding:"6px 0" }}>Nessun turno</div>
                ) : turniGiorno.map(t => (
                  <div key={t.id} style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{t.dipendenti?.nome || "—"}</div>
                      <div style={{ fontSize:11, color:C.textSoft, marginTop:2 }}>{t.ora_inizio} - {t.ora_fine} · {fmtH(t.ore||0)} · {fmt(t.costo)}</div>
                    </div>
                    <button aria-label="Elimina turno" onClick={()=>eliminaTurno(t.id)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:20, padding:"4px 8px" }}>×</button>
                  </div>
                ))}
                <button onClick={()=>apriNuovoTurno(dIso)} style={{ width:"100%", padding:"8px", background:C.bg, border:`1px dashed ${C.borderStr}`, borderRadius:8, fontSize:11, color:C.textSoft, cursor:"pointer", marginTop:4 }}>
                  + Aggiungi turno
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"grid", gridTemplateColumns:"140px repeat(7,1fr)", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ padding:"10px 12px", fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em" }}>Dipendente</div>
            {weekDays.map((d,i)=>(
              <div key={d} style={{ padding:"10px 8px", fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", textAlign:"center", borderLeft:`1px solid ${C.border}` }}>
                {GIORNI[i]}<br/><span style={{ fontSize:10, fontWeight:500 }}>{new Date(d).getDate()}</span>
              </div>
            ))}
          </div>
          {dipendenti.map(dip=>{
            const turniDip = turni.filter(t=>t.dipendente_id===dip.id)
            if (!turniDip.length) return null
            return (
              <div key={dip.id} style={{ display:"grid", gridTemplateColumns:"140px repeat(7,1fr)", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ padding:"10px 12px", fontSize:11, fontWeight:700, color:C.text, display:"flex", alignItems:"center" }}>{dip.nome}</div>
                {weekDays.map(d=>{
                  const t = turniDip.find(t=>t.data===d)
                  return (
                    <div key={d} style={{ padding:"6px 4px", borderLeft:`1px solid ${C.border}`, minHeight:48 }}>
                      {t && (
                        <div style={{ background:C.redLight, borderRadius:8, padding:"5px 7px", border:`1px solid ${C.red}30` }}>
                          <div style={{ fontSize:9, fontWeight:700, color:C.red }}>{t.ora_inizio}–{t.ora_fine}</div>
                          <div style={{ fontSize:9, color:C.textSoft }}>{fmtH(t.ore||0)}</div>
                          <button aria-label="Elimina turno" onClick={()=>eliminaTurno(t.id)} style={{ fontSize:7, color:C.red, background:"transparent", border:"none", cursor:"pointer", padding:0, marginTop:2 }}>✕</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {dipendenti.every(d=>!turni.find(t=>t.dipendente_id===d.id)) && (
            <div style={{ padding:30, textAlign:"center", color:C.textSoft, fontSize:13 }}>Nessun turno per questa settimana.</div>
          )}
        </div>
      )}

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
  const [dati, setDati] = useState({ turni:[], dipendenti:[] })
  const [loading, setLoading] = useState(true)

  useEffect(() => { carica() }, [orgId, mese])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const from = mese + "-01"
    const last = new Date(mese.split("-")[0], mese.split("-")[1], 0).getDate()
    const to = `${mese}-${last}`
    const [{ data:t, error:et },{ data:d, error:ed }] = await Promise.all([
      supabase.from("turni").select("*, dipendenti(nome,ruolo)").eq("organization_id", orgId).gte("data", from).lte("data", to),
      supabase.from("dipendenti").select("*").eq("organization_id", orgId).eq("attivo", true),
    ])
    if (et || ed) console.warn("analisi costo load:", et?.message || ed?.message)
    setDati({ turni:t||[], dipendenti:d||[] })
    setLoading(false)
  }

  const { turni, dipendenti } = dati
  const totOre = turni.reduce((s,t)=>s+(t.ore||0), 0)
  const totCosto = turni.reduce((s,t)=>s+(t.costo||0), 0)
  const costoFissoMese = dipendenti.reduce((s,d)=>s+(d.costo_orario||0)*(d.ore_settimana||0)*4.33, 0)

  const byDip = turni.reduce((acc,t)=>{
    const n = t.dipendenti?.nome||"?"
    if (!acc[n]) acc[n]={ore:0,costo:0}
    acc[n].ore += t.ore||0; acc[n].costo += t.costo||0
    return acc
  }, {})

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <input type="month" value={mese} onChange={e=>setMese(e.target.value)}
          style={{ padding: isMobile ? "10px 14px" : "8px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text, width: isMobile ? "100%" : "auto" }}/>
      </div>

      {loading ? <div style={{ color:C.textSoft }}>Caricamento…</div> : (
        <>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill,minmax(180px,1fr))", gap: isMobile ? 8 : 14, marginBottom: isMobile ? 16 : 24 }}>
            {[
              { lbl:"Ore lavorate", val:fmtH(totOre), c:C.text },
              { lbl:"Costo effettivo", val:fmt(totCosto), c:C.red },
              { lbl:"Costo fisso stimato", val:fmt(costoFissoMese), c:C.amber },
              { lbl:"Dipendenti", val:dipendenti.length, c:C.text },
            ].map(({lbl,val,c})=>(
              <div key={lbl} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding: isMobile ? "12px 14px" : "16px 20px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>{lbl}</div>
                <div style={{ fontSize: isMobile ? 17 : 22, fontWeight:900, color:c, ...tnum }}>{val}</div>
              </div>
            ))}
          </div>

          {Object.keys(byDip).length > 0 && (
            <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px 20px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Per dipendente</div>
              {Object.entries(byDip).sort(([,a],[,b])=>b.costo-a.costo).map(([nome,d])=>(
                <div key={nome} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{nome}</span>
                  <div style={{ display:"flex", gap:20 }}>
                    <span style={{ fontSize:11, color:C.textSoft }}>{fmtH(d.ore)}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:C.red, ...tnum }}>{fmt(d.costo)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {Object.keys(byDip).length===0 && <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun turno registrato per questo mese.</div>}
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 700, color: T.text, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Personale
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, maxWidth: 560 }}>
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

export default function Personale({ orgId, sedeId, sedi = [], notify }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState("dipendenti")
  const TABS = [
    ["dipendenti", "Dipendenti", "👥"],
    ["turni",      "Turni",      "📅"],
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
      {tab === "analisi"    && <AnalisiCostoTab orgId={orgId} isMobile={isMobile}/>}
    </div>
  )
}
