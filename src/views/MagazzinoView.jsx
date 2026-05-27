// MagazzinoView + ProdottiFinitiTab + PrezziIngredientiTab — estratti da Dashboard.jsx.
// KPI e calcolaFabbisognoSettimana inline (uso interno al modulo).
//
// Persistenza: richiede orgId/sedeId come props per chiamare ssave da lib/storage
// (prima usava la wrapper locale di Dashboard.jsx che leggeva _ctx_*).

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { ssave as _ssave } from '../lib/storage'
import { normIng, getR, translateIngredienteEN } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { SK_MAG, SK_EXCL, SK_LOGRIF } from '../lib/storageKeys'
import FotoOCR from '../components/FotoOCR'
import {
  C, TNUM, PageHeader, useSortable, SortTH,
} from './_shared'

// ─── KPI Card (interna al modulo) ────────────────────────────────────────────
function KPI({ label, value, sub, color, highlight, icon }) {
  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
      border: `1px solid ${highlight ? '#4A0612' : T.border}`, borderRadius: 14,
      padding: '20px 22px',
      boxShadow: highlight ? '0 12px 28px rgba(110,14,26,0.34), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 1px 2px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.04)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.76)' : T.textSoft, marginBottom: 10 }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: highlight ? T.textOnDark : color || T.text,
        letterSpacing: '-0.03em', lineHeight: 1.05, ...TNUM }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 7, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

// ─── Calcolo fabbisogno settimanale (helper) ─────────────────────────────────
function calcolaFabbisognoSettimana(ricettario, giornaliero) {
  const ultimi7 = [...(giornaliero || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 7)
  const fabb = {}
  for (const sess of ultimi7) {
    for (const prod of (sess.prodotti || [])) {
      const ric = Object.values(ricettario?.ricette || {}).find(r => r.nome === prod.nome)
      if (!ric) continue
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        fabb[k] = (fabb[k] || 0) + ing.qty1stampo * prod.stampi
      }
    }
  }
  // Fallback: nessun storico → stima 1 stampo/ricetta/settimana
  if (ultimi7.length === 0 && ricettario) {
    for (const ric of Object.values(ricettario.ricette || {})) {
      if (getR(ric.nome, ric).tipo === 'interno') continue
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        fabb[k] = (fabb[k] || 0) + ing.qty1stampo
      }
    }
  }
  return fabb
}

