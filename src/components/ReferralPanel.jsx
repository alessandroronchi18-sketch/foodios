// ReferralPanel — Programma referral completo.
// - Mostra il codice univoco dell'organizzazione + link condivisibile
// - KPI: amici invitati, mesi guadagnati, livello premio raggiunto
// - Share rapido: WhatsApp, Email, Web Share API mobile, copy
// - Inserimento codice ricevuto da un altro utente (lo stesso meccanismo già usato in registrazione)
// - Visualizza la scala dei premi e il progresso fino al prossimo livello
//
// API: /api/referral (GET = info + auto-crea codice; POST = applica codice ricevuto)

import React, { useEffect, useState } from 'react'
import Icon from './Icon'
import { apiFetch } from '../lib/apiFetch'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

const APP_NAME = 'Foodos'

// Scala premi: ogni gradino sblocca un bonus aggiuntivo per il referente.
const LIVELLI = [
  { soglia: 1,  premio: '1 mese gratis',     icon: 'star' },
  { soglia: 3,  premio: '3 mesi gratis',     icon: 'star' },
  { soglia: 5,  premio: '6 mesi gratis',     icon: 'star' },
  { soglia: 10, premio: '1 anno gratis',     icon: 'trophy' },
  { soglia: 25, premio: 'Piano Chain gratis 1 anno', icon: 'trophy' },
]

