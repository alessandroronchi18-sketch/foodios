import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

// Bottone floating + modale per inviare feedback all'admin.
// L'utente non vede una "casella feedback" dopo l'invio: e' uno strumento
// di segnalazione, non un canale di supporto. L'admin gestisce dal pannello.

const SENTIMENTS = [
  { key: 'bug',         label: '🐛 Bug',          help: 'Qualcosa non funziona' },
  { key: 'feature',     label: '💡 Idea',         help: 'Mi piacerebbe avere...' },
  { key: 'feedback',    label: '💬 Feedback',     help: 'Un\'osservazione generica' },
  { key: 'complimento', label: '🎉 Complimento',  help: 'Mi piace come funziona' },
]

export default function FeedbackButton({ viewCorrente }) {
  const [open, setOpen] = useState(false)
  const [sentiment, setSentiment] = useState('feedback')
  const [messaggio, setMessaggio] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function invia() {
    if (messaggio.trim().length < 3) { setErr('Scrivi almeno 3 caratteri'); return }
    setSending(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta — ricarica la pagina')
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaggio,
          sentiment,
          view_corrente: viewCorrente || null,
          url: window.location.href,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Errore ${res.status}`)
      }
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
      <button
        aria-label="Invia feedback"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20, right: 20,
          width: 52, height: 52,
          borderRadius: '50%',
          background: '#6E0E1A',
          color: '#FFF',
          border: 'none',
          fontSize: 22,
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(110,14,26,0.35)',
          zIndex: 50,
          transition: 'transform 0.15s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="Invia feedback ad Alessandro"
      >💬</button>

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
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1C0A0A' }}>
                💬 Mandami un feedback
              </h2>
              <button onClick={() => setOpen(false)} disabled={sending} style={{
                background: 'transparent', border: 'none', fontSize: 22, color: '#94A3B8',
                cursor: sending ? 'not-allowed' : 'pointer', lineHeight: 1,
              }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {sent ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 40 }}>✅</div>
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
                        <div>{s.label}</div>
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
                    }}>⚠️ {err}</div>
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