// ─── ProdottiFinitiTab (stock prodotti finiti per sede) ──────────────────────
function ProdottiFinitiTab({ notify, orgId, sedeId }) {
  const isMobile = useIsMobile()
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [scartoForm, setScartoForm] = useState(null)
  const [movimenti, setMovimenti] = useState([])

  const carica = useCallback(async () => {
    if (!orgId || !sedeId) { setLoading(false); return }
    setLoading(true)
    try {
      const { loadStockPF, loadMovimentiPF } = await import('../lib/stockPF')
      const [s, m] = await Promise.all([
        loadStockPF(orgId, sedeId),
        loadMovimentiPF(orgId, sedeId, { limit: 30 }),
      ])
      setStock(s)
      setMovimenti(m)
    } catch (e) {
      notify?.('Errore caricamento stock: ' + e.message, false)
    } finally { setLoading(false) }
  }, [orgId, sedeId, notify])

  useEffect(() => { carica() }, [carica])

  const handleScarto = async () => {
    if (!scartoForm?.prodotto || !(scartoForm.qty > 0)) return
    try {
      const { scartoPF } = await import('../lib/stockPF')
      await scartoPF({ sedeId, prodotto: scartoForm.prodotto, quantita: scartoForm.qty, note: scartoForm.note || null })
      notify('✓ Scarto registrato')
      setScartoForm(null)
      await carica()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    }
  }

  if (!sedeId) return <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Seleziona una sede attiva per vedere lo stock prodotti finiti.</div>
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  const totPezzi = stock.reduce((s, r) => s + Number(r.quantita || 0), 0)
  const sottoSoglia = stock.filter(r => r.soglia_min > 0 && Number(r.quantita) <= Number(r.soglia_min))
  const negativi = stock.filter(r => Number(r.quantita) < 0)

  const CAUSALE_LBL = {
    produzione: { lbl: '🏭 Produzione', col: '#16A34A' },
    trasferimento_invio: { lbl: '🚚 Inviato', col: '#DC2626' },
    trasferimento_ricezione: { lbl: '📦 Ricevuto', col: '#16A34A' },
    vendita: { lbl: '🛒 Vendita', col: '#2563EB' },
    scarto: { lbl: '⚠️ Scarto', col: '#92400E' },
    annullo_trasferimento: { lbl: '↩ Annullo', col: '#94A3B8' },
    rettifica: { lbl: '✏️ Rettifica', col: '#475569' },
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        <KPI icon="📦" label="Prodotti in stock" value={stock.length}/>
        <KPI icon="🧮" label="Pezzi totali" value={totPezzi.toLocaleString('it-IT', { maximumFractionDigits: 0 })}/>
        <KPI icon="⚠️" label="Sotto soglia" value={sottoSoglia.length} color={sottoSoglia.length > 0 ? C.amber : C.green}/>
        <KPI icon="🚨" label="Stock negativo" value={negativi.length} color={negativi.length > 0 ? C.red : C.green} sub={negativi.length > 0 ? 'vendite > carico' : ''}/>
      </div>

      {stock.length === 0 ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: C.textSoft, fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
          Nessun prodotto in stock per questa sede.<br/>
          Lo stock si popola automaticamente alla conferma di una sessione di produzione.
        </div>
      ) : (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                {['Prodotto', 'Disponibili', 'Soglia', 'Aggiornato', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: i === 1 || i === 2 ? 'right' : 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stock.map((r, i) => {
                const q = Number(r.quantita || 0)
                const sotto = r.soglia_min > 0 && q <= Number(r.soglia_min)
                const neg = q < 0
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text }}>{r.prodotto_nome}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: neg ? C.red : sotto ? C.amber : C.text, ...TNUM }}>
                      {q.toLocaleString('it-IT', { maximumFractionDigits: 2 })} {r.unita}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textSoft, ...TNUM }}>
                      {r.soglia_min > 0 ? Number(r.soglia_min).toLocaleString('it-IT') : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: C.textSoft }}>
                      {r.updated_at ? new Date(r.updated_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button onClick={() => setScartoForm({ prodotto: r.prodotto_nome, qty: '', note: '', azzera: false })} disabled={q <= 0}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: q <= 0 ? C.textSoft : C.amber, fontSize: 11, fontWeight: 700, cursor: q <= 0 ? 'not-allowed' : 'pointer', marginRight: 4 }}>
                        Scarto
                      </button>
                      {q > 0 && (
                        <button onClick={() => setScartoForm({ prodotto: r.prodotto_nome, qty: q, note: 'Azzeramento stock (dato fantasma o reset)', azzera: true })}
                          title="Porta a zero lo stock di questo prodotto"
                          style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.red}`, background: '#FFF5F5', color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          Azzera
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {movimenti.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Movimenti recenti</div>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {movimenti.map(m => {
                  const c = CAUSALE_LBL[m.causale] || { lbl: m.causale, col: C.textSoft }
                  const d = Number(m.delta)
                  return (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 14px', fontSize: 10, color: C.textSoft, whiteSpace: 'nowrap' }}>
                        {new Date(m.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '8px 14px', fontWeight: 700, color: C.text }}>{m.prodotto_nome}</td>
                      <td style={{ padding: '8px 14px', fontSize: 11, color: c.col, whiteSpace: 'nowrap' }}>{c.lbl}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: d > 0 ? C.green : d < 0 ? C.red : C.textSoft, ...TNUM }}>
                        {d > 0 ? '+' : ''}{d}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 10, color: C.textSoft, fontStyle: 'italic' }}>{m.note || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scartoForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setScartoForm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, borderRadius: 14, padding: 24, maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: C.text }}>⚠️ Registra scarto</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSoft }}>Prodotto: <strong>{scartoForm.prodotto}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Quantità scartata (pz)</div>
              <input type="number" min="0" step="1" value={scartoForm.qty}
                onChange={e => setScartoForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 14, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Motivo (opzionale)</div>
              <input value={scartoForm.note}
                onChange={e => setScartoForm(f => ({ ...f, note: e.target.value }))}
                placeholder="es. caduti per terra, scaduti, dati a omaggio"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 13, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setScartoForm(null)} style={{ padding: '10px 18px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
              <button onClick={handleScarto} style={{ padding: '10px 18px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Registra scarto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PrezziIngredientiTab ────────────────────────────────────────────────────
function PrezziIngredientiTab({ ricettario, logPrezzi, onUpdatePrezzo, isMobile }) {
  const [search, setSearch] = useState('')
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [confirmKey, setConfirmKey] = useState(null)
  const [confirmVal, setConfirmVal] = useState(null)
  const [confirmDecorre, setConfirmDecorre] = useState(() => new Date().toISOString().slice(0, 10))
  const [showLog, setShowLog] = useState(false)

  const ingredienti = useMemo(() => {
    const map = new Map()
    const costi = ricettario?.ingredienti_costi || {}
    for (const ric of Object.values(ricettario?.ricette || {})) {
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome || '')
        if (!k) continue
        if (!map.has(k)) {
          const c = costi[k]
          map.set(k, { key: k, nome: ing.nome, prezzoKg: c?.costoKg || 0, haPrezzo: !!c && c.costoKg > 0 })
        }
      }
    }
    for (const [k, c] of Object.entries(costi)) {
      if (!map.has(k)) map.set(k, { key: k, nome: k, prezzoKg: c.costoKg || 0, haPrezzo: (c.costoKg || 0) > 0 })
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  }, [ricettario])

  const filtered = search.trim() ? ingredienti.filter(i => (i.nome || '').toLowerCase().includes(search.toLowerCase().trim())) : ingredienti

  const startEdit = (row) => { setEditKey(row.key); setEditVal(row.prezzoKg ? row.prezzoKg.toFixed(2) : '') }
  const cancelEdit = () => { setEditKey(null); setEditVal('') }

  const tentaSalva = (row) => {
    const v = parseFloat(editVal.replace(',', '.'))
    if (isNaN(v) || v < 0) return
    if (v === row.prezzoKg) { cancelEdit(); return }
    setConfirmKey(row.key)
    setConfirmVal(v)
    setConfirmDecorre(new Date().toISOString().slice(0, 10))
  }

  const confermaSalva = async () => {
    const row = ingredienti.find(i => i.key === confirmKey)
    if (!row) { setConfirmKey(null); return }
    // Decorrenza alle 00:00:00 del giorno scelto
    const decorreISO = confirmDecorre ? new Date(confirmDecorre + 'T00:00:00').toISOString() : new Date().toISOString()
    await onUpdatePrezzo(row.nome, confirmVal, decorreISO)
    setConfirmKey(null); setConfirmVal(null)
    cancelEdit()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca ingrediente…"
            style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: C.white, color: C.text, outline: 'none', boxSizing: 'border-box' }}/>
        </div>
        <button onClick={() => setShowLog(s => !s)}
          style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.borderStr}`, background: showLog ? C.redLight : 'transparent', fontSize: 11, fontWeight: 700, color: showLog ? C.red : C.textMid, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {showLog ? '✕ Chiudi log' : `📜 Log modifiche · ${logPrezzi?.length || 0}`}
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
        Modifica il <b>prezzo €/kg</b> di un ingrediente con un click. La modifica richiede conferma esplicita per evitare errori e viene registrata nel log.
      </div>

      {showLog && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '10px 14px', background: '#F8F4F2', fontSize: 11, fontWeight: 700, color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
            Storico modifiche prezzi · ultime {Math.min(50, logPrezzi?.length || 0)} di {logPrezzi?.length || 0}
          </div>
          {(!logPrezzi || logPrezzi.length === 0) ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.textSoft }}>Nessuna modifica registrata.</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    {['Data', 'Ingrediente', 'Vecchio', 'Nuovo', 'Δ'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, background: '#FDFAF7' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logPrezzi.slice(0, 50).map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>{new Date(l.data).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{l.ingrediente}</td>
                      <td style={{ padding: '7px 12px', color: C.textMid, ...TNUM }}>€{(l.prezzoVecchio || 0).toFixed(2)}/kg</td>
                      <td style={{ padding: '7px 12px', fontWeight: 700, color: C.text, ...TNUM }}>€{(l.prezzoNuovo || 0).toFixed(2)}/kg</td>
                      <td style={{ padding: '7px 12px', fontWeight: 700, color: l.delta > 0 ? C.red : C.green, ...TNUM }}>
                        {l.delta > 0 ? '+' : ''}{l.delta.toFixed(2)}
                        {l.deltaPct != null && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>({l.deltaPct > 0 ? '+' : ''}{l.deltaPct.toFixed(1)}%)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Ingrediente</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Prezzo €/kg</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, width: 140 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: C.textSoft }}>
                  {search.trim() ? `Nessun ingrediente che corrisponde a "${search}".` : 'Nessun ingrediente disponibile.'}
                </td></tr>
              )}
              {filtered.map((row, i) => {
                const editing = editKey === row.key
                return (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}`, background: editing ? '#FFF8F7' : i % 2 === 0 ? C.white : '#FDFAF7' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>
                      {row.nome}
                      {!row.haPrezzo && <span style={{ marginLeft: 8, fontSize: 9, padding: '2px 6px', borderRadius: 4, background: C.amberLight, color: C.amber, fontWeight: 700 }}>Prezzo da impostare</span>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>
                      {editing ? (
                        <input type="number" min="0" step="0.01" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') tentaSalva(row)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          autoFocus
                          style={{ width: 96, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.red}`, fontSize: 13, fontWeight: 700, color: C.text, textAlign: 'right', outline: 'none' }}/>
                      ) : (
                        <span onClick={() => startEdit(row)} title="Clicca per modificare"
                          style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 5, display: 'inline-block' }}>
                          {row.prezzoKg > 0 ? `€${row.prezzoKg.toFixed(2)}` : '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <>
                          <button onClick={() => tentaSalva(row)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: C.red, color: C.white, fontSize: 10, fontWeight: 800, cursor: 'pointer', marginRight: 4 }}>Salva</button>
                          <button onClick={cancelEdit} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 10, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(row)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 10, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>✏️ Modifica</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirmKey && (() => {
        const row = ingredienti.find(i => i.key === confirmKey)
        if (!row) return null
        const delta = confirmVal - row.prezzoKg
        const deltaPct = row.prezzoKg > 0 ? (delta / row.prezzoKg * 100) : null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setConfirmKey(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>Conferma modifica prezzo</div>
              <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.55 }}>
                Sei sicuro di voler aggiornare il prezzo di <b style={{ color: C.text, textTransform: 'capitalize' }}>{row.nome}</b>?
              </div>
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textSoft, fontWeight: 600 }}>Prezzo attuale</span>
                  <span style={{ fontSize: 14, color: C.textMid, ...TNUM, fontWeight: 700 }}>€{row.prezzoKg.toFixed(2)}/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textSoft, fontWeight: 600 }}>Nuovo prezzo</span>
                  <span style={{ fontSize: 14, color: C.red, ...TNUM, fontWeight: 800 }}>€{confirmVal.toFixed(2)}/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.textSoft, fontWeight: 600 }}>Variazione</span>
                  <span style={{ fontSize: 13, color: delta > 0 ? C.red : C.green, ...TNUM, fontWeight: 800 }}>
                    {delta > 0 ? '+' : ''}€{delta.toFixed(2)} {deltaPct != null && <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.85 }}>({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>}
                  </span>
                </div>
              </div>
              {/* Decorrenza: data da cui il prezzo entra in vigore */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Decorrenza nuovo prezzo
                </div>
                <input type="date" value={confirmDecorre} onChange={e => setConfirmDecorre(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text, background: C.white, outline: 'none' }}/>
                <div style={{ fontSize: 10, color: C.textSoft, marginTop: 6, lineHeight: 1.5 }}>
                  Il nuovo prezzo si applica dalla data scelta in poi. Le produzioni precedenti mantengono il <b>prezzo storico</b> per i calcoli P&amp;L.
                  Es. cambiando il prezzo dal <b>01/01</b>, le produzioni del 31/12 useranno ancora il prezzo vecchio.
                </div>
              </div>
              {deltaPct != null && Math.abs(deltaPct) > 50 && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 11, color: '#78350F', lineHeight: 1.5 }}>
                  <b>⚠ Variazione importante</b> — la modifica del {Math.abs(deltaPct).toFixed(0)}% influenzerà il food cost di tutte le ricette che usano questo ingrediente (a partire dalla decorrenza scelta).
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmKey(null)} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                <button onClick={confermaSalva} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>✓ Conferma e salva</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── MagazzinoView (main) ────────────────────────────────────────────────────
export default function MagazzinoView({
  ricettario, magazzino, setMagazzino, logRif, setLogRif,
  logPrezzi = [], onUpdatePrezzoIng, giornaliero, notify,
  esclusi = new Set(), setEsclusi, onImportPrezzi, onImportPrezziOCR,
  orgId, sedeId,
}) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('giacenze')
  const [deleteIngConf, setDeleteIngConf] = useState(null)
  const [deleteIngPin, setDeleteIngPin] = useState('')
  const [formIng, setFormIng] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formMode, setFormMode] = useState('carico')
  const { sort: sortMag, sortKey: magKey, sortDir: magDir, toggleSort: magToggle } = useSortable('stato')
  const [quickLoad, setQuickLoad] = useState(null)
  const [editSoglia, setEditSoglia] = useState(null)
  const [showAddIng, setShowAddIng] = useState(false)
  const [newIngNome, setNewIngNome] = useState('')
  const [newIngQty, setNewIngQty] = useState('')
  const [newIngSoglia, setNewIngSoglia] = useState('')

  // ssave locale che usa orgId/sedeId props (sostituisce la wrapper Dashboard.jsx)
  const ssave = (key, val) => _ssave(key, val, orgId, sedeId)

  const handleDeleteIng = (k) => {
    const nm = { ...magazzino }
    delete nm[k]
    setMagazzino(nm)
    ssave(SK_MAG, nm)
    const nuoviEsclusi = new Set(esclusi)
    nuoviEsclusi.add(k)
    if (setEsclusi) setEsclusi(nuoviEsclusi)
    ssave(SK_EXCL, [...nuoviEsclusi])
    setDeleteIngConf(null); setDeleteIngPin('')
    notify('✓ Ingrediente eliminato dal sistema')
  }

  const tuttiIngNomi = useMemo(() => {
    const fromRic = new Set()
    for (const ric of Object.values(ricettario?.ricette || {})) {
      for (const ing of (ric.ingredienti || [])) fromRic.add(normIng(ing.nome))
    }
    const fromMag = new Set(Object.keys(magazzino || {}))
    return [...new Set([...fromRic, ...fromMag])].filter(k => !esclusi.has(k)).sort()
  }, [ricettario, magazzino, esclusi])

  const fabbisogno = useMemo(() => calcolaFabbisognoSettimana(ricettario, giornaliero), [ricettario, giornaliero])

  const righe = tuttiIngNomi.map(k => {
    const m = magazzino?.[k] || {}
    const giacenza = m.giacenza_g || 0
    const soglia = m.soglia_g || 0
    const fabb = fabbisogno[k] || 0
    const consumoG = fabb / 7
    const giorniScorta = consumoG > 0 ? giacenza / consumoG : null
    const stato =
      giacenza === 0 ? 'esaurito' :
      soglia > 0 && giacenza <= soglia ? 'critico' :
      giorniScorta !== null && giorniScorta < 3 ? 'critico' :
      giorniScorta !== null && giorniScorta < 7 ? 'attenzione' :
      'ok'
    return { k, nome: m.nome || k, giacenza, soglia, fabb, consumoG, giorniScorta, stato, ultimoRif: m.ultimoRifornimento }
  })

  const critici = righe.filter(r => r.stato === 'critico' || r.stato === 'esaurito')
  const attenzione = righe.filter(r => r.stato === 'attenzione')

  const handleCarica = async () => {
    if (!formIng || !formQty) return
    const k = normIng(formIng.toLowerCase().trim())
    const qty = parseFloat(formQty)
    if (qty <= 0) { notify('⚠ Inserisci una quantità maggiore di 0', false); return }
    const now = new Date().toISOString()
    const attuale = magazzino?.[k]?.giacenza_g || 0
    const delta = formMode === 'scarico' ? -qty : qty
    const nuova = Math.max(0, attuale + delta)
    const nm = { ...magazzino,
      [k]: { nome: formIng.trim(), giacenza_g: nuova, soglia_g: magazzino?.[k]?.soglia_g || 0, ultimoRifornimento: now },
    }
    const logEntry = { id: `r-${Date.now()}`, data: now, ingrediente: formIng.trim(), quantita_g: formMode === 'scarico' ? -qty : qty, note: formNote || (formMode === 'scarico' ? 'scarico manuale' : '') }
    const log = [logEntry, ...(logRif || [])]
    setMagazzino(nm); setLogRif(log)
    await ssave(SK_MAG, nm); await ssave(SK_LOGRIF, log)
    const segno = formMode === 'scarico' ? '−' : '+'
    notify(`✓ ${segno}${qty}g di ${formIng} — giacenza: ${Math.round(nuova)}g`)
    setFormIng(''); setFormQty(''); setFormNote(''); setQuickLoad(null)
  }

  const handleSoglia = async (k, val) => {
    const nm = { ...magazzino, [k]: { ...(magazzino?.[k] || {}), nome: k, soglia_g: parseFloat(val) || 0 } }
    setMagazzino(nm); await ssave(SK_MAG, nm)
    setEditSoglia(null)
  }

  const handleAddIngrediente = async () => {
    if (!newIngNome) return
    const k = normIng(newIngNome)
    const nm = { ...magazzino, [k]: { nome: newIngNome.trim(), giacenza_g: parseFloat(newIngQty) || 0, soglia_g: parseFloat(newIngSoglia) || 0, ultimoRifornimento: new Date().toISOString() } }
    setMagazzino(nm); await ssave(SK_MAG, nm)
    if (esclusi.has(k)) {
      const nuoviEsclusi = new Set(esclusi)
      nuoviEsclusi.delete(k)
      if (setEsclusi) setEsclusi(nuoviEsclusi)
      await ssave(SK_EXCL, [...nuoviEsclusi])
    }
    notify('✓ ' + newIngNome + ' aggiunto al magazzino')
    setShowAddIng(false); setNewIngNome(''); setNewIngQty(''); setNewIngSoglia('')
  }

  const statoColor = s => s === 'esaurito' ? C.red : s === 'critico' ? C.red : s === 'attenzione' ? C.amber : C.green
  const statoBg = s => s === 'esaurito' ? C.redLight : s === 'critico' ? C.redLight : s === 'attenzione' ? C.amberLight : C.greenLight
  const statoLabel = s => s === 'esaurito' ? 'Esaurito' : s === 'critico' ? 'Critico' : s === 'attenzione' ? 'Attenzione' : 'OK'
  const fmtG = g => g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        subtitle={`${tuttiIngNomi.length} ingredienti · ${righe.filter(r => r.stato === 'esaurito' || r.stato === 'critico').length} critici`}
        action={onImportPrezzi && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, cursor: 'pointer', boxShadow: S.sm }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textMid} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.textMid }}>Importa prezzi</span>
            <input type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: 'none' }} onChange={e => e.target.files.length && onImportPrezzi(e.target.files)}/>
          </label>
        )}
      />

      {(critici.length > 0 || attenzione.length > 0) && (
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {critici.length > 0 && (
            <div style={{ background: T.redLight, border: '1px solid rgba(220,38,38,0.20)', borderRadius: R.xl, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: R.md, background: 'rgba(220,38,38,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.red, flexShrink: 0 }}>⚠️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 4 }}>Riordino urgente — {critici.length} ingredient{critici.length > 1 ? 'i' : 'e'}</div>
                <div style={{ fontSize: 12, color: T.red, lineHeight: 1.6, opacity: 0.9 }}>{critici.map(r => `${r.nome} (${fmtG(r.giacenza)})`).join(' · ')}</div>
              </div>
            </div>
          )}
          {attenzione.length > 0 && (
            <div style={{ background: T.amberLight, border: '1px solid rgba(217,119,6,0.22)', borderRadius: R.xl, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: R.md, background: 'rgba(217,119,6,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.amber, flexShrink: 0 }}>⏰</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.amber, marginBottom: 4 }}>Scorte in esaurimento — {attenzione.length}</div>
                <div style={{ fontSize: 12, color: T.amber, lineHeight: 1.6, opacity: 0.9 }}>{attenzione.map(r => `${r.nome} (~${r.giorniScorta?.toFixed(0)} giorni)`).join(' · ')}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 28 }}>
        <KPI icon="📦" label="Ingredienti" value={righe.length} highlight/>
        <KPI icon="🚨" label="Critici" value={critici.length} color={critici.length > 0 ? C.red : C.green} sub={critici.length > 0 ? 'riordino urgente' : 'tutto ok'}/>
        <KPI icon="⚠️" label="In esaurimento" value={attenzione.length} color={attenzione.length > 0 ? C.amber : C.green} sub={attenzione.length > 0 ? '< 7 giorni' : 'ok'}/>
        <KPI icon="✅" label="Sufficienti" value={righe.filter(r => r.stato === 'ok').length} color={C.green}/>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
        {[['giacenze', 'Materie prime'], ['pf', 'Prodotti finiti'], ['prezzi', 'Prezzi ingredienti'], ['carica', 'Carica merce'], ['log', 'Log rifornimenti']].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? T.text : T.textSoft,
              borderBottom: tab === id ? `2px solid ${T.brand}` : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap', transition: `color ${M.durFast} ${M.ease}` }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'pf' && <ProdottiFinitiTab notify={notify} orgId={orgId} sedeId={sedeId}/>}

      {tab === 'giacenze' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowAddIng(true)} style={{ padding: '7px 16px', background: C.red, color: C.white, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Aggiungi ingrediente</button>
          </div>
          {showAddIng && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: 10, alignItems: 'flex-end' }}>
              {[{ lbl: 'Nome ingrediente', val: newIngNome, set: setNewIngNome, ph: 'es. burro' },
                { lbl: 'Giacenza (g)', val: newIngQty, set: setNewIngQty, ph: 'es. 1000', type: 'number' },
                { lbl: 'Soglia alert (g)', val: newIngSoglia, set: setNewIngSoglia, ph: 'es. 500', type: 'number' }].map(({ lbl, val, set, ph, type }) => (
                <div key={lbl}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{lbl}</div>
                  <input type={type || 'text'} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 12, color: C.text }}/>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAddIngrediente} style={{ padding: '8px 16px', background: C.red, color: C.white, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Aggiungi</button>
                <button onClick={() => setShowAddIng(false)} style={{ padding: '8px 12px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          )}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 600 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    <SortTH k="nome" active={magKey === 'nome'} dir={magDir} onToggle={magToggle}>Ingrediente</SortTH>
                    <SortTH k="giacenza" right active={magKey === 'giacenza'} dir={magDir} onToggle={magToggle}>Giacenza</SortTH>
                    <SortTH k="fabb" right active={magKey === 'fabb'} dir={magDir} onToggle={magToggle}>Fabb. sett.</SortTH>
                    <SortTH k="giorniScorta" right active={magKey === 'giorniScorta'} dir={magDir} onToggle={magToggle}>Giorni scorta</SortTH>
                    <SortTH k="soglia" right active={magKey === 'soglia'} dir={magDir} onToggle={magToggle}>Soglia alert</SortTH>
                    <SortTH k="stato" active={magKey === 'stato'} dir={magDir} onToggle={magToggle}>Stato</SortTH>
                    <SortTH k="ultimoRif" right active={magKey === 'ultimoRif'} dir={magDir} onToggle={magToggle}>Ultimo riforn.</SortTH>
                    <th style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}` }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortMag(righe, (r, k) => ({
                    nome: r.nome, giacenza: r.giacenza, fabb: r.fabb,
                    giorniScorta: r.giorniScorta ?? 9999, soglia: r.soglia,
                    stato: ({ esaurito: 0, critico: 1, attenzione: 2, ok: 3 }[r.stato] ?? 3),
                    ultimoRif: r.ultimoRif ? new Date(r.ultimoRif).getTime() : 0,
                  })[k] ?? 0).map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: quickLoad === r.k ? C.red : C.text, textTransform: 'capitalize', cursor: 'pointer' }}
                        title="Clic rapido → precompila form"
                        onClick={() => { setQuickLoad(r.k); setFormIng(r.nome); setTab('carica'); setTimeout(() => document.getElementById('mag-qty-input')?.focus(), 100) }}>
                        {r.nome} <span style={{ fontSize: 9, opacity: 0.4 }}>↗</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontWeight: 800, fontSize: 12, color: statoColor(r.stato), ...TNUM }}>{fmtG(r.giacenza)}</span>
                          {r.fabb > 0 && (
                            <div style={{ width: 60, height: 4, background: '#EEE', borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, (r.giacenza / r.fabb) * 100)}%`, height: 4, background: statoColor(r.stato), borderRadius: 2 }}/>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textMid }}>{r.fabb > 0 ? fmtG(r.fabb) : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: statoColor(r.stato) }}>
                        {r.giorniScorta !== null ? `${r.giorniScorta.toFixed(0)}gg` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {editSoglia?.nome === r.k ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                            <input type="number" value={editSoglia.val} onChange={e => setEditSoglia({ ...editSoglia, val: e.target.value })}
                              style={{ width: 70, padding: '4px 6px', borderRadius: 5, border: `1px solid ${C.borderStr}`, fontSize: 11, textAlign: 'center' }}/>
                            <button onClick={() => handleSoglia(r.k, editSoglia.val)} style={{ padding: '4px 8px', background: C.green, color: C.white, border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditSoglia({ nome: r.k, val: r.soglia || '' })}
                            style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, color: C.textMid, fontSize: 10, cursor: 'pointer' }}>
                            {r.soglia > 0 ? fmtG(r.soglia) : 'Imposta'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ background: statoBg(r.stato), color: statoColor(r.stato), fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{statoLabel(r.stato)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textSoft, fontSize: 10 }}>
                        {r.ultimoRif ? new Date(r.ultimoRif).toLocaleDateString('it-IT') : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <button onClick={() => { setDeleteIngConf(r.k); setDeleteIngPin('') }}
                          style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'carica' && (
        <div style={{ maxWidth: 680 }}>
          <FotoOCR mode="magazzino" notify={notify} ricettario={ricettario} onResult={async res => {
            const now = new Date().toISOString()
            const nm = { ...magazzino }
            const newLogs = []
            for (const rawIng of (res.ingredienti || [])) {
              const nomeIT = translateIngredienteEN(rawIng.nome || '')
              const ing = { ...rawIng, nome: nomeIT }
              const k = normIng(ing.nome)
              nm[k] = { nome: ing.nome.trim(), giacenza_g: (nm[k]?.giacenza_g || 0) + ing.quantita_g, soglia_g: nm[k]?.soglia_g || 0, ultimoRifornimento: now }
              newLogs.push({ id: `r-${Date.now()}-${k}`, data: now, ingrediente: ing.nome.trim(), quantita_g: ing.quantita_g, note: 'da foto' })
            }
            setMagazzino(nm)
            const updLogs = [...newLogs, ...(logRif || [])]
            setLogRif(updLogs)
            await ssave(SK_MAG, nm)
            await ssave(SK_LOGRIF, updLogs)
            notify(`📷 Caricati ${(res.ingredienti || []).length} ingredienti in magazzino`)
          }}/>
          <FotoOCR mode="prezzi" notify={notify} ricettario={ricettario} onResult={async res => {
            if (!ricettario) { notify('⚠ Carica prima il ricettario', false); return }
            const ing_list = res.ingredienti || []
            const validi = ing_list.filter(i => i.prezzo_kg > 0)
            if (!validi.length) { notify('⚠ Nessun prezzo estratto', false); return }
            const nuoviCosti = {}
            for (const i of validi) {
              const k = normIng(translateIngredienteEN(i.nome || ''))
              nuoviCosti[k] = { costoKg: parseFloat(i.prezzo_kg.toFixed(4)), costoG: parseFloat((i.prezzo_kg / 1000).toFixed(6)), isStima: false }
            }
            if (onImportPrezziOCR) onImportPrezziOCR(nuoviCosti)
            notify(`📷 ${validi.length} prezzi aggiornati`)
          }}/>
          <div style={{ background: C.bgCard, border: `1px solid ${formMode === 'scarico' ? C.amber : C.border}`, borderRadius: 12, padding: '28px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[['carico', '➕ Carico merce', 'Rifornimento in entrata'], ['scarico', '➖ Scarico / Rettifica', 'Rimuovi quantità']].map(([m, lbl, sub]) => (
                <button key={m} onClick={() => setFormMode(m)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: `2px solid ${formMode === m ? (m === 'carico' ? C.green : C.amber) : C.border}`,
                    background: formMode === m ? (m === 'carico' ? C.greenLight : C.amberLight) : C.white,
                    color: formMode === m ? (m === 'carico' ? C.green : C.amber) : C.textMid,
                    fontWeight: formMode === m ? 800 : 500, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, marginBottom: 2 }}>{lbl}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{sub}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Ingrediente</div>
                <input type="text" value={formIng}
                  onChange={e => setFormIng(e.target.value)}
                  onKeyDown={onEnterAutoComplete(tuttiIngNomi, formIng, setFormIng, () => {
                    const qtyEl = document.getElementById('mag-qty-input')
                    if (qtyEl) qtyEl.focus()
                  })}
                  placeholder="es. burro"
                  list="ing-list" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text }}/>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Quantità (g) — {formMode === 'scarico' ? 'da rimuovere' : 'in arrivo'}
                </div>
                <input id="mag-qty-input" type="number" value={formQty} onChange={e => setFormQty(e.target.value)} placeholder="es. 2000" min="0"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${formMode === 'scarico' ? C.amber : C.borderStr}`, fontSize: 13, color: C.text }}/>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Note (opzionale)</div>
                <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="es. Metro - bolla 1234"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text }}/>
              </div>
              <datalist id="ing-list">{tuttiIngNomi.map(k => <option key={k} value={k}/>)}</datalist>
              <button onClick={handleCarica} disabled={!formIng || !formQty}
                style={{ padding: '12px', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: formIng && formQty ? 'pointer' : 'default',
                  background: formIng && formQty ? (formMode === 'scarico' ? C.amber : C.red) : '#DDD',
                  color: formIng && formQty ? C.white : '#999' }}>
                {formMode === 'scarico' ? '➖ Rimuovi dal magazzino' : '➕ Aggiungi al magazzino'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'prezzi' && (
        <PrezziIngredientiTab ricettario={ricettario} logPrezzi={logPrezzi} onUpdatePrezzo={onUpdatePrezzoIng} isMobile={isMobile}/>
      )}

      {tab === 'log' && (
        <div>
          {(!logRif || logRif.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: C.textSoft }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Nessun rifornimento registrato</div>
            </div>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {['Data', 'Ingrediente', 'Quantità', 'Note'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRif.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '10px 14px', color: C.textMid }}>{new Date(r.data).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{r.ingrediente}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: C.green }}>{fmtG(r.quantita_g)}</td>
                      <td style={{ padding: '10px 14px', color: C.textSoft }}>{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteIngConf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setDeleteIngConf(null); setDeleteIngPin('') } }}>
          <div style={{ background: C.white, borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.red, marginBottom: 8 }}>🗑 Elimina ingrediente</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>
              Stai per eliminare <b style={{ textTransform: 'capitalize' }}>{magazzino?.[deleteIngConf]?.nome || deleteIngConf}</b> dal magazzino.
            </div>
            <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 18 }}>Questa azione è permanente.</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, marginBottom: 6 }}>Scrivi <b style={{ color: C.red }}>ELIMINA</b> per confermare:</div>
            <input autoFocus value={deleteIngPin} onChange={e => setDeleteIngPin(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && deleteIngPin === 'ELIMINA') handleDeleteIng(deleteIngConf) }}
              placeholder="ELIMINA"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 7, border: `2px solid ${deleteIngPin === 'ELIMINA' ? C.red : '#DDD'}`, fontSize: 14, fontWeight: 800, color: C.red, letterSpacing: '0.1em', marginBottom: 16, outline: 'none' }}/>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { if (deleteIngPin === 'ELIMINA') handleDeleteIng(deleteIngConf) }}
                style={{ flex: 1, padding: '11px', background: deleteIngPin === 'ELIMINA' ? C.red : '#EEE', color: deleteIngPin === 'ELIMINA' ? C.white : '#AAA', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: deleteIngPin === 'ELIMINA' ? 'pointer' : 'not-allowed' }}>
                Elimina definitivamente
              </button>
              <button onClick={() => { setDeleteIngConf(null); setDeleteIngPin('') }} style={{ flex: 1, padding: '11px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
