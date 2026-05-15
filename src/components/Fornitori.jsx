import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const C = {
  bg:"#F8FAFC", bgCard:"#FFF", red:"#C0392B", redLight:"#FEF2F2", redDark:"#922B21",
  green:"#16A34A", greenLight:"#F0FDF4", amber:"#D97706", amberLight:"#FFFBEB",
  text:"#0F172A", textMid:"#475569", textSoft:"#94A3B8", white:"#FFF",
  border:"rgba(0,0,0,0.07)", borderStr:"#D1CBB8",
}

function fmt(n) { return n==null?"-":`€${Number(n).toFixed(2)}` }
function fmtDate(s) { if(!s) return "—"; const d=new Date(s); return d.toLocaleDateString("it-IT"); }

function FornitoriTab({ orgId, notify }) {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome:"", contatto:"", email:"", telefono:"", note:"" })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { carica() }, [orgId])

  async function carica() {
    setLoading(true)
    const { data } = await supabase.from("fornitori").select("*").eq("organization_id", orgId).order("nome")
    setLista(data || [])
    setLoading(false)
  }

  async function salva() {
    if (!form.nome.trim()) { notify("⚠ Inserisci il nome del fornitore", false); return }
    setSaving(true)
    const payload = { ...form, organization_id: orgId }
    let err
    if (editId) {
      ({ error: err } = await supabase.from("fornitori").update(payload).eq("id", editId))
    } else {
      ({ error: err } = await supabase.from("fornitori").insert(payload))
    }
    if (err) { notify("⚠ Errore: " + err.message, false) }
    else { notify(editId ? "✓ Fornitore aggiornato" : "✓ Fornitore aggiunto"); resetForm() }
    setSaving(false)
    carica()
  }

  async function elimina(id) {
    if (!confirm("Eliminare questo fornitore?")) return
    const { error } = await supabase.from("fornitori").delete().eq("id", id)
    if (error) { notify("⚠ Errore eliminazione: " + error.message, false); return }
    notify("✓ Fornitore eliminato")
    carica()
  }

  function resetForm() { setForm({ nome:"", contatto:"", email:"", telefono:"", note:"" }); setEditId(null) }
  function initEdit(f) { setForm({ nome:f.nome, contatto:f.contatto||"", email:f.email||"", telefono:f.telefono||"", note:f.note||"" }); setEditId(f.id) }

  const inputSt = { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize:12, color:C.text }

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
      {/* Form */}
      <div style={{ background:C.bgCard, borderRadius:12, padding:"20px 24px", border:`1px solid ${C.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:16 }}>
          {editId ? "✏️ Modifica fornitore" : "➕ Nuovo fornitore"}
        </div>
        {[["Nome *","nome","text"],["Referente","contatto","text"],["Email","email","email"],["Telefono","telefono","tel"]].map(([lbl,key,type])=>(
          <div key={key} style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>{lbl}</div>
            <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inputSt}/>
          </div>
        ))}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Note</div>
          <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2}
            style={{ ...inputSt, resize:"vertical" }}/>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={salva} disabled={saving}
            style={{ flex:1, padding:"10px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:12, cursor:"pointer" }}>
            {saving ? "…" : editId ? "Salva modifiche" : "Aggiungi"}
          </button>
          {editId && <button onClick={resetForm} style={{ padding:"10px 14px", background:C.white, border:`1px solid ${C.borderStr}`, borderRadius:8, fontSize:12, color:C.textMid, cursor:"pointer" }}>✕</button>}
        </div>
      </div>

      {/* Lista */}
      <div>
        {loading ? <div style={{ color:C.textSoft, fontSize:13, padding:20 }}>Caricamento…</div> : lista.length === 0 ? (
          <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun fornitore ancora.</div>
        ) : lista.map(f => (
          <div key={f.id} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding:"14px 18px", marginBottom:10, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:13, color:C.text }}>{f.nome}</div>
                {f.contatto && <div style={{ fontSize:11, color:C.textMid, marginTop:2 }}>👤 {f.contatto}</div>}
                {f.email && <div style={{ fontSize:11, color:C.textMid }}><a href={`mailto:${f.email}`} style={{ color:C.red }}>{f.email}</a></div>}
                {f.telefono && <div style={{ fontSize:11, color:C.textMid }}>📞 {f.telefono}</div>}
                {f.note && <div style={{ fontSize:10, color:C.textSoft, marginTop:4, fontStyle:"italic" }}>{f.note}</div>}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <button onClick={()=>initEdit(f)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.borderStr}`, background:C.white, fontSize:10, color:C.textMid, cursor:"pointer" }}>✏️</button>
                <button onClick={()=>elimina(f.id)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${C.red}40`, background:C.redLight, fontSize:10, color:C.red, cursor:"pointer" }}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrdiniTab({ orgId, notify }) {
  const [ordini, setOrdini] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ fornitore_id:"", data_ordine: new Date().toISOString().slice(0,10), note:"", stato:"bozza" })
  const [righe, setRighe] = useState([{ prodotto:"", quantita:"", unita:"kg", prezzo_unitario:"" }])
  const [saving, setSaving] = useState(false)

  useEffect(() => { carica() }, [orgId])

  async function carica() {
    setLoading(true)
    const [{ data:ord }, { data:forn }] = await Promise.all([
      supabase.from("ordini_fornitori").select("*, fornitori(nome)").eq("organization_id", orgId).order("data_ordine", { ascending:false }).limit(50),
      supabase.from("fornitori").select("id,nome").eq("organization_id", orgId).order("nome"),
    ])
    setOrdini(ord || [])
    setFornitori(forn || [])
    setLoading(false)
  }

  async function salvaOrdine() {
    if (!form.fornitore_id) { notify("⚠ Seleziona un fornitore", false); return }
    const righeValide = righe.filter(r=>r.prodotto.trim())
    if (!righeValide.length) { notify("⚠ Aggiungi almeno un prodotto", false); return }
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
    if (error) { notify("⚠ Errore: " + error.message, false); setSaving(false); return }
    await supabase.from("righe_ordine").insert(righeValide.map(r=>({
      ordine_id: ordineData.id,
      prodotto: r.prodotto,
      quantita: parseFloat(r.quantita)||0,
      unita: r.unita,
      prezzo_unitario: parseFloat(r.prezzo_unitario)||0,
      totale_riga: (parseFloat(r.quantita)||0)*(parseFloat(r.prezzo_unitario)||0),
    })))
    notify("✓ Ordine salvato")
    setShowForm(false)
    setForm({ fornitore_id:"", data_ordine: new Date().toISOString().slice(0,10), note:"", stato:"bozza" })
    setRighe([{ prodotto:"", quantita:"", unita:"kg", prezzo_unitario:"" }])
    setSaving(false)
    carica()
  }

  async function aggiornaStato(id, stato) {
    const { error } = await supabase.from("ordini_fornitori").update({ stato }).eq("id", id)
    if (error) { notify("⚠ Errore aggiornamento stato: " + error.message, false); return }
    notify("✓ Stato aggiornato")
    carica()
  }

  const addRiga = () => setRighe(r=>[...r,{ prodotto:"", quantita:"", unita:"kg", prezzo_unitario:"" }])
  const removeRiga = i => setRighe(r=>r.filter((_,j)=>j!==i))
  const updateRiga = (i, field, val) => setRighe(r=>r.map((x,j)=>j===i?{...x,[field]:val}:x))

  const statoColor = { bozza:"#94A3B8", inviato:"#2563EB", ricevuto:"#16A34A", annullato:"#DC2626" }
  const inputSt = { padding:"8px 10px", borderRadius:7, border:`1px solid ${C.borderStr}`, fontSize:12, color:C.text }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{ordini.length} ordini</div>
        <button onClick={()=>setShowForm(s=>!s)}
          style={{ padding:"9px 18px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:12, cursor:"pointer" }}>
          {showForm ? "✕ Annulla" : "➕ Nuovo ordine"}
        </button>
      </div>

      {showForm && (
        <div style={{ background:"#FFF0F0", border:`1px solid ${C.red}30`, borderRadius:12, padding:"20px 24px", marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:800, color:C.text, marginBottom:16 }}>Nuovo ordine</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
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
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 80px 1fr auto", gap:6, marginBottom:6 }}>
              {["Prodotto","Quantità","Unità","€/unità",""].map((h,i)=>(
                <div key={i} style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</div>
              ))}
            </div>
            {righe.map((r,i)=>(
              <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 80px 1fr auto", gap:6, marginBottom:6 }}>
                <input value={r.prodotto} onChange={e=>updateRiga(i,"prodotto",e.target.value)} placeholder="es. burro" style={inputSt}/>
                <input type="number" value={r.quantita} onChange={e=>updateRiga(i,"quantita",e.target.value)} placeholder="0" style={inputSt}/>
                <select value={r.unita} onChange={e=>updateRiga(i,"unita",e.target.value)} style={inputSt}>
                  {["kg","g","l","pz","cf"].map(u=><option key={u}>{u}</option>)}
                </select>
                <input type="number" value={r.prezzo_unitario} onChange={e=>updateRiga(i,"prezzo_unitario",e.target.value)} placeholder="0.00" style={inputSt}/>
                <button onClick={()=>removeRiga(i)} style={{ padding:"4px 8px", borderRadius:6, border:`1px solid ${C.border}`, background:C.white, color:C.textSoft, fontSize:10, cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={addRiga} style={{ padding:"6px 14px", background:C.white, border:`1px solid ${C.borderStr}`, borderRadius:7, fontSize:11, color:C.textMid, cursor:"pointer" }}>+ Riga</button>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Note</div>
            <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2}
              style={{ ...inputSt, width:"100%", resize:"vertical" }}/>
          </div>
          <button onClick={salvaOrdine} disabled={saving}
            style={{ padding:"10px 24px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:12, cursor:"pointer" }}>
            {saving ? "…" : "💾 Salva ordine"}
          </button>
        </div>
      )}

      {loading ? <div style={{ color:C.textSoft, fontSize:13 }}>Caricamento…</div> : ordini.length === 0 ? (
        <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun ordine ancora.</div>
      ) : (
        <div>
          {ordini.map(o=>(
            <div key={o.id} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${C.border}`, padding:"14px 18px", marginBottom:10, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:800, fontSize:13, color:C.text }}>{o.fornitori?.nome || "—"}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background:`${statoColor[o.stato]}20`, color:statoColor[o.stato] }}>{o.stato}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.textSoft }}>{fmtDate(o.data_ordine)}{o.note && ` · ${o.note}`}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontWeight:900, fontSize:15, color:C.text, fontFamily:"Georgia,serif" }}>{fmt(o.totale)}</span>
                  <select value={o.stato} onChange={e=>aggiornaStato(o.id,e.target.value)}
                    style={{ padding:"5px 8px", borderRadius:7, border:`1px solid ${C.borderStr}`, fontSize:11, color:C.text, cursor:"pointer" }}>
                    {["bozza","inviato","ricevuto","annullato"].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SpesaTab({ orgId }) {
  const [righe, setRighe] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState("30")

  useEffect(() => { carica() }, [orgId, range])

  async function carica() {
    setLoading(true)
    const from = new Date(); from.setDate(from.getDate() - parseInt(range))
    const { data } = await supabase
      .from("ordini_fornitori")
      .select("*, fornitori(nome)")
      .eq("organization_id", orgId)
      .eq("stato", "ricevuto")
      .gte("data_ordine", from.toISOString().slice(0,10))
      .order("data_ordine", { ascending:false })
    setRighe(data || [])
    setLoading(false)
  }

  const totale = righe.reduce((s,r)=>s+(r.totale||0), 0)
  const byFornitore = righe.reduce((acc,r)=>{ const n=r.fornitori?.nome||"?"; acc[n]=(acc[n]||0)+(r.totale||0); return acc }, {})

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <select value={range} onChange={e=>setRange(e.target.value)}
          style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize:12, color:C.text }}>
          <option value="7">Ultimi 7 giorni</option>
          <option value="30">Ultimi 30 giorni</option>
          <option value="90">Ultimi 90 giorni</option>
          <option value="365">Ultimo anno</option>
        </select>
        <div style={{ fontSize:22, fontWeight:900, color:C.text, fontFamily:"Georgia,serif" }}>{fmt(totale)}</div>
        <div style={{ fontSize:11, color:C.textSoft }}>spesa totale (ordini ricevuti)</div>
      </div>

      {loading ? <div style={{ color:C.textSoft }}>Caricamento…</div> : (
        <>
          {Object.keys(byFornitore).length > 0 && (
            <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, padding:"16px 20px", marginBottom:20, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Per fornitore</div>
              {Object.entries(byFornitore).sort(([,a],[,b])=>b-a).map(([nome,tot])=>(
                <div key={nome} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, color:C.text, fontWeight:600 }}>{nome}</span>
                  <span style={{ fontSize:12, fontWeight:800, color:C.red, fontFamily:"Georgia,serif" }}>{fmt(tot)}</span>
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
              <span style={{ fontSize:13, fontWeight:800, color:C.text, fontFamily:"Georgia,serif" }}>{fmt(o.totale)}</span>
            </div>
          ))}
          {righe.length === 0 && <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:40 }}>Nessun ordine ricevuto nel periodo.</div>}
        </>
      )}
    </div>
  )
}

