// DashboardHomeView + StockPFWidget — estratti da Dashboard.jsx.
// Redesign 2026-06: hero brand, KPI con icone/accenti, stock con barre, hover-lift.
// StockPFWidget riceve orgId/sedeId come props.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sloadAllSedi } from '../lib/storage'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR } from '../lib/foodcost'
import { loadStockPF, loadStockPFAllSedi } from '../lib/stockPF'
import { lessico } from '../lib/lessico'
import SedeSelector from '../components/SedeSelector'
import DailyBriefCard from '../components/DailyBriefCard'
import { C, TNUM } from './_shared'
import Icon from '../components/Icon'

const fmt = v => `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt0 = v => `€ ${Math.round(Number(v) || 0).toLocaleString('it-IT')}`
const n0 = v => Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })

// Stile hover-lift condiviso (iniettato una volta).
const HOVER_CSS = `
.fos-tile{transition:transform .18s cubic-bezier(.32,.72,0,1), box-shadow .18s ease, border-color .18s ease}
.fos-tile:hover{transform:translateY(-3px)}
.fos-row{transition:background .14s ease}
.fos-row:hover{background:#F7F3F0}
@keyframes fos_riseIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fos-rise{animation:fos_riseIn .4s cubic-bezier(.32,.72,0,1) both}
`

// Mini icone (stroke currentColor).
const Ico = ({ d, size = 18, fill = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const ICO = {
  euro: <><path d="M14.5 6.5A5 5 0 0 0 7 11h6"/><path d="M13 13H7a5 5 0 0 0 7.5 4.5"/></>,
  pie: <><path d="M21 15.5A9 9 0 1 1 8.5 3"/><path d="M21 12A9 9 0 0 0 12 3v9z"/></>,
  box: <><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  store: <><path d="M3 9 4 4h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></>,
  chevron: <polyline points="9 18 15 12 9 6"/>,
}

// ─── StockPFWidget ───────────────────────────────────────────────────────────
function StockPFWidget({ isMobile, setView, viewAggregato, orgId, sedeId, LEX }) {
  const [stock, setStock] = useState([])
  const [inArrivo, setInArrivo] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!orgId) { setLoading(false); return }
      try {
        let s
        if (viewAggregato) {
          const allSedi = await loadStockPFAllSedi(orgId)
          const map = {}
          for (const sedeStock of Object.values(allSedi)) {
            for (const r of sedeStock) {
              if (!map[r.prodotto_nome]) map[r.prodotto_nome] = { prodotto_nome: r.prodotto_nome, quantita: 0, unita: r.unita }
              map[r.prodotto_nome].quantita += Number(r.quantita || 0)
            }
          }
          s = Object.values(map)
        } else {
          if (!sedeId) { setLoading(false); return }
          s = await loadStockPF(orgId, sedeId)
        }
        if (cancelled) return
        setStock(s)
        if (!viewAggregato && sedeId) {
          const { count } = await supabase
            .from('trasferimenti')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('sede_a', sedeId).eq('stato', 'inviato')
          if (!cancelled) setInArrivo(count || 0)
        }
      } catch (e) {
        console.error('StockPFWidget:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orgId, sedeId, viewAggregato])

  if (loading) return null

  const inStock = stock.filter(r => Number(r.quantita || 0) > 0)
  const totPezzi = inStock.reduce((s, r) => s + Number(r.quantita || 0), 0)
  const top = [...inStock].sort((a, b) => Number(b.quantita) - Number(a.quantita)).slice(0, 5)
  const maxQ = Math.max(1, ...top.map(r => Number(r.quantita || 0)))
  const hasStock = inStock.length > 0
  const BAR = ['#6E0E1A', '#C2410C', '#2563EB', '#16A34A', '#7C3AED']

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (inArrivo > 0 ? '1.7fr 1fr' : '1fr'), gap: isMobile ? 12 : 16, marginBottom: isMobile ? 18 : 24 }}>
      <div className="fos-tile" onClick={() => setView('magazzino')}
        style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: isMobile ? '18px 18px' : '22px 26px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 30px rgba(15,23,42,0.05)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasStock ? 16 : 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(110,14,26,0.10)', color: T.brand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico d={ICO.store} size={17} /></span>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSoft }}>
              Stock vetrina<span style={{ color: T.textFaint }}> · {viewAggregato ? 'tutte le sedi' : 'sede attiva'}</span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 600 }}>{inStock.length} prodotti</span>
        </div>
        {hasStock ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '170px 1fr', gap: isMobile ? 14 : 28, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: isMobile ? 38 : 48, fontWeight: 800, color: T.text, letterSpacing: '-0.04em', lineHeight: 1, ...TNUM }}>{n0(totPezzi)}</div>
              <div style={{ fontSize: 13, color: T.textSoft, fontWeight: 500, marginTop: 4 }}>pezzi al banco</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {top.map((r, i) => (
                <div key={r.prodotto_nome} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: T.textMid, width: isMobile ? 96 : 128, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{r.prodotto_nome}</span>
                  <div style={{ flex: 1, height: 9, background: '#F0EAE6', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(5, Number(r.quantita) / maxQ * 100)}%`, height: '100%', background: BAR[i % BAR.length], borderRadius: 6 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: T.text, width: 44, textAlign: 'right', ...TNUM }}>{n0(r.quantita)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5, paddingTop: 6 }}>
            Nessun prodotto al banco. Si popola quando confermi una sessione di produzione.
          </div>
        )}
      </div>

      {inArrivo > 0 && !viewAggregato && (
        <div className="fos-tile" onClick={() => setView('trasferimenti')}
          style={{ background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', border: '1px solid #FCD34D', borderRadius: 18, padding: isMobile ? '18px 18px' : '22px 24px', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400E', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="truck" size={13} />In arrivo da altre sedi</div>
          <div style={{ fontSize: isMobile ? 38 : 48, fontWeight: 800, color: '#92400E', letterSpacing: '-0.04em', lineHeight: 1, ...TNUM }}>{inArrivo}</div>
          <div style={{ fontSize: 13, color: '#92400E', marginTop: 6, fontWeight: 600 }}>{inArrivo === 1 ? 'trasferimento da confermare' : 'trasferimenti da confermare'}</div>
        </div>
      )}
    </div>
  )
}

