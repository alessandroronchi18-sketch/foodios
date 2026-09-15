import React, { useState, useRef, useEffect, useCallback } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { callAi } from '../lib/aiClient'
import { color as T, z } from '../lib/theme'

// Mini-renderer markdown (l'AI risponde in markdown: **grassetto**, ##, elenchi).
// Senza, gli asterischi/cancelletti apparivano letterali. Niente librerie esterne.
function inlineMd(str) {
  return String(str).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  )
}
function renderRich(text) {
  return String(text || '').split('\n').map((raw, idx) => {
    const t = raw.trim()
    if (t === '') return <div key={idx} style={{ height: 6 }} />
    if (/^---+$/.test(t)) return <div key={idx} style={{ borderTop: '1px solid rgba(0,0,0,0.10)', margin: '8px 0' }} />
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) return <div key={idx} style={{ fontWeight: 800, fontSize: 13, margin: '6px 0 2px' }}>{inlineMd(h[2])}</div>
    const b = t.match(/^[-*•]\s+(.*)$/)
    if (b) return (
      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '1px 0' }}>
        <span style={{ color: '#6E0E1A', fontWeight: 800, lineHeight: 1.5 }}>•</span>
        <span style={{ flex: 1 }}>{inlineMd(b[1])}</span>
      </div>
    )
    const n = t.match(/^(\d+)\.\s+(.*)$/)
    if (n) return (
      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '1px 0' }}>
        <span style={{ color: '#6E0E1A', fontWeight: 800, minWidth: 14 }}>{n[1]}.</span>
        <span style={{ flex: 1 }}>{inlineMd(n[2])}</span>
      </div>
    )
    return <div key={idx}>{inlineMd(t)}</div>
  })
}

// Le pagine dell'applicazione, col nome ESATTO che compare nel menu.
//
// Prima questo elenco era scritto dentro il testo delle istruzioni, a mano, e
// aveva smesso da un pezzo di somigliare al menu vero: citava la "scheda
// allergeni" e il "Menù", che sono spenti dal 09/09/2026, e sbagliava quasi
// tutti gli altri nomi — diceva "Food Cost" dove c'è "Food Cost simulatore",
// "P&L" dove c'è "Profitti (P&L)", "Personale" dove c'è "Personale &
// stipendi", "Integrazioni" che non è più una voce di menu (sta dentro
// Impostazioni). L'utente cercava nella barra laterale una voce che non c'era,
// e concludeva che il programma fosse rotto o che non ci capiva niente.
const PAGINE = {
  'home': 'Home',
  'ricettario': 'Ricettario',
  'nuova-ricetta': 'Nuova ricetta',
  'semilavorati': 'Semilavorati',
  'giornaliero': 'Produzione',
  'inventario-gusti': 'Inventario settimanale',
  'chiusura': 'Chiusura cassa',
  'magazzino': 'Magazzino',
  'sprechi-omaggi': 'Perdite e cessioni',
  'calendario': 'Calendario',
  'simulatore': 'Food Cost simulatore',
  'pl': 'Profitti (P&L)',
  'costi-aziendali': 'Costi aziendali',
  'storico': 'Storico produzione',
  'previsione': 'Previsione domanda',
  'scadenzario': 'Scadenzario fatture',
  'fornitori': 'Fornitori',
  'personale': 'Personale & stipendi',
  'confronto-sedi': 'Confronto sedi',
  'trasferimenti': 'Trasferimenti tra sedi',
  'impostazioni': 'Impostazioni',
  'changelog': 'Novità',
}

/**
 * Le istruzioni dell'assistente, costruite su misura per chi sta chiedendo.
 *
 * Prima erano una stringa fissa uguale per tutti, e questo apriva un buco: a un
 * DIPENDENTE l'assistente spiegava come arrivare a Profitti, Costi aziendali e
 * Personale — cioè esattamente le pagine che il 15/09/2026 gli sono state
 * chiuse. I numeri non poteva darglieli (non li ha), ma la mappa sì. La ricerca
 * rapida (Cmd+K) questa regola ce l'aveva già, con la nota che la spiega:
 * «vedere il nome di una pagina che non dovresti avere è già un pezzo di
 * informazione che non ti spetta». Qui non era mai stata applicata.
 */
