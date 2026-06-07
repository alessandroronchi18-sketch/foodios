// SimulatorePrezziView — estratta da Dashboard.jsx (refactor/views-split).
// Simulatore "what-if": cambia i prezzi delle ricette e vedi impatto su margine
// con proiezione a N giorni basata sullo storico stampi prodotti.

import React, { useMemo, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../lib/foodcost'
import { BenchmarkBadge } from '../components/BenchmarkOptin'
import { exportSimulatorePrezzi } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import { lessico } from '../lib/lessico'

// Palette locale compatibile con il vecchio C.* del monolite
const C = {
  white: T.bgCard, text: T.text, textMid: T.textMid, textSoft: T.textSoft,
  border: T.border, green: T.green, greenLight: T.greenLight,
  amber: T.amber, red: T.brand, redLight: T.brandLight,
}

const margColor = pct => pct >= 60 ? C.green : pct >= 40 ? C.amber : C.red

function PageHeader({ subtitle, action }) {
  if (!subtitle && !action) return null
  return (
    <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      {subtitle && <div style={{ fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{subtitle}</div>}
      {action}
    </div>
  )
}

export default function SimulatorePrezziView({ ricettario, giornaliero, tipoAttivita, sedi }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato')

  const euro = v => `€ ${Number(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  // Box riassuntivi (comparazione + proiezione): arrotonda all'unità con
  // separatore migliaia IT (es. € 1.000) e gestisce il segno.
  const euro0 = v => { const n = Math.round(Number(v) || 0); return `${n < 0 ? '−' : ''}€ ${Math.abs(n).toLocaleString('it-IT')}` }
  const pct  = v => `${Number(v).toFixed(1)}%`

  const baseRows = ricette.map(ric => {
    const reg = getR(ric.nome, ric)
    const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
    const ricavo  = parseFloat((reg.unita * reg.prezzo).toFixed(2))
    const margine = parseFloat((ricavo - fc).toFixed(2))
    const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0
    return {
      nome: ric.nome, reg, fc, ricavo, margine, margPct,
      fcUnita:  reg.unita > 0 ? fc / reg.unita : 0,
      mrgUnita: reg.prezzo - (reg.unita > 0 ? fc / reg.unita : 0),
    }
  }).sort((a, b) => b.margPct - a.margPct)

  // Medie stampi da storico giornaliero
  const medieStampi = useMemo(() => {
    const counts = {}, totals = {}
    for (const sess of (giornaliero || [])) {
      for (const p of (sess.prodotti || [])) {
        if (!counts[p.nome]) { counts[p.nome] = 0; totals[p.nome] = 0 }
        counts[p.nome]++
        totals[p.nome] += (p.stampi || 0)
      }
    }
    const out = {}
    for (const n of Object.keys(counts)) out[n] = counts[n] > 0 ? totals[n] / counts[n] : 0
    return out
  }, [giornaliero])

  const hasStorico = (giornaliero || []).length > 0
  const [orizzonteGiorni, setOrizzonteGiorni] = useState(30)
  const [prezzi, setPrezzi] = useState(() =>
    Object.fromEntries(baseRows.map(r => [r.nome, r.reg.prezzo.toFixed(2)]))
  )
  const setP = (nome, v) => setPrezzi(p => ({ ...p, [nome]: v }))
  const reset = () => setPrezzi(Object.fromEntries(baseRows.map(r => [r.nome, r.reg.prezzo.toFixed(2)])))

  const scenRows = baseRows.map(r => {
    // fallback al prezzo base: se il ricettario si carica async dopo il mount,
    // prezzi[r.nome] è undefined e senza fallback il prezzo base proietterebbe a 0.
    const newPrezzo = Math.max(0, parseFloat(prezzi[r.nome] ?? r.reg.prezzo) || 0)
    const delta     = r.reg.prezzo > 0 ? ((newPrezzo - r.reg.prezzo) / r.reg.prezzo * 100) : 0
    const newRicavo = parseFloat((r.reg.unita * newPrezzo).toFixed(2))
    const newMarg   = parseFloat((newRicavo - r.fc).toFixed(2))
    const newMargPct= newRicavo > 0 ? (newMarg / newRicavo * 100) : 0
    const mediaStampi = medieStampi[r.nome] || 0
    const giorniAttivi = hasStorico
      ? ((giornaliero || []).filter(s => (s.prodotti || []).some(p => p.nome === r.nome)).length)
      : 0
    const totalSess = (giornaliero || []).length || 1
    const freqGiorni = hasStorico ? (giorniAttivi / totalSess) : 1
    const stampiPeriodo = mediaStampi * freqGiorni * orizzonteGiorni
    const proiBase  = parseFloat((stampiPeriodo * r.margine).toFixed(2))
    const proiScen  = parseFloat((stampiPeriodo * newMarg).toFixed(2))
    const proiDiff  = parseFloat((proiScen - proiBase).toFixed(2))
    return {
      ...r, newPrezzo, delta, newRicavo, newMarg, newMargPct,
      diffMarg: parseFloat((newMarg - r.margine).toFixed(2)),
      diffMargPct: parseFloat((newMargPct - r.margPct).toFixed(1)),
      mediaStampi, stampiPeriodo, proiBase, proiScen, proiDiff,
      changed: Math.abs(delta) > 0.01,
    }
  })

  const totBaseRicavo  = baseRows.reduce((s, r) => s + r.ricavo, 0)
  const totScenRicavo  = scenRows.reduce((s, r) => s + r.newRicavo, 0)
  const totBaseMarg    = baseRows.reduce((s, r) => s + r.margine, 0)
  const totScenMarg    = scenRows.reduce((s, r) => s + r.newMarg, 0)
  const totProiBase    = scenRows.reduce((s, r) => s + r.proiBase, 0)
  const totProiScen    = scenRows.reduce((s, r) => s + r.proiScen, 0)
  const totProiDiff    = scenRows.reduce((s, r) => s + r.proiDiff, 0)
  const hasChanges     = scenRows.some(r => r.changed)

  // Food cost medio per benchmark settoriale (% ricavi)
  const fcAvgPct = (() => {
    const totFc  = baseRows.reduce((s, r) => s + r.fc, 0)
    const totRic = baseRows.reduce((s, r) => s + r.ricavo, 0)
    return totRic > 0 ? (totFc / totRic * 100) : null
  })()
  const cittaDefault = (sedi || []).find(s => s.is_default)?.citta || (sedi || [])[0]?.citta || null

  // Raccomandazioni automatiche (computed dal listino base, indipendenti dalle modifiche)
  const raccomandazioni = useMemo(() => {
    const out = []
    const critici = baseRows.filter(r => r.margPct < 40)
    const altoFC  = baseRows.filter(r => {
      const fcPct = r.ricavo > 0 ? (r.fc / r.ricavo * 100) : 0
      return fcPct > 40
    })
    const vulnerabili = baseRows.filter(r => r.fc > 0 && ((r.ricavo / r.fc - 1) * 100) < 25)

    if (critici.length) {
      const top = critici.sort((a, b) => a.margPct - b.margPct).slice(0, 3).map(r => r.nome).join(', ')
      out.push(`Margine sotto 40% su ${critici.length} ${critici.length === 1 ? LEX.prodotto : LEX.prodotti} (${top}): valuta aumento prezzo del 8–15%.`)
    }
    if (altoFC.length) {
      const top = altoFC.sort((a, b) => b.fc/b.ricavo - a.fc/a.ricavo).slice(0, 3).map(r => r.nome).join(', ')
      out.push(`Food cost sopra il 40% su ${altoFC.length} ${altoFC.length === 1 ? LEX.prodotto : LEX.prodotti} (${top}): rivedi ingredienti o porzioni.`)
    }
    if (vulnerabili.length) {
      out.push(`${vulnerabili.length} ${vulnerabili.length === 1 ? `${LEX.prodotto} va` : `${LEX.prodotti} vanno`} in perdita con +20% materie prime — alza prezzo o blocca contratto fornitore.`)
    }
    if (baseRows.length && !critici.length && !altoFC.length && !vulnerabili.length) {
      out.push(`Listino in salute: nessun ${LEX.prodotto} sotto la soglia critica. Mantieni e monitora trimestralmente.`)
    }
    if (hasStorico && totProiDiff > 0) {
      out.push(`Con le modifiche attuali guadagneresti ${euro(totProiDiff)} in più nei prossimi ${orizzonteGiorni} giorni — applicale se il mercato lo regge.`)
    } else if (hasStorico && totProiDiff < 0) {
      out.push(`Le modifiche attuali ti costano ${euro(Math.abs(totProiDiff))} nei prossimi ${orizzonteGiorni} giorni — rivedi prima di applicare.`)
    }
    return out
  }, [baseRows, hasStorico, totProiDiff, orizzonteGiorni, LEX])

  const handleExportPdf = async () => {
    if (!(await gateExport('simulatore_prezzi', { n_items: baseRows.length }, window.__foodos_notify))) return
    const c = getExportCtx()
    exportSimulatorePrezzi({
      orizzonteGiorni,
      scenRows,
      totBaseRicavo, totScenRicavo,
      totBaseMarg, totScenMarg,
      totProiBase, totProiScen, totProiDiff,
      fcAvgPct,
      raccomandazioni,
    }, c.nomeAttivita, c.email)
  }

  const exportBtn = (
    <button onClick={handleExportPdf}
      style={{ padding: '10px 16px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
        fontSize: 13, fontWeight: 500, color: T.textMid, cursor: 'pointer', letterSpacing: '-0.005em',
        display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.sm }}>
      📄 Esporta PDF
    </button>
  )

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader
        subtitle={`Simulatore prezzi e proiezioni${hasStorico ? ' · ' + String((giornaliero || []).length) + ' sessioni' : ''}`}
        action={exportBtn}
      />

      {tipoAttivita && (
        <div style={{ marginBottom: 18 }}>
          <BenchmarkBadge tipoAttivita={tipoAttivita} miaFcPct={fcAvgPct} citta={cittaDefault}/>
        </div>
      )}

      {/* RACCOMANDAZIONI AUTOMATICHE */}
      {raccomandazioni.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 3, height: 18, background: C.red, borderRadius: 2, flexShrink: 0, alignSelf: 'center' }}/>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: C.text }}>Raccomandazioni</h2>
              <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>Suggerimenti generati dall'analisi del listino e dello storico</div>
            </div>
          </div>
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {raccomandazioni.map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: i < raccomandazioni.length - 1 ? `1px dashed ${T.borderSoft}` : 'none' }}>
                  <span style={{ color: C.red, fontWeight: 900, flexShrink: 0, fontSize: 13, lineHeight: 1.5 }}>›</span>
                  <span style={{ fontSize: 12, color: T.text, lineHeight: 1.55 }}>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Controlli orizzonte + reset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, padding: '8px 14px', boxShadow: S.sm }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.textMid, letterSpacing: '-0.005em' }}>Orizzonte</span>
          <div style={{ display: 'flex', gap: 2, padding: 3, background: T.bgSubtle, borderRadius: R.md }}>
            {[7, 14, 30, 60, 90].map(g => (
              <button key={g} onClick={() => setOrizzonteGiorni(g)}
                style={{ padding: '5px 10px', borderRadius: R.sm, border: 'none',
                  background: orizzonteGiorni === g ? T.bgCard : 'transparent',
                  color: orizzonteGiorni === g ? T.text : T.textSoft,
                  fontSize: 12, fontWeight: orizzonteGiorni === g ? 600 : 500, cursor: 'pointer',
                  boxShadow: orizzonteGiorni === g ? S.sm : 'none',
                  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
                  transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}` }}>
                {g}g
              </button>
            ))}
          </div>
        </div>
        {hasChanges && (
          <button onClick={reset}
            style={{ padding: '9px 14px', borderRadius: R.md, border: `1px solid ${T.border}`,
              background: T.bgCard, fontSize: 13, fontWeight: 500, color: T.textMid, cursor: 'pointer',
              letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.xs,
              transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}` }}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgSubtle; e.currentTarget.style.color = T.text }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMid }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
            Reset prezzi
          </button>
        )}
      </div>

      {/* KPI comparazione — appare solo con modifiche */}
      {hasChanges && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { lbl: 'Ricavo/stampo base',    val: euro0(totBaseRicavo), sub: 'prezzi attuali', c: T.textMid },
            { lbl: 'Ricavo/stampo scenario', val: euro0(totScenRicavo), sub: `${totScenRicavo > totBaseRicavo ? '+' : ''}${euro0(totScenRicavo - totBaseRicavo)} vs base`, c: totScenRicavo >= totBaseRicavo ? T.green : T.brand },
            { lbl: 'Margine/stampo scenario', val: euro0(totScenMarg), sub: `${totScenMarg > totBaseMarg ? '+' : ''}${euro0(totScenMarg - totBaseMarg)} vs base`, c: totScenMarg >= totBaseMarg ? T.green : T.brand, hi: true },
          ].map(({ lbl, val, sub, c, hi }) => (
            <div key={lbl} style={{ background: hi ? T.brand : T.bgCard, border: `1px solid ${hi ? T.brandDark : T.border}`,
              borderRadius: 16, padding: '18px 20px',
              boxShadow: hi ? '0 4px 14px rgba(110,14,26,0.22)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
              backgroundImage: hi ? 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)' : undefined }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: hi ? 'rgba(255,255,255,0.7)' : T.textSoft, marginBottom: 6,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lbl}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: hi ? T.textOnDark : c, letterSpacing: '-0.02em', lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }}>{val}</div>
              <div style={{ fontSize: 11, color: hi ? 'rgba(255,255,255,0.62)' : c, marginTop: 5, fontWeight: 500, letterSpacing: '-0.005em' }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Proiezione futura — solo se storico disponibile e modifiche attive */}
      {hasChanges && hasStorico && (
        <div style={{ background: T.bgSide, backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 50%)',
          border: `1px solid ${T.borderOnDark}`, borderRadius: 16,
          padding: isMobile ? '20px 22px' : '24px 28px', marginBottom: 28, boxShadow: S.lg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E84B3A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E84B3A' }}>
              Proiezione a {orizzonteGiorni} giorni
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.textOnDarkSoft, marginBottom: 22, letterSpacing: '-0.005em' }}>
            Basata sulla media stampi prodotti per sessione dallo storico
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 20 }}>
            {[
              { lbl: 'Margine atteso (prezzi base)',  val: euro0(totProiBase), c: 'rgba(255,255,255,0.62)' },
              { lbl: 'Margine atteso (scenario)',      val: euro0(totProiScen), c: totProiScen >= totProiBase ? '#34D399' : '#FB7185' },
              { lbl: 'Differenza margine nel periodo', val: (totProiDiff > 0 ? '+' : '') + euro0(totProiDiff),
                c: totProiDiff > 0 ? '#34D399' : '#FB7185' },
            ].map(({ lbl, val, c }) => (
              <div key={lbl}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'rgba(255,255,255,0.42)', marginBottom: 8, minHeight: 26, lineHeight: 1.3 }}>{lbl}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1.1, letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Righe prodotto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {scenRows.map(r => {
          const mc = margColor(r.newMargPct)
          const dSign = r.delta > 0 ? '+' : ''
          return (
            <div key={r.nome} style={{ background: r.changed ? (r.delta > 0 ? '#F6FBF7' : '#FEF6F5') : C.white,
              border: `2px solid ${r.changed ? (r.delta > 0 ? '#C6EDD3' : '#FAD5D0') : C.border}`,
              borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
              transition: 'border-color 0.2s' }}>

              <div style={{ display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '190px 184px minmax(0,1fr) 128px',
                alignItems: 'center', gap: isMobile ? 14 : 20 }}>
                {/* Nome + badge variazione */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={r.nome}>{r.nome}</span>
                    {r.changed && (
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800,
                        background: r.delta > 0 ? C.greenLight : C.redLight,
                        color: r.delta > 0 ? C.green : C.red }}>
                        {dSign}{r.delta.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: C.textSoft }}>
                    {r.reg.unita} {r.reg.tipo === 'fetta' ? 'fette' : 'pz'}/stampo
                    {r.mediaStampi > 0 && <span style={{ marginLeft: 8, color: C.amber }}>· media {r.mediaStampi.toFixed(1)} stampi/sessione</span>}
                  </div>
                </div>

                {/* Input prezzo con stepper −/+ : più intuitivo che digitare */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.textSoft, marginBottom: 6 }}>
                    Prezzo / {r.reg.tipo === 'fetta' ? 'fetta' : 'pezzo'} <span style={{ color: C.textSoft, fontWeight: 600 }}>· base {euro(r.reg.prezzo)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(() => { const cur = parseFloat(prezzi[r.nome] ?? r.reg.prezzo) || 0; const step = (d) => setP(r.nome, Math.max(0, +(cur + d).toFixed(2)).toFixed(2)); return (<>
                      <button onClick={() => step(-0.10)} aria-label="Diminuisci prezzo" style={{ width: 32, height: 38, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: C.white, fontSize: 18, fontWeight: 800, color: C.textMid, cursor: 'pointer', lineHeight: 1 }}>−</button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.textMid }}>€</span>
                        <input type="number" min="0" step="0.10"
                          value={prezzi[r.nome] ?? r.reg.prezzo.toFixed(2)}
                          onChange={e => setP(r.nome, e.target.value)}
                          onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setP(r.nome, v.toFixed(2)) }}
                          style={{ width: '100%', minWidth: 56, padding: '8px 6px', borderRadius: 8, textAlign: 'center',
                            border: `2px solid ${r.changed ? (r.delta > 0 ? C.green : C.red) : C.border}`,
                            fontSize: 16, fontWeight: 900, color: r.changed ? (r.delta > 0 ? C.green : C.red) : C.text,
                            fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'", outline: 'none', transition: 'border-color 0.2s' }}/>
                      </div>
                      <button onClick={() => step(0.10)} aria-label="Aumenta prezzo" style={{ width: 32, height: 38, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: C.white, fontSize: 17, fontWeight: 800, color: C.textMid, cursor: 'pointer', lineHeight: 1 }}>+</button>
                    </>) })()}
                  </div>
                </div>

                {/* Margine: prima → dopo, l'informazione che conta davvero */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 14 : 18, background: '#F8F4F2', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textSoft, marginBottom: 3 }}>Margine ora</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.textMid, fontVariantNumeric: 'tabular-nums' }}>{pct(r.margPct)}</div>
                    <div style={{ fontSize: 9, color: C.textSoft, marginTop: 1 }}>{euro(r.margine)}/st.</div>
                  </div>
                  <div style={{ fontSize: 18, color: r.changed ? mc : C.textSoft, fontWeight: 900 }}>→</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: r.changed ? mc : C.textSoft, marginBottom: 3 }}>Nuovo margine</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: mc, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{pct(r.newMargPct)}</div>
                    <div style={{ fontSize: 9, color: r.changed ? mc : C.textSoft, marginTop: 2, fontWeight: 700 }}>{euro(r.newMarg)}/st.{r.changed ? ` · ${r.diffMargPct > 0 ? '+' : ''}${r.diffMargPct.toFixed(1)} pp` : ''}</div>
                  </div>
                </div>

                {/* Δ margine */}
                {r.changed ? (
                  <div style={{ padding: '10px 16px', borderRadius: 10, textAlign: 'center',
                    background: r.diffMarg > 0 ? C.greenLight : C.redLight,
                    border: `1px solid ${r.diffMarg > 0 ? C.green : C.red}30` }}>
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                      color: r.diffMarg > 0 ? C.green : C.red, marginBottom: 3 }}>Δ stampo</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: r.diffMarg > 0 ? C.green : C.red, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }}>
                      {r.diffMarg > 0 ? '+' : ''}{euro(r.diffMarg)}
                    </div>
                    {r.proiDiff !== 0 && hasStorico && (
                      <>
                        <div style={{ fontSize: 8, fontWeight: 700, color: r.proiDiff > 0 ? C.green : C.red,
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8, marginBottom: 2 }}>
                          Δ {orizzonteGiorni}g
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: r.proiDiff > 0 ? C.green : C.red, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }}>
                          {r.proiDiff > 0 ? '+' : ''}{euro(r.proiDiff)}
                        </div>
                      </>
                    )}
                  </div>
                ) : <div aria-hidden="true" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
