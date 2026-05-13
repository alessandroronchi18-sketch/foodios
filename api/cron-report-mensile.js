// Eseguito ogni primo del mese alle 7:00 via Vercel Cron
// Genera report PDF mensile per ogni org attiva e lo invia via email

const FROM = 'FoodOS <noreply@foodios.it>'
const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function mesePrecedente() {
  const now = new Date()
  const anno = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const mese = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  return { anno, mese, label: `${MESI_IT[mese]} ${anno}` }
}

// Recupera dato JSON da user_data per una org/sede
async function getData(supabase, orgId, sedeId, key) {
  const query = supabase
    .from('user_data')
    .select('data_value')
    .eq('organization_id', orgId)
    .eq('data_key', key)
  if (sedeId) query.eq('sede_id', sedeId)
  else query.is('sede_id', null)
  const { data } = await query.single()
  return data?.data_value ?? null
}

function filtroMese(items, anno, mese, getDate) {
  return (items || []).filter(item => {
    const d = new Date(getDate(item))
    return d.getFullYear() === anno && d.getMonth() === mese
  })
}

// Genera testo ASCII per grafico ricavi settimanali
function graficoPestimanale(chiusureMese) {
  const settimane = [0, 0, 0, 0, 0]
  for (const c of chiusureMese) {
    const d = new Date(c.data)
    const settimana = Math.min(Math.floor((d.getDate() - 1) / 7), 4)
    settimane[settimana] += (c.kpi?.totV || 0)
  }
  const max = Math.max(...settimane, 1)
  let lines = []
  for (let i = 0; i < 5; i++) {
    const pct = Math.round((settimane[i] / max) * 20)
    const bar = '█'.repeat(pct) + '░'.repeat(20 - pct)
    lines.push(`Sett.${i + 1}  ${bar}  €${settimane[i].toFixed(0)}`)
  }
  return lines.join('\n')
}

