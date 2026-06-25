// AbbonamentoPanel — gestione abbonamento Stripe
// - Mostra il piano attuale e lo stato Stripe
// - Bottoni per attivare un piano (Checkout) o gestire l'esistente (Portal)
//
// Funziona anche su pagina trial-scaduto: in quel caso isInline=true,
// il componente si renderizza in versione standalone senza wrapper card.

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import { apiFetch } from '../lib/apiFetch'
import usePlanPricing, { fmtPrezzo } from '../lib/usePlanPricing'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

// Audit 2026-06-21: 3-tier Bottega/Maestro/Insegna con ROI claim.
// Fallback statico — viene sovrascritto dalla query plan_pricing al mount
// se l'admin ha modificato nomi/prezzi/descrizioni dal pannello.
const PIANI_DEFAULT = [
  {
    id: 'base',
    label: 'Bottega',
    prezzo: '€69',
    periodo: '/mese',
    desc: 'Per il banco singolo. Smetti di sbagliare i prezzi. Già il primo mese ti ripaghi.',
    features: [
      'Ricettario + food cost automatico',
      'Magazzino + alert sotto-soglia',
      'Scadenzario fatture (PDF/Excel import)',
      'Chiusure cassa manuali',
      'Sprechi e omaggi tracking',
      'Export PDF (P&L, ricette)',
      '1 sede · 1 utente',
      '20 foto AI/mese (OCR scontrini)',
      'Supporto email 48h',
    ],
    highlight: false,
  },
  {
    id: 'pro',
    label: 'Maestro',
    prezzo: '€149',
    periodo: '/mese',
    desc: 'Sostituisce un controller part-time. Le 23 feature AI lavorano per te 24/7.',
    features: [
      'Tutto di Bottega +',
      '2 sedi · 3 utenti (col PIN tablet)',
      'Daily Brief AI ogni mattina',
      'Forecast vendite 7gg (meteo + eventi)',
      'Menu engineering (star vs dog)',
      'Cashflow predittivo 30/60/90gg',
      'Brain AI chat + Recipe Inventor',
      'OCR fatture in entrata',
      'POS integration CSV (15 casse IT)',
      '100 foto AI/mese',
      'Supporto email 24h',
    ],
    highlight: true,
  },
  {
    id: 'enterprise',
    label: 'Insegna',
    prezzo: '€399',
    periodo: '/mese',
    desc: 'Sostituisce 1 controller dedicato + l\'IT contractor. Per chi ha 3+ sedi.',
    features: [
      'Tutto di Maestro +',
      'Sedi illimitate · Utenti illimitati',
      'Confronto sedi + Trasferimenti',
      'Integrazioni real-time (Tilby, Zucchetti)',
      'WhatsApp Bot operativo',
      'Marketplace fornitori HORECA',
      'Documentary AI trimestrale',
      'API access + White-label',
      '500 foto AI/mese',
      'Supporto Slack/telefono 4h business',
      'SLA 99.5% scritto',
    ],
    highlight: false,
  },
]

