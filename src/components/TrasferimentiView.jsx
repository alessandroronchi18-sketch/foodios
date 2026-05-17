import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, motion as M } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'

const C = {
  bg: T.bg, bgCard: T.bgCard, red: T.brand, redLight: T.brandLight,
  green: T.green, greenLight: T.greenLight, amber: T.amber, amberLight: T.amberLight,
  text: T.text, textMid: T.textMid, textSoft: T.textSoft, white: T.white,
  border: T.border, borderStr: T.borderStr || T.border,
}
const tnum = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }

const TIPI = [
  { id: 'prodotto',       lbl: '🍰 Prodotto finito' },
  { id: 'semilavorato',   lbl: '🧁 Semilavorato' },
  { id: 'materia_prima',  lbl: '🌾 Materia prima' },
]
const STATI = [
  { id: 'bozza',       lbl: 'Bozza',       bg: '#F1F5F9', fg: '#475569' },
  { id: 'inviato',     lbl: 'Inviato',     bg: '#DBEAFE', fg: '#1E40AF' },
  { id: 'completato',  lbl: 'Completato',  bg: '#D1FAE5', fg: '#065F46' },
  { id: 'annullato',   lbl: 'Annullato',   bg: '#FEE2E2', fg: '#991B1B' },
]

function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtQty(q, u) {
  return `${Number(q || 0).toLocaleString('it-IT', { maximumFractionDigits: 3 })} ${u || ''}`
}