async function generaPDF(org, dati, periodo) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { chiusure, prodotti5, fornitori5, mesePrecKpi } = dati

  const pW = 210
  let y = 20

  const addLine = (text, x, yPos, size = 10, style = 'normal', color = [15, 23, 42]) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
    doc.setTextColor(...color)
    doc.text(text, x, yPos)
  }

  // Header
  doc.setFillColor(192, 57, 43)
  doc.rect(0, 0, pW, 38, 'F')
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`Report FoodOS — ${periodo.label}`, 14, 18)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(org.nome_attivita || org.nome || 'La tua attività', 14, 30)
  y = 52

  // KPI principali
  addLine('KPI PRINCIPALI', 14, y, 9, 'bold', [148, 163, 184])
  y += 7
  const kpiTotV = chiusure.reduce((s, c) => s + (c.kpi?.totV || 0), 0)
  const kpiTotFC = chiusure.reduce((s, c) => s + (c.kpi?.totFC || 0), 0)
  const kpiFoodCost = kpiTotV > 0 ? (kpiTotFC / kpiTotV * 100) : 0
  const fatturePagate = (dati.fatture || []).filter(f => f.stato === 'pagata').length

  const kpiItems = [
    ['Ricavi totali', `€ ${kpiTotV.toFixed(2)}`],
    ['Food cost medio', `${kpiFoodCost.toFixed(1)}%`],
    ['Prodotto più venduto', dati.topProdotto || '—'],
    ['Fatture pagate', String(fatturePagate)],
  ]
  for (const [label, val] of kpiItems) {
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(14, y, 86, 16, 3, 3, 'F')
    addLine(label, 18, y + 6, 9, 'normal', [71, 85, 105])
    addLine(val, 18, y + 13, 11, 'bold', [15, 23, 42])
    y += 20
  }

  // Grafico ricavi settimanali
  y += 4
  addLine('RICAVI SETTIMANALI', 14, y, 9, 'bold', [148, 163, 184])
  y += 7
  doc.setFontSize(8)
  doc.setFont('courier', 'normal')
  doc.setTextColor(71, 85, 105)
  const grafico = graficoPestimanale(chiusure)
  for (const riga of grafico.split('\n')) {
    doc.text(riga, 14, y)
    y += 6
  }

  // Top 5 prodotti per margine
  if (prodotti5.length > 0) {
    y += 4
    if (y > 230) { doc.addPage(); y = 20 }
    addLine('TOP 5 PRODOTTI PER MARGINE', 14, y, 9, 'bold', [148, 163, 184])
    y += 7
    for (const [i, p] of prodotti5.entries()) {
      addLine(`${i + 1}. ${p.nome}`, 14, y, 10, 'normal', [15, 23, 42])
      addLine(`${p.margine.toFixed(1)}%`, 160, y, 10, 'bold', [192, 57, 43])
      y += 7
    }
  }

  // Top 5 fornitori per spesa
  if (fornitori5.length > 0) {
    y += 4
    if (y > 210) { doc.addPage(); y = 20 }
    addLine('TOP 5 FORNITORI PER SPESA', 14, y, 9, 'bold', [148, 163, 184])
    y += 7
    for (const [i, f] of fornitori5.entries()) {
      addLine(`${i + 1}. ${f.fornitore}`, 14, y, 10, 'normal', [15, 23, 42])
      addLine(`€ ${f.totale.toFixed(2)}`, 155, y, 10, 'bold', [15, 23, 42])
      y += 7
    }
  }

  // Confronto mese precedente
  if (mesePrecKpi) {
    y += 4
    if (y > 220) { doc.addPage(); y = 20 }
    addLine('CONFRONTO CON MESE PRECEDENTE', 14, y, 9, 'bold', [148, 163, 184])
    y += 7
    const deltaV = mesePrecKpi.totV > 0 ? ((kpiTotV - mesePrecKpi.totV) / mesePrecKpi.totV * 100) : null
    const segno = deltaV === null ? '—' : (deltaV >= 0 ? `+${deltaV.toFixed(1)}%` : `${deltaV.toFixed(1)}%`)
    const colore = deltaV === null ? [71, 85, 105] : deltaV >= 0 ? [22, 163, 74] : [192, 57, 43]
    addLine('Variazione ricavi:', 14, y, 10, 'normal', [71, 85, 105])
    addLine(segno, 100, y, 11, 'bold', colore)
    y += 8
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFillColor(248, 250, 252)
  doc.rect(0, pageH - 14, pW, 14, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('Generato automaticamente da FoodOS', 14, pageH - 5)
  doc.text(`${new Date().toLocaleDateString('it-IT')}`, pW - 14, pageH - 5, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}

async function elaboraOrg(supabase, org, { anno, mese, label }) {
  const { data: sedi } = await supabase
    .from('sedi')
    .select('id, nome')
    .eq('organization_id', org.id)
    .eq('attiva', true)
    .limit(1)

  const sedeId = sedi?.[0]?.id || null

  // Carica dati
  const chiusureAll = await getData(supabase, org.id, sedeId, 'pasticceria-chiusure-v1') || []
  const giornalieroAll = await getData(supabase, org.id, sedeId, 'pasticceria-giornaliero-v1') || []
  const ricettario = await getData(supabase, org.id, null, 'pasticceria-ricettario-v1') || { ricette: {} }

  // Filtra al mese corrente
  const chiusure = filtroMese(chiusureAll, anno, mese, c => c.data)
  if (chiusure.length === 0) return null // niente dati → niente report

  // Fatture dal Scadenzario
  const { data: fattureRows } = await supabase
    .from('user_data')
    .select('data_value')
    .eq('organization_id', org.id)
    .eq('data_key', 'scadenzario-fatture-v1')
  const fattureAll = fattureRows?.[0]?.data_value || []
  const fatture = filtroMese(fattureAll, anno, mese, f => f.data_fattura || f.data)

  // Top prodotto più venduto nel mese
  const prodQta = {}
  for (const c of chiusure) {
    for (const v of (c.venduto || [])) {
      const k = v.nome.toUpperCase().trim()
      prodQta[k] = (prodQta[k] || 0) + (v.qta || 0)
    }
  }
  const topProdotto = Object.entries(prodQta).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

  // Top 5 prodotti per margine dal ricettario
  const prodotti5 = Object.values(ricettario.ricette || {})
    .filter(r => r.tipo !== 'semilavorato' && r.tipo !== 'interno')
    .map(r => {
      const fc = (r.ingredienti || []).reduce((s, ing) => {
        const costo = ricettario.ingredienti_costi?.[ing.nome.toUpperCase()] || 0
        return s + costo * (ing.grammi || 0) / 1000
      }, 0)
      const ricavoStampo = (r.prezzo || 0) * (r.unita || 1)
      const margine = ricavoStampo > 0 ? ((ricavoStampo - fc) / ricavoStampo * 100) : 0
      return { nome: r.nome, margine }
    })
    .sort((a, b) => b.margine - a.margine)
    .slice(0, 5)

  // Top 5 fornitori per spesa
  const forniSpesa = {}
  for (const f of fatture) {
    const k = f.fornitore || 'Sconosciuto'
    forniSpesa[k] = (forniSpesa[k] || 0) + (f.totale || 0)
  }
  const fornitori5 = Object.entries(forniSpesa)
    .map(([fornitore, totale]) => ({ fornitore, totale }))
    .sort((a, b) => b.totale - a.totale)
    .slice(0, 5)

  // Mese precedente KPI
  const mesePrecAnno = mese === 0 ? anno - 1 : anno
  const mesePrecMese = mese === 0 ? 11 : mese - 1
  const chiusurePrec = filtroMese(chiusureAll, mesePrecAnno, mesePrecMese, c => c.data)
  const mesePrecKpi = chiusurePrec.length > 0 ? {
    totV: chiusurePrec.reduce((s, c) => s + (c.kpi?.totV || 0), 0),
  } : null

  const dati = { chiusure, fatture, topProdotto, prodotti5, fornitori5, mesePrecKpi }

  // Genera PDF
  const pdfBuffer = await generaPDF(org, dati, { label })

  // Salva su Supabase Storage
  const filename = `${org.id}/report-${anno}-${String(mese + 1).padStart(2, '0')}.pdf`
  await supabase.storage
    .from('reports')
    .upload(filename, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  // Crea notifica in-app
  await supabase.from('notifiche').insert({
    organization_id: org.id,
    tipo: 'report_disponibile',
    titolo: `Report ${label} disponibile`,
    messaggio: `Il report mensile di ${label} è pronto. Scaricalo dalle Impostazioni.`,
    link: null,
  })

  // Recupera email titolare
  const { data: prof } = await supabase
    .from('profiles')
    .select('email, nome_completo')
    .eq('organization_id', org.id)
    .eq('ruolo', 'titolare')
    .single()

  // Controlla se l'org vuole ricevere email
  const { data: settRow } = await supabase
    .from('user_data')
    .select('data_value')
    .eq('organization_id', org.id)
    .eq('data_key', 'report-settings-v1')
    .is('sede_id', null)
    .single()
  const emailReport = settRow?.data_value?.emailReport !== false // default true

  if (prof?.email && emailReport) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to: prof.email,
      subject: `Report FoodOS — ${label}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
          <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">📊 Report ${label}</h1>
          <p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0 0 16px;">
            Ciao ${prof.nome_completo || ''},<br>
            il report mensile di <strong>${label}</strong> per <strong>${org.nome_attivita || org.nome}</strong> è pronto.
          </p>
          <p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0 0 24px;">
            Trovi il PDF allegato a questa email e disponibile nella sezione <strong>Impostazioni → Report</strong> dell'app.
          </p>
          <hr style="border:none;border-top:1px solid #E8DDD8;margin:20px 0;">
          <p style="color:#9C7B76;font-size:11px;">
            Generato automaticamente da FoodOS &mdash;
            <a href="https://foodios.it" style="color:#C0392B;">foodios.it</a>
          </p>
        </div>
      `,
      attachments: [{
        filename: `report-${label.toLowerCase().replace(' ', '-')}.pdf`,
        content: pdfBuffer,
      }],
    })
  }

  return { orgId: org.id, label }
}

export default async function handler(req) {
  // Protezione: richiedi il CRON_SECRET o authorization header di Vercel
  const authHeader = req.headers.get ? req.headers.get('authorization') : req.headers?.authorization
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = await getSupabase()
  const periodo = mesePrecedente()

  // Recupera tutte le org attive (trial o paganti)
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, nome, nome_attivita, piano, approvato, attivo')
    .eq('attivo', true)
    .eq('approvato', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results = []
  for (const org of orgs || []) {
    try {
      const res = await elaboraOrg(supabase, org, periodo)
      if (res) results.push({ ...res, ok: true })
      else results.push({ orgId: org.id, ok: false, reason: 'no_data' })
    } catch (e) {
      console.error(`Errore org ${org.id}:`, e)
      results.push({ orgId: org.id, ok: false, error: e.message })
    }
  }

  return new Response(JSON.stringify({ periodo: periodo.label, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
