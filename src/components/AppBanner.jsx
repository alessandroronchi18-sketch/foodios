import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'

// Banner globale dall'admin (tabella public.app_banners).
// Carica il piu' recente attivo + non scaduto, dismissable per sessione
// (riappare al prossimo login se l'admin non l'ha disattivato).
const COLORI = {
  info:     { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1E3A8A', icon: 'bulb' },
  warn:     { bg: '#FEF9C3', border: '#FCD34D', fg: '#854D0E', icon: 'warning' },
  critical: { bg: '#FEE2E2', border: '#FCA5A5', fg: '#991B1B', icon: 'alert' },
  success:  { bg: '#DCFCE7', border: '#86EFAC', fg: '#166534', icon: 'checkCircle' },
}

export default function AppBanner() {
  const [banner, setBanner] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('app_banners')
          .select('id, messaggio, tipo, scade_il')
          .order('creato_il', { ascending: false })
          .limit(1)
        if (cancelled) return
        const b = data?.[0]
        if (!b) { setBanner(null); return }
        // Dismiss state per-banner-id su sessionStorage
        if (sessionStorage.getItem(`banner_dismissed_${b.id}`) === '1') {
          setDismissed(true)
        }
        setBanner(b)
      } catch { /* silenzioso: niente banner se la query fallisce */ }
    }
    load()
    // Refresh ogni 5 minuti: l'admin potrebbe pubblicare/togliere un banner
    const id = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!banner || dismissed) return null
  const c = COLORI[banner.tipo] || COLORI.info

  return (
    <div role="status" style={{
      background: c.bg,
      borderBottom: `1px solid ${c.border}`,
      color: c.fg,
      padding: '8px 16px',
      fontSize: 13,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      lineHeight: 1.5,
    }}>
      <span aria-hidden style={{ flexShrink: 0, color: c.fg }}><Icon name={c.icon} size={16} /></span>
      <span style={{ flex: 1 }}>{banner.messaggio}</span>
      <button
        aria-label="Chiudi avviso"
        onClick={() => {
          sessionStorage.setItem(`banner_dismissed_${banner.id}`, '1')
          setDismissed(true)
        }}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: c.fg, fontSize: 18, lineHeight: 1, padding: '0 4px',
          opacity: 0.7,
        }}
      >×</button>
    </div>
  )
}
