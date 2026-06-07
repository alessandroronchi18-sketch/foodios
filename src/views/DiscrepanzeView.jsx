// DiscrepanzeView — Tracking delle discrepanze tra dato teorico e dato reale:
// regali ai clienti, porzioni più abbondanti/scarse, avanzi, scarti, errori di produzione.
//
// Tutte le discrepanze diventano perdite stimate in € → entrano nel calcolo del food cost
// "reale" (sopra il teorico) e permettono di vedere quanto si sta perdendo a fine mese.
//
// Storage: localStorage + Supabase via sload/ssave (chiave SK_DISC).

import React, { useEffect, useMemo, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import useIsMobile from '../lib/useIsMobile'
import { color as T } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, normIng } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import { C, fmt, fmt0, TNUM, KPI, PageHeader, SH } from './_shared'

export const SK_DISCREPANZE = 'pasticceria-discrepanze-v1'

const TIPI = [
  { id: 'regalo',            label: 'Regalo al cliente',  emoji: '🎁', desc: 'Prodotto ceduto gratis (cortesia, recupero cliente)' },
  { id: 'porzione_grande',   label: 'Porzione abbondante', emoji: '🍰', desc: 'Lo staff ha dato porzioni più grandi del previsto' },
  { id: 'porzione_piccola',  label: 'Porzione ridotta',    emoji: '🥄', desc: 'Porzioni più piccole → cliente potenzialmente insoddisfatto' },
  { id: 'avanzo',            label: 'Avanzo fine giornata', emoji: '🌙', desc: 'Prodotto non venduto a fine giornata' },
  { id: 'scarto',            label: 'Scarto / Buttato',    emoji: '🗑',  desc: 'Prodotto gettato (scadenza, contaminazione, errore)' },
  { id: 'errore_produzione', label: 'Errore in produzione', emoji: '⚠️', desc: 'Prodotto venuto male in cottura/lavorazione' },
  { id: 'furto',             label: 'Ammanco',             emoji: '🚨', desc: 'Sparizione non spiegata da inventario' },
]

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