export default function TrasferimentiView({ orgId, sedi = [], sedeAttiva = null, notify }) {
  const isMobile = useIsMobile()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [scope, setScope] = useState('attiva') // 'attiva' (in/out della sede attiva) | 'tutte'
  const [form, setForm] = useState(() => ({
    data: new Date().toISOString().slice(0, 10),
    tipo: 'prodotto',
    sede_da: sedeAttiva?.id || '',
    sede_a: '',
    prodotto: '',
    quantita: '',
    unita: 'pz',
    valore_unit: '',
    note: '',
    stato: 'completato',
  }))
  const [saving, setSaving] = useState(false)

  const sediAttive = (sedi || []).filter(s => s.attiva !== false)
  const sediMap = Object.fromEntries(sediAttive.map(s => [s.id, s]))

  useEffect(() => {
    if (sedeAttiva?.id && !form.sede_da) {
      setForm(f => ({ ...f, sede_da: sedeAttiva.id }))
    }
  }, [sedeAttiva?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carica() }, [orgId, sedeAttiva?.id, scope])

  async function carica() {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    try {
      let q = supabase.from('trasferimenti').select('*').eq('organization_id', orgId)
      if (scope === 'attiva' && sedeAttiva?.id) {
        q = q.or(`sede_da.eq.${sedeAttiva.id},sede_a.eq.${sedeAttiva.id}`)
      }
      const { data, error } = await q.order('data', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      setLista(data || [])
    } catch (e) {
      notify?.('Errore caricamento trasferimenti: ' + e.message, false)
    } finally { setLoading(false) }
  }

  async function salva() {
    if (!orgId) return
    if (!form.sede_da || !form.sede_a) { notify?.('Seleziona sede di partenza e destinazione', false); return }
    if (form.sede_da === form.sede_a) { notify?.('Sede di partenza e destinazione devono essere diverse', false); return }
    if (!form.prodotto.trim()) { notify?.('Inserisci il prodotto', false); return }
    const qty = parseFloat(form.quantita)
    if (!Number.isFinite(qty) || qty <= 0) { notify?.('Quantità non valida', false); return }

    setSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const payload = {
        organization_id: orgId,
        data: form.data,
        tipo: form.tipo,
        sede_da: form.sede_da,
        sede_a: form.sede_a,
        prodotto: form.prodotto.trim(),
        quantita: qty,
        unita: form.unita || 'pz',
        valore_unit: parseFloat(form.valore_unit) || 0,
        note: form.note?.trim() || null,
        stato: form.stato,
        created_by: userData?.user?.id || null,
      }
      const { error } = await supabase.from('trasferimenti').insert(payload)
      if (error) throw error
      notify?.('✓ Trasferimento registrato')
      setForm(f => ({ ...f, prodotto: '', quantita: '', valore_unit: '', note: '' }))
      setShowForm(false)
      await carica()
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    } finally { setSaving(false) }
  }

  async function aggiornaStato(id, nuovoStato) {
    try {
      const { error } = await supabase.from('trasferimenti').update({ stato: nuovoStato }).eq('id', id)
      if (error) throw error
      notify?.('✓ Stato aggiornato')
      await carica()
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  async function elimina(id) {
    if (!confirm('Eliminare questo trasferimento?')) return
    try {
      const { error } = await supabase.from('trasferimenti').delete().eq('id', id)
      if (error) throw error
      notify?.('✓ Trasferimento eliminato')
      await carica()
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  const kpi = useMemo(() => {
    const sedeId = sedeAttiva?.id
    return {
      tot: lista.length,
      inUscita: sedeId ? lista.filter(t => t.sede_da === sedeId).length : 0,
      inEntrata: sedeId ? lista.filter(t => t.sede_a === sedeId).length : 0,
      bozze: lista.filter(t => t.stato === 'bozza').length,
    }
  }, [lista, sedeAttiva?.id])

  // Se ho meno di 2 sedi, la feature non ha senso
  if (sediAttive.length < 2) {
    return (
      <div style={{ maxWidth: 720, margin: '60px auto', textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚚</div>
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
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: '-0.03em' }}>Trasferimenti tra sedi</h1>
        <p style={{ margin: 0, fontSize: 13, color: C.textSoft }}>
          Sposta prodotti dal laboratorio ai punti vendita, o tra qualsiasi coppia di sedi.
        </p>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginTop: 20, marginBottom: 20 }}>
        {[
          { label: 'Totale', val: kpi.tot, color: C.text },
          { label: 'In uscita', val: kpi.inUscita, color: C.red },
          { label: 'In entrata', val: kpi.inEntrata, color: C.green },
          { label: 'Bozze', val: kpi.bozze, color: C.amber },
        ].map(k => (
          <div key={k.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, marginTop: 4, ...tnum }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setShowForm(s => !s)}
          style={{ padding: '8px 16px', background: showForm ? C.bgCard : C.red, color: showForm ? C.textMid : C.white,
            border: showForm ? `1px solid ${C.border}` : 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {showForm ? '✕ Annulla' : '➕ Nuovo trasferimento'}
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['attiva','📍 Sede attiva'], ['tutte','🏢 Tutte le sedi']].map(([id, lbl2]) => (
            <button key={id} onClick={() => setScope(id)}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`,
                background: scope === id ? C.text : C.bgCard, color: scope === id ? C.white : C.textMid,
                fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{lbl2}</button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={lbl}>Data</div>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inp}/>
            </div>
            <div>
              <div style={lbl}>Tipo</div>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
                {TIPI.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Stato</div>
              <select value={form.stato} onChange={e => setForm(f => ({ ...f, stato: e.target.value }))} style={inp}>
                {STATI.map(s => <option key={s.id} value={s.id}>{s.lbl}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 30px 1fr', gap: 12, marginBottom: 12, alignItems: 'end' }}>
            <div>
              <div style={lbl}>Da</div>
              <select value={form.sede_da} onChange={e => setForm(f => ({ ...f, sede_da: e.target.value }))} style={inp}>
                <option value="">— Seleziona —</option>
                {sediAttive.map(s => <option key={s.id} value={s.id}>📍 {s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>)}
              </select>
            </div>
            <div style={{ textAlign: 'center', fontSize: 20, color: C.textSoft, paddingBottom: isMobile ? 0 : 6 }}>→</div>
            <div>
              <div style={lbl}>A</div>
              <select value={form.sede_a} onChange={e => setForm(f => ({ ...f, sede_a: e.target.value }))} style={inp}>
                <option value="">— Seleziona —</option>
                {sediAttive.filter(s => s.id !== form.sede_da).map(s => <option key={s.id} value={s.id}>📍 {s.nome}{s.citta ? ` · ${s.citta}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={lbl}>Prodotto *</div>
              <input value={form.prodotto} onChange={e => setForm(f => ({ ...f, prodotto: e.target.value }))} style={inp} placeholder="es. BRIOCHES VUOTE"/>
            </div>
            <div>
              <div style={lbl}>Quantità *</div>
              <input type="number" min="0" step="0.1" value={form.quantita} onChange={e => setForm(f => ({ ...f, quantita: e.target.value }))} style={inp}/>
            </div>
            <div>
              <div style={lbl}>Unità</div>
              <select value={form.unita} onChange={e => setForm(f => ({ ...f, unita: e.target.value }))} style={inp}>
                {['pz','kg','g','l','ml','vassoi'].map(u => <option key={u} value={u}>{u}</option>)}
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
          <button onClick={salva} disabled={saving}
            style={{ padding: '10px 20px', background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            {saving ? '…' : 'Registra trasferimento'}
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : lista.length === 0 ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: C.textSoft, fontSize: 13 }}>
          Nessun trasferimento{scope === 'attiva' ? ' per la sede attiva' : ''}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(t => {
            const sda = sediMap[t.sede_da]
            const sa = sediMap[t.sede_a]
            const statoCfg = STATI.find(s => s.id === t.stato) || STATI[2]
            return (
              <div key={t.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.prodotto}</span>
                    <span style={{ fontSize: 11, color: C.textMid, ...tnum }}>{fmtQty(t.quantita, t.unita)}</span>
                    {t.valore_unit > 0 && <span style={{ fontSize: 11, color: C.textSoft, ...tnum }}>· €{(t.quantita * t.valore_unit).toFixed(2)}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: statoCfg.bg, color: statoCfg.fg }}>
                      {statoCfg.lbl}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {t.stato !== 'completato' && (
                      <button onClick={() => aggiornaStato(t.id, 'completato')} title="Segna come completato"
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.green}`, background: C.greenLight, color: C.green, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                    )}
                    {t.stato !== 'annullato' && (
                      <button onClick={() => aggiornaStato(t.id, 'annullato')} title="Annulla"
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.amber}40`, background: C.amberLight, color: C.amber, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>⊘</button>
                    )}
                    <button onClick={() => elimina(t.id)} title="Elimina"
                      style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.red}40`, background: C.redLight, color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🗑</button>
                  </div>
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.textSoft, flexWrap: 'wrap' }}>
                  <span>📅 {fmtData(t.data)}</span>
                  <span>•</span>
                  <span>{TIPI.find(tt => tt.id === t.tipo)?.lbl || t.tipo}</span>
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
