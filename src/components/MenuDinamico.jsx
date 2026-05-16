import React, { useState } from 'react'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

function fmt(n)  { return `€ ${Number(n).toFixed(2)}` }
function fmtp(n) { return `${Number(n).toFixed(1)}%` }

// BCG quadrant: margine% × popolarità (relative volume)
// Colors map to semantic tokens where possible; quadrant tints kept neutral.
function bcgQuadrant(margPct, volRel) {
  const high = margPct >= 55
  const pop  = volRel >= 0.5
  if (high && pop)  return { q:"Star",   color:T.green, bg:T.greenLight, tip:"Alta redditività e alta popolarità — prodotto core" }
  if (high && !pop) return { q:"Puzzle", color:T.blue,  bg:T.blueLight,  tip:"Alta redditività ma bassa popolarità — promuovere" }
  if (!high && pop) return { q:"Plow",   color:T.amber, bg:T.amberLight, tip:"Bassa redditività ma alta popolarità — ottimizzare food cost" }
  return                    { q:"Dog",   color:T.red,   bg:T.redLight,   tip:"Bassa redditività e bassa popolarità — rivalutare o rimuovere" }
}

/* ─── EDITOR ─────────────────────────────────────────────────────────── */
function MenuEditor({ ricettario, ingCosti, calcolaFC, getR, menuItems, setMenuItems }) {
  const [search, setSearch] = useState("")

  const ricette = Object.values(ricettario?.ricette||{}).filter(r => {
    const reg = getR(r.nome, r)
    return reg.tipo !== "interno" && reg.tipo !== "semilavorato"
  })

  const inMenu = new Set(menuItems.map(m=>m.nome))

  function toggleItem(ric) {
    if (inMenu.has(ric.nome)) {
      setMenuItems(prev => prev.filter(m=>m.nome!==ric.nome))
    } else {
      const reg = getR(ric.nome, ric)
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      const ricavo = reg.unita * reg.prezzo
      setMenuItems(prev => [...prev, {
        nome: ric.nome, prezzo: reg.prezzo, unita: reg.unita, tipo: reg.tipo,
        fc, ricavo, margPct: ricavo>0 ? (ricavo-fc)/ricavo*100 : 0,
        allergeni: ric.allergeni||[], descrizione: "", visibile: true,
      }])
    }
  }

  const filtrate = ricette.filter(r => !search || r.nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ position:"relative", marginBottom:16 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textSoft}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)" }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca ricetta…"
          style={{
            width:"100%", padding:"10px 14px 10px 36px", borderRadius:R.lg,
            border:`1px solid ${T.border}`, fontSize:13, color:T.text,
            background:T.bgCard, outline:"none",
            letterSpacing:"-0.005em",
            transition:`border-color ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}`,
          }}
          onFocus={e=>{ e.currentTarget.style.borderColor=T.borderStr; e.currentTarget.style.boxShadow=`0 0 0 3px ${T.brandSoft}`; }}
          onBlur={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.boxShadow="none"; }}/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
        {filtrate.map(r => {
          const sel = inMenu.has(r.nome)
          const reg = getR(r.nome, r)
          return (
            <button key={r.nome} type="button" onClick={()=>toggleItem(r)}
              style={{
                padding:"12px 14px", borderRadius:R.lg,
                border:`1px solid ${sel ? T.brand : T.border}`,
                background: sel ? T.brandLight : T.bgCard,
                cursor:"pointer", textAlign:"left",
                font:"inherit", color:"inherit",
                transition:`background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}, transform ${M.durFast} ${M.ease}`,
                outline:"none",
              }}
              onMouseEnter={e=>{ if(!sel) e.currentTarget.style.borderColor=T.borderStr }}
              onMouseLeave={e=>{ if(!sel) e.currentTarget.style.borderColor=T.border }}>
              <div style={{ fontSize:13, fontWeight: sel ? 700 : 600,
                color: sel ? T.brand : T.text, marginBottom:3, letterSpacing:"-0.005em" }}>
                {r.nome}
              </div>
              <div style={{ fontSize:11, color:T.textSoft, ...tnum }}>
                {fmt(reg.prezzo)} · {reg.unita} {reg.tipo==="fetta"?"fette":"pezzi"}
              </div>
              {sel && (
                <div style={{ fontSize:10, fontWeight:600, color:T.brand, marginTop:5,
                  display:"flex", alignItems:"center", gap:4, letterSpacing:"-0.005em" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  nel menù
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── BCG MATRIX ─────────────────────────────────────────────────────── */
function BCGMatrix({ menuItems }) {
  if (!menuItems.length) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"56px 20px", gap:12,
      background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:R.xl, boxShadow:S.sm,
    }}>
      <div style={{
        width:44, height:44, borderRadius:R.md, background:T.bgSubtle, color:T.textSoft,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="3" x2="3" y2="21"/><line x1="3" y1="21" x2="21" y2="21"/>
          <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
          <circle cx="15" cy="9"  r="1.5" fill="currentColor"/>
        </svg>
      </div>
      <div style={{ fontSize:13, color:T.textMid, fontWeight:500, letterSpacing:"-0.005em" }}>
        Nessun prodotto nel menù
      </div>
      <div style={{ fontSize:12, color:T.textSoft, maxWidth:280, textAlign:"center", lineHeight:1.5 }}>
        Aggiungi prodotti dall'Editor per visualizzare la matrice BCG.
      </div>
    </div>
  )

  const maxVol = Math.max(...menuItems.map(m=>m.unita), 1)

  const withBcg = menuItems.map(m => ({
    ...m,
    volRel: m.unita / maxVol,
    bcg: bcgQuadrant(m.margPct, m.unita/maxVol),
  }))

  const quadrants = ["Star","Puzzle","Plow","Dog"]
  const byQ = quadrants.reduce((acc,q)=>({ ...acc, [q]: withBcg.filter(m=>m.bcg.q===q) }), {})

  const QUAD_META = {
    Star:   { title:"Star",   sub:"Alta % · Alta popolarità",   sample:{ margPct:70, volRel:0.8 } },
    Puzzle: { title:"Puzzle", sub:"Alta % · Bassa popolarità",  sample:{ margPct:70, volRel:0.2 } },
    Plow:   { title:"Plow",   sub:"Bassa % · Alta popolarità",  sample:{ margPct:20, volRel:0.8 } },
    Dog:    { title:"Dog",    sub:"Bassa % · Bassa popolarità", sample:{ margPct:20, volRel:0.2 } },
  }

  return (
    <div>
      {/* Quadrant cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
        {quadrants.map(q => {
          const meta = QUAD_META[q]
          const info = bcgQuadrant(meta.sample.margPct, meta.sample.volRel)
          return (
            <div key={q} style={{
              background:info.bg, borderRadius:R.xl, padding:"16px 20px",
              border:`1px solid ${info.color}33`, boxShadow:S.xs,
            }}>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontSize:14, fontWeight:700, color:info.color, letterSpacing:"-0.01em" }}>
                  {meta.title}
                </div>
                <div style={{ fontSize:11, fontWeight:600, color:info.color, opacity:0.7, ...tnum }}>
                  {byQ[q].length}
                </div>
              </div>
              <div style={{ fontSize:11, color:T.textMid, marginBottom:10, lineHeight:1.4 }}>
                {meta.sub}
              </div>
              {byQ[q].length === 0 ? (
                <div style={{ fontSize:12, color:T.textSoft, fontStyle:"italic" }}>
                  Nessun prodotto
                </div>
              ) : byQ[q].map((m,i)=>(
                <div key={m.nome} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"7px 0",
                  borderTop: i===0 ? `1px solid ${info.color}22` : `1px solid ${info.color}15`,
                }}>
                  <span style={{ fontSize:12, fontWeight:500, color:T.text, letterSpacing:"-0.005em" }}>
                    {m.nome.length>22 ? m.nome.slice(0,21)+"…" : m.nome}
                  </span>
                  <div style={{ display:"flex", gap:10, fontSize:11, color:T.textMid, ...tnum }}>
                    <span>{fmt(m.prezzo)}</span>
                    <span style={{ fontWeight:600, color:info.color }}>{fmtp(m.margPct)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Scatter plot */}
      <div style={{
        background:T.bgCard, borderRadius:R.xl, border:`1px solid ${T.border}`,
        padding:"20px 24px", boxShadow:S.sm,
      }}>
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:600, color:T.text, letterSpacing:"-0.01em" }}>
            Mappa prodotti
          </div>
          <div style={{ fontSize:11, color:T.textSoft }}>margine % × popolarità</div>
        </div>
        <div style={{
          position:"relative", width:"100%", paddingBottom:"50%",
          background:T.bgSubtle, borderRadius:R.md, border:`1px solid ${T.borderSoft}`,
        }}>
          {/* Quadrant lines */}
          <div style={{ position:"absolute", left:"50%", top:0, bottom:0, width:1, background:T.border }}/>
          <div style={{ position:"absolute", top:"50%", left:0, right:0, height:1, background:T.border }}/>
          <div style={{ position:"absolute", top:6, left:8,  fontSize:10, fontWeight:500, color:T.textSoft, letterSpacing:"0.04em" }}>Puzzle</div>
          <div style={{ position:"absolute", top:6, right:8, fontSize:10, fontWeight:500, color:T.textSoft, letterSpacing:"0.04em" }}>Star</div>
          <div style={{ position:"absolute", bottom:6, left:8,  fontSize:10, fontWeight:500, color:T.textSoft, letterSpacing:"0.04em" }}>Dog</div>
          <div style={{ position:"absolute", bottom:6, right:8, fontSize:10, fontWeight:500, color:T.textSoft, letterSpacing:"0.04em" }}>Plow</div>
          {withBcg.map(m => {
            const x = (m.unita / maxVol) * 95 + 2.5
            const y = 100 - (Math.min(100,m.margPct) / 100 * 95 + 2.5)
            return (
              <div key={m.nome} title={`${m.nome}: ${fmtp(m.margPct)} margine`}
                style={{
                  position:"absolute", left:`${x}%`, top:`${y}%`, transform:"translate(-50%,-50%)",
                  width:11, height:11, borderRadius:"50%", background:m.bcg.color,
                  border:`2px solid ${T.bgCard}`,
                  boxShadow:"0 1px 4px rgba(15,23,42,0.18)", cursor:"help",
                }}/>
            )
          })}
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:14 }}>
          {withBcg.map(m=>(
            <div key={m.nome} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.textMid, letterSpacing:"-0.005em" }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:m.bcg.color, display:"inline-block" }}/>
              {m.nome.length>18 ? m.nome.slice(0,17)+"…" : m.nome}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── PREVIEW + PDF EXPORT ───────────────────────────────────────────── */
function MenuPreview({ menuItems, nomeAttivita }) {
  const [editIdx, setEditIdx]   = useState(null)
  const [editDesc, setEditDesc] = useState("")

  async function esportaPDF() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit:'mm', format:'a4' })
    const pw = doc.internal.pageSize.getWidth()
    let y = 20

    doc.setFontSize(22); doc.setFont(undefined,'bold')
    doc.text(nomeAttivita || 'Il nostro Menù', pw/2, y, { align:'center' })
    y += 10

    doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(120)
    doc.text('Prezzi IVA inclusa · Informi il personale di eventuali allergie', pw/2, y, { align:'center' })
    doc.setTextColor(0); y += 12

    doc.setDrawColor(200); doc.line(14, y, pw-14, y); y += 8

    const visibili = menuItems.filter(m=>m.visibile)
    for (const m of visibili) {
      if (y > 260) { doc.addPage(); y = 20 }
      doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(30)
      doc.text(m.nome, 14, y)
      doc.setFont(undefined,'bold'); doc.setTextColor(192,57,43)
      doc.text(fmt(m.prezzo), pw-14, y, { align:'right' })
      doc.setTextColor(0)
      if (m.descrizione) {
        y += 5
        doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(100)
        doc.text(m.descrizione, 14, y, { maxWidth: pw-28 })
        doc.setTextColor(0)
      }
      y += 9
    }

    y += 4; doc.setDrawColor(200); doc.line(14, y, pw-14, y); y += 7
    doc.setFontSize(7); doc.setTextColor(120)
    doc.text('Informare sempre il personale di allergie o intolleranze prima di ordinare.', pw/2, y, { align:'center' })
    doc.save('menu.pdf')
  }

  const visibili = menuItems.filter(m=>m.visibile)

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontSize:13, fontWeight:600, color:T.text, letterSpacing:"-0.005em" }}>
          <span style={{ color:T.brand, ...tnum }}>{visibili.length}</span>
          <span style={{ color:T.textMid, fontWeight:500 }}> prodott{visibili.length===1?"o":"i"} nel menù</span>
        </div>
        <button type="button" onClick={esportaPDF}
          style={{
            padding:"9px 18px", background:T.brand, color:T.white,
            border:`1px solid ${T.brand}`, borderRadius:R.full,
            fontWeight:600, fontSize:13, cursor:"pointer", letterSpacing:"-0.005em",
            boxShadow:S.brandSoft,
            display:"inline-flex", alignItems:"center", gap:8,
            transition:`background ${M.durFast} ${M.ease}, transform ${M.durFast} ${M.ease}`,
          }}
          onMouseEnter={e=>{ e.currentTarget.style.background=T.brandDark; }}
          onMouseLeave={e=>{ e.currentTarget.style.background=T.brand; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Esporta PDF
        </button>
      </div>

      {menuItems.length === 0 ? (
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          padding:"56px 20px", gap:12,
          background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:R.xl, boxShadow:S.sm,
        }}>
          <div style={{
            width:44, height:44, borderRadius:R.md, background:T.bgSubtle, color:T.textSoft,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div style={{ fontSize:13, color:T.textMid, fontWeight:500, letterSpacing:"-0.005em" }}>
            Nessun prodotto nel menù
          </div>
          <div style={{ fontSize:12, color:T.textSoft, maxWidth:300, textAlign:"center", lineHeight:1.5 }}>
            Aggiungi prodotti nella tab "Editor" per costruire il menù.
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {menuItems.map((m,i) => (
            <div key={m.nome} style={{
              background:T.bgCard, borderRadius:R.xl,
              border:`1px solid ${m.visibile?T.border:T.borderSoft}`,
              padding:"14px 18px",
              opacity: m.visibile ? 1 : 0.55,
              boxShadow:S.sm,
              transition:`opacity ${M.durBase} ${M.ease}, border-color ${M.durBase} ${M.ease}`,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:600, fontSize:14, color:T.text, letterSpacing:"-0.01em" }}>
                      {m.nome}
                    </span>
                    <span style={{ fontWeight:700, fontSize:14, color:T.brand, letterSpacing:"-0.015em", ...tnum }}>
                      {fmt(m.prezzo)}
                    </span>
                    <span style={{
                      fontSize:11, padding:"2px 8px", borderRadius:R.full,
                      background: m.margPct>=55 ? T.greenLight : T.amberLight,
                      color: m.margPct>=55 ? T.green : T.amber,
                      fontWeight:600, letterSpacing:"-0.005em", ...tnum,
                    }}>{fmtp(m.margPct)}</span>
                  </div>
                  {editIdx === i ? (
                    <div style={{ display:"flex", gap:8 }}>
                      <input value={editDesc} onChange={e=>setEditDesc(e.target.value)}
                        placeholder="Descrizione per il menù…"
                        autoFocus
                        style={{
                          flex:1, padding:"8px 12px", borderRadius:R.md,
                          border:`1px solid ${T.borderStr}`, fontSize:12, color:T.text,
                          background:T.bgCard, outline:"none",
                        }}/>
                      <button type="button"
                        onClick={()=>{ menuItems[i].descrizione=editDesc; setEditIdx(null) }}
                        style={{
                          padding:"8px 16px", background:T.brand, color:T.white,
                          border:"none", borderRadius:R.md, fontSize:12, fontWeight:600,
                          cursor:"pointer", letterSpacing:"-0.005em",
                        }}>
                        Salva
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      fontSize:12, color:m.descrizione?T.textMid:T.textSoft,
                      fontStyle:m.descrizione?"normal":"italic",
                      cursor:"pointer", letterSpacing:"-0.005em",
                    }}
                      onClick={()=>{ setEditDesc(m.descrizione||""); setEditIdx(i) }}>
                      {m.descrizione || "Aggiungi descrizione…"}
                    </div>
                  )}
                </div>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", flexShrink:0 }}>
                  <span style={{ fontSize:11, color:T.textSoft, letterSpacing:"-0.005em" }}>
                    {m.visibile ? "visibile" : "nascosto"}
                  </span>
                  <div
                    onClick={()=>{ menuItems[i].visibile = !m.visibile; setEditIdx(null) }}
                    style={{
                      width:34, height:20, borderRadius:R.full,
                      background: m.visibile ? T.brand : T.borderStr,
                      position:"relative", cursor:"pointer",
                      transition:`background ${M.durBase} ${M.ease}`,
                    }}>
                    <div style={{
                      position:"absolute", top:2, left: m.visibile ? 16 : 2,
                      width:16, height:16, borderRadius:"50%", background:T.white,
                      boxShadow:"0 1px 3px rgba(15,23,42,0.18)",
                      transition:`left ${M.durBase} ${M.ease}`,
                    }}/>
                  </div>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── MAIN WRAPPER ───────────────────────────────────────────────────── */
export default function MenuDinamico({ ricettario, ingCosti, calcolaFC, getR, nomeAttivita }) {
  const [tab, setTab] = useState("editor")
  const [menuItems, setMenuItems] = useState([])

  const TABS = [
    ["editor",    "Editor"],
    ["bcg",       "Matrice BCG"],
    ["anteprima", "Anteprima & PDF"],
  ]

  return (
    <div style={{ maxWidth:1040, margin:"0 auto", animation:`fos_pageIn ${M.durSlow} ${M.ease}` }}>

      {/* Header */}
      <div style={{ marginBottom:24, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{
          width:48, height:48, borderRadius:R.lg, background:T.brandLight, color:T.brand,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>
            <circle cx="6" cy="6"  r="1" fill="currentColor"/>
            <circle cx="6" cy="12" r="1" fill="currentColor"/>
            <circle cx="6" cy="18" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{
            margin:"0 0 4px", fontSize:26, fontWeight:700, color:T.text,
            letterSpacing:"-0.025em", lineHeight:1.15,
          }}>Menù</h1>
          <p style={{ margin:0, fontSize:13, color:T.textSoft, lineHeight:1.5, letterSpacing:"-0.005em" }}>
            Costruisci il menù, analizza la redditività con la matrice BCG ed esporta in PDF.
          </p>
        </div>
      </div>

      {!ricettario ? (
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          padding:"60px 24px", gap:12,
          background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:R.xl, boxShadow:S.sm,
        }}>
          <div style={{ fontSize:13, color:T.textMid, fontWeight:500 }}>Ricettario non caricato</div>
          <div style={{ fontSize:12, color:T.textSoft, maxWidth:320, textAlign:"center", lineHeight:1.5 }}>
            Carica prima il ricettario dal menù laterale per costruire un menù.
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{
            display:"flex", gap:2, marginBottom:22,
            borderBottom:`1px solid ${T.border}`,
          }}>
            {TABS.map(([id,lbl])=>{
              const active = tab===id
              return (
                <button key={id} type="button" onClick={()=>setTab(id)}
                  style={{
                    padding:"10px 18px", border:"none", background:"transparent", cursor:"pointer",
                    fontSize:13, fontWeight: active ? 600 : 500,
                    color: active ? T.text : T.textSoft,
                    borderBottom: active ? `2px solid ${T.brand}` : "2px solid transparent",
                    marginBottom:-1, letterSpacing:"-0.005em",
                    transition:`color ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
                  }}>
                  {lbl}
                </button>
              )
            })}
          </div>

          {tab === "editor"    && <MenuEditor    ricettario={ricettario} ingCosti={ingCosti} calcolaFC={calcolaFC} getR={getR} menuItems={menuItems} setMenuItems={setMenuItems}/>}
          {tab === "bcg"       && <BCGMatrix     menuItems={menuItems}/>}
          {tab === "anteprima" && <MenuPreview   menuItems={menuItems} nomeAttivita={nomeAttivita}/>}
        </>
      )}
    </div>
  )
}
