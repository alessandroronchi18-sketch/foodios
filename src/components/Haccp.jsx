// HACCP MVP — Modulo per ispezioni ASL (richiesta #1 dei ristoratori italiani).
// Tabs:
//   - Temperature: gestione apparecchi + log temperature con alert range
//   - Pulizie: checklist personalizzabile + log esecuzione
//   - Allergeni: vista riassuntiva dal ricettario
//   - Export PDF: registro completo formattato per ASL
//
// NOTA LEGALE: questo è uno strumento di supporto. La conformità HACCP
// effettiva richiede valutazione di un tecnico HACCP certificato.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { ALLERGENI } from '../lib/allergeni'
import { todayLocal } from '../lib/dateLocal'

const TIPI_APPARECCHIO = [
  { id: 'frigo',        label: 'Frigorifero',     min:0,  max:8  },
  { id: 'congelatore',  label: 'Congelatore',     min:-22, max:-15 },
  { id: 'abbattitore',  label: 'Abbattitore',     min:-40, max:5  },
  { id: 'vetrina',      label: 'Vetrina espositiva', min:2, max:8 },
  { id: 'altro',        label: 'Altro',           min:0,  max:8  },
]
const FREQUENZE = [
  { id: 'giornaliera',  label: 'Giornaliera' },
  { id: 'settimanale',  label: 'Settimanale' },
  { id: 'mensile',      label: 'Mensile'    },
]

const FmtDt = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
}
const FmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit' })
}

