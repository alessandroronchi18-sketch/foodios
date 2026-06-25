import React, { useState, useEffect, useMemo, useRef } from 'react'
// jsPDF caricato dinamicamente solo all'export (chunk 'pdf' separato).
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { sload, ssave } from '../lib/storage'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { lessico } from '../lib/lessico'
import Icon from './Icon'
import { KPI, SH, PageHeader, Tip, C, fmt, fmtp } from '../views/_shared'

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

const SK_MENU = 'menu-giorno-v1'

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

// Suggerimento azionabile per quadrante BCG.
const QUAD_SUGGEST = {
  Star:   { icon:"star",      label:"Tieni in vetrina",        hint:"Cavalli di battaglia: tienili sempre disponibili e ben in vista." },
  Puzzle: { icon:"bulb",      label:"Promuovi",                hint:"Rendono ma vendono poco: spingili (consiglio, vetrina, promo)." },
  Plow:   { icon:"trendUp",   label:"Alza prezzo / riduci FC", hint:"Vendono ma rendono poco: ritocca il prezzo o ottimizza il food cost." },
  Dog:    { icon:"trendDown", label:"Valuta rimozione",        hint:"Vendono poco e rendono poco: valuta se rinnovarli o toglierli." },
}

// Popolarità reale dal venduto: somma unitaV per nome prodotto sugli ultimi `giorni` giorni.
// Le chiavi sono i nomi prodotto NORMALIZZATI (uppercase + trim), come in chiusure[].confronto[].nome.
// Fallback alla stima `unita` (pezzi/ricetta) solo se non esiste storico venduto.
function popolaritaDalVenduto(chiusure, giorni = 60) {
  const out = {}
  if (!Array.isArray(chiusure)) return out
  const soglia = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000)
  for (const ch of chiusure) {
    if (!ch) continue
    // ch.data = "YYYY-MM-DD". Senza data valida includiamo comunque (storico parziale).
    if (typeof ch.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ch.data)) {
      const d = new Date(ch.data + 'T00:00:00')
      if (!Number.isNaN(d.getTime()) && d < soglia) continue
    }
    for (const r of (ch.confronto || [])) {
      const key = String(r?.nome || '').toUpperCase().trim()
      if (!key) continue
      out[key] = (out[key] || 0) + (Number(r?.unitaV) || 0)
    }
  }
  return out
}