// ─── DashboardHomeView ───────────────────────────────────────────────────────
export default function DashboardHomeView({ ricettario, magazzino, giornaliero, chiusure, actions, setView, orgId, sedeId, nomeAttivita, isTrialAttivo, auth, sedi = [], sedeAttiva = null, LEX = lessico() }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const ora = now.getHours()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  const sediAttiveAll = (sedi || []).filter(s => s.attiva !== false)
  // Coerenza con il resto dell'app: la vista aggregata segue il selettore sede
  // GLOBALE (sedeAttiva._all), non un toggle locale separato.
  const viewAggregato = !!sedeAttiva?._all
  const [aggrData, setAggrData] = useState(null)

  useEffect(() => {
    if (!viewAggregato || !orgId || sediAttiveAll.length < 2) { setAggrData(null); return }
    let cancelled = false
    ;(async () => {
      const [gior, chius] = await Promise.all([
        sloadAllSedi('pasticceria-giornaliero-v1', orgId),
        sloadAllSedi('pasticceria-chiusure-v1', orgId),
      ])
      if (cancelled) return
      const giornAll = Object.values(gior || {}).flatMap(v => Array.isArray(v) ? v : [])
      const chiusAll = Object.values(chius || {}).flatMap(v => Array.isArray(v) ? v : [])
      setAggrData({ giornaliero: giornAll, chiusure: chiusAll })
    })()
    return () => { cancelled = true }
  }, [viewAggregato, orgId, sediAttiveAll.length])

  const giornEff = (viewAggregato && aggrData) ? aggrData.giornaliero : giornaliero
  const chiusEff = (viewAggregato && aggrData) ? aggrData.chiusure : chiusure

  const sessioniOggi = (giornEff || []).filter(s => s.data === today)
  const hasProdOggi = sessioniOggi.some(s => (s.prodotti || []).length > 0)
  const prodCount = sessioniOggi.reduce((acc, s) => acc + (s.prodotti || []).reduce((a, p) => {
    // Fallback uppercase per nomi legacy: senza, getR cade su default
    // {unita:8, prezzo:4} e prodCount mostra valori falsati nei record vecchi.
    const ric = ricettario?.ricette?.[p.nome]
      || ricettario?.ricette?.[(p.nome || '').toUpperCase().trim()]
    const reg = getR(p.nome, ric)
    const u = Number(reg?.unita)
    return a + (p.stampi || 0) * (Number.isFinite(u) && u > 0 ? u : 1)
  }, 0), 0)

  // Carico vendite B2B (oggi + mese corrente) per il KPI affiancato a "Ricavi"
  // retail. Le B2B non finiscono nella cassa retail e quindi non sono
  // visibili dal solo `chiusure`.
  const [b2bOggi, setB2bOggi] = useState(0)
  const [b2bMese, setB2bMese] = useState(0)
  useEffect(() => {
    if (!orgId) return
    const oggi = new Date()
    const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString().slice(0, 10)
    const fineMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1).toISOString().slice(0, 10)
    let q = supabase.from('vendite_b2b').select('data, totale, sede_id')
      .eq('organization_id', orgId).gte('data', inizioMese).lt('data', fineMese)
    if (!viewAggregato && sedeId) q = q.eq('sede_id', sedeId)
    q.then(({ data }) => {
      const arr = data || []
      const todayIso = today
      setB2bOggi(arr.filter(v => v.data === todayIso).reduce((s, v) => s + (Number(v.totale) || 0), 0))
      setB2bMese(arr.reduce((s, v) => s + (Number(v.totale) || 0), 0))
    })
  }, [orgId, sedeId, viewAggregato, today])

  const cassaOggiList = (chiusEff || []).filter(c => c.data === today)
  // Le chiusure ChiusuraView salvano i ricavi su c.kpi.totV (cfr. ChiusuraView
  // rec building). c.totale e' un campo legacy/non garantito. Senza il
  // fallback su kpi.totV il KPI hero "Ricavi oggi" risultava sempre 0.
  const totaleChiusura = (c) => Number(c?.kpi?.totV || c?.totale || 0)
  const cassaOggi = viewAggregato
    ? (cassaOggiList.length > 0
        ? { totale: cassaOggiList.reduce((s, c) => s + totaleChiusura(c), 0) }
        : null)
    : cassaOggiList[0] || null
  const ricaviOggi = viewAggregato
    ? (cassaOggi?.totale || 0)
    : totaleChiusura(cassaOggi)

  const ricette = Object.values(ricettario?.ricette || {})
    .filter(r => getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')
  const fcMedio = ricette.length === 0 ? 0 : (() => {
    let tot = 0, cnt = 0
    for (const ric of ricette) {
      const reg = getR(ric.nome, ric)
      if (!reg.unita || !reg.prezzo) continue
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      const ricavo = reg.unita * reg.prezzo
      if (ricavo > 0) { tot += fc / ricavo; cnt++ }
    }
    return cnt > 0 ? tot / cnt : 0
  })()
  const fcColor = fcMedio < 0.30 ? T.green : fcMedio < 0.35 ? T.amber : T.red

  const critici = Object.values(magazzino || {}).filter(m => m.giacenza_g === 0 || (m.soglia_g > 0 && m.giacenza_g <= m.soglia_g))
  const ultimeRicette = Object.values(ricettario?.ricette || {}).slice(-5).reverse()

  const todos = []
  if (!hasProdOggi && ora >= 6) todos.push({ id: 'prod', label: 'Registra la produzione di oggi', view: 'giornaliero' })
  if (!cassaOggi && ora >= 14) todos.push({ id: 'cassa', label: 'Chiudi la cassa', view: 'chiusura' })
  if (critici.length > 0) todos.push({ id: 'mag', label: `${critici.length} ingredienti sotto soglia in magazzino`, view: 'magazzino' })

  const giornoLabel = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'

  // ── KPI card premium: icona, accento, hover-lift ──
  const KpiCard = ({ label, value, sub, valueColor, icon, tint, onClick, empty, alert }) => (
    <div className="fos-tile" onClick={onClick}
      style={{ background: T.bgCard, border: `1px solid ${alert ? 'rgba(110,14,26,0.25)' : T.border}`,
        borderRadius: 18, padding: isMobile ? '16px 16px' : '20px 22px',
        boxShadow: alert ? '0 1px 2px rgba(110,14,26,0.06), 0 10px 28px rgba(110,14,26,0.10)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
        cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -28, right: -28, width: 96, height: 96, borderRadius: '50%', background: tint.soft, opacity: 0.5 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 14, position: 'relative' }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: tint.soft, color: tint.solid, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico d={icon} size={18} /></span>
        <span style={{ color: T.textFaint }}><Ico d={ICO.chevron} size={15} /></span>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.textSoft, marginBottom: 6, position: 'relative' }}>{label}</div>
      <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: empty ? T.textFaint : (valueColor || T.text), lineHeight: 1.0, letterSpacing: '-0.035em', position: 'relative', ...TNUM }}>
        {empty ? '—' : value}
      </div>
      <div style={{ fontSize: 12.5, color: T.textSoft, marginTop: 7, fontWeight: 500, position: 'relative' }}>{sub}</div>
    </div>
  )
  const TINT = {
    green: { soft: 'rgba(16,163,74,0.12)', solid: T.green },
    blue: { soft: 'rgba(37,99,235,0.12)', solid: '#2563EB' },
    red: { soft: 'rgba(110,14,26,0.12)', solid: T.brand },
    fc: { soft: fcMedio < 0.30 ? 'rgba(16,163,74,0.12)' : fcMedio < 0.35 ? 'rgba(217,119,6,0.14)' : 'rgba(110,14,26,0.12)', solid: fcColor },
  }

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto' }}>
      <style>{HOVER_CSS}</style>

      {/* Daily Brief AI (se generato dal cron mattutino) */}
      <DailyBriefCard orgId={orgId} />

      {/* HERO brand */}
      <div className="fos-rise" style={{ position: 'relative', zIndex: 30, borderRadius: 22, padding: isMobile ? '22px 22px' : '30px 34px', marginBottom: isMobile ? 18 : 24,
        background: 'linear-gradient(135deg, #1C0A0A 0%, #4A0612 52%, #6E0E1A 100%)',
        boxShadow: '0 14px 40px rgba(110,14,26,0.32)' }}>
        {/* Layer decorativo ritagliato a parte: NON clippa il dropdown del selettore
            (che vive nel contenuto, fuori da questo overflow:hidden). */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 22, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,75,58,0.35) 0%, transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -90, left: '30%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', textTransform: 'capitalize', fontWeight: 600, letterSpacing: '0.02em', marginBottom: 8 }}>{giornoLabel}</div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 28 : 42, fontWeight: 800, color: '#FFF', letterSpacing: '-0.04em', lineHeight: 1.04 }}>
              {saluto}{nomeAttivita ? <>,<br style={{ display: isMobile ? 'block' : 'none' }} /> <span style={{ color: '#FBD7C9' }}>{nomeAttivita}</span></> : ''}
            </h1>
          </div>
          {sediAttiveAll.length > 1 && (
            // Stesso selettore sede usato in tutta l'app (variante scura per l'hero).
            <SedeSelector sedi={sedi} sedeAttiva={sedeAttiva} onSelect={auth?.setSedeAttiva} variant="topbarDark" />
          )}
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 18 : 24 }}>
        <KpiCard
          label="Ricavi"
          icon={ICO.euro}
          tint={TINT.green}
          value={fmt0(ricaviOggi + b2bOggi)}
          valueColor={T.green}
          empty={!cassaOggi && b2bOggi === 0}
          sub={b2bMese > 0
            ? `oggi · B2B mese ${fmt0(b2bMese)}`
            : (cassaOggi ? 'incassati oggi' : 'non ancora registrati')}
          onClick={() => setView('chiusura')} />
        <KpiCard label="Food Cost" icon={ICO.pie} tint={TINT.fc} value={`${(fcMedio * 100).toFixed(1)}%`} valueColor={fcColor} empty={ricette.length === 0} sub={ricette.length > 0 ? 'medio ricettario' : 'non disponibile'} onClick={() => setView('simulatore')} />
        <KpiCard label="Produzione" icon={ICO.box} tint={TINT.blue} value={<>{n0(prodCount)}<span style={{ fontSize: isMobile ? 12 : 15, fontWeight: 600, color: T.textSoft, marginLeft: 6 }}>pz</span></>} valueColor="#2563EB" empty={!hasProdOggi} sub={hasProdOggi ? 'prodotti oggi' : 'non registrata'} onClick={() => setView('giornaliero')} />
        <KpiCard label="Magazzino" icon={ICO.alert} tint={critici.length > 0 ? TINT.red : TINT.green} value={critici.length > 0 ? <>{critici.length}<span style={{ fontSize: isMobile ? 12 : 15, fontWeight: 600, color: T.textSoft, marginLeft: 6 }}>critici</span></> : 'OK'} valueColor={critici.length > 0 ? T.brand : T.green} alert={critici.length > 0} sub={critici.length > 0 ? 'sotto soglia' : 'livelli in ordine'} onClick={() => setView('magazzino')} />
      </div>

      <StockPFWidget isMobile={isMobile} setView={setView} viewAggregato={viewAggregato} orgId={orgId} sedeId={sedeId} LEX={LEX} />

      {/* Liste */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 18 }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: isMobile ? '16px 16px 12px' : '20px 22px 14px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 10 : 14 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Ultime {LEX.ricette}</h2>
            {ultimeRicette.length > 0 && <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 600 }}>{Object.keys(ricettario?.ricette || {}).length} totali</span>}
          </div>
          {ultimeRicette.length === 0
            ? <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.textMid, fontWeight: 500 }}>{LEX.nessunaRicetta}</div>
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 6 }}>Importa il tuo file Excel.</div>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column' }}>
                {ultimeRicette.map((r, i) => {
                  const reg = getR(r.nome, r)
                  const { tot: fc } = calcolaFC(r, ingCosti, ricettario)
                  const ricavo = (reg.prezzo || 0) * (reg.unita || 0)
                  const fcPct = ricavo > 0 ? fc / ricavo * 100 : 0
                  const marg = ricavo > 0 ? ((ricavo - fc) / ricavo * 100) : 0
                  const mC = marg >= 60 ? T.green : marg >= 40 ? T.amber : T.brand
                  return (
                    <div key={r.nome} className="fos-row" onClick={() => setView('ricettario')}
                      style={{ padding: '11px 8px', margin: '0 -8px', borderRadius: 10,
                        borderTop: i === 0 ? 'none' : `1px solid ${T.borderSoft}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 4, height: 30, borderRadius: 3, background: ricavo > 0 ? mC : T.borderStr, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nome}</div>
                        <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, ...TNUM }}>
                          <span>FC {fcPct.toFixed(0)}%</span>
                          <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.textFaint }} />
                          <span style={{ color: ricavo > 0 ? mC : T.textSoft, fontWeight: 700 }}>Margine {marg.toFixed(0)}%</span>
                        </div>
                      </div>
                      <span style={{ color: T.textFaint }}><Ico d={ICO.chevron} size={14} /></span>
                    </div>
                  )
                })}
              </div>
          }
          <button onClick={() => setView('ricettario')}
            style={{ marginTop: isMobile ? 12 : 16, padding: '11px 12px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 13, fontWeight: 600, color: T.textMid, cursor: 'pointer', width: '100%' }}>
            Apri il {LEX.Ricettario} →
          </button>
        </div>

        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: isMobile ? '16px 16px' : '20px 22px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 10 : 14 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Da fare oggi</h2>
            {todos.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.brand, background: T.brandLight, borderRadius: 999, padding: '2px 9px' }}>{todos.length}</span>}
          </div>
          {todos.length === 0
            ? <div style={{ padding: '28px 12px', textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: '50%', background: 'rgba(16,163,74,0.12)', color: T.green, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Ico d={ICO.check} size={22} /></span>
                <div style={{ fontSize: 13.5, color: T.text, fontWeight: 600 }}>Tutto fatto per oggi</div>
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>Goditi la giornata.</div>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column' }}>
                {todos.map((t, i) => (
                  <div key={t.id} className="fos-row" onClick={() => setView(t.view)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', margin: '0 -8px', borderRadius: 10,
                      borderTop: i === 0 ? 'none' : `1px solid ${T.borderSoft}`, cursor: 'pointer' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 7, background: T.brandLight, color: T.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ico d={ICO.alert} size={13} /></span>
                    <span style={{ fontSize: 13, color: T.text, flex: 1, fontWeight: 500 }}>{t.label}</span>
                    <span style={{ color: T.textFaint }}><Ico d={ICO.chevron} size={14} /></span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  )
}
