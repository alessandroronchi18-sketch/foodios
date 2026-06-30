// HACCP - pagina di DIAGNOSI → CAPISCI → AGISCI (POV proprietario).
// 1) Banda diagnosi: stato conformità (semaforo), temperature fuori range,
//    pulizie in ritardo/da fare oggi, % completamento del periodo.
// 2) Evidenza anomalie (temperature fuori range recenti, task scaduti).
// 3) Tab operative premium - la LOGICA di registrazione/salvataggio è INTATTA.
//
// NOTA LEGALE: questo è uno strumento di supporto. La conformità HACCP
// effettiva richiede valutazione di un tecnico HACCP certificato.

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { ALLERGENI } from '../lib/allergeni'
import { todayLocal } from '../lib/dateLocal'
import { KPI } from '../views/_shared'

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'
const TNUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'" }
const nfmt = (n) => Number(n || 0).toLocaleString('it-IT')

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
  if (!s) return '-'
  const d = new Date(s)
  return d.toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
}
const FmtDate = (s) => {
  if (!s) return '-'
  const d = new Date(s)
  return d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit' })
}

// Soglie temporali condivise (oggi / inizio settimana / inizio mese)
function soglieDate() {
  const oggi = new Date(); oggi.setHours(0,0,0,0)
  const inizioSettimana = new Date(oggi); inizioSettimana.setDate(oggi.getDate() - oggi.getDay())
  const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1)
  return { oggi, inizioSettimana, inizioMese }
}
function sogliaPerFreq(freq, sg) {
  return freq === 'mensile' ? sg.inizioMese : freq === 'settimanale' ? sg.inizioSettimana : sg.oggi
}

const cardStyle = { background:T.bgCard, borderRadius:R.xl, padding:'18px 20px', border:`1px solid ${T.border}`, marginBottom:16, boxShadow:SHADOW_PREMIUM }
const sectionTitle = { fontSize:15, fontWeight:700, color:T.text, marginBottom:12, display:'flex', alignItems:'center', gap:8 }

