// Quadratura inventario vs cassa — Dashboard del proprietario.
//
// Mostra (per la settimana selezionata) il confronto tra:
//   - kg venduti calcolati dall inventario (riman+prod-riman-scarto)
//   - euro effettivamente incassati dalla cassa (chiusure SK_CHIUS)
//   - euro attesi al euro/kg medio dei formati di vendita
// Diff = porzioni troppo grandi, omaggi non registrati, errori scontrino,
// furti, o errori di compilazione inventario.
//
// E la "voce di verita" che mette in tensione i due dati: l inventario dice
// quanto e uscito (kg), la cassa dice quanto e entrato (euro). Il sistema
// suggerisce dove guardare per chiudere il gap.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { SK_FORMATI, SK_CHIUS } from '../lib/storageKeys'
import Icon from '../components/Icon'
import ExportPdfButton from '../components/ExportPdfButton'
import { C, KPI, PageHeader, TNUM, fmt0 } from './_shared'
import {
  caricaSettimana, calcolaVendutoSettimana, lunediDellaSettimana,
  euroKgMedioFormati, kpiQuadraturaSettimana, classificaGusti, variazione,
} from '../lib/inventarioProduzione'

function addDays(dateIso, n) {
  const d = new Date(dateIso); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtRange(lunediIso) {
  const lun = new Date(lunediIso)
  const dom = new Date(lunediIso); dom.setDate(dom.getDate() + 6)
  const f = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  return `${f(lun)} - ${f(dom)} ${dom.getFullYear()}`
}
function n0(v) { return Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 }) }
function nKg(g) { return (Number(g) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }
function pct(v) { return v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%` }

function csvEscape(s) {
  const v = String(s ?? '')
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

function esportaCsvSettimana({ lunediIso, kpi, righe, formati, sedeAttiva, isAllSedi, perSede }) {
  const lines = []
  const sep = ';'
  const sedeName = isAllSedi ? 'TUTTE LE SEDI' : (sedeAttiva?.nome || '')
  lines.push(['# Quadratura inventario vs cassa', sedeName, fmtRange(lunediIso)].join(sep))
  lines.push('')
  lines.push(['# Riepilogo settimana'].join(sep))
  lines.push(['Voce', 'Valore'].join(sep))
  lines.push(['Venduto inventario (kg)', nKg((kpi.totVendutoG ?? 0))].join(sep))
  lines.push(['Vendite B2B (kg)', kpi.b2bKg ? nKg(kpi.b2bKg * 1000) : '0,0'].join(sep))
  lines.push(['Retail effettivo (kg)', nKg(((kpi.retailKg ?? kpi.totVendutoKg) || 0) * 1000)].join(sep))
  lines.push(['Cassa effettiva (€)', String(kpi.cassaEffettiva ?? 0).replace('.', ',')].join(sep))
  lines.push(['Ricavo atteso (€)', String(kpi.ricavoAtteso ?? 0).replace('.', ',')].join(sep))
  lines.push(['Drift (€)', String(kpi.driftEur ?? 0).replace('.', ',')].join(sep))
  lines.push(['Drift (%)', pct(kpi.driftPct)].join(sep))
  lines.push('')
  if (Array.isArray(righe) && righe.length > 0) {
    lines.push(['# Dettaglio gusti'].join(sep))
    lines.push(['Gusto', 'Iniziale (g)', 'Prodotto (g)', 'Finale (g)', 'Scarto (g)', 'Venduto (g)'].map(csvEscape).join(sep))
    for (const r of righe) {
      lines.push([
        csvEscape(r.gusto || r.nome || ''),
        String(r.inizialeG ?? r.iniziale_g ?? 0),
        String(r.prodottoG ?? r.prodotto_g ?? 0),
        String(r.finaleG ?? r.finale_g ?? 0),
        String(r.scartoG ?? r.scarto_g ?? 0),
        String(r.vendutoG ?? r.venduto_g ?? 0),
      ].join(sep))
    }
    lines.push('')
  }
  if (isAllSedi && Array.isArray(perSede) && perSede.length > 0) {
    lines.push(['# Drill-down per sede'].join(sep))
    lines.push(['Sede', 'Venduto retail (kg)', 'Cassa (€)', 'Atteso (€)', 'Drift (€)', 'Drift (%)'].map(csvEscape).join(sep))
    for (const p of perSede) {
      lines.push([
        csvEscape(p.sede?.nome || ''),
        nKg(((p.kpi.retailKg ?? p.kpi.totVendutoKg) || 0) * 1000),
        String(p.kpi.cassaEffettiva ?? 0).replace('.', ','),
        String(p.kpi.ricavoAtteso ?? 0).replace('.', ','),
        String(p.kpi.driftEur ?? 0).replace('.', ','),
        pct(p.kpi.driftPct),
      ].join(sep))
    }
  }
  const csv = '﻿' + lines.join('\n')  // BOM per Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quadratura_${lunediIso}_${(sedeAttiva?.nome || 'sede').replace(/\s+/g, '_')}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function QuadraturaInventarioView({ orgId, sedeId, sedi, sedeAttiva, chiusure, onNavigate }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const isAllSedi = sedeAttiva?._all === true
  const [lunediIso, setLunediIso] = useState(() => lunediDellaSettimana())
  const [righe, setRighe] = useState([])
  const [righePrev, setRighePrev] = useState([])
  const [formati, setFormati] = useState([])
  const [venditeB2bSett, setVenditeB2bSett] = useState([])
  const [venditeB2bPrec, setVenditeB2bPrec] = useState([])
  const [trendData, setTrendData] = useState([])  // [{ lunIso, kg, cassa }] x 4 settimane
  const [perSede, setPerSede] = useState([])      // drill-down per sede quando isAllSedi
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!orgId || !sedeId) { setLoading(false); return }
    setLoading(true)
    const lunPrec = addDays(lunediIso, -7)
    const finePrec = lunediIso
    const fineSett = addDays(lunediIso, 7)
    Promise.all([
      caricaSettimana(orgId, sedeId, lunediIso),
      caricaSettimana(orgId, sedeId, lunPrec),
      sload(SK_FORMATI, orgId, null),
      // Vendite B2B della sett. corrente e della precedente (per togliere
      // i kg B2B dal confronto cassa retail, evita drift falso).
      supabase.from('vendite_b2b').select('data, righe, totale')
        .eq('organization_id', orgId).eq('sede_id', sedeId)
        .gte('data', lunediIso).lt('data', fineSett)
        .then(({ data }) => data || []),
      supabase.from('vendite_b2b').select('data, righe, totale')
        .eq('organization_id', orgId).eq('sede_id', sedeId)
        .gte('data', lunPrec).lt('data', finePrec)
        .then(({ data }) => data || []),
    ]).then(([sett, prec, fmt, b2bS, b2bP]) => {
      if (!alive) return
      setRighe(sett || [])
      setRighePrev(prec || [])
      setFormati(Array.isArray(fmt) ? fmt : [])
      setVenditeB2bSett(b2bS || [])
      setVenditeB2bPrec(b2bP || [])
      setLoading(false)
    }).catch(e => { if (alive) { console.error(e); setLoading(false) } })
    return () => { alive = false }
  }, [orgId, sedeId, lunediIso])

  const matrice = useMemo(() => calcolaVendutoSettimana(righe, lunediIso), [righe, lunediIso])
  const matricePrev = useMemo(
    () => calcolaVendutoSettimana(righePrev, addDays(lunediIso, -7)),
    [righePrev, lunediIso]
  )
  const euroKg = useMemo(() => euroKgMedioFormati(formati), [formati])

  // Chiusure della settimana target (filtrate per data).
  const chiusureSett = useMemo(() => {
    const inizio = lunediIso
    const fine = addDays(lunediIso, 7)
    return (chiusure || []).filter(c => c.data >= inizio && c.data < fine)
  }, [chiusure, lunediIso])
  const chiusurePrev = useMemo(() => {
    const inizio = addDays(lunediIso, -7)
    const fine = lunediIso
    return (chiusure || []).filter(c => c.data >= inizio && c.data < fine)
  }, [chiusure, lunediIso])

  // Sparkline: ultime 4 settimane (incluse la corrente). Per ogni settimana
  // calcoliamo kg venduti totali dall'inventario + cassa retail. La cassa
  // arriva da `chiusure` (gia' filtrata dal Dashboard), l'inventario serve
  // un fetch separato.
  useEffect(() => {
    if (!orgId || !sedeId) return
    const settimane = []
    for (let i = 3; i >= 0; i--) settimane.push(addDays(lunediIso, -7 * i))
    Promise.all(settimane.map(lun => caricaSettimana(orgId, sedeId, lun)))
      .then(perSettimana => {
        const out = settimane.map((lun, idx) => {
          const matr = calcolaVendutoSettimana(perSettimana[idx], lun)
          const kg = Object.values(matr).reduce((s, byData) =>
            s + Object.values(byData).reduce((a, c) => a + Number(c.venduto || 0), 0)
          , 0) / 1000
          const fineW = addDays(lun, 7)
          const cassa = (chiusure || [])
            .filter(c => c.data >= lun && c.data < fineW)
            .reduce((s, c) => s + Number(c?.kpi?.totV || c?.totale || 0), 0)
          return { lunIso: lun, kg, cassa }
        })
        setTrendData(out)
      })
      .catch(e => console.error('trend:', e))
  }, [orgId, sedeId, lunediIso, chiusure])

  // Drill-down per sede (solo isAllSedi): per ogni sede produttiva
  // carichiamo settimana + b2b e calcoliamo KPI individuali.
  useEffect(() => {
    if (!isAllSedi || !orgId) { setPerSede([]); return }
    const sediProduttive = (sedi || []).filter(s =>
      s.attiva !== false && s.is_sede_produzione && s.metodo_produzione === 'inventario'
    )
    if (sediProduttive.length === 0) { setPerSede([]); return }
    Promise.all(sediProduttive.map(async s => {
      const [righeSet, b2bSet] = await Promise.all([
        caricaSettimana(orgId, s.id, lunediIso),
        supabase.from('vendite_b2b').select('data, righe, totale')
          .eq('organization_id', orgId).eq('sede_id', s.id)
          .gte('data', lunediIso).lt('data', addDays(lunediIso, 7))
          .then(({ data }) => data || []),
      ])
      const matr = calcolaVendutoSettimana(righeSet, lunediIso)
      const chiusS = (chiusure || []).filter(c => c.data >= lunediIso && c.data < addDays(lunediIso, 7))
        // Nota: chiusure arrivano filtrate per sede attiva, qui non
        // possiamo distinguere -> il drill-down cassa per sede e' un'apparizione
        // approssimativa (sommiamo tutta la cassa attiva, etichettata "tot org").
      const kp = kpiQuadraturaSettimana(matr, chiusS, euroKg, b2bSet)
      return { sede: s, kpi: kp }
    }))
    .then(setPerSede)
    .catch(e => console.error('drill-down per sede:', e))
  }, [isAllSedi, orgId, sedi, lunediIso, euroKg, chiusure])

  const kpi = useMemo(
    () => kpiQuadraturaSettimana(matrice, chiusureSett, euroKg, venditeB2bSett),
    [matrice, chiusureSett, euroKg, venditeB2bSett]
  )
  const kpiPrev = useMemo(
    () => kpiQuadraturaSettimana(matricePrev, chiusurePrev, euroKg, venditeB2bPrec),
    [matricePrev, chiusurePrev, euroKg, venditeB2bPrec]
  )
  const classifica = useMemo(() => classificaGusti(matrice), [matrice])

  const settimanaPrec = () => setLunediIso(addDays(lunediIso, -7))
  const settimanaSucc = () => setLunediIso(addDays(lunediIso, 7))
  const oggi = () => setLunediIso(lunediDellaSettimana())

  // ── Render ─────────────────────────────────────────────────────────────

  if (!orgId) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
  }
  // Quando isAllSedi e' attivo non serve sedeId: il drill-down per sede e'
  // gia' gestito dal blocco perSede.
  if (!sedeId && !isAllSedi) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Seleziona una sede</div>
  }

  // Tone del drift: |drift%| < 5% verde, < 15% giallo, oltre rosso.
  const driftTone = (p) => {
    if (p == null) return { bg: C.bgSubtle, fg: C.textMid, label: 'n/d' }
    const a = Math.abs(p)
    if (a < 5) return { bg: '#ECFDF5', fg: '#065F46', label: 'in target' }
    if (a < 15) return { bg: '#FFFBEB', fg: '#92400E', label: 'da osservare' }
    return { bg: '#FEF2F2', fg: '#991B1B', label: 'attenzione' }
  }
  const tone = driftTone(kpi.driftPct)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader subtitle="Quadratura settimanale: l'inventario dice quanto e' uscito (kg), la cassa quanto e' entrato (€). Il drift indica dove guardare." />

      {/* Toolbar settimana — su mobile: nav prec/oggi/succ in riga, etichetta sopra, export sotto */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, marginBottom: 20,
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: isMobile ? '12px 12px' : '12px 16px',
        flexWrap: 'wrap',
      }}>
        {isMobile && (
          <div style={{ flex: '1 1 100%', textAlign: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft }}>Settimana</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtRange(lunediIso)}</div>
          </div>
        )}
        <button onClick={settimanaPrec} aria-label="Settimana precedente" style={{ ...btnNav, padding: isMobile ? '10px 12px' : '8px 14px' }}>← {isMobile ? '' : 'Sett. prec.'}</button>
        {!isMobile && (
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft }}>Settimana</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtRange(lunediIso)}</div>
          </div>
        )}
        <button onClick={oggi} style={{ ...btnNav, flex: isMobile ? 1 : 'none' }}>Oggi</button>
        <button onClick={settimanaSucc} aria-label="Settimana successiva" style={{ ...btnNav, padding: isMobile ? '10px 12px' : '8px 14px' }}>{isMobile ? '' : 'Sett. succ.'} →</button>
        <button onClick={() => esportaCsvSettimana({ lunediIso, kpi, righe, formati, sedeAttiva, isAllSedi, perSede })}
          style={{ ...btnNav, background: C.text, color: C.white, borderColor: C.text, flex: isMobile ? '1 1 100%' : 'none', justifyContent: 'center' }}
          title="Esporta la settimana in CSV per commercialista/contabilita">
          ⬇ CSV
        </button>
        <ExportPdfButton
          fileName={`quadratura-${lunediIso}.pdf`}
          compact
          label="Esporta PDF settimana"
          getReport={() => ({
            title: 'Quadratura inventario vs cassa',
            subtitle: isAllSedi ? 'Tutte le sedi' : (sedeAttiva?.nome || ''),
            periodo: fmtRange(lunediIso),
            kpi: [
              { label: 'Venduto (kg)', value: nKg((kpi.totVendutoG ?? 0)), sub: 'inventario' },
              { label: 'Cassa effettiva', value: '€ ' + (kpi.cassaEffettiva ?? 0).toFixed(0) },
              { label: 'Atteso (€)', value: '€ ' + (kpi.ricavoAtteso ?? 0).toFixed(0), sub: `€/kg medio ${n0(euroKg)}` },
              { label: 'Drift', value: (kpi.driftEur != null ? `${kpi.driftEur > 0 ? '+' : ''}€ ${kpi.driftEur.toFixed(0)} (${pct(kpi.driftPct)})` : '—') },
            ],
            sections: [
              ...(Array.isArray(righe) && righe.length > 0 ? [{
                title: 'Dettaglio gusti',
                table: {
                  columns: ['Gusto', 'Iniziale (g)', 'Prodotto (g)', 'Finale (g)', 'Scarto (g)', 'Venduto (g)'],
                  alignments: ['left', 'right', 'right', 'right', 'right', 'right'],
                  rows: righe.map(r => [
                    r.gusto || r.nome || '',
                    String(r.inizialeG ?? r.iniziale_g ?? 0),
                    String(r.prodottoG ?? r.prodotto_g ?? 0),
                    String(r.finaleG ?? r.finale_g ?? 0),
                    String(r.scartoG ?? r.scarto_g ?? 0),
                    String(r.vendutoG ?? r.venduto_g ?? 0),
                  ]),
                },
              }] : []),
              ...(isAllSedi && Array.isArray(perSede) && perSede.length > 0 ? [{
                title: 'Drill-down per sede',
                table: {
                  columns: ['Sede', 'Venduto retail (kg)', 'Cassa (€)', 'Atteso (€)', 'Drift (€)', 'Drift (%)'],
                  alignments: ['left', 'right', 'right', 'right', 'right', 'right'],
                  rows: perSede.map(p => [
                    p.sede?.nome || '',
                    nKg(((p.kpi.retailKg ?? p.kpi.totVendutoKg) || 0) * 1000),
                    (p.kpi.cassaEffettiva ?? 0).toFixed(0),
                    (p.kpi.ricavoAtteso ?? 0).toFixed(0),
                    (p.kpi.driftEur ?? 0).toFixed(0),
                    pct(p.kpi.driftPct),
                  ]),
                },
              }] : []),
            ],
          })}
        />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : !euroKg ? (
        <div style={{
          padding: '20px 24px', background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: 12, marginBottom: 20, fontSize: 13, color: '#92400E', lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Icon name="warning" size={16} /> &nbsp;
            <strong>Imposta i formati di vendita</strong> per calcolare il €/kg medio e abilitare la quadratura con la cassa.
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('formati-vendita')}
              style={{
                background: '#92400E', color: '#FFF', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name="coins" size={14} /> Vai a Formati di vendita
            </button>
          )}
        </div>
      ) : (
        <>
          {/* KPI hero quadratura */}
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
            padding: isMobile ? 18 : 26, marginBottom: 20,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 30px rgba(15,23,42,0.05)',
          }}>
            <div style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: isMobile ? '1fr' : (isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'),
            }}>
              <Tile
                icon="layers"
                label={kpi.b2bKg > 0 ? `Venduto retail (${nKg(kpi.totVendutoG)} kg tot)` : 'Venduto inventario'}
                value={`${nKg((kpi.retailKg ?? kpi.totVendutoKg) * 1000)} kg`}
                tendVal={variazione(kpi.retailKg ?? kpi.totVendutoKg, kpiPrev.retailKg ?? kpiPrev.totVendutoKg)}
              />
              <Tile
                icon="creditCard"
                label="Cassa effettiva"
                value={fmt0(kpi.cassaEffettiva)}
                tendVal={variazione(kpi.cassaEffettiva, kpiPrev.cassaEffettiva)}
              />
              <Tile
                icon="barChart"
                label={`Atteso (€/kg ${n0(euroKg)})`}
                value={fmt0(kpi.ricavoAtteso || 0)}
                muted
              />
              <Tile
                icon="check"
                label="Drift vs cassa"
                value={kpi.driftEur != null ? `${kpi.driftEur > 0 ? '+' : ''}${fmt0(kpi.driftEur)} (${pct(kpi.driftPct)})` : '—'}
                color={tone.fg}
                bg={tone.bg}
                badge={tone.label}
              />
            </div>
            {kpi.b2bKg > 0 && (
              <div style={{
                marginTop: 12, padding: '10px 14px', background: '#F0F9FF',
                border: '1px solid #BAE6FD', borderRadius: 10,
                fontSize: 12.5, color: '#075985', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="receipt" size={13} />
                  <span><strong>Vendite B2B</strong> separate dalla cassa retail:
                    {' '}{nKg(kpi.b2bKg * 1000)} kg → {fmt0(kpi.ricaviB2b)} fatturato</span>
                </span>
                <span style={{ fontSize: 11, color: '#0C4A6E' }}>
                  (sottratti dal &ldquo;venduto retail&rdquo; per non gonfiare il drift)
                </span>
              </div>
            )}
            {kpi.driftPct != null && Math.abs(kpi.driftPct) >= 15 && (
              <DiagnosiDrift driftEur={kpi.driftEur} driftPct={kpi.driftPct} />
            )}
          </div>

          {/* Sparkline trend 4 settimane */}
          {trendData.length > 0 && (
            <div style={panelStyle}>
              <div style={panelTitle}>Trend ultime 4 settimane</div>
              <SparklineTrend data={trendData} />
            </div>
          )}

          {/* Drill-down per sede (solo se isAllSedi) */}
          {isAllSedi && perSede.length > 0 && (
            <div style={{ ...panelStyle, marginTop: 16 }}>
              <div style={panelTitle}>Dettaglio per sede</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={tdHeadSede}>Sede</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Retail kg</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>B2B kg</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Atteso (€)</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Ricavi B2B (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perSede.map(({ sede, kpi: k }) => (
                      <tr key={sede.id} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                        <td style={tdCellSede}>{sede.nome}{sede.is_default ? ' ★' : ''}</td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM }}>{nKg((k.retailKg ?? k.totVendutoKg) * 1000)} kg</td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: C.textSoft }}>{nKg((k.b2bKg || 0) * 1000)} kg</td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 700 }}>{fmt0(k.ricavoAtteso || 0)}</td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: '#075985' }}>{fmt0(k.ricaviB2b || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top + Sofferenza */}
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr',
            marginBottom: 20,
            marginTop: 16,
          }}>
            <PanelTop title="Top gusti per kg venduti" items={classifica.top}
              total={kpi.totVendutoG} />
            <PanelSofferenza
              sofferenza={classifica.sofferenza}
              zeroVenduto={classifica.zeroVenduto}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ── Sparkline trend 4 settimane (SVG inline) ───────────────────────────────
// Mini grafico con 2 serie: kg venduti (linea verde) e cassa retail (linea
// rossa). Asse Y normalizzato per leggibilita'.
function SparklineTrend({ data }) {
  const W = 600, H = 100, PAD = 26
  if (!data || data.length === 0) return null
  const maxKg = Math.max(1, ...data.map(d => d.kg))
  const maxEur = Math.max(1, ...data.map(d => d.cassa))
  const xStep = (W - PAD * 2) / Math.max(1, data.length - 1)
  const pathKg = data.map((d, i) => {
    const x = PAD + i * xStep
    const y = H - PAD - (d.kg / maxKg) * (H - PAD * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const pathEur = data.map((d, i) => {
    const x = PAD + i * xStep
    const y = H - PAD - (d.cassa / maxEur) * (H - PAD * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const fmtLabel = (iso) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 140 }}>
        <path d={pathKg} fill="none" stroke="#16A34A" strokeWidth="2" />
        <path d={pathEur} fill="none" stroke="#6E0E1A" strokeWidth="2" strokeDasharray="4 3" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={PAD + i * xStep} cy={H - PAD - (d.kg / maxKg) * (H - PAD * 2)} r="3" fill="#16A34A" />
            <circle cx={PAD + i * xStep} cy={H - PAD - (d.cassa / maxEur) * (H - PAD * 2)} r="3" fill="#6E0E1A" />
            <text x={PAD + i * xStep} y={H - 6} fontSize="9" textAnchor="middle" fill="#6B7280">
              {fmtLabel(d.lunIso)}
            </text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.textSoft, marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#16A34A', verticalAlign: 'middle' }} /> kg venduti</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: '#6E0E1A', borderTop: '1px dashed #6E0E1A', verticalAlign: 'middle' }} /> cassa €</span>
      </div>
    </div>
  )
}

const tdHeadSede = { padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }
const tdCellSede = { padding: '8px 12px', fontSize: 12.5, color: C.text }

// ── Tile KPI ──────────────────────────────────────────────────────────────
// Audit 2026-06-24: minHeight uniformi sui sub-elementi così tile affiancate
// hanno value/badge allineati anche con label su 1 vs 2 righe.
function Tile({ icon, label, value, tendVal, muted, color, bg, badge }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: bg || C.bgSubtle,
      borderRadius: 12,
      border: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
        <Icon name={icon} size={14} color={color || C.textSoft} />
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft, lineHeight: 1.25 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || (muted ? C.textMid : C.text), letterSpacing: '-0.02em', minHeight: 28, lineHeight: 1.1, ...TNUM }}>
        {value}
      </div>
      {badge && (
        <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: color || C.textMid, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {badge}
        </div>
      )}
      {tendVal != null && (
        <div style={{ fontSize: 11, color: tendVal >= 0 ? '#065F46' : '#991B1B', marginTop: 4, fontWeight: 600 }}>
          vs sett. prec.: {tendVal > 0 ? '+' : ''}{tendVal.toFixed(1)}%
        </div>
      )}
    </div>
  )
}

// ── Diagnosi drift ────────────────────────────────────────────────────────
function DiagnosiDrift({ driftEur, driftPct }) {
  const tono = driftEur < 0 ? 'mancante' : 'sovrastimato'
  const ipotesi = driftEur < 0
    ? [
        'Porzioni piu grandi di quelle pianificate dai formati (bilancia)',
        'Omaggi non registrati alla cassa',
        'Errori di scontrino (battiture non fatte / sottostimate)',
        'Furti interni',
      ]
    : [
        'Cassa con incassi aggiuntivi non collegati al gelato (es. articoli non da gusto)',
        'Inventario sottostimato: residuo della mattina dopo letto basso o errore di pesata',
        'Scarti registrati ma effettivamente venduti',
      ]
  return (
    <div style={{
      marginTop: 16, padding: '12px 14px', background: '#FEF2F2',
      border: '1px solid #FECACA', borderRadius: 10,
      fontSize: 12, color: '#7F1D1D', lineHeight: 1.5,
    }}>
      <strong>Cosa controllare</strong> (drift {tono} del {Math.abs(driftPct).toFixed(1)}%):
      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
        {ipotesi.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}

// ── Panel Top gusti ───────────────────────────────────────────────────────
function PanelTop({ title, items, total }) {
  if (!items || items.length === 0) {
    return (
      <div style={panelStyle}>
        <div style={panelTitle}>{title}</div>
        <div style={{ fontSize: 12, color: C.textSoft, padding: '12px 0' }}>
          Nessun venduto registrato per questa settimana.
        </div>
      </div>
    )
  }
  return (
    <div style={panelStyle}>
      <div style={panelTitle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => {
          const pct = total > 0 ? (it.vendutoG / total * 100) : 0
          return (
            <div key={it.gusto} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: C.textSoft, textAlign: 'center' }}>
                {i + 1}
              </span>
              <span style={{ flex: '0 0 130px', fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.gusto}
              </span>
              <div style={{ flex: 1, height: 8, background: '#F0EAE6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(4, pct)}%`, height: '100%', background: '#6E0E1A', borderRadius: 4 }} />
              </div>
              <span style={{ flex: '0 0 60px', fontSize: 12, fontWeight: 700, textAlign: 'right', ...TNUM, color: C.text }}>
                {nKg(it.vendutoG)} kg
              </span>
              <span style={{ flex: '0 0 36px', fontSize: 11, color: C.textSoft, textAlign: 'right', ...TNUM }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Panel Sofferenza / Zero venduto ───────────────────────────────────────
function PanelSofferenza({ sofferenza, zeroVenduto }) {
  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Gusti in sofferenza</div>

      {zeroVenduto.length > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 10px', background: '#FEF2F2', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Zero venduto ({zeroVenduto.length})
          </div>
          <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.5 }}>
            {zeroVenduto.slice(0, 8).map(x => x.gusto).join(' · ')}
            {zeroVenduto.length > 8 ? ` · +${zeroVenduto.length - 8}` : ''}
          </div>
        </div>
      )}

      {sofferenza.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textSoft }}>Nessun gusto con residuo persistente. Buon equilibrio produzione/vendita.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sofferenza.slice(0, 6).map(x => (
            <div key={x.gusto} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ flex: 1, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {x.gusto}
              </span>
              <span style={{ color: C.textSoft, ...TNUM }}>
                residuo medio {nKg(x.residuoMedioG)} kg
              </span>
              <span style={{ color: '#92400E', fontWeight: 700, ...TNUM, minWidth: 50, textAlign: 'right' }}>
                {(x.ratio * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 10, lineHeight: 1.4 }}>
        Soglia "sofferenza": residuo medio &gt;= 50% della produzione giornaliera.
      </div>
    </div>
  )
}

// ── Stili condivisi ───────────────────────────────────────────────────────
const btnNav = {
  padding: '8px 14px', minHeight: 40, background: 'transparent',
  border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer',
  fontSize: 12, color: C.textMid, display: 'inline-flex', alignItems: 'center',
}
const panelStyle = {
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
  padding: 18, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.04)',
}
const panelTitle = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: C.textSoft, marginBottom: 14,
}
