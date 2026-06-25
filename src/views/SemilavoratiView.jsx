// Semilavorati — pagina di DIAGNOSI → CAPISCI → AGISCI (POV proprietario).
// 1) Banda diagnosi: n° semilavorati, costo medio €/kg, il più usato, il più caro.
// 2) Lista premium: per ogni semilavorato → costo (al kg / a porzione / batch), breakdown
//    ingredienti espandibile (calcolaFCDettaglio) e "Usato in N prodotti" con elenco
//    (reverse lookup su tutte le ricette che lo contengono come ingrediente).
// 3) Tabella ordinabile (costo, peso, n° utilizzi).
// 4) Form nuovo/modifica + OCR foto (logica di salvataggio invariata).
import React, { useState, useMemo } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, calcolaFCDettaglio, getR, isRicettaValida, normIng, PREZZI_HORECA, translateIngredienteEN, translateProdottoEN } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import Icon from '../components/Icon'
import { C, KPI, SH, PageHeader, Tip, Badge, TNUM, useSortable, SortTH } from './_shared'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const SHADOW_HOVER = '0 1px 2px rgba(15,23,42,0.06), 0 18px 40px rgba(15,23,42,0.10)'

const fmtKg  = v => `${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtBatch = v => `${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtPeso = g => g >= 1000 ? `${(g / 1000).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : `${Math.round(g).toLocaleString('it-IT')} g`

// ─── Card premium di un singolo semilavorato ─────────────────────────────────
function SemiCard({ sm, ricettario, ingCosti, onEdit, onDelete, LEX }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState(null)  // 'ingredienti' | 'usato' | null

  const { righe, tot: fc } = useMemo(() => calcolaFCDettaglio(sm.ric, ingCosti, ricettario), [sm.ric, ingCosti, ricettario])
  const mancanti = righe.filter(r => r.mancante)

  const cardStyle = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden',
    boxShadow: SHADOW_PREMIUM, transition: `box-shadow ${M.durBase} ${M.ease}, transform ${M.durBase} ${M.ease}`,
  }

  return (
    <div style={cardStyle}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = SHADOW_HOVER; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW_PREMIUM; e.currentTarget.style.transform = 'translateY(0)' }}>

      {/* Header riga — su mobile: card collapsed di default con chevron, tap per espandere */}
      <div style={{ padding: isMobile ? '14px 16px' : '18px 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? 14 : 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: R.full, background: T.brandLight, color: T.brand, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              <Icon name="package" size={11} />Base
            </span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{sm.nome}</h3>
            {mancanti.length > 0 && <Badge label={`${mancanti.length} prezzi stimati`} color="amber" />}
          </div>
          <div style={{ fontSize: 12, color: T.textSoft, letterSpacing: '-0.005em', ...TNUM }}>
            {fmtPeso(sm.peso)} batch · <span style={{ fontWeight: 600, color: T.textMid }}>{sm.nUsi > 0 ? `usato in ${sm.nUsi} ${sm.nUsi === 1 ? 'prodotto' : 'prodotti'}` : 'non ancora usato'}</span>
          </div>
        </div>

        {/* KPI compatti — su mobile 3 in riga con flex */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[
            { lbl: 'Costo / kg', val: fmtKg(sm.costoKg), c: T.brand, bg: T.brandLight, tip: 'Costo materie prime per chilo di semilavorato prodotto' },
            { lbl: 'Costo / 100g', val: fmtKg(sm.costoKg / 10), c: T.textMid, bg: T.bgSubtle, tip: 'Costo di una porzione tipica da 100 g' },
            { lbl: 'Batch', val: fmtBatch(fc), c: T.text, bg: T.bgSubtle, tip: 'Costo dell’intero impasto/batch come da ricetta' },
          ].map(({ lbl, val, c, bg, tip }) => (
            <Tip key={lbl} text={tip}>
              <div style={{ background: bg, padding: '9px 10px', borderRadius: R.md, textAlign: 'center', minWidth: isMobile ? 0 : 78, flex: isMobile ? 1 : 'none', cursor: 'help', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.textSoft, marginBottom: 4, minHeight: 22, lineHeight: 1.25 }}>{lbl}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: c, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...TNUM }}>{val}</div>
              </div>
            </Tip>
          ))}
        </div>

        {/* Azioni: su mobile in flexWrap pieni a 40px+ */}
        <div style={{ display: 'flex', gap: 6, alignSelf: isMobile ? 'stretch' : 'center', flexShrink: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <button onClick={() => setTab(t => t === 'ingredienti' ? null : 'ingredienti')}
            style={tabBtn(tab === 'ingredienti', isMobile)}>
            <Icon name="receipt" size={13} />Costo
          </button>
          <button onClick={() => setTab(t => t === 'usato' ? null : 'usato')}
            style={tabBtn(tab === 'usato', isMobile)}>
            <Icon name="barChart" size={13} />Dove
          </button>
          <button onClick={() => onEdit(sm.nome)} aria-label="Modifica" style={iconBtn()}
            onMouseEnter={e => { e.currentTarget.style.background = T.bgSubtle; e.currentTarget.style.color = T.text }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMid }}>
            <Icon name="edit" size={14} />
          </button>
          <button onClick={() => onDelete(sm.nome)} aria-label="Elimina" style={iconBtn(true)}
            onMouseEnter={e => { e.currentTarget.style.background = T.brandLight; e.currentTarget.style.color = T.brand; e.currentTarget.style.borderColor = 'rgba(110,14,26,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textSoft; e.currentTarget.style.borderColor = T.border }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {/* Pannello: breakdown costo */}
      {tab === 'ingredienti' && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: isMobile ? '14px 16px' : '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Composizione del costo del batch</div>
          {righe.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textSoft }}>Nessun ingrediente con quantità.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {righe.map((ing, j) => {
                const pctCosto = fc > 0 ? (ing.costo / fc * 100) : 0
                return (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ flex: isMobile ? '0 0 40%' : '0 0 32%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ing.mancante ? T.amber : T.text, fontWeight: j === 0 ? 700 : 500, textTransform: 'capitalize' }}>
                      {ing.nome}{ing.isSemilavorato ? ' (semilav.)' : ''}{ing.mancante ? ' · prezzo mancante' : ''}
                    </span>
                    <span style={{ flex: '0 0 50px', textAlign: 'right', ...TNUM, color: T.textSoft, fontSize: 11 }}>{Math.round(ing.qty).toLocaleString('it-IT')} g</span>
                    <span style={{ flex: 1, height: 7, background: T.bgCard, borderRadius: 4, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pctCosto)}%`, background: j === 0 ? T.brand : 'rgba(110,14,26,0.45)' }} />
                    </span>
                    <span style={{ flex: '0 0 70px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 600 }}>{fmtKg(ing.costo)}</span>
                    <span style={{ flex: '0 0 46px', textAlign: 'right', ...TNUM, color: T.textSoft, fontSize: 11 }}>{pctCosto.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          )}
          {mancanti.length > 0 && (
            <div style={{ marginTop: 12, padding: '8px 11px', background: C.amberLight, borderRadius: 8, fontSize: 11, color: C.amber, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="warning" size={13} /> Prezzi mancanti: {mancanti.map(m => m.nome).join(', ')} — il costo è sottostimato.
            </div>
          )}
        </div>
      )}

      {/* Pannello: dove è usato */}
      {tab === 'usato' && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: isMobile ? '14px 16px' : '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Usato in {sm.nUsi} {sm.nUsi === 1 ? 'prodotto' : 'prodotti'}
          </div>
          {sm.usato.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5 }}>
              Questo semilavorato non è ancora ingrediente di nessuna {LEX?.ricetta || 'ricetta'}. Aggiungi il suo nome (es. <em>"{sm.nome.toLowerCase()}"</em>) come ingrediente in un prodotto per usarlo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sm.usato.map(u => (
                <div key={u.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.full, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: T.text, textTransform: 'capitalize' }}>{u.nome.toLowerCase()}</span>
                  <span style={{ ...TNUM, color: T.textSoft, fontSize: 11 }}>{Math.round(u.qty).toLocaleString('it-IT')} g</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function tabBtn(active, isMobile) {
  return {
    padding: '10px 12px', minHeight: 40, borderRadius: R.md, border: `1px solid ${active ? T.brand : T.border}`,
    background: active ? T.brandLight : 'transparent', fontSize: 12, fontWeight: 600,
    color: active ? T.brand : T.textMid, cursor: 'pointer', letterSpacing: '-0.005em',
    display: 'inline-flex', alignItems: 'center', gap: 5, flex: isMobile ? 1 : 'none', justifyContent: 'center',
    transition: `background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
  }
}
function iconBtn(danger) {
  return {
    width: 40, height: 40, padding: 0, borderRadius: R.md, border: `1px solid ${T.border}`, background: T.bgCard,
    color: danger ? T.textSoft : T.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`,
  }
}

// ─── SEMILAVORATI VIEW ────────────────────────────────────────────────────────
export default function SemilavoratiView({ ricettario, onSave, notify, tipoAttivita }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  // ── Modello dati arricchito: costo, peso, reverse-lookup "dove è usato" ──────
  const semilavorati = useMemo(() => {
    const ricette = ricettario?.ricette || {}
    const semi = Object.values(ricette).filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo === 'semilavorato')

    // Reverse lookup: per ogni semilavorato, trova le ricette che lo contengono
    // come ingrediente. Match per nome normalizzato (chiave o ric.nome).
    return semi.map(ric => {
      const nomeKeyNorm = normIng((ric.nome || '').toLowerCase())
      const usato = []
      for (const r of Object.values(ricette)) {
        if (r.nome === ric.nome) continue
        if (!isRicettaValida(r.nome)) continue
        for (const ing of (r.ingredienti || [])) {
          if (normIng((ing.nome || '').toLowerCase()) === nomeKeyNorm) {
            usato.push({ nome: r.nome, qty: ing.qty1stampo || 0 })
            break
          }
        }
      }
      usato.sort((a, b) => b.qty - a.qty)

      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario)
      const peso = (ric.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
      const costoKg = peso > 0 ? (fc / peso * 1000) : 0
      return { ric, nome: ric.nome, fc, peso, costoKg, usato, nUsi: usato.length }
    })
  }, [ricettario, ingCosti])

  // ── Diagnosi ──────────────────────────────────────────────────────────────────
  const diag = useMemo(() => {
    const n = semilavorati.length
    const validi = semilavorati.filter(s => s.costoKg > 0)
    const costoMedioKg = validi.length ? validi.reduce((s, x) => s + x.costoKg, 0) / validi.length : 0
    const piuUsato = semilavorati.reduce((best, s) => (!best || s.nUsi > best.nUsi) ? s : best, null)
    const piuCaro = validi.reduce((best, s) => (!best || s.costoKg > best.costoKg) ? s : best, null)
    return { n, costoMedioKg, piuUsato, piuCaro }
  }, [semilavorati])

  // ── Tabella ordinabile ────────────────────────────────────────────────────────
  const { sortKey, sortDir, toggleSort, sort } = useSortable('nUsi', 'desc')
  const rowsSorted = useMemo(() => sort(semilavorati, (s, k) => s[k] ?? 0), [semilavorati, sortKey, sortDir])

  // ── Stato form (logica salvataggio invariata) ────────────────────────────────
  const empty = { nome: '', note: '', ingredienti: [] }
  const [form, setForm] = useState(empty)
  const [editMode, setEditMode] = useState(null)
  const [newIngNome, setNewIngNome] = useState('')
  const [newIngQty, setNewIngQty] = useState('')
  const [deleteConf, setDeleteConf] = useState(null)
  const [deletePin, setDeletePin] = useState('')
  const [overwriteConf, setOverwriteConf] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const tuttiIng = useMemo(() => {
    const s = new Set()
    for (const ric of Object.values(ricettario?.ricette || {}))
      for (const ing of (ric.ingredienti || [])) s.add(normIng(ing.nome))
    for (const k of Object.keys(PREZZI_HORECA)) s.add(k)
    return [...s].filter(k => k && k.length > 1).sort()
  }, [ricettario])

  const addIng = () => {
    if (!newIngNome.trim() || !newIngQty) return
    setForm(f => ({ ...f, ingredienti: [...f.ingredienti, { nome: newIngNome.trim(), qty1stampo: parseFloat(newIngQty) || 0, costoPerG: 0, costo1stampo: 0 }] }))
    setNewIngNome(''); setNewIngQty('')
  }
  const removeIng = i => setForm(f => ({ ...f, ingredienti: f.ingredienti.filter((_, j) => j !== i) }))

  const loadForEdit = nome => {
    const r = ricettario?.ricette?.[nome]
    if (!r) return
    setForm({ nome: r.nome, note: r.note || '', ingredienti: r.ingredienti.map(i => ({ ...i })) })
    setEditMode(nome)
    setShowForm(true)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const [saving, setSaving] = useState(false)
  const doSaveSemi = async () => {
    if (saving) return
    setSaving(true)
    const nuovaRic = {
      nome: form.nome.trim().toUpperCase(),
      sheetName: 'manuale', numStampi: 1, totImpasto1: 0, foodCost1: 0,
      ingredienti: form.ingredienti,
      note: form.note,
      tipo: 'semilavorato', unita: 0, prezzo: 0,
    }
    const nuovoRic = { ...(ricettario || {}), ricette: { ...(ricettario?.ricette || {}), [nuovaRic.nome]: nuovaRic } }
    // Audit 2026-07-01 HIGH: await + try/catch su onSave (potrebbe essere
    // async lato Dashboard.handleSaveRicetta), altrimenti notifichiamo "salvato"
    // mentre il DB ha rifiutato.
    try {
      await onSave(nuovoRic, {}, true)
      notify(`Semilavorato "${nuovaRic.nome}" salvato`)
      setForm(empty); setEditMode(null); setOverwriteConf(null); setShowForm(false)
    } catch (e) {
      notify('Errore salvataggio: ' + (e?.message || 'sconosciuto'), false)
    } finally { setSaving(false) }
  }
  const handleSave = () => {
    if (!form.nome.trim() || form.ingredienti.length === 0) { notify('Inserisci nome e almeno un ingrediente', false); return }
    const nomeUp = form.nome.trim().toUpperCase()
    const esiste = ricettario?.ricette?.[nomeUp]
    const isEditing = editMode === nomeUp
    if (esiste && !isEditing) { setOverwriteConf(nomeUp) } else { doSaveSemi() }
  }

  const handleDelete = async nome => {
    if (deletePin !== 'ELIMINA') { notify('Scrivi ELIMINA per confermare', false); return }
    if (saving) return
    setSaving(true)
    const nuovoRic = { ...ricettario, ricette: Object.fromEntries(Object.entries(ricettario.ricette || {}).filter(([k]) => k !== nome)) }
    try {
      await onSave(nuovoRic, {}, true)
      setDeleteConf(null); setDeletePin(''); setEditMode(null); setForm(empty)
      notify(`"${nome}" eliminato`)
    } catch (e) {
      notify('Errore eliminazione: ' + (e?.message || 'sconosciuto'), false)
    } finally { setSaving(false) }
  }

  // Live cost calc del form — Audit 2026-07-01 HIGH: usare calcolaFC con
  // ricettario per ricorrere su semilavorati nidificati (es. crema → pasta
  // frolla con sub-semilavorato). Prima sommava solo costi diretti.
  const fcLive = useMemo(() => {
    const ricFake = { nome: form.nome || 'preview', ingredienti: form.ingredienti }
    try {
      const { tot } = calcolaFC(ricFake, ingCosti, ricettario)
      return tot || 0
    } catch {
      return 0
    }
  }, [form.ingredienti, form.nome, ingCosti, ricettario])
  const pesoLive = form.ingredienti.reduce((s, i) => s + (i.qty1stampo || 0), 0)
  const costoKgLive = pesoLive > 0 ? fcLive / pesoLive * 1000 : 0

  const openNew = () => { setForm(empty); setEditMode(null); setShowForm(true); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }

  const headerAction = (
    <button onClick={openNew}
      style={{ padding: '10px 16px', borderRadius: R.md, border: 'none', background: T.brand, color: '#fff',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: S.brand }}>
      <Icon name="plus" size={15} />Nuovo semilavorato
    </button>
  )

  const kpiCols = isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        subtitle="Impasti, creme e basi interne: quanto ti costano al kg e in quali prodotti finiscono."
        action={headerAction}
      />

      {/* ① DIAGNOSI */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: isMobile ? 10 : 16, marginBottom: 26 }}>
        <KPI icon={<Icon name="package" size={18} />} label="Semilavorati" value={String(diag.n)}
          sub={diag.n === 1 ? 'base interna' : 'basi interne'} />
        <KPI icon={<Icon name="receipt" size={18} />} label="Costo medio / kg" value={fmtKg(diag.costoMedioKg)} color={T.brand}
          sub="materie prime" />
        <KPI icon={<Icon name="barChart" size={18} />} label="Il più usato"
          value={diag.piuUsato && diag.piuUsato.nUsi > 0 ? `${diag.piuUsato.nUsi}×` : '—'}
          sub={diag.piuUsato && diag.piuUsato.nUsi > 0 ? diag.piuUsato.nome : 'nessun utilizzo'} />
        <KPI icon={<Icon name="trendUp" size={18} />} label="Il più caro" highlight
          value={diag.piuCaro ? fmtKg(diag.piuCaro.costoKg) : '—'}
          sub={diag.piuCaro ? `${diag.piuCaro.nome} · al kg` : 'serve un prezzo'} />
      </div>

      {/* Empty state */}
      {semilavorati.length === 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? '36px 20px' : '56px 24px', textAlign: 'center', boxShadow: SHADOW_PREMIUM, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: T.brandLight, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.brand, marginBottom: 14 }}>
            <Icon name="package" size={28} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6, letterSpacing: '-0.01em' }}>Nessun semilavorato</div>
          <div style={{ fontSize: 13, color: T.textSoft, maxWidth: 360, margin: '0 auto 18px', lineHeight: 1.5 }}>
            Aggiungi basi interne come crema pasticcera, pasta frolla o fruit curd: ne calcoli il costo al kg e vedi in quali prodotti le usi.
          </div>
          {headerAction}
        </div>
      )}

      {/* ② LISTA PREMIUM */}
      {semilavorati.length > 0 && (
        <>
          <SH sub="Apri 'Costo' per la composizione, 'Dove' per i prodotti che lo usano.">I tuoi semilavorati</SH>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {semilavorati.map(sm => (
              <React.Fragment key={sm.nome}>
                <SemiCard sm={sm} ricettario={ricettario} ingCosti={ingCosti}
                  onEdit={loadForEdit} onDelete={n => setDeleteConf(n)} LEX={LEX} />
                {deleteConf === sm.nome && (
                  <div style={{ padding: '12px 16px', background: C.redLight, borderRadius: 12, border: `1px solid rgba(110,14,26,0.25)` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 8 }}>Scrivi <strong>ELIMINA</strong> per confermare l'eliminazione di "{sm.nome}"</div>
                    {sm.nUsi > 0 && (
                      <div style={{ fontSize: 11.5, color: C.red, marginBottom: 8, padding: '6px 10px', background: '#FEF3F2', border: '1px dashed rgba(110,14,26,0.4)', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Icon name="warning" size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span>Questo semilavorato è usato in <strong>{sm.nUsi} {sm.nUsi === 1 ? 'ricetta' : 'ricette'}</strong>. Eliminandolo, quelle ricette troveranno l&rsquo;ingrediente &ldquo;{sm.nome}&rdquo; senza ricetta sorgente (il food cost potrebbe risultare diverso).</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={deletePin} onChange={e => setDeletePin(e.target.value)} placeholder="ELIMINA"
                        style={{ flex: 1, minWidth: 120, padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13 }} />
                      <button onClick={() => handleDelete(sm.nome)}
                        style={{ padding: '8px 14px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Conferma</button>
                      <button onClick={() => { setDeleteConf(null); setDeletePin('') }}
                        style={{ padding: '8px 12px', background: C.white, color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Annulla</button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ③ TABELLA ORDINABILE */}
          <SH sub="Ordina per costo, peso o numero di utilizzi.">Riepilogo</SH>
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: SHADOW_PREMIUM, marginBottom: 28 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <SortTH k="nome" active={sortKey === 'nome'} dir={sortDir} onToggle={toggleSort}>Semilavorato</SortTH>
                    <SortTH k="peso" active={sortKey === 'peso'} dir={sortDir} onToggle={toggleSort} right tip="Peso totale dell'impasto/batch">Peso batch</SortTH>
                    <SortTH k="fc" active={sortKey === 'fc'} dir={sortDir} onToggle={toggleSort} right tip="Costo materie prime dell'intero batch">Costo batch</SortTH>
                    <SortTH k="costoKg" active={sortKey === 'costoKg'} dir={sortDir} onToggle={toggleSort} right tip="Costo per chilo di semilavorato">Costo / kg</SortTH>
                    <SortTH k="nUsi" active={sortKey === 'nUsi'} dir={sortDir} onToggle={toggleSort} right tip="In quanti prodotti finiti è usato">Usato in</SortTH>
                  </tr>
                </thead>
                <tbody>
                  {rowsSorted.map((s, i) => (
                    <tr key={s.nome} style={{ borderTop: i ? `1px solid ${T.borderSoft}` : 'none' }}>
                      <td style={{ padding: '11px 16px', fontWeight: 700, color: T.text, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span title={s.nome}>{s.nome}</span>
                      </td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, color: T.textMid, whiteSpace: 'nowrap' }}>{fmtPeso(s.peso)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, color: T.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtBatch(s.fc)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.costoKg > 0 ? fmtKg(s.costoKg) : '—'}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right', ...TNUM, whiteSpace: 'nowrap' }}>
                        {s.nUsi > 0
                          ? <span style={{ fontWeight: 700, color: T.text }}>{s.nUsi} {s.nUsi === 1 ? 'prodotto' : 'prodotti'}</span>
                          : <span style={{ color: T.textSoft }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ④ FORM NUOVO / MODIFICA */}
      {(showForm || editMode) && (
        <>
          <SH>{editMode ? `Modifica: ${editMode}` : 'Nuovo semilavorato'}</SH>

          {/* Foto rapida — sopra il form */}
          <div style={{ marginBottom: 12 }}>
            <FotoOCR mode="ricetta" notify={notify} ricettario={ricettario} onResult={res => {
              const SKIP = ['ingrediente', 'ingredient', 'ingredienti', 'nome ingrediente in minuscolo', 'n/d', 'nan', 'undefined', '']
              const UNIT_G = { g: 1, gr: 1, grammi: 1, grammo: 1, kg: 1000, chilo: 1000, chilogrammo: 1000,
                ml: 1, millilitri: 1, l: 1000, litro: 1000, litri: 1000, cl: 10, centilitri: 10, dl: 100, decilitri: 100,
                cucchiaio: 15, cucchiai: 15, tbsp: 15, cucchiaino: 5, cucchiaini: 5, tsp: 5,
                tazza: 240, cup: 240, tazze: 240, bicchiere: 200, bicchieri: 200,
                noce: 15, pizzico: 2, pizzichi: 2, qb: 0, pz: 1 }
              const toGrams = (i) => {
                if (i.qty != null && i.qty !== '') return parseFloat(i.qty) || 0
                const q = parseFloat(i.quantita) || 0
                const u = (i.unita || 'g').toLowerCase().trim()
                return Math.round(q * (UNIT_G[u] ?? 1))
              }
              const ings = (res.ingredienti || [])
                .map(i => ({ nome: translateIngredienteEN((i.nome || '').toLowerCase().trim()), qty1stampo: toGrams(i), costoPerG: 0, costo1stampo: 0 }))
                .filter(i => !SKIP.includes(i.nome.toLowerCase().trim()) && i.qty1stampo > 0)
              const nomeIT = (translateProdottoEN(res.nome || '') || '').toUpperCase()
              setForm(f => ({ ...f, nome: nomeIT || f.nome, note: res.note || f.note, ingredienti: ings.length > 0 ? ings : f.ingredienti }))
              if (ings.length > 0) notify(`Importato: ${nomeIT || 'semilavorato'} con ${ings.length} ingredienti`)
              else notify('Nessun ingrediente valido estratto dalla foto', false)
            }} />
          </div>

          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? 18 : 22, boxShadow: SHADOW_PREMIUM }}>
            {/* Template rapidi */}
            {!editMode && !form.nome && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="bolt" size={12} /> Template rapidi</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { nome: 'CREMA PASTICCERA', note: 'Mescola latte+uova+zucchero+amido. Cuoci a fuoco medio.', ings: [{ nome: 'latte intero', q: 500 }, { nome: 'tuorlo', q: 100 }, { nome: 'zucchero', q: 150 }, { nome: 'amido di mais', q: 40 }, { nome: 'bacca di vaniglia', q: 3 }] },
                    { nome: 'FRUIT PER CROSTATE', note: 'Riduzione frutta fresca con zucchero.', ings: [{ nome: 'fragola', q: 300 }, { nome: 'zucchero', q: 80 }, { nome: 'succo di limone', q: 20 }, { nome: 'pectina', q: 5 }] },
                    { nome: 'PASTA FROLLA', note: 'Impasto base per crostate e biscotti.', ings: [{ nome: 'farina 00', q: 300 }, { nome: 'burro', q: 150 }, { nome: 'zucchero a velo', q: 100 }, { nome: 'tuorlo', q: 40 }, { nome: 'scorza di limone', q: 3 }] },
                  ].map(t => (
                    <button key={t.nome} onClick={() => setForm({ nome: t.nome, note: t.note, ingredienti: t.ings.map(i => ({ nome: i.nome, qty1stampo: i.q, costoPerG: 0, costo1stampo: 0 })) })}
                      style={{ padding: '6px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgSubtle, color: T.textMid, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {t.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Nome</div>
                  <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
                    placeholder="es. CREMA PASTICCERA"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, fontWeight: 700, color: C.text, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Note</div>
                  <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="es. 180°C per 30 min"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Ingredienti */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Ingredienti ({form.ingredienti.length})</div>
                {form.ingredienti.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 11px', background: T.bgSubtle, borderRadius: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.text, fontWeight: 600, textTransform: 'capitalize' }}>{ing.nome}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.brand, ...TNUM }}>{ing.qty1stampo} g</span>
                      <button aria-label="Rimuovi ingrediente" onClick={() => removeIng(i)} style={{ background: 'none', border: 'none', color: T.textSoft, cursor: 'pointer', display: 'inline-flex', padding: 2 }}><Icon name="x" size={13} /></button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ flex: isMobile ? '1 1 100%' : 2 }}>
                    <input value={newIngNome}
                      onChange={e => setNewIngNome(e.target.value)}
                      onKeyDown={onEnterAutoComplete(tuttiIng, newIngNome, setNewIngNome, () => { if (newIngQty) addIng() })}
                      placeholder="ingrediente" list="semi-ing-list"
                      style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }} />
                    <datalist id="semi-ing-list">{tuttiIng.map(k => <option key={k} value={k} />)}</datalist>
                  </div>
                  <div style={{ flex: 1, minWidth: isMobile ? 100 : 'auto' }}>
                    <input type="number" inputMode="decimal" min="0" value={newIngQty} onChange={e => setNewIngQty(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addIng()}
                      placeholder="g"
                      style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={addIng} style={{ padding: '11px 14px', minHeight: 44, background: T.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, flex: isMobile ? 1 : 'none', justifyContent: 'center' }}><Icon name="plus" size={14} />Aggiungi</button>
                </div>
              </div>

              {/* Live preview */}
              {form.ingredienti.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10 }}>
                  {[
                    { lbl: 'Peso batch', val: fmtPeso(pesoLive), c: T.text },
                    { lbl: 'Costo batch', val: fmtBatch(fcLive), c: T.brand },
                    { lbl: 'Costo / kg', val: costoKgLive > 0 ? fmtKg(costoKgLive) : '—', c: T.brand },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ padding: '10px 12px', background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{lbl}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: c, ...TNUM }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {overwriteConf && (
                <div style={{ padding: '12px 14px', background: C.amberLight, border: `2px solid ${C.amber}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="warning" size={14} /> "{overwriteConf}" esiste già — sovrascrivere?</div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={doSaveSemi} style={{ padding: '8px 14px', background: C.amber, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="checkCircle" size={14} /> Sovrascrivi</button>
                    <button onClick={() => setOverwriteConf(null)} style={{ padding: '8px 12px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleSave}
                  style={{ flex: 1, minWidth: 200, padding: '12px', background: T.brand, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: S.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name="save" size={15} /> {editMode ? 'Aggiorna semilavorato' : 'Salva semilavorato'}
                </button>
                <button onClick={() => { setEditMode(null); setForm(empty); setShowForm(false); setOverwriteConf(null) }}
                  style={{ padding: '12px 16px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {editMode ? 'Annulla modifica' : 'Chiudi'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: '11px 14px', background: T.brandLight, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, color: T.textMid, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
            <Icon name="bulb" size={14} color={T.brand} style={{ marginTop: 2, flexShrink: 0 }} /><span>Per usare un semilavorato in una {LEX.ricetta}, aggiungi il suo nome come ingrediente (es. <em>"crema pasticcera"</em>) con la quantità in grammi — il costo si calcola automaticamente.</span>
          </div>
        </>
      )}
    </div>
  )
}
