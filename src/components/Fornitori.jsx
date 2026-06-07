import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { todayLocal } from '../lib/dateLocal'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight, redDark: T.brandDark,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" };

function fmt(n) { return n==null?"-":`€${Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}` }
function fmtDate(s) { if(!s) return "—"; const d=new Date(s); return d.toLocaleDateString("it-IT"); }

function FornitoriTab({ orgId, sedeId, sedi = [], notify, isMobile }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome:"", contatto:"", email:"", telefono:"", note:"", sede_id: "" })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [scopeSede, setScopeSede] = useState('attiva') // 'attiva' | 'tutte'
  const [vista, setVista] = useState('attivi') // 'attivi' | 'archivio'
  const [archCount, setArchCount] = useState(0)

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1
  const sediMap = Object.fromEntries((sedi || []).map(s => [s.id, s]))
  const inArchivio = vista === 'archivio'

  useEffect(() => { carica() }, [orgId, sedeId, scopeSede, vista])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    let q = supabase.from("fornitori").select("*").eq("organization_id", orgId).eq("attivo", !inArchivio).order("nome")
    if (scopeSede === 'attiva' && sedeId) {
      q = q.or(`sede_id.eq.${sedeId},sede_id.is.null`)
    }
    const { data, error } = await q
    if (error) notify?.("Errore caricamento fornitori: " + error.message, false)
    setLista(data || [])
    const { count } = await supabase.from("fornitori").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("attivo", false)
    setArchCount(count || 0)
    setLoading(false)
  }

  async function salva() {
    if (!form.nome.trim()) { notify("Inserisci il nome del fornitore", false); return }
    if (!orgId) { notify("Profilo non pronto, riprova", false); return }
    setSaving(true)
    // sede_id="" significa "Tutte le sedi" (azienda) → NULL nel DB
    const payload = { ...form, sede_id: form.sede_id || null, organization_id: orgId }
    let err
    if (editId) {
      ({ error: err } = await supabase.from("fornitori").update(payload).eq("id", editId))
    } else {
      ({ error: err } = await supabase.from("fornitori").insert(payload))
    }
    if (err) { notify("Errore: " + err.message, false) }
    else { notify(editId ? "✓ Fornitore aggiornato" : "✓ Fornitore aggiunto"); resetForm() }
    setSaving(false)
    carica()
  }

  async function archivia(id) {
    if (!confirm("Archiviare questo fornitore? Potrai riattivarlo dall'archivio quando vuoi.")) return
    const { error } = await supabase.from("fornitori").update({ attivo: false }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore archiviazione: " + error.message, false); return }
    notify("✓ Fornitore archiviato")
    carica()
  }

  async function riattiva(id) {
    const { error } = await supabase.from("fornitori").update({ attivo: true }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore riattivazione: " + error.message, false); return }
    notify("✓ Fornitore riattivato")
    carica()
  }

  async function elimina(f) {
    // Eliminazione definitiva: solo dall'archivio, con conferma esplicita.
    if (!confirm(`Eliminare DEFINITIVAMENTE "${f.nome}"? L'operazione è irreversibile.\n\nSe il fornitore ha ordini collegati, archivialo invece di eliminarlo.`)) return
    const { error } = await supabase.from("fornitori").delete().eq("id", f.id).eq("organization_id", orgId)
    if (error) { notify("Impossibile eliminare (forse ha ordini collegati): " + error.message, false); return }
    notify("✓ Fornitore eliminato definitivamente")
    carica()
  }

  function resetForm() { setForm({ nome:"", contatto:"", email:"", telefono:"", note:"", sede_id: sedeId || "" }); setEditId(null); setShowForm(false) }
  function initEdit(f) { setForm({ nome:f.nome, contatto:f.contatto||"", email:f.email||"", telefono:f.telefono||"", note:f.note||"", sede_id: f.sede_id || "" }); setEditId(f.id); if (isMobile) setShowForm(true) }

  const inputSt = { width:"100%", height: 40, padding: "0 12px", borderRadius: R.md, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color:C.text, background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const formVisible = !isMobile || showForm

  return (
    <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "1fr 1fr", gap:24 }}>
      {/* Form */}
      {formVisible && (
      <div style={{
        background:C.bgCard,
        borderRadius: isMobile ? 0 : 16,
        padding: isMobile ? "20px 16px 100px" : "20px 24px",
        border: isMobile ? "none" : `1px solid ${C.border}`,
        boxShadow: isMobile ? "none" : "0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
        position: isMobile ? "fixed" : "relative",
        top: isMobile ? 0 : "auto",
        left: isMobile ? 0 : "auto",
        right: isMobile ? 0 : "auto",
        bottom: isMobile ? 0 : "auto",
        zIndex: isMobile ? 1000 : "auto",
        overflowY: isMobile ? "auto" : "visible",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, display:"inline-flex", alignItems:"center", gap:6 }}>
            <Icon name={editId ? "edit" : "plus"} size={14} />
            {editId ? "Modifica fornitore" : "Nuovo fornitore"}
          </div>
          {isMobile && (
            <button onClick={resetForm} aria-label="Chiudi form fornitore" style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
          )}
        </div>
        {[["Nome *","nome","text"],["Referente","contatto","text"],["Email","email","email"],["Telefono","telefono","tel"]].map(([lbl,key,type])=>(
          <div key={key} style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{lbl}</div>
            <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inputSt}/>
          </div>
        ))}
        {haPiuSedi && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Sede</div>
            <select value={form.sede_id} onChange={e=>setForm(f=>({...f,sede_id:e.target.value}))} style={inputSt}>
              <option value="">Tutte le sedi (azienda)</option>
              {sedi.filter(s => s.attiva !== false).map(s => (
                <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Note</div>
          <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2}
            style={{ ...inputSt, resize:"vertical" }}/>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={salva} disabled={saving}
            style={{ flex:1, padding: isMobile ? "14px" : "10px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer" }}>
            {saving ? "…" : editId ? "Salva modifiche" : "Aggiungi"}
          </button>
          {editId && <button onClick={resetForm} aria-label="Annulla modifica fornitore" style={{ padding: isMobile ? "14px" : "10px 14px", background:C.white, border:`1px solid ${C.borderStr}`, borderRadius:8, fontSize: isMobile ? 14 : 12, color:C.textMid, cursor:"pointer" }}>✕</button>}
        </div>
      </div>
      )}

      {/* Lista */}
      <div>
        {/* Toggle Attivi / Archivio */}
        <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
          {[['attivi', 'truck', 'Attivi'], ['archivio', 'package', `Archivio${archCount > 0 ? ` (${archCount})` : ''}`]].map(([id, ico, lbl]) => (
            <button key={id} onClick={() => setVista(id)}
              style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${vista === id ? C.red : C.border}`,
                background: vista === id ? C.redLight : C.white, color: vista === id ? C.red : C.textMid,
                fontSize: 11, fontWeight: vista === id ? 800 : 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={ico} size={12} /> {lbl}</button>
          ))}
        </div>
        {haPiuSedi && (
          <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
            {[['attiva','pin','Solo sede attiva'], ['tutte','building','Tutte le sedi']].map(([id,ico,lbl]) => (
              <button key={id} onClick={()=>setScopeSede(id)}
                style={{ padding:'4px 10px', borderRadius: 999, border: `1px solid ${C.border}`,
                  background: scopeSede===id ? C.text : C.white, color: scopeSede===id ? C.white : C.textMid,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={ico} size={12} /> {lbl}</button>
            ))}
          </div>
        )}
        {loading ? <div style={{ color:C.textSoft, fontSize:13, padding:20 }}>Caricamento…</div> : lista.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>{inArchivio ? "Nessun fornitore archiviato." : "Nessun fornitore ancora."}</div>
        ) : isMobile ? lista.map(f => (
          <div key={f.id} className="fos-tile" style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:"12px 14px", marginBottom:8, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontWeight:800, fontSize:14, color:C.text }}>{f.nome}</div>
              {haPiuSedi && (
                <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999,
                  background: f.sede_id ? C.amberLight : '#F1F5F9',
                  color: f.sede_id ? '#92400E' : C.textSoft, fontWeight: 700, whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name={f.sede_id ? 'pin' : 'building'} size={11} />
                  {f.sede_id ? (sediMap[f.sede_id]?.nome || 'Sede') : 'Azienda'}
                </div>
              )}
            </div>
            {f.contatto && <div style={{ fontSize:12, color:C.textMid, marginTop:4, display:"flex", alignItems:"center", gap:6 }}><Icon name="user" size={12} /> {f.contatto}</div>}
            {f.email && <div style={{ fontSize:12, color:C.textMid, marginTop:2, display:"flex", alignItems:"center", gap:6 }}><Icon name="mail" size={12} /> <a href={`mailto:${f.email}`} style={{ color:C.red }}>{f.email}</a></div>}
            {f.telefono && <div style={{ fontSize:12, color:C.textMid, marginTop:2 }}><a href={`tel:${f.telefono}`} style={{ color:C.red }}>{f.telefono}</a></div>}
            {f.note && <div style={{ fontSize:11, color:C.textSoft, marginTop:6, fontStyle:"italic" }}>{f.note}</div>}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={()=>initEdit(f)} style={{ flex:1, padding:"10px", background:C.bg, border:`1px solid ${C.borderStr}`, borderRadius:8, fontSize:12, color:C.textMid, cursor:"pointer", fontWeight:600 }}>Modifica</button>
              {inArchivio ? (
                <>
                  <button onClick={()=>riattiva(f.id)} style={{ flex:1, padding:"10px", background:"#ECFDF5", border:"1px solid #10B981", borderRadius:8, fontSize:12, color:"#065F46", cursor:"pointer", fontWeight:700 }}>↩ Riattiva</button>
                  <button onClick={()=>elimina(f)} aria-label="Elimina" style={{ padding:"10px 12px", background:C.redLight, border:`1px solid ${C.red}40`, borderRadius:8, fontSize:12, color:C.red, cursor:"pointer", fontWeight:600, display:"inline-flex", alignItems:"center" }}><Icon name="trash" size={14} /></button>
                </>
              ) : (
                <button onClick={()=>archivia(f.id)} style={{ flex:1, padding:"10px", background:"#FEF3C7", border:"1px solid #F59E0B", borderRadius:8, fontSize:12, color:"#92400E", cursor:"pointer", fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}><Icon name="package" size={13} /> Archivia</button>
              )}
            </div>
          </div>
        )) : lista.map(f => (
          <div key={f.id} className="fos-tile" style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px 18px", marginBottom:10, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight:800, fontSize:13, color:C.text }}>{f.nome}</div>
                  {haPiuSedi && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: f.sede_id ? C.amberLight : '#F1F5F9',
                      color: f.sede_id ? '#92400E' : C.textSoft, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name={f.sede_id ? 'pin' : 'building'} size={11} />
                      {f.sede_id ? (sediMap[f.sede_id]?.nome || 'Sede') : 'Azienda'}
                    </span>
                  )}
                </div>
                {f.contatto && <div style={{ fontSize:11, color:C.textMid, marginTop:2, display:"flex", alignItems:"center", gap:6 }}><Icon name="user" size={11} /> {f.contatto}</div>}
                {f.email && <div style={{ fontSize:11, color:C.textMid }}><a href={`mailto:${f.email}`} style={{ color:C.red }}>{f.email}</a></div>}
                {f.telefono && <div style={{ fontSize:11, color:C.textMid }}>{f.telefono}</div>}
                {f.note && <div style={{ fontSize:10, color:C.textSoft, marginTop:4, fontStyle:"italic" }}>{f.note}</div>}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={()=>initEdit(f)} title="Modifica" style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.borderStr}`, background:C.white, fontSize:10, color:C.textMid, cursor:"pointer", display:"inline-flex", alignItems:"center" }}><Icon name="edit" size={13} /></button>
                {inArchivio ? (
                  <>
                    <button onClick={()=>riattiva(f.id)} title="Riattiva" style={{ padding:"5px 10px", borderRadius:8, border:"1px solid #10B981", background:"#ECFDF5", fontSize:10, color:"#065F46", cursor:"pointer", fontWeight:700 }}>↩</button>
                    <button onClick={()=>elimina(f)} title="Elimina definitivamente" style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.red}40`, background:C.redLight, fontSize:10, color:C.red, cursor:"pointer", display:"inline-flex", alignItems:"center" }}><Icon name="trash" size={13} /></button>
                  </>
                ) : (
                  <button onClick={()=>archivia(f.id)} title="Archivia" style={{ padding:"5px 10px", borderRadius:8, border:"1px solid #F59E0B", background:"#FEF3C7", fontSize:10, color:"#92400E", cursor:"pointer", display:"inline-flex", alignItems:"center" }}><Icon name="package" size={13} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAB mobile */}
      {isMobile && !showForm && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px", background:C.white, borderTop:`1px solid ${C.border}`, zIndex:100 }}>
          <button onClick={()=>{ resetForm(); setShowForm(true) }} style={{ width:"100%", padding:"14px", background:C.red, color:C.white, border:"none", borderRadius:10, fontSize:15, fontWeight:800, cursor:"pointer" }}>
            + Aggiungi fornitore
          </button>
        </div>
      )}
    </div>
  )
}

function OrdiniTab({ orgId, notify, isMobile }) {
  const [ordini, setOrdini] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ fornitore_id:"", data_ordine: todayLocal(), note:"", stato:"bozza" })
  const [righe, setRighe] = useState([{ prodotto:"", quantita:"", unita:"kg", prezzo_unitario:"" }])
  const [saving, setSaving] = useState(false)

  useEffect(() => { carica() }, [orgId])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const [{ data:ord, error:e1 }, { data:forn, error:e2 }] = await Promise.all([
      supabase.from("ordini_fornitori").select("*, fornitori(nome)").eq("organization_id", orgId).order("data_ordine", { ascending:false }).limit(50),
      supabase.from("fornitori").select("id,nome").eq("organization_id", orgId).order("nome"),
    ])
    if (e1 || e2) notify?.("Errore caricamento ordini: " + (e1?.message || e2?.message), false)
    setOrdini(ord || [])
    setFornitori(forn || [])
    setLoading(false)
  }

  async function salvaOrdine() {
    if (!form.fornitore_id) { notify("Seleziona un fornitore", false); return }
    const righeValide = righe.filter(r=>r.prodotto.trim())
    if (!righeValide.length) { notify("Aggiungi almeno un prodotto", false); return }
    setSaving(true)
    const totale = righeValide.reduce((s,r)=>s+(parseFloat(r.quantita)||0)*(parseFloat(r.prezzo_unitario)||0), 0)
    const { data: ordineData, error } = await supabase.from("ordini_fornitori").insert({
      organization_id: orgId,
      fornitore_id: form.fornitore_id,
      data_ordine: form.data_ordine,
      note: form.note,
      stato: form.stato,
      totale: parseFloat(totale.toFixed(2)),
    }).select().single()
    if (error) { notify("Errore: " + error.message, false); setSaving(false); return }
    const { error: errRighe } = await supabase.from("righe_ordine").insert(righeValide.map(r=>({
      ordine_id: ordineData.id,
      prodotto: r.prodotto,
      quantita: parseFloat(r.quantita)||0,
      unita: r.unita,
      prezzo_unitario: parseFloat(r.prezzo_unitario)||0,
      totale_riga: (parseFloat(r.quantita)||0)*(parseFloat(r.prezzo_unitario)||0),
    })))
    if (errRighe) {
      await supabase.from("ordini_fornitori").delete().eq("id", ordineData.id).eq("organization_id", orgId)
      notify("Errore salvataggio righe: " + errRighe.message, false)
      setSaving(false)
      return
    }
    notify("✓ Ordine salvato")
    setShowForm(false)
    setForm({ fornitore_id:"", data_ordine: todayLocal(), note:"", stato:"bozza" })
    setRighe([{ prodotto:"", quantita:"", unita:"kg", prezzo_unitario:"" }])
    setSaving(false)
    carica()
  }

  async function aggiornaStato(id, stato) {
    const { error } = await supabase.from("ordini_fornitori").update({ stato }).eq("id", id)
    if (error) { notify("Errore aggiornamento stato: " + error.message, false); return }
    notify("✓ Stato aggiornato")
    carica()
  }

  const addRiga = () => setRighe(r=>[...r,{ prodotto:"", quantita:"", unita:"kg", prezzo_unitario:"" }])
  const removeRiga = i => setRighe(r=>r.filter((_,j)=>j!==i))
  const updateRiga = (i, field, val) => setRighe(r=>r.map((x,j)=>j===i?{...x,[field]:val}:x))

  const statoColor = { bozza:"#94A3B8", inviato:"#2563EB", ricevuto:"#16A34A", annullato:"#DC2626" }
  const inputSt = { padding: isMobile ? "12px 14px" : "8px 10px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text }

  return (
    <div style={{ paddingBottom: isMobile ? 80 : 0 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{ordini.length} ordini</div>
        {!isMobile && (
          <button onClick={()=>setShowForm(s=>!s)}
            style={{ padding:"9px 18px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:12, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
            {showForm ? "✕ Annulla" : <><Icon name="plus" size={13} /> Nuovo ordine</>}
          </button>
        )}
      </div>

      {showForm && (
        <div style={{
          background:"#FFF0F0",
          border: isMobile ? "none" : `1px solid ${C.red}30`,
          borderRadius: isMobile ? 0 : 12,
          padding: isMobile ? "20px 16px 100px" : "20px 24px",
          marginBottom:20,
          position: isMobile ? "fixed" : "relative",
          top: isMobile ? 0 : "auto",
          left: isMobile ? 0 : "auto",
          right: isMobile ? 0 : "auto",
          bottom: isMobile ? 0 : "auto",
          zIndex: isMobile ? 1000 : "auto",
          overflowY: isMobile ? "auto" : "visible",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:800, color:C.text }}>Nuovo ordine</div>
            {isMobile && (
              <button aria-label="Chiudi form ordine" onClick={()=>setShowForm(false)} style={{ padding:"6px 12px", background:"transparent", border:"none", fontSize:18, color:C.textSoft, cursor:"pointer" }}>✕</button>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:12, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Fornitore *</div>
              <select value={form.fornitore_id} onChange={e=>setForm(f=>({...f,fornitore_id:e.target.value}))} style={{ ...inputSt, width:"100%" }}>
                <option value="">Seleziona…</option>
                {fornitori.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Data ordine</div>
              <input type="date" value={form.data_ordine} onChange={e=>setForm(f=>({...f,data_ordine:e.target.value}))} style={{ ...inputSt, width:"100%" }}/>
            </div>
            <div>
              <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Stato</div>
              <select value={form.stato} onChange={e=>setForm(f=>({...f,stato:e.target.value}))} style={{ ...inputSt, width:"100%" }}>
                {["bozza","inviato","ricevuto","annullato"].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:8 }}>Prodotti ordinati</div>
            {!isMobile && (
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 80px 1fr auto", gap:6, marginBottom:6 }}>
                {["Prodotto","Quantità","Unità","€/unità",""].map((h,i)=>(
                  <div key={i} style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</div>
                ))}
              </div>
            )}
            {righe.map((r,i)=>(
              isMobile ? (
                <div key={i} style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:8, padding:10, marginBottom:8 }}>
                  <input value={r.prodotto} onChange={e=>updateRiga(i,"prodotto",e.target.value)} placeholder="Prodotto (es. burro)" style={{ ...inputSt, width:"100%", marginBottom:6 }}/>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 1fr auto", gap:6 }}>
                    <input type="number" value={r.quantita} onChange={e=>updateRiga(i,"quantita",e.target.value)} placeholder="Qtà" style={inputSt}/>
                    <select value={r.unita} onChange={e=>updateRiga(i,"unita",e.target.value)} style={inputSt}>
                      {["kg","g","l","pz","cf"].map(u=><option key={u}>{u}</option>)}
                    </select>
                    <input type="number" value={r.prezzo_unitario} onChange={e=>updateRiga(i,"prezzo_unitario",e.target.value)} placeholder="€/u" style={inputSt}/>
                    <button aria-label="Rimuovi riga" onClick={()=>removeRiga(i)} style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.white, color:C.textSoft, fontSize:14, cursor:"pointer" }}>✕</button>
                  </div>
                </div>
              ) : (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 80px 1fr auto", gap:6, marginBottom:6 }}>
                  <input value={r.prodotto} onChange={e=>updateRiga(i,"prodotto",e.target.value)} placeholder="es. burro" style={inputSt}/>
                  <input type="number" value={r.quantita} onChange={e=>updateRiga(i,"quantita",e.target.value)} placeholder="0" style={inputSt}/>
                  <select value={r.unita} onChange={e=>updateRiga(i,"unita",e.target.value)} style={inputSt}>
                    {["kg","g","l","pz","cf"].map(u=><option key={u}>{u}</option>)}
                  </select>
                  <input type="number" value={r.prezzo_unitario} onChange={e=>updateRiga(i,"prezzo_unitario",e.target.value)} placeholder="0.00" style={inputSt}/>
                  <button aria-label="Rimuovi riga" onClick={()=>removeRiga(i)} style={{ padding:"4px 8px", borderRadius:8, border:`1px solid ${C.border}`, background:C.white, color:C.textSoft, fontSize:10, cursor:"pointer" }}>✕</button>
                </div>
              )
            ))}
            <button onClick={addRiga} style={{ padding: isMobile ? "10px 14px" : "6px 14px", background:C.white, border:`1px solid ${C.borderStr}`, borderRadius:8, fontSize: isMobile ? 13 : 11, color:C.textMid, cursor:"pointer", width: isMobile ? "100%" : "auto" }}>+ Riga</button>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Note</div>
            <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2}
              style={{ ...inputSt, width:"100%", resize:"vertical" }}/>
          </div>
          <button onClick={salvaOrdine} disabled={saving}
            style={{ padding: isMobile ? "14px" : "10px 24px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize: isMobile ? 15 : 12, cursor:"pointer", width: isMobile ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {saving ? "…" : <><Icon name="save" size={14} /> Salva ordine</>}
          </button>
        </div>
      )}

      {loading ? <div style={{ color:C.textSoft, fontSize:13 }}>Caricamento…</div> : ordini.length === 0 ? (
        <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun ordine ancora.</div>
      ) : isMobile ? (
        <div>
          {ordini.map(o=>(
            <div key={o.id} className="fos-tile" style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:"12px 14px", marginBottom:8, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                <div style={{ fontWeight:800, fontSize:13, color:C.text, flex:1, minWidth:0, wordBreak:"break-word" }}>{o.fornitori?.nome || "—"}</div>
                <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:12, background:`${statoColor[o.stato]}20`, color:statoColor[o.stato], whiteSpace:"nowrap" }}>{o.stato}</span>
              </div>
              <div style={{ fontSize:12, color:C.textSoft, marginBottom:8 }}>
                {fmtDate(o.data_ordine)} · <strong style={{ color:C.text }}>{fmt(o.totale)}</strong>
              </div>
              {o.note && <div style={{ fontSize:11, color:C.textSoft, fontStyle:"italic", marginBottom:8 }}>{o.note}</div>}
              <div style={{ display:"flex", gap:6 }}>
                {o.stato !== "ricevuto" && (
                  <button onClick={()=>aggiornaStato(o.id,"ricevuto")} style={{ flex:1, padding:"10px", background:C.greenLight, border:`1px solid ${C.green}40`, borderRadius:8, fontSize:12, color:C.green, cursor:"pointer", fontWeight:700 }}>
                    Segna ricevuto
                  </button>
                )}
                <select value={o.stato} onChange={e=>aggiornaStato(o.id,e.target.value)}
                  style={{ flex:1, padding:"10px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize:16, color:C.text, cursor:"pointer", background:C.white }}>
                  {["bozza","inviato","ricevuto","annullato"].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {ordini.map(o=>(
            <div key={o.id} className="fos-tile" style={{ background:C.bgCard, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px 18px", marginBottom:10, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:800, fontSize:13, color:C.text }}>{o.fornitori?.nome || "—"}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:`${statoColor[o.stato]}20`, color:statoColor[o.stato] }}>{o.stato}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.textSoft }}>{fmtDate(o.data_ordine)}{o.note && ` · ${o.note}`}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontWeight:900, fontSize:15, color:C.text, ...tnum }}>{fmt(o.totale)}</span>
                  <select value={o.stato} onChange={e=>aggiornaStato(o.id,e.target.value)}
                    style={{ padding:"5px 8px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize:11, color:C.text, cursor:"pointer" }}>
                    {["bozza","inviato","ricevuto","annullato"].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isMobile && !showForm && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"12px 16px", background:C.white, borderTop:`1px solid ${C.border}`, zIndex:100 }}>
          <button onClick={()=>setShowForm(true)} style={{ width:"100%", padding:"14px", background:C.red, color:C.white, border:"none", borderRadius:10, fontSize:15, fontWeight:800, cursor:"pointer" }}>
            + Nuovo ordine
          </button>
        </div>
      )}
    </div>
  )
}

function SpesaTab({ orgId, isMobile }) {
  const [righe, setRighe] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState("30")

  useEffect(() => { carica() }, [orgId, range])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const from = new Date(); from.setDate(from.getDate() - parseInt(range))
    const { data, error } = await supabase
      .from("ordini_fornitori")
      .select("*, fornitori(nome)")
      .eq("organization_id", orgId)
      .eq("stato", "ricevuto")
      .gte("data_ordine", from.toISOString().slice(0,10))
      .order("data_ordine", { ascending:false })
    if (error) console.warn("ordini storico load:", error.message)
    setRighe(data || [])
    setLoading(false)
  }

  const totale = righe.reduce((s,r)=>s+(r.totale||0), 0)
  const byFornitore = righe.reduce((acc,r)=>{ const n=r.fornitori?.nome||"?"; acc[n]=(acc[n]||0)+(r.totale||0); return acc }, {})

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <select value={range} onChange={e=>setRange(e.target.value)}
          style={{ padding: isMobile ? "10px 14px" : "8px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color:C.text, width: isMobile ? "100%" : "auto" }}>
          <option value="7">Ultimi 7 giorni</option>
          <option value="30">Ultimi 30 giorni</option>
          <option value="90">Ultimi 90 giorni</option>
          <option value="365">Ultimo anno</option>
        </select>
        <div style={{ fontSize: isMobile ? 26 : 22, fontWeight:900, color:C.text, ...tnum }}>{fmt(totale)}</div>
        <div style={{ fontSize:11, color:C.textSoft }}>spesa totale (ordini ricevuti)</div>
      </div>

      {loading ? <div style={{ color:C.textSoft }}>Caricamento…</div> : (
        <>
          {Object.keys(byFornitore).length > 0 && (
            <div style={{ background:C.bgCard, borderRadius:16, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom:20, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)" }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12, letterSpacing:'-0.01em' }}>Per fornitore</div>
              {Object.entries(byFornitore).sort(([,a],[,b])=>b-a).map(([nome,tot])=>(
                <div key={nome} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, color:C.text, fontWeight:600 }}>{nome}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:C.red, ...tnum }}>{fmt(tot)}</span>
                </div>
              ))}
            </div>
          )}
          {righe.map(o=>(
            <div key={o.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:C.bgCard, borderRadius:8, border:`1px solid ${C.border}`, marginBottom:8 }}>
              <div>
                <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{o.fornitori?.nome}</span>
                <span style={{ fontSize:10, color:C.textSoft, marginLeft:10 }}>{fmtDate(o.data_ordine)}</span>
              </div>
              <span style={{ fontSize:13, fontWeight:800, color:C.text, ...tnum }}>{fmt(o.totale)}</span>
            </div>
          ))}
          {righe.length === 0 && <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun ordine ricevuto nel periodo.</div>}
        </>
      )}
    </div>
  )
}

export default function Fornitori({ orgId, sedeId, sedi = [], notify }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState("fornitori")
  const TABS = [["fornitori","Fornitori"],["ordini","Ordini"],["spesa","Spesa"]]

  return (
    <div style={{ maxWidth: 1200, margin:"0 auto", padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: isMobile ? 16 : 20 }}>
        <p style={{ margin:0, fontSize:13, color:T.textSoft, letterSpacing:"-0.005em", lineHeight:1.45 }}>Gestisci fornitori, ordini e analizza la spesa nel tempo.</p>
      </div>

      <div style={{ display:"flex", gap:2, marginBottom: isMobile ? 16 : 24, borderBottom:`1px solid ${T.border}`, overflowX: isMobile ? "auto" : "visible" }}>
        {TABS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:"10px 16px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:13, fontWeight:tab===id?600:500, color:tab===id?T.text:T.textSoft,
              borderBottom:tab===id?`2px solid ${T.brand}`:"2px solid transparent",
              marginBottom:-1, letterSpacing:"-0.005em", whiteSpace:"nowrap",
              transition:`color ${M.durFast} ${M.ease}` }}
            onMouseEnter={e=>{if(tab!==id)e.currentTarget.style.color=T.textMid;}}
            onMouseLeave={e=>{if(tab!==id)e.currentTarget.style.color=T.textSoft;}}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "fornitori" && <FornitoriTab orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile}/>}
      {tab === "ordini"    && <OrdiniTab    orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile}/>}
      {tab === "spesa"     && <SpesaTab     orgId={orgId} isMobile={isMobile}/>}
    </div>
  )
}
