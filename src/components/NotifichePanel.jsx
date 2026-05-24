import React from 'react'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'

const ICON_SVG = {
  magazzino_sotto_soglia: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  fattura_in_scadenza: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  report_disponibile: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  trial_in_scadenza: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  pagamento_confermato: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  sync_completata: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
}
const ICON_TINT = {
  magazzino_sotto_soglia: { bg: 'rgba(220,38,38,0.10)', color: T.red },
  fattura_in_scadenza:    { bg: T.amberLight, color: T.amber },
  report_disponibile:     { bg: T.blueLight, color: T.blue },
  trial_in_scadenza:      { bg: T.amberLight, color: T.amber },
  pagamento_confermato:   { bg: T.greenLight, color: T.green },
  sync_completata:        { bg: T.blueLight, color: T.blue },
}

const C = {
  red: T.brand, text: T.text, textMid: T.textMid, textSoft: T.textSoft,
  border: T.border, bg: T.bg, white: T.white, green: T.green,
}

function fmtData(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function NotifichePanel({ notifiche, nonLette, onSegnaLetta, onSegnaTutte, onClose }) {
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,12,20,0.32)',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          animation: '_fos_fadeIn 0.18s cubic-bezier(0.32, 0.72, 0, 1)' }}
      />
      {/* panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '90vw',
        background: T.bgCard, zIndex: 301, boxShadow: '-4px 0 32px rgba(15,23,42,0.16), -1px 0 0 rgba(15,23,42,0.04)',
        display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif",
        animation: '_fos_pageIn 0.24s cubic-bezier(0.32, 0.72, 0, 1)',
      }}>
        {/* header */}
        <div style={{
          padding: '18px 20px', borderBottom: `1px solid ${T.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: '-0.015em' }}>Notifiche</h2>
            {nonLette > 0 && (
              <span style={{
                background: T.brand, color: '#fff',
                fontSize: 11, fontWeight: 700, padding: '2px 8px',
                borderRadius: 9999, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
              }}>{nonLette}</span>
            )}
          </div>
          {nonLette > 0 && (
            <button onClick={onSegnaTutte} style={{
              fontSize: 12, fontWeight: 500, color: T.textMid, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '6px 8px',
              borderRadius: R.sm, whiteSpace: 'nowrap', letterSpacing: '-0.005em',
              transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
            }}
              onMouseEnter={e=>{e.currentTarget.style.background=T.bgSubtle;e.currentTarget.style.color=T.text;}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=T.textMid;}}>
              Segna tutte
            </button>
          )}
          <button onClick={onClose} aria-label="Chiudi"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              width: 32, height: 32, color: T.textSoft, borderRadius: R.sm,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`,
            }}
            onMouseEnter={e=>{e.currentTarget.style.background=T.bgSubtle;e.currentTarget.style.color=T.text;}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=T.textSoft;}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notifiche.length === 0 ? (
            <div style={{
              padding: '48px 24px', textAlign: 'center', color: T.textSoft,
              fontSize: 13,
            }}>
              <div style={{ width: 48, height: 48, borderRadius: R.md, background: T.bgSubtle,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.textSoft, marginBottom: 14 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 4, letterSpacing: '-0.005em' }}>Tutto tranquillo</div>
              <div style={{ fontSize: 12, color: T.textSoft }}>Nessuna notifica al momento.</div>
            </div>
          ) : notifiche.map(n => {
            const tint = ICON_TINT[n.tipo] || { bg: T.bgSubtle, color: T.textMid };
            return (
              <div
                key={n.id}
                onClick={() => !n.letta && onSegnaLetta(n.id)}
                style={{
                  padding: '14px 20px', borderBottom: `1px solid ${T.borderSoft}`,
                  background: n.letta ? T.bgCard : T.brandLight,
                  cursor: n.letta ? 'default' : 'pointer',
                  transition: `background ${M.durFast} ${M.ease}`,
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: R.sm,
                    background: tint.bg, color: tint.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {ICON_SVG[n.tipo] || (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: n.letta ? 500 : 600,
                      color: T.text, marginBottom: 3, letterSpacing: '-0.005em',
                    }}>
                      {n.titolo}
                    </div>
                    {n.messaggio && (
                      <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5, marginBottom: 6 }}>
                        {n.messaggio}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: T.textSoft, letterSpacing: '-0.005em' }}>
                        {fmtData(n.created_at)}
                      </span>
                      {n.link && (
                        <a href={n.link} style={{
                          fontSize: 11, fontWeight: 600, color: T.brand,
                          textDecoration: 'none', letterSpacing: '-0.005em',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                          Vai
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.letta && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: T.brand, flexShrink: 0, marginTop: 8,
                      boxShadow: '0 0 0 3px rgba(139,26,26,0.18)',
                    }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  )
}
