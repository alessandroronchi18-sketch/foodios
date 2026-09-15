import React, { useState, useEffect } from 'react'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { sload, ssave } from '../lib/storage'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, typo, ui3, ui } from '../lib/theme'

const TV_KEY = 'pasticceria-tv-token-v1'

const card = { background:T.bgCard, borderRadius:R.xl, border:`1px solid ${T.border}`, padding:'24px 28px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:20 }
const label = { ...typo.overline, color:T.textSoft, marginBottom:8, display:'block' }

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
  const [generatoIl, setGeneratoIl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sedeSel, setSedeSel] = useState('')

  useEffect(() => {
    if (!orgId) return
    sload(TV_KEY, orgId, null).then(v => {
      setToken(v?.token || null)
      setGeneratoIl(v?.generato_il || null)
      setLoading(false)
    })
  }, [orgId])

  async function rigenera() {
    const ok = await confirmDialog({
      title: 'Cambiare il link della TV?',
      message: 'Il link di adesso smette di funzionare subito: la TV resta nera finché non le dai quello nuovo.',
      confirmLabel: 'Cambia link', cancelLabel: 'Annulla',
    })
    if (!ok) return
    const nuovo = generaToken()
    const hash = await sha256Hex(nuovo)
    try {
      await ssave(TV_KEY, { token: nuovo, token_hash: hash, generato_il: new Date().toISOString() }, orgId, null)
      setToken(nuovo)
      setGeneratoIl(new Date().toISOString())
      notify?.('Fatto. Copia il link e aprilo sulla TV.')
    } catch (e) {
      // Prima diceva solo "Errore generazione link" e il motivo spariva:
      // senza quello non si capiva se era la rete o i permessi.
      notify?.('Non sono riuscito a creare il link: ' + (e?.message || 'riprova fra un minuto'), false)
    }
  }

  async function revoca() {
    const ok = await confirmDialog({
      title: 'Spegnere lo schermo?',
      message: 'Lo schermo si spegne e il link smette di funzionare. Puoi riaccenderlo quando vuoi, con un link nuovo.',
      confirmLabel: 'Spegni', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      await ssave(TV_KEY, { token: null, revocato_il: new Date().toISOString() }, orgId, null)
      setToken(null)
      setGeneratoIl(null)
      notify?.('Schermo spento. Il link non funziona più.')
    } catch (e) {
      notify?.('Non sono riuscito a spegnerlo: ' + (e?.message || 'riprova fra un minuto'), false)
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

  if (loading) return <div style={{ ...typo.small, color: T.textFaint, padding: 24 }}>Caricamento…</div>

  // Audit mobile 2026-06-24: input + bottoni in colonna su mobile per evitare
  // overflow del link lungo; touch target 44px; font input >=16px per non
  // triggerare lo zoom auto di Safari iOS.
  const cardResp = { ...card, padding: ui3(isMobile, isTablet, ui.cardPad) }
  const inputBase = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px', border: `1px solid ${T.borderStr}`, borderRadius: R.md,
    fontSize: isMobile ? 16 : 13, color: T.text, background: T.bgSubtle, outline: 'none',
    minHeight: 44,
  }
  const btnBase = {
    padding: '12px 18px', border: 'none', borderRadius: R.md,
    fontSize: isMobile ? 14 : 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  }

  return (
    <div>
      <div style={cardResp}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: R.xl, background: T.brandLight, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="tv" size={22} color={T.brand}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...typo.h2, color: T.text }}>Schermo in laboratorio</div>
            <div style={{ ...typo.small, color: T.textSoft, marginTop: 2 }}>
              {token
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: T.green }}/> Acceso{generatoIl ? ` · link creato il ${new Date(generatoIl).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: T.textFaint }}/> Spento</span>
              }
            </div>
          </div>
        </div>
        <div style={{ ...typo.small, color: T.textMid, marginBottom: 18, lineHeight: 1.6 }}>
          Una pagina a tutto schermo per la TV del laboratorio o della sala: produzione del giorno e cosa c'è in vetrina, aggiornati ogni 5 minuti. Chi ha il link vede — non serve nessuna password, quindi non mandarlo in giro. Se finisce dove non deve, lo cambi in due clic e il vecchio smette di funzionare.
        </div>

        {!token ? (
          <button onClick={rigenera}
            style={{ ...btnBase, width: isMobile ? '100%' : 'auto', background: T.brand, color: T.white }}>
            <Icon name="plus" size={14} color={T.white}/> Accendi lo schermo
          </button>
        ) : (
          <>
            {sedi && sedi.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="tv-sede" style={label}>Sede da mostrare (opzionale)</label>
                <select id="tv-sede" value={sedeSel} onChange={e => setSedeSel(e.target.value)}
                  style={inputBase}>
                  <option value="">Tutte le sedi</option>
                  {sedi.map(s => <option key={s.id} value={s.id}>{s.nome}{s.citta ? ` - ${s.citta}` : ''}</option>)}
                </select>
              </div>
            )}

            <label htmlFor="tv-link" style={label}>Link da aprire sulla TV</label>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 14 }}>
              <input id="tv-link" readOnly value={fullUrl} onFocus={e => e.target.select()}
                style={{ ...inputBase, ...typo.code, flex: 1, fontSize: 12, color: T.text, background: T.bgSubtle }} />
              <button onClick={copia}
                style={{ ...btnBase, background: T.brand, color: T.white, whiteSpace: 'nowrap', width: isMobile ? '100%' : 'auto' }}>
                <Icon name="copy" size={14} color={T.white}/> Copia
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flexWrap: 'wrap' }}>
              <a href={fullUrl} target="_blank" rel="noreferrer"
                style={{ ...btnBase, background: T.bgCard, color: T.text, border: `1px solid ${T.borderStr}`, textDecoration: 'none', width: isMobile ? '100%' : 'auto' }}>
                <Icon name="play" size={14} color={T.text}/> Apri lo schermo
              </a>
              <button onClick={rigenera}
                style={{ ...btnBase, background: T.bgCard, color: T.textMid, border: `1px solid ${T.borderStr}`, width: isMobile ? '100%' : 'auto' }}>
                <Icon name="refresh" size={14} color={T.textMid}/> Cambia link
              </button>
              <button onClick={revoca}
                style={{ ...btnBase, background: T.redLight, color: T.red, border: `1px solid ${T.red}33`, width: isMobile ? '100%' : 'auto' }}>
                <Icon name="trash" size={14} color={T.red}/> Spegni
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
