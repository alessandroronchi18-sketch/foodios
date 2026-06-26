import React from 'react'
import useIsMobile from '../lib/useIsMobile'

// Layout condiviso per le pagine legali (privacy, termini, cookie, rimborsi).
// Tipografia leggibile, stampabile, link interni coerenti.

function mkS(isMobile) {
  return {
    wrap: { minHeight: '100vh', background: '#FDFAF7', fontFamily: "'Inter', system-ui, sans-serif", color: '#1C0A0A' },
    header: { background: '#1C0A0A', color: '#FFF', padding: isMobile ? '14px 16px' : '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    body: { maxWidth: '70ch', margin: '0 auto', padding: isMobile ? '28px 18px 64px' : '48px 24px 80px' },
    h1: { fontSize: isMobile ? 24 : 28, fontWeight: 900, marginBottom: 8, marginTop: 0, lineHeight: 1.2 },
    h2: { fontSize: isMobile ? 17 : 16, fontWeight: 800, marginTop: isMobile ? 28 : 36, marginBottom: 10, lineHeight: 1.3 },
    p:  { fontSize: isMobile ? 15 : 14, lineHeight: 1.75, color: '#4B3832', marginBottom: 12, wordBreak: 'break-word', overflowWrap: 'anywhere' },
    ul: { fontSize: isMobile ? 15 : 14, lineHeight: 1.85, color: '#4B3832', paddingLeft: 20, marginBottom: 12, wordBreak: 'break-word', overflowWrap: 'anywhere' },
    badge: { display: 'inline-block', background: '#FEF2F2', color: '#6E0E1A', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, marginBottom: 24 },
    footer: { borderTop: '1px solid #E8DDD8', marginTop: isMobile ? 36 : 48, paddingTop: 20, fontSize: 12, color: '#9C7B76' },
    related: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 },
  }
}

export function LegalH2({ children }) {
  const isMobile = useIsMobile()
  return <h2 style={mkS(isMobile).h2}>{children}</h2>
}
export function LegalP({ children }) {
  const isMobile = useIsMobile()
  return <p style={mkS(isMobile).p}>{children}</p>
}
export function LegalUl({ items }) {
  const isMobile = useIsMobile()
  return <ul style={mkS(isMobile).ul}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
}
export function LegalLink({ href, children, target }) {
  return <a href={href} {...(target ? { target, rel: 'noreferrer' } : {})} style={{ color: '#6E0E1A', wordBreak: 'break-word' }}>{children}</a>
}

export default function LegalLayout({ title, updated, children, related = [] }) {
  const isMobile = useIsMobile()
  const S = mkS(isMobile)
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <a href="/" style={{ color: '#FFF', textDecoration: 'none', fontWeight: 900, fontSize: isMobile ? 16 : 18 }}>Foodos</a>
        <a href="/" style={{ color: '#FFF', fontSize: isMobile ? 12 : 13, opacity: 0.7, textDecoration: 'none', whiteSpace: 'nowrap' }}>← {isMobile ? 'App' : 'Torna all\'app'}</a>
      </div>
      <div style={S.body}>
        <h1 style={S.h1}>{title}</h1>
        {updated && <span style={S.badge}>Aggiornata: {updated}</span>}
        {children}
        <div style={S.footer}>
          <div style={S.related}>
            <a href="/privacy" style={{ color: '#6E0E1A' }}>Privacy Policy</a>
            <a href="/termini" style={{ color: '#6E0E1A' }}>Termini di servizio</a>
            <a href="/cookie" style={{ color: '#6E0E1A' }}>Cookie Policy</a>
            <a href="/rimborsi" style={{ color: '#6E0E1A' }}>Rimborsi</a>
            <a href="/contatti" style={{ color: '#6E0E1A' }}>Contatti</a>
            <a href="/chi-siamo" style={{ color: '#6E0E1A' }}>Chi siamo</a>
          </div>
          {related.length > 0 && (
            <div style={{ marginTop: 14 }}>
              Vedi anche:{' '}
              {related.map(([label, href], i) => (
                <React.Fragment key={href}>
                  {i > 0 && ' · '}
                  <a href={href} style={{ color: '#6E0E1A' }}>{label}</a>
                </React.Fragment>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 11 }}>© {new Date().getFullYear()} Foodos · Tutti i diritti riservati</div>
        </div>
      </div>
    </div>
  )
}
