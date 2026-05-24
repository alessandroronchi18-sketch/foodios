import React, { useEffect, useMemo, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import useIsMobile from '../lib/useIsMobile'

export const SK_EVENTI = 'pasticceria-eventi-v1'

const card = { background: '#FFF', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 16 }
const lbl  = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }
const inp  = { width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }
const btn = (bg, fg) => ({ padding: '9px 16px', background: bg, color: fg, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' })

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }
function fmtEur(n) { return `€ ${Number(n || 0).toFixed(2)}` }
function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) }
  catch { return d }
}

async function exportPreventivoPDF(evento, ricetteMap, ingCosti, nomeAttivita) {
  const { default: jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF()
  const RED = [192, 57, 43]
  const DARK = [28, 10, 10]
  const GRAY = [107, 76, 68]

  doc.setFillColor(...DARK); doc.rect(0, 0, 210, 24, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text('PREVENTIVO', 14, 14)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text(nomeAttivita || '', 14, 20)
  const now = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(8); doc.text(`Emesso il ${now}`, 196, 14, { align: 'right' })

  doc.setTextColor(...DARK); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text(`Cliente: ${evento.cliente || '—'}`, 14, 38)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY)
  doc.text(`Data evento: ${fmtDate(evento.data)}`, 14, 44)
  if (evento.note) {
    doc.text(`Note: ${evento.note}`, 14, 50)
  }

  // Tabella prodotti
  const head = [['Prodotto', 'Quantità', 'Prezzo unit.', 'Totale']]
  const body = (evento.righe || []).map(r => {
    const ric = ricetteMap[r.nome]
    const prezzo = Number(r.prezzo || ric?.reg?.prezzo || 0)
    const qty = Number(r.qty || 0)
    return [r.nome, String(qty), fmtEur(prezzo), fmtEur(qty * prezzo)]
  })
  autoTable(doc, {
    startY: 60, head, body,
    headStyles: { fillColor: RED, textColor: [255,255,255], fontStyle: 'bold' },
    bodyStyles: { fontSize: 10 },
    margin: { left: 14, right: 14 },
  })

  const totale = (evento.righe || []).reduce((s, r) => {
    const ric = ricetteMap[r.nome]
    const prezzo = Number(r.prezzo || ric?.reg?.prezzo || 0)
    return s + Number(r.qty || 0) * prezzo
  }, 0)
  const acconto = Number(evento.acconto || 0)
  const saldo = totale - acconto

  const yEnd = doc.lastAutoTable.finalY + 8
  doc.setTextColor(...DARK); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('TOTALE', 130, yEnd); doc.text(fmtEur(totale), 196, yEnd, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Acconto ricevuto', 130, yEnd + 7); doc.text(fmtEur(acconto), 196, yEnd + 7, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...RED)
  doc.text('Saldo da incassare', 130, yEnd + 15); doc.text(fmtEur(saldo), 196, yEnd + 15, { align: 'right' })

  doc.setTextColor(...GRAY); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('Preventivo valido 30 giorni dalla data di emissione. Pagamento secondo accordi.', 14, 280)

  const filename = `preventivo_${(evento.cliente || 'evento').replace(/\s+/g, '_')}_${evento.data || ''}.pdf`
  doc.save(filename)
}

export default function EventiView({ orgId, sedeId, ricettario, notify, nomeAttivita }) {
  const isMobile = useIsMobile()
  const [eventi, setEventi] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // id evento aperto in form
  const [draft, setDraft] = useState(null)

  // Mappa ricette + costi per il calcolo FC
  const ricetteMap = useMemo(() => {
    const m = {}
    for (const r of Object.values(ricettario?.ricette || {})) {
      // FC totale per stampo dal campo `fc` o calcolato; per semplicità usa r.foodCost o r.fc_totale
      // Se non c'è, prova a stimare da ingredienti × prezzi.
      m[r.nome] = r
    }
    return m
  }, [ricettario])

  useEffect(() => {
    if (!orgId) return
    sload(SK_EVENTI, orgId, sedeId || null).then(v => {
      setEventi(Array.isArray(v) ? v : [])
      setLoading(false)
    })
  }, [orgId, sedeId])

  async function salvaTutti(next) {
    setEventi(next)
    try { await ssave(SK_EVENTI, next, orgId, sedeId || null) }
    catch (e) { notify?.('⚠ Errore salvataggio: ' + e.message, false) }
  }

  function nuovo() {
    setDraft({
      id: uid(),
      cliente: '',
      data: new Date().toISOString().slice(0, 10),
      righe: [],
      acconto: 0,
      note: '',
      _new: true,
    })
    setEditing('new')
  }

  function modifica(ev) {
    setDraft({ ...ev, righe: [...(ev.righe || [])] })
    setEditing(ev.id)
  }

  function aggiungiRiga() {
    setDraft(d => ({ ...d, righe: [...(d.righe || []), { id: uid(), nome: '', qty: 1, prezzo: 0 }] }))
  }
  function aggiornaRiga(id, patch) {
    setDraft(d => ({ ...d, righe: d.righe.map(r => r.id === id ? { ...r, ...patch } : r) }))
  }
  function rimuoviRiga(id) {
    setDraft(d => ({ ...d, righe: d.righe.filter(r => r.id !== id) }))
  }

  async function salva() {
    if (!draft.cliente.trim()) return notify?.('Cliente obbligatorio', false)
    if (!draft.data) return notify?.('Data obbligatoria', false)
    const norm = {
      ...draft,
      _new: undefined,
      righe: (draft.righe || []).filter(r => r.nome && Number(r.qty) > 0)
        .map(r => ({ ...r, qty: Number(r.qty), prezzo: Number(r.prezzo) || 0 })),
      acconto: Number(draft.acconto) || 0,
      updated_at: new Date().toISOString(),
    }
    const next = draft._new
      ? [norm, ...eventi]
      : eventi.map(e => e.id === draft.id ? norm : e)
    await salvaTutti(next)
    setEditing(null); setDraft(null)
    notify?.('✓ Evento salvato')
  }

  async function elimina(id) {
    if (!confirm('Eliminare questo evento?')) return
    await salvaTutti(eventi.filter(e => e.id !== id))
    notify?.('✓ Evento eliminato')
  }

  function calcolaTotali(ev) {
    let totRicavo = 0, totFC = 0
    for (const r of (ev.righe || [])) {
      const ric = ricetteMap[r.nome]
      const prezzo = Number(r.prezzo || ric?.reg?.prezzo || 0)
      const qty = Number(r.qty || 0)
      const fcStampo = Number(ric?.foodCost || ric?.fc || 0)
      totRicavo += qty * prezzo
      totFC += qty * fcStampo
    }
    return { totRicavo, totFC, margine: totRicavo - totFC, margPct: totRicavo > 0 ? ((totRicavo - totFC) / totRicavo * 100) : 0 }
  }

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento…</div>

  const ricetteList = Object.values(ricettario?.ricette || {}).map(r => r.nome).sort()

  return (
    <div style={{ maxWidth: 1100, padding: isMobile ? 8 : 0 }}>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          Preventivi, prenotazioni e catering — {eventi.length} evento/i in archivio
        </div>
        {editing == null && (
          <button onClick={nuovo} style={btn('#8B1A1A', '#FFF')}>+ Nuovo evento</button>
        )}
      </div>

      {editing != null && draft && (
        <div style={{ ...card, border: '2px solid #8B1A1A', background: '#FEF7F5' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 14 }}>
            {draft._new ? 'Nuovo evento' : 'Modifica evento'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Cliente *</label>
              <input value={draft.cliente} onChange={e => setDraft(d => ({ ...d, cliente: e.target.value }))}
                placeholder="Nome cliente o ragione sociale" style={inp} />
            </div>
            <div>
              <label style={lbl}>Data evento *</label>
              <input type="date" value={draft.data} onChange={e => setDraft(d => ({ ...d, data: e.target.value }))} style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Note</label>
            <input value={draft.note || ''} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              placeholder="Indicazioni, allergie, orari…" style={inp} />
          </div>

          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ ...lbl, marginBottom: 0 }}>Prodotti</div>
            <button onClick={aggiungiRiga} style={btn('#0F172A', '#FFF')}>+ Aggiungi riga</button>
          </div>
          {(draft.righe || []).length === 0 && (
            <div style={{ fontSize: 12, color: '#94A3B8', padding: '12px 0', fontStyle: 'italic' }}>
              Nessun prodotto. Aggiungi almeno una riga.
            </div>
          )}
          {(draft.righe || []).map(r => {
            const ric = ricetteMap[r.nome]
            const fcStampo = Number(ric?.foodCost || ric?.fc || 0)
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2.4fr 0.8fr 0.8fr 0.6fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input list="ricette-list" value={r.nome}
                  onChange={e => {
                    const nome = e.target.value
                    const found = ricetteMap[nome]
                    aggiornaRiga(r.id, { nome, prezzo: r.prezzo || Number(found?.reg?.prezzo || 0) })
                  }}
                  placeholder="Nome prodotto / ricetta" style={inp} />
                <input type="number" min="0" step="1" value={r.qty}
                  onChange={e => aggiornaRiga(r.id, { qty: e.target.value })}
                  placeholder="Quantità" style={inp} />
                <input type="number" min="0" step="0.01" value={r.prezzo}
                  onChange={e => aggiornaRiga(r.id, { prezzo: e.target.value })}
                  placeholder="Prezzo €" style={inp} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#64748B', flex: 1 }}>FC {fmtEur(fcStampo * Number(r.qty || 0))}</div>
                  <button onClick={() => rimuoviRiga(r.id)}
                    style={{ padding: '6px 10px', background: '#FFF5F5', color: '#8B1A1A', border: '1px solid #FCA5A5', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              </div>
            )
          })}
          <datalist id="ricette-list">
            {ricetteList.map(n => <option key={n} value={n} />)}
          </datalist>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div>
              <label style={lbl}>Acconto ricevuto €</label>
              <input type="number" min="0" step="0.01" value={draft.acconto}
                onChange={e => setDraft(d => ({ ...d, acconto: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* Anteprima totali */}
          {(draft.righe || []).length > 0 && (() => {
            const t = calcolaTotali(draft)
            const saldo = t.totRicavo - Number(draft.acconto || 0)
            return (
              <div style={{ marginTop: 18, padding: 14, background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 10, display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
                <div><div style={lbl}>Totale</div><div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{fmtEur(t.totRicavo)}</div></div>
                <div><div style={lbl}>Food cost</div><div style={{ fontSize: 18, fontWeight: 800, color: '#92400E' }}>{fmtEur(t.totFC)}</div></div>
                <div><div style={lbl}>Margine</div><div style={{ fontSize: 18, fontWeight: 800, color: t.margPct >= 50 ? '#10B981' : t.margPct >= 30 ? '#F59E0B' : '#8B1A1A' }}>{fmtEur(t.margine)} ({t.margPct.toFixed(0)}%)</div></div>
                <div><div style={lbl}>Saldo</div><div style={{ fontSize: 18, fontWeight: 800, color: '#8B1A1A' }}>{fmtEur(saldo)}</div></div>
              </div>
            )
          })()}

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button onClick={salva} style={btn('#8B1A1A', '#FFF')}>Salva evento</button>
            <button onClick={() => { setEditing(null); setDraft(null) }}
              style={{ ...btn('transparent', '#64748B'), border: '1px solid #E2E8F0' }}>Annulla</button>
          </div>
        </div>
      )}

      {editing == null && eventi.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Nessun evento ancora.</div>
          <div style={{ fontSize: 12 }}>Crea il primo preventivo per un catering o una prenotazione.</div>
        </div>
      )}

      {editing == null && eventi.map(ev => {
        const t = calcolaTotali(ev)
        const saldo = t.totRicavo - Number(ev.acconto || 0)
        const isPassato = new Date(ev.data + 'T23:59:59') < new Date()
        return (
          <div key={ev.id} style={{ ...card, opacity: isPassato ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{ev.cliente || 'Cliente —'}</span>
                  {isPassato && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>PASSATO</span>}
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  📅 {fmtDate(ev.data)} · {(ev.righe || []).length} prodotti
                </div>
                {ev.note && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' }}>{ev.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A' }}>{fmtEur(t.totRicavo)}</div>
                <div style={{ fontSize: 11, color: t.margPct >= 50 ? '#10B981' : t.margPct >= 30 ? '#F59E0B' : '#8B1A1A', fontWeight: 700 }}>
                  margine {t.margPct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  Saldo {fmtEur(saldo)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => modifica(ev)}
                style={{ padding: '6px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#64748B', cursor: 'pointer' }}>
                Modifica
              </button>
              <button onClick={() => exportPreventivoPDF(ev, ricetteMap, null, nomeAttivita)}
                style={{ padding: '6px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#1E40AF', cursor: 'pointer' }}>
                📄 Esporta PDF
              </button>
              <button onClick={() => elimina(ev.id)}
                style={{ padding: '6px 12px', background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#8B1A1A', cursor: 'pointer' }}>
                Elimina
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
