import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ReferralPanel({ auth }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    if (!auth?.user) return
    loadReferral()
  }, [auth?.user])

  async function loadReferral() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch('/api/referral', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error('ReferralPanel:', e)
    } finally {
      setLoading(false)
    }
  }

  function copy(text, which) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  function shareWhatsApp() {
    const msg = encodeURIComponent(
      `Prova FoodOS, il gestionale food cost per la ristorazione! Usa il mio codice ${data.codice} e ottieni 60 giorni di prova gratuita invece di 30 → ${data.url}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const card = {
    background: '#FFF', borderRadius: 14, padding: '24px 28px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20,
  }
  const label = {
    fontSize: 11, fontWeight: 700, color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block',
  }
  const btn = {
    padding: '8px 14px', background: '#C0392B', color: '#FFF',
    border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    whiteSpace: 'nowrap', flexShrink: 0,
  }
  const btnGhost = {
    ...btn, background: 'transparent', color: '#C0392B', border: '1px solid #C0392B',
  }

  if (loading) return null
  if (!data?.codice) return null

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#1C0A0A', marginBottom: 18 }}>
        🎁 Programma Referral
      </div>

      {/* Codice */}
      <div style={{ marginBottom: 20 }}>
        <label style={label}>Il tuo codice invito</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 10,
            padding: '10px 18px', fontFamily: 'monospace', fontSize: 22, fontWeight: 900,
            color: '#C0392B', letterSpacing: '0.12em',
          }}>
            {data.codice}
          </div>
          <button style={btn} onClick={() => copy(data.codice, 'code')}>
            {copied === 'code' ? '✓ Copiato!' : 'Copia codice'}
          </button>
        </div>
      </div>

      {/* URL */}
      <div style={{ marginBottom: 20 }}>
        <label style={label}>Link da condividere</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            padding: '8px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0',
            borderRadius: 8, fontSize: 11, color: '#475569', fontFamily: 'monospace',
            wordBreak: 'break-all', flex: 1, minWidth: 0,
          }}>
            {data.url}
          </div>
          <button style={btnGhost} onClick={() => copy(data.url, 'url')}>
            {copied === 'url' ? '✓ Copiato!' : 'Copia link'}
          </button>
          <button style={{ ...btn, background: '#25D366' }} onClick={shareWhatsApp}>
            WhatsApp
          </button>
        </div>
      </div>

      {/* Statistiche */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ textAlign: 'center', padding: '16px 12px', background: '#FEF2F2', borderRadius: 10 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#C0392B', lineHeight: 1 }}>
            {data.utilizzi}
          </div>
          <div style={{ fontSize: 11, color: '#9C7B76', fontWeight: 600, marginTop: 6 }}>
            amici invitati
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '16px 12px', background: '#F0FDF4', borderRadius: 10 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#16A34A', lineHeight: 1 }}>
            {data.mesi_guadagnati}
          </div>
          <div style={{ fontSize: 11, color: '#4B6860', fontWeight: 600, marginTop: 6 }}>
            mesi guadagnati
          </div>
        </div>
      </div>

      {/* Spiegazione */}
      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A',
        borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#92400E', lineHeight: 1.7,
      }}>
        <strong>Come funziona:</strong> Per ogni amico che si iscrive e attiva FoodOS guadagni{' '}
        <strong>1 mese gratis</strong>. Il tuo amico ottiene{' '}
        <strong>60 giorni di prova</strong> invece di 30.
      </div>
    </div>
  )
}
