import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import Icon from './Icon'

// AI Suggestions Bell — campanella in topbar che mostra i suggerimenti
// proattivi generati dal cron giornaliero. Click su un suggerimento -> apre
// la view CTA. Click "Fatto" / "Non interessa" -> cambia stato.

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const BORDER = T.border || '#E5E9EF'

const SEV_COLORS = {
  critical:   { bg: '#FEE2E2', fg: '#991B1B' },
  warning:    { bg: '#FEF3C7', fg: '#92400E' },
  opportunity:{ bg: '#DCFCE7', fg: '#166534' },
  info:       { bg: '#E0F2FE', fg: '#075985' },
}

export default function AISuggestionsBell({ orgId, onNavigate }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('ai_suggestions')
        .select('id, tipo, severita, titolo, descrizione, payload, cta_view, cta_label, stato, created_at')
        .eq('organization_id', orgId)
        .in('stato', ['nuovo', 'letto'])
        .order('created_at', { ascending: false })
        .limit(20)
      if (alive) setItems(data || [])
    }
    load()
    // Re-poll ogni 5 minuti (l'app rimane aperta a lungo nelle pasticcerie).
    const t = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [orgId])

  // Click outside chiude
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const nuoviCount = items.filter(i => i.stato === 'nuovo').length

  async function markRead(id) {
    // Save-first: aspetta DB prima di toccare lo state.
    try {
      await supabase.rpc('suggestion_set_state', { sugg_id: id, new_state: 'letto', reason: null })
      setItems(prev => prev.map(x => x.id === id ? { ...x, stato: 'letto' } : x))
    } catch (e) {
      console.error('markRead failed:', e)
    }
  }
  async function act(s) {
    setBusy(s.id)
    try {
      await supabase.rpc('suggestion_set_state', { sugg_id: s.id, new_state: 'agito', reason: null })
      setItems(prev => prev.filter(x => x.id !== s.id))
      setOpen(false)
      if (s.cta_view && typeof onNavigate === 'function') onNavigate(s.cta_view)
    } finally { setBusy(null) }
  }
  async function dismiss(s) {
    setBusy(s.id)
    try {
      await supabase.rpc('suggestion_set_state', { sugg_id: s.id, new_state: 'rifiutato', reason: 'user_dismiss' })
      setItems(prev => prev.filter(x => x.id !== s.id))
    } finally { setBusy(null) }
  }

  // Marca come 'letto' tutti i nuovi quando il dropdown si apre
  useEffect(() => {
    if (open && nuoviCount > 0) {
      const ids = items.filter(i => i.stato === 'nuovo').map(i => i.id)
      ids.forEach(markRead)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        title={items.length === 0 ? 'Nessun suggerimento' : `${items.length} suggerimenti AI`}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 6, borderRadius: 8, position: 'relative',
          color: '#FFF',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <Icon name="bell" size={18} />
        {nuoviCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: '#E84B3A', color: '#FFF',
            fontSize: 9.5, fontWeight: 800, borderRadius: 10,
            minWidth: 16, height: 16, padding: '0 4px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 2px rgba(110,14,26,0.95)',
          }}>{nuoviCount > 9 ? '9+' : nuoviCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 380, maxWidth: 'calc(100vw - 24px)',
          maxHeight: '70vh', overflowY: 'auto',
          background: '#FFF', border: `1px solid ${BORDER}`,
          borderRadius: 12, boxShadow: '0 12px 36px rgba(15,23,42,0.18)',
          zIndex: 200, color: TXT,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="sparkles" size={15} color={BRAND} />
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Suggerimenti AI
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: SOFT }}>{items.length}</div>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: SOFT, fontSize: 13, lineHeight: 1.5 }}>
              Nessun avviso al momento.<br/>
              L'AI controlla i tuoi dati ogni mattina e ti dice cosa fare.
            </div>
          ) : items.map(s => {
            const sev = SEV_COLORS[s.severita] || SEV_COLORS.info
            return (
              <div key={s.id} style={{
                padding: '14px 16px', borderBottom: `1px solid ${BORDER}`,
                background: s.stato === 'nuovo' ? '#FFFBEB' : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: sev.bg, color: sev.fg,
                  }}>
                    <Icon name={s.severita === 'opportunity' ? 'sparkles' : s.severita === 'critical' ? 'warning' : 'lightbulb'} size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 4 }}>
                      {s.titolo}
                    </div>
                    <div style={{ fontSize: 12, color: MID, lineHeight: 1.45 }}>
                      {s.descrizione}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.cta_view && (
                        <button onClick={() => act(s)} disabled={busy === s.id}
                          style={{
                            padding: '5px 12px', borderRadius: 7, border: 'none',
                            background: BRAND, color: '#FFF', fontSize: 11.5, fontWeight: 700,
                            cursor: 'pointer',
                          }}>
                          {s.cta_label || 'Vai'}
                        </button>
                      )}
                      <button onClick={() => dismiss(s)} disabled={busy === s.id}
                        style={{
                          padding: '5px 12px', borderRadius: 7, border: `1px solid ${BORDER}`,
                          background: 'transparent', color: SOFT, fontSize: 11.5, fontWeight: 700,
                          cursor: 'pointer',
                        }}>
                        Non mi serve
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
