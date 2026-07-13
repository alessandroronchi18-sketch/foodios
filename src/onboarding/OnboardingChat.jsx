// Onboarding chat - alternativa moderna al wizard.
//
// Versione MVP: il bot fa 5-6 domande in sequenza (nome, tipo attivita,
// citta, n sedi, n dipendenti, principale obiettivo). Estrae i dati con
// regole semplici + Claude per parsing libero. Salva su organizations + sedi
// + profiles. Chiama onComplete() alla fine.
//
// Usage: nel posto di OnboardingWizard, importa OnboardingChat se l'utente
// preferisce. Per ora resta come componente separato (gli utenti vedono il
// wizard standard, possono cliccare "preferisco la chat" se attiviamo
// il toggle).

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import Icon from '../components/Icon'
import useIsMobile from '../lib/useIsMobile'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

const STEPS = [
  {
    key: 'nome_attivita',
    bot: 'Cominciamo. Come si chiama la tua attività?',
    placeholder: 'Es. Pasticceria Bonfanti',
    validate: v => v.trim().length >= 2,
    fail: 'Serve almeno il nome',
  },
  {
    key: 'tipo',
    bot: (ctx) => `${ctx.nome_attivita} è una…`,
    options: [
      { label: 'Pasticceria', value: 'pasticceria' },
      { label: 'Gelateria', value: 'gelateria' },
      { label: 'Bar / caffetteria', value: 'bar' },
      { label: 'Ristorante', value: 'ristorante' },
      { label: 'Laboratorio + vendita', value: 'misto' },
    ],
  },
  {
    key: 'citta',
    bot: 'In che città?',
    placeholder: 'Es. Torino',
    validate: v => v.trim().length >= 2,
  },
  {
    key: 'sedi',
    bot: 'Quante sedi?',
    options: [
      { label: 'Una sola', value: 1 },
      { label: 'Due', value: 2 },
      { label: 'Da tre a cinque', value: 4 },
      { label: 'Più di cinque', value: 8 },
    ],
  },
  {
    key: 'dipendenti',
    bot: 'Quante persone ci lavorano? (te incluso)',
    options: [
      { label: 'Solo io', value: 1 },
      { label: 'Da 2 a 5', value: 3 },
      { label: 'Da 6 a 15', value: 10 },
      { label: 'Più di 15', value: 20 },
    ],
  },
  {
    key: 'obiettivo',
    bot: 'Ultima: a cosa ti serve di piu\', all\'inizio?',
    options: [
      { label: 'Sapere il food cost vero', value: 'food_cost' },
      { label: 'Capire dove perdo soldi', value: 'profittabilita' },
      { label: 'Tenere d\'occhio magazzino e sprechi', value: 'magazzino' },
      { label: 'Una mano sui numeri ogni giorno', value: 'ai_assistant' },
      { label: 'Crescere con i numeri in mano', value: 'crescita' },
    ],
  },
]

