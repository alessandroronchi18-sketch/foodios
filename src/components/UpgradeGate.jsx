// Schermata mostrata al posto di una pagina non inclusa nel piano corrente.
// Invita all'upgrade invece di nascondere (o dare errore) la funzione.
import React from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import { requiredPlanLabel } from '../lib/planAccess'

const VIEW_LABELS = {
  'confronto-sedi': 'Confronto sedi',
  'trasferimenti':  'Trasferimenti tra sedi',
  'integrazioni':   'Integrazioni',
}

export default function UpgradeGate({ view, onUpgrade }) {
  const piano = requiredPlanLabel(view) || 'Chain'
  const nome = VIEW_LABELS[view] || 'Questa funzione'
  return (
    <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: '40px 28px',
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl, boxShadow: S.sm }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, margin: '0 auto 18px', background: T.brandLight, color: T.brand,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.brand, marginBottom: 8 }}>Piano {piano}</div>
      <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{nome} è inclusa nel piano {piano}</h2>
      <p style={{ margin: '0 auto 24px', maxWidth: 380, fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>
        Sblocca {nome.toLowerCase()} e le altre funzioni avanzate passando al piano {piano}. Puoi cambiare piano in qualsiasi momento dalle Impostazioni.
      </p>
      <button onClick={onUpgrade} style={{ padding: '13px 28px', background: T.brand, color: '#fff', border: 'none',
        borderRadius: R.md, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: S.brandSoft }}>
        Passa a {piano} →
      </button>
    </div>
  )
}
