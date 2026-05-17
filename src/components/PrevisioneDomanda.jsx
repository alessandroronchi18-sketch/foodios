import React, { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" };

// ── Algoritmo previsione ────────────────────────────────────────────────────
// Weighted moving average with exponential smoothing (α=0.3 for trend)
// Returns { prev: number, trend: "up"|"down"|"flat", confidence: 0-1 }
function previsione(serie, periodi = 3) {
  if (!serie || serie.length < 2) return { prev: serie?.[0] || 0, trend: "flat", confidence: 0.3 }
  const n = serie.length
  // Simple exponential smoothing (Holt's linear)
  let alpha = 0.3, beta = 0.1
  let level = serie[0], slope = serie[1] - serie[0]
  for (let i = 1; i < n; i++) {
    const prevLevel = level
    level = alpha * serie[i] + (1 - alpha) * (level + slope)
    slope = beta * (level - prevLevel) + (1 - beta) * slope
  }
  const forecast = Math.max(0, level + slope * periodi)
  const trend = slope > 0.05 * level ? "up" : slope < -0.05 * level ? "down" : "flat"
  // Confidence based on series length and variance
  const media = serie.reduce((a,b)=>a+b,0) / n
  const variance = serie.reduce((s,v)=>s+Math.pow(v-media,2),0) / n
  const cv = media > 0 ? Math.sqrt(variance) / media : 1
  const confidence = Math.max(0.2, Math.min(0.95, 1 - cv * 0.5 - (n < 4 ? 0.3 : 0)))
  return { prev: Math.round(forecast * 10) / 10, trend, confidence }
}

// Stagionalità: media per giorno settimana (0=dom)
function calcolaPoiStagionale(giornaliero) {
  const byDow = Array(7).fill(null).map(() => [])
  for (const sess of giornaliero || []) {
    if (!sess.data) continue
    const dow = new Date(sess.data).getDay()
    const tot = (sess.prodotti || []).reduce((s, p) => s + p.stampi, 0)
    byDow[dow].push(tot)
  }
  return byDow.map(vals => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0)
}

const DAYS_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
const MONTHS_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"]

function RicettaForecast({ ric, giornaliero, calcolaFC, ingCosti, ricettario, getR }) {
  // Build monthly production series for this recipe
  const serie = useMemo(() => {
    const byMese = {}
    for (const sess of giornaliero || []) {
      if (!sess.data) continue
      const m = sess.data.slice(0, 7)
      const prod = (sess.prodotti || []).find(p => p.nome === ric.nome)
      if (prod) byMese[m] = (byMese[m] || 0) + prod.stampi
    }
    return Object.entries(byMese).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ mese: m, stampi: v }))
  }, [giornaliero, ric.nome])

  const values = serie.map(s => s.stampi)
  const fcResult = useMemo(() => calcolaFC(ric, ingCosti, ricettario), [ric, ingCosti])
  const reg = getR(ric.nome, ric)
  const ricavoPerStampo = reg.unita * reg.prezzo

  if (serie.length < 2) return null

  const { prev, trend, confidence } = previsione(values)
  const media = values.reduce((a,b)=>a+b,0)/values.length
  const prevMese = serie.at(-1)?.mese
  const nextMese = prevMese ? (() => {
    const [y, m] = prevMese.split("-").map(Number)
    return m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,"0")}`
  })() : "—"
  const nextMeseLabel = nextMese !== "—" ? `${MONTHS_IT[parseInt(nextMese.split("-")[1])-1]} ${nextMese.split("-")[0]}` : "—"

  const trendIcon = { up:"↗", down:"↘", flat:"→" }[trend]
  const trendColor = { up:C.green, down:C.red, flat:C.amber }[trend]

  const chartData = [
    ...serie.map(s=>({ mese:s.mese.slice(5), stampi:s.stampi, tipo:"storico" })),
    { mese:nextMese.slice(5), stampi:prev, tipo:"previsione" },
  ]

  return (
    <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 20px", marginBottom:14, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:3 }}>{ric.nome}</div>
          <div style={{ fontSize:11, color:C.textSoft }}>{serie.length} mesi di dati · media {media.toFixed(1)} stampi/mese</div>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em" }}>Tendenza</div>
            <div style={{ fontSize:20, color:trendColor }}>{trendIcon}</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em" }}>Previsione {nextMeseLabel}</div>
            <div style={{ fontSize:18, fontWeight:900, color:C.text }}>{prev} <span style={{ fontSize:11, fontWeight:500, color:C.textSoft }}>stampi</span></div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:8, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em" }}>Ricavo prev.</div>
            <div style={{ fontSize:14, fontWeight:900, color:C.green, fontFamily:"Georgia,serif" }}>€{(prev * ricavoPerStampo).toFixed(0)}</div>
          </div>
          <div style={{ padding:"4px 10px", borderRadius:20, background:confidence>=0.7?C.greenLight:confidence>=0.4?C.amberLight:C.redLight, fontSize:9, fontWeight:700, color:confidence>=0.7?C.green:confidence>=0.4?C.amber:C.red }}>
            {Math.round(confidence*100)}% conf.
          </div>
        </div>
      </div>
      <div style={{ height:100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top:4, right:8, left:-20, bottom:4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8"/>
            <XAxis dataKey="mese" tick={{ fontSize:8, fill:C.textSoft }}/>
            <YAxis tick={{ fontSize:8, fill:C.textSoft }}/>
            <Tooltip contentStyle={{ fontSize:10, borderRadius:6 }} formatter={(v,_,p)=>[`${v} stampi`, p.payload.tipo==="previsione"?"Previsione":"Storico"]}/>
            <Line type="monotone" dataKey="stampi" stroke={C.red} strokeWidth={2} dot={(p)=>{
              if (p.payload.tipo==="previsione") return <circle key={p.key} cx={p.cx} cy={p.cy} r={5} fill={C.amber} stroke={C.white} strokeWidth={2}/>
              return <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill={C.red}/>
            }}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop:6, fontSize:9, color:C.textSoft }}>
        🟡 Punto arancione = previsione prossimo mese basata su {serie.length} mesi di storico (smoothing esponenziale doppio)
      </div>
    </div>
  )
}

export default function PrevisioneDomanda({ ricettario, giornaliero, ingCosti, calcolaFC, getR }) {
  const [filtroRic, setFiltroRic] = useState("")
  const [modeView, setModeView] = useState("ricette") // "ricette" | "stagionale"

  const ricette = useMemo(() => {
    return Object.values(ricettario?.ricette || {}).filter(r => {
      const reg = getR(r.nome, r)
      return reg.tipo !== "interno" && reg.tipo !== "semilavorato"
    }).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [ricettario])

  const filtrate = useMemo(() => ricette.filter(r =>
    !filtroRic || r.nome.toLowerCase().includes(filtroRic.toLowerCase())
  ), [ricette, filtroRic])

  // Stagionalità globale
  const stagionale = useMemo(() => calcolaPoiStagionale(giornaliero), [giornaliero])
  const maxStag = Math.max(...stagionale, 1)

  // Totale stampi mensile per forecasting globale
  const serieTotale = useMemo(() => {
    const byMese = {}
    for (const sess of giornaliero || []) {
      if (!sess.data) continue
      const m = sess.data.slice(0, 7)
      const tot = (sess.prodotti || []).reduce((s, p) => s + p.stampi, 0)
      byMese[m] = (byMese[m] || 0) + tot
    }
    return Object.entries(byMese).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ mese: m, label: `${MONTHS_IT[parseInt(m.split("-")[1])-1]} '${m.slice(2,4)}`, stampi: v }))
  }, [giornaliero])

  const { prev: totPrev, trend: totTrend } = serieTotale.length >= 2 ? previsione(serieTotale.map(s => s.stampi)) : { prev: 0, trend: "flat" }

  if (!ricettario || !Object.keys(ricettario.ricette || {}).length) {
    return (
      <div style={{ maxWidth:900, textAlign:"center", padding:"60px 0" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.red, marginBottom:12 }}>Previsione Domanda</div>
        <div style={{ color:C.textSoft, fontSize:13 }}>Carica il ricettario e registra almeno 2 mesi di produzione per ottenere previsioni.</div>
      </div>
    )
  }

  if ((giornaliero || []).length === 0) {
    return (
      <div style={{ maxWidth:900, textAlign:"center", padding:"60px 0" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.red, marginBottom:12 }}>Previsione Domanda</div>
        <div style={{ color:C.textSoft, fontSize:13 }}>Registra almeno 2 mesi di produzione nella sezione "Produzione" per attivare le previsioni.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:1040, margin:"0 auto" }}>
      <div style={{ marginBottom:24, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:48, height:48, borderRadius:R.lg, background:T.brandLight, display:"flex", alignItems:"center", justifyContent:"center", color:T.brand, flexShrink:0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{ margin:"0 0 4px", fontSize:26, fontWeight:700, color:T.text, letterSpacing:"-0.025em", lineHeight:1.15 }}>Previsione domanda</h1>
          <p style={{ margin:0, fontSize:13, color:T.textSoft, letterSpacing:"-0.005em", lineHeight:1.45 }}>Smoothing esponenziale doppio sulla serie storica di produzione per stimare la domanda futura.</p>
        </div>
      </div>

      {/* KPI riepilogo */}
      {serieTotale.length >= 2 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginBottom:24 }}>
          {[
            { lbl:"Produzione totale prev.", val:`${totPrev} stampi`, sub: totTrend==="up"?"tendenza crescente":totTrend==="down"?"tendenza calante":"stabile", c:C.text },
            { lbl:"Mesi di storico", val:serieTotale.length, sub:"per il calcolo previsionale", c:C.text },
            { lbl:"Ricette con storico", val:ricette.filter(r => (giornaliero||[]).some(s=>(s.prodotti||[]).find(p=>p.nome===r.nome))).length, sub:"almeno 1 sessione", c:C.text },
          ].map(({ lbl, val, sub, c }) => (
            <div key={lbl} style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, padding:"18px 22px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:9, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>{lbl}</div>
              <div style={{ fontSize:22, fontWeight:900, color:c }}>{val}</div>
              <div style={{ fontSize:10, color:C.textSoft, marginTop:3 }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trend totale */}
      {serieTotale.length >= 2 && (
        <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:"20px 24px", marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:12 }}>Trend produzione totale mensile</div>
          <div style={{ height:180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieTotale} margin={{ top:4, right:8, left:-20, bottom:4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8"/>
                <XAxis dataKey="label" tick={{ fontSize:9, fill:C.textSoft }}/>
                <YAxis tick={{ fontSize:9, fill:C.textSoft }}/>
                <Tooltip contentStyle={{ fontSize:10, borderRadius:6 }} formatter={(v)=>[`${v} stampi`,"Produzione"]}/>
                <Line type="monotone" dataKey="stampi" stroke={C.red} strokeWidth={2.5} dot={{ fill:C.red, r:4 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Stagionalità giornaliera */}
      <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:"20px 24px", marginBottom:24, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:4 }}>Stagionalità per giorno della settimana</div>
        <div style={{ fontSize:10, color:C.textSoft, marginBottom:16 }}>Media stampi prodotti per giorno — utile per pianificare la produzione</div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end", height:100 }}>
          {DAYS_IT.map((d, i) => {
            const v = stagionale[i]
            const h = maxStag > 0 ? (v / maxStag * 100) : 0
            return (
              <div key={d} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ fontSize:10, color:C.red, fontWeight:700 }}>{v.toFixed(1)}</div>
                <div style={{ width:"100%", background:C.red, borderRadius:"4px 4px 0 0", height:`${h}%`, minHeight:4, transition:"height 0.3s" }}/>
                <div style={{ fontSize:9, fontWeight:700, color:C.textMid }}>{d}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tab view */}
      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:`2px solid rgba(0,0,0,0.07)` }}>
        {[["ricette","Per ricetta"],["stagionale","Stagionalità"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setModeView(id)}
            style={{ padding:"7px 16px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:11, fontWeight:700, color:modeView===id?C.red:C.textSoft,
              borderBottom:modeView===id?`2px solid ${C.red}`:"2px solid transparent",
              marginBottom:-2, transition:"all 0.12s" }}>
            {lbl}
          </button>
        ))}
      </div>

      {modeView === "ricette" && (
        <div>
          <input value={filtroRic} onChange={e=>setFiltroRic(e.target.value)} placeholder="Filtra ricetta…"
            style={{ width:"100%", padding:"9px 14px", borderRadius:9, border:`1px solid ${C.borderStr}`, fontSize:12, marginBottom:16, color:C.text }}/>
          {filtrate.map(ric => (
            <RicettaForecast key={ric.nome} ric={ric} giornaliero={giornaliero}
              calcolaFC={calcolaFC} ingCosti={ingCosti} ricettario={ricettario} getR={getR}/>
          ))}
          {filtrate.every(r => !(giornaliero||[]).some(s=>(s.prodotti||[]).find(p=>p.nome===r.nome))) && (
            <div style={{ color:C.textSoft, fontSize:13, textAlign:"center", padding:"20px 0" }}>
              Nessuna ricetta con dati di produzione sufficienti.
            </div>
          )}
        </div>
      )}

      {modeView === "stagionale" && (
        <div style={{ background:C.bgCard, borderRadius:12, border:`1px solid ${C.border}`, padding:"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize:12, fontWeight:800, color:C.text, marginBottom:8 }}>Analisi stagionale dettagliata</div>
          <div style={{ fontSize:10, color:C.textSoft, marginBottom:14 }}>Media stampi per giorno della settimana su tutto lo storico disponibile</div>
          {DAYS_IT.map((d, i) => {
            const v = stagionale[i]
            const pct = maxStag > 0 ? v / maxStag * 100 : 0
            return (
              <div key={d} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                <div style={{ width:36, fontSize:12, fontWeight:700, color:C.text }}>{d}</div>
                <div style={{ flex:1, height:18, background:"#F0EDE8", borderRadius:9, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:C.red, borderRadius:9, transition:"width 0.4s" }}/>
                </div>
                <div style={{ width:60, fontSize:11, fontWeight:700, color:C.text, textAlign:"right" }}>{v.toFixed(1)} stampi</div>
              </div>
            )
          })}
          <div style={{ marginTop:16, fontSize:10, color:C.textSoft, lineHeight:1.7 }}>
            💡 Usa questi dati per pianificare le quantità giornaliere di produzione. I giorni con indice alto richiedono più preparazione.
          </div>
        </div>
      )}

      <div style={{ marginTop:24, padding:"12px 16px", background:C.amberLight, borderRadius:10, fontSize:10, color:C.amber, lineHeight:1.7 }}>
        ⚠️ Le previsioni si basano sullo storico di produzione inserito in FoodOS. Maggiore è lo storico, più accurate sono le previsioni. Fattori esterni (meteo, festività, eventi locali) non vengono considerati dall'algoritmo.
      </div>
    </div>
  )
}