export default function DiscrepanzeView({ orgId, sedeId, ricettario, notify, LEX = lessico() }) {
  const isMobile = useIsMobile()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('tutti') // 'tutti' | id tipo
  const [meseFiltro, setMeseFiltro] = useState(() => new Date().toISOString().slice(0, 7))
  const [draft, setDraft] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const ricetteList = useMemo(
    () => Object.values(ricettario?.ricette || {}).map(r => r.nome).sort(),
    [ricettario]
  )

  // Mappa nome ricetta → fc unità (per costo stimato della discrepanza)
  const fcUnitaMap = useMemo(() => {
    const m = {}
    for (const r of Object.values(ricettario?.ricette || {})) {
      const reg = getR(r.nome, r)
      const { tot } = calcolaFC(r, ingCosti, ricettario)
      const fcUnita = reg.unita > 0 ? tot / reg.unita : tot
      m[r.nome] = { fcUnita, prezzoUnita: reg.prezzo || 0, reg }
    }
    return m
  }, [ricettario, ingCosti])

  useEffect(() => {
    if (!orgId) return
    sload(SK_DISCREPANZE, orgId, sedeId || null).then(v => {
      setItems(Array.isArray(v) ? v : [])
      setLoading(false)
    })
  }, [orgId, sedeId])

  async function salvaTutti(next) {
    // SAVE FIRST: niente state mutation se ssave fallisce.
    try {
      await ssave(SK_DISCREPANZE, next, orgId, sedeId || null)
    } catch (e) {
      notify?.('⚠ Errore salvataggio discrepanze: ' + (e.message || 'rete'), false)
      return false
    }
    setItems(next)
    return true
  }

  function nuovo(tipo = 'regalo') {
    setDraft({
      id: uid(),
      data: new Date().toISOString().slice(0, 10),
      tipo,
      prodotto: '',
      quantita: 1,
      costo_unita: 0,
      costo_totale: 0,
      mancato_ricavo: 0,
      note: '',
      _new: true,
    })
  }

  function aggiorna(patch) {
    setDraft(d => {
      const nd = { ...d, ...patch }
      // Auto-calcolo costo + mancato ricavo se prodotto è una ricetta nota
      const ref = fcUnitaMap[nd.prodotto]
      if (ref) {
        const qty = Number(nd.quantita) || 0
        const fcU = Number(nd.costo_unita) || ref.fcUnita || 0
        nd.costo_totale = parseFloat((qty * fcU).toFixed(2))
        // Per regali/avanzi: anche mancato ricavo
        if (['regalo', 'avanzo', 'scarto', 'errore_produzione'].includes(nd.tipo)) {
          nd.mancato_ricavo = parseFloat((qty * ref.prezzoUnita).toFixed(2))
        } else {
          nd.mancato_ricavo = 0
        }
      }
      return nd
    })
  }

  async function salva() {
    if (salvando) return
    if (!draft) return
    if (!draft.prodotto.trim()) return notify?.('Prodotto obbligatorio', false)
    if (!Number(draft.quantita)) return notify?.('Quantità deve essere > 0', false)
    const norm = { ...draft, _new: undefined, updated_at: new Date().toISOString() }
    const next = draft._new ? [norm, ...items] : items.map(i => i.id === draft.id ? norm : i)
    setSalvando(true)
    const ok = await salvaTutti(next)
    setSalvando(false)
    if (!ok) return // salvaTutti ha già notificato l'errore: non chiudere né dare falso ok
    setDraft(null)
    notify?.('✓ Discrepanza registrata')
  }

  async function elimina(id) {
    if (!confirm('Rimuovere questa discrepanza?')) return
    await salvaTutti(items.filter(i => i.id !== id))
    notify?.('✓ Rimossa')
  }

  // Filtri
  const visibili = useMemo(() => {
    return items
      .filter(i => tab === 'tutti' ? true : i.tipo === tab)
      .filter(i => !meseFiltro || (i.data || '').startsWith(meseFiltro))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  }, [items, tab, meseFiltro])

  // KPI mese
  const kpi = useMemo(() => {
    const ms = items.filter(i => (i.data || '').startsWith(meseFiltro))
    const totCosto = ms.reduce((s, i) => s + Number(i.costo_totale || 0), 0)
    const totMancato = ms.reduce((s, i) => s + Number(i.mancato_ricavo || 0), 0)
    const perTipo = {}
    for (const i of ms) {
      perTipo[i.tipo] = perTipo[i.tipo] || { count: 0, costo: 0, mancato: 0 }
      perTipo[i.tipo].count += 1
      perTipo[i.tipo].costo += Number(i.costo_totale || 0)
      perTipo[i.tipo].mancato += Number(i.mancato_ricavo || 0)
    }
    return { totCosto, totMancato, perTipo, n: ms.length }
  }, [items, meseFiltro])

  if (loading) return <div style={{ fontSize: 13, color: C.textSoft, padding: 24 }}>Caricamento…</div>

  const card = { background: C.bgCard, borderRadius: 16, padding: '18px 20px', border: `1px solid ${C.border}`, marginBottom: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }
  const lbl  = { fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }
  const inp  = { width: '100%', height: 40, padding: '0 12px', border: `1px solid ${C.borderStr}`, borderRadius: 8, fontSize: 13, color: C.text, background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div style={{ maxWidth: 1200, padding: isMobile ? 8 : 0 }}>
      {/* Header */}
      <PageHeader subtitle={<>Traccia tutto ciò che <b style={{ color: C.text }}>non finisce nella cassa</b>: regali, porzioni fuori standard, sprechi, errori in produzione. Capire dove perdi è il primo passo per smettere di farlo.</>} />

      {/* KPI mese */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <KPI icon="📋" label="Registrate" value={kpi.n} sub={meseFiltro} />
        <KPI icon="📉" label="Costo perso" value={fmt0(kpi.totCosto)} sub="Materie prime regalate/buttate" color="#92400E" />
        <KPI icon="🚫" label="Mancato ricavo" value={fmt0(kpi.totMancato)} sub="Vendite non realizzate" color={C.red} />
        <KPI icon="💥" label="Impatto totale" value={fmt0(kpi.totCosto + kpi.totMancato)} sub="Costo + mancato ricavo" color={C.red} highlight />
      </div>

      {/* Tabs + filtro mese + nuovo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setTab('tutti')}
          style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${tab === 'tutti' ? C.red : C.border}`,
            background: tab === 'tutti' ? C.redLight : C.bgCard, color: tab === 'tutti' ? C.red : C.textMid,
            fontSize: 12, fontWeight: tab === 'tutti' ? 800 : 500, cursor: 'pointer' }}>
          Tutti ({items.length})
        </button>
        {TIPI.map(t => {
          const conta = items.filter(i => i.tipo === t.id).length
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${tab === t.id ? C.red : C.border}`,
                background: tab === t.id ? C.redLight : C.bgCard, color: tab === t.id ? C.red : C.textMid,
                fontSize: 12, fontWeight: tab === t.id ? 800 : 500, cursor: 'pointer' }}>
              {t.emoji} {t.label} {conta > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({conta})</span>}
            </button>
          )
        })}
        <div style={{ flex: 1 }}/>
        <input type="month" value={meseFiltro} onChange={e => setMeseFiltro(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.bgCard }}/>
        {!draft && (
          <button onClick={() => nuovo(tab === 'tutti' ? 'regalo' : tab)}
            style={{ padding: '7px 14px', background: C.red, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Registra discrepanza
          </button>
        )}
      </div>

      {/* Form draft */}
      {draft && (
        <div style={{ ...card, border: `2px solid ${C.red}`, background: '#FEF7F5' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.text, marginBottom: 14 }}>
            {draft._new ? 'Nuova discrepanza' : 'Modifica discrepanza'}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Tipo</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TIPI.map(t => (
                <button key={t.id} onClick={() => aggiorna({ tipo: t.id })}
                  title={t.desc}
                  style={{ padding: '7px 12px', borderRadius: 8, border: `1.5px solid ${draft.tipo === t.id ? C.red : C.border}`,
                    background: draft.tipo === t.id ? C.redLight : C.bgCard,
                    color: draft.tipo === t.id ? C.red : C.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={lbl}>{LEX.Prodotto} / {LEX.Ricetta}</label>
              <input list="ricette-disc-list" value={draft.prodotto}
                onChange={e => aggiorna({ prodotto: e.target.value })}
                onKeyDown={onEnterAutoComplete(ricetteList, draft.prodotto, v => aggiorna({ prodotto: v }))}
                placeholder="Es. Torta Domori" style={inp}/>
              <datalist id="ricette-disc-list">{ricetteList.map(n => <option key={n} value={n}/>)}</datalist>
            </div>
            <div>
              <label style={lbl}>Quantità</label>
              <input type="number" min="0" step="0.01" value={draft.quantita}
                onChange={e => aggiorna({ quantita: e.target.value })} style={inp}/>
            </div>
            <div>
              <label style={lbl}>Data</label>
              <input type="date" value={draft.data}
                onChange={e => aggiorna({ data: e.target.value })} style={inp}/>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ ...lbl, cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3, display: 'inline-block' }} title="Food cost per unità — calcolato automaticamente dalla ricetta; puoi sovrascriverlo">FC unità (€)</label>
              <input type="number" min="0" step="0.01" value={draft.costo_unita}
                onChange={e => aggiorna({ costo_unita: e.target.value })}
                placeholder="auto" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Costo totale</label>
              <input type="number" value={draft.costo_totale} readOnly
                style={{ ...inp, background: C.bgSubtle, fontWeight: 700, color: '#92400E' }}/>
            </div>
            <div>
              <label style={lbl}>Mancato ricavo</label>
              <input type="number" value={draft.mancato_ricavo} readOnly
                style={{ ...inp, background: C.bgSubtle, fontWeight: 700, color: C.red }}/>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Note</label>
            <input value={draft.note || ''} onChange={e => aggiorna({ note: e.target.value })}
              placeholder="Es. tavolo 12, cliente abituale; oppure: errore nella cottura" style={inp}/>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={salva} disabled={salvando}
              style={{ padding: '10px 18px', background: C.red, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Salvataggio…' : 'Salva'}
            </button>
            <button onClick={() => setDraft(null)}
              style={{ padding: '10px 16px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {!draft && visibili.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textSoft }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Nessuna discrepanza registrata{tab !== 'tutti' ? ` in "${TIPI.find(t => t.id === tab)?.label || tab}"` : ''}.</div>
          <div style={{ fontSize: 12 }}>Buon segno! Oppure ricordati di registrare regali, scarti e avanzi.</div>
        </div>
      )}

      {!draft && visibili.map(it => {
        const t = TIPI.find(x => x.id === it.tipo) || { emoji: '?', label: it.tipo }
        return (
          <div key={it.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>{t.emoji}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{t.label}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, textTransform: 'capitalize' }}>{it.prodotto}</div>
                <div style={{ fontSize: 12, color: C.textSoft, marginTop: 4 }}>
                  📅 {new Date(it.data + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                  &nbsp;·&nbsp; <b>{it.quantita}</b> pz
                </div>
                {it.note && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 4, fontStyle: 'italic' }}>{it.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: C.textSoft, fontWeight: 700 }}>Costo</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#92400E', ...TNUM }}>{fmt(it.costo_totale || 0)}</div>
                {Number(it.mancato_ricavo) > 0 && (
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginTop: 4, ...TNUM }}>
                    Mancato: {fmt(it.mancato_ricavo)}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setDraft({ ...it })}
                style={{ padding: '5px 10px', background: C.bgSubtle, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>
                Modifica
              </button>
              <button onClick={() => elimina(it.id)}
                style={{ padding: '5px 10px', background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, fontWeight: 700, color: C.red, cursor: 'pointer' }}>
                Elimina
              </button>
            </div>
          </div>
        )
      })}

      {/* Breakdown per tipo */}
      {!draft && Object.keys(kpi.perTipo).length > 0 && (
        <>
        <SH sub={`Quanto pesa ogni categoria di perdita · ${meseFiltro}`}>Breakdown per tipo</SH>
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {Object.entries(kpi.perTipo).sort((a, b) => b[1].costo - a[1].costo).map(([tid, v]) => {
              const t = TIPI.find(x => x.id === tid)
              return (
                <div key={tid} style={{ padding: '12px 14px', background: C.bgSubtle, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{t?.emoji} {t?.label || tid}</div>
                  <div style={{ fontSize: 11, color: C.textSoft }}>{v.count} eventi · {fmt(v.costo)} costo · {fmt(v.mancato)} mancato</div>
                </div>
              )
            })}
          </div>
        </div>
        </>
      )}
    </div>
  )
}