export default function Fornitori({ orgId, notify }) {
  const [tab, setTab] = useState("fornitori")
  const TABS = [["fornitori","🏭 Fornitori"],["ordini","📋 Ordini"],["spesa","💶 Spesa"]]

  return (
    <div style={{ maxWidth:900 }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.red, marginBottom:6 }}>Acquisti</div>
        <h1 style={{ margin:"0 0 6px", fontSize:28, fontWeight:900, color:C.text, letterSpacing:"-0.03em" }}>Gestione Fornitori</h1>
        <p style={{ margin:0, fontSize:12, color:C.textSoft }}>Gestisci fornitori, ordini e analizza la spesa nel tempo.</p>
      </div>

      <div style={{ display:"flex", gap:4, marginBottom:24, borderBottom:`2px solid rgba(0,0,0,0.07)` }}>
        {TABS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:"8px 18px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:11, fontWeight:700, color:tab===id?C.red:C.textSoft,
              borderBottom:tab===id?`2px solid ${C.red}`:"2px solid transparent",
              marginBottom:-2, transition:"all 0.12s" }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "fornitori" && <FornitoriTab orgId={orgId} notify={notify}/>}
      {tab === "ordini"    && <OrdiniTab    orgId={orgId} notify={notify}/>}
      {tab === "spesa"     && <SpesaTab     orgId={orgId}/>}
    </div>
  )
}
