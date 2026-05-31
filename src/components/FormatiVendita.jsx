// FormatiVendita — configurazione dei "formati di vendita" generici.
//
// Permette al titolare di definire come interpretare le righe di scontrino che
// non specificano il gusto/ripieno (es. "Cono piccolo", "Vaschetta 500g",
// "Panino"). Ogni formato è collegato a una CATEGORIA di ricette e a una
// quantità di base + costo contenitore, da cui ChiusuraView stima food cost e
// riconcilia produzione e cassa. Vedi src/lib/formatiVendita.js.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T } from '../lib/theme'
import { sload, ssave } from '../lib/storage'
import { SK_FORMATI } from '../lib/storageKeys'
import { buildIngCosti, isRicettaValida, getR } from '../lib/foodcost'
import {
  nuovoFormato, avgFCperGCategoria, fcStimatoFormato,
  componentiNormalizzati, costoComponentiUnita,
} from '../lib/formatiVendita'
import useIsMobile from '../lib/useIsMobile'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr,
}
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit' }
const labelStyle = { fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block' }
const fmt = n => `€ ${(Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(3)}`

export default function FormatiVendita({ orgId, ricettario, notify }) {
  const isMobile = useIsMobile()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const [formati, setFormati] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // formato in editing, o null

  // Categorie disponibili dalle ricette (per il dropdown).
  const categorie = useMemo(() => {
    const set = new Set()
    for (const r of Object.values(ricettario?.ricette || {})) {
      if (!isRicettaValida(r.nome)) continue
      const tipo = getR(r.nome, r).tipo
      if (tipo === 'semilavorato' || tipo === 'interno') continue
      const c = String(r.categoria || '').trim()
      if (c) set.add(c)
    }
    return [...set].sort()
  }, [ricettario])

  useEffect(() => {
    let alive = true
    if (!orgId) { setLoading(false); return }
    sload(SK_FORMATI, orgId, null).then(v => { if (alive) { setFormati(Array.isArray(v) ? v : []); setLoading(false) } })
    return () => { alive = false }
  }, [orgId])

  const persist = async (arr) => {
    // SAVE FIRST per evitare data-loss.
    try {
      await ssave(SK_FORMATI, arr, orgId, null)
    } catch (e) {
      notify?.('⚠ Errore salvataggio formati: ' + (e.message || 'rete'), false)
      return
    }
    setFormati(arr)
  }

  const salva = async () => {
    if (!form.nome.trim()) { notify?.('⚠ Dai un nome al formato (es. "Cono piccolo")', false); return }
    if (!form.categoria.trim()) { notify?.('⚠ Scegli la categoria di ricette collegata', false); return }
    const componenti = (Array.isArray(form.componenti) ? form.componenti : [])
      .map(c => ({
        nome: String(c?.nome || '').trim(),
        qta:  Number(c?.qta) || 0,
        costo: Number(c?.costo) || 0,
      }))
      .filter(c => c.nome && c.qta > 0)
    const pulito = {
      id: form.id,
      nome: form.nome.trim(),
      categoria: form.categoria.trim(),
      alias: (Array.isArray(form.alias) ? form.alias : String(form.alias || '').split(','))
        .map(a => a.trim()).filter(Boolean),
      baseQtaG: Number(form.baseQtaG) || 0,
      componenti,
      prezzoDefault: Number(form.prezzoDefault) || 0,
    }
    const idx = formati.findIndex(f => f.id === pulito.id)
    const arr = idx >= 0 ? formati.map(f => f.id === pulito.id ? pulito : f) : [...formati, pulito]
    await persist(arr)
    setForm(null)
    notify?.(`✓ Formato "${pulito.nome}" salvato`)
  }

  // Quando si apre il form (nuovo o modifica), normalizza i componenti (anche da
  // formato legacy con solo costoContenitore).
  const apriEditor = (base) => {
    setForm({ ...base, componenti: componentiNormalizzati(base) })
  }

  const elimina = async (id) => {
    await persist(formati.filter(f => f.id !== id))
    notify?.('✓ Formato eliminato')
  }

  // Anteprima FC stimato per il formato in editing.
  const previewFC = useMemo(() => {
    if (!form || !form.categoria) return null
    const avg = avgFCperGCategoria(form.categoria, ricettario, ingCosti)
    const fcUnit = fcStimatoFormato(form, avg || 0)
    const fcComponenti = costoComponentiUnita(form)
    return { avg, fcUnit, fcComponenti }
  }, [form, ricettario, ingCosti])

  if (loading) return <div style={{ padding: 24, color: C.textSoft, fontSize: 13 }}>Caricamento…</div>

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 12.5, color: '#78350F', lineHeight: 1.6 }}>
        <b>A cosa serve.</b> Se la tua cassa batte righe senza il gusto (es. <i>“Cono piccolo”</i>, <i>“Vaschetta 500g”</i>, <i>“Panino”</i>),
        qui le colleghi a una <b>categoria di ricette</b>. In chiusura cassa il ricavo viene contato per intero e il food cost stimato come
        media dei gusti di quella categoria — così cassa e produzione tornano anche senza il dettaglio del gusto.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Formati di vendita <span style={{ color: C.textSoft, fontWeight: 600 }}>({formati.length})</span></div>
        {!form && (
          <button onClick={() => apriEditor(nuovoFormato())}
            style={{ padding: '8px 16px', background: C.red, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Nuovo formato</button>
        )}
      </div>

      {form && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nome formato (come sullo scontrino)</label>
              <input style={inputStyle} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Cono piccolo" />
            </div>
            <div>
              <label style={labelStyle}>Categoria ricette collegata</label>
              <input style={inputStyle} list="categorie-list" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Gelato" />
              <datalist id="categorie-list">{categorie.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <label style={labelStyle}>Alias / altri nomi sullo scontrino (separati da virgola)</label>
              <input style={inputStyle} value={Array.isArray(form.alias) ? form.alias.join(', ') : form.alias}
                onChange={e => setForm({ ...form, alias: e.target.value })} placeholder="cono p, cono 1 gusto, conetto" />
            </div>
            <div>
              <label style={labelStyle}>Base consumata per unità (grammi)</label>
              <input style={inputStyle} type="number" min="0" value={form.baseQtaG} onChange={e => setForm({ ...form, baseQtaG: e.target.value })} placeholder="80" />
            </div>
            <div>
              <label style={labelStyle}>Prezzo di vendita (€, informativo)</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={form.prezzoDefault} onChange={e => setForm({ ...form, prezzoDefault: e.target.value })} placeholder="2.60" />
            </div>
          </div>

          {/* Distinta materiali consumabili (cono, vaschetta, fazzoletto, cucchiaino, ...) */}
          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>Materiali consumabili per unità</label>
            <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 8 }}>
              Tutto cio che va con la vendita: contenitore + accessori (cono cialda, fazzoletto, palettina, coppetta, cucchiaino…). Il food cost del formato somma queste voci.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(form.componenti || []).map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px auto', gap: 8, alignItems: 'center' }}>
                  <input style={inputStyle} value={c.nome || ''} placeholder="Cono cialda piccolo"
                    onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) }))}/>
                  <input style={inputStyle} type="number" min="0" step="0.01" value={c.qta ?? ''} placeholder="qta"
                    onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, qta: e.target.value } : x) }))}/>
                  <input style={inputStyle} type="number" min="0" step="0.001" value={c.costo ?? ''} placeholder="€/unita"
                    onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, costo: e.target.value } : x) }))}/>
                  <button onClick={() => setForm(f => ({ ...f, componenti: f.componenti.filter((_, j) => j !== i) }))}
                    style={{ padding: '6px 10px', background: C.redLight, color: C.red, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, componenti: [...(f.componenti || []), { nome: '', qta: 1, costo: 0 }] }))}
                style={{ alignSelf: 'flex-start', marginTop: 4, padding: '6px 12px', background: 'transparent', color: C.textMid, border: `1px dashed ${C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + Aggiungi materiale
              </button>
            </div>
          </div>

          {previewFC && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: previewFC.avg == null ? C.amberLight : C.greenLight, borderRadius: 9, fontSize: 12, color: C.textMid }}>
              {previewFC.avg == null ? (
                <span>⚠ Nessuna ricetta con categoria <b>“{form.categoria}”</b> (con peso definito): il food cost coprira solo i materiali. Assegna la categoria ai gusti nel Ricettario.</span>
              ) : (
                <span>
                  FC categoria <b>“{form.categoria}”</b>: {fmt(previewFC.avg * 1000)}/kg ·
                  materiali: <b>{fmt(previewFC.fcComponenti)}</b> ·
                  base ({Number(form.baseQtaG) || 0}g): <b>{fmt((Number(form.baseQtaG) || 0) * previewFC.avg)}</b>
                  {' '}→ FC stimato per unità: <b style={{ color: C.green }}>{fmt(previewFC.fcUnit)}</b>
                  {Number(form.prezzoDefault) > 0 && previewFC.fcUnit > 0 && <> · margine stimato <b>{((1 - previewFC.fcUnit / Number(form.prezzoDefault)) * 100).toFixed(0)}%</b></>}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={salva} style={{ padding: '9px 18px', background: C.green, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Salva formato</button>
            <button onClick={() => setForm(null)} style={{ padding: '9px 18px', background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}

      {formati.length === 0 && !form ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: C.bgCard, border: `1px dashed ${C.borderStr}`, borderRadius: 12, color: C.textSoft, fontSize: 13 }}>
          Nessun formato configurato. Aggiungine uno se la tua cassa batte prodotti senza il dettaglio del gusto.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {formati.map(f => {
            const avg = avgFCperGCategoria(f.categoria, ricettario, ingCosti)
            const fcUnit = fcStimatoFormato(f, avg || 0)
            return (
              <div key={f.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{f.nome}</div>
                  <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
                    Categoria: <b style={{ color: C.textMid }}>{f.categoria || '—'}</b> · base {f.baseQtaG || 0}g · materiali {fmt(costoComponentiUnita(f))} ({componentiNormalizzati(f).length})
                    {f.alias?.length > 0 && <> · alias: {f.alias.join(', ')}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>FC stimato / unità</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: avg == null ? C.amber : C.red }}>{fmt(fcUnit)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => apriEditor(f)} style={{ padding: '6px 12px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Modifica</button>
                  <button onClick={() => elimina(f.id)} style={{ padding: '6px 12px', background: C.redLight, color: C.red, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Elimina</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
