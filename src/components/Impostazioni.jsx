// Impostazioni — redesign 2-pane (sidebar + content) ispirato a Stripe / Linear / Notion.
//
// Migliorie rispetto al layout precedente a tab orizzontali:
//   - Categorie raggruppate semanticamente (Attività, Fatturazione, Notifiche, Sicurezza, Dati, Avanzate)
//   - Sidebar persistente con icone + label + active state
//   - Ogni sezione mostra un SOMMARIO con lo stato corrente (intelligente: "Pro · attivo", "WhatsApp non configurato")
//   - Search bar in cima per saltare a una sezione
//   - URL hash (#section=billing) per deep-link e cronologia browser
//   - Mobile: sidebar collassa in dropdown selector
//
// Tutti i sub-componenti esistenti (AbbonamentoPanel, MfaSection, ImpostazioniSedi, etc.)
// vengono usati come building blocks senza modifiche.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

import AbbonamentoPanel from './AbbonamentoPanel'
import WhatsAppReportPanel from './WhatsAppReportPanel'
import MfaSection from './Mfa'
import ImpostazioniSedi from './ImpostazioniSedi'
import ImpostazioniTv from './ImpostazioniTv'
import ExportContabilita from './ExportContabilita'
import WhiteLabel from './WhiteLabel'
import EsportaDati from './EsportaDati'
import ReferralPanel from './ReferralPanel'
import DeleteAccountModal from './DeleteAccountModal'

import { getAllRese, getStoreRese, setResaIngrediente } from '../lib/rese'

const SK_RESE = 'pasticceria-rese-v1' // stesso constant usato da Dashboard.jsx per persistere su localStorage

// ─── Icons (SVG inline, no extra deps) ───────────────────────────────────────
const Icon = ({ name, size = 16, color = 'currentColor' }) => {
  const p = {
    building:    <><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><path d="M9 22V18h6v4"/></>,
    creditCard:  <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    bell:        <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    shield:      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    database:    <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></>,
    sparkles:    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>,
    search:      <><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></>,
    chevR:       <polyline points="9 6 15 12 9 18"/>,
    chevD:       <polyline points="6 9 12 15 18 9"/>,
    check:       <polyline points="20 6 9 17 4 12"/>,
    x:           <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    user:        <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    mail:        <><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></>,
    phone:       <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>,
    tv:          <><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></>,
    chart:       <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    upload:      <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    download:    <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    pie:         <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
    palette:     <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="7" r="1"/><circle cx="17" cy="12" r="1"/><circle cx="12" cy="17" r="1"/><circle cx="7" cy="12" r="1"/></>,
    map:         <><path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></>,
    gift:        <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
    book:        <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    menu:        <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    file:        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    undo:        <><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></>,
    logout:      <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    lock:        <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  }[name] || null
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>{p}</svg>
}

// ─── Input style helper (mobile: fontSize >= 16 per evitare zoom iOS) ─────────
const mkInp = (isMobile) => ({
  width:'100%', height:40, padding:'0 12px',
  border:`1px solid ${T.borderStr}`, borderRadius:R.md,
  fontSize: isMobile ? 16 : 13, color:T.text, background:T.bgCard,
  outline:'none', boxSizing:'border-box', fontFamily:'inherit',
})
const mkBtn = (disabled) => ({
  height:40, padding:'0 18px', borderRadius:R.md, border:'none',
  background:T.brand, color:'#FFF', fontSize:13, fontWeight:700,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  whiteSpace:'nowrap',
})

// ─── Sub-componenti generale (Profilo + Account + Email report + Changelog) ──

function ProfiloSection({ auth, nomeAttivita, tipoAttivita, piano, orgId, notify }) {
  const isMobile = useIsMobile()
  const [nomeMod, setNomeMod] = useState(nomeAttivita || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setNomeMod(nomeAttivita || '') }, [nomeAttivita])

  async function salva() {
    if (!nomeMod.trim() || nomeMod === nomeAttivita) return
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({ nome: nomeMod.trim() }).eq('id', orgId)
      if (error) throw error
      await auth.refreshOrg?.()
      notify('Nome attività aggiornato')
    } catch (e) {
      notify(e.message || 'Errore', false)
    } finally { setSaving(false) }
  }

  const inp = mkInp(isMobile)
  const ro  = { ...inp, background:T.bgSubtle, color:T.textMid, display:'flex', alignItems:'center' }
  const disabled = saving || nomeMod === nomeAttivita || !nomeMod.trim()

  return (
    <SectionCard title="Profilo attività" description="Le informazioni di base usate ovunque nell'app, nelle email e nei PDF.">
      <FieldRow label="Nome attività">
        <div style={{ display:'flex', gap:8 }}>
          <input style={{ ...inp, flex:1 }} value={nomeMod} onChange={e=>setNomeMod(e.target.value)} placeholder="Pasticceria Rossi"/>
          <button onClick={salva} disabled={disabled} style={mkBtn(disabled)}>
            {saving ? '…' : 'Salva'}
          </button>
        </div>
      </FieldRow>
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:14 }}>
        <FieldRow label="Tipo attività" hint="Modificabile solo dal supporto">
          <div style={ro}>{tipoAttivita || '—'}</div>
        </FieldRow>
        <FieldRow label="Piano" hint="Cambia da Fatturazione → Abbonamento">
          <div style={ro}>
            <PianoBadge piano={piano} approvato={auth?.org?.approvato}/>
          </div>
        </FieldRow>
      </div>
    </SectionCard>
  )
}

