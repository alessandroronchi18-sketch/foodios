// WhatsAppReportPanel - Impostazioni → WhatsApp
// Il titolare lascia qui il numero su cui vuole il riepilogo della sera.
// Senza numero non parte niente.
//
// API usate:
//   - update organizations.telefono_whatsapp (via supabase client)
//   - POST /api/whatsapp-test (invia messaggio di prova)

import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/apiFetch'
import { color as T, radius as R, shadow as S, ui3, ui } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

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

// Un numero di cellulare, in Italia e nei paesi qui accanto, sta fra 6 e 13
// cifre dopo il prefisso. Non serve di più: serve non far salvare "1".
function numeroPlausibile(numero) {
  const cifre = String(numero || '').replace(/\D/g, '')
  return cifre.length >= 6 && cifre.length <= 13
}

function splitPhone(full) {
  if (!full) return { prefisso: '+39', numero: '' }
  const f = full.replace(/^whatsapp:/, '').trim()
  const match = PREFISSI.find(p => f.startsWith(p.code))
  if (match) return { prefisso: match.code, numero: f.slice(match.code.length).replace(/\D/g, '') }
  return { prefisso: '+39', numero: f.replace(/\D/g, '') }
}

export default function WhatsAppReportPanel({ org, orgId, notify, onRefresh }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const init = splitPhone(org?.telefono_whatsapp)
  const [prefisso, setPrefisso] = useState(init.prefisso)
  const [numero, setNumero]     = useState(init.numero)
  const [saving, setSaving]     = useState(false)
  const [testing, setTesting]   = useState(false)
  const [open, setOpen]         = useState(false)
  const prefissoRef = useRef(null)

  // La tendina dei prefissi restava aperta: cliccando fuori non si chiudeva e
  // copriva il campo del numero. Ora si chiude col clic fuori e con Esc.
  useEffect(() => {
    if (!open) return
    const fuori = (e) => { if (!prefissoRef.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuori)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => {
    const s = splitPhone(org?.telefono_whatsapp)
    setPrefisso(s.prefisso); setNumero(s.numero)
  }, [org?.telefono_whatsapp])

  async function salva() {
    if (numero && !numeroPlausibile(numero)) {
      notify?.('Questo numero mi sembra corto: controlla che ci siano tutte le cifre.', false)
      return
    }
    setSaving(true)
    try {
      const full = numero ? `${prefisso}${numero}` : null
      const { error } = await supabase.from('organizations').update({
        telefono_whatsapp: full,
      }).eq('id', orgId)
      if (error) throw error
      notify?.(full
        ? 'Salvato. Stasera alle 22 ti arriva il primo messaggio — se vuoi controllare subito, manda quello di prova.'
        : 'Numero tolto: alle 22 non ti scriviamo più.')
      onRefresh?.()
    } catch (e) { notify?.(e.message, false) }
    finally { setSaving(false) }
  }

  async function disattiva() {
    const ok = await confirmDialog({
      title: 'Non mandare più il riepilogo della sera?',
      message: 'Tolgo il numero e alle 22 non ti arriva più niente. Puoi rimetterlo quando vuoi.',
      confirmLabel: 'Non mandarlo più', cancelLabel: 'Annulla',
    })
    if (!ok) return
    setNumero('')
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({ telefono_whatsapp: null }).eq('id', orgId)
      if (error) throw error
      notify?.('Fatto: alle 22 non ti arriva più niente.')
      onRefresh?.()
    } catch (e) { notify?.(e.message, false) }
    finally { setSaving(false) }
  }

  async function inviaTest() {
    setTesting(true)
    try {
      await apiFetch('/api/whatsapp-test', { method: 'POST' })
      notify?.('Mandato. Se entro un minuto non arriva, guarda la nota qui sotto.')
    } catch (e) { notify?.(e.message, false) }
    finally { setTesting(false) }
  }

  const card = { background:T.bgCard, borderRadius:R.xl, padding: ui3(isMobile, isTablet, ui.cardPad), border:`1px solid ${T.border}`, boxShadow:S.sm, marginBottom:20 }
  const inp = { width:'100%', height: isMobile || isTablet ? 44 : 40, padding:'0 12px', border:`1px solid ${T.borderStr}`, borderRadius:R.md, fontSize: isMobile || isTablet ? 16 : 13, color:T.text, background:T.bgCard, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const btnH = isMobile || isTablet ? 44 : 40

  const isAttivo = !!org?.telefono_whatsapp

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:240 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><Icon name="chat" size={16} />Report serale WhatsApp</div>
          <div style={{ fontSize:13, color:T.textSoft, lineHeight:1.55 }}>
            Ogni sera alle 22 ti arriva un messaggio con quanto hai incassato,
            quanto ti è costata la materia prima, quanto è rimasto, il prodotto
            che è andato meglio e quello su cui conviene tornare.
          </div>
        </div>
        <span style={{
          padding:'4px 10px', borderRadius:999, fontSize: 12, fontWeight:700,
          display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
          background: isAttivo ? T.greenLight : T.bgSubtle,
          color: isAttivo ? T.green : T.textSoft,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
            background: isAttivo ? T.green : T.textFaint }} />
          {isAttivo ? 'Attivo' : 'Non attivo'}
        </span>
      </div>

      <label htmlFor="wa-report-numero" style={{ display:'block', fontSize: 12, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
        Numero WhatsApp del titolare
      </label>
      <div ref={prefissoRef} style={{ display:'flex', gap:8, marginBottom:12, position:'relative' }}>
        <button type="button" onClick={() => setOpen(o=>!o)}
          aria-expanded={open} aria-haspopup="listbox" aria-label={`Prefisso ${prefisso}, cambia paese`}
          style={{ height: btnH, padding:'0 12px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, fontSize:14, fontWeight:600, color:T.text, cursor:'pointer', display:'flex', alignItems:'center', gap:8, minWidth:96 }}>
          <span>{prefisso}</span>
        </button>
        <input id="wa-report-numero" style={{ ...inp, flex:1 }} type="tel" inputMode="numeric" maxLength={15}
          placeholder="333 1234567"
          value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}/>
        {open && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50,
            background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:R.md,
            boxShadow:S.lg, minWidth:220, maxHeight:240, overflowY:'auto',
          }} role="listbox">
            {PREFISSI.map(p => (
              <button key={p.code} type="button" role="option" aria-selected={p.code === prefisso}
                onMouseDown={e => { e.preventDefault(); setPrefisso(p.code); setOpen(false) }}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 12px', background:p.code===prefisso?T.bgSubtle:'transparent', border:'none', cursor:'pointer', fontSize:13, color:T.text, textAlign:'left', fontFamily:'inherit' }}>
                <span style={{ fontWeight:600, minWidth:48 }}>{p.code}</span>
                <span style={{ color:T.textSoft }}>{p.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color:T.textSoft, marginBottom:16, lineHeight:1.5 }}>
        Questo numero lo usiamo solo per il messaggio della sera, per niente altro. Se lo lasci vuoto, non ti scriviamo.
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={salva} disabled={saving}
          style={{ height: btnH, padding:'0 18px', borderRadius:R.md, border:'none', background:T.brand, color:'#FFF', fontSize:13, fontWeight:800, cursor: saving?'not-allowed':'pointer' }}>
          {saving ? 'Salvo…' : 'Salva numero'}
        </button>
        <button onClick={inviaTest} disabled={testing || !isAttivo}
          style={{ height: btnH, padding:'0 18px', borderRadius:R.md, border:`1px solid ${T.borderStr}`, background:T.bgCard, color:T.text, fontSize:13, fontWeight:700, cursor: (testing||!isAttivo)?'not-allowed':'pointer', opacity: !isAttivo ? 0.5 : 1 }}>
          {testing ? 'Invio…' : <><Icon name="upload" size={14} style={{ marginRight:6 }} />Invia messaggio di test</>}
        </button>
        {isAttivo && (
          <button onClick={disattiva} disabled={saving}
            style={{ height: btnH, padding:'0 14px', borderRadius:R.md, border:`1px solid ${T.borderSoft}`, background:'transparent', color:T.textMid, fontSize:12, cursor:'pointer' }}>
            Non mandarlo più
          </button>
        )}
      </div>

      <div style={{ marginTop:18, padding:'12px 14px', background:T.bgSubtle, borderRadius:R.md, fontSize: 12, color:T.textMid, lineHeight:1.6 }}>
        <strong>La prima volta:</strong> WhatsApp non lascia scrivere a un numero che non ha
        mai risposto. Manda il messaggio di prova qui sopra: se non arriva entro
        un minuto scrivici e lo sblocchiamo noi — è una pratica da fare una volta sola.
      </div>
    </div>
  )
}