// ─── Tab Temperature ──────────────────────────────────────────────────────────
function TemperatureTab({ orgId, sedeId, isMobile, notify }) {
  const [apparecchi, setApparecchi] = useState([])
  const [storico, setStorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddApp, setShowAddApp] = useState(false)
  const [formApp, setFormApp] = useState({ nome:'', tipo:'frigo', temp_min:0, temp_max:8 })
  const [formLog, setFormLog] = useState({ apparecchio_id:'', temperatura:'', operatore:'', note:'' })

  useEffect(() => { if (orgId) carica() }, [orgId, sedeId])

  async function carica() {
    setLoading(true)
    const [ap, st] = await Promise.all([
      supabase.from('haccp_apparecchi').select('*')
        .eq('organization_id', orgId).eq('attivo', true).order('nome'),
      supabase.from('haccp_temperature').select('*, haccp_apparecchi(nome, tipo)')
        .eq('organization_id', orgId).order('rilevato_at', { ascending:false }).limit(40),
    ])
    setApparecchi(ap.data || [])
    setStorico(st.data || [])
    setLoading(false)
  }

  function setTipoApp(tipo) {
    const t = TIPI_APPARECCHIO.find(x => x.id === tipo) || TIPI_APPARECCHIO[0]
    setFormApp(f => ({ ...f, tipo, temp_min: t.min, temp_max: t.max }))
  }

  async function salvaApparecchio() {
    if (!formApp.nome.trim()) return notify?.('⚠ Inserisci un nome', false)
    const { error } = await supabase.from('haccp_apparecchi').insert({
      organization_id: orgId, sede_id: sedeId || null,
      nome: formApp.nome.trim(), tipo: formApp.tipo,
      temp_min: parseFloat(formApp.temp_min) || 0,
      temp_max: parseFloat(formApp.temp_max) || 0,
    })
    if (error) return notify?.('⚠ ' + error.message, false)
    notify?.('✓ Apparecchio aggiunto')
    setFormApp({ nome:'', tipo:'frigo', temp_min:0, temp_max:8 })
    setShowAddApp(false)
    carica()
  }

  async function disattivaApp(id) {
    if (!confirm('Disattivare questo apparecchio?')) return
    await supabase.from('haccp_apparecchi').update({ attivo:false }).eq('id', id)
    carica()
  }

  async function salvaLog() {
    if (!formLog.apparecchio_id) return notify?.('⚠ Seleziona un apparecchio', false)
    if (formLog.temperatura === '') return notify?.('⚠ Inserisci la temperatura', false)
    const temp = parseFloat(formLog.temperatura)
    const app = apparecchi.find(a => a.id === formLog.apparecchio_id)
    const fuoriRange = app ? (temp < app.temp_min || temp > app.temp_max) : false
    const { error } = await supabase.from('haccp_temperature').insert({
      organization_id: orgId, sede_id: sedeId || null,
      apparecchio_id: formLog.apparecchio_id,
      temperatura: temp,
      operatore: formLog.operatore.trim() || null,
      note: formLog.note.trim() || null,
      fuori_range: fuoriRange,
    })
    if (error) return notify?.('⚠ ' + error.message, false)
    notify?.(fuoriRange
      ? `⚠ Rilevato fuori range (${temp}°C, range ${app.temp_min}–${app.temp_max}°C)`
      : '✓ Temperatura registrata')
    setFormLog({ apparecchio_id:'', temperatura:'', operatore:'', note:'' })
    carica()
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile?16:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const card = { background:T.bgCard, borderRadius:R.xl, padding:'18px 20px', border:`1px solid ${T.border}`, marginBottom:16, boxShadow:S.sm }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:T.textSoft }}>Caricamento…</div>

  return (
    <div>
      {/* Form rapido nuova rilevazione */}
      <div style={card}>
        <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:12 }}>📌 Registra rilevazione</div>
        {apparecchi.length === 0 ? (
          <div style={{ padding:'14px 16px', background:T.amberLight, color:T.amber, borderRadius:R.md, fontSize:13, fontWeight:600 }}>
            Prima aggiungi almeno un apparecchio sotto.
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'2fr 1fr 1fr', gap:10 }}>
            <select style={inp} value={formLog.apparecchio_id}
              onChange={e => setFormLog(f => ({ ...f, apparecchio_id: e.target.value }))}>
              <option value="">— Seleziona apparecchio —</option>
              {apparecchi.map(a => <option key={a.id} value={a.id}>{a.nome} ({a.temp_min}/{a.temp_max}°C)</option>)}
            </select>
            <input style={inp} type="number" step="0.1" placeholder="Temperatura °C"
              value={formLog.temperatura}
              onChange={e => setFormLog(f => ({ ...f, temperatura: e.target.value }))}/>
            <input style={inp} placeholder="Operatore (opz.)"
              value={formLog.operatore}
              onChange={e => setFormLog(f => ({ ...f, operatore: e.target.value }))}/>
            <input style={{ ...inp, gridColumn: isMobile?'auto':'1 / -1' }} placeholder="Note (opzionale)"
              value={formLog.note}
              onChange={e => setFormLog(f => ({ ...f, note: e.target.value }))}/>
            <button onClick={salvaLog} style={{ gridColumn: isMobile?'auto':'1 / -1', height:44, padding:'0 18px', borderRadius:R.md, border:'none', background:T.brand, color:'#FFF', fontSize:14, fontWeight:800, cursor:'pointer', boxShadow:`0 4px 12px ${T.brand}44` }}>
              Salva rilevazione
            </button>
          </div>
        )}
      </div>

      {/* Apparecchi */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text }}>🌡️ Apparecchi monitorati ({apparecchi.length})</div>
          <button onClick={() => setShowAddApp(s => !s)}
            style={{ height:34, padding:'0 14px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, color:T.text, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            {showAddApp ? '× Annulla' : '+ Aggiungi'}
          </button>
        </div>
        {showAddApp && (
          <div style={{ padding:'14px 16px', background:T.bgSubtle, borderRadius:R.md, marginBottom:12 }}>
            <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'2fr 1fr 1fr 1fr', gap:10 }}>
              <input style={inp} placeholder="Nome (es. Frigo cucina A)"
                value={formApp.nome} onChange={e=>setFormApp(f=>({ ...f, nome:e.target.value }))}/>
              <select style={inp} value={formApp.tipo} onChange={e=>setTipoApp(e.target.value)}>
                {TIPI_APPARECCHIO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input style={inp} type="number" step="0.5" placeholder="Min °C"
                value={formApp.temp_min} onChange={e=>setFormApp(f=>({ ...f, temp_min:e.target.value }))}/>
              <input style={inp} type="number" step="0.5" placeholder="Max °C"
                value={formApp.temp_max} onChange={e=>setFormApp(f=>({ ...f, temp_max:e.target.value }))}/>
            </div>
            <button onClick={salvaApparecchio}
              style={{ marginTop:10, height:40, padding:'0 16px', borderRadius:R.md, border:'none', background:T.text, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Salva apparecchio
            </button>
          </div>
        )}
        {apparecchi.length === 0 && !showAddApp && (
          <div style={{ padding:16, color:T.textSoft, fontSize:13, textAlign:'center' }}>
            Nessun apparecchio. Aggiungi i tuoi frigoriferi/congelatori per iniziare a registrare le temperature.
          </div>
        )}
        {apparecchi.map(a => (
          <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:T.bgSubtle, borderRadius:R.md, marginBottom:6 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{a.nome}</div>
              <div style={{ fontSize:11, color:T.textSoft }}>
                {TIPI_APPARECCHIO.find(t=>t.id===a.tipo)?.label || a.tipo} · Range {a.temp_min}°C – {a.temp_max}°C
              </div>
            </div>
            <button onClick={() => disattivaApp(a.id)}
              style={{ padding:'6px 10px', borderRadius:R.md, border:`1px solid ${T.borderSoft}`, background:'transparent', color:T.textSoft, fontSize:11, cursor:'pointer' }}>
              Rimuovi
            </button>
          </div>
        ))}
      </div>

      {/* Storico recente */}
      <div style={card}>
        <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:12 }}>📋 Storico recente ({storico.length})</div>
        {storico.length === 0 ? (
          <div style={{ padding:16, color:T.textSoft, fontSize:13, textAlign:'center' }}>
            Nessuna rilevazione registrata.
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:13 }}>
              <thead>
                <tr style={{ background:T.bgSubtle }}>
                  <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.06em' }}>Data/ora</th>
                  <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.06em' }}>Apparecchio</th>
                  <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.06em' }}>Temp.</th>
                  <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.06em' }}>Operatore</th>
                </tr>
              </thead>
              <tbody>
                {storico.map(s => (
                  <tr key={s.id} style={{ borderTop:`1px solid ${T.borderSoft}`, background: s.fuori_range ? T.brandLight : 'transparent' }}>
                    <td style={{ padding:'10px 14px', color:T.textMid }}>{FmtDt(s.rilevato_at)}</td>
                    <td style={{ padding:'10px 14px', color:T.text, fontWeight:600 }}>{s.haccp_apparecchi?.nome || '—'}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', fontVariantNumeric:'tabular-nums', color: s.fuori_range ? T.brand : T.text, fontWeight: s.fuori_range ? 800 : 600 }}>
                      {s.temperatura}°C {s.fuori_range && '⚠'}
                    </td>
                    <td style={{ padding:'10px 14px', color:T.textSoft }}>{s.operatore || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab Pulizie ──────────────────────────────────────────────────────────────
function PulizieTab({ orgId, sedeId, isMobile, notify }) {
  const [tpl, setTpl] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [formT, setFormT] = useState({ nome:'', frequenza:'giornaliera' })
  const [operatore, setOperatore] = useState('')

  useEffect(() => { if (orgId) carica() }, [orgId, sedeId])

  async function carica() {
    setLoading(true)
    const [t, l] = await Promise.all([
      supabase.from('haccp_checklist_template').select('*')
        .eq('organization_id', orgId).eq('attivo', true).order('ordine'),
      supabase.from('haccp_checklist_log').select('*')
        .eq('organization_id', orgId).order('eseguito_at', { ascending:false }).limit(80),
    ])
    setTpl(t.data || [])
    setLog(l.data || [])
    setLoading(false)
  }

  async function aggiungiTpl() {
    if (!formT.nome.trim()) return
    await supabase.from('haccp_checklist_template').insert({
      organization_id: orgId, sede_id: sedeId || null,
      nome: formT.nome.trim(), frequenza: formT.frequenza, ordine: tpl.length,
    })
    setFormT({ nome:'', frequenza:'giornaliera' })
    notify?.('✓ Task aggiunto')
    carica()
  }

  async function rimuoviTpl(id) {
    if (!confirm('Rimuovere questo task?')) return
    await supabase.from('haccp_checklist_template').update({ attivo:false }).eq('id', id)
    carica()
  }

  async function eseguiTpl(id) {
    await supabase.from('haccp_checklist_log').insert({
      organization_id: orgId, sede_id: sedeId || null,
      template_id: id, operatore: operatore.trim() || null,
    })
    notify?.('✓ Esecuzione registrata')
    carica()
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile?16:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const card = { background:T.bgCard, borderRadius:R.xl, padding:'18px 20px', border:`1px solid ${T.border}`, marginBottom:16, boxShadow:S.sm }

  // Logica "fatto oggi/questa settimana/questo mese" per evidenziare task ancora da fare
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const inizioSettimana = new Date(oggi); inizioSettimana.setDate(oggi.getDate() - oggi.getDay()) // domenica
  const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1)
  function fattoNel(tpId, freq) {
    const soglia = freq === 'mensile' ? inizioMese : freq === 'settimanale' ? inizioSettimana : oggi
    return log.find(l => l.template_id === tpId && new Date(l.eseguito_at) >= soglia)
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:T.textSoft }}>Caricamento…</div>

  return (
    <div>
      {/* Form aggiunta task */}
      <div style={card}>
        <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:12 }}>➕ Aggiungi task pulizia</div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'2fr 1fr auto', gap:10 }}>
          <input style={inp} placeholder="Es. Sanificazione banco lavoro"
            value={formT.nome} onChange={e=>setFormT(f=>({...f, nome:e.target.value}))}/>
          <select style={inp} value={formT.frequenza} onChange={e=>setFormT(f=>({...f, frequenza:e.target.value}))}>
            {FREQUENZE.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button onClick={aggiungiTpl}
            style={{ height:40, padding:'0 18px', borderRadius:R.md, border:'none', background:T.brand, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            Aggiungi
          </button>
        </div>
      </div>

      {/* Operatore corrente */}
      <div style={card}>
        <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Operatore in turno (opzionale)</div>
        <input style={inp} placeholder="Mario Rossi" value={operatore} onChange={e=>setOperatore(e.target.value)}/>
        <div style={{ fontSize:11, color:T.textSoft, marginTop:6 }}>
          Quando registri un task, verrà associato a questo nome.
        </div>
      </div>

      {/* Lista task con stato */}
      {FREQUENZE.map(f => {
        const items = tpl.filter(t => t.frequenza === f.id)
        if (items.length === 0) return null
        return (
          <div key={f.id} style={card}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:12 }}>
              📅 Pulizie {f.label.toLowerCase()} ({items.length})
            </div>
            {items.map(t => {
              const done = fattoNel(t.id, t.frequenza)
              return (
                <div key={t.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 12px', background: done ? T.greenLight : T.bgSubtle,
                  borderRadius:R.md, marginBottom:6,
                }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color: done ? T.green : T.text }}>
                      {done ? '✓ ' : ''}{t.nome}
                    </div>
                    <div style={{ fontSize:11, color:T.textSoft, marginTop:2 }}>
                      {done ? `Fatto ${FmtDt(done.eseguito_at)}${done.operatore ? ' da ' + done.operatore : ''}` : 'Ancora da fare'}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => eseguiTpl(t.id)}
                      style={{ height:32, padding:'0 12px', borderRadius:R.md, border:'none', background: done ? T.bgCard : T.text, color: done ? T.textMid : '#FFF', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      {done ? 'Ripeti' : 'Segna fatto'}
                    </button>
                    <button onClick={() => rimuoviTpl(t.id)}
                      style={{ height:32, padding:'0 10px', borderRadius:R.md, border:`1px solid ${T.borderSoft}`, background:'transparent', color:T.textSoft, fontSize:11, cursor:'pointer' }}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {tpl.length === 0 && (
        <div style={card}>
          <div style={{ textAlign:'center', padding:'24px 16px', color:T.textSoft, fontSize:13 }}>
            Nessuna checklist configurata. Aggiungi i tuoi task di pulizia sopra (es. "Pulizia banco lavoro", "Sanificazione affettatrice", "Lavaggio piano cottura").
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab Allergeni ────────────────────────────────────────────────────────────
function AllergeniTab({ ricettario, isMobile }) {
  const ricette = useMemo(() => Object.values(ricettario?.ricette || {}), [ricettario])
  const card = { background:T.bgCard, borderRadius:R.xl, padding:'18px 20px', border:`1px solid ${T.border}`, marginBottom:16, boxShadow:S.sm }
  const sintesi = useMemo(() => {
    const map = {}
    for (const r of ricette) {
      for (const a of (r.allergeni || [])) {
        map[a] = (map[a] || 0) + 1
      }
    }
    return map
  }, [ricette])

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:8 }}>📊 Sintesi allergeni nel ricettario</div>
        <div style={{ fontSize:12, color:T.textSoft, marginBottom:14 }}>
          Reg. UE 1169/2011 — informazioni obbligatorie sugli allergeni.
        </div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(2,1fr)':'repeat(auto-fill, minmax(180px, 1fr))', gap:10 }}>
          {ALLERGENI.map(a => {
            const count = sintesi[a.id] || 0
            return (
              <div key={a.id} style={{
                padding:'12px 14px', background: count > 0 ? T.brandLight : T.bgSubtle,
                borderRadius:R.md, border:`1px solid ${count > 0 ? T.brandSoft : T.borderSoft}`,
              }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em' }}>{a.label}</div>
                <div style={{ fontSize:18, fontWeight:800, color: count > 0 ? T.brand : T.textSoft, marginTop:4, fontVariantNumeric:'tabular-nums' }}>
                  {count} {count === 1 ? 'ricetta' : 'ricette'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:6 }}>📋 Matrice allergeni × prodotti</div>
        <div style={{ fontSize:11, color:T.textSoft, marginBottom:10, lineHeight:1.45 }}>
          Riga: allergene · Colonna: prodotto · "●" = presente. Scorri orizzontalmente se ci sono molti prodotti.
        </div>
        {ricette.length === 0 ? (
          <div style={{ padding:14, color:T.textSoft, fontSize:12, textAlign:'center' }}>
            Nessuna ricetta nel ricettario.
          </div>
        ) : (
          <div style={{ overflowX:'auto', border:`1px solid ${T.borderSoft}`, borderRadius:R.md }}>
            <table style={{ borderCollapse:'collapse', fontSize:10, tableLayout:'fixed' }}>
              <colgroup>
                <col style={{ width: 150 }}/>
                {ricette.map(r => <col key={r.nome} style={{ width: 36 }}/>)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ padding:'4px 8px', textAlign:'left', fontSize:9, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', background:T.bgSubtle, borderBottom:`1px solid ${T.borderSoft}`, position:'sticky', left:0, zIndex:2 }}>
                    Allergene \ Prodotto
                  </th>
                  {ricette.map(r => (
                    <th key={r.nome}
                      title={r.nome}
                      style={{
                        padding:'4px 2px', fontSize:9, fontWeight:700, color:T.text,
                        background:T.bgSubtle, borderBottom:`1px solid ${T.borderSoft}`,
                        borderLeft:`1px solid ${T.borderSoft}`,
                        height: 96, verticalAlign:'bottom', whiteSpace:'nowrap',
                      }}>
                      <div style={{
                        transform:'rotate(-60deg)', transformOrigin:'left bottom',
                        width: 24, overflow:'visible', textAlign:'left',
                        lineHeight: 1, paddingLeft: 8,
                      }}>
                        {r.nome.length > 16 ? r.nome.slice(0, 14) + '…' : r.nome}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALLERGENI.map(a => {
                  const ricetteCol = ricette.map(r => (r.allergeni || []).includes(a.id))
                  const totale = ricetteCol.filter(Boolean).length
                  if (totale === 0) return null // riga vuota: omessa per compattezza
                  return (
                    <tr key={a.id}>
                      <td style={{
                        padding:'4px 8px', color:T.text, fontWeight:600, fontSize:10,
                        background:T.bgCard, borderBottom:`1px solid ${T.borderSoft}`,
                        position:'sticky', left:0, zIndex:1, whiteSpace:'nowrap',
                      }}>
                        <span style={{ marginRight:4 }}>{a.emoji || '⚠️'}</span>{a.label}
                        <span style={{ marginLeft:6, color:T.textSoft, fontWeight:500 }}>({totale})</span>
                      </td>
                      {ricetteCol.map((presente, i) => (
                        <td key={i} title={`${ricette[i].nome} · ${a.label}: ${presente ? 'presente' : 'assente'}`}
                          style={{
                            textAlign:'center',
                            background: presente ? T.brandLight : T.bgCard,
                            color: presente ? T.brand : T.borderSoft,
                            fontWeight: 700, fontSize: 11, lineHeight: 1,
                            padding:'4px 0',
                            borderLeft:`1px solid ${T.borderSoft}`,
                            borderBottom:`1px solid ${T.borderSoft}`,
                          }}>
                          {presente ? '●' : ''}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {ALLERGENI.every(a => !ricette.some(r => (r.allergeni || []).includes(a.id))) && (
                  <tr>
                    <td colSpan={ricette.length + 1} style={{ padding:14, color:T.textSoft, fontSize:12, textAlign:'center' }}>
                      Nessun allergene rilevato in nessuna ricetta.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab Export PDF ───────────────────────────────────────────────────────────
function ExportTab({ orgId, sedeId, nomeAttivita, isMobile, notify }) {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => todayLocal())
  const [busy, setBusy] = useState(false)

  async function esporta() {
    setBusy(true)
    try {
      const fromD = new Date(from + 'T00:00:00')
      const toD   = new Date(to   + 'T23:59:59')

      const [temp, log, app, tpl] = await Promise.all([
        supabase.from('haccp_temperature').select('*, haccp_apparecchi(nome)')
          .eq('organization_id', orgId)
          .gte('rilevato_at', fromD.toISOString())
          .lte('rilevato_at', toD.toISOString())
          .order('rilevato_at'),
        supabase.from('haccp_checklist_log').select('*, haccp_checklist_template(nome, frequenza)')
          .eq('organization_id', orgId)
          .gte('eseguito_at', fromD.toISOString())
          .lte('eseguito_at', toD.toISOString())
          .order('eseguito_at'),
        supabase.from('haccp_apparecchi').select('*').eq('organization_id', orgId),
        supabase.from('haccp_checklist_template').select('*').eq('organization_id', orgId),
      ])

      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF()
      const W = 210, M_L = 14
      const RED = [110, 14, 26]
      const GRAY = [120, 120, 120]

      // ── Header ──
      doc.setFillColor(...RED); doc.rect(0, 0, W, 24, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
      doc.text('REGISTRO HACCP', M_L, 14)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.text(nomeAttivita || '', M_L, 20)
      doc.text(new Date().toLocaleDateString('it-IT'), W - M_L, 14, { align: 'right' })
      doc.setFontSize(8)
      doc.text(`Periodo: ${FmtDate(fromD)} – ${FmtDate(toD)}`, W - M_L, 20, { align: 'right' })

      let y = 36
      doc.setTextColor(0); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
      doc.text('1. Apparecchi monitorati', M_L, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Apparecchio', 'Tipo', 'Range temperatura']],
        body: (app.data || []).map(a => [a.nome, a.tipo, `${a.temp_min}°C – ${a.temp_max}°C`]),
        headStyles: { fillColor: RED, textColor: [255,255,255], fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        margin: { left: M_L, right: M_L },
      })
      y = doc.lastAutoTable.finalY + 10

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text('2. Rilevazioni temperature', M_L, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Data/ora', 'Apparecchio', 'Temp °C', 'Operatore', 'Note', 'Stato']],
        body: (temp.data || []).map(r => [
          FmtDt(r.rilevato_at),
          r.haccp_apparecchi?.nome || '—',
          String(r.temperatura),
          r.operatore || '—',
          r.note || '',
          r.fuori_range ? '⚠ FUORI RANGE' : 'OK',
        ]),
        headStyles: { fillColor: RED, textColor: [255,255,255], fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        margin: { left: M_L, right: M_L },
        didParseCell: d => { if (d.row.index >= 0 && d.column.index === 5 && d.cell.raw === '⚠ FUORI RANGE') d.cell.styles.textColor = RED },
      })
      y = doc.lastAutoTable.finalY + 10

      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text('3. Pulizie e sanificazioni', M_L, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Data/ora', 'Task', 'Frequenza', 'Operatore']],
        body: (log.data || []).map(l => [
          FmtDt(l.eseguito_at),
          l.haccp_checklist_template?.nome || '—',
          l.haccp_checklist_template?.frequenza || '—',
          l.operatore || '—',
        ]),
        headStyles: { fillColor: RED, textColor: [255,255,255], fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        margin: { left: M_L, right: M_L },
      })

      // ── Firme + disclaimer ──
      const lastY = doc.lastAutoTable.finalY + 14
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0)
      doc.line(M_L, lastY + 14, M_L + 70, lastY + 14)
      doc.line(W - M_L - 70, lastY + 14, W - M_L, lastY + 14)
      doc.text('Responsabile HACCP', M_L, lastY + 19)
      doc.text('Operatore', W - M_L - 70, lastY + 19)

      doc.setTextColor(...GRAY); doc.setFontSize(7)
      const disclaimer = 'Questo registro è uno strumento di supporto alla gestione HACCP. La conformità normativa richiede la valutazione di un tecnico HACCP certificato. Verificare sempre etichette, schede tecniche fornitori e procedure interne.'
      const lines = doc.splitTextToSize(disclaimer, W - M_L * 2)
      doc.text(lines, M_L, 285)

      doc.save(`registro_haccp_${from}_${to}.pdf`)
      notify?.('✓ PDF generato')
    } catch (e) {
      console.error(e); notify?.('⚠ Errore export: ' + e.message, false)
    } finally { setBusy(false) }
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile?16:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const card = { background:T.bgCard, borderRadius:R.xl, padding:'18px 20px', border:`1px solid ${T.border}`, marginBottom:16, boxShadow:S.sm }

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:8 }}>📄 Export "Registro HACCP" (PDF)</div>
        <div style={{ fontSize:12, color:T.textSoft, marginBottom:16 }}>
          Genera un PDF formattato pronto per la consultazione da ispezione ASL. Include apparecchi, rilevazioni temperature, pulizie e disclaimer normativo.
        </div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'1fr 1fr auto', gap:10, alignItems:'end' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Dal</div>
            <input style={inp} type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Al</div>
            <input style={inp} type="date" value={to} onChange={e=>setTo(e.target.value)}/>
          </div>
          <button onClick={esporta} disabled={busy}
            style={{ height:44, padding:'0 22px', borderRadius:R.md, border:'none', background:T.brand, color:'#FFF', fontSize:14, fontWeight:800, cursor: busy?'not-allowed':'pointer', boxShadow:`0 4px 12px ${T.brand}44`, whiteSpace:'nowrap' }}>
            {busy ? 'Generazione…' : 'Scarica PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── View principale ──────────────────────────────────────────────────────────
export default function HaccpView({ orgId, sedeId, ricettario, nomeAttivita, notify }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('temperature')

  const TABS = [
    ['temperature', '🌡️ Temperature'],
    ['pulizie',     '🧽 Pulizie'],
    ['allergeni',   '⚠️ Allergeni'],
    ['export',      '📄 Export PDF'],
  ]

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: isMobile ? 16 : 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5 }}>
          Registro HACCP — temperature, pulizie e allergeni. Strumento di supporto per ispezioni ASL.
        </p>
      </div>

      <div style={{
        padding: '10px 14px', background: '#FFF8EB', border: '1px solid #FCD34D',
        borderRadius: R.md, marginBottom: 16, fontSize: 12, color: '#92400E', lineHeight: 1.5,
      }}>
        <strong>⚠ Disclaimer:</strong> Questo registro è uno strumento di supporto.
        Consulta un tecnico HACCP certificato per la conformità normativa effettiva.
      </div>

      <div style={{ display:'flex', gap:2, marginBottom: isMobile?16:20, borderBottom:`1px solid ${T.border}`, overflowX:'auto' }}>
        {TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer',
              fontSize:13, fontWeight: tab===id?600:500, color: tab===id?T.text:T.textSoft,
              borderBottom: tab===id?`2px solid ${T.brand}`:'2px solid transparent',
              marginBottom:-1, letterSpacing:'-0.005em', whiteSpace:'nowrap',
              transition:`color ${M.durFast} ${M.ease}`, fontFamily:'inherit' }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'temperature' && <TemperatureTab orgId={orgId} sedeId={sedeId} isMobile={isMobile} notify={notify}/>}
      {tab === 'pulizie'     && <PulizieTab     orgId={orgId} sedeId={sedeId} isMobile={isMobile} notify={notify}/>}
      {tab === 'allergeni'   && <AllergeniTab   ricettario={ricettario} isMobile={isMobile}/>}
      {tab === 'export'      && <ExportTab      orgId={orgId} sedeId={sedeId} nomeAttivita={nomeAttivita} isMobile={isMobile} notify={notify}/>}
    </div>
  )
}
