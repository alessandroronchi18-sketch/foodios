import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { ReactFlow, Background, Controls, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import SetPinDialog from './SetPinDialog'
import { sload, ssave, sloadAllSedi } from '../lib/storage'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { SkeletonList } from './Skeleton'
import { calcolaStipendio } from '../lib/stipendiCalc'
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
        <span style={{ fontWeight:700, color: '#8B95A7', whiteSpace:'nowrap' }}>
          {`${cov.min===cov.max?cov.min:`${cov.min}–${cov.max}`} in turno`}
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
  const confirmDialog = useConfirm()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    nome:"", ruolo:"", tipo_contratto:"Full-time", costo_orario:"", ore_settimana:40,
    stipendio_lordo_mensile:"", stipendio_netto_mensile:"",
    contratto_tipo:"", livello:"", data_assunzione:"",
    note:"", sede_id: "",
  })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Scope comandato dal selettore GLOBALE in topbar (un solo controllo, niente toggle qui):
  // sede specifica → quella + azienda; "Tutte le sedi" (sedeId assente) → tutte.
  const scopeSede = sedeId ? 'attiva' : 'tutte'
  const [vista, setVista] = useState('attivi') // 'attivi' | 'archivio'
  const [archCount, setArchCount] = useState(0)
  const [search, setSearch] = useState('')
  const [orgData, setOrgData] = useState({ reparti: [] }) // organigramma (per assegnare reparto al dipendente)

  // Cognome = ultima parola del nome completo (per ordinamento alfabetico).
  const cognomeKey = (n) => (n || '').trim().split(/\s+/).slice(-1)[0]?.toLowerCase() || ''
  const listaView = lista
    .filter(d => { const q = search.trim().toLowerCase(); return !q || (d.nome || '').toLowerCase().includes(q) })
    .slice()
    .sort((a, b) => cognomeKey(a.nome).localeCompare(cognomeKey(b.nome), 'it') || (a.nome || '').localeCompare(b.nome || '', 'it'))

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1
  const sediMap = Object.fromEntries((sedi || []).map(s => [s.id, s]))
  const inArchivio = vista === 'archivio'

  useEffect(() => { carica() }, [orgId, sedeId, vista])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    let q = supabase.from("dipendenti").select("*").eq("organization_id", orgId).eq("attivo", !inArchivio).order("nome")
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (scopeSede === 'attiva' && sedeId && UUID_RE.test(sedeId)) {
      q = q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
    }
    const { data, error } = await q
    if (error) notify?.("Errore caricamento dipendenti: " + error.message, false)
    setLista(data || [])
    // Conteggio archiviati per il badge del toggle
    const { count } = await supabase.from("dipendenti").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("attivo", false)
    setArchCount(count || 0)
    const org = await sload(SK_ORG, orgId, null).catch(() => null)
    setOrgData(org && Array.isArray(org.reparti) ? org : { reparti: [] })
    setLoading(false)
  }
  // Reparti a cui appartiene un dipendente (per popolare il form in modifica).
  const repartiDi = (dipId) => (orgData.reparti || []).filter(r => (r.membri || []).includes(dipId)).map(r => r.id)
  // Aggiorna l'organigramma: assegna dipId ai reparti scelti (max 2 = ibrido), togli dagli altri.
  async function assegnaReparti(dipId, repIds) {
    const scelti = [...new Set(repIds.filter(Boolean))]
    const reparti = (orgData.reparti || []).map(r => {
      const senza = (r.membri || []).filter(m => m !== dipId)
      const membri = scelti.includes(r.id) ? [...senza, dipId] : senza
      const capoId = r.capoId === dipId && !scelti.includes(r.id) ? null : r.capoId
      return { ...r, membri, capoId }
    })
    const next = { ...orgData, reparti }
    // Loud error: catch silenzioso nascondeva data corruption (audit M).
    try {
      await ssave(SK_ORG, next, orgId, null)
      setOrgData(next)
    } catch (e) {
      console.error('Errore salvataggio dati org:', e)
      notify('Salvataggio org fallito: ' + (e.message || 'errore sconosciuto'), false)
    }
  }

  // Numero strict: ritorna NaN se non finite o negativo, default 0.
  function numStrict(v) {
    const n = parseFloat(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  async function salva() {
    if (saving) return  // double-submit guard
    if (!form.nome.trim()) { notify("Inserisci il nome del dipendente", false); return }
    if (!orgId) { notify("Profilo non pronto, riprova", false); return }
    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        ruolo: form.ruolo.trim(),
        tipo_contratto: form.tipo_contratto,
        costo_orario: numStrict(form.costo_orario),
        ore_settimana: numStrict(form.ore_settimana),
        stipendio_lordo_mensile: numStrict(form.stipendio_lordo_mensile),
        stipendio_netto_mensile: numStrict(form.stipendio_netto_mensile),
        contratto_tipo: form.contratto_tipo || null,
        livello: form.livello || null,
        data_assunzione: form.data_assunzione || null,
        note: form.note,
        sede_id: form.sede_id || null,
        organization_id: orgId,
        attivo: true,
      }
      let err, dipId = editId
      if (editId) {
        ({ error: err } = await supabase.from("dipendenti").update(payload).eq("id", editId))
      } else {
        const { data: ins, error: e2 } = await supabase.from("dipendenti").insert(payload).select("id").single()
        err = e2; dipId = ins?.id
      }
      if (err) { notify("Errore: " + err.message, false); return }
      if (dipId) await assegnaReparti(dipId, [form.reparto1, form.reparto2])
      notify(editId ? "Dipendente aggiornato" : "Dipendente aggiunto")
      reset()
      await carica()  // attendi prima di liberare saving (rende sicuro re-edit)
    } finally {
      setSaving(false)
    }
  }

  async function disattiva(id) {
    if (!orgId) return
    const ok = await confirmDialog({
      title: 'Archiviare dipendente?',
      message: "Potrai riattivarlo dall'archivio quando vuoi. Storico turni e dati restano salvati.",
      confirmLabel: 'Archivia', cancelLabel: 'Annulla',
    })
    if (!ok) return
    const { error } = await supabase.from("dipendenti").update({ attivo: false }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore archiviazione: " + error.message, false); return }
    notify("Dipendente archiviato")
    carica()
  }

  async function riattiva(id) {
    if (!orgId) return
    const { error } = await supabase.from("dipendenti").update({ attivo: true }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore riattivazione: " + error.message, false); return }
    notify("Dipendente riattivato")
    carica()
  }

  function reset() {
    setForm({
      nome:"", ruolo:"", tipo_contratto:"Full-time", costo_orario:"", ore_settimana:40,
      stipendio_lordo_mensile:"", stipendio_netto_mensile:"",
      contratto_tipo:"", livello:"", data_assunzione:"",
      note:"", sede_id: sedeId || "", reparto1:"", reparto2:"",
    })
    setEditId(null); setShowForm(false)
  }
  function initEdit(d) {
    const reps = repartiDi(d.id)
    setForm({
      nome: d.nome, ruolo: d.ruolo || "", tipo_contratto: d.tipo_contratto || "Full-time",
      costo_orario: d.costo_orario || "", ore_settimana: d.ore_settimana || 40,
      stipendio_lordo_mensile: d.stipendio_lordo_mensile || "",
      stipendio_netto_mensile: d.stipendio_netto_mensile || "",
      contratto_tipo: d.contratto_tipo || "",
      livello: d.livello || "",
      data_assunzione: d.data_assunzione || "",
      note: d.note || "", sede_id: d.sede_id || "",
      reparto1: reps[0] || "", reparto2: reps[1] || "",
    })
    setEditId(d.id); if (isMobile) setShowForm(true)
  }

  const costoMeseTot = lista.reduce((s,d)=>s+(d.costo_orario||0)*(d.ore_settimana||0)*4.33, 0)
  const inputSt = { width:"100%", height: 40, padding: "0 12px", borderRadius: R.md, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color:C.text, background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const formVisible = !isMobile || showForm

  return (
    <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "340px 1fr", gap:24, alignItems:"start", paddingBottom: isMobile ? 80 : 0 }}>
      {/* Form */}
      {formVisible && (
      <div style={{
        background:C.bgCard,
        borderRadius: isMobile ? 0 : 16,
        padding: isMobile ? "20px 16px 100px" : "20px 24px",
        border: isMobile ? "none" : `1px solid ${C.border}`,
        boxShadow: isMobile ? "none" : "0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
        position: isMobile ? "fixed" : "sticky",
        top: isMobile ? 0 : 20,
        left: isMobile ? 0 : "auto",
        right: isMobile ? 0 : "auto",
        bottom: isMobile ? 0 : "auto",
        zIndex: isMobile ? 1000 : "auto",
        overflowY: isMobile ? "auto" : "visible",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, display:"inline-flex", alignItems:"center", gap:6 }}>
            <Icon name={editId ? "edit" : "plus"} size={15} />{editId ? "Modifica dipendente" : "Nuovo dipendente"}
          </div>
          {isMobile && (
            <button onClick={reset} aria-label="Chiudi form" style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
          )}
        </div>
        {[["Nome e cognome *","nome","text","es. Mario Rossi"],["Ruolo","ruolo","text","es. Pasticciere (facoltativo)"]].map(([lbl,key,type,ph])=>(
          <div key={key} style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{lbl}</div>
            {/* autoComplete off + name fuori-standard: evita che il browser autocompili
                il RUOLO col cognome dell'utente (bug: il cognome finiva nel ruolo). */}
            <input type={type} value={form[key]} placeholder={ph} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inputSt}
              autoComplete="off" autoCorrect="off" spellCheck={false} name={`dip_${key}_${key==='ruolo'?'x9':'x1'}`} />
          </div>
        ))}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Tipo contratto</div>
          <select value={form.tipo_contratto} onChange={e=>setForm(f=>({...f,tipo_contratto:e.target.value}))} style={inputSt}>
            {TIPI_CONTRATTO.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        {/* Reparto (serve alla copertura turni). Secondo reparto = ibrido. */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Reparto</div>
          {(orgData.reparti||[]).length===0 ? (
            <div style={{ fontSize:11, color:C.textSoft, fontStyle:"italic", padding:"8px 0" }}>Crea prima i reparti nella scheda <b>Organigramma</b>, poi potrai assegnarli qui.</div>
          ) : (<>
            <select value={form.reparto1} onChange={e=>setForm(f=>({...f, reparto1:e.target.value, reparto2: e.target.value===f.reparto2 ? "" : f.reparto2 }))} style={inputSt}>
              <option value="">— Nessun reparto —</option>
              {(orgData.reparti||[]).map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            {form.reparto1 && (orgData.reparti||[]).length>1 && (
              <select value={form.reparto2} onChange={e=>setForm(f=>({...f,reparto2:e.target.value}))} style={{ ...inputSt, marginTop:6 }}>
                <option value="">+ Ibrido con… (opzionale)</option>
                {(orgData.reparti||[]).filter(r=>r.id!==form.reparto1).map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            )}
          </>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div title="Costo orario lordo (stipendio mensile / ore mensili)" style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4, cursor: 'help' }}>€/ora</div>
            <input type="number" min="0" step="0.5" value={form.costo_orario} onChange={e=>setForm(f=>({...f,costo_orario:e.target.value}))} style={inputSt}/>
          </div>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Ore/settimana</div>
            <input type="number" min="0" max="60" value={form.ore_settimana} onChange={e=>setForm(f=>({...f,ore_settimana:e.target.value}))} style={inputSt}/>
          </div>
        </div>
        {form.costo_orario && form.ore_settimana && (
          <div style={{ marginBottom:12, padding:"8px 12px", background:C.amberLight, borderRadius:8, fontSize:11, color:C.amber, fontWeight:700 }}>
            Costo mese stimato (dal costo orario): {fmt((parseFloat(form.costo_orario)||0)*(parseFloat(form.ore_settimana)||0)*4.33)}
          </div>
        )}

        {/* STIPENDIO MENSILE + CONTRATTO */}
        <div style={{ marginBottom: 12, padding: 12, background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Stipendio mensile (in alternativa al costo orario)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Lordo (€)</div>
              <input type="number" min="0" step="10" value={form.stipendio_lordo_mensile}
                onChange={e => setForm(f => ({ ...f, stipendio_lordo_mensile: e.target.value, stipendio_netto_mensile: '' }))}
                style={inputSt} placeholder="es. 1500" />
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Netto stimato (€)</div>
              <input type="number" min="0" step="10" value={form.stipendio_netto_mensile}
                onChange={e => setForm(f => ({ ...f, stipendio_netto_mensile: e.target.value, stipendio_lordo_mensile: '' }))}
                style={inputSt} placeholder="auto" />
            </div>
          </div>
          {(form.stipendio_lordo_mensile || form.stipendio_netto_mensile) && (
            <CalcoloLordoNetto
              lordo={form.stipendio_lordo_mensile}
              netto={form.stipendio_netto_mensile}
              setForm={setForm}
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Tipo contratto</div>
              <select value={form.contratto_tipo} onChange={e => setForm(f => ({ ...f, contratto_tipo: e.target.value }))} style={inputSt}>
                <option value="">— Non specificato —</option>
                <option value="indeterminato">Indeterminato</option>
                <option value="determinato">Determinato</option>
                <option value="apprendista">Apprendista</option>
                <option value="stagionale">Stagionale</option>
                <option value="collaborazione">Collaborazione</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Livello CCNL</div>
              <input type="text" value={form.livello} onChange={e => setForm(f => ({ ...f, livello: e.target.value }))}
                style={inputSt} placeholder="es. 4S, 5, 6" />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Data assunzione (opzionale)</div>
            <input type="date" value={form.data_assunzione} onChange={e => setForm(f => ({ ...f, data_assunzione: e.target.value }))} style={inputSt} />
          </div>
          <div style={{ marginTop: 10, fontSize: 10.5, color: C.textSoft, lineHeight: 1.45 }}>
            ⚠️ I calcoli lordo↔netto sono stime semplificate (IRPEF + INPS commercio ~9,19% + addizionali 2%). Non sostituiscono il commercialista.
          </div>
        </div>
        {haPiuSedi && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Sede primaria</div>
            <select value={form.sede_id} onChange={e=>setForm(f=>({...f,sede_id:e.target.value}))} style={inputSt}>
              <option value="">Tutte le sedi (azienda)</option>
              {sedi.filter(s => s.attiva !== false).map(s => (
                <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>
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
          {[['attivi', 'Attivi', 'users'], ['archivio', `Archivio${archCount > 0 ? ` (${archCount})` : ''}`, 'package']].map(([id, lbl, icon]) => (
            <button key={id} onClick={() => setVista(id)}
              style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${vista === id ? C.red : C.border}`,
                background: vista === id ? C.redLight : C.white, color: vista === id ? C.red : C.textMid,
                fontSize: 11, fontWeight: vista === id ? 800 : 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={icon} size={13} />{lbl}</button>
          ))}
        </div>
        {/* Barra di ricerca per nome/cognome */}
        {lista.length > 0 && (
          <div style={{ position:"relative", marginBottom:10 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.textSoft, pointerEvents:"none", display:"inline-flex" }}><Icon name="search" size={14} /></span>
            <input
              type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Cerca dipendente per nome o cognome…" aria-label="Cerca dipendente"
              style={{ ...inputSt, paddingLeft:34, paddingRight: search ? 34 : 12 }}
            />
            {search && <button onClick={()=>setSearch('')} aria-label="Pulisci ricerca" style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", fontSize:14, color:C.textSoft, cursor:"pointer", padding:4 }}>✕</button>}
          </div>
        )}
        {/* KPI strip rimossa: ora i totali stanno nell'header globale di Personale. */}
        {loading ? <SkeletonList count={4} /> : lista.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>{inArchivio ? "Nessun dipendente archiviato." : "Nessun dipendente ancora."}</div>
        ) : listaView.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun dipendente trovato per "{search}".</div>
        ) : isMobile ? listaView.map(d=>(
          <div key={d.id} className="fos-tile" style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, padding:"14px 16px", marginBottom:8, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
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
          <div key={d.id} className="fos-tile" style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, padding:"16px 18px", marginBottom:10, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight:800, fontSize:13, color:C.text }}>{d.nome}</span>
                  <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:20, background:C.amberLight, color:C.amber }}>{d.tipo_contratto}</span>
                  {haPiuSedi && (
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 999,
                      background: d.sede_id ? C.amberLight : '#F1F5F9',
                      color: d.sede_id ? '#92400E' : C.textSoft, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name={d.sede_id ? "pin" : "building"} size={10} />{d.sede_id ? (sediMap[d.sede_id]?.nome || 'Sede') : 'Azienda'}
                    </span>
                  )}
                </div>
                {d.ruolo && <div style={{ fontSize:11, color:C.textMid, marginBottom:2, display:"inline-flex", alignItems:"center", gap:5 }}><Icon name="briefcase" size={12} />{d.ruolo}</div>}
                <div style={{ fontSize:11, color:C.textSoft }}>
                  {fmt(d.costo_orario)}/h · {d.ore_settimana}h/sett · <strong style={{ color:C.red }}>{fmt((d.costo_orario||0)*(d.ore_settimana||0)*4.33)}/mese</strong>
                </div>
                {d.note && <div style={{ fontSize:10, color:C.textSoft, marginTop:3, fontStyle:"italic" }}>{d.note}</div>}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={()=>initEdit(d)} title="Modifica" style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize:10, color:C.textMid, cursor:"pointer" }}><Icon name="edit" size={13} /></button>
                {inArchivio
                  ? <button onClick={()=>riattiva(d.id)} title="Riattiva" style={{ padding:"5px 10px", borderRadius:8, border:"1px solid #10B981", background:"#ECFDF5", fontSize:10, color:"#065F46", cursor:"pointer", fontWeight:700 }}>↩ Riattiva</button>
                  : <button onClick={()=>disattiva(d.id)} title="Archivia" style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.red}40`, background:C.redLight, fontSize:10, color:C.red, cursor:"pointer" }}><Icon name="package" size={13} /></button>}
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
  const confirmDialog = useConfirm()
  const [turni, setTurni] = useState([])
  const [dipendenti, setDipendenti] = useState([])
  const [organigramma, setOrganigramma] = useState({ reparti: [] })
  // Consuntivo ore effettive per turno: { [turnoId]: oreEffettive }. Salvato in
  // user_data (no migration): se non c'è valore, vale l'orario pianificato.
  const [consuntivo, setConsuntivo] = useState({})
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
    const [{ data:t, error:et }, { data:d, error:ed }, org, cons] = await Promise.all([
      supabase.from("turni").select("*, dipendenti(nome,costo_orario)").eq("organization_id", orgId)
        .gte("data", rng.from).lte("data", rng.to).order("data").order("ora_inizio"),
      supabase.from("dipendenti").select("id,nome").eq("organization_id", orgId).eq("attivo", true).order("nome"),
      sload(SK_ORG, orgId, null).catch(() => null),
      sload(SK_CONSUNTIVO, orgId, null).catch(() => null),
    ])
    if (et || ed) notify?.("Errore caricamento turni: " + (et?.message || ed?.message), false)
    setTurni(t || [])
    setDipendenti(d || [])
    setOrganigramma(org && Array.isArray(org.reparti) ? org : { reparti: [] })
    setConsuntivo(cons && typeof cons === 'object' ? cons : {})
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
    setForm({ dipendente_id:"", data:week, ora_inizio:"08:00", ora_fine:"16:00", note:"", ore_effettive:"" })
    setEditId(null); setShowForm(false)
  }

  async function salvaTurno() {
    if (!form.dipendente_id || !form.data) { notify("Seleziona dipendente e data", false); return }
    if (!orgId) { notify("Profilo non pronto, riprova", false); return }
    // Avviso sovrapposizione: stesso dipendente, stesso giorno, orari che si accavallano.
    const ni = _toMin(form.ora_inizio), nf = _toMin(form.ora_fine)
    const conflitto = turni.find(t => t.id !== editId && t.dipendente_id === form.dipendente_id && t.data === form.data && ni < _toMin(t.ora_fine) && _toMin(t.ora_inizio) < nf)
    if (conflitto) {
      const nomeDip = dipendenti.find(d => d.id === form.dipendente_id)?.nome || 'Il dipendente'
      const ok = await confirmDialog({
        title: 'Turno sovrapposto',
        message: `${nomeDip} ha già un turno il ${form.data} dalle ${_hm(_toMin(conflitto.ora_inizio))} alle ${_hm(_toMin(conflitto.ora_fine))}, che si accavalla con ${form.ora_inizio}–${form.ora_fine}. Vuoi salvarlo comunque?`,
        confirmLabel: 'Salva comunque', cancelLabel: 'Annulla',
      })
      if (!ok) return
    }
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
    if (error) { notify("Errore: " + error.message, false); setSaving(false); return }
    // Consuntivo ore effettive (solo su turno esistente): salva/aggiorna la mappa.
    if (editId) {
      const eff = parseFloat(String(form.ore_effettive).replace(',', '.'))
      const next = { ...consuntivo }
      if (Number.isFinite(eff) && eff >= 0 && Math.abs(eff - ore) > 0.001) next[editId] = parseFloat(eff.toFixed(2))
      else delete next[editId]
      try {
        await ssave(SK_CONSUNTIVO, next, orgId, null)
        setConsuntivo(next)
      } catch (e) {
        console.error('Errore salvataggio consuntivo:', e)
        notify('Salvataggio ore effettive fallito: ' + (e.message || 'riprova'), false)
      }
    }
    notify(editId ? "Turno aggiornato" : "Turno aggiunto"); resetForm()
    setSaving(false)
    carica()
  }

  async function eliminaTurno(id) {
    if (!orgId || !id) return
    const { error } = await supabase.from("turni").delete().eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore eliminazione turno: " + error.message, false); return }
    notify("Turno eliminato")
    resetForm()
    carica()
  }

  // Apre il box sopra la tabella precompilato con un turno esistente (modifica/elimina).
  function apriModificaTurno(s) {
    setForm({ dipendente_id: s.dipId || "", data: s.data, ora_inizio: _hm(s.ini), ora_fine: _hm(s.fin), note: s.note || "", ore_effettive: consuntivo[s.id] != null ? String(consuntivo[s.id]) : "" })
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
    setForm({ dipendente_id:"", data: dataIso || week, ora_inizio:"08:00", ora_fine:"16:00", note:"", ore_effettive:"" })
    setEditId(null); setShowForm(true)
  }

  return (
    <div style={{ paddingBottom: isMobile ? 80 : 0 }}>
      {/* Switch periodo: Giorno / Settimana / Mese */}
      <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
        <div style={{ display:"flex", background:T.bgSubtle, borderRadius:R.lg, padding:3, gap:2, border:`1px solid ${T.borderSoft}` }}>
          {[["giorno","Giorno"],["settimana","Settimana"],["mese","Mese"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setPeriodo(id)}
              style={{ padding:"7px 18px", borderRadius:R.md, border:"none", cursor:"pointer", fontWeight:periodo===id?600:500, fontSize:12, letterSpacing:"-0.005em", background:periodo===id?T.bgCard:"transparent", color:periodo===id?T.text:T.textSoft, boxShadow:periodo===id?S.sm:"none", transition:"all 0.15s" }}>
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
              style={{ padding:"8px 16px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:11, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 }}>
              {showForm ? "✕" : <><Icon name="plus" size={13} />Turno</>}
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
            <div style={{ fontSize: isMobile ? 14 : 12, fontWeight:800, color:C.text, display:"inline-flex", alignItems:"center", gap:6 }}><Icon name={editId ? "edit" : "plus"} size={14} />{editId ? "Modifica turno" : "Nuovo turno"}</div>
            <button aria-label="Chiudi form turno" onClick={resetForm} style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 100px 100px 1fr auto", gap: isMobile ? 12 : 10, alignItems: isMobile ? "stretch" : "end" }}>
            {[
              { lbl:"Dipendente", el: <select value={form.dipendente_id} onChange={e=>setForm(f=>({...f,dipendente_id:e.target.value}))} style={{ ...inputSt, width:"100%" }}><option value="">Seleziona…</option>{dipendenti.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select> },
              { lbl:"Data", el: <input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Inizio", el: <input type="time" value={form.ora_inizio} onChange={e=>setForm(f=>({...f,ora_inizio:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Fine", el: <input type="time" value={form.ora_fine} onChange={e=>setForm(f=>({...f,ora_fine:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              { lbl:"Note", el: <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={{ ...inputSt, width:"100%" }}/> },
              ...(editId ? [{ lbl:"Ore effettive", el: <input type="number" min="0" step="0.25" inputMode="decimal" placeholder={`pian. ${fmtH(calcOre(form.ora_inizio, form.ora_fine))}`} value={form.ore_effettive} onChange={e=>setForm(f=>({...f,ore_effettive:e.target.value}))} title="Ore realmente lavorate; se diverse dal pianificato risultano come consuntivo/straordinario" style={{ ...inputSt, width:"100%" }}/> }] : []),
              { lbl:" ", el: (
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={salvaTurno} disabled={saving} style={{ flex:1, padding: isMobile ? "14px" : "9px 16px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer" }}>{saving?"…":(editId?"Aggiorna":"Salva")}</button>
                  {editId && <button onClick={()=>eliminaTurno(editId)} disabled={saving} title="Elimina turno" style={{ flexShrink:0, padding: isMobile ? "14px" : "9px 14px", background:C.white, color:C.red, border:`1px solid ${C.red}`, borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer" }}><Icon name="trash" size={15} /></button>}
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
          <div style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)", overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`1px solid ${C.border}` }}>
              {GIORNI.map(g => <div key={g} style={{ padding:"8px 4px", textAlign:"center", fontSize: isMobile ? 11 : 10, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing: '0.06em' }}>{g}</div>)}
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
          <div style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)", overflow:"hidden" }}>
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
                    <div style={{ fontSize:9, color: C.textSoft, marginTop:1 }}>
                      {dayShifts.length ? `${cov.min === cov.max ? cov.max : `${cov.min}–${cov.max}`} in turno` : "riposo"}
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
                                {r.nome}: {n === 0 ? <>0 <Icon name="warning" size={10} /></> : n}
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
                      const col = colorById[s.dipId] || C.red
                      const selez = editId === s.id
                      const eff = consuntivo[s.id] // ore effettive consuntivate
                      const straord = eff != null ? +(eff - (s.ore || 0)).toFixed(2) : null
                      return (
                        <div key={s.id} onClick={() => apriModificaTurno(s)} role="button" tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apriModificaTurno(s) } }}
                          title={`${s.nome}: ${_hm(s.ini)}–${_hm(s.fin)} (pianificato ${fmtH(s.ore || 0)}${eff != null ? ` · effettivo ${fmtH(eff)}${straord ? ` · ${straord > 0 ? 'straord +' : ''}${straord}h` : ''}` : ''}) — clicca per modificare`}
                          style={{ position:"absolute", left:pos(s.ini), width:`calc(${((s.fin - s.ini) / span) * 100}% - 4px)`, top: s.lane * 30 + 5, height:26, background:col, border:"none", borderRadius:6, color:"#fff", display:"flex", alignItems:"center", gap:4, padding:"0 6px", overflow:"hidden", cursor:"pointer", boxShadow: selez ? "inset 0 0 0 2px rgba(255,255,255,0.95)" : "none" }}>
                          <span style={{ fontSize:10, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", flex:1 }}>{etichettaNome(s.nome)} · {_hm(s.ini)}–{_hm(s.fin)}</span>
                          {eff != null && <span title="Ore consuntivate" style={{ fontSize:8, fontWeight:800, background:straord > 0 ? "#F59E0B" : "rgba(255,255,255,0.3)", color:"#fff", borderRadius:4, padding:"0 3px", flexShrink:0 }}>{straord > 0 ? `+${straord}h` : "✓"}</span>}
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

function AnalisiCostoTab({ orgId, isMobile, isTablet }) {
  const [mese, setMese] = useState(() => new Date().toISOString().slice(0,7))
  const [target, setTarget] = useState(30) // incidenza costo-lavoro obiettivo (%)
  const [dati, setDati] = useState({ turni:[], dipendenti:[], ricavi:0, organigramma:{reparti:[]}, consuntivo:{} })
  const [loading, setLoading] = useState(true)

  useEffect(() => { carica() }, [orgId, mese])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const from = mese + "-01"
    const last = new Date(mese.split("-")[0], mese.split("-")[1], 0).getDate()
    const to = `${mese}-${last}`
    const [{ data:t, error:et },{ data:d, error:ed }, chiusurePerSede, org, cons] = await Promise.all([
      supabase.from("turni").select("*, dipendenti(nome,ruolo)").eq("organization_id", orgId).gte("data", from).lte("data", to),
      supabase.from("dipendenti").select("*").eq("organization_id", orgId).eq("attivo", true),
      sloadAllSedi('pasticceria-chiusure-v1', orgId).catch(() => ({})),
      sload(SK_ORG, orgId, null).catch(() => null),
      sload(SK_CONSUNTIVO, orgId, null).catch(() => null),
    ])
    if (et || ed) console.warn("analisi costo load:", et?.message || ed?.message)
    // Fatturato del mese = somma kpi.totV delle chiusure (tutte le sedi) in range.
    const ricavi = Object.values(chiusurePerSede || {}).flat()
      .filter(c => c && typeof c.data === 'string' && c.data >= from && c.data <= to)
      .reduce((s, c) => s + (c.kpi?.totV || 0), 0)
    setDati({ turni:t||[], dipendenti:d||[], ricavi, organigramma: (org && Array.isArray(org.reparti) ? org : {reparti:[]}), consuntivo: cons || {} })
    setLoading(false)
  }

  const { turni, dipendenti, ricavi, organigramma, consuntivo } = dati
  const totOre = turni.reduce((s,t)=>s+(t.ore||0), 0)
  const totCosto = turni.reduce((s,t)=>s+(t.costo||0), 0)
  const costoFissoMese = dipendenti.reduce((s,d)=>s+(d.costo_orario||0)*(d.ore_settimana||0)*4.33, 0)
  const giorniLavorati = new Set(turni.map(t=>t.data)).size
  const costoMedioOra = totOre>0 ? totCosto/totOre : 0
  const costoGiorno = giorniLavorati>0 ? totCosto/giorniLavorati : 0
  // Incidenza del costo del lavoro sul fatturato: la metrica chiave nella
  // ristorazione. Soglia configurabile (target).
  const incidenza = ricavi>0 ? (totCosto/ricavi*100) : null
  const incColor = incidenza==null ? C.textSoft : incidenza<=target ? C.green : incidenza<=target+10 ? C.amber : C.red
  const incVerdetto = incidenza==null ? "Registra le chiusure di cassa per vedere quanto pesa il personale sugli incassi."
    : incidenza<=target ? "Ottimo: il costo del personale è sotto controllo rispetto agli incassi."
    : incidenza<=target+10 ? `Sotto controllo, ma tieni d'occhio: ogni punto sopra il ${target}% erode il margine.`
    : "Attenzione: il costo del personale è alto rispetto agli incassi. Rivedi turni o ricavi."
  // Scostamento costo effettivo (turni) vs teorico da contratto.
  const scost = totCosto - costoFissoMese
  const scostPct = costoFissoMese>0 ? (scost/costoFissoMese*100) : 0
  // Produttività: € di fatturato per ora lavorata.
  const fatturatoPerOra = totOre>0 ? ricavi/totOre : 0
  // Pianificato vs lavorato: ore_effettive (consuntivo) vs ore pianificate dei turni.
  const oreEffettive = turni.reduce((s,t)=>s+(Number(consuntivo?.[t.id]) ?? (t.ore||0)), 0)
  const deltaOre = oreEffettive - totOre
  // Costo per reparto: somma costo turni dei membri di ogni reparto (organigramma).
  const repartoDi = {}
  for (const r of (organigramma?.reparti || [])) for (const m of (r.membri || [])) repartoDi[m] = r.nome
  const byReparto = {}
  for (const t of turni) {
    const nome = repartoDi[t.dipendente_id] || "Senza reparto"
    if (!byReparto[nome]) byReparto[nome] = { ore:0, costo:0 }
    byReparto[nome].ore += t.ore||0; byReparto[nome].costo += t.costo||0
  }
  const repRows = Object.entries(byReparto).sort(([,a],[,b])=>b.costo-a.costo)
  const maxCostoRep = Math.max(1, ...repRows.map(([,r])=>r.costo))

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
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <input type="month" value={mese} onChange={e=>setMese(e.target.value)}
          style={{ padding: isMobile ? "10px 14px" : "8px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text }}/>
        <span style={{ fontSize:12, color:C.textSoft, textTransform:"capitalize" }}>{meseLbl}</span>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:11, color:C.textSoft }}>Target incidenza</span>
        <div style={{ display:"flex", gap:2, padding:3, background:C.bgSubtle, borderRadius:8 }}>
          {[25,30,35].map(tg=>(
            <button key={tg} onClick={()=>setTarget(tg)} style={{ padding:"5px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight: target===tg?700:500, ...tnum, background: target===tg?C.bgCard:"transparent", color: target===tg?C.red:C.textSoft, boxShadow: target===tg?"0 1px 3px rgba(15,23,42,0.10)":"none" }}>{tg}%</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color:C.textSoft }}>Caricamento…</div> : turni.length===0 ? (
        <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun turno registrato per {meseLbl}.</div>
      ) : (
        <>
          {/* INSIGHT CHIAVE: incidenza del costo lavoro sul fatturato */}
          <div style={{ background:"linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)", borderRadius:18, padding: isMobile?"18px 18px":"22px 26px", marginBottom:16, boxShadow:"0 14px 34px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)" }}>
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
              { lbl:"Fatturato / ora", val: ricavi>0?fmt(fatturatoPerOra):"—", c: fatturatoPerOra>=costoMedioOra*2.5?C.green:C.text, sub:"produttività del lavoro" },
              { lbl:"Costo medio orario", val:fmt(costoMedioOra), c:C.text, sub:"per ora lavorata" },
              { lbl:"Ore piani. vs lavorate", val: fmtH(oreEffettive), c: Math.abs(deltaOre)<2?C.green:deltaOre>0?C.amber:C.text, sub: `pianificate ${fmtH(totOre)}${Math.abs(deltaOre)>=0.5?` · ${deltaOre>0?'+':''}${fmtH(deltaOre)}`:''}` },
              { lbl:"Effettivo vs contratto", val:`${scost>=0?"+":""}${fmt(scost)}`, c: Math.abs(scostPct)<8?C.green:scost>0?C.red:C.amber, sub: scost>0?`+${scostPct.toFixed(0)}% (straordinari?)`:`${scostPct.toFixed(0)}% sotto teorico` },
              { lbl:"Proiezione annua", val:fmt0(costoFissoMese*12), c:C.amber, sub:"costo fisso × 12" },
            ].map(({lbl,val,c,sub})=>(
              <div key={lbl} className="fos-tile" style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, padding: isMobile ? "14px 16px" : "16px 18px", boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
                <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>{lbl}</div>
                <div style={{ fontSize: isMobile ? 16 : 20, fontWeight:900, color:c, ...tnum }}>{val}</div>
                {sub && <div style={{ fontSize:9, color:C.textSoft, marginTop:3 }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Per dipendente: barra costo + €/h effettivo + % sul totale */}
          {dipRows.length > 0 && (
            <div style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, padding:"16px 20px", boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:14, letterSpacing:'-0.01em' }}>Ripartizione per dipendente</div>
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

          {/* Costo per reparto (da organigramma) */}
          {repRows.length > 0 && (organigramma?.reparti||[]).length > 0 && (
            <div style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, padding:"16px 20px", marginTop:16, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:14, letterSpacing:'-0.01em' }}>Costo per reparto</div>
              {repRows.map(([nome,r])=>{
                const quota = totCosto>0 ? r.costo/totCosto*100 : 0
                return (
                  <div key={nome} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10, marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color: nome==="Senza reparto"?C.textSoft:C.text }}>{nome}</span>
                      <span style={{ display:"flex", gap:14, alignItems:"baseline" }}>
                        <span style={{ fontSize:10, color:C.textSoft }}>{fmtH(r.ore)}</span>
                        <span style={{ fontSize:12, fontWeight:800, color:C.red, ...tnum, minWidth:64, textAlign:"right" }}>{fmt(r.costo)}</span>
                        <span style={{ fontSize:10, color:C.textSoft, minWidth:34, textAlign:"right" }}>{quota.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div style={{ height:7, background:"#F0EAE6", borderRadius:5, overflow:"hidden" }}>
                      <div style={{ width:`${r.costo/maxCostoRep*100}%`, height:"100%", background: nome==="Senza reparto"?C.textSoft:C.red, borderRadius:5 }}/>
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
  const mese = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const [d, setD] = useState({ nDip: 0, costoContratto: 0, costoMese: 0, ricavi: 0, oreMese: 0, nonAssegnati: 0, repartiScoperti: [], hasReparti: false })

  useEffect(() => {
    if (!orgId) return
    let alive = true
    ;(async () => {
      const from = mese + '-01'
      const [y, m] = mese.split('-')
      const last = new Date(Number(y), Number(m), 0).getDate()
      const to = `${mese}-${last}`
      const [dip, turniRes, chius, org] = await Promise.all([
        supabase.from('dipendenti').select('id,costo_orario,ore_settimana').eq('organization_id', orgId).eq('attivo', true),
        supabase.from('turni').select('costo,ore,dipendente_id').eq('organization_id', orgId).gte('data', from).lte('data', to),
        sloadAllSedi('pasticceria-chiusure-v1', orgId).catch(() => ({})),
        sload(SK_ORG, orgId, null).catch(() => null),
      ])
      if (!alive) return
      const lista = dip.data || []
      const turni = turniRes.data || []
      const reparti = (org && Array.isArray(org.reparti)) ? org.reparti : []
      const assegnati = new Set(reparti.flatMap(r => r.membri || []))
      setD({
        nDip: lista.length,
        costoContratto: lista.reduce((s, x) => s + (x.costo_orario || 0) * (x.ore_settimana || 0) * 4.33, 0),
        costoMese: turni.reduce((s, t) => s + (t.costo || 0), 0),
        oreMese: turni.reduce((s, t) => s + (t.ore || 0), 0),
        ricavi: Object.values(chius || {}).flat().filter(c => c && typeof c.data === 'string' && c.data >= from && c.data <= to).reduce((s, c) => s + (c.kpi?.totV || 0), 0),
        nonAssegnati: lista.filter(x => !assegnati.has(x.id)).length,
        repartiScoperti: reparti.filter(r => !(r.membri || []).length).map(r => r.nome),
        hasReparti: reparti.length > 0,
      })
    })()
    return () => { alive = false }
  }, [orgId, mese])

  const costo = d.costoMese > 0 ? d.costoMese : d.costoContratto
  const incidenza = d.ricavi > 0 ? costo / d.ricavi * 100 : null
  const incColor = incidenza == null ? T.textSoft : incidenza <= 30 ? T.green : incidenza <= 40 ? T.amber : T.brand
  const prod = d.oreMese > 0 ? d.ricavi / d.oreMese : 0
  const meseLbl = new Date(mese + '-01T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  const kpis = [
    { lbl: 'Dipendenti attivi', val: d.nDip, color: T.text, sub: ' ' },
    { lbl: 'Costo lavoro (mese)', val: fmt0(costo), color: T.brand, hi: true, sub: d.costoMese > 0 ? 'effettivo dai turni' : 'stima da contratti' },
    { lbl: 'Incidenza su fatturato', val: incidenza == null ? '—' : `${incidenza.toFixed(1)}%`, color: incColor, sub: incidenza == null ? 'registra le chiusure' : 'sano ≤ 30%' },
    { lbl: 'Fatturato / ora', val: prod > 0 ? fmt0(prod) : '—', color: T.text, sub: 'produttività del lavoro' },
  ]

  return (
    <div style={{ marginBottom: isMobile ? 18 : 24 }}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, maxWidth: 620 }}>
        Costo del lavoro, turni e organigramma — diagnosi del mese in corso (<span style={{ textTransform: 'capitalize' }}>{meseLbl}</span>).
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : (isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)'), gap: 10, marginBottom: (d.nonAssegnati > 0 || d.repartiScoperti.length > 0) ? 12 : 0 }}>
        {kpis.map((k, i) => (
          <div key={i} className="fos-tile" style={{
            background: k.hi ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
            border: `1px solid ${k.hi ? '#4A0612' : T.border}`,
            borderRadius: 16, padding: isMobile ? '13px 14px' : '16px 18px',
            boxShadow: k.hi ? '0 14px 34px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: k.hi ? 'rgba(255,255,255,0.72)' : T.textSoft, marginBottom: 7 }}>{k.lbl}</div>
            <div style={{ fontSize: isMobile ? 18 : 23, fontWeight: 800, letterSpacing: '-0.02em',
              color: k.hi ? T.textOnDark : k.color, lineHeight: 1.05, ...tnum }}>{k.val}</div>
            {k.sub && <div style={{ fontSize: 10, color: k.hi ? 'rgba(255,255,255,0.65)' : T.textSoft, marginTop: 5 }}>{k.sub}</div>}
          </div>
        ))}
      </div>
      {(d.nonAssegnati > 0 || d.repartiScoperti.length > 0) && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '10px 14px' }}>
          <span style={{ color: '#C2410C', display: 'inline-flex' }}><Icon name="warning" size={16} /></span>
          <span style={{ fontSize: 12, color: '#9A3412', fontWeight: 600 }}>
            {d.nonAssegnati > 0 && `${d.nonAssegnati} ${d.nonAssegnati === 1 ? 'dipendente senza reparto' : 'dipendenti senza reparto'}`}
            {d.nonAssegnati > 0 && d.repartiScoperti.length > 0 && ' · '}
            {d.repartiScoperti.length > 0 && `reparti senza nessuno: ${d.repartiScoperti.join(', ')}`}
            <span style={{ fontWeight: 500, color: '#B45309' }}> — sistemali nella scheda Organigramma.</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── ORGANIGRAMMA: reparti + assegnazione dipendenti, editabile dal titolare ──
const SK_ORG = 'pasticceria-organigramma-v1'
const SK_CONSUNTIVO = 'pasticceria-consuntivo-turni-v1' // { [turnoId]: oreEffettive }
// ─── Editor organigramma LIBERO: box trascinabili + frecce disegnabili (React Flow) ──
const ORG_NODE_BASE = { borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, border: '1px solid', textAlign: 'center', minWidth: 130, boxShadow: '0 1px 3px rgba(15,23,42,0.12)' }
const ORG_STYLE = {
  admin:   { ...ORG_NODE_BASE, background: 'linear-gradient(135deg,#6E0E1A,#4A0612)', color: '#FFF', borderColor: '#4A0612', fontWeight: 800 },
  reparto: { ...ORG_NODE_BASE, background: '#6E0E1A', color: '#FFF', borderColor: '#4A0612' },
  persona: { ...ORG_NODE_BASE, background: '#FFF', color: '#1F2937', borderColor: '#E5E7EB', fontWeight: 600 },
}

function OrganigrammaTab({ orgId, notify, isMobile, adminNome }) {
  const [dip, setDip] = useState([])
  const [org, setOrg] = useState({ reparti: [] })
  const [loading, setLoading] = useState(true)
  const [addingRep, setAddingRep] = useState(false)
  const [newRepNome, setNewRepNome] = useState('')
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const orgRef = useRef({ reparti: [] })
  // Ref allineati allo state per evitare closure stale nei callback di React Flow
  // (onNodeDragStop, onConnect, ecc. potrebbero leggere `nodes`/`edges` vecchi).
  const nodesRef = useRef([])
  const edgesRef = useRef([])

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('dipendenti').select('id,nome,ruolo').eq('organization_id', orgId).eq('attivo', true).order('nome')
      const saved = await sload(SK_ORG, orgId, null)
      if (cancelled) return
      const o = saved && Array.isArray(saved.reparti) ? saved : { reparti: [] }
      setDip(data || []); setOrg(o); orgRef.current = o; setLoading(false)
    })()
    return () => { cancelled = true }
  }, [orgId])

  // Ricostruisce il canvas solo quando cambiano reparti o dipendenti (NON sulle sole
  // posizioni → trascinare non resetta il layout). Posizioni e frecce salvate riusate.
  const repartiKey = (org.reparti || []).map(r => r.id + ':' + r.nome).join('|')
  const dipKey = dip.map(d => d.id + ':' + d.nome).join('|')
  useEffect(() => {
    if (loading) return
    const o = orgRef.current
    const pos = o.layout?.pos || {}
    const reparti = o.reparti || []
    const at = (id, x, y) => pos[id] || { x, y }
    const N = []
    N.push({ id: 'admin', type: 'default', position: at('admin', 380, 0), data: { label: adminNome || 'Amministratore' }, style: ORG_STYLE.admin, deletable: false })
    reparti.forEach((r, i) => N.push({ id: 'rep-' + r.id, type: 'default', position: at('rep-' + r.id, i * 240, 130), data: { label: r.nome }, style: ORG_STYLE.reparto }))
    dip.forEach((d, i) => N.push({ id: 'dip-' + d.id, type: 'default', position: at('dip-' + d.id, i * 200, 290), data: { label: d.nome }, style: ORG_STYLE.persona, deletable: false }))
    setNodes(N); nodesRef.current = N
    let E
    if (Array.isArray(o.layout?.edges)) E = o.layout.edges
    else {
      E = []
      reparti.forEach(r => {
        E.push({ id: 'e-admin-rep-' + r.id, source: 'admin', target: 'rep-' + r.id })
        ;(r.membri || []).forEach(m => E.push({ id: 'e-rep-' + r.id + '-dip-' + m, source: 'rep-' + r.id, target: 'dip-' + m }))
      })
    }
    const Ewith = E.map(e => ({ ...e, markerEnd: { type: MarkerType.ArrowClosed } }))
    setEdges(Ewith); edgesRef.current = Ewith
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, repartiKey, dipKey, adminNome])

  // Salva posizioni + frecce senza ricostruire il canvas (preserva il riferimento reparti).
  // Pattern: setState ottimistico (per evitare flicker durante drag), ma con
  // rollback al valore precedente se ssave fallisce + notify utente. Audit
  // 2026-06-17 HIGH: prima il catch era silenzioso → drift UI vs DB.
  const salvaLayout = useCallback((nextNodes, nextEdges) => {
    const pos = {}
    for (const n of nextNodes) pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
    const prev = orgRef.current
    const next = { ...prev, layout: { pos, edges: nextEdges.map(e => ({ id: e.id, source: e.source, target: e.target })) } }
    orgRef.current = next; setOrg(next)
    ssave(SK_ORG, next, orgId, null).catch((e) => {
      orgRef.current = prev; setOrg(prev)
      notify?.('Errore salvataggio organigramma: ' + (e?.message || 'rete'), false)
    })
  }, [orgId, notify])

  // NB: il reducer di setNodes/setEdges DEVE essere puro. In StrictMode (dev)
  // React esegue gli updater due volte: ogni side-effect (ssave, ref-write,
  // notify) finirebbe duplicato. Calcoliamo `next` fuori, mutiamo i ref e
  // salviamo dopo lo schedule del setState — il render successivo allinea lo
  // state al ref senza re-entry.
  const onNodesChange = useCallback((ch) => {
    const next = applyNodeChanges(ch, nodesRef.current)
    nodesRef.current = next
    setNodes(next)
  }, [])
  const onEdgesChange = useCallback((ch) => {
    const next = applyEdgeChanges(ch, edgesRef.current)
    edgesRef.current = next
    setEdges(next)
    if (ch.some(c => c.type === 'remove')) salvaLayout(nodesRef.current, next)
  }, [salvaLayout])
  const onNodeDragStop = useCallback(() => salvaLayout(nodesRef.current, edgesRef.current), [salvaLayout])
  const onConnect = useCallback((params) => {
    const next = addEdge({ ...params, id: 'e-' + params.source + '-' + params.target + '-' + Date.now().toString(36), markerEnd: { type: MarkerType.ArrowClosed } }, edgesRef.current)
    edgesRef.current = next
    setEdges(next)
    salvaLayout(nodesRef.current, next)
  }, [salvaLayout])
  const onNodesDelete = useCallback((deleted) => {
    const repIds = deleted.filter(n => n.id.startsWith('rep-')).map(n => n.id.slice(4))
    if (!repIds.length) return
    const orphanIds = new Set(repIds.map(id => 'rep-' + id))
    const prev = orgRef.current
    const prevLayout = prev.layout || {}
    const cleanedPos = Object.fromEntries(Object.entries(prevLayout.pos || {}).filter(([k]) => !orphanIds.has(k)))
    const cleanedEdges = (prevLayout.edges || []).filter(e => !orphanIds.has(e.source) && !orphanIds.has(e.target))
    const next = {
      ...prev,
      reparti: (prev.reparti || []).filter(r => !repIds.includes(r.id)),
      layout: { pos: cleanedPos, edges: cleanedEdges },
    }
    orgRef.current = next; setOrg(next)
    ssave(SK_ORG, next, orgId, null).catch((e) => {
      orgRef.current = prev; setOrg(prev)
      notify?.('Errore salvataggio reparti: ' + (e?.message || 'rete'), false)
    })
  }, [orgId, notify])

  function addReparto() {
    const nome = newRepNome.trim(); if (!nome) { setAddingRep(false); return }
    const id = 'rep-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3)
    const prev = orgRef.current
    const next = { ...prev, reparti: [...(prev.reparti || []), { id, nome, capoId: null, membri: [] }] }
    orgRef.current = next; setOrg(next)
    ssave(SK_ORG, next, orgId, null).catch((e) => {
      orgRef.current = prev; setOrg(prev)
      notify?.('Errore salvataggio: ' + (e?.message || 'rete'), false)
    })
    setNewRepNome(''); setAddingRep(false)
  }

  if (loading) return <div style={{ color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, maxWidth: 640 }}>
          Organigramma libero: <b>trascina</b> le box dove vuoi e <b>collega</b> trascinando dal bordo di una box a un'altra per disegnare le frecce. Seleziona una freccia (o un reparto) e premi <b>Canc</b> per rimuoverla. Tutto si salva da solo. L'amministratore è in cima.
        </div>
        {addingRep ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input autoFocus value={newRepNome} onChange={e => setNewRepNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addReparto(); if (e.key === 'Escape') { setAddingRep(false); setNewRepNome('') } }} placeholder="Nome reparto" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, width: 180 }} />
            <button onClick={addReparto} style={{ padding: '8px 14px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Aggiungi</button>
            <button onClick={() => { setAddingRep(false); setNewRepNome('') }} aria-label="Annulla" style={{ padding: '8px 10px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="x" size={13} /></button>
          </div>
        ) : (
          <button onClick={() => setAddingRep(true)} style={{ padding: '8px 16px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={14} /> Reparto</button>
        )}
      </div>
      <div style={{ height: isMobile ? 460 : 600, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', background: '#FBFAF9' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeDragStop={onNodeDragStop} onNodesDelete={onNodesDelete}
          fitView minZoom={0.2}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#6E0E1A', strokeWidth: 2 } }}
        >
          <Background gap={18} color="#E8DDD8" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

// ── Accessi: il titolare invita (per email), attiva, disattiva ed elimina gli
// account dipendente. Solo le email pre-autorizzate qui possono entrare nell'org
// (vedi handle_new_user in 20260607c). Un dipendente non attivo = accesso ZERO.
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function AccessiTab({ orgId, notify, isMobile }) {
  const [meId, setMeId] = useState(null)
  const [dipendenti, setDipendenti] = useState([])   // profiles ruolo='dipendente'
  const [pinStatuses, setPinStatuses] = useState({}) // { user_id: { has_pin, pin_set_at } }
  const [inviti, setInviti] = useState([])           // org_inviti pending non accettati
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(null)             // id in lavorazione
  const [delConf, setDelConf] = useState(null)       // dipendente in conferma eliminazione
  const [pinTarget, setPinTarget] = useState(null)   // dipendente per cui aprire il SetPinDialog

  async function carica() {
    if (!orgId) return
    const [{ data: { user } }, dip, inv, pinRes] = await Promise.all([
      supabase.auth.getUser(),
      // RPC dedicata: la RLS su profiles non garantisce al titolare la lettura dei
      // profili degli altri membri → la lista passa da fos_dipendenti_org (solo-titolare).
      supabase.rpc('fos_dipendenti_org'),
      supabase.from('org_inviti').select('id,email,stato,created_at').eq('organization_id', orgId).eq('stato', 'pending').order('created_at', { ascending: false }),
      // Stato PIN per riga (fail-soft: se RPC non esiste, fai finta che nessuno abbia PIN)
      supabase.rpc('fos_dipendente_pin_status'),
    ])
    setMeId(user?.id || null)
    setDipendenti(dip.data || [])
    setInviti(inv.data || [])
    // Mappa pinStatuses → { user_id: { has_pin, pin_set_at } }
    const map = {}
    for (const r of (pinRes?.data || [])) {
      map[r.id] = { has_pin: !!r.has_pin, pin_set_at: r.pin_set_at }
    }
    setPinStatuses(map)
    setLoading(false)
  }
  useEffect(() => { setLoading(true); carica() }, [orgId])
  // Auto-aggiorna quando torni sulla pagina (es. dopo che il dipendente si è
  // registrato in un'altra scheda) → vedi subito il nuovo account da attivare.
  useEffect(() => {
    if (!orgId) return
    const reload = () => { if (document.visibilityState === 'visible') carica() }
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', reload)
    return () => { window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload) }
  }, [orgId])

  // Email già invitate (pending) o già con un account dipendente.
  const emailEsistenti = new Set([
    ...inviti.map(i => (i.email || '').toLowerCase()),
    ...dipendenti.map(d => (d.email || '').toLowerCase()),
  ])
  // Inviti ancora rilevanti: nascondi quelli la cui email ha GIÀ un account
  // dipendente (es. invito ricreato dopo che la persona si era già registrata).
  const invitiVisibili = inviti.filter(i =>
    !dipendenti.some(d => (d.email || '').toLowerCase() === (i.email || '').toLowerCase()))

  async function invita() {
    const e = email.trim().toLowerCase()
    if (!EMAIL_RX.test(e)) { notify?.('Email non valida', false); return }
    if (emailEsistenti.has(e)) { notify?.('Questa email è già invitata o già collegata', false); return }
    setBusy('invite')
    const { error } = await supabase.from('org_inviti').insert({ organization_id: orgId, email: e, ruolo: 'dipendente', invited_by: meId })
    setBusy(null)
    if (error) { notify?.('Invito fallito: ' + error.message, false); return }
    setEmail(''); notify?.('Invito creato. Comunica al dipendente di registrarsi con QUESTA email — non parte alcuna email automatica.')
    carica()
  }

  // Niente email automatica: il titolare condivide il link di registrazione col dipendente.
  function copiaLink(emailDip) {
    const url = (typeof window !== 'undefined' ? window.location.origin : '') + '/register'
    const testo = `Registrati su FoodOS con l'email ${emailDip}: ${url}`
    try {
      navigator.clipboard.writeText(testo)
      notify?.('Link copiato — incollalo al dipendente (WhatsApp, email, ecc.)')
    } catch {
      notify?.(url, true)
    }
  }

  // Azioni sul profilo di UN ALTRO utente (attiva/disattiva/elimina): la RLS non
  // consente al titolare l'update cross-user lato client (no-op silenzioso) →
  // passano dall'endpoint server con service key.
  async function azioneAccesso(targetUserId, azione) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/dipendente-accesso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ targetUserId, azione }),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) throw new Error(j?.error || `errore (${res.status})`)
    return j
  }

  async function setApprovato(dipId, val) {
    setBusy(dipId)
    try {
      await azioneAccesso(dipId, val ? 'attiva' : 'disattiva')
      notify?.(val ? 'Dipendente attivato' : 'Dipendente disattivato')
    } catch (e) {
      notify?.('Operazione fallita: ' + e.message, false)
    } finally {
      setBusy(null); carica()
    }
  }

  async function revocaInvito(invId) {
    setBusy(invId)
    const { error } = await supabase.from('org_inviti').delete().eq('id', invId).eq('organization_id', orgId)
    setBusy(null)
    if (error) { notify?.('Revoca fallita: ' + error.message, false); return }
    notify?.('Invito revocato'); carica()
  }

  async function elimina(dip) {
    setBusy(dip.id)
    try {
      await azioneAccesso(dip.id, 'elimina')
      notify?.('Account eliminato')
    } catch (err) {
      notify?.('Eliminazione fallita: ' + err.message, false)
    } finally {
      setBusy(null); setDelConf(null); carica()
    }
  }

  if (loading) return <div style={{ color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  const btn = (bg, color, border) => ({ padding: '7px 12px', borderRadius: 8, border: border || 'none', background: bg, color, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 })

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.55, marginBottom: 14 }}>
        Solo le email che inviti qui possono entrare nella tua azienda. Un nuovo dipendente parte <b>in attesa</b> e
        accede <b>solo dopo</b> che lo attivi. Puoi disattivarlo (revoca immediata) o eliminarlo in qualsiasi momento.
      </div>
      <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.55, marginBottom: 16, padding: '10px 12px', background: `${C.amber}12`, border: `1px solid ${C.amber}30`, borderRadius: 8 }}>
        <b>Non viene inviata un'email automatica.</b> Dopo l'invito, comunica tu al dipendente (WhatsApp, di persona) di
        registrarsi con <b>quella stessa email</b> su <b>{(typeof window !== 'undefined' ? window.location.origin : '') + '/register'}</b>.
        Appena si registra comparirà qui sotto come "In attesa": allora lo attivi.
      </div>

      {/* Invito per email */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email.dipendente@esempio.it"
          onKeyDown={e => { if (e.key === 'Enter') invita() }} autoComplete="off"
          style={{ flex: 1, minWidth: 220, padding: isMobile ? '12px 14px' : '9px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text }} />
        <button onClick={invita} disabled={busy === 'invite'} style={{ ...btn(C.red, C.white), padding: isMobile ? '12px 18px' : '9px 16px', fontWeight: 800, opacity: busy === 'invite' ? 0.6 : 1 }}>
          <Icon name="plus" size={14} />Invita dipendente
        </button>
      </div>

      {/* Account dipendente esistenti */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account dipendente</div>
        <button onClick={carica} title="Aggiorna" style={{ ...btn(C.white, C.textMid, `1px solid ${C.border}`), padding: '5px 10px' }}><Icon name="refresh" size={12} />Aggiorna</button>
      </div>
      {dipendenti.length === 0 && <div style={{ fontSize: 12, color: C.textSoft, fontStyle: 'italic', marginBottom: 18 }}>Nessun account dipendente ancora.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {dipendenti.map(d => {
          const pinInfo = pinStatuses[d.id]
          const hasPin = !!pinInfo?.has_pin
          return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome_completo || d.email}</div>
              <div style={{ fontSize: 11, color: C.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.email}</div>
            </div>
            {/* Badge PIN: visibile solo se impostato */}
            {hasPin && (
              <span title="PIN attivo per login rapido da tablet"
                style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color: '#1E40AF', background: '#DBEAFE', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="key" size={11} />PIN
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color: d.approvato ? C.green : C.amber, background: d.approvato ? `${C.green}14` : `${C.amber}18`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name={d.approvato ? 'checkCircle' : 'hourglass'} size={11} />{d.approvato ? 'Attivo' : 'In attesa / sospeso'}
            </span>
            {/* Bottone PIN: imposta o cambia */}
            <button onClick={() => setPinTarget(d)} disabled={busy === d.id}
              title={hasPin ? 'Cambia o rimuovi PIN' : 'Imposta PIN per login rapido tablet'}
              style={btn(hasPin ? '#DBEAFE' : C.white, hasPin ? '#1E40AF' : C.textMid, `1px solid ${hasPin ? '#93C5FD' : C.border}`)}>
              <Icon name="key" size={12} />{hasPin ? 'PIN' : 'Imposta PIN'}
            </button>
            {d.approvato
              ? <button onClick={() => setApprovato(d.id, false)} disabled={busy === d.id} style={btn(C.white, C.textMid, `1px solid ${C.border}`)}>Disattiva</button>
              : <button onClick={() => setApprovato(d.id, true)} disabled={busy === d.id} style={btn(C.green, C.white)}><Icon name="check" size={12} />Attiva</button>}
            <button onClick={() => setDelConf(d)} disabled={busy === d.id} title="Elimina account" style={btn(C.white, C.red, `1px solid ${C.red}40`)}><Icon name="trash" size={12} /></button>
          </div>
          )
        })}
      </div>

      {/* Inviti in attesa di registrazione */}
      {invitiVisibili.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Inviti in attesa di registrazione</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invitiVisibili.map(i => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: C.bgSubtle, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.email}</div>
                <span style={{ fontSize: 11, color: C.amber, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="hourglass" size={11} />Deve registrarsi</span>
                <button onClick={() => copiaLink(i.email)} style={btn(C.white, C.textMid, `1px solid ${C.border}`)}><Icon name="clipboard" size={12} />Copia link</button>
                <button onClick={() => revocaInvito(i.id)} disabled={busy === i.id} style={btn(C.white, C.textMid, `1px solid ${C.border}`)}>Revoca</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Set/Cambia/Rimuovi PIN dipendente */}
      {pinTarget && (
        <SetPinDialog
          dipendente={pinTarget}
          currentStatus={pinStatuses[pinTarget.id]}
          onClose={() => setPinTarget(null)}
          onDone={() => carica()}
          notify={notify}
        />
      )}

      {/* Conferma eliminazione */}
      {delConf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setDelConf(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>Eliminare l'accesso?</div>
            <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.55, marginBottom: 18 }}>
              L'account <b>{delConf.email}</b> verrà rimosso definitivamente e non potrà più accedere. L'azione non è reversibile.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDelConf(null)} style={btn(C.white, C.textMid, `1px solid ${C.border}`)}>Annulla</button>
              <button onClick={() => elimina(delConf)} disabled={busy === delConf.id} style={btn(C.red, C.white)}><Icon name="trash" size={12} />Elimina definitivamente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Personale({ orgId, sedeId, sedi = [], notify, adminNome }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [tab, setTab] = useState("dipendenti")
  const TABS = [
    ["dipendenti", "Dipendenti", "users"],
    ["accessi",    "Accessi",    "lock"],
    ["turni",      "Turni",      "calendar"],
    ["organigramma", "Organigramma", "folder"],
    ["analisi",    "Analisi costo", "barChart"],
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
              <span style={{ opacity: active ? 1 : 0.7, display: 'inline-flex' }}><Icon name={icon} size={14} /></span>
              {lbl}
            </button>
          )
        })}
      </div>

      {tab === "dipendenti" && <DipendentiTab orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile} isTablet={isTablet}/>}
      {tab === "accessi"    && <AccessiTab    orgId={orgId} notify={notify} isMobile={isMobile}/>}
      {tab === "turni"      && <TurniTab      orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile} isTablet={isTablet}/>}
      {tab === "organigramma" && <OrganigrammaTab orgId={orgId} notify={notify} isMobile={isMobile} adminNome={adminNome}/>}
      {tab === "analisi"    && <AnalisiCostoTab orgId={orgId} isMobile={isMobile} isTablet={isTablet}/>}
    </div>
  )
}

// ── Calcolo lordo↔netto stipendio (banda informativa nel form) ────────────
function CalcoloLordoNetto({ lordo, netto, setForm }) {
  const isMobile = useIsMobile()
  const result = useMemo(() => {
    if (lordo && !netto) return calcolaStipendio({ lordo, mensilita: 13 })
    if (netto && !lordo) return calcolaStipendio({ netto, mensilita: 13 })
    return calcolaStipendio({ lordo, netto, mensilita: 13 })
  }, [lordo, netto])
  const fmt = (n) => `€ ${Math.round(Number(n) || 0).toLocaleString('it-IT')}`
  return (
    <div style={{ marginTop: 6, padding: '10px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Stima (13 mensilità + INPS + IRPEF a scaglioni)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
        <div>
          <div style={{ color: '#475264', marginBottom: 2 }}>Lordo</div>
          <div style={{ fontWeight: 800, color: '#0E1726', fontSize: 13 }}>{fmt(result.lordo)}</div>
        </div>
        <div>
          <div style={{ color: '#475264', marginBottom: 2 }}>Netto stimato</div>
          <div style={{ fontWeight: 800, color: '#15803D', fontSize: 13 }}>{fmt(result.netto)}</div>
        </div>
        <div>
          <div style={{ color: '#475264', marginBottom: 2 }}>Costo azienda</div>
          <div style={{ fontWeight: 800, color: '#991B1B', fontSize: 13 }}>{fmt(result.costoAzienda)}</div>
        </div>
      </div>
      {netto && !lordo && result.lordo > 0 && (
        <button type="button" onClick={() => setForm(f => ({ ...f, stipendio_lordo_mensile: result.lordo.toFixed(2), stipendio_netto_mensile: '' }))}
          style={{ marginTop: 8, padding: '4px 10px', minHeight: 28, fontSize: 11, fontWeight: 700, color: '#1E3A8A', background: '#FFFFFF', border: '1px solid #BFDBFE', borderRadius: 6, cursor: 'pointer' }}>
          ↑ Usa lordo {fmt(result.lordo)}
        </button>
      )}
      {lordo && !netto && result.netto > 0 && (
        <button type="button" onClick={() => setForm(f => ({ ...f, stipendio_netto_mensile: result.netto.toFixed(2), stipendio_lordo_mensile: '' }))}
          style={{ marginTop: 8, padding: '4px 10px', minHeight: 28, fontSize: 11, fontWeight: 700, color: '#1E3A8A', background: '#FFFFFF', border: '1px solid #BFDBFE', borderRadius: 6, cursor: 'pointer' }}>
          ↓ Usa netto {fmt(result.netto)}
        </button>
      )}
    </div>
  )
}
