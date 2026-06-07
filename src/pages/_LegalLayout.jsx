import React from 'react'

// Layout condiviso per le pagine legali (privacy, termini, cookie, rimborsi).
// Tipografia leggibile, stampabile, link interni coerenti.

const S = {
  wrap: { minHeight: '100vh', background: '#FDFAF7', fontFamily: "'Inter', system-ui, sans-serif", color: '#1C0A0A' },
  header: { background: '#1C0A0A', color: '#FFF', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  body: { maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' },
  h1: { fontSize: 28, fontWeight: 900, marginBottom: 8, marginTop: 0 },
  h2: { fontSize: 16, fontWeight: 800, marginTop: 36, marginBottom: 10 },
  p:  { fontSize: 14, lineHeight: 1.8, color: '#4B3832', marginBottom: 12 },
  ul: { fontSize: 14, lineHeight: 1.9, color: '#4B3832', paddingLeft: 20, marginBottom: 12 },
  badge: { display: 'inline-block', background: '#FEF2F2', color: '#6E0E1A', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, marginBottom: 24 },
  footer: { borderTop: '1px solid #E8DDD8', marginTop: 48, paddingTop: 20, fontSize: 12, color: '#9C7B76' },
  related: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 },
}

export function LegalH2({ children }) { return <h2 style={S.h2}>{children}</h2> }
export function LegalP({ children }) { return <p style={S.p}>{children}</p> }
export function LegalUl({ items }) {
  return <ul style={S.ul}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
}
export function LegalLink({ href, children, target }) {
  return <a href={href} {...(target ? { target, rel: 'noreferrer' } : {})} style={{ color: '#6E0E1A' }}>{children}</a>
}

export default function LegalLayout({ title, updated, children, related = [] }) {
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <a href="/" style={{ color: '#FFF', textDecoration: 'none', fontWeight: 900, fontSize: 18 }}>FoodOS</a>
        <a href="/" style={{ color: '#FFF', fontSize: 13, opacity: 0.7, textDecoration: 'none' }}>← Torna all'app</a>
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
          <div style={{ marginTop: 14, fontSize: 11 }}>© 2026 FoodOS · Tutti i diritti riservati</div>
        </div>
      </div>
    </div>
  )
}
