// DashboardHomeView + StockPFWidget — estratti da Dashboard.jsx.
// StockPFWidget non legge più i moduli globali _ctx_* ma riceve orgId/sedeId come props
// (chiamato da DashboardHomeView che già li ha disponibili).

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sloadAllSedi } from '../lib/storage'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR } from '../lib/foodcost'
import { C, TNUM } from './_shared'

const fmt = v => `€ ${Number(v).toFixed(2)}`

// ─── StockPFWidget ───────────────────────────────────────────────────────────
function StockPFWidget({ isMobile, setView, viewAggregato, orgId, sedeId }) {
  const [stock, setStock] = useState([])
  const [inArrivo, setInArrivo] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!orgId) { setLoading(false); return }
      try {
        const { loadStockPF, loadStockPFAllSedi } = await import('../lib/stockPF')
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

  const totPezzi = stock.reduce((s, r) => s + Number(r.quantita || 0), 0)
  const top3 = [...stock].sort((a, b) => Number(b.quantita) - Number(a.quantita)).slice(0, 3)
  const hasStock = stock.length > 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (inArrivo > 0 ? '1.6fr 1fr' : '1fr'), gap: isMobile ? 12 : 14, marginBottom: isMobile ? 20 : 28 }}>
      <div onClick={() => setView('magazzino')}
        style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
          padding: isMobile ? '16px 18px' : '18px 22px', boxShadow: S.sm, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSoft }}>
            {viewAggregato ? 'Stock vetrina · tutte le sedi' : 'Stock vetrina · sede attiva'}
          </div>
          <span style={{ fontSize: 11, color: T.textSoft }}>{stock.length} prodotti</span>
        </div>
        {hasStock ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: isMobile ? 28 : 34, fontWeight: 700, color: T.text, letterSpacing: '-0.035em', ...TNUM }}>
                {totPezzi.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
              </span>
              <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 500 }}>pezzi disponibili</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {top3.map(r => (
                <span key={r.prodotto_nome} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: T.bgSubtle, color: T.textMid, fontWeight: 500 }}>
                  {r.prodotto_nome} · <strong style={{ color: T.text, ...TNUM }}>{Number(r.quantita).toLocaleString('it-IT', { maximumFractionDigits: 0 })}</strong>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5 }}>
            Nessun prodotto in stock. Si popola quando confermi una sessione di produzione.
          </div>
        )}
      </div>

      {inArrivo > 0 && !viewAggregato && (
        <div onClick={() => setView('trasferimenti')}
          style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: R.xl,
            padding: isMobile ? '16px 18px' : '18px 22px', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400E', marginBottom: 12 }}>
            🚚 In arrivo da altre sedi
          </div>
          <div style={{ fontSize: isMobile ? 28 : 34, fontWeight: 700, color: '#92400E', letterSpacing: '-0.035em', ...TNUM }}>
            {inArrivo}
          </div>
          <div style={{ fontSize: 13, color: '#92400E', marginTop: 6, fontWeight: 500 }}>
            {inArrivo === 1 ? 'trasferimento da confermare' : 'trasferimenti da confermare'}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DashboardHomeView ───────────────────────────────────────────────────────
export default function DashboardHomeView({ ricettario, magazzino, giornaliero, chiusure, actions, setView, orgId, sedeId, nomeAttivita, isTrialAttivo, auth, sedi = [], sedeAttiva = null }) {
  const isMobile = useIsMobile()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const ora = now.getHours()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  const sediAttiveAll = (sedi || []).filter(s => s.attiva !== false)
  const [viewAggregato, setViewAggregato] = useState(false)
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
  const prodCount = sessioniOggi.reduce((acc, s) => acc + (s.prodotti || []).reduce((a, p) => a + p.stampi, 0), 0)
  const costoStimato = sessioniOggi.reduce((tot, sess) => tot + (sess.prodotti || []).reduce((a, p) => {
    const { tot: fc } = calcolaFC(ricettario?.ricette?.[p.nome] || { name: p.nome, ingredienti: [] }, ingCosti, ricettario)
    return a + fc * p.stampi
  }, 0), 0)

  const cassaOggiList = (chiusEff || []).filter(c => c.data === today)
  const cassaOggi = viewAggregato
    ? (cassaOggiList.length > 0 ? { totale: cassaOggiList.reduce((s, c) => s + (c.totale || 0), 0) } : null)
    : cassaOggiList[0] || null
  const ricaviOggi = cassaOggi?.totale || 0

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
  const fcColor = fcMedio < 0.30 ? C.green : fcMedio < 0.35 ? C.amber : C.red

  const critici = Object.values(magazzino || {}).filter(m => m.giacenza_g === 0 || (m.soglia_g > 0 && m.giacenza_g <= m.soglia_g))
  const ultimeRicette = Object.values(ricettario?.ricette || {}).slice(-5).reverse()

  const todos = []
  if (!hasProdOggi && ora >= 6) todos.push({ id: 'prod', label: 'Registra produzione di oggi', view: 'giornaliero' })
  if (!cassaOggi && ora >= 14) todos.push({ id: 'cassa', label: 'Chiudi la cassa', view: 'chiusura' })
  if (critici.length > 0) todos.push({ id: 'mag', label: `${critici.length} ingredienti sotto soglia in magazzino`, view: 'magazzino' })

  const giornoLabel = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const nomeSaluto = nomeAttivita ? `, ${nomeAttivita}` : ''

  const fcBand = fcMedio < 0.30 ? 'ok' : fcMedio < 0.35 ? 'warn' : 'bad'
  const fcAccent = fcBand === 'ok' ? T.green : fcBand === 'warn' ? T.amber : T.red

  const KpiCard = ({ label, value, sub, valueColor, accent, onClick, empty, mini, alert }) => {
    const isAlert = !!alert
    return (
      <div onClick={onClick}
        style={{ background: T.bgCard, border: `1px solid ${isAlert ? 'rgba(110,14,26,0.28)' : T.border}`,
          borderRadius: 14, padding: isMobile ? '18px 18px 18px 20px' : '22px 24px 22px 26px',
          boxShadow: isAlert ? '0 4px 14px rgba(110,14,26,0.14)' : '0 1px 2px rgba(15,23,42,0.05), 0 4px 14px rgba(15,23,42,0.05)',
          cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
        {accent && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent, borderRadius: '4px 0 0 4px' }}/>}
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSoft, marginBottom: isMobile ? 10 : 12 }}>
          {label}
        </div>
        <div style={{ fontSize: isMobile ? (mini ? 24 : 30) : (mini ? 28 : 38), fontWeight: 700,
          color: empty ? T.textFaint : (valueColor || T.text), lineHeight: 1.0, letterSpacing: '-0.035em', ...TNUM }}>
          {empty ? '—' : value}
        </div>
        <div style={{ fontSize: 13, color: T.textSoft, marginTop: isMobile ? 8 : 10, fontWeight: 500 }}>{sub}</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ marginBottom: isMobile ? 28 : 40 }}>
        <div style={{ fontSize: 13, color: T.textSoft, textTransform: 'capitalize', fontWeight: 500, marginBottom: 8 }}>
          {giornoLabel}
        </div>
        <h1 style={{ margin: 0, fontSize: isMobile ? 30 : 44, fontWeight: 700, color: T.text, letterSpacing: '-0.035em', lineHeight: 1.05 }}>
          {saluto}{nomeSaluto}
        </h1>
        {sediAttiveAll.length > 1 && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Visualizza:</span>
            <div style={{ display: 'inline-flex', gap: 4, background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 999, padding: 3 }}>
              <button onClick={() => setViewAggregato(false)}
                style={{ padding: '4px 12px', border: 'none', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: !viewAggregato ? T.bgCard : 'transparent', color: !viewAggregato ? T.text : T.textSoft }}>
                📍 {sedeAttiva?.nome || 'Sede attiva'}
              </button>
              <button onClick={() => setViewAggregato(true)}
                style={{ padding: '4px 12px', border: 'none', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: viewAggregato ? T.bgCard : 'transparent', color: viewAggregato ? T.text : T.textSoft }}>
                🏢 Tutte le sedi ({sediAttiveAll.length})
              </button>
            </div>
            {viewAggregato && !aggrData && (
              <span style={{ fontSize: 11, color: T.textSoft }}>Caricamento aggregati…</span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 20 : 28 }}>
        <KpiCard label="Ricavi" value={fmt(ricaviOggi)} empty={!cassaOggi} sub={cassaOggi ? 'oggi' : 'non ancora registrati'} onClick={() => setView('chiusura')}/>
        <KpiCard label="Food Cost" value={`${(fcMedio * 100).toFixed(1)}%`} valueColor={fcColor} accent={ricette.length > 0 ? fcAccent : null} empty={ricette.length === 0} sub={ricette.length > 0 ? 'medio ricettario' : 'non disponibile'} onClick={() => setView('simulatore')}/>
        <KpiCard label="Produzione" value={<>{prodCount}<span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 500, color: T.textSoft, marginLeft: 6 }}>pz</span></>} empty={!hasProdOggi} sub={hasProdOggi ? 'registrata oggi' : 'non registrata'} onClick={() => setView('giornaliero')}/>
        <KpiCard label="Magazzino" value={critici.length > 0 ? <>{critici.length}<span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 500, color: T.textSoft, marginLeft: 6 }}>critici</span></> : 'Tutto OK'} valueColor={critici.length > 0 ? T.brand : T.green} accent={critici.length > 0 ? T.brand : null} alert={critici.length > 0} sub={critici.length > 0 ? 'ingredienti sotto soglia' : 'livelli in ordine'} onClick={() => setView('magazzino')}/>
      </div>

      <StockPFWidget isMobile={isMobile} setView={setView} viewAggregato={viewAggregato} orgId={orgId} sedeId={sedeId}/>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 18 }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: isMobile ? '16px 16px 12px' : '20px 22px 14px', boxShadow: S.sm }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 16 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>Ultime ricette</h2>
            {ultimeRicette.length > 0 && <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 500 }}>{Object.keys(ricettario?.ricette || {}).length} totali</span>}
          </div>
          {ultimeRicette.length === 0
            ? <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.textMid, fontWeight: 500 }}>Nessuna ricetta caricata</div>
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
                    <div key={r.nome} onClick={() => setView('ricettario')}
                      style={{ padding: '10px 8px', margin: '0 -8px', borderRadius: R.md,
                        borderTop: i === 0 ? 'none' : `1px solid ${T.borderSoft}`, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nome}</div>
                        <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, ...TNUM }}>
                          <span>FC {fcPct.toFixed(0)}%</span>
                          <span style={{ width: 2, height: 2, borderRadius: '50%', background: T.textFaint }}/>
                          <span style={{ color: ricavo > 0 ? mC : T.textSoft, fontWeight: 500 }}>Marg {marg.toFixed(0)}%</span>
                        </div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  )
                })}
              </div>
          }
          <button onClick={() => setView('ricettario')}
            style={{ marginTop: isMobile ? 12 : 16, padding: '10px 12px', background: 'transparent',
              border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 13, fontWeight: 500, color: T.textMid,
              cursor: 'pointer', width: '100%' }}>
            Apri il Ricettario →
          </button>
        </div>

        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: isMobile ? '16px 16px' : '20px 22px', boxShadow: S.sm }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 16 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>Da fare oggi</h2>
            {todos.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: T.brand, background: T.brandLight, borderRadius: 999, padding: '2px 8px' }}>{todos.length}</span>}
          </div>
          {todos.length === 0
            ? <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.textMid, fontWeight: 500 }}>✓ Tutto fatto per oggi</div>
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 6 }}>Goditi la giornata.</div>
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column' }}>
                {todos.map((t, i) => (
                  <div key={t.id} onClick={() => setView(t.view)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px',
                      margin: '0 -8px', borderRadius: R.md,
                      borderTop: i === 0 ? 'none' : `1px solid ${T.borderSoft}`, cursor: 'pointer' }}>
                    <div style={{ width: 18, height: 18, border: `2px solid ${T.borderStr}`, borderRadius: R.xs, flexShrink: 0 }}/>
                    <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{t.label}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  )
}
