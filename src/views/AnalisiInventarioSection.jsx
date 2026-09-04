// AnalisiInventarioSection — Analitica storica per il metodo INVENTARIO
// DIFFERENZIALE (gelaterie/yogurterie/pasta fresca).
//
// Universale per tutte le PMI food italiane: legge dalla tabella
// public.inventario_produzione e calcola metriche indipendenti dal cliente
// specifico (Mara, gelateria X, yogurteria Y...).
//
// Contenuto:
//   1. KPI banner: Prodotto, Venduto stimato, Scarto, Ricavo, Margine (con
//      confronto vs periodo precedente della stessa durata)
//   2. Toggle vista temporale: Giornaliero / Settimanale / Mensile
//   3. Grafico trend produzione+vendite+scarto
//   4. Tabella per gusto ordinabile (Prodotto/Venduto/Scarto/Ricavo/Margine)
//   5. Top 10 gusti per venduto (barra proporzionale)
//   6. Export xlsx
//   7. Deep-link back alla pagina Produzione
//
// Design: la view accetta rows già caricate (fetch lo fa il parent) per
// permettere una singola query condivisa con altre sezioni.

import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Line, LineChart,
} from 'recharts'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T } from '../lib/theme'
import { C, TNUM, KPI, SH, ChartTip, PageHeader } from './_shared'
import Icon from '../components/Icon'
import { loadXLSX } from '../lib/xlsx'
import { calcPerGustoDifferenziale } from '../lib/produzioneStats'
import { calcolaFC, isRicettaValida, getR } from '../lib/foodcost'
import { useRicavoFlat } from '../lib/useRicavoFlat'

/**
 * @param {Object} props
 * @param {Array} props.rows      - Righe inventario_produzione del periodo
 * @param {Array} props.rowsPrev  - Righe periodo precedente (per confronto)
 * @param {string} props.dateFrom
 * @param {string} props.dateTo
 * @param {Object} props.ricettario
 * @param {string} props.orgId
 * @param {string} props.sedeId
 * @param {Array} props.sedi
 * @param {Function} props.onBack - Callback per tornare alla Produzione
 */
