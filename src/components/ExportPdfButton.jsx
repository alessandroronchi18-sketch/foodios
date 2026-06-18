// ExportPdfButton — bottone riusabile per esportare la view corrente in PDF.
//
// Modi di uso:
//   1. Modo "structured": passi { fileName, title, kpi, sections } e jsPDF
//      genera tutto strutturato.
//   2. Modo "build" callback: passi getReport() che ritorna {title, kpi, ...}
//      al momento del click (utile quando i dati sono async).
//
// Esempi:
//   <ExportPdfButton
//     fileName="pl-giugno-2026.pdf"
//     getReport={() => ({
//       title: 'Conto economico',
//       subtitle: 'Mara dei Boschi',
//       periodo: 'maggio 2026 vs aprile 2026',
//       kpi: [{ label: 'Ricavi', value: '€12.847', sub: '+8% vs aprile' }, ...],
//       sections: [{ title: 'Conto economico', table: { columns: [...], rows: [...] } }],
//     })}
//   />

import React, { useState } from 'react'
import { color as T } from '../lib/theme'
import Icon from './Icon'
import { buildAndDownloadPdf } from '../lib/pdfExport'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'

export default function ExportPdfButton({
  fileName = 'report.pdf',
  getReport,
  compact = false,
  label = 'Esporta PDF',
  notify,
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function handle() {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const report = typeof getReport === 'function' ? await getReport() : getReport
      if (!report) throw new Error('Report vuoto')
      await buildAndDownloadPdf({ fileName, ...report })
    } catch (e) {
      console.error('Export PDF failed:', e)
      const msg = 'Errore export PDF: ' + (e?.message || 'sconosciuto')
      if (typeof notify === 'function') notify(msg, false)
      else setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  if (compact) {
    return (
      <button onClick={handle} disabled={busy} title={err || label}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: BRAND, display: 'inline-flex' }}>
        {busy ? <span style={{ fontSize: 10 }}>…</span> : <Icon name="fileText" size={15} />}
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <button onClick={handle} disabled={busy}
        style={{
          background: busy ? '#CBD5E1' : 'transparent',
          border: `1px solid ${BRAND}`,
          color: BRAND,
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
        <Icon name="fileText" size={13} /> {busy ? 'Genero PDF…' : label}
      </button>
      {err && (
        <span style={{ marginTop: 4, color: '#B91C1C', fontSize: 10 }}>{err}</span>
      )}
    </span>
  )
}
