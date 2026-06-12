// PDF Export — generatore PDF strutturato riusabile per tutte le view.
//
// Filosofia: i grafici li redenderemo come PNG via html2canvas se servono,
// ma i KPI/tabelle li disegniamo direttamente con jsPDF per pulizia + size.
//
// API:
//   buildAndDownloadPdf({
//     fileName: 'pl_giugno_2026.pdf',
//     title: 'Conto economico',
//     subtitle: 'Mara dei Boschi · giugno 2026',
//     periodo: 'vs maggio 2026',
//     kpi: [{label, value, sub}],            // KPI hero, 2-4 cards
//     sections: [{
//       title: 'Top prodotti',
//       table: {                              // OPZIONALE: jspdf-autotable
//         columns: ['Prodotto', 'Qta', '€'],
//         rows: [['Cannolo', 42, 168.00], ...],
//         alignments: ['left', 'right', 'right'],
//       },
//       text: 'Paragrafo libero',             // OPZIONALE
//       chartImg: dataUrl,                    // OPZIONALE: PNG base64 del grafico
//     }],
//   })
//
// Brand FoodOS in header e footer. Logo testuale "F" gradiente bordeaux.
// A4 portrait, font Helvetica.

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND = '#6E0E1A'
const BRAND_DARK = '#4A0612'
const TEXT = '#0E1726'
const MUTED = '#8B95A7'

function fmt0(n) {
  return Number(n || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}

function drawHeader(doc, { title, subtitle, periodo }) {
  // Brand bar
  doc.setFillColor(110, 14, 26)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setFillColor(74, 6, 18)
  doc.rect(0, 18, 210, 4, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('FoodOS', 14, 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }), 196, 12, { align: 'right' })

  // Titolo
  doc.setTextColor(14, 23, 38)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(title || 'Report FoodOS', 14, 36)
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(71, 82, 100)
    doc.text(subtitle, 14, 43)
  }
  if (periodo) {
    doc.setFontSize(9)
    doc.setTextColor(139, 149, 167)
    doc.text(periodo, 14, 49)
  }
}

function drawFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(139, 149, 167)
    doc.text(`Generato da FoodOS · ${new Date().toLocaleString('it-IT')}`, 14, 290)
    doc.text(`${i} / ${pages}`, 196, 290, { align: 'right' })
  }
}

function drawKpi(doc, kpiArr, y = 60) {
  if (!Array.isArray(kpiArr) || kpiArr.length === 0) return y
  const n = Math.min(kpiArr.length, 4)
  const cardW = (210 - 14 * 2 - 6 * (n - 1)) / n
  const cardH = 26
  let x = 14
  for (let i = 0; i < n; i++) {
    const k = kpiArr[i]
    doc.setDrawColor(229, 233, 239)
    doc.setFillColor(250, 250, 246)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')
    doc.setFontSize(7)
    doc.setTextColor(139, 149, 167)
    doc.setFont('helvetica', 'bold')
    doc.text(String(k.label || '').toUpperCase(), x + 4, y + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(14, 23, 38)
    doc.text(String(k.value || ''), x + 4, y + 15)
    if (k.sub) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(71, 82, 100)
      doc.text(String(k.sub), x + 4, y + 21)
    }
    x += cardW + 6
  }
  return y + cardH + 8
}

function drawSection(doc, section, yStart) {
  let y = yStart
  if (y > 250) { doc.addPage(); y = 30 }

  // Titolo sezione
  if (section.title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(14, 23, 38)
    doc.text(section.title, 14, y)
    y += 6
  }

  // Testo libero
  if (section.text) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(71, 82, 100)
    const split = doc.splitTextToSize(section.text, 180)
    doc.text(split, 14, y)
    y += split.length * 5 + 4
  }

  // Chart immagine (PNG base64)
  if (section.chartImg) {
    try {
      const imgW = section.chartW || 180
      const imgH = section.chartH || 70
      doc.addImage(section.chartImg, 'PNG', 14, y, imgW, imgH)
      y += imgH + 8
    } catch {}
  }

  // Tabella via autotable
  if (section.table && Array.isArray(section.table.rows) && section.table.rows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [section.table.columns],
      body: section.table.rows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3, textColor: [14, 23, 38] },
      headStyles: { fillColor: [248, 250, 252], textColor: [110, 14, 26], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 246] },
      columnStyles: (section.table.alignments || []).reduce((acc, a, i) => {
        acc[i] = { halign: a || 'left' }
        return acc
      }, {}),
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  return y
}

export function buildAndDownloadPdf({
  fileName = 'foodios-report.pdf',
  title,
  subtitle,
  periodo,
  kpi = [],
  sections = [],
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  drawHeader(doc, { title, subtitle, periodo })
  let y = 60
  y = drawKpi(doc, kpi, y)
  for (const s of sections) {
    y = drawSection(doc, s, y)
  }
  drawFooter(doc)

  doc.save(fileName)
}

// Helper per estrarre SVG come PNG. Comodo per Recharts/SVG inline.
// Usage: const dataUrl = await svgNodeToPng(document.querySelector('#chartId svg'))
export async function svgNodeToPng(svgNode, scale = 2) {
  if (!svgNode) return null
  try {
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgNode)
    const w = svgNode.viewBox?.baseVal?.width || svgNode.clientWidth || 600
    const h = svgNode.viewBox?.baseVal?.height || svgNode.clientHeight || 300
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve; img.onerror = reject; img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = w * scale; canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('svgNodeToPng failed', e)
    return null
  }
}
