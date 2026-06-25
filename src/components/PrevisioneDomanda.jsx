import React, { useState, useMemo } from 'react'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { color as T, tnum } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { KPI, SH, PageHeader, Tip, C } from '../views/_shared'
import Icon from './Icon'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// ── Algoritmo previsione (Holt, smoothing esponenziale doppio) ───────────────
// NON MODIFICARE la firma: riusata da RicettaProduzione e dai calcoli globali.
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

// Stagionalità: media per giorno settimana (0=dom). NON MODIFICARE la firma.
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
const DAYS_FULL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"]
const MONTHS_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"]

const nf = n => Math.round(n).toLocaleString('it-IT')
const nf1 = n => (Math.round(n * 10) / 10).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

// Etichetta mese: da "YYYY-MM" a "Giu '26"
const meseLabel = m => {
  const [y, mm] = m.split("-")
  return `${MONTHS_IT[parseInt(mm) - 1]} '${y.slice(2)}`
}
const meseSucc = m => {
  const [y, mm] = m.split("-").map(Number)
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`
}

// ── Card "Cosa produrre" per singola ricetta ────────────────────────────────
function RicettaProduzione({ ric, serieMese, sellThrough, stagionale, totStag, getR, prossimiGiorni, isMobile }) {
  const values = serieMese.map(s => s.stampi)
  const { prev, confidence, trend } = previsione(values)
  const media = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

  // Stima n° giorni di produzione tipici al mese: giorni-settimana con stagionalità > 0 × ~4.3 settimane.
  const giorniAttivi = stagionale.filter(v => v > 0).length || 7
  const giorniMeseTipici = Math.max(1, Math.round(giorniAttivi * 4.3))
  const prevGiornaliera = prev / giorniMeseTipici

  // Previsione per ciascuno dei prossimi giorni, pesata per indice stagionale del DOW.
  const giorniPrev = prossimiGiorni.map(g => {
    const peso = totStag > 0 ? (stagionale[g.dow] * 7) / totStag : 1
    const stima = prevGiornaliera * peso
    const banda = stima * (1 - confidence) * 0.6
    return { ...g, stima, lo: Math.max(0, stima - banda), hi: stima + banda }
  })

  const st = sellThrough // { pct, venduto, prodotto } | null
  const stColor = st == null ? C.textSoft : st.pct >= 85 ? C.green : st.pct < 60 ? C.red : C.amber
  const stBg = st == null ? C.bgSubtle : st.pct >= 85 ? C.greenLight : st.pct < 60 ? C.redLight : C.amberLight
  const stIcon = st == null ? 'clock' : st.pct >= 85 ? 'trendUp' : st.pct < 60 ? 'trendDown' : 'checkCircle'
  const stMsg = st == null ? 'Nessun venduto' : st.pct >= 85 ? 'Produci di più' : st.pct < 60 ? 'Sovrapproduzione' : 'In equilibrio'

  const trendColor = trend === 'up' ? C.green : trend === 'down' ? C.red : C.amber
  const trendIcon = trend === 'up' ? 'trendUp' : trend === 'down' ? 'trendDown' : 'barChart'
  const trendTxt = trend === 'up' ? 'in crescita' : trend === 'down' ? 'in calo' : 'stabile'

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '16px' : '18px 22px', marginBottom: 14, boxShadow: SHADOW_PREMIUM }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.text, letterSpacing: '-0.01em', marginBottom: 3 }}>{ric.nome}</div>
          <div style={{ fontSize: 11, color: C.textSoft, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Icon name={trendIcon} size={12} color={trendColor} />
            <span style={{ color: trendColor, fontWeight: 700 }}>{trendTxt}</span>
            <span>· media {nf1(media)} · previsione {nf1(prev)} stampi/mese</span>
          </div>
        </div>
        <Tip text={st == null ? 'Nessuna vendita registrata nelle chiusure per questo prodotto.' : `Venduto ${nf(st.venduto)} su ${nf(st.prodotto)} pezzi prodotti nel periodo.`} width={240}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: stBg, cursor: 'help' }}>
            <Icon name={stIcon} size={14} color={stColor} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: stColor, ...tnum, lineHeight: 1 }}>{st == null ? '—' : `${nf(st.pct)}%`}</div>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: stColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{stMsg}</div>
            </div>
          </div>
        </Tip>
      </div>

      {/* Prossimi giorni: quanti stampi produrre */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : `repeat(${giorniPrev.length},1fr)`, gap: 8 }}>
        {giorniPrev.map((g, i) => (
          <div key={i} style={{ background: C.bgSubtle, border: `1px solid ${C.borderSoft}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.label}</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.text, ...tnum, marginTop: 4, lineHeight: 1 }}>
              ≈ {nf(g.stima)}
            </div>
            <div style={{ fontSize: 9, color: C.textSoft, marginTop: 2 }}>stampi</div>
            <div style={{ fontSize: 9, color: C.textSoft, ...tnum, marginTop: 3 }}>
              {nf(g.lo)}–{nf(g.hi)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PrevisioneDomanda({ ricettario, giornaliero, chiusure, ingCosti, calcolaFC, getR }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [filtroRic, setFiltroRic] = useState("")
  const [modeView, setModeView] = useState("produrre") // "produrre" | "trend"

  // Ricette vendibili (no semilavorati / interni)
  const ricette = useMemo(() => {
    return Object.values(ricettario?.ricette || {}).filter(r => {
      const reg = getR(r.nome, r)
      return reg.tipo !== "interno" && reg.tipo !== "semilavorato"
    }).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [ricettario, getR])

  // Serie mensile (stampi) per nome ricetta
  const serieMeseByNome = useMemo(() => {
    const map = {}
    for (const sess of giornaliero || []) {
      if (!sess.data) continue
      const m = sess.data.slice(0, 7)
      for (const p of sess.prodotti || []) {
        if (!map[p.nome]) map[p.nome] = {}
        map[p.nome][m] = (map[p.nome][m] || 0) + (p.stampi || 0)
      }
    }
    const out = {}
    for (const nome in map) {
      out[nome] = Object.entries(map[nome]).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ mese: m, stampi: v }))
    }
    return out
  }, [giornaliero])

  // Sell-through REALE per nome ricetta: venduto (Σ unitaV chiusure) / prodotto (Σ stampi*vendibile)
  const sellThroughByNome = useMemo(() => {
    const venduto = {}, prodotto = {}
    for (const ch of chiusure || []) {
      for (const r of ch.confronto || []) {
        venduto[r.nome] = (venduto[r.nome] || 0) + (Number(r.unitaV) || 0)
      }
    }
    for (const sess of giornaliero || []) {
      for (const p of sess.prodotti || []) {
        const perStampo = Number(p.vendibile) || getR(p.nome, ricettario?.ricette?.[p.nome])?.unita || 0
        prodotto[p.nome] = (prodotto[p.nome] || 0) + (Number(p.stampi) || 0) * perStampo
      }
    }
    const out = {}
    for (const nome in prodotto) {
      const prod = prodotto[nome]
      const vend = venduto[nome] || 0
      out[nome] = prod > 0 ? { pct: vend / prod * 100, venduto: vend, prodotto: prod } : null
    }
    return out
  }, [chiusure, giornaliero, ricettario, getR])

  // Stagionalità globale (media stampi per DOW)
  const stagionale = useMemo(() => calcolaPoiStagionale(giornaliero), [giornaliero])
  const totStag = useMemo(() => stagionale.reduce((a, b) => a + b, 0), [stagionale])
  const maxStag = Math.max(...stagionale, 1)

  // Serie totale mensile per il trend globale
  const serieTotale = useMemo(() => {
    const byMese = {}
    for (const sess of giornaliero || []) {
      if (!sess.data) continue
      const m = sess.data.slice(0, 7)
      const tot = (sess.prodotti || []).reduce((s, p) => s + p.stampi, 0)
      byMese[m] = (byMese[m] || 0) + tot
    }
    return Object.entries(byMese).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ mese: m, label: meseLabel(m), stampi: v }))
  }, [giornaliero])

  const totForecast = serieTotale.length >= 2 ? previsione(serieTotale.map(s => s.stampi)) : { prev: 0, trend: "flat", confidence: 0 }

  // Prossimi 5 giorni (da oggi) con DOW + label
  const prossimiGiorni = useMemo(() => {
    const out = []
    const oggi = new Date()
    for (let i = 0; i < 5; i++) {
      const d = new Date(oggi); d.setDate(oggi.getDate() + i)
      out.push({ dow: d.getDay(), label: i === 0 ? 'Oggi' : i === 1 ? 'Domani' : DAYS_IT[d.getDay()] })
    }
    return out
  }, [])

  // Previsione produzione totale prossima settimana (stampi) = prevGiornaliera totale su 7 giorni pesati
  const prodNextWeek = useMemo(() => {
    if (serieTotale.length < 2) return 0
    const giorniAttivi = stagionale.filter(v => v > 0).length || 7
    const giorniMeseTipici = Math.max(1, Math.round(giorniAttivi * 4.3))
    const prevGiornaliera = totForecast.prev / giorniMeseTipici
    let tot = 0
    for (let dow = 0; dow < 7; dow++) {
      const peso = totStag > 0 ? (stagionale[dow] * 7) / totStag : 1
      tot += prevGiornaliera * peso
    }
    return tot
  }, [serieTotale, stagionale, totStag, totForecast.prev])

  // Conteggio prodotti da aumentare (>85%) / ridurre (<60%)
  const { nAumentare, nRidurre } = useMemo(() => {
    let a = 0, r = 0
    for (const nome in sellThroughByNome) {
      const st = sellThroughByNome[nome]
      if (!st) continue
      if (st.pct > 85) a++
      else if (st.pct < 60) r++
    }
    return { nAumentare: a, nRidurre: r }
  }, [sellThroughByNome])

  // Accuratezza media previsione: per ogni ricetta con ≥3 mesi, backtest 1-step (1 - MAPE)
  const accuratezza = useMemo(() => {
    const errs = []
    for (const nome in serieMeseByNome) {
      const vals = serieMeseByNome[nome].map(s => s.stampi)
      if (vals.length < 3) continue
      const train = vals.slice(0, -1)
      const real = vals.at(-1)
      if (real <= 0) continue
      const { prev } = previsione(train, 1)
      errs.push(Math.min(1, Math.abs(prev - real) / real))
    }
    if (!errs.length) return null
    const mape = errs.reduce((a, b) => a + b, 0) / errs.length
    return Math.round((1 - mape) * 100)
  }, [serieMeseByNome])

  // Ricette con almeno 2 mesi di storico (forecast affidabile)
  const ricetteConStorico = useMemo(() =>
    ricette.filter(r => (serieMeseByNome[r.nome]?.length || 0) >= 2),
  [ricette, serieMeseByNome])

  const filtrate = useMemo(() => ricetteConStorico.filter(r =>
    !filtroRic || r.nome.toLowerCase().includes(filtroRic.toLowerCase())
  ), [ricetteConStorico, filtroRic])

  // ── Empty states ───────────────────────────────────────────────────────────
  if (!ricettario || !Object.keys(ricettario.ricette || {}).length) {
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <PageHeader subtitle="Previsione della domanda e quantità da produrre, basate sullo storico di produzione e vendita." />
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW_PREMIUM }}>
          <Icon name="bulb" size={28} color={C.textSoft} />
          <div style={{ color: C.textMid, fontSize: 14, fontWeight: 700, marginTop: 12 }}>Carica il ricettario per iniziare</div>
          <div style={{ color: C.textSoft, fontSize: 12, marginTop: 6 }}>Servono almeno 2 mesi di produzione registrata per ottenere previsioni.</div>
        </div>
      </div>
    )
  }

  if ((giornaliero || []).length === 0 || serieTotale.length < 2) {
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <PageHeader subtitle="Previsione della domanda e quantità da produrre, basate sullo storico di produzione e vendita." />
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW_PREMIUM }}>
          <Icon name="calendar" size={28} color={C.textSoft} />
          <div style={{ color: C.textMid, fontSize: 14, fontWeight: 700, marginTop: 12 }}>Storico insufficiente</div>
          <div style={{ color: C.textSoft, fontSize: 12, marginTop: 6 }}>
            Registra almeno 2 mesi di produzione nella sezione "Produzione" per attivare le previsioni.
            {serieTotale.length === 1 && ' Al momento hai 1 mese di dati.'}
          </div>
        </div>
      </div>
    )
  }

  const nextMeseLabel = serieTotale.length ? meseLabel(meseSucc(serieTotale.at(-1).mese)) : '—'

  // Picco/minimo settimanale per descrizione
  const dowPicco = stagionale.indexOf(Math.max(...stagionale))
  const dowMin = (() => {
    let idx = -1, min = Infinity
    stagionale.forEach((v, i) => { if (v > 0 && v < min) { min = v; idx = i } })
    return idx
  })()

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader subtitle="Quanto produrre, prodotto per prodotto. Previsione Holt sullo storico, pesata per stagionalità settimanale e confrontata con il venduto reale." />

      {/* ── BANDA DIAGNOSI ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 14, marginBottom: 28 }}>
        <KPI
          label="Produz. prossima sett."
          value={nf(prodNextWeek)}
          sub="stampi previsti (7 giorni)"
          icon={<Icon name="package" size={18} />}
        />
        <KPI
          label="Da aumentare"
          value={nf(nAumentare)}
          sub="sell-through > 85%"
          color={nAumentare > 0 ? C.green : C.text}
          icon={<Icon name="trendUp" size={18} />}
        />
        <KPI
          label="Da ridurre"
          value={nf(nRidurre)}
          sub="sell-through < 60% (spreco)"
          color={nRidurre > 0 ? C.red : C.text}
          icon={<Icon name="trendDown" size={18} />}
        />
        <KPI
          label="Accuratezza media"
          value={accuratezza == null ? '—' : `${nf(accuratezza)}%`}
          sub={accuratezza == null ? 'servono ≥ 3 mesi' : 'backtest 1 mese'}
          color={accuratezza == null ? C.text : accuratezza >= 75 ? C.green : accuratezza >= 50 ? C.amber : C.red}
          icon={<Icon name="target" size={18} />}
        />
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid rgba(0,0,0,0.07)' }}>
        {[["produrre", "Cosa produrre"], ["trend", "Trend e stagionalità"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setModeView(id)}
            style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: modeView === id ? C.red : C.textSoft,
              borderBottom: modeView === id ? `2px solid ${C.red}` : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.12s' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── COSA PRODURRE ───────────────────────────────────────────────────── */}
      {modeView === "produrre" && (
        <div>
          <SH sub="Previsione giornaliera = (previsione mensile ÷ giorni di produzione tipici) pesata per l'indice stagionale del giorno. L'intervallo riflette la confidenza del modello.">
            Quanti stampi produrre
          </SH>

          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <Icon name="search" size={15} color={C.textSoft} />
            </span>
            <input value={filtroRic} onChange={e => setFiltroRic(e.target.value)} placeholder="Filtra prodotto…"
              style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box', background: C.bgCard }} />
          </div>

          {filtrate.length === 0 ? (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW_PREMIUM }}>
              <Icon name="clock" size={24} color={C.textSoft} />
              <div style={{ color: C.textSoft, fontSize: 13, marginTop: 10 }}>
                {filtroRic ? 'Nessun prodotto corrisponde al filtro.' : 'Nessun prodotto con almeno 2 mesi di storico di produzione.'}
              </div>
            </div>
          ) : (
            filtrate.map(ric => (
              <RicettaProduzione key={ric.nome} ric={ric}
                serieMese={serieMeseByNome[ric.nome] || []}
                sellThrough={sellThroughByNome[ric.nome] ?? null}
                stagionale={stagionale} totStag={totStag}
                getR={getR} prossimiGiorni={prossimiGiorni} isMobile={isMobile} />
            ))
          )}
        </div>
      )}

      {/* ── TREND E STAGIONALITÀ ────────────────────────────────────────────── */}
      {modeView === "trend" && (
        <div>
          <SH sub={`Smoothing esponenziale doppio (Holt) sulla serie storica. Previsione ${nextMeseLabel}: ≈ ${nf(totForecast.prev)} stampi (${Math.round(totForecast.confidence * 100)}% confidenza).`}>
            Trend produzione totale mensile
          </SH>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '16px 8px 16px 0' : '22px 24px', marginBottom: 28, boxShadow: SHADOW_PREMIUM }}>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...serieTotale, { mese: 'prev', label: nextMeseLabel, stampi: Math.round(totForecast.prev), prev: true }]} margin={{ top: 8, right: 12, left: isMobile ? -12 : 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.brand} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={T.brand} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textSoft }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.textSoft }} axisLine={false} tickLine={false} width={42} tickFormatter={v => v.toLocaleString('it-IT')} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${C.border}` }}
                    formatter={(v, _n, p) => [`${Number(v).toLocaleString('it-IT')} stampi`, p.payload.prev ? 'Previsione' : 'Produzione']} />
                  <Area type="monotone" dataKey="stampi" stroke={T.brand} strokeWidth={2.5} fill="url(#prevGrad)"
                    dot={(p) => p.payload.prev
                      ? <circle key={p.key} cx={p.cx} cy={p.cy} r={5} fill={C.amber} stroke={C.white} strokeWidth={2} />
                      : <circle key={p.key} cx={p.cx} cy={p.cy} r={3.5} fill={T.brand} />} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: C.textSoft, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="dot" size={9} color={C.amber} />
              Punto arancione = previsione {nextMeseLabel} su {serieTotale.length} mesi di storico.
            </div>
          </div>

          <SH sub="Media stampi prodotti per giorno della settimana, su tutto lo storico. Pianifica le quantità giornaliere di conseguenza.">
            Stagionalità per giorno della settimana
          </SH>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '18px 16px' : '24px', boxShadow: SHADOW_PREMIUM }}>
            {DAYS_FULL.map((d, i) => {
              const v = stagionale[i]
              const pct = maxStag > 0 ? v / maxStag * 100 : 0
              const isPeak = i === dowPicco && v > 0
              return (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i === 6 ? 0 : 12 }}>
                  <div style={{ width: isMobile ? 38 : 90, fontSize: 12, fontWeight: 700, color: isPeak ? C.red : C.textMid }}>{isMobile ? DAYS_IT[i] : d}</div>
                  <div style={{ flex: 1, height: 20, background: C.bgSubtle, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: isPeak ? C.red : `${T.brand}99`, borderRadius: 8, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ width: 80, fontSize: 12, fontWeight: 700, color: C.text, textAlign: 'right', ...tnum }}>{nf1(v)} <span style={{ fontWeight: 500, color: C.textSoft, fontSize: 10 }}>stampi</span></div>
                </div>
              )
            })}
            {totStag > 0 && dowPicco >= 0 && (
              <div style={{ marginTop: 18, padding: '12px 14px', background: C.bgSubtle, borderRadius: 10, fontSize: 12, color: C.textMid, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Icon name="bulb" size={14} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>Picco di produzione il <b>{DAYS_FULL[dowPicco]}</b>{dowMin >= 0 && dowMin !== dowPicco ? <>, giorno più scarico il <b>{DAYS_FULL[dowMin]}</b></> : null}. Concentra preparazione e personale sui giorni a indice più alto.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop: 28, padding: '12px 16px', background: C.amberLight, borderRadius: 12, fontSize: 11, color: C.amber, lineHeight: 1.7, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Icon name="warning" size={13} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>Le previsioni si basano sullo storico di produzione e vendita inserito in FoodOS: più dati = più accuratezza. Fattori esterni (meteo, festività, eventi locali) non sono considerati dall'algoritmo. Sono una guida, non una regola.</span>
      </div>
    </div>
  )
}