// Cambio email reale via supabase.auth.updateUser({ email }).
// Supabase invia una mail di conferma al nuovo indirizzo (e, se configurato,
// al vecchio). Il cambio diventa effettivo solo dopo che l'utente clicca il link.
function CambioEmailForm({ auth, notify }) {
  const isMobile = useIsMobile()
  const emailCorrente = auth?.user?.email || ''
  const [nuova, setNuova] = useState('')
  const [saving, setSaving] = useState(false)
  const inp = mkInp(isMobile)

  const valida = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nuova.trim())
  const disabled = saving || !valida || nuova.trim().toLowerCase() === emailCorrente.toLowerCase()

  async function salva() {
    if (disabled) return
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: nuova.trim() })
      if (error) throw error
      notify('Ti abbiamo inviato un\'email di conferma al nuovo indirizzo. Il cambio sarà effettivo dopo la conferma.')
      setNuova('')
    } catch (e) {
      notify(e.message || 'Errore durante il cambio email', false)
    } finally { setSaving(false) }
  }

  return (
    <FieldRow label="Cambia email" hint="Richiede conferma via link">
      <div style={{ display:'flex', gap:8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <input style={{ ...inp, flex:1, minWidth: isMobile ? '100%' : 180 }} type="email" autoComplete="email"
          value={nuova} onChange={e=>setNuova(e.target.value)} placeholder="nuova@email.it"/>
        <button onClick={salva} disabled={disabled} style={{ ...mkBtn(disabled), width: isMobile ? '100%' : 'auto' }}>
          {saving ? '…' : 'Cambia email'}
        </button>
      </div>
    </FieldRow>
  )
}

// Cambio password reale via supabase.auth.updateUser({ password }).
// Validazione: lunghezza >= 8 + conferma combaciante.
function CambioPasswordForm({ notify }) {
  const isMobile = useIsMobile()
  const [pwd, setPwd] = useState('')
  const [conferma, setConferma] = useState('')
  const [saving, setSaving] = useState(false)
  const inp = mkInp(isMobile)

  const troppoCorta = pwd.length > 0 && pwd.length < 8
  const nonCombacia = conferma.length > 0 && pwd !== conferma
  const disabled = saving || pwd.length < 8 || pwd !== conferma

  async function salva() {
    if (disabled) return
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd })
      if (error) throw error
      notify('Password aggiornata')
      setPwd(''); setConferma('')
    } catch (e) {
      notify(e.message || 'Errore durante il cambio password', false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <FieldRow label="Nuova password" hint="Almeno 8 caratteri">
        <input style={{ ...inp, borderColor: troppoCorta ? T.red : T.borderStr }} type="password" autoComplete="new-password"
          value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••"/>
        {troppoCorta && <div style={{ fontSize:11, color:T.red, marginTop:5 }}>La password deve avere almeno 8 caratteri.</div>}
      </FieldRow>
      <FieldRow label="Conferma password">
        <div style={{ display:'flex', gap:8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <input style={{ ...inp, flex:1, minWidth: isMobile ? '100%' : 180, borderColor: nonCombacia ? T.red : T.borderStr }} type="password" autoComplete="new-password"
            value={conferma} onChange={e=>setConferma(e.target.value)} placeholder="••••••••"/>
          <button onClick={salva} disabled={disabled} style={{ ...mkBtn(disabled), width: isMobile ? '100%' : 'auto' }}>
            {saving ? '…' : 'Aggiorna password'}
          </button>
        </div>
        {nonCombacia && <div style={{ fontSize:11, color:T.red, marginTop:5 }}>Le due password non combaciano.</div>}
      </FieldRow>
    </div>
  )
}

// Riga read-only con l'email corrente + badge "Verificata".
function EmailCorrenteRow({ auth }) {
  const isMobile = useIsMobile()
  return (
    <FieldRow label="Email attuale">
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:T.bgSubtle, borderRadius:R.md, fontSize: isMobile ? 12 : 13, color:T.text, minWidth: 0 }}>
        <Icon name="mail" size={16} color={T.textSoft}/>
        <span style={{ flex:1, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth: 0 }} title={auth?.user?.email || ''}>{auth?.user?.email || '—'}</span>
        {auth?.user?.email_confirmed_at && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:T.green, padding:'2px 8px', borderRadius:999, background:T.greenLight, flexShrink:0 }}>
            <Icon name="check" size={12}/> Verificata
          </span>
        )}
      </div>
    </FieldRow>
  )
}

