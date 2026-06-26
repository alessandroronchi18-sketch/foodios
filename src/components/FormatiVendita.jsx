// FormatiVendita - configurazione dei "formati di vendita" generici.
// Ridisegnata col metodo Food Cost: DIAGNOSI (banda KPI) → CAPISCI (lista premium
// dei formati con breakdown del costo confezionamento) → AGISCI (form chiaro).
//
// Permette al titolare di definire come interpretare le righe di scontrino che
// non specificano il gusto/ripieno (es. "Cono piccolo", "Vaschetta 500g",
// "Panino"). Ogni formato è collegato a una CATEGORIA di ricette e a una
// quantità di base + materiali consumabili, da cui ChiusuraView stima food cost e
// riconcilia produzione e cassa. Vedi src/lib/formatiVendita.js.

import React, { useEffect, useMemo, useState } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import { sload, ssave } from '../lib/storage'
import { SK_FORMATI } from '../lib/storageKeys'
import { buildIngCosti, isRicettaValida, getR } from '../lib/foodcost'
import {
  nuovoFormato, avgFCperGCategoria, fcStimatoFormato,
  componentiNormalizzati, costoComponentiUnita,
} from '../lib/formatiVendita'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { lessico } from '../lib/lessico'
import { KPI, fmt as fmtEuro, PageHeader, SH } from '../views/_shared'
import Icon from './Icon'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

// Formattazione monetaria a 3 decimali (i costi di confezionamento sono centesimi
// di euro: cono cialda 0,06 €, fazzoletto 0,01 € → servono i millesimi). Separatore IT.
const fmt3 = n => `${(Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €`

// fontSize 16 su mobile per evitare zoom automatico iOS (regola permanente CLAUDE.md).
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: R.md, border: `1px solid ${T.borderStr}`, fontSize: 16, color: T.text, boxSizing: 'border-box', fontFamily: 'inherit', background: T.bgCard }
const labelStyle = { fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }
const cardStyle = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: SHADOW_PREMIUM }