export default function AbbonamentoPanel({ org, notify, isInline = false }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [loading, setLoading] = useState(null) // 'pro' | 'chain' | 'portal' | null
  const [billingMsg, setBillingMsg] = useState(null)
  // Audit 2026-06-24: source of truth unificata via usePlanPricing.
  // L'admin modifica `plan_pricing` → /api/pricing → hook → tutto si aggiorna
  // automaticamente (landing, abbonamento, modali, email).
  const planMeta = usePlanPricing()
  const PIANI = PIANI_DEFAULT.map(p => {
    // Alias retro-compat: 'enterprise' = 'chain' in plan_pricing.
    const key = p.id === 'enterprise' ? 'chain' : p.id
    const dynPrezzo = planMeta[key]
    const dynNome = planMeta.nome?.[key]
    const dynDesc = planMeta.desc?.[key]
    return {
      ...p,
      prezzo: dynPrezzo ? `€${fmtPrezzo(dynPrezzo)}` : p.prezzo,
      label:  dynNome || p.label,
      desc:   dynDesc || p.desc,
    }
  })

  // Intercetta il redirect da Stripe Checkout (?billing=success / cancel)
  useEffect(() => {
    const u = new URL(window.location.href)
    const b = u.searchParams.get('billing')
    if (b === 'success') {
      setBillingMsg({ ok: true, text: 'Pagamento completato — l\'abbonamento è ora attivo.' })
      notify?.('Abbonamento attivato, grazie!')
    } else if (b === 'cancel') {
      setBillingMsg({ ok: false, text: 'Operazione annullata. Nessun addebito.' })
    }
    if (b) {
      u.searchParams.delete('billing')
      u.searchParams.delete('session_id')
      window.history.replaceState({}, '', u.pathname + (u.search || ''))
    }
  }, [])

  async function abbonati(plan) {
    setLoading(plan)
    try {
      const r = await apiFetch('/api/stripe-checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      })
      const j = await r.json()
      window.location.href = j.url
    } catch (e) {
      notify?.(e.message || 'Errore', false)
      setLoading(null)
    }
  }

  async function gestisci() {
    setLoading('portal')
    try {
      const r = await apiFetch('/api/stripe-portal', { method: 'POST' })
      const j = await r.json()
      window.location.href = j.url
    } catch (e) {
      notify?.(e.message || 'Errore', false)
      setLoading(null)
    }
  }

  const isPagante = org?.approvato === true && org?.stripe_subscription_id
  const stato = org?.stripe_status

  const stateLabel = ({
    active:    { text: 'Abbonamento attivo',   color: T.green,  bg: T.greenLight },
    trialing:  { text: 'In prova',             color: T.amber,  bg: T.amberLight },
    past_due:  { text: 'Pagamento in ritardo', color: T.red, bg: T.redLight },
    unpaid:    { text: 'Pagamento non riuscito', color: T.red, bg: T.redLight },
    canceled:  { text: 'Annullato',            color: T.textSoft, bg: T.bgSubtle },
  })[stato] || null

  const Wrapper = isInline ? React.Fragment : 'div'
  const wrapperProps = isInline ? {} : { style: { background:T.bgCard, borderRadius:R.xl, padding: isMobile ? '18px 16px' : isTablet ? '20px 22px' : '24px 28px', border:`1px solid ${T.border}`, boxShadow:S.sm, marginBottom:20 } }

  return (
    <Wrapper {...wrapperProps}>
      {billingMsg && (
        <div style={{
          padding:'12px 16px', borderRadius:R.md, marginBottom:16,
          background: billingMsg.ok ? T.greenLight : T.bgSubtle,
          color: billingMsg.ok ? T.green : T.textMid,
          fontSize:13, fontWeight:600,
        }}>{billingMsg.text}</div>
      )}

      {/* Stato attuale */}
      <div style={{
        display:'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent:'space-between',
        gap: 12, padding: isMobile ? '14px 14px' : isTablet ? '14px 16px' : '16px 18px', background:T.bgSubtle,
        borderRadius:R.lg, marginBottom:20,
      }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:T.textSoft, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>
            Piano attuale
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:T.text, letterSpacing:'-0.01em' }}>
            {isPagante
              ? (org?.piano === 'enterprise' ? 'Chain' : 'Pro')
              : 'Trial gratuito'}
          </div>
          {stateLabel && (
            <span style={{
              display:'inline-block', marginTop:6, padding:'3px 10px', borderRadius:999,
              fontSize:11, fontWeight:700,
              background: stateLabel.bg, color: stateLabel.color,
            }}>{stateLabel.text}</span>
          )}
        </div>
        {isPagante && (
          <button onClick={gestisci} disabled={loading==='portal'}
            style={{
              height: 44, padding:'0 18px', borderRadius:R.md, fontSize:13,
              fontWeight:700, cursor: loading==='portal'?'not-allowed':'pointer',
              background:T.bgCard, color:T.text, border:`1px solid ${T.borderStr}`,
              width: isMobile ? '100%' : 'auto',
            }}>
            {loading==='portal' ? '…' : 'Gestisci abbonamento'}
          </button>
        )}
      </div>

      {/* Piani */}
      <div style={{
        display:'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: isTablet ? 14 : 16,
      }}>
        {PIANI.map(p => {
          const isCurrent = isPagante && (
            (p.id === 'pro' && org?.piano === 'pro') ||
            (p.id === 'chain' && org?.piano === 'enterprise')
          )
          return (
            <div key={p.id} style={{
              background:T.bgCard,
              border: p.highlight ? `2px solid ${T.brand}` : `1px solid ${T.border}`,
              borderRadius:R.xl, padding: isMobile ? '18px 16px' : isTablet ? '18px 18px' : '20px 22px',
              position:'relative',
            }}>
              {p.highlight && (
                <span style={{
                  position:'absolute', top:-10, left:18, padding:'3px 10px',
                  borderRadius:999, background:T.brand, color:'#FFF',
                  fontSize:10, fontWeight:800, letterSpacing:'0.04em', textTransform:'uppercase',
                }}>Consigliato</span>
              )}
              <div style={{ fontSize:16, fontWeight:800, color:T.text }}>{p.label}</div>
              <div style={{ fontSize:13, color:T.textSoft, marginTop:4, marginBottom:12, lineHeight:1.4 }}>{p.desc}</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:16 }}>
                <span style={{ fontSize:28, fontWeight:900, color:T.text, letterSpacing:'-0.02em' }}>{p.prezzo}</span>
                <span style={{ fontSize:13, color:T.textSoft }}>{p.periodo}</span>
              </div>
              <ul style={{ listStyle:'none', padding:0, margin:'0 0 18px', fontSize:13, color:T.textMid, lineHeight:1.7 }}>
                {p.features.map(f => (
                  <li key={f} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                    <span style={{ color:T.green, flexShrink:0, marginTop:2 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => abbonati(p.id)} disabled={loading===p.id || isCurrent}
                style={{
                  width:'100%', height:44, borderRadius:R.md, border:'none',
                  background: isCurrent ? T.bgSubtle : (p.highlight ? T.brand : T.text),
                  color: isCurrent ? T.textSoft : '#FFF',
                  fontSize:14, fontWeight:800, cursor: (loading===p.id||isCurrent)?'not-allowed':'pointer',
                  letterSpacing:'-0.005em',
                  boxShadow: (isCurrent || !p.highlight) ? 'none' : `0 4px 12px ${T.brand}44`,
                }}>
                {loading===p.id ? '…' : isCurrent ? 'Piano attivo' : 'Abbonati'}
              </button>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize:11, color:T.textSoft, marginTop:16, lineHeight:1.5 }}>
        Pagamento sicuro tramite <strong>Stripe</strong>. Puoi disdire in qualsiasi momento dalla
        sezione "Gestisci abbonamento". Riceverai fattura automatica via email dopo ogni pagamento.
      </p>
    </Wrapper>
  )
}
