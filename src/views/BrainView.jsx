// FoodOS Brain (C1) - Chat conversazionale dedicata
//
// L'utente parla con un assistente AI che conosce il contesto della sua
// attività (nome, sedi, ricettario, P&L, scadenze). Memoria persistente
// su public.brain_conversations.
//
// MVP: contesto via system prompt con snapshot KPI base, no tool-use
// avanzato. V2: tool-use per query SQL dirette + generazione PDF.

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload } from '../lib/storage'
import { callAi } from '../lib/aiClient'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

export default function BrainView({ orgId, sedeId, user, nomeAttivita }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [conversazioni, setConversazioni] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [contextSummary, setContextSummary] = useState(null)
  const scrollRef = useRef(null)

  // Carica conversazioni esistenti
  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('brain_conversations')
        .select('id, titolo, ultimo_messaggio_at, messages')
        .eq('organization_id', orgId)
        .order('ultimo_messaggio_at', { ascending: false })
        .limit(20)
      if (!alive) return
      setConversazioni(data || [])
      if ((data || []).length > 0 && !activeId) {
        setActiveId(data[0].id)
        setMessages(data[0].messages || [])
      }
    }
    load()
    return () => { alive = false }
  }, [orgId])

  // Carica context summary (KPI base) per il system prompt
  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function loadCtx() {
      try {
        const [chiu, mag, fattRes] = await Promise.all([
          sload('pasticceria-chiusure-v1', orgId, sedeId).then(d => Array.isArray(d) ? d.slice(-30) : []),
          sload('pasticceria-magazzino-v1', orgId, sedeId),
          supabase.from('fatture').select('importo_lordo, stato, data_scadenza').eq('organization_id', orgId).neq('stato', 'pagata').limit(20),
        ])
        const totRicavi30 = chiu.reduce((s, c) => s + Number(c.kpi?.totV || c.totale || 0), 0)
        const fattureAperte = (fattRes.data || []).length
        if (alive) setContextSummary({
          nome: nomeAttivita,
          ricavi_ultimi_30gg: totRicavi30,
          n_ricette: 0,  // riempi se necessario
          mp_sotto_soglia: Object.values(mag || {}).filter(m => {
            const g = Number(m?.giacenza_g || m?.giacenza || 0)
            const s = Number(m?.soglia_min_g || m?.soglia || 0)
            return s > 0 && g <= s
          }).length,
          fatture_aperte: fattureAperte,
        })
      } catch {}
    }
    loadCtx()
    return () => { alive = false }
  }, [orgId, sedeId, nomeAttivita])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function nuovaConv() {
    setActiveId(null)
    setMessages([])
  }

  async function carica(c) {
    setActiveId(c.id)
    const { data } = await supabase
      .from('brain_conversations')
      .select('messages')
      .eq('id', c.id).single()
    setMessages(data?.messages || [])
  }

  async function manda() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMsgs = [...messages, { role: 'user', content: text }]
    setMessages(newMsgs)
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const system = `Sei FoodOS Brain, l'assistente AI personale del titolare di una pasticceria/gelateria italiana.
Conosci il contesto della sua attivita' e rispondi a domande aperte usando i dati che hai.

Contesto attivita': ${JSON.stringify(contextSummary || {})}

REGOLE:
- Italiano corrente, tono diretto e professionale ma caldo.
- Risposte brevi (max 150 parole) salvo quando l'utente chiede esplicitamente analisi profonde.
- Se non hai un dato preciso, dillo apertamente ("non ho il dato, ti consiglio di guardare in...").
- Suggerisci sempre 1 azione concreta quando possibile.
- Non inventare numeri: usa solo quelli del contesto.
- Niente emoji, niente "Buongiorno" all'inizio di ogni risposta.`

      const { text: txt } = await callAi({
        feature: 'brain-chat',
        model: 'claude-sonnet-4-6',
        system,
        messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        maxTokens: 800,
        timeoutMs: 40_000,
      })
      const finalMsgs = [...newMsgs, { role: 'assistant', content: txt }]
      setMessages(finalMsgs)

      // Persist conversation
      try {
        const titolo = (newMsgs[0]?.content || '').slice(0, 60)
        if (activeId) {
          await supabase.from('brain_conversations').update({
            messages: finalMsgs,
            ultimo_messaggio_at: new Date().toISOString(),
          }).eq('id', activeId)
        } else {
          const { data: created } = await supabase.from('brain_conversations').insert({
            organization_id: orgId,
            user_id: user?.id,
            titolo,
            messages: finalMsgs,
            ultimo_messaggio_at: new Date().toISOString(),
          }).select().single()
          if (created) {
            setActiveId(created.id)
            setConversazioni(prev => [created, ...prev])
          }
        }
      } catch (e) { console.warn('persist brain failed:', e.message) }
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: e.friendly || ('Errore: ' + e.message) }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="AI · Chat conversazionale"
        title="FoodOS Brain"
        accentText="il tuo consulente"
        subtitle="Chiedi qualsiasi cosa sui tuoi dati: ricavi, margini, scadenze. L'AI risponde in italiano usando il contesto della tua attività."
        chainOnly
        statusBadge="LIVE"
        stats={[
          { n: '3', l: 'Modelli Claude attivi' },
          { n: 'Memoria', l: 'Conversazioni persistenti' },
        ]}
      />
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '210px 1fr' : '260px 1fr', gap: isTablet ? 12 : 16, height: isMobile ? 'auto' : 'calc(100vh - 280px)', minHeight: isMobile ? '60vh' : undefined }}>
      {/* Sidebar conversazioni */}
      {!isMobile && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={nuovaConv}
            style={{ background: BRAND, color: '#FFF', border: 'none', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Icon name="plus" size={13}/> Nuova conversazione
          </button>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 8 }}>
            Precedenti
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {conversazioni.map(c => (
              <button key={c.id} onClick={() => carica(c)}
                style={{ textAlign: 'left', padding: '8px 10px', background: c.id === activeId ? '#F0F9FF' : 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: TXT }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titolo || 'Senza titolo'}</div>
                <div style={{ fontSize: 10, color: SOFT, marginTop: 2 }}>{new Date(c.ultimo_messaggio_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 500 }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, background: '#FAFAF6', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${BRAND}, #4A0612)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
            <Icon name="sparkles" size={15}/>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TXT }}>FoodOS Brain</div>
            <div style={{ fontSize: 11, color: SOFT, marginTop: 1 }}>Il tuo CFO/consulente AI personale</div>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: SOFT, fontSize: 13, padding: '40px 16px', lineHeight: 1.6 }}>
              <Icon name="lightbulb" size={28} color={SOFT}/>
              <div style={{ marginTop: 10, color: TXT, fontWeight: 600, fontSize: 14 }}>Chiedimi qualsiasi cosa sulla tua attività</div>
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.8 }}>
                Esempi:<br/>
                <em>“Perché il margine è sceso?”</em><br/>
                <em>“Cosa devo fare per arrivare a 5.000 € di margine a luglio?”</em><br/>
                <em>“Scrivi un riassunto del mese per il commercialista”</em>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                background: m.role === 'user' ? BRAND : '#F1F5F9',
                color: m.role === 'user' ? '#FFF' : TXT,
                fontSize: 14, lineHeight: 1.55,
                ...(m.role === 'user' ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
                whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: '#F1F5F9', color: SOFT, fontSize: 13, borderBottomLeftRadius: 4 }}>
                Sto pensando…
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); manda() } }}
            placeholder="Scrivi qui la tua domanda…"
            style={{ flex: 1, padding: isMobile || isTablet ? '13px 14px' : '11px 14px', minHeight: isMobile || isTablet ? 46 : 'auto', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: isMobile || isTablet ? 16 : 14, color: TXT, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}/>
          <button aria-label="Invia messaggio" onClick={manda} disabled={!input.trim() || loading}
            style={{ background: input.trim() && !loading ? BRAND : '#CBD5E1', color: '#FFF', border: 'none', padding: isMobile || isTablet ? '13px 16px' : '11px 18px', minHeight: isMobile || isTablet ? 46 : 'auto', borderRadius: 10, fontSize: isMobile || isTablet ? 14 : 13, fontWeight: 700, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Icon name="sparkles" size={14}/> {!isMobile && 'Invia'}
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}
