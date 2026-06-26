// AiPageHero — header premium riusabile per le pagine AI.
//
// Stessa estetica della landing AiHub: gradient bordeaux-oro animato +
// dot grid + glow blobs + eyebrow chip con LED + headline gigante con
// gradient text + stats inline + opzionali CTA.
//
// Usage:
//   <AiPageHero
//     eyebrow="AI · Chat conversazionale"
//     title="Foodos Brain"
//     accentText="il tuo consulente"
//     subtitle="Chiedi qualsiasi cosa sui tuoi dati..."
//     stats={[{ n: '3', l: 'Modelli Claude attivi' }, { n: '2s', l: 'Risposta media' }]}
//     chainOnly
//     statusBadge="LIVE"
//   />

import React from 'react'
import ChainBadge from './ChainBadge'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

export default function AiPageHero({
  eyebrow,
  title,
  accentText,             // parola/frase nel gradient oro champagne
  subtitle,
  stats = [],
  chainOnly = false,
  statusBadge = 'LIVE',
  compact = false,        // versione ridotta per pagine dense
  children,               // CTA opzionali sotto stats
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const padding = compact
    ? (isMobile ? '22px 20px' : isTablet ? '26px 26px' : '32px 36px')
    : (isMobile ? '28px 22px' : isTablet ? '34px 28px' : '46px 42px')
  const titleSize = compact
    ? (isMobile ? 24 : isTablet ? 30 : 36)
    : (isMobile ? 30 : isTablet ? 38 : 46)

  return (
    <div style={{
      position: 'relative',
      borderRadius: 22,
      padding,
      marginBottom: isMobile ? 22 : 28,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #0B0408 0%, #1C0A0A 22%, #2E0814 48%, #4A0612 76%, #6E0E1A 100%)',
      backgroundSize: '260% 260%',
      animation: '_aip_grad 14s ease-in-out infinite',
      boxShadow: '0 24px 70px rgba(110,14,26,0.40), inset 0 1px 0 rgba(255,255,255,0.10)',
    }}>
      <style>{`
        @keyframes _aip_grad {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes _aip_pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes _aip_float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Glow blobs */}
      <div style={{
        position: 'absolute', top: -90, right: -70, width: 320, height: 320,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(232,75,58,0.35) 0%, transparent 60%)',
        pointerEvents: 'none', animation: '_aip_float 7s ease-in-out infinite',
      }}/>
      <div style={{
        position: 'absolute', bottom: -110, left: 60, width: 280, height: 280,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,216,107,0.20) 0%, transparent 65%)',
        pointerEvents: 'none', animation: '_aip_float 9s ease-in-out infinite reverse',
      }}/>
      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.10, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}/>
      {/* Mesh diagonal line (solo desktop) */}
      {!isMobile && !compact && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '40%', height: '100%',
          background: 'linear-gradient(115deg, transparent 0%, transparent 49%, rgba(255,255,255,0.04) 50%, transparent 51%)',
          pointerEvents: 'none',
        }}/>
      )}

      <div style={{ position: 'relative', zIndex: 1, color: '#FFF' }}>
        {/* Eyebrow chip */}
        {eyebrow && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '5px 14px', borderRadius: 999,
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.20)',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusBadge === 'LIVE' ? '#22C55E' : statusBadge === 'BETA' ? '#F59E0B' : '#94A3B8',
              boxShadow: `0 0 10px ${statusBadge === 'LIVE' ? '#22C55E' : statusBadge === 'BETA' ? '#F59E0B' : '#94A3B8'}`,
              animation: '_aip_pulse 2s ease-in-out infinite',
            }}/>
            {chainOnly && <ChainBadge size={12}/>}
            {eyebrow}
          </div>
        )}

        {/* Title */}
        <h1 style={{
          margin: '16px 0 10px',
          fontSize: titleSize,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.04,
        }}>
          {title}
          {accentText && <>
            {' '}
            <span style={{
              background: 'linear-gradient(120deg, #FFD86B 0%, #FBD7C9 45%, #E89B43 75%, #FFD86B 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: '_aip_grad 6s ease-in-out infinite',
            }}>
              {accentText}
            </span>
          </>}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p style={{
            margin: 0, maxWidth: 680,
            fontSize: compact ? 13.5 : 14.5,
            lineHeight: 1.65,
            color: 'rgba(255,255,255,0.78)',
          }}>
            {subtitle}
          </p>
        )}

        {/* Stats */}
        {stats.length > 0 && (
          <div style={{
            display: 'flex', gap: isMobile ? 14 : isTablet ? 20 : 28,
            marginTop: 22, flexWrap: 'wrap',
          }}>
            {stats.map((s, i) => (
              <div key={i}>
                <div style={{
                  fontSize: compact ? 20 : 24,
                  fontWeight: 800,
                  color: '#FFF',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  fontFeatureSettings: "'tnum'",
                }}>{s.n}</div>
                <div style={{
                  fontSize: 10.5, fontWeight: 600,
                  color: 'rgba(255,255,255,0.60)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginTop: 4,
                }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Children (es. CTA) */}
        {children && (
          <div style={{ marginTop: 22 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
