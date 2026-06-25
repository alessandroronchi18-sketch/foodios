// Food Cost — pagina di DIAGNOSI → CAPISCI → AGISCI.
// 1) Hero KPI con target food cost  2) salute del listino  3) tabella prodotti
// con food cost %, prezzo consigliato e breakdown ricetta espandibile
// 4) top ingredienti per incidenza  5) simulatore what-if (prezzi / materie prime).
// Tutti i dati derivano dal motore foodcost (calcolaFC / calcolaFCDettaglio).

import React, { useMemo, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFCDettaglio, getR, isRicettaValida } from '../lib/foodcost'
import { exportSimulatorePrezzi } from '../lib/exportPDF'
import { gateExport, getExportCtx } from '../lib/exportGuard'
import { lessico } from '../lib/lessico'
import { KPI, SH, PageHeader, Tip, useSortable, SortTH } from './_shared'
import Icon from '../components/Icon'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

export default function SimulatorePrezziView({ ricettario, giornaliero, tipoAttivita }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricette = useMemo(() => Object.values(ricettario?.ricette || {})
    .filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo !== 'interno' && getR(r.nome, r).tipo !== 'semilavorato'),
    [ricettario])

  // ── Stato ───────────────────────────────────────────────────────────────────
  const [targetPct, setTargetPct] = useState(30)       // food cost obiettivo (%)
  const [orizzonteGiorni, setOrizzonteGiorni] = useState(30)
  const [prezzoPct, setPrezzoPct] = useState(0)        // leva globale prezzi (simulatore)
  const [mpPct, setMpPct] = useState(0)                // leva materie prime (stress test)
  const [expanded, setExpanded] = useState(null)       // ricetta col breakdown aperto
  const target = targetPct / 100

  // ── Formatters ────────────────────────────────────────────────────────────────
  const euro  = v => `${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  const euro0 = v => { const n = Math.round(Number(v) || 0); return `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('it-IT')} €` }
  const pct   = v => `${Number(v || 0).toFixed(1)}%`

  // Colore semaforo food cost rispetto al target
  const fcColor = (fcPct) => fcPct <= targetPct ? T.green : fcPct <= targetPct + 10 ? T.amber : T.brand
  const fcLabel = (fcPct) => fcPct <= targetPct ? 'Sano' : fcPct <= targetPct + 10 ? 'Da tenere d’occhio' : 'Critico'

  // ── Storico stampi → media per sessione + frequenza ──────────────────────────
  const hasStorico = (giornaliero || []).length > 0
  const totSess = (giornaliero || []).length || 1
  const medie = useMemo(() => {
    const counts = {}, totals = {}, attivi = {}
    for (const sess of (giornaliero || [])) {
      const visti = new Set()
      for (const p of (sess.prodotti || [])) {
        counts[p.nome] = (counts[p.nome] || 0) + 1
        totals[p.nome] = (totals[p.nome] || 0) + (p.stampi || 0)
        if (!visti.has(p.nome)) { attivi[p.nome] = (attivi[p.nome] || 0) + 1; visti.add(p.nome) }
      }
    }
    const out = {}
    for (const n of Object.keys(counts)) {
      const media = counts[n] > 0 ? totals[n] / counts[n] : 0
      const freq = attivi[n] / totSess
      out[n] = { media, freq, mensili: media * freq * 30 }
    }
    return out
  }, [giornaliero, totSess])

  // ── Righe prodotto con food cost, breakdown, prezzo consigliato ──────────────
  const rows = useMemo(() => ricette.map(ric => {
    const reg = getR(ric.nome, ric)
    const dett = calcolaFCDettaglio(ric, ingCosti, ricettario)
    const fc = dett.tot
    const ricavo = +(reg.unita * reg.prezzo).toFixed(2)
    const margine = +(ricavo - fc).toFixed(2)
    const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0
    const fcPct = ricavo > 0 ? (fc / ricavo * 100) : 0
    const fcUnit = reg.unita > 0 ? fc / reg.unita : 0
    // Prezzo (per pezzo) che porterebbe il food cost ESATTAMENTE al target
    const prezzoConsigliato = target > 0 ? fcUnit / target : 0
    const deltaPrezzo = prezzoConsigliato - reg.prezzo   // >0 = serve aumentare
    const mensili = (medie[ric.nome]?.mensili) || 0
    return {
      nome: ric.nome, reg, prezzo: reg.prezzo, fc, fcUnit, ricavo, margine, margPct, fcPct,
      prezzoConsigliato, deltaPrezzo, righe: dett.righe, mancanti: dett.righe.filter(r => r.mancante),
      mensili,
    }
  }), [ricette, ingCosti, ricettario, target, medie])

  // ── Diagnosi (hero) ──────────────────────────────────────────────────────────
  const diag = useMemo(() => {
    const totFc = rows.reduce((s, r) => s + r.fc, 0)
    const totRic = rows.reduce((s, r) => s + r.ricavo, 0)
    const fcMedio = totRic > 0 ? (totFc / totRic * 100) : 0
    const margMedio = totRic > 0 ? ((totRic - totFc) / totRic * 100) : 0
    const sani = rows.filter(r => r.ricavo > 0 && r.fcPct <= targetPct).length
    const occhio = rows.filter(r => r.ricavo > 0 && r.fcPct > targetPct && r.fcPct <= targetPct + 10).length
    const critici = rows.filter(r => r.ricavo > 0 && r.fcPct > targetPct + 10).length
    // Impatto: portando a target i prodotti sopra soglia, margine extra / mese
    const impattoMese = rows.reduce((s, r) => {
      if (r.deltaPrezzo <= 0.01) return s
      return s + r.deltaPrezzo * r.reg.unita * r.mensili
    }, 0)
    return { fcMedio, margMedio, sani, occhio, critici, totFc, totRic, impattoMese }
  }, [rows, targetPct])

  // ── Top ingredienti per incidenza sul food cost (pesato sulla produzione) ────
  const topIngredienti = useMemo(() => {
    const tot = {}
    for (const r of rows) {
      const w = hasStorico ? r.mensili : 1
      if (hasStorico && w <= 0) continue
      for (const riga of r.righe) {
        if (riga.mancante) continue
        const k = riga.nome
        tot[k] = (tot[k] || 0) + riga.costo * w
      }
    }
    const arr = Object.entries(tot).map(([nome, val]) => ({ nome, val })).sort((a, b) => b.val - a.val)
    const somma = arr.reduce((s, x) => s + x.val, 0) || 1
    return { lista: arr.slice(0, 8).map(x => ({ ...x, pct: x.val / somma * 100 })), somma }
  }, [rows, hasStorico])

  // ── Simulatore what-if (leve globali) ────────────────────────────────────────
  const scenRows = useMemo(() => rows.map(r => {
    const newPrezzo = +(r.reg.prezzo * (1 + prezzoPct / 100)).toFixed(2)
    const fcAdj = +(r.fc * (1 + mpPct / 100)).toFixed(3)
    const newRicavo = +(r.reg.unita * newPrezzo).toFixed(2)
    const newMarg = +(newRicavo - fcAdj).toFixed(2)
    const newMargPct = newRicavo > 0 ? (newMarg / newRicavo * 100) : 0
    const newFcPct = newRicavo > 0 ? (fcAdj / newRicavo * 100) : 0
    const stampiPeriodo = (r.mensili / 30) * orizzonteGiorni
    const proiBase = +(stampiPeriodo * r.margine).toFixed(2)
    const proiScen = +(stampiPeriodo * newMarg).toFixed(2)
    return { ...r, newPrezzo, fcAdj, newRicavo, newMarg, newMargPct, newFcPct,
      delta: r.reg.prezzo > 0 ? (newPrezzo - r.reg.prezzo) / r.reg.prezzo * 100 : 0,
      diffMarg: +(newMarg - r.margine).toFixed(2), proiBase, proiScen,
      proiDiff: +(proiScen - proiBase).toFixed(2),
      sofferente: newMarg < 0 || newFcPct > targetPct + 15 }
  }), [rows, prezzoPct, mpPct, orizzonteGiorni, targetPct])

  const sim = useMemo(() => ({
    totBaseRicavo: rows.reduce((s, r) => s + r.ricavo, 0),
    totScenRicavo: scenRows.reduce((s, r) => s + r.newRicavo, 0),
    totBaseMarg: rows.reduce((s, r) => s + r.margine, 0),
    totScenMarg: scenRows.reduce((s, r) => s + r.newMarg, 0),
    totProiBase: scenRows.reduce((s, r) => s + r.proiBase, 0),
    totProiScen: scenRows.reduce((s, r) => s + r.proiScen, 0),
    totProiDiff: scenRows.reduce((s, r) => s + r.proiDiff, 0),
    sofferenti: scenRows.filter(r => r.sofferente),
  }), [rows, scenRows])
  const hasChanges = prezzoPct !== 0 || mpPct !== 0

  // ── Raccomandazioni ──────────────────────────────────────────────────────────
  const raccomandazioni = useMemo(() => {
    const out = []
    const critici = rows.filter(r => r.ricavo > 0 && r.fcPct > targetPct + 10)
    const occhio = rows.filter(r => r.ricavo > 0 && r.fcPct > targetPct && r.fcPct <= targetPct + 10)
    const vulner = rows.filter(r => r.fc > 0 && ((r.ricavo / r.fc - 1) * 100) < 25)
    if (critici.length) {
      const top = critici.sort((a, b) => b.fcPct - a.fcPct).slice(0, 3).map(r => r.nome).join(', ')
      out.push(`Food cost critico (oltre ${targetPct + 10}%) su ${critici.length} ${critici.length === 1 ? LEX.prodotto : LEX.prodotti} (${top}): alza il prezzo al valore consigliato o rivedi la ricetta.`)
    }
    if (occhio.length) out.push(`${occhio.length} ${occhio.length === 1 ? `${LEX.prodotto} è` : `${LEX.prodotti} sono`} sopra il target del ${targetPct}% ma sotto soglia critica: piccolo ritocco prezzo e rientri.`)
    if (vulner.length) out.push(`${vulner.length} ${vulner.length === 1 ? `${LEX.prodotto} va` : `${LEX.prodotti} vanno`} in sofferenza con +20% materie prime: blocca i prezzi col fornitore o adegua il listino.`)
    if (diag.impattoMese > 1) out.push(`Portando a target i prodotti sopra soglia recuperi circa ${euro0(diag.impattoMese)}/mese di margine.`)
    if (!critici.length && !occhio.length && !vulner.length && rows.length) out.push(`Listino in salute: food cost medio ${pct(diag.fcMedio)}, sotto controllo. Monitora ogni trimestre.`)
    return out
  }, [rows, targetPct, diag, LEX])

  // ── Tabella prodotti ordinabile ──────────────────────────────────────────────
  const { sortKey, sortDir, toggleSort, sort } = useSortable('fcPct', 'desc')
  const rowsSorted = useMemo(() => sort(rows, (r, k) => r[k] ?? 0), [rows, sortKey, sortDir])

  // ── Export PDF (mantiene la firma esistente) ─────────────────────────────────
  const handleExportPdf = async () => {
    if (!(await gateExport('simulatore_prezzi', { n_items: rows.length }, window.__foodos_notify))) return
    const c = getExportCtx()
    exportSimulatorePrezzi({
      orizzonteGiorni, scenRows,
      totBaseRicavo: sim.totBaseRicavo, totScenRicavo: sim.totScenRicavo,
      totBaseMarg: sim.totBaseMarg, totScenMarg: sim.totScenMarg,
      totProiBase: sim.totProiBase, totProiScen: sim.totProiScen, totProiDiff: sim.totProiDiff,
      fcAvgPct: diag.fcMedio, raccomandazioni,
    }, c.nomeAttivita, c.email)
  }

  const exportBtn = (
    <button onClick={handleExportPdf}
      style={{ padding: '10px 16px', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
        fontSize: 13, fontWeight: 500, color: T.textMid, cursor: 'pointer', letterSpacing: '-0.005em',
        display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.sm }}>
      <Icon name="fileText" size={14} />Esporta PDF
    </button>
  )

  if (!rows.length) {
    return (
      <div style={{ maxWidth: 1200 }}>
        <PageHeader subtitle="Quanto ti costano i prodotti, quanto margini e a che prezzo venderli." action={exportBtn} />
        <div style={{ ...cardStyle(), textAlign: 'center', padding: '60px 40px', color: T.textSoft, fontSize: 14 }}>
          Nessun prodotto vendibile nel ricettario. Aggiungi ricette con prezzo e ingredienti per vedere il food cost.
        </div>
      </div>
    )
  }

  function cardStyle() { return { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: SHADOW_PREMIUM } }

  const cellNum = { padding: '11px 14px', textAlign: 'right', ...TNUM, whiteSpace: 'nowrap' }

  return (
    <div style={{ maxWidth: 1200 }}>
      <PageHeader
        subtitle={`Quanto ti costano i prodotti, quanto margini e a che prezzo venderli${hasStorico ? ` · ${totSess} sessioni di storico` : ''}`}
        action={exportBtn}
      />

      {/* Target food cost */}
      <div style={{ ...cardStyle(), padding: isMobile ? '14px' : '12px 18px', marginBottom: 18, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14, flexWrap: 'wrap' }}>
        <Tip text="Il food cost obiettivo: la quota del prezzo di vendita che vuoi sia coperta dalle materie prime. In pasticceria/gelateria di solito 25–35%.">
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textMid, cursor: 'help', borderBottom: '1px dashed', borderColor: T.borderStr, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="target" size={14} />Food cost obiettivo
          </span>
        </Tip>
        <div style={{ display: 'flex', gap: 3, padding: 3, background: T.bgSubtle, borderRadius: R.md, width: isMobile ? '100%' : 'auto' }}>
          {[25, 28, 30, 33, 35].map(t => (
            <button key={t} onClick={() => setTargetPct(t)}
              style={{ flex: isMobile ? 1 : 'unset', padding: isMobile ? '10px 4px' : '6px 12px', minHeight: isMobile ? 40 : 'auto', borderRadius: R.sm, border: 'none', cursor: 'pointer', fontSize: isMobile ? 13 : 12.5,
                fontWeight: targetPct === t ? 700 : 500, ...TNUM,
                background: targetPct === t ? T.bgCard : 'transparent', color: targetPct === t ? T.brand : T.textSoft,
                boxShadow: targetPct === t ? S.sm : 'none' }}>{t}%</button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: T.textSoft, lineHeight: 1.4 }}>verde ≤ {targetPct}% · ambra ≤ {targetPct + 10}% · rosso oltre</span>
      </div>

      {/* ① DIAGNOSI */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: 14 }}>
        <KPI icon={<Icon name="receipt" size={17} />} label="Food cost medio" value={pct(diag.fcMedio)} color={fcColor(diag.fcMedio)}
          sub={`obiettivo ${targetPct}%`} />
        <KPI icon={<Icon name="trendUp" size={17} />} label="Margine medio" value={pct(diag.margMedio)} color={T.green} sub="sul ricavo" />
        <KPI icon={<Icon name="warning" size={17} />} label="Prodotti critici" value={String(diag.critici)} color={diag.critici ? T.brand : T.green}
          sub={`su ${rows.length} · oltre ${targetPct + 10}%`} />
        <KPI icon={<Icon name="money" size={17} />} label="Recuperabile / mese" value={euro0(diag.impattoMese)} highlight
          sub={hasStorico ? 'portando i critici a target' : 'serve storico produzione'} />
      </div>

      {/* ② SALUTE DEL LISTINO */}
      <div style={{ ...cardStyle(), padding: isMobile ? 14 : 18, marginBottom: 26 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 12 }}>Salute del listino</div>
        {(() => {
          const tot = diag.sani + diag.occhio + diag.critici || 1
          const segs = [
            { n: diag.sani, c: T.green, lbl: 'Sani' },
            { n: diag.occhio, c: T.amber, lbl: 'Da tenere d’occhio' },
            { n: diag.critici, c: T.brand, lbl: 'Critici' },
          ]
          return (
            <>
              <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: T.bgSubtle }}>
                {segs.map((s, i) => s.n > 0 && (
                  <div key={i} title={`${s.lbl}: ${s.n}`} style={{ width: `${s.n / tot * 100}%`, background: s.c, transition: 'width 0.3s' }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
                {segs.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.textMid }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.c }} />
                    <b style={{ color: T.text, ...TNUM }}>{s.n}</b> {s.lbl}
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* ③ TABELLA PRODOTTI */}
      <SH sub="Clicca una riga per vedere com'è composto il costo. Il prezzo consigliato porta il food cost al target.">I tuoi prodotti</SH>
      <div style={{ ...cardStyle(), overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Prodotto</SortTH>
                <SortTH k="prezzo" active={sortKey === 'prezzo'} dir={sortDir} onToggle={toggleSort} right tip="Prezzo di vendita attuale (per pezzo/fetta)">Prezzo</SortTH>
                <SortTH k="fc" active={sortKey === 'fc'} dir={sortDir} onToggle={toggleSort} right tip="Costo delle materie prime per stampo">Food cost €</SortTH>
                <SortTH k="fcPct" active={sortKey === 'fcPct'} dir={sortDir} onToggle={toggleSort} right tip="Food cost in % del ricavo. Più basso è meglio.">Food cost %</SortTH>
                <SortTH k="margPct" active={sortKey === 'margPct'} dir={sortDir} onToggle={toggleSort} right tip="Margine in % del ricavo">Margine %</SortTH>
                <SortTH k="prezzoConsigliato" active={sortKey === 'prezzoConsigliato'} dir={sortDir} onToggle={toggleSort} right tip={`Prezzo per pezzo che porta il food cost al ${targetPct}%`}>Prezzo consigliato</SortTH>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {rowsSorted.map((r, i) => {
                const open = expanded === r.nome
                const col = fcColor(r.fcPct)
                const naf = r.ricavo <= 0
                return (
                  <React.Fragment key={r.nome}>
                    <tr onClick={() => setExpanded(open ? null : r.nome)}
                      style={{ cursor: 'pointer', borderTop: i ? `1px solid ${T.borderSoft}` : 'none', background: open ? T.bgSubtle : 'transparent' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: T.text, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span title={r.nome}>{r.nome}</span>
                        {r.mancanti.length > 0 && <Tip text={`Ingredienti senza prezzo: ${r.mancanti.map(m => m.nome).join(', ')}. Il food cost è sottostimato.`}><span style={{ marginLeft: 6, color: T.amber, cursor: 'help', display: 'inline-flex', verticalAlign: 'middle' }}><Icon name="warning" size={13} /></span></Tip>}
                      </td>
                      <td style={{ ...cellNum, color: T.textMid }}>{euro(r.reg.prezzo)}</td>
                      <td style={{ ...cellNum, color: T.text, fontWeight: 600 }}>{euro(r.fc)}</td>
                      <td style={cellNum}>
                        {naf ? <span style={{ color: T.textSoft }}>—</span> : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
                            <span style={{ width: 42, height: 6, borderRadius: 3, background: T.bgSubtle, overflow: 'hidden', display: 'inline-block' }}>
                              <span style={{ display: 'block', height: '100%', width: `${Math.min(100, r.fcPct)}%`, background: col }} />
                            </span>
                            <b style={{ color: col, minWidth: 44, display: 'inline-block' }}>{pct(r.fcPct)}</b>
                          </span>
                        )}
                      </td>
                      <td style={{ ...cellNum, color: T.textMid }}>{naf ? '—' : pct(r.margPct)}</td>
                      <td style={cellNum}>
                        <div style={{ display: 'inline-flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-end' : 'baseline', gap: isMobile ? 2 : 6 }}>
                          <span style={{ fontWeight: 700, color: T.text }}>{euro(r.prezzoConsigliato)}</span>
                          {r.deltaPrezzo > 0.01
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: T.brand }}>+{euro(r.deltaPrezzo)}</span>
                            : <span style={{ fontSize: 11, color: T.green }} aria-label="in linea">✓</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', color: T.textSoft }}>{open ? '▾' : '▸'}</td>
                    </tr>
                    {open && (
                      <tr style={{ background: T.bgSubtle }}>
                        <td colSpan={7} style={{ padding: '6px 14px 16px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 8px' }}>
                            Composizione del costo · {r.reg.unita} {r.reg.tipo === 'fetta' ? 'fette' : 'pz'}/stampo
                          </div>
                          {r.righe.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.textSoft }}>Nessun ingrediente con quantità nel ricettario.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {r.righe.map((ing, j) => {
                                const pctCosto = r.fc > 0 ? (ing.costo / r.fc * 100) : 0
                                return (
                                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                                    <span style={{ flex: '0 0 38%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ing.mancante ? T.amber : T.text, fontWeight: j === 0 ? 700 : 500 }}>
                                      {ing.nome}{ing.isSemilavorato ? ' (semilav.)' : ''}{ing.mancante ? ' · prezzo mancante' : ''}
                                    </span>
                                    <span style={{ flex: 1, height: 7, background: T.bgCard, borderRadius: 4, overflow: 'hidden' }}>
                                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pctCosto)}%`, background: j === 0 ? T.brand : 'rgba(110,14,26,0.45)' }} />
                                    </span>
                                    <span style={{ flex: '0 0 64px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 600 }}>{euro(ing.costo)}</span>
                                    <span style={{ flex: '0 0 48px', textAlign: 'right', ...TNUM, color: T.textSoft }}>{pctCosto.toFixed(0)}%</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ④ TOP INGREDIENTI */}
      {topIngredienti.lista.length > 0 && (
        <>
          <SH sub={hasStorico ? 'Quanto pesa ogni ingrediente sul food cost totale, stimato sulla produzione mensile.' : 'Quanto pesa ogni ingrediente sul food cost del listino (attiva lo storico per pesarlo sulla produzione reale).'}>Ingredienti che pesano di più</SH>
          <div style={{ ...cardStyle(), padding: isMobile ? 14 : 18, marginBottom: 28 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topIngredienti.lista.map((ing, i) => (
                <div key={ing.nome} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                  <span style={{ flex: isMobile ? '0 0 38%' : '0 0 34%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isMobile ? 12 : 12.5, fontWeight: i === 0 ? 700 : 500, color: T.text }} title={ing.nome}>{ing.nome}</span>
                  <span style={{ flex: 1, height: 18, background: T.bgSubtle, borderRadius: 6, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, ing.pct)}%`, background: i === 0 ? T.brand : 'rgba(110,14,26,0.5)', transition: 'width 0.3s' }} />
                  </span>
                  <span style={{ flex: '0 0 52px', textAlign: 'right', fontSize: isMobile ? 12 : 12.5, fontWeight: 700, color: T.text, ...TNUM }}>{ing.pct.toFixed(1)}%</span>
                  {hasStorico && !isMobile && <span style={{ flex: '0 0 78px', textAlign: 'right', fontSize: 11.5, color: T.textSoft, ...TNUM }}>{euro0(ing.val)}/mese</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ⑤ SIMULATORE WHAT-IF */}
      <SH sub="Sposta le leve e vedi l'impatto su margine e proiezione. Non cambia i prezzi reali finché non li applichi tu.">Simulatore what-if</SH>
      <div style={{ ...cardStyle(), padding: isMobile ? 16 : 22, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 22 }}>
          {/* Leva prezzi */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Aumenta tutti i prezzi</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min="-10" max="30" step="1" value={prezzoPct} onChange={e => setPrezzoPct(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.brand }} />
              <span style={{ minWidth: 54, textAlign: 'right', fontSize: 18, fontWeight: 800, color: prezzoPct > 0 ? T.green : prezzoPct < 0 ? T.brand : T.text, ...TNUM }}>
                {prezzoPct > 0 ? '+' : ''}{prezzoPct}%
              </span>
            </div>
          </div>
          {/* Leva materie prime */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Se le materie prime aumentano</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min="0" max="40" step="1" value={mpPct} onChange={e => setMpPct(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.amber }} />
              <span style={{ minWidth: 54, textAlign: 'right', fontSize: 18, fontWeight: 800, color: mpPct > 0 ? T.amber : T.text, ...TNUM }}>
                +{mpPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Orizzonte + reset */}
        <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 12, marginTop: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: T.textSoft }}>Proiezione su</span>
          <div style={{ display: 'flex', gap: 2, padding: 3, background: T.bgSubtle, borderRadius: R.md, width: isMobile ? '100%' : 'auto' }}>
            {[7, 14, 30, 60, 90].map(g => (
              <button key={g} onClick={() => setOrizzonteGiorni(g)}
                style={{ flex: isMobile ? 1 : 'unset', padding: isMobile ? '10px 6px' : '5px 10px', minHeight: isMobile ? 40 : 'auto', borderRadius: R.sm, border: 'none', ...TNUM,
                  background: orizzonteGiorni === g ? T.bgCard : 'transparent', color: orizzonteGiorni === g ? T.text : T.textSoft,
                  fontSize: isMobile ? 13 : 12, fontWeight: orizzonteGiorni === g ? 600 : 500, cursor: 'pointer', boxShadow: orizzonteGiorni === g ? S.sm : 'none' }}>{g}g</button>
            ))}
          </div>
          {hasChanges && (
            <button onClick={() => { setPrezzoPct(0); setMpPct(0) }}
              style={{ padding: isMobile ? '11px 14px' : '7px 12px', minHeight: isMobile ? 42 : 'auto', borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard, fontSize: 12.5, fontWeight: 500, color: T.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <Icon name="refresh" size={13} />Azzera leve
            </button>
          )}
        </div>

        {/* Risultati simulazione */}
        {hasChanges && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${T.borderSoft}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 16 }}>
            <SimStat label="Margine / stampo ora" val={euro0(sim.totBaseMarg)} c={T.textMid} />
            <SimStat label="Margine / stampo scenario" val={euro0(sim.totScenMarg)} c={sim.totScenMarg >= sim.totBaseMarg ? T.green : T.brand}
              delta={`${sim.totScenMarg >= sim.totBaseMarg ? '+' : ''}${euro0(sim.totScenMarg - sim.totBaseMarg)}`} />
            {hasStorico && <SimStat label={`Differenza margine ${orizzonteGiorni}g`} val={`${sim.totProiDiff > 0 ? '+' : ''}${euro0(sim.totProiDiff)}`} c={sim.totProiDiff >= 0 ? T.green : T.brand} />}
          </div>
        )}
        {mpPct > 0 && sim.sofferenti.length > 0 && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, fontSize: 12, color: '#92400E' }}>
            <b>{sim.sofferenti.length}</b> {sim.sofferenti.length === 1 ? 'prodotto va' : 'prodotti vanno'} in sofferenza con +{mpPct}% materie prime: {sim.sofferenti.slice(0, 4).map(r => r.nome).join(', ')}{sim.sofferenti.length > 4 ? '…' : ''}
          </div>
        )}
      </div>

      {/* ⑥ RACCOMANDAZIONI */}
      {raccomandazioni.length > 0 && (
        <>
          <SH sub="Generate dall'analisi del listino e dello storico">Cosa farei al tuo posto</SH>
          <div style={{ ...cardStyle(), padding: '18px 22px', marginBottom: 8 }}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {raccomandazioni.map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '8px 0', borderBottom: i < raccomandazioni.length - 1 ? `1px dashed ${T.borderSoft}` : 'none' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(110,14,26,0.10)', color: T.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>›</span>
                  <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

// Statistica del simulatore
function SimStat({ label, val, c, delta }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textSoft, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: c, letterSpacing: '-0.02em', ...TNUM }}>{val}</div>
      {delta && <div style={{ fontSize: 12, fontWeight: 600, color: c, marginTop: 2, ...TNUM }}>{delta} vs ora</div>}
    </div>
  )
}