export function costruisciIstruzioni(vistePermesse = null) {
  const voci = Object.entries(PAGINE)
    .filter(([id]) => !vistePermesse || vistePermesse.has(id))
    .map(([, nome]) => nome)

  return `Sei l'assistente di Foodos, un gestionale per la ristorazione italiana.
Aiuti chi lo usa a capire COME si fa una cosa dentro il programma.

Le pagine che questa persona può aprire, col nome esatto che legge nel menu:
${voci.join(', ')}.
Non nominare nessun'altra pagina: quelle che non sono in questo elenco, per lei
non esistono. Se chiede di qualcosa che non c'è, dille semplicemente che quella
parte non fa parte delle sue pagine, senza spiegare perché.

NON HAI ACCESSO AI DATI dell'attività: non sai quanto ha incassato, qual è il
suo food cost, cosa c'è in magazzino. Se ti chiede un numero,
**non inventarlo**: dille in quale pagina lo trova.

Come scrivere:
- italiano semplice, frasi brevi, come parlerebbe un collega. Mai "Certamente!",
  "Ecco a te!", "Spero ti sia utile".
- niente emoji, mai.
- i numeri all'italiana: il punto per le migliaia (1.477, non 1,477) e l'euro
  DOPO la cifra (1.477 €, non € 1.477).
- niente tabelle: non si vedono bene qui. Se serve un elenco, usa righe corte.
- rispondi in tre o quattro frasi. Se serve una procedura, elenca i passi.

Se chiede cose fuori tema (ricette di cucina, consulenza fiscale), dille con
gentilezza che tu sai aiutarla solo sull'uso del programma.`
}