function getStyle(isMobile, isTablet) {
  const minH = isTablet ? 44 : 40
  return {
    card: { background: '#FFF', borderRadius: 12, padding: isMobile ? '18px 16px' : '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 },
    label: { fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
    btn: { padding: '8px 14px', minHeight: minH, background: '#6E0E1A', color: '#FFF', border: 'none', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
    btnGhost: { padding: '8px 14px', minHeight: minH, background: 'transparent', color: '#6E0E1A', border: '1px solid #6E0E1A', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  }
}

export default function ReferralPanel({ auth }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const STYLE = getStyle(isMobile, isTablet)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [copied, setCopied] = useState(null)
  // Form "Inserisci codice ricevuto"
  const [codiceInput, setCodiceInput] = useState('')
  const [applicaBusy, setApplicaBusy] = useState(false)
  const [applicaMsg, setApplicaMsg] = useState(null)

  useEffect(() => {
    if (!auth?.user) return
    loadReferral()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user])

  async function loadReferral() {
    setLoading(true); setErrore('')
    try {
      const res = await apiFetch('/api/referral')
      const json = await res.json()
      setData(json)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setLoading(false)
    }
  }

  function copy(text, which) {
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  function messaggioInvito() {
    return `Prova ${APP_NAME}, il gestionale food cost per la ristorazione: gestione ricette, magazzino, P&L e HACCP — usa il mio codice ${data.codice} e ottieni 60 giorni di prova gratuita invece di 30 → ${data.url}`
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(messaggioInvito())}`, '_blank')
  }
  function shareEmail() {
    const subj = encodeURIComponent(`Ti invito a provare ${APP_NAME}`)
    const body = encodeURIComponent(messaggioInvito())
    window.location.href = `mailto:?subject=${subj}&body=${body}`
  }
  async function shareNative() {
    if (!navigator.share) { copy(messaggioInvito(), 'msg'); return }
    try {
      await navigator.share({
        title: `Invito a ${APP_NAME}`,
        text: messaggioInvito(),
        url: data.url,
      })
    } catch { /* utente ha annullato */ }
  }

  async function applicaCodice() {
    const codiceNorm = (codiceInput || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    if (codiceNorm.length < 4) {
      setApplicaMsg({ ok: false, txt: 'Codice non valido (almeno 4 caratteri).' })
      return
    }
    setApplicaBusy(true); setApplicaMsg(null)
    try {
      await apiFetch('/api/referral', {
        method: 'POST',
        body: JSON.stringify({ codice: codiceNorm }),
      })
      setApplicaMsg({ ok: true, txt: '✓ Codice applicato! Hai 60 giorni di trial gratis.' })
      setCodiceInput('')
    } catch (e) {
      setApplicaMsg({ ok: false, txt: e.message })
    } finally {
      setApplicaBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={STYLE.card}>
        <div style={{ fontSize: 13, color: '#94A3B8' }}>Caricamento programma referral…</div>
      </div>
    )
  }

  if (errore && !data?.codice) {
    return (
      <div style={STYLE.card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#1C0A0A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={16} />Programma Referral</div>
        <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={14} />{errore}</div>
        <button onClick={loadReferral} style={STYLE.btn}>Riprova</button>
      </div>
    )
  }

  // KPI livello premio
  const utilizzi = data?.utilizzi || 0
  const livelloCorrente = [...LIVELLI].reverse().find(l => utilizzi >= l.soglia) || null
  const prossimo = LIVELLI.find(l => utilizzi < l.soglia)
  const mancanti = prossimo ? prossimo.soglia - utilizzi : 0
  const progresso = prossimo
    ? (utilizzi / prossimo.soglia) * 100
    : 100

  return (
    <div>
      <div style={STYLE.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1C0A0A', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={16} />Programma Referral</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6E0E1A', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 999, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {livelloCorrente ? <><Icon name={livelloCorrente.icon} size={12} />{`Livello ${livelloCorrente.premio}`}</> : 'Inizia a invitare per sbloccare premi'}
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 18px', lineHeight: 1.55 }}>
          Più colleghi invitano <strong>{APP_NAME}</strong>, più mesi gratuiti aggiungi al tuo abbonamento. Il tuo amico ottiene 60 giorni di trial invece di 30.
        </p>

        {/* Codice */}
        <div style={{ marginBottom: 18 }}>
          <label style={STYLE.label}>Il tuo codice invito</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 10,
              padding: '10px 18px',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: isMobile ? 18 : 22, fontWeight: 900,
              color: '#6E0E1A', letterSpacing: '0.12em',
              flex: isMobile ? '1 1 100%' : '0 0 auto',
            }}>
              {data.codice}
            </div>
            <button style={{ ...STYLE.btn, flex: isMobile ? '1 1 100%' : '0 0 auto', justifyContent: 'center', display: 'inline-flex', alignItems: 'center' }} onClick={() => copy(data.codice, 'code')}>
              {copied === 'code' ? '✓ Copiato!' : 'Copia codice'}
            </button>
          </div>
        </div>

        {/* URL + share */}
        <div style={{ marginBottom: 22 }}>
          <label style={STYLE.label}>Link da condividere</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{
              padding: '8px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: 8, fontSize: 11, color: '#475569', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              wordBreak: 'break-all', flex: 1, minWidth: 0, width: isMobile ? '100%' : 'auto',
            }}>{data.url}</div>
            <button style={{ ...STYLE.btnGhost, width: isMobile ? '100%' : 'auto', justifyContent: 'center', display: 'inline-flex', alignItems: 'center' }} onClick={() => copy(data.url, 'url')}>
              {copied === 'url' ? '✓ Copiato!' : 'Copia link'}
            </button>
          </div>
          <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...STYLE.btn, background: '#25D366', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={shareWhatsApp}><Icon name="chat" size={14} />WhatsApp</button>
            <button style={{ ...STYLE.btn, background: '#1D4ED8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={shareEmail}><Icon name="mail" size={14} />Email</button>
            <button style={{ ...STYLE.btnGhost, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={shareNative}><Icon name="upload" size={14} />Condividi</button>
            <button style={{ ...STYLE.btnGhost, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => copy(messaggioInvito(), 'msg')}>
              {copied === 'msg' ? '✓ Copiato!' : 'Copia messaggio'}
            </button>
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <div style={{ textAlign: 'center', padding: '16px 12px', background: '#FEF2F2', borderRadius: 10, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: isMobile ? 28 : 30, fontWeight: 900, color: '#6E0E1A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{(utilizzi || 0).toLocaleString('it-IT')}</div>
            <div style={{ fontSize: 11, color: '#9C7B76', fontWeight: 600, marginTop: 6 }}>amici invitati</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px 12px', background: '#F0FDF4', borderRadius: 10, minHeight: 92, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: isMobile ? 28 : 30, fontWeight: 900, color: '#16A34A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{(data.mesi_guadagnati || 0).toLocaleString('it-IT')}</div>
            <div style={{ fontSize: 11, color: '#4B6860', fontWeight: 600, marginTop: 6 }}>mesi guadagnati</div>
          </div>
        </div>

        {/* Progresso prossimo livello */}
        {prossimo && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>
                Prossimo premio: <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={prossimo.icon} size={12} />{prossimo.premio}</strong>
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6E0E1A' }}>
                {mancanti} {mancanti === 1 ? 'invito' : 'inviti'} mancanti
              </span>
            </div>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, progresso)}%`, height: '100%',
                background: 'linear-gradient(90deg, #6E0E1A 0%, #E84B3A 100%)',
                transition: 'width 0.3s ease',
              }}/>
            </div>
          </div>
        )}

        {/* Scala premi */}
        <div>
          <label style={STYLE.label}>Scala premi</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {LIVELLI.map(l => {
              const raggiunto = utilizzi >= l.soglia
              return (
                <div key={l.soglia} style={{
                  padding: '10px 12px',
                  background: raggiunto ? '#F0FDF4' : '#F8FAFC',
                  border: `1px solid ${raggiunto ? '#86EFAC' : '#E2E8F0'}`,
                  borderRadius: 8,
                  opacity: raggiunto ? 1 : 0.85,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: raggiunto ? '#16A34A' : '#64748B', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name={l.icon} size={12} />{l.soglia} inviti
                  </div>
                  <div style={{ fontSize: 11, color: raggiunto ? '#065F46' : '#475569', fontWeight: 600, lineHeight: 1.3 }}>
                    {l.premio}
                  </div>
                  {raggiunto && (
                    <div style={{ fontSize: 9, color: '#16A34A', fontWeight: 800, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ✓ Sbloccato
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Inserisci codice ricevuto */}
      <div style={STYLE.card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1C0A0A', marginBottom: 4 }}>
          Hai ricevuto un codice da un collega?
        </div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 1.55 }}>
          Inseriscilo qui per estendere il tuo trial a 60 giorni. Funziona una volta sola, prima dell'attivazione di un abbonamento.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={codiceInput}
            onChange={e => setCodiceInput(e.target.value.toUpperCase())}
            placeholder="Es. PAST7HQK4N"
            maxLength={12}
            style={{
              flex: 1, minWidth: isMobile ? '100%' : 180,
              padding: '12px 14px', minHeight: isTablet ? 44 : 42,
              borderRadius: 8, border: '1px solid #E2E8F0',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 16, fontWeight: 700, letterSpacing: '0.08em',
              color: '#1C0A0A', background: '#F8FAFC', outline: 'none', boxSizing: 'border-box',
            }}
            onKeyDown={e => { if (e.key === 'Enter') applicaCodice() }}
          />
          <button onClick={applicaCodice} disabled={applicaBusy || codiceInput.length < 4} style={{ ...STYLE.btn, opacity: applicaBusy ? 0.6 : 1 }}>
            {applicaBusy ? '…' : 'Applica codice'}
          </button>
        </div>
        {applicaMsg && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: applicaMsg.ok ? '#F0FDF4' : '#FEE2E2',
            color: applicaMsg.ok ? '#16A34A' : '#991B1B',
            fontSize: 12, fontWeight: 600,
          }}>{applicaMsg.txt}</div>
        )}
      </div>
    </div>
  )
}