// ─── Banda diagnosi (DIAGNOSI) ──────────────────────────────────────────────────
function BandaDiagnosi({ orgId, sedeId, refreshKey, isMobile, isTablet, onVaiTab }) {
  const [d, setD] = useState(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    ;(async () => {
      const sg = soglieDate()
      // Periodo di riferimento per il completamento: ultimi 7 giorni.
      const da7gg = new Date(); da7gg.setDate(da7gg.getDate() - 7)

      const [app, tempRecenti, tpl, logRecenti] = await Promise.all([
        supabase.from('haccp_apparecchi').select('id, nome, temp_min, temp_max')
          .eq('organization_id', orgId).eq('attivo', true),
        supabase.from('haccp_temperature').select('id, temperatura, fuori_range, rilevato_at, operatore, haccp_apparecchi(nome)')
          .eq('organization_id', orgId).order('rilevato_at', { ascending:false }).limit(120),
        supabase.from('haccp_checklist_template').select('id, nome, frequenza')
          .eq('organization_id', orgId).eq('attivo', true),
        supabase.from('haccp_checklist_log').select('id, template_id, eseguito_at')
          .eq('organization_id', orgId).gte('eseguito_at', sg.inizioMese.toISOString())
          .order('eseguito_at', { ascending:false }),
      ])
      if (!alive) return

      const apparecchi = app.data || []
      const temps = tempRecenti.data || []
      const templates = tpl.data || []
      const logs = logRecenti.data || []

      // Temperature fuori range nelle ultime 24h (anomalie attive)
      const ieri = new Date(); ieri.setHours(ieri.getHours() - 24)
      const fuoriRange24h = temps.filter(t => t.fuori_range && new Date(t.rilevato_at) >= ieri)
      const fuoriRangeRecenti = temps.filter(t => t.fuori_range).slice(0, 6)

      // Pulizie: per ciascun task, è stato fatto entro la sua soglia di frequenza?
      const fattoNel = (tpId, freq) => {
        const soglia = sogliaPerFreq(freq, sg)
        return logs.find(l => l.template_id === tpId && new Date(l.eseguito_at) >= soglia)
      }
      const taskScaduti = templates.filter(t => !fattoNel(t.id, t.frequenza))
      const taskFatti = templates.length - taskScaduti.length
      // "Da fare oggi": task giornalieri non ancora eseguiti oggi
      const dailyDaFare = templates.filter(t => t.frequenza === 'giornaliera' && !fattoNel(t.id, t.frequenza))

      // % completamento periodo: media tra completamento temperature (almeno 1
      // rilevazione/apparecchio negli ultimi 7gg) e completamento pulizie (task in regola).
      const appRilevati = new Set(temps.filter(t => new Date(t.rilevato_at) >= da7gg)
        .map(t => t.haccp_apparecchi?.nome).filter(Boolean))
      const pctTemp = apparecchi.length ? Math.min(100, (appRilevati.size / apparecchi.length) * 100) : null
      const pctPulizie = templates.length ? (taskFatti / templates.length) * 100 : null
      const pctParts = [pctTemp, pctPulizie].filter(v => v !== null)
      const pctCompletamento = pctParts.length ? pctParts.reduce((s,v)=>s+v,0) / pctParts.length : null

      // Semaforo conformità: rosso se ci sono fuori range nelle 24h; ambra se
      // ci sono task scaduti o completamento < 70%; verde altrimenti.
      let stato = 'verde'
      if (fuoriRange24h.length > 0) stato = 'rosso'
      else if (taskScaduti.length > 0 || (pctCompletamento !== null && pctCompletamento < 70)) stato = 'ambra'
      // Se non c'è nessuna configurazione, stato neutro.
      const vuoto = apparecchi.length === 0 && templates.length === 0

      setD({
        nApparecchi: apparecchi.length,
        nTemplate: templates.length,
        fuoriRange24h, fuoriRangeRecenti,
        taskScaduti, dailyDaFare,
        pctCompletamento, stato, vuoto,
      })
    })()
    return () => { alive = false }
  }, [orgId, sedeId, refreshKey])

  if (!d) {
    return <div style={{ ...cardStyle, textAlign:'center', color:T.textSoft, fontSize:13, padding:32 }}>Calcolo dello stato di conformità…</div>
  }

  const SEM = {
    verde:  { c:T.green, bg:T.greenLight, lbl:'Tutto a posto', icon:'checkCircle', msg:'Continua a registrare con costanza, sei in regola.' },
    ambra:  { c:T.amber, bg:T.amberLight, lbl:'Da sistemare', icon:'clock', msg:'Hai qualcosa in ritardo o registrazioni mancanti.' },
    rosso:  { c:T.brand, bg:T.brandLight, lbl:'Da guardare subito', icon:'alert', msg:'Temperature fuori range nelle ultime 24 ore: vai a controllare.' },
    neutro: { c:T.textSoft, bg:T.bgSubtle, lbl:'Da impostare', icon:'clipboard', msg:'Aggiungi apparecchi e checklist per cominciare.' },
  }
  const sem = d.vuoto ? SEM.neutro : SEM[d.stato]

  const semaforoCol = (key) => key === d.stato ? SEM[key].c : T.borderStr

  return (
    <>
      {/* Stato conformità + semaforo */}
      <div style={{ ...cardStyle, padding: isMobile ? 16 : '18px 22px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:46, height:46, borderRadius:14, background:sem.bg, color:sem.c, flexShrink:0 }}>
          <Icon name={sem.icon} size={24} />
        </span>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.textSoft }}>Come stai messo</div>
          <div style={{ fontSize:19, fontWeight:800, color:sem.c, letterSpacing:'-0.02em', marginTop:2 }}>{sem.lbl}</div>
          <div style={{ fontSize:12.5, color:T.textMid, marginTop:3, lineHeight:1.45 }}>{sem.msg}</div>
        </div>
        {/* Semaforo grafico verde/ambra/rosso */}
        <div style={{ display:'flex', flexDirection:'column', gap:7, padding:'8px 10px', background:T.bgSubtle, borderRadius:R.lg }}>
          {['rosso','ambra','verde'].map(k => (
            <span key={k} title={SEM[k].lbl} style={{
              width:16, height:16, borderRadius:'50%',
              background: semaforoCol(k),
              boxShadow: k === d.stato ? `0 0 0 3px ${SEM[k].c}33` : 'none',
              transition:`background ${M.durFast} ${M.ease}`,
            }}/>
          ))}
        </div>
      </div>

      {/* KPI band */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16, marginBottom:16 }}>
        <KPI
          icon={<Icon name={d.fuoriRange24h.length ? 'warning' : 'snow'} size={18} />}
          label="Temperature fuori range"
          value={nfmt(d.fuoriRange24h.length)}
          color={d.fuoriRange24h.length ? T.brand : T.green}
          sub={d.fuoriRange24h.length ? 'ultime 24h · da verificare' : `ok · ${nfmt(d.nApparecchi)} apparecchi`}
          onClick={() => onVaiTab('temperature')}
        />
        <KPI
          icon={<Icon name={d.taskScaduti.length ? 'clock' : 'checkCircle'} size={18} />}
          label="Pulizie in ritardo"
          value={nfmt(d.taskScaduti.length)}
          color={d.taskScaduti.length ? T.amber : T.green}
          sub={d.dailyDaFare.length ? `${nfmt(d.dailyDaFare.length)} da fare oggi` : `${nfmt(d.nTemplate)} task in checklist`}
          onClick={() => onVaiTab('pulizie')}
        />
        <KPI
          icon={<Icon name="barChart" size={18} />}
          label="Completamento periodo"
          value={d.pctCompletamento === null ? '-' : `${Math.round(d.pctCompletamento)}%`}
          color={d.pctCompletamento === null ? T.textSoft : d.pctCompletamento >= 70 ? T.green : d.pctCompletamento >= 40 ? T.amber : T.brand}
          sub="temperature + pulizie · 7gg"
        />
      </div>

      {/* Evidenza anomalie */}
      {!d.vuoto && (d.fuoriRangeRecenti.length > 0 || d.taskScaduti.length > 0) && (
        <div style={{ ...cardStyle, borderColor: T.brandSoft }}>
          <div style={sectionTitle}><Icon name="alert" size={18} color={T.brand} />Anomalie da gestire</div>
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:14 }}>
            {/* Temperature fuori range */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                <Icon name="snow" size={13} />Temperature fuori range
              </div>
              {d.fuoriRangeRecenti.length === 0 ? (
                <div style={{ fontSize:12.5, color:T.green, display:'flex', alignItems:'center', gap:6 }}><Icon name="checkCircle" size={14} />Nessuna anomalia recente</div>
              ) : d.fuoriRangeRecenti.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'8px 12px', background:T.brandLight, borderRadius:R.md, marginBottom:6 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.haccp_apparecchi?.nome || '-'}</div>
                    <div style={{ fontSize:11, color:T.textSoft }}>{FmtDt(t.rilevato_at)}{t.operatore ? ` · ${t.operatore}` : ''}</div>
                  </div>
                  <span style={{ fontSize:14, fontWeight:800, color:T.brand, ...TNUM, whiteSpace:'nowrap', display:'inline-flex', alignItems:'center', gap:4 }}>
                    <Icon name="warning" size={13} />{nfmt(t.temperatura)}°C
                  </span>
                </div>
              ))}
            </div>
            {/* Task scaduti */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                <Icon name="clock" size={13} />Pulizie da registrare
              </div>
              {d.taskScaduti.length === 0 ? (
                <div style={{ fontSize:12.5, color:T.green, display:'flex', alignItems:'center', gap:6 }}><Icon name="checkCircle" size={14} />Tutte le pulizie sono in regola</div>
              ) : d.taskScaduti.slice(0, 6).map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'8px 12px', background:T.amberLight, borderRadius:R.md, marginBottom:6 }}>
                  <span style={{ fontSize:12.5, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>{t.nome}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:T.amber, textTransform:'uppercase', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>
                    {FREQUENZE.find(f=>f.id===t.frequenza)?.label || t.frequenza}
                  </span>
                </div>
              ))}
              {d.taskScaduti.length > 6 && (
                <div style={{ fontSize:11.5, color:T.textSoft, marginTop:4 }}>+ altri {nfmt(d.taskScaduti.length - 6)} task</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Tab Temperature ──────────────────────────────────────────────────────────
function TemperatureTab({ orgId, sedeId, isMobile, notify, onChanged }) {
  const confirmDialog = useConfirm()
  const [apparecchi, setApparecchi] = useState([])
  const [storico, setStorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddApp, setShowAddApp] = useState(false)
  const [saving, setSaving] = useState(false)
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
    if (!formApp.nome.trim()) return notify?.('Inserisci un nome', false)
    setSaving(true)
    const { error } = await supabase.from('haccp_apparecchi').insert({
      organization_id: orgId, sede_id: sedeId || null,
      nome: formApp.nome.trim(), tipo: formApp.tipo,
      temp_min: parseFloat(formApp.temp_min) || 0,
      temp_max: parseFloat(formApp.temp_max) || 0,
    })
    setSaving(false)
    if (error) return notify?.(error.message, false)
    notify?.('Apparecchio aggiunto')
    setFormApp({ nome:'', tipo:'frigo', temp_min:0, temp_max:8 })
    setShowAddApp(false)
    carica(); onChanged?.()
  }

  async function disattivaApp(id) {
    const ok = await confirmDialog({
      title: 'Disattivare apparecchio?',
      message: 'Le rilevazioni storiche restano, ma non riceverai più alert HACCP per questo apparecchio.',
      confirmLabel: 'Disattiva', cancelLabel: 'Annulla',
    })
    if (!ok) return
    await supabase.from('haccp_apparecchi').update({ attivo:false }).eq('id', id)
    carica(); onChanged?.()
  }

  async function salvaLog() {
    if (!formLog.apparecchio_id) return notify?.('Seleziona un apparecchio', false)
    if (formLog.temperatura === '') return notify?.('Inserisci la temperatura', false)
    const temp = parseFloat(formLog.temperatura)
    const app = apparecchi.find(a => a.id === formLog.apparecchio_id)
    const fuoriRange = app ? (temp < app.temp_min || temp > app.temp_max) : false
    setSaving(true)
    // Audit 2026-06-17 LOW: created_by ricavato da auth.uid() lato DB (default)
    // o esplicito qui, per audit reale (operatore campo testo libero non basta).
    let createdBy = null
    try { createdBy = (await supabase.auth.getUser()).data?.user?.id || null } catch {}
    const { error } = await supabase.from('haccp_temperature').insert({
      organization_id: orgId, sede_id: sedeId || null,
      apparecchio_id: formLog.apparecchio_id,
      temperatura: temp,
      operatore: formLog.operatore.trim() || null,
      note: formLog.note.trim() || null,
      fuori_range: fuoriRange,
      created_by: createdBy,
    })
    setSaving(false)
    if (error) return notify?.(error.message, false)
    notify?.(fuoriRange
      ? `Rilevato fuori range (${temp}°C, range ${app.temp_min}–${app.temp_max}°C)`
      : 'Temperatura registrata')
    setFormLog({ apparecchio_id:'', temperatura:'', operatore:'', note:'' })
    carica(); onChanged?.()
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile?16:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:T.textSoft }}>Caricamento…</div>

  return (
    <div>
      {/* Form rapido nuova rilevazione */}
      <div style={cardStyle}>
        <div style={sectionTitle}><Icon name="snow" size={18} color={T.brand} />Registra rilevazione</div>
        {apparecchi.length === 0 ? (
          <div style={{ padding:'14px 16px', background:T.amberLight, color:T.amber, borderRadius:R.md, fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
            <Icon name="warning" size={16} />Prima aggiungi almeno un apparecchio sotto.
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'2fr 1fr 1fr', gap:10 }}>
            <select style={inp} value={formLog.apparecchio_id}
              onChange={e => setFormLog(f => ({ ...f, apparecchio_id: e.target.value }))}>
              <option value="">- Seleziona apparecchio -</option>
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
            <button onClick={salvaLog} disabled={saving} style={{ gridColumn: isMobile?'auto':'1 / -1', height:44, padding:'0 18px', borderRadius:R.md, border:'none', background:T.brand, color:'#FFF', fontSize:14, fontWeight:800, cursor: saving?'not-allowed':'pointer', opacity: saving?0.7:1, boxShadow:`0 4px 12px ${T.brand}44` }}>
              {saving ? 'Salvataggio…' : 'Salva rilevazione'}
            </button>
          </div>
        )}
      </div>

      {/* Apparecchi */}
      <div style={cardStyle}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text, display:'flex', alignItems:'center', gap:8 }}><Icon name="snow" size={18} color={T.brand} />Apparecchi monitorati ({nfmt(apparecchi.length)})</div>
          <button onClick={() => setShowAddApp(s => !s)}
            style={{ height:34, padding:'0 14px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, color:T.text, fontSize:12, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}>
            <Icon name={showAddApp ? 'x' : 'plus'} size={13} />{showAddApp ? 'Annulla' : 'Aggiungi'}
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
            <button onClick={salvaApparecchio} disabled={saving}
              style={{ marginTop:10, height:40, padding:'0 16px', borderRadius:R.md, border:'none', background:T.text, color:'#FFF', fontSize:13, fontWeight:700, cursor: saving?'not-allowed':'pointer', opacity: saving?0.7:1 }}>
              {saving ? 'Salvataggio…' : 'Salva apparecchio'}
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
      <div style={cardStyle}>
        <div style={sectionTitle}><Icon name="clipboard" size={18} color={T.brand} />Storico recente ({nfmt(storico.length)})</div>
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
                    <td style={{ padding:'10px 14px', color:T.text, fontWeight:600 }}>{s.haccp_apparecchi?.nome || '-'}</td>
                    <td style={{ padding:'10px 14px', textAlign:'right', ...TNUM, color: s.fuori_range ? T.brand : T.text, fontWeight: s.fuori_range ? 800 : 600 }}>
                      {nfmt(s.temperatura)}°C {s.fuori_range && <Icon name="warning" size={13} />}
                    </td>
                    <td style={{ padding:'10px 14px', color:T.textSoft }}>{s.operatore || '-'}</td>
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
function PulizieTab({ orgId, sedeId, isMobile, notify, onChanged }) {
  const confirmDialog = useConfirm()
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
    notify?.('Task aggiunto')
    carica(); onChanged?.()
  }

  async function rimuoviTpl(id) {
    const ok = await confirmDialog({
      title: 'Rimuovere task pulizia?',
      message: 'Non comparira piu nel checklist HACCP. Le registrazioni storiche restano.',
      confirmLabel: 'Rimuovi', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    await supabase.from('haccp_checklist_template').update({ attivo:false }).eq('id', id)
    carica(); onChanged?.()
  }

  async function eseguiTpl(id) {
    await supabase.from('haccp_checklist_log').insert({
      organization_id: orgId, sede_id: sedeId || null,
      template_id: id, operatore: operatore.trim() || null,
    })
    notify?.('Esecuzione registrata')
    carica(); onChanged?.()
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile?16:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }

  // Logica "fatto oggi/questa settimana/questo mese" per evidenziare task ancora da fare
  const sg = soglieDate()
  function fattoNel(tpId, freq) {
    const soglia = sogliaPerFreq(freq, sg)
    return log.find(l => l.template_id === tpId && new Date(l.eseguito_at) >= soglia)
  }

  // Riepilogo conformità pulizie (mini-diagnosi locale)
  const fatti = tpl.filter(t => fattoNel(t.id, t.frequenza)).length
  const inRitardo = tpl.length - fatti

  if (loading) return <div style={{ padding:40, textAlign:'center', color:T.textSoft }}>Caricamento…</div>

  return (
    <div>
      {/* Riepilogo stato pulizie */}
      {tpl.length > 0 && (
        <div style={{ ...cardStyle, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', padding:'14px 18px' }}>
          <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:12, background: inRitardo ? T.amberLight : T.greenLight, color: inRitardo ? T.amber : T.green }}>
            <Icon name={inRitardo ? 'clock' : 'checkCircle'} size={20} />
          </span>
          <div style={{ flex:1, minWidth:160 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.text }}>
              {inRitardo ? `${nfmt(inRitardo)} pulizie in ritardo` : 'Tutte le pulizie in regola'}
            </div>
            <div style={{ fontSize:12, color:T.textSoft }}>{nfmt(fatti)} di {nfmt(tpl.length)} task completati nel periodo</div>
          </div>
          <div style={{ flex:'0 0 120px', maxWidth:160 }}>
            <div style={{ height:8, borderRadius:4, background:T.bgSubtle, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${tpl.length ? (fatti/tpl.length*100) : 0}%`, background: inRitardo ? T.amber : T.green, transition:`width ${M.durFast} ${M.ease}` }}/>
            </div>
          </div>
        </div>
      )}

      {/* Form aggiunta task */}
      <div style={cardStyle}>
        <div style={sectionTitle}><Icon name="plus" size={18} color={T.brand} />Aggiungi task pulizia</div>
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
      <div style={cardStyle}>
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
          <div key={f.id} style={cardStyle}>
            <div style={sectionTitle}>
              <Icon name="calendar" size={18} color={T.brand} />Pulizie {f.label.toLowerCase()} ({nfmt(items.length)})
            </div>
            {items.map(t => {
              const done = fattoNel(t.id, t.frequenza)
              return (
                <div key={t.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 12px', background: done ? T.greenLight : T.bgSubtle,
                  borderRadius:R.md, marginBottom:6,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                    {done
                      ? <Icon name="checkCircle" size={16} color={T.green} />
                      : <Icon name="clock" size={16} color={T.amber} />}
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color: done ? T.green : T.text }}>
                        {t.nome}
                      </div>
                      <div style={{ fontSize:11, color:T.textSoft, marginTop:2 }}>
                        {done ? `Fatto ${FmtDt(done.eseguito_at)}${done.operatore ? ' da ' + done.operatore : ''}` : 'Ancora da fare'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => eseguiTpl(t.id)}
                      style={{ height:32, padding:'0 12px', borderRadius:R.md, border:'none', background: done ? T.bgCard : T.text, color: done ? T.textMid : '#FFF', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      {done ? 'Ripeti' : 'Segna fatto'}
                    </button>
                    <button onClick={() => rimuoviTpl(t.id)} title="Rimuovi task"
                      style={{ height:32, width:32, display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:R.md, border:`1px solid ${T.borderSoft}`, background:'transparent', color:T.textSoft, cursor:'pointer' }}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {tpl.length === 0 && (
        <div style={cardStyle}>
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
      <div style={cardStyle}>
        <div style={{ ...sectionTitle, marginBottom:8 }}><Icon name="barChart" size={18} color={T.brand} />Sintesi allergeni nel ricettario</div>
        <div style={{ fontSize:12, color:T.textSoft, marginBottom:14 }}>
          Reg. UE 1169/2011 - informazioni obbligatorie sugli allergeni.
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
                <div style={{ fontSize:18, fontWeight:800, color: count > 0 ? T.brand : T.textSoft, marginTop:4, ...TNUM }}>
                  {nfmt(count)} {count === 1 ? 'ricetta' : 'ricette'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:6, display:'flex', alignItems:'center', gap:8 }}><Icon name="clipboard" size={16} color={T.brand} />Matrice allergeni × prodotti</div>
        <div style={{ fontSize:11, color:T.textSoft, marginBottom:10, lineHeight:1.45 }}>
          Riga: allergene · Colonna: prodotto · pallino = presente. Scorri orizzontalmente se ci sono molti prodotti.
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
                        {a.label}
                        <span style={{ marginLeft:6, color:T.textSoft, fontWeight:500 }}>({nfmt(totale)})</span>
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
                          {presente ? <Icon name="dot" size={8} /> : ''}
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
          r.haccp_apparecchi?.nome || '-',
          String(r.temperatura),
          r.operatore || '-',
          r.note || '',
          r.fuori_range ? 'FUORI RANGE' : 'OK',
        ]),
        headStyles: { fillColor: RED, textColor: [255,255,255], fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        margin: { left: M_L, right: M_L },
        didParseCell: d => { if (d.row.index >= 0 && d.column.index === 5 && d.cell.raw === 'FUORI RANGE') d.cell.styles.textColor = RED },
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
          l.haccp_checklist_template?.nome || '-',
          l.haccp_checklist_template?.frequenza || '-',
          l.operatore || '-',
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
      notify?.('PDF generato')
    } catch (e) {
      console.error(e); notify?.('Errore export: ' + e.message, false)
    } finally { setBusy(false) }
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile?16:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ ...sectionTitle, marginBottom:8 }}><Icon name="fileText" size={18} color={T.brand} />Export "Registro HACCP" (PDF)</div>
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
  const isTablet = useIsTablet()
  const [tab, setTab] = useState('temperature')
  const [refreshKey, setRefreshKey] = useState(0)
  const bumpDiagnosi = useCallback(() => setRefreshKey(k => k + 1), [])

  const TABS = [
    ['temperature', 'Temperature', 'snow'],
    ['pulizie',     'Pulizie',     'clipboard'],
    ['allergeni',   'Allergeni',   'warning'],
    ['export',      'Export PDF',  'fileText'],
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: isMobile ? 14 : 18 }}>
        <p style={{ margin: 0, fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5 }}>
          Tieni in ordine temperature, pulizie e allergeni. Quando arriva l'ASL hai tutto pronto da stampare.
        </p>
      </div>

      {/* DIAGNOSI: banda KPI + semaforo + anomalie */}
      {orgId && (
        <BandaDiagnosi orgId={orgId} sedeId={sedeId} refreshKey={refreshKey}
          isMobile={isMobile} isTablet={isTablet} onVaiTab={setTab} />
      )}

      <div style={{
        padding: '10px 14px', background: T.amberLight, border: `1px solid ${T.amber}55`,
        borderRadius: R.md, marginBottom: 16, fontSize: 12, color: '#92400E', lineHeight: 1.5,
      }}>
        <strong style={{ display:'inline-flex', alignItems:'center', gap:5, verticalAlign:'middle' }}><Icon name="warning" size={14} />Nota:</strong> questo è uno strumento di supporto. Per la conformità formale serve sempre il parere di un tecnico HACCP.
      </div>

      <div style={{ display:'flex', gap:2, marginBottom: isMobile?16:20, borderBottom:`1px solid ${T.border}`, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        {TABS.map(([id, lbl, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'10px 16px', minHeight: isMobile?44:40, border:'none', background:'transparent', cursor:'pointer',
              fontSize:13, fontWeight: tab===id?700:500, color: tab===id?T.brand:T.textSoft,
              borderBottom: tab===id?`2px solid ${T.brand}`:'2px solid transparent',
              marginBottom:-1, letterSpacing:'-0.005em', whiteSpace:'nowrap',
              display:'inline-flex', alignItems:'center', gap:6,
              transition:`color ${M.durFast} ${M.ease}`, fontFamily:'inherit' }}>
            {icon && <Icon name={icon} size={15} />}{lbl}
          </button>
        ))}
      </div>

      {tab === 'temperature' && <TemperatureTab orgId={orgId} sedeId={sedeId} isMobile={isMobile} notify={notify} onChanged={bumpDiagnosi}/>}
      {tab === 'pulizie'     && <PulizieTab     orgId={orgId} sedeId={sedeId} isMobile={isMobile} notify={notify} onChanged={bumpDiagnosi}/>}
      {tab === 'allergeni'   && <AllergeniTab   ricettario={ricettario} isMobile={isMobile}/>}
      {tab === 'export'      && <ExportTab      orgId={orgId} sedeId={sedeId} nomeAttivita={nomeAttivita} isMobile={isMobile} notify={notify}/>}
    </div>
  )
}
