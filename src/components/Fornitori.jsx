import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { todayLocal } from '../lib/dateLocal'
import { KPI, SH, PageHeader, Tip, C, useSortable, SortTH } from '../views/_shared'

const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

function fmt(n) { return n == null ? "—" : `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` }
function fmt0(n) { const x = Number(n); return `${Math.round(Number.isFinite(x) ? x : 0).toLocaleString('it-IT')} €` }
function fmtDate(s) { if (!s) return "—"; const d = new Date(s); return d.toLocaleDateString("it-IT") }

// Maschera IBAN: mostra prefisso paese + 2 cifre e ultime 4. Es: IT60…3456
function maskIban(iban) {
  if (!iban) return null
  const clean = String(iban).replace(/\s+/g, '').toUpperCase()
  if (clean.length < 8) return clean
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`
}

const CATEGORIE_SUGG = ['Farine', 'Latticini', 'Frutta', 'Frutta secca', 'Cioccolato', 'Zuccheri', 'Uova', 'Lieviti', 'Aromi', 'Imballaggi', 'Bevande', 'Surgelati', 'Pulizia', 'Attrezzature', 'Altro']

// Palette stabile per chip categoria / barre breakdown
const PALETTE = ['#6E0E1A', '#0E9F6E', '#D97706', '#2563EB', '#7C3AED', '#0891B2', '#BE185D', '#65A30D', '#C2410C', '#4338CA']
function catColor(name) {
  if (!name) return '#94A3B8'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// ─────────────────────────────────────────────────────────────────────────────
// Banda diagnosi (KPI condivisi) — n° attivi, spesa periodo, top fornitore, categorie
// ─────────────────────────────────────────────────────────────────────────────
function BandaDiagnosi({ orgId, sedeId, isMobile, isTablet, refreshKey }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!orgId) return
      const from = new Date(); from.setDate(from.getDate() - 30)
      const fromStr = from.toISOString().slice(0, 10)
      const [{ data: forn }, { data: ord }] = await Promise.all([
        supabase.from("fornitori").select("id,categoria,nome").eq("organization_id", orgId).eq("attivo", true),
        supabase.from("ordini_fornitori").select("totale,fornitore_id,fornitori(nome)").eq("organization_id", orgId).eq("stato", "ricevuto").gte("data_ordine", fromStr),
      ])
      if (!alive) return
      const attivi = (forn || []).length
      const categorie = new Set((forn || []).map(f => (f.categoria || '').trim()).filter(Boolean)).size
      const spesa = (ord || []).reduce((s, o) => s + (Number(o.totale) || 0), 0)
      const byForn = {}
      for (const o of (ord || [])) {
        const n = o.fornitori?.nome || "—"
        byForn[n] = (byForn[n] || 0) + (Number(o.totale) || 0)
      }
      const top = Object.entries(byForn).sort((a, b) => b[1] - a[1])[0]
      setStats({ attivi, categorie, spesa, topNome: top?.[0] || "—", topTot: top?.[1] || 0 })
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId, refreshKey])

  const s = stats || { attivi: 0, categorie: 0, spesa: 0, topNome: "—", topTot: 0 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 16 : 24 }}>
      <KPI label="Fornitori attivi" value={s.attivi.toLocaleString('it-IT')} icon={<Icon name="truck" size={17} />} />
      <KPI label="Spesa 30gg" value={fmt0(s.spesa)} sub="ordini ricevuti" color={T.brand} highlight icon={<Icon name="money" size={17} />} />
      <KPI label="Top fornitore" value={s.topNome} sub={s.topTot > 0 ? `${fmt0(s.topTot)} · 30gg` : "—"} icon={<Icon name="trophy" size={17} />} />
      <KPI label="Categorie" value={s.categorie.toLocaleString('it-IT')} sub="merceologiche" icon={<Icon name="package" size={17} />} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Anagrafica fornitori
// ─────────────────────────────────────────────────────────────────────────────
function FornitoriTab({ orgId, sedeId, sedi = [], notify, isMobile, isTablet = false, onMutate }) {
  const confirmDialog = useConfirm()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: "", contatto: "", email: "", telefono: "", note: "", sede_id: "", iban: "", termini_pagamento: "30", categoria: "" })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Scope comandato dal selettore GLOBALE in topbar: sede specifica → quella + azienda;
  // "Tutte le sedi" (sedeId assente) → tutte. Niente toggle interno (un solo controllo).
  const scopeSede = sedeId ? 'attiva' : 'tutte'
  const [vista, setVista] = useState('attivi') // 'attivi' | 'archivio'
  const [archCount, setArchCount] = useState(0)
  const [q, setQ] = useState("")

  const haPiuSedi = (sedi || []).filter(s => s.attiva !== false).length > 1
  const sediMap = Object.fromEntries((sedi || []).map(s => [s.id, s]))
  const inArchivio = vista === 'archivio'

  useEffect(() => { carica() }, [orgId, sedeId, vista])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    let query = supabase.from("fornitori").select("*").eq("organization_id", orgId).eq("attivo", !inArchivio).order("nome")
    if (scopeSede === 'attiva' && sedeId) {
      query = query.or(`sede_id.eq.${sedeId},sede_id.is.null`)
    }
    const { data, error } = await query
    if (error) notify?.("Errore caricamento fornitori: " + error.message, false)
    setLista(data || [])
    const { count } = await supabase.from("fornitori").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("attivo", false)
    setArchCount(count || 0)
    setLoading(false)
  }

  async function salva() {
    if (!form.nome.trim()) { notify("Inserisci il nome del fornitore", false); return }
    if (!orgId) { notify("Profilo non pronto, riprova", false); return }
    setSaving(true)
    // sede_id="" significa "Tutte le sedi" (azienda) → NULL nel DB
    const termini = parseInt(form.termini_pagamento, 10)
    const payload = {
      nome: form.nome,
      contatto: form.contatto,
      email: form.email,
      telefono: form.telefono,
      note: form.note,
      sede_id: form.sede_id || null,
      iban: form.iban?.trim() ? form.iban.replace(/\s+/g, '').toUpperCase() : null,
      termini_pagamento: Number.isFinite(termini) && termini >= 0 ? termini : 30,
      categoria: form.categoria?.trim() || null,
      organization_id: orgId,
    }
    let err
    if (editId) {
      ({ error: err } = await supabase.from("fornitori").update(payload).eq("id", editId))
    } else {
      ({ error: err } = await supabase.from("fornitori").insert(payload))
    }
    if (err) { notify("Errore: " + err.message, false) }
    else { notify(editId ? "Fornitore aggiornato" : "Fornitore aggiunto"); resetForm(); onMutate?.() }
    setSaving(false)
    carica()
  }

  async function archivia(id) {
    const ok = await confirmDialog({
      title: 'Archiviare fornitore?',
      message: "Potrai riattivarlo dall'archivio quando vuoi. Storico ordini resta salvato.",
      confirmLabel: 'Archivia', cancelLabel: 'Annulla',
    })
    if (!ok) return
    const { error } = await supabase.from("fornitori").update({ attivo: false }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore archiviazione: " + error.message, false); return }
    notify("Fornitore archiviato"); onMutate?.(); carica()
  }

  async function riattiva(id) {
    const { error } = await supabase.from("fornitori").update({ attivo: true }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore riattivazione: " + error.message, false); return }
    notify("Fornitore riattivato"); onMutate?.(); carica()
  }

  async function elimina(f) {
    const ok = await confirmDialog({
      title: `Eliminare DEFINITIVAMENTE "${f.nome}"?`,
      message: "L'operazione e' irreversibile. Se il fornitore ha ordini collegati, archivialo invece di eliminarlo.",
      confirmLabel: 'Elimina definitivamente', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    const { error } = await supabase.from("fornitori").delete().eq("id", f.id).eq("organization_id", orgId)
    if (error) { notify("Impossibile eliminare (forse ha ordini collegati): " + error.message, false); return }
    notify("Fornitore eliminato definitivamente"); onMutate?.(); carica()
  }

  function resetForm() { setForm({ nome: "", contatto: "", email: "", telefono: "", note: "", sede_id: sedeId || "", iban: "", termini_pagamento: "30", categoria: "" }); setEditId(null); setShowForm(false) }
  function initEdit(f) {
    setForm({
      nome: f.nome, contatto: f.contatto || "", email: f.email || "", telefono: f.telefono || "", note: f.note || "",
      sede_id: f.sede_id || "", iban: f.iban || "", termini_pagamento: String(f.termini_pagamento ?? 30), categoria: f.categoria || "",
    })
    setEditId(f.id); if (isMobile) setShowForm(true)
  }

  const listaFiltrata = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return lista
    return lista.filter(f =>
      (f.nome || '').toLowerCase().includes(needle) ||
      (f.categoria || '').toLowerCase().includes(needle) ||
      (f.contatto || '').toLowerCase().includes(needle))
  }, [lista, q])

  const inputSt = { width: "100%", height: 40, padding: "0 12px", borderRadius: R.md, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lblSt = { fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }
  const formVisible = !isMobile || showForm

  const chip = (text, bg, color, icon) => (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: bg, color, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {icon}{text}
    </span>
  )

  function FornitoreMeta({ f }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {f.categoria && chip(f.categoria, `${catColor(f.categoria)}18`, catColor(f.categoria), <Icon name="package" size={10} />)}
        {chip(`${f.termini_pagamento ?? 30}gg`, C.bg, C.textMid, <Icon name="card" size={10} />)}
        {f.iban && (
          <Tip text={`IBAN: ${f.iban}`}>
            {chip(maskIban(f.iban), '#EFF6FF', '#2563EB', <Icon name="bank" size={10} />)}
          </Tip>
        )}
        {haPiuSedi && chip(
          f.sede_id ? (sediMap[f.sede_id]?.nome || 'Sede') : 'Azienda',
          f.sede_id ? C.amberLight : '#F1F5F9',
          f.sede_id ? '#92400E' : C.textSoft,
          <Icon name={f.sede_id ? 'pin' : 'building'} size={10} />,
        )}
      </div>
    )
  }

  return (
    <div style={{ display: (isMobile || isTablet) ? "block" : "grid", gridTemplateColumns: (isMobile || isTablet) ? undefined : "minmax(320px, 0.9fr) 1.4fr", gap: 24, alignItems: 'start' }}>
      {/* Form */}
      {formVisible && (
        <div style={{
          background: C.bgCard,
          borderRadius: isMobile ? 0 : 16,
          padding: isMobile ? "20px 16px 100px" : "20px 24px",
          border: isMobile ? "none" : `1px solid ${C.border}`,
          boxShadow: isMobile ? "none" : S.lg,
          position: isMobile ? "fixed" : "sticky",
          top: isMobile ? 0 : 12,
          left: isMobile ? 0 : "auto",
          right: isMobile ? 0 : "auto",
          bottom: isMobile ? 0 : "auto",
          zIndex: isMobile ? 1000 : "auto",
          overflowY: isMobile ? "auto" : "visible",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name={editId ? "edit" : "plus"} size={14} />
              {editId ? "Modifica fornitore" : "Nuovo fornitore"}
            </div>
            {isMobile && (
              <button onClick={resetForm} aria-label="Chiudi form fornitore" style={{ padding: "6px 12px", background: "transparent", border: "none", fontSize: 18, color: C.textSoft, cursor: "pointer" }}>✕</button>
            )}
          </div>

          {[["Nome *", "nome", "text"], ["Referente", "contatto", "text"], ["Email", "email", "email"], ["Telefono", "telefono", "tel"]].map(([lbl, key, type]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={lblSt}>{lbl}</div>
              <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inputSt} />
            </div>
          ))}

          {/* Categoria merceologica + Termini di pagamento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={lblSt}>Categoria</div>
              <input list="fos-categorie" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="es. Farine" style={inputSt} />
              <datalist id="fos-categorie">{CATEGORIE_SUGG.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <div style={lblSt}>
                <Tip text="Giorni concordati per il pagamento delle fatture. Usato dallo Scadenzario per calcolare le scadenze dei bonifici.">
                  <span style={{ cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>Termini pag. (gg)</span>
                </Tip>
              </div>
              <input type="number" min="0" value={form.termini_pagamento} onChange={e => setForm(f => ({ ...f, termini_pagamento: e.target.value }))} placeholder="30" style={inputSt} />
            </div>
          </div>

          {/* IBAN */}
          <div style={{ marginBottom: 12 }}>
            <div style={lblSt}>
              <Tip text="IBAN del fornitore per i bonifici. Alimenta lo Scadenzario pagamenti.">
                <span style={{ cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>IBAN</span>
              </Tip>
            </div>
            <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="IT60 X054 2811 1010 0000 0123 456" style={{ ...inputSt, fontFamily: 'monospace', letterSpacing: '0.04em' }} />
          </div>

          {haPiuSedi && (
            <div style={{ marginBottom: 12 }}>
              <div style={lblSt}>Sede</div>
              <select value={form.sede_id} onChange={e => setForm(f => ({ ...f, sede_id: e.target.value }))} style={inputSt}>
                <option value="">Tutte le sedi (azienda)</option>
                {sedi.filter(s => s.attiva !== false).map(s => (
                  <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={lblSt}>Note</div>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} style={{ ...inputSt, height: 'auto', padding: '10px 12px', resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={salva} disabled={saving}
              style={{ flex: 1, padding: isMobile ? "14px" : "10px", background: C.red, color: C.white, border: "none", borderRadius: 8, fontWeight: 800, fontSize: isMobile ? 15 : 12, cursor: saving ? 'default' : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "…" : editId ? "Salva modifiche" : "Aggiungi"}
            </button>
            {editId && <button onClick={resetForm} aria-label="Annulla modifica fornitore" style={{ padding: isMobile ? "14px" : "10px 14px", background: C.white, border: `1px solid ${C.borderStr}`, borderRadius: 8, fontSize: isMobile ? 14 : 12, color: C.textMid, cursor: "pointer" }}>✕</button>}
          </div>
        </div>
      )}

      {/* Lista */}
      <div>
        {/* Ricerca */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.textSoft, display: 'inline-flex' }}><Icon name="search" size={15} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca per nome, categoria o referente…"
            style={{ width: '100%', height: 40, padding: '0 12px 0 36px', borderRadius: R.md, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>

        {/* Toggle Attivi / Archivio */}
        <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
          {[['attivi', 'truck', 'Attivi'], ['archivio', 'package', `Archivio${archCount > 0 ? ` (${archCount})` : ''}`]].map(([id, ico, lbl]) => (
            <button key={id} onClick={() => setVista(id)}
              style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${vista === id ? C.red : C.border}`, background: vista === id ? C.redLight : C.white, color: vista === id ? C.red : C.textMid, fontSize: 11, fontWeight: vista === id ? 800 : 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={ico} size={12} /> {lbl}</button>
          ))}
        </div>

        {loading ? <div style={{ color: C.textSoft, fontSize: 13, padding: 20 }}>Caricamento…</div> : listaFiltrata.length === 0 ? (
          <div style={{ color: C.textSoft, fontSize: 13, textAlign: "center", padding: 40 }}>{q.trim() ? "Nessun fornitore trovato." : inArchivio ? "Nessun fornitore archiviato." : "Nessun fornitore ancora."}</div>
        ) : isMobile ? listaFiltrata.map(f => (
          <div key={f.id} className="fos-tile" style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: "12px 14px", marginBottom: 8, boxShadow: S.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>{f.nome}</div>
            </div>
            <FornitoreMeta f={f} />
            {f.contatto && <div style={{ fontSize: 12, color: C.textMid, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}><Icon name="user" size={12} /> {f.contatto}</div>}
            {f.email && <div style={{ fontSize: 12, color: C.textMid, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}><Icon name="mail" size={12} /> <a href={`mailto:${f.email}`} style={{ color: C.red }}>{f.email}</a></div>}
            {f.telefono && <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}><a href={`tel:${f.telefono}`} style={{ color: C.red }}>{f.telefono}</a></div>}
            {f.note && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 6, fontStyle: "italic" }}>{f.note}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => initEdit(f)} style={{ flex: 1, padding: "10px", background: C.bg, border: `1px solid ${C.borderStr}`, borderRadius: 8, fontSize: 12, color: C.textMid, cursor: "pointer", fontWeight: 600 }}>Modifica</button>
              {inArchivio ? (
                <>
                  <button onClick={() => riattiva(f.id)} style={{ flex: 1, padding: "10px", background: "#ECFDF5", border: "1px solid #10B981", borderRadius: 8, fontSize: 12, color: "#065F46", cursor: "pointer", fontWeight: 700 }}>Riattiva</button>
                  <button onClick={() => elimina(f)} aria-label="Elimina" style={{ padding: "10px 12px", background: C.redLight, border: `1px solid ${C.red}40`, borderRadius: 8, fontSize: 12, color: C.red, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center" }}><Icon name="trash" size={14} /></button>
                </>
              ) : (
                <button onClick={() => archivia(f.id)} style={{ flex: 1, padding: "10px", background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, fontSize: 12, color: "#92400E", cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="package" size={13} /> Archivia</button>
              )}
            </div>
          </div>
        )) : listaFiltrata.map(f => (
          <div key={f.id} className="fos-tile" style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: "14px 18px", marginBottom: 10, boxShadow: S.lg }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>{f.nome}</div>
                <FornitoreMeta f={f} />
                {f.contatto && <div style={{ fontSize: 11, color: C.textMid, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}><Icon name="user" size={11} /> {f.contatto}</div>}
                {f.email && <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}><a href={`mailto:${f.email}`} style={{ color: C.red }}>{f.email}</a></div>}
                {f.telefono && <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{f.telefono}</div>}
                {f.note && <div style={{ fontSize: 10, color: C.textSoft, marginTop: 4, fontStyle: "italic" }}>{f.note}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => initEdit(f)} aria-label="Modifica fornitore" title="Modifica" style={{ width: 36, height: 36, padding: 0, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: C.white, color: C.textMid, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="edit" size={14} /></button>
                {inArchivio ? (
                  <>
                    <button onClick={() => riattiva(f.id)} aria-label="Riattiva fornitore" title="Riattiva" style={{ width: 36, height: 36, padding: 0, borderRadius: 8, border: "1px solid #10B981", background: "#ECFDF5", color: "#065F46", cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="refresh" size={14} /></button>
                    <button onClick={() => elimina(f)} aria-label="Elimina fornitore definitivamente" title="Elimina definitivamente" style={{ width: 36, height: 36, padding: 0, borderRadius: 8, border: `1px solid ${C.red}40`, background: C.redLight, color: C.red, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="trash" size={14} /></button>
                  </>
                ) : (
                  <button onClick={() => archivia(f.id)} aria-label="Archivia fornitore" title="Archivia" style={{ width: 36, height: 36, padding: 0, borderRadius: 8, border: "1px solid #F59E0B", background: "#FEF3C7", color: "#92400E", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="package" size={14} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAB mobile */}
      {isMobile && !showForm && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: C.white, borderTop: `1px solid ${C.border}`, zIndex: 100 }}>
          <button onClick={() => { resetForm(); setShowForm(true) }} style={{ width: "100%", padding: "14px", background: C.red, color: C.white, border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="plus" size={16} /> Aggiungi fornitore
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — Ordini
// ─────────────────────────────────────────────────────────────────────────────
function OrdiniTab({ orgId, notify, isMobile, onMutate }) {
  const [ordini, setOrdini] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ fornitore_id: "", data_ordine: todayLocal(), note: "", stato: "bozza" })
  const [righe, setRighe] = useState([{ prodotto: "", quantita: "", unita: "kg", prezzo_unitario: "" }])
  const [saving, setSaving] = useState(false)
  const [filtroStato, setFiltroStato] = useState("tutti")
  const { sortKey, sortDir, toggleSort, sort } = useSortable('data_ordine', 'desc')

  useEffect(() => { carica() }, [orgId])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const [{ data: ord, error: e1 }, { data: forn, error: e2 }] = await Promise.all([
      supabase.from("ordini_fornitori").select("*, fornitori(nome)").eq("organization_id", orgId).order("data_ordine", { ascending: false }).limit(50),
      supabase.from("fornitori").select("id,nome").eq("organization_id", orgId).eq("attivo", true).order("nome"),
    ])
    if (e1 || e2) notify?.("Errore caricamento ordini: " + (e1?.message || e2?.message), false)
    setOrdini(ord || [])
    setFornitori(forn || [])
    setLoading(false)
  }

  async function salvaOrdine() {
    if (!form.fornitore_id) { notify("Seleziona un fornitore", false); return }
    const righeValide = righe.filter(r => r.prodotto.trim())
    if (!righeValide.length) { notify("Aggiungi almeno un prodotto", false); return }
    setSaving(true)
    const totale = righeValide.reduce((s, r) => s + (parseFloat(r.quantita) || 0) * (parseFloat(r.prezzo_unitario) || 0), 0)
    const { data: ordineData, error } = await supabase.from("ordini_fornitori").insert({
      organization_id: orgId,
      fornitore_id: form.fornitore_id,
      data_ordine: form.data_ordine,
      note: form.note,
      stato: form.stato,
      totale: parseFloat(totale.toFixed(2)),
    }).select().single()
    if (error) { notify("Errore: " + error.message, false); setSaving(false); return }
    const { error: errRighe } = await supabase.from("righe_ordine").insert(righeValide.map(r => ({
      ordine_id: ordineData.id,
      prodotto: r.prodotto,
      quantita: parseFloat(r.quantita) || 0,
      unita: r.unita,
      prezzo_unitario: parseFloat(r.prezzo_unitario) || 0,
      totale_riga: (parseFloat(r.quantita) || 0) * (parseFloat(r.prezzo_unitario) || 0),
    })))
    if (errRighe) {
      await supabase.from("ordini_fornitori").delete().eq("id", ordineData.id).eq("organization_id", orgId)
      notify("Errore salvataggio righe: " + errRighe.message, false)
      setSaving(false)
      return
    }
    notify("Ordine salvato")
    setShowForm(false)
    setForm({ fornitore_id: "", data_ordine: todayLocal(), note: "", stato: "bozza" })
    setRighe([{ prodotto: "", quantita: "", unita: "kg", prezzo_unitario: "" }])
    setSaving(false)
    onMutate?.()
    carica()
  }

  async function aggiornaStato(id, stato) {
    const { error } = await supabase.from("ordini_fornitori").update({ stato }).eq("id", id).eq("organization_id", orgId)
    if (error) { notify("Errore aggiornamento stato: " + error.message, false); return }
    notify("Stato aggiornato")
    onMutate?.()
    carica()
  }

  const addRiga = () => setRighe(r => [...r, { prodotto: "", quantita: "", unita: "kg", prezzo_unitario: "" }])
  const removeRiga = i => setRighe(r => r.filter((_, j) => j !== i))
  const updateRiga = (i, field, val) => setRighe(r => r.map((x, j) => j === i ? { ...x, [field]: val } : x))

  const statoColor = { bozza: "#94A3B8", inviato: "#2563EB", ricevuto: "#16A34A", annullato: "#DC2626" }
  const inputSt = { padding: isMobile ? "12px 14px" : "8px 10px", borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color: C.text, background: C.bgCard, fontFamily: 'inherit' }

  const ordiniFiltrati = useMemo(() => {
    const base = filtroStato === 'tutti' ? ordini : ordini.filter(o => o.stato === filtroStato)
    return sort(base, (o, k) => {
      if (k === 'fornitore') return o.fornitori?.nome || ''
      if (k === 'totale') return Number(o.totale) || 0
      if (k === 'stato') return o.stato || ''
      return o.data_ordine || ''
    })
  }, [ordini, filtroStato, sortKey, sortDir])

  const totaleVisibile = ordiniFiltrati.reduce((s, o) => s + (Number(o.totale) || 0), 0)

  return (
    <div style={{ paddingBottom: isMobile ? 80 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{ordiniFiltrati.length} ordini · <span style={{ ...tnum }}>{fmt(totaleVisibile)}</span></div>
        {!isMobile && (
          <button onClick={() => setShowForm(s => !s)}
            style={{ padding: "9px 18px", background: C.red, color: C.white, border: "none", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {showForm ? "✕ Annulla" : <><Icon name="plus" size={13} /> Nuovo ordine</>}
          </button>
        )}
      </div>

      {/* Filtro stato */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['tutti', 'Tutti'], ['bozza', 'Bozza'], ['inviato', 'Inviato'], ['ricevuto', 'Ricevuto'], ['annullato', 'Annullato']].map(([id, lbl]) => (
          <button key={id} onClick={() => setFiltroStato(id)}
            style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${filtroStato === id ? (statoColor[id] || C.red) : C.border}`, background: filtroStato === id ? `${(statoColor[id] || C.red)}15` : C.white, color: filtroStato === id ? (statoColor[id] || C.red) : C.textMid, fontSize: 11, fontWeight: filtroStato === id ? 800 : 600, cursor: 'pointer' }}>{lbl}</button>
        ))}
      </div>

      {showForm && (
        <div style={{
          background: C.bgCard,
          border: isMobile ? "none" : `1px solid ${C.border}`,
          borderRadius: isMobile ? 0 : 16,
          padding: isMobile ? "20px 16px 100px" : "20px 24px",
          marginBottom: 20,
          boxShadow: isMobile ? 'none' : S.lg,
          position: isMobile ? "fixed" : "relative",
          top: isMobile ? 0 : "auto",
          left: isMobile ? 0 : "auto",
          right: isMobile ? 0 : "auto",
          bottom: isMobile ? 0 : "auto",
          zIndex: isMobile ? 1000 : "auto",
          overflowY: isMobile ? "auto" : "visible",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={14} /> Nuovo ordine</div>
            {isMobile && (
              <button aria-label="Chiudi form ordine" onClick={() => setShowForm(false)} style={{ padding: "6px 12px", background: "transparent", border: "none", fontSize: 18, color: C.textSoft, cursor: "pointer" }}>✕</button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Fornitore *</div>
              <select value={form.fornitore_id} onChange={e => setForm(f => ({ ...f, fornitore_id: e.target.value }))} style={{ ...inputSt, width: "100%" }}>
                <option value="">Seleziona…</option>
                {fornitori.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Data ordine</div>
              <input type="date" value={form.data_ordine} onChange={e => setForm(f => ({ ...f, data_ordine: e.target.value }))} style={{ ...inputSt, width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Stato</div>
              <select value={form.stato} onChange={e => setForm(f => ({ ...f, stato: e.target.value }))} style={{ ...inputSt, width: "100%" }}>
                {["bozza", "inviato", "ricevuto", "annullato"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 8 }}>Prodotti ordinati</div>
            {!isMobile && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 1fr auto", gap: 6, marginBottom: 6 }}>
                {["Prodotto", "Quantità", "Unità", "€/unità", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: 8, fontWeight: 700, color: C.textSoft, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
                ))}
              </div>
            )}
            {righe.map((r, i) => (
              isMobile ? (
                <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <input value={r.prodotto} onChange={e => updateRiga(i, "prodotto", e.target.value)} placeholder="Prodotto (es. burro)" style={{ ...inputSt, width: "100%", marginBottom: 6 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr auto", gap: 6 }}>
                    <input type="number" value={r.quantita} onChange={e => updateRiga(i, "quantita", e.target.value)} placeholder="Qtà" style={inputSt} />
                    <select value={r.unita} onChange={e => updateRiga(i, "unita", e.target.value)} style={inputSt}>
                      {["kg", "g", "l", "pz", "cf"].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" value={r.prezzo_unitario} onChange={e => updateRiga(i, "prezzo_unitario", e.target.value)} placeholder="€/u" style={inputSt} />
                    <button aria-label="Rimuovi riga" onClick={() => removeRiga(i)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSoft, fontSize: 14, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ) : (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 1fr auto", gap: 6, marginBottom: 6 }}>
                  <input value={r.prodotto} onChange={e => updateRiga(i, "prodotto", e.target.value)} placeholder="es. burro" style={inputSt} />
                  <input type="number" value={r.quantita} onChange={e => updateRiga(i, "quantita", e.target.value)} placeholder="0" style={inputSt} />
                  <select value={r.unita} onChange={e => updateRiga(i, "unita", e.target.value)} style={inputSt}>
                    {["kg", "g", "l", "pz", "cf"].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <input type="number" value={r.prezzo_unitario} onChange={e => updateRiga(i, "prezzo_unitario", e.target.value)} placeholder="0.00" style={inputSt} />
                  <button aria-label="Rimuovi riga" onClick={() => removeRiga(i)} style={{ padding: "4px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSoft, fontSize: 10, cursor: "pointer" }}>✕</button>
                </div>
              )
            ))}
            <button onClick={addRiga} style={{ padding: isMobile ? "10px 14px" : "6px 14px", background: C.white, border: `1px solid ${C.borderStr}`, borderRadius: 8, fontSize: isMobile ? 13 : 11, color: C.textMid, cursor: "pointer", width: isMobile ? "100%" : "auto" }}>+ Riga</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Note</div>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} style={{ ...inputSt, width: "100%", resize: "vertical" }} />
          </div>
          <button onClick={salvaOrdine} disabled={saving}
            style={{ padding: isMobile ? "14px" : "10px 24px", background: C.red, color: C.white, border: "none", borderRadius: 8, fontWeight: 800, fontSize: isMobile ? 15 : 12, cursor: saving ? 'default' : "pointer", opacity: saving ? 0.7 : 1, width: isMobile ? "100%" : "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {saving ? "…" : <><Icon name="save" size={14} /> Salva ordine</>}
          </button>
        </div>
      )}

      {loading ? <div style={{ color: C.textSoft, fontSize: 13 }}>Caricamento…</div> : ordiniFiltrati.length === 0 ? (
        <div style={{ color: C.textSoft, fontSize: 13, textAlign: "center", padding: 40 }}>{filtroStato === 'tutti' ? "Nessun ordine ancora." : `Nessun ordine "${filtroStato}".`}</div>
      ) : isMobile ? (
        <div>
          {ordiniFiltrati.map(o => (
            <div key={o.id} className="fos-tile" style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: "12px 14px", marginBottom: 8, boxShadow: S.lg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.text, flex: 1, minWidth: 0, wordBreak: "break-word" }}>{o.fornitori?.nome || "—"}</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: `${statoColor[o.stato]}20`, color: statoColor[o.stato], whiteSpace: "nowrap" }}>{o.stato}</span>
              </div>
              <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 8 }}>
                {fmtDate(o.data_ordine)} · <strong style={{ color: C.text, ...tnum }}>{fmt(o.totale)}</strong>
              </div>
              {o.note && <div style={{ fontSize: 11, color: C.textSoft, fontStyle: "italic", marginBottom: 8 }}>{o.note}</div>}
              <div style={{ display: "flex", gap: 6 }}>
                {o.stato !== "ricevuto" && (
                  <button onClick={() => aggiornaStato(o.id, "ricevuto")} style={{ flex: 1, padding: "10px", background: C.greenLight, border: `1px solid ${C.green}40`, borderRadius: 8, fontSize: 12, color: C.green, cursor: "pointer", fontWeight: 700 }}>
                    Segna ricevuto
                  </button>
                )}
                <select value={o.stato} onChange={e => aggiornaStato(o.id, e.target.value)}
                  style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, cursor: "pointer", background: C.white }}>
                  {["bozza", "inviato", "ricevuto", "annullato"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="fos-tile" style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: S.lg, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortTH k="fornitore" active={sortKey === 'fornitore'} dir={sortDir} onToggle={toggleSort}>Fornitore</SortTH>
                <SortTH k="data_ordine" active={sortKey === 'data_ordine'} dir={sortDir} onToggle={toggleSort}>Data</SortTH>
                <SortTH k="stato" active={sortKey === 'stato'} dir={sortDir} onToggle={toggleSort}>Stato</SortTH>
                <SortTH k="totale" right active={sortKey === 'totale'} dir={sortDir} onToggle={toggleSort}>Totale</SortTH>
                <th style={{ borderBottom: `1px solid ${C.border}` }} />
              </tr>
            </thead>
            <tbody>
              {ordiniFiltrati.map(o => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: C.text }}>
                    {o.fornitori?.nome || "—"}
                    {o.note && <div style={{ fontSize: 10, color: C.textSoft, fontWeight: 400, fontStyle: 'italic', marginTop: 2 }}>{o.note}</div>}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: C.textMid, whiteSpace: 'nowrap', ...tnum }}>{fmtDate(o.data_ordine)}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${statoColor[o.stato]}20`, color: statoColor[o.stato] }}>{o.stato}</span>
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 800, fontSize: 13, color: C.text, ...tnum }}>{fmt(o.totale)}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <select value={o.stato} onChange={e => aggiornaStato(o.id, e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 11, color: C.text, cursor: "pointer", background: C.white }}>
                      {["bozza", "inviato", "ricevuto", "annullato"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isMobile && !showForm && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: C.white, borderTop: `1px solid ${C.border}`, zIndex: 100 }}>
          <button onClick={() => setShowForm(true)} style={{ width: "100%", padding: "14px", background: C.red, color: C.white, border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="plus" size={16} /> Nuovo ordine
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Barra orizzontale per breakdown
// ─────────────────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 8 }}>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 7 }} />
          {label}
          {sub != null && <span style={{ color: C.textSoft, fontWeight: 500, marginLeft: 6 }}>{sub}</span>}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', ...tnum }}>{fmt(value)}</span>
      </div>
      <div style={{ height: 8, background: C.bg, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: `width ${M.durSlow} ${M.ease}` }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — Spesa
// ─────────────────────────────────────────────────────────────────────────────
function SpesaTab({ orgId, isMobile }) {
  const [ordini, setOrdini] = useState([])
  const [catMap, setCatMap] = useState({}) // fornitore_id → categoria
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState("30")

  useEffect(() => { carica() }, [orgId, range])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    const from = new Date(); from.setDate(from.getDate() - parseInt(range))
    const [{ data, error }, { data: forn }] = await Promise.all([
      supabase.from("ordini_fornitori")
        .select("*, fornitori(nome)")
        .eq("organization_id", orgId)
        .eq("stato", "ricevuto")
        .gte("data_ordine", from.toISOString().slice(0, 10))
        .order("data_ordine", { ascending: false }),
      supabase.from("fornitori").select("id,categoria").eq("organization_id", orgId),
    ])
    if (error) console.warn("ordini storico load:", error.message)
    setOrdini(data || [])
    setCatMap(Object.fromEntries((forn || []).map(f => [f.id, (f.categoria || '').trim()])))
    setLoading(false)
  }

  const totale = ordini.reduce((s, r) => s + (Number(r.totale) || 0), 0)

  const byFornitore = useMemo(() => {
    const acc = {}
    for (const r of ordini) {
      const n = r.fornitori?.nome || "—"
      acc[n] = (acc[n] || 0) + (Number(r.totale) || 0)
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [ordini])

  const byCategoria = useMemo(() => {
    const acc = {}
    for (const r of ordini) {
      const cat = catMap[r.fornitore_id] || "Senza categoria"
      acc[cat] = (acc[cat] || 0) + (Number(r.totale) || 0)
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [ordini, catMap])

  const maxForn = byFornitore[0]?.[1] || 0
  const maxCat = byCategoria[0]?.[1] || 0

  const cardSt = { background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: isMobile ? "16px 16px" : "18px 22px", boxShadow: S.lg }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={range} onChange={e => setRange(e.target.value)}
          style={{ padding: isMobile ? "10px 14px" : "8px 12px", borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, color: C.text, width: isMobile ? "100%" : "auto", background: C.bgCard, fontFamily: 'inherit' }}>
          <option value="7">Ultimi 7 giorni</option>
          <option value="30">Ultimi 30 giorni</option>
          <option value="90">Ultimi 90 giorni</option>
          <option value="365">Ultimo anno</option>
        </select>
      </div>

      {loading ? <div style={{ color: C.textSoft }}>Caricamento…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: isMobile ? 10 : 14, marginBottom: 8 }}>
            <KPI label="Spesa periodo" value={fmt0(totale)} sub="ordini ricevuti" color={T.brand} highlight icon={<Icon name="money" size={17} />} />
            <KPI label="N° ordini" value={ordini.length.toLocaleString('it-IT')} icon={<Icon name="receipt" size={17} />} />
            <KPI label="Ordine medio" value={fmt0(ordini.length ? totale / ordini.length : 0)} icon={<Icon name="barChart" size={17} />} />
          </div>

          {ordini.length === 0 ? (
            <div style={{ color: C.textSoft, fontSize: 13, textAlign: "center", padding: 40 }}>Nessun ordine ricevuto nel periodo.</div>
          ) : (
            <>
              <SH sub="Quanto stai spendendo per ciascun fornitore nel periodo selezionato.">Spesa per fornitore</SH>
              <div style={cardSt}>
                {byFornitore.map(([nome, tot], i) => (
                  <BarRow key={nome} label={nome} value={tot} max={maxForn} color={PALETTE[i % PALETTE.length]} sub={`${totale > 0 ? Math.round((tot / totale) * 100) : 0}%`} />
                ))}
              </div>

              <SH sub="Aggregazione per categoria merceologica del fornitore. I fornitori senza categoria sono raggruppati a parte.">Spesa per categoria</SH>
              <div style={cardSt}>
                {byCategoria.map(([cat, tot]) => (
                  <BarRow key={cat} label={cat} value={tot} max={maxCat} color={cat === 'Senza categoria' ? '#94A3B8' : catColor(cat)} sub={`${totale > 0 ? Math.round((tot / totale) * 100) : 0}%`} />
                ))}
              </div>

              <SH sub="Dettaglio dei singoli ordini ricevuti, dal più recente.">Ordini ricevuti</SH>
              {isMobile ? (
                ordini.map(o => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{o.fornitori?.nome || "—"}</div>
                      <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{fmtDate(o.data_ordine)}{catMap[o.fornitore_id] ? ` · ${catMap[o.fornitore_id]}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.text, ...tnum }}>{fmt(o.totale)}</span>
                  </div>
                ))
              ) : (
                <div className="fos-tile" style={{ ...cardSt, padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Fornitore', 'Categoria', 'Data'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordini.map(o => (
                        <tr key={o.id} style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
                          <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: C.text }}>{o.fornitori?.nome || "—"}</td>
                          <td style={{ padding: '10px 16px', fontSize: 11, color: C.textMid }}>
                            {catMap[o.fornitore_id]
                              ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: `${catColor(catMap[o.fornitore_id])}18`, color: catColor(catMap[o.fornitore_id]), fontWeight: 700 }}>{catMap[o.fornitore_id]}</span>
                              : <span style={{ color: C.textFaint }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: 11, color: C.textMid, whiteSpace: 'nowrap', ...tnum }}>{fmtDate(o.data_ordine)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: C.text, ...tnum }}>{fmt(o.totale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Container
// ─────────────────────────────────────────────────────────────────────────────
export default function Fornitori({ orgId, sedeId, sedi = [], notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [tab, setTab] = useState("fornitori")
  const [refreshKey, setRefreshKey] = useState(0)
  const bumpRefresh = () => setRefreshKey(k => k + 1)
  const TABS = [["fornitori", "Fornitori", "truck"], ["ordini", "Ordini", "receipt"], ["spesa", "Spesa", "barChart"]]

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 0 }}>
      <PageHeader subtitle="Gestisci l'anagrafica fornitori (con IBAN, termini di pagamento e categoria), registra gli ordini e analizza la spesa nel tempo." />

      {/* Banda diagnosi */}
      <BandaDiagnosi orgId={orgId} sedeId={sedeId} isMobile={isMobile} isTablet={isTablet} refreshKey={refreshKey} />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: isMobile ? 16 : 24, borderBottom: `1px solid ${T.border}`, overflowX: isMobile ? "auto" : "visible" }}>
        {TABS.map(([id, lbl, ico]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: "10px 16px", minHeight: isMobile ? 44 : 40, border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? T.text : T.textSoft,
              borderBottom: tab === id ? `2px solid ${T.brand}` : "2px solid transparent",
              marginBottom: -1, letterSpacing: "-0.005em", whiteSpace: "nowrap",
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: `color ${M.durFast} ${M.ease}`,
            }}
            onMouseEnter={e => { if (tab !== id) e.currentTarget.style.color = T.textMid }}
            onMouseLeave={e => { if (tab !== id) e.currentTarget.style.color = T.textSoft }}>
            <Icon name={ico} size={14} /> {lbl}
          </button>
        ))}
      </div>

      {tab === "fornitori" && <FornitoriTab orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile} isTablet={isTablet} onMutate={bumpRefresh} />}
      {tab === "ordini" && <OrdiniTab orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} isMobile={isMobile} onMutate={bumpRefresh} />}
      {tab === "spesa" && <SpesaTab orgId={orgId} isMobile={isMobile} />}
    </div>
  )
}
