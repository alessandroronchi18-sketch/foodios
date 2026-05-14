import React, { useState, useMemo, useRef } from 'react'

const C = {
  bg:"#F8FAFC", bgCard:"#FFF", red:"#C0392B", redLight:"#FEF2F2",
  green:"#16A34A", greenLight:"#F0FDF4", amber:"#D97706", amberLight:"#FFFBEB",
  text:"#0F172A", textMid:"#475569", textSoft:"#94A3B8", white:"#FFF",
  border:"rgba(0,0,0,0.07)", borderStr:"#D1CBB8",
}
function fmt(n) { return `€${Number(n).toFixed(2)}` }
function fmtp(n) { return `${Number(n).toFixed(1)}%` }

// BCG matrix quadrant logic: margine% vs volume (numero ricette in produzione)
function bcgQuadrant(margPct, volRel) {
  const high = margPct >= 55
  const pop  = volRel >= 0.5
  if (high && pop)  return { q:"Star",      color:"#16A34A", bg:"#F0FDF4", tip:"Alta redditività e alta popolarità — prodotto core" }
  if (high && !pop) return { q:"Puzzle",    color:"#2563EB", bg:"#EFF6FF", tip:"Alta redditività ma bassa popolarità — promuovere" }
  if (!high && pop) return { q:"Plow",      color:"#D97706", bg:"#FFFBEB", tip:"Bassa redditività ma alta popolarità — ottimizzare food cost" }
  return                    { q:"Dog",       color:"#DC2626", bg:"#FEF2F2", tip:"Bassa redditività e bassa popolarità — rivalutare o rimuovere" }
}

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
        nome: ric.nome,
        prezzo: reg.prezzo,
        unita: reg.unita,
        tipo: reg.tipo,
        fc,
        ricavo,
        margPct: ricavo>0 ? (ricavo-fc)/ricavo*100 : 0,
        allergeni: ric.allergeni||[],
        descrizione: "",
        visibile: true,
      }])
    }
  }

  const filtrate = ricette.filter(r => !search || r.nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca ricetta…"
        style={{ width:"100%", padding:"9px 14px", borderRadius:9, border:`1px solid ${C.borderStr}`, fontSize:12, marginBottom:14, color:C.text }}/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:8 }}>
        {filtrate.map(r => {
          const sel = inMenu.has(r.nome)
          const reg = getR(r.nome, r)
          return (
            <div key={r.nome} onClick={()=>toggleItem(r)}
              style={{ padding:"11px 14px", borderRadius:9, border:`1.5px solid ${sel?C.red:C.borderStr}`, background:sel?C.redLight:C.bgCard, cursor:"pointer", transition:"all 0.15s" }}>
              <div style={{ fontSize:12, fontWeight:sel?800:600, color:sel?C.red:C.text, marginBottom:3 }}>{r.nome}</div>
              <div style={{ fontSize:10, color:C.textSoft }}>{fmt(reg.prezzo)} · {reg.unita} {reg.tipo==="fetta"?"fette":"pezzi"}</div>
              {sel && <div style={{ fontSize:9, fontWeight:900, color:C.red, marginTop:3 }}>✓ nel menù</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BCGMatrix({ menuItems }) {
  if (!menuItems.length) return (
    <div style={{ textAlign:"center", padding:"40px 0", color:C.textSoft, fontSize:13 }}>
      Aggiungi prodotti al menù per visualizzare la matrice BCG.
    </div>
  )

  const maxMarg = Math.max(...menuItems.map(m=>m.margPct), 1)
  const maxVol  = Math.max(...menuItems.map(m=>m.unita), 1)

  const withBcg = menuItems.map(m => ({
    ...m,
    volRel: m.unita / maxVol,
    bcg: bcgQuadrant(m.margPct, m.unita/maxVol),
  }))

  const quadrants = ["Star","Puzzle","Plow","Dog"]
  const byQ = quadrants.reduce((acc,q)=>({ ...acc, [q]: withBcg.filter(m=>m.bcg.q===q) }), {})

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
        {[
          { q:"Star",   title:"⭐ Star",   sub:"Alta % · Alta pop." },
          { q:"Puzzle", title:"❓ Puzzle",  sub:"Alta % · Bassa pop." },
          { q:"Plow",   title:"🐄 Plow",   sub:"Bassa % · Alta pop." },
          { q:"Dog",    title:"🐕 Dog",    sub:"Bassa % · Bassa pop." },
        ].map(({q,title,sub})=>{
          const info = bcgQuadrant(q==="Star"||q==="Puzzle"?70:20, q==="Star"||q==="Plow"?0.8:0.2)
          return (
            <div key={q} style={{ background:info.bg, borderRadius:12, padding:"16px 20px", border:`1px solid ${info.color}30` }}>
              <div style={{ fontSize:13, fontWeight:800, color:info.color, marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:10, color:C.textSoft, marginBottom:10 }}>{sub} · {info.tip}</div>
              {byQ[q].length === 0 ? (
                <div style={{ fontSize:11, color:C.textSoft, fontStyle:"italic" }}>Nessun prodotto</div>
              ) : byQ[q].map(m=>(
                <div key={m.nome} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${info.color}20` }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.text }}>{m.nome.length>20?m.nome.slice(0,19)+"…":m.nome}</span>
                  <div style={{ display:"flex", gap:10, fontSize:10, color:C.textMid }}>
                    <span>{fmt(m.prezzo)}</span>
                    <span style={{ fontWeight:700, color:info.color }}>{fmtp(m.margPct)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Scatter plot semplice */}
      <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, padding:"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:16 }}>Mappa prodotti (margine % × popolarità)</div>
        <div style={{ position:"relative", width:"100%", paddingBottom:"50%", background:"#FAFAF8", borderRadius:8, border:`1px solid ${C.border}` }}>
          {/* Quadrant lines */}
          <div style={{ position:"absolute", left:"50%", top:0, bottom:0, width:1, background:C.borderStr }}/>
          <div style={{ position:"absolute", top:"50%", left:0, right:0, height:1, background:C.borderStr }}/>
          <div style={{ position:"absolute", top:4, left:4, fontSize:9, color:C.textSoft }}>Puzzle</div>
          <div style={{ position:"absolute", top:4, right:4, fontSize:9, color:C.textSoft }}>Star</div>
          <div style={{ position:"absolute", bottom:4, left:4, fontSize:9, color:C.textSoft }}>Dog</div>
          <div style={{ position:"absolute", bottom:4, right:4, fontSize:9, color:C.textSoft }}>Plow</div>
          {withBcg.map(m => {
            const x = (m.unita / maxVol) * 95 + 2.5
            const y = 100 - (m.margPct / 100 * 95 + 2.5)
            return (
              <div key={m.nome} title={`${m.nome}: ${fmtp(m.margPct)} margine`}
                style={{ position:"absolute", left:`${x}%`, top:`${y}%`, transform:"translate(-50%,-50%)",
                  width:10, height:10, borderRadius:"50%", background:m.bcg.color,
                  border:"2px solid #FFF", boxShadow:"0 1px 4px rgba(0,0,0,0.2)", cursor:"help" }}/>
            )
          })}
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
          {withBcg.map(m=>(
            <div key={m.nome} style={{ display:"flex", alignItems:"center", gap:5, fontSize:9, color:C.textMid }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:m.bcg.color, display:"inline-block" }}/>
              {m.nome.length>15?m.nome.slice(0,14)+"…":m.nome}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MenuPreview({ menuItems, nomeAttivita }) {
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
    doc.setTextColor(0)
    y += 12

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
    doc.text('⚠ Informare sempre il personale di allergie o intolleranze alimentari prima di ordinare.', pw/2, y, { align:'center' })
    doc.save('menu.pdf')
  }

  const [editIdx, setEditIdx] = useState(null)
  const [editDesc, setEditDesc] = useState("")

  const visibili = menuItems.filter(m=>m.visibile)

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontSize:13, fontWeight:800, color:C.text }}>{visibili.length} prodotti nel menù</div>
        <button onClick={esportaPDF}
          style={{ padding:"9px 20px", background:C.red, color:C.white, border:"none", borderRadius:8, fontWeight:800, fontSize:12, cursor:"pointer" }}>
          📄 Esporta PDF menù
        </button>
      </div>

      {menuItems.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 0", color:C.textSoft, fontSize:13 }}>
          Aggiungi prodotti nella tab "Editor" per costruire il menù.
        </div>
      ) : (
        <div>
          {menuItems.map((m,i) => (
            <div key={m.nome} style={{ background:C.bgCard, borderRadius:10, border:`1px solid ${m.visibile?C.border:"#E2D9D5"}`, padding:"14px 18px", marginBottom:10, opacity:m.visibile?1:0.55, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:800, fontSize:13, color:C.text }}>{m.nome}</span>
                    <span style={{ fontWeight:900, fontSize:13, color:C.red, fontFamily:"Georgia,serif" }}>{fmt(m.prezzo)}</span>
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:m.margPct>=55?C.greenLight:C.amberLight, color:m.margPct>=55?C.green:C.amber, fontWeight:700 }}>{fmtp(m.margPct)}</span>
                  </div>
                  {editIdx === i ? (
                    <div style={{ display:"flex", gap:8 }}>
                      <input value={editDesc} onChange={e=>setEditDesc(e.target.value)}
                        placeholder="Descrizione per il menù…"
                        style={{ flex:1, padding:"7px 10px", borderRadius:7, border:`1px solid ${C.borderStr}`, fontSize:11, color:C.text }}/>
                      <button onClick={()=>{ menuItems[i].descrizione=editDesc; setEditIdx(null) }}
                        style={{ padding:"7px 14px", background:C.red, color:C.white, border:"none", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer" }}>Salva</button>
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:C.textSoft, fontStyle:m.descrizione?"normal":"italic", cursor:"pointer" }}
                      onClick={()=>{ setEditDesc(m.descrizione||""); setEditIdx(i) }}>
                      {m.descrizione || "Aggiungi descrizione…"}
                    </div>
                  )}
                </div>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", flexShrink:0 }}>
                  <span style={{ fontSize:10, color:C.textSoft }}>{m.visibile?"visibile":"nascosto"}</span>
                  <div style={{ width:32, height:18, borderRadius:9, background:m.visibile?C.red:"#CBD5E1", position:"relative", transition:"background 0.2s", cursor:"pointer" }}
                    onClick={()=>{ menuItems[i].visibile = !m.visibile; setEditIdx(null) }}>
                    <div style={{ position:"absolute", top:2, left:m.visibile?14:2, width:14, height:14, borderRadius:"50%", background:"#FFF", transition:"left 0.2s" }}/>
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

export default function MenuDinamico({ ricettario, ingCosti, calcolaFC, getR, nomeAttivita }) {
  const [tab, setTab] = useState("editor")
  const [menuItems, setMenuItems] = useState([])

  const TABS = [["editor","✏️ Editor menù"],["bcg","📊 Matrice BCG"],["anteprima","👁 Anteprima & PDF"]]

  return (
    <div style={{ maxWidth:1000 }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.red, marginBottom:6 }}>Marketing</div>
        <h1 style={{ margin:"0 0 6px", fontSize:28, fontWeight:900, color:C.text, letterSpacing:"-0.03em" }}>Menù Dinamico</h1>
        <p style={{ margin:0, fontSize:12, color:C.textSoft }}>Costruisci il menù, analizza la redditività con la matrice BCG ed esporta in PDF.</p>
      </div>

      {!ricettario ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:C.textSoft, fontSize:13 }}>
          Carica prima il ricettario per creare un menù.
        </div>
      ) : (
        <>
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
          {tab === "editor"    && <MenuEditor    ricettario={ricettario} ingCosti={ingCosti} calcolaFC={calcolaFC} getR={getR} menuItems={menuItems} setMenuItems={setMenuItems}/>}
          {tab === "bcg"       && <BCGMatrix     menuItems={menuItems}/>}
          {tab === "anteprima" && <MenuPreview   menuItems={menuItems} nomeAttivita={nomeAttivita}/>}
        </>
      )}
    </div>
  )
}
