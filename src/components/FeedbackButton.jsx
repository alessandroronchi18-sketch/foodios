import React, { useState } from 'react'
import { apiFetch } from '../lib/apiFetch'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'

// Bottone floating + modale per inviare feedback all'admin.
// L'utente non vede una "casella feedback" dopo l'invio: e' uno strumento
// di segnalazione, non un canale di supporto. L'admin gestisce dal pannello.

const SENTIMENTS = [
  { key: 'bug',         icon: 'bug',   label: 'Bug',          help: 'Qualcosa non funziona' },
  { key: 'feature',     icon: 'bulb',  label: 'Idea',         help: 'Mi piacerebbe avere...' },
  { key: 'feedback',    icon: 'chat',  label: 'Feedback',     help: 'Un\'osservazione generica' },
  { key: 'complimento', icon: 'party', label: 'Complimento',  help: 'Mi piace come funziona' },
]

export default function FeedbackButton({ viewCorrente }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [sentiment, setSentiment] = useState('feedback')
  const [messaggio, setMessaggio] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [hover, setHover] = useState(false)

  async function invia() {
    if (messaggio.trim().length < 3) { setErr('Scrivi almeno 3 caratteri'); return }
    setSending(true); setErr('')
    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          messaggio,
          sentiment,
          view_corrente: viewCorrente || null,
          url: window.location.href,
        }),
      })
      setSent(true)
      setMessaggio('')
      setTimeout(() => { setOpen(false); setSent(false); setSentiment('feedback') }, 1500)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          // Audit 2026-06-22: stessa dimensione e stile dell'AI FAB (56px,
          // gradient bg, shadow forte). Stack verticale gap 12px sopra l'AI.
          bottom: isMobile ? 160 : 92,
          right: 24,
          zIndex: 1002,
          display: 'flex', alignItems: 'center', gap: 10,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* Tooltip etichetta (compare on-hover sulla SINISTRA del FAB) */}
        <span style={{
          background: 'rgba(15,23,42,0.92)',
          color: '#FFF',
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          opacity: hover ? 1 : 0,
          transform: hover ? 'translateX(0)' : 'translateX(8px)',
          pointerEvents: 'none',
          transition: 'opacity 0.16s ease, transform 0.16s ease',
        }}>Feedback</span>
        <button
          aria-label="Invia feedback"
          onClick={() => setOpen(true)}
          className="ai-fab"
          style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6E0E1A 0%, #4A0810 100%)',
            color: '#FFF',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(110,14,26,0.42)',
            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.04)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(110,14,26,0.45)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 6px 20px rgba(110,14,26,0.42)' }}
        ><Icon name="chat" size={22}/></button>
      </div>

      {open && (
        <div
          onClick={() => !sending && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFF', borderRadius: 14, width: '100%', maxWidth: 480,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1C0A0A', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="chat" size={16} color="#6E0E1A"/> Mandami un feedback
              </h2>
              <button onClick={() => setOpen(false)} disabled={sending} style={{
                background: 'transparent', border: 'none', fontSize: 22, color: '#94A3B8',
                cursor: sending ? 'not-allowed' : 'pointer', lineHeight: 1,
              }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {sent ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ color: '#0E9F6E' }}><Icon name="checkCircle" size={40}/></div>
                  <div style={{ fontSize: 14, color: '#065F46', fontWeight: 600, marginTop: 8 }}>
                    Grazie! Ho ricevuto il tuo feedback.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 1.5 }}>
                    Scrivi liberamente. Le segnalazioni arrivano direttamente a me (Alessandro) — leggo tutto.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 12 }}>
                    {SENTIMENTS.map(s => (
                      <button
                        key={s.key}
                        onClick={() => setSentiment(s.key)}
                        type="button"
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: `1.5px solid ${sentiment === s.key ? '#6E0E1A' : '#E2E8F0'}`,
                          background: sentiment === s.key ? '#FEF7F5' : '#FFF',
                          color: sentiment === s.key ? '#6E0E1A' : '#475569',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={s.icon} size={14}/> {s.label}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{s.help}</div>
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={messaggio}
                    onChange={e => setMessaggio(e.target.value)}
                    placeholder={
                      sentiment === 'bug' ? 'Cosa stavi facendo? Cosa è successo invece?'
                        : sentiment === 'feature' ? 'Cosa ti piacerebbe poter fare?'
                        : 'Scrivi qui...'
                    }
                    rows={5}
                    autoFocus
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid #E2E8F0', fontSize: 13, resize: 'vertical',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                  {err && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', background: '#FEE2E2',
                      border: '1px solid #FCA5A5', borderRadius: 8, color: '#991B1B', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}><Icon name="warning" size={13}/> {err}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                    <button onClick={() => setOpen(false)} disabled={sending} style={{
                      padding: '8px 14px', background: '#FFF', border: '1px solid #E2E8F0',
                      borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: sending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', color: '#475569',
                    }}>Annulla</button>
                    <button onClick={invia} disabled={sending || messaggio.trim().length < 3} style={{
                      padding: '8px 14px', background: '#6E0E1A', color: '#FFF', border: 'none',
                      borderRadius: 8, fontWeight: 600, fontSize: 13,
                      cursor: (sending || messaggio.trim().length < 3) ? 'not-allowed' : 'pointer',
                      opacity: (sending || messaggio.trim().length < 3) ? 0.5 : 1,
                      fontFamily: 'inherit',
                    }}>{sending ? 'Invio…' : 'Invia'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
