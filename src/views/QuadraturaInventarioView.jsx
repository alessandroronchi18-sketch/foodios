// Quadratura inventario vs cassa - Dashboard del proprietario.
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
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { SK_FORMATI } from '../lib/storageKeys'
import Icon from '../components/Icon'
import ExportPdfButton from '../components/ExportPdfButton'
import { C, PageHeader, TNUM, fmt0 } from './_shared'
import {
  caricaSettimana, calcolaVendutoSettimana, lunediDellaSettimana,
  euroKgMedioFormati, kpiQuadraturaSettimana, classificaGusti, variazione,
} from '../lib/inventarioProduzione'

// ── Helpers data/numeri (IT) ──────────────────────────────────────────────
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
// Numero intero con separatore migliaia IT (1.234)
function n0(v) { return Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 }) }
// kg con 1 decimale e separatore IT (1.234,5)
function nKg(g) {
  return (Number(g) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function pct(v) {
  if (v == null) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  // Max 1 decimale (regola: percentuali con max 1 decimale)
  return `${n > 0 ? '+' : ''}${n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function csvEscape(s) {
  const v = String(s ?? '')
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

function esportaCsvSettimana({ lunediIso, kpi, righe, sedeAttiva, isAllSedi, perSede }) {
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

// Drift signed con € DOPO la cifra (es. "+ 1.234 €")
function fmtDriftEur(v) {
  if (v == null || !Number.isFinite(Number(v))) return '-'
  const n = Math.round(Number(v))
  const sign = n > 0 ? '+ ' : (n < 0 ? '- ' : '')
  const abs = Math.abs(n).toLocaleString('it-IT')
  return `${sign}${abs} €`
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

  // Touch target minimo: ≥40 mobile, ≥44 tablet (regola permanente CLAUDE.md)
  const tapMin = isTablet ? 44 : 40

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
  // arriva da `chiusure` (già filtrata dal Dashboard), l'inventario serve
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
  // già gestito dal blocco perSede.
  if (!sedeId && !isAllSedi) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Seleziona una sede</div>
  }

  // Tone del drift: |drift%| < 5% verde, < 15% giallo, oltre rosso.
  const driftTone = (p) => {
    if (p == null) return { bg: C.bgSubtle, border: C.border, fg: C.textMid, accent: C.textSoft, label: 'n/d' }
    const a = Math.abs(p)
    if (a < 5) return { bg: '#ECFDF5', border: '#A7F3D0', fg: '#065F46', accent: '#10B981', label: 'in target' }
    if (a < 15) return { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E', accent: '#F59E0B', label: 'da osservare' }
    return { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B', accent: '#DC2626', label: 'attenzione' }
  }
  const tone = driftTone(kpi.driftPct)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <PageHeader subtitle="Quadratura settimanale: l'inventario dice quanto e' uscito (kg), la cassa quanto e' entrato. Il drift indica dove guardare." />

      {/* ─ Toolbar settimana ─ Su mobile: layout a colonna piena per evitare accavallamenti */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, marginBottom: 20,
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: isMobile ? 12 : '14px 16px',
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: 'wrap', width: '100%', boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
      }}>
        {/* Etichetta settimana - sempre in alto, centrale */}
        <div style={{
          flex: isMobile ? 'none' : 1,
          width: isMobile ? '100%' : 'auto',
          textAlign: isMobile ? 'center' : 'left',
          minWidth: 0,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: C.textSoft, marginBottom: 2,
          }}>Settimana</div>
          <div style={{
            fontSize: isMobile ? 15 : 16, fontWeight: 700, color: C.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
          }}>{fmtRange(lunediIso)}</div>
        </div>

        {/* Navigatore prec / oggi / succ */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          width: isMobile ? '100%' : 'auto',
        }}>
          <button
            onClick={settimanaPrec}
            aria-label="Settimana precedente"
            title="Settimana precedente"
            style={{ ...btnNav(tapMin), flex: isMobile ? 1 : 'none', padding: '0 14px' }}
          >
            <Icon name="chevR" size={16} style={{ transform: 'rotate(180deg)' }} />
            {!isMobile && <span style={{ marginLeft: 6 }}>Prec.</span>}
          </button>
          <button
            onClick={oggi}
            aria-label="Settimana corrente"
            style={{
              ...btnNav(tapMin),
              flex: isMobile ? 1 : 'none',
              padding: '0 16px',
              fontWeight: 600,
            }}
          >
            Oggi
          </button>
          <button
            onClick={settimanaSucc}
            aria-label="Settimana successiva"
            title="Settimana successiva"
            style={{ ...btnNav(tapMin), flex: isMobile ? 1 : 'none', padding: '0 14px' }}
          >
            {!isMobile && <span style={{ marginRight: 6 }}>Succ.</span>}
            <Icon name="chevR" size={16} />
          </button>
        </div>

        {/* Export - su mobile va a riga piena */}
        <div style={{
          display: 'flex', gap: 8,
          width: isMobile ? '100%' : 'auto',
          marginLeft: isMobile ? 0 : 'auto',
        }}>
          <button
            onClick={() => esportaCsvSettimana({ lunediIso, kpi, righe, sedeAttiva, isAllSedi, perSede })}
            aria-label="Esporta settimana in CSV"
            title="Esporta la settimana in CSV per commercialista o contabilita"
            style={{
              ...btnNav(tapMin),
              background: C.text, color: C.white, borderColor: C.text,
              fontWeight: 600,
              flex: isMobile ? 1 : 'none',
              padding: '0 14px',
            }}
          >
            <Icon name="download" size={14} color={C.white} />
            <span style={{ marginLeft: 6 }}>CSV</span>
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
                { label: 'Cassa effettiva', value: fmt0(kpi.cassaEffettiva ?? 0) },
                { label: 'Atteso', value: fmt0(kpi.ricavoAtteso ?? 0), sub: `${n0(euroKg)} €/kg medio` },
                { label: 'Drift', value: kpi.driftEur != null ? `${fmtDriftEur(kpi.driftEur)} (${pct(kpi.driftPct)})` : '-' },
              ],
              sections: [
                ...(Array.isArray(righe) && righe.length > 0 ? [{
                  title: 'Dettaglio gusti',
                  table: {
                    columns: ['Gusto', 'Iniziale (g)', 'Prodotto (g)', 'Finale (g)', 'Scarto (g)', 'Venduto (g)'],
                    alignments: ['left', 'right', 'right', 'right', 'right', 'right'],
                    rows: righe.map(r => [
                      r.gusto || r.nome || '',
                      n0(r.inizialeG ?? r.iniziale_g ?? 0),
                      n0(r.prodottoG ?? r.prodotto_g ?? 0),
                      n0(r.finaleG ?? r.finale_g ?? 0),
                      n0(r.scartoG ?? r.scarto_g ?? 0),
                      n0(r.vendutoG ?? r.venduto_g ?? 0),
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
                      n0(p.kpi.cassaEffettiva ?? 0),
                      n0(p.kpi.ricavoAtteso ?? 0),
                      n0(p.kpi.driftEur ?? 0),
                      pct(p.kpi.driftPct),
                    ]),
                  },
                }] : []),
              ],
            })}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : !euroKg ? (
        <div style={{
          padding: isMobile ? 16 : '20px 24px',
          background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: 14, marginBottom: 20, fontSize: 13, color: '#92400E', lineHeight: 1.5,
          display: 'flex', alignItems: isMobile ? 'stretch' : 'center',
          gap: 14, flexDirection: isMobile ? 'column' : 'row',
          width: '100%', boxSizing: 'border-box',
        }}>
          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="warning" size={18} color="#92400E" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Imposta i formati di vendita</div>
              <div style={{ fontSize: 12.5, color: '#78350F' }}>
                Servono per calcolare il €/kg medio e abilitare la quadratura con la cassa.
              </div>
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('formati-vendita')}
              aria-label="Vai a formati di vendita"
              style={{
                background: '#92400E', color: '#FFF', border: 'none',
                borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                whiteSpace: 'nowrap', minHeight: tapMin,
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <Icon name="euro" size={14} color="#FFF" /> Vai ai formati
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ─ KPI hero quadratura ─ */}
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18,
            padding: isMobile ? 16 : 24, marginBottom: 20,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 30px rgba(15,23,42,0.05)',
            width: '100%', boxSizing: 'border-box',
          }}>
            <div style={{
              display: 'grid', gap: isMobile ? 10 : 14,
              gridTemplateColumns: isMobile ? '1fr' : (isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'),
            }}>
              <Tile
                icon="package"
                label={kpi.b2bKg > 0 ? 'Venduto retail' : 'Venduto inventario'}
                value={`${nKg((kpi.retailKg ?? kpi.totVendutoKg) * 1000)} kg`}
                sub={kpi.b2bKg > 0 ? `${nKg(kpi.totVendutoG)} kg totali` : 'da inventario'}
                tendVal={variazione(kpi.retailKg ?? kpi.totVendutoKg, kpiPrev.retailKg ?? kpiPrev.totVendutoKg)}
              />
              <Tile
                icon="card"
                label="Cassa effettiva"
                value={fmt0(kpi.cassaEffettiva)}
                sub="incassato in cassa"
                tendVal={variazione(kpi.cassaEffettiva, kpiPrev.cassaEffettiva)}
              />
              <Tile
                icon="barChart"
                label="Atteso"
                value={fmt0(kpi.ricavoAtteso || 0)}
                sub={`${n0(euroKg)} €/kg medio`}
                muted
              />
              <Tile
                icon="checkCircle"
                label="Drift vs cassa"
                value={kpi.driftEur != null ? fmtDriftEur(kpi.driftEur) : '-'}
                sub={kpi.driftPct != null ? `${pct(kpi.driftPct)} dello scostamento` : 'nessun dato'}
                color={tone.fg}
                bg={tone.bg}
                borderColor={tone.border}
                accent={tone.accent}
                badge={tone.label}
              />
            </div>

            {kpi.b2bKg > 0 && (
              <div style={{
                marginTop: 14, padding: isMobile ? 12 : '12px 16px',
                background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
                fontSize: 12.5, color: '#075985',
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between', gap: 12,
                flexDirection: isMobile ? 'column' : 'row',
                width: '100%', boxSizing: 'border-box',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <Icon name="receipt" size={14} color="#075985" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>Vendite B2B</strong> separate dalla cassa retail:
                    {' '}{nKg(kpi.b2bKg * 1000)} kg fatturati per {fmt0(kpi.ricaviB2b)}
                  </span>
                </span>
                <span style={{ fontSize: 11.5, color: '#0C4A6E', whiteSpace: 'nowrap' }}>
                  sottratti dal retail per non gonfiare il drift
                </span>
              </div>
            )}

            {kpi.driftPct != null && Math.abs(kpi.driftPct) >= 15 && (
              <DiagnosiDrift driftEur={kpi.driftEur} driftPct={kpi.driftPct} isMobile={isMobile} />
            )}
          </div>

          {/* ─ Sparkline trend 4 settimane ─ */}
          {trendData.length > 0 && (
            <div style={{ ...panelStyle, marginBottom: 16, padding: isMobile ? 16 : 18 }}>
              <div style={panelTitle}>Trend ultime 4 settimane</div>
              <SparklineTrend data={trendData} />
            </div>
          )}

          {/* ─ Drill-down per sede (solo se isAllSedi) ─ */}
          {isAllSedi && perSede.length > 0 && (
            <div style={{ ...panelStyle, marginBottom: 16, padding: isMobile ? 16 : 18 }}>
              <div style={panelTitle}>Dettaglio per sede</div>
              <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse', minWidth: 600,
                  fontSize: 12.5,
                }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ ...tdHeadSede, position: 'sticky', left: 0, background: '#F8FAFC', zIndex: 1 }}>Sede</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Retail kg</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>B2B kg</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Atteso</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Ricavi B2B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perSede.map(({ sede, kpi: k }) => (
                      <tr key={sede.id} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                        <td style={{
                          ...tdCellSede, position: 'sticky', left: 0,
                          background: C.bgCard, zIndex: 1,
                          fontWeight: 600,
                          maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }} title={sede.nome}>
                          {sede.nome}{sede.is_default ? ' ★' : ''}
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, whiteSpace: 'nowrap' }}>
                          {nKg((k.retailKg ?? k.totVendutoKg) * 1000)} kg
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: C.textSoft, whiteSpace: 'nowrap' }}>
                          {nKg((k.b2bKg || 0) * 1000)} kg
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmt0(k.ricavoAtteso || 0)}
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: '#075985', whiteSpace: 'nowrap' }}>
                          {fmt0(k.ricaviB2b || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─ Top + Sofferenza ─ */}
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: isMobile ? '1fr' : (isTablet ? '1fr' : '1.2fr 1fr'),
            marginBottom: 20,
          }}>
            <PanelTop
              title="Top gusti per kg venduti"
              items={classifica.top}
              total={kpi.totVendutoG}
              isMobile={isMobile}
            />
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
// Mini grafico con 2 serie normalizzate: kg venduti (linea verde) e
// cassa retail (linea brand tratteggiata). Asse Y separato per asse.
function SparklineTrend({ data }) {
  const W = 600, H = 110, PAD_X = 30, PAD_Y = 22
  if (!data || data.length === 0) return null
  const maxKg = Math.max(1, ...data.map(d => d.kg))
  const maxEur = Math.max(1, ...data.map(d => d.cassa))
  const xStep = (W - PAD_X * 2) / Math.max(1, data.length - 1)
  const yScale = (val, max) => H - PAD_Y - (val / max) * (H - PAD_Y * 2)

  const pathKg = data.map((d, i) => {
    const x = PAD_X + i * xStep
    const y = yScale(d.kg, maxKg)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const pathEur = data.map((d, i) => {
    const x = PAD_X + i * xStep
    const y = yScale(d.cassa, maxEur)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const fmtLabel = (iso) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 150, display: 'block' }} aria-label="Trend ultime 4 settimane">
        {/* Gridline orizzontale di base */}
        <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="#E5E7EB" strokeWidth="1" />
        {/* Cassa (linea brand tratteggiata) */}
        <path d={pathEur} fill="none" stroke="#6E0E1A" strokeWidth="2" strokeDasharray="4 3" />
        {/* Kg venduti (linea verde) */}
        <path d={pathKg} fill="none" stroke="#16A34A" strokeWidth="2" />
        {data.map((d, i) => {
          const x = PAD_X + i * xStep
          return (
            <g key={i}>
              <circle cx={x} cy={yScale(d.kg, maxKg)} r="3.5" fill="#16A34A" stroke="#FFF" strokeWidth="1.5" />
              <circle cx={x} cy={yScale(d.cassa, maxEur)} r="3.5" fill="#6E0E1A" stroke="#FFF" strokeWidth="1.5" />
              <text x={x} y={H - 4} fontSize="10" textAnchor="middle" fill="#6B7280">
                {fmtLabel(d.lunIso)}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{
        display: 'flex', gap: 18, fontSize: 11.5, color: C.textSoft,
        marginTop: 6, flexWrap: 'wrap',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 2, background: '#16A34A', borderRadius: 1 }} />
          kg venduti (inventario)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', width: 14, height: 0,
            borderTop: '2px dashed #6E0E1A',
          }} />
          cassa retail
        </span>
      </div>
    </div>
  )
}

// ── Stili tabella drill-down per sede ─────────────────────────────────────
const tdHeadSede = {
  padding: '10px 14px', textAlign: 'left',
  fontSize: 10.5, fontWeight: 700, color: C.textSoft,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}
const tdCellSede = { padding: '10px 14px', fontSize: 13, color: C.text }

// ── Tile KPI ──────────────────────────────────────────────────────────────
// Audit 2026-06-24: minHeight uniformi sui sub-elementi così tile affiancate
// hanno label/value/sub/badge allineati anche con contenuti di lunghezza
// diversa (es. una label su 1 vs 2 righe).
function Tile({ icon, label, value, sub, tendVal, muted, color, bg, borderColor, accent, badge }) {
  const fgValue = color || (muted ? C.textMid : C.text)
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '16px 16px 14px',
      background: bg || C.bgSubtle,
      borderRadius: 14,
      border: `1px solid ${borderColor || C.border}`,
      display: 'flex', flexDirection: 'column',
      minHeight: 132,
      width: '100%', boxSizing: 'border-box',
    }}>
      {/* Header: chip icona + label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, minHeight: 32,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 9,
          background: accent ? `${accent}22` : 'rgba(110,14,26,0.10)',
          color: accent || C.red,
          flexShrink: 0,
        }}>
          <Icon name={icon} size={15} color={accent || C.red} />
        </span>
        <div style={{
          fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: C.textSoft, lineHeight: 1.25,
          minHeight: 28,
          display: 'flex', alignItems: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={label}>
          {label}
        </div>
      </div>

      {/* Value: arrotondato all'unità, tabular nums, € DOPO la cifra */}
      <div style={{
        fontSize: 26, fontWeight: 800, color: fgValue,
        letterSpacing: '-0.025em', lineHeight: 1.1,
        minHeight: 32,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        ...TNUM,
      }}>
        {value}
      </div>

      {/* Sub: minHeight uniforme così le tile restano allineate */}
      <div style={{
        fontSize: 11.5, color: muted ? C.textSoft : C.textMid,
        marginTop: 6, lineHeight: 1.35,
        minHeight: 28,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={sub || ''}>
        {sub || (tendVal != null ? '' : ' ')}
        {tendVal != null && !sub && (
          <span style={{ color: tendVal >= 0 ? '#065F46' : '#991B1B', fontWeight: 600 }}>
            vs sett. prec.: {tendVal > 0 ? '+' : ''}{tendVal.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>

      {/* Footer: badge tono + variazione (riga separata sempre presente) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 8, minHeight: 22,
        flexWrap: 'wrap',
      }}>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: accent || C.textMid,
            background: accent ? `${accent}1F` : 'rgba(15,23,42,0.05)',
            padding: '3px 8px', borderRadius: 999,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}>{badge}</span>
        )}
        {tendVal != null && sub && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: tendVal >= 0 ? '#065F46' : '#991B1B',
            whiteSpace: 'nowrap',
          }}>
            vs prec. {tendVal > 0 ? '+' : ''}{tendVal.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>
    </div>
  )
}

// ── Diagnosi drift ────────────────────────────────────────────────────────
function DiagnosiDrift({ driftEur, driftPct, isMobile }) {
  const tono = driftEur < 0 ? 'mancante' : 'sovrastimato'
  const ipotesi = driftEur < 0
    ? [
        'Porzioni piu grandi di quelle pianificate dai formati (controlla la bilancia)',
        'Omaggi non registrati alla cassa',
        'Errori di scontrino: battiture saltate o sottostimate',
        'Furti interni',
      ]
    : [
        'Cassa con incassi extra non legati al gelato (es. articoli non da gusto)',
        'Inventario sottostimato: residuo della mattina dopo letto basso o errore di pesata',
        'Scarti registrati ma in realta venduti',
      ]
  return (
    <div style={{
      marginTop: 14, padding: isMobile ? 14 : '14px 16px',
      background: '#FEF2F2', border: '1px solid #FECACA',
      borderRadius: 12, fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.55,
      width: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="warning" size={15} color="#991B1B" />
        <strong style={{ fontSize: 13 }}>
          Cosa controllare - drift {tono} del {Math.abs(driftPct).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
        </strong>
      </div>
      <ul style={{ margin: 0, paddingLeft: 22 }}>
        {ipotesi.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
      </ul>
    </div>
  )
}

// ── Panel Top gusti ───────────────────────────────────────────────────────
function PanelTop({ title, items, total, isMobile }) {
  if (!items || items.length === 0) {
    return (
      <div style={panelStyle}>
        <div style={panelTitle}>{title}</div>
        <div style={{ fontSize: 13, color: C.textSoft, padding: '12px 0' }}>
          Nessun venduto registrato per questa settimana.
        </div>
      </div>
    )
  }
  return (
    <div style={panelStyle}>
      <div style={panelTitle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const pctVal = total > 0 ? (it.vendutoG / total * 100) : 0
          return (
            <div key={it.gusto} style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
              width: '100%',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: i === 0 ? '#FEF3C7' : C.bgSubtle,
                color: i === 0 ? '#92400E' : C.textSoft,
                fontSize: 11, fontWeight: 800, textAlign: 'center',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <span style={{
                flex: isMobile ? '0 0 88px' : '0 0 140px',
                fontSize: 13, fontWeight: 600, color: C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={it.gusto}>
                {it.gusto}
              </span>
              <div style={{
                flex: 1, height: 8, background: '#F0EAE6',
                borderRadius: 4, overflow: 'hidden', minWidth: 30,
              }}>
                <div style={{
                  width: `${Math.max(4, pctVal)}%`, height: '100%',
                  background: i === 0 ? '#6E0E1A' : '#8A1F2C',
                  borderRadius: 4,
                  transition: 'width 240ms ease',
                }} />
              </div>
              <span style={{
                flex: '0 0 64px', fontSize: 12.5, fontWeight: 700,
                textAlign: 'right', ...TNUM, color: C.text,
                whiteSpace: 'nowrap',
              }}>
                {nKg(it.vendutoG)} kg
              </span>
              <span style={{
                flex: '0 0 38px', fontSize: 11.5, color: C.textSoft,
                textAlign: 'right', ...TNUM, whiteSpace: 'nowrap',
              }}>
                {pctVal.toLocaleString('it-IT', { maximumFractionDigits: 0 })}%
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
        <div style={{
          marginBottom: 14, padding: '10px 12px',
          background: '#FEF2F2', borderRadius: 10,
          border: '1px solid #FECACA',
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: '#991B1B',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="alert" size={12} color="#991B1B" />
            Zero venduto ({zeroVenduto.length.toLocaleString('it-IT')})
          </div>
          <div style={{
            fontSize: 12.5, color: '#7F1D1D', lineHeight: 1.55,
          }}>
            {zeroVenduto.slice(0, 8).map(x => x.gusto).join(' · ')}
            {zeroVenduto.length > 8 ? ` · +${(zeroVenduto.length - 8).toLocaleString('it-IT')} altri` : ''}
          </div>
        </div>
      )}

      {sofferenza.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>
          Nessun gusto con residuo persistente. Buon equilibrio produzione/vendita.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sofferenza.slice(0, 6).map(x => (
            <div key={x.gusto} style={{
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5,
              padding: '6px 0',
              borderBottom: `1px dashed ${C.borderSoft}`,
            }}>
              <span style={{
                flex: 1, fontWeight: 600, color: C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                minWidth: 0,
              }} title={x.gusto}>
                {x.gusto}
              </span>
              <span style={{
                color: C.textSoft, ...TNUM, whiteSpace: 'nowrap',
                fontSize: 11.5,
              }}>
                residuo {nKg(x.residuoMedioG)} kg
              </span>
              <span style={{
                color: '#92400E', fontWeight: 700, ...TNUM,
                minWidth: 52, textAlign: 'right', whiteSpace: 'nowrap',
                background: '#FEF3C7', padding: '2px 8px', borderRadius: 999,
                fontSize: 11.5,
              }}>
                {(x.ratio * 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}%
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{
        fontSize: 11, color: C.textSoft, marginTop: 12, lineHeight: 1.4,
        paddingTop: 10, borderTop: `1px solid ${C.borderSoft}`,
      }}>
        Soglia &quot;sofferenza&quot;: residuo medio &ge; 50% della produzione giornaliera.
      </div>
    </div>
  )
}

// ── Stili condivisi ───────────────────────────────────────────────────────
const btnNav = (minSize = 40) => ({
  minHeight: minSize, minWidth: minSize,
  background: 'transparent',
  border: `1px solid ${C.border}`, borderRadius: 10,
  cursor: 'pointer',
  fontSize: 14, color: C.textMid,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'background 120ms ease, border-color 120ms ease',
  boxSizing: 'border-box',
})
const panelStyle = {
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
  padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.04)',
  width: '100%', boxSizing: 'border-box',
}
const panelTitle = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: C.textSoft, marginBottom: 14,
}