// Dai token, non scritti a mano. `#8B95A7` era proprio il valore che
// theme.js dichiara di aver abbandonato perché sotto la soglia di contrasto
// WCAG AA: chi ha la vista stanca non leggeva i testi secondari.
const COLORS = {
  brand: T.brand,
  brandDark: T.brandDark,
  text: T.text,
  textMid: T.textMid,
  textSoft: T.textSoft,
  bg: T.bgCard,
  bgSoft: T.bg,
  border: T.border,
  bubbleUser: T.brand,
  bubbleAI: T.bgSubtle,
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

export default function AIAssistant({ externalOpen, onOpenChange, hideFab = false, vistePermesse = null }) {
  // Le istruzioni cambiano con chi sta chiedendo: a un dipendente si elencano
  // solo le sue pagine.
  const istruzioni = React.useMemo(() => costruisciIstruzioni(vistePermesse), [vistePermesse])
  const isMobile = useIsMobile()
  const isControlled = typeof externalOpen === 'boolean'
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? externalOpen : internalOpen
  const setOpen = (v) => {
    const next = typeof v === 'function' ? v(open) : v
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const [fabHover, setFabHover] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Ciao! Sono l\'assistente di Foodos. Posso aiutarti a capire come usare l\'app - chiedi pure.' }
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

  // Esc chiude, come in ogni finestra. Prima non la chiudeva niente da
  // tastiera: bisognava per forza cliccare col mouse.
  useEffect(() => {
    if (!open) return
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      // Il saluto di apertura è scritto da noi e sta solo a schermo: non va
      // mandato all'AI. La conversazione che parte dall'assistente fa tornare
      // un 400 ("il primo messaggio deve essere dell'utente"), quindi ogni
      // domanda fatta qui dentro finiva in errore.
      const primaDomanda = next.findIndex(m => m.role === 'user')
      const apiMessages = (primaDomanda >= 0 ? next.slice(primaDomanda) : next)
        .map(m => ({ role: m.role, content: m.content }))
      const { text } = await callAi({
        feature: 'ai-assistant',
        model: 'claude-sonnet-5',
        system: istruzioni,
        messages: apiMessages,
        maxTokens: 800,
        timeoutMs: 40_000,
      })
      const reply = text?.trim() || 'Non ho una risposta utile in questo momento. Riprova fra poco.'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: e.friendly || 'Errore di connessione. Riprova fra poco.' }])
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

  // Audit 2026-06-24: FAB più piccolo + posizionato più in basso, non invasivo.
  // Sotto 600px il pannello chat occupa l'intera viewport (full-bleed) per non
  // costringere l'utente a digitare in una colonnina stretta.
  const isSmallPhone = typeof window !== 'undefined' && window.innerWidth < 600
  const fabBottom = isMobile ? 78 : 20
  const fabRight = isMobile ? 16 : 20
  const panelWidth = isSmallPhone ? '100vw' : isMobile ? 'calc(100vw - 24px)' : 380
  const panelHeight = isSmallPhone ? '100dvh' : isMobile ? 'calc(100vh - 160px)' : 540
  const panelBottom = isSmallPhone ? 0 : 92
  const panelRight = isSmallPhone ? 0 : isMobile ? 12 : 24
  const panelMaxHeight = isSmallPhone ? '100dvh' : 640
  const panelBorderRadius = isSmallPhone ? 0 : 18

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
        .ai-fab:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 10px 28px rgba(110,14,26,0.45); }
        .ai-send { transition: background 0.15s ease, transform 0.12s ease; }
        .ai-send:hover:not(:disabled) { background: ${COLORS.brandDark}; }
        .ai-send:active:not(:disabled) { transform: scale(0.95); }
        .ai-close { transition: background 0.15s ease; }
        .ai-close:hover { background: rgba(255,255,255,0.16); }
      `}</style>

      {open && (
        <div
          role="dialog"
          aria-label="Assistente Foodos"
          style={{
            position: 'fixed',
            bottom: panelBottom,
            right: panelRight,
            width: panelWidth,
            maxWidth: isSmallPhone ? '100vw' : 420,
            height: panelHeight,
            maxHeight: panelMaxHeight,
            background: COLORS.bg,
            borderRadius: panelBorderRadius,
            boxShadow: '0 24px 60px rgba(15,23,42,0.22), 0 4px 16px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            // Dal token: 1000 scritto a mano teneva il pannello sopra a tutto,
            // compresi i modali che devono stare davanti.
            zIndex: z.modal,
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
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Assistente Foodos</div>
              <div style={{ fontSize: 12, opacity: 0.82, marginTop: 1 }}>Ti spiego come si fa · Risponde in italiano</div>
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
                  whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                  wordBreak: 'break-word',
                  boxShadow: m.role === 'user' ? '0 2px 8px rgba(110,14,26,0.18)' : '0 1px 2px rgba(15,23,42,0.04)',
                  animation: '_ai_pop 0.18s ease-out',
                }}
              >
                {m.role === 'assistant' ? renderRich(m.content) : m.content}
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
              placeholder="Scrivi un messaggio…"
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: '10px 12px',
                // 16px su mobile per evitare zoom iOS in focus textarea.
                fontSize: isMobile ? 16 : 13,
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
                width: isMobile ? 44 : 40, height: isMobile ? 44 : 40, borderRadius: 12,
                background: (!input.trim() || loading) ? COLORS.textSoft : COLORS.brand,
                border: 'none',
                color: '#fff',
                cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: (!input.trim() || loading) ? 'none' : '0 4px 12px rgba(110,14,26,0.32)',
              }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      {/* Floating button + tooltip (audit 2026-06-22: layout identico al FeedbackButton)
          Nascondibile via prop hideFab quando il FAB e' gestito da FloatingActions. */}
      {!hideFab && (
        <div
          style={{
            position: 'fixed',
            bottom: fabBottom,
            right: fabRight,
            zIndex: z.modal,
            display: 'flex', alignItems: 'center', gap: 10,
          }}
          onMouseEnter={() => setFabHover(true)}
          onMouseLeave={() => setFabHover(false)}
        >
          {!open && (
            <span style={{
              background: 'rgba(15,23,42,0.92)',
              color: '#FFF',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              opacity: fabHover ? 1 : 0,
              transform: fabHover ? 'translateX(0)' : 'translateX(8px)',
              pointerEvents: 'none',
              transition: 'opacity 0.16s ease, transform 0.16s ease',
            }}>Assistente</span>
          )}
          <button
            className="ai-fab"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Chiudi assistente' : 'Apri assistente AI'}
            style={{
              width: 40, height: 40,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${COLORS.brand} 0%, ${COLORS.brandDark} 100%)`,
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(110,14,26,0.36)',
            }}
          >
            {open ? <CloseIcon size={16} /> : <ChatIcon size={18} />}
          </button>
        </div>
      )}
    </>
  )
}
