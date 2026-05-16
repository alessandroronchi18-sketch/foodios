import React, { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'

const SYSTEM_PROMPT = `Sei l'assistente di FoodOS, un gestionale food cost per la ristorazione italiana.
Aiuta l'utente a capire come usare le funzionalità dell'app: ricettario, food cost, P&L, produzione giornaliera, cassa, magazzino, scadenzario, fornitori, personale, menù, previsioni, integrazioni delivery (Deliveroo, JustEat, Glovo), scheda allergeni, AI foto analisi ricette.

Stile: risposte brevi, concrete, in italiano. Usa elenchi puntati quando aiutano. Quando indichi una sezione, riferisciti al nome esatto della voce in sidebar (es. "Produzione", "Cassa", "Ricettario", "Food Cost", "P&L", "Magazzino", "Scadenzario", "Fornitori", "Personale", "Menù", "Previsioni", "Integrazioni", "Storico", "Calendario").

Se l'utente chiede qualcosa fuori scope (es. ricette dettagliate, consulenza fiscale), rispondi gentilmente che il tuo focus è l'uso dell'app.`

const COLORS = {
  brand: '#C0392B',
  brandDark: '#922B21',
  text: '#0F172A',
  textMid: '#475569',
  textSoft: '#94A3B8',
  bg: '#FFFFFF',
  bgSoft: '#F8FAFC',
  border: '#E2E8F0',
  bubbleUser: '#C0392B',
  bubbleAI: '#F1F5F9',
}

function ChatIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function CloseIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function SendIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

export default function AIAssistant() {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Ciao! Sono l\'assistente di FoodOS. Posso aiutarti a capire come usare l\'app — chiedi pure 😊' }
  ])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (open && !isMobile) {
      const t = setTimeout(() => inputRef.current?.focus(), 200)
      return () => clearTimeout(t)
    }
  }, [open, isMobile])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const apiMessages = next.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        })
      })
      const data = await res.json()
      const reply = data?.content?.find?.(b => b.type === 'text')?.text
        || data?.error
        || 'Mi dispiace, c\'è stato un problema. Riprova tra poco.'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Errore di connessione. Riprova tra poco.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const fabBottom = isMobile ? 92 : 24
  const fabRight = 24
  const panelWidth = isMobile ? 'calc(100vw - 24px)' : 380
  const panelHeight = isMobile ? 'calc(100vh - 160px)' : 540
  const panelBottom = isMobile ? 92 : 92
  const panelRight = isMobile ? 12 : 24

  return (
    <>
      <style>{`
        @keyframes _ai_pop {
          0% { opacity:0; transform: translateY(8px) scale(0.96); }
          100% { opacity:1; transform: translateY(0) scale(1); }
        }
        @keyframes _ai_dot {
          0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .ai-fab { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .ai-fab:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 10px 28px rgba(192,57,43,0.45); }
        .ai-send { transition: background 0.15s ease, transform 0.12s ease; }
        .ai-send:hover:not(:disabled) { background: ${COLORS.brandDark}; }
        .ai-send:active:not(:disabled) { transform: scale(0.95); }
        .ai-close { transition: background 0.15s ease; }
        .ai-close:hover { background: rgba(255,255,255,0.16); }
      `}</style>

      {open && (
        <div
          role="dialog"
          aria-label="Assistente FoodOS"
          style={{
            position: 'fixed',
            bottom: panelBottom,
            right: panelRight,
            width: panelWidth,
            maxWidth: 420,
            height: panelHeight,
            maxHeight: 640,
            background: COLORS.bg,
            borderRadius: 18,
            boxShadow: '0 24px 60px rgba(15,23,42,0.22), 0 4px 16px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
            border: `1px solid ${COLORS.border}`,
            fontFamily: "'Inter',system-ui,sans-serif",
            animation: '_ai_pop 0.18s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${COLORS.brand} 0%, ${COLORS.brandDark} 100%)`,
            color: '#fff',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ChatIcon size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Assistente FoodOS</div>
              <div style={{ fontSize: 11, opacity: 0.82, marginTop: 1 }}>Sempre online · Risponde in italiano</div>
            </div>
            <button
              className="ai-close"
              onClick={() => setOpen(false)}
              aria-label="Chiudi"
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'rgba(255,255,255,0.08)',
                border: 'none', cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 14px',
              background: COLORS.bgSoft,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? COLORS.bubbleUser : COLORS.bubbleAI,
                  color: m.role === 'user' ? '#fff' : COLORS.text,
                  padding: '10px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  boxShadow: m.role === 'user' ? '0 2px 8px rgba(192,57,43,0.18)' : '0 1px 2px rgba(15,23,42,0.04)',
                  animation: '_ai_pop 0.18s ease-out',
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                background: COLORS.bubbleAI,
                padding: '12px 14px',
                borderRadius: '14px 14px 14px 4px',
                display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: COLORS.textSoft,
                    display: 'inline-block',
                    animation: `_ai_dot 1.2s ease-in-out ${i * 0.16}s infinite`,
                  }}/>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Chiedi qualcosa su FoodOS…"
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: '10px 12px',
                fontSize: 13,
                lineHeight: 1.4,
                fontFamily: 'inherit',
                outline: 'none',
                color: COLORS.text,
                background: COLORS.bgSoft,
                maxHeight: 100,
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = COLORS.brand}
              onBlur={e => e.target.style.borderColor = COLORS.border}
              disabled={loading}
            />
            <button
              className="ai-send"
              onClick={send}
              disabled={!input.trim() || loading}
              aria-label="Invia"
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: (!input.trim() || loading) ? COLORS.textSoft : COLORS.brand,
                border: 'none',
                color: '#fff',
                cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: (!input.trim() || loading) ? 'none' : '0 4px 12px rgba(192,57,43,0.32)',
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Chiudi assistente' : 'Apri assistente AI'}
        style={{
          position: 'fixed',
          bottom: fabBottom,
          right: fabRight,
          width: 56, height: 56,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${COLORS.brand} 0%, ${COLORS.brandDark} 100%)`,
          border: 'none',
          cursor: 'pointer',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(192,57,43,0.42)',
          zIndex: 1001,
        }}
      >
        {open ? <CloseIcon size={22} /> : <ChatIcon size={24} />}
      </button>
    </>
  )
}