export default function AnalisiInventarioSection({
  rows = [], rowsPrev = [], dateFrom, dateTo, confronto = 'periodoPrec',
  ricettario, orgId, sedeId, sedi = [],
  onBack,
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const { ricavoFlatFor } = useRicavoFlat(orgId, ricettario, sedeId)
  const [vista, setVista] = useState('giornaliero')  // giornaliero | settimana | mese
  const [sortBy, setSortBy] = useState('ricavo')
  const [sortDir, setSortDir] = useState('desc')

  // Etichetta del delta % nei KPI: dipende dalla modalita' scelta nel container.
  const deltaLabelText = confronto === 'annoPrec' ? 'vs anno prec.'
                       : confronto === 'nessuno'  ? ''
                       : 'vs periodo prec.'

  // Aggregato per gusto: prod, venduto (residuo differenziale), scarto,
  // ricavo €, food cost €, margine €, margine %.
  const perGusto = useMemo(() => {
    const raw = calcPerGustoDifferenziale(rows)
    const ricByName = {}
    for (const ric of Object.values(ricettario?.ricette || {})) {
      ricByName[String(ric.nome || '').trim().toUpperCase()] = ric
    }
    const arr = []
    for (const [gusto, { prodTot, scartoTot, vendTot }] of Object.entries(raw)) {
      const ric = ricByName[String(gusto).trim().toUpperCase()]
      const ricavoKg = ric ? (Number(ricavoFlatFor(ric)) || 0) : 0
      const fcInfo = ric && isRicettaValida(ric.nome) ? calcolaFC(ric, ricettario) : null
      const fcKg = fcInfo?.foodCost || 0
      const prodKg = prodTot / 1000
      const vendKg = vendTot / 1000
      const scartoKg = scartoTot / 1000
      const ricavo = vendKg * ricavoKg
      const fc = prodKg * fcKg
      const margine = ricavo - fc
      const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0
      arr.push({
        gusto, prodKg, vendKg, scartoKg,
        ricavoKg, fcKg, ricavo, fc, margine, margPct,
        haMapping: ricavoKg > 0 && fcKg > 0,
      })
    }
    return arr
  }, [rows, ricettario, ricavoFlatFor])

  const totali = useMemo(() => {
    let prod = 0, vend = 0, scarto = 0, ricavo = 0, fc = 0
    for (const r of perGusto) {
      prod += r.prodKg; vend += r.vendKg; scarto += r.scartoKg
      ricavo += r.ricavo; fc += r.fc
    }
    return { prod, vend, scarto, ricavo, fc, margine: ricavo - fc, margPct: ricavo > 0 ? ((ricavo - fc) / ricavo * 100) : 0 }
  }, [perGusto])

  const totaliPrev = useMemo(() => {
    if (!Array.isArray(rowsPrev) || rowsPrev.length === 0) return null
    const raw = calcPerGustoDifferenziale(rowsPrev)
    const ricByName = {}
    for (const ric of Object.values(ricettario?.ricette || {})) {
      ricByName[String(ric.nome || '').trim().toUpperCase()] = ric
    }
    let prod = 0, vend = 0, scarto = 0, ricavo = 0, fc = 0
    for (const [gusto, { prodTot, scartoTot, vendTot }] of Object.entries(raw)) {
      prod += prodTot / 1000; vend += vendTot / 1000; scarto += scartoTot / 1000
      const ric = ricByName[String(gusto).trim().toUpperCase()]
      const ricavoKg = ric ? (Number(ricavoFlatFor(ric)) || 0) : 0
      const fcInfo = ric && isRicettaValida(ric.nome) ? calcolaFC(ric, ricettario) : null
      const fcKg = fcInfo?.foodCost || 0
      ricavo += (vendTot / 1000) * ricavoKg
      fc += (prodTot / 1000) * fcKg
    }
    return { prod, vend, scarto, ricavo, fc, margine: ricavo - fc, margPct: ricavo > 0 ? ((ricavo - fc) / ricavo * 100) : 0 }
  }, [rowsPrev, ricettario, ricavoFlatFor])

  // Serie temporale per il grafico (aggregazione per giorno/settimana/mese)
  const trend = useMemo(() => {
    if (rows.length === 0) return []
    const MESI_ABBR = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
    const key = (dataStr) => {
      if (vista === 'giornaliero') return dataStr
      if (vista === 'mese') return dataStr.slice(0, 7)
      // Settimana ISO
      const d = new Date(dataStr + 'T12:00:00')
      const jan4 = new Date(d.getFullYear(), 0, 4)
      const dayJan4 = jan4.getDay() || 7
      const week1Mon = new Date(jan4.getFullYear(), 0, 4 - (dayJan4 - 1))
      const diffDays = Math.round((d - week1Mon) / 86400000)
      const week = Math.floor(diffDays / 7) + 1
      return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    // Label leggibile per il tooltip e l'asse: "15/07", "Sett 30 '26", "Lug '26"
    const labelOf = (k) => {
      if (vista === 'giornaliero') {
        const [y, m, d] = k.split('-')
        return `${d}/${m}`
      }
      if (vista === 'mese') {
        const [y, m] = k.split('-')
        return `${MESI_ABBR[parseInt(m, 10) - 1]} '${y.slice(2)}`
      }
      const [y, w] = k.split('-W')
      return `Sett ${w} '${y.slice(2)}`
    }
    const bucket = {}
    for (const r of rows) {
      const k = key(r.data)
      if (!bucket[k]) bucket[k] = { key: k, label: labelOf(k), prod: 0, scarto: 0 }
      bucket[k].prod += (Number(r.produzione_g) || 0) / 1000
      bucket[k].scarto += (Number(r.scarto_g) || 0) / 1000
    }
    // Approssimazione venduto: prod - scarto (semplificato per il chart)
    return Object.values(bucket)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(v => ({
        ...v,
        vend: Math.max(0, v.prod - v.scarto),
      }))
  }, [rows, vista])

  const sorted = useMemo(() => {
    const arr = [...perGusto]
    arr.sort((a, b) => {
      const va = a[sortBy]; const vb = b[sortBy]
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return arr
  }, [perGusto, sortBy, sortDir])

  const top10 = useMemo(() => {
    return [...perGusto]
      .filter(x => x.vendKg > 0)
      .sort((a, b) => b.vendKg - a.vendKg)
      .slice(0, 10)
  }, [perGusto])
  const top10Max = Math.max(1, ...top10.map(x => x.vendKg))

  const nMappati = perGusto.filter(x => x.haMapping).length
  const nNonMappati = perGusto.length - nMappati

  const eur = (n) => (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
  const kg = (n) => (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 })
  const pct = (n) => (Number(n) || 0).toFixed(1) + '%'
  const deltaPct = (cur, prev) => {
    if (prev == null || prev === 0) return null
    return ((cur - prev) / prev) * 100
  }

  function toggleSort(col) {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  async function esportaXlsx() {
    try {
      const XLSX = await loadXLSX()
      const header = ['Gusto', 'Prodotto kg', 'Venduto kg', 'Scarto kg', 'Ricavo/kg €', 'Ricavo €', 'Food cost €', 'Margine €', 'Margine %']
      const body = sorted.map(r => [
        r.gusto,
        Number(r.prodKg.toFixed(2)),
        Number(r.vendKg.toFixed(2)),
        Number(r.scartoKg.toFixed(2)),
        Number(r.ricavoKg.toFixed(2)),
        Number(r.ricavo.toFixed(0)),
        Number(r.fc.toFixed(0)),
        Number(r.margine.toFixed(0)),
        Number(r.margPct.toFixed(1)),
      ])
      const total = [
        'Totale',
        Number(totali.prod.toFixed(2)),
        Number(totali.vend.toFixed(2)),
        Number(totali.scarto.toFixed(2)),
        '',
        Number(totali.ricavo.toFixed(0)),
        Number(totali.fc.toFixed(0)),
        Number(totali.margine.toFixed(0)),
        Number(totali.margPct.toFixed(1)),
      ]
      const ws = XLSX.utils.aoa_to_sheet([header, ...body, total])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Analisi inventario')
      const range = `${dateFrom || 'start'}_${dateTo || 'end'}`.replace(/[^0-9-]/g, '')
      XLSX.writeFile(wb, `analisi-inventario-${range}.xlsx`)
    } catch (e) {
      console.error('Export xlsx fallito:', e)
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 32, textAlign: 'center', color: T.textSoft, fontSize: 13,
        marginBottom: 20,
      }}>
        Nessun dato di produzione a inventario nel periodo selezionato.
        {onBack && (
          <div style={{ marginTop: 12 }}>
            <button onClick={onBack}
              style={{
                padding: '10px 18px', minHeight: 42, background: T.brand,
                color: '#FFF', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
              Vai alla Produzione
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <SH sub="Analisi completa della produzione con metodo inventario differenziale: quanto hai prodotto, venduto, scartato + margini stimati dal listino formati.">
          Analisi produzione inventario
        </SH>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onBack && (
            <button onClick={onBack}
              style={{
                padding: '8px 14px', minHeight: 36, background: '#FFF',
                color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <Icon name="chevD" size={12} /> Torna alla Produzione
            </button>
          )}
          <button onClick={esportaXlsx}
            style={{
              padding: '8px 14px', minHeight: 36, background: '#FFF',
              color: T.brand, border: `1px solid ${T.brand}55`, borderRadius: 8,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <Icon name="download" size={13} /> Esporta Excel
          </button>
        </div>
      </div>

      {/* 4 KPI con confronto periodo precedente */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, marginBottom: 16 }}>
        <KpiCell label="Prodotto" value={`${kg(totali.prod)} kg`} delta={deltaPct(totali.prod, totaliPrev?.prod)} deltaLabel={deltaLabelText} highlight={false} color={C.text}/>
        <KpiCell label="Venduto stimato" value={`${kg(totali.vend)} kg`} delta={deltaPct(totali.vend, totaliPrev?.vend)} deltaLabel={deltaLabelText} highlight color={T.brand}/>
        <KpiCell label="Ricavo stimato" value={eur(totali.ricavo)} delta={deltaPct(totali.ricavo, totaliPrev?.ricavo)} deltaLabel={deltaLabelText} highlight color="#166534"/>
        <KpiCell label={`Margine (${pct(totali.margPct)})`} value={eur(totali.margine)} delta={deltaPct(totali.margine, totaliPrev?.margine)} deltaLabel={deltaLabelText} highlight color={totali.margine >= 0 ? '#166534' : '#B91C1C'}/>
      </div>

      {nNonMappati > 0 && (
        <div style={{
          background: '#FEF9EB', border: '1px solid #FCD34D', borderRadius: 10,
          padding: 10, marginBottom: 14, fontSize: 12, color: '#78350F', lineHeight: 1.5,
        }}>
          <b>Nota:</b> {nNonMappati} gusti su {perGusto.length} non hanno ricetta collegata o listino formato vendita — ricavo e food cost sono a zero per loro. Sistema le ricette e i formati per un P&L completo.
        </div>
      )}

      {/* Trend chart */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Andamento produzione ({vista})
          </div>
          <div style={{ display: 'inline-flex', gap: 4, background: '#F8FAFC', padding: 3, borderRadius: 8 }}>
            {['giornaliero', 'settimana', 'mese'].map(v => (
              <button key={v} onClick={() => setVista(v)}
                style={{
                  padding: '6px 12px', minHeight: 34,
                  background: vista === v ? '#FFF' : 'transparent',
                  color: vista === v ? T.brand : T.textMid,
                  border: vista === v ? `1px solid ${T.border}` : '1px solid transparent',
                  borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{v}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EF"/>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd"/>
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString('it-IT')}/>
            <Tooltip content={<ChartTip/>}/>
            <Legend wrapperStyle={{ fontSize: 12 }}/>
            <Bar dataKey="prod" name="Prodotto kg" fill={T.brand} radius={[4, 4, 0, 0]}/>
            <Bar dataKey="vend" name="Venduto stimato kg" fill="#F59E0B" radius={[4, 4, 0, 0]}/>
            <Bar dataKey="scarto" name="Scarto kg" fill="#B91C1C" radius={[4, 4, 0, 0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 10 gusti per venduto */}
      {top10.length > 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Top 10 gusti per venduto stimato
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top10.map((r, i) => (
              <div key={r.gusto} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, fontSize: 11, color: T.textSoft, fontWeight: 700, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ minWidth: isMobile ? 90 : 160, fontSize: 12.5, color: T.text, fontWeight: 700 }}>{r.gusto}</div>
                <div style={{ flex: 1, height: 12, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${(r.vendKg / top10Max) * 100}%`, height: '100%', background: T.brand, borderRadius: 6 }}/>
                </div>
                <div style={{ minWidth: 90, textAlign: 'right', fontSize: 12.5, color: T.text, fontWeight: 700, ...TNUM }}>{kg(r.vendKg)} kg</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabella per gusto ordinabile */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Dettaglio per gusto (clicca sulle intestazioni per ordinare)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <ThSort label="Gusto" col="gusto" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} left/>
                <ThSort label="Prod. kg" col="prodKg" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Venduto kg" col="vendKg" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Scarto kg" col="scartoKg" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Ricavo €" col="ricavo" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} bg="#FEF9EB"/>
                <ThSort label="Food cost" col="fc" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Margine €" col="margine" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} bg="#F0FDF4"/>
                <ThSort label="Marg. %" col="margPct" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.gusto} style={{ borderTop: `1px solid #F1F5F9` }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: C.text }}>
                    {r.gusto}
                    {!r.haMapping && <span title="Ricetta o formato non collegato" style={{ marginLeft: 6, color: '#B45309', fontSize: 10 }}>⚠</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM }}>{kg(r.prodKg)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM }}>{kg(r.vendKg)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: r.scartoKg > 0 ? '#B91C1C' : C.textSoft }}>{r.scartoKg > 0 ? kg(r.scartoKg) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, fontWeight: 700, background: '#FEF9EB' }}>{r.ricavo > 0 ? eur(r.ricavo) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: '#B91C1C' }}>{r.fc > 0 ? eur(r.fc) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: r.margine >= 0 ? '#166534' : '#B91C1C', background: '#F0FDF4' }}>{r.ricavo > 0 || r.fc > 0 ? eur(r.margine) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: r.margPct >= 40 ? '#166534' : r.margPct >= 20 ? '#B45309' : '#B91C1C' }}>{r.ricavo > 0 ? pct(r.margPct) : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F8FAFC', borderTop: `2px solid ${T.border}` }}>
                <td style={{ padding: '10px 12px', fontWeight: 800 }}>Totale</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800 }}>{kg(totali.prod)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800 }}>{kg(totali.vend)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: totali.scarto > 0 ? '#B91C1C' : C.textSoft }}>{totali.scarto > 0 ? kg(totali.scarto) : '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, background: '#FEF9EB' }}>{eur(totali.ricavo)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: '#B91C1C' }}>{eur(totali.fc)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: totali.margine >= 0 ? '#166534' : '#B91C1C', background: '#F0FDF4' }}>{eur(totali.margine)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800 }}>{pct(totali.margPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCell({ label, value, delta, deltaLabel = 'vs periodo prec.', highlight, color }) {
  const deltaColor = delta == null ? T.textSoft : delta > 0 ? '#166534' : delta < 0 ? '#B91C1C' : T.textSoft
  const deltaSymbol = delta == null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '='
  return (
    <div style={{
      background: highlight ? '#FEF9EB' : '#F8FAFC',
      border: `1px solid ${T.border}`,
      borderRadius: 10, padding: 14, minHeight: 90,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, ...TNUM, lineHeight: 1.1 }}>{value}</div>
      {delta != null && deltaLabel && (
        <div style={{ fontSize: 11, color: deltaColor, fontWeight: 700, marginTop: 4, ...TNUM }}>
          {deltaSymbol} {Math.abs(delta).toFixed(1)}% {deltaLabel}
        </div>
      )}
    </div>
  )
}

function ThSort({ label, col, sortBy, sortDir, onSort, left, bg }) {
  const active = sortBy === col
  return (
    <th onClick={() => onSort(col)}
      title={`Ordina per ${label}`}
      style={{
        padding: '10px 12px',
        textAlign: left ? 'left' : 'right',
        fontSize: 11, fontWeight: 700, color: active ? T.brand : T.textSoft,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        cursor: 'pointer', userSelect: 'none',
        background: bg || '#F8FAFC',
        position: left ? 'sticky' : undefined, left: left ? 0 : undefined,
        minWidth: left ? 160 : 90,
      }}>
      {label}
      {active && <span style={{ marginLeft: 4, fontSize: 9 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}
