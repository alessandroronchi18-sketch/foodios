import React from 'react'
import Logo from './Logo'

/**
 * SplashScreen - pagina di caricamento futuristic-clean condivisa.
 *
 * Visivamente identica al boot-splash inline in `index.html`, così la
 * transizione boot-splash → React → !ready Dashboard è una sola immagine
 * continua, senza jumpcut tra splash dark + skeleton cream.
 *
 * Usato da:
 *  - <App/>          auth.loading iniziale
 *  - <App/> Suspense fallback per i lazy import
 *  - <Dashboard/>    finestra "Caricamento dati…" (ready=false)
 *
 * Responsive: logo 48/56/64px su mobile/tablet/desktop.
 * Rispetta prefers-reduced-motion (animazioni neutralizzate).
 */
export default function SplashScreen({ subtitle = 'Caricamento' }) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024
  const logoSize = w < 480 ? 48 : w < 900 ? 56 : 64
  const ringInset = -3
  const haloInset = -14

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 35%, #1A0A0E 0%, #0B0407 55%, #050203 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 22,
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden',
      zIndex: 9999,
      WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{`
        @keyframes _fos_splash_aurora {
          0%   { transform: translate3d(-20%, -10%, 0) rotate(0deg);   opacity: 0.55 }
          50%  { transform: translate3d( 15%,  10%, 0) rotate(180deg); opacity: 0.85 }
          100% { transform: translate3d(-20%, -10%, 0) rotate(360deg); opacity: 0.55 }
        }
        @keyframes _fos_splash_aurora2 {
          0%   { transform: translate3d( 20%,  15%, 0) rotate(0deg);   opacity: 0.4 }
          50%  { transform: translate3d(-15%, -10%, 0) rotate(-180deg);opacity: 0.7 }
          100% { transform: translate3d( 20%,  15%, 0) rotate(-360deg);opacity: 0.4 }
        }
        @keyframes _fos_splash_ring { to { transform: rotate(360deg) } }
        @keyframes _fos_splash_halo {
          0%, 100% { opacity: 0.55; transform: scale(1) }
          50%      { opacity: 0.95; transform: scale(1.08) }
        }
        @keyframes _fos_splash_bar {
          0%   { transform: translateX(-110%) }
          100% { transform: translateX(110%) }
        }
        @keyframes _fos_splash_riseIn {
          from { opacity: 0; transform: translateY(8px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes _fos_splash_dots {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0) }
          40%           { opacity: 1;    transform: translateY(-3px) }
        }
        @media (prefers-reduced-motion: reduce) {
          .fos-splash-aurora, .fos-splash-aurora2,
          .fos-splash-ring, .fos-splash-halo,
          .fos-splash-bar, .fos-splash-dot { animation: none !important }
        }
      `}</style>

      <div className="fos-splash-aurora" aria-hidden="true" style={{
        position: 'absolute', top: '20%', left: '50%',
        width: 'min(720px, 90vw)', height: 'min(720px, 90vw)',
        marginLeft: 'calc(min(720px, 90vw) / -2)',
        background: 'radial-gradient(circle, rgba(232,75,58,0.45) 0%, rgba(110,14,26,0) 65%)',
        filter: 'blur(40px)', pointerEvents: 'none',
        animation: '_fos_splash_aurora 14s ease-in-out infinite',
      }}/>
      <div className="fos-splash-aurora2" aria-hidden="true" style={{
        position: 'absolute', top: '40%', left: '50%',
        width: 'min(560px, 80vw)', height: 'min(560px, 80vw)',
        marginLeft: 'calc(min(560px, 80vw) / -2)',
        background: 'radial-gradient(circle, rgba(255,179,80,0.32) 0%, rgba(110,14,26,0) 65%)',
        filter: 'blur(48px)', pointerEvents: 'none',
        animation: '_fos_splash_aurora2 18s ease-in-out infinite',
      }}/>

      <div style={{ position: 'relative', width: logoSize, height: logoSize }}>
        <div className="fos-splash-halo" aria-hidden="true" style={{
          position: 'absolute', inset: haloInset, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,75,58,0.55) 0%, rgba(110,14,26,0) 70%)',
          filter: 'blur(10px)', pointerEvents: 'none',
          animation: '_fos_splash_halo 2.4s ease-in-out infinite',
        }}/>
        <div className="fos-splash-ring" aria-hidden="true" style={{
          position: 'absolute', inset: ringInset, borderRadius: 16,
          background: 'conic-gradient(from 0deg, #E84B3A 0deg, #FFB350 90deg, #6E0E1A 180deg, #FF7B5A 270deg, #E84B3A 360deg)',
          filter: 'blur(0.5px)', opacity: 0.9, pointerEvents: 'none',
          animation: '_fos_splash_ring 4.5s linear infinite',
          WebkitMask: `radial-gradient(circle, transparent ${logoSize/2 - 1}px, black ${logoSize/2}px)`,
          mask:        `radial-gradient(circle, transparent ${logoSize/2 - 1}px, black ${logoSize/2}px)`,
        }}/>
        <Logo size={logoSize} style={{
          position: 'relative', zIndex: 1, borderRadius: 14,
          boxShadow: '0 18px 48px rgba(110,14,26,0.7), 0 2px 0 rgba(255,255,255,0.08) inset',
        }}/>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        animation: '_fos_splash_riseIn .55s cubic-bezier(.32,.72,0,1) both',
      }}>
        <div style={{
          fontSize: w < 480 ? 22 : 26,
          fontWeight: 800, letterSpacing: '-0.025em',
          backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.65) 100%)',
          backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          lineHeight: 1,
        }}>Foodos</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>
          <span>{subtitle}</span>
          <span className="fos-splash-dot" style={{ animation: '_fos_splash_dots 1.2s ease-in-out 0s infinite' }}>·</span>
          <span className="fos-splash-dot" style={{ animation: '_fos_splash_dots 1.2s ease-in-out .15s infinite' }}>·</span>
          <span className="fos-splash-dot" style={{ animation: '_fos_splash_dots 1.2s ease-in-out .3s infinite' }}>·</span>
        </div>
      </div>

      <div style={{
        position: 'relative', width: 'min(220px, 60vw)', height: 2,
        background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden',
        marginTop: 4,
      }}>
        <div className="fos-splash-bar" aria-hidden="true" style={{
          position: 'absolute', inset: 0, width: '60%',
          background: 'linear-gradient(90deg, transparent 0%, #FFB350 50%, transparent 100%)',
          animation: '_fos_splash_bar 1.6s cubic-bezier(.65,.05,.36,1) infinite',
        }}/>
      </div>
    </div>
  )
}
