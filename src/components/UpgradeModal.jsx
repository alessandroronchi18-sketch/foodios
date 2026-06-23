// UpgradeModal — pop-up modale mostrato quando un utente clicca una feature
// non inclusa nel suo piano corrente. Sostituisce il pattern "naviga alla
// view + UpgradeGate full-screen": più immediato, meno friction.
//
// Uso:
//   const [upg, setUpg] = useState(null)
//   ...
//   {upg && <UpgradeModal {...upg} onClose={() => setUpg(null)} onCta={...} />}

import React from 'react'
import { color as T } from '../lib/theme'
import Icon from './Icon'
import ChainBadge from './ChainBadge'

const BRAND      = T.brand   || '#6E0E1A'
const TXT        = T.text    || '#0E1726'
const MID        = T.textMid || '#475264'
const SOFT       = T.textSoft|| '#8B95A7'
const CARD       = T.bgCard  || '#FFFFFF'
const BORDER     = T.border  || '#E5E9EF'

const PLAN_TIER = {
  pro:        { label: 'Pro',   color: '#E89B43', prezzo: '€119/mese · €95 annuale', tagline: 'Il braccio destro digitale che lavora mentre dormi.' },
  enterprise: { label: 'Chain', color: '#FFD86B', prezzo: '€299/mese · €239 annuale (+ setup €990)', tagline: 'Tutto quello che il tuo commercialista, il tuo team e il tuo CFO non sanno.' },
  chain:      { label: 'Chain', color: '#FFD86B', prezzo: '€299/mese · €239 annuale (+ setup €990)', tagline: 'Tutto quello che il tuo commercialista, il tuo team e il tuo CFO non sanno.' },
}

export default function UpgradeModal({
  featureName = 'Questa funzione',
  requiredPlan = 'enterprise',
  onClose,
  onCta,
}) {
  const tier = PLAN_TIER[requiredPlan] || PLAN_TIER.enterprise

  return (
    <div role="dialog" aria-modal="true" aria-label={`Upgrade richiesto al piano ${tier.label}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(11,4,8,0.66)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: '_upg_fade 0.18s ease-out',
      }}>
      <style>{`
        @keyframes _upg_fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes _upg_pop {
          from { transform: translateY(10px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes _upg_grad {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>

      <div onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: 480, width: '100%',
          background: CARD,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.40), 0 8px 24px rgba(110,14,26,0.20)',
          animation: '_upg_pop 0.22s cubic-bezier(.32,.72,0,1)',
        }}>

        {/* HEADER scuro con badge gradient + close */}
        <div style={{
          position: 'relative',
          padding: '24px 24px 20px',
          background: 'linear-gradient(135deg, #0B0408 0%, #1C0A0A 30%, #4A0612 70%, #6E0E1A 100%)',
          backgroundSize: '200% 200%',
          animation: '_upg_grad 8s ease-in-out infinite',
          color: '#FFF',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(232,75,58,0.35) 0%, transparent 70%)', pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.10, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '18px 18px' }}/>

          <button onClick={onClose}
            aria-label="Chiudi"
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.20)',
              color: '#FFF', width: 28, height: 28, borderRadius: 8,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <div style={{ position: 'relative' }}>
            {/* Eyebrow */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              <ChainBadge size={11}/> Funzione del piano {tier.label}
            </div>

            <h2 style={{ margin: '14px 0 4px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Sblocca {featureName}
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55 }}>
              {tier.tagline}
            </p>
          </div>
        </div>

        {/* BODY: pricing card + lista */}
        <div style={{ padding: '20px 24px 22px' }}>
          <div style={{
            background: `linear-gradient(135deg, ${tier.color}18, transparent 70%)`,
            border: `1px solid ${tier.color}55`,
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `linear-gradient(135deg, ${tier.color}, #E89B43)`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#1C0A0A', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em',
              boxShadow: `0 6px 14px ${tier.color}55`,
            }}>
              {tier.label.toUpperCase().slice(0, 5)}
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Piano {tier.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TXT, marginTop: 1, fontFeatureSettings: "'tnum'" }}>
                {tier.prezzo}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.6, marginBottom: 18 }}>
            Con il piano <strong style={{ color: TXT }}>{tier.label}</strong> sblocchi questa funzione e tutte le altre marcate con
            <span style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 4px' }}><ChainBadge size={11}/></span>
            nella tua dashboard. Prova 30 giorni senza carta di credito.
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{
                flex: '0 0 auto',
                padding: '11px 18px',
                background: 'transparent',
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                color: MID,
                fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
              }}>
              Più tardi
            </button>
            <button onClick={() => { onCta?.(); onClose?.() }}
              style={{
                flex: 1,
                padding: '11px 18px',
                background: `linear-gradient(135deg, ${BRAND} 0%, #4A0612 100%)`,
                border: 'none',
                borderRadius: 10,
                color: '#FFF',
                fontSize: 13, fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(110,14,26,0.30)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
              Confronta i piani
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