export default function OnboardingChat({ user, onComplete, onPreferWizard }) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState(0)
  const [ctx, setCtx] = useState({})
  const [history, setHistory] = useState([])  // [{ role: 'bot'|'user', text }]
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  // Audit 2026-07-01 HIGH: tracking setTimeout per cleanup unmount-safe.
  const timersRef = useRef([])
  useEffect(() => () => {
    for (const t of timersRef.current) { try { clearTimeout(t) } catch {} }
    timersRef.current = []
  }, [])

  // Inizializza la conversazione con intro + prima domanda
  useEffect(() => {
    if (history.length === 0) {
      const first = STEPS[0]
      setHistory([
        { role: 'bot', text: 'Ciao. Ti chiedo 5 cose per cucirti Foodos addosso. Ci mettiamo un attimo.' },
        { role: 'bot', text: typeof first.bot === 'function' ? first.bot(ctx) : first.bot },
      ])
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history])

  function answer(value, displayText) {
    const stepDef = STEPS[step]
    if (stepDef.validate && !stepDef.validate(String(value))) {
      setError(stepDef.fail || 'Risposta non valida')
      return
    }
    setError(null)
    const newCtx = { ...ctx, [stepDef.key]: value }
    const userText = displayText || String(value)
    const next = step + 1
    setCtx(newCtx)
    setHistory(h => [...h, { role: 'user', text: userText }])
    setInput('')

    if (next >= STEPS.length) {
      finalize(newCtx)
      return
    }
    const t = setTimeout(() => {
      const nextStep = STEPS[next]
      const botMsg = typeof nextStep.bot === 'function' ? nextStep.bot(newCtx) : nextStep.bot
      setHistory(h => [...h, { role: 'bot', text: botMsg }])
      setStep(next)
    }, 350)
    timersRef.current.push(t)
  }

  async function finalize(finalCtx) {
    setSaving(true); setError(null)
    setHistory(h => [...h, { role: 'bot', text: `Un attimo, imposto tutto per ${finalCtx.nome_attivita}…` }])
    try {
      // Crea organization se non c'è
      const { data: profile } = await supabase.from('profiles')
        .select('organization_id').eq('id', user.id).maybeSingle()

      let orgId = profile?.organization_id
      if (!orgId) {
        const { data: org, error: orgErr } = await supabase
          .from('organizations')
          .insert({
            nome: finalCtx.nome_attivita,
            nome_attivita: finalCtx.nome_attivita,
            tipo: finalCtx.tipo,
            citta: finalCtx.citta,
          })
          .select('id').single()
        if (orgErr) throw orgErr
        orgId = org.id
        await supabase.from('profiles').update({ organization_id: orgId, ruolo: 'titolare' }).eq('id', user.id)
      }

      // Crea sede principale
      const { data: existingSedi } = await supabase.from('sedi')
        .select('id').eq('organization_id', orgId).limit(1)
      if (!existingSedi || existingSedi.length === 0) {
        await supabase.from('sedi').insert({
          organization_id: orgId,
          nome: finalCtx.nome_attivita,
          citta: finalCtx.citta,
          is_default: true,
        })
      }

      // Salva obiettivo come user_data setting (orienta UX iniziale)
      try {
        await supabase.from('user_data').insert({
          organization_id: orgId,
          sede_id: null,
          data_key: 'onboarding-obiettivo-v1',
          data_value: { obiettivo: finalCtx.obiettivo, sedi_dichiarate: finalCtx.sedi, dipendenti_dichiarati: finalCtx.dipendenti },
        })
      } catch {}

      setHistory(h => [...h, { role: 'bot', text: 'Pronto. Entriamo.' }])
      const tDone = setTimeout(() => onComplete?.(), 1200)
      timersRef.current.push(tDone)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const current = STEPS[step]
  const isInputStep = current && !current.options
  const isLast = step >= STEPS.length

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '12px 8px' : '24px 12px' }}>
      <div style={{ width: '100%', maxWidth: 560, background: CARD, borderRadius: isMobile ? 14 : 18, boxShadow: '0 10px 40px rgba(15,23,42,0.10)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 'calc(100vh - 24px)' : '90vh' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg, ${BRAND}, #4A0612)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
            <Icon name="sparkles" size={16}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: TXT }}>Foodos · Ci conosciamo</div>
            <div style={{ fontSize: 11, color: SOFT }}>5 domande veloci, poi lavori</div>
          </div>
          {onPreferWizard && (
            <button onClick={onPreferWizard}
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: SOFT, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              Preferisco il modulo
            </button>
          )}
        </div>

        {/* Chat history */}
        <div ref={scrollRef} style={{ flex: 1, padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: 14,
                background: m.role === 'user' ? BRAND : '#F1F5F9',
                color: m.role === 'user' ? '#FFF' : TXT,
                fontSize: 14, lineHeight: 1.5,
                ...(m.role === 'user' ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', color: '#991B1B', fontSize: 12 }}>
              {error}
            </div>
          )}
          {saving && (
            <div style={{ textAlign: 'center', color: SOFT, fontSize: 12, padding: '8px 0' }}>
              Un secondo…
            </div>
          )}
        </div>

        {/* Input area */}
        {!saving && !isLast && current && (
          <div style={{ padding: 16, borderTop: `1px solid ${BORDER}` }}>
            {current.options ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {current.options.map(opt => (
                  <button key={opt.value} onClick={() => answer(opt.value, opt.label)}
                    style={{ padding: '14px 16px', minHeight: 48, background: '#FFF', border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: TXT, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.color = BRAND }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TXT }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <label htmlFor="obc-input" style={{ position: 'absolute', left: '-9999px' }}>
                  {current.placeholder || 'Risposta'}
                </label>
                <input id="obc-input" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && input.trim()) answer(input) }}
                  placeholder={current.placeholder || ''}
                  aria-label={current.placeholder || 'Risposta'}
                  style={{ flex: 1, minWidth: 0, padding: '12px 14px', minHeight: 48, borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 16, color: TXT, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  autoFocus
                />
                <button onClick={() => answer(input)} disabled={!input.trim()}
                  style={{ background: input.trim() ? BRAND : '#CBD5E1', color: '#FFF', border: 'none', padding: '12px 18px', minHeight: 48, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: input.trim() ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  Invia <Icon name="chevR" size={12}/>
                </button>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 10.5, color: SOFT, textAlign: 'center' }}>
              {step + 1} / {STEPS.length}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
