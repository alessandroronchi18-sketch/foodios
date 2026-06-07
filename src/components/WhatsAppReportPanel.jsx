// WhatsAppReportPanel — Impostazioni → WhatsApp
// Permette al titolare di configurare il numero per ricevere il report serale
// alle 22:00 con KPI giornalieri. Se nessun numero è impostato, il cron salta.
//
// API usate:
//   - update organizations.telefono_whatsapp (via supabase client)
//   - POST /api/whatsapp-test (invia messaggio di prova)

import React, { useEffect, useState } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/apiFetch'
import { color as T, radius as R, shadow as S } from '../lib/theme'

const PREFISSI = [
  { code: '+39',  label: 'Italia' },
  { code: '+378', label: 'San Marino' },
  { code: '+377', label: 'Monaco' },
  { code: '+33',  label: 'Francia' },
  { code: '+34',  label: 'Spagna' },
  { code: '+41',  label: 'Svizzera' },
  { code: '+49',  label: 'Germania' },
  { code: '+44',  label: 'Regno Unito' },
]

function splitPhone(full) {
  if (!full) return { prefisso: '+39', numero: '' }
  const f = full.replace(/^whatsapp:/, '').trim()
  const match = PREFISSI.find(p => f.startsWith(p.code))
  if (match) return { prefisso: match.code, numero: f.slice(match.code.length).replace(/\D/g, '') }
  return { prefisso: '+39', numero: f.replace(/\D/g, '') }
}

export default function WhatsAppReportPanel({ org, orgId, notify, onRefresh }) {
  const init = splitPhone(org?.telefono_whatsapp)
  const [prefisso, setPrefisso] = useState(init.prefisso)
  const [numero, setNumero]     = useState(init.numero)
  const [saving, setSaving]     = useState(false)
  const [testing, setTesting]   = useState(false)
  const [open, setOpen]         = useState(false)

  useEffect(() => {
    const s = splitPhone(org?.telefono_whatsapp)
    setPrefisso(s.prefisso); setNumero(s.numero)
  }, [org?.telefono_whatsapp])

  async function salva() {
    setSaving(true)
    try {
      const full = numero ? `${prefisso}${numero}` : null
      const { error } = await supabase.from('organizations').update({
        telefono_whatsapp: full,
      }).eq('id', orgId)
      if (error) throw error
      notify?.(full ? '✓ Numero salvato — riceverai il report alle 22:00' : '✓ Report WhatsApp disattivato')
      onRefresh?.()
    } catch (e) { notify?.(e.message, false) }
    finally { setSaving(false) }
  }

  async function disattiva() {
    if (!confirm('Disattivare il report WhatsApp serale?')) return
    setNumero('')
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({ telefono_whatsapp: null }).eq('id', orgId)
      if (error) throw error
      notify?.('✓ Report disattivato')
      onRefresh?.()
    } catch (e) { notify?.(e.message, false) }
    finally { setSaving(false) }
  }

  async function inviaTest() {
    setTesting(true)
    try {
      await apiFetch('/api/whatsapp-test', { method: 'POST' })
      notify?.('✓ Messaggio di test inviato — controlla WhatsApp')
    } catch (e) { notify?.(e.message, false) }
    finally { setTesting(false) }
  }

  const card = { background:T.bgCard, borderRadius:R.xl, padding:'24px 28px', border:`1px solid ${T.border}`, boxShadow:S.sm, marginBottom:20 }
  const inp = { width:'100%', height:40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize:13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }

  const isAttivo = !!org?.telefono_whatsapp

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:240 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><Icon name="chat" size={16} />Report serale WhatsApp</div>
          <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.55 }}>
            Ogni sera alle 22:00 riceverai un messaggio con: ricavi del giorno, food cost %,
            margine, prodotto top e prodotto da rivedere.
          </div>
        </div>
        <span style={{
          padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700,
          background: isAttivo ? T.greenLight : T.bgSubtle,
          color: isAttivo ? T.green : T.textSoft,
        }}>
          {isAttivo ? '● Attivo' : '○ Non attivo'}
        </span>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
        Numero WhatsApp del titolare
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:12, position:'relative' }}>
        <button type="button" onClick={() => setOpen(o=>!o)}
          style={{ height:40, padding:'0 12px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, fontSize:14, fontWeight:600, color:T.text, cursor:'pointer', display:'flex', alignItems:'center', gap:8, minWidth:96 }}>
          <span>{prefisso}</span>
        </button>
        <input style={{ ...inp, flex:1 }} type="tel" inputMode="numeric" maxLength={15}
          placeholder="333 1234567"
          value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}/>
        {open && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50,
            background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:R.md,
            boxShadow:S.lg, minWidth:220, maxHeight:240, overflowY:'auto',
          }}>
            {PREFISSI.map(p => (
              <button key={p.code} type="button"
                onMouseDown={e => { e.preventDefault(); setPrefisso(p.code); setOpen(false) }}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 12px', background:p.code===prefisso?T.bgSubtle:'transparent', border:'none', cursor:'pointer', fontSize:13, color:T.text, textAlign:'left', fontFamily:'inherit' }}>
                <span style={{ fontWeight:600, minWidth:48 }}>{p.code}</span>
                <span style={{ color:T.textSoft }}>{p.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize:11, color:T.textSoft, marginBottom:16, lineHeight:1.5 }}>
        Useremo questo numero solo per il report serale automatico. Se lo lasci vuoto, il cron non parte.
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={salva} disabled={saving}
          style={{ height:40, padding:'0 18px', borderRadius:R.md, border:'none', background:T.brand, color:'#FFF', fontSize:13, fontWeight:800, cursor: saving?'not-allowed':'pointer' }}>
          {saving ? '…' : 'Salva numero'}
        </button>
        <button onClick={inviaTest} disabled={testing || !isAttivo}
          style={{ height:40, padding:'0 18px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, color:T.text, fontSize:13, fontWeight:700, cursor: (testing||!isAttivo)?'not-allowed':'pointer', opacity: !isAttivo ? 0.5 : 1 }}>
          {testing ? 'Invio…' : <><Icon name="upload" size={14} style={{ marginRight:6 }} />Invia messaggio di test</>}
        </button>
        {isAttivo && (
          <button onClick={disattiva} disabled={saving}
            style={{ height:40, padding:'0 14px', borderRadius:R.md, border:`1px solid ${T.borderSoft}`, background:'transparent', color:T.textMid, fontSize:12, cursor:'pointer' }}>
            Disattiva report
          </button>
        )}
      </div>

      <div style={{ marginTop:18, padding:'12px 14px', background:T.bgSubtle, borderRadius:R.md, fontSize:11, color:T.textMid, lineHeight:1.6 }}>
        <strong>Nota tecnica:</strong> per la prima attivazione su WhatsApp Business potrebbe essere
        necessario approvare il sender Twilio o, in sandbox, inviare prima il messaggio di
        opt-in ("join &lt;codice&gt;") al numero Twilio.
      </div>
    </div>
  )
}
