import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const RED    = [192, 57, 43]
const DARK   = [28, 10, 10]
const GRAY   = [107, 76, 68]
const LIGHT  = [253, 250, 247]
const BORDER = [232, 221, 216]

function addHeader(doc, title, subtitle, nomeAttivita) {
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('FoodOS', 14, 13)
  if (nomeAttivita) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(200, 150, 130)
    doc.text(nomeAttivita, 14, 19)
  }
  const now = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(8)
  doc.setTextColor(180, 140, 120)
  doc.text(now, 196, 13, { align: 'right' })

  doc.setTextColor(...DARK)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 36)
  if (subtitle) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(subtitle, 14, 43)
  }
}

function addFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(180, 160, 155)
    doc.text('Generato da FoodOS — foodios.it', 14, 290)
    doc.text(`${i} / ${pages}`, 196, 290, { align: 'right' })
  }
}

function fmt(v) {
  return `€ ${Number(v || 0).toFixed(2)}`
}

// ─── 1. Ricetta PDF ───────────────────────────────────────────────────────────
export function exportRicettaPDF(ricetta, foodCost, nomeAttivita) {
  const doc = new jsPDF()
  addHeader(doc, ricetta.nome || 'Ricetta', ricetta.categoria || '', nomeAttivita)

  const startY = 52

  // Info box
  const info = [
    ['Categoria', ricetta.categoria || '—'],
    ['Porzioni', String(ricetta.porzioni || 1)],
    ['Prezzo di vendita', fmt(ricetta.prezzo)],
    ['Food cost %', foodCost?.perc != null ? `${Number(foodCost.perc).toFixed(1)}%` : '—'],
  ]
  autoTable(doc, {
    startY,
    head: [],
    body: info,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: GRAY, cellWidth: 48 },
      1: { textColor: DARK },
    },
    margin: { left: 14 },
    tableWidth: 90,
  })

  const afterInfo = doc.lastAutoTable.finalY + 10

  // Tabella ingredienti
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('Ingredienti', 14, afterInfo)

  const ingredienti = (ricetta.ingredienti || []).map(ing => [
    ing.nome || '—',
    `${ing.quantita || 0} ${ing.unita || 'kg'}`,
    fmt(ing.costoUnitario || ing.costo_unitario),
    fmt((ing.costoUnitario || ing.costo_unitario || 0) * (ing.quantita || 0)),
  ])

  autoTable(doc, {
    startY: afterInfo + 4,
    head: [['Ingrediente', 'Quantità', 'Costo unitario', 'Costo totale']],
    body: ingredienti.length ? ingredienti : [['Nessun ingrediente', '', '', '']],
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const afterTable = doc.lastAutoTable.finalY + 10

  // Riepilogo
  const costoTotale = foodCost?.costo ?? (ricetta.ingredienti || []).reduce(
    (s, i) => s + (i.costoUnitario || i.costo_unitario || 0) * (i.quantita || 0), 0
  )
  const prezzoVendita = ricetta.prezzo || 0
  const margine = prezzoVendita - costoTotale
  const percFC = prezzoVendita > 0 ? (costoTotale / prezzoVendita * 100) : 0

  autoTable(doc, {
    startY: afterTable,
    head: [['Riepilogo economico', '']],
    body: [
      ['Food cost totale', fmt(costoTotale)],
      ['Food cost %', `${percFC.toFixed(1)}%`],
      ['Prezzo vendita suggerito', fmt(prezzoVendita)],
      ['Margine lordo', fmt(margine)],
    ],
    theme: 'plain',
    headStyles: { fillColor: RED, textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: GRAY }, 1: { halign: 'right', textColor: DARK } },
    margin: { left: 14 },
    tableWidth: 100,
  })

  addFooter(doc)
  doc.save(`ricetta-${(ricetta.nome || 'export').replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

// ─── 2. P&L mensile ───────────────────────────────────────────────────────────
export function exportPLMensile(dati, mese, anno, nomeAttivita) {
  const doc = new jsPDF()
  const label = mese && anno ? `${mese} ${anno}` : 'Report mensile'
  addHeader(doc, 'Report P&L', label, nomeAttivita)

  const startY = 52

  // Tabella ricavi per categoria
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('Ricavi per categoria', 14, startY)

  const ricavi = (dati.ricavi || []).map(r => [r.categoria || '—', String(r.quantita || 0), fmt(r.ricavo)])
  const totRicavi = (dati.ricavi || []).reduce((s, r) => s + (r.ricavo || 0), 0)
  autoTable(doc, {
    startY: startY + 5,
    head: [['Categoria', 'Pezzi', 'Ricavo']],
    body: ricavi.length ? [...ricavi, [{ content: 'TOTALE', fontStyle: 'bold' }, '', { content: fmt(totRicavi), fontStyle: 'bold' }]] : [['—', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const y2 = doc.lastAutoTable.finalY + 12

  // Tabella costi materie prime
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('Costi materie prime', 14, y2)

  const costi = (dati.costi || []).map(c => [c.categoria || '—', fmt(c.costo), `${(c.perc || 0).toFixed(1)}%`])
  const totCosti = (dati.costi || []).reduce((s, c) => s + (c.costo || 0), 0)
  autoTable(doc, {
    startY: y2 + 5,
    head: [['Categoria', 'Costo MP', 'FC%']],
    body: costi.length ? [...costi, [{ content: 'TOTALE', fontStyle: 'bold' }, { content: fmt(totCosti), fontStyle: 'bold' }, '']] : [['—', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const y3 = doc.lastAutoTable.finalY + 12

  // Riepilogo totali
  const margine = totRicavi - totCosti
  const percMargine = totRicavi > 0 ? (margine / totRicavi * 100) : 0
  autoTable(doc, {
    startY: y3,
    head: [['Riepilogo economico', '']],
    body: [
      ['Ricavi totali', fmt(totRicavi)],
      ['Costi materie prime', fmt(totCosti)],
      ['Margine lordo', fmt(margine)],
      ['Margine %', `${percMargine.toFixed(1)}%`],
    ],
    theme: 'plain',
    headStyles: { fillColor: RED, textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: GRAY }, 1: { halign: 'right', textColor: DARK } },
    margin: { left: 14 },
    tableWidth: 120,
  })

  addFooter(doc)
  doc.save(`pl-${(mese || 'mensile').toLowerCase()}-${anno || ''}.pdf`)
}

// ─── 3. Produzione giornaliera ────────────────────────────────────────────────
export function exportProduzione(dati, data, nomeAttivita) {
  const doc = new jsPDF()
  const dataLabel = data ? new Date(data).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
  addHeader(doc, 'Produzione Giornaliera', dataLabel, nomeAttivita)

  const startY = 52

  // Raggruppa per categoria
  const byCategoria = {}
  for (const item of (dati || [])) {
    const cat = item.categoria || 'Altro'
    if (!byCategoria[cat]) byCategoria[cat] = []
    byCategoria[cat].push(item)
  }

  let curY = startY
  let totaleCosto = 0

  for (const [cat, items] of Object.entries(byCategoria)) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...RED)
    doc.text(cat, 14, curY)

    const rows = items.map(i => {
      const costoTot = (i.costo || 0) * (i.quantita || 0)
      totaleCosto += costoTot
      return [i.nome || '—', String(i.quantita || 0), i.unita || 'pz', fmt(i.costo), fmt(costoTot)]
    })

    autoTable(doc, {
      startY: curY + 3,
      head: [['Prodotto', 'Qty', 'UM', 'Costo unit.', 'Costo tot.']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })
    curY = doc.lastAutoTable.finalY + 8
  }

  // Totale
  autoTable(doc, {
    startY: curY,
    head: [],
    body: [['Costo totale produzione', fmt(totaleCosto)]],
    theme: 'plain',
    styles: { fontSize: 11, fontStyle: 'bold', cellPadding: 4 },
    columnStyles: { 0: { textColor: DARK }, 1: { halign: 'right', textColor: RED } },
    margin: { left: 14 },
    tableWidth: 120,
  })

  addFooter(doc)
  doc.save(`produzione-${(data || 'export').replace(/\//g, '-')}.pdf`)
}

// ─── 4. Scadenzario fatture ───────────────────────────────────────────────────
export function exportScadenzario(fatture, nomeAttivita) {
  const doc = new jsPDF({ orientation: 'landscape' })
  addHeader(doc, 'Scadenzario Fatture', `${fatture.length} fatture`, nomeAttivita)

  const statoLabel = { da_pagare: 'Da pagare', in_scadenza: 'In scadenza', pagata: 'Pagata' }
  const fmt2 = (d) => d ? new Date(d).toLocaleDateString('it-IT') : '—'

  // Raggruppa per fornitore
  const byFornitore = {}
  for (const f of fatture) {
    const nome = f.fornitore || 'Senza fornitore'
    if (!byFornitore[nome]) byFornitore[nome] = []
    byFornitore[nome].push(f)
  }

  let startY = 52
  let totaleDaPagare = 0
  let totalePagato = 0

  for (const [fornitore, fats] of Object.entries(byFornitore)) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...RED)
    doc.text(fornitore, 14, startY)

    const rows = fats.map(f => {
      const stato = f.stato || 'da_pagare'
      if (stato === 'pagata') totalePagato += f.totale || 0
      else totaleDaPagare += f.totale || 0
      return [
        f.numero_fattura || '—',
        fmt2(f.data_fattura),
        fmt2(f.data_scadenza),
        statoLabel[stato] || stato,
        fmt(f.imponibile),
        fmt(f.imposta),
        fmt(f.totale),
      ]
    })

    autoTable(doc, {
      startY: startY + 3,
      head: [['N. Fattura', 'Data', 'Scadenza', 'Stato', 'Imponibile', 'IVA', 'Totale']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })
    startY = doc.lastAutoTable.finalY + 8
  }

  // Totali
  autoTable(doc, {
    startY,
    head: [['Riepilogo', '']],
    body: [
      ['Totale da pagare', fmt(totaleDaPagare)],
      ['Totale pagato', fmt(totalePagato)],
      ['Totale fatture', fmt(totaleDaPagare + totalePagato)],
    ],
    theme: 'plain',
    headStyles: { fillColor: RED, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: GRAY }, 1: { halign: 'right', textColor: DARK } },
    margin: { left: 14 },
    tableWidth: 120,
  })

  addFooter(doc)
  doc.save('scadenzario-fatture.pdf')
}
