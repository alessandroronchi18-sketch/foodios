import React, { useState, useEffect } from 'react'
import { sload, ssave } from '../lib/storage'

const TV_KEY = 'pasticceria-tv-token-v1'

const card = { background:'#FFF', borderRadius:14, padding:'24px 28px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:20 }
const label = { fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, display:'block' }

function generaToken() {
  // 24 char random base32-like (sicuro su URL)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  return Array.from(buf, b => chars[b % chars.length]).join('')
}

export default function ImpostazioniTv({ orgId, sedi, notify }) {
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
    if (!confirm('Generare un nuovo link TV?\nIl link precedente non funzionerà più.')) return
    const nuovo = generaToken()
    try {
      await ssave(TV_KEY, { token: nuovo, generato_il: new Date().toISOString() }, orgId, null)
      setToken(nuovo)
      notify?.('✓ Nuovo link TV generato')
    } catch (e) {
      notify?.('⚠ Errore generazione link', false)
    }
  }

  async function revoca() {
    if (!confirm('Disattivare il link TV?\nLa dashboard pubblica non sarà più accessibile.')) return
    try {
      await ssave(TV_KEY, { token: null, revocato_il: new Date().toISOString() }, orgId, null)
      setToken(null)
      notify?.('✓ Link TV revocato')
    } catch (e) {
      notify?.('⚠ Errore revoca link', false)
    }
  }

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/tv` : ''
  const fullUrl = token
    ? `${baseUrl}?token=${encodeURIComponent(token)}${sedeSel ? `&sede=${encodeURIComponent(sedeSel)}` : ''}`
    : ''

  function copia() {
    if (!fullUrl) return
    navigator.clipboard?.writeText(fullUrl).then(
      () => notify?.('✓ Link copiato'),
      () => notify?.('⚠ Impossibile copiare', false),
    )
  }

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento…</div>

  return (
    <div>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 6 }}>📺 Dashboard TV</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 1.6 }}>
          Visualizzazione full-screen pensata per uno schermo TV in laboratorio o sala.
          Mostra produzione del giorno e stock vetrina, si aggiorna automaticamente ogni 5 minuti.
          Il link è pubblico ma protetto da un token: chi ha il link può vedere i dati, quindi rigeneralo se serve revocare l'accesso.
        </div>

        {!token ? (
          <button onClick={rigenera}
            style={{ padding: '10px 18px', background: '#C0392B', color: '#FFF', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Genera link TV
          </button>
        ) : (
          <>
            {sedi && sedi.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={label}>Sede da mostrare (opzionale)</label>
                <select value={sedeSel} onChange={e => setSedeSel(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 13, color: '#0F172A', background: '#FAFAFA', outline: 'none' }}>
                  <option value="">Tutte le sedi</option>
                  {sedi.map(s => <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` — ${s.citta}` : ''}</option>)}
                </select>
              </div>
            )}

            <label style={label}>Link da aprire sulla TV</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input readOnly value={fullUrl} onFocus={e => e.target.select()}
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 12, color: '#0F172A', background: '#F1F5F9', fontFamily: 'monospace' }} />
              <button onClick={copia}
                style={{ padding: '10px 18px', background: '#0F172A', color: '#FFF', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Copia
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <a href={fullUrl} target="_blank" rel="noreferrer"
                style={{ padding: '8px 16px', background: '#10B981', color: '#FFF', borderRadius: 9, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                Apri in nuova scheda →
              </a>
              <button onClick={rigenera}
                style={{ padding: '8px 16px', background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Rigenera token
              </button>
              <button onClick={revoca}
                style={{ padding: '8px 16px', background: '#FFF5F5', color: '#C0392B', border: '1px solid #FCA5A5', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Revoca
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