export default function FormatiVendita({ orgId, ricettario, notify, tipoAttivita }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const [formati, setFormati] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // formato in editing, o null
  const [expanded, setExpanded] = useState(null) // id formato col breakdown aperto

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
      notify?.('Errore salvataggio formati: ' + (e.message || 'rete'), false)
      return
    }
    setFormati(arr)
  }

  const salva = async () => {
    if (!form.nome.trim()) { notify?.('Dai un nome al formato (es. "Cono piccolo")', false); return }
    if (!form.categoria.trim()) { notify?.('Scegli la categoria di ricette collegata', false); return }
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
    notify?.(`Formato "${pulito.nome}" salvato`)
  }

  // Quando si apre il form (nuovo o modifica), normalizza i componenti (anche da
  // formato legacy con solo costoContenitore).
  const apriEditor = (base) => {
    setForm({ ...base, componenti: componentiNormalizzati(base) })
  }

  const elimina = async (id) => {
    await persist(formati.filter(f => f.id !== id))
    notify?.('Formato eliminato')
  }

  // ── Righe arricchite: costo materiali, FC categoria, FC stimato/unità, margine ─
  const rows = useMemo(() => formati.map(f => {
    const avg = avgFCperGCategoria(f.categoria, ricettario, ingCosti)
    const componenti = componentiNormalizzati(f)
    const costoMateriali = costoComponentiUnita(f)
    const fcBase = (Number(f.baseQtaG) || 0) * (avg || 0)
    const fcUnit = fcStimatoFormato(f, avg || 0)
    const prezzo = Number(f.prezzoDefault) || 0
    const margPct = prezzo > 0 && fcUnit >= 0 ? (1 - fcUnit / prezzo) * 100 : null
    return { f, avg, componenti, costoMateriali, fcBase, fcUnit, prezzo, margPct, fcKnown: avg != null }
  }), [formati, ricettario, ingCosti])

  // ── Diagnosi (banda KPI) ──────────────────────────────────────────────────────
  const diag = useMemo(() => {
    const n = rows.length
    const costoMedioMat = n > 0 ? rows.reduce((s, r) => s + r.costoMateriali, 0) / n : 0
    const piuCostoso = rows.reduce((best, r) => !best || r.costoMateriali > best.costoMateriali ? r : best, null)
    const senzaCategoria = rows.filter(r => !r.fcKnown).length
    return { n, costoMedioMat, piuCostoso, senzaCategoria }
  }, [rows])

  if (loading) return <div style={{ padding: 24, color: T.textSoft, fontSize: 13 }}>Caricamento…</div>

  // Anteprima FC per il formato in editing.
  const previewFC = (() => {
    if (!form || !form.categoria) return null
    const avg = avgFCperGCategoria(form.categoria, ricettario, ingCosti)
    const fcUnit = fcStimatoFormato(form, avg || 0)
    const fcComponenti = costoComponentiUnita(form)
    const baseG = Number(form.baseQtaG) || 0
    const prezzo = Number(form.prezzoDefault) || 0
    const margPct = prezzo > 0 && fcUnit > 0 ? (1 - fcUnit / prezzo) * 100 : null
    return { avg, fcUnit, fcComponenti, baseG, prezzo, margPct }
  })()

  const isEditing = !!form && formati.some(f => f.id === form.id)

  const nuovoBtn = !form && (
    <button onClick={() => apriEditor(nuovoFormato())}
      style={{ padding: '10px 16px', borderRadius: R.md, border: 'none', background: T.brand, color: '#fff',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.005em',
        display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.brand }}>
      <Icon name="plus" size={15} />Nuovo formato
    </button>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        subtitle="I formati senza gusto della tua cassa (vaschette, coni, scatole): quanto ti costa confezionarli e quanto incidono sul food cost."
        action={nuovoBtn}
      />

      {/* A cosa serve */}
      <div style={{ background: T.amberLight, border: `1px solid ${T.amber}40`, borderRadius: 14, padding: '14px 18px', marginBottom: 20, fontSize: 12.5, color: '#78350F', lineHeight: 1.6, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1, color: T.amber }}><Icon name="receipt" size={16} /></span>
        <span>
          <b>A cosa serve.</b> Se la tua cassa batte righe senza il gusto (es. <i>"Cono piccolo"</i>, <i>"Vaschetta 500g"</i>, <i>"Panino"</i>),
          qui le colleghi a una <b>categoria di ricette</b>. In chiusura cassa il ricavo viene contato per intero e il food cost stimato come
          media dei gusti di quella categoria, più i materiali di confezionamento - così cassa e produzione tornano anche senza il dettaglio del gusto.
        </span>
      </div>

      {/* ① DIAGNOSI */}
      {diag.n > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 16, marginBottom: 26 }}>
          <KPI icon={<Icon name="package" size={18} />} label="Formati configurati" value={diag.n.toLocaleString('it-IT')}
            sub={diag.n === 1 ? 'formato di vendita' : 'formati di vendita'} />
          <KPI icon={<Icon name="money" size={18} />} label="Confezionamento medio" value={fmt3(diag.costoMedioMat)}
            sub="materiali per unità" />
          <KPI icon={<Icon name="barChart" size={18} />} label="Formato più costoso"
            value={diag.piuCostoso ? fmt3(diag.piuCostoso.costoMateriali) : '-'}
            sub={diag.piuCostoso?.f?.nome || 'nessuno'} color={T.amber} />
          <KPI icon={<Icon name="receipt" size={18} />} label="Senza FC categoria" value={diag.senzaCategoria.toLocaleString('it-IT')}
            color={diag.senzaCategoria ? T.amber : T.green}
            sub={diag.senzaCategoria ? 'solo materiali stimati' : 'tutti collegati'} />
        </div>
      )}

      {/* ② FORM CREAZIONE / MODIFICA */}
      {form && (
        <div style={{ ...cardStyle, padding: isMobile ? 16 : 22, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.brand }}><Icon name={isEditing ? 'edit' : 'plus'} size={16} /></span>
            {isEditing ? 'Modifica formato' : 'Nuovo formato di vendita'}
          </div>
          <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 18 }}>
            Dai un nome uguale a come appare sullo scontrino, collega la categoria di gusti e descrivi cosa serve per confezionarlo.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
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

          {/* Distinta materiali consumabili */}
          <div style={{ marginTop: 22 }}>
            <label style={labelStyle}>Materiali di confezionamento per unità</label>
            <div style={{ fontSize: 11.5, color: T.textSoft, marginBottom: 10, lineHeight: 1.5 }}>
              Tutto ciò che va con la vendita: contenitore + accessori (cono cialda, fazzoletto, palettina, coppetta, cucchiaino…). Il food cost del formato somma queste voci.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(form.componenti || []).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 56px 84px 36px' : '2fr 80px 110px 100px 40px', gap: 8, ...labelStyle, marginBottom: 0, alignItems: 'end' }}>
                  <span>Materiale</span>
                  <span style={{ textAlign: 'right' }}>Qtà</span>
                  <span style={{ textAlign: 'right' }}>€/unità</span>
                  {!isMobile && <span style={{ textAlign: 'right' }}>Costo</span>}
                  <span />
                </div>
              )}
              {(form.componenti || []).map((c, i) => {
                const subtot = (Number(c.qta) || 0) * (Number(c.costo) || 0)
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 56px 84px 36px' : '2fr 80px 110px 100px 40px', gap: 8, alignItems: 'center' }}>
                    <input style={inputStyle} value={c.nome || ''} placeholder="Cono cialda piccolo"
                      onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) }))}/>
                    <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} type="number" min="0" step="0.01" value={c.qta ?? ''} placeholder="1"
                      onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, qta: e.target.value } : x) }))}/>
                    <input style={{ ...inputStyle, textAlign: 'right', ...TNUM }} type="number" min="0" step="0.001" value={c.costo ?? ''} placeholder="0,060"
                      onChange={e => setForm(f => ({ ...f, componenti: f.componenti.map((x, j) => j === i ? { ...x, costo: e.target.value } : x) }))}/>
                    {!isMobile && <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: T.textMid, ...TNUM }}>{fmt3(subtot)}</span>}
                    <button onClick={() => setForm(f => ({ ...f, componenti: f.componenti.filter((_, j) => j !== i) }))} title="Rimuovi materiale"
                      style={{ padding: '8px 0', width: 36, background: T.brandLight, color: T.brand, border: 'none', borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )
              })}
              <button onClick={() => setForm(f => ({ ...f, componenti: [...(f.componenti || []), { nome: '', qta: 1, costo: 0 }] }))}
                style={{ alignSelf: 'flex-start', marginTop: 4, padding: '8px 14px', background: 'transparent', color: T.textMid, border: `1px dashed ${T.borderStr}`, borderRadius: R.md, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={13} />Aggiungi materiale
              </button>
            </div>
          </div>

          {/* Anteprima FC del formato in editing */}
          {previewFC && (
            <div style={{ marginTop: 18, padding: '14px 16px', background: previewFC.avg == null ? T.amberLight : T.greenLight, border: `1px solid ${previewFC.avg == null ? T.amber : T.green}33`, borderRadius: R.md }}>
              {previewFC.avg == null ? (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: '#78350F', lineHeight: 1.55 }}>
                  <span style={{ flexShrink: 0, marginTop: 1, color: T.amber }}><Icon name="warning" size={15} /></span>
                  <span>Nessuna {LEX.ricetta} con categoria <b>"{form.categoria}"</b> (con peso definito): il food cost coprirà solo i materiali di confezionamento. Assegna la categoria ai {LEX.prodotti} nel {LEX.Ricettario} per stimare anche il prodotto.</span>
                </div>
              ) : (
                // Grid uniforme 4 col: ogni stat ha stesso label (10/700/0.08em) +
                // value (18/800) + hint (10.5). Incolonnati perfettamente tra di
                // loro su desktop; mobile passa a 2x2.
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 14 : 16, alignItems: 'start' }}>
                  <PreviewStat label="Materiali" val={fmt3(previewFC.fcComponenti)} />
                  <PreviewStat label={`Prodotto (${previewFC.baseG.toLocaleString('it-IT')}g)`} val={fmt3(previewFC.baseG * previewFC.avg)} hint={`FC ${form.categoria}: ${fmtEuro(previewFC.avg * 1000)}/kg`} />
                  <PreviewStat label="FC stimato / unità" val={fmt3(previewFC.fcUnit)} color={T.green} />
                  {previewFC.margPct != null && <PreviewStat label="Margine stimato" val={`${previewFC.margPct.toFixed(0)}%`} color={previewFC.margPct >= 60 ? T.green : previewFC.margPct >= 40 ? T.amber : T.brand} />}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={salva}
              style={{ padding: '11px 20px', background: T.green, color: '#fff', border: 'none', borderRadius: R.md, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name="check" size={15} />Salva formato
            </button>
            <button onClick={() => setForm(null)}
              style={{ padding: '11px 20px', background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}

      {/* ③ LISTA PREMIUM DEI FORMATI */}
      {formati.length === 0 && !form ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '56px 32px', color: T.textSoft }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: T.brandLight, color: T.brand, marginBottom: 14 }}>
            <Icon name="package" size={22} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Nessun formato configurato</div>
          <div style={{ fontSize: 13, maxWidth: 420, margin: '0 auto', lineHeight: 1.55 }}>
            Aggiungi un formato se la tua cassa batte prodotti senza il dettaglio del {LEX.prodotto} (vaschette, coni, scatole, panini).
          </div>
        </div>
      ) : formati.length > 0 && (
        <>
          <SH sub="Clicca un formato per vedere com'è composto il costo di confezionamento. Il FC stimato somma i materiali e la quota di prodotto.">I tuoi formati</SH>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => {
              const f = r.f
              const open = expanded === f.id
              const margCol = r.margPct == null ? T.textSoft : r.margPct >= 60 ? T.green : r.margPct >= 40 ? T.amber : T.brand
              return (
                <div key={f.id} style={{ ...cardStyle, overflow: 'hidden' }}>
                  {/* riga principale */}
                  <div onClick={() => setExpanded(open ? null : f.id)}
                    style={{ padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 18, flexWrap: 'wrap', cursor: 'pointer' }}>
                    <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: T.brandLight, color: T.brand }}>
                      <Icon name="package" size={19} />
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{f.nome}</div>
                      <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 3 }}>
                        Categoria: <b style={{ color: T.textMid }}>{f.categoria || '-'}</b> · base {(Number(f.baseQtaG) || 0).toLocaleString('it-IT')}g · {r.componenti.length} {r.componenti.length === 1 ? 'materiale' : 'materiali'}
                        {f.alias?.length > 0 && <> · alias: {f.alias.join(', ')}</>}
                      </div>
                    </div>

                    {/* mini-stat */}
                    <div style={{ display: 'flex', gap: isMobile ? 16 : 26, alignItems: 'center' }}>
                      <MiniStat label="Confezione" val={fmt3(r.costoMateriali)} />
                      <MiniStat label="FC / unità" val={fmt3(r.fcUnit)} color={r.fcKnown ? T.text : T.amber} title={r.fcKnown ? undefined : 'Stima sui soli materiali: categoria senza gusti pesati'} />
                      {r.margPct != null && <MiniStat label="Margine" val={`${r.margPct.toFixed(0)}%`} color={margCol} />}
                    </div>

                    {!isMobile && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); apriEditor(f) }}
                          style={{ padding: '8px 12px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="edit" size={13} />Modifica
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); elimina(f.id) }}
                          style={{ padding: '8px 12px', background: T.brandLight, color: T.brand, border: 'none', borderRadius: R.sm, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="trash" size={13} />Elimina
                        </button>
                      </div>
                    )}
                    <span style={{ color: T.textSoft, fontSize: 13, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
                  </div>

                  {/* breakdown espandibile */}
                  {open && (
                    <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: isMobile ? '14px 16px' : '16px 20px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                        Composizione del food cost per unità
                      </div>

                      {/* materiali di confezionamento */}
                      {r.componenti.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: T.textSoft, marginBottom: 12 }}>Nessun materiale di confezionamento definito.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                          {r.componenti.map((c, j) => {
                            const subtot = c.qta * c.costo
                            const pctCosto = r.fcUnit > 0 ? subtot / r.fcUnit * 100 : 0
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                                <span style={{ flex: '0 0 38%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text, fontWeight: 500 }}>
                                  {c.nome} <span style={{ color: T.textSoft, ...TNUM }}>· {c.qta.toLocaleString('it-IT')} × {fmt3(c.costo)}</span>
                                </span>
                                <span style={{ flex: 1, height: 7, background: T.bgCard, borderRadius: 4, overflow: 'hidden' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pctCosto)}%`, background: 'rgba(110,14,26,0.45)' }} />
                                </span>
                                <span style={{ flex: '0 0 70px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 600 }}>{fmt3(subtot)}</span>
                                <span style={{ flex: '0 0 44px', textAlign: 'right', ...TNUM, color: T.textSoft }}>{pctCosto.toFixed(0)}%</span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* quota prodotto + totali */}
                      <div style={{ borderTop: `1px dashed ${T.border}`, paddingTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 14 }}>
                        <BreakdownTot label="Materiali" val={fmt3(r.costoMateriali)} />
                        <BreakdownTot label={`Prodotto (${(Number(f.baseQtaG) || 0).toLocaleString('it-IT')}g)`}
                          val={r.fcKnown ? fmt3(r.fcBase) : '-'}
                          hint={r.fcKnown ? `FC ${f.categoria}: ${fmtEuro(r.avg * 1000)}/kg` : `categoria senza ${LEX.prodotti} pesati`} />
                        <BreakdownTot label="FC stimato / unità" val={fmt3(r.fcUnit)} color={r.fcKnown ? T.green : T.amber} big />
                        {r.prezzo > 0 && <BreakdownTot label={`Margine (prezzo ${fmtEuro(r.prezzo)})`} val={r.margPct != null ? `${r.margPct.toFixed(0)}%` : '-'} color={margCol} />}
                      </div>

                      {/* azioni su mobile (nel breakdown per non affollare la riga) */}
                      {isMobile && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                          <button onClick={(e) => { e.stopPropagation(); apriEditor(f) }}
                            style={{ flex: 1, padding: '10px', background: 'transparent', color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Icon name="edit" size={14} />Modifica
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); elimina(f.id) }}
                            style={{ flex: 1, padding: '10px', background: T.brandLight, color: T.brand, border: 'none', borderRadius: R.sm, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Icon name="trash" size={14} />Elimina
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// Mini statistica nella riga del formato (label + valore).
function MiniStat({ label, val, color, title }) {
  return (
    <div style={{ textAlign: 'right' }} title={title}>
      <div style={{ fontSize: 9, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, whiteSpace: 'nowrap', cursor: title ? 'help' : 'default' }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: color || T.text, ...TNUM }}>{val}</div>
    </div>
  )
}

// Totale nel breakdown espanso.
function BreakdownTot({ label, val, hint, color, big }) {
  return (
    <div title={hint}>
      <div style={{ fontSize: 9.5, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4, cursor: hint ? 'help' : 'default' }}>{label}</div>
      <div style={{ fontSize: big ? 18 : 15, fontWeight: 800, color: color || T.text, letterSpacing: '-0.02em', ...TNUM }}>{val}</div>
      {hint && <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// Statistica nell'anteprima del form.
function PreviewStat({ label, val, hint, color }) {
  // Uniforme: label 10/700/0.08em uppercase, value 18/800 tabular,
  // hint 10.5 textSoft. Tutti gli stat hanno la stessa altezza grazie
  // a minHeight + flex column.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 56 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textSoft, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || T.text, letterSpacing: '-0.02em', ...TNUM, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
      {hint && <div style={{ fontSize: 10.5, color: T.textSoft, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div>}
    </div>
  )
}
