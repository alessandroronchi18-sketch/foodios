// MagazzinoView + ProdottiFinitiTab + PrezziIngredientiTab - estratti da Dashboard.jsx.
// KPI e calcolaFabbisognoSettimana inline (uso interno al modulo).
//
// Persistenza: richiede orgId/sedeId come props per chiamare ssave da lib/storage
// (prima usava la wrapper locale di Dashboard.jsx che leggeva _ctx_*).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { ssave as _ssave } from '../lib/storage'
import { todayLocal } from '../lib/dateLocal'
import { normIng, getR, translateIngredienteEN, buildIngCosti } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { SK_MAG, SK_EXCL, SK_LOGRIF } from '../lib/storageKeys'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import Icon from '../components/Icon'
import { loadStockPF, loadMovimentiPF, scartoPF } from '../lib/stockPF'
import {
  C, TNUM, PageHeader, useSortable, SortTH, fmt0,
} from './_shared'

// Ombra premium coerente con la Dashboard home (card/contenitori principali).
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// ─── KPI Card (interna al modulo) ────────────────────────────────────────────
// Look premium coerente con la Dashboard home: chip icona 36px, decoro radiale,
// accento colore, raggio 18.
function KPI({ label, value, sub, color, highlight, icon }) {
  const accent = color || T.brand
  const chipBg = highlight ? 'rgba(255,255,255,0.14)' : `${accent}1F`
  const chipColor = highlight ? '#fff' : accent
  return (
    <div className="fos-tile" style={{
      position: 'relative', overflow: 'hidden',
      background: highlight ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' : T.bgCard,
      border: `1px solid ${highlight ? '#4A0612' : T.border}`, borderRadius: 18,
      padding: '18px 20px',
      boxShadow: highlight ? '0 14px 34px rgba(110,14,26,0.32), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)',
    }}>
      {/* decoro radiale d'angolo */}
      <div style={{ position: 'absolute', top: -28, right: -28, width: 92, height: 92, borderRadius: '50%',
        background: highlight ? 'rgba(255,255,255,0.07)' : `${accent}14`, opacity: 0.6, pointerEvents: 'none' }}/>
      {icon && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: chipBg, color: chipColor, fontSize: 17 }}>{icon}</span>
        </div>
      )}
      <div style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
        color: highlight ? 'rgba(255,255,255,0.76)' : T.textSoft, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 30, fontWeight: 800, color: highlight ? T.textOnDark : color || T.text,
        letterSpacing: '-0.035em', lineHeight: 1.05, ...TNUM }}>
        {value}
      </div>
      {sub && <div style={{ position: 'relative', fontSize: 12, color: highlight ? 'rgba(255,255,255,0.7)' : T.textSoft, marginTop: 7, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

// ─── Section header con barra brand (gerarchia premium) ──────────────────────
function SectHead({ icon, title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(110,14,26,0.10)', color: T.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: T.textSoft, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
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
function ProdottiFinitiTab({ notify, orgId, sedeId, LEX = lessico() }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [scartoForm, setScartoForm] = useState(null)
  const [movimenti, setMovimenti] = useState([])
  const [saving, setSaving] = useState(false)

  const carica = useCallback(async () => {
    if (!orgId || !sedeId) { setLoading(false); return }
    setLoading(true)
    try {
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

  // Audit 2026-07-01 HIGH: tracking focus timer per cleanup unmount.
  const focusTimerRef = useRef(null)
  useEffect(() => () => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
  }, [])
  function focusQtyDeferred() {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    focusTimerRef.current = setTimeout(() => {
      try { document.getElementById('mag-qty-input')?.focus() } catch {}
      focusTimerRef.current = null
    }, 100)
  }

  const handleScarto = async () => {
    if (saving) return // evita doppio scarico stock su doppio click
    if (!scartoForm?.prodotto || !(scartoForm.qty > 0)) return
    setSaving(true)
    try {
      await scartoPF({ sedeId, prodotto: scartoForm.prodotto, quantita: scartoForm.qty, note: scartoForm.note || null })
      notify('✓ Scarto registrato')
      setScartoForm(null)
      await carica()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setSaving(false)
    }
  }

  if (!sedeId) return <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Seleziona una sede attiva per vedere lo stock {LEX.prodotti} finiti.</div>
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  const totPezzi = stock.reduce((s, r) => s + Number(r.quantita || 0), 0)
  const sottoSoglia = stock.filter(r => r.soglia_min > 0 && Number(r.quantita) <= Number(r.soglia_min))
  const negativi = stock.filter(r => Number(r.quantita) < 0)

  const CAUSALE_LBL = {
    produzione: { lbl: 'Produzione', ic: 'factory', col: '#16A34A' },
    trasferimento_invio: { lbl: 'Inviato', ic: 'truck', col: '#DC2626' },
    trasferimento_ricezione: { lbl: 'Ricevuto', ic: 'package', col: '#16A34A' },
    vendita: { lbl: 'Vendita', ic: 'cart', col: '#2563EB' },
    scarto: { lbl: 'Scarto', ic: 'warning', col: '#92400E' },
    annullo_trasferimento: { lbl: '↩ Annullo', col: '#94A3B8' },
    rettifica: { lbl: 'Rettifica', ic: 'edit', col: '#475569' },
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        <KPI icon={<Icon name="package" size={18} />} label={`${LEX.Prodotti} in stock`} value={stock.length}/>
        <KPI icon={<Icon name="barChart" size={18} />} label="Pezzi totali" value={totPezzi.toLocaleString('it-IT', { maximumFractionDigits: 0 })}/>
        <KPI icon={<Icon name="warning" size={18} />} label="Sotto soglia" value={sottoSoglia.length} color={sottoSoglia.length > 0 ? C.amber : C.green}/>
        <KPI icon={<Icon name="alert" size={18} />} label="Stock negativo" value={negativi.length} color={negativi.length > 0 ? C.red : C.green} sub={negativi.length > 0 ? 'vendite > carico' : ''}/>
      </div>

      {stock.length === 0 ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, padding: '40px 20px', textAlign: 'center', color: C.textSoft, fontSize: 13, boxShadow: SHADOW_PREMIUM }}>
          <div style={{ marginBottom: 8, color: C.textSoft }}><Icon name="package" size={36} /></div>
          Nessun prodotto in stock per questa sede.<br/>
          Lo stock si popola automaticamente alla conferma di una sessione di produzione.
        </div>
      ) : (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflowX: 'auto', marginBottom: 20, boxShadow: SHADOW_PREMIUM }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                {[LEX.Prodotto, 'Disponibili', 'Soglia', 'Aggiornato', ''].map((h, i) => (
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
                      {r.soglia_min > 0 ? Number(r.soglia_min).toLocaleString('it-IT') : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: C.textSoft }}>
                      {r.updated_at ? new Date(r.updated_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button onClick={() => setScartoForm({ prodotto: r.prodotto_nome, qty: '', note: '', azzera: false })} disabled={q <= 0}
                        style={{ padding: '8px 12px', minHeight: 36, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: q <= 0 ? C.textSoft : C.amber, fontSize: 12, fontWeight: 700, cursor: q <= 0 ? 'not-allowed' : 'pointer', marginRight: 4 }}>
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
          <SectHead icon={<Icon name="clock" size={16} />} title="Movimenti recenti" sub="Ultimi carichi, scarichi e trasferimenti" />

          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
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
                      <td style={{ padding: '8px 14px', fontSize: 11, color: c.col, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{c.ic && <Icon name={c.ic} size={12} />}{c.lbl}</span></td>
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
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,0.28)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="warning" size={18} />Registra scarto</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSoft }}>{LEX.Prodotto}: <strong>{scartoForm.prodotto}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Quantità scartata (pz)</div>
              <input type="number" inputMode="decimal" min="0" step="1" value={scartoForm.qty}
                onChange={e => setScartoForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}
                style={{ width: '100%', padding: '12px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Motivo (opzionale)</div>
              <input value={scartoForm.note}
                onChange={e => setScartoForm(f => ({ ...f, note: e.target.value }))}
                placeholder="es. caduti per terra, scaduti, dati a omaggio"
                style={{ width: '100%', padding: '12px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setScartoForm(null)} style={{ padding: '10px 18px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
              <button onClick={handleScarto} disabled={saving} style={{ padding: '10px 18px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Registrazione…' : 'Registra scarto'}</button>
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
  const [confirmDecorre, setConfirmDecorre] = useState(() => todayLocal())
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
  // Audit 2026-07-01 batch 10 Performance: paginazione UI per liste grandi.
  // Pasticcerie con ricettario completo possono avere 200-500 ingredienti;
  // renderizzarli tutti = 500 row + form input = lag tangibile su mobile.
  // Default 80 visibili, "Mostra altri" carica +80 per volta. La ricerca
  // bypassa il limite (i risultati filtrati sono comunque pochi).
  const [maxVisible, setMaxVisible] = useState(80)
  useEffect(() => { setMaxVisible(80) }, [search])
  const isPaginated = !search.trim() && filtered.length > maxVisible
  const visibleRows = isPaginated ? filtered.slice(0, maxVisible) : filtered

  const startEdit = (row) => { setEditKey(row.key); setEditVal(row.prezzoKg ? row.prezzoKg.toFixed(2) : '') }
  const cancelEdit = () => { setEditKey(null); setEditVal('') }

  const tentaSalva = (row) => {
    const v = parseFloat(editVal.replace(',', '.'))
    if (isNaN(v) || v < 0) return
    if (v === row.prezzoKg) { cancelEdit(); return }
    setConfirmKey(row.key)
    setConfirmVal(v)
    setConfirmDecorre(todayLocal())
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca ingrediente…"
            style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: C.white, color: C.text, outline: 'none', boxSizing: 'border-box' }}/>
        </div>
        <button onClick={() => setShowLog(s => !s)}
          style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${C.borderStr}`, background: showLog ? C.redLight : 'transparent', fontSize: 11, fontWeight: 700, color: showLog ? C.red : C.textMid, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {showLog ? <>✕ Chiudi log</> : <><Icon name="fileText" size={13} />{`Log modifiche · ${logPrezzi?.length || 0}`}</>}
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
        Modifica il <b>prezzo €/kg</b> di un ingrediente con un click. La modifica richiede conferma esplicita per evitare errori e viene registrata nel log.
      </div>

      {showLog && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
          <div style={{ padding: '11px 14px', background: '#F8F4F2', fontSize: 11, fontWeight: 700, color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
            Storico modifiche prezzi · ultime {Math.min(50, logPrezzi?.length || 0)} di {logPrezzi?.length || 0}
          </div>
          {(!logPrezzi || logPrezzi.length === 0) ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.textSoft }}>Nessuna modifica registrata.</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    {['Data', 'Ingrediente', 'Vecchio', 'Nuovo', 'Δ'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: i >= 2 ? 'right' : 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, background: '#FDFAF7' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logPrezzi.slice(0, 50).map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>{new Date(l.data).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{l.ingrediente}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: C.textMid, ...TNUM }}>€ {(l.prezzoVecchio || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>€ {(l.prezzoNuovo || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: l.delta > 0 ? C.red : C.green, ...TNUM }}>
                        {l.delta > 0 ? '+' : ''}{l.delta.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
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
              {visibleRows.map((row, i) => {
                const editing = editKey === row.key
                return (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}`, background: editing ? '#FFF8F7' : i % 2 === 0 ? C.white : '#FDFAF7' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>
                      {/* Nome + badge incolonnati: nome in colonna fissa 180px,
                          badge sempre alla stessa x indipendentemente dalla
                          lunghezza del nome. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ minWidth: 180, display: 'inline-block' }}>{row.nome}</span>
                        {!row.haPrezzo && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: C.amberLight, color: C.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>Prezzo da impostare</span>}
                      </div>
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
                          {row.prezzoKg > 0 ? `${row.prezzoKg.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '-'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <>
                          <button onClick={() => tentaSalva(row)} style={{ padding: '8px 14px', minHeight: 36, borderRadius: 6, border: 'none', background: C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: 'pointer', marginRight: 4 }}>Salva</button>
                          <button onClick={cancelEdit} style={{ padding: '8px 12px', minHeight: 36, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(row)} style={{ padding: '8px 14px', minHeight: 36, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="edit" size={13} />Modifica</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {isPaginated && (
            <div style={{
              padding: '14px 18px', textAlign: 'center',
              borderTop: `1px solid ${C.border}`, background: '#FAFAF6',
            }}>
              <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 8 }}>
                Mostrati <strong>{visibleRows.length}</strong> di <strong>{filtered.length}</strong> ingredienti.
              </div>
              <button onClick={() => setMaxVisible(m => m + 80)}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: `1px solid ${C.borderStr}`, background: C.white,
                  fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer',
                }}>
                Mostra altri 80
              </button>
            </div>
          )}
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
            <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>Conferma modifica prezzo</div>
              <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.55 }}>
                Sei sicuro di voler aggiornare il prezzo di <b style={{ color: C.text, textTransform: 'capitalize' }}>{row.nome}</b>?
              </div>
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textSoft, fontWeight: 600 }}>Prezzo attuale</span>
                  <span style={{ fontSize: 14, color: C.textMid, ...TNUM, fontWeight: 700 }}>€ {row.prezzoKg.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textSoft, fontWeight: 600 }}>Nuovo prezzo</span>
                  <span style={{ fontSize: 14, color: C.red, ...TNUM, fontWeight: 800 }}>€ {confirmVal.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.textSoft, fontWeight: 600 }}>Variazione</span>
                  <span style={{ fontSize: 13, color: delta > 0 ? C.red : C.green, ...TNUM, fontWeight: 800 }}>
                    {delta > 0 ? '+' : ''}€ {delta.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {deltaPct != null && <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.85 }}>({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>}
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
                  <b style={{ display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle' }}><Icon name="warning" size={12} />Variazione importante</b> - la modifica del {Math.abs(deltaPct).toFixed(0)}% influenzerà il food cost di tutte le ricette che usano questo ingrediente (a partire dalla decorrenza scelta).
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
  orgId, sedeId, isDipendente = false, LEX = lessico(),
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [tab, setTab] = useState('giacenze')
  // Toggle unità: 'kg' tutto kg (anche 0,80 kg), 'g' tutto grammi (28.000 g).
  // Default 'kg' che è il più comodo per ingredienti grandi (farine, latte).
  const [unitMode, setUnitMode] = useState('kg')
  const [deleteIngConf, setDeleteIngConf] = useState(null)
  const [deleteIngPin, setDeleteIngPin] = useState('')
  const [formIng, setFormIng] = useState('')
  // Audit 2026-06-22: focusQtyDeferred era riferito ai righi 870/948 ma definito
  // SOLO in ProdottiFinitiTab (scope diverso) → ReferenceError. Lo replico qui.
  const _focusTimerRef = useRef(null)
  useEffect(() => () => { if (_focusTimerRef.current) clearTimeout(_focusTimerRef.current) }, [])
  function focusQtyDeferred() {
    if (_focusTimerRef.current) clearTimeout(_focusTimerRef.current)
    _focusTimerRef.current = setTimeout(() => {
      try { document.getElementById('mag-qty-input')?.focus() } catch { /* skip */ }
      _focusTimerRef.current = null
    }, 100)
  }
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
  const [saving, setSaving] = useState(false)

  // ESC chiude il modal di delete (UX coerente con ProduzioneGiornalieraView).
  useEffect(() => {
    if (!deleteIngConf) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setDeleteIngConf(null); setDeleteIngPin('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteIngConf])

  // ssave locale che usa orgId/sedeId props (sostituisce la wrapper Dashboard.jsx)
  const ssave = (key, val) => _ssave(key, val, orgId, sedeId)

  const handleDeleteIng = async (k) => {
    if (saving) return // evita doppia esecuzione su Enter+click
    const nm = { ...magazzino }
    delete nm[k]
    const nuoviEsclusi = new Set(esclusi)
    nuoviEsclusi.add(k)
    // SAVE FIRST: muto lo state solo dopo che entrambe le scritture sono persistite,
    // altrimenti l'ingrediente sparisce dall'UI ma resta nel DB (riappare al refresh).
    setSaving(true)
    try {
      await ssave(SK_MAG, nm)
      await ssave(SK_EXCL, [...nuoviEsclusi])
    } catch (e) {
      notify(`Eliminazione fallita: ${e.message || 'rete'}. Riprova.`, false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    if (setEsclusi) setEsclusi(nuoviEsclusi)
    setDeleteIngConf(null); setDeleteIngPin('')
    setSaving(false)
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

  // Mappa costi €/kg (€/g): prezzi utente (ingredienti_costi) con fallback HORECA.
  // Serve a valorizzare la giacenza (valore stock €) - sola lettura, non scrive nulla.
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi), [ricettario])

  // Copertura target per il suggerimento di riordino: porta la scorta a coprire
  // ~14 giorni di consumo (2 cicli settimanali), arrotondando a step pratici.
  const GIORNI_TARGET = 14

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
    // Valore a magazzino: giacenza (g) × costo (€/g). costoG può mancare → 0.
    const costoG = ingCosti[k]?.costoG || 0
    const costoKg = ingCosti[k]?.costoKg || 0
    const valore = giacenza * costoG
    // Suggerimento riordino (g): copri GIORNI_TARGET di consumo + rispetta la soglia,
    // sottrai la giacenza. Se non c'è storico consumo usiamo la soglia come riferimento.
    const targetG = Math.max(consumoG * GIORNI_TARGET, soglia > 0 ? soglia * 1.5 : 0)
    const riordinoG = targetG > giacenza ? targetG - giacenza : 0
    return { k, nome: m.nome || k, giacenza, soglia, fabb, consumoG, giorniScorta, stato, ultimoRif: m.ultimoRifornimento, valore, costoG, costoKg, riordinoG }
  })

  const critici = righe.filter(r => r.stato === 'critico' || r.stato === 'esaurito')
  const attenzione = righe.filter(r => r.stato === 'attenzione')

  // ── Diagnosi aggregata (banda premium) ─────────────────────────────────────
  const valoreStock = righe.reduce((s, r) => s + (r.valore || 0), 0)
  const conCopertura = righe.filter(r => r.giorniScorta !== null)
  const coperturaMedia = conCopertura.length > 0
    ? conCopertura.reduce((s, r) => s + r.giorniScorta, 0) / conCopertura.length
    : null
  // Semaforo salute magazzino: rosso se ci sono critici, ambra se solo esaurimenti, verde altrimenti.
  const salute = critici.length > 0 ? 'critico' : attenzione.length > 0 ? 'attenzione' : 'ok'

  const handleCarica = async () => {
    if (saving) return
    if (!formIng || !formQty) return
    const k = normIng(formIng.toLowerCase().trim())
    // Audit 2026-07-01 MEDIUM: locale IT usa la virgola decimale.
    const qty = parseFloat(String(formQty).replace(',', '.'))
    if (!(qty > 0)) { notify('Inserisci una quantità maggiore di 0', false); return }
    const now = new Date().toISOString()
    const attuale = magazzino?.[k]?.giacenza_g || 0
    const delta = formMode === 'scarico' ? -qty : qty
    // Audit 2026-07-01 HIGH: NON clampare a 0. Allineato a scaloMagazzinoPerGusto
    // che ammette negativi proprio per tracciare deficit reali - il clamp
    // silenzioso cancellava l'overshoot dal log (info forensicamente persa).
    const nuova = attuale + delta
    if (nuova < 0) {
      notify(`Attenzione: scarico maggiore della giacenza (${formIng}: ${attuale}g → ${nuova}g). Registrato.`, false)
    }
    const nm = { ...magazzino,
      [k]: { nome: formIng.trim(), giacenza_g: nuova, soglia_g: magazzino?.[k]?.soglia_g || 0, ultimoRifornimento: now },
    }
    const logEntry = { id: `r-${Date.now()}`, data: now, ingrediente: formIng.trim(), quantita_g: formMode === 'scarico' ? -qty : qty, note: formNote || (formMode === 'scarico' ? 'scarico manuale' : '') }
    const log = [logEntry, ...(logRif || [])]
    // SAVE FIRST: se ssave fallisce non vogliamo state desincronizzato dal DB.
    setSaving(true)
    try {
      await ssave(SK_MAG, nm); await ssave(SK_LOGRIF, log)
    } catch (e) {
      notify(`Salvataggio magazzino fallito: ${e.message || 'rete'}. Riprova.`, false)
      setSaving(false)
      return
    }
    setMagazzino(nm); setLogRif(log)
    const segno = formMode === 'scarico' ? '−' : '+'
    notify(`✓ ${segno}${qty}g di ${formIng} - giacenza: ${Math.round(nuova)}g`)
    setFormIng(''); setFormQty(''); setFormNote(''); setQuickLoad(null)
    setSaving(false)
  }

  const handleSoglia = async (k, val) => {
    // Audit 2026-07-01 MEDIUM: saving guard per race su doppio Enter rapido.
    if (saving) return
    const nm = { ...magazzino, [k]: { ...(magazzino?.[k] || {}), nome: k, soglia_g: parseFloat(String(val).replace(',', '.')) || 0 } }
    setSaving(true)
    try {
      await ssave(SK_MAG, nm)
    } catch (e) {
      notify(`Errore soglia: ${e.message || 'rete'}`, false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    setEditSoglia(null)
    setSaving(false)
  }

  const handleAddIngrediente = async () => {
    if (saving) return
    if (!newIngNome) return
    const k = normIng(newIngNome)
    const nm = { ...magazzino, [k]: { nome: newIngNome.trim(), giacenza_g: parseFloat(newIngQty) || 0, soglia_g: parseFloat(newIngSoglia) || 0, ultimoRifornimento: new Date().toISOString() } }
    setSaving(true)
    try {
      await ssave(SK_MAG, nm)
    } catch (e) {
      notify(`Errore aggiunta ingrediente: ${e.message || 'rete'}`, false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    if (esclusi.has(k)) {
      const nuoviEsclusi = new Set(esclusi)
      nuoviEsclusi.delete(k)
      try { await ssave(SK_EXCL, [...nuoviEsclusi]) } catch { /* low impact */ }
      if (setEsclusi) setEsclusi(nuoviEsclusi)
    }
    notify('✓ ' + newIngNome + ' aggiunto al magazzino')
    setShowAddIng(false); setNewIngNome(''); setNewIngQty(''); setNewIngSoglia('')
    setSaving(false)
  }

  const statoColor = s => s === 'esaurito' ? C.red : s === 'critico' ? C.red : s === 'attenzione' ? C.amber : C.green
  const statoBg = s => s === 'esaurito' ? C.redLight : s === 'critico' ? C.redLight : s === 'attenzione' ? C.amberLight : C.greenLight
  const statoLabel = s => s === 'esaurito' ? 'Esaurito' : s === 'critico' ? 'Critico' : s === 'attenzione' ? 'Attenzione' : 'OK'
  // fmtG: rispetta unitMode utente. 'kg' -> sempre kg (anche piccoli, "0,80 kg").
  // 'g' -> sempre grammi (anche grandi, "28.000 g"). Niente piu mix.
  const fmtG = g => {
    const n = Number(g) || 0
    if (unitMode === 'g') return `${Math.round(n).toLocaleString('it-IT')} g`
    return `${(n / 1000).toLocaleString('it-IT', { minimumFractionDigits: n >= 1000 ? 2 : 3, maximumFractionDigits: n >= 1000 ? 2 : 3 })} kg`
  }
  // Suggerimento riordino arrotondato a step pratici: <1kg → step 100g, ≥1kg → 0,5kg.
  const fmtRiordino = g => {
    if (!(g > 0)) return null
    if (g < 1000) return `${Math.ceil(g / 100) * 100} g`
    const kg = Math.ceil((g / 1000) * 2) / 2
    return `${kg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg`
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
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

      {/* ── BANDA DIAGNOSI (premium): valore stock, critici, esaurimento, copertura ── */}
      <div style={{ marginBottom: 18 }}>
        {(() => {
          const sem = salute === 'critico'
            ? { col: C.red, bg: 'rgba(220,38,38,0.10)', lbl: 'Magazzino sotto pressione', ic: 'alert' }
            : salute === 'attenzione'
            ? { col: C.amber, bg: 'rgba(217,119,6,0.12)', lbl: 'Scorte da tenere d’occhio', ic: 'warning' }
            : { col: C.green, bg: 'rgba(22,163,74,0.12)', lbl: 'Scorte in equilibrio', ic: 'checkCircle' }
          const msg = salute === 'critico'
            ? `${critici.length} ingrediente/i da riordinare subito${attenzione.length > 0 ? `, ${attenzione.length} in esaurimento` : ''}.`
            : salute === 'attenzione'
            ? `${attenzione.length} ingrediente/i scenderanno sotto scorta entro la settimana.`
            : 'Nessun ingrediente critico: le giacenze coprono il fabbisogno previsto.'
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 14,
              background: sem.bg, border: `1px solid ${sem.col}33`, borderRadius: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: sem.col, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={sem.ic} size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: sem.col, letterSpacing: '-0.01em' }}>{sem.lbl}</div>
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 1 }}>{msg}</div>
              </div>
            </div>
          )
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
          <KPI icon={<Icon name="money" size={18} />} label="Valore a magazzino" value={fmt0(valoreStock)} highlight
            sub={`${righe.filter(r => r.valore > 0).length} ingredienti valorizzati`}/>
          <KPI icon={<Icon name="alert" size={18} />} label="Critici" value={critici.length}
            color={critici.length > 0 ? C.red : C.green}
            sub={critici.length > 0 ? 'clicca per vedere cosa ordinare' : 'tutto ok'}
            onClick={critici.length > 0 ? () => {
              const el = document.getElementById('riordino-urgente')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } : undefined}/>
          <KPI icon={<Icon name="warning" size={18} />} label="In esaurimento" value={attenzione.length}
            color={attenzione.length > 0 ? C.amber : C.green}
            sub={attenzione.length > 0 ? 'clicca per vedere quali' : 'ok'}
            onClick={attenzione.length > 0 ? () => {
              const el = document.getElementById('riordino-urgente')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } : undefined}/>
          <KPI icon={<Icon name="clock" size={18} />} label="Copertura media"
            value={coperturaMedia !== null ? `${coperturaMedia.toFixed(0)} gg` : '-'}
            color={coperturaMedia === null ? undefined : coperturaMedia < 3 ? C.red : coperturaMedia < 7 ? C.amber : C.green}
            sub={coperturaMedia !== null ? 'giorni di scorta' : 'storico assente'}/>
        </div>
      </div>

      {/* ── RIORDINO URGENTE (azionabile): cosa ordinare e quanto ── */}
      {(critici.length > 0 || attenzione.length > 0) && (() => {
        const daRiordinare = [...critici, ...attenzione]
          .filter(r => r.riordinoG > 0)
          .sort((a, b) => ({ esaurito: 0, critico: 1, attenzione: 2 }[a.stato] ?? 3) - ({ esaurito: 0, critico: 1, attenzione: 2 }[b.stato] ?? 3))
        if (daRiordinare.length === 0) return null
        const costoStimato = daRiordinare.reduce((s, r) => s + (r.riordinoG * r.costoG || 0), 0)
        return (
          <div id="riordino-urgente" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', marginBottom: 24, boxShadow: SHADOW_PREMIUM, scrollMarginTop: 70 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              background: 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.16)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="truck" size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Lista di riordino consigliata</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                  {daRiordinare.length} ingrediente/i · per coprire ~{GIORNI_TARGET} giorni di consumo
                </div>
              </div>
              {costoStimato > 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Spesa stimata</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', ...TNUM }}>{fmt0(costoStimato)}</div>
                </div>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 540 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {[['Ingrediente', 'left'], ['Giacenza', 'right'], ['Giorni scorta', 'right'], ['Da ordinare', 'right'], ['Costo stim.', 'right'], ['', 'right']].map(([h, al], i) => (
                      <th key={i} style={{ padding: '9px 14px', textAlign: al, fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daRiordinare.map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statoColor(r.stato), flexShrink: 0 }}/>
                          {r.nome}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: statoColor(r.stato), fontWeight: 700, ...TNUM }}>{fmtG(r.giacenza)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: statoColor(r.stato), fontWeight: 700, ...TNUM }}>
                        {r.giorniScorta !== null ? `${r.giorniScorta.toFixed(0)} gg` : '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: C.text, ...TNUM }}>
                        {fmtRiordino(r.riordinoG) ? `~ ${fmtRiordino(r.riordinoG)}` : '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textMid, ...TNUM }}>
                        {r.costoG > 0 ? fmt0(r.riordinoG * r.costoG) : '-'}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                        <button onClick={() => { setQuickLoad(r.k); setFormMode('carico'); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}
                          style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="plus" size={12} />Carica
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${T.border}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {[['giacenze', 'Materie prime'], ['pf', 'Prodotti finiti'], ['prezzi', 'Prezzi ingredienti'], ['carica', 'Carica merce'], ['log', 'Log rifornimenti']].filter(([id]) => !(isDipendente && id === 'prezzi')).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '12px 16px', minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? T.text : T.textSoft,
              borderBottom: tab === id ? `2px solid ${T.brand}` : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap', transition: `color ${M.durFast} ${M.ease}`, flexShrink: 0 }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'pf' && <ProdottiFinitiTab notify={notify} orgId={orgId} sedeId={sedeId} LEX={LEX}/>}

      {tab === 'giacenze' && (
        <div>
          <SectHead icon={<Icon name="package" size={17} />} title="Materie prime" sub="Giacenze, soglie di riordino e giorni di scorta"
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Toggle unità kg / g: tutti i pesi della pagina cambiano insieme. */}
                <div style={{ display: 'inline-flex', padding: 3, background: C.bgSubtle, borderRadius: 8 }}>
                  {['kg', 'g'].map(u => (
                    <button key={u} onClick={() => setUnitMode(u)}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: unitMode === u ? C.bgCard : 'transparent',
                        color: unitMode === u ? C.red : C.textSoft,
                        fontSize: 11.5, fontWeight: 700,
                        boxShadow: unitMode === u ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                        fontFamily: 'inherit',
                      }}>{u}</button>
                  ))}
                </div>
                <button onClick={() => setShowAddIng(true)} style={{ padding: '8px 16px', background: C.red, color: C.white, border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(110,14,26,0.2)' }}>+ Aggiungi ingrediente</button>
              </div>
            } />

          {showAddIng && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 120px 120px auto', gap: 10, alignItems: 'flex-end', boxShadow: SHADOW_PREMIUM }}>
              {[{ lbl: 'Nome ingrediente', val: newIngNome, set: setNewIngNome, ph: 'es. burro' },
                { lbl: 'Giacenza (g)', val: newIngQty, set: setNewIngQty, ph: 'es. 1000', type: 'number' },
                { lbl: 'Soglia alert (g)', val: newIngSoglia, set: setNewIngSoglia, ph: 'es. 500', type: 'number' }].map(({ lbl, val, set, ph, type }) => (
                <div key={lbl}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{lbl}</div>
                  <input type={type || 'text'} inputMode={type === 'number' ? 'decimal' : undefined} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    style={{ width: '100%', padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAddIngrediente} disabled={saving} style={{ flex: 1, padding: '10px 16px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvataggio…' : 'Aggiungi'}</button>
                <button aria-label="Chiudi" onClick={() => setShowAddIng(false)} style={{ padding: '10px 14px', minHeight: 44, minWidth: 44, background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          )}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    <SortTH k="nome" active={magKey === 'nome'} dir={magDir} onToggle={magToggle}>Ingrediente</SortTH>
                    <SortTH k="giacenza" right active={magKey === 'giacenza'} dir={magDir} onToggle={magToggle}>Giacenza</SortTH>
                    <SortTH k="fabb" right active={magKey === 'fabb'} dir={magDir} onToggle={magToggle} tip="Fabbisogno settimanale stimato dal consumo degli ultimi 7 giorni">Fabb. sett.</SortTH>
                    <SortTH k="giorniScorta" right active={magKey === 'giorniScorta'} dir={magDir} onToggle={magToggle} tip="Giorni di scorta rimanenti al ritmo di consumo attuale">Giorni scorta</SortTH>
                    <SortTH k="valore" right active={magKey === 'valore'} dir={magDir} onToggle={magToggle} tip="Valore della giacenza = quantità × prezzo €/kg">Valore</SortTH>
                    <SortTH k="riordino" right active={magKey === 'riordino'} dir={magDir} onToggle={magToggle} tip="Quantità consigliata da ordinare per coprire ~14 giorni di consumo">Da ordinare</SortTH>
                    <SortTH k="soglia" right active={magKey === 'soglia'} dir={magDir} onToggle={magToggle} tip="Soglia minima sotto la quale scatta l'alert di riordino">Soglia alert</SortTH>
                    <SortTH k="stato" active={magKey === 'stato'} dir={magDir} onToggle={magToggle}>Stato</SortTH>
                    <SortTH k="ultimoRif" right active={magKey === 'ultimoRif'} dir={magDir} onToggle={magToggle} tip="Data dell'ultimo rifornimento registrato">Ultimo riforn.</SortTH>
                    <th style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}` }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortMag(righe, (r, k) => ({
                    nome: r.nome, giacenza: r.giacenza, fabb: r.fabb,
                    giorniScorta: r.giorniScorta ?? 9999, soglia: r.soglia,
                    valore: r.valore, riordino: r.riordinoG,
                    stato: ({ esaurito: 0, critico: 1, attenzione: 2, ok: 3 }[r.stato] ?? 3),
                    ultimoRif: r.ultimoRif ? new Date(r.ultimoRif).getTime() : 0,
                  })[k] ?? 0).map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: quickLoad === r.k ? C.red : C.text, textTransform: 'capitalize', cursor: 'pointer' }}
                        title="Clic rapido → precompila form"
                        onClick={() => { setQuickLoad(r.k); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}>
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
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textMid, ...TNUM }}>{r.fabb > 0 ? fmtG(r.fabb) : '-'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: statoColor(r.stato), ...TNUM }}
                          title="Giorni di scorta: giacenza diviso consumo medio giornaliero">
                        {r.giorniScorta !== null ? `${r.giorniScorta.toFixed(0)}gg` : '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: r.valore > 0 ? C.text : C.textSoft, fontWeight: r.valore > 0 ? 700 : 400, ...TNUM }}>
                        {r.valore > 0 ? fmt0(r.valore) : '-'}
                        {r.valore > 0 && r.costoKg > 0 && (
                          <div style={{ fontSize: 9, color: C.textSoft, fontWeight: 500 }}>
                            € {r.costoKg.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', ...TNUM }}>
                        {(r.stato === 'critico' || r.stato === 'esaurito' || r.stato === 'attenzione') && fmtRiordino(r.riordinoG) ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 8, background: statoBg(r.stato), color: statoColor(r.stato), fontWeight: 800, fontSize: 11 }}>
                            <Icon name="truck" size={11} />~ {fmtRiordino(r.riordinoG)}
                          </span>
                        ) : (
                          <span style={{ color: C.textSoft }}>-</span>
                        )}
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
                            style={{ padding: '5px 10px', minWidth: 84, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.textMid, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', ...TNUM, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {r.soglia > 0 ? fmtG(r.soglia) : 'Imposta'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ background: statoBg(r.stato), color: statoColor(r.stato), fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{statoLabel(r.stato)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: C.textSoft, fontSize: 10 }}>
                        {r.ultimoRif ? new Date(r.ultimoRif).toLocaleDateString('it-IT') : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <button aria-label="Elimina ingrediente" onClick={() => { setDeleteIngConf(r.k); setDeleteIngPin('') }}
                          style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.red}`, background: C.redLight, color: C.red, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="trash" size={12} /></button>
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
          <SectHead icon={<Icon name="truck" size={17} />} title="Carica merce" sub="Registra rifornimenti, scarichi e rettifiche di magazzino" />
          <FotoOCR mode="magazzino" notify={notify} ricettario={ricettario} onResult={async res => {
            const now = new Date().toISOString()
            const nm = { ...magazzino }
            const newLogs = []
            for (const rawIng of (res.ingredienti || [])) {
              const nomeIT = translateIngredienteEN(rawIng.nome || '')
              const ing = { ...rawIng, nome: nomeIT }
              const k = normIng(ing.nome)
              // Guard NaN: se l'OCR omette la quantità, `0 + undefined = NaN`
              // verrebbe persistito corrompendo per sempre quella giacenza.
              const qg = Number(ing.quantita_g)
              const qtaG = Number.isFinite(qg) ? qg : 0
              if (qtaG <= 0) continue
              nm[k] = { nome: ing.nome.trim(), giacenza_g: (nm[k]?.giacenza_g || 0) + qtaG, soglia_g: nm[k]?.soglia_g || 0, ultimoRifornimento: now }
              newLogs.push({ id: `r-${Date.now()}-${k}`, data: now, ingrediente: ing.nome.trim(), quantita_g: qtaG, note: 'da foto' })
            }
            const updLogs = [...newLogs, ...(logRif || [])]
            try {
              await ssave(SK_MAG, nm)
              await ssave(SK_LOGRIF, updLogs)
            } catch (e) {
              notify(`Salvataggio OCR fallito: ${e.message || 'rete'}. Riprova.`, false)
              return
            }
            setMagazzino(nm)
            setLogRif(updLogs)
            notify(`Caricati ${(res.ingredienti || []).length} ingredienti in magazzino`)
          }}/>
          <FotoOCR mode="prezzi" notify={notify} ricettario={ricettario} onResult={async res => {
            if (!ricettario) { notify('Carica prima il ricettario', false); return }
            const ing_list = res.ingredienti || []
            const validi = ing_list.filter(i => i.prezzo_kg > 0)
            if (!validi.length) { notify('Nessun prezzo estratto', false); return }
            const nuoviCosti = {}
            for (const i of validi) {
              const k = normIng(translateIngredienteEN(i.nome || ''))
              nuoviCosti[k] = { costoKg: parseFloat(i.prezzo_kg.toFixed(4)), costoG: parseFloat((i.prezzo_kg / 1000).toFixed(6)), isStima: false }
            }
            if (onImportPrezziOCR) onImportPrezziOCR(nuoviCosti)
            notify(`${validi.length} prezzi aggiornati`)
          }}/>
          <div style={{ background: C.bgCard, border: `1px solid ${formMode === 'scarico' ? C.amber : C.border}`, borderRadius: 18, padding: isMobile ? '18px' : '28px', boxShadow: SHADOW_PREMIUM }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[['carico', 'plus', 'Carico merce', 'Rifornimento in entrata'], ['scarico', 'trash', 'Scarico / Rettifica', 'Rimuovi quantità']].map(([m, ic, lbl, sub]) => (
                <button key={m} onClick={() => setFormMode(m)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: `2px solid ${formMode === m ? (m === 'carico' ? C.green : C.amber) : C.border}`,
                    background: formMode === m ? (m === 'carico' ? C.greenLight : C.amberLight) : C.white,
                    color: formMode === m ? (m === 'carico' ? C.green : C.amber) : C.textMid,
                    fontWeight: formMode === m ? 800 : 500, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name={ic} size={12} />{lbl}</div>
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
                  list="ing-list" style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
                  Quantità (g) - {formMode === 'scarico' ? 'da rimuovere' : 'in arrivo'}
                </div>
                <input id="mag-qty-input" type="number" inputMode="decimal" value={formQty} onChange={e => setFormQty(e.target.value)} placeholder="es. 2000" min="0"
                  style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${formMode === 'scarico' ? C.amber : C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Note (opzionale)</div>
                <input type="text" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="es. Metro - bolla 1234"
                  style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
              </div>
              <datalist id="ing-list">{tuttiIngNomi.map(k => <option key={k} value={k}/>)}</datalist>
              <button onClick={handleCarica} disabled={!formIng || !formQty || saving}
                style={{ padding: '12px', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: (formIng && formQty && !saving) ? 'pointer' : 'default',
                  background: (formIng && formQty && !saving) ? (formMode === 'scarico' ? C.amber : C.red) : '#DDD',
                  color: (formIng && formQty && !saving) ? C.white : '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {saving ? 'Salvataggio…' : (formMode === 'scarico' ? <><Icon name="trash" size={14} />Rimuovi dal magazzino</> : <><Icon name="plus" size={14} />Aggiungi al magazzino</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'prezzi' && !isDipendente && (
        <PrezziIngredientiTab ricettario={ricettario} logPrezzi={logPrezzi} onUpdatePrezzo={onUpdatePrezzoIng} isMobile={isMobile}/>
      )}

      {tab === 'log' && (
        <div>
          <SectHead icon={<Icon name="clipboard" size={17} />} title="Log rifornimenti" sub="Storico carichi e scarichi di materie prime" />
          {(!logRif || logRif.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: C.textSoft }}>
              <div style={{ marginBottom: 12, color: C.textSoft }}><Icon name="clipboard" size={32} /></div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Nessun rifornimento registrato</div>
            </div>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
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
                      <td style={{ padding: '10px 14px', color: C.textSoft }}>{r.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {deleteIngConf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          role="dialog" aria-modal="true" aria-labelledby="delete-ing-title"
          onClick={e => { if (e.target === e.currentTarget) { setDeleteIngConf(null); setDeleteIngPin('') } }}>
          <div style={{ background: C.white, borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 24px 60px rgba(15,23,42,0.28)' }}>
            <div id="delete-ing-title" style={{ fontSize: 14, fontWeight: 900, color: C.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="trash" size={16} />Elimina ingrediente</div>
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
              <button onClick={() => { if (deleteIngPin === 'ELIMINA') handleDeleteIng(deleteIngConf) }} disabled={saving}
                style={{ flex: 1, padding: '11px', background: deleteIngPin === 'ELIMINA' && !saving ? C.red : '#EEE', color: deleteIngPin === 'ELIMINA' && !saving ? C.white : '#AAA', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: deleteIngPin === 'ELIMINA' && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Eliminazione…' : 'Elimina definitivamente'}
              </button>
              <button onClick={() => { setDeleteIngConf(null); setDeleteIngPin('') }} style={{ flex: 1, padding: '11px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