// Account TITOLARE: email attuale + cambio email + cambio password + 2FA.
function AccountSection({ auth, notify }) {
  return (
    <div>
      <SectionCard title="Account" description="L'email è quella usata per accedere a FoodOS.">
        <EmailCorrenteRow auth={auth}/>
        <CambioEmailForm auth={auth} notify={notify}/>
        <div style={{ borderTop:`1px solid ${T.borderSoft}`, margin:'18px 0' }}/>
        <CambioPasswordForm notify={notify}/>
      </SectionCard>
      <MfaSection notify={notify}/>
      <DangerZoneCard auth={auth} notify={notify}/>
    </div>
  )
}

// Zona pericolosa: cancellazione account self-service con flusso multi-step
// (motivo → alternativa → feedback → conferma typing nome). Soft-delete.
function DangerZoneCard({ auth, notify }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{
        background: '#FFF', borderRadius: R.xl, padding: '20px 24px',
        border: '1px solid #FECACA', boxShadow: S.sm, marginBottom: 16,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#991B1B', letterSpacing: '-0.01em' }}>
          Zona pericolosa
        </h3>
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>
          Cancellare l'account è reversibile per 90 giorni: contattaci entro quel termine e ripristiniamo tutto.
        </p>
        <button onClick={() => setOpen(true)}
          style={{
            padding: '9px 16px', borderRadius: R.md,
            background: '#FFF', border: '1px solid #FCA5A5',
            color: '#B91C1C', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
          Cancella account
        </button>
      </div>
      <DeleteAccountModal open={open} onClose={() => setOpen(false)} auth={auth} notify={notify}/>
    </>
  )
}

// Account DIPENDENTE: nome completo + cambio password + 2FA + esci.
// Nessuna informazione aziendale.
function DipendenteAccountSection({ auth, notify }) {
  const isMobile = useIsMobile()
  const userId = auth?.user?.id
  const [nome, setNome] = useState(auth?.profile?.nome_completo || '')
  const [saving, setSaving] = useState(false)
  const inp = mkInp(isMobile)

  useEffect(() => { setNome(auth?.profile?.nome_completo || '') }, [auth?.profile?.nome_completo])

  const disabled = saving || !nome.trim() || nome.trim() === (auth?.profile?.nome_completo || '')

  async function salvaNome() {
    if (disabled || !userId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({ nome_completo: nome.trim() }).eq('id', userId)
      if (error) throw error
      notify('Nome aggiornato')
    } catch (e) {
      notify(e.message || 'Errore', false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <SectionCard title="Il mio account" description="Gestisci i tuoi dati di accesso personali.">
        <EmailCorrenteRow auth={auth}/>
        <FieldRow label="Nome completo">
          <div style={{ display:'flex', gap:8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <input style={{ ...inp, flex:1, minWidth: isMobile ? '100%' : 180 }} value={nome} onChange={e=>setNome(e.target.value)} placeholder="Mario Rossi"/>
            <button onClick={salvaNome} disabled={disabled} style={{ ...mkBtn(disabled), width: isMobile ? '100%' : 'auto' }}>
              {saving ? '…' : 'Salva'}
            </button>
          </div>
        </FieldRow>
        <div style={{ borderTop:`1px solid ${T.borderSoft}`, margin:'18px 0' }}/>
        <CambioPasswordForm notify={notify}/>
      </SectionCard>
      <MfaSection notify={notify}/>
      <LogoutCard auth={auth} notify={notify}/>
    </div>
  )
}

// Card "Esci" — chiude la sessione via auth.signOut().
function LogoutCard({ auth, notify }) {
  const [busy, setBusy] = useState(false)
  async function esci() {
    setBusy(true)
    try { await auth?.signOut?.() }
    catch (e) { notify?.(e.message || 'Errore durante il logout', false); setBusy(false) }
  }
  return (
    <SectionCard title="Sessione" description="Esci da FoodOS su questo dispositivo.">
      <button onClick={esci} disabled={busy}
        style={{ height:40, padding:'0 18px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, color:T.red, fontSize:13, fontWeight:700, cursor: busy ? 'not-allowed':'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
        <Icon name="logout" size={15} color={T.red}/> {busy ? 'Uscita…' : 'Esci'}
      </button>
    </SectionCard>
  )
}

function ReportMensiliSection({ orgId, notify }) {
  const [enabled, setEnabled] = useState(true)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase.storage.from('reports').list(orgId, { limit: 12, sortBy:{ column:'created_at', order:'desc' } })
      .then(({ data }) => { setReports(data || []); setLoading(false) })
    supabase.from('user_data').select('data_value')
      .eq('organization_id', orgId).eq('data_key', 'report-settings-v1').is('sede_id', null).maybeSingle()
      .then(({ data }) => { if (data?.data_value?.emailReport === false) setEnabled(false) })
  }, [orgId])

  async function toggle(val) {
    setEnabled(val)
    const { error } = await supabase.from('user_data').upsert({
      organization_id: orgId, sede_id: null, data_key: 'report-settings-v1',
      data_value: { emailReport: val },
    }, { onConflict: 'organization_id,sede_id,data_key' })
    if (error) { setEnabled(!val); notify(error.message, false); return }
    notify(val ? 'Riceverai i report mensili' : 'Email report disattivata')
  }

  return (
    <SectionCard title="Report mensili via email"
      description="Ogni 1° del mese ricevi un PDF con i KPI del mese precedente, generato automaticamente da FoodOS."
      action={<Toggle checked={enabled} onChange={toggle}/>}>
      <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
        Storico report ({reports.length})
      </div>
      {loading ? (
        <div style={{ fontSize:13, color:T.textSoft }}>Caricamento…</div>
      ) : reports.length === 0 ? (
        <div style={{ padding:'14px 16px', background:T.bgSubtle, borderRadius:R.md, fontSize:12, color:T.textSoft, fontStyle:'italic' }}>
          Nessun report ancora. Il primo verrà generato il 1° del prossimo mese.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {reports.map(r => {
            const { data: urlData } = supabase.storage.from('reports').getPublicUrl(`${orgId}/${r.name}`)
            return (
              <div key={r.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:T.bgSubtle, borderRadius:R.md }}>
                <span style={{ color:T.textMid, display:'inline-flex' }}><Icon name="file" size={18}/></span>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:T.text }}>{r.name.replace('.pdf','')}</span>
                <a href={urlData?.publicUrl} download target="_blank" rel="noreferrer"
                  style={{ fontSize:12, fontWeight:700, color:T.brand, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                  <Icon name="download" size={13}/> Scarica
                </a>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

function PrezziImportSection({ onImportPrezzi }) {
  return (
    <SectionCard title="Importa prezzi ingredienti"
      description="Carica un file Excel/CSV con i prezzi degli ingredienti. Una colonna nome, una colonna prezzo €/kg. Il food cost di tutte le ricette si ricalcola automaticamente.">
      <label style={{
        display:'inline-flex', alignItems:'center', gap:10, padding:'12px 20px',
        background:'#FFFBEB', border:'1px dashed #FDE68A', borderRadius:R.md,
        cursor:'pointer', fontSize:13, fontWeight:700, color:'#92400E',
        whiteSpace:'nowrap',
      }}>
        <Icon name="upload" size={16}/>
        Carica file Excel o CSV
        <input type="file" accept=".xlsx,.xls,.csv" multiple style={{ display:'none' }}
          onChange={e => e.target.files.length && onImportPrezzi(e.target.files)}/>
      </label>
      <div style={{ marginTop:12, fontSize:12, color:T.textSoft }}>
        Suggerimento: per modificare un singolo prezzo usa <strong>Importa dati → Prezzi ingredienti</strong> con edit inline.
      </div>
    </SectionCard>
  )
}

// Audit 2026-06-21: pacchetti foto/AI extra. Cliente compra calls in più
// via Stripe Checkout one-shot. Lista i pack acquistati + saldo residuo.
function PacchettiAIPanel({ auth, notify }) {
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const orgId = auth?.org?.id

  React.useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase.from('ai_credit_packs_purchased')
      .select('*').eq('organization_id', orgId)
      .order('acquistato_il', { ascending: false })
      .then(({ data }) => setPacks(data || []))
      .finally(() => setLoading(false))
  }, [orgId])

  const totaleResidue = packs.reduce((s, p) => {
    if (p.scade_il && new Date(p.scade_il) < new Date()) return s
    return s + (p.calls_remaining || 0)
  }, 0)

  const PACKS_CATALOG = [
    { id: 'foto_50',   prezzo: '€5',  calls: 50,   per_call: '10¢', best: false },
    { id: 'foto_200',  prezzo: '€15', calls: 200,  per_call: '7,5¢', best: true },
    { id: 'foto_1000', prezzo: '€60', calls: 1000, per_call: '6¢',  best: false },
  ]

  async function compra(packType) {
    setBusy(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) throw new Error('Sessione scaduta')
      const res = await fetch('/api/buy-ai-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pack_type: packType }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Errore creazione checkout')
      window.location.href = data.url
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55, marginBottom: 18 }}>
        Hai finito le foto AI incluse nel piano? Compra un pacchetto extra. Valido 12 mesi,
        si consuma quando l'app legge scontrini, fatture, listini concorrenti, menu OCR.
      </p>

      {/* Saldo residuo */}
      <div style={{ padding: 16, background: totaleResidue > 0 ? '#F0FDF4' : '#F8FAFC', borderRadius: 12, marginBottom: 18, border: `1px solid ${totaleResidue > 0 ? '#86EFAC' : '#E2E8F0'}` }}>
        <div style={{ fontSize: 11, color: totaleResidue > 0 ? '#065F46' : '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Saldo foto AI</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: totaleResidue > 0 ? '#16A34A' : '#94A3B8', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
          {totaleResidue} foto
        </div>
      </div>

      {/* Catalogo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {PACKS_CATALOG.map(p => (
          <div key={p.id} style={{
            padding: 16, borderRadius: 12,
            background: p.best ? '#FEF2F2' : '#FFF',
            border: `2px solid ${p.best ? '#6E0E1A' : '#E2E8F0'}`,
            position: 'relative',
          }}>
            {p.best && (
              <div style={{ position: 'absolute', top: -10, right: 12, background: '#6E0E1A', color: '#FFF', padding: '2px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>
                CONSIGLIATO
              </div>
            )}
            <div style={{ fontSize: 28, fontWeight: 900, color: '#1C0A0A' }}>{p.prezzo}</div>
            <div style={{ fontSize: 13, color: '#1C0A0A', fontWeight: 700, marginTop: 4 }}>{p.calls} foto AI</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{p.per_call} a foto</div>
            <button onClick={() => compra(p.id)} disabled={busy}
              style={{
                marginTop: 14, width: '100%',
                padding: '10px 14px', borderRadius: 8,
                background: p.best ? '#6E0E1A' : '#FFF',
                color: p.best ? '#FFF' : '#6E0E1A',
                border: `1px solid #6E0E1A`,
                fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}>
              {busy ? 'Apertura…' : 'Compra'}
            </button>
          </div>
        ))}
      </div>

      {/* Storico acquisti */}
      {!loading && packs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
            Acquisti precedenti
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {packs.map(p => {
              const scaduto = p.scade_il && new Date(p.scade_il) < new Date()
              const esaurito = p.calls_remaining === 0
              return (
                <div key={p.id} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: '#F8FAFC', border: '1px solid #E2E8F0',
                  display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', fontSize: 12,
                  opacity: scaduto || esaurito ? 0.55 : 1,
                }}>
                  <div>
                    <strong>{p.calls_included} foto</strong>
                    <span style={{ color: '#64748B', marginLeft: 8 }}>€{(p.amount_paid_cents / 100).toFixed(2)}</span>
                  </div>
                  <div style={{ color: esaurito ? '#DC2626' : '#16A34A', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {esaurito ? 'esaurito' : `${p.calls_remaining}/${p.calls_included} disp.`}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: 11 }}>
                    {new Date(p.acquistato_il).toLocaleDateString('it-IT')}
                    {scaduto && ' · scaduto'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ReseSection({ notify }) {
  const isMobile = useIsMobile()
  const [rese, setRese] = useState(() => getAllRese())
  const [filtro, setFiltro] = useState('')

  function save(k, val) {
    const v = Math.max(1, Math.min(100, parseFloat(val) || 100)) / 100
    setResaIngrediente(k, v)
    try { localStorage.setItem(SK_RESE, JSON.stringify(getStoreRese())) } catch {}
    setRese(getAllRese())
    notify('Resa aggiornata')
  }
  function reset(k) {
    setResaIngrediente(k, 1.0)
    try { localStorage.setItem(SK_RESE, JSON.stringify(getStoreRese())) } catch {}
    setRese(getAllRese())
    notify('Resa ripristinata al 100%')
  }

  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile ? 16 : 13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const items = Object.entries(rese)
    .filter(([k]) => !filtro || k.includes(filtro.toLowerCase()))
    .sort(([a],[b]) => a.localeCompare(b))

  const nCustom = Object.keys(getStoreRese()).length

  return (
    <SectionCard title="Resa ingredienti"
      description="La resa indica quanta parte del peso lordo è effettivamente utilizzabile. Es. uova 85% → per 100g netti acquisti 118g lordi. FoodOS applica la resa al food cost in automatico."
      action={<span style={{ fontSize:11, fontWeight:700, color:T.textSoft, padding:'4px 10px', background:T.bgSubtle, borderRadius:999 }}>{nCustom} personalizzate</span>}>
      <input style={{ ...inp, marginBottom:14 }} value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Filtra ingrediente…"/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:8 }}>
        {items.map(([k, v]) => {
          const pct = Math.round(v * 100)
          const isCustom = getStoreRese()[k] !== undefined
          return (
            <div key={k} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'10px 12px',
              background: isCustom ? T.brandLight : T.bgSubtle,
              borderRadius:R.md,
              border:`1px solid ${isCustom ? T.brandSoft : T.borderSoft}`,
            }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text, textTransform:'capitalize', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{k}</div>
                <div style={{ fontSize:10, color: isCustom ? T.brand : T.textSoft, fontWeight:600 }}>
                  {isCustom ? 'personalizzata' : 'default'}
                </div>
              </div>
              <input type="number" min="1" max="100" defaultValue={pct} inputMode="numeric"
                onBlur={e=>save(k, e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&save(k, e.target.value)}
                style={{ width: isMobile ? 64 : 56, padding:'7px 8px', borderRadius:6, border:`1px solid ${T.borderStr}`, fontSize: isMobile ? 16 : 12, textAlign:'right', fontWeight:700, color:T.text, fontFamily:'inherit', background:T.bgCard }}/>
              <span style={{ fontSize:11, color:T.textSoft }}>%</span>
              {isCustom && (
                <button onClick={()=>reset(k)} title="Ripristina default"
                  style={{ width:24, height:24, borderRadius:6, border:`1px solid ${T.borderSoft}`, background:'transparent', color:T.textSoft, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11 }}><Icon name="undo" size={13}/></button>
              )}
            </div>
          )
        })}
        {items.length === 0 && (
          <div style={{ gridColumn:'1 / -1', textAlign:'center', padding:'24px 0', color:T.textSoft, fontSize:13 }}>
            Nessun ingrediente trovato.
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function ChangelogSection({ onChangelogOpen }) {
  return (
    <SectionCard title="Novità e changelog"
      description="Scopri le ultime funzionalità rilasciate e gli aggiornamenti di FoodOS.">
      <button onClick={onChangelogOpen}
        style={{ height:40, padding:'0 18px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, color:T.text, fontSize:13, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
        <Icon name="book" size={15}/> Vedi changelog completo
      </button>
    </SectionCard>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function SectionCard({ title, description, action, children }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      background: T.bgCard, borderRadius: R.xl,
      padding: isMobile ? '18px 16px' : '24px 28px',
      border: `1px solid ${T.border}`, boxShadow: S.sm, marginBottom: 16,
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom: description ? 6 : 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <h3 style={{ margin:0, fontSize: isMobile ? 15 : 16, fontWeight:700, color:T.text, letterSpacing:'-0.01em' }}>{title}</h3>
        {action && <div style={{ flexShrink:0 }}>{action}</div>}
      </div>
      {description && (
        <p style={{ margin:'0 0 16px', fontSize:13, color:T.textSoft, lineHeight:1.55 }}>{description}</p>
      )}
      {children}
    </div>
  )
}

function FieldRow({ label, hint, children }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: isMobile ? 'flex-start' : 'space-between',
        alignItems: isMobile ? 'flex-start' : 'baseline',
        gap: isMobile ? 2 : 8, marginBottom:6 }}>
        <label style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</label>
        {hint && <span style={{ fontSize:11, color:T.textFaint, lineHeight: 1.3 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      role="switch" aria-checked={checked}
      style={{ width:42, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative',
        background: checked ? T.brand : '#CBD5E1', transition:'background 0.18s', padding:0, flexShrink:0 }}>
      <span style={{ position:'absolute', top:3, left: checked ? 21 : 3, width:18, height:18,
        borderRadius:'50%', background:'#FFF', transition:'left 0.18s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
    </button>
  )
}

function PianoBadge({ piano, approvato }) {
  const label = ({
    trial:      { txt: 'Trial', color: T.amber,  bg: T.amberLight },
    base:       { txt: 'Base',  color: T.textMid, bg: T.bgSubtle },
    pro:        { txt: 'Pro',   color: T.green,  bg: T.greenLight },
    enterprise: { txt: 'Chain', color: T.green,  bg: T.greenLight },
  })[piano] || { txt: piano || 'Trial', color: T.textMid, bg: T.bgSubtle }
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'3px 10px', borderRadius:999,
      background: label.bg, color: label.color,
      fontSize:12, fontWeight:700,
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background: approvato ? T.green : T.amber }}/>
      {label.txt}
    </span>
  )
}

// ─── Sezioni registry ────────────────────────────────────────────────────────

function buildSezioni({ auth, nomeAttivita, tipoAttivita, piano, orgId, sedi, onImportPrezzi, notify, onChangelogOpen }) {
  // ─── DIPENDENTE: solo il proprio account, niente roba aziendale ───
  if (auth?.isDipendente) {
    return [
      {
        id: 'account', label: 'Account', icon: 'user',
        items: [
          {
            id: 'mio-account', label: 'Il mio account', icon: 'user',
            summary: auth?.user?.email,
            render: () => <DipendenteAccountSection auth={auth} notify={notify}/>,
          },
        ],
      },
    ]
  }

  // ─── TITOLARE ───
  const isPagante = auth?.org?.approvato === true && auth?.org?.stripe_subscription_id
  // White-label disponibile solo sul piano Chain (enterprise).
  const whiteLabelOk = piano === 'enterprise'

  const attivitaItems = [
    {
      id: 'profilo', label: 'Profilo azienda', icon: 'building',
      summary: nomeAttivita || '—',
      render: () => <ProfiloSection auth={auth} nomeAttivita={nomeAttivita} tipoAttivita={tipoAttivita} piano={piano} orgId={orgId} notify={notify}/>,
    },
    {
      id: 'account', label: 'Account', icon: 'user',
      summary: auth?.user?.email,
      render: () => <AccountSection auth={auth} notify={notify}/>,
    },
    {
      id: 'sedi', label: 'Sedi', icon: 'map',
      summary: `${(sedi || []).filter(s => s.attiva !== false).length} sede/i`,
      render: () => <ImpostazioniSedi orgId={orgId}/>,
    },
  ]
  if (whiteLabelOk) {
    attivitaItems.push({
      id: 'brand', label: 'Personalizzazione', icon: 'palette',
      summary: 'Logo & colori',
      render: () => <WhiteLabel orgId={orgId} piano={piano} notify={notify}/>,
    })
  }

  return [
    { id: 'attivita', label: 'Attività', icon: 'building', items: attivitaItems },
    {
      id: 'fatturazione', label: 'Abbonamento', icon: 'creditCard',
      items: [
        {
          id: 'abbonamento', label: 'Piano e abbonamento', icon: 'creditCard',
          summary: isPagante ? (piano === 'enterprise' ? 'Chain attivo' : 'Pro attivo') : 'Trial / non attivo',
          render: () => <AbbonamentoPanel org={auth?.org} notify={notify}/>,
        },
        {
          id: 'pacchetti-ai', label: 'Pacchetti foto AI', icon: 'sparkles',
          summary: 'Compra analisi AI extra per scontrini, fatture, listini',
          render: () => <PacchettiAIPanel auth={auth} notify={notify}/>,
        },
      ],
    },
    {
      id: 'notifiche', label: 'Notifiche', icon: 'bell',
      items: [
        {
          id: 'report-mensili', label: 'Report mensili email', icon: 'mail',
          summary: 'PDF il 1° di ogni mese',
          render: () => <ReportMensiliSection orgId={orgId} notify={notify}/>,
        },
        {
          id: 'whatsapp', label: 'WhatsApp serale', icon: 'phone',
          summary: auth?.org?.telefono_whatsapp ? 'Attivo · ' + auth.org.telefono_whatsapp : 'Non configurato',
          render: () => <WhatsAppReportPanel org={auth?.org} orgId={orgId} notify={notify} onRefresh={() => auth?.refreshOrg?.()}/>,
        },
        {
          id: 'tv', label: 'TV vetrina', icon: 'tv',
          summary: 'Dashboard a schermo intero per il locale',
          render: () => <ImpostazioniTv orgId={orgId} sedi={sedi || []} notify={notify}/>,
        },
      ],
    },
    {
      id: 'avanzate', label: 'Avanzate', icon: 'sparkles',
      items: [
        {
          id: 'rese', label: 'Resa ingredienti', icon: 'pie',
          summary: `${Object.keys(getStoreRese()).length} rese personalizzate`,
          render: () => <ReseSection notify={notify}/>,
        },
        {
          id: 'prezzi-import', label: 'Importa prezzi', icon: 'upload',
          summary: 'Excel / CSV',
          render: () => <PrezziImportSection onImportPrezzi={onImportPrezzi}/>,
        },
        {
          id: 'export-dati', label: 'Esporta dati', icon: 'download',
          summary: 'Backup completo / GDPR',
          render: () => <EsportaDati orgId={orgId} sedi={sedi || []} nomeAttivita={nomeAttivita}/>,
        },
        {
          id: 'contabilita', label: 'Export contabilità', icon: 'chart',
          summary: 'Per commercialista',
          render: () => <ExportContabilita orgId={orgId} sedi={sedi || []} nomeAttivita={nomeAttivita} notify={notify}/>,
        },
        {
          id: 'changelog', label: 'Changelog', icon: 'book',
          summary: 'Novità e aggiornamenti',
          render: () => <ChangelogSection onChangelogOpen={onChangelogOpen}/>,
        },
      ],
    },
    {
      id: 'altro', label: 'Altro', icon: 'gift',
      items: [
        {
          id: 'referral', label: 'Programma referral', icon: 'gift',
          summary: 'Invita altri locali e guadagna sconti',
          render: () => <SectionCard title="Programma referral" description="Invita altri locali e guadagna mesi gratuiti / sconti sul tuo abbonamento."><ReferralPanel auth={auth}/></SectionCard>,
        },
        {
          id: 'sessione', label: 'Esci', icon: 'logout',
          summary: 'Chiudi la sessione',
          render: () => <LogoutCard auth={auth} notify={notify}/>,
        },
      ],
    },
  ]
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Impostazioni(props) {
  const isMobile = useIsMobile()
  const sezioni = useMemo(() => buildSezioni(props), [props.auth, props.nomeAttivita, props.tipoAttivita, props.piano, props.orgId, props.sedi])
  const allItems = useMemo(() => sezioni.flatMap(s => s.items.map(it => ({ ...it, _group: s.label, _groupId: s.id }))), [sezioni])

  // Active item via URL hash (#section=xyz) per deep-link + back button
  const initialId = (() => {
    const h = new URLSearchParams(window.location.hash.slice(1)).get('section')
    if (h && allItems.find(i => i.id === h)) return h
    return allItems[0].id
  })()
  const [activeId, setActiveId] = useState(initialId)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const hash = new URLSearchParams()
    hash.set('section', activeId)
    if (window.location.hash !== '#' + hash.toString()) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + hash.toString())
    }
  }, [activeId])

  // Mobile state: false = mostra lista, true = mostra detail
  const [mobileDetail, setMobileDetail] = useState(false)

  function pickItem(id) {
    setActiveId(id)
    setQuery('')
    setMobileDetail(true)
    // Scroll to top of content
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  const filtered = query
    ? allItems.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        (i.summary || '').toLowerCase().includes(query.toLowerCase()) ||
        i._group.toLowerCase().includes(query.toLowerCase())
      )
    : null

  const activeItem = allItems.find(i => i.id === activeId) || allItems[0]
  const activeGroup = sezioni.find(s => s.id === activeItem._groupId)

  // ─── Sidebar ──
  function Sidebar({ inDrawer = false } = {}) {
    return (
      <div style={{
        background: T.bgCard, borderRadius: R.xl,
        border: inDrawer ? 'none' : `1px solid ${T.border}`,
        padding: '12px 8px',
        boxShadow: inDrawer ? 'none' : S.sm,
      }}>
        {sezioni.map((sec, gi) => (
          <div key={sec.id} style={{ marginBottom: gi < sezioni.length - 1 ? 12 : 0 }}>
            <div style={{
              padding: '6px 12px 8px', fontSize: 10, fontWeight: 700, color: T.textSoft,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name={sec.icon} size={12} color={T.textSoft}/> {sec.label}
            </div>
            {sec.items.map(it => {
              const active = activeId === it.id
              return (
                <button key={it.id} onClick={() => pickItem(it.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: isMobile ? '12px 14px' : '8px 12px',
                    minHeight: isMobile ? 44 : 36,
                    marginBottom: 2,
                    background: active ? T.brandLight : 'transparent',
                    border: 'none', borderRadius: R.md, cursor: 'pointer',
                    color: active ? T.brand : T.text,
                    fontSize: isMobile ? 14 : 13, fontWeight: active ? 700 : 500, textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.bgSubtle }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  <Icon name={it.icon} size={15} color={active ? T.brand : T.textSoft}/>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
                  {isMobile && <Icon name="chevR" size={14} color={T.textFaint}/>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  const isDip = props.auth?.isDipendente === true
  const isAdmin = props.auth?.isAdmin === true

  function openAdmin() {
    if (props.onOpenAdmin) props.onOpenAdmin()
    else window.location.assign('/')
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      {/* Banner admin */}
      {isAdmin && (
        <button onClick={openAdmin}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            marginBottom: 16, padding: '12px 16px', textAlign: 'left',
            background: T.brandLight, border: `1px solid ${T.brandSoft}`,
            borderRadius: R.xl, cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <span style={{ display:'inline-flex' }}><Icon name="shield" size={18} color={T.brand}/></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.brand }}>Pannello amministratore</div>
            <div style={{ fontSize: 12, color: T.textSoft }}>Clienti, KPI, MRR, errori e annunci</div>
          </div>
          <Icon name="chevR" size={16} color={T.brand}/>
        </button>
      )}

      {/* Header con search */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: 0, fontSize: 13, color: T.textSoft, lineHeight: 1.45 }}>
            {isDip ? 'Gestisci il tuo account personale.' : 'Gestisci attività, abbonamento, notifiche e dati.'}
          </p>
        </div>
        {!isDip && (
          <div style={{ position: 'relative', minWidth: isMobile ? '100%' : 280 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cerca impostazione…"
              style={{
                width: '100%', height: 40, padding: '0 12px 0 36px',
                border: `1px solid ${T.borderStr}`, borderRadius: R.md,
                fontSize: isMobile ? 16 : 13, color: T.text, background: T.bgCard, outline: 'none',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}/>
            <span style={{ position: 'absolute', left: 12, top: 12, pointerEvents: 'none' }}>
              <Icon name="search" size={15} color={T.textSoft}/>
            </span>
          </div>
        )}
      </div>

      {/* Search results (overlay) */}
      {filtered && (
        <div style={{
          background: T.bgCard, borderRadius: R.xl, border: `1px solid ${T.border}`,
          boxShadow: S.md, padding: 10, marginBottom: 16,
          maxHeight: 380, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '14px 12px', fontSize: 13, color: T.textSoft }}>
              Nessuna impostazione corrisponde a "{query}".
            </div>
          ) : (
            filtered.map(it => (
              <button key={it.id} onClick={() => pickItem(it.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 12px', margin: '2px 0',
                  background: 'transparent', border: 'none', borderRadius: R.md,
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgSubtle}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Icon name={it.icon} size={16} color={T.textSoft}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{it.label}</div>
                  <div style={{ fontSize: 11, color: T.textSoft, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it._group} · {it.summary}
                  </div>
                </div>
                <Icon name="chevR" size={14} color={T.textFaint}/>
              </button>
            ))
          )}
        </div>
      )}

      {/* Layout: con una sola voce (es. dipendente) render diretto senza sidebar */}
      {allItems.length <= 1 ? (
        <div>{activeItem.render()}</div>
      ) : !isMobile ? (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 16 }}>
            <Sidebar/>
          </div>
          <div>
            <Breadcrumb groupLabel={activeGroup?.label} itemLabel={activeItem.label}/>
            {activeItem.render()}
          </div>
        </div>
      ) : (
        // Mobile: lista voci → drill into detail
        mobileDetail ? (
          <div>
            <button onClick={() => setMobileDetail(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', marginBottom: 12,
                background: 'transparent', border: `1px solid ${T.borderStr}`,
                borderRadius: R.md, color: T.text, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <span style={{ display: 'inline-block', transform: 'rotate(180deg)', lineHeight: 0 }}>
                <Icon name="chevR" size={14} color={T.text}/>
              </span>
              Tutte le impostazioni
            </button>
            <Breadcrumb groupLabel={activeGroup?.label} itemLabel={activeItem.label}/>
            {activeItem.render()}
          </div>
        ) : (
          <Sidebar inDrawer={false}/>
        )
      )}
    </div>
  )
}

function Breadcrumb({ groupLabel, itemLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: T.textSoft }}>
      <span>Impostazioni</span>
      <span style={{ color: T.textFaint }}>›</span>
      <span>{groupLabel}</span>
      <span style={{ color: T.textFaint }}>›</span>
      <span style={{ color: T.text, fontWeight: 700 }}>{itemLabel}</span>
    </div>
  )
}
