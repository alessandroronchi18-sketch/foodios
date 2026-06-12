import React, { useState, useEffect, useMemo } from 'react'
import Icon from './Icon'
import { SkeletonList, SkeletonGrid } from './Skeleton'
import { supabase } from '../lib/supabase'
import { sload, ssave } from '../lib/storage'
import { color as T, radius as R, motion as M } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { todayLocal } from '../lib/dateLocal'
import {
  loadTrasferimenti, creaTrasferimento,
  inviaTrasferimento, riceviTrasferimento, annullaTrasferimento,
  STATO_LABEL, TIPO_LABEL,
} from '../lib/trasferimenti'
import { scaricoMP, caricoMP } from '../lib/movimentoMP'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr || T.border,
}
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

const TIPI = [
  { id: 'prodotto',       lbl: 'Prodotto finito' },
  { id: 'semilavorato',   lbl: 'Semilavorato' },
  { id: 'materia_prima',  lbl: 'Materia prima' },
]

function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtQty(q, u) {
  return `${Number(q || 0).toLocaleString('it-IT', { maximumFractionDigits: 3 })} ${u || ''}`
}
function fmtEuro(v) {
  return `€ ${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function TrasferimentiView({ orgId, sedi = [], sedeAttiva = null, notify }) {
  const isMobile = useIsMobile()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [scope, setScope] = useState('attiva')
  const [busyId, setBusyId] = useState(null)
  const [riceviModal, setRiceviModal] = useState(null) // { t, qtyRic, note }
  const [filtroStato, setFiltroStato] = useState('all') // all|bozza|inviato|ricevuto|annullato
  const [filtroTipo, setFiltroTipo] = useState('all')   // all|prodotto|semilavorato|materia_prima
  const [templates, setTemplates] = useState([])         // [{id, nome, tipo, sede_da, sede_a, prodotto, quantita, unita, valore_unit}]

  const [form, setForm] = useState(() => ({
    data: todayLocal(),
    tipo: 'prodotto',
    sede_da: sedeAttiva?.id || '',
    sede_a: '',
    prodotto: '',
    quantita: '',
    unita: 'pz',
    valore_unit: '',
    note: '',
  }))
  const [saving, setSaving] = useState(false)

  const sediAttive = (sedi || []).filter(s => s.attiva !== false)
  const sediMap = Object.fromEntries(sediAttive.map(s => [s.id, s]))

  useEffect(() => {
    if (sedeAttiva?.id && !form.sede_da) setForm(f => ({ ...f, sede_da: sedeAttiva.id }))
  }, [sedeAttiva?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carica() }, [orgId, sedeAttiva?.id, scope])

  // Carica template salvati in user_data (chiave org-wide, sede_id=null).
  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function loadTemplates() {
      const t = await sload('pasticceria-trasferimenti-templates-v1', orgId, null)
      if (alive) setTemplates(Array.isArray(t) ? t : [])
    }
    loadTemplates()
    return () => { alive = false }
  }, [orgId])

  async function salvaTemplate(nome) {
    if (!nome?.trim() || !form.prodotto?.trim()) return
    const next = [...templates, {
      id: Math.random().toString(36).slice(2, 10),
      nome: nome.trim(),
      tipo: form.tipo, sede_da: form.sede_da, sede_a: form.sede_a,
      prodotto: form.prodotto.trim(), quantita: form.quantita,
      unita: form.unita, valore_unit: form.valore_unit,
    }]
    try {
      await ssave('pasticceria-trasferimenti-templates-v1', next, orgId, null)
      setTemplates(next)
      notify?.(`Template "${nome}" salvato`)
    } catch (e) {
      notify?.('Errore salvataggio template: ' + (e.message || ''), false)
    }
  }

  async function eliminaTemplate(id) {
    const next = templates.filter(t => t.id !== id)
    try {
      await ssave('pasticceria-trasferimenti-templates-v1', next, orgId, null)
      setTemplates(next)
    } catch {}
  }

  function applicaTemplate(t) {
    setForm(f => ({
      ...f,
      tipo: t.tipo, sede_da: t.sede_da, sede_a: t.sede_a,
      prodotto: t.prodotto, quantita: String(t.quantita || ''),
      unita: t.unita, valore_unit: String(t.valore_unit || ''),
      data: todayLocal(),
    }))
    setShowForm(true)
    notify?.(`Template "${t.nome}" applicato — premi Invia`)
  }

  function ripetiTrasferimento(t) {
    setForm({
      data: todayLocal(),
      tipo: t.tipo, sede_da: t.sede_da, sede_a: t.sede_a,
      prodotto: t.prodotto, quantita: String(t.quantita || ''),
      unita: t.unita, valore_unit: String(t.valore_unit || ''),
      note: '',
    })
    setShowForm(true)
    notify?.('Trasferimento pre-compilato — premi Invia')
  }

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await loadTrasferimenti(orgId, { sedeAttivaId: sedeAttiva?.id, scope })
      setLista(data)
    } catch (e) {
      notify?.('Errore caricamento trasferimenti: ' + e.message, false)
    } finally { setLoading(false) }
  }

  // ── Azioni ───────────────────────────────────────────────────────────────

  async function salvaBozza(autoInvia) {
    if (!orgId) return
    if (!form.sede_da || !form.sede_a) { notify?.('Seleziona sede di partenza e destinazione', false); return }
    if (form.sede_da === form.sede_a) { notify?.('Sede di partenza e destinazione devono essere diverse', false); return }
    if (!form.prodotto.trim()) { notify?.('Inserisci il prodotto', false); return }
    const qty = parseFloat(form.quantita)
    if (!Number.isFinite(qty) || qty <= 0) { notify?.('Quantità non valida', false); return }

    // Per materia prima: il magazzino MP vive in grammi (giacenza_g).
    // Se l'utente sceglie 'kg', convertiamo. Per 'g' resta com'è.
    let qtyMpGrammi = qty
    if (form.tipo === 'materia_prima') {
      if (form.unita === 'kg') qtyMpGrammi = qty * 1000
      else if (form.unita !== 'g') {
        notify?.("Per materia prima usa unità 'g' o 'kg'", false)
        return
      }
    }

    // Per prodotto finito: normalizziamo il nome a UPPERCASE.TRIM() per matchare
    // lo schema usato dalla produzione e dalla chiusura vendite.
    const prodottoSalvato = form.tipo === 'prodotto'
      ? form.prodotto.trim().toUpperCase()
      : form.prodotto.trim()

    setSaving(true)
    let mpScalato = false
    try {
      // Per materia prima, l'invio richiede di muovere lo stock client-side.
      // Lo facciamo PRIMA di creare il record (così se MP non disponibile, non lascio bozza vuota).
      if (autoInvia && form.tipo === 'materia_prima') {
        await scaricoMP({ orgId, sedeId: form.sede_da, ingrediente: form.prodotto.trim(), quantita: qtyMpGrammi })
        mpScalato = true
      }

      const created = await creaTrasferimento({
        orgId,
        sedeDa: form.sede_da,
        sedeA: form.sede_a,
        tipo: form.tipo,
        prodotto: prodottoSalvato,
        quantita: qty,
        unita: form.unita || 'pz',
        valoreUnit: parseFloat(form.valore_unit) || 0,
        note: form.note?.trim() || null,
        data: form.data,
        autoInvia: autoInvia && form.tipo === 'prodotto', // RPC scala stock per prodotti
      })

      // Per MP autoInvia, marchiamo a mano lo stato inviato (lo stock è già scalato).
      if (autoInvia && form.tipo === 'materia_prima') {
        await supabase.from('trasferimenti')
          .update({ stato: 'inviato', stock_applicato: true, data_invio: new Date().toISOString() })
          .eq('id', created.id)
      }

      notify?.(autoInvia ? '✓ Trasferimento inviato' : '✓ Bozza salvata')
      setForm(f => ({ ...f, prodotto: '', quantita: '', valore_unit: '', note: '' }))
      setShowForm(false)
      await carica()
    } catch (e) {
      // Se abbiamo già scalato l'MP ma poi qualcosa è fallito, ripristiniamo.
      if (mpScalato) {
        try { await caricoMP({ orgId, sedeId: form.sede_da, ingrediente: form.prodotto.trim(), quantita: qtyMpGrammi }) } catch {}
      }
      notify?.('Errore: ' + e.message, false)
    } finally { setSaving(false) }
  }

  // Converte quantita di un trasferimento MP in grammi.
  function mpGrammi(t) {
    const q = Number(t.quantita)
    return t.unita === 'kg' ? q * 1000 : q
  }

  async function azInvia(t) {
    setBusyId(t.id)
    try {
      if (t.tipo === 'materia_prima') {
        await scaricoMP({ orgId, sedeId: t.sede_da, ingrediente: t.prodotto, quantita: mpGrammi(t) })
        await supabase.from('trasferimenti')
          .update({ stato: 'inviato', stock_applicato: true, data_invio: new Date().toISOString() })
          .eq('id', t.id)
      } else {
        // 'prodotto' e 'semilavorato' (per ora solo log) passano da RPC.
        // RPC con tipo='semilavorato' non scala stock ma aggiorna stato.
        await inviaTrasferimento(t.id)
      }
      notify?.('✓ Invio registrato')
      await carica()
    } catch (e) {
      notify?.('Errore invio: ' + e.message, false)
    } finally { setBusyId(null) }
  }

  function apriRicevi(t) {
    setRiceviModal({ t, qtyRic: String(t.quantita), note: '' })
  }

  async function confermaRicezione() {
    if (!riceviModal) return
    const { t, qtyRic, note } = riceviModal
    const qty = parseFloat(qtyRic)
    if (!Number.isFinite(qty) || qty < 0 || qty > Number(t.quantita)) {
      notify?.('Quantità ricevuta non valida (deve essere tra 0 e ' + t.quantita + ')', false)
      return
    }
    setBusyId(t.id)
    try {
      if (t.tipo === 'materia_prima') {
        // qty è nell'unità del trasferimento (g o kg). Converti in grammi per il magazzino.
        const qtyGrammi = t.unita === 'kg' ? qty * 1000 : qty
        if (qty > 0) await caricoMP({ orgId, sedeId: t.sede_a, ingrediente: t.prodotto, quantita: qtyGrammi })
        const scarto = Number(t.quantita) - qty
        await supabase.from('trasferimenti').update({
          stato: 'ricevuto',
          quantita_ricevuta: qty,
          scarto_qty: scarto,
          scarto_note: note?.trim() || null,
          data_ricezione: new Date().toISOString(),
        }).eq('id', t.id)
      } else {
        await riceviTrasferimento(t.id, { quantitaRicevuta: qty, scartoNote: note?.trim() || null })
      }
      notify?.('✓ Ricezione registrata')
      setRiceviModal(null)
      await carica()
    } catch (e) {
      notify?.('Errore ricezione: ' + e.message, false)
    } finally { setBusyId(null) }
  }

  async function azAnnulla(t) {
    if (!confirm(`Annullare il trasferimento di ${t.prodotto}? ${t.stato === 'inviato' ? 'Lo stock sarà ripristinato sulla sede di partenza.' : ''}`)) return
    setBusyId(t.id)
    try {
      if (t.stato === 'inviato' && t.tipo === 'materia_prima' && t.stock_applicato) {
        // Rollback MP client-side: rimetti l'MP nella sede di partenza.
        await caricoMP({ orgId, sedeId: t.sede_da, ingrediente: t.prodotto, quantita: mpGrammi(t) })
        await supabase.from('trasferimenti').update({ stato: 'annullato', stock_applicato: false }).eq('id', t.id)
      } else {
        await annullaTrasferimento(t.id)
      }
      notify?.('✓ Trasferimento annullato')
      await carica()
    } catch (e) {
      notify?.('Errore annullamento: ' + e.message, false)
    } finally { setBusyId(null) }
  }

  async function azElimina(t) {
    if (!['bozza', 'annullato'].includes(t.stato)) {
      notify?.('Solo bozze e trasferimenti annullati possono essere eliminati', false)
      return
    }
    if (!confirm('Eliminare definitivamente questo trasferimento?')) return
    try {
      const { error } = await supabase.from('trasferimenti').delete().eq('id', t.id).eq('organization_id', orgId)
      if (error) throw error
      notify?.('✓ Eliminato')
      await carica()
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  // ── KPI ──────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const sedeId = sedeAttiva?.id
    return {
      tot: lista.length,
      inUscita: sedeId ? lista.filter(t => t.sede_da === sedeId && !['annullato'].includes(t.stato)).length : 0,
      inEntrata: sedeId ? lista.filter(t => t.sede_a === sedeId && !['annullato'].includes(t.stato)).length : 0,
      daRicevere: sedeId ? lista.filter(t => t.sede_a === sedeId && t.stato === 'inviato').length : 0,
    }
  }, [lista, sedeAttiva?.id])

  // ── "Da fare ora": azioni urgenti per la sede attiva ────────────────────
  const azioniUrgenti = useMemo(() => {
    const sedeId = sedeAttiva?.id
    if (!sedeId) return { daRicevere: [], bozzeInUscita: [] }
    return {
      daRicevere: lista.filter(t => t.sede_a === sedeId && t.stato === 'inviato'),
      bozzeInUscita: lista.filter(t => t.sede_da === sedeId && t.stato === 'bozza'),
    }
  }, [lista, sedeAttiva?.id])

  // ── Flussi del mese corrente: sede_da -> sede_a aggregato ───────────────
  const flussiMese = useMemo(() => {
    const oggi = new Date()
    const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1)
    const inMese = (d) => {
      if (!d) return false
      const x = new Date(d)
      return x >= inizioMese && x <= oggi
    }
    const map = {}
    for (const t of lista) {
      if (!inMese(t.data)) continue
      if (t.stato === 'annullato') continue
      const key = `${t.sede_da}|${t.sede_a}`
      if (!map[key]) map[key] = { sede_da: t.sede_da, sede_a: t.sede_a, n: 0, valore: 0, prodotti: {} }
      map[key].n += 1
      map[key].valore += Number(t.quantita || 0) * Number(t.valore_unit || 0)
      const p = t.prodotto || '—'
      map[key].prodotti[p] = (map[key].prodotti[p] || 0) + Number(t.quantita || 0)
    }
    return Object.values(map).sort((a, b) => b.n - a.n).slice(0, 6)
  }, [lista])

  // ── KPI accuratezza mese (per il proprietario CFO) ──────────────────────
  const accuratezzaMese = useMemo(() => {
    const oggi = new Date()
    const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1)
    let tot = 0, ricevutiOk = 0, scartoQty = 0, scartoValore = 0
    let valTrasferito = 0
    for (const t of lista) {
      const d = new Date(t.data || 0)
      if (d < inizioMese || d > oggi) continue
      if (t.stato === 'annullato') continue
      tot++
      const qta = Number(t.quantita || 0)
      const val = qta * Number(t.valore_unit || 0)
      valTrasferito += val
      if (t.stato === 'ricevuto' || t.stato === 'completato') {
        const scarto = Number(t.scarto_qty || 0)
        if (scarto <= 0) ricevutiOk++
        scartoQty += scarto
        // valore scarto: scarto * valore_unit (se disponibile)
        scartoValore += scarto * Number(t.valore_unit || 0)
      }
    }
    return {
      tot,
      ricevutiOk,
      ricevuti: lista.filter(t => {
        const d = new Date(t.data || 0)
        return d >= inizioMese && d <= oggi && (t.stato === 'ricevuto' || t.stato === 'completato')
      }).length,
      scartoQty,
      scartoValore,
      valTrasferito,
      accuracyPct: (() => {
        const ric = lista.filter(t => {
          const d = new Date(t.data || 0)
          return d >= inizioMese && d <= oggi && (t.stato === 'ricevuto' || t.stato === 'completato')
        }).length
        return ric > 0 ? (ricevutiOk / ric) * 100 : null
      })(),
    }
  }, [lista])

  // ── Lista filtrata ──────────────────────────────────────────────────────
  const listaFiltrata = useMemo(() => {
    return lista.filter(t => {
      if (filtroStato !== 'all' && t.stato !== filtroStato) return false
      if (filtroTipo !== 'all' && t.tipo !== filtroTipo) return false
      return true
    })
  }, [lista, filtroStato, filtroTipo])

  if (sediAttive.length < 2) {
    return (
      <div style={{ maxWidth: 720, margin: '60px auto', textAlign: 'center', padding: 20 }}>
        <div style={{ marginBottom: 12 }}><Icon name="truck" size={48} color={C.textSoft} /></div>
        <h2 style={{ fontSize: 20, color: C.text, marginBottom: 8 }}>Trasferimenti tra sedi</h2>
        <p style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
          I trasferimenti permettono di spostare prodotti, semilavorati o materie prime tra sedi diverse
          (es. dal laboratorio centrale ai punti vendita).<br/>
          <strong style={{ color: C.text }}>Aggiungi almeno 2 sedi</strong> per attivare questa funzione.
        </p>
      </div>
    )
  }

  const inp = { width: '100%', padding: isMobile ? '12px 14px' : '8px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, background: C.bgCard, boxSizing: 'border-box' }
  const lbl = { fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.red, marginBottom: 6 }}>Operazioni multi-sede</div>
        <p style={{ margin: 0, fontSize: 13, color: C.textSoft }}>
          Sposta prodotti finiti, semilavorati o materie prime da una sede all'altra. Lo stock si aggiorna automaticamente.
        </p>
      </div>

      {/* KPI ACCURATEZZA MESE (cappello proprietario) */}
      {!loading && accuratezzaMese.tot > 0 && (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: isMobile ? 14 : 18, marginTop: 18, marginBottom: 16,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 10 }}>
            📊 Accuratezza mese
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Trasferimenti</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginTop: 4, ...tnum }}>{accuratezzaMese.tot}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Ricevuti puntuali</div>
              <div style={{
                fontSize: 22, fontWeight: 900, marginTop: 4, ...tnum,
                color: accuratezzaMese.accuracyPct == null ? C.textSoft : accuratezzaMese.accuracyPct >= 95 ? C.green : accuratezzaMese.accuracyPct >= 85 ? '#D97706' : C.red,
              }}>
                {accuratezzaMese.accuracyPct != null ? `${accuratezzaMese.accuracyPct.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 2, ...tnum }}>
                {accuratezzaMese.ricevutiOk}/{accuratezzaMese.ricevuti} senza scarto
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Scarto totale</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: accuratezzaMese.scartoQty > 0 ? C.red : C.text, marginTop: 4, ...tnum }}>
                {accuratezzaMese.scartoQty > 0 ? accuratezzaMese.scartoQty.toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '0'}
              </div>
              <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 2 }}>unità varie</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Valore sprecato</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: accuratezzaMese.scartoValore > 0 ? C.red : C.text, marginTop: 4, ...tnum }}>
                {accuratezzaMese.scartoValore > 0 ? fmtEuro(accuratezzaMese.scartoValore) : '€ 0'}
              </div>
              <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 2 }}>perso in scarti</div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE TRASFERIMENTI RICORRENTI */}
      {templates.length > 0 && (
        <div style={{
          background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12,
          padding: isMobile ? 12 : 14, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0369A1' }}>
              ⚡ Trasferimenti rapidi salvati
            </div>
            <div style={{ fontSize: 11, color: '#075985' }}>1 click → form pre-compilato</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map(t => {
              const sda = sediMap[t.sede_da]
              const sa = sediMap[t.sede_a]
              return (
                <div key={t.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#FFF', border: '1px solid #BAE6FD', borderRadius: 999,
                  padding: '6px 6px 6px 14px',
                }}>
                  <button onClick={() => applicaTemplate(t)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: '#0E1726', fontWeight: 700 }}>
                    {t.nome} <span style={{ fontWeight: 500, color: C.textSoft, fontSize: 11 }}>· {sda?.nome || '?'} → {sa?.nome || '?'}</span>
                  </button>
                  <button onClick={() => eliminaTemplate(t.id)} title="Elimina template"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: C.textSoft, display: 'inline-flex' }}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* DA FARE ORA: solo se c'è qualcosa da gestire per la sede attiva */}
      {(azioniUrgenti.daRicevere.length > 0 || azioniUrgenti.bozzeInUscita.length > 0) && (
        <div style={{ background: '#FFFBEB', border: `1px solid ${C.amber}`, borderRadius: 12, padding: isMobile ? 14 : 18, marginTop: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400E', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="warning" size={14} /> Da fare ora ({azioniUrgenti.daRicevere.length + azioniUrgenti.bozzeInUscita.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {azioniUrgenti.daRicevere.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 8, border: `1px solid ${C.amber}`, flexWrap: 'wrap' }}>
                <Icon name="package" size={16} color={C.amber} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{t.prodotto} · {fmtQty(t.quantita, t.unita)}</div>
                  <div style={{ fontSize: 11, color: C.textSoft }}>In arrivo da <strong>{sediMap[t.sede_da]?.nome || '—'}</strong> · {fmtData(t.data)}</div>
                </div>
                <button onClick={() => apriRicevi(t)} disabled={busyId === t.id}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.green, color: C.white, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                  ✓ Conferma ricezione
                </button>
              </div>
            ))}
            {azioniUrgenti.bozzeInUscita.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 8, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                <Icon name="save" size={15} color={C.textSoft} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{t.prodotto} · {fmtQty(t.quantita, t.unita)}</div>
                  <div style={{ fontSize: 11, color: C.textSoft }}>Bozza verso <strong>{sediMap[t.sede_a]?.nome || '—'}</strong> · pronta da inviare</div>
                </div>
                <button onClick={() => azInvia(t)} disabled={busyId === t.id}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="truck" size={13} /> Invia ora
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginTop: 20, marginBottom: 20 }}>
        {[
          { label: 'Totale', val: kpi.tot, color: C.text },
          { label: 'In uscita', val: kpi.inUscita, color: C.red },
          { label: 'In entrata', val: kpi.inEntrata, color: C.green },
          { label: 'Da ricevere', val: kpi.daRicevere, color: C.amber, highlight: kpi.daRicevere > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: k.highlight ? '#FEF3C7' : C.bgCard, border: `1px solid ${k.highlight ? C.amber : C.border}`, borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, marginTop: 4, ...tnum }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(s => !s)}
          style={{ padding: '8px 16px', background: showForm ? C.bgCard : C.red, color: showForm ? C.textMid : C.white,
            border: showForm ? `1px solid ${C.border}` : 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {showForm ? <>✕ Annulla</> : <><Icon name="plus" size={14} /> Nuovo trasferimento</>}
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['attiva','pin','Sede attiva'], ['tutte','building','Tutte le sedi']].map(([id, ic, lbl2]) => (
            <button key={id} onClick={() => setScope(id)}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`,
                background: scope === id ? C.text : C.bgCard, color: scope === id ? C.white : C.textMid,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name={ic} size={13} /> {lbl2}</button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={lbl}>Data</div>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inp}/>
            </div>
            <div>
              <div style={lbl}>Tipo</div>
              <select value={form.tipo} onChange={e => {
                const nuovoTipo = e.target.value
                setForm(f => ({
                  ...f,
                  tipo: nuovoTipo,
                  // Auto-imposta un'unità sensata quando cambia il tipo.
                  unita: nuovoTipo === 'materia_prima'
                    ? (f.unita === 'kg' || f.unita === 'g' ? f.unita : 'g')
                    : (['pz','vassoi','kg','g','l','ml'].includes(f.unita) ? f.unita : 'pz'),
                }))
              }} style={inp}>
                {TIPI.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 30px 1fr', gap: 12, marginBottom: 12, alignItems: 'end' }}>
            <div>
              <div style={lbl}>Da</div>
              <select value={form.sede_da} onChange={e => setForm(f => ({ ...f, sede_da: e.target.value }))} style={inp}>
                <option value="">— Seleziona —</option>
                {sediAttive.map(s => <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>)}
              </select>
            </div>
            <div style={{ textAlign: 'center', fontSize: 20, color: C.textSoft, paddingBottom: isMobile ? 0 : 6 }}>→</div>
            <div>
              <div style={lbl}>A</div>
              <select value={form.sede_a} onChange={e => setForm(f => ({ ...f, sede_a: e.target.value }))} style={inp}>
                <option value="">— Seleziona —</option>
                {sediAttive.filter(s => s.id !== form.sede_da).map(s => <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={lbl}>{form.tipo === 'materia_prima' ? 'Ingrediente *' : 'Prodotto *'}</div>
              <input value={form.prodotto} onChange={e => setForm(f => ({ ...f, prodotto: e.target.value }))} style={inp}
                placeholder={form.tipo === 'materia_prima' ? 'es. zucchero' : 'es. BRIOCHES VUOTE'}/>
            </div>
            <div>
              <div style={lbl}>Quantità *</div>
              <input type="number" min="0" step="0.1" value={form.quantita} onChange={e => setForm(f => ({ ...f, quantita: e.target.value }))} style={inp}/>
            </div>
            <div>
              <div style={lbl}>Unità</div>
              <select value={form.unita} onChange={e => setForm(f => ({ ...f, unita: e.target.value }))} style={inp}>
                {(form.tipo === 'materia_prima' ? ['g','kg'] : ['pz','vassoi','kg','g','l','ml']).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Valore unit. (€)</div>
              <input type="number" min="0" step="0.01" value={form.valore_unit} onChange={e => setForm(f => ({ ...f, valore_unit: e.target.value }))} style={inp}/>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={lbl}>Note</div>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inp} placeholder="opzionale"/>
          </div>

          {/* Info movimentazione stock */}
          <div style={{ marginBottom: 14, padding: '10px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 11, color: '#1E40AF', lineHeight: 1.5 }}>
            {form.tipo === 'prodotto' && <><Icon name="package" size={13} /> All'invio: scala stock prodotti finiti di <strong>{sediMap[form.sede_da]?.nome || 'partenza'}</strong>. Alla ricezione: incrementa stock di <strong>{sediMap[form.sede_a]?.nome || 'destinazione'}</strong>.</>}
            {form.tipo === 'materia_prima' && <><Icon name="package" size={13} /> All'invio: scala magazzino materie prime di <strong>{sediMap[form.sede_da]?.nome || 'partenza'}</strong>. Alla ricezione: incrementa magazzino di <strong>{sediMap[form.sede_a]?.nome || 'destinazione'}</strong>.</>}
            {form.tipo === 'semilavorato' && <><Icon name="gift" size={13} /> Trasferimento di semilavorato. Solo log, lo stock semilavorati non è ancora gestito automaticamente.</>}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => salvaBozza(true)} disabled={saving}
              style={{ padding: '10px 20px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {saving ? '…' : <><Icon name="truck" size={14} /> Invia subito</>}
            </button>
            <button onClick={() => salvaBozza(false)} disabled={saving}
              style={{ padding: '10px 20px', background: C.bgCard, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="save" size={14} /> Salva bozza
            </button>
            <button onClick={() => {
              if (!form.prodotto?.trim() || !form.sede_da || !form.sede_a) {
                notify?.('Compila prodotto + sedi prima di salvare template', false); return
              }
              const nome = prompt('Nome template (es. "Lab → Via Roma mattutino"):', `${form.prodotto.slice(0, 20)}`)
              if (nome) salvaTemplate(nome)
            }} disabled={saving}
              style={{ padding: '10px 16px', background: 'transparent', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
              title="Salva queste impostazioni come template ricorrente">
              <Icon name="save" size={13} /> Salva come template
            </button>
          </div>
        </div>
      )}

      {/* Modal Ricezione */}
      {riceviModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          role="dialog" aria-modal="true"
          onClick={() => setRiceviModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, borderRadius: 12, padding: 24, maxWidth: 480, width: '100%' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="package" size={18} /> Conferma ricezione</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSoft }}>
              <strong>{riceviModal.t.prodotto}</strong> · {fmtQty(riceviModal.t.quantita, riceviModal.t.unita)} inviati da {sediMap[riceviModal.t.sede_da]?.nome || '—'}
            </p>
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Quantità effettivamente ricevuta</div>
              <input type="number" min="0" max={riceviModal.t.quantita} step="0.1"
                value={riceviModal.qtyRic}
                onChange={e => setRiceviModal(m => ({ ...m, qtyRic: e.target.value }))}
                style={inp}/>
              {parseFloat(riceviModal.qtyRic) < Number(riceviModal.t.quantita) && (
                <div style={{ marginTop: 6, fontSize: 11, color: C.amber, display: 'inline-flex', alignItems: 'center', gap: 5, ...tnum }}>
                  <Icon name="warning" size={12} /> Scarto: {(Number(riceviModal.t.quantita) - parseFloat(riceviModal.qtyRic || 0)).toLocaleString('it-IT', { maximumFractionDigits: 2 })} {riceviModal.t.unita}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={lbl}>Note scarto (opzionale)</div>
              <input value={riceviModal.note} onChange={e => setRiceviModal(m => ({ ...m, note: e.target.value }))}
                style={inp} placeholder="es. 2 pezzi danneggiati"/>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRiceviModal(null)}
                style={{ padding: '10px 18px', background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Annulla
              </button>
              <button onClick={confermaRicezione} disabled={busyId === riceviModal.t.id}
                style={{ padding: '10px 18px', background: C.green, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                ✓ Conferma ricezione
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flussi del mese (solo se scope tutte e ci sono dati) */}
      {scope === 'tutte' && flussiMese.length > 0 && !loading && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: isMobile ? 14 : 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 10 }}>
            📊 Flussi questo mese
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
            {flussiMese.map((f, i) => {
              const da = sediMap[f.sede_da]?.nome || '—'
              const a = sediMap[f.sede_a]?.nome || '—'
              const topProd = Object.entries(f.prodotti).sort((x, y) => y[1] - x[1]).slice(0, 2)
              return (
                <div key={i} style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                    {da} <span style={{ color: C.textSoft }}>→</span> {a}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMid, ...tnum }}>
                    <strong>{f.n}</strong> trasferiment{f.n === 1 ? 'o' : 'i'}
                    {f.valore > 0 && <> · valore stimato <strong>{fmtEuro(f.valore)}</strong></>}
                  </div>
                  {topProd.length > 0 && (
                    <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 4 }}>
                      Top: {topProd.map(([p, q]) => `${p} (${q})`).join(' · ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtri lista */}
      {!loading && lista.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filtri:</span>
          <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, fontSize: 12 }}>
            <option value="all">Tutti gli stati</option>
            <option value="bozza">Bozza</option>
            <option value="inviato">Inviato</option>
            <option value="ricevuto">Ricevuto</option>
            <option value="annullato">Annullato</option>
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, fontSize: 12 }}>
            <option value="all">Tutti i tipi</option>
            {TIPI.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
          </select>
          {(filtroStato !== 'all' || filtroTipo !== 'all') && (
            <button onClick={() => { setFiltroStato('all'); setFiltroTipo('all') }}
              style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ✕ Rimuovi filtri
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: C.textSoft }}>
            {listaFiltrata.length} di {lista.length}
          </span>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <SkeletonList count={5} />
      ) : listaFiltrata.length === 0 ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: C.textSoft, fontSize: 13 }}>
          {lista.length === 0
            ? <>Nessun trasferimento{scope === 'attiva' ? ' per la sede attiva' : ''}.</>
            : <>Nessun trasferimento corrisponde ai filtri.</>
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listaFiltrata.map(t => {
            const sda = sediMap[t.sede_da]
            const sa = sediMap[t.sede_a]
            const statoCfg = STATO_LABEL[t.stato] || STATO_LABEL.bozza
            const sedeAttivaId = sedeAttiva?.id
            const isMioInArrivo = t.sede_a === sedeAttivaId && t.stato === 'inviato'
            const busy = busyId === t.id

            return (
              <div key={t.id} style={{
                background: isMioInArrivo ? '#FFFBEB' : C.bgCard,
                border: `1px solid ${isMioInArrivo ? C.amber : C.border}`,
                borderRadius: 10, padding: '14px 18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span title={t.prodotto} style={{ fontSize: 13, fontWeight: 700, color: C.text, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.prodotto}</span>
                    <span style={{ fontSize: 11, color: C.textMid, whiteSpace: 'nowrap', ...tnum }}>{fmtQty(t.quantita, t.unita)}</span>
                    {t.valore_unit > 0 && <span style={{ fontSize: 11, color: C.textSoft, whiteSpace: 'nowrap', ...tnum }}>· {fmtEuro(t.quantita * t.valore_unit)}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: statoCfg.bg, color: statoCfg.color }}>
                      {statoCfg.label}
                    </span>
                    {t.scarto_qty > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEE2E2', color: '#991B1B' }}>
                        Scarto: {t.scarto_qty} {t.unita}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {t.stato === 'bozza' && (
                      <>
                        <button onClick={() => azInvia(t)} disabled={busy} title="Invia"
                          style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: C.red, color: C.white, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="truck" size={12} /> Invia
                        </button>
                        <button onClick={() => azElimina(t)} disabled={busy} title="Elimina bozza"
                          style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="trash" size={13} /></button>
                      </>
                    )}
                    {t.stato === 'inviato' && (
                      <>
                        <button onClick={() => apriRicevi(t)} disabled={busy} title="Conferma ricezione"
                          style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: C.green, color: C.white, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          ✓ Ricevuto
                        </button>
                        <button onClick={() => azAnnulla(t)} disabled={busy} title="Annulla (rollback stock)"
                          style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.amber}`, background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="xCircle" size={13} /></button>
                      </>
                    )}
                    {(t.stato === 'ricevuto' || t.stato === 'completato') && (
                      <>
                        <span style={{ fontSize: 11, color: C.textSoft }}>{t.data_ricezione ? fmtData(t.data_ricezione) : ''}</span>
                        <button onClick={() => ripetiTrasferimento(t)}
                          title="Pre-compila lo stesso trasferimento con la data di oggi"
                          style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="copy" size={12} /> Ripeti
                        </button>
                      </>
                    )}
                    {t.stato === 'annullato' && (
                      <button onClick={() => azElimina(t)} title="Elimina"
                        style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="trash" size={13} /></button>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.textSoft, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={12} /> {fmtData(t.data)}</span>
                  <span>•</span>
                  <span>{TIPO_LABEL[t.tipo] || t.tipo}</span>
                  <span>•</span>
                  <span><strong style={{ color: C.text }}>{sda?.nome || '—'}</strong> → <strong style={{ color: C.text }}>{sa?.nome || '—'}</strong></span>
                  {t.note && <><span>•</span><span style={{ fontStyle: 'italic' }}>{t.note}</span></>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
