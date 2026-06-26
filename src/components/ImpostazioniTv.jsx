import React, { useState, useEffect } from 'react'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { sload, ssave } from '../lib/storage'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

const TV_KEY = 'pasticceria-tv-token-v1'

const card = { background:'#FFF', borderRadius: 12, padding:'24px 28px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:20 }
const label = { fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, display:'block' }

function generaToken() {
  // 24 char random base32-like (sicuro su URL)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  return Array.from(buf, b => chars[b % chars.length]).join('')
}

// SHA-256 hex del token. Salvato accanto al token in user_data.data_value
// per permettere lookup costant-time lato edge function (no scan del DB,
// no timing attack su match plaintext).
async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s)
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ImpostazioniTv({ orgId, sedi, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sedeSel, setSedeSel] = useState('')

  useEffect(() => {
    if (!orgId) return
    sload(TV_KEY, orgId, null).then(v => {
      setToken(v?.token || null)
      setLoading(false)
    })
  }, [orgId])

  async function rigenera() {
    const ok = await confirmDialog({
      title: 'Generare un nuovo link TV?',
      message: 'Il link precedente non funzionera piu (rotazione token).',
      confirmLabel: 'Genera nuovo', cancelLabel: 'Annulla',
    })
    if (!ok) return
    const nuovo = generaToken()
    const hash = await sha256Hex(nuovo)
    try {
      await ssave(TV_KEY, { token: nuovo, token_hash: hash, generato_il: new Date().toISOString() }, orgId, null)
      setToken(nuovo)
      notify?.('Nuovo link TV generato')
    } catch (e) {
      notify?.('Errore generazione link', false)
    }
  }

  async function revoca() {
    const ok = await confirmDialog({
      title: 'Disattivare link TV?',
      message: 'La dashboard pubblica non sara piu accessibile finche non rigeneri.',
      confirmLabel: 'Disattiva', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      await ssave(TV_KEY, { token: null, revocato_il: new Date().toISOString() }, orgId, null)
      setToken(null)
      notify?.('Link TV revocato')
    } catch (e) {
      notify?.('Errore revoca link', false)
    }
  }

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/tv` : ''
  const fullUrl = token
    ? `${baseUrl}?token=${encodeURIComponent(token)}${sedeSel ? `&sede=${encodeURIComponent(sedeSel)}` : ''}`
    : ''

  function copia() {
    if (!fullUrl) return
    navigator.clipboard?.writeText(fullUrl).then(
      () => notify?.('Link copiato'),
      () => notify?.('Impossibile copiare', false),
    )
  }

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento…</div>

  // Audit mobile 2026-06-24: input + bottoni in colonna su mobile per evitare
  // overflow del link lungo; touch target 44px; font input >=16px per non
  // triggerare lo zoom auto di Safari iOS.
  const cardResp = { ...card, padding: isMobile ? '18px 16px' : isTablet ? '20px 22px' : '24px 28px' }
  const inputBase = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: 8,
    fontSize: isMobile ? 16 : 13, color: '#0F172A', background: '#FAFAFA', outline: 'none',
    minHeight: 44,
  }
  const btnBase = {
    padding: '12px 18px', border: 'none', borderRadius: 8,
    fontSize: isMobile ? 14 : 13, fontWeight: 700, cursor: 'pointer',
    minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  }

  return (
    <div>
      <div style={cardResp}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="tv" size={16} />Dashboard TV</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 1.6 }}>
          Visualizzazione full-screen pensata per uno schermo TV in laboratorio o sala.
          Mostra produzione del giorno e stock vetrina, si aggiorna automaticamente ogni 5 minuti.
          Il link è pubblico ma protetto da un token: chi ha il link può vedere i dati, quindi rigeneralo se serve revocare l'accesso.
        </div>

        {!token ? (
          <button onClick={rigenera}
            style={{ ...btnBase, width: isMobile ? '100%' : 'auto', background: '#6E0E1A', color: '#FFF' }}>
            Genera link TV
          </button>
        ) : (
          <>
            {sedi && sedi.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={label}>Sede da mostrare (opzionale)</label>
                <select value={sedeSel} onChange={e => setSedeSel(e.target.value)}
                  style={inputBase}>
                  <option value="">Tutte le sedi</option>
                  {sedi.map(s => <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` - ${s.citta}` : ''}</option>)}
                </select>
              </div>
            )}

            <label style={label}>Link da aprire sulla TV</label>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 14 }}>
              <input readOnly value={fullUrl} onFocus={e => e.target.select()}
                style={{ ...inputBase, flex: 1, fontSize: isMobile ? 16 : 12, color: '#0F172A', background: '#F1F5F9', fontFamily: 'monospace' }} />
              <button onClick={copia}
                style={{ ...btnBase, background: '#0F172A', color: '#FFF', whiteSpace: 'nowrap', width: isMobile ? '100%' : 'auto' }}>
                Copia link
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap' }}>
              <a href={fullUrl} target="_blank" rel="noreferrer"
                style={{ ...btnBase, background: '#10B981', color: '#FFF', textDecoration: 'none', width: isMobile ? '100%' : 'auto' }}>
                Apri in nuova scheda
              </a>
              <button onClick={rigenera}
                style={{ ...btnBase, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', width: isMobile ? '100%' : 'auto' }}>
                Rigenera token
              </button>
              <button onClick={revoca}
                style={{ ...btnBase, background: '#FFF5F5', color: '#6E0E1A', border: '1px solid #FCA5A5', width: isMobile ? '100%' : 'auto' }}>
                Revoca
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
