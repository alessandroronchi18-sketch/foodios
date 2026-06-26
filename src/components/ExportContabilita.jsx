import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { sloadAllSedi } from '../lib/storage'
import { loadXLSX } from '../lib/xlsx' // loader unico multi-CDN, no SRI
import Icon from './Icon'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

const lbl  = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }

const SK_CHIUS = 'pasticceria-chiusure-v1'
const IVA_DEFAULT_PCT = 10 // alimenti d'asporto: 10% - modificabile in UI

function isoMonthRange(yearMonth) {
  // yearMonth = "YYYY-MM"
  const [y, m] = yearMonth.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function eurNum(n) { return Number(n || 0).toFixed(2).replace('.', ',') }
function eurNumDot(n) { return Number(n || 0).toFixed(2) }

async function caricaCorrispettiviMese(orgId, yearMonth) {
  const { from, to } = isoMonthRange(yearMonth)
  const tutteSedi = await sloadAllSedi(SK_CHIUS, orgId)
  const righe = []
  for (const [sedeId, arr] of Object.entries(tutteSedi || {})) {
    if (!Array.isArray(arr)) continue
    for (const c of arr) {
      if (!c?.data) continue
      if (c.data < from || c.data > to) continue
      const totV = Number(c.kpi?.totV || 0)
      righe.push({ sede_id: sedeId === 'shared' ? null : sedeId, data: c.data, totale: totV })
    }
  }
  righe.sort((a, b) => a.data.localeCompare(b.data))
  return righe
}

async function caricaFatturePassiveMese(orgId, yearMonth) {
  const { from, to } = isoMonthRange(yearMonth)
  const { data, error } = await supabase
    .from('fatture')
    .select('id, sede_id, data_fattura, fornitore, numero_rif, imponibile, iva, totale, stato')
    .eq('organization_id', orgId)
    .gte('data_fattura', from)
    .lte('data_fattura', to)
    .order('data_fattura', { ascending: true })
  if (error) throw error
  return data || []
}

function exportFattureInCloudCSV(corrispettivi, fatturePassive, ivaPct, sediMap, yearMonth) {
  // Formato CSV neutro consumabile da Fatture in Cloud (Import dati esterni).
  // Foglio unico con due sezioni: corrispettivi e fatture passive.
  const rows = []
  rows.push(['Tipo', 'Data', 'Riferimento', 'Sede', 'Fornitore/Cliente', 'Imponibile', 'IVA %', 'IVA', 'Totale', 'Stato'])

  for (const c of corrispettivi) {
    const aliquota = ivaPct / 100
    const totale = Number(c.totale || 0)
    const imponibile = totale / (1 + aliquota)
    const iva = totale - imponibile
    rows.push([
      'CORRISPETTIVO',
      c.data,
      `CORR-${c.data}`,
      sediMap[c.sede_id] || '',
      'Corrispettivi giornalieri',
      eurNumDot(imponibile),
      ivaPct,
      eurNumDot(iva),
      eurNumDot(totale),
      'INCASSATO',
    ])
  }

  for (const f of fatturePassive) {
    const totale = Number(f.totale || 0)
    const imponibile = Number(f.imponibile || 0) || (totale ? totale / (1 + ivaPct / 100) : 0)
    const iva = Number(f.iva || 0) || (totale - imponibile)
    rows.push([
      'FATTURA_PASSIVA',
      f.data_fattura,
      f.numero_rif || '',
      sediMap[f.sede_id] || '',
      f.fornitore || '',
      eurNumDot(imponibile),
      ivaPct,
      eurNumDot(iva),
      eurNumDot(totale),
      (f.stato || '').toUpperCase(),
    ])
  }

  const csv = rows.map(r => r.map(csvEscape).join(';')).join('\n')
  // BOM per Excel/Fatture in Cloud che si aspettano UTF-8 BOM
  downloadBlob('﻿' + csv, `foodos_fatture-in-cloud_${yearMonth}.csv`, 'text/csv;charset=utf-8')
}

function exportTeamSystemXML(corrispettivi, fatturePassive, ivaPct, sediMap, yearMonth, orgNome) {
  // XML registro corrispettivi semplificato compatibile con import TeamSystem custom.
  // Non è FatturaPA - è un registro corrispettivi formato lettura.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c]))
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<RegistroIVA periodo="${yearMonth}" azienda="${esc(orgNome || '')}">`)

  lines.push('  <Corrispettivi>')
  for (const c of corrispettivi) {
    const aliquota = ivaPct / 100
    const totale = Number(c.totale || 0)
    const imponibile = totale / (1 + aliquota)
    const iva = totale - imponibile
    lines.push('    <Movimento>')
    lines.push(`      <Data>${esc(c.data)}</Data>`)
    lines.push(`      <Sede>${esc(sediMap[c.sede_id] || '')}</Sede>`)
    lines.push(`      <Imponibile>${eurNumDot(imponibile)}</Imponibile>`)
    lines.push(`      <Aliquota>${ivaPct}</Aliquota>`)
    lines.push(`      <Imposta>${eurNumDot(iva)}</Imposta>`)
    lines.push(`      <Totale>${eurNumDot(totale)}</Totale>`)
    lines.push('    </Movimento>')
  }
  lines.push('  </Corrispettivi>')

  lines.push('  <FatturePassive>')
  for (const f of fatturePassive) {
    const totale = Number(f.totale || 0)
    const imponibile = Number(f.imponibile || 0) || (totale ? totale / (1 + ivaPct / 100) : 0)
    const iva = Number(f.iva || 0) || (totale - imponibile)
    lines.push('    <Fattura>')
    lines.push(`      <Data>${esc(f.data_fattura || '')}</Data>`)
    lines.push(`      <Numero>${esc(f.numero_rif || '')}</Numero>`)
    lines.push(`      <Fornitore>${esc(f.fornitore || '')}</Fornitore>`)
    lines.push(`      <Sede>${esc(sediMap[f.sede_id] || '')}</Sede>`)
    lines.push(`      <Imponibile>${eurNumDot(imponibile)}</Imponibile>`)
    lines.push(`      <Imposta>${eurNumDot(iva)}</Imposta>`)
    lines.push(`      <Totale>${eurNumDot(totale)}</Totale>`)
    lines.push(`      <Stato>${esc(f.stato || '')}</Stato>`)
    lines.push('    </Fattura>')
  }
  lines.push('  </FatturePassive>')
  lines.push('</RegistroIVA>')

  downloadBlob(lines.join('\n'), `foodios_teamsystem_${yearMonth}.xml`, 'application/xml')
}

async function exportCommercialistaXLSX(corrispettivi, fatturePassive, ivaPct, sediMap, yearMonth, orgNome) {
  const XLSX = await loadXLSX()
  const wb = XLSX.utils.book_new()

  // Foglio 1: Riepilogo
  const aliquota = ivaPct / 100
  let totC = 0
  for (const c of corrispettivi) totC += Number(c.totale || 0)
  const impC = totC / (1 + aliquota)
  const ivaC = totC - impC
  let totFP = 0, impFP = 0, ivaFP = 0
  for (const f of fatturePassive) {
    totFP += Number(f.totale || 0)
    impFP += Number(f.imponibile || 0) || (Number(f.totale || 0) / (1 + aliquota))
    ivaFP += Number(f.iva || 0) || (Number(f.totale || 0) - (Number(f.totale || 0) / (1 + aliquota)))
  }
  const riepilogoRows = [
    [`Azienda: ${orgNome || ''}`],
    [`Periodo: ${yearMonth}`],
    [`Aliquota IVA applicata ai corrispettivi: ${ivaPct}%`],
    [],
    ['', 'Imponibile', 'IVA', 'Totale'],
    ['Corrispettivi (vendite)', impC, ivaC, totC],
    ['Fatture passive (acquisti)', impFP, ivaFP, totFP],
    ['Saldo IVA (a debito)', '', ivaC - ivaFP, ''],
  ]
  const wsR = XLSX.utils.aoa_to_sheet(riepilogoRows)
  wsR['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsR, 'Riepilogo')

  // Foglio 2: Corrispettivi
  const corrHead = [['Data', 'Sede', 'Imponibile', 'Aliquota IVA', 'Imposta', 'Totale']]
  const corrRows = corrispettivi.map(c => {
    const totale = Number(c.totale || 0)
    const imponibile = totale / (1 + aliquota)
    return [c.data, sediMap[c.sede_id] || '', imponibile, ivaPct, totale - imponibile, totale]
  })
  const wsC = XLSX.utils.aoa_to_sheet([...corrHead, ...corrRows])
  wsC['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsC, 'Corrispettivi')

  // Foglio 3: Fatture passive
  const fpHead = [['Data', 'Numero', 'Fornitore', 'Sede', 'Imponibile', 'IVA', 'Totale', 'Stato']]
  const fpRows = fatturePassive.map(f => {
    const totale = Number(f.totale || 0)
    const imponibile = Number(f.imponibile || 0) || (totale / (1 + aliquota))
    const iva = Number(f.iva || 0) || (totale - imponibile)
    return [f.data_fattura, f.numero_rif || '', f.fornitore || '', sediMap[f.sede_id] || '', imponibile, iva, totale, (f.stato || '').toUpperCase()]
  })
  const wsF = XLSX.utils.aoa_to_sheet([...fpHead, ...fpRows])
  wsF['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsF, 'Fatture passive')

  XLSX.writeFile(wb, `foodos_commercialista_${yearMonth}.xlsx`)
}

export default function ExportContabilita({ orgId, sedi = [], nomeAttivita, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const card = { background: '#FFF', borderRadius: 12, padding: isMobile ? '18px 16px' : isTablet ? '20px 22px' : '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 }
  const inp  = { width: '100%', padding: isMobile || isTablet ? '12px 14px' : '10px 14px', minHeight: isMobile || isTablet ? 44 : 40, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: isMobile || isTablet ? 16 : 13, color: '#0F172A', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [yearMonth, setYearMonth] = useState(defaultMonth)
  const [ivaPct, setIvaPct] = useState(IVA_DEFAULT_PCT)
  const [busy, setBusy] = useState(null) // 'fic' | 'ts' | 'xlsx' | null

  const sediMap = Object.fromEntries((sedi || []).map(s => [s.id, s.nome]))

  async function fetchData() {
    const [corr, fp] = await Promise.all([
      caricaCorrispettiviMese(orgId, yearMonth),
      caricaFatturePassiveMese(orgId, yearMonth),
    ])
    return { corr, fp }
  }

  async function run(tipo) {
    if (!orgId) return
    setBusy(tipo)
    try {
      const { corr, fp } = await fetchData()
      if (corr.length === 0 && fp.length === 0) {
        notify?.('Nessun dato per il periodo selezionato', false)
        return
      }
      if (tipo === 'fic') exportFattureInCloudCSV(corr, fp, ivaPct, sediMap, yearMonth)
      else if (tipo === 'ts') exportTeamSystemXML(corr, fp, ivaPct, sediMap, yearMonth, nomeAttivita)
      else if (tipo === 'xlsx') await exportCommercialistaXLSX(corr, fp, ivaPct, sediMap, yearMonth, nomeAttivita)
      notify?.('✓ Export pronto')
    } catch (e) {
      console.error('Export contabilità fallito:', e)
      notify?.('' + (e.message || 'Errore export'), false)
    } finally {
      setBusy(null)
    }
  }

  const btn = (active, color) => ({
    padding: isMobile || isTablet ? '14px 18px' : '12px 18px',
    minHeight: isMobile || isTablet ? 44 : 40,
    background: active ? '#94A3B8' : color,
    color: '#FFF',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: active ? 'wait' : 'pointer',
    width: '100%',
    textAlign: 'left',
  })

  return (
    <div>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="barChart" size={16} /> Export contabilità</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 1.6 }}>
          Estrae corrispettivi giornalieri (chiusure cassa) e fatture passive del periodo selezionato,
          con calcolo IVA basato sull'aliquota indicata. Verifica i totali con il tuo commercialista prima dell'invio fiscale.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 20, alignItems: 'end' }}>
          <div>
            <label style={lbl}>Mese</label>
            <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Aliquota IVA (%)</label>
            <input type="number" min="0" max="22" step="1" value={ivaPct}
              onChange={e => setIvaPct(Math.max(0, Math.min(22, Number(e.target.value) || 0)))} style={inp} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => run('fic')} disabled={busy != null} style={{ ...btn(busy === 'fic', '#0F766E'), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy === 'fic' ? 'Generazione…' : <><Icon name="fileText" size={15} /> Esporta per Fatture in Cloud (CSV)</>}
          </button>
          <button onClick={() => run('ts')} disabled={busy != null} style={{ ...btn(busy === 'ts', '#1E40AF'), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy === 'ts' ? 'Generazione…' : <><Icon name="bank" size={15} /> Esporta per TeamSystem (XML)</>}
          </button>
          <button onClick={() => run('xlsx')} disabled={busy != null} style={{ ...btn(busy === 'xlsx', '#6E0E1A'), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy === 'xlsx' ? 'Generazione…' : <><Icon name="book" size={15} /> Esporta per commercialista (Excel)</>}
          </button>
        </div>
      </div>
    </div>
  )
}
