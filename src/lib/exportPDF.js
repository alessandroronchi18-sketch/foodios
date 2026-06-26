// jsPDF + autoTable caricati lazy SOLO quando l'utente clicca un export.
// Senza questo lazy-load il chunk pdf (649KB) veniva fetchato al mount.
let _jsPDF = null
let _autoTable = null
async function ensurePdf() {
  if (!_jsPDF) {
    const [{ default: JsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    _jsPDF = JsPDF
    _autoTable = autoTableMod.default
  }
  return { jsPDF: _jsPDF, autoTable: _autoTable }
}

const RED    = [192, 57, 43]
const DARK   = [28, 10, 10]
const GRAY   = [107, 76, 68]
const LIGHT  = [253, 250, 247]
const BORDER = [232, 221, 216]

// Normalizza i nomi ingrediente come fa Dashboard.jsx (normIng):
// stessa logica plurale→singolare, così i lookup nel costMap coincidono.
const _SING_PLUR = new Map([
  ["albumi","albume"],["tuorli","tuorlo"],["uova","uovo"],
  ["banane","banana"],["carote","carota"],["mele","mela"],
  ["pere","pera"],["fragole","fragola"],["lamponi","lampone"],
  ["mirtilli","mirtillo"],["more","mora"],["ciliegie","ciliegia"],
  ["pesche","pesca"],["albicocche","albicocca"],["prugne","prugna"],["susine","susina"],
  ["fichi","fico"],["limoni","limone"],["arance","arancia"],["noci","noce"],
  ["mandorle","mandorla"],["nocciole","nocciola"],["pistacchi","pistacchio"],
  ["pinoli","pinolo"],["datteri","dattero"],["anacardi","anacardo"],
  ["arachidi","arachide"],["zucchine","zucchina"],
  ["biscotti","biscotto"],["gocce di cioccolato","goccia di cioccolato"],
])
function normIng(nome) {
  const k = String(nome || '').toLowerCase().trim().replace(/\s+/g, ' ')
  return _SING_PLUR.get(k) || k
}

function addHeader(doc, title, subtitle, nomeAttivita) {
  doc.setFillColor(...DARK)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Foodos', 14, 13)
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

function addFooter(doc, opts = {}) {
  const { emailUtente, nomeAttivita } = opts
  const pages = doc.internal.getNumberOfPages()
  const wm = emailUtente
    ? `Esportato da ${emailUtente}${nomeAttivita ? ' · ' + nomeAttivita : ''} · uso interno`
    : null
  const tsIso = new Date().toISOString().replace('T', ' ').slice(0, 19)
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(180, 160, 155)
    doc.text('Generato da Foodos — foodios.it', 14, 290)
    doc.text(`${i} / ${pages}`, 196, 290, { align: 'right' })
    if (wm) {
      doc.setFontSize(7)
      doc.setTextColor(200, 195, 190)
      doc.text(wm, 14, 285)
      doc.text(tsIso, 196, 285, { align: 'right' })
    }
  }
}

// Watermark "diagonale" leggero sulla pagina — dissuade screenshot/condivisione casuale.
// È visibile ma non occlude i contenuti. Si applica solo se emailUtente è fornito.
function addDiagonalWatermark(doc, emailUtente) {
  if (!emailUtente) return
  const pages = doc.internal.getNumberOfPages()
  const text = `${emailUtente} · ${new Date().toLocaleDateString('it-IT')}`
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.saveGraphicsState()
    doc.setGState(new doc.GState({ opacity: 0.05 }))
    doc.setFontSize(40)
    doc.setTextColor(150, 100, 100)
    doc.setFont('helvetica', 'bold')
    // Una diagonale al centro pagina
    doc.text(text, 105, 160, { align: 'center', angle: 30 })
    doc.restoreGraphicsState()
  }
}

function setPdfMetadata(doc, opts = {}) {
  const { titolo, emailUtente, nomeAttivita } = opts
  try {
    doc.setProperties({
      title: titolo || 'Documento Foodos',
      subject: nomeAttivita || 'Foodos',
      author: emailUtente || 'Foodos user',
      creator: 'Foodos',
      keywords: `foodios,${nomeAttivita || ''},${emailUtente || ''},${new Date().toISOString()}`,
    })
  } catch { /* jsPDF versioni vecchie: ignora */ }
}

function fmt(v) {
  return `${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

// ─── 1. Ricetta PDF ───────────────────────────────────────────────────────────
// Firma: (ricetta, foodCost, ingCosti, nomeAttivita)
//   - ricetta.ingredienti è un array [{ nome, qty1stampo (grammi), ... }]
//   - foodCost: { tot, perc } come passato dai chiamanti in Dashboard.jsx
//   - ingCosti: mappa { [normIng(nome)]: { costoKg, costoG } }
export async function exportRicettaPDF(ricetta, foodCost, ingCosti, nomeAttivita, emailUtente) {
  const { jsPDF, autoTable } = await ensurePdf()
  // Backwards-compat: se qualcuno chiama ancora con (ricetta, foodCost, nomeAttivita) come stringa
  if (typeof ingCosti === 'string' && nomeAttivita === undefined) {
    nomeAttivita = ingCosti
    ingCosti = null
  }
  const costMap = ingCosti || {}

  const doc = new jsPDF()
  setPdfMetadata(doc, { titolo: `Ricetta — ${ricetta.nome || ''}`, emailUtente, nomeAttivita })
  addHeader(doc, ricetta.nome || 'Ricetta', ricetta.categoria || '', nomeAttivita)

  const startY = 52

  // Calcolo cost-per-ing dal cost map (struttura reale: qty in grammi)
  const rows = (ricetta.ingredienti || [])
    .filter(ing => ing && ing.nome && (ing.qty1stampo || 0) > 0)
    .map(ing => {
      const qtyG = Number(ing.qty1stampo) || 0
      const c = costMap[normIng(ing.nome)]
      const costoG = c?.costoG || 0
      const costoTot = qtyG * costoG
      const qtyDisp = qtyG >= 1000 ? `${(Number(qtyG) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(Number(qtyG)||0).toLocaleString('it-IT')} g`
      return [ing.nome, qtyDisp, fmt(costoG * 1000) + '/kg', fmt(costoTot)]
    })

  const totaleCalcolato = rows.reduce((s, r) => {
    const v = Number(String(r[3]).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
    return s + v
  }, 0)
  const fcTot = foodCost?.tot ?? foodCost?.costo ?? totaleCalcolato

  // Info box
  const info = [
    ['Categoria', ricetta.categoria || '—'],
    ['Porzioni', String(ricetta.porzioni || ricetta.unita || 1)],
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

  const afterInfo = (doc.lastAutoTable?.finalY ?? 60) + 10

  // Tabella ingredienti
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('Ingredienti', 14, afterInfo)

  autoTable(doc, {
    startY: afterInfo + 4,
    head: [['Ingrediente', 'Quantità', 'Costo unitario', 'Costo totale']],
    body: rows.length ? rows : [['Nessun ingrediente', '—', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const afterTable = (doc.lastAutoTable?.finalY ?? 60) + 10

  // Riepilogo
  const costoTotale = fcTot
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

  addDiagonalWatermark(doc, emailUtente)
  addFooter(doc, { emailUtente, nomeAttivita })
  doc.save(`ricetta-${(ricetta.nome || 'export').replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

// ─── 2. P&L mensile ───────────────────────────────────────────────────────────
export async function exportPLMensile(dati, mese, anno, nomeAttivita, emailUtente) {
  const { jsPDF, autoTable } = await ensurePdf()
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

  const y2 = (doc.lastAutoTable?.finalY ?? 60) + 12

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

  const y3 = (doc.lastAutoTable?.finalY ?? 60) + 12

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

  addDiagonalWatermark(doc, emailUtente)
  addFooter(doc, { emailUtente, nomeAttivita })
  doc.save(`pl-${(mese || 'mensile').toLowerCase()}-${anno || ''}.pdf`)
}

// ─── 2b. P&L COMPLETO (data-analyst export) ──────────────────────────────────
// Multi-pagina: executive summary + KPI + dettaglio per prodotto + ingredienti
// + sensitivity + insights/raccomandazioni. Sostituisce gradualmente exportPLMensile
// per i contesti dove serve la versione "ricca".
//
// Input atteso (dati):
//   {
//     rows:            [{ nome, reg:{unita,prezzo,tipo}, ricavo, fc, margine, margPct, fcPct, fcUnita, mrgUnita }],
//     topIngredienti?: [{ nome, costoTot, perc }],          // opzionale
//     fcAvg:           number,
//     avgMarg:         number,
//     totRicavo:       number,
//     totFC:           number,
//     totMargine:      number,
//     insights?:       [{ tipo: 'ok'|'warn'|'critical', testo: string }],
//     mese?:           string, anno?: string,
//   }
export async function exportPLCompleto(dati, nomeAttivita, emailUtente) {
  const { jsPDF, autoTable } = await ensurePdf()
  const doc = new jsPDF()
  const rows = dati.rows || []
  const label = dati.mese && dati.anno ? `${dati.mese} ${dati.anno}` : `${rows.length} prodotti`
  setPdfMetadata(doc, { titolo: 'Report P&L completo', emailUtente, nomeAttivita })
  addHeader(doc, 'P&L Analitico', label, nomeAttivita)

  // KPI strip (4 grandi numeri)
  const startY = 52
  const fcAvg     = Number(dati.fcAvg || 0)
  const avgMarg   = Number(dati.avgMarg || 0)
  const totRicavo = Number(dati.totRicavo || 0)
  const totFC     = Number(dati.totFC || 0)
  const totMargine= Number(dati.totMargine || 0)
  const kpis = [
    ['Ricavo/stampo',   fmt(totRicavo),    'somma listino'],
    ['Food cost tot.',  fmt(totFC),        `FC ratio ${fcAvg.toFixed(1)}%`],
    ['Margine lordo',   fmt(totMargine),   `${avgMarg.toFixed(1)}% medio`],
    ['Prodotti',        String(rows.length), 'nel listino'],
  ]
  const cardW = (210 - 14 - 14 - 9) / 4
  kpis.forEach((k, i) => {
    const x = 14 + i * (cardW + 3)
    doc.setFillColor(...LIGHT)
    doc.setDrawColor(...BORDER)
    doc.roundedRect(x, startY, cardW, 26, 2, 2, 'FD')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.setFont('helvetica', 'bold')
    doc.text(k[0].toUpperCase(), x + 4, startY + 7)
    doc.setFontSize(14)
    doc.setTextColor(...DARK)
    doc.text(k[1], x + 4, startY + 16)
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.setFont('helvetica', 'normal')
    doc.text(k[2], x + 4, startY + 22)
  })

  // Executive insights (se presenti)
  let y = startY + 26 + 8
  const insights = Array.isArray(dati.insights) ? dati.insights : []
  if (insights.length) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('Insights chiave', 14, y)
    autoTable(doc, {
      startY: y + 4,
      head: [['', 'Insight']],
      body: insights.map(ins => [
        ins.tipo === 'critical' ? 'CRITICO' : ins.tipo === 'warn' ? 'ATTENZIONE' : 'OK',
        ins.testo,
      ]),
      theme: 'plain',
      bodyStyles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 28, fontSize: 8 },
        1: { textColor: DARK },
      },
      didParseCell: (data) => {
        if (data.column.index === 0) {
          const t = insights[data.row.index]?.tipo
          if (t === 'critical') data.cell.styles.textColor = RED
          else if (t === 'warn') data.cell.styles.textColor = [184, 134, 11]
          else data.cell.styles.textColor = [27, 122, 62]
        }
      },
      margin: { left: 14, right: 14 },
    })
    y = (doc.lastAutoTable?.finalY ?? 60) + 8
  }

  // Tabella P&L dettagliata per prodotto
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('P&L per prodotto (per stampo)', 14, y)
  const sorted = [...rows].sort((a, b) => (b.margPct || 0) - (a.margPct || 0))
  autoTable(doc, {
    startY: y + 4,
    head: [['Prodotto', 'Un./st.', '€/un.', 'Ricavo', 'Food cost', 'FC %', 'Margine', 'Marg. %']],
    body: sorted.map(r => [
      r.nome,
      String(r.reg?.unita ?? '—'),
      fmt(r.reg?.prezzo),
      fmt(r.ricavo),
      fmt(r.fc),
      `${(r.fcPct || 0).toFixed(1)}%`,
      fmt(r.margine),
      `${(r.margPct || 0).toFixed(1)}%`,
    ]).concat([
      [
        { content: 'TOTALE / MEDIA', colSpan: 3, styles: { fontStyle: 'bold' } },
        { content: fmt(totRicavo), styles: { fontStyle: 'bold' } },
        { content: fmt(totFC),     styles: { fontStyle: 'bold' } },
        { content: `${fcAvg.toFixed(1)}%`, styles: { fontStyle: 'bold' } },
        { content: fmt(totMargine), styles: { fontStyle: 'bold' } },
        { content: `${avgMarg.toFixed(1)}%`, styles: { fontStyle: 'bold' } },
      ],
    ]),
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index < sorted.length) {
        const r = sorted[data.row.index]
        if (data.column.index === 5) {
          const p = r.fcPct || 0
          data.cell.styles.textColor = p < 30 ? [27, 122, 62] : p < 40 ? [184, 134, 11] : RED
          data.cell.styles.fontStyle = 'bold'
        }
        if (data.column.index === 7) {
          const p = r.margPct || 0
          data.cell.styles.textColor = p >= 60 ? [27, 122, 62] : p >= 40 ? [184, 134, 11] : RED
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
    margin: { left: 14, right: 14 },
  })

  // Sensitivity: FC +10% / +20%
  let y2 = (doc.lastAutoTable?.finalY ?? 60) + 10
  if (y2 > 240) { doc.addPage(); y2 = 20 }
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text('Sensitivity: cosa succede se i costi salgono', 14, y2)
  autoTable(doc, {
    startY: y2 + 4,
    head: [['Prodotto', 'Marg. attuale', 'FC +10% → marg.', 'FC +20% → marg.', 'Headroom FC']],
    body: sorted.map(r => {
      const m10 = (r.ricavo || 0) - (r.fc || 0) * 1.10
      const m20 = (r.ricavo || 0) - (r.fc || 0) * 1.20
      const headroom = r.fc > 0 ? ((r.ricavo / r.fc - 1) * 100) : 0
      return [r.nome, fmt(r.margine), fmt(m10), fmt(m20), `+${headroom.toFixed(0)}%`]
    }),
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  // Top ingredienti (se forniti)
  if (Array.isArray(dati.topIngredienti) && dati.topIngredienti.length) {
    let y3 = (doc.lastAutoTable?.finalY ?? 60) + 10
    if (y3 > 240) { doc.addPage(); y3 = 20 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('Top ingredienti per costo annuo proiettato', 14, y3)
    autoTable(doc, {
      startY: y3 + 4,
      head: [['#', 'Ingrediente', 'Costo totale', 'Peso % FC']],
      body: dati.topIngredienti.slice(0, 12).map((ing, i) => [
        String(i + 1),
        ing.nome,
        fmt(ing.costoTot || ing.costo),
        `${(ing.perc || 0).toFixed(1)}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { halign: 'right', cellWidth: 12 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })
  }

  addDiagonalWatermark(doc, emailUtente)
  addFooter(doc, { emailUtente, nomeAttivita })
  doc.save(`pl-completo-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── 2c. Simulatore prezzi (food cost what-if) ───────────────────────────────
// Esporta scenario corrente del SimulatorePrezziView: prezzo base vs nuovo,
// delta margine per stampo + proiezione su orizzonte selezionato.
//
// Input:
//   {
//     orizzonteGiorni: number,
//     scenRows: [{ nome, reg, fc, margine, margPct, newPrezzo, delta, newRicavo, newMarg, newMargPct, diffMarg, proiBase, proiScen, proiDiff, mediaStampi, changed }],
//     totBaseRicavo, totScenRicavo, totBaseMarg, totScenMarg, totProiBase, totProiScen, totProiDiff,
//     fcAvgPct?: number,
//     raccomandazioni?: [string],
//   }
export async function exportSimulatorePrezzi(dati, nomeAttivita, emailUtente) {
  const { jsPDF, autoTable } = await ensurePdf()
  const doc = new jsPDF()
  setPdfMetadata(doc, { titolo: 'Simulatore prezzi & food cost', emailUtente, nomeAttivita })
  addHeader(doc, 'Simulatore prezzi', `Proiezione a ${dati.orizzonteGiorni || 30} giorni`, nomeAttivita)

  const startY = 52
  const changed = (dati.scenRows || []).filter(r => r.changed)
  const totDiffMarg = (dati.totScenMarg || 0) - (dati.totBaseMarg || 0)

  // KPI strip 3 card
  const kpis = [
    ['Margine/st. base',     fmt(dati.totBaseMarg || 0), 'prezzi attuali'],
    ['Margine/st. scenario', fmt(dati.totScenMarg || 0), `${totDiffMarg >= 0 ? '+' : ''}${fmt(totDiffMarg)} vs base`],
    ['Δ margine proiettato', `${(dati.totProiDiff || 0) >= 0 ? '+' : ''}${fmt(dati.totProiDiff || 0)}`, `${dati.orizzonteGiorni || 30} gg`],
  ]
  const cardW = (210 - 14 - 14 - 6) / 3
  kpis.forEach((k, i) => {
    const x = 14 + i * (cardW + 3)
    doc.setFillColor(i === 2 ? DARK[0] : LIGHT[0], i === 2 ? DARK[1] : LIGHT[1], i === 2 ? DARK[2] : LIGHT[2])
    doc.setDrawColor(...BORDER)
    doc.roundedRect(x, startY, cardW, 26, 2, 2, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(i === 2 ? 200 : GRAY[0], i === 2 ? 150 : GRAY[1], i === 2 ? 130 : GRAY[2])
    doc.text(k[0].toUpperCase(), x + 4, startY + 7)
    doc.setFontSize(14)
    doc.setTextColor(i === 2 ? 255 : DARK[0], i === 2 ? 255 : DARK[1], i === 2 ? 255 : DARK[2])
    doc.text(k[1], x + 4, startY + 16)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(i === 2 ? 200 : GRAY[0], i === 2 ? 150 : GRAY[1], i === 2 ? 130 : GRAY[2])
    doc.text(k[2], x + 4, startY + 22)
  })

  let y = startY + 26 + 8

  // Raccomandazioni automatiche
  const rec = Array.isArray(dati.raccomandazioni) ? dati.raccomandazioni : []
  if (rec.length) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text('Raccomandazioni', 14, y)
    autoTable(doc, {
      startY: y + 4,
      head: [],
      body: rec.map(r => ['•', r]),
      theme: 'plain',
      bodyStyles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 6, textColor: RED, fontStyle: 'bold' }, 1: { textColor: DARK } },
      margin: { left: 14, right: 14 },
    })
    y = (doc.lastAutoTable?.finalY ?? 60) + 8
  }

  // Scenario dettagliato per prodotto (mostra solo quelli con modifiche se ce ne sono, altrimenti tutti)
  const display = changed.length ? changed : (dati.scenRows || [])
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(changed.length ? `Scenario per prodotto (${changed.length} modificati)` : 'Listino corrente', 14, y)
  autoTable(doc, {
    startY: y + 4,
    head: [['Prodotto', 'Prezzo base', 'Prezzo scen.', 'Δ %', 'Marg. base', 'Marg. scen.', 'Δ marg./st.', `Δ ${dati.orizzonteGiorni || 30}g`]],
    body: display.map(r => [
      r.nome,
      fmt(r.reg?.prezzo),
      fmt(r.newPrezzo),
      r.changed ? `${r.delta > 0 ? '+' : ''}${(r.delta || 0).toFixed(1)}%` : '—',
      fmt(r.margine),
      fmt(r.newMarg),
      r.changed ? `${r.diffMarg > 0 ? '+' : ''}${fmt(r.diffMarg)}` : '—',
      r.changed ? `${r.proiDiff > 0 ? '+' : ''}${fmt(r.proiDiff)}` : '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const r = display[data.row.index]
        if (!r) return
        if (data.column.index === 3 && r.changed) {
          data.cell.styles.textColor = r.delta > 0 ? [27, 122, 62] : RED
          data.cell.styles.fontStyle = 'bold'
        }
        if (data.column.index === 6 && r.changed) {
          data.cell.styles.textColor = r.diffMarg > 0 ? [27, 122, 62] : RED
          data.cell.styles.fontStyle = 'bold'
        }
        if (data.column.index === 7 && r.changed) {
          data.cell.styles.textColor = r.proiDiff > 0 ? [27, 122, 62] : RED
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
    margin: { left: 14, right: 14 },
  })

  addDiagonalWatermark(doc, emailUtente)
  addFooter(doc, { emailUtente, nomeAttivita })
  doc.save(`simulatore-prezzi-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── 3. Produzione giornaliera ────────────────────────────────────────────────
export async function exportProduzione(dati, data, nomeAttivita, emailUtente) {
  const { jsPDF, autoTable } = await ensurePdf()
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
    curY = (doc.lastAutoTable?.finalY ?? 60) + 8
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

  addFooter(doc, { emailUtente, nomeAttivita })
  doc.save(`produzione-${(data || 'export').replace(/\//g, '-')}.pdf`)
}

// ─── 4. Scadenzario fatture ───────────────────────────────────────────────────
export async function exportScadenzario(fatture, nomeAttivita, emailUtente) {
  const { jsPDF, autoTable } = await ensurePdf()
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
    startY = (doc.lastAutoTable?.finalY ?? 60) + 8
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

  addFooter(doc, { emailUtente, nomeAttivita })
  doc.save('scadenzario-fatture.pdf')
}