/* ─── EDITOR ─────────────────────────────────────────────────────────── */
function MenuEditor({ ricettario, ingCosti, calcolaFC, getR, menuItems, setMenuItems, isMobile, isTablet = false, LEX }) {
  const [search, setSearch] = useState("")

  const ricette = Object.values(ricettario?.ricette||{}).filter(r => {
    const reg = getR(r.nome, r)
    return reg.tipo !== "interno" && reg.tipo !== "semilavorato"
  })

  const inMenu = new Set(menuItems.map(m=>m.nome))

  // Costruisce la voce di menù da una ricetta (prezzo, FC, margine, allergeni).
  function buildItem(ric) {
    const reg = getR(ric.nome, ric)
    const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
    const ricavo = reg.unita * reg.prezzo
    return {
      nome: ric.nome, prezzo: reg.prezzo, unita: reg.unita, tipo: reg.tipo,
      fc, ricavo, margPct: ricavo>0 ? (ricavo-fc)/ricavo*100 : 0,
      allergeni: ric.allergeni||[], descrizione: "", visibile: true,
    }
  }

  function toggleItem(ric) {
    if (inMenu.has(ric.nome)) setMenuItems(prev => prev.filter(m=>m.nome!==ric.nome))
    else setMenuItems(prev => [...prev, buildItem(ric)])
  }

  const filtrate = ricette.filter(r => !search || r.nome.toLowerCase().includes(search.toLowerCase()))
  // Seleziona/deseleziona tutte le ricette attualmente filtrate.
  const tutteInMenu = filtrate.length > 0 && filtrate.every(r => inMenu.has(r.nome))
  function selezionaTutti() {
    setMenuItems(prev => { const have = new Set(prev.map(m=>m.nome)); return [...prev, ...filtrate.filter(r=>!have.has(r.nome)).map(buildItem)] })
  }
  function deselezionaTutti() {
    const names = new Set(filtrate.map(r=>r.nome)); setMenuItems(prev => prev.filter(m=>!names.has(m.nome)))
  }

  return (
    <div>
      <div style={{ position:"relative", marginBottom:16 }}>
        <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", display:"inline-flex", color:T.textSoft }}>
          <Icon name="search" size={15}/>
        </span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Cerca ${LEX.ricetta}…`}
          style={{
            width:"100%", padding:"10px 14px 10px 36px", borderRadius:R.lg,
            border:`1px solid ${T.border}`, fontSize: isMobile?16:13, color:T.text,
            background:T.bgCard, outline:"none",
            letterSpacing:"-0.005em", boxSizing:"border-box",
            transition:`border-color ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}`,
          }}
          onFocus={e=>{ e.currentTarget.style.borderColor=T.borderStr; e.currentTarget.style.boxShadow=`0 0 0 3px ${T.brandSoft}`; }}
          onBlur={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.boxShadow="none"; }}/>
      </div>

      {/* Azioni rapide: seleziona / deseleziona tutte le ricette filtrate */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{ fontSize:12, color:T.textSoft }}>{menuItems.length} nel menù · {filtrate.length} {search ? "trovate" : LEX.ricette}</div>
        <button type="button" onClick={tutteInMenu ? deselezionaTutti : selezionaTutti}
          style={{ padding:"8px 14px", minHeight:40, borderRadius:R.md, border:`1px solid ${T.brand}`, background: tutteInMenu ? T.bgCard : T.brand, color: tutteInMenu ? T.brand : T.white, fontSize:12, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
          {!tutteInMenu && <Icon name="check" size={13} color={T.white}/>}
          {tutteInMenu ? "Deseleziona tutti" : `Seleziona tutti${search ? " (filtrati)" : ""}`}
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(3, 1fr)" : "repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
        {filtrate.map(r => {
          const sel = inMenu.has(r.nome)
          const reg = getR(r.nome, r)
          return (
            <button key={r.nome} type="button" onClick={()=>toggleItem(r)}
              style={{
                padding:"12px 14px", borderRadius:R.lg, minHeight:40,
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
                  <Icon name="check" size={11} strokeWidth={3}/>
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
function BCGMatrix({ menuItems, popVenduto, hasStorico, isMobile, isTablet }) {
  if (!menuItems.length) return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"56px 20px", gap:12,
      background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
    }}>
      <div style={{
        width:44, height:44, borderRadius:R.md, background:T.bgSubtle, color:T.textSoft,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        <Icon name="barChart" size={22} strokeWidth={1.7}/>
      </div>
      <div style={{ fontSize:13, color:T.textMid, fontWeight:500, letterSpacing:"-0.005em" }}>
        Nessun prodotto nel menù
      </div>
      <div style={{ fontSize:12, color:T.textSoft, maxWidth:280, textAlign:"center", lineHeight:1.5 }}>
        Aggiungi prodotti dall'Editor per visualizzare la matrice BCG.
      </div>
    </div>
  )

  // Volume reale dal venduto se disponibile, altrimenti stima `unita` (pezzi/ricetta).
  const volOf = (m) => {
    const v = popVenduto[m.nome.toUpperCase().trim()]
    return v != null ? v : (Number(m.unita) || 0)
  }
  const maxVol = Math.max(...menuItems.map(volOf), 1)

  const withBcg = menuItems.map(m => {
    const vol = volOf(m)
    const volRel = vol / maxVol
    return { ...m, vol, volRel, bcg: bcgQuadrant(m.margPct, volRel) }
  })

  const quadrants = ["Star","Puzzle","Plow","Dog"]
  const byQ = quadrants.reduce((acc,q)=>({ ...acc, [q]: withBcg.filter(m=>m.bcg.q===q) }), {})
  // Numerazione stabile (per margine desc) usata sia nei pallini sia nella legenda.
  const ranked = [...withBcg].sort((a,b)=> b.margPct - a.margPct)

  const QUAD_META = {
    Star:   { title:"Star",   sub:"Alto margine · Molto venduto",  desc:"I tuoi cavalli di battaglia: rendono bene e vendono tanto. Tienili sempre disponibili e ben in vista.", sample:{ margPct:70, volRel:0.8 } },
    Puzzle: { title:"Puzzle", sub:"Alto margine · Poco venduto",   desc:"Rendono bene ma li compra in pochi: spingili (vetrina, consiglio, promo) per trasformarli in Star.", sample:{ margPct:70, volRel:0.2 } },
    Plow:   { title:"Plow",   sub:"Basso margine · Molto venduto", desc:"Piacciono e vendono, ma guadagni poco: rivedi food cost o ritocca il prezzo per alzare il margine.", sample:{ margPct:20, volRel:0.8 } },
    Dog:    { title:"Dog",    sub:"Basso margine · Poco venduto",  desc:"Vendono poco e rendono poco: valuta se rinnovarli, sostituirli o toglierli dal menù.", sample:{ margPct:20, volRel:0.2 } },
  }

  return (
    <div>
      {/* Sorgente popolarità */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, fontSize:12, color:T.textMid }}>
        <Icon name={hasStorico ? "checkCircle" : "warning"} size={15} color={hasStorico ? T.green : T.amber}/>
        {hasStorico
          ? "Popolarità calcolata sul venduto reale (ultimi 60 giorni)."
          : "Nessuno storico venduto: popolarità stimata dai pezzi per ricetta."}
      </div>

      {/* Quadrant cards */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:24 }}>
        {quadrants.map(q => {
          const meta = QUAD_META[q]
          const info = bcgQuadrant(meta.sample.margPct, meta.sample.volRel)
          const sg = QUAD_SUGGEST[q]
          return (
            <div key={q} style={{
              background:info.bg, borderRadius:16, padding:"16px 20px",
              border:`1px solid ${info.color}33`, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 8px 22px rgba(15,23,42,0.05)",
            }}>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ fontSize:14, fontWeight:700, color:info.color, letterSpacing:"-0.01em" }}>
                  {meta.title}
                </div>
                <div style={{ fontSize:11, fontWeight:600, color:info.color, opacity:0.7, ...tnum }}>
                  {byQ[q].length}
                </div>
              </div>
              <div style={{ fontSize:11, fontWeight:600, color:info.color, marginBottom:6, lineHeight:1.4 }}>
                {meta.sub}
              </div>
              <div style={{ fontSize:11, color:T.textMid, marginBottom:10, lineHeight:1.5 }}>
                {meta.desc}
              </div>
              {/* Suggerimento azionabile */}
              <Tip text={sg.hint}>
                <span style={{
                  display:"inline-flex", alignItems:"center", gap:6, marginBottom:10,
                  padding:"5px 10px", borderRadius:R.full, background:`${info.color}1a`,
                  color:info.color, fontSize:11, fontWeight:700, cursor:"help",
                }}>
                  <Icon name={sg.icon} size={12} color={info.color}/>{sg.label}
                </span>
              </Tip>
              {byQ[q].length === 0 ? (
                <div style={{ fontSize:12, color:T.textSoft, fontStyle:"italic", marginTop:8 }}>
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
        background:T.bgCard, borderRadius:18, border:`1px solid ${T.border}`,
        padding: isMobile ? "16px 14px" : "20px 24px", boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
      }}>
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text, letterSpacing:"-0.01em" }}>
            Mappa prodotti
          </div>
          <div style={{ fontSize:11, color:T.textSoft }}>margine % × popolarità</div>
        </div>
        <div style={{
          position:"relative", width:"100%", paddingBottom: isMobile ? "82%" : "58%",
          background:T.bgSubtle, borderRadius:R.md, border:`1px solid ${T.borderSoft}`, overflow:"hidden",
        }}>
          {/* Tinte quadranti */}
          <div style={{ position:"absolute", top:0, left:0, width:"50%", height:"50%", background:"rgba(91,143,206,0.07)" }}/>
          <div style={{ position:"absolute", top:0, right:0, width:"50%", height:"50%", background:"rgba(22,163,74,0.08)" }}/>
          <div style={{ position:"absolute", bottom:0, left:0, width:"50%", height:"50%", background:"rgba(192,57,43,0.06)" }}/>
          <div style={{ position:"absolute", bottom:0, right:0, width:"50%", height:"50%", background:"rgba(212,160,48,0.07)" }}/>
          {/* Linee quadrante */}
          <div style={{ position:"absolute", left:"50%", top:0, bottom:0, width:1, background:T.border }}/>
          <div style={{ position:"absolute", top:"50%", left:0, right:0, height:1, background:T.border }}/>
          <div style={{ position:"absolute", top:6, left:8,  fontSize:10, fontWeight:700, color:T.blue }}>Puzzle</div>
          <div style={{ position:"absolute", top:6, right:8, fontSize:10, fontWeight:700, color:T.green, display:"inline-flex", alignItems:"center", gap:3 }}><Icon name="star" size={10} color={T.green}/>Star</div>
          <div style={{ position:"absolute", bottom:18, left:8,  fontSize:10, fontWeight:700, color:T.red }}>Dog</div>
          <div style={{ position:"absolute", bottom:18, right:8, fontSize:10, fontWeight:700, color:T.amber }}>Plow</div>
          {/* Captions assi */}
          <div style={{ position:"absolute", bottom:3, left:"50%", transform:"translateX(-50%)", fontSize:9, color:T.textSoft }}>popolarità →</div>
          <div style={{ position:"absolute", top:"50%", left:3, transform:"translateY(-50%) rotate(180deg)", writingMode:"vertical-rl", fontSize:9, color:T.textSoft }}>margine →</div>
          {ranked.map((m,idx) => {
            const x = m.volRel * 90 + 5
            const y = 100 - (Math.min(100,m.margPct) / 100 * 90 + 5)
            return (
              <div key={m.nome} title={`${m.nome}: ${fmtp(m.margPct)} margine · ${m.vol.toLocaleString('it-IT')} ${hasStorico ? "vendite" : "pz/ric"}`}
                style={{
                  position:"absolute", left:`${x}%`, top:`${y}%`, transform:"translate(-50%,-50%)",
                  width:22, height:22, borderRadius:"50%", background:m.bcg.color, color:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800,
                  border:`2px solid ${T.bgCard}`, boxShadow:"0 2px 6px rgba(15,23,42,0.22)", cursor:"help",
                }}>{idx+1}</div>
            )
          })}
        </div>
        {/* Legenda numerata: numero → prodotto → margine */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(190px, 1fr))", gap:"6px 16px", marginTop:16 }}>
          {ranked.map((m,idx)=>(
            <div key={m.nome} style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:T.textMid }}>
              <span style={{ width:17, height:17, borderRadius:"50%", background:m.bcg.color, color:"#fff", fontSize:9, fontWeight:800, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{idx+1}</span>
              <span style={{ flex:1, minWidth:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.nome}</span>
              <span style={{ fontWeight:700, color:m.bcg.color, ...tnum }}>{fmtp(m.margPct)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── PREVIEW + PDF EXPORT ───────────────────────────────────────────── */
function MenuPreview({ menuItems, setMenuItems, nomeAttivita, isMobile }) {
  const [editIdx, setEditIdx]   = useState(null)
  const [editDesc, setEditDesc] = useState("")

  async function esportaPDF() {
    const { default: jsPDF } = await import('jspdf')
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

    const visibili = menuItems.filter(m=>m.visibile).sort((a,b)=>a.nome.localeCompare(b.nome,'it'))
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

  // Salva la descrizione in modo immutabile (spread), così React aggiorna.
  function salvaDescrizione(i) {
    setMenuItems(prev => prev.map((m,idx)=> idx===i ? { ...m, descrizione: editDesc } : m))
    setEditIdx(null)
  }
  // Toggle visibilità immutabile (spread).
  function toggleVisibile(i) {
    setMenuItems(prev => prev.map((m,idx)=> idx===i ? { ...m, visibile: !m.visibile } : m))
    setEditIdx(null)
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
            padding:"9px 18px", minHeight:40, background:T.brand, color:T.white,
            border:`1px solid ${T.brand}`, borderRadius:R.full,
            fontWeight:600, fontSize:13, cursor:"pointer", letterSpacing:"-0.005em",
            boxShadow:S.brandSoft,
            display:"inline-flex", alignItems:"center", gap:8,
            transition:`background ${M.durFast} ${M.ease}, transform ${M.durFast} ${M.ease}`,
          }}
          onMouseEnter={e=>{ e.currentTarget.style.background=T.brandDark; }}
          onMouseLeave={e=>{ e.currentTarget.style.background=T.brand; }}>
          <Icon name="download" size={14} color={T.white}/>
          Esporta PDF
        </button>
      </div>

      {menuItems.length === 0 ? (
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          padding:"56px 20px", gap:12,
          background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
        }}>
          <div style={{
            width:44, height:44, borderRadius:R.md, background:T.bgSubtle, color:T.textSoft,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <Icon name="fileText" size={22} strokeWidth={1.7}/>
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
              background:T.bgCard, borderRadius:16,
              border:`1px solid ${m.visibile?T.border:T.borderSoft}`,
              padding:"14px 18px",
              opacity: m.visibile ? 1 : 0.55,
              boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
              transition:`opacity ${M.durBase} ${M.ease}, border-color ${M.durBase} ${M.ease}`,
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:600, fontSize:14, color:T.text, letterSpacing:"-0.01em" }}>
                      {m.nome}
                    </span>
                    <span style={{ fontWeight:700, fontSize:14, color:T.brand, letterSpacing:"-0.015em", whiteSpace:"nowrap", ...tnum }}>
                      {fmt(m.prezzo)}
                    </span>
                    <span style={{
                      fontSize:11, padding:"2px 8px", borderRadius:R.full,
                      background: m.margPct>=55 ? T.greenLight : T.amberLight,
                      color: m.margPct>=55 ? T.green : T.amber,
                      fontWeight:600, letterSpacing:"-0.005em", whiteSpace:"nowrap", ...tnum,
                    }}>{fmtp(m.margPct)}</span>
                  </div>
                  {editIdx === i ? (
                    <div style={{ display:"flex", gap:8 }}>
                      <input value={editDesc} onChange={e=>setEditDesc(e.target.value)}
                        placeholder="Descrizione per il menù…"
                        autoFocus
                        onKeyDown={e=>{ if(e.key==='Enter') salvaDescrizione(i) }}
                        style={{
                          flex:1, padding:"8px 12px", borderRadius:R.md,
                          border:`1px solid ${T.borderStr}`, fontSize: isMobile?16:12, color:T.text,
                          background:T.bgCard, outline:"none", boxSizing:"border-box",
                        }}/>
                      <button type="button"
                        onClick={()=>salvaDescrizione(i)}
                        style={{
                          padding:"8px 16px", minHeight:40, background:T.brand, color:T.white,
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
                    onClick={()=>toggleVisibile(i)}
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

/* ─── BANDA DIAGNOSI ─────────────────────────────────────────────────── */
// Audit 2026-06-22: aggiunto isTablet ai props (era usato al rigo 541 ma mai
// destrutturato → ReferenceError in build minificato, stessa classe del bug
// HeaderPersonale).
function BandaDiagnosi({ menuItems, popVenduto, isMobile, isTablet = false }) {
  const n = menuItems.length
  const margMedio = n ? menuItems.reduce((s,m)=>s+(Number(m.margPct)||0),0)/n : 0
  // Food cost medio % sul ricavo (FC / ricavo).
  const fcVals = menuItems.map(m => (Number(m.ricavo)>0 ? (Number(m.fc)/Number(m.ricavo))*100 : 0))
  const fcMedio = n ? fcVals.reduce((s,v)=>s+v,0)/n : 0
  // Dog = basso margine (<55%) e bassa popolarità (volRel < 0.5).
  const volOf = (m) => {
    const v = popVenduto[m.nome.toUpperCase().trim()]
    return v != null ? v : (Number(m.unita) || 0)
  }
  const maxVol = Math.max(...(n ? menuItems.map(volOf) : [1]), 1)
  const nDog = menuItems.filter(m => bcgQuadrant(m.margPct, volOf(m)/maxVol).q === "Dog").length

  return (
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap:14, marginBottom:24 }}>
      <KPI label="Prodotti nel menù" value={n.toLocaleString('it-IT')}
        icon={<Icon name="fileText" size={18}/>}/>
      <KPI label="Margine medio" value={fmtp(margMedio)} color={margMedio>=55?T.green:T.amber}
        icon={<Icon name="trendUp" size={18}/>}/>
      <KPI label="Food cost medio" value={fmtp(fcMedio)} color={fcMedio<=45?T.green:T.amber}
        icon={<Icon name="barChart" size={18}/>}/>
      <KPI label="Da rivedere (Dog)" value={nDog.toLocaleString('it-IT')} color={nDog>0?T.red:T.green}
        sub={nDog>0 ? "valuta rimozione" : "nessuno"}
        icon={<Icon name={nDog>0?"warning":"checkCircle"} size={18}/>}/>
    </div>
  )
}

/* ─── MAIN WRAPPER ───────────────────────────────────────────────────── */
export default function MenuDinamico({ ricettario, ingCosti, calcolaFC, getR, nomeAttivita, tipoAttivita, chiusure, orgId, sedeId }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const [tab, setTab] = useState("editor")
  const [menuItems, setMenuItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [errSave, setErrSave] = useState(false)
  // Evita di salvare durante il caricamento iniziale (sennò sovrascrive con []).
  const skipNextSave = useRef(true)

  // Popolarità reale dal venduto (ultimi ~60 giorni). Memoizzata su chiusure.
  const popVenduto = useMemo(() => popolaritaDalVenduto(chiusure, 60), [chiusure])
  const hasStorico = useMemo(() => Object.keys(popVenduto).length > 0, [popVenduto])

  // Carica il menù persistito al mount (per-sede).
  useEffect(() => {
    let alive = true
    skipNextSave.current = true
    setLoaded(false)
    ;(async () => {
      const saved = await sload(SK_MENU, orgId, sedeId)
      if (!alive) return
      setMenuItems(Array.isArray(saved) ? saved : [])
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Persisti il menù quando cambia la selezione (dopo il load iniziale).
  // Audit 2026-06-19 MED: debounce 500ms + sequence number per evitare race su
  // selezioni rapide (10 click ravvicinati → 10 ssave in volo → out-of-order
  // responses possono lasciare il DB con uno stato intermedio invece dell'ultimo).
  const saveSeq = useRef(0)
  useEffect(() => {
    if (!loaded || !orgId) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    const mySeq = ++saveSeq.current
    const snapshot = menuItems
    const t = setTimeout(() => {
      ssave(SK_MENU, snapshot, orgId, sedeId)
        .then(() => { if (mySeq === saveSeq.current) setErrSave(false) })
        .catch(e => {
          console.error('menu save failed', e)
          if (mySeq === saveSeq.current) setErrSave(true)
        })
    }, 500)
    return () => clearTimeout(t)
  }, [menuItems, loaded, orgId, sedeId])

  const TABS = [
    ["editor",    "Editor"],
    ["bcg",       "Matrice BCG"],
    ["anteprima", "Anteprima & PDF"],
  ]

  return (
    <div style={{ maxWidth: 1200, margin:"0 auto", animation:`fos_pageIn ${M.durSlow} ${M.ease}` }}>

      <PageHeader subtitle="Costruisci il menù, analizza la redditività con la matrice BCG ed esporta in PDF." />

      {errSave && (
        <div style={{
          display:"flex", alignItems:"center", gap:8, marginBottom:16,
          padding:"10px 14px", borderRadius:R.md, background:T.redLight,
          border:`1px solid ${T.red}33`, color:T.red, fontSize:12, fontWeight:600,
        }}>
          <Icon name="warning" size={15} color={T.red}/>
          Salvataggio del menù non riuscito. Le modifiche potrebbero non essere conservate.
        </div>
      )}

      {!ricettario ? (
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          padding:"60px 24px", gap:12,
          background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
        }}>
          <div style={{ fontSize:13, color:T.textMid, fontWeight:500 }}>{LEX.Ricettario} non caricato</div>
          <div style={{ fontSize:12, color:T.textSoft, maxWidth:320, textAlign:"center", lineHeight:1.5 }}>
            Carica prima il {LEX.Ricettario.toLowerCase()} dal menù laterale per costruire un menù.
          </div>
        </div>
      ) : (
        <>
          {/* Banda diagnosi */}
          <BandaDiagnosi menuItems={menuItems} popVenduto={popVenduto} isMobile={isMobile} isTablet={isTablet}/>

          <SH sub={`Seleziona ${LEX.ricette === 'pizze' || LEX.ricette === 'gusti' || LEX.ricette === 'piatti' || LEX.ricette === 'formati' ? `i ${LEX.ricette}` : `le ${LEX.ricette}`}, analizza i quadranti BCG ed esporta il menù.`}>Menù del giorno</SH>

          {/* Tabs — overflowX:auto su mobile per non far wrappare le label. */}
          <div style={{
            display:"flex", gap:2, marginBottom:22,
            borderBottom:`1px solid ${T.border}`,
            overflowX: isMobile ? 'auto' : 'visible',
            WebkitOverflowScrolling: 'touch',
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
                    whiteSpace:"nowrap", minHeight: isMobile ? 44 : 40,
                    transition:`color ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
                  }}>
                  {lbl}
                </button>
              )
            })}
          </div>

          {tab === "editor"    && <MenuEditor    ricettario={ricettario} ingCosti={ingCosti} calcolaFC={calcolaFC} getR={getR} menuItems={menuItems} setMenuItems={setMenuItems} isMobile={isMobile} isTablet={isTablet} LEX={LEX}/>}
          {tab === "bcg"       && <BCGMatrix     menuItems={menuItems} popVenduto={popVenduto} hasStorico={hasStorico} isMobile={isMobile} isTablet={isTablet}/>}
          {tab === "anteprima" && <MenuPreview   menuItems={menuItems} setMenuItems={setMenuItems} nomeAttivita={nomeAttivita} isMobile={isMobile}/>}
        </>
      )}
    </div>
  )
}
